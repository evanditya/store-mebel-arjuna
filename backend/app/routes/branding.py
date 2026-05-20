from fastapi import APIRouter, Depends, Request, UploadFile, File, Form
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.routes.auth import get_current_user, has_perm
import json, os, shutil, uuid, time

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
async def get_branding(db: Session = Depends(get_db)):
    from app.models import User
    config = _load_config()
    seller_name = config.get("seller_name", "")
    site_name = config.get("site_name") or seller_name or "Toko Online"

    # Fallback to seller user record in DB when config fields are empty
    seller_user = db.query(User).filter(User.role == "seller").first()
    db_phone = (seller_user.phone or "") if seller_user else ""
    db_address = (seller_user.address or "") if seller_user else ""

    return {
        "site_name": site_name,
        "seller_name": seller_name,
        "logo": config.get("profile_picture", "") or "",
        "banner": config.get("banner", "") or "",
        "brand_colors": config.get("brand_colors", []),
        "font": config.get("font", "") or "",
        "favicon": config.get("favicon", "") or "",
        "favicon_version": config.get("favicon_version", "") or "",
        "pickup_enabled": config.get("pickup_enabled", False),
        "pickup_open_time": config.get("pickup_open_time", "08:00"),
        "pickup_close_time": config.get("pickup_close_time", "17:00"),
        "pickup_days": config.get("pickup_days", ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"]),
        "store_address": config.get("store_address") or config.get("address") or db_address,
        "store_phone": config.get("store_phone") or config.get("phone") or db_phone,
        "pickup_notes": config.get("pickup_notes", ""),
    }


@router.put("")
async def update_branding(request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    if not has_perm(user, "settings"):
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
    if "favicon" in body:
        config["favicon"] = body["favicon"]
        config["favicon_version"] = str(int(time.time()))
    if "pickup_enabled" in body:
        config["pickup_enabled"] = bool(body["pickup_enabled"])
    if "pickup_open_time" in body:
        config["pickup_open_time"] = body["pickup_open_time"]
    if "pickup_close_time" in body:
        config["pickup_close_time"] = body["pickup_close_time"]
    if "pickup_days" in body:
        config["pickup_days"] = [d for d in body["pickup_days"] if isinstance(d, str)]
    if "store_address" in body:
        config["store_address"] = body["store_address"]
    if "store_phone" in body:
        config["store_phone"] = body["store_phone"]
    if "pickup_notes" in body:
        config["pickup_notes"] = body["pickup_notes"]
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
    if not has_perm(user, "settings"):
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
