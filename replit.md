# Indonesian Furniture E-Commerce Store

## Stack
- **Frontend**: Next.js 14 (port 5000), proxies `/api/*` and `/uploads/*` to backend
- **Backend**: FastAPI + Python (port 8000)
- **Database**: PostgreSQL (SQLAlchemy ORM, 597 seeded products)
- **Payments**: Midtrans
- **Shipping**: Biteship courier integration

## Start
```bash
bash start.sh
```

## Key Architecture

### Roles
- `buyer` — default, shop and checkout
- `seller` — **Super Admin**: full CMS dashboard access, can manage sub-admins
- `admin` — Sub-admin with granular per-menu permissions (JSON stored in `users.permissions`)

### Admin Permissions (stored as JSON array in `users.permissions`)
- `products` — Kelola Produk
- `orders` — Kelola Pesanan
- `banners` — Kelola Banner
- `settings` — Kelola Pengaturan

### Auth Helpers (backend/app/routes/auth.py)
- `is_staff(user)` — True if role is `seller` or `admin`
- `has_perm(user, perm)` — True if seller OR admin with matching permission
- `parse_permissions(user)` — Returns permission list for the user

### DB Migrations
Auto-migration runs on startup in `main.py → _run_migrations()`.
Currently migrates: `users.permissions TEXT` column.

### Stock Architecture
- Single source of truth: variant stocks sum up to `product.stock`
- `effective_stock(product)` helper in serializers computes from variants when present
- Auto-synced on create, update, and Excel import

### Variant Pricing
- `variant.price` = Harga Asli (full price, shown crossed out)
- `variant.original_price` = Harga Diskon (selling price, lower)
- Discount only applies when `original_price < price`

## Important Files
- `backend/app/main.py` — FastAPI app + startup migrations
- `backend/app/models.py` — SQLAlchemy models
- `backend/app/routes/auth.py` — JWT auth + role/permission helpers
- `backend/app/routes/admins.py` — Sub-admin CRUD (super admin only)
- `backend/app/routes/products.py` — Product CRUD + Excel export/import
- `frontend/src/app/seller/page.tsx` — CMS dashboard (1200+ lines)
- `frontend/src/app/seller/products/[slug]/page.tsx` — Product editor
- `frontend/src/components/ProductDetail.tsx` — Buyer product page
- `frontend/src/components/ProductCard.tsx` — Product card with stock/price display

## Excel Template (Sheet 2 - Varian)
Columns: Nama Produk | Nama Varian | Harga Asli | Harga Diskon | Stok | Tersedia (Ya/Tidak)
Backward compatible: imports files with old "Harga" / "Harga Coret" column names.
