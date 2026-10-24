export const COURIER_COUNT_FIELDS = ["onRouteCount", "deliveryCount", "resendCount", "pickupCount"];
export const courierNameKey = (value) => String(value || "").trim().replace(/\s+/g, " ").toLowerCase();

export function courierCount(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

export function previousReportDate(date) {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10);
}

export function getCourierCompletion(snapshot, date) {
  const savedRows = snapshot?.reports?.[date]?.courierRows;
  const rows = (Array.isArray(savedRows) ? savedRows : []).filter((row) => courierNameKey(row?.courierName));
  const names = [...new Set((Array.isArray(snapshot?.courierNames) ? snapshot.courierNames : []).map(courierNameKey).filter(Boolean))];
  const requiredCount = Math.max(4, names.length);
  const occurrences = new Map();
  for (const row of rows) {
    const key = courierNameKey(row.courierName);
    occurrences.set(key, [...(occurrences.get(key) || []), row]);
  }
  const completed = [...occurrences].filter(([, entries]) => entries.length === 1
    && COURIER_COUNT_FIELDS.every((field) => courierCount(entries[0][field]) !== null)).map(([key]) => key);
  const missingNames = names.filter((name) => !completed.includes(name));
  return {
    rowCount: rows.length, completedCount: completed.length, requiredCount, missingNames,
    complete: completed.length >= requiredCount && !missingNames.length && [...occurrences.values()].every((entries) => entries.length === 1),
  };
}

export function buildCourierSummary(snapshot, date) {
  const parsedDate = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
    throw new Error("Choose a valid courier report date.");
  }
  const normalize = (rows) => (Array.isArray(rows) ? rows : []).filter((row) => courierNameKey(row?.courierName)).map((row) => {
    const counts = Object.fromEntries(COURIER_COUNT_FIELDS.map((field) => [field, courierCount(row[field])]));
    return { courierName: String(row.courierName).trim(), ...counts,
      deliveryPercent: counts.onRouteCount > 0 && counts.deliveryCount !== null ? counts.deliveryCount / counts.onRouteCount * 100 : 0 };
  });
  const totals = (rows) => {
    const result = Object.fromEntries(COURIER_COUNT_FIELDS.map((field) => [field, rows.reduce((sum, row) => sum + (row[field] || 0), 0)]));
    return { ...result, pending: Math.max(0, result.onRouteCount - result.deliveryCount - result.resendCount),
      deliveryPercent: result.onRouteCount ? result.deliveryCount / result.onRouteCount * 100 : 0 };
  };
  const rows = normalize(snapshot?.reports?.[date]?.courierRows);
  if (!rows.length) throw new Error(`No saved courier rows are available for ${date}.`);
  const previousDate = previousReportDate(date);
  const previousRows = normalize(snapshot?.reports?.[previousDate]?.courierRows);
  return { date, branchName: String(snapshot?.settings?.branchName || "Branch").trim(),
    companyName: String(snapshot?.settings?.companyName || "Domestic Express (pvt) ltd"),
    rows, totals: totals(rows), previousDate, previousTotals: previousRows.length ? totals(previousRows) : null,
    completion: getCourierCompletion(snapshot, date) };
}
