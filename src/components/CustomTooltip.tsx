interface TooltipProps {
  active?: boolean;
  payload?: { name: string; value: number | string; color?: string }[];
  label?: string | number;
}

export const CustomTooltip = ({ active, payload, label }: TooltipProps) => {
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