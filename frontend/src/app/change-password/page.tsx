"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface AreaResult {
  id: string;
  name: string;
  postal_code: number;
}

const PROVINCES = [
  "Aceh", "Sumatera Utara", "Sumatera Barat", "Riau", "Jambi", "Sumatera Selatan",
  "Bengkulu", "Lampung", "Kep. Bangka Belitung", "Kep. Riau", "DKI Jakarta",
  "Jawa Barat", "Jawa Tengah", "DI Yogyakarta", "Jawa Timur", "Banten",
  "Bali", "Nusa Tenggara Barat", "Nusa Tenggara Timur", "Kalimantan Barat",
  "Kalimantan Tengah", "Kalimantan Selatan", "Kalimantan Timur", "Kalimantan Utara",
  "Sulawesi Utara", "Sulawesi Tengah", "Sulawesi Selatan", "Sulawesi Tenggara",
  "Gorontalo", "Sulawesi Barat", "Maluku", "Maluku Utara", "Papua", "Papua Barat",
  "Papua Selatan", "Papua Tengah", "Papua Pegunungan", "Papua Barat Daya",
];

export default function AccountSettingsPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");
  const [pwLoading, setPwLoading] = useState(false);

  const [currentEmail, setCurrentEmail] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emError, setEmError] = useState("");
  const [emSuccess, setEmSuccess] = useState("");
  const [emLoading, setEmLoading] = useState(false);

  const [profileName, setProfileName] = useState("");
  const [profilePhone, setProfilePhone] = useState("");
  const [profileAddress, setProfileAddress] = useState("");
  const [profileCity, setProfileCity] = useState("");
  const [profileProvince, setProfileProvince] = useState("");
  const [profilePostalCode, setProfilePostalCode] = useState("");
  const [profileAreaId, setProfileAreaId] = useState("");
  const [profileAreaName, setProfileAreaName] = useState("");
  const [profileError, setProfileError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState("");
  const [profileLoading, setProfileLoading] = useState(false);
  const [userRole, setUserRole] = useState("");

  const [areaQuery, setAreaQuery] = useState("");
  const [areas, setAreas] = useState<AreaResult[]>([]);
  const [selectedArea, setSelectedArea] = useState<AreaResult | null>(null);
  const [showAreaDropdown, setShowAreaDropdown] = useState(false);
  const [areaSearching, setAreaSearching] = useState(false);
  const [shippingAvailable, setShippingAvailable] = useState(false);

  const [checking, setChecking] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (!data.user) router.push("/login");
        else {
          setCurrentEmail(data.user.email);
          setProfileName(data.user.name || "");
          setProfilePhone(data.user.phone || "");
          setProfileAddress(data.user.address || "");
          setProfileCity(data.user.city || "");
          setProfileProvince(data.user.province || "");
          setProfilePostalCode(data.user.postal_code || "");
          setProfileAreaId(data.user.area_id || "");
          setProfileAreaName(data.user.area_name || "");
          if (data.user.area_name) setAreaQuery(data.user.area_name);
          setUserRole(data.user.role || "buyer");
          setChecking(false);
        }
      })
      .catch(() => router.push("/login"));
    fetch("/api/shipping/status").then((r) => r.json()).then((data) => setShippingAvailable(data.available)).catch(() => {});
  }, [router]);

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError("");
    setProfileSuccess("");

    if (!profileName.trim()) { setProfileError("Nama tidak boleh kosong"); return; }
    if (!profilePhone.trim()) { setProfileError("Nomor telepon tidak boleh kosong"); return; }

    setProfileLoading(true);
    try {
      const body: Record<string, string> = {
        name: profileName,
        phone: profilePhone,
        address: profileAddress,
        city: profileCity,
        province: profileProvince,
        postal_code: profilePostalCode,
      };
      if (selectedArea) {
        body.area_id = selectedArea.id;
        body.area_name = selectedArea.name;
      } else if (profileAreaId) {
        body.area_id = profileAreaId;
        if (profileAreaName) body.area_name = profileAreaName;
      }
      const res = await fetch("/api/auth/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setProfileError(data.error || "Gagal menyimpan profil"); return; }
      if (selectedArea) setProfileAreaId(selectedArea.id);
      setProfileSuccess("Profil berhasil diperbarui!");
    } catch { setProfileError("Terjadi kesalahan jaringan"); } finally { setProfileLoading(false); }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError("");
    setPwSuccess("");

    if (newPassword.length < 6) { setPwError("Password baru minimal 6 karakter"); return; }
    if (newPassword !== confirmPassword) { setPwError("Password baru dan konfirmasi tidak cocok"); return; }

    setPwLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) { setPwError(data.error || "Gagal mengubah password"); return; }
      setPwSuccess("Password berhasil diubah!");
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    } catch { setPwError("Terjadi kesalahan jaringan"); } finally { setPwLoading(false); }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmError("");
    setEmSuccess("");

    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(newEmail)) { setEmError("Format email tidak valid"); return; }

    setEmLoading(true);
    try {
      const res = await fetch("/api/auth/change-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_email: newEmail, password: emailPassword }),
      });
      const data = await res.json();
      if (!res.ok) { setEmError(data.error || "Gagal mengubah email"); return; }
      setEmSuccess("Email berhasil diubah!");
      setCurrentEmail(data.user?.email || newEmail);
      setNewEmail(""); setEmailPassword("");
    } catch { setEmError("Terjadi kesalahan jaringan"); } finally { setEmLoading(false); }
  };

  if (checking) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-gray-400">Memuat...</div></div>;

  const inputClass = "w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition text-sm";

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="text-gray-400 hover:text-gray-600" data-testid="link-back-home">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          </Link>
          <h1 className="text-lg font-bold">Pengaturan Akun</h1>
        </div>
      </header>

      <div className="max-w-md mx-auto px-4 py-8 space-y-6">
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-base font-bold mb-1">Profil & Alamat</h2>
          <p className="text-sm text-gray-500 mb-4">
            {userRole === "seller"
              ? "Data ini digunakan sebagai alamat pengirim untuk pengiriman via Biteship."
              : "Data ini akan otomatis terisi saat checkout untuk mempercepat proses pembelian."}
          </p>

          {profileError && <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg mb-4 text-sm" data-testid="text-profile-error">{profileError}</div>}
          {profileSuccess && <div className="bg-green-50 text-green-600 px-4 py-3 rounded-lg mb-4 text-sm" data-testid="text-profile-success">{profileSuccess}</div>}

          <form onSubmit={handleProfileSubmit} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {userRole === "seller" ? "Nama Pengirim / Nama Toko" : "Nama Lengkap"} <span className="text-red-500">*</span>
              </label>
              <input type="text" value={profileName} onChange={(e) => { setProfileName(e.target.value); setProfileSuccess(""); }} className={inputClass} placeholder={userRole === "seller" ? "Nama yang tertera di label pengiriman" : "Nama lengkap Anda"} required data-testid="input-profile-name" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">No. Telepon / WhatsApp <span className="text-red-500">*</span></label>
              <input type="tel" value={profilePhone} onChange={(e) => { setProfilePhone(e.target.value); setProfileSuccess(""); }} className={inputClass} placeholder="08xxxxxxxxxx" required data-testid="input-profile-phone" />
              <p className="text-xs text-gray-400 mt-1">
                {userRole === "seller" ? "Untuk kurir menghubungi saat penjemputan paket" : "Untuk konfirmasi pesanan & pengiriman"}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {userRole === "seller" ? "Alamat Lengkap Toko / Gudang" : "Alamat Lengkap"}
              </label>
              <textarea value={profileAddress} onChange={(e) => { setProfileAddress(e.target.value); setProfileSuccess(""); }} className={`${inputClass} resize-none`} rows={2} placeholder={userRole === "seller" ? "Alamat lengkap untuk penjemputan paket oleh kurir" : "Nama jalan, nomor rumah, RT/RW, kelurahan, kecamatan"} data-testid="input-profile-address" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Kota / Kabupaten</label>
                <input type="text" value={profileCity} onChange={(e) => { setProfileCity(e.target.value); setProfileSuccess(""); }} className={inputClass} placeholder="Jakarta Selatan" data-testid="input-profile-city" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Provinsi</label>
                <select value={profileProvince} onChange={(e) => { setProfileProvince(e.target.value); setProfileSuccess(""); }} className={inputClass} data-testid="input-profile-province">
                  <option value="">Pilih Provinsi</option>
                  {PROVINCES.map((p) => (<option key={p} value={p}>{p}</option>))}
                </select>
              </div>
            </div>

            {shippingAvailable ? (
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  {userRole === "seller" ? "Kecamatan / Area Origin Pengiriman" : "Kecamatan / Kota Tujuan Pengiriman"}
                </label>
                {profileAreaId && !selectedArea && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-2.5 text-xs text-green-700 mb-2 flex items-center gap-1.5">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    <span>
                      {profileAreaName
                        ? profileAreaName
                        : userRole === "seller" ? "Area origin sudah dikonfigurasi" : "Area tujuan sudah dikonfigurasi"}
                      {profilePostalCode ? ` (Kode Pos: ${profilePostalCode})` : ""}
                    </span>
                  </div>
                )}
                <div className="relative">
                  <input
                    value={areaQuery}
                    onChange={(e) => {
                      setAreaQuery(e.target.value);
                      setSelectedArea(null);
                      setProfileSuccess("");
                      if (e.target.value.length >= 3) {
                        setAreaSearching(true);
                        const q = e.target.value;
                        setTimeout(async () => {
                          try {
                            const res = await fetch(`/api/shipping/areas?input=${encodeURIComponent(q)}`);
                            const data = await res.json();
                            setAreas(data.areas || []);
                            setShowAreaDropdown(true);
                          } catch { setAreas([]); }
                          setAreaSearching(false);
                        }, 400);
                      } else {
                        setAreas([]);
                        setShowAreaDropdown(false);
                      }
                    }}
                    className={`w-full px-4 py-2.5 border rounded-lg outline-none focus:ring-2 focus:ring-gray-900 text-sm ${selectedArea ? "border-green-400 bg-green-50" : ""}`}
                    placeholder="Ketik nama kecamatan untuk cari area & kode pos..."
                    data-testid="input-origin-area"
                  />
                  {areaSearching && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <div className="animate-spin h-4 w-4 border-2 border-gray-300 border-t-gray-900 rounded-full"></div>
                    </div>
                  )}
                  {selectedArea && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-green-600">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    </div>
                  )}
                  {showAreaDropdown && areas.length > 0 && (
                    <div className="absolute top-full left-0 right-0 bg-white border rounded-lg mt-1 max-h-56 overflow-y-auto z-30 shadow-lg">
                      {areas.map((area) => (
                        <button key={area.id} type="button" onClick={() => {
                          setSelectedArea(area);
                          setAreaQuery(area.name);
                          setShowAreaDropdown(false);
                          setProfilePostalCode(String(area.postal_code));
                          setProfileSuccess("");
                        }} className="w-full text-left px-4 py-3 text-sm hover:bg-blue-50 border-b last:border-b-0 transition-colors" data-testid={`origin-area-${area.id}`}>
                          <span className="font-medium">{area.name}</span>
                          <span className="text-gray-400 ml-2 text-xs">(Kode Pos: {area.postal_code})</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {selectedArea && <p className="text-xs text-green-600 mt-1">Kode pos otomatis terisi: {selectedArea.postal_code}</p>}
                <p className="text-xs text-gray-400 mt-1">
                  {userRole === "seller"
                    ? "Area ini digunakan sebagai titik asal untuk perhitungan ongkir Biteship."
                    : "Area ini akan otomatis terisi saat checkout sehingga ongkir langsung dihitung."}
                  {" "}Kode pos otomatis terisi dari area yang dipilih.
                </p>
              </div>
            ) : (
              <div className="w-1/2">
                <label className="block text-xs text-gray-500 mb-1">Kode Pos</label>
                <input type="text" value={profilePostalCode} onChange={(e) => { setProfilePostalCode(e.target.value.replace(/\D/g, "").slice(0, 5)); setProfileSuccess(""); }} className={inputClass} placeholder="12345" maxLength={5} data-testid="input-profile-postal-code" />
              </div>
            )}

            <button type="submit" disabled={profileLoading} className="w-full bg-gray-900 text-white py-2.5 rounded-lg font-medium hover:bg-gray-800 transition disabled:opacity-50" data-testid="button-save-profile">
              {profileLoading ? "Menyimpan..." : "Simpan Profil"}
            </button>
          </form>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-base font-bold mb-4">Ubah Email</h2>
          <p className="text-sm text-gray-500 mb-4">Email saat ini: <span className="font-medium text-gray-700" data-testid="text-current-email">{currentEmail}</span></p>

          {emError && <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg mb-4 text-sm" data-testid="text-email-error">{emError}</div>}
          {emSuccess && <div className="bg-green-50 text-green-600 px-4 py-3 rounded-lg mb-4 text-sm" data-testid="text-email-success">{emSuccess}</div>}

          <form onSubmit={handleEmailSubmit} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email Baru</label>
              <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className={inputClass} placeholder="email.baru@contoh.com" required data-testid="input-new-email" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password (untuk konfirmasi)</label>
              <input type="password" value={emailPassword} onChange={(e) => setEmailPassword(e.target.value)} className={inputClass} placeholder="Masukkan password Anda" required data-testid="input-email-password" />
            </div>
            <button type="submit" disabled={emLoading} className="w-full bg-gray-900 text-white py-2.5 rounded-lg font-medium hover:bg-gray-800 transition disabled:opacity-50" data-testid="button-change-email">
              {emLoading ? "Memproses..." : "Ubah Email"}
            </button>
          </form>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-base font-bold mb-4">Ubah Password</h2>

          {pwError && <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg mb-4 text-sm" data-testid="text-change-password-error">{pwError}</div>}
          {pwSuccess && <div className="bg-green-50 text-green-600 px-4 py-3 rounded-lg mb-4 text-sm" data-testid="text-change-password-success">{pwSuccess}</div>}

          <form onSubmit={handlePasswordSubmit} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password Lama</label>
              <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className={inputClass} placeholder="Masukkan password lama" required data-testid="input-current-password" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password Baru</label>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={inputClass} placeholder="Minimal 6 karakter" required minLength={6} data-testid="input-new-password" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Konfirmasi Password Baru</label>
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={inputClass} placeholder="Ulangi password baru" required minLength={6} data-testid="input-confirm-new-password" />
            </div>
            <button type="submit" disabled={pwLoading} className="w-full bg-gray-900 text-white py-2.5 rounded-lg font-medium hover:bg-gray-800 transition disabled:opacity-50" data-testid="button-change-password">
              {pwLoading ? "Memproses..." : "Ubah Password"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
