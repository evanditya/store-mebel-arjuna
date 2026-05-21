"use client";
import { useState, useEffect, useCallback } from "react";

const STATUS_LABELS: Record<string, string> = {
  pending: "Menunggu Bayar",
  paid: "Dibayar",
  processing: "Diproses",
  ready_pickup: "Siap Diambil",
  shipped: "Dikirim",
  completed: "Selesai",
  cancelled: "Dibatalkan",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "#f59e0b",
  paid: "#3b82f6",
  processing: "#8b5cf6",
  ready_pickup: "#10b981",
  shipped: "#06b6d4",
  completed: "#6b7280",
  cancelled: "#ef4444",
};

function formatPrice(v: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(v);
}

interface Stats {
  date: string;
  total_orders: number;
  total_revenue: number;
  status_counts: Record<string, number>;
  orders: {
    id: string;
    buyer: string;
    total: number;
    status: string;
    delivery: string;
    items: { name: string; qty: number; price: number }[];
  }[];
}

interface Config {
  report_email: string;
  report_enabled: boolean;
  pin_is_default: boolean;
}

const SESSION_KEY = "report_token";

export default function ReportHarian() {
  const [token, setToken] = useState<string>(() =>
    typeof window !== "undefined" ? sessionStorage.getItem(SESSION_KEY) || "" : ""
  );
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinLoading, setPinLoading] = useState(false);

  const [config, setConfig] = useState<Config | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loadingData, setLoadingData] = useState(false);

  const [emailInput, setEmailInput] = useState("");
  const [enabledInput, setEnabledInput] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinChangeMsg, setPinChangeMsg] = useState("");
  const [pinChanging, setPinChanging] = useState(false);

  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState("");

  const headers = useCallback(
    () => ({ "Content-Type": "application/json", "X-Report-Token": token }),
    [token]
  );

  const loadData = useCallback(
    async (t: string) => {
      setLoadingData(true);
      try {
        const h = { "Content-Type": "application/json", "X-Report-Token": t };
        const [cfgRes, statsRes] = await Promise.all([
          fetch("/api/report/config", { headers: h }),
          fetch("/api/report/stats", { headers: h }),
        ]);
        if (cfgRes.status === 403) {
          setToken("");
          sessionStorage.removeItem(SESSION_KEY);
          return;
        }
        const cfg: Config = await cfgRes.json();
        const st: Stats = await statsRes.json();
        setConfig(cfg);
        setEmailInput(cfg.report_email);
        setEnabledInput(cfg.report_enabled);
        setStats(st);
      } finally {
        setLoadingData(false);
      }
    },
    []
  );

  useEffect(() => {
    if (token) loadData(token);
  }, [token, loadData]);

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError("");
    setPinLoading(true);
    try {
      const res = await fetch("/api/report/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (!res.ok) {
        const d = await res.json();
        setPinError(d.error || "PIN salah");
        return;
      }
      const { token: t } = await res.json();
      sessionStorage.setItem(SESSION_KEY, t);
      setToken(t);
      setPin("");
    } finally {
      setPinLoading(false);
    }
  };

  const handleSaveConfig = async () => {
    setSaving(true);
    setSaveMsg("");
    try {
      const res = await fetch("/api/report/config", {
        method: "PUT",
        headers: headers(),
        body: JSON.stringify({ report_email: emailInput, report_enabled: enabledInput }),
      });
      const d = await res.json();
      if (d.success) {
        setSaveMsg("Pengaturan tersimpan.");
        setConfig((c) => c ? { ...c, report_email: emailInput, report_enabled: enabledInput } : c);
      } else {
        setSaveMsg(d.error || "Gagal menyimpan.");
      }
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(""), 3000);
    }
  };

  const handleChangePin = async () => {
    setPinChangeMsg("");
    if (newPin !== confirmPin) { setPinChangeMsg("PIN baru tidak cocok."); return; }
    if (newPin.length < 4) { setPinChangeMsg("PIN minimal 4 karakter."); return; }
    setPinChanging(true);
    try {
      const res = await fetch("/api/report/config", {
        method: "PUT",
        headers: headers(),
        body: JSON.stringify({ current_pin: currentPin, new_pin: newPin }),
      });
      const d = await res.json();
      if (d.success) {
        setPinChangeMsg("PIN berhasil diubah.");
        setCurrentPin(""); setNewPin(""); setConfirmPin("");
        setConfig((c) => c ? { ...c, pin_is_default: false } : c);
      } else {
        setPinChangeMsg(d.error || "Gagal mengubah PIN.");
      }
    } finally {
      setPinChanging(false);
    }
  };

  const handleSendNow = async () => {
    setSending(true);
    setSendMsg("");
    try {
      const res = await fetch("/api/report/send-now", {
        method: "POST",
        headers: headers(),
      });
      const d = await res.json();
      setSendMsg(d.message || d.error || (res.ok ? "Terkirim." : "Gagal."));
    } finally {
      setSending(false);
    }
  };

  const handleLogout = () => {
    setToken("");
    sessionStorage.removeItem(SESSION_KEY);
    setConfig(null);
    setStats(null);
  };

  // PIN gate
  if (!token) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-sm border max-w-xs w-full p-8">
          <div className="text-center mb-6">
            <div className="w-12 h-12 bg-gray-900 rounded-xl flex items-center justify-center mx-auto mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h1 className="text-lg font-bold text-gray-900">Akses Laporan</h1>
            <p className="text-sm text-gray-500 mt-1">Masukkan PIN untuk melanjutkan</p>
          </div>
          <form onSubmit={handlePinSubmit} className="space-y-4">
            <input
              type="password"
              value={pin}
              onChange={(e) => { setPin(e.target.value); setPinError(""); }}
              placeholder="PIN"
              className="w-full px-4 py-3 border rounded-xl text-center text-xl tracking-widest focus:outline-none focus:ring-2 focus:ring-gray-900"
              autoFocus
            />
            {pinError && <p className="text-xs text-red-500 text-center">{pinError}</p>}
            <button
              type="submit"
              disabled={pinLoading || !pin}
              className="w-full bg-gray-900 text-white py-3 rounded-xl font-medium hover:bg-gray-800 transition disabled:opacity-50"
            >
              {pinLoading ? "Memverifikasi..." : "Masuk"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Dashboard
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h1 className="font-bold text-gray-900">Laporan Harian</h1>
          </div>
          <button onClick={handleLogout} className="text-xs text-gray-400 hover:text-gray-600 transition">Keluar</button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {loadingData && (
          <div className="text-center py-12 text-gray-400">Memuat data...</div>
        )}

        {!loadingData && stats && (
          <>
            {/* Today stats */}
            <div className="bg-white rounded-xl border p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Hari Ini</p>
                  <p className="text-base font-semibold text-gray-900 mt-0.5">
                    {(() => {
                      try {
                        const dt = new Date(stats.date + "T00:00:00");
                        return dt.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
                      } catch { return stats.date; }
                    })()}
                  </p>
                </div>
                <button
                  onClick={() => loadData(token)}
                  className="text-xs text-gray-400 hover:text-gray-600 border rounded-lg px-3 py-1.5 transition"
                >
                  Refresh
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-green-50 border border-green-100 rounded-xl p-4">
                  <p className="text-xs text-green-600 font-semibold uppercase tracking-wide">Total Pesanan</p>
                  <p className="text-3xl font-black text-green-700 mt-1">{stats.total_orders}</p>
                </div>
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                  <p className="text-xs text-blue-600 font-semibold uppercase tracking-wide">Pendapatan</p>
                  <p className="text-xl font-black text-blue-700 mt-1">{formatPrice(stats.total_revenue)}</p>
                  <p className="text-xs text-blue-400 mt-0.5">pesanan berbayar</p>
                </div>
              </div>

              {Object.keys(stats.status_counts).length > 0 && (
                <div className="space-y-1.5">
                  {Object.entries(stats.status_counts)
                    .sort((a, b) => b[1] - a[1])
                    .map(([st, cnt]) => (
                      <div key={st} className="flex items-center justify-between text-sm">
                        <span className="font-medium" style={{ color: STATUS_COLORS[st] || "#6b7280" }}>
                          {STATUS_LABELS[st] || st}
                        </span>
                        <span className="text-gray-600">{cnt} pesanan</span>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* Orders list */}
            {stats.orders.length > 0 && (
              <div className="bg-white rounded-xl border overflow-hidden">
                <div className="px-5 py-3 border-b">
                  <h2 className="font-semibold text-sm text-gray-700">Daftar Pesanan Hari Ini ({stats.orders.length})</h2>
                </div>
                <div className="divide-y">
                  {stats.orders.map((o) => (
                    <div key={o.id} className="px-5 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-mono text-xs text-gray-400">#{o.id}</span>
                            <span
                              className="text-xs px-2 py-0.5 rounded-full font-medium"
                              style={{ background: (STATUS_COLORS[o.status] || "#6b7280") + "22", color: STATUS_COLORS[o.status] || "#6b7280" }}
                            >
                              {STATUS_LABELS[o.status] || o.status}
                            </span>
                          </div>
                          <p className="text-sm text-gray-700 truncate">{o.buyer}</p>
                          <p className="text-xs text-gray-400 truncate">
                            {o.items.map((it) => `${it.name} x${it.qty}`).join(", ")}
                          </p>
                          <p className="text-xs text-gray-400">{o.delivery}</p>
                        </div>
                        <p className="font-bold text-sm text-gray-900 shrink-0">{formatPrice(o.total)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Send now + config */}
        {!loadingData && config && (
          <>
            {/* Send now */}
            <div className="bg-white rounded-xl border p-5">
              <h2 className="font-semibold text-sm text-gray-700 mb-3">Kirim Laporan Sekarang</h2>
              {config.report_email ? (
                <div className="flex items-center gap-3">
                  <p className="text-sm text-gray-500 flex-1">
                    Kirim ke <span className="font-medium text-gray-700">{config.report_email}</span>
                  </p>
                  <button
                    onClick={handleSendNow}
                    disabled={sending}
                    className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 transition disabled:opacity-50 shrink-0"
                  >
                    {sending ? "Mengirim..." : "Kirim Sekarang"}
                  </button>
                </div>
              ) : (
                <p className="text-sm text-gray-400">Atur email penerima di bawah terlebih dahulu.</p>
              )}
              {sendMsg && (
                <p className={`text-xs mt-2 ${sendMsg.includes("berhasil") || sendMsg.includes("Terkirim") ? "text-green-600" : "text-red-500"}`}>
                  {sendMsg}
                </p>
              )}
            </div>

            {/* Email config */}
            <div className="bg-white rounded-xl border p-5">
              <h2 className="font-semibold text-sm text-gray-700 mb-4">Pengaturan Laporan Otomatis</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Email Penerima Laporan</label>
                  <input
                    type="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="contoh@email.com"
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                  />
                </div>
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <div
                    onClick={() => setEnabledInput((v) => !v)}
                    className={`relative w-10 h-6 rounded-full transition-colors ${enabledInput ? "bg-gray-900" : "bg-gray-300"}`}
                  >
                    <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${enabledInput ? "translate-x-4" : "translate-x-0"}`} />
                  </div>
                  <span className="text-sm text-gray-700">
                    {enabledInput ? "Kirim otomatis tiap pukul 23:00 WIB" : "Pengiriman otomatis nonaktif"}
                  </span>
                </label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleSaveConfig}
                    disabled={saving}
                    className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 transition disabled:opacity-50"
                  >
                    {saving ? "Menyimpan..." : "Simpan Pengaturan"}
                  </button>
                  {saveMsg && <p className="text-xs text-green-600">{saveMsg}</p>}
                </div>
              </div>
            </div>

            {/* Change PIN */}
            <div className="bg-white rounded-xl border p-5">
              <h2 className="font-semibold text-sm text-gray-700 mb-1">Ganti PIN Akses</h2>
              {config.pin_is_default && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
                  <p className="text-xs text-amber-700">
                    <span className="font-semibold">Perhatian:</span> Anda masih menggunakan PIN default. Segera ganti PIN untuk keamanan.
                  </p>
                </div>
              )}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">PIN Saat Ini</label>
                  <input
                    type="password"
                    value={currentPin}
                    onChange={(e) => setCurrentPin(e.target.value)}
                    placeholder="PIN lama"
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">PIN Baru</label>
                    <input
                      type="password"
                      value={newPin}
                      onChange={(e) => setNewPin(e.target.value)}
                      placeholder="Min. 4 karakter"
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Konfirmasi PIN Baru</label>
                    <input
                      type="password"
                      value={confirmPin}
                      onChange={(e) => setConfirmPin(e.target.value)}
                      placeholder="Ulangi PIN baru"
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleChangePin}
                    disabled={pinChanging || !currentPin || !newPin || !confirmPin}
                    className="px-4 py-2 bg-gray-700 text-white text-sm rounded-lg hover:bg-gray-600 transition disabled:opacity-50"
                  >
                    {pinChanging ? "Mengubah..." : "Ganti PIN"}
                  </button>
                  {pinChangeMsg && (
                    <p className={`text-xs ${pinChangeMsg.includes("berhasil") ? "text-green-600" : "text-red-500"}`}>
                      {pinChangeMsg}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        <p className="text-center text-xs text-gray-300 pb-4">
          Halaman ini hanya dapat diakses dengan PIN.
        </p>
      </div>
    </div>
  );
}
