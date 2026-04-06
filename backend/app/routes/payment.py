from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Order, OrderItem
from app.config import MIDTRANS_SERVER_KEY, MIDTRANS_CLIENT_KEY, MIDTRANS_IS_PRODUCTION
from app.routes.auth import get_current_user
import httpx
import base64
import hashlib
from datetime import datetime

router = APIRouter(prefix="/api/payment")

SNAP_SANDBOX_URL = "https://app.sandbox.midtrans.com/snap/v1/transactions"
SNAP_PRODUCTION_URL = "https://app.midtrans.com/snap/v1/transactions"


@router.get("/client-key")
async def get_client_key():
    return {
        "client_key": MIDTRANS_CLIENT_KEY or "",
        "is_production": MIDTRANS_IS_PRODUCTION,
    }


@router.post("/token")
async def create_payment_token(request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    if not user:
        return JSONResponse({"error": "Login terlebih dahulu"}, status_code=401)

    if not MIDTRANS_SERVER_KEY:
        return JSONResponse(
            {"error": "Midtrans belum dikonfigurasi", "hint": "Tambahkan MIDTRANS_SERVER_KEY dan MIDTRANS_CLIENT_KEY di file .env.local"},
            status_code=400,
        )

    body = await request.json()
    order_id = body.get("order_id", "")
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        return JSONResponse({"error": "Pesanan tidak ditemukan"}, status_code=404)

    snap_url = SNAP_PRODUCTION_URL if MIDTRANS_IS_PRODUCTION else SNAP_SANDBOX_URL
    auth_string = base64.b64encode(f"{MIDTRANS_SERVER_KEY}:".encode()).decode()

    order_items = db.query(OrderItem).filter(OrderItem.order_id == order.id).all()
    item_details = []
    for oi in order_items:
        item_details.append({
            "id": str(oi.product_id) if oi.product_id else oi.id,
            "price": int(oi.price),
            "quantity": oi.quantity,
            "name": (oi.product_name or "Produk")[:50],
        })

    items_total = sum(int(oi.price) * oi.quantity for oi in order_items)

    shipping_cost = int(order.shipping_cost or 0)
    if shipping_cost > 0:
        item_details.append({
            "id": "shipping",
            "price": shipping_cost,
            "quantity": 1,
            "name": (order.courier_service_name or "Ongkos Kirim")[:50],
        })

    gross_total = items_total + shipping_cost

    name_parts = (user.name or "").split(" ", 1)
    first_name = name_parts[0] or user.email.split("@")[0]
    last_name = name_parts[1] if len(name_parts) > 1 else ""

    customer_details: dict = {
        "first_name": first_name,
        "last_name": last_name,
        "email": user.email,
        "phone": user.phone or "",
    }

    shipping_text = order.shipping_address or ""
    billing_address: dict = {
        "first_name": first_name,
        "last_name": last_name,
        "email": user.email,
        "phone": user.phone or "",
        "address": user.address or shipping_text,
        "city": user.city or "",
        "country_code": "IDN",
    }
    if user.postal_code:
        billing_address["postal_code"] = user.postal_code

    shipping_address = {
        **billing_address,
        "address": shipping_text or user.address or "",
    }

    customer_details["billing_address"] = billing_address
    customer_details["shipping_address"] = shipping_address

    import time
    midtrans_order_id = order.id

    max_attempts = 3
    last_error = ""
    for attempt in range(max_attempts):
        payload = {
            "transaction_details": {
                "order_id": midtrans_order_id,
                "gross_amount": gross_total,
            },
            "customer_details": customer_details,
            "item_details": item_details,
            "credit_card": {
                "secure": True,
            },
        }

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                snap_url,
                json=payload,
                headers={
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                    "Authorization": f"Basic {auth_string}",
                },
            )

        if resp.status_code == 201:
            data = resp.json()
            order.payment_token = data.get("token")
            order.midtrans_order_id = midtrans_order_id
            db.commit()
            return {"token": data.get("token"), "redirect_url": data.get("redirect_url")}

        try:
            error_data = resp.json()
            msgs = error_data.get("error_messages", [])
            last_error = "; ".join(msgs) if msgs else "Gagal membuat token pembayaran"
            if any("already" in m.lower() or "used" in m.lower() or "exist" in m.lower() for m in msgs):
                midtrans_order_id = f"{order.id}-{int(time.time())}"
                continue
        except Exception:
            last_error = "Gagal membuat token pembayaran"
        break

    return JSONResponse({"error": last_error}, status_code=500)


STATUS_SANDBOX_URL = "https://api.sandbox.midtrans.com/v2"
STATUS_PRODUCTION_URL = "https://api.midtrans.com/v2"


def _apply_transaction_status(order, transaction_status: str, fraud_status: str = "accept", transaction_id: str = None):
    if transaction_id:
        order.payment_id = transaction_id
    if transaction_status == "capture":
        if fraud_status == "accept":
            order.status = "paid"
    elif transaction_status == "settlement":
        order.status = "paid"
    elif transaction_status in ("cancel", "deny", "expire"):
        order.status = "cancelled"
    elif transaction_status == "pending":
        order.status = "pending"
    order.updated_at = datetime.utcnow()


@router.get("/status/{order_id}")
async def check_payment_status(order_id: str, request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    if not user:
        return JSONResponse({"error": "Login terlebih dahulu"}, status_code=401)

    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        return JSONResponse({"error": "Pesanan tidak ditemukan"}, status_code=404)

    if not MIDTRANS_SERVER_KEY:
        return {"order_id": order.id, "status": order.status}

    base_url = STATUS_PRODUCTION_URL if MIDTRANS_IS_PRODUCTION else STATUS_SANDBOX_URL
    auth_string = base64.b64encode(f"{MIDTRANS_SERVER_KEY}:".encode()).decode()

    midtrans_id = order.midtrans_order_id or order.id

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{base_url}/{midtrans_id}/status",
            headers={
                "Accept": "application/json",
                "Authorization": f"Basic {auth_string}",
            },
        )

    if resp.status_code == 200:
        data = resp.json()
        _apply_transaction_status(
            order,
            data.get("transaction_status", ""),
            data.get("fraud_status", "accept"),
            data.get("transaction_id"),
        )
        db.commit()
        return {"order_id": order.id, "status": order.status, "transaction_status": data.get("transaction_status")}

    return {"order_id": order.id, "status": order.status}


@router.post("/notification")
async def payment_notification(request: Request, db: Session = Depends(get_db)):
    body = await request.json()
    order_id = body.get("order_id", "")
    transaction_status = body.get("transaction_status", "")
    fraud_status = body.get("fraud_status", "accept")
    transaction_id = body.get("transaction_id")

    if MIDTRANS_SERVER_KEY:
        status_code = body.get("status_code")
        gross_amount = body.get("gross_amount")
        signature_key = body.get("signature_key")
        raw_string = f"{order_id}{status_code}{gross_amount}{MIDTRANS_SERVER_KEY}"
        expected_signature = hashlib.sha512(raw_string.encode()).hexdigest()
        if signature_key != expected_signature:
            return JSONResponse({"error": "Invalid signature"}, status_code=403)

    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        order = db.query(Order).filter(Order.midtrans_order_id == order_id).first()
    if not order:
        return JSONResponse({"error": "Pesanan tidak ditemukan"}, status_code=404)

    _apply_transaction_status(order, transaction_status, fraud_status, transaction_id)
    db.commit()
    return {"success": True}
