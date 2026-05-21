import os, json, threading, hashlib, secrets, time
from datetime import datetime, date, timedelta, timezone

SELLER_CONFIG_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "seller_config.json"
)

WIB = timezone(timedelta(hours=7))

# In-memory token store: token -> expires_at (epoch float)
_valid_tokens: dict = {}
_tokens_lock = threading.Lock()

_scheduler_thread = None
_scheduler_stop = threading.Event()


# ── Config helpers ────────────────────────────────────────────────
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


def _hash_pin(pin: str) -> str:
    return hashlib.sha256(pin.encode()).hexdigest()


def _get_pin_hash() -> str:
    config = _load_config()
    stored = config.get("report_pin_hash")
    if stored:
        return stored
    return _hash_pin(os.environ.get("REPORT_PIN", "admin1234"))


# ── Token helpers ─────────────────────────────────────────────────
def verify_pin(pin: str) -> str | None:
    if _hash_pin(pin) != _get_pin_hash():
        return None
    token = secrets.token_hex(32)
    with _tokens_lock:
        _valid_tokens[token] = time.time() + 3600
    return token


def check_token(token: str) -> bool:
    if not token:
        return False
    with _tokens_lock:
        expires = _valid_tokens.get(token)
        if expires is None:
            return False
        if time.time() > expires:
            del _valid_tokens[token]
            return False
    return True


# ── Stats ─────────────────────────────────────────────────────────
def get_daily_stats(db, target_date: date | None = None) -> dict:
    from app.models import Order

    if target_date is None:
        target_date = datetime.now(WIB).date()

    start_utc = datetime.combine(target_date, datetime.min.time()) - timedelta(hours=7)
    end_utc = start_utc + timedelta(days=1)

    orders = (
        db.query(Order)
        .filter(Order.created_at >= start_utc, Order.created_at < end_utc)
        .all()
    )

    paid_statuses = {"paid", "processing", "ready_pickup", "shipped", "completed"}
    status_counts: dict = {}
    revenue_by_status: dict = {}

    for o in orders:
        status_counts[o.status] = status_counts.get(o.status, 0) + 1
        if o.status in paid_statuses:
            revenue_by_status[o.status] = revenue_by_status.get(o.status, 0.0) + o.total

    total_revenue = sum(revenue_by_status.values())

    order_list = []
    for o in sorted(orders, key=lambda x: x.created_at, reverse=True):
        items = [{"name": it.product_name, "qty": it.quantity, "price": it.price} for it in o.items]
        is_pickup = (o.courier_service_name or "") == "Ambil di Toko" and not (o.courier_company or "")
        delivery = "Ambil di Toko" if is_pickup else f"{(o.courier_company or '').upper()} {o.courier_service_name or ''}".strip()
        order_list.append({
            "id": o.id[:8].upper(),
            "buyer": o.destination_contact_name or "-",
            "total": o.total,
            "status": o.status,
            "delivery": delivery,
            "items": items,
        })

    return {
        "date": target_date.isoformat(),
        "total_orders": len(orders),
        "total_revenue": total_revenue,
        "status_counts": status_counts,
        "orders": order_list,
    }


# ── Send report ───────────────────────────────────────────────────
def send_daily_report(db, to_email: str, target_date: date | None = None) -> bool:
    from app.email import send_daily_report_email
    config = _load_config()
    seller_name = config.get("site_name") or config.get("seller_name", "Toko Online")
    stats = get_daily_stats(db, target_date)
    return send_daily_report_email(to_email, stats, seller_name)


# ── Scheduler ─────────────────────────────────────────────────────
def _scheduler_loop(db_factory):
    last_sent_date = None
    print("[DailyReport] Scheduler running (checks every 60s)")
    while not _scheduler_stop.is_set():
        try:
            now_wib = datetime.now(WIB)
            today = now_wib.date()
            if now_wib.hour == 23 and now_wib.minute < 5 and last_sent_date != today:
                config = _load_config()
                if config.get("report_enabled") and config.get("report_email"):
                    db = db_factory()
                    try:
                        ok = send_daily_report(db, config["report_email"])
                        if ok:
                            last_sent_date = today
                            print(f"[DailyReport] Sent for {today} → {config['report_email']}")
                        else:
                            print(f"[DailyReport] Failed to send for {today}")
                    finally:
                        db.close()
        except Exception as e:
            print(f"[DailyReport] Scheduler error: {e}")
        _scheduler_stop.wait(60)


def start_scheduler():
    global _scheduler_thread
    from app.database import SessionLocal
    _scheduler_stop.clear()
    _scheduler_thread = threading.Thread(
        target=_scheduler_loop, args=(SessionLocal,), daemon=True, name="DailyReportScheduler"
    )
    _scheduler_thread.start()


def stop_scheduler():
    _scheduler_stop.set()
