"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface CartItem {
  id: string;
  product_slug: string;
  variant_name?: string;
  quantity: number;
  product: { name: string; price: number; primary_image: string; stock: number } | null;
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(price);
}

export default function CartPage() {
  const router = useRouter();
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => { if (!data.user) router.push("/login"); });

    fetch("/api/cart")
      .then((r) => r.json())
      .then((data) => { setItems(data.items || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [router]);

  const updateQuantity = async (itemId: string, quantity: number) => {
    await fetch("/api/cart", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item_id: itemId, quantity }) });
    if (quantity <= 0) setItems((prev) => prev.filter((i) => i.id !== itemId));
    else setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, quantity } : i)));
  };

  const total = items.reduce((sum, item) => sum + (item.product?.price || 0) * item.quantity, 0);

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-gray-400">Memuat...</div></div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="text-gray-400 hover:text-gray-600">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          </Link>
          <h1 className="text-lg font-bold">Keranjang</h1>
        </div>
      </header>
      <div className="max-w-3xl mx-auto px-4 py-6">
        {items.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-400 mb-4">Keranjang Anda kosong</p>
            <Link href="/" className="bg-gray-900 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-800 transition">Mulai Belanja</Link>
          </div>
        ) : (
          <>
            <div className="space-y-2 mb-6">
              {items.map((item) => (
                <div key={item.id} className="bg-white rounded-lg border p-4 flex gap-4" data-testid={`cart-item-${item.id}`}>
                  <img src={item.product?.primary_image || "/images/placeholder.svg"} alt="" className="w-20 h-20 rounded-lg object-cover flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm truncate">{item.product?.name || "Produk"}</h3>
                    {item.variant_name && <p className="text-xs text-gray-400 mt-0.5">{item.variant_name}</p>}
                    <p className="text-red-600 font-medium text-sm mt-1">{formatPrice(item.product?.price || 0)}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <button onClick={() => updateQuantity(item.id, item.quantity - 1)} className="w-7 h-7 rounded border flex items-center justify-center text-sm" data-testid={`button-decrease-${item.id}`}>-</button>
                      <span className="text-sm w-6 text-center">{item.quantity}</span>
                      <button onClick={() => updateQuantity(item.id, item.quantity + 1)} className="w-7 h-7 rounded border flex items-center justify-center text-sm" data-testid={`button-increase-${item.id}`}>+</button>
                    </div>
                  </div>
                  <div className="flex flex-col items-end justify-between">
                    <button onClick={() => updateQuantity(item.id, 0)} className="text-gray-400 hover:text-red-500 transition" data-testid={`button-remove-${item.id}`}>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                    <span className="text-sm font-bold">{formatPrice((item.product?.price || 0) * item.quantity)}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="bg-white rounded-lg border p-4 sticky bottom-4">
              <div className="flex justify-between items-center mb-3">
                <span className="text-gray-500">Total ({items.reduce((s, i) => s + i.quantity, 0)} barang)</span>
                <span className="text-xl font-bold text-red-600" data-testid="text-cart-total">{formatPrice(total)}</span>
              </div>
              <Link href="/checkout" className="block w-full bg-gray-900 text-white py-3 rounded-lg font-medium text-center hover:bg-gray-800 transition" data-testid="button-checkout">Checkout</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
