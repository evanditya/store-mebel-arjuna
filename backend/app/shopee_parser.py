"""Parse Shopee 'Pesanan #... Siap Dikirim' seller emails.

Triggered when payment is confirmed and the order is ready to ship
(i.e. before the buyer receives it). The email body contains a list of
items in this text layout:

    1. <Product Name>
    Variasi:    <variant text>
    Jumlah:     <qty>
    Harga:      Rp <price>

    2. <Product Name>
    ...

Subject convention:
    [Shopee] Pesanan #<order_no> Siap Dikirim
"""
from __future__ import annotations
import re
from typing import Optional


_SUBJECT_RE = re.compile(r"Pesanan\s+#?(\S+)\s+Siap\s+Dikirim", re.IGNORECASE)
# Legacy support for the older "Telah Diterima Pembeli" subject (kept so
# backfilling old emails still works if anyone re-runs sync).
_SUBJECT_LEGACY_RE = re.compile(r"Pesanan\s+#?(\S+)\s+Telah\s+Diterima\s+Pembeli", re.IGNORECASE)
_QTY_RE = re.compile(r"x\s*(\d+)", re.IGNORECASE)


def is_shopee_delivered_subject(subject: str) -> bool:
    """True if subject matches the Shopee trigger we sync on."""
    if not subject:
        return False
    s = subject.strip()
    if "Siap Dikirim" in s and _SUBJECT_RE.search(s):
        return True
    # Backward compat
    if "Telah Diterima Pembeli" in s and _SUBJECT_LEGACY_RE.search(s):
        return True
    return False


def parse_subject_order_no(subject: str) -> str:
    if not subject:
        return ""
    m = _SUBJECT_RE.search(subject) or _SUBJECT_LEGACY_RE.search(subject)
    if not m:
        return ""
    return m.group(1).lstrip("#")


def parse_shopee_delivered_email(html_body: str, subject: str = "") -> dict:
    """Return {'order_no': str, 'items': [{'name', 'variant', 'qty'}]}.

    Tries the new "Siap Dikirim" text layout first (numbered items
    followed by Variasi/Jumlah/Harga rows), then falls back to the
    legacy class-based row layout (.product-row/.product-name/etc).
    Empty items list means nothing recognizable was found.
    """
    from bs4 import BeautifulSoup

    result = {"order_no": parse_subject_order_no(subject), "items": []}
    if not html_body:
        return result

    try:
        soup = BeautifulSoup(html_body, "html.parser")
    except Exception:
        return result

    # 1) New format: extract text and parse "N. Name" + Variasi/Jumlah blocks
    text = soup.get_text("\n", strip=True)
    items = _parse_text_blocks(text)
    if items:
        result["items"] = items

    # 2) Legacy fallback: structured class-based rows
    if not result["items"]:
        for row in soup.select(".product-row"):
            name_el = row.select_one(".product-name")
            if not name_el:
                continue
            name = _clean_text(name_el.get_text())
            if not name:
                continue

            variant = ""
            var_el = row.select_one(".product-variant")
            if var_el:
                v = _clean_text(var_el.get_text())
                v = re.sub(r"^(Variasi|Variation)\s*:?\s*", "", v, flags=re.IGNORECASE)
                variant = v

            qty = 1
            qty_el = row.select_one(".product-qty")
            if qty_el:
                qm = _QTY_RE.search(qty_el.get_text())
                if qm:
                    try:
                        qty = max(1, int(qm.group(1)))
                    except Exception:
                        qty = 1

            result["items"].append({"name": name, "variant": variant, "qty": qty})

    # 3) Try to extract order_no from body if subject didn't have it
    if not result["order_no"]:
        # Look for #XXXXXXXX pattern in text (e.g. "#26043056PF4C9N")
        m = re.search(r"#\s*([0-9A-Z][0-9A-Z\-]{6,})", text)
        if m:
            result["order_no"] = m.group(1)

    return result


# Match a line like "1. Product Name" or "12. Some Product"
_ITEM_HEAD_RE = re.compile(r"^\s*(\d+)\.\s+(.+?)\s*$")


def _parse_text_blocks(text: str) -> list:
    """Parse the plain-text block layout used in 'Siap Dikirim' emails.

    Looks for groups of lines:
        N. <Product Name>
        Variasi: <variant>
        Jumlah:  <qty>
        Harga:   Rp <price>
    Returns a list of {name, variant, qty} dicts.
    """
    if not text:
        return []
    lines = [ln.strip() for ln in text.split("\n") if ln.strip()]
    items: list = []
    i = 0
    n = len(lines)
    while i < n:
        head = _ITEM_HEAD_RE.match(lines[i])
        if not head:
            i += 1
            continue
        name = head.group(2).strip()
        # Sanity check: name should be reasonably long and not look like
        # a section header (e.g. "1. Salam,") -- require a Variasi/Jumlah
        # row within the next 6 lines to accept it.
        variant = ""
        qty = 1
        found_marker = False
        j = i + 1
        end = min(n, i + 8)
        while j < end:
            ln = lines[j]
            # Stop at next numbered item
            if _ITEM_HEAD_RE.match(ln):
                break
            low = ln.lower()
            if low.startswith("variasi"):
                # Same line "Variasi: X" or value on next line
                v = re.sub(r"^variasi\s*:?\s*", "", ln, flags=re.IGNORECASE).strip()
                if not v and j + 1 < end:
                    v = lines[j + 1].strip()
                    j += 1
                variant = v
                found_marker = True
            elif low.startswith("jumlah"):
                q = re.sub(r"^jumlah\s*:?\s*", "", ln, flags=re.IGNORECASE).strip()
                if not q and j + 1 < end:
                    q = lines[j + 1].strip()
                    j += 1
                m = re.search(r"\d+", q)
                if m:
                    try:
                        qty = max(1, int(m.group(0)))
                    except Exception:
                        qty = 1
                found_marker = True
            elif low.startswith("harga") or low.startswith("subtotal") or low.startswith("ongkos"):
                # Reached pricing rows; stop scanning this item
                if low.startswith("harga"):
                    found_marker = True
                # Don't break on harga -- there could be more items after
                pass
            j += 1

        if found_marker and name and len(name) >= 3:
            items.append({"name": name, "variant": variant, "qty": qty})
        i = j if j > i else i + 1

    return items


def _clean_text(s: str) -> str:
    if not s:
        return ""
    return " ".join(s.split()).strip()
