# Indonesian Furniture E-Commerce Store

## Stack
- **Frontend**: Next.js 14 (port 5000), proxies `/api/*` and `/uploads/*` to backend
- **Backend**: FastAPI + Python (port 8000)
- **Database**: PostgreSQL (SQLAlchemy ORM, 600+ seeded products)
- **Payments**: Midtrans
- **Shipping**: Biteship courier integration

## Start
```bash
bash start.sh
```

---

## Features Overview

### Buyer-Facing
- Product catalog with search, category filter, and pagination
- Product detail page: image gallery, description, specifications, video
- Variant selection (single & multi-group): per-variant price, discount, stock
- Cart management (add, update quantity, remove)
- Checkout: shipping address, courier selection (Biteship rates), store pickup option
- Payment via Midtrans (redirect to payment page)
- Order history page with full order detail, status tracking, and pickup info
- User registration, login, change password
- Responsive design with customisable brand colours and Google Font

### Seller CMS Dashboard (`/seller`)
- **Products tab**: product list with search, category filter chips, inline stock toggle (aktif/nonaktif), delete, paginated
- **Orders tab**: order list with filter tabs (Semua / Belum Diproses / Siap Diambil-Dikirim / Selesai / Dibatalkan), order detail, status updates, shipping tracking
- **Settings tab**: store profile (name, tagline, description, address, phone, WhatsApp), brand colour, Google Font, favicon upload, banner management (drag-to-reorder), courier settings, store pickup schedule, Shopee sync panel
- **Kelola Admin tab** (super admin only): create/edit/delete sub-admins with granular permissions

### Product Management
- Full CRUD for products: name, slug, category, price, discount price, description, images (multi-upload), video, weight/dimensions, specifications
- Variant groups & combinations: define groups (e.g. Warna, Ukuran), system auto-generates cartesian combinations
- Per-variant: price, discount price, stock, is_available toggle
- `display_order` column ensures stable variant ordering
- Excel export (all products + variants) with technical columns hidden by default
- Excel import with fuzzy matching, preview diff, selective apply, backward-compatible column names

### Order & Email Flow
- Order confirmation email (pending) — includes store address & phone
- Payment success email (paid) — includes store pickup schedule
- Processing email, ready-for-pickup email (includes full pickup schedule), shipped email, completed email
- All emails use branded HTML template with store name

### Store Pickup
- Configurable pickup days and hours in seller settings
- Info shown in order emails for all relevant statuses
- Pickup info displayed on buyer orders page for all order statuses (not just ready_pickup)

### Shopee → Store Stock Sync
- Watches Gmail inbox via IMAP IDLE for Shopee "Pesanan Telah Diterima Pembeli" emails
- Decrements matching product/variant stock automatically
- Matching: manual `ShopeeProductMapping` table → exact name match → log as `no_match`
- Idempotent: `ShopeeSyncLog.message_id` UNIQUE prevents double-processing
- Admin UI in Settings → Sinkronisasi Shopee: status badge, log list, unmatched items with mapping dropdown
- Required secrets: `IMAP_USER`, `IMAP_PASSWORD`. No-op if not configured.

### Daily Report (`/report-harian`)
- Hidden page (no link from anywhere) protected by PIN gate
- Default PIN: `admin1234` — change immediately after first login
- PIN stored as SHA-256 hash in `seller_config.json`; session token valid 1 hour
- Shows today's stats: total orders, confirmed revenue (paid/processing/ready_pickup/shipped/completed), per-status breakdown, full order list
- "Kirim Sekarang" button sends report email immediately
- Configurable recipient email + toggle for automatic sending
- Scheduler sends report email every day at 23:00 WIB (background thread, checks every 60s)
- Email: branded HTML with stat cards, status breakdown table, up to 30 latest orders

### CS Product Search (`/cs-search`)
- No login required — accessible to CS agents directly
- Debounced search (300ms) across all products
- Each result auto-fetches full product detail including all variants
- Shows per-variant: name, selling price, original price (crossed out), stock (colour-coded), active status
- Stock colour coding: 🔴 Habis (0) / 🟡 Stok 1–5 / 🟢 Stok > 5
- Single-group variants shown as card grid; multi-group combinations shown as table

### Branding & Customisation
- Seller can set: site name, tagline, description, primary colour, Google Font, favicon
- `seller_config.json` is the source of truth; synced from DB user profile on update
- Branding GET falls back to DB `user.phone`/`user.address` when config keys are absent
- `FaviconUpdater` component dynamically updates browser tab favicon

---

## Key Architecture

### Roles
- `buyer` — default, shop and checkout
- `seller` — **Super Admin**: full CMS dashboard, manages sub-admins
- `admin` — Sub-admin with granular per-menu permissions (JSON in `users.permissions`)

### Admin Permissions (JSON array in `users.permissions`)
- `products` — Kelola Produk
- `orders` — Kelola Pesanan
- `banners` — Kelola Banner
- `settings` — Kelola Pengaturan

### Auth Helpers (`backend/app/routes/auth.py`)
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

### Variant Groups & Combinations
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

### Shopee Sync (detail)
- Trigger: IMAP IDLE push (instant) on Gmail INBOX, 30-min fallback poll. Daemon reconnects every 28 min (Gmail closes IDLE at ~29 min). Spawned in FastAPI lifespan startup.
- Tables: `shopee_sync_log` (id, message_id UNIQUE, subject, shopee_order_no, items_json, status, total_decremented, error_msg, processed_at), `shopee_product_mapping` (id, shopee_product_name UNIQUE lowercased, product_id FK, variant_id nullable FK, created_at)
- API: `GET/POST /api/shopee-sync/{status,run,logs,unmatched,mappings}`, `DELETE /mappings/{id}`

### Daily Report (detail)
- `backend/app/daily_report.py`: stats aggregation, PIN/token helpers, background scheduler thread
- `backend/app/routes/report.py`: `/api/report/{verify-pin,config,stats,send-now}`
- Token auth via `X-Report-Token` header; in-memory dict with 1-hour TTL
- WIB = `timezone(timedelta(hours=7))` (no pytz — uses stdlib datetime)
- Scheduler: checks every 60s; sends when hour==23 and minute<5 and not already sent today

---

## Important Files

### Backend
| File | Purpose |
|------|---------|
| `backend/app/main.py` | FastAPI app, startup migrations, lifespan (Shopee daemon + daily report scheduler) |
| `backend/app/models.py` | SQLAlchemy models: User, Product, ProductVariant, ProductImage, Order, OrderItem, Cart, Banner, ShopeeSync*, Category |
| `backend/app/email.py` | All transactional emails + `send_daily_report_email()` |
| `backend/app/daily_report.py` | Daily report stats, scheduler, PIN/token management |
| `backend/app/shopee_sync.py` | Shopee stock sync engine + IMAP IDLE daemon |
| `backend/app/shopee_parser.py` | BeautifulSoup parser for Shopee seller emails |
| `backend/app/routes/auth.py` | JWT auth, register/login, role/permission helpers, profile update |
| `backend/app/routes/products.py` | Product CRUD, Excel export/import, category list |
| `backend/app/routes/orders.py` | Order CRUD, status updates, email triggers |
| `backend/app/routes/payment.py` | Midtrans payment integration |
| `backend/app/routes/shipping.py` | Biteship rate lookup, order tracking |
| `backend/app/routes/branding.py` | Store branding config read/write |
| `backend/app/routes/report.py` | Daily report API (PIN verify, config, stats, send-now) |
| `backend/app/routes/admins.py` | Sub-admin CRUD (super admin only) |
| `backend/app/routes/banners.py` | Banner CRUD + drag-reorder |
| `backend/app/routes/shopee_sync.py` | Shopee sync admin API |
| `backend/app/routes/excel_import.py` | Excel import preview + apply |
| `backend/seller_config.json` | Store config: name, colours, font, pickup schedule, report settings |

### Frontend
| File | Purpose |
|------|---------|
| `frontend/src/app/page.tsx` | Homepage: banner slider, product grid, category filter |
| `frontend/src/app/seller/page.tsx` | CMS dashboard: products, orders, settings, admins (~2200 lines) |
| `frontend/src/app/seller/products/[slug]/page.tsx` | Product editor: images, variants, combinations |
| `frontend/src/app/orders/page.tsx` | Buyer order history + detail (all statuses, pickup info) |
| `frontend/src/app/checkout/page.tsx` | Checkout: address, courier, pickup, payment |
| `frontend/src/app/cart/page.tsx` | Cart page |
| `frontend/src/app/cs-search/page.tsx` | CS product search (no auth, full variant + stock detail) |
| `frontend/src/app/report-harian/page.tsx` | Daily report dashboard (PIN-protected) |
| `frontend/src/components/ProductDetail.tsx` | Buyer product detail page with variant selection |
| `frontend/src/components/ProductCard.tsx` | Product card with correct variant price/stock display |
| `frontend/src/components/Navbar.tsx` | Navigation bar |
| `frontend/src/components/BannerSlider.tsx` | Homepage banner carousel |
| `frontend/src/components/BannerCropper.tsx` | Banner image crop tool in CMS |

---

## Excel Template

**Sheet 1 (Produk):** Nama | Slug | Kategori | Harga | Harga Diskon | Stok | Berat | Panjang | Lebar | Tinggi | Deskripsi | Video | Aktif
*(technical ID columns hidden by default)*

**Sheet 2 (Varian):** Nama Produk | Nama Varian | Harga Asli | Harga Diskon | Stok | Tersedia (Ya/Tidak)
Backward compatible: imports files with old "Harga" / "Harga Coret" column names.

---

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `SECRET_KEY` | ✅ | JWT signing key |
| `EMAIL_HOST` | ✅ | SMTP host (e.g. smtp.gmail.com) |
| `EMAIL_PORT` | ✅ | SMTP port (usually 587) |
| `EMAIL_USER` | ✅ | SMTP username / sender address |
| `EMAIL_PASSWORD` | ✅ | SMTP password or Gmail App Password |
| `EMAIL_FROM_NAME` | — | Display name for sent emails |
| `MIDTRANS_SERVER_KEY` | ✅ | Midtrans server key |
| `MIDTRANS_CLIENT_KEY` | ✅ | Midtrans client key |
| `MIDTRANS_IS_PRODUCTION` | — | `true` for live payments (default: false) |
| `BITESHIP_API_KEY` | — | Biteship API key for shipping rates |
| `IMAP_USER` | — | Gmail address for Shopee sync |
| `IMAP_PASSWORD` | — | Gmail App Password for Shopee sync |
| `IMAP_HOST` | — | IMAP host (default: imap.gmail.com) |
| `IMAP_PORT` | — | IMAP port (default: 993) |
| `REPORT_PIN` | — | Default PIN for /report-harian (default: admin1234) |

---

## Special Pages (no nav links)

| URL | Auth | Purpose |
|-----|------|---------|
| `/cs-search` | None | CS agent product search with full variant + stock data |
| `/report-harian` | PIN gate | Daily transaction report + email scheduler config |
| `/laporan-pengerjaan.html` | None | Developer work summary document |
