export const ils = (n: number, digits = 2) =>
  `₪${(n ?? 0).toLocaleString("he-IL", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

export const ilsShort = (n: number) => `₪${Math.round(n ?? 0).toLocaleString("he-IL")}`;

export const CATEGORY_LABELS: Record<string, string> = {
  fresh: "טרי", protein: "חלבון ובשר", pantry: "יבש ומזווה",
  snacks: "חטיפים ושתייה", extra: "נלווים ובית",
};

export const CATEGORY_COLORS: Record<string, string> = {
  fresh: "#10B981", protein: "#F59E0B", pantry: "#6366F1",
  snacks: "#EC4899", extra: "#64748B",
};

export const SUBSTITUTE_LABELS: Record<string, string> = {
  brand_alternative: "מותג חלופי באותו מחיר",
  size_upgrade: "גודל גדול יותר",
  do_not_replace: "אל תחליף כלל",
};

export const packLabel = (size: number, unit: string) => {
  if (unit === "g") return size >= 1000 ? `${size / 1000} ק"ג` : `${size} גרם`;
  if (unit === "ml") return size >= 1000 ? `${size / 1000} ליטר` : `${size} מ"ל`;
  if (unit === "unit") return `${size} יח'`;
  return `${size} ${unit}`;
};
