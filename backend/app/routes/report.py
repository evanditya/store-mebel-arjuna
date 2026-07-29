from fastapi import APIRouter, Depends, Request, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app import daily_report as dr
from app.paths import get_seller_config_path
from datetime import date as date_type
import os, json

router = APIRouter(prefix="/api/report")


def _load_config() -> dict:
    try:
        path = get_seller_config_path()
        if os.path.exists(path):
            with open(path) as f:
                return json.load(f)
    except Exception:
        pass
    return {}


def _save_config(data: dict):
    path = get_seller_config_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


def _token(request: Request) -> str:
    return request.headers.get("X-Report-Token", "")


def _get_emails(config: dict) -> list[str]:
    """Return list of recipient emails from config (supports old single-string and new list)."""
    raw = config.get("report_emails")
    if isinstance(raw, list):
        return [e.strip() for e in raw if e.strip()]
    # backward compat: old single string field
    old = config.get("report_email", "")
    if old:
        return [e.strip() for e in old.split(",") if e.strip()]
    return []


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
        "report_emails": _get_emails(config),
        "report_email": ", ".join(_get_emails(config)),  # backward compat
        "report_enabled": config.get("report_enabled", False),
        "report_only_if_orders": config.get("report_only_if_orders", True),
        "pin_is_default": not pin_set,
    }


@router.put("/config")
async def update_config(request: Request):
    if not dr.check_token(_token(request)):
        return JSONResponse({"error": "Akses ditolak"}, status_code=403)
    body = await request.json()
    config = _load_config()

    if "report_emails" in body:
        emails = [e.strip() for e in body["report_emails"] if str(e).strip()]
        config["report_emails"] = emails
        config["report_email"] = ", ".join(emails)  # keep old field in sync
    elif "report_email" in body:
        raw = str(body["report_email"]).strip()
        emails = [e.strip() for e in raw.split(",") if e.strip()]
        config["report_emails"] = emails
        config["report_email"] = raw

    if "report_enabled" in body:
        config["report_enabled"] = bool(body["report_enabled"])

    if "report_only_if_orders" in body:
        config["report_only_if_orders"] = bool(body["report_only_if_orders"])

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


# ── Chart ──────────────────────────────────────────────────────────
@router.get("/chart")
async def get_chart(
    request: Request,
    db: Session = Depends(get_db),
    period: str = Query("week", regex="^(day|week|month|year)$"),
    date_from: str = Query(None),
    date_to: str = Query(None),
):
    if not dr.check_token(_token(request)):
        return JSONResponse({"error": "Akses ditolak"}, status_code=403)

    parsed_from = None
    parsed_to = None
    if date_from:
        try:
            parsed_from = date_type.fromisoformat(date_from)
        except ValueError:
            return JSONResponse({"error": "Format date_from tidak valid (YYYY-MM-DD)"}, status_code=400)
    if date_to:
        try:
            parsed_to = date_type.fromisoformat(date_to)
        except ValueError:
            return JSONResponse({"error": "Format date_to tidak valid (YYYY-MM-DD)"}, status_code=400)

    data = dr.get_chart_data(db, period=period, date_from=parsed_from, date_to=parsed_to)
    return data


# ── Send now ──────────────────────────────────────────────────────
@router.post("/send-now")
async def send_now(request: Request, db: Session = Depends(get_db)):
    if not dr.check_token(_token(request)):
        return JSONResponse({"error": "Akses ditolak"}, status_code=403)
    config = _load_config()
    emails = _get_emails(config)
    if not emails:
        return JSONResponse({"error": "Email penerima belum diatur"}, status_code=400)
    seller_name = config.get("site_name") or config.get("seller_name", "Toko Online")
    stats = dr.get_daily_stats(db)
    from app.email import send_daily_report_email
    results = []
    for email in emails:
        ok = send_daily_report_email(email, stats, seller_name)
        results.append((email, ok))
    failed = [e for e, ok in results if not ok]
    succeeded = [e for e, ok in results if ok]
    if succeeded:
        msg = f"Laporan berhasil dikirim ke {', '.join(succeeded)}"
        if failed:
            msg += f". Gagal: {', '.join(failed)}"
        return {"success": True, "message": msg}
    return JSONResponse({"error": "Gagal mengirim email. Periksa konfigurasi SMTP."}, status_code=500)
