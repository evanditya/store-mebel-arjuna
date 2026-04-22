"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import ProductCard from "@/components/ProductCard";
import ProductDetail from "@/components/ProductDetail";
import Navbar from "@/components/Navbar";
import { useDebounce } from "@/hooks/useDebounce";

const BannerSlider = dynamic(() => import("@/components/BannerSlider"), { ssr: false });

const LIMIT = 20;

interface Variant {
  variant_type: string;
  variant_name: string;
  price: number | null;
  original_price: number | null;
  price_modifier: number;
  stock: number;
  is_available: boolean;
}

interface Product {
  name: string;
  slug: string;
  price: number;
  original_price: number | null;
  category: string;
  description: string;
  sold_count: number;
  stock: number;
  rating: number;
  primary_image: string;
  images: string[];
  variants: Variant[];
}

interface Seller {
  username: string;
  seller_name: string;
  site_name?: string;
  profile_picture: string | null;
  brand_colors: string[];
  font?: string;
}

interface Banner {
  id: number;
  image_url: string;
  title?: string;
  link?: string;
  order: number;
  is_active: boolean;
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
}

function formatSoldCount(count: number): string {
  if (count >= 1000) return `${Math.floor(count / 1000)}RB+ terjual`;
  return `${count} terjual`;
}

function normalizeProduct(p: Record<string, unknown>): Product {
  return {
    ...(p as unknown as Product),
    images: Array.isArray(p.images)
      ? (p.images as unknown[]).map((img) =>
          typeof img === "string" ? img : (img as Record<string, string>).image_url || ""
        )
      : [],
  };
}

export default function StorePage() {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 300);

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [cartCount, setCartCount] = useState(0);
  const [user, setUser] = useState<{ role: string } | null>(null);
  const [toast, setToast] = useState("");

  const [products, setProducts] = useState<Product[]>([]);
  const [seller, setSeller] = useState<Seller>({
    username: "",
    seller_name: "Store",
    profile_picture: null,
    brand_colors: [],
  });
  const [banners, setBanners] = useState<Banner[]>([]);
  const [categories, setCategories] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);

  const isLoadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const fetchProducts = useCallback(
    async (pageNum: number, reset: boolean, search: string, category: string | null) => {
      if (isLoadingRef.current) return;
      isLoadingRef.current = true;
      if (reset) setLoading(true);
      else setLoadingMore(true);

      try {
        const params = new URLSearchParams({ page: String(pageNum), limit: String(LIMIT) });
        if (search) params.set("search", search);
        if (category) params.set("category", category);

        const res = await fetch(`/api/products?${params}`);
        const data = await res.json();
        const prods = (data.products || []).map(normalizeProduct);

        if (reset) {
          setProducts(prods);
          if (data.seller) setSeller(data.seller);
        } else {
          setProducts((prev) => [...prev, ...prods]);
        }

        const more = pageNum < (data.total_pages || 1);
        setHasMore(more);
        setPage(pageNum);
      } catch {
      } finally {
        isLoadingRef.current = false;
        if (reset) setLoading(false);
        else setLoadingMore(false);
      }
    },
    []
  );

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((d) => setCategories(d.categories || []))
      .catch(() => {});

    fetch("/api/banners")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setBanners(d); })
      .catch(() => {});

    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.user) {
          setUser(data.user);
          fetch("/api/cart")
            .then((r) => r.json())
            .then((cartData) => {
              const items = cartData.items || [];
              setCartCount(items.reduce((s: number, i: { quantity: number }) => s + i.quantity, 0));
            });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchProducts(1, true, debouncedSearch, activeCategory);
  }, [debouncedSearch, activeCategory, fetchProducts]);

  const loadMore = useCallback(() => {
    if (!hasMore || isLoadingRef.current) return;
    fetchProducts(page + 1, false, debouncedSearch, activeCategory);
  }, [hasMore, page, debouncedSearch, activeCategory, fetchProducts]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore(); },
      { rootMargin: "300px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  useEffect(() => {
    const name = seller.site_name || seller.seller_name;
    if (name) document.title = name;
  }, [seller.site_name, seller.seller_name]);

  useEffect(() => {
    if (!seller.font) {
      document.body.style.fontFamily = "";
      return;
    }
    const existing = document.getElementById("custom-font-link");
    if (existing) existing.remove();
    const link = document.createElement("link");
    link.id = "custom-font-link";
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(seller.font)}:wght@400;500;600;700&display=swap`;
    document.head.appendChild(link);
    document.body.style.fontFamily = `'${seller.font}', sans-serif`;
    return () => {
      const el = document.getElementById("custom-font-link");
      if (el) el.remove();
      document.body.style.fontFamily = "";
    };
  }, [seller.font]);

  const handleCategoryClick = (cat: string | null) => {
    setActiveCategory(cat);
    setSearchQuery("");
  };

  const openProduct = (product: Product) => {
    fetch(`/api/products/${product.slug}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.product) {
          setSelectedProduct(normalizeProduct(data.product as Record<string, unknown>));
        }
      })
      .catch(() => setSelectedProduct(product));
  };

  const addToCart = async (product: Product, variantName?: string, quantity: number = 1) => {
    if (!user) { window.location.href = "/login"; return; }
    try {
      const res = await fetch("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_slug: product.slug, variant_name: variantName, quantity }),
      });
      if (res.ok) {
        setCartCount((prev) => prev + quantity);
        setSelectedProduct(null);
        setToast("Ditambahkan ke keranjang!");
        setTimeout(() => setToast(""), 2000);
      }
    } catch {
      setToast("Gagal menambahkan");
      setTimeout(() => setToast(""), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar
        sellerName={seller.seller_name}
        profilePicture={seller.profile_picture}
        cartCount={cartCount}
        brandColors={seller.brand_colors}
      />
      <BannerSlider banners={banners} />

      <div className="sticky top-[57px] z-40 bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 pt-2 pb-1">
          <div className="relative w-full">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setActiveCategory(null); }}
              placeholder="Cari produk..."
              className="w-full pl-9 pr-4 py-2 border rounded-full text-sm outline-none focus:ring-2 focus:ring-gray-900 bg-gray-50"
              data-testid="input-search"
            />
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 pb-2">
          <div className="flex gap-2 overflow-x-auto">
            <button
              onClick={() => handleCategoryClick(null)}
              className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition ${
                !activeCategory && !searchQuery ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
              data-testid="button-category-all"
            >
              Semua
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => handleCategoryClick(cat)}
                className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition ${
                  activeCategory === cat ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
                data-testid={`button-category-${cat}`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="bg-white rounded-lg border overflow-hidden animate-pulse">
                <div className="aspect-square bg-gray-200" />
                <div className="p-3 space-y-2">
                  <div className="h-3 bg-gray-200 rounded w-full" />
                  <div className="h-3 bg-gray-200 rounded w-2/3" />
                  <div className="h-3 bg-gray-200 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <p className="text-lg font-medium">
              {searchQuery ? `Produk "${searchQuery}" tidak ditemukan` : "Tidak ada produk"}
            </p>
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="mt-3 text-sm text-blue-600 hover:underline">
                Hapus pencarian
              </button>
            )}
          </div>
        ) : (
          <>
            {(searchQuery || activeCategory) && (
              <p className="text-sm text-gray-500 mb-3">
                {searchQuery && <span>Hasil pencarian: <strong>&ldquo;{searchQuery}&rdquo;</strong></span>}
                {activeCategory && <span>{searchQuery ? " — " : ""}Kategori: <strong>{activeCategory}</strong></span>}
              </p>
            )}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {products.map((product) => (
                <ProductCard
                  key={product.slug}
                  product={product}
                  formatPrice={formatPrice}
                  formatSoldCount={formatSoldCount}
                  onClick={() => openProduct(product)}
                />
              ))}
            </div>
            <div ref={sentinelRef} className="h-10 mt-4 flex items-center justify-center">
              {loadingMore && (
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                  Memuat lebih banyak...
                </div>
              )}
              {!hasMore && products.length > 0 && (
                <p className="text-xs text-gray-400">Semua produk sudah ditampilkan</p>
              )}
            </div>
          </>
        )}
      </main>

      {selectedProduct && (
        <ProductDetail
          product={selectedProduct}
          formatPrice={formatPrice}
          formatSoldCount={formatSoldCount}
          onClose={() => setSelectedProduct(null)}
          onAddToCart={addToCart}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-lg shadow-lg text-sm z-[60] animate-fade-in" data-testid="text-toast">
          {toast}
        </div>
      )}
    </div>
  );
}
