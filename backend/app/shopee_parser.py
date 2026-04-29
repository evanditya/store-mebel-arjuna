"""Parse Shopee 'Pesanan Telah Diterima Pembeli' seller emails.

The HTML format we target (matches both real Shopee emails and emails generated
by our own template) uses these CSS classes:
    .product-row           one item per row
      .product-name        product title
      .product-variant     "Variasi: <variant text>"
      .product-qty         "x<n>"

Subject convention:
    [Shopee Seller] Pesanan #<order_no> Telah Diterima Pembeli
or our own:
    [<seller> Seller] Pesanan #<order_no> Telah Diterima Pembeli
"""
from __future__ import annotations
import re
from typing import Optional


_SUBJECT_RE = re.compile(r"Pesanan\s+#?(\S+)\s+Telah\s+Diterima\s+Pembeli", re.IGNORECASE)
_QTY_RE = re.compile(r"x\s*(\d+)", re.IGNORECASE)


def is_shopee_delivered_subject(subject: str) -> bool:
    if not subject:
        return False
    s = subject.strip()
    if "Telah Diterima Pembeli" not in s:
        return False
    return _SUBJECT_RE.search(s) is not None


def parse_subject_order_no(subject: str) -> str:
    if not subject:
        return ""
    m = _SUBJECT_RE.search(subject)
    if not m:
        return ""
    return m.group(1).lstrip("#")


def parse_shopee_delivered_email(html_body: str, subject: str = "") -> dict:
    """Return {'order_no': str, 'items': [{'name', 'variant', 'qty'}]}.

    Robust to whitespace and attributes; relies on class hints. Returns
    empty items list when nothing recognizable is found (caller should
    treat that as a non-Shopee email).
    """
    from bs4 import BeautifulSoup

    result = {"order_no": parse_subject_order_no(subject), "items": []}
    if not html_body:
        return result

    try:
        soup = BeautifulSoup(html_body, "html.parser")
    except Exception:
        return result

    # 1) Preferred: structured class-based rows
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
            # Strip leading "Variasi:" or "Variation:"
            v = re.sub(r"^(Variasi|Variation)\s*:\s*", "", v, flags=re.IGNORECASE)
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

    # 2) Fallback: try the order number from the body's mono spans
    if not result["order_no"]:
        for el in soup.select(".info-val, .mono"):
            t = _clean_text(el.get_text())
            m = re.match(r"#?([0-9A-Z][0-9A-Z\-]{4,})$", t)
            if m:
                result["order_no"] = m.group(1)
                break

    return result


def _clean_text(s: str) -> str:
    if not s:
        return ""
    return " ".join(s.split()).strip()
