"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";

interface ProductImage {
  id: string;
  image_url: string;
  display_order: number;
}

interface Variant {
  id?: string;
  variant_type: string;
  variant_name: string;
  price: number | null;
  price_modifier: number;
  stock: number;
  is_available: boolean;
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(price);
}

export default function EditProductPage() {
  const router = useRouter();
  const params = useParams();
  const slug = params.slug as string;
  const isNew = slug === "new";

  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [originalPrice, setOriginalPrice] = useState("");
  const [stock, setStock] = useState("");
  const [weight, setWeight] = useState("500");
  const [length, setLength] = useState("10");
  const [width, setWidth] = useState("10");
  const [height, setHeight] = useState("10");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [primaryImage, setPrimaryImage] = useState("");
  const [images, setImages] = useState<ProductImage[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/auth/me").then((r) => r.json()).then((data) => {
      if (!cancelled && (!data.user || data.user.role !== "seller")) router.push("/login");
    });

    fetch("/api/categories").then((r) => r.json()).then((data) => {
      if (!cancelled) setCategories(data.categories || []);
    }).catch(() => {});

    if (!isNew) {
      fetch(`/api/products/${slug}`).then((r) => r.json()).then((data) => {
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
          setVariants((data.product.variants || []).filter((v: { variant_type?: string }) => v.variant_type !== "_combinations"));
          if (data.product.category) {
            setCategories((prev) => {
              if (prev.includes(data.product.category)) return prev;
              return [...prev, data.product.category].sort();
            });
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
          if (res.ok) {
            const data = await res.json();
            setImages((prev) => [...prev, data.image]);
            if (!primaryImage) setPrimaryImage(data.image.image_url);
          }
        } else {
          const res = await fetch("/api/upload-image", { method: "POST", body: formData });
          if (res.ok) {
            const data = await res.json();
            const newImg: ProductImage = { id: `temp-${Date.now()}-${i}`, image_url: data.image_url, display_order: images.length + i };
            setImages((prev) => [...prev, newImg]);
            if (!primaryImage) setPrimaryImage(data.image_url);
          }
        }
      } catch {
        setError("Gagal mengupload gambar");
      }
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDeleteImage = async (imageId: string, imageUrl: string) => {
    if (!isNew && slug && !imageId.startsWith("temp-")) {
      await fetch(`/api/products/${slug}/images/${imageId}`, { method: "DELETE" });
    }
    setImages((prev) => prev.filter((img) => img.id !== imageId));
    if (primaryImage === imageUrl && images.length > 1) {
      const remaining = images.filter((img) => img.id !== imageId);
      setPrimaryImage(remaining[0]?.image_url || "");
    }
  };

  const addVariant = () => {
    setVariants((prev) => [...prev, { variant_type: "Pilihan", variant_name: "", price: null, price_modifier: 0, stock: 100, is_available: true }]);
  };

  const updateVariant = (index: number, field: string, value: string | number | boolean | null) => {
    setVariants((prev) => prev.map((v, i) => (i === index ? { ...v, [field]: value } : v)));
  };

  const removeVariant = (index: number) => {
    setVariants((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const body: Record<string, unknown> = {
        name,
        price: Number(price),
        original_price: originalPrice ? Number(originalPrice) : null,
        stock: Number(stock),
        weight: Number(weight) || 500,
        length: Number(length) || 10,
        width: Number(width) || 10,
        height: Number(height) || 10,
        category,
        description,
        video_url: videoUrl || null,
        primary_image: primaryImage,
        variants: variants.filter((v) => v.variant_name.trim()).map((v) => ({
          variant_type: v.variant_type,
          variant_name: v.variant_name,
          price: v.price,
          price_modifier: v.price_modifier,
          stock: v.stock,
          is_available: v.is_available,
        })),
      };

      if (isNew) {
        body.images = images.map((img) => ({ image_url: img.image_url, display_order: img.display_order }));
      }

      const url = isNew ? "/api/products" : `/api/products/${slug}`;
      const method = isNew ? "POST" : "PUT";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Gagal menyimpan");
        return;
      }
      setSuccess("Produk berhasil disimpan!");
      setTimeout(() => router.push("/seller"), 1000);
    } catch {
      setError("Terjadi kesalahan");
    } finally {
      setSaving(false);
    }
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
        {error && <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg mb-4 text-sm" data-testid="text-error">{error}</div>}
        {success && <div className="bg-green-50 text-green-600 px-4 py-3 rounded-lg mb-4 text-sm" data-testid="text-success">{success}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="bg-white rounded-lg border p-4 space-y-4">
            <h2 className="font-bold text-sm text-gray-500 uppercase tracking-wide">Informasi Produk</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nama Produk</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-gray-900 outline-none" required data-testid="input-product-name" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Harga (Rp)</label>
                <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} className="w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-gray-900 outline-none" required data-testid="input-product-price" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Harga Coret (Rp)</label>
                <input type="number" value={originalPrice} onChange={(e) => setOriginalPrice(e.target.value)} className="w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-gray-900 outline-none" placeholder="Opsional" data-testid="input-product-original-price" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Stok</label>
                <input type="number" value={stock} onChange={(e) => setStock(e.target.value)} className="w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-gray-900 outline-none" required data-testid="input-product-stock" />
              </div>
            </div>
            <div className="grid grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Berat (gram)</label>
                <input type="number" value={weight} onChange={(e) => setWeight(e.target.value)} className="w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-gray-900 outline-none" min="1" data-testid="input-product-weight" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Panjang (cm)</label>
                <input type="number" value={length} onChange={(e) => setLength(e.target.value)} className="w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-gray-900 outline-none" min="1" data-testid="input-product-length" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Lebar (cm)</label>
                <input type="number" value={width} onChange={(e) => setWidth(e.target.value)} className="w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-gray-900 outline-none" min="1" data-testid="input-product-width" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tinggi (cm)</label>
                <input type="number" value={height} onChange={(e) => setHeight(e.target.value)} className="w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-gray-900 outline-none" min="1" data-testid="input-product-height" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kategori</label>
              <div className="flex gap-2">
                <input type="text" value={category} onChange={(e) => setCategory(e.target.value)} className="flex-1 px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-gray-900 outline-none" list="category-list" data-testid="input-product-category" />
                <datalist id="category-list">
                  {categories.map((cat) => <option key={cat} value={cat} />)}
                </datalist>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Deskripsi</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-gray-900 outline-none" rows={5} data-testid="input-product-description" />
            </div>
          </div>

          <div className="bg-white rounded-lg border p-4 space-y-4">
            <h2 className="font-bold text-sm text-gray-500 uppercase tracking-wide">Foto Produk</h2>
            <div className="grid grid-cols-4 gap-3">
              {images.map((img) => (
                <div key={img.id} className="relative group aspect-square">
                  <img src={img.image_url} alt="" className="w-full h-full object-cover rounded-lg border" />
                  {primaryImage === img.image_url && (
                    <span className="absolute top-1 left-1 bg-gray-900 text-white text-xs px-1.5 py-0.5 rounded">Utama</span>
                  )}
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
                {uploading ? (
                  <span className="text-xs text-gray-400">Uploading...</span>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" /></svg>
                    <span className="text-xs text-gray-400 mt-1">Tambah Foto</span>
                  </>
                )}
              </label>
            </div>
          </div>

          <div className="bg-white rounded-lg border p-4 space-y-4">
            <h2 className="font-bold text-sm text-gray-500 uppercase tracking-wide">Video Produk</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">URL Video (YouTube/TikTok)</label>
              <input type="url" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} className="w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-gray-900 outline-none" placeholder="https://youtube.com/watch?v=..." data-testid="input-video-url" />
            </div>
          </div>

          <div className="bg-white rounded-lg border p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-sm text-gray-500 uppercase tracking-wide">Varian Produk</h2>
              <button type="button" onClick={addVariant} className="text-sm bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-200 transition" data-testid="button-add-variant">+ Tambah Varian</button>
            </div>
            {variants.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">Belum ada varian. Klik tombol di atas untuk menambah varian (contoh: warna, ukuran).</p>
            )}
            {variants.map((variant, index) => (
              <div key={index} className="border rounded-lg p-3 space-y-3" data-testid={`variant-row-${index}`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Varian #{index + 1}</span>
                  <button type="button" onClick={() => removeVariant(index)} className="text-red-500 hover:text-red-700 text-sm" data-testid={`button-remove-variant-${index}`}>Hapus</button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Tipe Varian</label>
                    <input type="text" value={variant.variant_type} onChange={(e) => updateVariant(index, "variant_type", e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900" placeholder="Warna / Ukuran" data-testid={`input-variant-type-${index}`} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Nama Varian</label>
                    <input type="text" value={variant.variant_name} onChange={(e) => updateVariant(index, "variant_name", e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900" placeholder="Merah / L / 256GB" data-testid={`input-variant-name-${index}`} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Harga Khusus (Rp)</label>
                    <input type="number" value={variant.price ?? ""} onChange={(e) => updateVariant(index, "price", e.target.value ? Number(e.target.value) : null)} className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900" placeholder="Kosongkan = ikut harga utama" data-testid={`input-variant-price-${index}`} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Stok</label>
                    <input type="number" value={variant.stock} onChange={(e) => updateVariant(index, "stock", Number(e.target.value))} className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900" data-testid={`input-variant-stock-${index}`} />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={variant.is_available} onChange={(e) => updateVariant(index, "is_available", e.target.checked)} className="rounded" data-testid={`checkbox-variant-available-${index}`} />
                  <span className="text-gray-600">Tersedia</span>
                </label>
              </div>
            ))}
          </div>

          <button type="submit" disabled={saving} className="w-full bg-gray-900 text-white py-3 rounded-lg font-medium hover:bg-gray-800 transition disabled:opacity-50" data-testid="button-save-product">
            {saving ? "Menyimpan..." : isNew ? "Tambah Produk" : "Simpan Perubahan"}
          </button>
        </form>
      </div>
    </div>
  );
}
