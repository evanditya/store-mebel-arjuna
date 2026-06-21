from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Order, OrderItem, User
from app.routes.auth import get_current_user
import httpx
import base64
import hmac
import hashlib
import threading
import json as _json
import os as _os
import re as _re
import time as _time
from datetime import datetime

_SELLER_CONFIG_PATH = _os.path.join(_os.path.dirname(_os.path.dirname(_os.path.dirname(__file__))), "seller_config.json")

OTTOPAY_MERCHANT_ID = _os.environ.get("OTTOPAY_MERCHANT_ID", "")
OTTOPAY_API_KEY = _os.environ.get("OTTOPAY_API_KEY", "")
OTTOPAY_IS_PRODUCTION = _os.environ.get("OTTOPAY_IS_PRODUCTION", "false").lower() == "true"

_SANDBOX_BASE = "https://sandbox-secure-api.ottopay.id/securepage-be"
_PRODUCTION_BASE = "https://secure.ottopay.id"


def _base_url() -> str:
    return _PRODUCTION_BASE if OTTOPAY_IS_PRODUCTION else _SANDBOX_BASE


def _sort_keys(obj):
    if isinstance(obj, list):
        return [_sort_keys(i) for i in obj]
    if isinstance(obj, dict):
        return {k: _sort_keys(v) for k, v in sorted(obj.items())}
    return obj


def _generate_signature(body_json: str, timestamp: str, api_key: str) -> str:
    sorted_obj = _sort_keys(_json.loads(body_json))
    sorted_json = _json.dumps(sorted_obj, separators=(",", ":"))
    stripped = re.sub(r'[^a-zA-Z0-9{}:.,\[\]"@\-]', "", sorted_json)
    lowercased = stripped.lower()
    plain_text = f"{lowercased}&{timestamp}&{api_key}"
    return hmac.new(api_key.encode(), plain_text.encode(), hashlib.sha512).hexdigest()


def _ottopay_headers(body_json: str) -> dict:
    timestamp = str(int(_time.time()))
    auth = base64.b64encode(OTTOPAY_MERCHANT_ID.encode()).decode()
    sig = _generate_signature(body_json, timestamp, OTTOPAY_API_KEY)
    return {
        "Content-Type": "application/json",
        "Timestamp": timestamp,
        "Authorization": f"Basic {auth}",
        "Signature": sig,
    }


def _get_seller_name() -> str:
    try:
        with open(_SELLER_CONFIG_PATH) as f:
            d = _json.load(f)
            return d.get("site_name") or d.get("seller_name") or "Toko Online"
    except Exception:
        return "Toko Online"


def _get_pickup_info() -> dict:
    try:
        with open(_SELLER_CONFIG_PATH) as f:
            d = _json.load(f)
            return {
                "store_address": d.get("store_address", ""),
                "store_phone": d.get("store_phone", ""),
                "pickup_days": d.get("pickup_days", []),
                "pickup_open_time": d.get("pickup_open_time", ""),
                "pickup_close_time": d.get("pickup_close_time", ""),
                "pickup_notes": d.get("pickup_notes", ""),
            }
    except Exception:
        return {}


def _maybe_send_paid_email(order, db: Session):
    try:
        buyer = db.query(User).filter(User.id == order.user_id).first()
        if not buyer:
            return
        from app.email import snapshot_order, snapshot_user, send_order_paid_email
        _ = list(order.items)
        order_snap = snapshot_order(order)
        buyer_snap = snapshot_user(buyer)
        seller_name = _get_seller_name()
        is_pickup = (order.courier_service_name or "") == "Ambil di Toko" and not (order.courier_company or "")
        pickup_info = _get_pickup_info() if is_pickup else None
        threading.Thread(target=send_order_paid_email, args=(order_snap, buyer_snap, seller_name, pickup_info), daemon=True).start()
        print(f"[Email] paid email queued for {buyer_snap.email}")
    except Exception as e:
        print(f"[Email] paid email error: {e}")


def _apply_ottopay_status(order, response_code: str, transaction_status_code: str = ""):
    if response_code == "00" or transaction_status_code == "S":
        order.status = "paid"
    elif response_code in ("39", "41", "11") or transaction_status_code in ("FL", "CL", "EX"):
        order.status = "cancelled"
    order.updated_at = datetime.utcnow()


router = APIRouter(prefix="/api/payment")


@router.post("/token")
async def create_payment_token(request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    if not user:
        return JSONResponse({"error": "Login terlebih dahulu"}, status_code=401)

    if not OTTOPAY_MERCHANT_ID or not OTTOPAY_API_KEY:
        return JSONResponse(
            {"error": "OttoPay belum dikonfigurasi", "hint": "Tambahkan OTTOPAY_MERCHANT_ID dan OTTOPAY_API_KEY di Secrets"},
            status_code=400,
        )

    body = await request.json()
    order_id = body.get("order_id", "")
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        return JSONResponse({"error": "Pesanan tidak ditemukan"}, status_code=404)

    if order.status in ("paid", "cancelled", "completed"):
        return JSONResponse({"error": f"Pesanan sudah berstatus {order.status}"}, status_code=400)

    if order.payment_token:
        return {"redirect_url": order.payment_token}

    order_items = db.query(OrderItem).filter(OrderItem.order_id == order.id).all()
    items_total = sum(int(oi.price) * oi.quantity for oi in order_items)
    shipping_cost = int(order.shipping_cost or 0)
    gross_total = items_total + shipping_cost

    name_parts = (user.name or "").split(" ", 1)
    first_name = name_parts[0] or user.email.split("@")[0]
    last_name = name_parts[1] if len(name_parts) > 1 else ""

    phone = (user.phone or "").strip().lstrip("+")
    if phone.startswith("0"):
        phone = "62" + phone[1:]
    if not phone:
        phone = "628000000000"

    otto_order_id = order.id.replace("-", "")[:32]

    merchant_name = _get_seller_name()[:32]

    payload = {
        "customerDetails": {
            "email": user.email,
            "firstName": first_name,
            "lastName": last_name,
            "phone": phone,
        },
        "transactionDetails": {
            "amount": gross_total,
            "currency": "IDR",
            "merchantName": merchant_name,
            "orderId": otto_order_id,
            "paymentMethod": 0,
            "promoCode": "",
            "vabca": "",
            "vamandiri": "",
            "vabni": "",
            "vapermata": "",
            "valain": "",
            "vaOrderId": "",
        },
        "expiryDuration": "1h",
    }

    body_json = _json.dumps(payload)
    headers = _ottopay_headers(body_json)

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{_base_url()}/payment-services/v2.1.0/api/token",
            content=body_json,
            headers=headers,
        )

    try:
        data = resp.json()
    except Exception:
        return JSONResponse({"error": "Respons tidak valid dari OttoPay"}, status_code=502)

    if resp.status_code == 200 and data.get("responseData", {}).get("endpointUrl"):
        endpoint_url = data["responseData"]["endpointUrl"]
        order.payment_token = endpoint_url
        order.midtrans_order_id = otto_order_id
        db.commit()
        return {"redirect_url": endpoint_url}

    error_msg = (
        data.get("responseDesc")
        or data.get("responseData", {}).get("statusMessage")
        or "Gagal membuat sesi pembayaran"
    )
    print(f"[OttoPay] create token error {resp.status_code}: {data}")
    return JSONResponse({"error": error_msg}, status_code=400)


@router.get("/status/{order_id}")
async def check_payment_status(order_id: str, request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    if not user:
        return JSONResponse({"error": "Login terlebih dahulu"}, status_code=401)

    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        return JSONResponse({"error": "Pesanan tidak ditemukan"}, status_code=404)

    if not OTTOPAY_MERCHANT_ID or not OTTOPAY_API_KEY:
        return {"order_id": order.id, "status": order.status}

    trx_ref = order.midtrans_order_id or order.id.replace("-", "")[:32]
    payload = {"trxRef": trx_ref}
    body_json = _json.dumps(payload)
    headers = _ottopay_headers(body_json)

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"{_base_url()}/sp/service/v3.0.0/api/checkstatus",
            content=body_json,
            headers=headers,
        )

    if resp.status_code == 200:
        try:
            data = resp.json()
        except Exception:
            return {"order_id": order.id, "status": order.status}

        rc = data.get("responseCode", "")
        tsc = data.get("transactionStatusCode", "")
        prev_status = order.status
        _apply_ottopay_status(order, rc, tsc)
        db.commit()
        if prev_status != "paid" and order.status == "paid":
            _maybe_send_paid_email(order, db)
        return {"order_id": order.id, "status": order.status, "response_code": rc}

    return {"order_id": order.id, "status": order.status}


@router.post("/notification")
async def payment_notification(request: Request, db: Session = Depends(get_db)):
    body = await request.json()

    if OTTOPAY_MERCHANT_ID and OTTOPAY_API_KEY:
        auth_header = request.headers.get("Authorization", "")
        expected_auth = "Basic " + base64.b64encode(OTTOPAY_MERCHANT_ID.encode()).decode()
        if auth_header != expected_auth:
            return JSONResponse({"responseCode": "25", "responseDesc": "Unauthorized"}, status_code=401)

        timestamp = request.headers.get("Timestamp", "")
        sig_header = request.headers.get("Signature", "")
        body_json = _json.dumps(body)
        expected_sig = _generate_signature(body_json, timestamp, OTTOPAY_API_KEY)
        if sig_header != expected_sig:
            return JSONResponse({"responseCode": "27", "responseDesc": "Invalid Signature"}, status_code=401)

    trx_ref = body.get("trxRef", "")
    response_code = body.get("responseCode", "")

    order = db.query(Order).filter(Order.midtrans_order_id == trx_ref).first()
    if not order:
        order = db.query(Order).filter(Order.id == trx_ref).first()
    if not order:
        return JSONResponse({"responseCode": "00", "responseDesc": "Success"})

    prev_status = order.status
    trx_status = body.get("transactionStatusCode", "")
    _apply_ottopay_status(order, response_code, trx_status)
    db.commit()
    if prev_status != "paid" and order.status == "paid":
        _maybe_send_paid_email(order, db)

    return {"responseCode": "00", "responseDesc": "Success"}
