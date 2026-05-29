// ─────────────────────────────────────────────────────────────
// DATA SOURCE — your Google Sheet (shared publicly as Viewer)
// ─────────────────────────────────────────────────────────────
export const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1IL3iFJojbMksjMXN-0aiZXxMJ76P_aTmVq5XGG4n9iw/gviz/tq?tqx=out:csv";

// Column indices (0-based) — matched to your sheet's header row
export const COL = {
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