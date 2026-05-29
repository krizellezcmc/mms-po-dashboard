import { useState, useEffect, useMemo, type CSSProperties, type ReactNode } from "react";
import Papa from "papaparse";
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from "recharts";
import zcmcLogo from "./assets/zcmc-logo.png";

// ─────────────────────────────────────────────────────────────
// DATA SOURCE — your Google Sheet (shared publicly as Viewer)
// ─────────────────────────────────────────────────────────────
const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1IL3iFJojbMksjMXN-0aiZXxMJ76P_aTmVq5XGG4n9iw/gviz/tq?tqx=out:csv";

// Column indices (0-based) — matched to your sheet's header row
const COL = {
  SOURCE_TAB:       0,   // PO-22, PO-23
  PO_NUMBER:        1,   // e.g. 22-09-0528
  SUPPLIER:         2,   // supplier name (duplicate "PO NUMBER" header)
  ITEM_DESCRIPTION: 3,
  PRICE:            4,
  CATEGORY:         5,
  DELIVERY_TERM:    11,
  QTY_ORDER:        12,
  QTY_DELIVERED:    18,
  UNDELIVERED:      20, 
  DELIVERY_STATUS:  33,  // Delivered / Undelivered / Incomplete Delivery
  DELIVERY_TIME:    35,  // Late / Early/On-Time / Overdue / Cancelled
  TOTAL_AMOUNT:     36,
  DAYS:             39,
};

// ─────────────────────────────────────────────────────────────
// Color palette
// ─────────────────────────────────────────────────────────────
const COLORS = {
  primary:    "#6366f1",
  success:    "#10b981",
  warning:    "#f59e0b",
  danger:     "#ef4444",
  info:       "#3b82f6",
  purple:     "#8b5cf6",
  teal:       "#14b8a6",
  orange:     "#f97316",
};

const STATUS_COLORS: Record<string, string> = {
  "Delivered":           COLORS.success,
  "Incomplete Delivery": COLORS.warning,
  "Undelivered":         COLORS.danger,
};

const TIME_COLORS: Record<string, string> = {
  "Early/On-Time": COLORS.success,
  "Late":          COLORS.warning,
  "Overdue":       COLORS.danger,
  "Cancelled":     "#9ca3af",
};

const CATEGORY_COLORS = [
  COLORS.primary, COLORS.teal, COLORS.warning,
  COLORS.orange, COLORS.purple, COLORS.info,
];

type Row = string[];
type ChartDatum = { name: string; value: number };

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
const fmt = (val: unknown, prefix = "") => {
  const n = Number(val);
  if (!Number.isFinite(n)) return "—";
  return `${prefix}${n.toLocaleString()}`;
};

const num = (val: unknown) => fmt(val);
const money = (val: unknown) => fmt(val, "₱");

// KPI formatting: keep it compact (no locale commas)
const fmtKpi = (val: unknown, prefix = "") => {
  const n = Number(val);
  if (!Number.isFinite(n)) return "—";
  if (n >= 1_000_000) return `${prefix}${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${prefix}${(n / 1_000).toFixed(1)}K`;
  return `${prefix}${String(Math.trunc(n))}`;
};

const kpiNum = (val: unknown) => fmtKpi(val);
const kpiMoney = (val: unknown) => fmtKpi(val, "₱");

const pct = (num: number, den: number) => (den === 0 ? "0" : ((num / den) * 100).toFixed(1));

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────
function KPICard({
  title,
  value,
  sub,
  color,
  icon,
}: {
  title: string;
  value: ReactNode;
  sub?: ReactNode;
  color: string;
  icon?: ReactNode;
}) {
  return (
    <div style={{
      background: "#fff",
      borderRadius: 12,
      padding: "20px 24px",
      boxShadow: "0 1px 6px rgba(0,0,0,0.08)",
      borderLeft: `4px solid ${color}`,
      flex: "1 1 180px",
      minWidth: 160,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <p style={{ margin: 0, fontSize: 12, color: "#6b7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{title}</p>
        <span style={{ fontSize: 20 }}>{icon}</span>
      </div>
      <p style={{ margin: "10px 0 4px", fontSize: 30, fontWeight: 800, color: "inherit", lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ margin: 0, fontSize: 12, color: "#6b7280", fontStyle: "italic" }}>{sub}</p>}
    </div>
  );
}

function ChartCard({
  title,
  children,
  height = 260,
}: {
  title: string;
  children: ReactNode;
  height?: number;
}) {
  return (
    <div style={{
      background: "#fff",
      borderRadius: 12,
      padding: "20px 20px 12px",
      boxShadow: "0 1px 6px rgba(0,0,0,0.08)",
    }}>
      <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.05em" }}>{title}</h3>
      <div style={{ height }}>{children}</div>
    </div>
  );
}

type SimpleTooltipProps = {
  active?: boolean;
  payload?: Array<{ name?: string; value?: unknown; color?: string }>;
  label?: string;
};

const CustomTooltip = ({ active, payload, label }: SimpleTooltipProps) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#1f2937", color: "#fff", borderRadius: 8, padding: "10px 14px", fontSize: 13 }}>
      {label && <p style={{ margin: "0 0 6px", fontWeight: 600 }}>{label}</p>}
      {payload.map((p, i: number) => (
        <p key={i} style={{ margin: "2px 0", color: p.color || "#fff" }}>
          {p.name}: {typeof p.value === "number" ? p.value.toLocaleString() : String(p.value ?? "")}
        </p>
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Main Dashboard
// ─────────────────────────────────────────────────────────────
export default function ExecutiveDashboard() {
  const [rawRows, setRawRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
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
      complete: (results: Papa.ParseResult<Row>) => {
        // Drop header row (index 0) and blank/invalid rows
        const rows = results.data
          .slice(1)
          .filter((r) => r?.[COL.PO_NUMBER] && r[COL.PO_NUMBER].trim() !== "");
        setRawRows(rows);
        setLastUpdated(new Date());
        setLoading(false);
      },
      error: (err: Error) => {
        setError(err.message ?? "Failed to load data");
        setLoading(false);
      },
    });
  };

  useEffect(() => { fetchData(); }, []);

  // ── Derived data ──────────────────────────────────────────
  const years = useMemo(() => {
    const s = new Set(rawRows.map((r) => r[COL.SOURCE_TAB]).filter(Boolean));
    return ["All", ...Array.from(s).sort()];
  }, [rawRows]);

  const statuses = useMemo(() => {
    const s = new Set(rawRows.map((r) => r[COL.DELIVERY_STATUS]).filter(Boolean));
    return ["All", ...Array.from(s).sort()];
  }, [rawRows]);

  const filtered = useMemo(() => {
    return rawRows.filter((r) => {
      if (yearFilter !== "All" && r[COL.SOURCE_TAB] !== yearFilter) return false;
      if (statusFilter !== "All" && r[COL.DELIVERY_STATUS] !== statusFilter) return false;
      if (searchText) {
        const q = searchText.toLowerCase();
        if (!r[COL.ITEM_DESCRIPTION]?.toLowerCase().includes(q) &&
            !r[COL.SUPPLIER]?.toLowerCase().includes(q) &&
            !r[COL.PO_NUMBER]?.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [rawRows, yearFilter, statusFilter, searchText]);

  // KPIs
  const totalItems      = filtered.length;
  const totalAmount     = filtered.reduce((s, r) => s + (Number(r[COL.TOTAL_AMOUNT]) || 0), 0);
  const deliveredCount  = filtered.filter(r => r[COL.DELIVERY_STATUS] === "Delivered").length;
  const onTimeCount     = filtered.filter(r => r[COL.DELIVERY_TIME]    === "Early/On-Time").length;
  const deliveryRate    = pct(deliveredCount, totalItems);
  const onTimeRate      = pct(onTimeCount, totalItems);

  // Chart: Delivery Status
  const deliveryStatusData = useMemo<ChartDatum[]>(() => {
    const counts: Record<string, number> = {};
    filtered.forEach((r) => {
      const s = r[COL.DELIVERY_STATUS] || "Unknown";
      counts[s] = (counts[s] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filtered]);

  // Chart: Delivery Time
  const deliveryTimeData = useMemo<ChartDatum[]>(() => {
    const counts: Record<string, number> = {};
    filtered.forEach((r) => {
      const t = r[COL.DELIVERY_TIME] || "Unknown";
      counts[t] = (counts[t] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filtered]);

  // Chart: Category breakdown (by total amount)
  const categoryData = useMemo<ChartDatum[]>(() => {
    const map: Record<string, number> = {};
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
  const supplierData = useMemo<ChartDatum[]>(() => {
    const map: Record<string, number> = {};
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

  // ── Styles ──────────────────────────────────────────────
  const pageStyle: CSSProperties = {
    minHeight: "100vh",
    background: "#f1f5f9",
    fontFamily: "var(--sans)", 
    padding: "24px 28px",
    color: "#111827",
  };

  const gridStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
    gap: 20,
    marginTop: 20,
  };

  const filterBarStyle: CSSProperties = {
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

  const selectStyle: CSSProperties = {
    padding: "6px 10px",
    borderRadius: 6,
    border: "1px solid #e5e7eb",
    fontSize: 13,
    background: "#f9fafb",
    color: "#374151",
    cursor: "pointer",
  }; 

  const inputStyle: CSSProperties = {
    ...selectStyle,
    padding: "6px 12px",
    minWidth: 220,
    outline: "none",
  };

  const badgeStyle = (color: string): CSSProperties => ({
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <img
            src={zcmcLogo}
            alt="ZCMC"
            style={{ width: 44, height: 44, objectFit: "contain" }}
          />
          <div style={{ textAlign: "left", lineHeight: "1.2" }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0f172a" }}>
              Procurement Executive Dashboard
            </h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
              Purchase Order Delivery Monitoring
              {lastUpdated && ` · Updated ${lastUpdated.toLocaleTimeString()}`}
            </p>
          </div>
        </div>
        <button onClick={fetchData} style={{
          padding: "8px 16px", borderRadius: 8, border: "1px solid #e2e8f0",
          background: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600,
          color: "#374151", boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
        }}>↻ Refresh</button>
      </div>

      {/* ── Loading / Error ── */}
      {loading && (
        <div style={{ textAlign: "center", padding: 80, color: "#64748b", fontSize: 15 }}>
          Loading procurement data…
        </div>
      )}
      {error && (
        <div style={{ padding: 16, background: "#fee2e2", borderRadius: 8, color: "#991b1b", marginBottom: 20 }}>
          ❌ Error loading data: {error}
        </div>
      )}

      {!loading && !error && (
        <>
          {/* ── Filters ── */}
          <div style={filterBarStyle}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#64748b", marginRight: 4 }}>Filter:</span>
            <select style={selectStyle} value={yearFilter} onChange={e => setYearFilter(e.target.value)}>
              {years.map(y => <option key={y}>{y}</option>)}
            </select>
            <select style={selectStyle} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              {statuses.map(s => <option key={s}>{s}</option>)}
            </select>
            <input
              style={inputStyle}
              placeholder="Search item, supplier, PO #…"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
            />
            {(yearFilter !== "All" || statusFilter !== "All" || searchText) && (
              <button onClick={() => { setYearFilter("All"); setStatusFilter("All"); setSearchText(""); }}
                style={{ ...selectStyle, background: "#fee2e2", color: "#dc2626", border: "1px solid #fecaca", fontWeight: 600 }}>
                ✕ Clear
              </button>
            )}
            <span style={{ marginLeft: "auto", fontSize: 13, color: "#64748b" }}>
              Showing <strong>{totalItems.toLocaleString()}</strong> of <strong>{rawRows.length.toLocaleString()}</strong> items
            </span>
          </div>

          {/* ── KPI Cards ── */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 24 }}>
            <KPICard title="Total PO Items"    value={kpiNum(totalItems)}              sub="Line items in selection"              color={COLORS.primary} />
            <KPICard title="Total Amount"      value={kpiMoney(totalAmount)}           sub="Sum of all PO amounts"                color={COLORS.info} />
            <KPICard
              title="Delivery Rate"
              value={
                <span style={{ color: Number(deliveryRate) > 50 ? COLORS.success : COLORS.danger }}>
                  {deliveryRate}%
                </span>
              }
              sub={`${kpiNum(deliveredCount)} fully delivered`}
              color={Number(deliveryRate) > 50 ? COLORS.success : COLORS.danger}
            />
            <KPICard title="On-Time Rate"      value={`${onTimeRate}%`}                sub={`${kpiNum(onTimeCount)} early or on time`}  color={COLORS.teal} />
          </div>

          {/* ── Charts Grid ── */}
          <div style={gridStyle}>

            {/* Delivery Status Pie */}
            <ChartCard title="Delivery Status Breakdown" height={260}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={deliveryStatusData}
                    cx="42%" cy="50%"
                    innerRadius={65} outerRadius={100}
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
                        {val} ({Number((entry as any)?.payload?.value ?? 0).toLocaleString()})
                      </span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Delivery Timeliness */}
            <ChartCard title="Delivery Timeliness" height={260}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={deliveryTimeData} layout="vertical" margin={{ left: 16, right: 20 }}>
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
                <BarChart data={categoryData} layout="vertical" margin={{ left: 10, right: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => money(v)} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={130} />
                  <Tooltip content={<CustomTooltip />} formatter={(v) => money(v)} />
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
                <BarChart data={supplierData} layout="vertical" margin={{ left: 10, right: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => money(v)} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={160} />
                  <Tooltip content={<CustomTooltip />} formatter={(v) => money(v)} />
                  <Bar dataKey="value" name="Total Amount" fill={COLORS.primary} radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

          </div>

          {/* ── Summary Stats Row ── */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 20 }}>
            {Object.entries(STATUS_COLORS).map(([status, color]) => {
              const count = filtered.filter(r => r[COL.DELIVERY_STATUS] === status).length;
              const amt   = filtered.filter(r => r[COL.DELIVERY_STATUS] === status)
                                    .reduce((s, r) => s + (Number(r[COL.TOTAL_AMOUNT]) || 0), 0);
              return (
                <div key={status} style={{
                  flex: "1 1 180px", background: "#fff", borderRadius: 10,
                  padding: "14px 18px", boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
                  borderTop: `3px solid ${color}`,
                }}>
                  <span style={badgeStyle(color)}>{status}</span>
                  <p style={{ margin: "8px 0 2px", fontSize: 22, fontWeight: 700 }}>{count.toLocaleString()}</p>
                  <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>{money(amt)} total</p>
                </div>
              );
            })}
          </div>

          {/* ── Data Table ── */}
          <div style={{ marginTop: 24, background: "#fff", borderRadius: 12, boxShadow: "0 1px 6px rgba(0,0,0,0.07)", overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #f1f5f9" }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Purchase Order Details
              </h3>
            </div>
            <div style={{ overflowX: "auto", maxHeight: 400, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#f8fafc", position: "sticky", top: 0 }}>
                    {["PO Year","PO Number","Supplier","Item Description","Category","Unit Price","Qty Order","Qty Delivered","Total Amount","Delivery Status","Timeliness"].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "10px 12px", borderBottom: "2px solid #e2e8f0", color: "#475569", fontWeight: 700, whiteSpace: "nowrap" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 200).map((row, i) => {
                    const status    = row[COL.DELIVERY_STATUS] || "";
                    const timing    = row[COL.DELIVERY_TIME]   || "";
                    const statusClr = STATUS_COLORS[status] || "#9ca3af";
                    const timeClr   = TIME_COLORS[timing]   || "#9ca3af";
                    return (
                      <tr key={i} style={{ background: i % 2 === 0 ? "#fafafa" : "#fff", borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "8px 12px", whiteSpace: "nowrap", color: "#64748b" }}>{row[COL.SOURCE_TAB]}</td>
                        <td style={{ padding: "8px 12px", whiteSpace: "nowrap", color: "#64748b" }}>{row[COL.PO_NUMBER]}</td>
                        <td style={{ padding: "8px 12px", whiteSpace: "nowrap", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", textAlign: "left" }}>{row[COL.SUPPLIER]}</td>
                        <td style={{ padding: "8px 12px", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "left"}}>{row[COL.ITEM_DESCRIPTION]}</td>
                        <td style={{ padding: "8px 12px", whiteSpace: "nowrap", color: "#64748b" }}>{row[COL.CATEGORY] || "—"}</td>
                        <td style={{ padding: "8px 12px", whiteSpace: "nowrap", textAlign: "right" }}>{money(row[COL.PRICE])}</td>
                        <td style={{ padding: "8px 12px", whiteSpace: "nowrap", textAlign: "right" }}>{num(row[COL.QTY_ORDER])}</td>
                        <td style={{ padding: "8px 12px", whiteSpace: "nowrap", textAlign: "right" }}>{num(row[COL.QTY_DELIVERED])}</td>
                        <td style={{ padding: "8px 12px", whiteSpace: "nowrap", textAlign: "right", fontWeight: 600 }}>
                          {money(row[COL.TOTAL_AMOUNT])}
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
                  Showing 200 of {filtered.length.toLocaleString()} rows — use filters to narrow results.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
