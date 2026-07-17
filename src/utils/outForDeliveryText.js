export function findTrackingColumn(items) {
  const header = items.find((item) => normalizeLabel(item.text) === "tracking no");
  if (!header) return [];
  const routeHeader = items.find((item) => normalizeLabel(item.text) === "route" && Math.abs(item.y - header.y) < 3);
  const rightEdge = routeHeader?.x || header.x + 80;

  return items
    .filter((item) => item.y < header.y - 2 && item.x >= header.x - 3 && item.x < rightEdge - 3)
    .map((item) => normalizeTracking(item.text))
    .filter((value) => /^[A-Z0-9-]{5,24}$/.test(value));
}

export function findRiderName(items) {
  const label = items.find((item) => normalizeLabel(item.text) === "rider:");
  if (!label) return "";
  const value = items
    .filter((item) => item.x > label.x && Math.abs(item.y - label.y) < 3)
    .sort((a, b) => a.x - b.x)[0]?.text;
  return String(value || "").replace(/\s+\d{8,}\s*$/, "").trim();
}

function normalizeLabel(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeTracking(value) {
  return String(value || "").trim().replace(/\s+/g, "").toUpperCase();
}
