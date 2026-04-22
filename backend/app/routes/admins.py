from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, gen_id
from app.routes.auth import get_current_user, hash_password, ALL_PERMISSIONS
import json

router = APIRouter(prefix="/api/admin")


def _only_super(user):
    return user is not None and user.role == "seller"


def admin_dict(u: User) -> dict:
    perms = []
    if u.permissions:
        try:
            perms = json.loads(u.permissions)
        except Exception:
            perms = []
    return {
        "id": u.id,
        "name": u.name,
        "email": u.email,
        "role": u.role,
        "permissions": perms,
        "created_at": u.created_at.isoformat() if u.created_at else None,
    }


@router.get("/users")
def list_admins(request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    if not _only_super(user):
        return JSONResponse({"error": "Akses ditolak"}, status_code=403)
    admins = db.query(User).filter(User.role == "admin").order_by(User.created_at).all()
    return {"admins": [admin_dict(a) for a in admins], "all_permissions": ALL_PERMISSIONS}


@router.post("/users")
async def create_admin(request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    if not _only_super(user):
        return JSONResponse({"error": "Akses ditolak"}, status_code=403)
    body = await request.json()
    name = (body.get("name") or "").strip()
    email = (body.get("email") or "").strip().lower()
    password = (body.get("password") or "").strip()
    permissions = body.get("permissions", [])
    if not name or not email or not password:
        return JSONResponse({"error": "Nama, email, dan password wajib diisi"}, status_code=400)
    if len(password) < 6:
        return JSONResponse({"error": "Password minimal 6 karakter"}, status_code=400)
    if db.query(User).filter(User.email == email).first():
        return JSONResponse({"error": "Email sudah digunakan"}, status_code=400)
    valid_perms = [p for p in permissions if p in ALL_PERMISSIONS]
    new_admin = User(
        id=gen_id(),
        name=name,
        email=email,
        password_hash=hash_password(password),
        role="admin",
        permissions=json.dumps(valid_perms),
    )
    db.add(new_admin)
    db.commit()
    db.refresh(new_admin)
    return {"admin": admin_dict(new_admin)}


@router.put("/users/{admin_id}")
async def update_admin(admin_id: str, request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    if not _only_super(user):
        return JSONResponse({"error": "Akses ditolak"}, status_code=403)
    admin = db.query(User).filter(User.id == admin_id, User.role == "admin").first()
    if not admin:
        return JSONResponse({"error": "Admin tidak ditemukan"}, status_code=404)
    body = await request.json()
    if "name" in body and body["name"].strip():
        admin.name = body["name"].strip()
    if "email" in body and body["email"].strip():
        new_email = body["email"].strip().lower()
        if new_email != admin.email:
            if db.query(User).filter(User.email == new_email).first():
                return JSONResponse({"error": "Email sudah digunakan"}, status_code=400)
            admin.email = new_email
    if "password" in body and body["password"].strip():
        pw = body["password"].strip()
        if len(pw) < 6:
            return JSONResponse({"error": "Password minimal 6 karakter"}, status_code=400)
        admin.password_hash = hash_password(pw)
    if "permissions" in body:
        valid_perms = [p for p in body["permissions"] if p in ALL_PERMISSIONS]
        admin.permissions = json.dumps(valid_perms)
    db.commit()
    db.refresh(admin)
    return {"admin": admin_dict(admin)}


@router.delete("/users/{admin_id}")
def delete_admin(admin_id: str, request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    if not _only_super(user):
        return JSONResponse({"error": "Akses ditolak"}, status_code=403)
    admin = db.query(User).filter(User.id == admin_id, User.role == "admin").first()
    if not admin:
        return JSONResponse({"error": "Admin tidak ditemukan"}, status_code=404)
    db.delete(admin)
    db.commit()
    return {"success": True}
