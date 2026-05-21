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


def _pickup_info_section(pickup_info: dict) -> str:
    """Build an HTML section showing store pickup schedule for pickup orders."""
    pi = pickup_info or {}
    days = pi.get("pickup_days") or []
    open_t = pi.get("pickup_open_time", "")
    close_t = pi.get("pickup_close_time", "")
    store_address = pi.get("store_address", "")
    store_phone = pi.get("store_phone", "")
    pickup_notes = pi.get("pickup_notes", "")
    rows = ""
    if days:
        rows += f'<div class="info-row"><span class="info-label">Hari Operasional</span><span>{", ".join(days)}</span></div>'
    if open_t and close_t:
        rows += f'<div class="info-row"><span class="info-label">Jam Operasional</span><span><strong>{open_t} – {close_t}</strong></span></div>'
    if store_address:
        rows += f'<div class="info-row"><span class="info-label">Alamat Toko</span><span style="text-align:right;max-width:60%">{store_address}</span></div>'
    if store_phone:
        rows += f'<div class="info-row"><span class="info-label">No. Telepon</span><span>{store_phone}</span></div>'
    if not rows:
        return ""
    notes_box = f'<div class="note-box" style="background:#fffbeb;border-color:#fde68a;color:#92400e;margin-top:10px">📝 {pickup_notes}</div>' if pickup_notes else ""
    return f"""
    <div class="section">
      <div class="section-title">Informasi Pengambilan di Toko</div>
      {rows}
      {notes_box}
    </div>"""


def send_order_pending_email(order, user, seller_name: str = "Toko Online", pickup_info: dict = None) -> bool:
    subject = f"Pesanan #{order.id[:8].upper()} – Menunggu Pembayaran | {seller_name}"
    items_table = _items_table(order.items)
    items_total = sum(item.price * item.quantity for item in order.items)
    shipping_cost = order.shipping_cost or 0
    is_pickup = (order.courier_service_name or "") == "Ambil di Toko" and not (order.courier_company or "")
    shipping_label = "Ambil di Toko (Gratis)" if is_pickup else f"Ongkos Kirim ({(order.courier_company or '').upper()} {order.courier_service_name or ''})"
    pickup_section = _pickup_info_section(pickup_info) if is_pickup and pickup_info else ""
    recipient_section = "" if is_pickup else f"""
    <div class="section">
      <div class="section-title">Data Penerima</div>
      <div class="info-row"><span class="info-label">Nama</span><span>{order.destination_contact_name or user.name}</span></div>
      <div class="info-row"><span class="info-label">Telepon</span><span>{order.destination_contact_phone or user.phone or '-'}</span></div>
      <div class="info-row"><span class="info-label">Alamat Pengiriman</span><span style="text-align:right;max-width:60%">{order.shipping_address or '-'}</span></div>
    </div>"""
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
        <div class="info-row"><span class="info-label">{shipping_label}</span><span>{_format_idr(shipping_cost)}</span></div>
        <div class="info-row total-row"><span>Total Pembayaran</span><span>{_format_idr(order.total)}</span></div>
      </div>
    </div>

    {recipient_section}
    {pickup_section}

    <div class="note-box">
      ⏳ <strong>Segera lakukan pembayaran</strong> agar pesananmu dapat segera diproses oleh penjual.
      Masuk ke halaman <em>Pesanan Saya</em> dan klik tombol <em>Bayar Sekarang</em>.
    </div>
    """
    html = _base_template(content, seller_name)
    return _send_email(user.email, subject, html)


def send_order_paid_email(order, user, seller_name: str = "Toko Online", pickup_info: dict = None) -> bool:
    subject = f"Pesanan #{order.id[:8].upper()} – Pembayaran Berhasil | {seller_name}"
    items_table = _items_table(order.items)
    items_total = sum(item.price * item.quantity for item in order.items)
    shipping_cost = order.shipping_cost or 0
    is_pickup = (order.courier_service_name or "") == "Ambil di Toko" and not (order.courier_company or "")

    if is_pickup:
        next_section = _pickup_info_section(pickup_info) if pickup_info else """
        <div class="note-box" style="background:#f0fdf4;border-color:#bbf7d0;color:#166534">
          🏪 Pesananmu akan segera dipersiapkan. Kamu akan mendapat notifikasi saat barang siap diambil.
        </div>"""
    elif order.waybill_id:
        tracking_url = order.tracking_url or ""
        tracking_btn = f'<br/><a href="{tracking_url}" class="btn">Lacak Paket</a>' if tracking_url else ""
        next_section = f"""
        <div class="section">
          <div class="section-title">Informasi Pengiriman</div>
          <div class="info-row"><span class="info-label">Kurir</span><span>{(order.courier_company or '').upper()} {order.courier_service_name or ''}</span></div>
          <div class="info-row"><span class="info-label">No. Resi</span><span><strong>{order.waybill_id}</strong></span></div>
          {tracking_btn}
        </div>"""
    else:
        next_section = """
        <div class="note-box">
          📦 Pesananmu sedang diproses oleh penjual dan akan segera dikirimkan. Nomor resi akan muncul setelah paket dikirim.
        </div>"""

    address_section = "" if is_pickup else f"""
    <div class="section">
      <div class="section-title">Alamat Pengiriman</div>
      <div class="info-row"><span class="info-label">Penerima</span><span>{order.destination_contact_name or user.name}</span></div>
      <div class="info-row"><span class="info-label">Alamat</span><span style="text-align:right;max-width:60%">{order.shipping_address or '-'}</span></div>
    </div>"""

    shipping_label = "Ambil di Toko (Gratis)" if is_pickup else "Ongkos Kirim"

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
        <div class="info-row"><span class="info-label">{shipping_label}</span><span>{_format_idr(shipping_cost)}</span></div>
        <div class="info-row total-row"><span>Total Pembayaran</span><span>{_format_idr(order.total)}</span></div>
      </div>
    </div>

    {address_section}
    {next_section}
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


def send_order_ready_pickup_email(order, user, seller_name: str = "Toko Online", pickup_info: dict = None) -> bool:
    subject = f"Pesanan #{order.id[:8].upper()} – Siap Diambil di Toko | {seller_name}"
    items_table = _items_table(order.items)
    pi = pickup_info or {}

    # Build pickup schedule section
    days = pi.get("pickup_days") or []
    open_t = pi.get("pickup_open_time", "")
    close_t = pi.get("pickup_close_time", "")
    store_address = pi.get("store_address", "")
    store_phone = pi.get("store_phone", "")
    pickup_notes = pi.get("pickup_notes", "")

    schedule_rows = ""
    if days:
        schedule_rows += f'<div class="info-row"><span class="info-label">Hari Operasional</span><span>{", ".join(days)}</span></div>'
    if open_t and close_t:
        schedule_rows += f'<div class="info-row"><span class="info-label">Jam Operasional</span><span><strong>{open_t} – {close_t}</strong></span></div>'
    elif open_t:
        schedule_rows += f'<div class="info-row"><span class="info-label">Jam Buka</span><span><strong>{open_t}</strong></span></div>'
    if store_address:
        schedule_rows += f'<div class="info-row"><span class="info-label">Alamat Toko</span><span style="text-align:right;max-width:60%">{store_address}</span></div>'
    if store_phone:
        schedule_rows += f'<div class="info-row"><span class="info-label">No. Telepon</span><span>{store_phone}</span></div>'

    pickup_section = ""
    if schedule_rows:
        pickup_section = f"""
    <div class="section">
      <div class="section-title">Informasi Pengambilan</div>
      {schedule_rows}
    </div>"""

    notes_box = ""
    if pickup_notes:
        notes_box = f"""
    <div class="note-box" style="background:#fffbeb;border-color:#fde68a;color:#92400e;margin-top:12px">
      📝 {pickup_notes}
    </div>"""

    content = f"""
    <div class="section">
      <p>Halo <strong>{user.name}</strong>,</p>
      <p>Pesananmu sudah <strong>siap diambil</strong> di toko kami. Silakan datang ke toko pada jam operasional untuk mengambil barangmu ya!</p>
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

    {pickup_section}

    <div class="note-box" style="background:#f0fdf4;border-color:#bbf7d0;color:#166534">
      🏪 Tunjukkan kode pesanan <strong>#{order.id[:8].upper()}</strong> saat mengambil barang di toko.
    </div>
    {notes_box}
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


def send_daily_report_email(to_email: str, stats: dict, seller_name: str = "Toko Online") -> bool:
    from datetime import date as _date
    d = stats.get("date", "")
    try:
        dt = _date.fromisoformat(d)
        days_id = ["Senin","Selasa","Rabu","Kamis","Jumat","Sabtu","Minggu"]
        months_id = ["","Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"]
        date_str = f"{days_id[dt.weekday()]}, {dt.day} {months_id[dt.month]} {dt.year}"
    except Exception:
        date_str = d

    subject = f"Laporan Harian {seller_name} — {date_str}"

    status_labels = {
        "pending": "Menunggu Bayar", "paid": "Dibayar", "processing": "Diproses",
        "ready_pickup": "Siap Diambil", "shipped": "Dikirim",
        "completed": "Selesai", "cancelled": "Dibatalkan",
    }
    status_colors = {
        "pending": "#f59e0b", "paid": "#3b82f6", "processing": "#8b5cf6",
        "ready_pickup": "#10b981", "shipped": "#06b6d4",
        "completed": "#6b7280", "cancelled": "#ef4444",
    }

    status_rows = ""
    for st, cnt in sorted(stats.get("status_counts", {}).items(), key=lambda x: -x[1]):
        color = status_colors.get(st, "#6b7280")
        label = status_labels.get(st, st)
        status_rows += f'<div class="info-row"><span class="info-label" style="color:{color};font-weight:600">{label}</span><span>{cnt} pesanan</span></div>'

    order_rows = ""
    for o in stats.get("orders", [])[:30]:
        items_str = ", ".join(f"{it['name']} x{it['qty']}" for it in o["items"])
        st_label = status_labels.get(o["status"], o["status"])
        st_color = status_colors.get(o["status"], "#6b7280")
        order_rows += f"""
        <tr>
          <td style="padding:8px 10px;font-family:monospace;font-size:12px;color:#6b7280;border-bottom:1px solid #f3f4f6">#{o['id']}</td>
          <td style="padding:8px 10px;font-size:13px;border-bottom:1px solid #f3f4f6">{o['buyer']}</td>
          <td style="padding:8px 10px;font-size:12px;color:#4b5563;border-bottom:1px solid #f3f4f6">{items_str}</td>
          <td style="padding:8px 10px;font-size:12px;color:#4b5563;border-bottom:1px solid #f3f4f6">{o['delivery']}</td>
          <td style="padding:8px 10px;font-size:13px;text-align:right;font-weight:600;border-bottom:1px solid #f3f4f6">{_format_idr(o['total'])}</td>
          <td style="padding:8px 10px;text-align:center;border-bottom:1px solid #f3f4f6"><span style="background:{st_color}22;color:{st_color};padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600">{st_label}</span></td>
        </tr>"""

    orders_table = f"""
    <table style="width:100%;border-collapse:collapse;font-family:sans-serif;margin-top:4px">
      <thead>
        <tr style="background:#f9fafb">
          <th style="padding:8px 10px;text-align:left;font-size:11px;color:#9ca3af;font-weight:600;border-bottom:1px solid #e5e7eb">ID</th>
          <th style="padding:8px 10px;text-align:left;font-size:11px;color:#9ca3af;font-weight:600;border-bottom:1px solid #e5e7eb">Pembeli</th>
          <th style="padding:8px 10px;text-align:left;font-size:11px;color:#9ca3af;font-weight:600;border-bottom:1px solid #e5e7eb">Produk</th>
          <th style="padding:8px 10px;text-align:left;font-size:11px;color:#9ca3af;font-weight:600;border-bottom:1px solid #e5e7eb">Pengiriman</th>
          <th style="padding:8px 10px;text-align:right;font-size:11px;color:#9ca3af;font-weight:600;border-bottom:1px solid #e5e7eb">Total</th>
          <th style="padding:8px 10px;text-align:center;font-size:11px;color:#9ca3af;font-weight:600;border-bottom:1px solid #e5e7eb">Status</th>
        </tr>
      </thead>
      <tbody>{order_rows}</tbody>
    </table>""" if order_rows else '<p style="color:#9ca3af;font-size:13px">Tidak ada pesanan hari ini.</p>'

    content = f"""
    <div class="section">
      <p style="font-size:12px;color:#9ca3af;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.05em">Laporan Otomatis</p>
      <h2 style="margin:0 0 4px;font-size:20px;color:#111827">{seller_name}</h2>
      <p style="font-size:15px;color:#374151;margin:0">{date_str}</p>
    </div>

    <div style="display:flex;gap:12px;margin:0 0 8px;flex-wrap:wrap">
      <div style="flex:1;min-width:140px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px 20px">
        <p style="margin:0 0 4px;font-size:11px;color:#16a34a;font-weight:700;text-transform:uppercase;letter-spacing:0.05em">Total Pesanan</p>
        <p style="margin:0;font-size:32px;font-weight:800;color:#15803d">{stats.get('total_orders', 0)}</p>
      </div>
      <div style="flex:1;min-width:140px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:16px 20px">
        <p style="margin:0 0 4px;font-size:11px;color:#2563eb;font-weight:700;text-transform:uppercase;letter-spacing:0.05em">Pendapatan Terkonfirmasi</p>
        <p style="margin:0;font-size:22px;font-weight:800;color:#1d4ed8">{_format_idr(stats.get('total_revenue', 0))}</p>
        <p style="margin:2px 0 0;font-size:10px;color:#60a5fa">Dari pesanan berbayar/dikirim/selesai</p>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Rincian per Status</div>
      {status_rows if status_rows else '<p style="color:#9ca3af;font-size:13px">Tidak ada data.</p>'}
    </div>

    <div class="section">
      <div class="section-title">Daftar Pesanan{' (30 terbaru)' if len(stats.get('orders', [])) > 30 else ''}</div>
      {orders_table}
    </div>

    <div class="note-box" style="background:#fafafa;border-color:#e5e7eb;color:#9ca3af;font-size:11px;margin-top:8px">
      📧 Email ini dikirim otomatis setiap hari pukul 23:00 WIB oleh sistem {seller_name}.
    </div>
    """
    html = _base_template(content, seller_name)
    return _send_email(to_email, subject, html)


