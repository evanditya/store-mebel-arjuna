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
    data = rows[6:]
    products = {}
    for r in data:
        pid = str(r[0]).strip() if r[0] else None
        if not pid:
            continue
        if pid not in products:
            products[pid] = {"name": r[1], "variants": []}
        price = r[6]
        stock = r[8]
        if stock is not None:
            try:
                stock = int(stock)
            except Exception:
                stock = None
        products[pid]["variants"].append(
            {
                "var_name": r[3],
                "price": float(price) if price is not None else None,
                "stock": stock,
            }
        )
    return products


def _match_products(db_product_pairs, excel_products):
    bigram_idx = defaultdict(set)
    for pid, v in excel_products.items():
        toks = _norm(v["name"]).split()
        for i in range(len(toks) - 1):
            bigram_idx[toks[i] + " " + toks[i + 1]].add(pid)
        for t in toks:
            if len(t) >= 5:
                bigram_idx[t].add(pid)

    results = []
    for db_id, db_name in db_product_pairs:
        dn = _norm(db_name)
        toks = dn.split()
        candidates = set()
        for i in range(len(toks) - 1):
            candidates.update(bigram_idx.get(toks[i] + " " + toks[i + 1], set()))
        for t in toks:
            if len(t) >= 5:
                candidates.update(bigram_idx.get(t, set()))
        candidates = list(candidates)[:100]
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

    all_variants = db.query(ProductVariant).all()
    variants_by_product = defaultdict(list)
    for v in all_variants:
        variants_by_product[v.product_id].append(v)

    matches_raw = _match_products(db_product_pairs, excel_products)

    matched = []
    unmatched = []

    for db_id, db_name, shopee_id, shopee_name, score in matches_raw:
        if score < 0.5 or shopee_id is None:
            unmatched.append({"db_product_id": db_id, "db_product_name": db_name})
            continue

        db_prod = db_product_map[db_id]
        excel_prod = excel_products[shopee_id]
        excel_variants = excel_prod["variants"]
        db_variants = variants_by_product.get(db_id, [])

        item = {
            "db_product_id": db_id,
            "db_product_name": db_name,
            "shopee_product_id": shopee_id,
            "shopee_product_name": shopee_name,
            "match_score": score,
            "price_old": db_prod.price,
            "price_new": None,
            "stock_old": db_prod.stock,
            "stock_new": None,
            "variant_matches": [],
        }

        if db_variants:
            for dbv in db_variants:
                best_ev = None
                best_vs = 0.0
                for ev in excel_variants:
                    vs = _score(dbv.variant_name or "", ev["var_name"] or "")
                    if vs > best_vs:
                        best_vs = vs
                        best_ev = ev
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
            else:
                item["price_new"] = min(prices) if prices else None
                item["stock_new"] = sum(stocks) if stocks else None

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
    user = get_current_user(request, db)
    if not user or user.role != "seller":
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    body = await request.json()
    updates = body.get("updates", [])

    from app.models import Product, ProductVariant

    updated_products = 0
    updated_variants = 0

    for u in updates:
        db_product_id = u.get("db_product_id")
        new_price = u.get("price_new")
        new_stock = u.get("stock_new")
        variant_updates = u.get("variant_matches", [])

        prod = db.query(Product).filter(Product.id == db_product_id).first()
        if not prod:
            continue

        if new_price is not None:
            prod.price = new_price
        if new_stock is not None:
            prod.stock = new_stock
        updated_products += 1

        for vu in variant_updates:
            dbv_id = vu.get("db_variant_id")
            v_price = vu.get("price_new")
            v_stock = vu.get("stock_new")
            dbv = db.query(ProductVariant).filter(ProductVariant.id == dbv_id).first()
            if not dbv:
                continue
            if v_price is not None:
                dbv.price = v_price
            if v_stock is not None:
                dbv.stock = v_stock
            updated_variants += 1

    db.commit()
    return {
        "success": True,
        "updated_products": updated_products,
        "updated_variants": updated_variants,
    }
