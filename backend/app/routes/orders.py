from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Order, OrderItem, CartItem, Product, gen_id
from app.routes.auth import get_current_user
from datetime import datetime

router = APIRouter(prefix="/api")


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
    if user.role == "seller":
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

    validated_shipping_cost = 0.0
    if destination_area_id and courier_company and courier_type:
        from app.config import BITESHIP_API_KEY
        if BITESHIP_API_KEY:
            import httpx
            rate_items = [{"name": d["product_name"][:50], "value": int(d["price"]), "weight": d["weight"], "quantity": d["quantity"]} for d in order_items_data]
            try:
                rate_payload = {"couriers": courier_company, "destination_area_id": destination_area_id, "items": rate_items}
                from app.routes.shipping import get_seller_origin
                origin = get_seller_origin()
                if origin.get("area_id"):
                    rate_payload["origin_area_id"] = origin["area_id"]
                if origin.get("postal_code"):
                    rate_payload["origin_postal_code"] = int(origin["postal_code"])
                async with httpx.AsyncClient(timeout=10) as client:
                    resp = await client.post("https://api.biteship.com/v1/rates/couriers", json=rate_payload, headers={"Authorization": f"Bearer {BITESHIP_API_KEY}", "Content-Type": "application/json"})
                if resp.status_code == 200:
                    pricing = resp.json().get("pricing", [])
                    for p in pricing:
                        nested_rates = p.get("rates")
                        if nested_rates and isinstance(nested_rates, list):
                            for rate in nested_rates:
                                if rate.get("type") == courier_type:
                                    validated_shipping_cost = float(rate.get("price", 0))
                                    break
                        else:
                            if p.get("type", p.get("courier_service_code", "")) == courier_type and p.get("price") is not None:
                                validated_shipping_cost = float(p.get("price", 0))
                                break
                if validated_shipping_cost == 0:
                    validated_shipping_cost = float(shipping_cost)
            except Exception:
                validated_shipping_cost = float(shipping_cost)
        else:
            validated_shipping_cost = float(shipping_cost)
    else:
        validated_shipping_cost = float(shipping_cost)

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
    db.commit()
    db.refresh(order)
    return {"order": order_to_dict(order)}


@router.put("/orders")
async def update_order_status(request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    if not user or user.role != "seller":
        return JSONResponse({"error": "Akses ditolak"}, status_code=403)
    body = await request.json()
    order_id = body.get("order_id", "")
    status = body.get("status", "")
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        return JSONResponse({"error": "Pesanan tidak ditemukan"}, status_code=404)
    order.status = status
    order.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(order)
    return {"order": order_to_dict(order)}
