"use client";
import { useState, useEffect, useRef, useCallback } from "react";

interface Variant {
  id: string;
  variant_type: string;
  variant_name: string;
  price: number;
  original_price: number | null;
  stock: number;
  is_available: boolean;
}

interface Product {
  id: string;
  name: string;
  slug: string;
  price: number;
  original_price: number | null;
  category: string;
  stock: number;
  sold_count: number;
  is_available: boolean;
  primary_image: string;
  weight?: number;
  description?: string;
  variants?: Variant[];
}

function formatIDR(v: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(v);
}

function StockBadge({ stock, small }: { stock: number; small?: boolean }) {
  const size = small ? "text-xs px-1.5 py-0.5" : "text-xs px-2 py-1";
  if (stock === 0)
    return (
      <span className={`${size} rounded-md font-bold bg-red-100 text-red-700 border border-red-200`}>
        Habis
      </span>
    );
  if (stock <= 5)
    return (
      <span className={`${size} rounded-md font-bold bg-amber-100 text-amber-700 border border-amber-200`}>
        Stok {stock}
      </span>
    );
  return (
    <span className={`${size} rounded-md font-bold bg-emerald-100 text-emerald-700 border border-emerald-200`}>
      Stok {stock}
    </span>
  );
}

function VariantTable({ variants }: { variants: Variant[] }) {
  const real = variants.filter((v) => v.variant_type !== "_combinations");
  if (real.length === 0) return null;

  // Group by variant_type
  const isMultiGroup = real.some((v) => v.variant_name.includes(" / "));
  const groups: Record<string, Variant[]> = {};
  for (const v of real) {
    const key = v.variant_type;
    if (!groups[key]) groups[key] = [];
    groups[key].push(v);
  }

  const groupKeys = Object.keys(groups);

  // Single type → compact table
  if (groupKeys.length === 1 && !isMultiGroup) {
    const key = groupKeys[0];
    return (
      <div className="mt-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          {key}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {groups[key].map((v) => {
            const selling = v.original_price && v.original_price < v.price ? v.original_price : v.price;
            const hasDiscount = v.original_price && v.original_price < v.price;
            return (
              <div
                key={v.id}
                className={`rounded-lg border px-3 py-2 ${
                  !v.is_available || v.stock === 0
                    ? "border-gray-200 bg-gray-50 opacity-60"
                    : v.stock <= 5
                    ? "border-amber-200 bg-amber-50"
                    : "border-gray-200 bg-white"
                }`}
              >
                <p className="text-sm font-semibold text-gray-800 leading-tight">
                  {v.variant_name}
                </p>
                <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm font-bold text-red-600">
                    {formatIDR(selling)}
                  </span>
                  {hasDiscount && (
                    <span className="text-xs text-gray-400 line-through">
                      {formatIDR(v.price)}
                    </span>
                  )}
                </div>
                <div className="mt-1">
                  <StockBadge stock={v.stock} small />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Multi-group (combinations) → full table
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-gray-50">
            <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide border-b">
              Varian
            </th>
            <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide border-b">
              Harga
            </th>
            <th className="text-center px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide border-b">
              Stok
            </th>
            <th className="text-center px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide border-b">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {real.map((v) => {
            const selling =
              v.original_price && v.original_price < v.price
                ? v.original_price
                : v.price;
            const hasDiscount = v.original_price && v.original_price < v.price;
            return (
              <tr
                key={v.id}
                className={`border-b last:border-0 ${
                  !v.is_available || v.stock === 0 ? "opacity-50 bg-gray-50" : ""
                }`}
              >
                <td className="px-3 py-2 font-medium text-gray-800">
                  {v.variant_name}
                </td>
                <td className="px-3 py-2 text-right">
                  <span className="font-bold text-red-600">
                    {formatIDR(selling)}
                  </span>
                  {hasDiscount && (
                    <span className="block text-xs text-gray-400 line-through">
                      {formatIDR(v.price)}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-center">
                  <StockBadge stock={v.stock} small />
                </td>
                <td className="px-3 py-2 text-center">
                  {v.is_available ? (
                    <span className="text-xs text-emerald-600 font-medium">Aktif</span>
                  ) : (
                    <span className="text-xs text-gray-400 font-medium">Nonaktif</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ProductCard({ product }: { product: Product }) {
  const [detail, setDetail] = useState<Product | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const hasFetched = useRef(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const fetchDetail = useCallback(async () => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    setLoading(true);
    try {
      const res = await fetch(`/api/products/${product.slug}`);
      const data = await res.json();
      setDetail(data.product);
    } finally {
      setLoading(false);
    }
  }, [product.slug]);

  useEffect(() => {
    // Only fetch when the card is visible — prevents 20 simultaneous requests on mount
    const el = cardRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          fetchDetail();
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [fetchDetail]);

  const p = detail ?? product;
  const variants = (detail?.variants ?? []).filter(
    (v) => v.variant_type !== "_combinations"
  );
  const hasVariants = variants.length > 0;

  const sellingPrice =
    p.original_price && p.original_price < p.price ? p.original_price : p.price;
  const hasDiscount = p.original_price && p.original_price < p.price;

  // Product is truly inactive only if it has no active variants (or no variants at all and is_available=false)
  const isInactive = hasVariants
    ? variants.every((v) => !v.is_available)
    : !p.is_available;

  return (
    <div ref={cardRef} className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:border-gray-300 transition-all">
      <div className="p-4">
        {/* Top row */}
        <div className="flex gap-3">
          {/* Image */}
          <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100 border">
            <img
              src={p.primary_image || "/images/placeholder.svg"}
              alt=""
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src =
                  "/images/placeholder.svg";
              }}
            />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-gray-900 text-sm leading-tight line-clamp-2">
                {p.name}
              </h3>
              {isInactive && (
                <span className="flex-shrink-0 text-xs bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded font-medium">
                  Nonaktif
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-0.5">{p.category}</p>

            {/* Price + stock */}
            {!hasVariants && (
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-red-600 text-sm">
                    {formatIDR(sellingPrice)}
                  </span>
                  {hasDiscount && (
                    <span className="text-xs text-gray-400 line-through">
                      {formatIDR(p.price)}
                    </span>
                  )}
                </div>
                <StockBadge stock={p.stock} />
                <span className="text-xs text-gray-400">{p.sold_count} terjual</span>
                {p.weight && (
                  <span className="text-xs text-gray-400">{p.weight}g</span>
                )}
              </div>
            )}

            {hasVariants && (
              <div className="flex items-center gap-3 mt-2">
                <span className="text-xs text-gray-500">
                  {variants.length} varian
                </span>
                <span className="text-xs text-gray-400">{p.sold_count} terjual</span>
                {p.weight && (
                  <span className="text-xs text-gray-400">{p.weight}g</span>
                )}
                <button
                  onClick={() => setExpanded((v) => !v)}
                  className="ml-auto text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                >
                  {expanded ? "Sembunyikan" : "Lihat varian"}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className={`w-3 h-3 transition-transform ${expanded ? "rotate-180" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Variants — always visible if no variants toggle, else controlled */}
        {loading && (
          <div className="mt-3 text-xs text-gray-400 animate-pulse">
            Memuat detail...
          </div>
        )}

        {!loading && hasVariants && expanded && (
          <VariantTable variants={variants} />
        )}
      </div>
    </div>
  );
}

export default function CsSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setTotal(0);
      setSearched(false);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      setSearched(true);
      try {
        const res = await fetch(
          `/api/products?search=${encodeURIComponent(query.trim())}&limit=20`
        );
        const data = await res.json();
        setResults(data.products || []);
        setTotal(data.total || 0);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-40 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                />
              </svg>
            </div>
            <div>
              <h1 className="font-bold text-gray-900 text-base leading-tight">
                CS Product Search
              </h1>
              <p className="text-xs text-gray-400">
                Cari produk beserta varian, harga, dan stok lengkap
              </p>
            </div>
          </div>

          {/* Search bar */}
          <div className="relative">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ketik nama produk, kategori, atau kata kunci..."
              className="w-full pl-9 pr-10 py-3 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-gray-900 transition-colors bg-gray-50 focus:bg-white"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
          </div>

          {/* Result count */}
          {searched && !loading && (
            <p className="text-xs text-gray-400 mt-2">
              {total > 0
                ? `${total} produk ditemukan${total > 20 ? " (menampilkan 20 teratas)" : ""}`
                : `Tidak ada produk untuk "${query}"`}
            </p>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="max-w-3xl mx-auto px-4 py-4">
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse"
              >
                <div className="flex gap-3">
                  <div className="w-16 h-16 rounded-lg bg-gray-200 flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-3/4" />
                    <div className="h-3 bg-gray-100 rounded w-1/3" />
                    <div className="h-4 bg-gray-200 rounded w-1/2" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && results.length > 0 && (
          <div className="space-y-3">
            {results.map((p) => (
              <ProductCard key={p.slug} product={p} />
            ))}
          </div>
        )}

        {!loading && searched && results.length === 0 && (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-8 w-8 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <p className="text-gray-500 font-medium">Produk tidak ditemukan</p>
            <p className="text-gray-400 text-sm mt-1">
              Coba kata kunci lain atau periksa ejaan
            </p>
          </div>
        )}

        {!loading && !searched && (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-8 w-8 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
            <p className="text-gray-500 font-medium">Ketik nama produk untuk mencari</p>
            <p className="text-gray-400 text-sm mt-1">
              Hasil akan muncul beserta varian, harga, dan stok lengkap
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
