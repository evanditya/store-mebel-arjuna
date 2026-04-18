"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
const BannerCropper = dynamic(() => import("@/components/BannerCropper"), { ssr: false });

interface Product { name: string; slug: string; price: number; stock: number; category: string; primary_image: string; sold_count: number; }
interface Banner {
  id: number;
  image_url: string;
  title?: string;
  link?: string;
  order: number;
  is_active: boolean;
}
interface Order {
  id: string; total: number; status: string; created_at: string;
  courier_company?: string; courier_type?: string; courier_service_name?: string; shipping_cost?: number;
  waybill_id?: string; tracking_status?: string; biteship_order_id?: string; shipping_etd?: string;
  destination_contact_name?: string; shipping_address?: string;
  items: Array<{ product_name: string; quantity: number; price: number }>;
}

interface TrackingHistory { note: string; updated_at: string; status: string; }
interface TrackingData {
  order_id: string; status: string; waybill_id: string; tracking_url: string;
  courier_company: string; history: TrackingHistory[];
}

const trackingStatusLabels: Record<string, string> = {
  confirmed: "Dikonfirmasi", allocated: "Dialokasikan", picking_up: "Sedang Dijemput",
  picked: "Sudah Diambil", dropping_off: "Dalam Pengiriman", delivered: "Terkirim",
  on_hold: "Ditahan", rejected: "Ditolak", returned: "Dikembalikan",
};


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

function SortableBannerItem({
  banner,
  onToggle,
  onDelete,
  titleVal,
  linkVal,
  onTitleChange,
  onLinkChange,
  onSave,
}: {
  banner: Banner;
  onToggle: (id: number, val: boolean) => void;
  onDelete: (id: number) => void;
  titleVal: string;
  linkVal: string;
  onTitleChange: (val: string) => void;
  onLinkChange: (val: string) => void;
  onSave: (id: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: banner.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div ref={setNodeRef} style={style} className="bg-white border rounded-xl overflow-hidden">
      <div className="flex gap-3 items-start p-3">
        <div
          {...attributes}
          {...listeners}
          className="mt-1 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 flex-shrink-0 select-none touch-none"
          title="Drag untuk ubah urutan"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
          </svg>
        </div>
        <img
          src={banner.image_url}
          alt={banner.title || "Banner"}
          className="w-28 h-10 object-cover rounded-lg border flex-shrink-0"
          style={{ aspectRatio: "3/1" }}
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
        />
        <div className="flex-1 min-w-0 space-y-1.5">
          <input
            value={titleVal}
            onChange={(e) => onTitleChange(e.target.value)}
            onBlur={() => onSave(banner.id)}
            placeholder="Judul banner (opsional)"
            className="w-full border rounded-lg px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-gray-900"
          />
          <input
            value={linkVal}
            onChange={(e) => onLinkChange(e.target.value)}
            onBlur={() => onSave(banner.id)}
            placeholder="Link URL (opsional)"
            className="w-full border rounded-lg px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <div className="flex flex-col items-center gap-2 flex-shrink-0">
          <button
            onClick={() => onToggle(banner.id, !banner.is_active)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${banner.is_active ? "bg-gray-900" : "bg-gray-200"}`}
            title={banner.is_active ? "Nonaktifkan" : "Aktifkan"}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${banner.is_active ? "translate-x-6" : "translate-x-1"}`} />
          </button>
          <span className="text-xs text-gray-400">{banner.is_active ? "Aktif" : "Nonaktif"}</span>
        </div>
        <button
          onClick={() => onDelete(banner.id)}
          className="text-gray-400 hover:text-red-500 transition flex-shrink-0 mt-0.5"
          title="Hapus banner"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default function SellerDashboard() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [productPage, setProductPage] = useState(1);
  const [productTotal, setProductTotal] = useState(0);
  const [productTotalPages, setProductTotalPages] = useState(1);
  const [productLoading, setProductLoading] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [tab, setTab] = useState<"products" | "orders" | "banners" | "settings">("products");
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<{ name: string; role: string } | null>(null);
  const [shippingLoading, setShippingLoading] = useState<string | null>(null);
  const [trackingOrderId, setTrackingOrderId] = useState<string | null>(null);
  const [trackingData, setTrackingData] = useState<TrackingData | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [excelImporting, setExcelImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ total: number; updated: number; skipped: number; detail?: { produk_diperbarui: number; produk_tidak_berubah: number; varian_diperbarui: number; varian_tidak_berubah: number }; not_found: string[]; not_found_count: number; errors: { row: number; name: string; error: string }[]; error_count: number } | null>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);
  const productMounted = useRef(false);

  const [shippingAvailable, setShippingAvailable] = useState(false);
  const [allCouriers, setAllCouriers] = useState<{ code: string; name: string }[]>([]);
  const [allowedCouriers, setAllowedCouriers] = useState<string[]>([]);
  const [courierSaving, setCourierSaving] = useState(false);
  const [courierMsg, setCourierMsg] = useState("");

  const [banners, setBanners] = useState<Banner[]>([]);
  const [showCropper, setShowCropper] = useState(false);
  const [bannerForms, setBannerForms] = useState<Record<number, { title: string; link: string }>>({});
  const [savingOrder, setSavingOrder] = useState(false);
  const bannerSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const FONT_OPTIONS = ["", "Poppins", "Inter", "Roboto", "Lato", "Montserrat", "Open Sans", "Nunito", "Playfair Display"];
  const [brandingForm, setBrandingForm] = useState({
    site_name: "",
    seller_name: "",
    logo: "",
    banner: "",
    colors: ["", "", ""],
    font: "",
    favicon: "",
    pickup_enabled: false,
    pickup_open: "08:00",
    pickup_close: "17:00",
  });
  const [brandingSaving, setBrandingSaving] = useState(false);
  const [brandingMsg, setBrandingMsg] = useState("");
  const [pickupSaving, setPickupSaving] = useState(false);
  const [pickupMsg, setPickupMsg] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);

  // Dynamically load the selected Google Font so the preview works in all browsers (including Safari)
  useEffect(() => {
    const font = brandingForm.font;
    if (!font) return;
    const id = `gfont-preview-${font.replace(/\s+/g, "-")}`;
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font)}:wght@400;500;600;700&display=swap`;
    document.head.appendChild(link);
  }, [brandingForm.font]);

  const loadProducts = async (page: number, search: string) => {
    setProductLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    if (search.trim()) params.set("search", search.trim());
    const res = await fetch(`/api/products?${params}`);
    const data = await res.json();
    setProducts(data.products || []);
    setProductTotal(data.total || 0);
    setProductTotalPages(data.total_pages || 1);
    setProductPage(page);
    setProductLoading(false);
  };

  const loadBanners = async () => {
    const res = await fetch("/api/banners/all");
    if (!res.ok) return;
    const data: Banner[] = await res.json();
    setBanners(data);
    const forms: Record<number, { title: string; link: string }> = {};
    data.forEach((b) => { forms[b.id] = { title: b.title || "", link: b.link || "" }; });
    setBannerForms(forms);
  };

  const handleBannerDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = banners.findIndex((b) => b.id === active.id);
    const newIndex = banners.findIndex((b) => b.id === over.id);
    const reordered = arrayMove(banners, oldIndex, newIndex);
    setBanners(reordered);
    setSavingOrder(true);
    await fetch("/api/banners/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: reordered.map((b) => b.id) }),
    });
    setSavingOrder(false);
  };

  const handleBannerToggle = async (id: number, val: boolean) => {
    setBanners((prev) => prev.map((b) => (b.id === id ? { ...b, is_active: val } : b)));
    await fetch(`/api/banners/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: val }),
    });
  };

  const handleBannerDelete = async (id: number) => {
    if (!confirm("Hapus banner ini?")) return;
    setBanners((prev) => prev.filter((b) => b.id !== id));
    await fetch(`/api/banners/${id}`, { method: "DELETE" });
  };

  const handleBannerSave = async (id: number) => {
    const form = bannerForms[id];
    if (!form) return;
    await fetch(`/api/banners/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: form.title, link: form.link }),
    });
    setBanners((prev) => prev.map((b) => (b.id === id ? { ...b, title: form.title, link: form.link } : b)));
  };

  const handleCropperComplete = async (url: string) => {
    setShowCropper(false);
    const res = await fetch("/api/banners", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_url: url }),
    });
    if (res.ok) {
      const newBanner: Banner = await res.json();
      setBanners((prev) => [...prev, newBanner]);
      setBannerForms((prev) => ({ ...prev, [newBanner.id]: { title: "", link: "" } }));
    }
  };

  useEffect(() => {
    if (!productMounted.current) { productMounted.current = true; return; }
    const searchTimer = setTimeout(() => { loadProducts(1, productSearch); }, 350);
    return () => clearTimeout(searchTimer);
  }, [productSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((data) => { if (!data.user || data.user.role !== "seller") { router.push("/login"); return; } setUser(data.user); });
    Promise.all([loadProducts(1, ""), fetch("/api/orders").then((r) => r.json())]).then(([, orderData]: [void, { orders?: Order[] }]) => {
      const list = orderData?.orders || [];
      setOrders(list);
      setLoading(false);
      const shipped = list.filter((o) => o.status === "shipped");
      if (shipped.length > 0) {
        Promise.all(shipped.map((o) => fetch(`/api/shipping/track/${o.id}`).catch(() => null)))
          .then(() => fetch("/api/orders").then((r) => r.json()).then((d) => setOrders(d.orders || [])))
          .catch(() => {});
      }
    });
    fetch("/api/shipping/status").then((r) => r.json()).then((data) => {
      setShippingAvailable(data.available);
      if (data.available) {
        fetch("/api/shipping/couriers").then((r) => r.json()).then((d) => setAllCouriers(d.couriers || [])).catch(() => {});
        fetch("/api/shipping/allowed-couriers").then((r) => r.json()).then((d) => setAllowedCouriers(d.allowed_couriers || [])).catch(() => {});
      }
    }).catch(() => {});
    fetch("/api/branding").then((r) => r.json()).then((data) => {
      setBrandingForm({
        site_name: data.site_name || "",
        seller_name: data.seller_name || "",
        logo: data.logo || "",
        banner: data.banner || "",
        colors: [data.brand_colors?.[0] || "", data.brand_colors?.[1] || "", data.brand_colors?.[2] || ""],
        font: data.font || "",
        favicon: data.favicon || "",
        pickup_enabled: data.pickup_enabled || false,
        pickup_open: data.pickup_open_time || "08:00",
        pickup_close: data.pickup_close_time || "17:00",
      });
    }).catch(() => {});
    loadBanners();
  }, [router]);

  const toggleCourier = (code: string) => {
    setAllowedCouriers((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const saveCouriers = async () => {
    if (allowedCouriers.length === 0) { setCourierMsg("Pilih minimal satu kurir"); return; }
    setCourierSaving(true); setCourierMsg("");
    const res = await fetch("/api/shipping/allowed-couriers", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allowed_couriers: allowedCouriers }),
    });
    const data = await res.json();
    setCourierMsg(data.success ? "Kurir berhasil disimpan" : data.error || "Gagal menyimpan");
    setCourierSaving(false);
    setTimeout(() => setCourierMsg(""), 3000);
  };

  const saveBranding = async () => {
    setBrandingSaving(true);
    setBrandingMsg("");
    try {
      const res = await fetch("/api/branding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site_name: brandingForm.site_name,
          seller_name: brandingForm.seller_name,
          logo: brandingForm.logo,
          banner: brandingForm.banner,
          brand_colors: brandingForm.colors,
          font: brandingForm.font,
          favicon: brandingForm.favicon,
          pickup_enabled: brandingForm.pickup_enabled,
          pickup_open_time: brandingForm.pickup_open,
          pickup_close_time: brandingForm.pickup_close,
        }),
      });
      if (res.ok) {
        setBrandingMsg("Tampilan toko berhasil disimpan!");
      } else {
        setBrandingMsg("Gagal menyimpan.");
      }
    } catch {
      setBrandingMsg("Terjadi kesalahan.");
    }
    setBrandingSaving(false);
    setTimeout(() => setBrandingMsg(""), 3000);
  };

  const savePickup = async () => {
    setPickupSaving(true);
    setPickupMsg("");
    try {
      const res = await fetch("/api/branding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pickup_enabled: brandingForm.pickup_enabled,
          pickup_open_time: brandingForm.pickup_open,
          pickup_close_time: brandingForm.pickup_close,
        }),
      });
      if (res.ok) {
        setPickupMsg("Pengaturan berhasil disimpan!");
      } else {
        setPickupMsg("Gagal menyimpan.");
      }
    } catch {
      setPickupMsg("Terjadi kesalahan.");
    }
    setPickupSaving(false);
    setTimeout(() => setPickupMsg(""), 3000);
  };

  const uploadImage = async (file: File, type: "logo" | "banner" | "favicon") => {
    if (type === "logo") setUploadingLogo(true);
    else if (type === "banner") setUploadingBanner(true);
    else setUploadingFavicon(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("image_type", type);
      const res = await fetch("/api/branding/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (data.url) {
        setBrandingForm((prev) => ({ ...prev, [type]: data.url }));
      }
    } catch {
      alert("Gagal mengupload gambar.");
    }
    if (type === "logo") setUploadingLogo(false);
    else if (type === "banner") setUploadingBanner(false);
    else setUploadingFavicon(false);
  };

  const handleDelete = async (slug: string) => { if (!confirm("Hapus produk ini?")) return; const res = await fetch(`/api/products/${slug}`, { method: "DELETE" }); if (res.ok) loadProducts(productPage, productSearch); };

  const handleExcelExport = () => { window.open("/api/products/export-excel", "_blank"); };

  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setExcelImporting(true);
    setImportResult(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch("/api/products/import-excel", { method: "POST", body: form });
      const data = await res.json();
      if (data.error) { alert(data.error); }
      else {
        setImportResult(data);
        await loadProducts(1, productSearch);
      }
    } catch { alert("Gagal mengimpor file"); }
    setExcelImporting(false);
  };
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
          <div className="bg-white rounded-lg border p-4"><p className="text-sm text-gray-500">Total Produk</p><p className="text-2xl font-bold" data-testid="text-total-products">{productTotal}</p></div>
          <div className="bg-white rounded-lg border p-4"><p className="text-sm text-gray-500">Total Pesanan</p><p className="text-2xl font-bold" data-testid="text-total-orders">{orders.length}</p></div>
          <div className="bg-white rounded-lg border p-4"><p className="text-sm text-gray-500">Pendapatan</p><p className="text-2xl font-bold text-green-600" data-testid="text-revenue">{formatPrice(totalRevenue)}</p></div>
        </div>
        <div className="flex gap-2 mb-4">
          <button onClick={() => setTab("products")} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === "products" ? "bg-gray-900 text-white" : "bg-white border text-gray-700"}`} data-testid="tab-products">Produk ({productTotal})</button>
          <button onClick={() => setTab("orders")} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === "orders" ? "bg-gray-900 text-white" : "bg-white border text-gray-700"}`} data-testid="tab-orders">Pesanan ({orders.length})</button>
          <button onClick={() => setTab("banners")} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === "banners" ? "bg-gray-900 text-white" : "bg-white border text-gray-700"}`} data-testid="tab-banners">Banner ({banners.length})</button>
          <button onClick={() => setTab("settings")} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === "settings" ? "bg-gray-900 text-white" : "bg-white border text-gray-700"}`} data-testid="tab-settings">Pengaturan</button>
        </div>
        {tab === "products" && (
          <div>
            <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
              <h2 className="font-bold text-lg">Daftar Produk</h2>
              <div className="flex flex-wrap gap-2">
                <button onClick={handleExcelExport} className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition flex items-center gap-1.5">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  Unduh Excel
                </button>
                <button onClick={() => excelInputRef.current?.click()} disabled={excelImporting} className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-1.5">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l4-4m0 0l4 4m-4-4v12" /></svg>
                  {excelImporting ? "Mengimpor..." : "Upload Excel"}
                </button>
                <input ref={excelInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleExcelImport} />
                <Link href="/seller/products/new" className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition" data-testid="button-add-product">+ Tambah Produk</Link>
              </div>
            </div>

            {importResult && (
              <div className="mb-4 rounded-xl border bg-white shadow-sm text-sm overflow-hidden">
                {/* Header */}
                <div className={`flex items-center justify-between px-4 py-3 ${importResult.error_count > 0 || importResult.not_found_count > 0 ? "bg-yellow-50 border-b border-yellow-200" : "bg-green-50 border-b border-green-200"}`}>
                  <div className="flex items-center gap-2">
                    {importResult.error_count === 0 && importResult.not_found_count === 0 ? (
                      <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    ) : (
                      <svg className="w-4 h-4 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                    )}
                    <span className="font-semibold text-gray-800">Laporan Import Excel</span>
                  </div>
                  <button onClick={() => setImportResult(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
                </div>

                {/* Stat boxes */}
                <div className="grid grid-cols-4 divide-x border-b">
                  <div className="px-3 py-3 text-center">
                    <p className="text-xs text-gray-500 mb-0.5">Total Baris</p>
                    <p className="text-2xl font-bold text-gray-800">{importResult.total}</p>
                  </div>
                  <div className="px-3 py-3 text-center">
                    <p className="text-xs text-gray-500 mb-0.5">Data Diubah</p>
                    <p className="text-2xl font-bold text-green-600">{importResult.updated}</p>
                  </div>
                  <div className="px-3 py-3 text-center">
                    <p className="text-xs text-gray-500 mb-0.5">Tidak Berubah</p>
                    <p className="text-2xl font-bold text-gray-400">{importResult.skipped ?? (importResult.total - importResult.updated - importResult.error_count - importResult.not_found_count)}</p>
                  </div>
                  <div className="px-3 py-3 text-center">
                    <p className="text-xs text-gray-500 mb-0.5">Gagal</p>
                    <p className={`text-2xl font-bold ${(importResult.error_count + importResult.not_found_count) > 0 ? "text-red-500" : "text-gray-400"}`}>
                      {importResult.error_count + importResult.not_found_count}
                    </p>
                  </div>
                </div>

                {/* Breakdown by sheet */}
                {importResult.detail && (
                  <div className="px-4 py-2.5 border-b bg-gray-50 text-xs text-gray-600">
                    <div className="flex flex-wrap gap-x-8 gap-y-1">
                      <span>📄 Sheet Produk — <strong className="text-green-700">{importResult.detail.produk_diperbarui} diubah</strong>, <span className="text-gray-400">{importResult.detail.produk_tidak_berubah} tidak berubah</span></span>
                      <span>🏷️ Sheet Varian — <strong className="text-green-700">{importResult.detail.varian_diperbarui} diubah</strong>, <span className="text-gray-400">{importResult.detail.varian_tidak_berubah} tidak berubah</span></span>
                    </div>
                  </div>
                )}

                {/* Not found list */}
                {importResult.not_found.length > 0 && (
                  <div className="px-4 py-3 border-b">
                    <p className="text-xs font-semibold text-orange-700 mb-2">
                      ⚠️ {importResult.not_found_count} nama produk tidak cocok (dilewati)
                    </p>
                    <div className="max-h-28 overflow-y-auto space-y-0.5">
                      {importResult.not_found.map((name, i) => (
                        <p key={i} className="text-xs text-orange-600 font-mono bg-orange-50 rounded px-2 py-0.5 truncate">{name}</p>
                      ))}
                    </div>
                  </div>
                )}

                {/* Error list */}
                {importResult.errors.length > 0 && (
                  <div className="px-4 py-3">
                    <p className="text-xs font-semibold text-red-700 mb-2">
                      ❌ {importResult.error_count} baris error
                    </p>
                    <div className="max-h-32 overflow-y-auto space-y-1">
                      {importResult.errors.map((e, i) => (
                        <div key={i} className="text-xs bg-red-50 rounded px-2 py-1.5">
                          <span className="text-red-400 font-mono mr-1">Baris {e.row}</span>
                          <span className="text-red-700 font-medium">{e.name}</span>
                          <span className="text-red-500 ml-1">→ {e.error}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="mb-3">
              <input
                type="text"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder={`Cari dari ${productTotal} produk...`}
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>

            {productLoading ? (
              <div className="text-center py-12 text-gray-400">Memuat produk...</div>
            ) : (
              <>
                <div className="space-y-2">
                  {products.map((product) => (
                    <div key={product.slug} className="bg-white rounded-lg border p-4 flex items-center gap-4" data-testid={`product-row-${product.slug}`}>
                      <img
                        src={product.primary_image || "/images/placeholder.svg"}
                        alt=""
                        className="w-16 h-16 rounded-lg object-cover flex-shrink-0 bg-gray-100"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).src = "/images/placeholder.svg"; }}
                      />
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
                  {products.length === 0 && (
                    <div className="text-center py-12 text-gray-400">{productSearch ? `Tidak ada produk yang cocok dengan "${productSearch}"` : "Belum ada produk"}</div>
                  )}
                </div>

                {productTotalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t">
                    <p className="text-sm text-gray-500">
                      Halaman {productPage} dari {productTotalPages} &nbsp;·&nbsp; {productTotal} produk
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => loadProducts(productPage - 1, productSearch)}
                        disabled={productPage <= 1}
                        className="px-3 py-1.5 rounded-lg border text-sm font-medium transition disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
                      >
                        ← Sebelumnya
                      </button>
                      <button
                        onClick={() => loadProducts(productPage + 1, productSearch)}
                        disabled={productPage >= productTotalPages}
                        className="px-3 py-1.5 rounded-lg border text-sm font-medium transition disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
                      >
                        Berikutnya →
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
        {tab === "orders" && (
          <div className="space-y-2">
            {orders.map((order) => (
              <div key={order.id} className="bg-white rounded-lg border p-4" data-testid={`order-row-${order.id}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-mono text-gray-500">#{order.id.substring(0, 8)}</span>
                    {order.courier_service_name === "Ambil di Toko" && !order.courier_company ? (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-medium">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                        Ambil di Toko
                      </span>
                    ) : order.courier_company ? (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-medium">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" /></svg>
                        {order.courier_company.toUpperCase()}
                      </span>
                    ) : null}
                    {order.tracking_status && <ShippingBadge status={order.tracking_status} />}
                  </div>
                  <select value={order.status} onChange={(e) => handleStatusChange(order.id, e.target.value)} className="text-sm border rounded-lg px-2 py-1" data-testid={`select-status-${order.id}`}>
                    <option value="pending">Menunggu</option><option value="paid">Dibayar</option><option value="processing">Diproses</option><option value="ready_pickup">Siap Diambil</option><option value="shipped">Dikirim</option><option value="completed">Selesai</option><option value="cancelled">Dibatalkan</option>
                  </select>
                </div>
                {order.destination_contact_name && <p className="text-sm text-gray-600 mb-1">Penerima: {order.destination_contact_name}</p>}
                {order.shipping_address && <p className="text-xs text-gray-400 mb-2 truncate">Alamat: {order.shipping_address}</p>}
                <div className="space-y-1 mb-2">{order.items.map((item, i) => (<p key={i} className="text-sm">{item.product_name} x{item.quantity} - {formatPrice(item.price * item.quantity)}</p>))}</div>

                {order.courier_service_name === "Ambil di Toko" && !order.courier_company ? (
                  <div className="bg-green-50 rounded-lg p-3 mb-2 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                    <span className="text-sm font-medium text-green-800">Ambil di Toko — Pembeli akan mengambil sendiri</span>
                  </div>
                ) : order.courier_company ? (
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
                ) : null}

                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-400">{new Date(order.created_at).toLocaleDateString("id-ID")}</span>
                  <div className="flex items-center gap-2">
                    {order.courier_service_name === "Ambil di Toko" && (order.status === "paid" || order.status === "processing") && (
                      <button onClick={() => handleStatusChange(order.id, "ready_pickup")} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 transition" data-testid={`button-ready-pickup-${order.id}`}>
                        Siap Diambil
                      </button>
                    )}
                    {order.courier_service_name === "Ambil di Toko" && order.status === "ready_pickup" && (
                      <button onClick={() => handleStatusChange(order.id, "completed")} className="px-3 py-1.5 bg-gray-600 text-white rounded-lg text-xs font-medium hover:bg-gray-700 transition" data-testid={`button-complete-pickup-${order.id}`}>
                        Tandai Selesai
                      </button>
                    )}
                    {order.courier_service_name !== "Ambil di Toko" && (order.status === "paid" || order.status === "processing") && !order.biteship_order_id && (
                      <button onClick={() => handleCreateShipment(order.id)} disabled={shippingLoading === order.id} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition disabled:opacity-50" data-testid={`button-ship-${order.id}`}>
                        {shippingLoading === order.id ? "Memproses..." : "Kirim Paket"}
                      </button>
                    )}
                    {order.courier_service_name !== "Ambil di Toko" && (order.status === "shipped" || order.biteship_order_id) && (
                      <button onClick={() => handlePrintLabel(order.id)} className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-200 transition" data-testid={`button-label-${order.id}`}>
                        Cetak Label
                      </button>
                    )}
                    {order.courier_service_name !== "Ambil di Toko" && (order.waybill_id || order.biteship_order_id) && (
                      <button onClick={() => handleTrack(order.id)} className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-200 transition" data-testid={`button-track-${order.id}`}>
                        {trackingOrderId === order.id ? "Tutup Info" : "Info Pengiriman"}
                      </button>
                    )}
                    <span className="font-bold">{formatPrice(order.total)}</span>
                  </div>
                </div>

                {trackingOrderId === order.id && (
                  <div className="mt-3 bg-gray-50 rounded-lg p-4">
                    {trackingLoading ? (
                      <p className="text-sm text-gray-400 text-center">Memuat info pengiriman...</p>
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
                      <p className="text-sm text-gray-400 text-center">Gagal memuat info pengiriman</p>
                    )}
                  </div>
                )}
              </div>
            ))}
            {orders.length === 0 && <div className="text-center py-12 text-gray-400">Belum ada pesanan</div>}
          </div>
        )}
        {tab === "banners" && (
          <div className="space-y-4">
            {showCropper && (
              <BannerCropper onComplete={handleCropperComplete} onClose={() => setShowCropper(false)} />
            )}
            <div className="bg-white rounded-lg border p-6">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h2 className="font-bold text-lg">Manajemen Banner</h2>
                  <p className="text-sm text-gray-500 mt-0.5">Upload, atur urutan, dan aktifkan/nonaktifkan banner toko. Rasio 3:1 (1200 × 400 px).</p>
                </div>
                <button
                  onClick={() => setShowCropper(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  Tambah Banner
                </button>
              </div>
              {savingOrder && <p className="text-xs text-gray-400 mb-2">Menyimpan urutan...</p>}
              {banners.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                  <div className="text-5xl mb-3">🖼️</div>
                  <p className="font-medium text-gray-500">Belum ada banner</p>
                  <p className="text-sm mt-1">Klik "Tambah Banner" untuk upload gambar pertama</p>
                </div>
              ) : (
                <DndContext sensors={bannerSensors} collisionDetection={closestCenter} onDragEnd={handleBannerDragEnd}>
                  <SortableContext items={banners.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-3 mt-4">
                      {banners.map((b) => (
                        <SortableBannerItem
                          key={b.id}
                          banner={b}
                          onToggle={handleBannerToggle}
                          onDelete={handleBannerDelete}
                          titleVal={bannerForms[b.id]?.title ?? ""}
                          linkVal={bannerForms[b.id]?.link ?? ""}
                          onTitleChange={(val) => setBannerForms((prev) => ({ ...prev, [b.id]: { ...prev[b.id], title: val } }))}
                          onLinkChange={(val) => setBannerForms((prev) => ({ ...prev, [b.id]: { ...prev[b.id], link: val } }))}
                          onSave={handleBannerSave}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
              <p className="text-xs text-gray-400 mt-4">Drag ≡ untuk mengubah urutan. Klik toggle untuk aktifkan/nonaktifkan. Judul & link tersimpan otomatis saat klik di luar kolom.</p>
            </div>
          </div>
        )}
        {tab === "settings" && (
          <div className="space-y-4">

            <div className="bg-white rounded-lg border p-6">
              <h2 className="font-bold text-lg mb-1">Tampilan Toko</h2>
              <p className="text-sm text-gray-500 mb-5">Atur nama, logo, warna, dan font toko. Untuk banner, gunakan tab <strong>Banner</strong>.</p>

              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nama Website</label>
                  <p className="text-xs text-gray-500 mb-2">Muncul di tab browser, meta title, dan hasil pencarian. Contoh: <span className="font-medium">Mebel Arjuna</span></p>
                  <input
                    value={brandingForm.site_name}
                    onChange={(e) => setBrandingForm((p) => ({ ...p, site_name: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900"
                    placeholder="Nama website (tampil di tab browser)"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nama Toko</label>
                  <p className="text-xs text-gray-500 mb-2">Muncul di navbar toko pembeli.</p>
                  <input
                    value={brandingForm.seller_name}
                    onChange={(e) => setBrandingForm((p) => ({ ...p, seller_name: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900"
                    placeholder="Nama toko Anda"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Logo Toko</label>
                  <p className="text-xs text-gray-500 mb-2">Ukuran rekomendasi: <span className="font-medium">500 × 500 px</span> — format kotak/bulat, maks. 2 MB</p>
                  <div className="flex items-start gap-4">
                    <div className="flex-1 space-y-2">
                      <input
                        value={brandingForm.logo}
                        onChange={(e) => setBrandingForm((p) => ({ ...p, logo: e.target.value }))}
                        className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900"
                        placeholder="https://... atau upload gambar"
                      />
                      <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f, "logo"); }} />
                      <button
                        onClick={() => logoInputRef.current?.click()}
                        disabled={uploadingLogo}
                        className="px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-50 transition disabled:opacity-50"
                      >
                        {uploadingLogo ? "Mengupload..." : "Upload Gambar"}
                      </button>
                    </div>
                    {brandingForm.logo && (
                      <img src={brandingForm.logo} alt="Logo" className="w-16 h-16 rounded-full object-cover border flex-shrink-0" onError={(e) => (e.currentTarget.style.display = "none")} />
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Favicon Website</label>
                  <p className="text-xs text-gray-400 mb-2">Ikon kecil yang muncul di tab browser. Gunakan gambar persegi (disarankan 32×32 atau 512×512 px).</p>
                  <div className="flex items-center gap-4">
                    <div className="flex-1 space-y-2">
                      <input
                        value={brandingForm.favicon}
                        onChange={(e) => setBrandingForm((p) => ({ ...p, favicon: e.target.value }))}
                        className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900"
                        placeholder="https://... atau upload gambar"
                      />
                      <input
                        ref={faviconInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f, "favicon"); }}
                      />
                      <button
                        onClick={() => faviconInputRef.current?.click()}
                        disabled={uploadingFavicon}
                        className="px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-50 transition disabled:opacity-50"
                      >
                        {uploadingFavicon ? "Mengupload..." : "Upload Favicon"}
                      </button>
                    </div>
                    {brandingForm.favicon && (
                      <div className="flex-shrink-0 flex flex-col items-center gap-1">
                        <img
                          src={brandingForm.favicon}
                          alt="Favicon"
                          className="w-10 h-10 object-contain border rounded"
                          onError={(e) => (e.currentTarget.style.display = "none")}
                        />
                        <span className="text-xs text-gray-400">Preview</span>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Warna Toko</label>
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { label: "Navbar (latar)", key: 0 },
                      { label: "Navbar (teks)", key: 1 },
                      { label: "Aksen / Tombol", key: 2 },
                    ].map(({ label, key }) => (
                      <div key={key} className="flex flex-col items-center gap-2">
                        <div className="relative">
                          <div
                            className="w-12 h-12 rounded-lg border-2 border-gray-200 cursor-pointer shadow-sm overflow-hidden"
                            style={{ backgroundColor: brandingForm.colors[key] || "#e5e7eb" }}
                          >
                            <input
                              type="color"
                              value={brandingForm.colors[key] || "#e5e7eb"}
                              onChange={(e) => {
                                const next = [...brandingForm.colors];
                                next[key] = e.target.value;
                                setBrandingForm((p) => ({ ...p, colors: next }));
                              }}
                              className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                            />
                          </div>
                        </div>
                        <span className="text-xs text-gray-500 text-center">{label}</span>
                        <span className="text-xs font-mono text-gray-400">{brandingForm.colors[key] || "-"}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-2">Klik kotak warna untuk memilih. Kosongkan untuk kembali ke warna default.</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Font Toko</label>
                  <select
                    value={brandingForm.font}
                    onChange={(e) => setBrandingForm((p) => ({ ...p, font: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                  >
                    {FONT_OPTIONS.map((f) => (
                      <option key={f} value={f} style={f ? { fontFamily: f } : undefined}>
                        {f || "Default (sistem)"}
                      </option>
                    ))}
                  </select>
                  {brandingForm.font && (
                    <p className="text-xs text-gray-400 mt-1">Preview: <span style={{ fontFamily: brandingForm.font }} className="text-gray-700">Toko Furniture Pilihan Anda</span></p>
                  )}
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={saveBranding}
                    disabled={brandingSaving}
                    className="px-5 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50"
                    data-testid="button-save-branding"
                  >
                    {brandingSaving ? "Menyimpan..." : "Simpan Tampilan"}
                  </button>
                  {brandingMsg && (
                    <span className={`text-sm ${brandingMsg.includes("berhasil") ? "text-green-600" : "text-red-500"}`}>
                      {brandingMsg}
                    </span>
                  )}
                </div>
              </div>
            </div>

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

            <div className="bg-white rounded-lg border p-6">
              <h2 className="font-bold text-lg mb-1">Pengambilan di Toko</h2>
              <p className="text-sm text-gray-500 mb-4">Aktifkan opsi &quot;Ambil di Toko&quot; saat checkout, dan atur jam operasional pengambilan barang.</p>
              <div className="space-y-4">
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <div
                    onClick={() => setBrandingForm((p) => ({ ...p, pickup_enabled: !p.pickup_enabled }))}
                    className={`relative w-11 h-6 rounded-full transition-colors ${brandingForm.pickup_enabled ? "bg-gray-900" : "bg-gray-300"}`}
                  >
                    <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${brandingForm.pickup_enabled ? "translate-x-5" : "translate-x-0"}`} />
                  </div>
                  <span className="text-sm font-medium text-gray-800">
                    {brandingForm.pickup_enabled ? "Aktif — pembeli bisa memilih ambil di toko" : "Nonaktif — hanya pengiriman kurir"}
                  </span>
                </label>

                {brandingForm.pickup_enabled && (
                  <div className="flex items-center gap-4 mt-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Jam Buka</label>
                      <input
                        type="time"
                        value={brandingForm.pickup_open}
                        onChange={(e) => setBrandingForm((p) => ({ ...p, pickup_open: e.target.value }))}
                        className="border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900"
                      />
                    </div>
                    <span className="text-gray-400 mt-5">—</span>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Jam Tutup</label>
                      <input
                        type="time"
                        value={brandingForm.pickup_close}
                        onChange={(e) => setBrandingForm((p) => ({ ...p, pickup_close: e.target.value }))}
                        className="border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900"
                      />
                    </div>
                    <div className="mt-5 bg-blue-50 rounded-lg px-3 py-2 text-sm text-blue-700">
                      Jam operasional: <strong>{brandingForm.pickup_open} – {brandingForm.pickup_close}</strong>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={savePickup}
                    disabled={pickupSaving}
                    className="px-5 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50"
                  >
                    {pickupSaving ? "Menyimpan..." : "Simpan Pengaturan"}
                  </button>
                  {pickupMsg && (
                    <span className={`text-sm ${pickupMsg.includes("berhasil") ? "text-green-600" : "text-red-500"}`}>{pickupMsg}</span>
                  )}
                </div>
              </div>
            </div>

            {shippingAvailable && (
              <div className="bg-white rounded-lg border p-6">
                <h2 className="font-bold text-lg mb-1">Kurir Aktif</h2>
                <p className="text-sm text-gray-500 mb-4">
                  Pilih kurir yang tersedia untuk pembeli saat checkout. Hanya kurir yang dicentang yang akan ditampilkan.
                </p>
                {allCouriers.length === 0 ? (
                  <p className="text-sm text-gray-400">Memuat daftar kurir...</p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
                      {allCouriers.map((c) => {
                        const checked = allowedCouriers.includes(c.code);
                        return (
                          <label
                            key={c.code}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition select-none ${checked ? "border-gray-900 bg-gray-50" : "border-gray-200 hover:border-gray-400"}`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleCourier(c.code)}
                              className="accent-gray-900 w-4 h-4 flex-shrink-0"
                            />
                            <span className="text-sm font-medium text-gray-800">{c.name}</span>
                          </label>
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={saveCouriers}
                        disabled={courierSaving || allowedCouriers.length === 0}
                        className="px-5 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50"
                      >
                        {courierSaving ? "Menyimpan..." : `Simpan Kurir (${allowedCouriers.length} dipilih)`}
                      </button>
                      {courierMsg && (
                        <span className={`text-sm ${courierMsg.includes("berhasil") ? "text-green-600" : "text-red-500"}`}>
                          {courierMsg}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
