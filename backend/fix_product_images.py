"""Remove gallery/description images that belong to another scrape product index.

Paths like /images/product_203_0.jpg carry a scrape index. Seed/scrape merges
often attached product_1_* (or a neighbor's) files onto the wrong product.
Canonical index = primary_image index when present, else gallery majority.

Usage:
  cd backend && python fix_product_images.py           # apply
  cd backend && python fix_product_images.py --dry-run # report only
"""
from __future__ import annotations

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from app.database import SessionLocal, Base, engine
from app.models import Product, ProductImage
from app.routes.products import (
    canonical_local_image_index,
    url_belongs_to_local_index,
)


def fix(dry_run: bool = False) -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    deleted_images = 0
    updated_desc = 0
    scanned = 0
    try:
        products = db.query(Product).all()
        for product in products:
            scanned += 1
            gallery = list(product.images)
            gallery_urls = [img.image_url for img in gallery]
            canonical = canonical_local_image_index(product.primary_image, gallery_urls)
            if canonical is None:
                continue

            for img in gallery:
                if not url_belongs_to_local_index(img.image_url, canonical):
                    deleted_images += 1
                    if not dry_run:
                        db.delete(img)

            desc_images: list = []
            if product.description_images:
                try:
                    desc_images = json.loads(product.description_images)
                except Exception:
                    desc_images = []
            if isinstance(desc_images, list) and desc_images:
                safe = [u for u in desc_images if url_belongs_to_local_index(u, canonical)]
                if safe != desc_images:
                    updated_desc += 1
                    if not dry_run:
                        product.description_images = json.dumps(safe) if safe else None

        if not dry_run:
            db.commit()
        print(
            f"{'DRY-RUN ' if dry_run else ''}scanned={scanned} "
            f"deleted_gallery_rows={deleted_images} cleared_or_fixed_desc={updated_desc}"
        )
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    fix(dry_run=args.dry_run)
