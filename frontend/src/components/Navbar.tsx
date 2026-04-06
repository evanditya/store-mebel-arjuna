"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface User { id: string; email: string; name: string; role: "seller" | "buyer"; }
interface NavbarProps { sellerName: string; profilePicture: string | null; cartCount: number; }

export default function Navbar({ sellerName, profilePicture, cartCount }: NavbarProps) {
  const [user, setUser] = useState<User | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => { fetch("/api/auth/me").then((r) => r.json()).then((data) => setUser(data.user || null)).catch(() => {}); }, []);

  const handleLogout = async () => { await fetch("/api/auth/logout", { method: "POST" }); setUser(null); setMenuOpen(false); window.location.href = "/"; };

  return (
    <header className="bg-white border-b sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-3 min-w-0">
          {profilePicture && <img src={profilePicture} alt={sellerName} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />}
          <h1 className="text-lg font-bold truncate">{sellerName}</h1>
        </Link>
        <div className="flex items-center gap-3">
          {user && (
            <Link href="/cart" className="relative" data-testid="link-cart">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4m1.6 8l-1.4-7M7 13L5.4 5M7 13l-2 9m5-9v9m4-9v9m5-9l2 9" /></svg>
              {cartCount > 0 && <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center" data-testid="text-cart-count">{cartCount}</span>}
            </Link>
          )}
          {user ? (
            <div className="relative">
              <button onClick={() => setMenuOpen(!menuOpen)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-gray-100 hover:bg-gray-200 transition" data-testid="button-user-menu">
                <span className="truncate max-w-[100px]">{user.name}</span>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-1 bg-white rounded-lg border shadow-lg py-1 w-48 z-50">
                    {user.role === "seller" && <Link href="/seller" className="block px-4 py-2 text-sm hover:bg-gray-50" onClick={() => setMenuOpen(false)} data-testid="link-seller-dashboard">Dashboard Penjual</Link>}
                    <Link href="/orders" className="block px-4 py-2 text-sm hover:bg-gray-50" onClick={() => setMenuOpen(false)} data-testid="link-orders">Pesanan Saya</Link>
                    <Link href="/change-password" className="block px-4 py-2 text-sm hover:bg-gray-50" onClick={() => setMenuOpen(false)} data-testid="link-account-settings">Profil & Pengaturan</Link>
                    <button onClick={handleLogout} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50" data-testid="button-logout">Keluar</button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/login" className="px-4 py-1.5 text-sm rounded-lg border hover:bg-gray-50 transition" data-testid="link-login">Masuk</Link>
              <Link href="/register" className="px-4 py-1.5 text-sm rounded-lg bg-gray-900 text-white hover:bg-gray-800 transition" data-testid="link-register">Daftar</Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
