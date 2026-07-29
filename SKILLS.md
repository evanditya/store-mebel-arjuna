# SKILLS.md — Mebel Arjuna Store task playbooks

Use these skills when working in this repo. Always respect [AGENTS.md](AGENTS.md) hard rules first.

---

## Skill: Buyer catalog / product UX

**When:** Changing homepage, product cards, detail modal, search, categories, or variant selection for buyers.

### Steps

1. Pages: `frontend/src/app/page.tsx` (catalog), components `ProductCard.tsx`, `ProductDetail.tsx`, `BannerSlider.tsx`.
2. Data via relative `fetch("/api/...")` (Next rewrites to FastAPI). Prefer existing serializers in `backend/app/routes/products.py` (`product_dict`, `effective_stock`).
3. Preserve Indonesian formatting: IDR prices, “RB+” sold counts.
4. Variant UI must support single-group and multi-group (` / ` in `variant_name`).
5. Pricing display: show `original_price` as selling when lower than `price`; strike through `price` as Harga Asli.

### Checklist

- [ ] Stock shown matches sum of available variants
- [ ] Works on mobile + desktop
- [ ] Branding CSS vars / favicon still apply (`FaviconUpdater`, `/api/branding`)

---

## Skill: Cart, checkout, orders

**When:** Cart qty, checkout address, pickup vs ship, order history, status emails.

### Steps

1. Frontend: `cart/page.tsx`, `checkout/page.tsx`, `orders/page.tsx`.
2. Backend: `routes/cart.py`, `routes/orders.py`, emails in `email.py`.
3. Delivery modes:
   - **Kirim ke Alamat** → Biteship rates (`routes/shipping.py`) then create order
   - **Ambil di Toko** → pickup hours from `seller_config.json` / branding
4. Order status changes that notify buyers go through `orders.py` email triggers — keep snapshot-then-background-thread pattern.
5. Buyer order detail must show pickup info for relevant statuses (not only `ready_pickup`).

### Checklist

- [ ] Auth required for cart/orders owned by current user
- [ ] Status transitions remain consistent with CMS order filters
- [ ] Emails still branded with store name from config

---

## Skill: OttoPay payment

**When:** Payment session, redirect, webhook, paid status bugs.

### Steps

1. Implement only against **OttoPay** (`routes/payment.py`). Do not switch to Midtrans unless asked.
2. Flow: `POST /api/payment/token` → redirect to OttoPay Secure Page (`endpointUrl`) → webhook `POST /api/payment/notification`.
3. Persist gateway id in `Order.midtrans_order_id` (legacy column name).
4. Env: `OTTOPAY_MERCHANT_ID`, `OTTOPAY_API_KEY`, `OTTOPAY_IS_PRODUCTION`.
5. Reference: `attached_assets/OTTOPAY_API_DOCUMENTATION_*.md` if present.
6. Register webhook URL `https://<domain>/api/payment/notification` in OttoPay dashboard.

### Checklist

- [ ] Sandbox vs production flag matches keys
- [ ] Webhook updates order to paid and triggers payment-success email
- [ ] No new Midtrans SDK/env vars introduced by accident

---

## Skill: Biteship shipping

**When:** Area search, rates blank, waybill, tracking, courier allowlist, warehouse origin.

### Steps

1. API: `backend/app/routes/shipping.py`.
2. Seller settings store origin + allowed couriers in `seller_config.json` (via branding/settings UI in `seller/page.tsx`).
3. Requires `BITESHIP_API_KEY`; without it, rates should fail gracefully.
4. Typical endpoints: area search, rates, create shipment, track, label.
5. Couriers commonly toggled: JNE, SiCepat, J&T, AnterAja, TIKI, Ninja, ID Express, POS, Grab, GoSend.

### Checklist

- [ ] Origin address set before expecting rates
- [ ] Allowed courier list honored
- [ ] Tracking visible on buyer orders + seller order detail

---

## Skill: Seller CMS / product editor

**When:** Products tab, order fulfillment UI, settings, banners, Kelola Admin, product create/edit.

### Steps

1. Main dashboard: `frontend/src/app/seller/page.tsx` (large file — edit carefully, prefer surgical changes).
2. Product editor: `frontend/src/app/seller/products/[slug]/page.tsx` (images, variant groups, combinations).
3. Backend gates: `is_staff` + `has_perm(user, "products"|"orders"|"banners"|"settings")`.
4. Super-admin-only admin CRUD: `routes/admins.py` + Kelola Admin tab (`role === "seller"`).
5. Banner reorder: `routes/banners.py` + `BannerCropper.tsx`.
6. Tabs for sub-admins must hide **and** APIs must 403 without permission.

### Checklist

- [ ] New CMS actions check the correct permission server-side
- [ ] Variant combinations still regenerate / save with `display_order`
- [ ] `sync_product_stock` runs after stock edits

---

## Skill: Excel import / export

**When:** Catalog bulk update, column mapping, preview/apply, stock drift from Excel.

### Steps

1. Export: products routes / openpyxl helpers in `routes/products.py`.
2. Import: `routes/excel_import.py` — preview diff then selective apply.
3. Sheet 1 **Produk**, Sheet 2 **Varian**. Accept both:
   - New: `Harga Asli` / `Harga Diskon`
   - Old: `Harga` / `Harga Coret`
4. After apply, recompute product stock from variants.
5. Keep technical ID columns hidden by default on export.

### Checklist

- [ ] Preview does not mutate DB until apply
- [ ] Backward-compatible headers still work
- [ ] Variant rows attach to correct product by name/slug rules already in code

---

## Skill: Shopee IMAP stock sync

**When:** Stock not decrementing after Shopee delivery emails, mapping unmatched products, daemon issues.

### Steps

1. Engine: `backend/app/shopee_sync.py` + parser `shopee_parser.py`.
2. Admin API: `routes/shopee_sync.py` — status, run, logs, unmatched, mappings.
3. Matching order: `ShopeeProductMapping` → exact case-insensitive product name → `no_match`.
4. Idempotent on `ShopeeSyncLog.message_id` UNIQUE.
5. Without `IMAP_USER`, daemon must stay disabled (log + no-op).
6. UI: seller Settings → Sinkronisasi Shopee.

### Checklist

- [ ] Never decrement below zero
- [ ] Variant decrement re-sums into `product.stock`
- [ ] Duplicate emails do not double-apply
- [ ] Gmail App Password documented (not regular password)

---

## Skill: Daily report / CS search

**When:** `/report-harian` stats, PIN, email schedule, or `/cs-search` CS tooling.

### Daily report

1. Page: `frontend/src/app/report-harian/page.tsx`.
2. Backend: `daily_report.py` + `routes/report.py` (`verify-pin`, `config`, `stats`, `send-now`).
3. Auth: PIN → `X-Report-Token` (in-memory, 1h). Default PIN `admin1234` / `REPORT_PIN`.
4. Scheduler ~23:00 WIB via stdlib timezone (+7), checks every 60s.
5. Config (recipient, auto-send) lives with other settings in `seller_config.json`.

### CS search

1. Page: `frontend/src/app/cs-search/page.tsx` — **no login**.
2. Debounced search; show per-variant price + stock colour coding (habis / low / ok).
3. Do not expose destructive mutations from this page.

### Checklist

- [ ] Report pages remain unlinked from main nav unless product asks otherwise
- [ ] PIN change persists and old sessions expire
- [ ] CS search stays read-only

---

## Skill: Branding & store config

**When:** Site name, colors, Google Font, favicon, pickup hours, tagline/address/phone.

### Steps

1. API: `routes/branding.py`; file: `backend/seller_config.json`.
2. Frontend applies primary colour / font from branding GET; favicon via `FaviconUpdater` + `/api/favicon` if used.
3. Prefer updating config through existing branding endpoints, not hand-editing JSON in production without backup.
4. Branding GET may fall back to seller user `phone` / `address` when keys missing.

### Checklist

- [ ] Public pages reflect new colours/font after refresh
- [ ] Pickup schedule shown in checkout + order emails when enabled

---

## Skill: Schema migration (store DB)

**When:** Adding columns/tables on this store’s PostgreSQL.

### Steps

1. Edit `backend/app/models.py`.
2. Add idempotent SQL in `_run_migrations()` inside `backend/app/main.py` (`ADD COLUMN IF NOT EXISTS` style / inspect-then-alter like existing code).
3. `Base.metadata.create_all` runs on startup — still add explicit migrations for existing DBs.
4. Do not introduce Alembic unless explicitly requested.

### Checklist

- [ ] Migration safe to run twice
- [ ] Serializers / frontend types updated for new fields
- [ ] Seed updated if new required data must exist on fresh installs

---

## Skill: Local run / self-host deploy

**When:** Bootstrapping, Replit run, or Ubuntu/Nginx production.

### Local / Replit

```bash
bash start.sh
# Backend :8000, frontend :5000; seed if products empty
```

### Production (Replit deploy path)

```bash
# build: pip + cd frontend && npm install && npm run build
bash start.prod.sh
```

### Self-host

Follow `technical-spec-deployment.md` for Nginx + systemd + PostgreSQL. **Override Midtrans sections**: use OttoPay env vars from `.env.example` and webhook `/api/payment/notification`.

### Checklist

- [ ] `DATABASE_URL` and `JWT_SECRET` set
- [ ] CORS / `FRONTEND_URL` covers the public origin
- [ ] OttoPay + Biteship secrets match environment (sandbox vs live)
- [ ] Uploads directory writable (`backend/uploads/`)

---

## Skill: Instance vs template (marketplace-forge)

**When:** Deciding whether a fix belongs here or in the shared blueprint.

### Steps

1. **This repo** (`store-mebel-arjuna/`): live customer store — fix production bugs and store-specific behaviour here.
2. **Template** (`marketplace-forge/templates/nextjs-store/`): only when the user wants every future store to inherit the change.
3. Do not edit `marketplace-forge` platform scrape/UI unless that is the explicit task.
4. If promoting a fix upstream, note OttoPay divergence — forge docs may still mention Midtrans.

### Checklist

- [ ] Clear whether change is instance-only or template-wide
- [ ] No accidental edits to forge `client/` / RQ scrape pipeline

---

## Quick decision tree

```
Buyer catalog / PDP / banners?           → Skill: Buyer catalog / product UX
Cart / checkout / order emails?          → Skill: Cart, checkout, orders
Payment redirect / webhook?              → Skill: OttoPay payment
Rates / waybill / tracking blank?        → Skill: Biteship shipping
Seller dashboard / product editor?       → Skill: Seller CMS / product editor
Bulk Excel catalog?                      → Skill: Excel import / export
Shopee stock / IMAP / mappings?          → Skill: Shopee IMAP stock sync
Report PIN / CS search?                  → Skill: Daily report / CS search
Colors / font / favicon / pickup hours?  → Skill: Branding & store config
New DB column/table?                     → Skill: Schema migration (store DB)
How do I run / deploy?                   → Skill: Local run / self-host deploy
Fix here or in marketplace-forge?        → Skill: Instance vs template
```
