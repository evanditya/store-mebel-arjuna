import smtplib
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart


def _send_email(to: str, subject: str, html: str) -> bool:
    host = os.environ.get("EMAIL_HOST", "")
    port = int(os.environ.get("EMAIL_PORT", "587"))
    user = os.environ.get("EMAIL_USER", "")
    password = os.environ.get("EMAIL_PASSWORD", "")
    from_name = os.environ.get("EMAIL_FROM_NAME", "Toko Online")

    if not host or not user or not password or not to:
        print(f"[Email] Skipping — EMAIL_HOST/USER/PASSWORD not fully configured")
        return False
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{from_name} <{user}>"
        msg["To"] = to
        msg.attach(MIMEText(html, "html", "utf-8"))
        with smtplib.SMTP(host, port, timeout=15) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(user, password)
            server.sendmail(user, [to], msg.as_string())
        print(f"[Email] Sent '{subject}' to {to}")
        return True
    except Exception as e:
        print(f"[Email] Failed to send to {to}: {e}")
        return False


def _base_template(content: str, store_name: str = "Toko Online") -> str:
    return f"""<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <style>
    body {{ font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 0; color: #333; }}
    .wrapper {{ max-width: 600px; margin: 30px auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,.08); }}
    .header {{ background: #111827; color: #fff; padding: 24px 32px; }}
    .header h1 {{ margin: 0; font-size: 20px; font-weight: 700; }}
    .header p {{ margin: 4px 0 0; font-size: 13px; opacity: .7; }}
    .body {{ padding: 28px 32px; }}
    .section {{ margin-bottom: 20px; }}
    .section-title {{ font-size: 13px; font-weight: 700; text-transform: uppercase; color: #6b7280; letter-spacing: .5px; margin-bottom: 10px; }}
    table.items {{ width: 100%; border-collapse: collapse; font-size: 14px; }}
    table.items th {{ text-align: left; padding: 8px 10px; background: #f9fafb; color: #6b7280; font-size: 12px; font-weight: 600; border-bottom: 1px solid #e5e7eb; }}
    table.items td {{ padding: 10px; border-bottom: 1px solid #f3f4f6; vertical-align: top; }}
    .info-row {{ display: flex; justify-content: space-between; font-size: 14px; padding: 5px 0; border-bottom: 1px solid #f3f4f6; }}
    .info-label {{ color: #6b7280; }}
    .total-row {{ font-weight: 700; font-size: 15px; color: #111827; }}
    .badge {{ display: inline-block; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 600; }}
    .badge-yellow {{ background: #fef9c3; color: #854d0e; }}
    .badge-green {{ background: #dcfce7; color: #166534; }}
    .badge-blue {{ background: #dbeafe; color: #1e40af; }}
    .note-box {{ background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 14px; font-size: 13px; color: #92400e; }}
    .footer {{ background: #f9fafb; border-top: 1px solid #e5e7eb; padding: 16px 32px; text-align: center; font-size: 12px; color: #9ca3af; }}
    .btn {{ display: inline-block; background: #111827; color: #fff; padding: 11px 24px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 600; margin-top: 8px; }}
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>{store_name}</h1>
      <p>Email Notifikasi Pesanan</p>
    </div>
    <div class="body">
      {content}
    </div>
    <div class="footer">
      Email ini dikirim otomatis oleh sistem {store_name}. Mohon tidak membalas email ini.
    </div>
  </div>
</body>
</html>"""


def _format_idr(amount: float) -> str:
    return f"Rp {int(amount):,}".replace(",", ".")


# ── Session-safe snapshots ─────────────────────────────────────────────────
# SQLAlchemy expires all ORM attributes on db.commit(). Snapshots convert
# the objects to plain Python so daemon threads never touch a closed session.

import types as _types


def snapshot_item(item, image_url: str = "") -> object:
    return _types.SimpleNamespace(
        product_name=item.product_name or "",
        variant_name=item.variant_name or "",
        price=float(item.price or 0),
        quantity=int(item.quantity or 1),
        weight=int(item.weight or 500),
        image_url=image_url or "",
    )


def snapshot_items_with_images(items, db) -> list:
    """Snapshot order items, enriching each with the product's primary_image when possible."""
    from app.models import Product
    from app.routes.products import resolve_primary_image
    out = []
    for it in items:
        url = ""
        try:
            if it.product_id:
                p = db.query(Product).filter(Product.id == it.product_id).first()
                if p:
                    url = resolve_primary_image(p) or ""
        except Exception:
            url = ""
        out.append(snapshot_item(it, image_url=url))
    return out


def snapshot_order(order, items=None) -> object:
    """
    Snapshot an ORM Order into a plain object.
    Pass `items` explicitly when the relationship is not yet loaded
    (e.g. right after create_order where items are built from raw dicts),
    or when items have already been snapshotted with extra fields like image_url.
    """
    if items is not None:
        # If items are already snapshot SimpleNamespace objects, keep them as-is
        # to preserve fields like image_url. Otherwise re-snapshot.
        snapped = [i if isinstance(i, _types.SimpleNamespace) else snapshot_item(i) for i in items]
    else:
        snapped = [snapshot_item(i) for i in list(order.items)]
    return _types.SimpleNamespace(
        id=order.id,
        total=float(order.total or 0),
        status=order.status or "",
        shipping_address=order.shipping_address or "",
        destination_contact_name=order.destination_contact_name or "",
        destination_contact_phone=order.destination_contact_phone or "",
        courier_company=order.courier_company or "",
        courier_service_name=order.courier_service_name or "",
        shipping_cost=float(order.shipping_cost or 0),
        shipping_etd=order.shipping_etd or "",
        waybill_id=order.waybill_id or "",
        tracking_url=order.tracking_url or "",
        items=snapped,
    )


def snapshot_user(user) -> object:
    return _types.SimpleNamespace(
        name=user.name or "",
        email=user.email or "",
        phone=getattr(user, "phone", "") or "",
    )


# ── Item dict snapshot (for raw dicts from order_items_data) ──────────────

def snapshot_item_from_dict(d: dict) -> object:
    return _types.SimpleNamespace(
        product_name=d.get("product_name", ""),
        variant_name=d.get("variant_name", "") or "",
        price=float(d.get("price", 0)),
        quantity=int(d.get("quantity", 1)),
        weight=int(d.get("weight", 500)),
    )


def _items_table(items: list) -> str:
    rows = ""
    for item in items:
        variant = f" ({item.variant_name})" if item.variant_name else ""
        subtotal = _format_idr(item.price * item.quantity)
        rows += f"""<tr>
          <td>{item.product_name}{variant}<br/><small style="color:#9ca3af">{item.quantity} x {_format_idr(item.price)}</small></td>
          <td style="text-align:right;white-space:nowrap">{subtotal}</td>
        </tr>"""
    return f"""<table class="items">
      <thead><tr><th>Produk</th><th style="text-align:right">Subtotal</th></tr></thead>
      <tbody>{rows}</tbody>
    </table>"""


def send_order_pending_email(order, user, seller_name: str = "Toko Online") -> bool:
    subject = f"Pesanan #{order.id[:8].upper()} – Menunggu Pembayaran | {seller_name}"
    items_table = _items_table(order.items)
    items_total = sum(item.price * item.quantity for item in order.items)
    shipping_cost = order.shipping_cost or 0
    content = f"""
    <div class="section">
      <p>Halo <strong>{user.name}</strong>,</p>
      <p>Terima kasih telah berbelanja di <strong>{seller_name}</strong>. Pesanan kamu sedang menunggu pembayaran.</p>
      <span class="badge badge-yellow">Menunggu Pembayaran</span>
    </div>

    <div class="section">
      <div class="section-title">Detail Pesanan</div>
      <p style="font-size:12px;color:#6b7280;margin-bottom:10px">Kode Pesanan: <strong>#{order.id[:8].upper()}</strong></p>
      {items_table}
      <div style="margin-top:12px">
        <div class="info-row"><span class="info-label">Subtotal Produk</span><span>{_format_idr(items_total)}</span></div>
        <div class="info-row"><span class="info-label">Ongkos Kirim ({(order.courier_company or '').upper()} {order.courier_service_name or ''})</span><span>{_format_idr(shipping_cost)}</span></div>
        <div class="info-row total-row"><span>Total Pembayaran</span><span>{_format_idr(order.total)}</span></div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Data Penerima</div>
      <div class="info-row"><span class="info-label">Nama</span><span>{order.destination_contact_name or user.name}</span></div>
      <div class="info-row"><span class="info-label">Telepon</span><span>{order.destination_contact_phone or user.phone or '-'}</span></div>
      <div class="info-row"><span class="info-label">Alamat Pengiriman</span><span style="text-align:right;max-width:60%">{order.shipping_address or '-'}</span></div>
    </div>

    <div class="note-box">
      ⏳ <strong>Segera lakukan pembayaran</strong> agar pesananmu dapat segera diproses oleh penjual.
      Masuk ke halaman <em>Pesanan Saya</em> dan klik tombol <em>Bayar Sekarang</em>.
    </div>
    """
    html = _base_template(content, seller_name)
    return _send_email(user.email, subject, html)


def send_order_paid_email(order, user, seller_name: str = "Toko Online") -> bool:
    subject = f"Pesanan #{order.id[:8].upper()} – Pembayaran Berhasil | {seller_name}"
    items_table = _items_table(order.items)
    items_total = sum(item.price * item.quantity for item in order.items)
    shipping_cost = order.shipping_cost or 0

    tracking_section = ""
    if order.waybill_id:
        tracking_url = order.tracking_url or ""
        tracking_btn = f'<br/><a href="{tracking_url}" class="btn">Lacak Paket</a>' if tracking_url else ""
        tracking_section = f"""
        <div class="section">
          <div class="section-title">Informasi Pengiriman</div>
          <div class="info-row"><span class="info-label">Kurir</span><span>{(order.courier_company or '').upper()} {order.courier_service_name or ''}</span></div>
          <div class="info-row"><span class="info-label">No. Resi</span><span><strong>{order.waybill_id}</strong></span></div>
          {tracking_btn}
        </div>"""
    else:
        tracking_section = """
        <div class="note-box">
          📦 Pesananmu sedang diproses oleh penjual dan akan segera dikirimkan. Nomor resi akan muncul setelah paket dikirim.
        </div>"""

    content = f"""
    <div class="section">
      <p>Halo <strong>{user.name}</strong>,</p>
      <p>Pembayaran pesananmu telah <strong>berhasil dikonfirmasi</strong>. Penjual akan segera memproses pesananmu.</p>
      <span class="badge badge-green">Pembayaran Berhasil</span>
    </div>

    <div class="section">
      <div class="section-title">Detail Pesanan</div>
      <p style="font-size:12px;color:#6b7280;margin-bottom:10px">Kode Pesanan: <strong>#{order.id[:8].upper()}</strong></p>
      {items_table}
      <div style="margin-top:12px">
        <div class="info-row"><span class="info-label">Subtotal Produk</span><span>{_format_idr(items_total)}</span></div>
        <div class="info-row"><span class="info-label">Ongkos Kirim</span><span>{_format_idr(shipping_cost)}</span></div>
        <div class="info-row total-row"><span>Total Pembayaran</span><span>{_format_idr(order.total)}</span></div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Alamat Pengiriman</div>
      <div class="info-row"><span class="info-label">Penerima</span><span>{order.destination_contact_name or user.name}</span></div>
      <div class="info-row"><span class="info-label">Alamat</span><span style="text-align:right;max-width:60%">{order.shipping_address or '-'}</span></div>
    </div>

    {tracking_section}
    """
    html = _base_template(content, seller_name)
    return _send_email(user.email, subject, html)


def send_order_shipped_email(order, user, seller_name: str = "Toko Online") -> bool:
    subject = f"Pesanan #{order.id[:8].upper()} – Paket Sedang Dikirim | {seller_name}"
    tracking_url = order.tracking_url or ""
    tracking_btn = f'<br/><a href="{tracking_url}" class="btn">Lacak Paket</a>' if tracking_url else ""
    courier_name = f"{(order.courier_company or '').upper()} {order.courier_service_name or ''}".strip()
    items_table = _items_table(order.items)
    content = f"""
    <div class="section">
      <p>Halo <strong>{user.name}</strong>,</p>
      <p>Paket pesananmu sudah <strong>dikirimkan</strong> oleh penjual. Pantau terus pengirimannya ya!</p>
      <span class="badge badge-blue">Paket Dikirim</span>
    </div>

    <div class="section">
      <div class="section-title">Informasi Pengiriman</div>
      <div class="info-row"><span class="info-label">Kurir</span><span>{courier_name or '-'}</span></div>
      <div class="info-row"><span class="info-label">No. Resi</span><span><strong>{order.waybill_id or '-'}</strong></span></div>
      <div class="info-row"><span class="info-label">Estimasi Tiba</span><span>{order.shipping_etd or '-'}</span></div>
      {tracking_btn}
    </div>

    <div class="section">
      <div class="section-title">Alamat Tujuan</div>
      <div class="info-row"><span class="info-label">Penerima</span><span>{order.destination_contact_name or user.name}</span></div>
      <div class="info-row"><span class="info-label">Alamat</span><span style="text-align:right;max-width:60%">{order.shipping_address or '-'}</span></div>
    </div>

    <div class="section">
      <div class="section-title">Ringkasan Pesanan</div>
      <p style="font-size:12px;color:#6b7280;margin-bottom:10px">Kode Pesanan: <strong>#{order.id[:8].upper()}</strong></p>
      {items_table}
    </div>

    <div class="note-box" style="background:#eff6ff;border-color:#bfdbfe;color:#1e40af">
      📦 Klik tombol di atas untuk melacak paketmu secara real-time.
    </div>
    """
    html = _base_template(content, seller_name)
    return _send_email(user.email, subject, html)


def send_order_ready_pickup_email(order, user, seller_name: str = "Toko Online") -> bool:
    subject = f"Pesanan #{order.id[:8].upper()} – Siap Diambil di Toko | {seller_name}"
    items_table = _items_table(order.items)
    content = f"""
    <div class="section">
      <p>Halo <strong>{user.name}</strong>,</p>
      <p>Pesananmu sudah <strong>siap diambil</strong> di toko kami. Silakan datang ke toko untuk mengambil barangmu ya!</p>
      <span class="badge badge-green">Siap Diambil</span>
    </div>

    <div class="section">
      <div class="section-title">Ringkasan Pesanan</div>
      <p style="font-size:12px;color:#6b7280;margin-bottom:10px">Kode Pesanan: <strong>#{order.id[:8].upper()}</strong></p>
      {items_table}
      <div style="margin-top:12px">
        <div class="info-row total-row"><span>Total</span><span>{_format_idr(order.total)}</span></div>
      </div>
    </div>

    <div class="note-box" style="background:#f0fdf4;border-color:#bbf7d0;color:#166534">
      🏪 Tunjukkan kode pesanan ini saat mengambil barang di toko.
    </div>
    """
    html = _base_template(content, seller_name)
    return _send_email(user.email, subject, html)


def send_order_completed_email(order, user, seller_name: str = "Toko Online") -> bool:
    subject = f"Pesanan #{order.id[:8].upper()} – Barang Telah Diterima | {seller_name}"
    items_table = _items_table(order.items)
    content = f"""
    <div class="section">
      <p>Halo <strong>{user.name}</strong>,</p>
      <p>Pesananmu telah <strong>diterima</strong>. Terima kasih sudah berbelanja di <strong>{seller_name}</strong>! 🎉</p>
      <span class="badge badge-blue">Pesanan Selesai</span>
    </div>

    <div class="section">
      <div class="section-title">Ringkasan Pesanan</div>
      <p style="font-size:12px;color:#6b7280;margin-bottom:10px">Kode Pesanan: <strong>#{order.id[:8].upper()}</strong></p>
      {items_table}
      <div style="margin-top:12px">
        <div class="info-row total-row"><span>Total</span><span>{_format_idr(order.total)}</span></div>
      </div>
    </div>

    <div class="note-box" style="background:#f0fdf4;border-color:#bbf7d0;color:#166534">
      ✅ Semoga produk yang kamu terima sesuai harapan. Sampai jumpa di pembelian berikutnya!
    </div>
    """
    html = _base_template(content, seller_name)
    return _send_email(user.email, subject, html)


def _shopee_items_html(items: list, base_url: str = "") -> str:
    rows = ""
    for it in items:
        variant_name = getattr(it, "variant_name", "") or ""
        image_url = getattr(it, "image_url", "") or ""
        variant = f'<div class="product-variant">Variasi: {variant_name}</div>' if variant_name else ""
        if image_url:
            img_src = image_url if image_url.startswith("http") else f"{base_url}{image_url}"
            img_html = f'<img src="{img_src}" alt="" class="product-thumb" />'
        else:
            img_html = '<svg width="32" height="32" viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="4" fill="#F0F0F0"/><rect x="8" y="11" width="16" height="10" rx="2" fill="#BDBDBD"/></svg>'
        rows += f"""
        <div class="product-row">
          <div class="product-img">{img_html}</div>
          <div class="product-detail">
            <div class="product-name">{it.product_name}</div>
            {variant}
          </div>
          <div class="product-side">
            <div class="product-price">{_format_idr(it.price * it.quantity)}</div>
            <div class="product-qty">x{it.quantity}</div>
          </div>
        </div>"""
    return rows


def send_seller_order_delivered_email(order, buyer, seller_name: str, seller_email: str, base_url: str = "") -> bool:
    """
    Email notifikasi ke email seller saat pesanan diterima pembeli.
    Mengikuti format Shopee Seller agar mudah diparsing oleh sistem stok seller.
    """
    if not seller_email:
        print(f"[Email] Skipping seller delivered email — notification_email kosong")
        return False

    short_id = order.id[:8].upper()
    order_no = f"#{short_id}"
    subject = f"[{seller_name} Seller] Pesanan {order_no} Telah Diterima Pembeli"

    items_total = sum(it.price * it.quantity for it in order.items)
    shipping_cost = float(order.shipping_cost or 0)
    discount = 0.0
    payment_method = "Midtrans" if getattr(order, "midtrans_order_id", None) else "Transfer / COD"

    from datetime import datetime as _dt
    now_str = _dt.now().strftime("%d %B %Y, %H:%M WIB")
    items_html = _shopee_items_html(order.items, base_url=base_url)
    courier_full = f"{(order.courier_company or '').upper()} {order.courier_service_name or ''}".strip() or "-"
    waybill = order.waybill_id or "-"
    recipient = order.destination_contact_name or buyer.name or "-"
    address = order.shipping_address or "-"

    html = f"""<!DOCTYPE html>
<html lang="id"><head><meta charset="UTF-8"/><style>
body {{ font-family: Arial, Helvetica, sans-serif; background:#f5f5f5; margin:0; padding:0; color:#222; }}
.email-wrap {{ max-width:600px; margin:24px auto; }}
.email-shell {{ background:#fff; border:1px solid #e5e5e5; border-radius:8px; overflow:hidden; }}
.shopee-header {{ background:#EE4D2D; padding:20px 24px 16px; }}
.shopee-logo-text {{ color:#fff; font-size:22px; font-weight:500; letter-spacing:1px; }}
.shopee-subheader {{ color:rgba(255,255,255,0.85); font-size:12px; margin-top:2px; }}
.email-body {{ padding:24px; background:#fff; }}
.status-badge {{ display:inline-block; background:#FFF0EB; color:#C13515; border-radius:20px; padding:6px 14px; font-size:13px; font-weight:500; margin-bottom:16px; border:1px solid #F0C8BA; }}
.greeting {{ font-size:15px; color:#222; margin-bottom:4px; font-weight:500; }}
.subtext {{ font-size:13px; color:#666; margin-bottom:20px; line-height:1.6; }}
.section-label {{ font-size:11px; font-weight:600; color:#666; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:8px; margin-top:16px; }}
.info-card {{ background:#fafafa; border-radius:8px; border:1px solid #eee; padding:14px 16px; margin-bottom:16px; }}
.info-row {{ display:flex; justify-content:space-between; align-items:flex-start; padding:6px 0; font-size:13px; gap:12px; }}
.info-row + .info-row {{ border-top:1px solid #eee; }}
.info-key {{ color:#666; flex-shrink:0; }}
.info-val {{ color:#222; text-align:right; }}
.product-row {{ display:flex; gap:12px; align-items:flex-start; padding:12px 0; }}
.product-row + .product-row {{ border-top:1px solid #eee; }}
.product-img {{ width:56px; height:56px; border-radius:8px; background:#f5f5f5; border:1px solid #eee; display:flex; align-items:center; justify-content:center; flex-shrink:0; overflow:hidden; }}
.product-thumb {{ width:100%; height:100%; object-fit:cover; }}
.product-detail {{ flex:1; min-width:0; }}
.product-name {{ font-size:13px; color:#222; font-weight:500; margin-bottom:2px; }}
.product-variant {{ font-size:12px; color:#666; }}
.product-side {{ text-align:right; white-space:nowrap; }}
.product-price {{ font-size:13px; color:#222; }}
.product-qty {{ font-size:12px; color:#666; }}
.total-row {{ display:flex; justify-content:space-between; align-items:center; padding:8px 0; font-size:13px; }}
.total-row.grand {{ border-top:1px solid #eee; margin-top:4px; padding-top:12px; }}
.grand .total-label {{ font-weight:600; font-size:14px; color:#222; }}
.grand .total-val {{ font-weight:600; font-size:14px; color:#EE4D2D; }}
.footer {{ background:#fafafa; border-top:1px solid #eee; padding:16px 24px; font-size:11px; color:#666; line-height:1.6; text-align:center; }}
.mono {{ font-family: Menlo, Consolas, monospace; font-size:12px; }}
</style></head><body>
<div class="email-wrap"><div class="email-shell">
  <div class="shopee-header">
    <div class="shopee-logo-text">{seller_name}</div>
    <div class="shopee-subheader">Notifikasi Toko — {seller_name} Seller</div>
  </div>
  <div class="email-body">
    <div class="status-badge">● Pesanan Selesai</div>
    <div class="greeting">Halo, {seller_name}!</div>
    <div class="subtext">Pembeli telah mengkonfirmasi bahwa pesanan berikut sudah diterima.</div>

    <div class="section-label">Detail Pesanan</div>
    <div class="info-card">
      <div class="info-row"><span class="info-key">No. Pesanan</span><span class="info-val mono">{order_no}</span></div>
      <div class="info-row"><span class="info-key">Tanggal Diterima</span><span class="info-val">{now_str}</span></div>
      <div class="info-row"><span class="info-key">Metode Pembayaran</span><span class="info-val">{payment_method}</span></div>
      <div class="info-row"><span class="info-key">Pembeli</span><span class="info-val">{buyer.name} &lt;{buyer.email}&gt;</span></div>
    </div>

    <div class="section-label">Produk</div>
    <div class="info-card">{items_html}</div>

    <div class="info-card">
      <div class="total-row"><span class="info-key">Subtotal Produk</span><span class="info-val">{_format_idr(items_total)}</span></div>
      <div class="total-row"><span class="info-key">Ongkos Kirim ({courier_full})</span><span class="info-val">{_format_idr(shipping_cost)}</span></div>
      <div class="total-row grand"><span class="total-label">Total Pesanan</span><span class="total-val">{_format_idr(order.total)}</span></div>
    </div>

    <div class="section-label">Informasi Pengiriman</div>
    <div class="info-card">
      <div class="info-row"><span class="info-key">Kurir</span><span class="info-val">{courier_full}</span></div>
      <div class="info-row"><span class="info-key">No. Resi</span><span class="info-val mono">{waybill}</span></div>
      <div class="info-row"><span class="info-key">Penerima</span><span class="info-val">{recipient}</span></div>
      <div class="info-row"><span class="info-key">Alamat</span><span class="info-val" style="max-width:260px">{address}</span></div>
    </div>
  </div>
  <div class="footer">
    Email ini dikirim otomatis oleh sistem {seller_name}. Mohon tidak membalas email ini.<br>
    © {_dt.now().year} {seller_name}.
  </div>
</div></div></body></html>"""
    return _send_email(seller_email, subject, html)
