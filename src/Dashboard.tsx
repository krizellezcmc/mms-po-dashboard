import { useState, useEffect, useMemo } from "react";
import Papa from "papaparse";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

// ─────────────────────────────────────────────────────────────
// DATA SOURCE — your Google Sheet (shared publicly as Viewer)
// ─────────────────────────────────────────────────────────────
const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1IL3iFJojbMksjMXN-0aiZXxMJ76P_aTmVq5XGG4n9iw/gviz/tq?tqx=out:csv";

// Column indices (0-based) — matched to your sheet's header row
const COL = {
  SOURCE_TAB: 0, // PO-22, PO-23
  PO_NUMBER: 1, // e.g. 22-09-0528
  SUPPLIER: 2, // supplier name (duplicate "PO NUMBER" header)
  ITEM_DESCRIPTION: 3,
  PRICE: 4,
  CATEGORY: 5,
  DELIVERY_TERM: 11,
  QTY_ORDER: 12,
  QTY_DELIVERED: 18,
  UNDELIVERED: 20,
  SUPPLIER_CANCELLED: 23, // TRUE/FALSE
  ZCMC_CANCELLED: 24, // TRUE/FALSE
  CANCELLATION: 25, // TRUE/FALSE
  DELIVERY_STATUS: 33, // Delivered / Undelivered / Incomplete Delivery
  DELIVERY_TIME: 35, // Late / Early/On-Time / Overdue / Cancelled
  TOTAL_AMOUNT: 36,
  DAYS: 39,
};

// ─────────────────────────────────────────────────────────────
// Color palette
// ─────────────────────────────────────────────────────────────
const COLORS = {
  primary: "#6366f1",
  success: "#10b981",
  warning: "#f59e0b",
  danger: "#ef4444",
  info: "#3b82f6",
  purple: "#8b5cf6",
  teal: "#14b8a6",
  orange: "#f97316",
};

const STATUS_COLORS = {
  Delivered: COLORS.success,
  "Incomplete Delivery": COLORS.warning,
  Undelivered: COLORS.danger,
};

const TIME_COLORS = {
  "Early/On-Time": COLORS.success,
  Late: COLORS.warning,
  Overdue: COLORS.danger,
  Cancelled: "#9ca3af",
};

const CATEGORY_COLORS = [
  COLORS.primary,
  COLORS.teal,
  COLORS.warning,
  COLORS.orange,
  COLORS.purple,
  COLORS.info,
];

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
const fmt = (val, prefix = "") => {
  const n = Number(val);
  if (isNaN(n)) return "—";
  if (n >= 1_000_000) return `${prefix}${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${prefix}${(n / 1_000).toFixed(1)}K`;
  return `${prefix}${n.toLocaleString()}`;
};

const pct = (num, den) => (den === 0 ? 0 : ((num / den) * 100).toFixed(1));

const rateStatus = (rate) => {
  const n = Number(rate);
  if (n >= 80) return "Excellent";
  if (n >= 60) return "Good";
  if (n >= 40) return "Fair";
  return "Needs Attention";
};

// Convert "PO-22" → "2022", "PO-23" → "2023", etc.
const parseYear = (sourceTab) => {
  if (!sourceTab) return sourceTab;
  const m = sourceTab.match(/PO-(\d{2})/i);
  if (m) return `20${m[1]}`;
  return sourceTab;
};

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────
function KPICard({ title, value, sub, color, icon = null, progress = null, status = null }) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 12,
        padding: "20px 24px",
        boxShadow: "0 1px 6px rgba(0,0,0,0.08)",
        borderLeft: `4px solid ${color}`,
        flex: "1 1 180px",
        minWidth: 160,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <p
          style={{
            margin: 0,
            fontSize: 12,
            color: color,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          {title}
        </p>
        {status && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: "2px 7px",
              borderRadius: 20,
              background: color + "18",
              color: color,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
            }}
          >
            {status}
          </span>
        )}
      </div>
      <p style={{ margin: "10px 0 4px", fontSize: 30, fontWeight: 800, lineHeight: 1 }}>
        {value}
      </p>
      {sub && <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>{sub}</p>}
      {progress !== null && (
        <div
          style={{
            marginTop: 12,
            height: 4,
            borderRadius: 2,
            background: "#e5e7eb",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${Math.min(Math.max(progress, 0), 100)}%`,
              height: "100%",
              background: color,
              borderRadius: 2,
              transition: "width 0.6s ease",
            }}
          />
        </div>
      )}
    </div>
  );
}

function ChartCard({ title, children, height = 260 }) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 12,
        padding: "20px 20px 12px",
        boxShadow: "0 1px 6px rgba(0,0,0,0.08)",
      }}
    >
      <h3
        style={{
          margin: "0 0 16px",
          fontSize: 14,
          fontWeight: 700,
          color: "#374151",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {title}
      </h3>
      <div style={{ height }}>{children}</div>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "#1f2937",
        color: "#fff",
        borderRadius: 8,
        padding: "10px 14px",
        fontSize: 13,
      }}
    >
      {label && <p style={{ margin: "0 0 6px", fontWeight: 600 }}>{label}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ margin: "2px 0", color: p.color || "#fff" }}>
          {p.name}: {typeof p.value === "number" ? p.value.toLocaleString() : p.value}
        </p>
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Main Dashboard
// ─────────────────────────────────────────────────────────────
export default function ExecutiveDashboard() {
  const [rawRows, setRawRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [yearFilter, setYearFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [searchText, setSearchText] = useState("");

  const fetchData = () => {
    setLoading(true);
    setError(null);
    Papa.parse(SHEET_CSV_URL, {
      download: true,
      header: false,
      skipEmptyLines: true,
      complete: (results) => {
        // Drop header row (index 0) and blank/invalid rows
        const rows = results.data
          .slice(1)
          .filter((r) => r[COL.PO_NUMBER] && r[COL.PO_NUMBER].trim() !== "");
        setRawRows(rows);
        setLastUpdated(new Date());
        setLoading(false);
      },
      error: (err) => {
        setError(err.message);
        setLoading(false);
      },
    });
  };

  useEffect(() => {
    fetchData();
  }, []);

  // ── Derived data ──────────────────────────────────────────
  const years = useMemo(() => {
    const s = new Set(rawRows.map((r) => parseYear(r[COL.SOURCE_TAB])).filter(Boolean));
    return ["All", ...Array.from(s).sort()];
  }, [rawRows]);

  const statuses = useMemo(() => {
    const s = new Set(rawRows.map((r) => r[COL.DELIVERY_STATUS]).filter(Boolean));
    return ["All", ...Array.from(s).sort()];
  }, [rawRows]);

  const filtered = useMemo(() => {
    return rawRows.filter((r) => {
      if (yearFilter !== "All" && parseYear(r[COL.SOURCE_TAB]) !== yearFilter) return false;
      if (statusFilter !== "All" && r[COL.DELIVERY_STATUS] !== statusFilter) return false;
      if (searchText) {
        const q = searchText.toLowerCase();
        if (
          !r[COL.ITEM_DESCRIPTION]?.toLowerCase().includes(q) &&
          !r[COL.SUPPLIER]?.toLowerCase().includes(q) &&
          !r[COL.PO_NUMBER]?.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [rawRows, yearFilter, statusFilter, searchText]);

  // KPIs
  const totalItems = filtered.length;
  const totalAmount = filtered.reduce((s, r) => s + (Number(r[COL.TOTAL_AMOUNT]) || 0), 0);
  const deliveredCount = filtered.filter((r) => r[COL.DELIVERY_STATUS] === "Delivered").length;
  const onTimeCount = filtered.filter((r) => r[COL.DELIVERY_TIME] === "Early/On-Time").length;
  const deliveryRate = pct(deliveredCount, totalItems);
  const onTimeRate = pct(onTimeCount, totalItems);

  // Chart: Delivery Status
  const deliveryStatusData = useMemo(() => {
    const counts = {};
    filtered.forEach((r) => {
      const s = r[COL.DELIVERY_STATUS] || "Unknown";
      counts[s] = (counts[s] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filtered]);

  // Chart: Delivery Time
  const deliveryTimeData = useMemo(() => {
    const counts = {};
    filtered.forEach((r) => {
      const t = r[COL.DELIVERY_TIME] || "Unknown";
      counts[t] = (counts[t] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filtered]);

  // Chart: PO Year breakdown (count + amount)
  const yearData = useMemo(() => {
    const map = {};
    filtered.forEach((r) => {
      const yr = parseYear(r[COL.SOURCE_TAB]) || "Unknown";
      if (!map[yr]) map[yr] = { year: yr, items: 0, amount: 0 };
      map[yr].items++;
      map[yr].amount += Number(r[COL.TOTAL_AMOUNT]) || 0;
    });
    return Object.values(map).sort((a, b) => a.year.localeCompare(b.year));
  }, [filtered]);

  // Chart: Category breakdown (by total amount)
  const categoryData = useMemo(() => {
    const map = {};
    filtered.forEach((r) => {
      const cat = r[COL.CATEGORY] || "Uncategorized";
      const amt = Number(r[COL.TOTAL_AMOUNT]) || 0;
      map[cat] = (map[cat] || 0) + amt;
    });
    return Object.entries(map)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name: name.replace(":", ": "), value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [filtered]);

  // Chart: Top 8 suppliers by total amount
  const supplierData = useMemo(() => {
    const map = {};
    filtered.forEach((r) => {
      const sup = r[COL.SUPPLIER] || "Unknown";
      const amt = Number(r[COL.TOTAL_AMOUNT]) || 0;
      map[sup] = (map[sup] || 0) + amt;
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name: name.length > 22 ? name.slice(0, 22) + "…" : name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [filtered]);

  // ── Supplier Scorecard ─────────────────────────────────
  // Scoring weights: Delivery 40% | On-Time 30% | No-Cancel 20% | Low Delay 10%
  const supplierScores = useMemo(() => {
    const map = {};
    filtered.forEach((r) => {
      const sup = r[COL.SUPPLIER]?.trim();
      if (!sup) return;
      if (!map[sup])
        map[sup] = {
          name: sup,
          total: 0,
          delivered: 0,
          incomplete: 0,
          undelivered: 0,
          onTime: 0,
          cancelled: 0,
          totalAmt: 0,
          totalDays: 0,
          delayCount: 0,
        };
      const m = map[sup];
      m.total++;
      const status = r[COL.DELIVERY_STATUS] || "";
      const timing = r[COL.DELIVERY_TIME] || "";
      const isCancelled = r[COL.SUPPLIER_CANCELLED] === "TRUE" || r[COL.CANCELLATION] === "TRUE";
      const days = Number(r[COL.DAYS]) || 0;
      if (status === "Delivered") m.delivered++;
      else if (status === "Incomplete Delivery") m.incomplete++;
      else if (status === "Undelivered") m.undelivered++;
      if (timing === "Early/On-Time") m.onTime++;
      if (isCancelled) m.cancelled++;
      m.totalAmt += Number(r[COL.TOTAL_AMOUNT]) || 0;
      if (days > 0) {
        m.totalDays += days;
        m.delayCount++;
      }
    });

    // Compute score
    return Object.values(map)
      .map((m) => {
        const deliveryRate = m.delivered / m.total;
        const onTimeRate = m.onTime / m.total;
        const cancelRate = m.cancelled / m.total;
        const avgDelay = m.delayCount > 0 ? m.totalDays / m.delayCount : 0;
        // Delay penalty: 0 days = 10pts, 100+ days = 0pts
        const delayScore = Math.max(0, 1 - avgDelay / 100);
        const score = Math.round(
          deliveryRate * 40 + onTimeRate * 30 + (1 - cancelRate) * 20 + delayScore * 10
        );
        let grade, gradeColor;
        if (score >= 80) {
          grade = "A";
          gradeColor = COLORS.success;
        } else if (score >= 60) {
          grade = "B";
          gradeColor = COLORS.teal;
        } else if (score >= 40) {
          grade = "C";
          gradeColor = COLORS.warning;
        } else {
          grade = "D";
          gradeColor = COLORS.danger;
        }
        return {
          ...m,
          deliveryPct: +(deliveryRate * 100).toFixed(1),
          onTimePct: +(onTimeRate * 100).toFixed(1),
          avgDelay: Math.round(avgDelay),
          score,
          grade,
          gradeColor,
        };
      })
      .sort((a, b) => b.score - a.score);
  }, [filtered]);

  const [scoreSort, setScoreSort] = useState("score");
  const [scoreSortDir, setScoreSortDir] = useState("desc");
  const [scoreSearch, setScoreSearch] = useState("");
  const [view, setView] = useState<"dashboard" | "report">("dashboard");

  const REPORT_CURRENT_YEAR = new Date().getFullYear();
  const [reportFrom, setReportFrom] = useState(String(REPORT_CURRENT_YEAR - 3));
  const [reportTo, setReportTo] = useState(String(REPORT_CURRENT_YEAR - 1));
  const [reportNote, setReportNote] = useState("");

  const sortedScores = useMemo(() => {
    let rows = supplierScores.filter(
      (s) => !scoreSearch || s.name.toLowerCase().includes(scoreSearch.toLowerCase())
    );
    rows = [...rows].sort((a, b) => {
      const v = scoreSortDir === "asc" ? 1 : -1;
      return typeof a[scoreSort] === "string"
        ? a[scoreSort].localeCompare(b[scoreSort]) * v
        : (a[scoreSort] - b[scoreSort]) * v;
    });
    return rows;
  }, [supplierScores, scoreSort, scoreSortDir, scoreSearch]);

  const toggleSort = (col) => {
    if (scoreSort === col) setScoreSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setScoreSort(col);
      setScoreSortDir("desc");
    }
  };

  const scoreChartData = useMemo(
    () =>
      supplierScores.slice(0, 10).map((s) => ({
        name: s.name.length > 18 ? s.name.slice(0, 18) + "…" : s.name,
        Score: s.score,
        fill: s.gradeColor,
      })),
    [supplierScores]
  );

  // ── 3-Year Report Data ────────────────────────────────────
  const reportYearOptions = useMemo(() => {
    const min = 2020;
    const max = REPORT_CURRENT_YEAR - 1;
    return Array.from({ length: max - min + 1 }, (_, i) => String(min + i));
  }, [REPORT_CURRENT_YEAR]);

  const reportRows = useMemo(() => {
    return rawRows.filter((r) => {
      const yr = parseYear(r[COL.SOURCE_TAB]);
      return yr && yr >= reportFrom && yr <= reportTo;
    });
  }, [rawRows, reportFrom, reportTo]);

  const reportYearStats = useMemo(() => {
    const map: Record<string, any> = {};
    reportRows.forEach((r) => {
      const yr = parseYear(r[COL.SOURCE_TAB]);
      if (!yr) return;
      if (!map[yr])
        map[yr] = {
          year: yr,
          total: 0,
          amount: 0,
          delivered: 0,
          incomplete: 0,
          undelivered: 0,
          onTime: 0,
          cancelled: 0,
          totalDays: 0,
          delayCount: 0,
        };
      const m = map[yr];
      m.total++;
      m.amount += Number(r[COL.TOTAL_AMOUNT]) || 0;
      const status = r[COL.DELIVERY_STATUS] || "";
      const timing = r[COL.DELIVERY_TIME] || "";
      const isCancelled = r[COL.SUPPLIER_CANCELLED] === "TRUE" || r[COL.CANCELLATION] === "TRUE";
      const days = Number(r[COL.DAYS]) || 0;
      if (status === "Delivered") m.delivered++;
      else if (status === "Incomplete Delivery") m.incomplete++;
      else if (status === "Undelivered") m.undelivered++;
      if (timing === "Early/On-Time") m.onTime++;
      if (isCancelled) m.cancelled++;
      if (days > 0) {
        m.totalDays += days;
        m.delayCount++;
      }
    });
    const fromN = parseInt(reportFrom);
    const toN = parseInt(reportTo);
    return Array.from({ length: toN - fromN + 1 }, (_, i) => String(fromN + i)).map((yr) => {
      const m = map[yr] || {
        year: yr,
        total: 0,
        amount: 0,
        delivered: 0,
        incomplete: 0,
        undelivered: 0,
        onTime: 0,
        cancelled: 0,
        totalDays: 0,
        delayCount: 0,
      };
      return {
        ...m,
        deliveryRate: Number(pct(m.delivered, m.total)),
        onTimeRate: Number(pct(m.onTime, m.total)),
        avgDelay: m.delayCount > 0 ? Math.round(m.totalDays / m.delayCount) : 0,
      };
    });
  }, [reportRows, reportFrom, reportTo]);

  const reportTotals = useMemo(() => {
    const total = reportRows.length;
    const amount = reportRows.reduce((s, r) => s + (Number(r[COL.TOTAL_AMOUNT]) || 0), 0);
    const delivered = reportRows.filter((r) => r[COL.DELIVERY_STATUS] === "Delivered").length;
    const onTime = reportRows.filter((r) => r[COL.DELIVERY_TIME] === "Early/On-Time").length;
    return {
      total,
      amount,
      delivered,
      onTime,
      deliveryRate: Number(pct(delivered, total)),
      onTimeRate: Number(pct(onTime, total)),
    };
  }, [reportRows]);

  // ── Styles ──────────────────────────────────────────────
  const pageStyle = {
    minHeight: "100vh",
    background: "#f1f5f9",
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
    padding: "24px 28px",
    color: "#111827",
  };

  const gridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
    gap: 20,
    marginTop: 20,
  };

  const filterBarStyle = {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    alignItems: "center",
    marginBottom: 20,
    background: "#fff",
    borderRadius: 10,
    padding: "12px 16px",
    boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
  };

  const selectStyle = {
    padding: "6px 10px",
    borderRadius: 6,
    border: "1px solid #e5e7eb",
    fontSize: 13,
    background: "#f9fafb",
    color: "#374151",
    cursor: "pointer",
  };

  const inputStyle = {
    ...selectStyle,
    padding: "6px 12px",
    minWidth: 220,
    outline: "none",
  };

  const badgeStyle = (color) => ({
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 600,
    background: color + "22",
    color: color,
  });

  // ── Render ────────────────────────────────────────────────
  return (
    <div style={pageStyle}>
      {/* ── Header ── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 20,
        }}
      >
        <div>
          <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0f172a" }}>
            Procurement Executive Dashboard
          </p>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
            Purchase Order Delivery Monitoring
            {lastUpdated && ` · Updated ${lastUpdated.toLocaleTimeString()}`}
          </p>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {(["dashboard", "report"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: "7px 16px",
                borderRadius: 8,
                border: view === v ? "none" : "1px solid #e2e8f0",
                background: view === v ? "#0f172a" : "#fff",
                color: view === v ? "#fff" : "#374151",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
                boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
              }}
            >
              {v === "dashboard" ? "Dashboard" : "3-Year Report"}
            </button>
          ))}
          <button
            onClick={fetchData}
            style={{
              padding: "7px 14px",
              borderRadius: 8,
              border: "1px solid #e2e8f0",
              background: "#fff",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
              color: "#374151",
              boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
            }}
          >
            ↻
          </button>
        </div>
      </div>

      {/* ── Loading / Error ── */}
      {loading && (
        <div style={{ textAlign: "center", padding: 80, color: "#64748b", fontSize: 15 }}>
          Loading procurement data…
        </div>
      )}
      {error && (
        <div
          style={{
            padding: 16,
            background: "#fee2e2",
            borderRadius: 8,
            color: "#991b1b",
            marginBottom: 20,
          }}
        >
          ❌ Error loading data: {error}
        </div>
      )}

      {!loading && !error && (
        <>
          {view === "dashboard" && (
            <>
              {/* ── Filters ── */}
              <div style={filterBarStyle}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#64748b", marginRight: 4 }}>
                  Filter:
                </span>
                <select
                  style={selectStyle}
                  value={yearFilter}
                  onChange={(e) => setYearFilter(e.target.value)}
                >
                  {years.map((y) => (
                    <option key={y}>{y}</option>
                  ))}
                </select>
                <select
                  style={selectStyle}
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  {statuses.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
                <input
                  style={inputStyle}
                  placeholder="Search item, supplier, PO #…"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                />
                {(yearFilter !== "All" || statusFilter !== "All" || searchText) && (
                  <button
                    onClick={() => {
                      setYearFilter("All");
                      setStatusFilter("All");
                      setSearchText("");
                    }}
                    style={{
                      ...selectStyle,
                      background: "#fee2e2",
                      color: "#dc2626",
                      border: "1px solid #fecaca",
                      fontWeight: 600,
                    }}
                  >
                    ✕ Clear
                  </button>
                )}
                <span style={{ marginLeft: "auto", fontSize: 13, color: "#64748b" }}>
                  Showing <strong>{totalItems}</strong> of <strong>{rawRows.length}</strong> items
                </span>
              </div>

              {/* ── KPI Cards ── */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 24 }}>
                <KPICard
                  title="Total PO Items"
                  value={totalItems.toLocaleString()}
                  sub={`${rawRows.length > 0 ? ((totalItems / rawRows.length) * 100).toFixed(0) : 0}% of all ${rawRows.length.toLocaleString()} records`}
                  color={COLORS.primary}
                  progress={rawRows.length > 0 ? (totalItems / rawRows.length) * 100 : 0}
                  status={totalItems === rawRows.length ? "All Records" : "Filtered"}
                />
                <KPICard
                  title="Total Amount"
                  value={fmt(totalAmount, "₱")}
                  sub={`Across ${totalItems.toLocaleString()} PO line items`}
                  color={COLORS.info}
                  status={totalAmount >= 1_000_000 ? "High Value" : totalAmount >= 100_000 ? "Mid Value" : "Low Value"}
                />
                <KPICard
                  title="Delivery Rate"
                  value={
                    <span style={{ color: Number(deliveryRate) > 50 ? COLORS.success : COLORS.danger }}>
                      {deliveryRate}%
                    </span>
                  }
                  sub={`${deliveredCount.toLocaleString()} of ${totalItems.toLocaleString()} fully delivered`}
                  color={Number(deliveryRate) > 50 ? COLORS.success : COLORS.danger}
                  progress={Number(deliveryRate)}
                  status={rateStatus(deliveryRate)}
                />
                <KPICard
                  title="On-Time Rate"
                  value={`${onTimeRate}%`}
                  sub={`${onTimeCount.toLocaleString()} of ${totalItems.toLocaleString()} early or on time`}
                  color={COLORS.teal}
                  progress={Number(onTimeRate)}
                  status={rateStatus(onTimeRate)}
                />
              </div>

              {/* ── Charts Grid ── */}
              <div style={gridStyle}>
                {/* Delivery Status Pie */}
                <ChartCard title="Delivery Status Breakdown" height={260}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={deliveryStatusData}
                        cx="42%"
                        cy="50%"
                        innerRadius={65}
                        outerRadius={100}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {deliveryStatusData.map((entry, i) => (
                          <Cell key={i} fill={STATUS_COLORS[entry.name] || COLORS.primary} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                      <Legend
                        iconType="circle"
                        formatter={(val, entry) => (
                          <span style={{ fontSize: 12, color: "#374151" }}>
                            {val} ({entry.payload.value})
                          </span>
                        )}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartCard>

                {/* Delivery Timeliness */}
                <ChartCard title="Delivery Timeliness" height={260}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={deliveryTimeData}
                      layout="vertical"
                      margin={{ left: 16, right: 20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={100} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="value" name="Count" radius={[0, 6, 6, 0]}>
                        {deliveryTimeData.map((entry, i) => (
                          <Cell key={i} fill={TIME_COLORS[entry.name] || COLORS.primary} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>

                {/* Category by Amount */}
                <ChartCard title="Spending by Category (₱)" height={280}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={categoryData}
                      layout="vertical"
                      margin={{ left: 10, right: 40 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v) => fmt(v, "₱")}
                      />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={130} />
                      <Tooltip
                        content={<CustomTooltip />}
                        formatter={(v) => `₱${v.toLocaleString()}`}
                      />
                      <Bar dataKey="value" name="Total Amount" radius={[0, 6, 6, 0]}>
                        {categoryData.map((_, i) => (
                          <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>

                {/* Top Suppliers */}
                <ChartCard title="Top Suppliers by Amount (₱)" height={280}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={supplierData}
                      layout="vertical"
                      margin={{ left: 10, right: 40 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v) => fmt(v, "₱")}
                      />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={160} />
                      <Tooltip
                        content={<CustomTooltip />}
                        formatter={(v) => `₱${v.toLocaleString()}`}
                      />
                      <Bar
                        dataKey="value"
                        name="Total Amount"
                        fill={COLORS.primary}
                        radius={[0, 6, 6, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>

                {/* PO Year Comparison */}
                {/* <ChartCard title="PO Items & Amount by Year" height={200}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={yearData} margin={{ top: 4, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="year" tick={{ fontSize: 13, fontWeight: 600 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={v => fmt(v, "₱")} />
                  <Tooltip content={<CustomTooltip />} formatter={(v, n) => n === "Amount" ? `₱${v.toLocaleString()}` : v} />
                  <Legend />
                  <Bar yAxisId="left"  dataKey="items"  name="Items"  fill={COLORS.primary} radius={[6,6,0,0]} />
                  <Bar yAxisId="right" dataKey="amount" name="Amount" fill={COLORS.teal}    radius={[6,6,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard> */}
              </div>

              {/* ── Summary Stats Row ── */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 20 }}>
                {Object.entries(STATUS_COLORS).map(([status, color]) => {
                  const count = filtered.filter((r) => r[COL.DELIVERY_STATUS] === status).length;
                  const amt = filtered
                    .filter((r) => r[COL.DELIVERY_STATUS] === status)
                    .reduce((s, r) => s + (Number(r[COL.TOTAL_AMOUNT]) || 0), 0);
                  return (
                    <div
                      key={status}
                      style={{
                        flex: "1 1 180px",
                        background: "#fff",
                        borderRadius: 10,
                        padding: "14px 18px",
                        boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
                        borderTop: `3px solid ${color}`,
                      }}
                    >
                      <span style={badgeStyle(color)}>{status}</span>
                      <p style={{ margin: "8px 0 2px", fontSize: 22, fontWeight: 700 }}>{count}</p>
                      <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>
                        {fmt(amt, "₱")} total
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* ══════════════════════════════════════════════
              SUPPLIER SCORECARD
          ══════════════════════════════════════════════ */}
              <div
                style={{
                  marginTop: 28,
                  background: "#fff",
                  borderRadius: 12,
                  boxShadow: "0 1px 6px rgba(0,0,0,0.07)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    padding: "16px 20px",
                    borderBottom: "1px solid #f1f5f9",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 10,
                  }}
                >
                  <div>
                    <h3
                      style={{
                        margin: 0,
                        fontSize: 14,
                        fontWeight: 700,
                        color: "#374151",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      Supplier Scorecard
                    </h3>
                    {/* <p style={{ margin: "3px 0 0", fontSize: 12, color: "#64748b" }}>
                  Score = Delivery 40% + On-Time 30% + No-Cancel 20% + Low-Delay 10%
                </p> */}
                  </div>
                  <input
                    style={{ ...inputStyle, minWidth: 200 }}
                    placeholder="Search supplier…"
                    value={scoreSearch}
                    onChange={(e) => setScoreSearch(e.target.value)}
                  />
                </div>

                {/* Score legend */}
                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    padding: "10px 20px",
                    borderBottom: "1px solid #f1f5f9",
                    flexWrap: "wrap",
                  }}
                >
                  {[
                    ["A", "80–100", COLORS.success],
                    ["B", "60–79", COLORS.teal],
                    ["C", "40–59", COLORS.warning],
                    ["D", "0–39", COLORS.danger],
                  ].map(([g, range, c]) => (
                    <span
                      key={g}
                      style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}
                    >
                      <span
                        style={{
                          ...badgeStyle(c),
                          fontSize: 13,
                          fontWeight: 800,
                          padding: "1px 9px",
                        }}
                      >
                        {g}
                      </span>
                      <span style={{ color: "#64748b" }}>{range} pts</span>
                    </span>
                  ))}
                </div>

                {/* Score bar chart */}
                <div style={{ padding: "16px 20px 8px", borderBottom: "1px solid #f1f5f9" }}>
                  <p
                    style={{
                      margin: "0 0 10px",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#64748b",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                    }}
                  >
                    Top 10 Suppliers by Score
                  </p>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart
                      data={scoreChartData}
                      layout="vertical"
                      margin={{ left: 8, right: 40 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                      <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={160} />
                      <Tooltip content={<CustomTooltip />} formatter={(v) => `${v} / 100`} />
                      <Bar dataKey="Score" radius={[0, 6, 6, 0]}>
                        {scoreChartData.map((entry, i) => (
                          <Cell key={i} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Scorecard table */}
                <div style={{ overflowX: "auto", maxHeight: 420, overflowY: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "#f8fafc", position: "sticky", top: 0 }}>
                        {[
                          ["name", "Supplier"],
                          ["total", "Total Items"],
                          ["delivered", "Delivered"],
                          ["incomplete", "Incomplete"],
                          ["undelivered", "Undelivered"],
                          ["onTimePct", "On-Time %"],
                          ["deliveryPct", "Delivery %"],
                          ["avgDelay", "Avg Delay (days)"],
                          ["cancelled", "Cancelled"],
                          ["totalAmt", "Total Amount"],
                          ["score", "Score"],
                          ["grade", "Grade"],
                        ].map(([col, label]) => (
                          <th
                            key={col}
                            onClick={() => toggleSort(col)}
                            style={{
                              textAlign: col === "name" ? "left" : "right",
                              padding: "10px 12px",
                              borderBottom: "2px solid #e2e8f0",
                              color: scoreSort === col ? "#4f46e5" : "#475569",
                              fontWeight: 700,
                              whiteSpace: "nowrap",
                              cursor: "pointer",
                              userSelect: "none",
                            }}
                          >
                            {label} {scoreSort === col ? (scoreSortDir === "asc" ? "↑" : "↓") : ""}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedScores.map((s, i) => (
                        <tr
                          key={i}
                          style={{
                            background: i % 2 === 0 ? "#fafafa" : "#fff",
                            borderBottom: "1px solid #f1f5f9",
                          }}
                        >
                          <td
                            style={{
                              padding: "9px 12px",
                              fontWeight: 600,
                              maxWidth: 200,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {s.name}
                          </td>
                          <td style={{ padding: "9px 12px", textAlign: "right", color: "#374151" }}>
                            {s.total}
                          </td>
                          <td
                            style={{
                              padding: "9px 12px",
                              textAlign: "right",
                              color: COLORS.success,
                              fontWeight: 600,
                            }}
                          >
                            {s.delivered}
                          </td>
                          <td
                            style={{
                              padding: "9px 12px",
                              textAlign: "right",
                              color: COLORS.warning,
                              fontWeight: 600,
                            }}
                          >
                            {s.incomplete}
                          </td>
                          <td
                            style={{
                              padding: "9px 12px",
                              textAlign: "right",
                              color: COLORS.danger,
                              fontWeight: 600,
                            }}
                          >
                            {s.undelivered}
                          </td>
                          <td style={{ padding: "9px 12px", textAlign: "right" }}>
                            <span
                              style={badgeStyle(
                                s.onTimePct >= 50 ? COLORS.success : COLORS.warning
                              )}
                            >
                              {s.onTimePct}%
                            </span>
                          </td>
                          <td style={{ padding: "9px 12px", textAlign: "right" }}>
                            <span
                              style={badgeStyle(
                                s.deliveryPct >= 80
                                  ? COLORS.success
                                  : s.deliveryPct >= 50
                                    ? COLORS.warning
                                    : COLORS.danger
                              )}
                            >
                              {s.deliveryPct}%
                            </span>
                          </td>
                          <td
                            style={{
                              padding: "9px 12px",
                              textAlign: "right",
                              color:
                                s.avgDelay > 100
                                  ? COLORS.danger
                                  : s.avgDelay > 30
                                    ? COLORS.warning
                                    : COLORS.success,
                            }}
                          >
                            {s.avgDelay > 0 ? `+${s.avgDelay}d` : "—"}
                          </td>
                          <td
                            style={{
                              padding: "9px 12px",
                              textAlign: "right",
                              color: s.cancelled > 0 ? COLORS.danger : "#9ca3af",
                            }}
                          >
                            {s.cancelled || "—"}
                          </td>
                          <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 600 }}>
                            ₱{s.totalAmt.toLocaleString()}
                          </td>
                          <td style={{ padding: "9px 12px", textAlign: "right" }}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "flex-end",
                                gap: 6,
                              }}
                            >
                              <div
                                style={{
                                  width: 48,
                                  height: 6,
                                  borderRadius: 3,
                                  background: "#e5e7eb",
                                  overflow: "hidden",
                                }}
                              >
                                <div
                                  style={{
                                    width: `${s.score}%`,
                                    height: "100%",
                                    background: s.gradeColor,
                                    borderRadius: 3,
                                  }}
                                />
                              </div>
                              <span style={{ fontWeight: 700, color: s.gradeColor }}>
                                {s.score}
                              </span>
                            </div>
                          </td>
                          <td style={{ padding: "9px 12px", textAlign: "right" }}>
                            <span
                              style={{
                                ...badgeStyle(s.gradeColor),
                                fontSize: 14,
                                fontWeight: 800,
                                padding: "2px 10px",
                              }}
                            >
                              {s.grade}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {view === "report" && (
            <div
              style={{
                marginTop: 8,
                background: "#fff",
                borderRadius: 12,
                boxShadow: "0 1px 6px rgba(0,0,0,0.07)",
                overflow: "hidden",
              }}
            >
              {/* Header + Range Selector */}
              <div
                style={{
                  padding: "16px 20px",
                  background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 12,
                }}
              >
                <div>
                  <h3
                    style={{
                      margin: 0,
                      fontSize: 16,
                      fontWeight: 800,
                      color: "#fff",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    Annual Procurement Report
                  </h3>
                  <p style={{ margin: "3px 0 0", fontSize: 12, color: "#94a3b8" }}>
                    {reportFrom} – {reportTo} &nbsp;·&nbsp; {reportRows.length.toLocaleString()}{" "}
                    total PO items
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 600 }}>Range:</span>
                  <select
                    value={reportFrom}
                    onChange={(e) => {
                      if (e.target.value <= reportTo) setReportFrom(e.target.value);
                    }}
                    style={{
                      padding: "5px 8px",
                      borderRadius: 6,
                      border: "1px solid #334155",
                      fontSize: 13,
                      background: "#1e3a5f",
                      color: "#fff",
                      cursor: "pointer",
                    }}
                  >
                    {reportYearOptions.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                  <span style={{ color: "#94a3b8", fontWeight: 700 }}>–</span>
                  <select
                    value={reportTo}
                    onChange={(e) => {
                      if (e.target.value >= reportFrom) setReportTo(e.target.value);
                    }}
                    style={{
                      padding: "5px 8px",
                      borderRadius: 6,
                      border: "1px solid #334155",
                      fontSize: 13,
                      background: "#1e3a5f",
                      color: "#fff",
                      cursor: "pointer",
                    }}
                  >
                    {reportYearOptions.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* KPI Summary */}
              <div style={{ padding: "16px 20px", borderBottom: "1px solid #f1f5f9" }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                  <KPICard
                    title="Total PO Items"
                    value={reportTotals.total.toLocaleString()}
                    sub={`${reportFrom}–${reportTo} combined`}
                    color={COLORS.primary}
                  />
                  <KPICard
                    title="Total Amount"
                    value={fmt(reportTotals.amount, "₱")}
                    sub="Combined procurement spend"
                    color={COLORS.info}
                  />
                  <KPICard
                    title="Overall Delivery Rate"
                    value={
                      <span
                        style={{
                          color: reportTotals.deliveryRate > 50 ? COLORS.success : COLORS.danger,
                        }}
                      >
                        {reportTotals.deliveryRate}%
                      </span>
                    }
                    sub={`${reportTotals.delivered} fully delivered`}
                    color={reportTotals.deliveryRate > 50 ? COLORS.success : COLORS.danger}
                  />
                  <KPICard
                    title="Overall On-Time Rate"
                    value={`${reportTotals.onTimeRate}%`}
                    sub={`${reportTotals.onTime} early or on time`}
                    color={COLORS.teal}
                  />
                </div>
              </div>

              {/* Year-over-Year Trend Chart */}
              <div style={{ padding: "16px 20px", borderBottom: "1px solid #f1f5f9" }}>
                <p
                  style={{
                    margin: "0 0 12px",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#64748b",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  Year-over-Year Performance
                </p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={reportYearStats}
                    margin={{ top: 4, right: 40, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="year" tick={{ fontSize: 13, fontWeight: 600 }} />
                    <YAxis yAxisId="pct" domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                    <YAxis
                      yAxisId="amt"
                      orientation="right"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => fmt(v, "₱")}
                    />
                    <Tooltip
                      content={<CustomTooltip />}
                      formatter={(v, n) =>
                        n === "Amount (₱)" ? `₱${Number(v).toLocaleString()}` : `${v}%`
                      }
                    />
                    <Legend
                      iconType="circle"
                      iconSize={8}
                      wrapperStyle={{ paddingTop: 16, fontSize: 12 }}
                      formatter={(val) => (
                        <span
                          style={{ color: "#374151", fontSize: 12, marginLeft: 3, marginRight: 12 }}
                        >
                          {val}
                        </span>
                      )}
                    />

                    <Bar
                      yAxisId="amt"
                      dataKey="amount"
                      name="Amount (₱)"
                      fill={COLORS.info}
                      radius={[6, 6, 0, 0]}
                    />

                    <Bar
                      yAxisId="pct"
                      dataKey="deliveryRate"
                      name="Delivery Rate %"
                      fill={COLORS.warning}
                      radius={[6, 6, 0, 0]}
                    />
                    <Bar
                      yAxisId="pct"
                      dataKey="onTimeRate"
                      name="On-Time Rate %"
                      fill={COLORS.teal}
                      radius={[6, 6, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Year-by-Year Breakdown Table */}
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      {[
                        "Year",
                        "Total Items",
                        "Total Amount (₱)",
                        "Delivered",
                        "Incomplete",
                        "Undelivered",
                        "Delivery Rate",
                        "On-Time Rate",
                        "Cancelled",
                        "Avg Delay",
                      ].map((h) => (
                        <th
                          key={h}
                          style={{
                            padding: "10px 14px",
                            borderBottom: "2px solid #e2e8f0",
                            color: "#475569",
                            fontWeight: 700,
                            whiteSpace: "nowrap",
                            textAlign: h === "Year" ? "left" : "right",
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {reportYearStats.map((s, i) => (
                      <tr
                        key={s.year}
                        style={{
                          background: i % 2 === 0 ? "#fafafa" : "#fff",
                          borderBottom: "1px solid #f1f5f9",
                        }}
                      >
                        <td
                          style={{
                            padding: "11px 14px",
                            fontWeight: 700,
                            color: "#0f172a",
                            fontSize: 14,
                          }}
                        >
                          {s.year}
                        </td>
                        <td style={{ padding: "11px 14px", textAlign: "right" }}>
                          {s.total.toLocaleString()}
                        </td>
                        <td style={{ padding: "11px 14px", textAlign: "right", fontWeight: 600 }}>
                          {fmt(s.amount, "₱")}
                        </td>
                        <td
                          style={{
                            padding: "11px 14px",
                            textAlign: "right",
                            color: COLORS.success,
                            fontWeight: 600,
                          }}
                        >
                          {s.delivered || "—"}
                        </td>
                        <td
                          style={{
                            padding: "11px 14px",
                            textAlign: "right",
                            color: COLORS.warning,
                            fontWeight: 600,
                          }}
                        >
                          {s.incomplete || "—"}
                        </td>
                        <td
                          style={{
                            padding: "11px 14px",
                            textAlign: "right",
                            color: COLORS.danger,
                            fontWeight: 600,
                          }}
                        >
                          {s.undelivered || "—"}
                        </td>
                        <td style={{ padding: "11px 14px", textAlign: "right" }}>
                          <span
                            style={badgeStyle(s.deliveryRate > 50 ? COLORS.success : COLORS.danger)}
                          >
                            {s.total > 0 ? `${s.deliveryRate}%` : "—"}
                          </span>
                        </td>
                        <td style={{ padding: "11px 14px", textAlign: "right" }}>
                          <span
                            style={badgeStyle(s.onTimeRate >= 50 ? COLORS.success : COLORS.warning)}
                          >
                            {s.total > 0 ? `${s.onTimeRate}%` : "—"}
                          </span>
                        </td>
                        <td
                          style={{
                            padding: "11px 14px",
                            textAlign: "right",
                            color: s.cancelled > 0 ? COLORS.danger : "#9ca3af",
                          }}
                        >
                          {s.cancelled || "—"}
                        </td>
                        <td
                          style={{
                            padding: "11px 14px",
                            textAlign: "right",
                            color:
                              s.avgDelay > 100
                                ? COLORS.danger
                                : s.avgDelay > 30
                                  ? COLORS.warning
                                  : COLORS.success,
                          }}
                        >
                          {s.avgDelay > 0 ? `+${s.avgDelay}d` : "—"}
                        </td>
                      </tr>
                    ))}
                    {/* Totals row */}
                    <tr style={{ background: "#f1f5f9", borderTop: "2px solid #e2e8f0" }}>
                      <td
                        style={{
                          padding: "11px 14px",
                          fontWeight: 800,
                          color: "#0f172a",
                          fontSize: 13,
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                        }}
                      >
                        Total
                      </td>
                      <td style={{ padding: "11px 14px", textAlign: "right", fontWeight: 700 }}>
                        {reportTotals.total.toLocaleString()}
                      </td>
                      <td style={{ padding: "11px 14px", textAlign: "right", fontWeight: 700 }}>
                        {fmt(reportTotals.amount, "₱")}
                      </td>
                      <td
                        style={{
                          padding: "11px 14px",
                          textAlign: "right",
                          color: COLORS.success,
                          fontWeight: 700,
                        }}
                      >
                        {reportTotals.delivered}
                      </td>
                      <td colSpan={2} />
                      <td style={{ padding: "11px 14px", textAlign: "right" }}>
                        <span
                          style={badgeStyle(
                            reportTotals.deliveryRate > 50 ? COLORS.success : COLORS.danger
                          )}
                        >
                          {reportTotals.deliveryRate}%
                        </span>
                      </td>
                      <td style={{ padding: "11px 14px", textAlign: "right" }}>
                        <span
                          style={badgeStyle(
                            reportTotals.onTimeRate >= 50 ? COLORS.success : COLORS.warning
                          )}
                        >
                          {reportTotals.onTimeRate}%
                        </span>
                      </td>
                      <td colSpan={2} />
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Report Note */}
              <div
                style={{
                  padding: "16px 20px",
                  borderTop: "1px solid #f1f5f9",
                  background: "#f8fafc",
                }}
              >
                <p
                  style={{
                    margin: "0 0 8px",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#64748b",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  Report Notes / Remarks
                </p>
                <textarea
                  value={reportNote}
                  onChange={(e) => setReportNote(e.target.value)}
                  placeholder={`Add observations, highlights, or remarks for the ${reportFrom}–${reportTo} procurement period…`}
                  rows={3}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "1px solid #e2e8f0",
                    fontSize: 13,
                    color: "#374151",
                    background: "#fff",
                    resize: "vertical",
                    outline: "none",
                    fontFamily: "inherit",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            </div>
          )}

          {view === "dashboard" && (
            <>
              {/* ── Data Table ── */}
              <div
                style={{
                  marginTop: 24,
                  background: "#fff",
                  borderRadius: 12,
                  boxShadow: "0 1px 6px rgba(0,0,0,0.07)",
                  overflow: "hidden",
                }}
              >
                <div style={{ padding: "16px 20px", borderBottom: "1px solid #f1f5f9" }}>
                  <h3
                    style={{
                      margin: 0,
                      fontSize: 14,
                      fontWeight: 700,
                      color: "#374151",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    Purchase Order Details
                  </h3>
                </div>
                <div style={{ overflowX: "auto", maxHeight: 400, overflowY: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "#f8fafc", position: "sticky", top: 0 }}>
                        {[
                          "PO Year",
                          "PO Number",
                          "Supplier",
                          "Item Description",
                          "Category",
                          "Unit Price",
                          "Qty Order",
                          "Qty Delivered",
                          "Total Amount",
                          "Delivery Status",
                          "Timeliness",
                        ].map((h) => (
                          <th
                            key={h}
                            style={{
                              textAlign: "left",
                              padding: "10px 12px",
                              borderBottom: "2px solid #e2e8f0",
                              color: "#475569",
                              fontWeight: 700,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.slice(0, 200).map((row, i) => {
                        const status = row[COL.DELIVERY_STATUS] || "";
                        const timing = row[COL.DELIVERY_TIME] || "";
                        const statusClr = STATUS_COLORS[status] || "#9ca3af";
                        const timeClr = TIME_COLORS[timing] || "#9ca3af";
                        return (
                          <tr
                            key={i}
                            style={{
                              background: i % 2 === 0 ? "#fafafa" : "#fff",
                              borderBottom: "1px solid #f1f5f9",
                            }}
                          >
                            <td
                              style={{
                                padding: "8px 12px",
                                whiteSpace: "nowrap",
                                color: "#64748b",
                              }}
                            >
                              {parseYear(row[COL.SOURCE_TAB])}
                            </td>
                            <td
                              style={{
                                padding: "8px 12px",
                                whiteSpace: "nowrap",
                                color: "#64748b",
                              }}
                            >
                              {row[COL.PO_NUMBER]}
                            </td>
                            <td
                              style={{
                                padding: "8px 12px",
                                whiteSpace: "nowrap",
                                maxWidth: 160,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {row[COL.SUPPLIER]}
                            </td>
                            <td
                              style={{
                                padding: "8px 12px",
                                maxWidth: 220,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {row[COL.ITEM_DESCRIPTION]}
                            </td>
                            <td
                              style={{
                                padding: "8px 12px",
                                whiteSpace: "nowrap",
                                color: "#64748b",
                              }}
                            >
                              {row[COL.CATEGORY] || "—"}
                            </td>
                            <td
                              style={{
                                padding: "8px 12px",
                                whiteSpace: "nowrap",
                                textAlign: "right",
                              }}
                            >
                              ₱{Number(row[COL.PRICE]).toLocaleString()}
                            </td>
                            <td
                              style={{
                                padding: "8px 12px",
                                whiteSpace: "nowrap",
                                textAlign: "right",
                              }}
                            >
                              {row[COL.QTY_ORDER]}
                            </td>
                            <td
                              style={{
                                padding: "8px 12px",
                                whiteSpace: "nowrap",
                                textAlign: "right",
                              }}
                            >
                              {row[COL.QTY_DELIVERED] || "—"}
                            </td>
                            <td
                              style={{
                                padding: "8px 12px",
                                whiteSpace: "nowrap",
                                textAlign: "right",
                                fontWeight: 600,
                              }}
                            >
                              ₱{Number(row[COL.TOTAL_AMOUNT]).toLocaleString()}
                            </td>
                            <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                              <span style={badgeStyle(statusClr)}>{status}</span>
                            </td>
                            <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                              <span style={badgeStyle(timeClr)}>{timing}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {filtered.length > 200 && (
                    <p style={{ textAlign: "center", padding: 12, color: "#64748b", fontSize: 12 }}>
                      Showing 200 of {filtered.length} rows — use filters to narrow results.
                    </p>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
