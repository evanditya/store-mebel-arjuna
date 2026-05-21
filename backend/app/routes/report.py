from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app import daily_report as dr
import os, json

router = APIRouter(prefix="/api/report")

SELLER_CONFIG_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "seller_config.json"
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


def _token(request: Request) -> str:
    return request.headers.get("X-Report-Token", "")


# ── Auth ──────────────────────────────────────────────────────────
@router.post("/verify-pin")
async def verify_pin(request: Request):
    body = await request.json()
    pin = str(body.get("pin", "")).strip()
    token = dr.verify_pin(pin)
    if token is None:
        return JSONResponse({"error": "PIN salah"}, status_code=403)
    return {"token": token}


# ── Config ────────────────────────────────────────────────────────
@router.get("/config")
async def get_config(request: Request):
    if not dr.check_token(_token(request)):
        return JSONResponse({"error": "Akses ditolak"}, status_code=403)
    config = _load_config()
    pin_set = bool(config.get("report_pin_hash"))
    return {
        "report_email": config.get("report_email", ""),
        "report_enabled": config.get("report_enabled", False),
        "pin_is_default": not pin_set,
    }


@router.put("/config")
async def update_config(request: Request):
    if not dr.check_token(_token(request)):
        return JSONResponse({"error": "Akses ditolak"}, status_code=403)
    body = await request.json()
    config = _load_config()

    if "report_email" in body:
        config["report_email"] = str(body["report_email"]).strip()
    if "report_enabled" in body:
        config["report_enabled"] = bool(body["report_enabled"])

    if "new_pin" in body:
        current_pin = str(body.get("current_pin", "")).strip()
        new_pin = str(body["new_pin"]).strip()
        if dr._hash_pin(current_pin) != dr._get_pin_hash():
            return JSONResponse({"error": "PIN lama salah"}, status_code=400)
        if len(new_pin) < 4:
            return JSONResponse({"error": "PIN minimal 4 karakter"}, status_code=400)
        config["report_pin_hash"] = dr._hash_pin(new_pin)

    _save_config(config)
    return {"success": True}


# ── Stats ─────────────────────────────────────────────────────────
@router.get("/stats")
async def get_stats(request: Request, db: Session = Depends(get_db)):
    if not dr.check_token(_token(request)):
        return JSONResponse({"error": "Akses ditolak"}, status_code=403)
    stats = dr.get_daily_stats(db)
    return stats


# ── Send now ──────────────────────────────────────────────────────
@router.post("/send-now")
async def send_now(request: Request, db: Session = Depends(get_db)):
    if not dr.check_token(_token(request)):
        return JSONResponse({"error": "Akses ditolak"}, status_code=403)
    config = _load_config()
    to_email = config.get("report_email", "").strip()
    if not to_email:
        return JSONResponse({"error": "Email penerima belum diatur"}, status_code=400)
    ok = dr.send_daily_report(db, to_email)
    if ok:
        return {"success": True, "message": f"Laporan berhasil dikirim ke {to_email}"}
    return JSONResponse({"error": "Gagal mengirim email. Periksa konfigurasi SMTP."}, status_code=500)
