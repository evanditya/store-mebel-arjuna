"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface AreaResult {
  id: string;
  name: string;
  postal_code: string;
}

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [address, setAddress] = useState("");
  const [areaId, setAreaId] = useState("");
  const [areaName, setAreaName] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [areaQuery, setAreaQuery] = useState("");
  const [areaResults, setAreaResults] = useState<AreaResult[]>([]);
  const [showAreaDropdown, setShowAreaDropdown] = useState(false);
  const [searchingArea, setSearchingArea] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const areaDropdownRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (areaDropdownRef.current && !areaDropdownRef.current.contains(e.target as Node)) {
        setShowAreaDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const searchAreas = (query: string) => {
    setAreaQuery(query);
    if (areaId && query !== areaName) {
      setAreaId("");
      setAreaName("");
      setPostalCode("");
    }
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (query.length < 3) {
      setAreaResults([]);
      setShowAreaDropdown(false);
      return;
    }
    searchTimerRef.current = setTimeout(async () => {
      setSearchingArea(true);
      try {
        const res = await fetch(`/api/shipping/areas?input=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (data.areas && data.areas.length > 0) {
          setAreaResults(data.areas);
          setShowAreaDropdown(true);
        } else {
          setAreaResults([]);
          setShowAreaDropdown(false);
        }
      } catch {
        setAreaResults([]);
      } finally {
        setSearchingArea(false);
      }
    }, 400);
  };

  const handleAreaSelect = (area: AreaResult) => {
    setAreaId(area.id);
    setAreaName(area.name);
    setAreaQuery(area.name);
    setPostalCode(area.postal_code || "");
    setShowAreaDropdown(false);
    setAreaResults([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Password dan konfirmasi password tidak cocok");
      return;
    }

    if (password.length < 6) {
      setError("Password minimal 6 karakter");
      return;
    }

    const phoneClean = phone.replace(/\D/g, "");
    if (phoneClean.length < 10 || phoneClean.length > 15) {
      setError("Nomor telepon tidak valid (10-15 digit)");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, email, password, phone: phoneClean,
          address, area_id: areaId, area_name: areaName, postal_code: postalCode,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Pendaftaran gagal");
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setError("Terjadi kesalahan jaringan");
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition text-sm";

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm border p-8">
        <h1 className="text-2xl font-bold text-center mb-2">Daftar Akun</h1>
        <p className="text-gray-500 text-center mb-6 text-sm">Buat akun pembeli untuk mulai berbelanja</p>

        {error && <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg mb-4 text-sm" data-testid="text-register-error">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nama Lengkap <span className="text-red-500">*</span></label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Nama lengkap Anda" required data-testid="input-name" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email <span className="text-red-500">*</span></label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="email@contoh.com" required data-testid="input-email" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nomor Telepon / WhatsApp <span className="text-red-500">*</span></label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} placeholder="08xxxxxxxxxx" required data-testid="input-phone" />
            <p className="text-xs text-gray-400 mt-1">Untuk konfirmasi pesanan & pengiriman</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password <span className="text-red-500">*</span></label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} placeholder="Min. 6 karakter" required minLength={6} data-testid="input-password" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Konfirmasi <span className="text-red-500">*</span></label>
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={inputClass} placeholder="Ulangi password" required minLength={6} data-testid="input-confirm-password" />
            </div>
          </div>

          <div className="border-t pt-4 mt-2">
            <p className="text-sm font-medium text-gray-700 mb-3">Alamat Pengiriman <span className="text-xs text-gray-400 font-normal">(opsional, bisa diisi nanti)</span></p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Alamat Lengkap</label>
                <textarea value={address} onChange={(e) => setAddress(e.target.value)} className={`${inputClass} resize-none`} rows={2} placeholder="Nama jalan, nomor rumah, RT/RW" data-testid="input-address" />
              </div>

              <div className="relative" ref={areaDropdownRef}>
                <label className="block text-xs text-gray-500 mb-1">Kecamatan / Kota Tujuan</label>
                <input
                  type="text"
                  value={areaQuery}
                  onChange={(e) => searchAreas(e.target.value)}
                  onFocus={() => { if (areaResults.length > 0) setShowAreaDropdown(true); }}
                  className={inputClass}
                  placeholder="Ketik min. 3 huruf, cth: Kebayoran"
                  data-testid="input-area-search"
                />
                {searchingArea && (
                  <div className="absolute right-3 top-8">
                    <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin"></div>
                  </div>
                )}
                {areaId && (
                  <p className="text-xs text-green-600 mt-1 flex items-center gap-1" data-testid="text-area-selected">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    Area terpilih — Kode Pos: {postalCode}
                  </p>
                )}
                {showAreaDropdown && areaResults.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {areaResults.map((area) => (
                      <button
                        key={area.id}
                        type="button"
                        onClick={() => handleAreaSelect(area)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b last:border-b-0 transition"
                        data-testid={`button-area-${area.id}`}
                      >
                        <span className="text-gray-800">{area.name}</span>
                        {area.postal_code && <span className="text-gray-400 ml-1">({area.postal_code})</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <button type="submit" disabled={loading} className="w-full bg-gray-900 text-white py-2.5 rounded-lg font-medium hover:bg-gray-800 transition disabled:opacity-50" data-testid="button-register">
            {loading ? "Memproses..." : "Daftar"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          Sudah punya akun?{" "}
          <Link href="/login" className="text-gray-900 font-medium hover:underline">Masuk</Link>
        </p>
      </div>
    </div>
  );
}
