# Mebel Arjuna Store

Full-stack e-commerce marketplace for Indonesian furniture, built with **Next.js 14 + Python FastAPI + PostgreSQL**. Includes a complete buyer experience, seller CMS dashboard, multi-admin role management, Midtrans payment gateway, and Biteship multi-courier shipping.

---

## Quick Start (Replit)

1. **Import** this repository into a Replit workspace.
2. **Add PostgreSQL** from the Tools panel — `DATABASE_URL` is set automatically.
3. **Add API keys** in the Secrets tab:

   | Secret | Purpose |
   |---|---|
   | `MIDTRANS_SERVER_KEY` | Midtrans payment server key |
   | `MIDTRANS_CLIENT_KEY` | Midtrans Snap client key |
   | `MIDTRANS_IS_PRODUCTION` | `true` for live, `false` for sandbox |
   | `BITESHIP_API_KEY` | Biteship courier API key |
   | `JWT_SECRET` | Random string for JWT signing |

4. **Click Run** — installs dependencies, runs DB migrations, seeds 597 products, starts frontend (port 5000) and backend (port 8000).

---

## Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Next.js 14  │ --> │   FastAPI    │ --> │  PostgreSQL  │
│  Port 5000   │     │   Port 8000  │     │              │
└──────────────┘     └──────────────┘     └──────────────┘
                       │         │
                ┌──────┘         └───────┐
                ▼                        ▼
          ┌──────────┐             ┌──────────┐
          │ Midtrans │             │ Biteship │
          │ Payment  │             │ Shipping │
          └──────────┘             └──────────┘
```

The Next.js frontend proxies `/api/*` and `/uploads/*` to the FastAPI backend.

---

## Complete Feature List

### Buyer Features

**Browsing & Discovery**
- Homepage with rotating banner slider (drag-and-drop ordered by seller)
- Searchable product catalog with category filters and infinite scroll
- Product detail modal with image gallery, video URL support, and variant selection
- IDR price formatting and "RB+" sold-count formatting (Indonesian locale)
- Variant-level pricing with "Harga Asli" (struck-through) and "Harga Diskon" (selling price)
- Real-time stock display synced from variants

**Cart & Checkout**
- Add to cart with variant selection, quantity controls
- Two delivery modes:
  - **Kirim ke Alamat** — Biteship multi-courier with real-time rate comparison
  - **Ambil di Toko** — In-store pickup with configurable opening hours
- Sub-district level address autocomplete via Biteship area search
- Midtrans Snap popup for payment (Credit Card, GoPay, Bank Transfer, QRIS, etc.)

**Account & Orders**
- Buyer registration and login (JWT-based)
- Profile editing and password change
- Full order history with status badges (Confirmed, Shipped, Delivered, Cancelled)
- Real-time courier tracking pulled from Biteship
- Email notifications for registration, payment, shipping, and completion

### Seller / Admin CMS

**Product Management**
- Create, edit, and delete products with multiple high-resolution images
- Built-in image cropper for consistent aspect ratios
- Multi-level variant editor (e.g. Color × Material) with independent price + stock
- Variant-level original price + discount price
- Single source of truth: variant stocks auto-sum to product stock
- Excel export of full catalog
- Excel import with backward-compatible column names (`Harga` / `Harga Coret` and `Harga Asli` / `Harga Diskon`)

**Order & Shipping Fulfillment**
- Order dashboard with status filtering and updates
- Generate Biteship waybill (shipping label) directly from the dashboard
- Real-time tracking history for every shipment
- Configure allowed couriers (JNE, SiCepat, J&T, AnterAja, TIKI, Ninja, ID Express, POS, Grab, GoSend)
- Set warehouse origin point for accurate rate calculation

**Store Branding**
- Custom site name and seller name
- Brand colors (primary + secondary) applied site-wide
- Custom favicon upload
- Google Fonts selector — switch typography instantly
- Drag-and-drop banner manager with active/inactive toggle, titles, and redirect links
- Pickup hours configuration (open/close times per day)

**Shopee → Store Stock Sync** *(new)*
- Watches the seller's Gmail inbox for Shopee Seller "Pesanan Telah Diterima Pembeli" emails and **automatically decrements matching product stock** when the buyer confirms receipt
- Push trigger via IMAP IDLE (instant) with a 30-min fallback poll; reconnects every 28 min so Gmail keeps the channel open
- Idempotent — each email is processed at most once (UNIQUE on Message-ID)
- Smart matching: manual mapping table → exact case-insensitive product name → unmatched (logged for the seller to map)
- Variant-aware: decrements `variant.stock` then re-sums into `product.stock`; never goes below zero
- Admin UI at **Pengaturan → Sinkronisasi Shopee**: status badge, totals, "Sinkron Sekarang" button, sync history, unmatched-product mapping flow, and existing mappings list
- Daemon is a **strict no-op** when `IMAP_USER` is not set (logs "IMAP not configured — daemon disabled")

**Multi-Admin Role Management** *(new)*
- Two staff roles:
  - **`seller`** — Super Admin (the owner): full access + ability to manage other admins
  - **`admin`** — Sub-admin with granular per-menu permissions
- Granular permission scopes: `products`, `orders`, `banners`, `settings`
- Super admin can create, edit, and delete sub-admins from the **Kelola Admin** tab
- Tabs hide automatically for sub-admins based on their assigned permissions
- Backend API enforces permission checks server-side (403 on unauthorized access)

### Technical
- JWT authentication with role-based access control (RBAC)
- Auto-running database migrations on startup
- Responsive mobile + desktop UI (Tailwind CSS)
- RESTful API with auto-generated Swagger docs at `/docs`
- Image upload + serving via `/uploads/*`
- PostgreSQL with SQLAlchemy ORM

---

## Seller Login

| Field | Value |
|---|---|
| Email | `mebel_arjuna@store.local` |
| Password | *(shown when the repo was generated)* |

Change the password from the seller dashboard after first login.

---

## Project Structure

```
├── frontend/                 # Next.js 14 app
│   └── src/
│       ├── app/              # App Router pages
│       │   ├── page.tsx      # Homepage / catalog
│       │   ├── cart/         # Cart
│       │   ├── checkout/     # Checkout + payment
│       │   ├── orders/       # Order history + tracking
│       │   ├── seller/       # Full CMS dashboard
│       │   ├── login/ register/ change-password/
│       │   └── api/          # Next.js proxy routes
│       └── components/
│           ├── ProductDetail.tsx, ProductCard.tsx
│           ├── BannerSlider.tsx, BannerCropper.tsx
│           ├── Navbar.tsx, FaviconUpdater.tsx
├── backend/                  # FastAPI app
│   ├── app/
│   │   ├── main.py           # Entrypoint + auto-migrations
│   │   ├── models.py         # SQLAlchemy models
│   │   ├── database.py       # DB session
│   │   └── routes/
│   │       ├── auth.py       # JWT auth + permission helpers
│   │       ├── admins.py     # Sub-admin CRUD (super admin only)
│   │       ├── products.py   # Product CRUD + Excel import/export
│   │       ├── cart.py, orders.py
│   │       ├── payment.py    # Midtrans Snap
│   │       ├── shipping.py   # Biteship rates, area search, waybills, tracking
│   │       ├── banners.py    # Banner CMS
│   │       ├── branding.py   # Store branding (colors, fonts, favicon, hours)
│   │       └── upload.py     # Image upload
│   ├── seed.py + seed_data.json
│   └── requirements.txt
├── data/scraped_data.json    # Original product data
├── start.sh, start.prod.sh   # Startup scripts
└── replit.md                 # Internal architecture notes
```

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | auto on Replit | PostgreSQL connection string |
| `MIDTRANS_SERVER_KEY` | Payments | — | Midtrans server key |
| `MIDTRANS_CLIENT_KEY` | Payments | — | Midtrans Snap client key |
| `MIDTRANS_IS_PRODUCTION` | No | `false` | Use production Midtrans |
| `BITESHIP_API_KEY` | Shipping | — | Biteship API key |
| `JWT_SECRET` | **Yes** | — | JWT signing secret (use a long random string) |
| `IMAP_USER` | Shopee sync | — | Gmail address that receives Shopee Seller emails |
| `IMAP_PASSWORD` | Shopee sync | — | Gmail **App Password** (not the regular Gmail password) |
| `IMAP_HOST` | No | `imap.gmail.com` | IMAP server hostname |
| `IMAP_PORT` | No | `993` | IMAP server port |
| `IMAP_FOLDER` | No | `INBOX` | Mailbox folder to watch |
| `PORT` | No | `5000` | Frontend port |
| `BACKEND_PORT` | No | `8000` | Backend port |

> **Gmail App Password** — Generate one at *myaccount.google.com → Security → 2-Step Verification → App passwords*. Without `IMAP_USER` set, the Shopee sync daemon stays disabled and the rest of the app continues to work normally.

> **Security note:** Always set `JWT_SECRET` via Secrets — never hardcode it in `.replit` or commit it.

---

## API Documentation

Visit `/docs` on port 8000 for Swagger UI. Key endpoints:

- `POST /auth/login` / `POST /auth/register` — Auth
- `GET  /products` / `GET /products/{slug}` — Catalog
- `POST /cart/add` — Cart
- `POST /shipping/rates` / `POST /shipping/area` — Biteship
- `POST /payment/create` — Midtrans Snap token
- `GET  /orders` — Order history
- `GET  /admins` / `POST /admins` — Sub-admin management *(super admin only)*

---

## Troubleshooting

- **Database not connecting** — confirm PostgreSQL is added in Tools (Replit) or `DATABASE_URL` is correct.
- **Payment not working** — verify Midtrans server/client keys and the `IS_PRODUCTION` flag match the keys' environment.
- **Shipping rates blank** — verify `BITESHIP_API_KEY` and that the warehouse origin is set in seller settings.
- **"Permission denied" on a seller tab** — sub-admin lacks that permission; have the super admin grant it from the Kelola Admin tab.

---

*597 seeded products | Initial generation 2026-04-06*
