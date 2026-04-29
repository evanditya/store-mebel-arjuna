"""Admin routes for Shopee → store stock sync."""
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import (
    Product,
    ProductVariant,
    ShopeeSyncLog,
    ShopeeProductMapping,
)
from app.routes.auth import get_current_user, is_staff
from app import shopee_sync as svc
import json

router = APIRouter(prefix="/api/shopee-sync")


def _admin_or_403(request, db) -> tuple[bool, JSONResponse | None]:
    user = get_current_user(request, db)
    if not is_staff(user):
        return False, JSONResponse({"error": "Akses ditolak"}, status_code=403)
    return True, None


@router.get("/status")
async def status(request: Request, db: Session = Depends(get_db)):
    ok, err = _admin_or_403(request, db)
    if not ok:
        return err
    last_log = (
        db.query(ShopeeSyncLog)
        .order_by(ShopeeSyncLog.processed_at.desc())
        .first()
    )
    total = db.query(ShopeeSyncLog).count()
    success_count = db.query(ShopeeSyncLog).filter(ShopeeSyncLog.status == "success").count()
    no_match_count = db.query(ShopeeSyncLog).filter(ShopeeSyncLog.status == "no_match").count()
    partial_count = db.query(ShopeeSyncLog).filter(ShopeeSyncLog.status == "partial").count()
    error_count = db.query(ShopeeSyncLog).filter(ShopeeSyncLog.status == "error").count()
    return {
        "imap_configured": svc.imap_configured(),
        "daemon": svc.daemon_status(),
        "totals": {
            "all": total,
            "success": success_count,
            "partial": partial_count,
            "no_match": no_match_count,
            "error": error_count,
        },
        "last_processed_at": last_log.processed_at.isoformat() if last_log and last_log.processed_at else None,
        "last_status": last_log.status if last_log else None,
        "last_subject": last_log.subject if last_log else None,
    }


@router.post("/run")
async def run_now(request: Request, db: Session = Depends(get_db)):
    ok, err = _admin_or_403(request, db)
    if not ok:
        return err
    body = {}
    try:
        body = await request.json()
    except Exception:
        pass
    only_unseen = bool(body.get("only_unseen", True))
    result = svc.sync_inbox_once(only_unseen=only_unseen)
    return result


@router.get("/logs")
async def logs(request: Request, limit: int = 50, db: Session = Depends(get_db)):
    ok, err = _admin_or_403(request, db)
    if not ok:
        return err
    limit = max(1, min(int(limit or 50), 200))
    rows = (
        db.query(ShopeeSyncLog)
        .order_by(ShopeeSyncLog.processed_at.desc())
        .limit(limit)
        .all()
    )
    out = []
    for r in rows:
        try:
            items = json.loads(r.items_json or "[]")
        except Exception:
            items = []
        out.append({
            "id": r.id,
            "message_id": r.message_id,
            "subject": r.subject,
            "shopee_order_no": r.shopee_order_no,
            "received_at": r.received_at.isoformat() if r.received_at else None,
            "processed_at": r.processed_at.isoformat() if r.processed_at else None,
            "status": r.status,
            "items": items,
            "total_decremented": r.total_decremented,
            "error_msg": r.error_msg,
        })
    return {"logs": out}


@router.get("/unmatched")
async def unmatched(request: Request, db: Session = Depends(get_db)):
    """Distinct unmatched product names from recent logs that aren't yet mapped."""
    ok, err = _admin_or_403(request, db)
    if not ok:
        return err
    rows = (
        db.query(ShopeeSyncLog)
        .filter(ShopeeSyncLog.status.in_(["no_match", "partial"]))
        .order_by(ShopeeSyncLog.processed_at.desc())
        .limit(500)
        .all()
    )
    counts: dict[str, dict] = {}
    for r in rows:
        try:
            items = json.loads(r.items_json or "[]")
        except Exception:
            continue
        for it in items:
            if it.get("matched"):
                continue
            name = (it.get("name") or "").strip()
            if not name:
                continue
            key = name.lower()
            cur = counts.setdefault(key, {"name": name, "variant_examples": set(), "count": 0})
            cur["count"] += int(it.get("qty", 1) or 1)
            v = (it.get("variant") or "").strip()
            if v:
                cur["variant_examples"].add(v)
    # Filter out names already mapped
    mapped_lc = {
        m.shopee_product_name
        for m in db.query(ShopeeProductMapping.shopee_product_name).all()
    }
    out = []
    for k, v in counts.items():
        if k in mapped_lc:
            continue
        out.append({
            "name": v["name"],
            "variant_examples": sorted(v["variant_examples"]),
            "count": v["count"],
        })
    out.sort(key=lambda x: x["count"], reverse=True)
    return {"unmatched": out}


@router.get("/mappings")
async def list_mappings(request: Request, db: Session = Depends(get_db)):
    ok, err = _admin_or_403(request, db)
    if not ok:
        return err
    rows = (
        db.query(ShopeeProductMapping)
        .order_by(ShopeeProductMapping.created_at.desc())
        .all()
    )
    out = []
    for r in rows:
        product = db.query(Product).filter(Product.id == r.product_id).first()
        variant = (
            db.query(ProductVariant).filter(ProductVariant.id == r.variant_id).first()
            if r.variant_id else None
        )
        out.append({
            "id": r.id,
            "shopee_product_name": r.shopee_product_name,
            "shopee_variant": r.shopee_variant,
            "product_id": r.product_id,
            "product_name": product.name if product else None,
            "variant_id": r.variant_id,
            "variant_name": variant.variant_name if variant else None,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        })
    return {"mappings": out}


@router.post("/mappings")
async def upsert_mapping(request: Request, db: Session = Depends(get_db)):
    ok, err = _admin_or_403(request, db)
    if not ok:
        return err
    body = await request.json()
    shopee_name = (body.get("shopee_product_name") or body.get("shopee_name") or "").strip().lower()
    product_id = (body.get("product_id") or "").strip()
    variant_id = (body.get("variant_id") or None) or None
    shopee_variant = (body.get("shopee_variant") or "").strip() or None
    if not shopee_name or not product_id:
        return JSONResponse({"error": "shopee_product_name dan product_id wajib"}, status_code=400)
    if not db.query(Product).filter(Product.id == product_id).first():
        return JSONResponse({"error": "Produk tidak ditemukan"}, status_code=404)
    if variant_id:
        if not db.query(ProductVariant).filter(
            ProductVariant.id == variant_id,
            ProductVariant.product_id == product_id,
        ).first():
            return JSONResponse({"error": "Varian tidak ditemukan untuk produk tsb"}, status_code=404)
    existing = (
        db.query(ShopeeProductMapping)
        .filter(ShopeeProductMapping.shopee_product_name == shopee_name)
        .first()
    )
    if existing:
        existing.product_id = product_id
        existing.variant_id = variant_id
        existing.shopee_variant = shopee_variant
    else:
        existing = ShopeeProductMapping(
            shopee_product_name=shopee_name,
            shopee_variant=shopee_variant,
            product_id=product_id,
            variant_id=variant_id,
        )
        db.add(existing)
    db.commit()
    return {"success": True, "id": existing.id}


@router.post("/test-parse")
async def test_parse(request: Request, db: Session = Depends(get_db)):
    """Dry-run: parse subject + HTML and report what would be matched/decremented. No DB writes."""
    ok, err = _admin_or_403(request, db)
    if not ok:
        return err
    body = await request.json()
    subject = (body.get("subject") or "").strip()
    html = body.get("html") or ""
    if not subject or not html:
        return JSONResponse({"error": "subject dan html wajib diisi"}, status_code=400)

    from app.shopee_parser import parse_shopee_delivered_email, is_shopee_delivered_subject

    subject_ok = is_shopee_delivered_subject(subject)
    parsed = parse_shopee_delivered_email(html, subject)

    items_out = []
    for it in parsed.get("items", []):
        product, variant = svc._resolve_match(db, it["name"], it.get("variant", ""))
        items_out.append({
            "name": it["name"],
            "variant": it.get("variant", ""),
            "qty": it["qty"],
            "matched": bool(product),
            "matched_via": ("mapping/exact" if product else None),
            "product_id": product.id if product else None,
            "product_name": product.name if product else None,
            "variant_id": variant.id if variant else None,
            "variant_name": variant.variant_name if variant else None,
            "current_stock": (variant.stock if variant else (product.stock if product else None)),
        })

    return {
        "subject_matches_filter": subject_ok,
        "order_no": parsed.get("order_no"),
        "items_found": len(items_out),
        "items": items_out,
        "note": "Dry-run — tidak ada perubahan stok atau log dibuat.",
    }


@router.delete("/mappings/{mapping_id}")
async def delete_mapping(mapping_id: int, request: Request, db: Session = Depends(get_db)):
    ok, err = _admin_or_403(request, db)
    if not ok:
        return err
    m = db.query(ShopeeProductMapping).filter(ShopeeProductMapping.id == mapping_id).first()
    if not m:
        return JSONResponse({"error": "Mapping tidak ditemukan"}, status_code=404)
    db.delete(m)
    db.commit()
    return {"success": True}
