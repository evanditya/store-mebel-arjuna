from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from app.database import engine, Base
from app.routes import auth, products, cart, orders, payment, upload, shipping
import os


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


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

uploads_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")
os.makedirs(uploads_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")

@app.get("/api/health")
async def health():
    return {"status": "ok"}
