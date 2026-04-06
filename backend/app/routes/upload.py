from fastapi import APIRouter, Depends, Request, UploadFile, File
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Product, ProductImage, gen_id
from app.routes.auth import get_current_user
import os
import uuid

router = APIRouter(prefix="/api")

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.post("/upload-image")
async def upload_image(request: Request, file: UploadFile = File(...), db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    if not user or user.role != "seller":
        return JSONResponse({"error": "Akses ditolak"}, status_code=403)

    ext = os.path.splitext(file.filename or "image.jpg")[1] or ".jpg"
    filename = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)

    contents = await file.read()
    with open(filepath, "wb") as f:
        f.write(contents)

    image_url = f"/uploads/{filename}"
    return {"image_url": image_url, "filename": filename}


@router.post("/products/{slug}/images")
async def add_product_image(slug: str, request: Request, file: UploadFile = File(...), db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    if not user or user.role != "seller":
        return JSONResponse({"error": "Akses ditolak"}, status_code=403)

    product = db.query(Product).filter(Product.slug == slug).first()
    if not product:
        return JSONResponse({"error": "Produk tidak ditemukan"}, status_code=404)

    ext = os.path.splitext(file.filename or "image.jpg")[1] or ".jpg"
    filename = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)

    contents = await file.read()
    with open(filepath, "wb") as f:
        f.write(contents)

    image_url = f"/uploads/{filename}"
    max_order = max([img.display_order for img in product.images] + [0])

    img = ProductImage(
        id=gen_id(),
        product_id=product.id,
        image_url=image_url,
        display_order=max_order + 1,
    )
    db.add(img)
    db.commit()

    return {"image": {"id": img.id, "image_url": image_url, "display_order": img.display_order}}


@router.delete("/products/{slug}/images/{image_id}")
async def delete_product_image(slug: str, image_id: str, request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    if not user or user.role != "seller":
        return JSONResponse({"error": "Akses ditolak"}, status_code=403)

    product = db.query(Product).filter(Product.slug == slug).first()
    if not product:
        return JSONResponse({"error": "Produk tidak ditemukan"}, status_code=404)

    image = db.query(ProductImage).filter(ProductImage.id == image_id, ProductImage.product_id == product.id).first()
    if not image:
        return JSONResponse({"error": "Gambar tidak ditemukan"}, status_code=404)

    db.delete(image)
    db.commit()
    return {"success": True}
