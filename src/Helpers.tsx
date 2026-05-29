
export const fmt = (val, prefix = "") => {
  const n = Number(val);
  if (isNaN(n)) return "—";
  if (n >= 1_000_000) return `${prefix}${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${prefix}${(n / 1_000).toFixed(1)}K`;
  return `${prefix}${n.toLocaleString()}`;
};

export const pct = (num, den) => (den === 0 ? 0 : ((num / den) * 100).toFixed(1));

export const rateStatus = (rate) => {
  const n = Number(rate);
  if (n >= 80) return "Excellent";
  if (n >= 60) return "Good";
  if (n >= 40) return "Fair";
  return "Needs Attention";
};

// Convert "PO-22" → "2022", "PO-23" → "2023", etc.
export const parseYear = (sourceTab) => {
  if (!sourceTab) return sourceTab;
  const m = sourceTab.match(/PO-(\d{2})/i);
  if (m) return `20${m[1]}`;
  return sourceTab;
};