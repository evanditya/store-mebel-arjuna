from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Order, OrderItem, CartItem, Product, User, gen_id
from app.routes.auth import get_current_user, has_perm, is_staff
from datetime import datetime
import threading
import json as _json
import os as _os

router = APIRouter(prefix="/api")

_SELLER_CONFIG_PATH = _os.path.join(_os.path.dirname(_os.path.dirname(_os.path.dirname(__file__))), "seller_config.json")


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


def _send_email_bg(fn, *args):
    def target():
        try:
            fn(*args)
        except Exception as e:
            print(f"[Email BG] Error: {e}")
    threading.Thread(target=target, daemon=True).start()


def order_to_dict(order: Order) -> dict:
    return {
        "id": order.id,
        "user_id": order.user_id,
        "total": order.total,
        "status": order.status,
        "shipping_address": order.shipping_address,
        "destination_contact_name": order.destination_contact_name,
        "destination_contact_phone": order.destination_contact_phone,
        "courier_company": order.courier_company,
        "courier_type": order.courier_type,
        "courier_service_name": order.courier_service_name,
        "shipping_cost": order.shipping_cost or 0,
        "shipping_etd": order.shipping_etd,
        "biteship_order_id": order.biteship_order_id,
        "waybill_id": order.waybill_id,
        "tracking_status": order.tracking_status,
        "tracking_url": order.tracking_url,
        "payment_token": order.payment_token,
        "payment_id": order.payment_id,
        "created_at": order.created_at.isoformat() if order.created_at else None,
        "updated_at": order.updated_at.isoformat() if order.updated_at else None,
        "items": [
            {
                "id": item.id,
                "product_id": item.product_id,
                "product_name": item.product_name,
                "variant_name": item.variant_name,
                "quantity": item.quantity,
                "price": item.price,
                "weight": item.weight or 500,
            }
            for item in order.items
        ],
    }


@router.get("/orders")
async def list_orders(request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    if not user:
        return JSONResponse({"error": "Login terlebih dahulu"}, status_code=401)
    # ?mine=1  → always return only the current user's orders (used by buyer "Pesanan Saya" page)
    # seller without ?mine → return all orders (used by seller dashboard)
    mine = request.query_params.get("mine", "0")
    if is_staff(user) and mine != "1":
        orders = db.query(Order).order_by(Order.created_at.desc()).all()
    else:
        orders = db.query(Order).filter(Order.user_id == user.id).order_by(Order.created_at.desc()).all()
    return {"orders": [order_to_dict(o) for o in orders]}


@router.post("/orders")
async def create_order(request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    if not user:
        return JSONResponse({"error": "Login terlebih dahulu"}, status_code=401)
    body = await request.json()
    shipping_address = body.get("shipping_address", "")
    destination_area_id = body.get("destination_area_id", "")
    destination_postal_code = body.get("destination_postal_code", "")
    destination_contact_name = body.get("destination_contact_name", user.name)
    destination_contact_phone = body.get("destination_contact_phone", user.phone or "")
    courier_company = body.get("courier_company", "")
    courier_type = body.get("courier_type", "")
    courier_service_name = body.get("courier_service_name", "")
    shipping_cost = body.get("shipping_cost", 0)
    shipping_etd = body.get("shipping_etd", "")
    delivery_type = body.get("delivery_type", "delivery")

    cart_items = db.query(CartItem).filter(CartItem.user_id == user.id).all()
    if not cart_items:
        return JSONResponse({"error": "Keranjang kosong"}, status_code=400)

    items_total = 0.0
    order_items_data = []
    for ci in cart_items:
        product = ci.product
        if not product:
            continue
        price = ci.unit_price if ci.unit_price is not None else product.price
        items_total += price * ci.quantity
        order_items_data.append({
            "product_id": product.id,
            "product_name": product.name,
            "variant_name": ci.variant_name,
            "quantity": ci.quantity,
            "price": price,
            "weight": product.weight or 500,
        })

    # For pickup orders, shipping is always free and courier fields are overridden.
    if delivery_type == "pickup":
        validated_shipping_cost = 0.0
        courier_service_name = "Ambil di Toko"
        courier_company = ""
        courier_type = ""
        print(f"[Order] pickup order — shipping_cost = 0")
    else:
        # Use the shipping cost the buyer selected directly from the rates page.
        # Re-querying Biteship here uses different item dimensions and a broken loop,
        # which causes the stored shipping cost to differ from what the buyer chose.
        validated_shipping_cost = float(shipping_cost)
        print(f"[Order] shipping_cost from client: {validated_shipping_cost} ({courier_company} {courier_type})")

    total = items_total + validated_shipping_cost

    order = Order(
        id=gen_id(), user_id=user.id, total=total,
        status="pending", shipping_address=shipping_address,
        destination_area_id=destination_area_id,
        destination_postal_code=destination_postal_code,
        destination_contact_name=destination_contact_name,
        destination_contact_phone=destination_contact_phone,
        courier_company=courier_company,
        courier_type=courier_type,
        courier_service_name=courier_service_name,
        shipping_cost=validated_shipping_cost,
        shipping_etd=shipping_etd,
        created_at=datetime.utcnow(), updated_at=datetime.utcnow(),
    )
    db.add(order)
    for oi_data in order_items_data:
        db.add(OrderItem(id=gen_id(), order_id=order.id, **oi_data))
    db.query(CartItem).filter(CartItem.user_id == user.id).delete()

    # Snapshot BEFORE commit — items are available from order_items_data,
    # and db.commit() would expire all ORM attributes making them inaccessible in threads.
    try:
        from app.email import snapshot_order, snapshot_user, snapshot_item_from_dict, send_order_pending_email
        seller_name = _get_seller_name()
        item_snaps = [snapshot_item_from_dict(d) for d in order_items_data]
        order_snap = snapshot_order(order, items=item_snaps)
        user_snap = snapshot_user(user)
    except Exception as _e:
        print(f"[Email] snapshot error: {_e}")
        order_snap = user_snap = None

    db.commit()
    db.refresh(order)

    if order_snap and user_snap:
        try:
            pickup_info = _get_pickup_info() if delivery_type == "pickup" else None
            if pickup_info is not None:
                _send_email_bg(send_order_pending_email, order_snap, user_snap, seller_name, pickup_info)
            else:
                _send_email_bg(send_order_pending_email, order_snap, user_snap, seller_name)
        except Exception:
            pass

    return {"order": order_to_dict(order)}


@router.delete("/orders/{order_id}")
async def delete_order(order_id: str, request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    if not has_perm(user, "orders"):
        return JSONResponse({"error": "Akses ditolak"}, status_code=403)
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        return JSONResponse({"error": "Pesanan tidak ditemukan"}, status_code=404)
    db.delete(order)
    db.commit()
    return {"success": True}


@router.put("/orders")
async def update_order_status(request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    if not has_perm(user, "orders"):
        return JSONResponse({"error": "Akses ditolak"}, status_code=403)
    body = await request.json()
    order_id = body.get("order_id", "")
    status = body.get("status", "")
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        return JSONResponse({"error": "Pesanan tidak ditemukan"}, status_code=404)
    prev_status = order.status
    order.status = status
    order.updated_at = datetime.utcnow()

    # Snapshot BEFORE commit for status-change emails
    order_snap = buyer_snap = snap_seller_name = snap_email_fn = None
    snap_pickup_info = None
    trigger_statuses = {"completed", "ready_pickup"}
    if status in trigger_statuses and prev_status != status:
        try:
            buyer = db.query(User).filter(User.id == order.user_id).first()
            if buyer:
                from app.email import snapshot_order, snapshot_user
                _ = list(order.items)
                order_snap = snapshot_order(order)
                buyer_snap = snapshot_user(buyer)
                snap_seller_name = _get_seller_name()
                if status == "completed":
                    from app.email import send_order_completed_email
                    snap_email_fn = send_order_completed_email
                elif status == "ready_pickup":
                    from app.email import send_order_ready_pickup_email
                    snap_email_fn = send_order_ready_pickup_email
                    snap_pickup_info = _get_pickup_info()
        except Exception as _e:
            print(f"[Email] snapshot error ({status}): {_e}")

    db.commit()
    db.refresh(order)

    if order_snap and buyer_snap and snap_email_fn:
        try:
            if snap_pickup_info is not None:
                _send_email_bg(snap_email_fn, order_snap, buyer_snap, snap_seller_name, snap_pickup_info)
            else:
                _send_email_bg(snap_email_fn, order_snap, buyer_snap, snap_seller_name)
        except Exception:
            pass

    return {"order": order_to_dict(order)}
