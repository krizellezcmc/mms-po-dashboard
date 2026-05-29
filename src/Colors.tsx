
export const COLORS = {
  primary: "#6366f1",
  success: "#10b981",
  warning: "#f59e0b",
  danger: "#ef4444",
  info: "#3b82f6",
  purple: "#8b5cf6",
  teal: "#14b8a6",
  orange: "#f97316",
};

export const STATUS_COLORS: Record<string, string> = {
  Delivered: COLORS.success,
  "Incomplete Delivery": COLORS.warning,
  Undelivered: COLORS.danger,
};

export const TIME_COLORS: Record<string, string> = {
  "Early/On-Time": COLORS.success,
  Late: COLORS.warning,
  Overdue: COLORS.danger,
  Cancelled: "#9ca3af",
}; 

export const CATEGORY_COLORS = [
  COLORS.primary,
  COLORS.teal,
  COLORS.warning,
  COLORS.orange,
  COLORS.purple,
  COLORS.info,
];