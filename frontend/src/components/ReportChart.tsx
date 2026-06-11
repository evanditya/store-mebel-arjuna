"use client";
import { useState, useEffect, useCallback } from "react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

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
  completed: "#22c55e",
  cancelled: "#ef4444",
};

type Period = "week" | "month" | "year" | "custom";

interface ChartPoint {
  label: string;
  orders: number;
  revenue: number;
}

interface ChartData {
  granularity: string;
  from: string;
  to: string;
  data: ChartPoint[];
  status_totals: Record<string, number>;
  total_orders: number;
  total_revenue: number;
}

function formatPrice(v: number) {
  if (v >= 1_000_000) return `Rp ${(v / 1_000_000).toFixed(1)} jt`;
  if (v >= 1_000) return `Rp ${(v / 1_000).toFixed(0)} rb`;
  return `Rp ${v.toFixed(0)}`;
}

function formatPriceFull(v: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(v);
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}:{" "}
          <span className="font-bold">
            {p.dataKey === "revenue" ? formatPriceFull(p.value) : p.value}
          </span>
        </p>
      ))}
    </div>
  );
};

const RevenueTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      <p style={{ color: "#3b82f6" }}>
        Pendapatan: <span className="font-bold">{formatPriceFull(payload[0].value)}</span>
      </p>
    </div>
  );
};


function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoStr(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

interface Props {
  token: string;
}

export default function ReportChart({ token }: Props) {
  const [period, setPeriod] = useState<Period>("week");
  const [customFrom, setCustomFrom] = useState(daysAgoStr(29));
  const [customTo, setCustomTo] = useState(todayStr());
  const [customDraft, setCustomDraft] = useState({ from: daysAgoStr(29), to: todayStr() });

  const [data, setData] = useState<ChartData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchChart = useCallback(
    async (p: Period, from?: string, to?: string) => {
      setLoading(true);
      setError("");
      try {
        let url = `/api/report/chart`;
        if (p === "custom" && from && to) {
          url += `?date_from=${from}&date_to=${to}`;
        } else if (p !== "custom") {
          url += `?period=${p}`;
        }
        const res = await fetch(url, {
          headers: { "X-Report-Token": token },
        });
        if (!res.ok) {
          setError("Gagal memuat grafik.");
          return;
        }
        const json: ChartData = await res.json();
        setData(json);
      } catch {
        setError("Gagal memuat grafik.");
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    if (period !== "custom") {
      fetchChart(period);
    }
  }, [period, fetchChart]);

  const handleApplyCustom = () => {
    setCustomFrom(customDraft.from);
    setCustomTo(customDraft.to);
    fetchChart("custom", customDraft.from, customDraft.to);
  };

  const TABS: { key: Period; label: string }[] = [
    { key: "week", label: "Mingguan" },
    { key: "month", label: "Bulanan" },
    { key: "year", label: "Tahunan" },
    { key: "custom", label: "Kustom" },
  ];

  const donutData = data
    ? Object.entries(data.status_totals)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => ({ name: STATUS_LABELS[k] || k, value: v, color: STATUS_COLORS[k] || "#9ca3af" }))
    : [];

  const chartLabel =
    data && period !== "custom"
      ? period === "week"
        ? "12 minggu terakhir"
        : period === "month"
        ? "12 bulan terakhir"
        : "5 tahun terakhir"
      : data
      ? `${data.from} → ${data.to}`
      : "";

  return (
    <div className="bg-white rounded-xl border p-5 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-semibold text-sm text-gray-700">Grafik & Tren</h2>
        <span className="text-xs text-gray-400">{chartLabel}</span>
      </div>

      {/* Period tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setPeriod(t.key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
              period === t.key
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Custom date range */}
      {period === "custom" && (
        <div className="flex flex-wrap items-end gap-3 p-3 bg-gray-50 rounded-lg border">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Dari</label>
            <input
              type="date"
              value={customDraft.from}
              max={customDraft.to}
              onChange={(e) => setCustomDraft((d) => ({ ...d, from: e.target.value }))}
              className="px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Sampai</label>
            <input
              type="date"
              value={customDraft.to}
              min={customDraft.from}
              max={todayStr()}
              onChange={(e) => setCustomDraft((d) => ({ ...d, to: e.target.value }))}
              className="px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
            />
          </div>
          <button
            onClick={handleApplyCustom}
            disabled={loading || !customDraft.from || !customDraft.to}
            className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 transition disabled:opacity-50"
          >
            {loading ? "Memuat..." : "Tampilkan"}
          </button>
          {data && (
            <p className="text-xs text-gray-400 self-center">
              Granularitas: <span className="font-medium text-gray-600">
                {data.granularity === "day" ? "per hari" : data.granularity === "week" ? "per minggu" : data.granularity === "month" ? "per bulan" : "per tahun"}
              </span>
            </p>
          )}
        </div>
      )}

      {loading && (
        <div className="text-center py-10 text-gray-400 text-sm">Memuat grafik...</div>
      )}

      {error && !loading && (
        <div className="text-center py-10 text-red-400 text-sm">{error}</div>
      )}

      {!loading && data && data.data.length > 0 && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-green-50 border border-green-100 rounded-xl p-3">
              <p className="text-xs text-green-600 font-semibold uppercase tracking-wide">Total Pesanan</p>
              <p className="text-2xl font-black text-green-700 mt-1">{data.total_orders}</p>
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
              <p className="text-xs text-blue-600 font-semibold uppercase tracking-wide">Pendapatan</p>
              <p className="text-lg font-black text-blue-700 mt-1">{formatPriceFull(data.total_revenue)}</p>
            </div>
          </div>

          {/* Bar chart — orders */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Jumlah Pesanan</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.data} margin={{ top: 4, right: 4, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "#9ca3af" }}
                  tickLine={false}
                  axisLine={false}
                  interval={data.data.length > 20 ? Math.floor(data.data.length / 10) : 0}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 10, fill: "#9ca3af" }}
                  tickLine={false}
                  axisLine={false}
                  width={24}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "#f9fafb" }} />
                <Bar dataKey="orders" name="Pesanan" fill="#22c55e" radius={[3, 3, 0, 0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Line chart — revenue */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Pendapatan Terkonfirmasi</p>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={data.data} margin={{ top: 4, right: 4, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "#9ca3af" }}
                  tickLine={false}
                  axisLine={false}
                  interval={data.data.length > 20 ? Math.floor(data.data.length / 10) : 0}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "#9ca3af" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => formatPrice(v)}
                  width={56}
                />
                <Tooltip content={<RevenueTooltip />} />
                <Line
                  dataKey="revenue"
                  name="Pendapatan"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={data.data.length <= 35 ? { r: 3, fill: "#3b82f6" } : false}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Donut chart — status */}
          {donutData.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Distribusi Status Pesanan</p>
              <div className="flex flex-col sm:flex-row items-center gap-6">
                <div className="relative shrink-0" style={{ width: 200, height: 200 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={donutData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={2}
                        dataKey="value"
                        label={false}
                      >
                        {donutData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-2xl font-black text-gray-900">{data.total_orders}</span>
                    <span className="text-xs text-gray-400 mt-0.5">pesanan</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  {[...donutData]
                    .sort((a, b) => b.value - a.value)
                    .map((d) => (
                      <div key={d.name} className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ background: d.color }} />
                        <span className="text-sm text-gray-600">
                          {d.name}
                          <span className="font-bold text-gray-900 ml-1">{d.value}</span>
                          <span className="text-gray-400 ml-1 text-xs">
                            ({Math.round((d.value / data.total_orders) * 100)}%)
                          </span>
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {!loading && data && data.data.length === 0 && (
        <div className="text-center py-10 text-gray-400 text-sm">Belum ada data untuk periode ini.</div>
      )}
    </div>
  );
}
