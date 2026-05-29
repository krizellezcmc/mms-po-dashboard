
  // ── Styles ──────────────────────────────────────────────
export const pageStyle = {
    minHeight: "100vh",
    background: "#f1f5f9",
    fontFamily: "'Century Gothic', CenturyGothic, AppleGothic, sans-serif",
    padding: "24px 28px",
    color: "#111827",
  };

 export const gridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
    gap: 20,
    marginTop: 20,
  };

 export const filterBarStyle = {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    alignItems: "center",
    marginBottom: 20,
    marginTop: 10,
    background: "#fff",
    borderRadius: 10,
    padding: "12px 16px",
    boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
  };

export  const selectStyle = {
    padding: "6px 10px",
    borderRadius: 6,
    border: "1px solid #e5e7eb",
    fontSize: 13,
    background: "#f9fafb",
    color: "#374151",
    cursor: "pointer",
  };

export  const inputStyle = {
    ...selectStyle,
    padding: "6px 12px",
    minWidth: 220,
    outline: "none",
  };

 export const badgeStyle = (color) => ({
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 600,
    background: color + "22",
    color: color,
  });