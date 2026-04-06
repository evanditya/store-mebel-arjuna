"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Product { name: string; slug: string; price: number; stock: number; category: string; primary_image: string; sold_count: number; }
interface Order {
  id: string; total: number; status: string; created_at: string;
  courier_company?: string; courier_type?: string; courier_service_name?: string; shipping_cost?: number;
  waybill_id?: string; tracking_status?: string; biteship_order_id?: string; shipping_etd?: string;
  destination_contact_name?: string; shipping_address?: string;
  items: Array<{ product_name: string; quantity: number; price: number }>;
}


function formatPrice(price: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(price);
}

function ShippingBadge({ status }: { status?: string }) {
  const map: Record<string, { label: string; color: string }> = {
    confirmed: { label: "Dikonfirmasi", color: "bg-blue-100 text-blue-700" },
    allocated: { label: "Dialokasikan", color: "bg-blue-100 text-blue-700" },
    picking_up: { label: "Dijemput", color: "bg-yellow-100 text-yellow-700" },
    picked: { label: "Diambil", color: "bg-yellow-100 text-yellow-700" },
    dropping_off: { label: "Dalam Pengiriman", color: "bg-purple-100 text-purple-700" },
    delivered: { label: "Terkirim", color: "bg-green-100 text-green-700" },
    on_hold: { label: "Ditahan", color: "bg-gray-100 text-gray-700" },
    rejected: { label: "Ditolak", color: "bg-red-100 text-red-700" },
    cancelled: { label: "Dibatalkan", color: "bg-red-100 text-red-700" },
    returned: { label: "Dikembalikan", color: "bg-orange-100 text-orange-700" },
    disposed: { label: "Dibuang", color: "bg-gray-100 text-gray-700" },
  };
  if (!status) return null;
  const info = map[status] || { label: status, color: "bg-gray-100 text-gray-700" };
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${info.color}`}>{info.label}</span>;
}

export default function SellerDashboard() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [tab, setTab] = useState<"products" | "orders" | "settings">("products");
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<{ name: string; role: string } | null>(null);
  const [shippingLoading, setShippingLoading] = useState<string | null>(null);

  const [shippingAvailable, setShippingAvailable] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((data) => { if (!data.user || data.user.role !== "seller") { router.push("/login"); return; } setUser(data.user); });
    Promise.all([fetch("/api/products").then((r) => r.json()), fetch("/api/orders").then((r) => r.json())]).then(([prodData, orderData]) => { setProducts(prodData.products || []); setOrders(orderData.orders || []); setLoading(false); });
    fetch("/api/shipping/status").then((r) => r.json()).then((data) => setShippingAvailable(data.available)).catch(() => {});
  }, [router]);

  const handleDelete = async (slug: string) => { if (!confirm("Hapus produk ini?")) return; const res = await fetch(`/api/products/${slug}`, { method: "DELETE" }); if (res.ok) setProducts((prev) => prev.filter((p) => p.slug !== slug)); };
  const handleStatusChange = async (orderId: string, newStatus: string) => { await fetch(`/api/orders`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order_id: orderId, status: newStatus }) }); setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o))); };

  const handleCreateShipment = async (orderId: string) => {
    if (!confirm("Buat pengiriman untuk pesanan ini? Status akan berubah menjadi 'Dikirim'.")) return;
    setShippingLoading(orderId);
    try {
      const res = await fetch(`/api/shipping/create-order/${orderId}`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, status: "shipped", waybill_id: data.waybill_id, biteship_order_id: data.biteship_order_id, tracking_status: data.status } : o));
        alert(`Pengiriman berhasil dibuat!\nNo. Resi: ${data.waybill_id || 'Menunggu'}\nTracking: ${data.tracking_url || '-'}`);
      } else {
        alert(data.error || "Gagal membuat pengiriman");
      }
    } catch { alert("Terjadi kesalahan saat membuat pengiriman"); }
    setShippingLoading(null);
  };

  const handlePrintLabel = (orderId: string) => {
    window.open(`/api/shipping/label/${orderId}`, "_blank");
  };

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-gray-400">Memuat...</div></div>;

  const totalRevenue = orders.filter((o) => o.status === "paid" || o.status === "completed" || o.status === "shipped").reduce((s, o) => s + o.total, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-gray-400 hover:text-gray-600"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg></Link>
            <h1 className="text-lg font-bold">Dashboard Penjual</h1>
          </div>
          <span className="text-sm text-gray-500">{user?.name}</span>
        </div>
      </header>
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-lg border p-4"><p className="text-sm text-gray-500">Total Produk</p><p className="text-2xl font-bold" data-testid="text-total-products">{products.length}</p></div>
          <div className="bg-white rounded-lg border p-4"><p className="text-sm text-gray-500">Total Pesanan</p><p className="text-2xl font-bold" data-testid="text-total-orders">{orders.length}</p></div>
          <div className="bg-white rounded-lg border p-4"><p className="text-sm text-gray-500">Pendapatan</p><p className="text-2xl font-bold text-green-600" data-testid="text-revenue">{formatPrice(totalRevenue)}</p></div>
        </div>
        <div className="flex gap-2 mb-4">
          <button onClick={() => setTab("products")} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === "products" ? "bg-gray-900 text-white" : "bg-white border text-gray-700"}`} data-testid="tab-products">Produk ({products.length})</button>
          <button onClick={() => setTab("orders")} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === "orders" ? "bg-gray-900 text-white" : "bg-white border text-gray-700"}`} data-testid="tab-orders">Pesanan ({orders.length})</button>
          <button onClick={() => setTab("settings")} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === "settings" ? "bg-gray-900 text-white" : "bg-white border text-gray-700"}`} data-testid="tab-settings">Pengaturan</button>
        </div>
        {tab === "products" && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-bold text-lg">Daftar Produk</h2>
              <Link href="/seller/products/new" className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition" data-testid="button-add-product">+ Tambah Produk</Link>
            </div>
            <div className="space-y-2">
              {products.map((product) => (
                <div key={product.slug} className="bg-white rounded-lg border p-4 flex items-center gap-4" data-testid={`product-row-${product.slug}`}>
                  <img src={product.primary_image} alt="" className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium truncate">{product.name}</h3>
                    <p className="text-sm text-gray-500">{product.category}</p>
                    <div className="flex gap-4 mt-1 text-sm"><span className="text-red-600 font-medium">{formatPrice(product.price)}</span><span className="text-gray-400">Stok: {product.stock}</span><span className="text-gray-400">{product.sold_count} terjual</span></div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <Link href={`/seller/products/${product.slug}`} className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 transition" data-testid={`button-edit-${product.slug}`}>Edit</Link>
                    <button onClick={() => handleDelete(product.slug)} className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-sm hover:bg-red-100 transition" data-testid={`button-delete-${product.slug}`}>Hapus</button>
                  </div>
                </div>
              ))}
              {products.length === 0 && <div className="text-center py-12 text-gray-400">Belum ada produk</div>}
            </div>
          </div>
        )}
        {tab === "orders" && (
          <div className="space-y-2">
            {orders.map((order) => (
              <div key={order.id} className="bg-white rounded-lg border p-4" data-testid={`order-row-${order.id}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono text-gray-500">#{order.id.substring(0, 8)}</span>
                    {order.tracking_status && <ShippingBadge status={order.tracking_status} />}
                  </div>
                  <select value={order.status} onChange={(e) => handleStatusChange(order.id, e.target.value)} className="text-sm border rounded-lg px-2 py-1" data-testid={`select-status-${order.id}`}>
                    <option value="pending">Menunggu</option><option value="paid">Dibayar</option><option value="processing">Diproses</option><option value="shipped">Dikirim</option><option value="completed">Selesai</option><option value="cancelled">Dibatalkan</option>
                  </select>
                </div>
                {order.destination_contact_name && <p className="text-sm text-gray-600 mb-1">Penerima: {order.destination_contact_name}</p>}
                {order.shipping_address && <p className="text-xs text-gray-400 mb-2 truncate">Alamat: {order.shipping_address}</p>}
                <div className="space-y-1 mb-2">{order.items.map((item, i) => (<p key={i} className="text-sm">{item.product_name} x{item.quantity} - {formatPrice(item.price * item.quantity)}</p>))}</div>

                {order.courier_company && (
                  <div className="bg-gray-50 rounded-lg p-3 mb-2">
                    <div className="flex items-center gap-2 text-sm">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" /></svg>
                      <span className="font-medium">{order.courier_company.toUpperCase()}</span>
                      {order.courier_service_name && <span className="text-gray-400">- {order.courier_service_name}</span>}
                      {order.shipping_cost ? <span className="text-gray-500 ml-auto">{formatPrice(order.shipping_cost)}</span> : null}
                    </div>
                    {order.waybill_id && <p className="text-xs font-mono mt-1 text-gray-600">Resi: {order.waybill_id}</p>}
                    {order.shipping_etd && <p className="text-xs text-gray-400 mt-0.5">ETD: {order.shipping_etd}</p>}
                  </div>
                )}

                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-400">{new Date(order.created_at).toLocaleDateString("id-ID")}</span>
                  <div className="flex items-center gap-2">
                    {(order.status === "paid" || order.status === "processing") && !order.biteship_order_id && (
                      <button onClick={() => handleCreateShipment(order.id)} disabled={shippingLoading === order.id} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition disabled:opacity-50" data-testid={`button-ship-${order.id}`}>
                        {shippingLoading === order.id ? "Memproses..." : "Kirim Paket"}
                      </button>
                    )}
                    {(order.status === "shipped" || order.biteship_order_id) && (
                      <button onClick={() => handlePrintLabel(order.id)} className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-200 transition" data-testid={`button-label-${order.id}`}>
                        Cetak Label
                      </button>
                    )}
                    <span className="font-bold">{formatPrice(order.total)}</span>
                  </div>
                </div>
              </div>
            ))}
            {orders.length === 0 && <div className="text-center py-12 text-gray-400">Belum ada pesanan</div>}
          </div>
        )}
        {tab === "settings" && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg border p-6">
              <h2 className="font-bold text-lg mb-1">Profil, Alamat & Lokasi Pengiriman</h2>
              <p className="text-sm text-gray-500 mb-3">Kelola nama pengirim, telepon, alamat toko, dan lokasi origin pengiriman Biteship dari satu halaman.</p>
              {!shippingAvailable && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800 mb-4">
                  <p className="font-medium">Biteship belum dikonfigurasi</p>
                  <p className="mt-1">Tambahkan <code className="bg-yellow-100 px-1 rounded">BITESHIP_API_KEY</code> di Secrets tab untuk mengaktifkan fitur pengiriman.</p>
                </div>
              )}
              <a href="/change-password" className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition" data-testid="link-edit-profile">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                Edit Profil & Pengaturan
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
