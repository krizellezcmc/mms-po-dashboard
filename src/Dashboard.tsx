import { useState, useEffect, useMemo, useRef } from "react";
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
        {/* {status && (
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
        )} */}
      </div>
      <p style={{ margin: "10px 0 4px", fontSize: 30, fontWeight: 800, lineHeight: 1 }}>{value}</p>
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

function ActiveFilterPills({
  year,
  status,
  supplier,
  search,
}: {
  year: string;
  status: string;
  supplier: string;
  search: string;
}) {
  const active = (
    [
      year !== "All" && { label: "Year", value: year },
      status !== "All" && { label: "Status", value: status },
      supplier && { label: "Supplier", value: supplier },
      search && { label: "Search", value: `"${search}"` },
    ] as (false | { label: string; value: string })[]
  ).filter(Boolean) as { label: string; value: string }[];

  if (active.length === 0) return null;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
      <span
        style={{
          fontSize: 11,
          color: "#94a3b8",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        Filtered by:
      </span>
      {active.map(({ label, value }) => (
        <span
          key={label}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 12,
            background: "#f0f4ff",
            color: "#4f46e5",
            border: "1px solid #c7d2fe",
            borderRadius: 20,
            padding: "2px 10px",
            fontWeight: 600,
          }}
        >
          <span style={{ color: "#94a3b8", fontWeight: 400 }}>{label}:</span> {value}
        </span>
      ))}
    </div>
  );
}

function CategoryPivotTable({ rows, sortCol, sortDir, onSort }: { rows: any[]; sortCol: string; sortDir: "asc" | "desc"; onSort: (col: string) => void }) {
  const cols: [string, string, "left" | "right"][] = [
    ["name", "Category", "left"],
    ["total", "Total Items", "right"],
    ["delivered", "Delivered", "right"],
    ["incomplete", "Incomplete", "right"],
    ["undelivered", "Undelivered", "right"],
    ["deliveryPct", "Delivery Rate", "right"],
    ["onTimePct", "On-Time Rate", "right"],
    ["lateCount", "Late", "right"],
    ["cancelled", "Cancelled", "right"],
    ["totalAmt", "Total Amount (₱)", "right"],
  ];
  const totals = rows.reduce(
    (acc, r) => { acc.total += r.total; acc.delivered += r.delivered; acc.incomplete += r.incomplete; acc.undelivered += r.undelivered; acc.onTime += r.onTime; acc.lateCount += r.lateCount; acc.cancelled += r.cancelled; acc.totalAmt += r.totalAmt; return acc; },
    { total: 0, delivered: 0, incomplete: 0, undelivered: 0, onTime: 0, lateCount: 0, cancelled: 0, totalAmt: 0 }
  );
  const tdp = totals.total > 0 ? +((totals.delivered / totals.total) * 100).toFixed(1) : 0;
  const top = totals.total > 0 ? +((totals.onTime / totals.total) * 100).toFixed(1) : 0;
  const badge = (pct: number, threshA = 80, threshB = 50) => {
    const c = pct >= threshA ? "#10b981" : pct >= threshB ? "#f59e0b" : "#ef4444";
    return { display: "inline-block" as const, padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: c + "22", color: c };
  };
  return (
    <>
      <div style={{ overflowX: "auto", maxHeight: 440, overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "#1e293b", position: "sticky", top: 0 }}>
              {cols.map(([col, label, align]) => (
                <th key={col} onClick={() => onSort(col)} style={{ textAlign: align, padding: "10px 12px", borderBottom: "2px solid #334155", color: sortCol === col ? "#a5b4fc" : "#e2e8f0", fontWeight: 700, whiteSpace: "nowrap", cursor: "pointer", userSelect: "none" }}>
                  {label} {sortCol === col ? (sortDir === "asc" ? "↑" : "↓") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.name} style={{ background: i % 2 === 0 ? "#fafafa" : "#fff", borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "9px 12px", fontWeight: 600, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</td>
                <td style={{ padding: "9px 12px", textAlign: "right" }}>{r.total.toLocaleString()}</td>
                <td style={{ padding: "9px 12px", textAlign: "right", color: "#10b981", fontWeight: 600 }}>{r.delivered.toLocaleString()}</td>
                <td style={{ padding: "9px 12px", textAlign: "right", color: "#f59e0b", fontWeight: 600 }}>{r.incomplete || "—"}</td>
                <td style={{ padding: "9px 12px", textAlign: "right", color: "#ef4444", fontWeight: 600 }}>{r.undelivered || "—"}</td>
                <td style={{ padding: "9px 12px", textAlign: "right" }}><span style={badge(r.deliveryPct)}>{r.deliveryPct}%</span></td>
                <td style={{ padding: "9px 12px", textAlign: "right" }}><span style={badge(r.onTimePct, 50, 0)}>{r.onTimePct}%</span></td>
                <td style={{ padding: "9px 12px", textAlign: "right", color: r.lateCount >= 6 ? "#ef4444" : r.lateCount >= 1 ? "#f59e0b" : "#10b981" }}>{r.lateCount || "—"}</td>
                <td style={{ padding: "9px 12px", textAlign: "right", color: r.cancelled > 0 ? "#ef4444" : "#9ca3af" }}>{r.cancelled || "—"}</td>
                <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 600 }}>₱{r.totalAmt.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: "#f1f5f9", borderTop: "2px solid #e2e8f0" }}>
              <td style={{ padding: "9px 12px", fontWeight: 800, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em", color: "#0f172a" }}>Total</td>
              <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 700 }}>{totals.total.toLocaleString()}</td>
              <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 700, color: "#10b981" }}>{totals.delivered.toLocaleString()}</td>
              <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 700, color: "#f59e0b" }}>{totals.incomplete || "—"}</td>
              <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 700, color: "#ef4444" }}>{totals.undelivered || "—"}</td>
              <td style={{ padding: "9px 12px", textAlign: "right" }}><span style={{ ...badge(tdp), fontWeight: 700 }}>{tdp}%</span></td>
              <td style={{ padding: "9px 12px", textAlign: "right" }}><span style={{ ...badge(top, 50, 0), fontWeight: 700 }}>{top}%</span></td>
              <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 700, color: totals.lateCount >= 6 ? "#ef4444" : totals.lateCount >= 1 ? "#f59e0b" : "#10b981" }}>{totals.lateCount || "—"}</td>
              <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 700, color: totals.cancelled > 0 ? "#ef4444" : "#9ca3af" }}>{totals.cancelled || "—"}</td>
              <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 700 }}>₱{totals.totalAmt.toLocaleString()}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div style={{ padding: "8px 16px", background: "#f8fafc", borderTop: "1px solid #e2e8f0", fontSize: 12, color: "#64748b" }}>
        Showing <strong>{rows.length}</strong> categor{rows.length !== 1 ? "ies" : "y"}
      </div>
    </>
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
  const [searchDraft, setSearchDraft] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const supplierRef = useRef<HTMLDivElement>(null);
  const [showScoreSuggestions, setShowScoreSuggestions] = useState(false);
  const scoreSearchRef = useRef<HTMLDivElement>(null);

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

  const supplierList = useMemo(() => {
    const s = new Set(rawRows.map((r) => r[COL.SUPPLIER]?.trim()).filter(Boolean));
    return Array.from(s).sort();
  }, [rawRows]);

  const supplierSuggestions = useMemo(() => {
    if (!supplierFilter) return supplierList;
    const q = supplierFilter.toLowerCase();
    return supplierList.filter((s) => s.toLowerCase().includes(q));
  }, [supplierList, supplierFilter]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (supplierRef.current && !supplierRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = useMemo(() => {
    return rawRows.filter((r) => {
      if (yearFilter !== "All" && parseYear(r[COL.SOURCE_TAB]) !== yearFilter) return false;
      if (statusFilter !== "All" && r[COL.DELIVERY_STATUS] !== statusFilter) return false;
      if (supplierFilter && r[COL.SUPPLIER]?.trim() !== supplierFilter) return false;
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
  }, [rawRows, yearFilter, statusFilter, supplierFilter, searchText]);

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
  // Score = Cancellations (20pts) + Late Deliveries (10pts), normalized to 100
  const supplierScores = useMemo(() => {
    const map: Record<string, any> = {};
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
          lateCount: 0,
          totalAmt: 0,
        };
      const m = map[sup];
      m.total++;
      const status = r[COL.DELIVERY_STATUS] || "";
      const timing = r[COL.DELIVERY_TIME] || "";
      const isCancelled = r[COL.SUPPLIER_CANCELLED] === "TRUE" || r[COL.CANCELLATION] === "TRUE";
      if (status === "Delivered") m.delivered++;
      else if (status === "Incomplete Delivery") m.incomplete++;
      else if (status === "Undelivered") m.undelivered++;
      if (timing === "Early/On-Time") m.onTime++;
      if (timing === "Late" || status === "Undelivered") m.lateCount++;
      if (isCancelled) m.cancelled++;
      m.totalAmt += Number(r[COL.TOTAL_AMOUNT]) || 0;
    });

    return Object.values(map)
      .map((m) => {
        // Cancellations: 0→20, 1-5→15, 6-10→10, 11-15→5, ≥16→0
        const cancelPts =
          m.cancelled === 0 ? 20 :
          m.cancelled <= 5 ? 15 :
          m.cancelled <= 10 ? 10 :
          m.cancelled <= 15 ? 5 : 0;
        // Late Deliveries: 0→10, 1-5→5, ≥6→0
        const latePts =
          m.lateCount === 0 ? 10 :
          m.lateCount <= 5 ? 5 : 0;
        const rawScore = cancelPts + latePts; // max 30
        const score = Math.round((rawScore / 30) * 100);
        const deliveryRate = m.delivered / m.total;
        const onTimeRate = m.onTime / m.total;
        let grade, gradeColor;
        if (score >= 90) { grade = "Excellent"; gradeColor = COLORS.success; }
        else if (score >= 80) { grade = "Very Satisfactory"; gradeColor = COLORS.teal; }
        else if (score >= 70) { grade = "Satisfactory"; gradeColor = COLORS.info; }
        else if (score >= 60) { grade = "Unsatisfactory"; gradeColor = COLORS.warning; }
        else { grade = "Poor"; gradeColor = COLORS.danger; }
        return {
          ...m,
          deliveryPct: +(deliveryRate * 100).toFixed(1),
          onTimePct: +(onTimeRate * 100).toFixed(1),
          cancelPts,
          latePts,
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
  const [scoreSearchDraft, setScoreSearchDraft] = useState("");
  const [view, setView] = useState<"dashboard" | "report">("dashboard");
  const [showRubric, setShowRubric] = useState(false);
  const [showReportRubric, setShowReportRubric] = useState(false);

  const REPORT_CURRENT_YEAR = new Date().getFullYear();
  const [reportFrom, setReportFrom] = useState(String(REPORT_CURRENT_YEAR - 3));
  const [reportTo, setReportTo] = useState(String(REPORT_CURRENT_YEAR - 1));
  const [reportNote, setReportNote] = useState("");

  // Auto-set report range to actual available years once data loads
  useEffect(() => {
    const dataYears = Array.from(
      new Set(rawRows.map((r) => parseYear(r[COL.SOURCE_TAB])).filter(Boolean))
    ).sort();
    if (dataYears.length > 0) {
      setReportFrom(dataYears[0]);
      setReportTo(dataYears[dataYears.length - 1]);
    }
  }, [rawRows]);

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

  const scoreSearchSuggestions = useMemo(() => {
    const names = supplierScores.map((s) => s.name);
    if (!scoreSearchDraft) return names;
    const q = scoreSearchDraft.toLowerCase();
    return names.filter((n) => n.toLowerCase().includes(q));
  }, [supplierScores, scoreSearchDraft]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (scoreSearchRef.current && !scoreSearchRef.current.contains(e.target as Node)) {
        setShowScoreSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

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

  // ── Category Pivot ────────────────────────────────────────
  const categoryPivot = useMemo(() => {
    const map: Record<string, any> = {};
    filtered.forEach((r) => {
      const cat = (r[COL.CATEGORY] || "Uncategorized").trim();
      if (!map[cat]) map[cat] = { name: cat, total: 0, delivered: 0, incomplete: 0, undelivered: 0, onTime: 0, lateCount: 0, cancelled: 0, totalAmt: 0 };
      const m = map[cat];
      m.total++;
      const status = r[COL.DELIVERY_STATUS] || "";
      const timing = r[COL.DELIVERY_TIME] || "";
      const isCancelled = r[COL.SUPPLIER_CANCELLED] === "TRUE" || r[COL.CANCELLATION] === "TRUE";
      if (status === "Delivered") m.delivered++;
      else if (status === "Incomplete Delivery") m.incomplete++;
      else if (status === "Undelivered") m.undelivered++;
      if (timing === "Early/On-Time") m.onTime++;
      if (timing === "Late") m.lateCount++;
      if (isCancelled) m.cancelled++;
      m.totalAmt += Number(r[COL.TOTAL_AMOUNT]) || 0;
    });
    return Object.values(map).map((m) => ({
      ...m,
      deliveryPct: +(((m.delivered / m.total) * 100).toFixed(1)),
      onTimePct: +(((m.onTime / m.total) * 100).toFixed(1)),
    }));
  }, [filtered]);

  const [catSort, setCatSort] = useState("totalAmt");
  const [catSortDir, setCatSortDir] = useState<"asc" | "desc">("desc");

  const sortedCategoryPivot = useMemo(() => {
    return [...categoryPivot].sort((a, b) => {
      const v = catSortDir === "asc" ? 1 : -1;
      return typeof a[catSort] === "string"
        ? a[catSort].localeCompare(b[catSort]) * v
        : (a[catSort] - b[catSort]) * v;
    });
  }, [categoryPivot, catSort, catSortDir]);

  const toggleCatSort = (col: string) => {
    if (catSort === col) setCatSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setCatSort(col); setCatSortDir("desc"); }
  };

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

  // ── Report Category Pivot ─────────────────────────────────
  const reportCategoryPivot = useMemo(() => {
    const map: Record<string, any> = {};
    reportRows.forEach((r) => {
      const cat = (r[COL.CATEGORY] || "Uncategorized").trim();
      if (!map[cat]) map[cat] = { name: cat, total: 0, delivered: 0, incomplete: 0, undelivered: 0, onTime: 0, lateCount: 0, cancelled: 0, totalAmt: 0 };
      const m = map[cat];
      m.total++;
      const status = r[COL.DELIVERY_STATUS] || "";
      const timing = r[COL.DELIVERY_TIME] || "";
      const isCancelled = r[COL.SUPPLIER_CANCELLED] === "TRUE" || r[COL.CANCELLATION] === "TRUE";
      if (status === "Delivered") m.delivered++;
      else if (status === "Incomplete Delivery") m.incomplete++;
      else if (status === "Undelivered") m.undelivered++;
      if (timing === "Early/On-Time") m.onTime++;
      if (timing === "Late") m.lateCount++;
      if (isCancelled) m.cancelled++;
      m.totalAmt += Number(r[COL.TOTAL_AMOUNT]) || 0;
    });
    return Object.values(map).map((m) => ({
      ...m,
      deliveryPct: +(((m.delivered / m.total) * 100).toFixed(1)),
      onTimePct: +(((m.onTime / m.total) * 100).toFixed(1)),
    }));
  }, [reportRows]);

  const [reportCatSort, setReportCatSort] = useState("totalAmt");
  const [reportCatSortDir, setReportCatSortDir] = useState<"asc" | "desc">("desc");

  const sortedReportCategoryPivot = useMemo(() => {
    return [...reportCategoryPivot].sort((a, b) => {
      const v = reportCatSortDir === "asc" ? 1 : -1;
      return typeof a[reportCatSort] === "string"
        ? a[reportCatSort].localeCompare(b[reportCatSort]) * v
        : (a[reportCatSort] - b[reportCatSort]) * v;
    });
  }, [reportCategoryPivot, reportCatSort, reportCatSortDir]);

  const toggleReportCatSort = (col: string) => {
    if (reportCatSort === col) setReportCatSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setReportCatSort(col); setReportCatSortDir("desc"); }
  };

  // ── Report Supplier Scorecard ────────────────────────────
  const reportSupplierScores = useMemo(() => {
    const map: Record<string, any> = {};
    reportRows.forEach((r) => {
      const sup = r[COL.SUPPLIER]?.trim();
      if (!sup) return;
      if (!map[sup])
        map[sup] = { name: sup, total: 0, delivered: 0, incomplete: 0, undelivered: 0, onTime: 0, cancelled: 0, lateCount: 0, totalAmt: 0 };
      const m = map[sup];
      m.total++;
      const status = r[COL.DELIVERY_STATUS] || "";
      const timing = r[COL.DELIVERY_TIME] || "";
      const isCancelled = r[COL.SUPPLIER_CANCELLED] === "TRUE" || r[COL.CANCELLATION] === "TRUE";
      if (status === "Delivered") m.delivered++;
      else if (status === "Incomplete Delivery") m.incomplete++;
      else if (status === "Undelivered") m.undelivered++;
      if (timing === "Early/On-Time") m.onTime++;
      if (timing === "Late" || status === "Undelivered") m.lateCount++;
      if (isCancelled) m.cancelled++;
      m.totalAmt += Number(r[COL.TOTAL_AMOUNT]) || 0;
    });
    return Object.values(map).map((m) => {
      const cancelPts = m.cancelled === 0 ? 20 : m.cancelled <= 5 ? 15 : m.cancelled <= 10 ? 10 : m.cancelled <= 15 ? 5 : 0;
      const latePts = m.lateCount === 0 ? 10 : m.lateCount <= 5 ? 5 : 0;
      const score = Math.round(((cancelPts + latePts) / 30) * 100);
      const deliveryRate = m.delivered / m.total;
      const onTimeRate = m.onTime / m.total;
      let grade, gradeColor;
      if (score >= 90) { grade = "Excellent"; gradeColor = COLORS.success; }
      else if (score >= 80) { grade = "Very Satisfactory"; gradeColor = COLORS.teal; }
      else if (score >= 70) { grade = "Satisfactory"; gradeColor = COLORS.info; }
      else if (score >= 60) { grade = "Unsatisfactory"; gradeColor = COLORS.warning; }
      else { grade = "Poor"; gradeColor = COLORS.danger; }
      return { ...m, deliveryPct: +(deliveryRate * 100).toFixed(1), onTimePct: +(onTimeRate * 100).toFixed(1), cancelPts, latePts, score, grade, gradeColor };
    }).sort((a, b) => b.score - a.score);
  }, [reportRows]);

  const [reportScoreSort, setReportScoreSort] = useState("score");
  const [reportScoreSortDir, setReportScoreSortDir] = useState<"asc" | "desc">("desc");
  const [reportScoreSearch, setReportScoreSearch] = useState("");
  const [reportScoreSearchDraft, setReportScoreSearchDraft] = useState("");
  const [reportShowScoreSuggestions, setReportShowScoreSuggestions] = useState(false);
  const reportScoreSearchRef = useRef<HTMLDivElement>(null);

  const reportScoreSearchSuggestions = useMemo(() => {
    const names = reportSupplierScores.map((s) => s.name);
    if (!reportScoreSearchDraft) return names;
    const q = reportScoreSearchDraft.toLowerCase();
    return names.filter((n) => n.toLowerCase().includes(q));
  }, [reportSupplierScores, reportScoreSearchDraft]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (reportScoreSearchRef.current && !reportScoreSearchRef.current.contains(e.target as Node))
        setReportShowScoreSuggestions(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const reportSortedScores = useMemo(() => {
    let rows = reportSupplierScores.filter(
      (s) => !reportScoreSearch || s.name.toLowerCase().includes(reportScoreSearch.toLowerCase())
    );
    return [...rows].sort((a, b) => {
      const v = reportScoreSortDir === "asc" ? 1 : -1;
      return typeof a[reportScoreSort] === "string"
        ? a[reportScoreSort].localeCompare(b[reportScoreSort]) * v
        : (a[reportScoreSort] - b[reportScoreSort]) * v;
    });
  }, [reportSupplierScores, reportScoreSearch, reportScoreSort, reportScoreSortDir]);

  const toggleReportSort = (col: string) => {
    if (reportScoreSort === col) setReportScoreSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setReportScoreSort(col); setReportScoreSortDir("desc"); }
  };

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
              {v === "dashboard" ? "Dashboard" : "PO-Supplier Report"}
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
                {/* Supplier autocomplete */}
                <div ref={supplierRef} style={{ position: "relative" }}>
                  <input
                    style={{ ...inputStyle, minWidth: 200, paddingRight: supplierFilter ? 28 : 12 }}
                    placeholder="Filter by supplier…"
                    value={supplierFilter}
                    onChange={(e) => {
                      setSupplierFilter(e.target.value);
                      setShowSuggestions(true);
                    }}
                    onFocus={() => setShowSuggestions(true)}
                  />
                  {supplierFilter && (
                    <span
                      onClick={() => { setSupplierFilter(""); setShowSuggestions(false); }}
                      style={{
                        position: "absolute",
                        right: 8,
                        top: "50%",
                        transform: "translateY(-50%)",
                        cursor: "pointer",
                        color: "#9ca3af",
                        fontSize: 14,
                        lineHeight: 1,
                      }}
                    >
                      ✕
                    </span>
                  )}
                  {showSuggestions && supplierSuggestions.length > 0 && (
                    <div
                      style={{
                        position: "absolute",
                        top: "calc(100% + 4px)",
                        left: 0,
                        zIndex: 100,
                        background: "#fff",
                        border: "1px solid #e5e7eb",
                        borderRadius: 8,
                        boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
                        maxHeight: 220,
                        overflowY: "auto",
                        minWidth: 260,
                      }}
                    >
                      {supplierSuggestions.map((s) => (
                        <div
                          key={s}
                          onMouseDown={() => {
                            setSupplierFilter(s);
                            setShowSuggestions(false);
                          }}
                          style={{
                            padding: "8px 12px",
                            fontSize: 13,
                            cursor: "pointer",
                            background: supplierFilter === s ? "#f0f4ff" : "transparent",
                            color: supplierFilter === s ? "#4f46e5" : "#374151",
                            fontWeight: supplierFilter === s ? 600 : 400,
                            borderBottom: "1px solid #f3f4f6",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "#f9fafb")}
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.background =
                              supplierFilter === s ? "#f0f4ff" : "transparent")
                          }
                        >
                          {s}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <input
                    style={inputStyle}
                    placeholder="Search item, PO #…"
                    value={searchDraft}
                    onChange={(e) => setSearchDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") setSearchText(searchDraft);
                    }}
                  />
                  <button
                    onClick={() => setSearchText(searchDraft)}
                    style={{
                      ...selectStyle,
                      background: COLORS.primary,
                      color: "#fff",
                      border: "none",
                      fontWeight: 600,
                      padding: "6px 14px",
                    }}
                  >
                    Search
                  </button>
                </div>
                {(yearFilter !== "All" || statusFilter !== "All" || supplierFilter || searchText) && (
                  <button
                    onClick={() => {
                      setYearFilter("All");
                      setStatusFilter("All");
                      setSupplierFilter("");
                      setSearchText("");
                      setSearchDraft("");
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

              {/* ── Active Filter Pills ── */}
              {(yearFilter !== "All" || statusFilter !== "All" || supplierFilter || searchText) && (
                <div
                  style={{
                    marginBottom: 16,
                    padding: "10px 16px",
                    background: "#fff",
                    borderRadius: 8,
                    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                    border: "1px solid #e0e7ff",
                  }}
                >
                  <ActiveFilterPills
                    year={yearFilter}
                    status={statusFilter}
                    supplier={supplierFilter}
                    search={searchText}
                  />
                </div>
              )}

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
                  // status={
                  //   totalAmount >= 1_000_000
                  //     ? "High Value"
                  //     : totalAmount >= 100_000
                  //       ? "Mid Value"
                  //       : "Low Value"
                  // }
                />
                <KPICard
                  title="Delivery Rate"
                  value={
                    <span
                      style={{ color: Number(deliveryRate) > 50 ? COLORS.success : COLORS.danger }}
                    >
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
                  color={COLORS.warning}
                  progress={Number(onTimeRate)}
                  // status={rateStatus(onTimeRate)}
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
                            {val} ({((entry?.payload as any)?.value ?? 0).toLocaleString()})
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
                      <p style={{ margin: "8px 0 2px", fontSize: 22, fontWeight: 700 }}>{count.toLocaleString()}</p>
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
                    <div style={{ marginTop: 6 }}>
                      <ActiveFilterPills
                        year={yearFilter}
                        status={statusFilter}
                        supplier={supplierFilter}
                        search={searchText}
                      />
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button
                      onClick={() => setShowRubric((v) => !v)}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 7,
                        border: showRubric ? "none" : "1px solid #e2e8f0",
                        background: showRubric ? "#0f172a" : "#fff",
                        color: showRubric ? "#fff" : "#374151",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {showRubric ? "Hide Rubric" : "Scoring Rubric"}
                    </button>
                  <div ref={scoreSearchRef} style={{ position: "relative" }}>
                    <input
                      style={{ ...inputStyle, minWidth: 200, paddingRight: scoreSearchDraft ? 28 : 12 }}
                      placeholder="Search supplier…"
                      value={scoreSearchDraft}
                      onChange={(e) => { setScoreSearchDraft(e.target.value); setShowScoreSuggestions(true); }}
                      onFocus={() => setShowScoreSuggestions(true)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          setScoreSearch(scoreSearchDraft);
                          setShowScoreSuggestions(false);
                        }
                      }}
                    />
                    {scoreSearchDraft && (
                      <span
                        onClick={() => { setScoreSearchDraft(""); setScoreSearch(""); setShowScoreSuggestions(false); }}
                        style={{
                          position: "absolute",
                          right: 8,
                          top: "50%",
                          transform: "translateY(-50%)",
                          cursor: "pointer",
                          color: "#9ca3af",
                          fontSize: 14,
                          lineHeight: 1,
                        }}
                      >
                        ✕
                      </span>
                    )}
                    {showScoreSuggestions && scoreSearchSuggestions.length > 0 && (
                      <div
                        style={{
                          position: "absolute",
                          top: "calc(100% + 4px)",
                          right: 0,
                          zIndex: 100,
                          background: "#fff",
                          border: "1px solid #e5e7eb",
                          borderRadius: 8,
                          boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
                          maxHeight: 220,
                          overflowY: "auto",
                          minWidth: 260,
                        }}
                      >
                        {scoreSearchSuggestions.map((name) => (
                          <div
                            key={name}
                            onMouseDown={() => {
                              setScoreSearchDraft(name);
                              setScoreSearch(name);
                              setShowScoreSuggestions(false);
                            }}
                            style={{
                              padding: "8px 12px",
                              fontSize: 13,
                              cursor: "pointer",
                              background: scoreSearch === name ? "#f0f4ff" : "transparent",
                              color: scoreSearch === name ? "#4f46e5" : "#374151",
                              fontWeight: scoreSearch === name ? 600 : 400,
                              borderBottom: "1px solid #f3f4f6",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "#f9fafb")}
                            onMouseLeave={(e) =>
                              (e.currentTarget.style.background =
                                scoreSearch === name ? "#f0f4ff" : "transparent")
                            }
                          >
                            {name}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  </div>{/* end flex row: button + search */}
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
                    ["Excellent", "90–100", COLORS.success],
                    ["Very Satisfactory", "80–89", COLORS.teal],
                    ["Satisfactory", "70–79", COLORS.info],
                    ["Unsatisfactory", "60–69", COLORS.warning],
                    ["Poor", "0–59", COLORS.danger],
                  ].map(([g, range, c]) => (
                    <span
                      key={g}
                      style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}
                    >
                      <span style={{ ...badgeStyle(c), fontWeight: 700, padding: "1px 9px" }}>
                        {g}
                      </span>
                      <span style={{ color: "#64748b" }}>{range} pts</span>
                    </span>
                  ))}
                </div>

                {/* Rubric panel */}
                {showRubric && (
                  <div style={{ padding: "14px 20px", borderBottom: "1px solid #f1f5f9", background: "#f8fafc" }}>
                    <p style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Scoring Rubric — Score = (Cancellations pts + Late Deliveries pts) ÷ 30 × 100
                    </p>
                    <table style={{ borderCollapse: "collapse", fontSize: 12, width: "100%" }}>
                      <thead>
                        <tr style={{ background: "#e2e8f0" }}>
                          {["Metric", "Max Pts", "0", "1–5", "6–10", "11–15", "≥16"].map((h) => (
                            <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontWeight: 700, color: "#475569", whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                          <td style={{ padding: "6px 10px", fontWeight: 600 }}>Cancellations</td>
                          <td style={{ padding: "6px 10px", textAlign: "center", fontWeight: 700, color: COLORS.primary }}>20</td>
                          <td style={{ padding: "6px 10px", color: COLORS.success, fontWeight: 600 }}>20 pts</td>
                          <td style={{ padding: "6px 10px", color: COLORS.teal, fontWeight: 600 }}>15 pts</td>
                          <td style={{ padding: "6px 10px", color: COLORS.warning, fontWeight: 600 }}>10 pts</td>
                          <td style={{ padding: "6px 10px", color: COLORS.orange, fontWeight: 600 }}>5 pts</td>
                          <td style={{ padding: "6px 10px", color: COLORS.danger, fontWeight: 600 }}>0 pts</td>
                        </tr>
                        <tr>
                          <td style={{ padding: "6px 10px", fontWeight: 600 }}>Late Deliveries</td>
                          <td style={{ padding: "6px 10px", textAlign: "center", fontWeight: 700, color: COLORS.primary }}>10</td>
                          <td style={{ padding: "6px 10px", color: COLORS.success, fontWeight: 600 }}>10 pts</td>
                          <td style={{ padding: "6px 10px", color: COLORS.warning, fontWeight: 600 }}>5 pts</td>
                          <td style={{ padding: "6px 10px", color: COLORS.danger, fontWeight: 600 }}>0 pts</td>
                          <td colSpan={2} style={{ padding: "6px 10px", color: "#9ca3af", fontSize: 11 }}>— (≥6 applies)</td>
                        </tr>
                      </tbody>
                    </table>
                    <p style={{ margin: "8px 0 0", fontSize: 11, color: "#94a3b8" }}>
                      * Change of Brands, Extension of Delivery, and Expiry within 18 months are not scored — no corresponding data columns available.
                    </p>
                  </div>
                )}

                {/* Score bar chart */}
                {/* <div style={{ padding: "16px 20px 8px", borderBottom: "1px solid #f1f5f9" }}>
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
                </div> */}

                {/* Scorecard table */}
                <div style={{ overflowX: "auto", maxHeight: 420, overflowY: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "#1e293b", position: "sticky", top: 0 }}>
                        {[
                          ["name", "Supplier"],
                          ["total", "Total Items"],
                          ["delivered", "Delivered"],
                          ["incomplete", "Incomplete"],
                          ["undelivered", "Undelivered"],
                          ["onTimePct", "On-Time %"],
                          ["deliveryPct", "Delivery %"],
                          ["lateCount", "Late Deliveries"],
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
                              borderBottom: "2px solid #334155",
                              color: scoreSort === col ? "#a5b4fc" : "#e2e8f0",
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
                            {s.total.toLocaleString()}
                          </td>
                          <td
                            style={{
                              padding: "9px 12px",
                              textAlign: "right",
                              color: COLORS.success,
                              fontWeight: 600,
                            }}
                          >
                            {s.delivered.toLocaleString()}
                          </td>
                          <td
                            style={{
                              padding: "9px 12px",
                              textAlign: "right",
                              color: COLORS.warning,
                              fontWeight: 600,
                            }}
                          >
                            {s.incomplete.toLocaleString()}
                          </td>
                          <td
                            style={{
                              padding: "9px 12px",
                              textAlign: "right",
                              color: COLORS.danger,
                              fontWeight: 600,
                            }}
                          >
                            {s.undelivered.toLocaleString()}
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
                          <td style={{ padding: "9px 12px", textAlign: "right", color: s.lateCount >= 6 ? COLORS.danger : s.lateCount >= 1 ? COLORS.warning : COLORS.success }}>
                            {s.lateCount > 0 ? s.lateCount : "—"}
                          </td>
                          <td
                            style={{
                              padding: "9px 12px",
                              textAlign: "right",
                              color: s.cancelled > 0 ? COLORS.danger : "#9ca3af",
                            }}
                          >
                            {s.cancelled ? s.cancelled.toLocaleString() : "—"}
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
                            <span style={{ ...badgeStyle(s.gradeColor), fontWeight: 700, whiteSpace: "nowrap" }}>
                              {s.grade}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ padding: "8px 16px", background: "#f8fafc", borderTop: "1px solid #e2e8f0", fontSize: 12, color: "#64748b" }}>
                  Showing <strong>{sortedScores.length}</strong> supplier{sortedScores.length !== 1 ? "s" : ""}
                  {scoreSearch && <span style={{ marginLeft: 6, color: "#4f46e5" }}>(filtered)</span>}
                </div>
              </div>

              {/* ── Category Pivot ── */}
              <div style={{ marginTop: 28, background: "#fff", borderRadius: 12, boxShadow: "0 1px 6px rgba(0,0,0,0.07)", overflow: "hidden" }}>
                <div style={{ padding: "16px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Category Report
                    </h3>
                    <div style={{ marginTop: 6 }}>
                      <ActiveFilterPills year={yearFilter} status={statusFilter} supplier={supplierFilter} search={searchText} />
                    </div>
                  </div>
                  <span style={{ fontSize: 12, color: "#64748b" }}>Click column headers to sort</span>
                </div>
                <CategoryPivotTable rows={sortedCategoryPivot} sortCol={catSort} sortDir={catSortDir} onSort={toggleCatSort} />
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
                    PO-Supplier Report
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
                    <tr style={{ background: "#1e293b" }}>
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
                            borderBottom: "2px solid #334155",
                            color: "#e2e8f0",
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
                          {s.delivered ? s.delivered.toLocaleString() : "—"}
                        </td>
                        <td
                          style={{
                            padding: "11px 14px",
                            textAlign: "right",
                            color: COLORS.warning,
                            fontWeight: 600,
                          }}
                        >
                          {s.incomplete ? s.incomplete.toLocaleString() : "—"}
                        </td>
                        <td
                          style={{
                            padding: "11px 14px",
                            textAlign: "right",
                            color: COLORS.danger,
                            fontWeight: 600,
                          }}
                        >
                          {s.undelivered ? s.undelivered.toLocaleString() : "—"}
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
                          {s.cancelled ? s.cancelled.toLocaleString() : "—"}
                        </td>
                        <td style={{ padding: "11px 14px", textAlign: "right", color: s.lateCount >= 6 ? COLORS.danger : s.lateCount >= 1 ? COLORS.warning : COLORS.success }}>
                          {s.lateCount > 0 ? s.lateCount : "—"}
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
                        {reportTotals.delivered.toLocaleString()}
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
                <div style={{ padding: "8px 16px", background: "#f8fafc", borderTop: "1px solid #e2e8f0", fontSize: 12, color: "#64748b" }}>
                  Showing <strong>{reportYearStats.length}</strong> year{reportYearStats.length !== 1 ? "s" : ""} · {reportFrom}–{reportTo}
                </div>
              </div>

              {/* ── Report Supplier Scorecard ── */}
              <div style={{ borderTop: "1px solid #f1f5f9" }}>
                {/* Header */}
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
                    <p style={{ margin: "3px 0 0", fontSize: 12, color: "#64748b" }}>
                      {reportFrom}–{reportTo} · {reportSortedScores.length} suppliers
                    </p>
                  </div>
                  {/* Search + Rubric toggle */}
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button
                      onClick={() => setShowReportRubric((v) => !v)}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 7,
                        border: showReportRubric ? "none" : "1px solid #e2e8f0",
                        background: showReportRubric ? "#0f172a" : "#fff",
                        color: showReportRubric ? "#fff" : "#374151",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {showReportRubric ? "Hide Rubric" : "Scoring Rubric"}
                    </button>
                  <div ref={reportScoreSearchRef} style={{ position: "relative" }}>
                    <input
                      style={{ ...inputStyle, minWidth: 200, paddingRight: reportScoreSearchDraft ? 28 : 12 }}
                      placeholder="Search supplier…"
                      value={reportScoreSearchDraft}
                      onChange={(e) => { setReportScoreSearchDraft(e.target.value); setReportShowScoreSuggestions(true); }}
                      onFocus={() => setReportShowScoreSuggestions(true)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { setReportScoreSearch(reportScoreSearchDraft); setReportShowScoreSuggestions(false); }
                      }}
                    />
                    {reportScoreSearchDraft && (
                      <span
                        onClick={() => { setReportScoreSearchDraft(""); setReportScoreSearch(""); setReportShowScoreSuggestions(false); }}
                        style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", cursor: "pointer", color: "#9ca3af", fontSize: 14, lineHeight: 1 }}
                      >
                        ✕
                      </span>
                    )}
                    {reportShowScoreSuggestions && reportScoreSearchSuggestions.length > 0 && (
                      <div
                        style={{
                          position: "absolute",
                          top: "calc(100% + 4px)",
                          right: 0,
                          zIndex: 100,
                          background: "#fff",
                          border: "1px solid #e5e7eb",
                          borderRadius: 8,
                          boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
                          maxHeight: 220,
                          overflowY: "auto",
                          minWidth: 260,
                        }}
                      >
                        {reportScoreSearchSuggestions.map((name) => (
                          <div
                            key={name}
                            onMouseDown={() => { setReportScoreSearchDraft(name); setReportScoreSearch(name); setReportShowScoreSuggestions(false); }}
                            style={{
                              padding: "8px 12px",
                              fontSize: 13,
                              cursor: "pointer",
                              background: reportScoreSearch === name ? "#f0f4ff" : "transparent",
                              color: reportScoreSearch === name ? "#4f46e5" : "#374151",
                              fontWeight: reportScoreSearch === name ? 600 : 400,
                              borderBottom: "1px solid #f3f4f6",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "#f9fafb")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = reportScoreSearch === name ? "#f0f4ff" : "transparent")}
                          >
                            {name}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  </div>{/* end flex row: button + search */}
                </div>

                {/* Grade legend */}
                <div style={{ display: "flex", gap: 12, padding: "10px 20px", borderBottom: "1px solid #f1f5f9", flexWrap: "wrap" }}>
                  {([["Excellent", "90–100", COLORS.success], ["Very Satisfactory", "80–89", COLORS.teal], ["Satisfactory", "70–79", COLORS.info], ["Unsatisfactory", "60–69", COLORS.warning], ["Poor", "0–59", COLORS.danger]] as const).map(([g, range, c]) => (
                    <span key={g} style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ ...badgeStyle(c), fontSize: 13, fontWeight: 800, padding: "1px 9px" }}>{g}</span>
                      <span style={{ color: "#64748b" }}>{range} pts</span>
                    </span>
                  ))}
                </div>

                {/* Rubric panel */}
                {showReportRubric && (
                  <div style={{ padding: "14px 20px", borderBottom: "1px solid #f1f5f9", background: "#f8fafc" }}>
                    <p style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Scoring Rubric — Score = (Cancellations pts + Late Deliveries pts) ÷ 30 × 100
                    </p>
                    <table style={{ borderCollapse: "collapse", fontSize: 12, width: "100%" }}>
                      <thead>
                        <tr style={{ background: "#e2e8f0" }}>
                          {["Metric", "Max Pts", "0", "1–5", "6–10", "11–15", "≥16"].map((h) => (
                            <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontWeight: 700, color: "#475569", whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                          <td style={{ padding: "6px 10px", fontWeight: 600 }}>Cancellations</td>
                          <td style={{ padding: "6px 10px", textAlign: "center", fontWeight: 700, color: COLORS.primary }}>20</td>
                          <td style={{ padding: "6px 10px", color: COLORS.success, fontWeight: 600 }}>20 pts</td>
                          <td style={{ padding: "6px 10px", color: COLORS.teal, fontWeight: 600 }}>15 pts</td>
                          <td style={{ padding: "6px 10px", color: COLORS.warning, fontWeight: 600 }}>10 pts</td>
                          <td style={{ padding: "6px 10px", color: COLORS.orange, fontWeight: 600 }}>5 pts</td>
                          <td style={{ padding: "6px 10px", color: COLORS.danger, fontWeight: 600 }}>0 pts</td>
                        </tr>
                        <tr>
                          <td style={{ padding: "6px 10px", fontWeight: 600 }}>Late Deliveries</td>
                          <td style={{ padding: "6px 10px", textAlign: "center", fontWeight: 700, color: COLORS.primary }}>10</td>
                          <td style={{ padding: "6px 10px", color: COLORS.success, fontWeight: 600 }}>10 pts</td>
                          <td style={{ padding: "6px 10px", color: COLORS.warning, fontWeight: 600 }}>5 pts</td>
                          <td style={{ padding: "6px 10px", color: COLORS.danger, fontWeight: 600 }}>0 pts</td>
                          <td colSpan={2} style={{ padding: "6px 10px", color: "#9ca3af", fontSize: 11 }}>— (≥6 applies)</td>
                        </tr>
                      </tbody>
                    </table>
                    <p style={{ margin: "8px 0 0", fontSize: 11, color: "#94a3b8" }}>
                      * Change of Brands, Extension of Delivery, and Expiry within 18 months are not scored — no corresponding data columns available.
                    </p>
                  </div>
                )}

                {/* Table */}
                <div style={{ overflowX: "auto", maxHeight: 420, overflowY: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "#1e293b", position: "sticky", top: 0 }}>
                        {([
                          ["name", "Supplier"],
                          ["total", "Total Items"],
                          ["delivered", "Delivered"],
                          ["incomplete", "Incomplete"],
                          ["undelivered", "Undelivered"],
                          ["onTimePct", "On-Time %"],
                          ["deliveryPct", "Delivery %"],
                          ["lateCount", "Late Deliveries"],
                          ["cancelled", "Cancelled"],
                          ["totalAmt", "Total Amount"],
                          ["score", "Score"],
                          ["grade", "Grade"],
                        ] as [string, string][]).map(([col, label]) => (
                          <th
                            key={col}
                            onClick={() => toggleReportSort(col)}
                            style={{
                              textAlign: col === "name" ? "left" : "right",
                              padding: "10px 12px",
                              borderBottom: "2px solid #334155",
                              color: reportScoreSort === col ? "#a5b4fc" : "#e2e8f0",
                              fontWeight: 700,
                              whiteSpace: "nowrap",
                              cursor: "pointer",
                              userSelect: "none",
                            }}
                          >
                            {label} {reportScoreSort === col ? (reportScoreSortDir === "asc" ? "↑" : "↓") : ""}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {reportSortedScores.map((s, i) => (
                        <tr key={i} style={{ background: i % 2 === 0 ? "#fafafa" : "#fff", borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "9px 12px", fontWeight: 600, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</td>
                          <td style={{ padding: "9px 12px", textAlign: "right" }}>{s.total}</td>
                          <td style={{ padding: "9px 12px", textAlign: "right", color: COLORS.success, fontWeight: 600 }}>{s.delivered}</td>
                          <td style={{ padding: "9px 12px", textAlign: "right", color: COLORS.warning, fontWeight: 600 }}>{s.incomplete}</td>
                          <td style={{ padding: "9px 12px", textAlign: "right", color: COLORS.danger, fontWeight: 600 }}>{s.undelivered}</td>
                          <td style={{ padding: "9px 12px", textAlign: "right" }}>
                            <span style={badgeStyle(s.onTimePct >= 50 ? COLORS.success : COLORS.warning)}>{s.onTimePct}%</span>
                          </td>
                          <td style={{ padding: "9px 12px", textAlign: "right" }}>
                            <span style={badgeStyle(s.deliveryPct >= 80 ? COLORS.success : s.deliveryPct >= 50 ? COLORS.warning : COLORS.danger)}>{s.deliveryPct}%</span>
                          </td>
                          <td style={{ padding: "9px 12px", textAlign: "right", color: s.lateCount >= 6 ? COLORS.danger : s.lateCount >= 1 ? COLORS.warning : COLORS.success }}>
                            {s.lateCount > 0 ? s.lateCount : "—"}
                          </td>
                          <td style={{ padding: "9px 12px", textAlign: "right", color: s.cancelled > 0 ? COLORS.danger : "#9ca3af" }}>{s.cancelled || "—"}</td>
                          <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 600 }}>₱{s.totalAmt.toLocaleString()}</td>
                          <td style={{ padding: "9px 12px", textAlign: "right" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                              <div style={{ width: 48, height: 6, borderRadius: 3, background: "#e5e7eb", overflow: "hidden" }}>
                                <div style={{ width: `${s.score}%`, height: "100%", background: s.gradeColor, borderRadius: 3 }} />
                              </div>
                              <span style={{ fontWeight: 700, color: s.gradeColor }}>{s.score}</span>
                            </div>
                          </td>
                          <td style={{ padding: "9px 12px", textAlign: "right" }}>
                            <span style={{ ...badgeStyle(s.gradeColor), fontWeight: 700, whiteSpace: "nowrap" }}>{s.grade}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ padding: "8px 16px", background: "#f8fafc", borderTop: "1px solid #e2e8f0", fontSize: 12, color: "#64748b" }}>
                  Showing <strong>{reportSortedScores.length}</strong> supplier{reportSortedScores.length !== 1 ? "s" : ""}
                  {reportScoreSearch && <span style={{ marginLeft: 6, color: "#4f46e5" }}>(filtered)</span>}
                </div>
              </div>

              {/* ── Report Category Pivot ── */}
              <div style={{ borderTop: "1px solid #f1f5f9" }}>
                <div style={{ padding: "16px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Category Report
                    </h3>
                    <p style={{ margin: "3px 0 0", fontSize: 12, color: "#64748b" }}>
                      {reportFrom}–{reportTo} · {sortedReportCategoryPivot.length} categories
                    </p>
                  </div>
                  <span style={{ fontSize: 12, color: "#64748b" }}>Click column headers to sort</span>
                </div>
                <CategoryPivotTable rows={sortedReportCategoryPivot} sortCol={reportCatSort} sortDir={reportCatSortDir} onSort={toggleReportCatSort} />
              </div>

            </div>
          )}

          <hr style={{ marginTop: 30 }} />

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
                  <div style={{ marginTop: 8 }}>
                    <ActiveFilterPills
                      year={yearFilter}
                      status={statusFilter}
                      supplier={supplierFilter}
                      search={searchText}
                    />
                  </div>
                </div>

                <div style={{ overflowX: "auto", maxHeight: 400, overflowY: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "#1e293b", position: "sticky", top: 0 }}>
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
                              borderBottom: "2px solid #334155",
                              color: "#e2e8f0",
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
                      {filtered.map((row, i) => {
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
                                maxWidth: 100,
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
                              {Number(row[COL.QTY_ORDER]).toLocaleString()}
                            </td>
                            <td
                              style={{
                                padding: "8px 12px",
                                whiteSpace: "nowrap",
                                textAlign: "right",
                              }}
                            >
                              {row[COL.QTY_DELIVERED] ? Number(row[COL.QTY_DELIVERED]).toLocaleString() : "—"}
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
                </div>
                <div style={{ padding: "8px 16px", background: "#f8fafc", borderTop: "1px solid #e2e8f0", fontSize: 12, color: "#64748b" }}>
                  Showing <strong>{filtered.length.toLocaleString()}</strong> record{filtered.length !== 1 ? "s" : ""}
                  {filtered.length < rawRows.length && (
                    <span style={{ marginLeft: 6, color: "#4f46e5" }}>({rawRows.length.toLocaleString()} total — filtered)</span>
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
