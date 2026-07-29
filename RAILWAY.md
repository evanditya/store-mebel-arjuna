# Railway deployment — Mebel Arjuna Store

Single-service deploy: Next.js (public `$PORT`) + FastAPI (`127.0.0.1:8000`) in one container. Next rewrites `/api/*` and `/uploads/*` to the backend.

Payment gateway is **OttoPay** (not Midtrans).

## Architecture

```
Browser → Railway HTTPS → Next.js ($PORT)
                              ├─ /api/*      → FastAPI :8000
                              └─ /uploads/*  → FastAPI :8000
                         FastAPI → Postgres
                         FastAPI → Volume /data (uploads + seller_config.json)
```

## One-time project setup

1. Create a **new** Railway project (do not reuse marketplace-forge).
2. Add **PostgreSQL** from the Railway plugin catalog.
3. Create a service from this repo (root `Dockerfile` / `railway.toml`).
4. Attach a **Volume** to the service, mount path: `/data`.
5. Generate a public Railway domain for the service (`*.up.railway.app`).
6. Set environment variables (below).
7. Deploy and run the smoke checklist.

## Required environment variables

| Variable | Value |
|----------|--------|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `JWT_SECRET` | Long random string (generate new; do not copy from `.replit`) |
| `FRONTEND_URL` | `https://<your-service>.up.railway.app` |
| `UPLOAD_DIR` | `/data/uploads` |
| `SELLER_CONFIG_PATH` | `/data/seller_config.json` |
| `NODE_ENV` | `production` |

Railway also injects `PORT` and `RAILWAY_PUBLIC_DOMAIN` automatically. CORS accepts `FRONTEND_URL` and `https://$RAILWAY_PUBLIC_DOMAIN`.

## Optional (enable features later)

| Variable | Feature |
|----------|---------|
| `OTTOPAY_MERCHANT_ID` / `OTTOPAY_API_KEY` / `OTTOPAY_IS_PRODUCTION` | Payments |
| `BITESHIP_API_KEY` | Shipping rates / waybills |
| `EMAIL_HOST` / `EMAIL_PORT` / `EMAIL_USER` / `EMAIL_PASSWORD` / `EMAIL_FROM_NAME` | Transactional email |
| `IMAP_USER` / `IMAP_PASSWORD` / `IMAP_HOST` / `IMAP_PORT` | Shopee stock sync |
| `REPORT_PIN` | Daily report page PIN (default `admin1234`) |

After OttoPay is enabled, register webhook:

```
https://<your-service>.up.railway.app/api/payment/notification
```

## Fresh database

This migration starts with an **empty** Postgres. On first boot, `start.railway.sh` seeds products when the product count is `0` (`backend/seed.py`).

Seller account comes from seed data (`mebel_arjuna@store.local` unless changed). Change the password after first login.

If the seller role is missing:

```sql
UPDATE users SET role = 'seller' WHERE email = 'mebel_arjuna@store.local';
```

## Local Docker smoke (optional)

```bash
# With a reachable Postgres DATABASE_URL:
docker build -t store-mebel-arjuna .
docker run --rm -p 5000:5000 \
  -e DATABASE_URL="$DATABASE_URL" \
  -e JWT_SECRET=dev-secret \
  -e FRONTEND_URL=http://localhost:5000 \
  -e UPLOAD_DIR=/data/uploads \
  -e SELLER_CONFIG_PATH=/data/seller_config.json \
  -v store-data:/data \
  store-mebel-arjuna
```

## Smoke checklist (after deploy)

- [ ] `curl -sS https://<domain>/api/health` → `{"status":"ok"}`
- [ ] Homepage loads; catalog shows seeded products
- [ ] Register / login (cookie auth)
- [ ] Seller login works; CMS opens
- [ ] Upload a banner or product image, then **redeploy/restart** — image still loads (volume OK)
- [ ] (When configured) OttoPay sandbox checkout + webhook
- [ ] (When configured) Biteship rates with warehouse origin set

## Files

| File | Role |
|------|------|
| `Dockerfile` | Multi-stage Next build + Node/Python runtime |
| `start.railway.sh` | uvicorn + optional seed + `next start` on `$PORT` |
| `railway.toml` | Builder + healthcheck |
| `backend/app/paths.py` | `UPLOAD_DIR` / `SELLER_CONFIG_PATH` resolution |

## Notes

- Replicas: keep **1 replica** while using a local volume for uploads.
- Do not commit secrets. Rotate any JWT that was stored in `.replit`.
- Custom domain cutover is out of scope for the initial Railway migration.
