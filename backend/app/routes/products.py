from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Product, ProductImage, ProductVariant, gen_id
from app.routes.auth import get_current_user
import json
import os
import re
import random
import string

router = APIRouter(prefix="/api")

SELLER_CONFIG_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "seller_config.json")


def load_seller_config():
    if os.path.exists(SELLER_CONFIG_PATH):
        with open(SELLER_CONFIG_PATH, "r") as f:
            return json.load(f)
    return {"username": "seller", "seller_name": "Store", "profile_picture": "", "brand_colors": {}}


def product_to_dict(product: Product) -> dict:
    desc_images = []
    if product.description_images:
        try:
            desc_images = json.loads(product.description_images)
        except Exception:
            desc_images = []
    specs = []
    if product.specifications:
        try:
            specs = json.loads(product.specifications)
        except Exception:
            specs = []
    return {
        "id": product.id,
        "name": product.name,
        "slug": product.slug,
        "price": product.price,
        "original_price": product.original_price,
        "category": product.category,
        "description": product.description,
        "description_images": desc_images,
        "specifications": specs,
        "sold_count": product.sold_count,
        "stock": product.stock,
        "rating": product.rating,
        "weight": product.weight or 500,
        "length": product.length or 10,
        "width": product.width or 10,
        "height": product.height or 10,
        "primary_image": product.primary_image,
        "video_url": product.video_url,
        "images": [{"id": img.id, "image_url": img.image_url, "display_order": img.display_order} for img in product.images],
        "variants": [
            {
                "id": v.id,
                "variant_type": v.variant_type,
                "variant_name": v.variant_name,
                "price": v.price,
                "price_modifier": v.price_modifier,
                "stock": v.stock,
                "is_available": v.is_available,
            }
            for v in product.variants
        ],
    }


def generate_slug(name: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    suffix = "".join(random.choices(string.ascii_lowercase + string.digits, k=6))
    return f"{base}-{suffix}"


@router.get("/products")
async def list_products(category: str = None, search: str = None, db: Session = Depends(get_db)):
    query = db.query(Product)
    if category:
        query = query.filter(Product.category == category)
    if search:
        query = query.filter(Product.name.ilike(f"%{search}%"))
    products = query.all()
    seller = load_seller_config()
    return {"products": [product_to_dict(p) for p in products], "seller": seller}


@router.get("/products/{slug}")
async def get_product(slug: str, db: Session = Depends(get_db)):
    product = db.query(Product).filter(Product.slug == slug).first()
    if not product:
        return JSONResponse({"error": "Produk tidak ditemukan"}, status_code=404)
    return {"product": product_to_dict(product)}


@router.post("/products")
async def create_product(request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    if not user or user.role != "seller":
        return JSONResponse({"error": "Akses ditolak"}, status_code=403)
    body = await request.json()
    slug = generate_slug(body.get("name", "product"))
    product = Product(
        id=gen_id(),
        name=body.get("name", ""),
        slug=slug,
        price=body.get("price", 0),
        original_price=body.get("original_price"),
        category=body.get("category"),
        description=body.get("description"),
        sold_count=body.get("sold_count", 0),
        stock=body.get("stock", 0),
        rating=body.get("rating", 0),
        weight=body.get("weight", 500),
        length=body.get("length", 10),
        width=body.get("width", 10),
        height=body.get("height", 10),
        primary_image=body.get("primary_image"),
        video_url=body.get("video_url"),
    )
    db.add(product)
    for img in body.get("images", []):
        db.add(ProductImage(id=gen_id(), product_id=product.id, image_url=img.get("image_url", img if isinstance(img, str) else ""), display_order=img.get("display_order", 0) if isinstance(img, dict) else 0))
    for v in body.get("variants", []):
        db.add(ProductVariant(
            id=gen_id(), product_id=product.id,
            variant_type=v.get("variant_type"), variant_name=v.get("variant_name", ""),
            price=v.get("price"), price_modifier=v.get("price_modifier", 0),
            stock=v.get("stock", 0), is_available=v.get("is_available", True),
        ))
    db.commit()
    db.refresh(product)
    return {"product": product_to_dict(product)}


@router.put("/products/{slug}")
async def update_product(slug: str, request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    if not user or user.role != "seller":
        return JSONResponse({"error": "Akses ditolak"}, status_code=403)
    product = db.query(Product).filter(Product.slug == slug).first()
    if not product:
        return JSONResponse({"error": "Produk tidak ditemukan"}, status_code=404)
    body = await request.json()
    for field in ["name", "price", "original_price", "category", "description", "stock", "rating", "weight", "length", "width", "height", "primary_image", "video_url", "sold_count"]:
        if field in body:
            setattr(product, field, body[field])

    if "variants" in body:
        db.query(ProductVariant).filter(ProductVariant.product_id == product.id).delete()
        for v in body["variants"]:
            db.add(ProductVariant(
                id=gen_id(), product_id=product.id,
                variant_type=v.get("variant_type", ""),
                variant_name=v.get("variant_name", ""),
                price=v.get("price"),
                price_modifier=v.get("price_modifier", 0),
                stock=v.get("stock", 0),
                is_available=v.get("is_available", True),
            ))

    db.commit()
    db.refresh(product)
    return {"product": product_to_dict(product)}


@router.get("/categories")
async def list_categories(db: Session = Depends(get_db)):
    products = db.query(Product.category).distinct().all()
    categories = sorted([p[0] for p in products if p[0]])
    return {"categories": categories}


@router.delete("/products/{slug}")
async def delete_product(slug: str, request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    if not user or user.role != "seller":
        return JSONResponse({"error": "Akses ditolak"}, status_code=403)
    product = db.query(Product).filter(Product.slug == slug).first()
    if not product:
        return JSONResponse({"error": "Produk tidak ditemukan"}, status_code=404)
    db.delete(product)
    db.commit()
    return {"success": True}
