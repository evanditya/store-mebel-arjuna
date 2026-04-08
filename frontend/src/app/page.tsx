"use client";

import { useState, useMemo, useEffect } from "react";
import dynamic from "next/dynamic";
import ProductCard from "@/components/ProductCard";
import ProductDetail from "@/components/ProductDetail";
import Navbar from "@/components/Navbar";
const BannerSlider = dynamic(() => import("@/components/BannerSlider"), { ssr: false });

interface Variant {
  variant_type: string;
  variant_name: string;
  price: number | null;
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

export default function StorePage() {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [cartCount, setCartCount] = useState(0);
  const [user, setUser] = useState<{ role: string } | null>(null);
  const [toast, setToast] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [seller, setSeller] = useState<Seller>({ username: "", seller_name: "Store", profile_picture: null, brand_colors: [] });
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/products")
      .then((r) => r.json())
      .then((data) => {
        const prods = (data.products || []).map((p: Record<string, unknown>) => ({
          ...p,
          images: Array.isArray(p.images) ? p.images.map((img: unknown) => typeof img === "string" ? img : (img as Record<string, string>).image_url || "") : [],
        }));
        setProducts(prods);
        if (data.seller) setSeller(data.seller);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    fetch("/api/banners")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setBanners(data); })
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

  const categories = useMemo(() => {
    const cats = [...new Set(products.map((p) => p.category))];
    return cats.sort();
  }, [products]);

  const filteredProducts = useMemo(() => {
    if (!activeCategory) return products;
    return products.filter((p) => p.category === activeCategory);
  }, [products, activeCategory]);

  const addToCart = async (product: Product, variantName?: string, quantity: number = 1) => {
    if (!user) {
      window.location.href = "/login";
      return;
    }

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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400">Memuat...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar
        sellerName={seller.seller_name}
        profilePicture={seller.profile_picture}
        cartCount={cartCount}
        brandColors={seller.brand_colors}
      />
      <BannerSlider banners={banners} />

      <div className="sticky top-[57px] z-40 bg-white border-b overflow-x-auto">
        <div className="flex gap-2 px-4 py-2">
          <button
            onClick={() => setActiveCategory(null)}
            className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition ${
              !activeCategory ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
            data-testid="button-category-all"
          >
            Semua
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
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

      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {filteredProducts.map((product) => (
            <ProductCard
              key={product.slug}
              product={product}
              formatPrice={formatPrice}
              formatSoldCount={formatSoldCount}
              onClick={() => {
                fetch(`/api/products/${product.slug}`)
                  .then((r) => r.json())
                  .then((data) => {
                    if (data.product) {
                      const p = data.product;
                      setSelectedProduct({
                        ...p,
                        images: Array.isArray(p.images)
                          ? p.images.map((img: unknown) =>
                              typeof img === "string"
                                ? img
                                : (img as Record<string, string>).image_url || ""
                            )
                          : [],
                      });
                    }
                  })
                  .catch(() => setSelectedProduct(product));
              }}
            />
          ))}
        </div>
        {filteredProducts.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            <p>Tidak ada produk ditemukan</p>
          </div>
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
