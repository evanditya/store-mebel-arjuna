from fastapi import APIRouter, Depends, Request, UploadFile, File
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app.models import Product, ProductImage, ProductVariant, gen_id
from app.routes.auth import get_current_user
import json
import os
import re
import random
import string
import io

router = APIRouter(prefix="/api")

EXCEL_COLUMNS = [
    "Nama Produk", "Harga", "Harga Coret", "Stok",
    "Berat (gram)", "Panjang (cm)", "Lebar (cm)", "Tinggi (cm)",
    "Kategori", "Deskripsi", "Video Produk", "Varian Produk",
]


def _variants_to_str(variants) -> str:
    """Encode variants as pipe-separated string: Tipe:Nama:Harga:Stok:Tersedia"""
    parts = []
    for v in variants:
        harga = str(int(v.price)) if v.price is not None else ""
        stok = str(v.stock or 0)
        tersedia = "Ya" if v.is_available else "Tidak"
        tipe = v.variant_type or ""
        nama = v.variant_name or ""
        parts.append(f"{tipe}:{nama}:{harga}:{stok}:{tersedia}")
    return " | ".join(parts)


def _str_to_variants(raw: str):
    """Decode pipe-separated variant string back into list of dicts."""
    variants = []
    if not raw or not raw.strip():
        return variants
    for part in raw.split("|"):
        part = part.strip()
        if not part:
            continue
        fields = part.split(":")
        if len(fields) < 2:
            continue
        tipe = fields[0].strip()
        nama = fields[1].strip() if len(fields) > 1 else ""
        harga_raw = fields[2].strip() if len(fields) > 2 else ""
        stok_raw = fields[3].strip() if len(fields) > 3 else "0"
        tersedia_raw = fields[4].strip().lower() if len(fields) > 4 else "ya"
        try:
            harga = float(harga_raw) if harga_raw else None
        except ValueError:
            harga = None
        try:
            stok = int(stok_raw)
        except ValueError:
            stok = 0
        is_available = tersedia_raw not in ("tidak", "no", "false", "0")
        variants.append({
            "variant_type": tipe,
            "variant_name": nama,
            "price": harga,
            "stock": stok,
            "is_available": is_available,
        })
    return variants


SELLER_CONFIG_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "seller_config.json")


def load_seller_config():
    if os.path.exists(SELLER_CONFIG_PATH):
        with open(SELLER_CONFIG_PATH, "r") as f:
            data = json.load(f)
            seller_name = data.get("seller_name", "")
            site_name = data.get("site_name") or seller_name or "Toko Online"
            return {
                "username": data.get("username", ""),
                "seller_name": seller_name,
                "site_name": site_name,
                "profile_picture": data.get("profile_picture", ""),
                "brand_colors": data.get("brand_colors", []),
                "banner": data.get("banner", ""),
                "font": data.get("font", ""),
            }
    return {"username": "seller", "seller_name": "Store", "site_name": "Toko Online", "profile_picture": "", "brand_colors": [], "banner": "", "font": ""}


def product_to_dict(product: Product) -> dict:
    desc_images = []
    if product.description_images:
        try:
            desc_images = json.loads(product.description_images)
        except Exception:
            desc_images = []
    specs = []
    if product.specifications:
        try:
            specs = json.loads(product.specifications)
        except Exception:
            specs = []
    return {
        "id": product.id,
        "name": product.name,
        "slug": product.slug,
        "price": product.price,
        "original_price": product.original_price,
        "category": product.category,
        "description": product.description,
        "description_images": desc_images,
        "specifications": specs,
        "sold_count": product.sold_count,
        "stock": product.stock,
        "rating": product.rating,
        "weight": product.weight or 500,
        "length": product.length or 10,
        "width": product.width or 10,
        "height": product.height or 10,
        "primary_image": product.primary_image,
        "video_url": product.video_url,
        "images": [{"id": img.id, "image_url": img.image_url, "display_order": img.display_order} for img in product.images],
        "variants": [
            {
                "id": v.id,
                "variant_type": v.variant_type,
                "variant_name": v.variant_name,
                "price": v.price,
                "price_modifier": v.price_modifier,
                "stock": v.stock,
                "is_available": v.is_available,
            }
            for v in product.variants
        ],
    }


def generate_slug(name: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    suffix = "".join(random.choices(string.ascii_lowercase + string.digits, k=6))
    return f"{base}-{suffix}"


def product_to_list_dict(product: Product) -> dict:
    return {
        "name": product.name,
        "slug": product.slug,
        "price": product.price,
        "original_price": product.original_price,
        "category": product.category,
        "sold_count": product.sold_count,
        "stock": product.stock,
        "rating": product.rating,
        "primary_image": product.primary_image,
        "variants": [
            {
                "variant_type": v.variant_type,
                "variant_name": v.variant_name,
                "price": v.price,
                "price_modifier": v.price_modifier,
                "stock": v.stock,
                "is_available": v.is_available,
            }
            for v in product.variants
        ],
    }


@router.get("/products")
async def list_products(
    category: str = None,
    search: str = None,
    page: int = 1,
    limit: int = 20,
    db: Session = Depends(get_db),
):
    query = db.query(Product).options(joinedload(Product.variants))
    if category:
        query = query.filter(Product.category == category)
    if search:
        query = query.filter(Product.name.ilike(f"%{search}%"))
    total = query.count()
    page = max(1, page)
    limit = max(1, min(limit, 100))
    products = query.offset((page - 1) * limit).limit(limit).all()
    seller = load_seller_config()
    return {
        "products": [product_to_list_dict(p) for p in products],
        "seller": seller,
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": max(1, (total + limit - 1) // limit),
    }


@router.get("/categories")
async def list_categories(db: Session = Depends(get_db)):
    from sqlalchemy import distinct as sql_distinct
    cats = db.query(sql_distinct(Product.category)).filter(Product.category.isnot(None)).all()
    return {"categories": sorted([c[0] for c in cats if c[0]])}


def _get_purchaseable_variants(variants):
    """Return only the variants a buyer actually selects (combinations if present, else all non-combo)."""
    combos = [v for v in variants if v.variant_type == "_combinations"]
    if combos:
        return combos
    return [v for v in variants if v.variant_type != "_combinations"]


def _apply_sheet_style(ws, header_cols, col_widths):
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    header_font = Font(bold=True, color="FFFFFF", size=11)
    header_fill = PatternFill("solid", fgColor="1F2937")
    center = Alignment(horizontal="center", vertical="center", wrap_text=True)
    thin = Side(style="thin", color="D1D5DB")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)
    for col_idx, (col_name, width) in enumerate(zip(header_cols, col_widths), start=1):
        cell = ws.cell(row=1, column=col_idx, value=col_name)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = center
        cell.border = border
        ws.column_dimensions[cell.column_letter].width = width
    ws.row_dimensions[1].height = 25
    return border, Alignment(horizontal="left", vertical="top", wrap_text=True)


@router.get("/products/export-excel")
async def export_products_excel(request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    if not user or user.role != "seller":
        return JSONResponse({"error": "Akses ditolak"}, status_code=403)

    from openpyxl import Workbook

    products = db.query(Product).options(joinedload(Product.variants)).order_by(Product.name).all()

    wb = Workbook()

    # ── Sheet 1: Product info ────────────────────────────────────────────────
    ws1 = wb.active
    ws1.title = "Produk"
    prod_cols = ["Nama Produk", "Harga", "Harga Coret", "Stok (tanpa varian)",
                 "Berat (gram)", "Panjang (cm)", "Lebar (cm)", "Tinggi (cm)",
                 "Kategori", "Deskripsi", "Video Produk"]
    prod_widths = [42, 16, 16, 18, 13, 13, 13, 13, 22, 55, 35]
    border1, left1 = _apply_sheet_style(ws1, prod_cols, prod_widths)

    for row_idx, p in enumerate(products, start=2):
        display_variants = _get_purchaseable_variants(p.variants)
        # For products WITH variants, stock is managed per-variant in Sheet 2
        stok_cell = "" if display_variants else (p.stock or 0)
        row = [p.name, int(p.price),
               int(p.original_price) if p.original_price else "",
               stok_cell,
               p.weight or 500, p.length or 10, p.width or 10, p.height or 10,
               p.category or "", p.description or "", p.video_url or ""]
        for col_idx, value in enumerate(row, start=1):
            cell = ws1.cell(row=row_idx, column=col_idx, value=value)
            cell.border = border1
            cell.alignment = left1
            if col_idx in (2, 3):
                cell.number_format = '#,##0'
        ws1.row_dimensions[row_idx].height = 18

    # ── Sheet 2: Variants (one row per purchaseable variant) ─────────────────
    ws2 = wb.create_sheet(title="Varian")
    var_cols = ["Nama Produk", "Nama Varian", "Harga", "Stok", "Tersedia (Ya/Tidak)"]
    var_widths = [42, 45, 16, 10, 18]
    border2, left2 = _apply_sheet_style(ws2, var_cols, var_widths)

    row_idx = 2
    for p in products:
        display_variants = _get_purchaseable_variants(p.variants)
        for v in display_variants:
            display_name = v.variant_name  # e.g. "divan dan sandaran / 120x200" or "Merah"
            row = [p.name, display_name,
                   int(v.price) if v.price is not None else int(p.price),
                   v.stock or 0,
                   "Ya" if v.is_available else "Tidak"]
            for col_idx, value in enumerate(row, start=1):
                cell = ws2.cell(row=row_idx, column=col_idx, value=value)
                cell.border = border2
                cell.alignment = left2
                if col_idx == 3:
                    cell.number_format = '#,##0'
            ws2.row_dimensions[row_idx].height = 18
            row_idx += 1

    stream = io.BytesIO()
    wb.save(stream)
    stream.seek(0)
    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=produk.xlsx"},
    )


@router.post("/products/import-excel")
async def import_products_excel(request: Request, file: UploadFile = File(...), db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    if not user or user.role != "seller":
        return JSONResponse({"error": "Akses ditolak"}, status_code=403)

    if not file.filename.endswith((".xlsx", ".xls")):
        return JSONResponse({"error": "File harus berformat .xlsx"}, status_code=400)

    from openpyxl import load_workbook

    content = await file.read()
    try:
        wb = load_workbook(filename=io.BytesIO(content), data_only=True)
    except Exception as e:
        return JSONResponse({"error": f"File Excel tidak valid: {e}"}, status_code=400)

    def _get_col(header_row):
        return {str(h).strip() if h is not None else "": idx for idx, h in enumerate(header_row)}

    def _cell(row, col_map, name):
        idx = col_map.get(name)
        if idx is None:
            return None
        return row[idx] if idx < len(row) else None

    def _parse_num(val):
        if val is None:
            return None
        s = str(val).replace(",", "").replace(".", "").strip() if isinstance(val, str) else str(val)
        try:
            return float(s)
        except (ValueError, TypeError):
            return None

    total_prod = 0
    updated_prod = 0
    total_var = 0
    updated_var = 0
    not_found = []
    errors = []

    # ── Sheet 1: Product info ────────────────────────────────────────────────
    ws1 = wb.active
    rows1 = list(ws1.iter_rows(values_only=True))
    if rows1:
        col1 = _get_col(rows1[0])
        if "Nama Produk" not in col1:
            return JSONResponse({"error": "Sheet 'Produk': kolom 'Nama Produk' tidak ditemukan"}, status_code=400)

        for row_num, row in enumerate(rows1[1:], start=2):
            nama = str(_cell(row, col1, "Nama Produk") or "").strip()
            if not nama:
                continue
            total_prod += 1
            product = db.query(Product).filter(Product.name == nama).first()
            if not product:
                not_found.append(nama)
                continue
            try:
                harga = _parse_num(_cell(row, col1, "Harga"))
                if harga is not None:
                    product.price = harga

                harga_coret_raw = _cell(row, col1, "Harga Coret")
                if harga_coret_raw is not None and str(harga_coret_raw).strip() != "":
                    hc = _parse_num(harga_coret_raw)
                    product.original_price = hc if hc and hc > 0 else None
                elif harga_coret_raw is not None:
                    product.original_price = None

                stok_raw = _cell(row, col1, "Stok (tanpa varian)")
                if stok_raw is not None and str(stok_raw).strip() not in ("", "-"):
                    try:
                        product.stock = int(float(str(stok_raw).strip()))
                    except (ValueError, TypeError):
                        pass

                for attr, col_name in [("weight", "Berat (gram)"), ("length", "Panjang (cm)"),
                                        ("width", "Lebar (cm)"), ("height", "Tinggi (cm)")]:
                    val = _cell(row, col1, col_name)
                    if val is not None and str(val).strip() != "":
                        try:
                            setattr(product, attr, int(float(str(val).strip())))
                        except (ValueError, TypeError):
                            pass

                for attr, col_name in [("category", "Kategori"), ("description", "Deskripsi"), ("video_url", "Video Produk")]:
                    val = _cell(row, col1, col_name)
                    if val is not None:
                        setattr(product, attr, str(val).strip() or None)

                db.commit()
                updated_prod += 1
            except Exception as e:
                db.rollback()
                errors.append({"sheet": "Produk", "row": row_num, "name": nama, "error": str(e)})

    # ── Sheet 2: Variants ────────────────────────────────────────────────────
    ws2 = wb["Varian"] if "Varian" in wb.sheetnames else None
    if ws2 is not None:
        rows2 = list(ws2.iter_rows(values_only=True))
        if rows2:
            col2 = _get_col(rows2[0])
            for row_num, row in enumerate(rows2[1:], start=2):
                nama = str(_cell(row, col2, "Nama Produk") or "").strip()
                nama_varian = str(_cell(row, col2, "Nama Varian") or "").strip()
                if not nama or not nama_varian:
                    continue
                total_var += 1
                product = db.query(Product).filter(Product.name == nama).first()
                if not product:
                    if nama not in not_found:
                        not_found.append(nama)
                    continue
                variant = next((v for v in product.variants if v.variant_name == nama_varian), None)
                if not variant:
                    errors.append({"sheet": "Varian", "row": row_num, "name": f"{nama} → {nama_varian}", "error": "Nama varian tidak ditemukan"})
                    continue
                try:
                    harga = _parse_num(_cell(row, col2, "Harga"))
                    if harga is not None:
                        variant.price = harga

                    stok_raw = _cell(row, col2, "Stok")
                    if stok_raw is not None and str(stok_raw).strip() != "":
                        try:
                            variant.stock = int(float(str(stok_raw).strip()))
                        except (ValueError, TypeError):
                            pass

                    tersedia_raw = str(_cell(row, col2, "Tersedia (Ya/Tidak)") or "").strip().lower()
                    if tersedia_raw:
                        variant.is_available = tersedia_raw not in ("tidak", "no", "false", "0")

                    db.commit()
                    updated_var += 1
                except Exception as e:
                    db.rollback()
                    errors.append({"sheet": "Varian", "row": row_num, "name": f"{nama} → {nama_varian}", "error": str(e)})

    return {
        "total": total_prod + total_var,
        "updated": updated_prod + updated_var,
        "detail": {
            "produk_diperbarui": updated_prod,
            "varian_diperbarui": updated_var,
        },
        "not_found": not_found,
        "not_found_count": len(not_found),
        "errors": [{"row": e.get("row", "?"), "name": e["name"], "error": e["error"]} for e in errors],
        "error_count": len(errors),
    }


@router.get("/products/{slug}")
async def get_product(slug: str, db: Session = Depends(get_db)):
    product = db.query(Product).options(
        joinedload(Product.images),
        joinedload(Product.variants)
    ).filter(Product.slug == slug).first()
    if not product:
        return JSONResponse({"error": "Produk tidak ditemukan"}, status_code=404)
    return {"product": product_to_dict(product)}


@router.post("/products")
async def create_product(request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    if not user or user.role != "seller":
        return JSONResponse({"error": "Akses ditolak"}, status_code=403)
    body = await request.json()
    slug = generate_slug(body.get("name", "product"))
    product = Product(
        id=gen_id(),
        name=body.get("name", ""),
        slug=slug,
        price=body.get("price", 0),
        original_price=body.get("original_price"),
        category=body.get("category"),
        description=body.get("description"),
        sold_count=body.get("sold_count", 0),
        stock=body.get("stock", 0),
        rating=body.get("rating", 0),
        weight=body.get("weight", 500),
        length=body.get("length", 10),
        width=body.get("width", 10),
        height=body.get("height", 10),
        primary_image=body.get("primary_image"),
        video_url=body.get("video_url"),
    )
    db.add(product)
    for img in body.get("images", []):
        db.add(ProductImage(id=gen_id(), product_id=product.id, image_url=img.get("image_url", img if isinstance(img, str) else ""), display_order=img.get("display_order", 0) if isinstance(img, dict) else 0))
    for v in body.get("variants", []):
        db.add(ProductVariant(
            id=gen_id(), product_id=product.id,
            variant_type=v.get("variant_type"), variant_name=v.get("variant_name", ""),
            price=v.get("price"), price_modifier=v.get("price_modifier", 0),
            stock=v.get("stock", 0), is_available=v.get("is_available", True),
        ))
    db.commit()
    db.refresh(product)
    return {"product": product_to_dict(product)}


@router.put("/products/{slug}")
async def update_product(slug: str, request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    if not user or user.role != "seller":
        return JSONResponse({"error": "Akses ditolak"}, status_code=403)
    product = db.query(Product).filter(Product.slug == slug).first()
    if not product:
        return JSONResponse({"error": "Produk tidak ditemukan"}, status_code=404)
    body = await request.json()
    for field in ["name", "price", "original_price", "category", "description", "stock", "rating", "weight", "length", "width", "height", "primary_image", "video_url", "sold_count"]:
        if field in body:
            setattr(product, field, body[field])

    if "variants" in body:
        db.query(ProductVariant).filter(ProductVariant.product_id == product.id).delete()
        for v in body["variants"]:
            db.add(ProductVariant(
                id=gen_id(), product_id=product.id,
                variant_type=v.get("variant_type", ""),
                variant_name=v.get("variant_name", ""),
                price=v.get("price"),
                price_modifier=v.get("price_modifier", 0),
                stock=v.get("stock", 0),
                is_available=v.get("is_available", True),
            ))

    db.commit()
    db.refresh(product)
    return {"product": product_to_dict(product)}


@router.get("/categories")
async def list_categories(db: Session = Depends(get_db)):
    products = db.query(Product.category).distinct().all()
    categories = sorted([p[0] for p in products if p[0]])
    return {"categories": categories}


@router.delete("/products/{slug}")
async def delete_product(slug: str, request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    if not user or user.role != "seller":
        return JSONResponse({"error": "Akses ditolak"}, status_code=403)
    product = db.query(Product).filter(Product.slug == slug).first()
    if not product:
        return JSONResponse({"error": "Produk tidak ditemukan"}, status_code=404)
    db.delete(product)
    db.commit()
    return {"success": True}

    parts = []
    for v in variants:
        harga = str(int(v.price)) if v.price is not None else ""
