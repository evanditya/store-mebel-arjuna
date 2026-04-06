import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from app.database import engine, SessionLocal, Base
from app.models import User, Product, ProductImage, ProductVariant, gen_id


def seed():
    seed_path = os.path.join(os.path.dirname(__file__), "seed_data.json")
    if not os.path.exists(seed_path):
        print("seed_data.json not found")
        return

    with open(seed_path, "r") as f:
        data = json.load(f)

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    try:
        seller_user_data = data.get("seller_user", {})
        if seller_user_data:
            existing = db.query(User).filter(User.id == seller_user_data["id"]).first()
            if not existing:
                user = User(
                    id=seller_user_data["id"],
                    email=seller_user_data["email"],
                    name=seller_user_data["name"],
                    phone=seller_user_data.get("phone"),
                    address=seller_user_data.get("address"),
                    city=seller_user_data.get("city"),
                    province=seller_user_data.get("province"),
                    postal_code=seller_user_data.get("postal_code"),
                    password_hash=seller_user_data["password_hash"],
                    role=seller_user_data.get("role", "seller"),
                )
                db.add(user)
                db.commit()
                print(f"Seller user created: {user.email}")
            else:
                print(f"Seller user already exists: {existing.email}")

        seller_config = data.get("seller", {})
        if seller_config:
            config_path = os.path.join(os.path.dirname(__file__), "seller_config.json")
            with open(config_path, "w") as f:
                json.dump(seller_config, f, indent=2)
            print(f"Seller config written to seller_config.json")

        products_data = data.get("products", [])
        for p in products_data:
            existing = db.query(Product).filter(Product.slug == p["slug"]).first()
            if existing:
                print(f"Product already exists: {p['slug']}")
                continue
            desc_images = p.get("description_images", [])
            desc_images_str = json.dumps(desc_images) if desc_images else None
            specs = p.get("specifications", [])
            specs_str = json.dumps(specs) if specs else None

            product = Product(
                id=gen_id(),
                name=p["name"],
                slug=p["slug"],
                price=p["price"],
                original_price=p.get("original_price"),
                category=p.get("category"),
                description=p.get("description"),
                description_images=desc_images_str,
                specifications=specs_str,
                sold_count=p.get("sold_count", 0),
                stock=p.get("stock", 0),
                rating=p.get("rating", 0),
                weight=p.get("weight", 500),
                length=p.get("length", 10),
                width=p.get("width", 10),
                height=p.get("height", 10),
                primary_image=p.get("primary_image"),
                video_url=p.get("video_url"),
            )
            db.add(product)
            db.flush()

            for idx, img_url in enumerate(p.get("images", [])):
                db.add(ProductImage(
                    id=gen_id(),
                    product_id=product.id,
                    image_url=img_url if isinstance(img_url, str) else img_url.get("image_url", ""),
                    display_order=idx,
                ))

            for v in p.get("variants", []):
                db.add(ProductVariant(
                    id=gen_id(),
                    product_id=product.id,
                    variant_type=v.get("variant_type"),
                    variant_name=v.get("variant_name", ""),
                    price=v.get("price"),
                    price_modifier=v.get("price_modifier", 0),
                    stock=v.get("stock", 0),
                    is_available=v.get("is_available", True),
                ))

            print(f"Product created: {product.slug}")

        db.commit()
        print("Seed completed successfully!")

    except Exception as e:
        db.rollback()
        print(f"Error during seeding: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
