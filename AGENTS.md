# AGENTS.md — Mebel Arjuna Store

Guidance for AI agents working in this repository. Read this before making changes. For task playbooks, see [SKILLS.md](SKILLS.md). Architecture notes: [replit.md](replit.md). Self-host deploy: [technical-spec-deployment.md](technical-spec-deployment.md).

## What this project is

**Mebel Arjuna** is a generated Indonesian furniture e-commerce store: buyer shop + seller CMS + multi-admin RBAC + OttoPay payments + Biteship shipping + Shopee IMAP stock sync + daily sales report.

This repo is a **customer store instance**, not the STM platform. Shared blueprint lives in sibling `marketplace-forge/templates/nextjs-store/`. Prefer fixing **this store** here; promote shared features to the template only when explicitly asked.

UI/copy is Indonesian (`lang="id"`). Seeded catalog ~597 products. Default seller email: `mebel_arjuna@store.local`.

## Architecture

```
Browser → Next.js :5000
            ├─ /api/*      → rewrite → FastAPI :8000
            ├─ /uploads/*  → rewrite → FastAPI :8000
            └─ pages       → App Router (SSR/CSR)

FastAPI lifespan also starts:
  - Shopee IMAP IDLE daemon (no-op if IMAP_USER unset)
  - Daily report scheduler (~23:00 WIB)
```

Self-host: Nginx terminates SSL and proxies `/api` + `/uploads` → `:8000`, `/*` → `:5000`. See `technical-spec-deployment.md`.

| Layer | Path | Role |
|-------|------|------|
| Frontend | `frontend/` | Next.js 14 App Router, Tailwind, TypeScript |
| Backend | `backend/app/` | FastAPI, SQLAlchemy, JWT auth |
| Config file | `backend/seller_config.json` | Branding, couriers, pickup hours, report settings |
| Seed | `backend/seed.py`, `backend/seed_data.json` | Bootstrap products when DB empty |
| Scraped source | `data/scraped_data.json` | Original scrape payload |
| Template zip | `marketplace-template-v2.zip` | Packaging artifact for self-host unpack |

Root `main.py` / `pyproject.toml` are Replit stubs. Real deps: `backend/requirements.txt`, `frontend/package.json`.

## Commands

```bash
bash start.sh          # Dev: pip install, uvicorn :8000, seed if empty, next dev :5000
bash start.prod.sh     # Prod after `npm run build` in frontend/
cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8000
cd frontend && npm run dev   # -p 5000 -H 0.0.0.0
```

Swagger: `http://localhost:8000/docs`.

## Hard rules

1. **Payment truth is OttoPay**, not Midtrans. Live code + `.env.example` use `OTTOPAY_*`. Docs that still say Midtrans (`technical-spec-deployment.md`, `client-requirements.md`) are stale — do not reintroduce Midtrans unless explicitly requested. Column `orders.midtrans_order_id` stores the OttoPay transaction id (legacy name).
2. **Never commit secrets** (`.env`, JWT/OttoPay/IMAP keys). Do not hardcode `JWT_SECRET`.
3. Ask before major architectural or product changes.
4. SMTP / IMAP / Biteship features must **no-op cleanly** when secrets are unset.
5. Variant **stock is source of truth** — `product.stock` is the sum of variant stocks (`effective_stock` / `sync_product_stock`).
6. Sub-admin permission checks must stay **server-side** (`has_perm`); hiding CMS tabs alone is not enough.
7. New DB columns: SQLAlchemy model + idempotent SQL in `_run_migrations()` in `backend/app/main.py`. No Alembic.
8. This is a deployed instance — do not assume template placeholders (`{{STORE_NAME}}` etc.) still exist here.

## Roles & auth

| Role | Meaning |
|------|---------|
| `buyer` | Shop, cart, checkout, own orders |
| `seller` | Super admin — full CMS + manage sub-admins |
| `admin` | Sub-admin; scopes in `users.permissions` JSON array |

Permission scopes: `products`, `orders`, `banners`, `settings`.

Helpers in `backend/app/routes/auth.py`: `get_current_user`, `is_staff`, `has_perm`, `parse_permissions`.

- JWT cookie: `store_auth_token` (HS256, `JWT_SECRET`, ~7 days)
- Special pages (no nav links):
  - `/cs-search` — no login (CS stock lookup)
  - `/report-harian` — PIN gate → `X-Report-Token` (1h TTL)

## Domain conventions

### Variants & pricing
- Groups → cartesian combinations stored flat: `variant_type = "Warna / Ukuran"`, `variant_name = "Merah / XL"` (` / ` separator).
- `variant.price` = **Harga Asli** (struck through when discounted).
- `variant.original_price` = **Harga Diskon** (selling price when lower than `price`).
- `display_order` keeps stable ordering after save/reload.

### Orders
Statuses: `pending` → `paid` / `cancelled` → `processing` / `ready_pickup` / `shipped` / `completed`. Delivery: Biteship ship **or** store pickup.

### Branding
`seller_config.json` is the mutable source of truth for site name, colors, font, favicon, pickup schedule, courier allowlist, report settings. Branding GET may fall back to seller user phone/address.

### Shopee sync
IMAP watches “Pesanan Telah Diterima Pembeli”; match order: manual mapping → exact name → `no_match`. Idempotent on `message_id`. Admin UI: Settings → Sinkronisasi Shopee.

### Excel
Sheets **Produk** + **Varian**. Backward-compatible columns: `Harga` / `Harga Coret` and `Harga Asli` / `Harga Diskon`.

## Key files

| Concern | Path |
|---------|------|
| FastAPI entry + migrations + daemons | `backend/app/main.py` |
| Models | `backend/app/models.py` |
| Env loader (core) | `backend/app/config.py` |
| Auth / RBAC | `backend/app/routes/auth.py` |
| Products + Excel export | `backend/app/routes/products.py` |
| Excel import preview/apply | `backend/app/routes/excel_import.py` |
| Cart / orders | `backend/app/routes/cart.py`, `orders.py` |
| OttoPay | `backend/app/routes/payment.py` |
| Biteship | `backend/app/routes/shipping.py` |
| Branding / banners / admins | `branding.py`, `banners.py`, `admins.py` |
| Shopee sync API + engine | `routes/shopee_sync.py`, `shopee_sync.py`, `shopee_parser.py` |
| Daily report | `routes/report.py`, `daily_report.py` |
| Emails | `backend/app/email.py` |
| Seller CMS (large) | `frontend/src/app/seller/page.tsx` |
| Product editor | `frontend/src/app/seller/products/[slug]/page.tsx` |
| Buyer catalog / detail | `frontend/src/app/page.tsx`, `components/ProductDetail.tsx` |
| Checkout / orders | `frontend/src/app/checkout/page.tsx`, `orders/page.tsx` |
| Next proxy rewrites | `frontend/next.config.js` |

## Environment

Prefer `.env.example` + live code over stale Midtrans docs.

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | PostgreSQL |
| `JWT_SECRET` | Yes | JWT signing (`SECRET_KEY` in some docs is wrong for this repo) |
| `OTTOPAY_MERCHANT_ID` / `OTTOPAY_API_KEY` | Payments | OttoPay |
| `OTTOPAY_IS_PRODUCTION` | No | `true` for live |
| `BITESHIP_API_KEY` | Shipping | Courier rates / waybills |
| `EMAIL_*` | Email | SMTP (Gmail App Password pattern) |
| `IMAP_USER` / `IMAP_PASSWORD` | Shopee sync | Optional; daemon disabled if unset |
| `REPORT_PIN` | No | Default `/report-harian` PIN (`admin1234`) |
| `FRONTEND_URL` | CORS/self-host | Public frontend origin |
| `PORT` / `BACKEND_PORT` | No | Defaults 5000 / 8000 |

Webhook to register in OttoPay: `https://<domain>/api/payment/notification`.

## Gotchas

- CORS allowlist is localhost + Replit domains; self-host must set `FRONTEND_URL` / extend origins.
- Uploads live on disk under `backend/uploads/` — plan capacity; Nginx body size often 20M.
- Multi-worker uvicorn can duplicate background daemons (Shopee + daily report threads).
- Seed runs only when product count is 0 (`start.sh`).
- Change default report PIN immediately after first use.
