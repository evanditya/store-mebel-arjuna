from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, gen_id
from app.config import JWT_SECRET
import bcrypt
import re
from jose import jwt, JWTError
from datetime import datetime, timedelta

router = APIRouter(prefix="/api/auth")

ALGORITHM = "HS256"
COOKIE_NAME = "store_auth_token"
COOKIE_MAX_AGE = 7 * 24 * 60 * 60


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode(), password_hash.encode())


def create_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.utcnow() + timedelta(days=7),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=ALGORITHM)


def user_dict(user: User) -> dict:
    return {
        "id": user.id, "email": user.email, "name": user.name, "role": user.role,
        "phone": user.phone, "address": user.address, "city": user.city,
        "province": user.province, "postal_code": user.postal_code,
        "area_id": user.area_id, "area_name": user.area_name,
    }


def get_current_user(request: Request, db: Session) -> User | None:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        return None
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            return None
        return db.query(User).filter(User.id == user_id).first()
    except JWTError:
        return None


@router.post("/login")
async def login(request: Request, db: Session = Depends(get_db)):
    body = await request.json()
    email = body.get("email", "")
    password = body.get("password", "")
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(password, user.password_hash):
        return JSONResponse({"error": "Email atau password salah"}, status_code=401)
    token = create_token(user.id)
    response = JSONResponse({"user": user_dict(user)})
    response.set_cookie(
        COOKIE_NAME, token,
        httponly=True, samesite="lax", path="/", max_age=COOKIE_MAX_AGE
    )
    return response


@router.post("/register")
async def register(request: Request, db: Session = Depends(get_db)):
    body = await request.json()
    name = body.get("name", "")
    email = body.get("email", "")
    password = body.get("password", "")
    phone = body.get("phone", "")
    address = body.get("address", "")
    city = body.get("city", "")
    province = body.get("province", "")
    postal_code = body.get("postal_code", "")
    area_id = body.get("area_id", "")
    area_name = body.get("area_name", "")
    if not name or not email or not password or not phone:
        return JSONResponse({"error": "Nama, email, password, dan nomor telepon harus diisi"}, status_code=400)
    existing = db.query(User).filter(User.email == email).first()
    if existing:
        return JSONResponse({"error": "Email sudah terdaftar"}, status_code=400)
    user = User(
        id=gen_id(), email=email, name=name, phone=phone,
        address=address or None, city=city or None,
        province=province or None, postal_code=postal_code or None,
        area_id=area_id or None, area_name=area_name or None,
        password_hash=hash_password(password), role="buyer",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_token(user.id)
    response = JSONResponse({"user": user_dict(user)})
    response.set_cookie(
        COOKIE_NAME, token,
        httponly=True, samesite="lax", path="/", max_age=COOKIE_MAX_AGE
    )
    return response


@router.get("/me")
async def me(request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    if not user:
        return {"user": None}
    return {"user": user_dict(user)}


EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")


@router.post("/profile")
async def update_profile(request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    if not user:
        return JSONResponse({"error": "Silakan login terlebih dahulu"}, status_code=401)
    body = await request.json()
    name = body.get("name", "").strip()
    phone = body.get("phone", "").strip()
    address = body.get("address", "").strip()
    city = body.get("city", "").strip()
    province = body.get("province", "").strip()
    postal_code = body.get("postal_code", "").strip()
    area_id = body.get("area_id", "").strip()
    area_name = body.get("area_name", "").strip()
    if name:
        user.name = name
    if phone:
        user.phone = phone
    user.address = address or None
    user.city = city or None
    user.province = province or None
    user.postal_code = postal_code or None
    if area_id:
        user.area_id = area_id
    if area_name:
        user.area_name = area_name
    if area_id and user.role == "seller":
        import os, json
        config_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "seller_config.json")
        config = {}
        try:
            if os.path.exists(config_path):
                with open(config_path) as f:
                    config = json.load(f)
        except Exception:
            pass
        config["area_id"] = area_id
        if postal_code:
            config["postal_code"] = postal_code
        with open(config_path, "w") as f:
            json.dump(config, f, indent=2)
    db.commit()
    db.refresh(user)
    return {"success": True, "message": "Profil berhasil diperbarui", "user": user_dict(user)}


@router.post("/change-password")
async def change_password(request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    if not user:
        return JSONResponse({"error": "Silakan login terlebih dahulu"}, status_code=401)
    body = await request.json()
    current_password = body.get("current_password", "")
    new_password = body.get("new_password", "")
    if not current_password or not new_password:
        return JSONResponse({"error": "Password lama dan baru harus diisi"}, status_code=400)
    if len(new_password) < 6:
        return JSONResponse({"error": "Password baru minimal 6 karakter"}, status_code=400)
    if not verify_password(current_password, user.password_hash):
        return JSONResponse({"error": "Password lama salah"}, status_code=400)
    user.password_hash = hash_password(new_password)
    db.commit()
    return {"success": True, "message": "Password berhasil diubah"}


@router.post("/change-email")
async def change_email(request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    if not user:
        return JSONResponse({"error": "Silakan login terlebih dahulu"}, status_code=401)
    body = await request.json()
    new_email = body.get("new_email", "").strip().lower()
    password = body.get("password", "")
    if not new_email or not password:
        return JSONResponse({"error": "Email baru dan password harus diisi"}, status_code=400)
    if not EMAIL_REGEX.match(new_email):
        return JSONResponse({"error": "Format email tidak valid"}, status_code=400)
    if not verify_password(password, user.password_hash):
        return JSONResponse({"error": "Password salah"}, status_code=400)
    if new_email == user.email:
        return JSONResponse({"error": "Email baru sama dengan email lama"}, status_code=400)
    existing = db.query(User).filter(User.email == new_email).first()
    if existing:
        return JSONResponse({"error": "Email sudah digunakan oleh akun lain"}, status_code=400)
    user.email = new_email
    db.commit()
    return {"success": True, "message": "Email berhasil diubah", "user": user_dict(user)}


@router.post("/logout")
async def logout():
    response = JSONResponse({"success": True})
    response.delete_cookie(COOKIE_NAME, path="/")
    return response
