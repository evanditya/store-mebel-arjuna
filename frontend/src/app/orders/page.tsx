"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface TrackingHistory {
  note: string;
  updated_at: string;
  status: string;
}

interface TrackingData {
  order_id: string;
  status: string;
  waybill_id: string;
  tracking_url: string;
  courier_company: string;
  history: TrackingHistory[];
}

interface Order {
  id: string;
  total: number;
  status: string;
  created_at: string;
  courier_company?: string;
  courier_service_name?: string;
  shipping_cost?: number;
  shipping_etd?: string;
  waybill_id?: string;
  tracking_status?: string;
  tracking_url?: string;
  items: Array<{ product_name: string; quantity: number; price: number; variant_name?: string }>;
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(price);
}

const statusLabels: Record<string, { label: string; color: string }> = {
  pending: { label: "Menunggu Pembayaran", color: "bg-yellow-100 text-yellow-800" },
  paid: { label: "Dibayar", color: "bg-green-100 text-green-800" },
  processing: { label: "Diproses", color: "bg-blue-100 text-blue-800" },
  shipped: { label: "Dikirim", color: "bg-purple-100 text-purple-800" },
  completed: { label: "Selesai", color: "bg-gray-100 text-gray-800" },
  cancelled: { label: "Dibatalkan", color: "bg-red-100 text-red-800" },
};

const trackingStatusLabels: Record<string, string> = {
  confirmed: "Dikonfirmasi",
  allocated: "Dialokasikan",
  picking_up: "Sedang Dijemput",
  picked: "Sudah Diambil",
  dropping_off: "Dalam Pengiriman",
  delivered: "Terkirim",
  on_hold: "Ditahan",
  rejected: "Ditolak",
  returned: "Dikembalikan",
};

declare global {
  interface Window {
    snap?: {
      pay: (token: string, options: { onSuccess?: (result: unknown) => void; onPending?: (result: unknown) => void; onError?: (result: unknown) => void; onClose?: () => void }) => void;
    };
  }
}

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [payingOrderId, setPayingOrderId] = useState<string | null>(null);
  const [snapReady, setSnapReady] = useState(false);
  const [midtransClientKey, setMidtransClientKey] = useState("");
  const [trackingOrderId, setTrackingOrderId] = useState<string | null>(null);
  const [trackingData, setTrackingData] = useState<TrackingData | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);

  const loadOrders = () => {
    fetch("/api/orders").then((r) => r.json()).then((data) => { setOrders(data.orders || []); setLoading(false); });
  };

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((data) => { if (!data.user) router.push("/login"); });
    loadOrders();
    fetch("/api/payment/client-key").then((r) => r.json()).then((data) => {
      if (data.client_key) {
        setMidtransClientKey(data.client_key);
        const snapUrl = data.is_production ? "https://app.midtrans.com/snap/snap.js" : "https://app.sandbox.midtrans.com/snap/snap.js";
        const existing = document.querySelector(`script[src="${snapUrl}"]`);
        if (!existing) { const script = document.createElement("script"); script.src = snapUrl; script.setAttribute("data-client-key", data.client_key); script.onload = () => setSnapReady(true); document.head.appendChild(script); } else { setSnapReady(true); }
      }
    }).catch(() => {});
  }, [router]);

  const handlePay = async (orderId: string) => {
    if (!midtransClientKey || !snapReady) return;
    setPayingOrderId(orderId);
    try {
      const tokenRes = await fetch("/api/payment/token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order_id: orderId }) });
      if (!tokenRes.ok) { setPayingOrderId(null); return; }
      const { token } = await tokenRes.json();
      const syncStatus = async () => { try { await fetch(`/api/payment/status/${orderId}`); } catch {} };
      if (window.snap && token) {
        window.snap.pay(token, {
          onSuccess: async () => { await syncStatus(); loadOrders(); setPayingOrderId(null); },
          onPending: async () => { await syncStatus(); loadOrders(); setPayingOrderId(null); },
          onError: async () => { await syncStatus(); loadOrders(); setPayingOrderId(null); },
          onClose: async () => { await syncStatus(); loadOrders(); setPayingOrderId(null); },
        });
      } else { setPayingOrderId(null); }
    } catch { setPayingOrderId(null); }
  };

  const handleTrack = async (orderId: string) => {
    if (trackingOrderId === orderId) { setTrackingOrderId(null); setTrackingData(null); return; }
    setTrackingOrderId(orderId);
    setTrackingLoading(true);
    try {
      const res = await fetch(`/api/shipping/track/${orderId}`);
      const data = await res.json();
      setTrackingData(data);
    } catch { setTrackingData(null); }
    setTrackingLoading(false);
  };

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-gray-400">Memuat...</div></div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="text-gray-400 hover:text-gray-600"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg></Link>
          <h1 className="text-lg font-bold">Pesanan Saya</h1>
        </div>
      </header>
      <div className="max-w-3xl mx-auto px-4 py-6">
        {orders.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-400 mb-4">Belum ada pesanan</p>
            <Link href="/" className="bg-gray-900 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-800 transition">Mulai Belanja</Link>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((order) => {
              const st = statusLabels[order.status] || statusLabels.pending;
              const isPending = order.status === "pending";
              const isPaying = payingOrderId === order.id;
              const hasShipping = order.status === "shipped" || order.status === "completed" || !!order.waybill_id;
              const isTrackingOpen = trackingOrderId === order.id;
              return (
                <div key={order.id} className="bg-white rounded-lg border p-4" data-testid={`order-${order.id}`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-mono text-gray-500">#{order.id.substring(0, 8)}</span>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${st.color}`}>{st.label}</span>
                  </div>
                  <div className="space-y-2">
                    {order.items.map((item, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="text-gray-700">{item.product_name} x{item.quantity}{item.variant_name && <span className="text-gray-400"> ({item.variant_name})</span>}</span>
                        <span>{formatPrice(item.price * item.quantity)}</span>
                      </div>
                    ))}
                  </div>

                  {order.courier_company && (
                    <div className="bg-gray-50 rounded-lg p-3 mt-3">
                      <div className="flex items-center gap-2 text-sm">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" /></svg>
                        <span className="font-medium">{order.courier_company.toUpperCase()}</span>
                        {order.courier_service_name && <span className="text-gray-400 text-xs">- {order.courier_service_name}</span>}
                      </div>
                      {order.waybill_id && <p className="text-xs font-mono mt-1 text-gray-600">Resi: {order.waybill_id}</p>}
                      {order.shipping_cost ? <p className="text-xs text-gray-500 mt-0.5">Ongkir: {formatPrice(order.shipping_cost)}</p> : null}
                      {order.shipping_etd && <p className="text-xs text-gray-400 mt-0.5">Estimasi: {order.shipping_etd}</p>}
                      {order.tracking_status && <p className="text-xs text-gray-500 mt-0.5">Status: {trackingStatusLabels[order.tracking_status] || order.tracking_status}</p>}
                    </div>
                  )}

                  <div className="border-t mt-3 pt-2 flex justify-between items-center">
                    <span className="text-xs text-gray-400">{new Date(order.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</span>
                    <span className="font-bold">{formatPrice(order.total)}</span>
                  </div>

                  {isPending && midtransClientKey && (
                    <button onClick={() => handlePay(order.id)} disabled={isPaying} className="mt-3 w-full bg-yellow-500 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-yellow-600 transition disabled:opacity-50" data-testid={`button-pay-${order.id}`}>
                      {isPaying ? "Memproses..." : "Bayar Sekarang"}
                    </button>
                  )}

                  {hasShipping && (
                    <button onClick={() => handleTrack(order.id)} className="mt-2 w-full border border-gray-200 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition text-gray-700" data-testid={`button-track-${order.id}`}>
                      {isTrackingOpen ? "Tutup Tracking" : "Lacak Pengiriman"}
                    </button>
                  )}

                  {isTrackingOpen && (
                    <div className="mt-3 bg-gray-50 rounded-lg p-4">
                      {trackingLoading ? (
                        <p className="text-sm text-gray-400 text-center">Memuat tracking...</p>
                      ) : trackingData ? (
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-medium">Status: {trackingStatusLabels[trackingData.status] || trackingData.status}</span>
                            {trackingData.tracking_url && (
                              <a href={trackingData.tracking_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">Buka di web kurir</a>
                            )}
                          </div>
                          {trackingData.waybill_id && <p className="text-xs font-mono text-gray-600 mb-3">Resi: {trackingData.waybill_id}</p>}
                          {trackingData.history && trackingData.history.length > 0 ? (
                            <div className="space-y-3">
                              {[...trackingData.history].sort((a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime()).map((h, idx) => (
                                <div key={idx} className="flex gap-3 text-sm">
                                  <div className="flex flex-col items-center">
                                    <div className={`w-2.5 h-2.5 rounded-full ${idx === 0 ? "bg-blue-600" : "bg-gray-300"}`} />
                                    {idx < trackingData.history.length - 1 && <div className="w-0.5 flex-1 bg-gray-200 mt-1" />}
                                  </div>
                                  <div className="pb-3">
                                    <p className="text-gray-800">{h.note || trackingStatusLabels[h.status] || h.status}</p>
                                    {h.updated_at && <p className="text-xs text-gray-400 mt-0.5">{new Date(h.updated_at).toLocaleString("id-ID")}</p>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-gray-400">Belum ada riwayat tracking</p>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-400 text-center">Gagal memuat tracking</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
