from fastapi import APIRouter, Depends, Request, UploadFile, File
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Banner
from app.routes.auth import get_current_user, has_perm
import os, shutil, uuid

router = APIRouter(prefix="/api/banners")

UPLOADS_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads"
)


def banner_to_dict(b: Banner) -> dict:
    return {
        "id": b.id,
        "image_url": b.image_url,
        "title": b.title,
        "link": b.link,
        "order": b.order,
        "is_active": b.is_active,
    }


@router.get("")
def get_active_banners(db: Session = Depends(get_db)):
    banners = db.query(Banner).filter(Banner.is_active == True).order_by(Banner.order).all()
    return [banner_to_dict(b) for b in banners]


@router.get("/all")
def get_all_banners(request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    if not has_perm(user, "banners"):
        return JSONResponse({"error": "Akses ditolak"}, status_code=403)
    banners = db.query(Banner).order_by(Banner.order).all()
    return [banner_to_dict(b) for b in banners]


@router.post("/upload")
async def upload_banner_image(request: Request, file: UploadFile = File(...), db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    if not has_perm(user, "banners"):
        return JSONResponse({"error": "Akses ditolak"}, status_code=403)
    ext = (file.filename or "banner.jpg").rsplit(".", 1)[-1].lower()
    if ext not in ("jpg", "jpeg", "png", "webp"):
        ext = "jpg"
    filename = f"banner_{uuid.uuid4().hex[:10]}.{ext}"
    dest = os.path.join(UPLOADS_DIR, filename)
    os.makedirs(UPLOADS_DIR, exist_ok=True)
    try:
        with open(dest, "wb") as f:
            shutil.copyfileobj(file.file, f)
    except Exception as e:
        return JSONResponse({"error": f"Gagal menyimpan: {str(e)}"}, status_code=500)
    return {"url": f"/uploads/{filename}"}


@router.post("")
def create_banner(request: Request, data: dict, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    if not has_perm(user, "banners"):
        return JSONResponse({"error": "Akses ditolak"}, status_code=403)
    max_order = db.query(Banner).count()
    banner = Banner(
        image_url=data.get("image_url", ""),
        title=data.get("title") or None,
        link=data.get("link") or None,
        order=max_order,
        is_active=data.get("is_active", True),
    )
    db.add(banner)
    db.commit()
    db.refresh(banner)
    return banner_to_dict(banner)


@router.put("/reorder")
def reorder_banners(request: Request, data: dict, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    if not has_perm(user, "banners"):
        return JSONResponse({"error": "Akses ditolak"}, status_code=403)
    ids: list = data.get("ids", [])
    for idx, bid in enumerate(ids):
        db.query(Banner).filter(Banner.id == bid).update({"order": idx})
    db.commit()
    return {"ok": True}


@router.put("/{banner_id}")
def update_banner(banner_id: int, request: Request, data: dict, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    if not has_perm(user, "banners"):
        return JSONResponse({"error": "Akses ditolak"}, status_code=403)
    banner = db.query(Banner).filter(Banner.id == banner_id).first()
    if not banner:
        return JSONResponse({"error": "Banner tidak ditemukan"}, status_code=404)
    if "title" in data:
        banner.title = data["title"] or None
    if "link" in data:
        banner.link = data["link"] or None
    if "is_active" in data:
        banner.is_active = data["is_active"]
    db.commit()
    db.refresh(banner)
    return banner_to_dict(banner)


@router.delete("/{banner_id}")
def delete_banner(banner_id: int, request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    if not has_perm(user, "banners"):
        return JSONResponse({"error": "Akses ditolak"}, status_code=403)
    banner = db.query(Banner).filter(Banner.id == banner_id).first()
    if not banner:
        return JSONResponse({"error": "Banner tidak ditemukan"}, status_code=404)
    db.delete(banner)
    db.commit()
    return {"ok": True}
