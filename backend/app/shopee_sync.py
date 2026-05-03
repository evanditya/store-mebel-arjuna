"""Shopee → store stock sync.

Reads Shopee 'Pesanan Telah Diterima Pembeli' emails from the seller's
Gmail inbox via IMAP. For each new email:
  1. Parse product name/variant/qty (see shopee_parser.py)
  2. Resolve each item to a store product (mapping table → exact name match)
  3. Atomically decrement stock (variant.stock if matched, else product.stock)
  4. Persist a ShopeeSyncLog row (idempotent on IMAP message_id)
  5. Mark the email as Seen on the IMAP server

Runs via two complementary mechanisms:
  • IMAP IDLE (push) — react within seconds of an email arriving
  • 30-minute fallback poll — catch anything missed during reconnects
"""
from __future__ import annotations
import os
import json
import email as _email
import time
import threading
import traceback
from datetime import datetime
from email.header import decode_header
from email.utils import parsedate_to_datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import (
    Product,
    ProductVariant,
    ShopeeSyncLog,
    ShopeeProductMapping,
)
from app.shopee_parser import (
    parse_shopee_delivered_email,
    is_shopee_delivered_subject,
)


# ── Config ─────────────────────────────────────────────────────────────────

def _imap_config() -> dict:
    return {
        "host": os.environ.get("IMAP_HOST", "imap.gmail.com"),
        "port": int(os.environ.get("IMAP_PORT", "993")),
        "user": os.environ.get("IMAP_USER", "") or os.environ.get("EMAIL_USER", ""),
        "password": os.environ.get("IMAP_PASSWORD", "") or os.environ.get("EMAIL_PASSWORD", ""),
        "folder": os.environ.get("IMAP_FOLDER", "INBOX"),
    }


def imap_configured() -> bool:
    c = _imap_config()
    return bool(c["host"] and c["user"] and c["password"])


# ── Header / payload helpers ──────────────────────────────────────────────

def _decode_header(s) -> str:
    if not s:
        return ""
    try:
        parts = decode_header(s)
        out = []
        for txt, enc in parts:
            if isinstance(txt, bytes):
                try:
                    out.append(txt.decode(enc or "utf-8", errors="replace"))
                except Exception:
                    out.append(txt.decode("utf-8", errors="replace"))
            else:
                out.append(txt)
        return "".join(out)
    except Exception:
        return str(s)


_SHOPEE_MARKUP_MARKER = 'class="product-row"'


def _extract_html(msg) -> str:
    """Return the best HTML body to parse for Shopee product rows.

    Gmail composes multipart/alternative emails where the text/html part
    HTML-escapes the user's raw markup (class=&quot;product-row&quot;) while
    the text/plain part preserves the literal HTML source.  We therefore
    prefer whichever MIME part actually contains the unescaped marker string
    before falling back to a type-based preference.
    """
    if msg.is_multipart():
        html_body: Optional[str] = None
        text_body: Optional[str] = None
        for part in msg.walk():
            ctype = part.get_content_type()
            disp = str(part.get("Content-Disposition") or "")
            if "attachment" in disp.lower():
                continue
            if ctype == "text/html" and html_body is None:
                html_body = _decode_payload(part)
            elif ctype == "text/plain" and text_body is None:
                text_body = _decode_payload(part)

        # Prefer whichever part has the raw Shopee HTML markup intact
        if html_body and _SHOPEE_MARKUP_MARKER in html_body:
            return html_body
        if text_body and _SHOPEE_MARKUP_MARKER in text_body:
            return text_body
        # No markup found — return whatever we have (type-based preference)
        if html_body is not None:
            return html_body
        if text_body is not None:
            return text_body
        return ""
    else:
        return _decode_payload(msg)


def _decode_payload(part) -> str:
    try:
        payload = part.get_payload(decode=True)
        if payload is None:
            return ""
        charset = part.get_content_charset() or "utf-8"
        return payload.decode(charset, errors="replace")
    except Exception:
        try:
            return str(part.get_payload())
        except Exception:
            return ""


# ── Stock decrement ────────────────────────────────────────────────────────

def _resolve_match(db: Session, item_name: str, variant_text: str) -> tuple[Optional[Product], Optional[ProductVariant]]:
    """Find target Product (and optional ProductVariant) for an item.

    Resolution order:
      1) ShopeeProductMapping (manual mapping) on lowercased shopee_product_name
      2) Exact case-insensitive Product.name match
    Variant resolution (only if a product was matched):
      a) Mapping's variant_id (if set) wins
      b) Else first ProductVariant whose name matches variant_text (case-insensitive)
    """
    name_lc = (item_name or "").strip().lower()
    if not name_lc:
        return None, None

    mapping = (
        db.query(ShopeeProductMapping)
        .filter(ShopeeProductMapping.shopee_product_name == name_lc)
        .first()
    )
    product = None
    variant = None

    if mapping:
        product = db.query(Product).filter(Product.id == mapping.product_id).first()
        if mapping.variant_id:
            variant = (
                db.query(ProductVariant)
                .filter(ProductVariant.id == mapping.variant_id)
                .first()
            )

    if not product:
        # Exact case-insensitive match
        from sqlalchemy import func as _f
        product = (
            db.query(Product)
            .filter(_f.lower(Product.name) == name_lc)
            .first()
        )

    if product and not variant and variant_text:
        vt = variant_text.strip().lower()
        # Exact match on variant_name first
        for v in product.variants:
            vname = (v.variant_name or "").strip().lower()
            if vname and vname == vt:
                variant = v
                break
        # Substring match (Shopee variants like "Hitam, 24\"" might contain "Hitam")
        if not variant:
            for v in product.variants:
                vname = (v.variant_name or "").strip().lower()
                if vname and (vname in vt or vt in vname):
                    variant = v
                    break

    return product, variant


def _decrement(db: Session, product: Product, variant: Optional[ProductVariant], qty: int) -> int:
    """Decrement stock atomically, never below 0. Returns actual amount removed."""
    qty = max(0, int(qty or 0))
    if qty == 0 or product is None:
        return 0
    removed = 0
    if variant is not None:
        before = int(variant.stock or 0)
        new = max(0, before - qty)
        removed = before - new
        variant.stock = new
        # Re-sum product.stock from all variants
        product.stock = sum(int(v.stock or 0) for v in product.variants)
    else:
        before = int(product.stock or 0)
        new = max(0, before - qty)
        removed = before - new
        product.stock = new
    return removed


# ── Per-message processing ────────────────────────────────────────────────

def _build_message_id(msg, fallback: str) -> str:
    mid = (msg.get("Message-ID") or msg.get("Message-Id") or "").strip()
    return mid or fallback


def _process_raw_email(db: Session, raw_bytes: bytes, fallback_id: str) -> dict:
    """Parse + apply one raw RFC822 email. Returns a result summary."""
    msg = _email.message_from_bytes(raw_bytes)
    subject = _decode_header(msg.get("Subject", ""))
    msg_id = _build_message_id(msg, fallback_id)

    # Already processed?
    existing = (
        db.query(ShopeeSyncLog)
        .filter(ShopeeSyncLog.message_id == msg_id)
        .first()
    )
    if existing:
        return {"skipped": True, "reason": "already_processed", "message_id": msg_id}

    if not is_shopee_delivered_subject(subject):
        return {"skipped": True, "reason": "subject_not_matching", "message_id": msg_id, "subject": subject}

    try:
        received_at = parsedate_to_datetime(msg.get("Date")) if msg.get("Date") else None
        if received_at and received_at.tzinfo:
            received_at = received_at.replace(tzinfo=None)
    except Exception:
        received_at = None

    html = _extract_html(msg)
    parsed = parse_shopee_delivered_email(html, subject)
    items = parsed.get("items", [])
    order_no = parsed.get("order_no", "") or ""

    if not items:
        log = ShopeeSyncLog(
            message_id=msg_id,
            subject=subject,
            shopee_order_no=order_no,
            received_at=received_at,
            status="error",
            items_json=json.dumps([]),
            error_msg="no items parsed from HTML",
        )
        db.add(log)
        db.commit()
        return {"status": "error", "reason": "parse_failed", "message_id": msg_id}

    item_results = []
    matched_count = 0
    total_decremented = 0
    for it in items:
        name = it.get("name", "")
        variant_txt = it.get("variant", "")
        qty = int(it.get("qty", 1) or 1)
        product, variant = _resolve_match(db, name, variant_txt)
        if not product:
            item_results.append({
                "name": name,
                "variant": variant_txt,
                "qty": qty,
                "matched": False,
                "decremented": 0,
            })
            continue
        matched_count += 1
        removed = _decrement(db, product, variant, qty)
        total_decremented += removed
        item_results.append({
            "name": name,
            "variant": variant_txt,
            "qty": qty,
            "matched": True,
            "product_id": product.id,
            "product_name": product.name,
            "variant_id": variant.id if variant else None,
            "variant_name": variant.variant_name if variant else None,
            "decremented": removed,
        })

    if matched_count == 0:
        status = "no_match"
    elif matched_count < len(items):
        status = "partial"
    else:
        status = "success"

    log = ShopeeSyncLog(
        message_id=msg_id,
        subject=subject,
        shopee_order_no=order_no,
        received_at=received_at,
        status=status,
        items_json=json.dumps(item_results, ensure_ascii=False),
        total_decremented=total_decremented,
    )
    db.add(log)
    db.commit()
    return {
        "status": status,
        "message_id": msg_id,
        "order_no": order_no,
        "matched": matched_count,
        "total_items": len(items),
        "total_decremented": total_decremented,
    }


# ── IMAP fetch loop (manual + scheduled poll) ────────────────────────────

def _fetch_and_process(only_unseen: bool = True, mark_seen: bool = True) -> dict:
    """Connect to IMAP, fetch matching messages, process each. Returns summary."""
    if not imap_configured():
        return {"ok": False, "error": "IMAP not configured"}

    from imapclient import IMAPClient

    cfg = _imap_config()
    summary = {"ok": True, "processed": 0, "skipped": 0, "results": []}
    try:
        with IMAPClient(cfg["host"], port=cfg["port"], ssl=True, use_uid=True) as client:
            client.login(cfg["user"], cfg["password"])
            client.select_folder(cfg["folder"])
            criteria = ["UNSEEN"] if only_unseen else ["ALL"]
            criteria += ["SUBJECT", "Siap Dikirim"]
            uids = client.search(criteria)
            if not uids:
                return summary
            fetched = client.fetch(uids, ["RFC822"])
            db = SessionLocal()
            try:
                for uid, data in fetched.items():
                    raw = data.get(b"RFC822") or data.get("RFC822") or b""
                    fallback_id = f"<imap-{cfg['user']}-{uid}>"
                    try:
                        result = _process_raw_email(db, raw, fallback_id)
                    except Exception as e:
                        db.rollback()
                        result = {"status": "error", "error": str(e), "uid": uid}
                    if result.get("skipped"):
                        summary["skipped"] += 1
                    else:
                        summary["processed"] += 1
                    summary["results"].append({"uid": uid, **result})
                    if mark_seen and result.get("status") in ("success", "partial", "no_match"):
                        try:
                            client.add_flags([uid], [b"\\Seen"])
                        except Exception:
                            pass
            finally:
                db.close()
    except Exception as e:
        return {"ok": False, "error": f"{type(e).__name__}: {e}"}
    return summary


def sync_inbox_once(only_unseen: bool = True) -> dict:
    """Public manual-trigger entry. Safe to call from a route handler."""
    return _fetch_and_process(only_unseen=only_unseen, mark_seen=True)


# ── IDLE background daemon ────────────────────────────────────────────────

_daemon_thread: Optional[threading.Thread] = None
_daemon_stop = threading.Event()
_daemon_status = {"running": False, "last_event": "", "last_error": ""}


def daemon_status() -> dict:
    return dict(_daemon_status)


def _idle_loop():
    """Long-running thread: IDLE for new emails + 30-min fallback poll.

    Reconnects on any failure with backoff. Runs an immediate sync at startup
    so any unread Shopee emails are processed right away.
    """
    from imapclient import IMAPClient

    backoff = 5
    last_poll = 0.0
    POLL_EVERY = 30 * 60  # seconds
    IDLE_REFRESH = 28 * 60  # Gmail closes at ~29 min

    # Initial catch-up
    try:
        s = sync_inbox_once()
        _daemon_status["last_event"] = f"startup sync: {s}"
        print(f"[ShopeeSync] startup sync: {s}")
    except Exception as e:
        _daemon_status["last_error"] = f"startup: {e}"
        print(f"[ShopeeSync] startup error: {e}")
    last_poll = time.time()

    while not _daemon_stop.is_set():
        if not imap_configured():
            _daemon_status["running"] = False
            time.sleep(30)
            continue
        cfg = _imap_config()
        try:
            with IMAPClient(cfg["host"], port=cfg["port"], ssl=True, use_uid=True) as client:
                client.login(cfg["user"], cfg["password"])
                client.select_folder(cfg["folder"])
                _daemon_status["running"] = True
                _daemon_status["last_event"] = f"IDLE connected at {datetime.utcnow().isoformat()}"
                print(f"[ShopeeSync] IDLE connected as {cfg['user']}")
                backoff = 5
                idle_start = time.time()
                client.idle()
                try:
                    while not _daemon_stop.is_set():
                        # Wait up to 30s, then check timers
                        responses = client.idle_check(timeout=30)
                        now = time.time()
                        new_email_signal = bool(responses)
                        idle_elapsed = now - idle_start
                        poll_due = (now - last_poll) >= POLL_EVERY
                        if new_email_signal or poll_due or idle_elapsed >= IDLE_REFRESH:
                            client.idle_done()
                            try:
                                if new_email_signal:
                                    _daemon_status["last_event"] = f"IDLE signal at {datetime.utcnow().isoformat()}"
                                    print(f"[ShopeeSync] IDLE signal: {responses}")
                                s = sync_inbox_once()
                                _daemon_status["last_event"] = f"sync at {datetime.utcnow().isoformat()}: {s.get('processed', 0)} processed"
                                if s.get("processed"):
                                    print(f"[ShopeeSync] sync: {s}")
                            except Exception as e:
                                _daemon_status["last_error"] = f"sync: {e}"
                                print(f"[ShopeeSync] sync error: {e}")
                            last_poll = now
                            if idle_elapsed >= IDLE_REFRESH:
                                # Reconnect to refresh the IDLE session
                                break
                            client.idle()
                            idle_start = time.time()
                finally:
                    try:
                        client.idle_done()
                    except Exception:
                        pass
        except Exception as e:
            _daemon_status["running"] = False
            _daemon_status["last_error"] = f"{type(e).__name__}: {e}"
            print(f"[ShopeeSync] IDLE error ({type(e).__name__}): {e}")
            traceback.print_exc()
            # Backoff before reconnect
            for _ in range(backoff):
                if _daemon_stop.is_set():
                    return
                time.sleep(1)
            backoff = min(backoff * 2, 300)


def start_daemon():
    """Start the IDLE daemon thread (no-op if already running or unconfigured)."""
    global _daemon_thread
    if _daemon_thread and _daemon_thread.is_alive():
        return False
    if not imap_configured():
        print("[ShopeeSync] IMAP not configured — daemon disabled")
        return False
    _daemon_stop.clear()
    _daemon_thread = threading.Thread(target=_idle_loop, name="shopee-sync-idle", daemon=True)
    _daemon_thread.start()
    print("[ShopeeSync] IDLE daemon started")
    return True


def stop_daemon():
    _daemon_stop.set()
