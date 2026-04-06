from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import CartItem, Product, ProductVariant, gen_id
from app.routes.auth import get_current_user

router = APIRouter(prefix="/api")


def cart_item_dict(item: CartItem) -> dict:
    product = item.product
    effective_price = item.unit_price if item.unit_price is not None else (product.price if product else 0)
    return {
        "id": item.id,
        "product_slug": product.slug if product else "",
        "variant_name": item.variant_name,
        "quantity": item.quantity,
        "unit_price": effective_price,
        "product": {
            "name": product.name,
            "price": effective_price,
            "primary_image": product.primary_image,
            "stock": product.stock,
            "weight": product.weight or 500,
            "length": product.length or 10,
            "width": product.width or 10,
            "height": product.height or 10,
        } if product else None,
    }


@router.get("/cart")
async def get_cart(request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    if not user:
        return JSONResponse({"error": "Login terlebih dahulu"}, status_code=401)
    items = db.query(CartItem).filter(CartItem.user_id == user.id).all()
    return {"items": [cart_item_dict(i) for i in items]}


@router.post("/cart")
async def add_to_cart(request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    if not user:
        return JSONResponse({"error": "Login terlebih dahulu"}, status_code=401)
    body = await request.json()
    product_slug = body.get("product_slug", "")
    variant_name = body.get("variant_name")
    quantity = body.get("quantity", 1)
    product = db.query(Product).filter(Product.slug == product_slug).first()
    if not product:
        return JSONResponse({"error": "Produk tidak ditemukan"}, status_code=404)

    unit_price = product.price
    if variant_name:
        variant = db.query(ProductVariant).filter(
            ProductVariant.product_id == product.id,
            ProductVariant.variant_name == variant_name
        ).first()
        if variant and variant.price is not None:
            unit_price = variant.price
        elif variant and variant.price_modifier:
            unit_price = product.price + variant.price_modifier

    existing = db.query(CartItem).filter(
        CartItem.user_id == user.id,
        CartItem.product_id == product.id,
        CartItem.variant_name == variant_name,
    ).first()
    if existing:
        existing.quantity += quantity
        existing.unit_price = unit_price
        db.commit()
        db.refresh(existing)
        return {"item": cart_item_dict(existing)}
    item = CartItem(id=gen_id(), user_id=user.id, product_id=product.id, variant_name=variant_name, unit_price=unit_price, quantity=quantity)
    db.add(item)
    db.commit()
    db.refresh(item)
    return {"item": cart_item_dict(item)}


@router.put("/cart")
async def update_cart(request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    if not user:
        return JSONResponse({"error": "Login terlebih dahulu"}, status_code=401)
    body = await request.json()
    item_id = body.get("item_id", "")
    quantity = body.get("quantity", 0)
    item = db.query(CartItem).filter(CartItem.id == item_id, CartItem.user_id == user.id).first()
    if not item:
        return JSONResponse({"error": "Item tidak ditemukan"}, status_code=404)
    if quantity <= 0:
        db.delete(item)
        db.commit()
        return {"success": True}
    item.quantity = quantity
    db.commit()
    db.refresh(item)
    return {"item": cart_item_dict(item)}


@router.delete("/cart")
async def clear_cart(request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    if not user:
        return JSONResponse({"error": "Login terlebih dahulu"}, status_code=401)
    db.query(CartItem).filter(CartItem.user_id == user.id).delete()
    db.commit()
    return {"success": True}
