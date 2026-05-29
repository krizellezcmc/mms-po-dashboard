export function CategoryPivotTable({ rows, sortCol, sortDir, onSort }: { rows: any[]; sortCol: string; sortDir: "asc" | "desc"; onSort: (col: string) => void }) {
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