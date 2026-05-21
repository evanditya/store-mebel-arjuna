from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from app.database import engine, Base
from app.routes import auth, products, cart, orders, payment, upload, shipping, branding, banners, admins, shopee_sync as shopee_sync_routes, excel_import as excel_import_routes, report as report_routes
from app import shopee_sync as shopee_sync_svc
from app import daily_report as daily_report_svc
import os


def _run_migrations():
    from sqlalchemy import text, inspect
    with engine.connect() as conn:
        inspector = inspect(engine)
        user_cols = [c["name"] for c in inspector.get_columns("users")]
        if "permissions" not in user_cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN permissions TEXT"))
            conn.commit()
        prod_cols = [c["name"] for c in inspector.get_columns("products")]
        if "shopee_url" not in prod_cols:
            conn.execute(text("ALTER TABLE products ADD COLUMN shopee_url VARCHAR"))
            conn.commit()
        if "is_available" not in prod_cols:
            conn.execute(text("ALTER TABLE products ADD COLUMN is_available BOOLEAN DEFAULT TRUE"))
            conn.commit()
        if "created_at" not in prod_cols:
            conn.execute(text("ALTER TABLE products ADD COLUMN created_at TIMESTAMP DEFAULT NOW()"))
            conn.commit()
        var_cols = [c["name"] for c in inspector.get_columns("product_variants")]
        if "display_order" not in var_cols:
            conn.execute(text("ALTER TABLE product_variants ADD COLUMN display_order INTEGER DEFAULT 0"))
            conn.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    _run_migrations()
    try:
        shopee_sync_svc.start_daemon()
    except Exception as e:
        print(f"[ShopeeSync] failed to start daemon: {e}")
    try:
        daily_report_svc.start_scheduler()
    except Exception as e:
        print(f"[DailyReport] failed to start scheduler: {e}")
    yield
    try:
        shopee_sync_svc.stop_daemon()
    except Exception:
        pass
    try:
        daily_report_svc.stop_scheduler()
    except Exception:
        pass


app = FastAPI(lifespan=lifespan)

allowed_origins = [
    "http://localhost:5000",
    "http://127.0.0.1:5000",
    "http://0.0.0.0:5000",
]
replit_dev_domain = os.environ.get("REPLIT_DEV_DOMAIN")
if replit_dev_domain:
    allowed_origins.append(f"https://{replit_dev_domain}")
replit_domains = os.environ.get("REPLIT_DOMAINS", "")
if replit_domains:
    for domain in replit_domains.split(","):
        d = domain.strip()
        if d:
            allowed_origins.append(f"https://{d}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(products.router)
app.include_router(cart.router)
app.include_router(orders.router)
app.include_router(payment.router)
app.include_router(upload.router)
app.include_router(shipping.router)
app.include_router(branding.router)
app.include_router(banners.router)
app.include_router(admins.router)
app.include_router(shopee_sync_routes.router)
app.include_router(excel_import_routes.router)
app.include_router(report_routes.router)

uploads_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")
os.makedirs(uploads_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")

@app.get("/api/health")
async def health():
    return {"status": "ok"}
