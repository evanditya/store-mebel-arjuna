import os, json, threading, hashlib, secrets, time
from datetime import datetime, date, timedelta, timezone
from app.paths import get_seller_config_path

WIB = timezone(timedelta(hours=7))

# In-memory token store: token -> expires_at (epoch float)
_valid_tokens: dict = {}
_tokens_lock = threading.Lock()

_scheduler_thread = None
_scheduler_stop = threading.Event()


# ── Config helpers ────────────────────────────────────────────────
def _get_emails(config: dict) -> list:
    """Return list of recipient emails (supports new list field and old single string)."""
    raw = config.get("report_emails")
    if isinstance(raw, list):
        return [e.strip() for e in raw if str(e).strip()]
    old = config.get("report_email", "")
    if old:
        return [e.strip() for e in old.split(",") if e.strip()]
    return []


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


# ── Chart data ────────────────────────────────────────────────────
def get_chart_data(
    db,
    period: str = "day",
    date_from: "date | None" = None,
    date_to: "date | None" = None,
) -> dict:
    from app.models import Order

    now_wib = datetime.now(WIB)
    today = now_wib.date()

    # Determine date range and auto-detect granularity for custom ranges
    if date_from and date_to:
        if date_to > today:
            date_to = today
        if date_from > date_to:
            date_from = date_to
        days_span = (date_to - date_from).days + 1
        if days_span <= 35:
            granularity = "day"
        elif days_span <= 100:
            granularity = "week"
        elif days_span <= 730:
            granularity = "month"
        else:
            granularity = "year"
    else:
        granularity = period
        if period == "day":
            date_from = today - timedelta(days=29)
            date_to = today
        elif period == "week":
            # 12 weeks back, align to Monday
            raw_from = today - timedelta(weeks=11)
            date_from = raw_from - timedelta(days=raw_from.weekday())
            date_to = today
        elif period == "month":
            # 12 months back, starting from 1st of that month
            m = today.month - 11
            y = today.year
            if m <= 0:
                m += 12
                y -= 1
            date_from = date(y, m, 1)
            date_to = today
        else:  # year — last 5 full years + current year
            date_from = date(today.year - 4, 1, 1)
            date_to = today

    # Fetch all orders in range (UTC-aware)
    start_utc = datetime.combine(date_from, datetime.min.time()) - timedelta(hours=7)
    end_utc = datetime.combine(date_to, datetime.min.time()) - timedelta(hours=7) + timedelta(days=1)
    orders = db.query(Order).filter(Order.created_at >= start_utc, Order.created_at < end_utc).all()

    paid_statuses = {"paid", "processing", "ready_pickup", "shipped", "completed"}

    def _order_wib_date(o):
        return (o.created_at + timedelta(hours=7)).date()

    # ── Day buckets ──────────────────────────────────────────────
    if granularity == "day":
        MONTHS_ID = ["", "Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"]
        buckets: dict = {}
        d = date_from
        while d <= date_to:
            buckets[d] = {"label": f"{d.day} {MONTHS_ID[d.month]}", "orders": 0, "revenue": 0.0}
            d += timedelta(days=1)
        for o in orders:
            od = _order_wib_date(o)
            if od in buckets:
                buckets[od]["orders"] += 1
                if o.status in paid_statuses:
                    buckets[od]["revenue"] += o.total
        data = list(buckets.values())

    # ── Week buckets ─────────────────────────────────────────────
    elif granularity == "week":
        MONTHS_ID = ["", "Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"]
        # Build week starts (Monday)
        week_starts = []
        d = date_from - timedelta(days=date_from.weekday())  # nearest Monday ≤ date_from
        while d <= date_to:
            week_starts.append(d)
            d += timedelta(days=7)
        buckets = {ws: {"label": f"{ws.day} {MONTHS_ID[ws.month]}", "orders": 0, "revenue": 0.0} for ws in week_starts}
        for o in orders:
            od = _order_wib_date(o)
            # Find its Monday
            monday = od - timedelta(days=od.weekday())
            if monday in buckets:
                buckets[monday]["orders"] += 1
                if o.status in paid_statuses:
                    buckets[monday]["revenue"] += o.total
        data = [buckets[ws] for ws in week_starts]

    # ── Month buckets ────────────────────────────────────────────
    elif granularity == "month":
        MONTHS_ID = ["", "Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"]
        month_starts = []
        m = date(date_from.year, date_from.month, 1)
        while m <= date_to:
            month_starts.append(m)
            if m.month == 12:
                m = date(m.year + 1, 1, 1)
            else:
                m = date(m.year, m.month + 1, 1)
        buckets = {ms: {"label": f"{MONTHS_ID[ms.month]} {ms.year}", "orders": 0, "revenue": 0.0} for ms in month_starts}
        for o in orders:
            od = _order_wib_date(o)
            ms = date(od.year, od.month, 1)
            if ms in buckets:
                buckets[ms]["orders"] += 1
                if o.status in paid_statuses:
                    buckets[ms]["revenue"] += o.total
        data = [buckets[ms] for ms in month_starts]

    # ── Year buckets ─────────────────────────────────────────────
    else:
        year_starts = list(range(date_from.year, date_to.year + 1))
        buckets = {y: {"label": str(y), "orders": 0, "revenue": 0.0} for y in year_starts}
        for o in orders:
            y = _order_wib_date(o).year
            if y in buckets:
                buckets[y]["orders"] += 1
                if o.status in paid_statuses:
                    buckets[y]["revenue"] += o.total
        data = [buckets[y] for y in year_starts]

    # Status totals for donut chart
    status_totals: dict = {}
    for o in orders:
        status_totals[o.status] = status_totals.get(o.status, 0) + 1

    total_revenue = sum(o.total for o in orders if o.status in paid_statuses)

    return {
        "granularity": granularity,
        "from": date_from.isoformat(),
        "to": date_to.isoformat(),
        "data": data,
        "status_totals": status_totals,
        "total_orders": len(orders),
        "total_revenue": total_revenue,
    }


# ── Send report ───────────────────────────────────────────────────
def send_daily_report(db, to_email: str, target_date: date | None = None) -> bool:
    from app.email import send_daily_report_email
    config = _load_config()
    seller_name = config.get("site_name") or config.get("seller_name", "Toko Online")
    stats = get_daily_stats(db, target_date)
    return send_daily_report_email(to_email, stats, seller_name)


# ── Scheduler ─────────────────────────────────────────────────────
def _get_last_sent_date() -> date | None:
    """Read last sent date from seller_config.json (persists across restarts)."""
    try:
        config = _load_config()
        raw = config.get("report_last_sent_date")
        if raw:
            return date.fromisoformat(raw)
    except Exception:
        pass
    return None


def _set_last_sent_date(d: date):
    """Persist last sent date to seller_config.json."""
    try:
        config = _load_config()
        config["report_last_sent_date"] = d.isoformat()
        _save_config(config)
    except Exception as e:
        print(f"[DailyReport] Could not persist last_sent_date: {e}")


def _scheduler_loop(db_factory):
    print("[DailyReport] Scheduler running (checks every 60s)")
    while not _scheduler_stop.is_set():
        try:
            now_wib = datetime.now(WIB)
            today = now_wib.date()
            # Fire any time from 23:00 onwards — survives server sleep/restart
            if now_wib.hour >= 23 and _get_last_sent_date() != today:
                config = _load_config()
                emails = _get_emails(config)
                if config.get("report_enabled") and emails:
                    db = db_factory()
                    try:
                        stats = get_daily_stats(db, today)
                        only_if_orders = config.get("report_only_if_orders", True)
                        if only_if_orders and stats["total_orders"] == 0:
                            _set_last_sent_date(today)
                            print(f"[DailyReport] No orders for {today} — skipping email")
                        else:
                            from app.email import send_daily_report_email
                            seller_name = config.get("site_name") or config.get("seller_name", "Toko Online")
                            any_ok = False
                            for email in emails:
                                ok = send_daily_report_email(email, stats, seller_name)
                                if ok:
                                    any_ok = True
                                    print(f"[DailyReport] Sent for {today} ({stats['total_orders']} orders) → {email}")
                                else:
                                    print(f"[DailyReport] Failed to send to {email} for {today}")
                            if any_ok:
                                _set_last_sent_date(today)
                    finally:
                        db.close()
                else:
                    # Not configured — mark today so we don't keep checking
                    _set_last_sent_date(today)
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
