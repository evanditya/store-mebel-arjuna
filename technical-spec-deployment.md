# Technical Specification — Self-Hosted Server Deployment
**Indonesian Furniture E-Commerce Store**
Stack: Next.js 14 + FastAPI + PostgreSQL

---

## 1. System Overview

```
Internet
   │
   ▼
[Nginx] :80/:443  ←── SSL termination, static files, reverse proxy
   │
   ├──► /api/*  ──► [FastAPI / Uvicorn] :8000
   ├──► /uploads/*  ──► [FastAPI / Uvicorn] :8000  (serves uploaded images)
   └──► /*  ──────► [Next.js] :5000  (SSR + static)
```

Both processes run on the same server. Nginx acts as the single entry point.

---

## 2. Minimum Server Requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| CPU | 1 vCPU | 2 vCPU |
| RAM | 1 GB | 2 GB |
| Storage | 20 GB SSD | 40 GB SSD |
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |
| Network | 1 Gbps port | 1 Gbps port |

> Storage note: Product images are stored in `backend/uploads/`. Plan for growth — each product may have 3–6 images averaging 200–500 KB each.

---

## 3. Software Prerequisites

### System packages
```bash
sudo apt update && sudo apt install -y \
  nginx \
  postgresql postgresql-contrib \
  python3.11 python3.11-venv python3-pip \
  curl git build-essential
```

### Node.js 20 LTS
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # should be v20.x
npm -v    # should be v10.x
```

### Python version
```
Python 3.11+ required
```

---

## 4. Environment Variables

Create `/opt/store/.env` (never commit this file):

```env
# ─── DATABASE ────────────────────────────────────────
DATABASE_URL=postgresql://store_user:STRONG_PASSWORD@localhost:5432/store_db

# ─── AUTHENTICATION ──────────────────────────────────
# Generate: python3 -c "import secrets; print(secrets.token_urlsafe(32))"
SECRET_KEY=<random-64-char-string>

# ─── EMAIL / SMTP ────────────────────────────────────
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-store-email@gmail.com
EMAIL_PASSWORD=your-gmail-app-password   # Gmail: use App Password, not account password
EMAIL_FROM_NAME=Nama Toko

# ─── PAYMENT — MIDTRANS ──────────────────────────────
MIDTRANS_SERVER_KEY=SB-Mid-server-xxxx        # or Mid-server-xxxx for production
MIDTRANS_CLIENT_KEY=SB-Mid-client-xxxx        # or Mid-client-xxxx for production
MIDTRANS_IS_PRODUCTION=false                  # set true for live payments

# ─── SHIPPING — BITESHIP ─────────────────────────────
BITESHIP_API_KEY=biteship_xxxx                # optional; disables courier rates if absent

# ─── SHOPEE GMAIL SYNC ────────────────────────────────
# Optional — no-op if IMAP_USER is not set
IMAP_USER=your-gmail@gmail.com
IMAP_PASSWORD=your-gmail-app-password
IMAP_HOST=imap.gmail.com
IMAP_PORT=993

# ─── DAILY REPORT ────────────────────────────────────
# Optional — default PIN is admin1234
REPORT_PIN=admin1234

# ─── FRONTEND ────────────────────────────────────────
FRONTEND_URL=https://yourdomain.com
NODE_ENV=production
```

---

## 5. PostgreSQL Setup

```bash
# Create database user and database
sudo -u postgres psql <<SQL
CREATE USER store_user WITH PASSWORD 'STRONG_PASSWORD';
CREATE DATABASE store_db OWNER store_user;
GRANT ALL PRIVILEGES ON DATABASE store_db TO store_user;
SQL

# Verify connection
psql postgresql://store_user:STRONG_PASSWORD@localhost:5432/store_db -c "\l"
```

The application runs **automatic schema migrations on startup** — no manual SQL migration files needed.

---

## 6. Application Setup

### Clone and structure
```bash
sudo mkdir -p /opt/store
sudo chown $USER:$USER /opt/store

# Extract the template zip or clone from Git
cd /opt/store
unzip marketplace-template-v2.zip
# or: git clone https://github.com/your-repo/store .
```

### Backend — Python virtual environment
```bash
cd /opt/store/backend
python3.11 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

### Frontend — build for production
```bash
cd /opt/store/frontend
npm install
npm run build
# Output: frontend/.next/
```

### Uploads directory
```bash
mkdir -p /opt/store/backend/uploads
chmod 755 /opt/store/backend/uploads
```

---

## 7. Process Management (systemd)

### FastAPI backend service
Create `/etc/systemd/system/store-backend.service`:
```ini
[Unit]
Description=Store FastAPI Backend
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/store/backend
EnvironmentFile=/opt/store/.env
ExecStart=/opt/store/backend/venv/bin/uvicorn app.main:app \
          --host 127.0.0.1 --port 8000 \
          --workers 2
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=store-backend

[Install]
WantedBy=multi-user.target
```

### Next.js frontend service
Create `/etc/systemd/system/store-frontend.service`:
```ini
[Unit]
Description=Store Next.js Frontend
After=network.target store-backend.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/store/frontend
EnvironmentFile=/opt/store/.env
Environment=PORT=5000
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=store-frontend

[Install]
WantedBy=multi-user.target
```

### Enable and start both services
```bash
sudo chown -R www-data:www-data /opt/store

sudo systemctl daemon-reload
sudo systemctl enable store-backend store-frontend
sudo systemctl start store-backend store-frontend

# Verify
sudo systemctl status store-backend
sudo systemctl status store-frontend
journalctl -u store-backend -f   # live logs
```

---

## 8. Nginx Configuration

Create `/etc/nginx/sites-available/store`:
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # Increase upload limit for product images
    client_max_body_size 20M;

    # Serve uploaded product images directly from disk (bypass Node.js)
    location /uploads/ {
        alias /opt/store/backend/uploads/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Proxy API requests to FastAPI
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }

    # Everything else to Next.js
    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 60s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/store /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 9. SSL — Let's Encrypt (HTTPS)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Auto-renew (runs twice daily)
sudo systemctl enable certbot.timer
sudo certbot renew --dry-run   # test renewal
```

After certbot runs, your Nginx config is automatically updated to redirect HTTP → HTTPS and serve the certificate.

---

## 10. First-Run Initialization

Once both services are running and Nginx is set up:

1. **Open the site** at `https://yourdomain.com`
2. **Register the first account** at `/register` — this becomes the seller/super-admin account
3. **Promote to seller role** via psql:
   ```sql
   psql postgresql://store_user:STRONG_PASSWORD@localhost:5432/store_db \
     -c "UPDATE users SET role='seller' WHERE email='your-email@example.com';"
   ```
4. **Log in to the CMS** at `/seller`
5. **Configure store settings**: name, tagline, address, phone, WhatsApp, brand colour, pickup schedule
6. **Change the daily report PIN** at `/report-harian` (default: `admin1234`)
7. **Upload banners** and **add products** via the CMS

---

## 11. Seeding Products (Optional)

If you want to import initial products from the included seed data:

```bash
# From backend directory with venv activated
source /opt/store/backend/venv/bin/activate
cd /opt/store

# Run the seed script (if included)
python3 -c "
from backend.app.database import SessionLocal
# import and run your seeder
"

# Or use Excel import from the CMS:
# Seller dashboard → Products tab → Import Excel
```

---

## 12. Background Processes

The FastAPI process automatically starts two background threads on boot:

| Thread | Purpose | Config |
|--------|---------|--------|
| Shopee IMAP Daemon | Watches Gmail for Shopee orders, decrements stock | `IMAP_USER` + `IMAP_PASSWORD` env vars |
| Daily Report Scheduler | Sends report email at 23:00 WIB | Configured via `/report-harian` page |

Both are non-critical — if env vars are missing, they are silently disabled.

---

## 13. File Storage

Uploaded product images are stored **locally on disk**:
```
/opt/store/backend/uploads/
├── product_1_0.jpg
├── product_1_1.jpg
├── banners/
│   └── banner_1.jpg
└── favicon.png
```

Nginx serves `/uploads/*` directly from disk (bypassing Node.js) for performance.

**For a multi-server or cloud setup**, replace local disk storage with S3-compatible object storage (AWS S3, Cloudflare R2, MinIO) and update the upload route in `backend/app/routes/upload.py`.

---

## 14. Port Reference

| Port | Service | Exposed? |
|------|---------|----------|
| 80 | Nginx HTTP | Public |
| 443 | Nginx HTTPS | Public |
| 5000 | Next.js | Internal only (Nginx proxy) |
| 8000 | FastAPI / Uvicorn | Internal only (Nginx proxy) |
| 5432 | PostgreSQL | Internal only |

Firewall rule — allow only 80, 443, and 22 (SSH):
```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

---

## 15. Deployment Update Procedure

```bash
# 1. Pull latest code
cd /opt/store
git pull   # or re-extract the zip

# 2. Rebuild frontend
cd /opt/store/frontend
npm install
npm run build

# 3. Install any new Python packages
cd /opt/store/backend
source venv/bin/activate
pip install -r requirements.txt

# 4. Restart both services
sudo systemctl restart store-backend store-frontend

# 5. Verify
sudo systemctl status store-backend store-frontend
```

Schema migrations run automatically on backend restart — no manual SQL needed.

---

## 16. Monitoring & Logs

```bash
# Live backend logs
journalctl -u store-backend -f

# Live frontend logs
journalctl -u store-frontend -f

# Nginx access log
sudo tail -f /var/log/nginx/access.log

# Nginx error log
sudo tail -f /var/log/nginx/error.log

# PostgreSQL log
sudo tail -f /var/log/postgresql/postgresql-14-main.log
```

---

## 17. Backup Strategy

```bash
# Database backup (run daily via cron)
pg_dump postgresql://store_user:PASSWORD@localhost:5432/store_db \
  | gzip > /backups/db_$(date +%Y%m%d).sql.gz

# Uploaded images backup
rsync -av /opt/store/backend/uploads/ /backups/uploads/

# seller_config.json backup
cp /opt/store/backend/seller_config.json /backups/

# Crontab example (daily at 2:00 AM)
# 0 2 * * * /opt/store/scripts/backup.sh
```

---

## 18. Third-Party Accounts Required

| Service | Purpose | URL |
|---------|---------|-----|
| **Midtrans** | Payment gateway | https://dashboard.midtrans.com |
| **Biteship** | Shipping courier rates | https://app.biteship.com |
| **Gmail** | Transactional email (SMTP) + optional Shopee sync (IMAP) | Gmail App Password required |
| **Domain registrar** | Custom domain + DNS | Any registrar (Namecheap, Cloudflare, etc.) |

---

## 19. Checklist Before Going Live

- [ ] Domain DNS A record pointing to server IP
- [ ] SSL certificate issued (`certbot --nginx`)
- [ ] All environment variables set in `/opt/store/.env`
- [ ] PostgreSQL running and accessible
- [ ] Both systemd services running (`active (running)`)
- [ ] Nginx test passes (`nginx -t`)
- [ ] First seller account created and promoted to `role='seller'`
- [ ] Store name, address, phone set in CMS Settings
- [ ] Midtrans webhook URL set to `https://yourdomain.com/api/payment/notification`
- [ ] Daily report PIN changed from default `admin1234`
- [ ] UFW firewall enabled (only ports 22, 80, 443 open)
- [ ] Backup cron job scheduled
