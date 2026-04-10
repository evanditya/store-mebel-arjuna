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
