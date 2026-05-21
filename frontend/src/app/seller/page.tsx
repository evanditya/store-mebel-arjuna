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

interface ProductVariantStock { id?: string; variant_type: string; variant_name: string; stock: number; is_available: boolean; }
interface Product { id?: string; name: string; slug: string; price: number; stock: number; category: string; primary_image: string; sold_count: number; is_available?: boolean; variants?: ProductVariantStock[]; }
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
  const [productCategory, setProductCategory] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderFilter, setOrderFilter] = useState<string>("all");
  const [tab, setTab] = useState<"products" | "orders" | "settings" | "admins">("products");
  const [settingsOpen, setSettingsOpen] = useState<Set<string>>(new Set(["tampilan"]));
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<{ name: string; role: string; permissions: string[] } | null>(null);
  const [adminUsers, setAdminUsers] = useState<{ id: string; name: string; email: string; permissions: string[]; created_at: string }[]>([]);
  const [allPermissions] = useState(["products", "orders", "banners", "settings"]);
  const permLabels: Record<string, string> = { products: "Produk", orders: "Pesanan", banners: "Banner", settings: "Pengaturan" };
  const [adminForm, setAdminForm] = useState({ name: "", email: "", password: "", permissions: [] as string[] });
  const [editingAdminId, setEditingAdminId] = useState<string | null>(null);
  const [editAdminForm, setEditAdminForm] = useState({ name: "", email: "", password: "", permissions: [] as string[] });
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminMsg, setAdminMsg] = useState("");
  const [shippingLoading, setShippingLoading] = useState<string | null>(null);
  const [trackingOrderId, setTrackingOrderId] = useState<string | null>(null);
  const [trackingData, setTrackingData] = useState<TrackingData | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [expandedStockSlugs, setExpandedStockSlugs] = useState<Set<string>>(new Set());
  const excelInputRef = useRef<HTMLInputElement>(null);
  const syncZipRef = useRef<HTMLInputElement>(null);
  const [syncZipLoading, setSyncZipLoading] = useState(false);
  const [syncZipProgress, setSyncZipProgress] = useState<{ processed: number; total: number; created: number; updated: number } | null>(null);
  const [syncZipResult, setSyncZipResult] = useState<{ success: boolean; total?: number; created?: number; updated?: number; skipped_errors?: number; errors?: string[]; error?: string } | null>(null);
  const productMounted = useRef(false);

  const [shippingAvailable, setShippingAvailable] = useState(false);
  const [allCouriers, setAllCouriers] = useState<{ code: string; name: string }[]>([]);
  const [allowedCouriers, setAllowedCouriers] = useState<string[]>([]);
  const [courierSaving, setCourierSaving] = useState(false);
  const [courierMsg, setCourierMsg] = useState("");

  type ShopeeSyncStatus = {
    imap_configured: boolean;
    daemon: { running: boolean; last_event: string; last_error: string };
    totals: { all: number; success: number; partial: number; no_match: number; error: number };
    last_processed_at: string | null;
    last_status: string | null;
    last_subject: string | null;
  };
  type ShopeeSyncLogItem = { name: string; variant: string; qty: number; matched: boolean; product_name?: string; variant_name?: string; decremented: number };
  type ShopeeSyncLog = { id: number; subject: string; shopee_order_no: string; processed_at: string; status: string; items: ShopeeSyncLogItem[]; total_decremented: number; error_msg: string | null };
  type ShopeeUnmatched = { name: string; variant_examples: string[]; count: number };
  type ShopeeMapping = { id: number; shopee_product_name: string; shopee_variant: string | null; product_id: string; product_name: string | null; variant_id: string | null; variant_name: string | null };

  const [shopeeStatus, setShopeeStatus] = useState<ShopeeSyncStatus | null>(null);
  const [shopeeLogs, setShopeeLogs] = useState<ShopeeSyncLog[]>([]);
  const [shopeeUnmatched, setShopeeUnmatched] = useState<ShopeeUnmatched[]>([]);
  const [shopeeMappings, setShopeeMappings] = useState<ShopeeMapping[]>([]);
  const [shopeeSyncing, setShopeeSyncing] = useState(false);
  const [shopeeMsg, setShopeeMsg] = useState("");
  const [shopeeMapForm, setShopeeMapForm] = useState<{ shopee_name: string; product_id: string; variant_id: string }>({ shopee_name: "", product_id: "", variant_id: "" });
  const [shopeeTestOpen, setShopeeTestOpen] = useState(false);
  const [shopeeTestSubject, setShopeeTestSubject] = useState("[Shopee Seller] Pesanan #TEST-001 Telah Diterima Pembeli");
  const [shopeeTestHtml, setShopeeTestHtml] = useState("");
  const [shopeeTestRunning, setShopeeTestRunning] = useState(false);
  type ShopeeTestResult = {
    subject_matches_filter: boolean;
    order_no: string;
    items_found: number;
    items: { name: string; variant: string; qty: number; matched: boolean; product_name: string | null; variant_name: string | null; current_stock: number | null }[];
    note?: string;
    error?: string;
  };
  const [shopeeTestResult, setShopeeTestResult] = useState<ShopeeTestResult | null>(null);

  type ExcelVariantMatch = { db_variant_id: string; db_variant_name: string; shopee_variant_name: string; variant_score: number; price_old: number | null; price_new: number | null; stock_old: number; stock_new: number | null; diskon_new?: number | null; tersedia_new?: string | null };
  type ExcelMatch = { db_product_id: string; db_product_name: string; shopee_product_id: string; shopee_product_name: string; match_score: number; price_old: number; price_new: number | null; stock_old: number; stock_new: number | null; variant_matches: ExcelVariantMatch[]; has_changes: boolean; diskon_new?: number | null; tersedia_new?: string | null; berat_new?: number | null; panjang_new?: number | null; lebar_new?: number | null; tinggi_new?: number | null; kategori_new?: string | null; deskripsi_new?: string | null; video_new?: string | null };
  type ExcelPreview = { matched: ExcelMatch[]; unmatched: { db_product_id: string; db_product_name: string }[]; summary: { total_db: number; matched_high: number; matched_ok: number; unmatched: number } };

  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [excelPreview, setExcelPreview] = useState<ExcelPreview | null>(null);
  const [excelPreviewing, setExcelPreviewing] = useState(false);
  const [excelPreviewError, setExcelPreviewError] = useState("");
  const [excelApplying, setExcelApplying] = useState(false);
  const [excelApplyResult, setExcelApplyResult] = useState<{ updated_products: number; updated_variants: number } | null>(null);
  const [excelSelected, setExcelSelected] = useState<Set<string>>(new Set());
  const [excelFilter, setExcelFilter] = useState<"all" | "changed" | "high" | "ok">("changed");

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
    pickup_days: ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"],
    store_address: "",
    store_phone: "",
    pickup_notes: "",
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

  const loadProducts = async (page: number, search: string, category?: string) => {
    setProductLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "20", include_inactive: "true" });
    if (search.trim()) params.set("search", search.trim());
    const cat = category !== undefined ? category : productCategory;
    if (cat) params.set("category", cat);
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
  }, [productSearch, productCategory]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((data) => {
      if (!data.user || (data.user.role !== "seller" && data.user.role !== "admin")) { router.push("/login"); return; }
      setUser(data.user);
      if (data.user.role === "admin") {
        const perms: string[] = data.user.permissions || [];
        const firstTab = (["products", "orders", "settings"] as const).find((p) => perms.includes(p) || (p === "settings" && perms.includes("banners")));
        if (firstTab) setTab(firstTab);
      }
      if (data.user.role === "seller") {
        fetch("/api/admin/users").then((r) => r.json()).then((d) => { if (d.admins) setAdminUsers(d.admins); }).catch(() => {});
      }
    });
    fetch("/api/categories").then((r) => r.json()).then((d) => { if (d.categories) setCategories(d.categories); }).catch(() => {});
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
        pickup_days: data.pickup_days || ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"],
        store_address: data.store_address || "",
        store_phone: data.store_phone || "",
        pickup_notes: data.pickup_notes || "",
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

  const loadShopeeAll = async () => {
    try {
      const [s, l, u, m] = await Promise.all([
        fetch("/api/shopee-sync/status").then((r) => r.json()).catch(() => null),
        fetch("/api/shopee-sync/logs?limit=20").then((r) => r.json()).catch(() => ({ logs: [] })),
        fetch("/api/shopee-sync/unmatched").then((r) => r.json()).catch(() => ({ unmatched: [] })),
        fetch("/api/shopee-sync/mappings").then((r) => r.json()).catch(() => ({ mappings: [] })),
      ]);
      if (s) setShopeeStatus(s);
      setShopeeLogs(l.logs || []);
      setShopeeUnmatched(u.unmatched || []);
      setShopeeMappings(m.mappings || []);
    } catch {}
  };

  const runShopeeSync = async () => {
    setShopeeSyncing(true); setShopeeMsg("");
    try {
      const res = await fetch("/api/shopee-sync/run", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setShopeeMsg(`Selesai: ${data.processed || 0} email diproses${data.skipped ? `, ${data.skipped} dilewati` : ""}`);
        await loadShopeeAll();
      } else {
        setShopeeMsg(data.error || data.detail || "Gagal sinkronisasi");
      }
    } catch (e) {
      setShopeeMsg("Koneksi gagal: " + String(e));
    } finally {
      setShopeeSyncing(false);
      setTimeout(() => setShopeeMsg(""), 5000);
    }
  };

  const saveShopeeMapping = async (shopeeName: string, productId: string, variantId: string) => {
    if (!shopeeName || !productId) { setShopeeMsg("Pilih produk terlebih dahulu"); return; }
    try {
      const res = await fetch("/api/shopee-sync/mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopee_name: shopeeName, product_id: productId, variant_id: variantId || null }),
      });
      const data = await res.json();
      if (res.ok) {
        setShopeeMsg("Mapping disimpan");
        setShopeeMapForm({ shopee_name: "", product_id: "", variant_id: "" });
        await loadShopeeAll();
      } else {
        setShopeeMsg(data.error || data.detail || "Gagal menyimpan mapping");
      }
    } catch (e) {
      setShopeeMsg("Koneksi gagal: " + String(e));
    }
    setTimeout(() => setShopeeMsg(""), 4000);
  };

  const deleteShopeeMapping = async (id: number) => {
    if (!confirm("Hapus mapping ini?")) return;
    try {
      const res = await fetch(`/api/shopee-sync/mappings/${id}`, { method: "DELETE" });
      if (res.ok) {
        await loadShopeeAll();
        setShopeeMsg("Mapping dihapus");
      } else {
        const d = await res.json().catch(() => ({}));
        setShopeeMsg(d.error || d.detail || "Gagal menghapus");
      }
    } catch (e) {
      setShopeeMsg("Koneksi gagal: " + String(e));
    }
    setTimeout(() => setShopeeMsg(""), 3000);
  };

  useEffect(() => {
    if (tab === "settings") { loadShopeeAll(); loadBanners(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

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
          pickup_days: brandingForm.pickup_days,
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
          pickup_days: brandingForm.pickup_days,
          store_address: brandingForm.store_address,
          store_phone: brandingForm.store_phone,
          pickup_notes: brandingForm.pickup_notes,
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

  const handleToggleAvailability = async (product: Product) => {
    await fetch(`/api/products/${product.slug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_available: !(product.is_available !== false) }),
    });
    loadProducts(productPage, productSearch);
  };

  const handleExcelExport = () => { window.open("/api/products/export-excel", "_blank"); };

  const handleExcelPreview = async (file: File) => {
    setExcelPreviewing(true);
    setExcelPreviewError("");
    setExcelPreview(null);
    setExcelSelected(new Set());
    setExcelApplyResult(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch("/api/excel-import/preview", { method: "POST", body: fd });
      const data = await res.json();
      if (data.error) { setExcelPreviewError(data.error); }
      else {
        setExcelPreview(data);
        setExcelSelected(new Set(data.matched.filter((m: ExcelMatch) => m.match_score >= 0.7 && m.has_changes).map((m: ExcelMatch) => m.db_product_id)));
      }
    } catch { setExcelPreviewError("Gagal menghubungi server."); }
    finally { setExcelPreviewing(false); }
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

  const orderFilterTabs = [
    { key: "all", label: "Semua", statuses: null as string[] | null },
    { key: "new", label: "Belum Diproses", statuses: ["pending", "paid", "processing"] as string[] },
    { key: "action", label: "Siap Diambil / Dikirim", statuses: ["ready_pickup", "shipped"] as string[] },
    { key: "done", label: "Selesai", statuses: ["completed"] as string[] },
    { key: "cancelled", label: "Dibatalkan", statuses: ["cancelled"] as string[] },
  ];
  const filteredOrders = orderFilter === "all" ? orders : orders.filter((o) => {
    const ft = orderFilterTabs.find((t) => t.key === orderFilter);
    return ft && ft.statuses ? ft.statuses.includes(o.status) : true;
  });

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
        <div className="flex flex-wrap gap-2 mb-4">
          {(user?.role === "seller" || (user?.permissions || []).includes("products")) && (
            <button onClick={() => setTab("products")} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === "products" ? "bg-gray-900 text-white" : "bg-white border text-gray-700"}`} data-testid="tab-products">Produk ({productTotal})</button>
          )}
          {(user?.role === "seller" || (user?.permissions || []).includes("orders")) && (
            <button onClick={() => setTab("orders")} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === "orders" ? "bg-gray-900 text-white" : "bg-white border text-gray-700"}`} data-testid="tab-orders">Pesanan ({orders.length})</button>
          )}
          {(user?.role === "seller" || (user?.permissions || []).includes("settings") || (user?.permissions || []).includes("banners")) && (
            <button onClick={() => setTab("settings")} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === "settings" ? "bg-gray-900 text-white" : "bg-white border text-gray-700"}`} data-testid="tab-settings">Pengaturan</button>
          )}
          {user?.role === "seller" && (
            <button onClick={() => setTab("admins")} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === "admins" ? "bg-indigo-700 text-white" : "bg-white border text-indigo-700"}`} data-testid="tab-admins">Kelola Admin</button>
          )}
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
                <button onClick={() => excelInputRef.current?.click()} disabled={excelPreviewing} className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-1.5">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l4-4m0 0l4 4m-4-4v12" /></svg>
                  {excelPreviewing ? "Memproses..." : "Upload Excel"}
                </button>
                <input ref={excelInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  setExcelFile(f);
                  setExcelPreview(null);
                  setExcelApplyResult(null);
                  setExcelPreviewError("");
                  setExcelSelected(new Set());
                  handleExcelPreview(f);
                }} />
                <Link href="/seller/products/new" className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition" data-testid="button-add-product">+ Tambah Produk</Link>
              </div>
            </div>

            {/* ── Excel preview (shown after Upload Excel is clicked) ── */}
            {excelPreviewing && (
              <div className="mb-4 bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700 flex items-center gap-3">
                <svg className="animate-spin h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                Memproses file {excelFile?.name}…
              </div>
            )}
            {excelPreviewError && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 flex items-center justify-between">
                <span>{excelPreviewError}</span>
                <button onClick={() => { setExcelPreviewError(""); setExcelFile(null); }} className="text-red-400 hover:text-red-600 text-lg leading-none ml-3">×</button>
              </div>
            )}
            {excelApplyResult && (
              <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-800 flex items-center justify-between">
                <span><strong>Berhasil!</strong> {excelApplyResult.updated_products} produk dan {excelApplyResult.updated_variants} varian diperbarui.</span>
                <button onClick={() => setExcelApplyResult(null)} className="text-emerald-500 hover:text-emerald-700 text-lg leading-none ml-3">×</button>
              </div>
            )}
            {excelPreview && (
              <div className="mb-4 space-y-3">
                <div className="grid grid-cols-4 gap-3">
                  <div className="bg-white rounded-lg border p-3 text-center"><p className="text-xs text-gray-500 mb-1">Total Produk DB</p><p className="text-2xl font-bold">{excelPreview.summary.total_db}</p></div>
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center"><p className="text-xs text-emerald-700 mb-1">Cocok Tinggi ≥0.7</p><p className="text-2xl font-bold text-emerald-700">{excelPreview.summary.matched_high}</p></div>
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-center"><p className="text-xs text-yellow-700 mb-1">Perlu Cek 0.5–0.7</p><p className="text-2xl font-bold text-yellow-700">{excelPreview.summary.matched_ok}</p></div>
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center"><p className="text-xs text-red-600 mb-1">Tidak Cocok</p><p className="text-2xl font-bold text-red-600">{excelPreview.summary.unmatched}</p></div>
                </div>
                <div className="bg-white rounded-lg border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <div className="flex gap-2 flex-wrap">
                      {(["changed", "all", "high", "ok"] as const).map((f) => (
                        <button key={f} onClick={() => setExcelFilter(f)} className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${excelFilter === f ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-300 hover:border-gray-500"}`}>
                          {f === "changed" ? `Ada Perubahan (${excelPreview.matched.filter(m => m.has_changes).length})` : f === "all" ? "Semua" : f === "high" ? "Cocok Tinggi" : "Perlu Cek"}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => { const v = excelPreview.matched.filter(m => excelFilter === "all" || (excelFilter === "changed" && m.has_changes) || (excelFilter === "high" && m.match_score >= 0.7) || (excelFilter === "ok" && m.match_score < 0.7)); setExcelSelected(prev => { const s = new Set(prev); v.forEach(m => s.add(m.db_product_id)); return s; }); }} className="px-3 py-1.5 rounded-lg text-sm border border-gray-300 bg-white hover:border-gray-500 transition">Pilih Semua</button>
                      <button onClick={() => { const v = excelPreview.matched.filter(m => excelFilter === "all" || (excelFilter === "changed" && m.has_changes) || (excelFilter === "high" && m.match_score >= 0.7) || (excelFilter === "ok" && m.match_score < 0.7)); setExcelSelected(prev => { const s = new Set(prev); v.forEach(m => s.delete(m.db_product_id)); return s; }); }} className="px-3 py-1.5 rounded-lg text-sm border border-gray-300 bg-white hover:border-gray-500 transition">Batal Pilih</button>
                      <button
                        disabled={excelSelected.size === 0 || excelApplying}
                        onClick={async () => {
                          setExcelApplying(true);
                          const updates = excelPreview.matched
                            .filter(m => excelSelected.has(m.db_product_id))
                            .map(m => ({
                              db_product_id: m.db_product_id,
                              price_new: m.price_new,
                              stock_new: m.stock_new,
                              diskon_new: m.diskon_new ?? null,
                              tersedia_new: m.tersedia_new ?? null,
                              berat_new: m.berat_new ?? null,
                              panjang_new: m.panjang_new ?? null,
                              lebar_new: m.lebar_new ?? null,
                              tinggi_new: m.tinggi_new ?? null,
                              kategori_new: m.kategori_new ?? null,
                              deskripsi_new: m.deskripsi_new ?? null,
                              video_new: m.video_new ?? null,
                              variant_matches: m.variant_matches.map(v => ({
                                db_variant_id: v.db_variant_id,
                                price_new: v.price_new,
                                stock_new: v.stock_new,
                                diskon_new: v.diskon_new ?? null,
                                tersedia_new: v.tersedia_new ?? null,
                              })),
                            }));
                          try {
                            const res = await fetch("/api/excel-import/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ updates }) });
                            const data = await res.json();
                            if (data.success) { setExcelApplyResult(data); setExcelPreview(null); setExcelFile(null); await loadProducts(1, productSearch); }
                            else alert(data.error || "Gagal menerapkan.");
                          } catch { alert("Terjadi kesalahan."); }
                          finally { setExcelApplying(false); }
                        }}
                        className="px-5 py-1.5 bg-emerald-700 text-white rounded-lg text-sm font-medium hover:bg-emerald-800 transition disabled:opacity-40"
                      >
                        {excelApplying ? "Menerapkan..." : `Terapkan ${excelSelected.size} Produk`}
                      </button>
                      <button onClick={() => { setExcelPreview(null); setExcelFile(null); setExcelPreviewError(""); }} className="px-3 py-1.5 rounded-lg text-sm border border-gray-300 bg-white hover:border-red-300 hover:text-red-600 transition">Batal</button>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-xs text-gray-500">
                          <th className="pb-2 pr-3 w-8"></th>
                          <th className="pb-2 pr-3">Produk di Toko</th>
                          <th className="pb-2 pr-3">Nama di Excel</th>
                          <th className="pb-2 pr-3 text-center">Skor</th>
                          <th className="pb-2 pr-3 text-right">Harga Lama</th>
                          <th className="pb-2 pr-3 text-right">Harga Baru</th>
                          <th className="pb-2 pr-3 text-right">Stok Lama</th>
                          <th className="pb-2 text-right">Stok Baru</th>
                        </tr>
                      </thead>
                      <tbody>
                        {excelPreview.matched
                          .filter(m => excelFilter === "all" || (excelFilter === "changed" && m.has_changes) || (excelFilter === "high" && m.match_score >= 0.7) || (excelFilter === "ok" && m.match_score < 0.7))
                          .map((m) => (
                            <tr key={m.db_product_id} className={`border-b last:border-0 ${excelSelected.has(m.db_product_id) ? "bg-emerald-50" : !m.has_changes ? "opacity-50" : ""}`}>
                              <td className="py-2 pr-3"><input type="checkbox" checked={excelSelected.has(m.db_product_id)} onChange={(e) => setExcelSelected(prev => { const s = new Set(prev); e.target.checked ? s.add(m.db_product_id) : s.delete(m.db_product_id); return s; })} className="w-4 h-4 rounded" /></td>
                              <td className="py-2 pr-3 max-w-[200px]">
                                <p className="font-medium truncate" title={m.db_product_name}>{m.db_product_name}</p>
                                {m.variant_matches.length > 0 && <p className="text-xs text-gray-400">{m.variant_matches.length} varian</p>}
                                {!m.has_changes && <p className="text-xs text-gray-400 italic">Tidak ada perubahan</p>}
                              </td>
                              <td className="py-2 pr-3 max-w-[200px]"><p className="text-gray-500 text-xs truncate" title={m.shopee_product_name}>{m.shopee_product_name}</p></td>
                              <td className="py-2 pr-3 text-center"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${m.match_score >= 0.7 ? "bg-emerald-100 text-emerald-700" : "bg-yellow-100 text-yellow-700"}`}>{m.match_score}</span></td>
                              <td className="py-2 pr-3 text-right text-gray-500">{m.price_old?.toLocaleString("id-ID")}</td>
                              <td className="py-2 pr-3 text-right font-medium">{m.price_new !== null && m.price_new !== undefined ? <span className={m.price_new !== m.price_old ? "text-blue-600" : ""}>{m.price_new.toLocaleString("id-ID")}</span> : <span className="text-gray-300">—</span>}</td>
                              <td className="py-2 pr-3 text-right text-gray-500">{m.stock_old}</td>
                              <td className="py-2 text-right font-medium">{m.stock_new !== null && m.stock_new !== undefined ? <span className={m.stock_new !== m.stock_old ? "text-blue-600" : ""}>{m.stock_new}</span> : <span className="text-gray-300">—</span>}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                  {excelPreview.unmatched.length > 0 && (
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-xs font-semibold text-orange-700 mb-1">{excelPreview.unmatched.length} produk tidak cocok (dilewati):</p>
                      <div className="flex flex-wrap gap-1">
                        {excelPreview.unmatched.map((u, i) => <span key={i} className="text-xs bg-orange-50 text-orange-600 rounded px-2 py-0.5">{u.db_product_name}</span>)}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="mb-3 space-y-2">
              <input
                type="text"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder={`Cari dari ${productTotal} produk...`}
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900"
              />
              {categories.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => { setProductCategory(""); }}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition ${productCategory === "" ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-300 hover:border-gray-500"}`}
                  >
                    Semua
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => { setProductCategory(productCategory === cat ? "" : cat); }}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition ${productCategory === cat ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-300 hover:border-gray-500"}`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {productLoading ? (
              <div className="text-center py-12 text-gray-400">Memuat produk...</div>
            ) : (
              <>
                <div className="space-y-2">
                  {products.map((product) => {
                    const realVariants = (product.variants || []).filter((v) => v.variant_type !== "_combinations");
                    const hasVariants = realVariants.length > 0;
                    const totalVariantStock = hasVariants ? realVariants.reduce((s, v) => s + (v.stock || 0), 0) : product.stock;
                    const isStockExpanded = expandedStockSlugs.has(product.slug);
                    const toggleStock = () => setExpandedStockSlugs((prev) => {
                      const next = new Set(prev);
                      next.has(product.slug) ? next.delete(product.slug) : next.add(product.slug);
                      return next;
                    });
                    return (
                      <div key={product.slug} className={`bg-white rounded-lg border overflow-hidden ${product.is_available === false ? "opacity-60" : ""}`} data-testid={`product-row-${product.slug}`}>
                        <div className="p-4 flex items-center gap-4">
                          <img
                            src={product.primary_image || "/images/placeholder.svg"}
                            alt=""
                            className="w-16 h-16 rounded-lg object-cover flex-shrink-0 bg-gray-100"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).src = "/images/placeholder.svg"; }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <h3 className="font-medium truncate">{product.name}</h3>
                              {product.is_available === false && <span className="flex-shrink-0 text-xs bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded font-medium">Nonaktif</span>}
                            </div>
                            <p className="text-sm text-gray-500">{product.category}</p>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm items-center">
                              <span className="text-red-600 font-medium">{formatPrice(product.price)}</span>
                              <button
                                onClick={hasVariants ? toggleStock : undefined}
                                className={`flex items-center gap-1 ${hasVariants ? "text-gray-600 hover:text-gray-900 cursor-pointer" : "text-gray-400 cursor-default"}`}
                              >
                                <span>Stok: <span className={totalVariantStock === 0 ? "text-red-500 font-semibold" : ""}>{totalVariantStock}</span></span>
                                {hasVariants && (
                                  <svg xmlns="http://www.w3.org/2000/svg" className={`w-3.5 h-3.5 transition-transform ${isStockExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                  </svg>
                                )}
                              </button>
                              <span className="text-gray-400">{product.sold_count} terjual</span>
                            </div>
                          </div>
                          <div className="flex gap-2 flex-shrink-0">
                            <button onClick={() => handleToggleAvailability(product)} className={`px-3 py-1.5 rounded-lg text-sm transition ${product.is_available === false ? "bg-green-50 text-green-700 hover:bg-green-100" : "bg-yellow-50 text-yellow-700 hover:bg-yellow-100"}`} data-testid={`button-toggle-available-${product.slug}`}>{product.is_available === false ? "Aktifkan" : "Nonaktifkan"}</button>
                            <Link href={`/seller/products/${product.slug}`} className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 transition" data-testid={`button-edit-${product.slug}`}>Edit</Link>
                            <button onClick={() => handleDelete(product.slug)} className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-sm hover:bg-red-100 transition" data-testid={`button-delete-${product.slug}`}>Hapus</button>
                          </div>
                        </div>
                        {hasVariants && isStockExpanded && (
                          <div className="border-t bg-gray-50 px-4 py-3">
                            <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Stok per Varian</p>
                            <div className="flex flex-wrap gap-2">
                              {realVariants.map((v) => (
                                <span key={v.variant_name} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${v.stock === 0 ? "bg-red-50 border-red-200 text-red-600" : v.stock <= 5 ? "bg-yellow-50 border-yellow-200 text-yellow-700" : "bg-white border-gray-200 text-gray-700"}`}>
                                  <span>{v.variant_name}</span>
                                  <span className="font-bold">{v.stock}</span>
                                  {!v.is_available && <span className="text-gray-400">(nonaktif)</span>}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {products.length === 0 && (
                    <div className="text-center py-12 text-gray-400">
                      {productSearch || productCategory
                        ? `Tidak ada produk${productCategory ? ` di kategori "${productCategory}"` : ""}${productSearch ? ` yang cocok dengan "${productSearch}"` : ""}`
                        : "Belum ada produk"}
                    </div>
                  )}
                </div>

                {productTotalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t">
                    <p className="text-sm text-gray-500">
                      Halaman {productPage} dari {productTotalPages} &nbsp;·&nbsp; {productTotal} produk
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => loadProducts(productPage - 1, productSearch, productCategory)}
                        disabled={productPage <= 1}
                        className="px-3 py-1.5 rounded-lg border text-sm font-medium transition disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
                      >
                        ← Sebelumnya
                      </button>
                      <button
                        onClick={() => loadProducts(productPage + 1, productSearch, productCategory)}
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
          <div className="space-y-3">
            {/* Filter tabs */}
            <div className="flex gap-1.5 flex-wrap">
              {orderFilterTabs.map((ft) => {
                const count = ft.statuses === null ? orders.length : orders.filter((o) => ft.statuses!.includes(o.status)).length;
                const active = orderFilter === ft.key;
                return (
                  <button
                    key={ft.key}
                    onClick={() => setOrderFilter(ft.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${active ? "bg-gray-900 text-white" : "bg-white border text-gray-600 hover:border-gray-400"}`}
                  >
                    {ft.label}
                    {count > 0 && (
                      <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-bold px-1 ${active ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"}`}>{count}</span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="space-y-2">
            {filteredOrders.map((order) => (
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
                  <span className="text-gray-400">{new Date(order.created_at).toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" })}</span>
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
                                  {h.updated_at && <p className="text-xs text-gray-400 mt-0.5">{new Date(h.updated_at).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</p>}
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
            {filteredOrders.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                {orderFilter === "all" ? "Belum ada pesanan" : "Tidak ada pesanan di kategori ini"}
              </div>
            )}
            </div>
          </div>
        )}
        {tab === "settings" && (
          <div className="space-y-2">
            {showCropper && (
              <BannerCropper onComplete={handleCropperComplete} onClose={() => setShowCropper(false)} />
            )}

            {/* ── Tampilan Toko ── */}
            <div className="bg-white rounded-lg border overflow-hidden">
              <button
                type="button"
                onClick={() => setSettingsOpen((prev) => { const n = new Set(prev); n.has("tampilan") ? n.delete("tampilan") : n.add("tampilan"); return n; })}
                className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-gray-50 transition"
              >
                <div>
                  <h2 className="font-bold text-base">Tampilan Toko</h2>
                  <p className="text-sm text-gray-500">Nama, logo, favicon, warna, dan font toko</p>
                </div>
                <svg className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform ${settingsOpen.has("tampilan") ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
              {settingsOpen.has("tampilan") && (
              <div className="px-6 pb-6 pt-4 border-t">
              <p className="text-sm text-gray-500 mb-5">Atur nama, logo, warna, dan font toko.</p>

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
            )}
            </div>

            {/* ── Banner Toko ── */}
            <div className="bg-white rounded-lg border overflow-hidden">
              <button type="button" onClick={() => setSettingsOpen((prev) => { const n = new Set(prev); n.has("banner") ? n.delete("banner") : n.add("banner"); return n; })} className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-gray-50 transition">
                <div>
                  <h2 className="font-bold text-base">Banner Toko</h2>
                  <p className="text-sm text-gray-500">Upload, urutkan, dan aktifkan/nonaktifkan banner halaman utama · {banners.length} banner</p>
                </div>
                <svg className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform ${settingsOpen.has("banner") ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
              {settingsOpen.has("banner") && (
              <div className="px-6 pb-6 pt-4 border-t">
                <div className="flex items-start justify-between mb-4 gap-4">
                  <p className="text-sm text-gray-500">Rasio gambar 3:1 (1200 × 400 px). Drag ≡ untuk mengubah urutan. Klik toggle untuk aktifkan/nonaktifkan.</p>
                  <button onClick={() => setShowCropper(true)} className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    Tambah Banner
                  </button>
                </div>
                {savingOrder && <p className="text-xs text-gray-400 mb-2">Menyimpan urutan...</p>}
                {banners.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    <div className="text-4xl mb-3">🖼️</div>
                    <p className="font-medium text-gray-500">Belum ada banner</p>
                    <p className="text-sm mt-1">Klik &quot;Tambah Banner&quot; untuk upload gambar pertama</p>
                  </div>
                ) : (
                  <DndContext sensors={bannerSensors} collisionDetection={closestCenter} onDragEnd={handleBannerDragEnd}>
                    <SortableContext items={banners.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                      <div className="space-y-3">
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
              </div>
              )}
            </div>

            {/* ── Profil & Pengiriman ── */}
            <div className="bg-white rounded-lg border overflow-hidden">
              <button type="button" onClick={() => setSettingsOpen((prev) => { const n = new Set(prev); n.has("profil") ? n.delete("profil") : n.add("profil"); return n; })} className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-gray-50 transition">
                <div>
                  <h2 className="font-bold text-base">Profil, Alamat & Lokasi Pengiriman</h2>
                  <p className="text-sm text-gray-500">Nama pengirim, telepon, alamat toko, dan lokasi asal pengiriman</p>
                </div>
                <svg className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform ${settingsOpen.has("profil") ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
              {settingsOpen.has("profil") && (
              <div className="px-6 pb-6 pt-4 border-t">
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
              )}
            </div>

            {/* ── Pengambilan di Toko ── */}
            <div className="bg-white rounded-lg border overflow-hidden">
              <button type="button" onClick={() => setSettingsOpen((prev) => { const n = new Set(prev); n.has("pickup") ? n.delete("pickup") : n.add("pickup"); return n; })} className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-gray-50 transition">
                <div>
                  <h2 className="font-bold text-base">Pengambilan di Toko</h2>
                  <p className="text-sm text-gray-500">Opsi &quot;Ambil di Toko&quot; saat checkout dan jam operasional</p>
                </div>
                <svg className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform ${settingsOpen.has("pickup") ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
              {settingsOpen.has("pickup") && (
              <div className="px-6 pb-6 pt-4 border-t">
              <div className="space-y-4">
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <div
                    onClick={() => setBrandingForm((p) => ({ ...p, pickup_enabled: !p.pickup_enabled }))}
                    data-testid="toggle-pickup-enabled"
                    className={`relative w-11 h-6 rounded-full transition-colors ${brandingForm.pickup_enabled ? "bg-gray-900" : "bg-gray-300"}`}
                  >
                    <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${brandingForm.pickup_enabled ? "translate-x-5" : "translate-x-0"}`} />
                  </div>
                  <span className="text-sm font-medium text-gray-800">
                    {brandingForm.pickup_enabled ? "Aktif — pembeli bisa memilih ambil di toko" : "Nonaktif — hanya pengiriman kurir"}
                  </span>
                </label>

                {brandingForm.pickup_enabled && (
                  <div className="space-y-4 mt-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-2">Hari Operasional</label>
                      <div className="flex flex-wrap gap-2">
                        {["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"].map((day) => {
                          const active = brandingForm.pickup_days.includes(day);
                          return (
                            <button
                              key={day}
                              type="button"
                              data-testid={`btn-pickup-day-${day.toLowerCase()}`}
                              data-active={active ? "true" : "false"}
                              onClick={() => setBrandingForm((p) => ({
                                ...p,
                                pickup_days: p.pickup_days.includes(day)
                                  ? p.pickup_days.filter((d) => d !== day)
                                  : [...p.pickup_days, day],
                              }))}
                              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition ${active ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-500 border-gray-300 hover:border-gray-500"}`}
                            >
                              {day}
                            </button>
                          );
                        })}
                      </div>
                      {brandingForm.pickup_days.length === 0 && (
                        <p className="text-xs text-red-500 mt-1">Pilih setidaknya satu hari operasional.</p>
                      )}
                    </div>
                    <div className="flex items-center gap-4">
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
                        {brandingForm.pickup_days.length > 0
                          ? <>{brandingForm.pickup_days.join(", ")}, <strong>{brandingForm.pickup_open} – {brandingForm.pickup_close}</strong></>
                          : <strong>{brandingForm.pickup_open} – {brandingForm.pickup_close}</strong>
                        }
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Alamat Toko</label>
                      <textarea
                        rows={2}
                        value={brandingForm.store_address}
                        onChange={(e) => setBrandingForm((p) => ({ ...p, store_address: e.target.value }))}
                        placeholder="Contoh: Jl. Raya Furniture No. 12, Kota..."
                        className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900 resize-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">No. Telepon Toko</label>
                      <input
                        type="text"
                        value={brandingForm.store_phone}
                        onChange={(e) => setBrandingForm((p) => ({ ...p, store_phone: e.target.value }))}
                        placeholder="Contoh: 0812-3456-7890"
                        className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Catatan Pengambilan <span className="font-normal text-gray-400">(opsional)</span></label>
                      <textarea
                        rows={2}
                        value={brandingForm.pickup_notes}
                        onChange={(e) => setBrandingForm((p) => ({ ...p, pickup_notes: e.target.value }))}
                        placeholder="Contoh: Harap konfirmasi ke WhatsApp sebelum datang."
                        className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900 resize-none"
                      />
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
            )}
            </div>

            {/* ── Kurir Aktif ── */}
            {shippingAvailable && (
            <div className="bg-white rounded-lg border overflow-hidden">
              <button type="button" onClick={() => setSettingsOpen((prev) => { const n = new Set(prev); n.has("kurir") ? n.delete("kurir") : n.add("kurir"); return n; })} className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-gray-50 transition">
                <div>
                  <h2 className="font-bold text-base">Kurir Aktif</h2>
                  <p className="text-sm text-gray-500">Kurir yang ditampilkan kepada pembeli saat checkout</p>
                </div>
                <svg className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform ${settingsOpen.has("kurir") ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
              {settingsOpen.has("kurir") && (
              <div className="px-6 pb-6 pt-4 border-t">
                <p className="text-sm text-gray-500 mb-4">Pilih kurir yang tersedia untuk pembeli saat checkout. Hanya kurir yang dicentang yang akan ditampilkan.</p>
                {allCouriers.length === 0 ? (
                  <p className="text-sm text-gray-400">Memuat daftar kurir...</p>
                ) : (
                  <>
                    <div className="flex gap-2 mb-3">
                      <button
                        type="button"
                        onClick={() => setAllowedCouriers(allCouriers.map((c) => c.code))}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 text-gray-700 hover:border-gray-500 hover:bg-gray-50 transition"
                        data-testid="btn-courier-select-all"
                      >
                        Pilih Semua
                      </button>
                      <button
                        type="button"
                        onClick={() => setAllowedCouriers([])}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 text-gray-500 hover:border-gray-500 hover:bg-gray-50 transition"
                        data-testid="btn-courier-deselect-all"
                      >
                        Batalkan Semua
                      </button>
                    </div>
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
                        disabled={courierSaving}
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

            {/* ── Sinkronisasi ZIP ── */}
            <div className="bg-white rounded-lg border overflow-hidden">
              <button type="button" onClick={() => setSettingsOpen((prev) => { const n = new Set(prev); n.has("zip") ? n.delete("zip") : n.add("zip"); return n; })} className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-gray-50 transition">
                <div>
                  <h2 className="font-bold text-base">Sinkronisasi Produk dari ZIP</h2>
                  <p className="text-sm text-gray-500">Upload ZIP hasil scraping Shopee untuk memperbarui produk dan varian</p>
                </div>
                <svg className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform ${settingsOpen.has("zip") ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
              {settingsOpen.has("zip") && (
              <div className="px-6 pb-6 pt-4 border-t">
              <p className="text-sm text-gray-500 mb-4">Upload file ZIP hasil scraping Shopee untuk memperbarui produk, varian, dan gambar secara otomatis. Produk yang cocok akan diperbarui; produk manual yang tidak ada di ZIP tidak akan tersentuh.</p>
              <div className="flex items-center gap-3 flex-wrap">
                <input
                  ref={syncZipRef}
                  type="file"
                  accept=".zip"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    setSyncZipLoading(true);
                    setSyncZipResult(null);
                    setSyncZipProgress(null);
                    const fd = new FormData();
                    fd.append("file", f);
                    try {
                      const res = await fetch("/api/products/sync-zip", { method: "POST", body: fd });
                      if (!res.ok || !res.body) {
                        const data = await res.json().catch(() => ({}));
                        setSyncZipResult({ success: false, error: data.error || "Gagal menghubungi server" });
                        return;
                      }
                      const reader = res.body.getReader();
                      const decoder = new TextDecoder();
                      let buf = "";
                      while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        buf += decoder.decode(value, { stream: true });
                        const lines = buf.split("\n");
                        buf = lines.pop() || "";
                        for (const line of lines) {
                          if (!line.startsWith("data: ")) continue;
                          try {
                            const data = JSON.parse(line.slice(6));
                            if (data.error) { setSyncZipResult({ success: false, error: data.error }); return; }
                            if (!data.done) setSyncZipProgress({ processed: data.processed, total: data.total, created: data.created, updated: data.updated });
                            if (data.done) setSyncZipResult({ success: true, total: data.total, created: data.created, updated: data.updated, skipped_errors: data.skipped_errors, errors: data.errors });
                          } catch { /* skip malformed line */ }
                        }
                      }
                    } catch (err) {
                      setSyncZipResult({ success: false, error: "Koneksi terputus: " + String(err) });
                    } finally {
                      setSyncZipLoading(false);
                      setSyncZipProgress(null);
                      if (syncZipRef.current) syncZipRef.current.value = "";
                    }
                  }}
                />
                <button
                  onClick={() => { setSyncZipResult(null); syncZipRef.current?.click(); }}
                  disabled={syncZipLoading}
                  className="px-5 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50 flex items-center gap-2"
                >
                  {syncZipLoading ? (
                    <>
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Menyinkronkan...
                    </>
                  ) : "Upload & Sinkronisasi ZIP"}
                </button>
              </div>

              {syncZipLoading && (
                <div className="mt-4">
                  {syncZipProgress ? (
                    <>
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span>Memproses produk {syncZipProgress.processed} dari {syncZipProgress.total}...</span>
                        <span>{Math.round((syncZipProgress.processed / syncZipProgress.total) * 100)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2.5">
                        <div
                          className="bg-gray-900 h-2.5 rounded-full transition-all duration-300"
                          style={{ width: `${Math.round((syncZipProgress.processed / syncZipProgress.total) * 100)}%` }}
                        />
                      </div>
                      <div className="flex gap-4 mt-2 text-xs text-gray-500">
                        <span>Diperbarui: <strong className="text-gray-800">{syncZipProgress.updated}</strong></span>
                        <span>Baru: <strong className="text-gray-800">{syncZipProgress.created}</strong></span>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-gray-500">Mengunggah file, mohon tunggu...</p>
                  )}
                </div>
              )}

              {syncZipResult && (
                <div className={`mt-4 rounded-lg p-4 text-sm border ${syncZipResult.success ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-700"}`}>
                  {syncZipResult.success ? (
                    <>
                      <p className="font-semibold mb-1">Sinkronisasi selesai!</p>
                      <ul className="space-y-0.5">
                        <li>Total produk di ZIP: <strong>{syncZipResult.total}</strong></li>
                        <li>Produk diperbarui: <strong>{syncZipResult.updated}</strong></li>
                        <li>Produk baru ditambahkan: <strong>{syncZipResult.created}</strong></li>
                        {(syncZipResult.skipped_errors ?? 0) > 0 && (
                          <li className="text-amber-700">Gagal diproses: <strong>{syncZipResult.skipped_errors}</strong></li>
                        )}
                      </ul>
                      {syncZipResult.errors && syncZipResult.errors.length > 0 && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs text-amber-700">Lihat detail error</summary>
                          <ul className="mt-1 space-y-0.5 text-xs text-amber-800">
                            {syncZipResult.errors.map((e, i) => <li key={i}>• {e}</li>)}
                          </ul>
                        </details>
                      )}
                    </>
                  ) : (
                    <p>{syncZipResult.error || "Sinkronisasi gagal"}</p>
                  )}
                </div>
              )}
              </div>
              )}
            </div>

            {/* ── Sinkronisasi Shopee ── */}
            <div className="bg-white rounded-lg border overflow-hidden" data-testid="card-shopee-sync">
              <button type="button" onClick={() => setSettingsOpen((prev) => { const n = new Set(prev); n.has("shopee") ? n.delete("shopee") : n.add("shopee"); return n; })} className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-gray-50 transition">
                <div className="flex items-center gap-3 flex-wrap">
                  <div>
                    <h2 className="font-bold text-base">Sinkronisasi Shopee</h2>
                    <p className="text-sm text-gray-500">Otomatis kurangi stok saat pesanan Shopee diterima pembeli</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${shopeeStatus?.imap_configured ? "bg-green-50 text-green-700 border border-green-200" : "bg-amber-50 text-amber-700 border border-amber-200"}`}>
                    {shopeeStatus?.imap_configured ? "IMAP terhubung" : "IMAP belum dikonfigurasi"}
                  </span>
                </div>
                <svg className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform ${settingsOpen.has("shopee") ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
              {settingsOpen.has("shopee") && (
              <div className="px-6 pb-6 pt-4 border-t">
              <p className="text-sm text-gray-500 mb-4">
                Otomatis mengurangi stok produk saat pembeli Shopee menerima pesanan. Sistem memantau email <strong>&quot;Pesanan Telah Diterima Pembeli&quot;</strong> dari Shopee.
              </p>

              {!shopeeStatus?.imap_configured && (
                <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
                  Belum aktif. Atur Secret di Replit: <code className="bg-amber-100 px-1.5 py-0.5 rounded text-xs">IMAP_USER</code> (alamat Gmail) dan <code className="bg-amber-100 px-1.5 py-0.5 rounded text-xs">IMAP_PASSWORD</code> (Gmail App Password). Kemudian restart aplikasi.
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
                <div className="border rounded-lg p-3 text-center">
                  <div className="text-xs text-gray-500">Total</div>
                  <div className="text-lg font-bold">{shopeeStatus?.totals.all ?? 0}</div>
                </div>
                <div className="border rounded-lg p-3 text-center bg-green-50">
                  <div className="text-xs text-gray-600">Berhasil</div>
                  <div className="text-lg font-bold text-green-700">{shopeeStatus?.totals.success ?? 0}</div>
                </div>
                <div className="border rounded-lg p-3 text-center bg-yellow-50">
                  <div className="text-xs text-gray-600">Sebagian</div>
                  <div className="text-lg font-bold text-yellow-700">{shopeeStatus?.totals.partial ?? 0}</div>
                </div>
                <div className="border rounded-lg p-3 text-center bg-orange-50">
                  <div className="text-xs text-gray-600">Tdk Cocok</div>
                  <div className="text-lg font-bold text-orange-700">{shopeeStatus?.totals.no_match ?? 0}</div>
                </div>
                <div className="border rounded-lg p-3 text-center bg-red-50">
                  <div className="text-xs text-gray-600">Error</div>
                  <div className="text-lg font-bold text-red-700">{shopeeStatus?.totals.error ?? 0}</div>
                </div>
              </div>

              <div className="text-xs text-gray-500 mb-4 space-y-0.5">
                <div>Status daemon: <span className="font-medium text-gray-700">{shopeeStatus?.daemon.last_event || "-"}</span></div>
                {shopeeStatus?.last_processed_at && (
                  <div>Proses terakhir: <span className="font-medium text-gray-700">{new Date(shopeeStatus.last_processed_at).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</span></div>
                )}
                {shopeeStatus?.daemon.last_error && (
                  <div className="text-red-600">Error terakhir: {shopeeStatus.daemon.last_error}</div>
                )}
              </div>

              <div className="flex items-center gap-3 flex-wrap mb-5">
                <button
                  onClick={runShopeeSync}
                  disabled={shopeeSyncing || !shopeeStatus?.imap_configured}
                  className="px-5 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50"
                  data-testid="btn-shopee-sync-now"
                >
                  {shopeeSyncing ? "Memeriksa..." : "Sinkron Sekarang"}
                </button>
                <button
                  onClick={loadShopeeAll}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
                >
                  Refresh
                </button>
                {shopeeMsg && <span className="text-sm text-gray-700">{shopeeMsg}</span>}
              </div>

              <div className="mb-5 border rounded-lg" data-testid="panel-shopee-test">
                <button
                  type="button"
                  onClick={() => setShopeeTestOpen((v) => !v)}
                  className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50 transition"
                >
                  <span className="font-semibold text-sm text-gray-800">🧪 Tes Parser Email (Dry-run)</span>
                  <span className="text-xs text-gray-500">{shopeeTestOpen ? "Tutup" : "Buka"}</span>
                </button>
                {shopeeTestOpen && (
                  <div className="px-4 pb-4 border-t pt-3 space-y-3">
                    <p className="text-xs text-gray-500">
                      Tempel <strong>Subject</strong> dan <strong>HTML body</strong> email Shopee untuk melihat apa yang akan diparsing dan dipetakan ke produk Anda. <em>Tidak ada perubahan stok.</em>
                    </p>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Subject Email</label>
                      <input
                        value={shopeeTestSubject}
                        onChange={(e) => setShopeeTestSubject(e.target.value)}
                        placeholder="[Shopee Seller] Pesanan #XXX-XXX-XXX Telah Diterima Pembeli"
                        className="w-full border rounded-lg px-3 py-2 text-sm font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">HTML Body</label>
                      <textarea
                        value={shopeeTestHtml}
                        onChange={(e) => setShopeeTestHtml(e.target.value)}
                        rows={6}
                        placeholder='Contoh: <div class="product-row"><div class="product-name">Nama Produk</div><div class="product-variant">Variasi: Hitam</div><div class="product-qty">x2</div></div>'
                        className="w-full border rounded-lg px-3 py-2 text-xs font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setShopeeTestSubject("[Shopee Seller] Pesanan #TEST-001 Telah Diterima Pembeli");
                          const sample = products.slice(0, 2).map((p) => `  <div class="product-row">\n    <div class="product-name">${p.name}</div>\n    <div class="product-variant">Variasi: ${p.variants?.[0]?.variant_name || "-"}</div>\n    <div class="product-qty">x1</div>\n  </div>`).join("\n");
                          setShopeeTestHtml(`<html><body>\n<div class="product-list">\n${sample}\n</div>\n</body></html>`);
                        }}
                        className="mt-2 text-xs text-blue-600 hover:underline"
                      >
                        Isi otomatis dengan 2 produk toko Anda
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!shopeeTestSubject.trim() || !shopeeTestHtml.trim()) { setShopeeTestResult({ subject_matches_filter: false, order_no: "", items_found: 0, items: [], error: "Subject dan HTML wajib diisi" }); return; }
                        setShopeeTestRunning(true); setShopeeTestResult(null);
                        try {
                          const res = await fetch("/api/shopee-sync/test-parse", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ subject: shopeeTestSubject, html: shopeeTestHtml }),
                          });
                          const data = await res.json();
                          if (!res.ok) { setShopeeTestResult({ subject_matches_filter: false, order_no: "", items_found: 0, items: [], error: data.error || data.detail || "Gagal" }); }
                          else { setShopeeTestResult(data); }
                        } catch (e) {
                          setShopeeTestResult({ subject_matches_filter: false, order_no: "", items_found: 0, items: [], error: "Koneksi gagal: " + String(e) });
                        } finally {
                          setShopeeTestRunning(false);
                        }
                      }}
                      disabled={shopeeTestRunning}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                    >
                      {shopeeTestRunning ? "Memproses..." : "Jalankan Tes"}
                    </button>

                    {shopeeTestResult && (
                      <div className="mt-3 p-3 rounded-lg border bg-gray-50 text-sm">
                        {shopeeTestResult.error ? (
                          <div className="text-red-700">{shopeeTestResult.error}</div>
                        ) : (
                          <>
                            <div className="grid grid-cols-3 gap-3 mb-3 text-center">
                              <div className={`p-2 rounded ${shopeeTestResult.subject_matches_filter ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                                <div className="text-xs">Subject Cocok?</div>
                                <div className="font-bold">{shopeeTestResult.subject_matches_filter ? "✓ Ya" : "✗ Tidak"}</div>
                              </div>
                              <div className="p-2 rounded bg-white border">
                                <div className="text-xs text-gray-500">Order No</div>
                                <div className="font-mono text-xs font-medium">{shopeeTestResult.order_no || "-"}</div>
                              </div>
                              <div className="p-2 rounded bg-white border">
                                <div className="text-xs text-gray-500">Item Ditemukan</div>
                                <div className="font-bold">{shopeeTestResult.items_found}</div>
                              </div>
                            </div>
                            {shopeeTestResult.items.length > 0 ? (
                              <ul className="space-y-2">
                                {shopeeTestResult.items.map((it, i) => (
                                  <li key={i} className={`p-2 rounded border ${it.matched ? "bg-green-50 border-green-200" : "bg-orange-50 border-orange-200"}`}>
                                    <div className="font-medium text-xs break-words">{it.matched ? "✓" : "✗"} {it.name}{it.variant && <span className="text-gray-500"> · {it.variant}</span>} <span className="text-gray-700">× {it.qty}</span></div>
                                    {it.matched ? (
                                      <div className="text-xs text-green-700 mt-1">→ {it.product_name}{it.variant_name && ` (${it.variant_name})`} · stok saat ini: {it.current_stock}</div>
                                    ) : (
                                      <div className="text-xs text-orange-700 mt-1">Tidak cocok dengan produk toko mana pun. Akan masuk ke daftar &quot;belum dipetakan&quot;.</div>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <div className="text-xs text-orange-700">Tidak ada item terdeteksi. Pastikan HTML berisi elemen <code>.product-row</code>, <code>.product-name</code>, dan <code>.product-qty</code>.</div>
                            )}
                            {shopeeTestResult.note && <div className="text-xs text-gray-500 mt-2 italic">{shopeeTestResult.note}</div>}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {shopeeUnmatched.length > 0 && (
                <div className="mb-5">
                  <h3 className="font-semibold text-sm mb-2 text-gray-800">Produk Shopee yang Belum Dipetakan ({shopeeUnmatched.length})</h3>
                  <p className="text-xs text-gray-500 mb-3">Pilih produk toko untuk setiap nama Shopee agar stok bisa otomatis dikurangi.</p>
                  <div className="border rounded-lg divide-y">
                    {shopeeUnmatched.map((u) => {
                      const isActive = shopeeMapForm.shopee_name === u.name;
                      const selectedProduct = products.find((p) => p.id === shopeeMapForm.product_id);
                      return (
                        <div key={u.name} className="p-3" data-testid="row-unmatched">
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm text-gray-900 break-words">{u.name}</div>
                              <div className="text-xs text-gray-500 mt-0.5">
                                Muncul {u.count}x{u.variant_examples.length > 0 && ` · Varian: ${u.variant_examples.slice(0, 3).join(", ")}`}
                              </div>
                            </div>
                            {!isActive ? (
                              <button
                                onClick={() => setShopeeMapForm({ shopee_name: u.name, product_id: "", variant_id: "" })}
                                className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50"
                              >
                                Petakan
                              </button>
                            ) : (
                              <button
                                onClick={() => setShopeeMapForm({ shopee_name: "", product_id: "", variant_id: "" })}
                                className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50"
                              >
                                Batal
                              </button>
                            )}
                          </div>
                          {isActive && (
                            <div className="mt-3 flex flex-wrap gap-2 items-center">
                              <select
                                value={shopeeMapForm.product_id}
                                onChange={(e) => setShopeeMapForm((p) => ({ ...p, product_id: e.target.value, variant_id: "" }))}
                                className="border rounded-lg px-3 py-2 text-sm flex-1 min-w-[200px]"
                              >
                                <option value="">— Pilih produk toko —</option>
                                {products.map((p) => (
                                  <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                              </select>
                              {selectedProduct && Array.isArray(selectedProduct.variants) && selectedProduct.variants.length > 0 && (
                                <select
                                  value={shopeeMapForm.variant_id}
                                  onChange={(e) => setShopeeMapForm((p) => ({ ...p, variant_id: e.target.value }))}
                                  className="border rounded-lg px-3 py-2 text-sm"
                                >
                                  <option value="">— Semua varian —</option>
                                  {selectedProduct.variants.filter((v) => v.id).map((v) => (
                                    <option key={v.id} value={v.id}>{v.variant_name}</option>
                                  ))}
                                </select>
                              )}
                              <button
                                onClick={() => saveShopeeMapping(shopeeMapForm.shopee_name, shopeeMapForm.product_id, shopeeMapForm.variant_id)}
                                disabled={!shopeeMapForm.product_id}
                                className="px-3 py-2 bg-gray-900 text-white text-xs rounded-lg disabled:opacity-50"
                              >
                                Simpan
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {shopeeMappings.length > 0 && (
                <div className="mb-5">
                  <h3 className="font-semibold text-sm mb-2 text-gray-800">Pemetaan Aktif ({shopeeMappings.length})</h3>
                  <div className="border rounded-lg divide-y text-sm">
                    {shopeeMappings.map((m) => (
                      <div key={m.id} className="p-3 flex items-start justify-between gap-3 flex-wrap" data-testid="row-mapping">
                        <div className="flex-1 min-w-0">
                          <div className="text-gray-900 break-words"><span className="text-xs text-gray-500">Shopee:</span> {m.shopee_product_name}</div>
                          <div className="text-gray-700 break-words mt-0.5"><span className="text-xs text-gray-500">→ Toko:</span> {m.product_name || "(produk dihapus)"}{m.variant_name ? ` · ${m.variant_name}` : ""}</div>
                        </div>
                        <button
                          onClick={() => deleteShopeeMapping(m.id)}
                          className="px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
                        >
                          Hapus
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {shopeeLogs.length > 0 && (
                <div>
                  <h3 className="font-semibold text-sm mb-2 text-gray-800">Riwayat Sinkronisasi Terakhir</h3>
                  <div className="border rounded-lg divide-y text-sm max-h-96 overflow-y-auto">
                    {shopeeLogs.map((log) => {
                      const statusColor = log.status === "success" ? "bg-green-100 text-green-800"
                        : log.status === "partial" ? "bg-yellow-100 text-yellow-800"
                        : log.status === "no_match" ? "bg-orange-100 text-orange-800"
                        : "bg-red-100 text-red-800";
                      return (
                        <div key={log.id} className="p-3" data-testid="row-shopee-log">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor}`}>{log.status}</span>
                              <span className="font-medium">#{log.shopee_order_no || "-"}</span>
                              <span className="text-xs text-gray-500">{new Date(log.processed_at).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</span>
                            </div>
                            <span className="text-xs text-gray-600">−{log.total_decremented} stok</span>
                          </div>
                          {log.items.length > 0 && (
                            <ul className="mt-2 text-xs text-gray-600 space-y-0.5 pl-3">
                              {log.items.map((it, i) => (
                                <li key={i} className={it.matched ? "" : "text-orange-600"}>
                                  {it.matched ? "✓" : "✗"} {it.name}{it.variant ? ` (${it.variant})` : ""} × {it.qty}
                                  {it.matched && it.product_name && it.product_name !== it.name && <span className="text-gray-400"> → {it.product_name}</span>}
                                </li>
                              ))}
                            </ul>
                          )}
                          {log.error_msg && <div className="text-xs text-red-600 mt-1">{log.error_msg}</div>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              </div>
              )}
            </div>
          </div>
        )}

        {tab === "admins" && user?.role === "seller" && (
          <div className="bg-white rounded-xl border p-6">
            <h2 className="font-bold text-lg mb-6">Kelola Admin</h2>

            {adminMsg && (
              <div className={`mb-4 px-4 py-2 rounded-lg text-sm ${adminMsg.startsWith("Berhasil") ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-600 border border-red-200"}`}>
                {adminMsg}
              </div>
            )}

            <div className="mb-8">
              <h3 className="font-semibold text-sm text-gray-700 mb-3">Tambah Admin Baru</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <input value={adminForm.name} onChange={(e) => setAdminForm((f) => ({ ...f, name: e.target.value }))} placeholder="Nama" className="border rounded-lg px-3 py-2 text-sm" />
                <input value={adminForm.email} onChange={(e) => setAdminForm((f) => ({ ...f, email: e.target.value }))} placeholder="Email" type="email" className="border rounded-lg px-3 py-2 text-sm" />
                <input value={adminForm.password} onChange={(e) => setAdminForm((f) => ({ ...f, password: e.target.value }))} placeholder="Password (min. 6 karakter)" type="password" className="border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="mb-3">
                <p className="text-xs text-gray-500 mb-2">Akses menu:</p>
                <div className="flex flex-wrap gap-2">
                  {allPermissions.map((p) => (
                    <label key={p} className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={adminForm.permissions.includes(p)}
                        onChange={(e) => setAdminForm((f) => ({ ...f, permissions: e.target.checked ? [...f.permissions, p] : f.permissions.filter((x) => x !== p) }))}
                        className="accent-indigo-600" />
                      <span className="text-sm">{permLabels[p]}</span>
                    </label>
                  ))}
                </div>
              </div>
              <button disabled={adminLoading} onClick={async () => {
                setAdminLoading(true); setAdminMsg("");
                const res = await fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(adminForm) });
                const data = await res.json();
                if (data.admin) { setAdminUsers((prev) => [...prev, data.admin]); setAdminForm({ name: "", email: "", password: "", permissions: [] }); setAdminMsg("Berhasil menambah admin."); }
                else setAdminMsg(data.error || "Gagal menambah admin.");
                setAdminLoading(false);
              }} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition">
                {adminLoading ? "Menyimpan..." : "Tambah Admin"}
              </button>
            </div>

            <div>
              <h3 className="font-semibold text-sm text-gray-700 mb-3">Daftar Admin ({adminUsers.length})</h3>
              {adminUsers.length === 0 ? (
                <p className="text-sm text-gray-400">Belum ada admin yang ditambahkan.</p>
              ) : (
                <div className="divide-y">
                  {adminUsers.map((admin) => (
                    <div key={admin.id} className="py-4">
                      {editingAdminId === admin.id ? (
                        <div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                            <input value={editAdminForm.name} onChange={(e) => setEditAdminForm((f) => ({ ...f, name: e.target.value }))} placeholder="Nama" className="border rounded-lg px-3 py-2 text-sm" />
                            <input value={editAdminForm.email} onChange={(e) => setEditAdminForm((f) => ({ ...f, email: e.target.value }))} placeholder="Email" type="email" className="border rounded-lg px-3 py-2 text-sm" />
                            <input value={editAdminForm.password} onChange={(e) => setEditAdminForm((f) => ({ ...f, password: e.target.value }))} placeholder="Password baru (kosongkan jika tidak diubah)" type="password" className="border rounded-lg px-3 py-2 text-sm" />
                          </div>
                          <div className="mb-3">
                            <p className="text-xs text-gray-500 mb-2">Akses menu:</p>
                            <div className="flex flex-wrap gap-2">
                              {allPermissions.map((p) => (
                                <label key={p} className="flex items-center gap-1.5 cursor-pointer">
                                  <input type="checkbox" checked={editAdminForm.permissions.includes(p)}
                                    onChange={(e) => setEditAdminForm((f) => ({ ...f, permissions: e.target.checked ? [...f.permissions, p] : f.permissions.filter((x) => x !== p) }))}
                                    className="accent-indigo-600" />
                                  <span className="text-sm">{permLabels[p]}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button disabled={adminLoading} onClick={async () => {
                              setAdminLoading(true); setAdminMsg("");
                              const body: Record<string, unknown> = { name: editAdminForm.name, email: editAdminForm.email, permissions: editAdminForm.permissions };
                              if (editAdminForm.password) body.password = editAdminForm.password;
                              const res = await fetch(`/api/admin/users/${admin.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
                              const data = await res.json();
                              if (data.admin) { setAdminUsers((prev) => prev.map((a) => a.id === admin.id ? data.admin : a)); setEditingAdminId(null); setAdminMsg("Berhasil memperbarui admin."); }
                              else setAdminMsg(data.error || "Gagal memperbarui.");
                              setAdminLoading(false);
                            }} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition">Simpan</button>
                            <button onClick={() => setEditingAdminId(null)} className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition">Batal</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="font-medium text-sm">{admin.name}</p>
                            <p className="text-xs text-gray-400">{admin.email}</p>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {admin.permissions.length === 0 ? (
                                <span className="text-xs text-red-400">Tidak ada akses</span>
                              ) : admin.permissions.map((p) => (
                                <span key={p} className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-full">{permLabels[p] || p}</span>
                              ))}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => { setEditingAdminId(admin.id); setEditAdminForm({ name: admin.name, email: admin.email, password: "", permissions: [...admin.permissions] }); setAdminMsg(""); }}
                              className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition">Edit</button>
                            <button onClick={async () => {
                              if (!confirm(`Hapus admin "${admin.name}"?`)) return;
                              setAdminMsg("");
                              const res = await fetch(`/api/admin/users/${admin.id}`, { method: "DELETE" });
                              const data = await res.json();
                              if (data.success) { setAdminUsers((prev) => prev.filter((a) => a.id !== admin.id)); setAdminMsg("Berhasil menghapus admin."); }
                              else setAdminMsg(data.error || "Gagal menghapus.");
                            }} className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-sm font-medium hover:bg-red-100 transition">Hapus</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
