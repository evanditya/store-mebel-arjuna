import io, re
from collections import defaultdict
from difflib import SequenceMatcher
from fastapi import APIRouter, Request, UploadFile, File, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.routes.auth import get_current_user
import openpyxl

router = APIRouter(prefix="/api/excel-import", tags=["excel-import"])


def _norm(s):
    if not s:
        return ""
    s = str(s).lower().strip()
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def _score(a, b):
    return SequenceMatcher(None, _norm(a), _norm(b)).ratio()


def _parse_excel(content: bytes):
    wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))

    if not rows:
        return {}

    r0_a = str(rows[0][0] or "").strip() if rows[0] else ""
    # Shopee/unified format: row 1 col A starts with 'et_title'
    # OR row 3 col A == 'Kode Produk' (our downloaded format)
    is_shopee = r0_a == "et_title_product_id"
    if not is_shopee and len(rows) >= 3 and rows[2]:
        r2_a = str(rows[2][0] or "").strip()
        if r2_a == "Kode Produk":
            is_shopee = True

    if is_shopee:
        header_row = rows[2] if len(rows) > 2 else ()
        data_rows = rows[6:] if len(rows) > 6 else []
    else:
        # Old format: headers in row 1, data from row 2
        header_row = rows[0]
        data_rows = rows[1:]

    col_map: dict[str, int] = {}
    for idx, h in enumerate(header_row):
        if h is not None and str(h).strip():
            col_map[str(h).strip()] = idx

    def _ci(name, default=None):
        return col_map.get(name, default)

    NAME_IDX  = _ci("Nama Produk", 1)
    VAR_IDX   = _ci("Nama Variasi", 3)
    PRICE_IDX = _ci("Harga", 6)
    STOCK_IDX = _ci("Stok", 8)
    DISKON_IDX   = _ci("Harga Diskon")
    BERAT_IDX    = _ci("Berat (gram)")
    PANJANG_IDX  = _ci("Panjang (cm)")
    LEBAR_IDX    = _ci("Lebar (cm)")
    TINGGI_IDX   = _ci("Tinggi (cm)")
    KATEGORI_IDX = _ci("Kategori")
    DESKRIPSI_IDX = _ci("Deskripsi")
    VIDEO_IDX    = _ci("Video Produk")
    TERSEDIA_IDX = _ci("Tersedia (Ya/Tidak)")

    def _get(row, idx):
        if idx is None or idx >= len(row):
            return None
        return row[idx]

    def _num(val):
        if val is None or str(val).strip() == "":
            return None
        try:
            return float(str(val).replace(",", "").strip())
        except (ValueError, TypeError):
            return None

    def _int_or_none(val):
        n = _num(val)
        return int(n) if n is not None else None

    products: dict = {}
    for r in data_rows:
        if not r or all(v is None for v in r):
            continue
        name = str(_get(r, NAME_IDX) or "").strip()
        if not name:
            continue
        if name not in products:
            products[name] = {"name": name, "variants": []}

        products[name]["variants"].append({
            "var_name":  str(_get(r, VAR_IDX) or "").strip() or None,
            "price":     _num(_get(r, PRICE_IDX)),
            "stock":     _int_or_none(_get(r, STOCK_IDX)),
            "diskon":    _num(_get(r, DISKON_IDX)),
            "berat":     _int_or_none(_get(r, BERAT_IDX)),
            "panjang":   _int_or_none(_get(r, PANJANG_IDX)),
            "lebar":     _int_or_none(_get(r, LEBAR_IDX)),
            "tinggi":    _int_or_none(_get(r, TINGGI_IDX)),
            "kategori":  str(_get(r, KATEGORI_IDX) or "").strip() or None,
            "deskripsi": str(_get(r, DESKRIPSI_IDX) or "").strip() or None,
            "video":     str(_get(r, VIDEO_IDX) or "").strip() or None,
            "tersedia":  str(_get(r, TERSEDIA_IDX) or "").strip() or None,
        })
    return products


def _match_products(db_product_pairs, excel_products):
    # Pre-compute normalised names for every Excel entry
    excel_norm_map: dict[str, str] = {}   # norm_name -> original excel key
    bigram_idx: dict[str, set] = defaultdict(set)

    for pname, v in excel_products.items():
        n = _norm(v["name"])
        excel_norm_map[n] = pname
        toks = n.split()
        for i in range(len(toks) - 1):
            bigram_idx[toks[i] + " " + toks[i + 1]].add(pname)
        for t in toks:
            if len(t) >= 4:
                bigram_idx[t].add(pname)

    results = []
    for db_id, db_name in db_product_pairs:
        dn = _norm(db_name)

        # Fast path: exact normalised-name match → always score 1.0
        if dn in excel_norm_map:
            pname = excel_norm_map[dn]
            results.append((db_id, db_name, pname, excel_products[pname]["name"], 1.0))
            continue

        # Slow path: bigram candidate lookup (no hard cap — score all candidates)
        toks = dn.split()
        candidates: set = set()
        for i in range(len(toks) - 1):
            candidates.update(bigram_idx.get(toks[i] + " " + toks[i + 1], set()))
        for t in toks:
            if len(t) >= 4:
                candidates.update(bigram_idx.get(t, set()))

        if not candidates:
            results.append((db_id, db_name, None, None, 0.0))
            continue

        best = max(candidates, key=lambda p: _score(db_name, excel_products[p]["name"]))
        s = _score(db_name, excel_products[best]["name"])
        results.append((db_id, db_name, best, excel_products[best]["name"], round(s, 3)))
    return results


@router.post("/preview")
async def preview_import(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    user = get_current_user(request, db)
    if not user or user.role != "seller":
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    content = await file.read()
    try:
        excel_products = _parse_excel(content)
    except Exception as e:
        return JSONResponse({"error": f"Gagal membaca file: {str(e)}"}, status_code=400)

    from app.models import Product, ProductVariant

    db_products_raw = db.query(Product).all()
    db_product_pairs = [(p.id, p.name) for p in db_products_raw]
    db_product_map = {p.id: p for p in db_products_raw}

    from app.routes.products import _get_purchaseable_variants
    all_variants = db.query(ProductVariant).all()
    _all_by_product = defaultdict(list)
    for v in all_variants:
        _all_by_product[v.product_id].append(v)
    # Only match variants that the export actually wrote (combinations for old format,
    # all non-combo rows for new format) — avoids false positives from display rows.
    variants_by_product = {pid: _get_purchaseable_variants(vlist) for pid, vlist in _all_by_product.items()}

    matches_raw = _match_products(db_product_pairs, excel_products)

    matched = []
    unmatched = []

    for db_id, db_name, shopee_key, shopee_name, score in matches_raw:
        if score < 0.5 or shopee_key is None:
            unmatched.append({"db_product_id": db_id, "db_product_name": db_name})
            continue

        db_prod = db_product_map[db_id]
        excel_prod = excel_products[shopee_key]
        excel_variants = excel_prod["variants"]
        db_variants = variants_by_product.get(db_id, [])

        # Product-level extras: take from first variant row (same across all rows for same product)
        ev0 = excel_variants[0] if excel_variants else {}

        item = {
            "db_product_id": db_id,
            "db_product_name": db_name,
            "shopee_product_id": shopee_key,
            "shopee_product_name": shopee_name,
            "match_score": score,
            "price_old": db_prod.price,
            "price_new": None,
            "stock_old": db_prod.stock,
            "stock_new": None,
            "variant_matches": [],
            # extra fields (product-level)
            "berat_new": ev0.get("berat"),
            "panjang_new": ev0.get("panjang"),
            "lebar_new": ev0.get("lebar"),
            "tinggi_new": ev0.get("tinggi"),
            "kategori_new": ev0.get("kategori"),
            "deskripsi_new": ev0.get("deskripsi"),
            "video_new": ev0.get("video"),
        }

        if db_variants:
            for dbv in db_variants:
                best_ev = None
                best_vs = 0.0
                best_exact = False
                for ev in excel_variants:
                    vs = _score(dbv.variant_name or "", ev["var_name"] or "")
                    is_exact = (dbv.variant_name or "").strip().lower() == (ev["var_name"] or "").strip().lower()
                    # prefer higher score; on tie prefer exact string match
                    if vs > best_vs or (vs == best_vs and is_exact and not best_exact):
                        best_vs = vs
                        best_ev = ev
                        best_exact = is_exact
                if best_ev and (best_vs >= 0.4 or len(excel_variants) == 1):
                    item["variant_matches"].append(
                        {
                            "db_variant_id": dbv.id,
                            "db_variant_name": dbv.variant_name,
                            "shopee_variant_name": best_ev["var_name"],
                            "variant_score": round(best_vs, 3),
                            "price_old": dbv.price,
                            "price_new": best_ev["price"],
                            "stock_old": dbv.stock,
                            "stock_new": best_ev["stock"],
                            "diskon_new": best_ev.get("diskon"),
                            "tersedia_new": best_ev.get("tersedia"),
                        }
                    )
            new_prices = [
                vm["price_new"]
                for vm in item["variant_matches"]
                if vm["price_new"] is not None
            ]
            item["price_new"] = min(new_prices) if new_prices else None
            item["stock_new"] = None
        else:
            prices = [ev["price"] for ev in excel_variants if ev["price"] is not None]
            stocks = [ev["stock"] for ev in excel_variants if ev["stock"] is not None]
            if len(excel_variants) == 1:
                item["price_new"] = excel_variants[0]["price"]
                item["stock_new"] = excel_variants[0]["stock"]
                item["diskon_new"] = excel_variants[0].get("diskon")
                item["tersedia_new"] = excel_variants[0].get("tersedia")
            else:
                item["price_new"] = min(prices) if prices else None
                item["stock_new"] = sum(stocks) if stocks else None
                item["diskon_new"] = ev0.get("diskon")
                item["tersedia_new"] = ev0.get("tersedia")

        # Determine if this product has any actual value changes
        if item["variant_matches"]:
            prod_price_old = item["price_old"]  # product-level price as fallback
            has_changes = any(
                # price: coalesce variant price to product price (variant may store None when using product price)
                (vm["price_new"] is not None and vm["price_new"] != (vm["price_old"] if vm["price_old"] is not None else prod_price_old))
                # stock: coalesce None to 0 (variant stock None means 0 purchaseable stock)
                or (vm["stock_new"] is not None and (vm["stock_new"] or 0) != (vm["stock_old"] or 0))
                for vm in item["variant_matches"]
            )
        else:
            has_changes = (
                (item["price_new"] is not None and item["price_new"] != item["price_old"])
                or (item["stock_new"] is not None and item["stock_new"] != item["stock_old"])
            )
        item["has_changes"] = has_changes

        matched.append(item)

    return {
        "matched": matched,
        "unmatched": unmatched,
        "summary": {
            "total_db": len(db_product_pairs),
            "matched_high": sum(1 for m in matches_raw if m[4] >= 0.7),
            "matched_ok": sum(1 for m in matches_raw if 0.5 <= m[4] < 0.7),
            "unmatched": sum(1 for m in matches_raw if m[4] < 0.5),
        },
    }


@router.post("/apply")
async def apply_import(request: Request, db: Session = Depends(get_db)):
    import json as _json

    user = get_current_user(request, db)
    if not user or user.role != "seller":
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    body = await request.json()
    updates = body.get("updates", [])

    # Build compact payload lists — one entry per product, one per variant
    prod_rows = []
    var_rows = []

    for u in updates:
        pid = u.get("db_product_id")
        if not pid:
            continue
        variant_updates = u.get("variant_matches", [])
        tersedia = u.get("tersedia_new") if not variant_updates else None
        prod_rows.append({
            "id": pid,
            "price": u.get("price_new"),
            "stock": u.get("stock_new"),
            "diskon": u.get("diskon_new") if not variant_updates else "__skip__",
            "tersedia": tersedia,
            "berat": u.get("berat_new"),
            "panjang": u.get("panjang_new"),
            "lebar": u.get("lebar_new"),
            "tinggi": u.get("tinggi_new"),
            "kategori": u.get("kategori_new") or None,
            "deskripsi": u.get("deskripsi_new") or None,
            "video": u.get("video_new") or None,
        })
        for vu in variant_updates:
            vid = vu.get("db_variant_id")
            if not vid:
                continue
            var_rows.append({
                "id": vid,
                "price": vu.get("price_new"),
                "stock": vu.get("stock_new"),
                "diskon": vu.get("diskon_new"),
                "tersedia": vu.get("tersedia_new"),
            })

    from sqlalchemy import text

    # ── ONE SQL statement for all products ──────────────────────────────────
    if prod_rows:
        db.execute(text("""
            UPDATE products AS p SET
                price           = CASE WHEN (j->>'price')    IS NOT NULL THEN (j->>'price')::float    ELSE p.price           END,
                stock           = CASE WHEN (j->>'stock')    IS NOT NULL THEN (j->>'stock')::int      ELSE p.stock           END,
                original_price  = CASE WHEN j->>'diskon' = '__skip__' THEN p.original_price
                                       WHEN (j->>'diskon') IS NOT NULL THEN NULLIF((j->>'diskon'),'0')::float
                                       ELSE p.original_price END,
                is_available    = CASE WHEN (j->>'tersedia') IS NOT NULL
                                       THEN (j->>'tersedia') NOT IN ('tidak','no','false','0')
                                       ELSE p.is_available   END,
                weight          = CASE WHEN (j->>'berat')    IS NOT NULL THEN (j->>'berat')::int      ELSE p.weight          END,
                length          = CASE WHEN (j->>'panjang')  IS NOT NULL THEN (j->>'panjang')::int    ELSE p.length          END,
                width           = CASE WHEN (j->>'lebar')    IS NOT NULL THEN (j->>'lebar')::int      ELSE p.width           END,
                height          = CASE WHEN (j->>'tinggi')   IS NOT NULL THEN (j->>'tinggi')::int     ELSE p.height          END,
                category        = COALESCE(j->>'kategori',  p.category),
                description     = COALESCE(j->>'deskripsi', p.description),
                video_url       = COALESCE(j->>'video',     p.video_url)
            FROM json_array_elements(CAST(:data AS json)) AS j
            WHERE p.id = j->>'id'
        """), {"data": _json.dumps(prod_rows)})

    # ── ONE SQL statement for all variants ──────────────────────────────────
    if var_rows:
        db.execute(text("""
            UPDATE product_variants AS v SET
                price          = CASE WHEN (j->>'price')    IS NOT NULL THEN (j->>'price')::float  ELSE v.price          END,
                stock          = CASE WHEN (j->>'stock')    IS NOT NULL THEN (j->>'stock')::int    ELSE v.stock          END,
                original_price = CASE WHEN (j->>'diskon') IS NOT NULL THEN NULLIF((j->>'diskon'),'0')::float
                                      ELSE v.original_price END,
                is_available   = CASE WHEN (j->>'tersedia') IS NOT NULL
                                      THEN (j->>'tersedia') NOT IN ('tidak','no','false','0')
                                      ELSE v.is_available   END
            FROM json_array_elements(CAST(:data AS json)) AS j
            WHERE v.id = j->>'id'
        """), {"data": _json.dumps(var_rows)})

    db.commit()
    return {
        "success": True,
        "updated_products": len(prod_rows),
        "updated_variants": len(var_rows),
    }
