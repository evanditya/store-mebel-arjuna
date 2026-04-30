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

### Variant Groups & Combinations (Seller CMS)
- Seller defines variant **groups** (e.g. Warna, Ukuran) with **values** per group
- System auto-generates cartesian product combinations (e.g. Merah/XL, Merah/L, Biru/XL, Biru/L)
- Each combination row has its own price, discount price, stock, and is_available toggle
- Stored flat in DB: `variant_type = "Warna / Ukuran"`, `variant_name = "Merah / XL"` (` / ` separator)
- Single-group variants: `variant_type = "Warna"`, `variant_name = "Merah"` (no separator, old format also supported)
- `ProductDetail` (buyer) detects multi-group format and shows per-group selection buttons
- `display_order` column on `product_variants` ensures stable ordering after save/reload

### Variant Pricing
- `variant.price` = Harga Asli (full price, shown crossed out)
- `variant.original_price` = Harga Diskon (selling price, lower)
- Discount only applies when `original_price < price`

### Shopee → Store Stock Sync (Inbox watcher)
- Watches the seller's Gmail inbox for Shopee Seller "Pesanan Telah Diterima Pembeli" emails and decrements matching DB product stock automatically
- Trigger: IMAP IDLE push (instant) on Gmail INBOX, with a 30-min fallback poll. Daemon reconnects every 28 min (Gmail closes IDLE at ~29 min). Spawned in FastAPI lifespan startup.
- Required env vars/Secrets: `IMAP_USER` (Gmail address), `IMAP_PASSWORD` (Gmail App Password). Optional: `IMAP_HOST` (default `imap.gmail.com`), `IMAP_PORT` (993), `IMAP_FOLDER` (`INBOX`). Without `IMAP_USER` the daemon is a strict no-op (logs "IMAP not configured — daemon disabled").
- Matching strategy:
  1. `ShopeeProductMapping` (manual mapping by lowercased Shopee product name → product_id + optional variant_id)
  2. Exact case-insensitive match on `Product.name`
  3. If still no match → log as `no_match` so seller can map it via UI
- Stock decrement: never below 0. If a matching variant is set, decrement `variant.stock` then re-sum into `product.stock`. If no variant, decrement `product.stock` directly.
- Idempotency: `ShopeeSyncLog.message_id` is UNIQUE; re-processing the same email is a no-op.
- Tables: `shopee_sync_log` (id, message_id UNIQUE, subject, shopee_order_no, items_json, status: success|partial|no_match|error, total_decremented, error_msg, processed_at) and `shopee_product_mapping` (id, shopee_product_name UNIQUE lowercased, product_id FK, variant_id nullable FK, created_at).
- Admin UI at Seller Dashboard → Pengaturan → "Sinkronisasi Shopee" card: shows IMAP status badge, totals (success/partial/no_match/error), Sinkron Sekarang button, recent log list, unmatched names with mapping dropdown, and existing mappings list with delete.
- Admin API: `GET/POST /api/shopee-sync/{status,run,logs,unmatched,mappings}` and `DELETE /mappings/{id}`. Auth via `get_current_user` + `is_staff`.
- Files: `backend/app/shopee_parser.py` (BeautifulSoup-based parser), `backend/app/shopee_sync.py` (sync engine + IDLE daemon), `backend/app/routes/shopee_sync.py` (admin routes).

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
