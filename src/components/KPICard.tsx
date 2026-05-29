import type { ReactNode } from "react";

interface KPICardProps {
  title: string;
  value: ReactNode;
  sub?: string;
  color: string;
  icon?: ReactNode;
  progress?: number | null;
  status?: string | null;
}

export function KPICard({
  title,
  value,
  sub,
  color,
  icon = null,
  progress = null,
  status = null,
}: KPICardProps) {
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