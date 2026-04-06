"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface CartItem {
  id: string;
  product_slug: string;
  variant_name?: string;
  quantity: number;
  product: { name: string; price: number; primary_image: string; weight?: number; length?: number; width?: number; height?: number } | null;
}

interface Area {
  id: string;
  name: string;
  postal_code: number;
}

interface CourierRate {
  courier_company: string;
  courier_type: string;
  courier_name: string;
  service_name: string;
  description: string;
  price: number;
  etd: string;
  etd_unit: string;
}

interface UserData {
  name: string;
  phone: string;
  address: string;
  area_id: string;
  postal_code: string;
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(price);
}

declare global {
  interface Window {
    snap?: {
      pay: (token: string, options: { onSuccess?: (result: unknown) => void; onPending?: (result: unknown) => void; onError?: (result: unknown) => void; onClose?: () => void }) => void;
    };
  }
}

export default function CheckoutPage() {
  const router = useRouter();
  const [items, setItems] = useState<CartItem[]>([]);
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [address, setAddress] = useState("");
  const [areaQuery, setAreaQuery] = useState("");
  const [areas, setAreas] = useState<Area[]>([]);
  const [selectedArea, setSelectedArea] = useState<Area | null>(null);
  const [showAreaDropdown, setShowAreaDropdown] = useState(false);
  const [searchingAreas, setSearchingAreas] = useState(false);
  const [rates, setRates] = useState<CourierRate[]>([]);
  const [selectedRate, setSelectedRate] = useState<CourierRate | null>(null);
  const [loadingRates, setLoadingRates] = useState(false);
  const [ratesError, setRatesError] = useState("");
  const [shippingAvailable, setShippingAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [snapReady, setSnapReady] = useState(false);
  const [midtransClientKey, setMidtransClientKey] = useState("");
  const [midtransIsProduction, setMidtransIsProduction] = useState(false);
  const snapScriptRef = useRef<HTMLScriptElement | null>(null);
  const areaTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const pendingAutoFetch = useRef<{ id: string; postal_code: number } | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((data) => {
      if (!data.user) { router.push("/login"); return; }
      const u = data.user;
      setContactName(u.name || "");
      setContactPhone(u.phone || "");
      if (u.address) setAddress(u.address);
      if (u.area_id && u.area_name) {
        const restoredArea: Area = { id: u.area_id, name: u.area_name, postal_code: Number(u.postal_code) || 0 };
        setSelectedArea(restoredArea);
        setAreaQuery(u.area_name);
        pendingAutoFetch.current = { id: u.area_id, postal_code: Number(u.postal_code) || 0 };
      }
    });
    fetch("/api/cart").then((r) => r.json()).then((data) => {
      const cartItems = data.items || [];
      setItems(cartItems);
      setLoading(false);
      if (pendingAutoFetch.current && cartItems.length > 0) {
        const { id, postal_code } = pendingAutoFetch.current;
        pendingAutoFetch.current = null;
        fetchRatesWithItems(id, postal_code, cartItems);
      }
    });
    fetch("/api/shipping/status").then((r) => r.json()).then((data) => setShippingAvailable(data.available)).catch(() => {});
    fetch("/api/payment/client-key").then((r) => r.json()).then((data) => {
      if (data.client_key) {
        setMidtransClientKey(data.client_key);
        setMidtransIsProduction(data.is_production);
        const snapUrl = data.is_production ? "https://app.midtrans.com/snap/snap.js" : "https://app.sandbox.midtrans.com/snap/snap.js";
        const existing = document.querySelector(`script[src="${snapUrl}"]`);
        if (!existing) {
          const script = document.createElement("script");
          script.src = snapUrl;
          script.setAttribute("data-client-key", data.client_key);
          script.onload = () => setSnapReady(true);
          document.head.appendChild(script);
          snapScriptRef.current = script;
        } else {
          setSnapReady(true);
        }
      }
    }).catch(() => {});
  }, [router]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (areaRef.current && !areaRef.current.contains(e.target as Node)) setShowAreaDropdown(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const searchAreas = useCallback((q: string) => {
    if (areaTimeoutRef.current) clearTimeout(areaTimeoutRef.current);
    if (q.length < 3) { setAreas([]); setSearchingAreas(false); return; }
    setSearchingAreas(true);
    areaTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/shipping/areas?input=${encodeURIComponent(q)}`);
        const data = await res.json();
        setAreas(data.areas || []);
        setShowAreaDropdown(true);
      } catch { setAreas([]); }
      setSearchingAreas(false);
    }, 400);
  }, []);

  const handleAreaSelect = (area: Area) => {
    setSelectedArea(area);
    setAreaQuery(area.name);
    setShowAreaDropdown(false);
    setRates([]);
    setSelectedRate(null);
    fetchRates(area.id, area.postal_code);
  };

  const buildRateItems = (cartItems: CartItem[]) =>
    cartItems.map((item) => ({
      name: item.product?.name?.substring(0, 50) || "Produk",
      description: item.variant_name || "",
      value: Math.round(item.product?.price || 0),
      weight: item.product?.weight || 500,
      length: item.product?.length || 10,
      width: item.product?.width || 10,
      height: item.product?.height || 10,
      quantity: item.quantity,
    }));

  const fetchRatesWithItems = async (destAreaId: string, postalCode?: number, cartItems?: CartItem[]) => {
    setLoadingRates(true);
    setRatesError("");
    try {
      const rateItems = buildRateItems(cartItems ?? items);
      const payload: Record<string, unknown> = { destination_area_id: destAreaId, items: rateItems };
      if (postalCode) payload.destination_postal_code = postalCode;
      const res = await fetch("/api/shipping/rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.error) { setRatesError(data.error); setRates([]); }
      else { setRates(data.rates || []); }
    } catch {
      setRatesError("Gagal menghubungi server pengiriman");
      setRates([]);
    }
    setLoadingRates(false);
  };

  const fetchRates = (destAreaId: string, postalCode?: number) => fetchRatesWithItems(destAreaId, postalCode);

  const itemsTotal = items.reduce((sum, item) => sum + (item.product?.price || 0) * item.quantity, 0);
  const shippingCost = selectedRate?.price || 0;
  const grandTotal = itemsTotal + shippingCost;

  const handleCheckout = async () => {
    if (!contactName.trim()) { setError("Masukkan nama penerima"); return; }
    if (!contactPhone.trim()) { setError("Masukkan nomor telepon penerima"); return; }
    if (!address.trim()) { setError("Masukkan alamat pengiriman"); return; }
    if (shippingAvailable && !selectedArea) { setError("Pilih area tujuan pengiriman dari daftar yang muncul"); return; }
    if (shippingAvailable && !selectedRate) { setError("Pilih kurir pengiriman"); return; }
    setProcessing(true);
    setError("");

    try {
      const orderBody: Record<string, unknown> = {
        shipping_address: address,
        destination_contact_name: contactName,
        destination_contact_phone: contactPhone,
      };
      if (selectedArea) {
        orderBody.destination_area_id = selectedArea.id;
        orderBody.destination_postal_code = String(selectedArea.postal_code);
      }
      if (selectedRate) {
        orderBody.courier_company = selectedRate.courier_company;
        orderBody.courier_type = selectedRate.courier_type;
        orderBody.courier_service_name = `${selectedRate.courier_name} ${selectedRate.service_name}`;
        orderBody.shipping_cost = selectedRate.price;
        orderBody.shipping_etd = selectedRate.etd ? `${selectedRate.etd} ${selectedRate.etd_unit}` : "";
      }

      const orderRes = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(orderBody) });
      if (!orderRes.ok) { const data = await orderRes.json(); setError(data.error || "Gagal membuat pesanan"); setProcessing(false); return; }
      const { order } = await orderRes.json();

      if (midtransClientKey && snapReady) {
        const tokenRes = await fetch("/api/payment/token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order_id: order.id }) });
        if (!tokenRes.ok) {
          const data = await tokenRes.json();
          setError(data.hint ? `${data.error}. ${data.hint}` : data.error || "Gagal membuat token pembayaran");
          setProcessing(false);
          router.push("/orders");
          return;
        }
        const { token } = await tokenRes.json();
        const syncStatus = async (oid: string) => { try { await fetch(`/api/payment/status/${oid}`); } catch {} };
        if (window.snap && token) {
          window.snap.pay(token, {
            onSuccess: async () => { await syncStatus(order.id); router.push("/orders"); },
            onPending: async () => { await syncStatus(order.id); router.push("/orders"); },
            onError: async () => { await syncStatus(order.id); setError("Pembayaran gagal"); setProcessing(false); },
            onClose: async () => { await syncStatus(order.id); router.push("/orders"); },
          });
        } else { setError("Gagal memuat Snap payment"); setProcessing(false); }
      } else {
        router.push("/orders");
      }
    } catch {
      setError("Terjadi kesalahan");
      setProcessing(false);
    }
  };

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-gray-400">Memuat...</div></div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/cart" className="text-gray-400 hover:text-gray-600" data-testid="link-back-cart"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg></Link>
          <h1 className="text-lg font-bold">Checkout</h1>
        </div>
      </header>
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        {error && <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm" data-testid="text-checkout-error">{error}</div>}

        <div className="bg-white rounded-lg border p-4">
          <h2 className="font-bold mb-3">Penerima</h2>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <input value={contactName} onChange={(e) => setContactName(e.target.value)} className="px-4 py-2.5 border rounded-lg outline-none focus:ring-2 focus:ring-gray-900 text-sm" placeholder="Nama penerima" data-testid="input-contact-name" />
            <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className="px-4 py-2.5 border rounded-lg outline-none focus:ring-2 focus:ring-gray-900 text-sm" placeholder="No. telepon" data-testid="input-contact-phone" />
          </div>
          <textarea value={address} onChange={(e) => setAddress(e.target.value)} className="w-full px-4 py-2.5 border rounded-lg outline-none focus:ring-2 focus:ring-gray-900 text-sm" rows={2} placeholder="Alamat lengkap (jalan, RT/RW, kelurahan)" data-testid="input-address" />
        </div>

        {shippingAvailable && (
          <div className="bg-white rounded-lg border p-4">
            <div className="flex items-center gap-2 mb-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
              <h2 className="font-bold">Pengiriman</h2>
            </div>

            <div className="relative" ref={areaRef}>
              <label className="text-sm text-gray-500 mb-1.5 block">Cari Kecamatan / Kota Tujuan</label>
              <div className="relative">
                <input
                  value={areaQuery}
                  onChange={(e) => { setAreaQuery(e.target.value); setSelectedArea(null); setRates([]); setSelectedRate(null); searchAreas(e.target.value); }}
                  className={`w-full px-4 py-2.5 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm pr-10 ${selectedArea ? "border-green-400 bg-green-50" : ""}`}
                  placeholder="Ketik minimal 3 huruf, contoh: Bekasi, Cikarang, Gambir..."
                  data-testid="input-area-search"
                />
                {searchingAreas && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <div className="animate-spin h-4 w-4 border-2 border-gray-300 border-t-blue-600 rounded-full"></div>
                  </div>
                )}
                {selectedArea && !searchingAreas && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-green-600">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  </div>
                )}
              </div>
              {showAreaDropdown && areas.length > 0 && (
                <div className="absolute top-full left-0 right-0 bg-white border rounded-lg mt-1 max-h-56 overflow-y-auto z-30 shadow-lg">
                  {areas.map((area) => (
                    <button key={area.id} onClick={() => handleAreaSelect(area)} className="w-full text-left px-4 py-3 text-sm hover:bg-blue-50 border-b last:border-b-0 transition-colors" data-testid={`area-option-${area.id}`}>
                      <span className="font-medium">{area.name}</span>
                      <span className="text-gray-400 ml-2 text-xs">({area.postal_code})</span>
                    </button>
                  ))}
                </div>
              )}
              {showAreaDropdown && !searchingAreas && areas.length === 0 && areaQuery.length >= 3 && (
                <div className="absolute top-full left-0 right-0 bg-white border rounded-lg mt-1 z-30 shadow-lg">
                  <div className="px-4 py-3 text-sm text-gray-400 text-center">Tidak ditemukan area untuk &quot;{areaQuery}&quot;</div>
                </div>
              )}
              {selectedArea && <p className="text-xs text-green-600 mt-1.5 flex items-center gap-1"><svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg> Kode pos: {selectedArea.postal_code}</p>}
              {!selectedArea && areaQuery.length > 0 && areaQuery.length < 3 && (
                <p className="text-xs text-gray-400 mt-1.5">Ketik minimal 3 huruf untuk mencari...</p>
              )}
            </div>

            {selectedArea && (
              <div className="mt-4">
                <label className="text-sm text-gray-500 mb-2 block">Pilih Kurir Pengiriman</label>
                {loadingRates ? (
                  <div className="flex items-center justify-center py-8 gap-2">
                    <div className="animate-spin h-5 w-5 border-2 border-gray-300 border-t-blue-600 rounded-full"></div>
                    <span className="text-sm text-gray-400">Menghitung ongkir dari berbagai kurir...</span>
                  </div>
                ) : ratesError ? (
                  <div className="text-center py-6 text-red-500 text-sm border border-red-200 rounded-lg bg-red-50">
                    <p className="font-medium">Gagal mengambil ongkir</p>
                    <p className="text-xs mt-1 text-red-400">{ratesError}</p>
                    <button onClick={() => selectedArea && fetchRates(selectedArea.id, selectedArea.postal_code)} className="mt-2 text-xs text-blue-600 underline" data-testid="button-retry-rates">Coba lagi</button>
                  </div>
                ) : rates.length > 0 ? (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {rates.map((rate, i) => {
                      const isSelected = selectedRate?.courier_company === rate.courier_company && selectedRate?.courier_type === rate.courier_type;
                      return (
                        <button key={i} onClick={() => setSelectedRate(rate)} className={`w-full text-left p-3 rounded-lg border-2 transition ${isSelected ? "border-blue-600 bg-blue-50" : "border-gray-200 hover:border-gray-400"}`} data-testid={`rate-${rate.courier_company}-${rate.courier_type}`}>
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="font-medium text-sm">{rate.courier_name}</span>
                              <span className="text-gray-400 text-xs ml-2">{rate.service_name}</span>
                              {rate.etd && <p className="text-xs text-gray-500 mt-0.5">Estimasi: {rate.etd} {rate.etd_unit === "hours" ? "jam" : "hari"}</p>}
                            </div>
                            <span className="font-bold text-sm whitespace-nowrap ml-3">{formatPrice(rate.price)}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-6 text-gray-400 text-sm border rounded-lg bg-gray-50">
                    <p>Tidak ada kurir tersedia untuk tujuan ini.</p>
                    <p className="text-xs mt-1">Coba pilih area tujuan yang berbeda.</p>
                  </div>
                )}
              </div>
            )}

            {!selectedArea && (
              <div className="mt-3 bg-blue-50 rounded-lg p-3 text-sm text-blue-700 flex items-start gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <span>Ketik nama kecamatan atau kota tujuan di kolom pencarian di atas, lalu <strong>pilih dari daftar</strong> yang muncul untuk melihat pilihan kurir dan ongkos kirim.</span>
              </div>
            )}
          </div>
        )}

        {!shippingAvailable && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
            <p className="font-medium mb-1">Pengiriman Belum Dikonfigurasi</p>
            <p>Ongkos kirim akan dihitung manual oleh penjual. Tambahkan <code className="bg-yellow-100 px-1 rounded">BITESHIP_API_KEY</code> di Secrets untuk mengaktifkan kalkulasi ongkir otomatis.</p>
          </div>
        )}

        <div className="bg-white rounded-lg border p-4">
          <h2 className="font-bold mb-3">Ringkasan Pesanan</h2>
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.id} className="flex gap-3 items-center">
                <img src={item.product?.primary_image || "/images/placeholder.svg"} alt="" className="w-12 h-12 rounded object-cover" />
                <div className="flex-1 min-w-0"><p className="text-sm truncate">{item.product?.name}</p>{item.variant_name && <p className="text-xs text-gray-400">{item.variant_name}</p>}</div>
                <span className="text-sm text-gray-500">x{item.quantity}</span>
                <span className="text-sm font-medium">{formatPrice((item.product?.price || 0) * item.quantity)}</span>
              </div>
            ))}
          </div>
          <div className="border-t mt-4 pt-3 space-y-1">
            <div className="flex justify-between text-sm"><span className="text-gray-500">Subtotal</span><span>{formatPrice(itemsTotal)}</span></div>
            {shippingAvailable && selectedRate && <div className="flex justify-between text-sm"><span className="text-gray-500">Ongkir ({selectedRate.courier_name})</span><span>{formatPrice(shippingCost)}</span></div>}
            {shippingAvailable && !selectedRate && <div className="flex justify-between text-sm"><span className="text-gray-400 italic">Ongkir</span><span className="text-gray-400 italic text-xs">Pilih kurir terlebih dahulu</span></div>}
            <div className="flex justify-between items-center pt-2 border-t">
              <span className="font-medium">Total</span>
              <span className="text-xl font-bold text-red-600" data-testid="text-checkout-total">{formatPrice(grandTotal)}</span>
            </div>
          </div>
        </div>

        {midtransClientKey ? (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
            <p className="font-medium mb-1">{midtransIsProduction ? "Pembayaran Online" : "Mode Sandbox Midtrans"}</p>
            <p>{midtransIsProduction ? "Klik tombol bayar untuk memulai pembayaran melalui Midtrans." : "Ini adalah mode testing. Gunakan kartu test untuk simulasi pembayaran."}</p>
          </div>
        ) : (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
            <p className="font-medium mb-1">Midtrans Belum Dikonfigurasi</p>
            <p>Pesanan akan dibuat dengan status &quot;menunggu pembayaran&quot;.</p>
          </div>
        )}

        <button onClick={handleCheckout} disabled={processing || items.length === 0} className="w-full bg-gray-900 text-white py-3 rounded-lg font-medium hover:bg-gray-800 transition disabled:opacity-50" data-testid="button-pay">
          {processing ? "Memproses..." : `Bayar ${formatPrice(grandTotal)}`}
        </button>
      </div>
    </div>
  );
}
