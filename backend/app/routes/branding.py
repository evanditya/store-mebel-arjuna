from fastapi import APIRouter, Depends, Request, UploadFile, File, Form
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.routes.auth import get_current_user
import json, os, shutil, uuid

router = APIRouter(prefix="/api/branding")

SELLER_CONFIG_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "seller_config.json"
)
UPLOADS_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads"
)


def _load_config() -> dict:
    try:
        if os.path.exists(SELLER_CONFIG_PATH):
            with open(SELLER_CONFIG_PATH) as f:
                return json.load(f)
    except Exception:
        pass
    return {}


def _save_config(data: dict):
    os.makedirs(os.path.dirname(SELLER_CONFIG_PATH), exist_ok=True)
    with open(SELLER_CONFIG_PATH, "w") as f:
        json.dump(data, f, indent=2)


@router.get("")
async def get_branding():
    config = _load_config()
    seller_name = config.get("seller_name", "")
    site_name = config.get("site_name") or seller_name or "Toko Online"
    return {
        "site_name": site_name,
        "seller_name": seller_name,
        "logo": config.get("profile_picture", "") or "",
        "banner": config.get("banner", "") or "",
        "brand_colors": config.get("brand_colors", []),
        "font": config.get("font", "") or "",
    }


@router.put("")
async def update_branding(request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    if not user or user.role != "seller":
        return JSONResponse({"error": "Akses ditolak"}, status_code=403)
    body = await request.json()
    config = _load_config()
    if "site_name" in body:
        config["site_name"] = body["site_name"]
    if "seller_name" in body:
        config["seller_name"] = body["seller_name"]
        config["username"] = body["seller_name"]
    if "logo" in body:
        config["profile_picture"] = body["logo"]
    if "banner" in body:
        config["banner"] = body["banner"]
    if "brand_colors" in body:
        config["brand_colors"] = body["brand_colors"]
    if "font" in body:
        config["font"] = body["font"]
    _save_config(config)
    return {"success": True}


@router.post("/upload")
async def upload_image(
    request: Request,
    file: UploadFile = File(...),
    image_type: str = Form("logo"),
    db: Session = Depends(get_db),
):
    user = get_current_user(request, db)
    if not user or user.role != "seller":
        return JSONResponse({"error": "Akses ditolak"}, status_code=403)
    if not file.content_type or not file.content_type.startswith("image/"):
        return JSONResponse({"error": "File harus berupa gambar"}, status_code=400)
    ext = (file.filename or "image.jpg").rsplit(".", 1)[-1].lower()
    if ext not in ("jpg", "jpeg", "png", "webp", "gif"):
        ext = "jpg"
    filename = f"branding_{image_type}_{uuid.uuid4().hex[:8]}.{ext}"
    dest = os.path.join(UPLOADS_DIR, filename)
    os.makedirs(UPLOADS_DIR, exist_ok=True)
    try:
        with open(dest, "wb") as f:
            shutil.copyfileobj(file.file, f)
    except Exception as e:
        return JSONResponse({"error": f"Gagal menyimpan file: {str(e)}"}, status_code=500)
    return {"url": f"/uploads/{filename}"}
