"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";

interface ProductImage {
  id: string;
  image_url: string;
  display_order: number;
}

interface VariantGroup {
  id: string;
  typeName: string;
  values: string[];
}

interface CombinationRow {
  comboKeys: string[];
  price: number | null;
  original_price: number | null;
  stock: number | null;
  is_available: boolean;
}

interface ApiVariant {
  id?: string;
  variant_type: string;
  variant_name: string;
  price: number | null;
  original_price: number | null;
  price_modifier: number;
  stock: number | null;
  is_available: boolean;
}

function fmtNum(val: string | number | null | undefined): string {
  if (val === null || val === undefined || val === "") return "";
  const num = parseInt(String(val).replace(/[^0-9]/g, ""), 10);
  if (isNaN(num)) return "";
  return num.toLocaleString("id-ID");
}

function stripFmt(val: string): string {
  return val.replace(/[^0-9]/g, "");
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function cartesianProduct(groups: VariantGroup[]): string[][] {
  const active = groups.filter(g => g.typeName.trim() && g.values.some(v => v.trim()));
  if (active.length === 0) return [];
  return active.reduce<string[][]>((acc, group) => {
    const vals = group.values.filter(v => v.trim());
    if (acc.length === 0) return vals.map(v => [v]);
    return acc.flatMap(combo => vals.map(v => [...combo, v]));
  }, []);
}

function rebuildCombinations(groups: VariantGroup[], existing: CombinationRow[]): CombinationRow[] {
  const validKeys = new Set(cartesianProduct(groups).map(keys => keys.join("\0")));
  // 1. Keep existing combos that are still valid — preserves original order
  const kept = existing.filter(r => validKeys.has(r.comboKeys.join("\0")));
  const keptKeys = new Set(kept.map(r => r.comboKeys.join("\0")));
  // 2. Append brand-new combos (newly added values) at the end
  const added = cartesianProduct(groups)
    .filter(keys => !keptKeys.has(keys.join("\0")))
    .map(keys => ({ comboKeys: keys, price: null, original_price: null, stock: null, is_available: true }));
  return [...kept, ...added];
}

function parseVariantsToState(apiVariants: ApiVariant[], comboVariants: ApiVariant[] = []): { groups: VariantGroup[]; combos: CombinationRow[] } {
  if (!apiVariants.length) return { groups: [], combos: [] };
  const firstType = apiVariants[0].variant_type || "";
  const isMulti = firstType.includes(" / ");

  if (isMulti) {
    const typeNames = firstType.split(" / ");
    const valSets: string[][] = typeNames.map(() => []);
    const combos: CombinationRow[] = apiVariants.map(v => {
      const parts = (v.variant_name || "").split(" / ");
      typeNames.forEach((_, i) => {
        const val = parts[i]?.trim();
        if (val && !valSets[i].includes(val)) valSets[i].push(val);
      });
      return { comboKeys: parts, price: v.price ?? null, original_price: v.original_price ?? null, stock: v.stock ?? null, is_available: v.is_available !== false };
    });
    const groups: VariantGroup[] = typeNames.map((t, i) => ({ id: uid(), typeName: t, values: valSets[i] }));
    return { groups, combos };
  }

  const typeOrder: string[] = [];
  const typeMap = new Map<string, { values: string[]; byName: Map<string, ApiVariant> }>();
  apiVariants.forEach(v => {
    const t = v.variant_type?.trim() || "Varian";
    if (!typeMap.has(t)) { typeOrder.push(t); typeMap.set(t, { values: [], byName: new Map() }); }
    const entry = typeMap.get(t)!;
    if (v.variant_name && !entry.values.includes(v.variant_name)) {
      entry.values.push(v.variant_name);
      entry.byName.set(v.variant_name, v);
    }
  });
  const groups: VariantGroup[] = typeOrder.map(t => ({ id: uid(), typeName: t, values: typeMap.get(t)!.values }));
  const rawCombos = cartesianProduct(groups);
  const combos: CombinationRow[] = rawCombos.map(keys => {
    if (groups.length === 1) {
      // Single-type: read price/stock directly from the display row
      const v = typeMap.get(groups[0].typeName)?.byName.get(keys[0]);
      if (v) return { comboKeys: keys, price: v.price ?? null, original_price: v.original_price ?? null, stock: v.stock ?? null, is_available: v.is_available !== false };
    } else if (comboVariants.length > 0) {
      // Multi-type old format: look up from _combinations rows.
      // Sort both sides so group-order mismatch (API vs DB) doesn't break matching.
      const sortedKeys = [...keys].sort().join(" / ");
      const cv = comboVariants.find(c => {
        const sortedName = (c.variant_name || "").split(" / ").sort().join(" / ");
        return sortedName === sortedKeys;
      });
      if (cv) return { comboKeys: keys, price: cv.price ?? null, original_price: cv.original_price ?? null, stock: cv.stock ?? null, is_available: cv.is_available !== false };
    }
    return { comboKeys: keys, price: null, original_price: null, stock: null, is_available: true };
  });
  return { groups, combos };
}

const PRESET_TYPES = ["Warna", "Ukuran", "Material", "Model", "Tipe", "Motif", "Finishing"];

const TrashIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

export default function EditProductPage() {
  const router = useRouter();
  const params = useParams();
  const slug = params.slug as string;
  const isNew = slug === "new";

  const [showProductDiscountTip, setShowProductDiscountTip] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [originalPrice, setOriginalPrice] = useState("");
  const [stock, setStock] = useState("0");
  const [weight, setWeight] = useState("");
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [primaryImage, setPrimaryImage] = useState("");
  const [images, setImages] = useState<ProductImage[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isAvailable, setIsAvailable] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({});

  const [variantGroups, setVariantGroups] = useState<VariantGroup[]>([]);
  const [combinations, setCombinations] = useState<CombinationRow[]>([]);
  const [comboErrors, setComboErrors] = useState<Record<number, boolean>>({});
  const [showGroupDropdown, setShowGroupDropdown] = useState(false);
  const [customGroupName, setCustomGroupName] = useState("");
  const [openComboTip, setOpenComboTip] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasVariants = combinations.length > 0;
  const totalVariantStock = combinations.reduce((sum, c) => sum + (c.stock || 0), 0);
  const maxComboPrice = hasVariants
    ? combinations.filter(c => c.price != null).reduce((max, c) => (c.price! > max ? c.price! : max), -Infinity)
    : null;
  const maxComboDiscount = hasVariants
    ? combinations.filter(c => c.original_price != null).reduce((max, c) => (c.original_price! > max ? c.original_price! : max), -Infinity)
    : null;
  const hasComboDiscount = hasVariants && combinations.some(c => c.original_price != null);

  const applyGroupChange = (newGroups: VariantGroup[]) => {
    setVariantGroups(newGroups);
    setCombinations(prev => rebuildCombinations(newGroups, prev));
  };

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me").then(r => r.json()).then(data => {
      if (!cancelled && (!data.user || data.user.role !== "seller")) router.push("/login");
    });
    fetch("/api/categories").then(r => r.json()).then(data => {
      if (!cancelled) setCategories(data.categories || []);
    }).catch(() => {});
    if (!isNew) {
      fetch(`/api/products/${slug}`).then(r => r.json()).then(data => {
        if (cancelled) return;
        if (data.product) {
          setName(data.product.name);
          setPrice(String(data.product.price));
          setOriginalPrice(data.product.original_price ? String(data.product.original_price) : "");
          setStock(String(data.product.stock));
          setWeight(String(data.product.weight || 500));
          setLength(String(data.product.length || 10));
          setWidth(String(data.product.width || 10));
          setHeight(String(data.product.height || 10));
          setCategory(data.product.category || "");
          setDescription(data.product.description || "");
          setVideoUrl(data.product.video_url || "");
          setPrimaryImage(data.product.primary_image || "");
          setImages(data.product.images || []);
          setIsAvailable(data.product.is_available !== false);
          const allVariants: ApiVariant[] = data.product.variants || [];
          const apiVariants: ApiVariant[] = allVariants.filter((v: ApiVariant) => v.variant_type !== "_combinations");
          const comboVariants: ApiVariant[] = allVariants.filter((v: ApiVariant) => v.variant_type === "_combinations");
          const { groups, combos } = parseVariantsToState(apiVariants, comboVariants);
          setVariantGroups(groups);
          setCombinations(combos);
          if (data.product.category) {
            setCategories(prev => prev.includes(data.product.category) ? prev : [...prev, data.product.category].sort());
          }
        }
        setLoading(false);
      });
    }
    return () => { cancelled = true; };
  }, [slug, isNew, router]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    setError("");
    for (let i = 0; i < files.length; i++) {
      const formData = new FormData();
      formData.append("file", files[i]);
      try {
        if (!isNew && slug) {
          const res = await fetch(`/api/products/${slug}/images`, { method: "POST", body: formData });
          if (res.ok) { const data = await res.json(); setImages(prev => [...prev, data.image]); if (!primaryImage) setPrimaryImage(data.image.image_url); }
        } else {
          const res = await fetch("/api/upload-image", { method: "POST", body: formData });
          if (res.ok) { const data = await res.json(); const newImg: ProductImage = { id: `temp-${Date.now()}-${i}`, image_url: data.image_url, display_order: images.length + i }; setImages(prev => [...prev, newImg]); if (!primaryImage) setPrimaryImage(data.image_url); }
        }
      } catch { setError("Gagal mengupload gambar"); }
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDeleteImage = async (imageId: string, imageUrl: string) => {
    if (!isNew && slug && !imageId.startsWith("temp-")) await fetch(`/api/products/${slug}/images/${imageId}`, { method: "DELETE" });
    setImages(prev => prev.filter(img => img.id !== imageId));
    if (primaryImage === imageUrl && images.length > 1) { const remaining = images.filter(img => img.id !== imageId); setPrimaryImage(remaining[0]?.image_url || ""); }
  };

  const addGroup = (typeName: string) => {
    const trimmed = typeName.trim();
    if (!trimmed) return;
    applyGroupChange([...variantGroups, { id: uid(), typeName: trimmed, values: [""] }]);
    setShowGroupDropdown(false);
    setCustomGroupName("");
  };

  const updateGroupTypeName = (gIdx: number, val: string) => {
    setVariantGroups(prev => prev.map((g, i) => i === gIdx ? { ...g, typeName: val } : g));
  };

  const removeGroup = (gIdx: number) => {
    applyGroupChange(variantGroups.filter((_, i) => i !== gIdx));
  };

  const addValue = (gIdx: number) => {
    applyGroupChange(variantGroups.map((g, i) => i === gIdx ? { ...g, values: [...g.values, ""] } : g));
  };

  const updateValue = (gIdx: number, vIdx: number, newVal: string) => {
    const oldVal = variantGroups[gIdx].values[vIdx];
    const newGroups = variantGroups.map((g, i) => i === gIdx ? { ...g, values: g.values.map((v, j) => j === vIdx ? newVal : v) } : g);
    setVariantGroups(newGroups);
    if (oldVal.trim() && oldVal !== newVal) {
      const activeIdx = newGroups.filter(g => g.typeName.trim() && g.values.some(v => v.trim())).findIndex(g => g.id === newGroups[gIdx].id);
      const updated = activeIdx >= 0
        ? combinations.map(c => ({ ...c, comboKeys: c.comboKeys.map((k, pos) => pos === activeIdx && k === oldVal ? newVal : k) }))
        : combinations;
      setCombinations(rebuildCombinations(newGroups, updated));
    } else {
      setCombinations(rebuildCombinations(newGroups, combinations));
    }
  };

  const removeValue = (gIdx: number, vIdx: number) => {
    applyGroupChange(variantGroups.map((g, i) => i === gIdx ? { ...g, values: g.values.filter((_, j) => j !== vIdx) } : g));
  };

  const updateCombo = (idx: number, field: keyof CombinationRow, value: unknown) => {
    setCombinations(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setSuccess("");

    const missing: Record<string, boolean> = {};
    if (!price || Number(price) <= 0) missing.price = true;
    if (!weight || Number(weight) <= 0) missing.weight = true;
    if (!length || Number(length) <= 0) missing.length = true;
    if (!width || Number(width) <= 0) missing.width = true;
    if (!height || Number(height) <= 0) missing.height = true;
    if (Object.keys(missing).length > 0) {
      setFieldErrors(missing);
      const labels: Record<string, string> = { price: "Harga Asli", weight: "Berat", length: "Panjang", width: "Lebar", height: "Tinggi" };
      setError("Harap isi: " + Object.keys(missing).map(k => labels[k]).join(", "));
      return;
    }

    // Validate: discount price must be less than original price
    if (originalPrice && Number(originalPrice) >= Number(price)) {
      setFieldErrors({ ...missing, originalPrice: true });
      setError("Harga Diskon harus lebih kecil dari Harga Asli.");
      return;
    }
    setFieldErrors({});

    if (combinations.length > 0) {
      const cErr: Record<number, boolean> = {};
      combinations.forEach((c, i) => {
        if (c.stock === null || c.stock === undefined) cErr[i] = true;
        if (c.original_price != null && c.price != null && c.original_price >= c.price) cErr[i] = true;
      });
      if (Object.keys(cErr).length > 0) {
        setComboErrors(cErr);
        const hasStockErr = combinations.some((c, i) => cErr[i] && (c.stock === null || c.stock === undefined));
        const hasPriceErr = combinations.some((c, i) => cErr[i] && c.original_price != null && c.price != null && c.original_price >= c.price);
        setError(hasPriceErr ? "Harga Diskon varian harus lebih kecil dari Harga Asli varian." : "Harap isi Stok untuk setiap kombinasi varian.");
        return;
      }
    }
    setComboErrors({});

    setSaving(true);
    try {
      const typeLabel = variantGroups.map(g => g.typeName).join(" / ");
      const apiVariants = combinations.map(c => ({
        variant_type: typeLabel,
        variant_name: c.comboKeys.join(" / "),
        price: c.price,
        original_price: c.original_price ?? null,
        price_modifier: 0,
        stock: c.stock ?? 0,
        is_available: c.is_available,
      }));

      const body: Record<string, unknown> = {
        name, price: Number(price), original_price: originalPrice ? Number(originalPrice) : null,
        stock: hasVariants ? totalVariantStock : Number(stock),
        weight: Number(weight), length: Number(length), width: Number(width), height: Number(height),
        category, description, video_url: videoUrl || null, primary_image: primaryImage,
        is_available: isAvailable, variants: apiVariants,
      };
      if (isNew) body.images = images.map(img => ({ image_url: img.image_url, display_order: img.display_order }));

      const url = isNew ? "/api/products" : `/api/products/${slug}`;
      const method = isNew ? "POST" : "PUT";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { const data = await res.json(); setError(data.error || "Gagal menyimpan"); return; }
      setSuccess("Produk berhasil disimpan!");
      setTimeout(() => router.push("/seller"), 1000);
    } catch { setError("Terjadi kesalahan"); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-gray-400">Memuat...</div></div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/seller" className="text-gray-400 hover:text-gray-600" data-testid="link-back">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          </Link>
          <h1 className="text-lg font-bold">{isNew ? "Tambah Produk" : "Edit Produk"}</h1>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6">
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Info Produk */}
          <div className="bg-white rounded-lg border p-4 space-y-4">
            <h2 className="font-bold text-sm text-gray-500 uppercase tracking-wide">Informasi Produk</h2>
            <div className="flex items-center justify-between">
              <div className="flex-1 mr-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Produk</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-gray-900 outline-none" required data-testid="input-product-name" />
              </div>
              <div className="flex-shrink-0 flex flex-col items-center gap-1 pt-5">
                <span className="text-xs font-medium text-gray-500">Tampil di Toko</span>
                <button type="button" onClick={() => setIsAvailable(v => !v)} className={`w-12 h-6 rounded-full transition-colors duration-200 relative ${isAvailable ? "bg-green-500" : "bg-gray-300"}`} data-testid="toggle-product-available">
                  <span className={`absolute top-0.5 left-0 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${isAvailable ? "translate-x-6" : "translate-x-0.5"}`} />
                </button>
                <span className={`text-xs font-medium ${isAvailable ? "text-green-600" : "text-gray-400"}`}>{isAvailable ? "Aktif" : "Nonaktif"}</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Harga Asli (Rp)</label>
                {hasVariants ? (
                  <>
                    <input type="text" value={maxComboPrice !== null && maxComboPrice !== -Infinity ? fmtNum(maxComboPrice) : "—"} readOnly className="w-full px-4 py-2.5 border rounded-lg bg-gray-100 text-gray-500 cursor-not-allowed outline-none" data-testid="input-product-price" />
                    <p className="text-xs text-gray-400 mt-1">Mengikuti harga varian</p>
                  </>
                ) : (
                  <input type="text" inputMode="numeric" value={fmtNum(price)} onChange={e => { setPrice(stripFmt(e.target.value)); setFieldErrors(p => ({ ...p, price: false })); }} className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 outline-none ${fieldErrors.price ? "border-red-400 focus:ring-red-300" : "focus:ring-gray-900"}`} placeholder="0" data-testid="input-product-price" />
                )}
              </div>
              <div>
                <label className="flex items-center gap-1 text-sm font-medium text-gray-700 mb-1">
                  Harga Diskon (Rp) <span className="font-normal text-gray-400">(Opsional)</span>
                  {!hasVariants && (
                    <div className="relative">
                      <button type="button" onClick={() => setShowProductDiscountTip(v => !v)} className="w-4 h-4 rounded-full bg-gray-200 text-gray-500 text-[10px] font-bold flex items-center justify-center hover:bg-gray-300 leading-none flex-shrink-0">!</button>
                      {showProductDiscountTip && (
                        <div className="absolute left-0 top-5 z-20 w-56 bg-white border border-gray-200 rounded-lg shadow-lg p-2.5 text-xs text-gray-600 font-normal">
                          Jika diisi, harga asli dicoret &amp; harga diskon jadi harga jual
                        </div>
                      )}
                    </div>
                  )}
                </label>
                {hasVariants ? (
                  <>
                    <input type="text" value={hasComboDiscount && maxComboDiscount !== null && maxComboDiscount !== -Infinity ? fmtNum(maxComboDiscount) : "—"} readOnly className="w-full px-4 py-2.5 border rounded-lg bg-gray-100 text-gray-500 cursor-not-allowed outline-none" data-testid="input-product-original-price" />
                    <p className="text-xs text-gray-400 mt-1">Mengikuti harga varian</p>
                  </>
                ) : (
                  (() => {
                    const discountInvalid = !!originalPrice && !!price && Number(originalPrice) >= Number(price);
                    return (
                      <>
                        <input
                          type="text" inputMode="numeric"
                          value={fmtNum(originalPrice)}
                          onChange={e => { setOriginalPrice(stripFmt(e.target.value)); setFieldErrors(p => ({ ...p, originalPrice: false })); }}
                          className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 outline-none ${discountInvalid || fieldErrors.originalPrice ? "border-red-400 focus:ring-red-300" : "focus:ring-gray-900"}`}
                          placeholder="0"
                          data-testid="input-product-original-price"
                        />
                        {discountInvalid && (
                          <p className="text-xs text-red-500 mt-1">⚠ Harga diskon harus lebih kecil dari harga asli</p>
                        )}
                      </>
                    );
                  })()
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Stok</label>
                {hasVariants ? (
                  <>
                    <input type="text" value={fmtNum(totalVariantStock)} readOnly className="w-full px-4 py-2.5 border rounded-lg bg-gray-100 text-gray-500 cursor-not-allowed outline-none" data-testid="input-product-stock" />
                    <p className="text-xs text-gray-400 mt-1">Total dari stok varian</p>
                  </>
                ) : (
                  <input type="text" inputMode="numeric" value={fmtNum(stock)} placeholder="0" onChange={e => setStock(stripFmt(e.target.value))} className="w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-gray-900 outline-none" required data-testid="input-product-stock" />
                )}
              </div>
            </div>

            <div className="grid grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Berat (gram)</label>
                <input type="text" inputMode="numeric" value={fmtNum(weight)} onChange={e => { setWeight(stripFmt(e.target.value)); setFieldErrors(p => ({ ...p, weight: false })); }} className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 outline-none ${fieldErrors.weight ? "border-red-400 focus:ring-red-300" : "focus:ring-gray-900"}`} placeholder="0" data-testid="input-product-weight" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Panjang (cm)</label>
                <input type="text" inputMode="numeric" value={fmtNum(length)} onChange={e => { setLength(stripFmt(e.target.value)); setFieldErrors(p => ({ ...p, length: false })); }} className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 outline-none ${fieldErrors.length ? "border-red-400 focus:ring-red-300" : "focus:ring-gray-900"}`} placeholder="0" data-testid="input-product-length" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Lebar (cm)</label>
                <input type="text" inputMode="numeric" value={fmtNum(width)} onChange={e => { setWidth(stripFmt(e.target.value)); setFieldErrors(p => ({ ...p, width: false })); }} className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 outline-none ${fieldErrors.width ? "border-red-400 focus:ring-red-300" : "focus:ring-gray-900"}`} placeholder="0" data-testid="input-product-width" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tinggi (cm)</label>
                <input type="text" inputMode="numeric" value={fmtNum(height)} onChange={e => { setHeight(stripFmt(e.target.value)); setFieldErrors(p => ({ ...p, height: false })); }} className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 outline-none ${fieldErrors.height ? "border-red-400 focus:ring-red-300" : "focus:ring-gray-900"}`} placeholder="0" data-testid="input-product-height" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kategori</label>
              <input type="text" value={category} onChange={e => setCategory(e.target.value)} className="w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-gray-900 outline-none" list="category-list" data-testid="input-product-category" />
              <datalist id="category-list">{categories.map(cat => <option key={cat} value={cat} />)}</datalist>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Deskripsi</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} className="w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-gray-900 outline-none" rows={5} data-testid="input-product-description" />
            </div>
          </div>

          {/* Foto Produk */}
          <div className="bg-white rounded-lg border p-4 space-y-4">
            <h2 className="font-bold text-sm text-gray-500 uppercase tracking-wide">Foto Produk</h2>
            <div className="grid grid-cols-4 gap-3">
              {images.map(img => (
                <div key={img.id} className="relative group aspect-square">
                  <img src={img.image_url} alt="" className="w-full h-full object-cover rounded-lg border" />
                  {primaryImage === img.image_url && <span className="absolute top-1 left-1 bg-gray-900 text-white text-xs px-1.5 py-0.5 rounded">Utama</span>}
                  <div className="absolute top-1 right-1 flex gap-1">
                    {primaryImage !== img.image_url && (
                      <button type="button" onClick={() => setPrimaryImage(img.image_url)} className="bg-white rounded-full w-6 h-6 flex items-center justify-center shadow text-xs opacity-0 group-hover:opacity-100 transition" title="Jadikan utama" data-testid={`button-set-primary-${img.id}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      </button>
                    )}
                    <button type="button" onClick={() => handleDeleteImage(img.id, img.image_url)} className="bg-white rounded-full w-6 h-6 flex items-center justify-center shadow text-red-500 opacity-0 group-hover:opacity-100 transition" data-testid={`button-delete-image-${img.id}`}>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                </div>
              ))}
              <label className="aspect-square border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-gray-400 transition">
                <input type="file" ref={fileInputRef} accept="image/*" multiple onChange={handleImageUpload} className="hidden" data-testid="input-image-upload" />
                {uploading ? <span className="text-xs text-gray-400">Uploading...</span> : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" /></svg>
                    <span className="text-xs text-gray-400 mt-1">Tambah Foto</span>
                  </>
                )}
              </label>
            </div>
          </div>

          {/* Video Produk */}
          <div className="bg-white rounded-lg border p-4 space-y-4">
            <h2 className="font-bold text-sm text-gray-500 uppercase tracking-wide">Video Produk</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">URL Video (YouTube/TikTok)</label>
              <input type="url" value={videoUrl} onChange={e => setVideoUrl(e.target.value)} className="w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-gray-900 outline-none" placeholder="https://youtube.com/watch?v=..." data-testid="input-video-url" />
            </div>
          </div>

          {/* Varian Produk */}
          <div className="bg-white rounded-lg border p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-sm text-gray-500 uppercase tracking-wide">Varian Produk</h2>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowGroupDropdown(v => !v)}
                  className="text-sm border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50 flex items-center gap-1.5 transition"
                  data-testid="button-add-variant-group"
                >
                  <span>+ Tambah Grup Varian</span>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </button>
                {showGroupDropdown && (
                  <div className="absolute right-0 top-10 z-30 bg-white border border-gray-200 rounded-xl shadow-xl p-2 w-56 space-y-0.5">
                    <p className="text-xs text-gray-400 px-2 pt-1 pb-1.5 font-medium">Pilih tipe varian</p>
                    {PRESET_TYPES.filter(t => !variantGroups.some(g => g.typeName === t)).map(t => (
                      <button key={t} type="button" onClick={() => addGroup(t)} className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-gray-100 transition" data-testid={`preset-type-${t}`}>{t}</button>
                    ))}
                    <div className="border-t border-gray-100 my-1" />
                    <div className="flex gap-1.5 px-1 pb-1">
                      <input
                        value={customGroupName}
                        onChange={e => setCustomGroupName(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addGroup(customGroupName); } }}
                        placeholder="Nama kustom..."
                        className="flex-1 px-2.5 py-1.5 text-sm border rounded-lg outline-none focus:ring-2 focus:ring-gray-900"
                      />
                      <button type="button" onClick={() => addGroup(customGroupName)} className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition">+</button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {showGroupDropdown && <div className="fixed inset-0 z-20" onClick={() => setShowGroupDropdown(false)} />}

            {variantGroups.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">
                Belum ada grup varian. Klik &ldquo;+ Tambah Grup Varian&rdquo; untuk menambahkan<br />
                <span className="text-xs">(contoh: Warna, Ukuran — sistem otomatis generate semua kombinasi)</span>
              </p>
            )}

            {/* Group cards */}
            {variantGroups.map((group, gIdx) => (
              <div key={group.id} className="border border-gray-200 rounded-xl p-4 space-y-3" data-testid={`variant-group-${gIdx}`}>
                <div className="flex items-center justify-between gap-3">
                  <input
                    type="text"
                    value={group.typeName}
                    onChange={e => updateGroupTypeName(gIdx, e.target.value)}
                    className="font-semibold text-sm bg-transparent border-b-2 border-gray-200 focus:border-gray-800 outline-none px-1 py-0.5 min-w-0 w-40"
                    placeholder="Nama Tipe"
                    data-testid={`input-group-typename-${gIdx}`}
                  />
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button type="button" onClick={() => addValue(gIdx)} className="text-xs border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition flex items-center gap-1" data-testid={`button-add-value-${gIdx}`}>
                      <span className="text-base leading-none">+</span> Tambah Nilai
                    </button>
                    <button type="button" onClick={() => removeGroup(gIdx)} className="text-red-400 hover:text-red-600 transition p-1" title="Hapus grup" data-testid={`button-remove-group-${gIdx}`}>
                      <TrashIcon />
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  {group.values.map((val, vIdx) => (
                    <div key={vIdx} className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-300 select-none pointer-events-none">Nilai</span>
                        <input
                          type="text"
                          value={val}
                          onChange={e => updateValue(gIdx, vIdx, e.target.value)}
                          className="w-full pl-12 pr-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900"
                          placeholder={`contoh: ${gIdx === 0 ? "Merah" : "XL"}`}
                          data-testid={`input-value-${gIdx}-${vIdx}`}
                        />
                      </div>
                      <button type="button" onClick={() => removeValue(gIdx, vIdx)} className="text-red-400 hover:text-red-600 transition flex-shrink-0" data-testid={`button-remove-value-${gIdx}-${vIdx}`}>
                        <TrashIcon />
                      </button>
                    </div>
                  ))}
                  {group.values.length === 0 && (
                    <p className="text-xs text-gray-400 pl-1">Tambahkan nilai untuk grup ini.</p>
                  )}
                </div>
              </div>
            ))}

            {/* Combination table */}
            {combinations.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-700">Kombinasi Varian <span className="font-normal text-gray-400">({combinations.length} kombinasi)</span></h3>
                </div>
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="grid text-xs text-gray-400 bg-gray-50 px-4 py-2.5 border-b border-gray-200 font-medium" style={{ gridTemplateColumns: "1fr 7rem 7rem 5rem 3.5rem" }}>
                    <span>Varian</span>
                    <span className="text-right">Harga Asli</span>
                    <span className="text-right">Harga Diskon</span>
                    <span className="text-right">Stok</span>
                    <span className="text-center">Tampil</span>
                  </div>
                  {combinations.map((combo, cIdx) => {
                    const comboPriceInvalid = combo.original_price != null && combo.price != null && combo.original_price >= combo.price;
                    const comboStockInvalid = comboErrors[cIdx] && (combo.stock === null || combo.stock === undefined);
                    return (
                    <div key={cIdx} className={`border-b border-gray-100 last:border-b-0 ${cIdx % 2 === 1 ? "bg-gray-50/40" : "bg-white"}`} data-testid={`combo-row-${cIdx}`}>
                      <div className="grid items-center gap-2 px-4 py-2.5" style={{ gridTemplateColumns: "1fr 7rem 7rem 5rem 3.5rem" }}>
                        <span className="text-sm font-medium text-gray-800 truncate">{combo.comboKeys.join(" / ")}</span>
                        <input
                          type="text" inputMode="numeric"
                          value={fmtNum(combo.price ?? "")}
                          onChange={e => { const r = stripFmt(e.target.value); updateCombo(cIdx, "price", r ? Number(r) : null); }}
                          className="w-full px-2 py-1.5 border rounded-lg text-sm text-right outline-none focus:ring-2 focus:ring-gray-900"
                          placeholder="—"
                          data-testid={`input-combo-price-${cIdx}`}
                        />
                        <div className="relative">
                          <input
                            type="text" inputMode="numeric"
                            value={fmtNum(combo.original_price ?? "")}
                            onChange={e => { const r = stripFmt(e.target.value); updateCombo(cIdx, "original_price", r ? Number(r) : null); setComboErrors(p => ({ ...p, [cIdx]: false })); }}
                            className={`w-full px-2 py-1.5 border rounded-lg text-sm text-right outline-none focus:ring-2 ${comboPriceInvalid ? "border-red-400 focus:ring-red-300" : "focus:ring-gray-900"}`}
                            placeholder="—"
                            data-testid={`input-combo-discount-${cIdx}`}
                          />
                          <button type="button" onClick={() => setOpenComboTip(openComboTip === cIdx ? null : cIdx)} className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-gray-200 text-gray-500 text-[8px] font-bold flex items-center justify-center hover:bg-gray-300 leading-none">!</button>
                          {openComboTip === cIdx && (
                            <div className="absolute right-0 top-8 z-20 w-48 bg-white border border-gray-200 rounded-lg shadow-lg p-2.5 text-xs text-gray-600">
                              Jika diisi, harga asli dicoret &amp; harga diskon jadi harga jual
                            </div>
                          )}
                        </div>
                        <input
                          type="text" inputMode="numeric"
                          value={combo.stock === null || combo.stock === undefined ? "" : fmtNum(combo.stock)}
                          onChange={e => { const r = stripFmt(e.target.value); updateCombo(cIdx, "stock", r ? Number(r) : null); setComboErrors(p => ({ ...p, [cIdx]: false })); }}
                          className={`w-full px-2 py-1.5 border rounded-lg text-sm text-right outline-none focus:ring-2 ${comboStockInvalid ? "border-red-400 focus:ring-red-300" : "focus:ring-gray-900"}`}
                          placeholder="0"
                          data-testid={`input-combo-stock-${cIdx}`}
                        />
                        <div className="flex justify-center">
                          <button type="button" onClick={() => updateCombo(cIdx, "is_available", !combo.is_available)} className={`w-10 h-5 rounded-full transition-colors duration-200 relative flex-shrink-0 ${combo.is_available ? "bg-green-500" : "bg-gray-300"}`} data-testid={`toggle-combo-available-${cIdx}`}>
                            <span className={`absolute top-0.5 left-0 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${combo.is_available ? "translate-x-5" : "translate-x-0.5"}`} />
                          </button>
                        </div>
                      </div>
                      {comboPriceInvalid && (
                        <p className="text-xs text-red-500 px-4 pb-2">⚠ Harga diskon harus lebih kecil dari harga asli</p>
                      )}
                    </div>
                    );
                  })}
                </div>
                <p className="text-xs text-gray-400">Total stok varian: <strong className="text-gray-600">{fmtNum(totalVariantStock)}</strong></p>
              </div>
            )}
          </div>

          {error && <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm" data-testid="text-error">{error}</div>}
          {success && <div className="bg-green-50 text-green-600 px-4 py-3 rounded-lg text-sm" data-testid="text-success">{success}</div>}
          <button type="submit" disabled={saving} className="w-full bg-gray-900 text-white py-3 rounded-lg font-medium hover:bg-gray-800 transition disabled:opacity-50" data-testid="button-save-product">
            {saving ? "Menyimpan..." : isNew ? "Tambah Produk" : "Simpan Perubahan"}
          </button>
        </form>
      </div>
    </div>
  );
}
