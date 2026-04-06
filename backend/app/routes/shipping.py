from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, HTMLResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Order, OrderItem, User, gen_id
from app.routes.auth import get_current_user
from app.config import BITESHIP_API_KEY
import httpx
from datetime import datetime
import json

router = APIRouter(prefix="/api/shipping")

BITESHIP_BASE = "https://api.biteship.com"
DEFAULT_COURIERS = "jne,sicepat,jnt,anteraja,tiki,ninja,idexpress,pos"


def biteship_headers():
    return {
        "Authorization": f"Bearer {BITESHIP_API_KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


@router.get("/status")
async def shipping_status():
    return {"available": bool(BITESHIP_API_KEY)}


@router.get("/areas")
async def search_areas(input: str = "", request: Request = None, db: Session = Depends(get_db)):
    if not BITESHIP_API_KEY:
        return {"areas": []}
    if len(input) < 3:
        return {"areas": []}
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{BITESHIP_BASE}/v1/maps/areas",
            params={"countries": "ID", "input": input, "type": "single"},
            headers=biteship_headers(),
        )
    if resp.status_code == 200:
        data = resp.json()
        return {"areas": data.get("areas", [])}
    return {"areas": []}


FALLBACK_ORIGIN_AREA_ID = "IDNP6IDNC153IDND2256IDZ10110"
FALLBACK_ORIGIN_POSTAL_CODE = "10110"


def _seller_config_path() -> str:
    import os
    return os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "seller_config.json")


def get_seller_origin() -> dict:
    try:
        import os
        config_path = _seller_config_path()
        if os.path.exists(config_path):
            with open(config_path) as f:
                sc = json.load(f)
                return {
                    "area_id": sc.get("area_id", ""),
                    "postal_code": sc.get("postal_code", ""),
                }
    except Exception:
        pass
    return {"area_id": "", "postal_code": ""}


@router.post("/rates")
async def get_rates(request: Request, db: Session = Depends(get_db)):
    if not BITESHIP_API_KEY:
        return JSONResponse({"error": "Biteship belum dikonfigurasi"}, status_code=400)
    body = await request.json()
    destination_area_id = body.get("destination_area_id", "")
    items = body.get("items", [])
    couriers = body.get("couriers", DEFAULT_COURIERS)

    if not destination_area_id:
        return JSONResponse({"error": "Area tujuan diperlukan"}, status_code=400)

    destination_postal_code = body.get("destination_postal_code", "")

    origin = get_seller_origin()
    origin_area_id = body.get("origin_area_id", "") or origin.get("area_id", "") or FALLBACK_ORIGIN_AREA_ID
    origin_postal_code = body.get("origin_postal_code", "") or origin.get("postal_code", "") or FALLBACK_ORIGIN_POSTAL_CODE

    for item in items:
        if "length" not in item:
            item["length"] = 10
        if "width" not in item:
            item["width"] = 10
        if "height" not in item:
            item["height"] = 10
        if "weight" not in item:
            item["weight"] = 500

    payload = {
        "couriers": couriers,
        "items": items,
        "origin_area_id": origin_area_id,
        "origin_postal_code": int(origin_postal_code),
        "destination_area_id": destination_area_id,
    }
    if destination_postal_code:
        try:
            payload["destination_postal_code"] = int(destination_postal_code)
        except (ValueError, TypeError):
            pass

    print(f"[Biteship rates] Requesting rates: origin={origin_area_id}, dest={destination_area_id}, items={len(items)}, couriers={couriers}")

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"{BITESHIP_BASE}/v1/rates/couriers",
            json=payload,
            headers=biteship_headers(),
        )

    print(f"[Biteship rates] Response status={resp.status_code}")

    def _parse_pricing(pricing_data):
        results = []
        for p in pricing_data:
            nested_rates = p.get("rates")
            if nested_rates and isinstance(nested_rates, list):
                company = p.get("company", "")
                for rate in nested_rates:
                    if rate.get("price") is not None and rate.get("available", True):
                        results.append({
                            "courier_company": company,
                            "courier_type": rate.get("type", rate.get("courier_service_code", "")),
                            "courier_name": rate.get("courier_name", p.get("courier_name", company)),
                            "service_name": rate.get("courier_service_name", rate.get("service_name", rate.get("description", ""))),
                            "description": rate.get("description", ""),
                            "price": rate.get("price", 0),
                            "etd": rate.get("shipment_duration_range", ""),
                            "etd_unit": rate.get("shipment_duration_unit", "days"),
                        })
            else:
                if p.get("price") is not None:
                    results.append({
                        "courier_company": p.get("company", p.get("courier_company", "")),
                        "courier_type": p.get("type", p.get("courier_service_code", "")),
                        "courier_name": p.get("courier_name", p.get("company", "")),
                        "service_name": p.get("courier_service_name", p.get("service_name", p.get("description", ""))),
                        "description": p.get("description", ""),
                        "price": p.get("price", 0),
                        "etd": p.get("shipment_duration_range", ""),
                        "etd_unit": p.get("shipment_duration_unit", "days"),
                    })
        results.sort(key=lambda x: x["price"])
        return results

    results = []
    if resp.status_code == 200:
        data = resp.json()
        pricing = data.get("pricing", [])
        results = _parse_pricing(pricing)
        if results:
            return {"rates": results}

    def _extract_postal_code(area_id_str):
        if "IDZ" in area_id_str:
            return area_id_str.split("IDZ")[-1]
        return ""

    if resp.status_code != 200:
        postal_fallback = _extract_postal_code(destination_area_id)
        if postal_fallback and postal_fallback.isdigit():
            try:
                fallback_payload = {
                    "couriers": couriers,
                    "items": items,
                    "origin_postal_code": int(origin_postal_code),
                    "destination_postal_code": int(postal_fallback),
                }
                if origin_area_id:
                    fallback_payload["origin_area_id"] = origin_area_id

                print(f"[Biteship rates] Retrying with postal_code fallback: dest_postal={postal_fallback}")
                async with httpx.AsyncClient(timeout=15) as client:
                    resp2 = await client.post(
                        f"{BITESHIP_BASE}/v1/rates/couriers",
                        json=fallback_payload,
                        headers=biteship_headers(),
                    )
                if resp2.status_code == 200:
                    data2 = resp2.json()
                    results2 = _parse_pricing(data2.get("pricing", []))
                    if results2:
                        return {"rates": results2}
            except Exception as e:
                print(f"[Biteship rates] Postal fallback error: {e}")

    if resp.status_code != 200:
        try:
            err = resp.json()
            error_msg = err.get("error", "Gagal mendapatkan ongkir")
            if isinstance(error_msg, dict):
                error_msg = error_msg.get("message", str(error_msg))
            print(f"[Biteship rates error] status={resp.status_code} response={err}")
            return JSONResponse({"error": error_msg, "debug": {"status": resp.status_code, "origin_area_id": origin_area_id}}, status_code=resp.status_code)
        except Exception:
            print(f"[Biteship rates error] status={resp.status_code} body={resp.text[:500]}")
            return JSONResponse({"error": "Gagal mendapatkan ongkir"}, status_code=500)

    return {"rates": []}


@router.get("/origin")
async def get_origin(request: Request, db: Session = Depends(get_db)):
    origin = get_seller_origin()
    return {
        "area_id": origin.get("area_id", ""),
        "postal_code": origin.get("postal_code", ""),
    }


@router.post("/origin")
async def update_origin(request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    if not user or user.role != "seller":
        return JSONResponse({"error": "Akses ditolak"}, status_code=403)
    body = await request.json()
    area_id = body.get("area_id", "")
    postal_code = body.get("postal_code", "")

    if postal_code:
        user.postal_code = str(postal_code)
    if area_id:
        user.area_id = area_id
    db.commit()

    import os
    config_path = _seller_config_path()
    config = {}
    try:
        if os.path.exists(config_path):
            with open(config_path) as f:
                config = json.load(f)
    except Exception:
        pass

    config["area_id"] = area_id
    config["postal_code"] = postal_code

    with open(config_path, "w") as f:
        json.dump(config, f, indent=2)

    return {"success": True, "area_id": area_id, "postal_code": postal_code}


@router.post("/create-order/{order_id}")
async def create_shipment(order_id: str, request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    if not user or user.role != "seller":
        return JSONResponse({"error": "Akses ditolak"}, status_code=403)
    if not BITESHIP_API_KEY:
        return JSONResponse({"error": "Biteship belum dikonfigurasi"}, status_code=400)

    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        return JSONResponse({"error": "Pesanan tidak ditemukan"}, status_code=404)
    if order.biteship_order_id:
        return JSONResponse({"error": "Pengiriman sudah dibuat", "biteship_order_id": order.biteship_order_id}, status_code=400)
    if order.status not in ("paid", "processing"):
        return JSONResponse({"error": "Pesanan belum dibayar"}, status_code=400)

    buyer = db.query(User).filter(User.id == order.user_id).first()

    items_payload = []
    for item in order.items:
        items_payload.append({
            "name": item.product_name[:50],
            "description": (item.variant_name or "")[:100],
            "value": int(item.price),
            "quantity": item.quantity,
            "weight": item.weight or 500,
        })

    payload = {
        "shipper_contact_name": user.name,
        "shipper_contact_phone": user.phone or "088888888888",
        "shipper_contact_email": user.email,
        "shipper_organization": user.name,
        "origin_contact_name": user.name,
        "origin_contact_phone": user.phone or "088888888888",
        "origin_address": user.address or "Alamat toko",
        "origin_postal_code": int(user.postal_code) if user.postal_code else 10110,
        "destination_contact_name": order.destination_contact_name or (buyer.name if buyer else "Pembeli"),
        "destination_contact_phone": order.destination_contact_phone or (buyer.phone if buyer else "088888888888"),
        "destination_address": order.shipping_address or "Alamat pembeli",
        "destination_postal_code": int(order.destination_postal_code) if order.destination_postal_code else 10110,
        "courier_company": order.courier_company or "jne",
        "courier_type": order.courier_type or "reg",
        "delivery_type": "now",
        "order_note": f"Order #{order.id[:8]}",
        "metadata": {"internal_order_id": order.id},
        "items": items_payload,
    }

    if user.area_id:
        payload["origin_area_id"] = user.area_id
    if order.destination_area_id:
        payload["destination_area_id"] = order.destination_area_id

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{BITESHIP_BASE}/v1/orders",
            json=payload,
            headers=biteship_headers(),
        )

    if resp.status_code in (200, 201):
        data = resp.json()
        order.biteship_order_id = data.get("id", "")
        courier_data = data.get("courier", {})
        order.waybill_id = courier_data.get("waybill_id", "")
        order.tracking_status = data.get("status", "confirmed")
        order.tracking_url = courier_data.get("link", "")
        order.status = "shipped"
        order.updated_at = datetime.utcnow()
        db.commit()
        return {
            "success": True,
            "biteship_order_id": order.biteship_order_id,
            "waybill_id": order.waybill_id,
            "tracking_url": order.tracking_url,
            "status": order.tracking_status,
        }

    try:
        err = resp.json()
        return JSONResponse({"error": err.get("error", "Gagal membuat pengiriman")}, status_code=resp.status_code)
    except Exception:
        return JSONResponse({"error": "Gagal membuat pengiriman"}, status_code=500)


@router.get("/track/{order_id}")
async def track_shipment(order_id: str, request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    if not user:
        return JSONResponse({"error": "Login terlebih dahulu"}, status_code=401)

    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        return JSONResponse({"error": "Pesanan tidak ditemukan"}, status_code=404)
    if user.role != "seller" and order.user_id != user.id:
        return JSONResponse({"error": "Akses ditolak"}, status_code=403)

    if not order.biteship_order_id or not BITESHIP_API_KEY:
        return {
            "order_id": order.id,
            "status": order.tracking_status or order.status,
            "waybill_id": order.waybill_id,
            "tracking_url": order.tracking_url,
            "history": [],
        }

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{BITESHIP_BASE}/v1/orders/{order.biteship_order_id}",
            headers=biteship_headers(),
        )

    if resp.status_code == 200:
        data = resp.json()
        courier = data.get("courier", {})
        order.tracking_status = data.get("status", order.tracking_status)
        order.waybill_id = courier.get("waybill_id", order.waybill_id)
        order.tracking_url = courier.get("link", order.tracking_url)
        if data.get("status") in ("delivered", "completed"):
            order.status = "completed"
        order.updated_at = datetime.utcnow()
        db.commit()
        history = courier.get("history", [])
        history.sort(key=lambda h: h.get("updated_at", ""), reverse=True)
        return {
            "order_id": order.id,
            "status": data.get("status", ""),
            "waybill_id": order.waybill_id,
            "tracking_url": order.tracking_url,
            "courier_company": order.courier_company,
            "courier_type": order.courier_type,
            "driver_name": courier.get("driver_name"),
            "driver_phone": courier.get("driver_phone"),
            "history": history,
        }
    return {
        "order_id": order.id,
        "status": order.tracking_status or order.status,
        "waybill_id": order.waybill_id,
        "tracking_url": order.tracking_url,
        "history": [],
    }


@router.get("/label/{order_id}")
async def shipping_label(order_id: str, request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    if not user or user.role != "seller":
        return JSONResponse({"error": "Akses ditolak"}, status_code=403)

    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        return JSONResponse({"error": "Pesanan tidak ditemukan"}, status_code=404)

    buyer = db.query(User).filter(User.id == order.user_id).first()

    seller_logo = ""
    seller_config_path = "seller_config.json"
    try:
        import os
        if os.path.exists(seller_config_path):
            with open(seller_config_path) as f:
                sc = json.load(f)
                seller_logo = sc.get("profile_picture", "")
    except Exception:
        pass

    items_html = ""
    total_weight = 0
    for item in order.items:
        w = (item.weight or 500) * item.quantity
        total_weight += w
        items_html += f"""
        <tr>
            <td style="padding:6px 8px;border-bottom:1px solid #eee;">{item.product_name}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;">{item.quantity}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">{w}g</td>
        </tr>"""

    logo_html = ""
    if seller_logo:
        logo_html = f'<img src="{seller_logo}" alt="Logo" style="height:50px;margin-right:12px;border-radius:6px;" />'

    courier_display = (order.courier_company or "").upper()
    if order.courier_service_name:
        courier_display += f" - {order.courier_service_name}"

    html = f"""<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8" />
<title>Label Pengiriman - #{order.id[:8]}</title>
<style>
  @media print {{
    body {{ margin: 0; }}
    .no-print {{ display: none !important; }}
  }}
  body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 20px; color: #333; }}
  .label {{ max-width: 400px; margin: 0 auto; border: 2px solid #333; padding: 20px; }}
  .header {{ display: flex; align-items: center; border-bottom: 2px solid #333; padding-bottom: 12px; margin-bottom: 12px; }}
  .header h2 {{ margin: 0; font-size: 18px; }}
  .section {{ margin-bottom: 12px; }}
  .section-title {{ font-size: 11px; text-transform: uppercase; color: #888; margin-bottom: 4px; letter-spacing: 0.5px; }}
  .section p {{ margin: 2px 0; font-size: 13px; }}
  .courier-badge {{ background: #333; color: #fff; padding: 6px 12px; font-weight: bold; font-size: 14px; display: inline-block; border-radius: 4px; margin-bottom: 8px; }}
  .waybill {{ font-family: monospace; font-size: 16px; font-weight: bold; letter-spacing: 1px; }}
  table {{ width: 100%; border-collapse: collapse; font-size: 13px; }}
  th {{ text-align: left; padding: 6px 8px; background: #f5f5f5; border-bottom: 2px solid #ddd; font-size: 11px; text-transform: uppercase; }}
  .barcode {{ text-align: center; padding: 12px 0; font-family: monospace; font-size: 14px; letter-spacing: 3px; border: 1px dashed #ccc; margin-top: 12px; }}
  .print-btn {{ display: block; margin: 20px auto; padding: 10px 30px; background: #333; color: #fff; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; }}
</style>
</head>
<body>
<div class="label">
  <div class="header">
    {logo_html}
    <div>
      <h2>{user.name}</h2>
      <p style="margin:2px 0;font-size:12px;color:#666;">{user.phone or ''}</p>
    </div>
  </div>

  <div class="courier-badge">{courier_display}</div>
  {f'<div class="waybill">{order.waybill_id}</div>' if order.waybill_id else ''}
  {f'<p style="font-size:12px;color:#666;">ETD: {order.shipping_etd}</p>' if order.shipping_etd else ''}

  <div class="section">
    <div class="section-title">Pengirim</div>
    <p><strong>{user.name}</strong></p>
    <p>{user.address or '-'}</p>
    <p>{user.city or ''} {user.postal_code or ''}</p>
    <p>{user.phone or ''}</p>
  </div>

  <div class="section">
    <div class="section-title">Penerima</div>
    <p><strong>{order.destination_contact_name or (buyer.name if buyer else '-')}</strong></p>
    <p>{order.shipping_address or '-'}</p>
    <p>{order.destination_contact_phone or (buyer.phone if buyer else '')}</p>
  </div>

  <div class="section">
    <div class="section-title">Isi Paket ({total_weight}g)</div>
    <table>
      <tr><th>Produk</th><th style="text-align:center;">Qty</th><th style="text-align:right;">Berat</th></tr>
      {items_html}
    </table>
  </div>

  <div class="barcode">
    {order.waybill_id or order.id[:12].upper()}
  </div>

  <p style="text-align:center;font-size:11px;color:#999;margin-top:8px;">Order #{order.id[:8]} &bull; {order.created_at.strftime('%d/%m/%Y') if order.created_at else ''}</p>
</div>
<button class="no-print print-btn" onclick="window.print()">Cetak Label</button>
</body>
</html>"""
    return HTMLResponse(content=html)
