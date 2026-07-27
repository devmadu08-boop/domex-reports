export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows.map((items) => items.map((item) => item.trim()));
}

export function normalizeTrackingNo(value) {
  return String(value || "").trim().replace(/\s+/g, "").toUpperCase();
}

export function normalizeRiderName(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .toUpperCase()
    .replace(/\b\d{8,}[VX]?\b/g, " ")
    .replace(/[^A-Z0-9]+/g, "");
}

export function cleanRiderName(value) {
  return String(value || "").replaceAll("_", " ").replace(/\s+/g, " ").trim();
}

export function parseDeliveredCsv(text) {
  const rows = parseCsv(text);
  const metadata = {};
  let headerIndex = -1;

  rows.forEach((row, index) => {
    if (row.includes("Tracking No") && row.includes("Value") && row.includes("Rider Name")) headerIndex = index;
    if (row.length >= 2 && headerIndex === -1) metadata[row[0]] = row[1];
  });

  if (headerIndex === -1) throw new Error("Delivered CSV does not contain Tracking No, Value, and Rider Name columns.");

  const header = rows[headerIndex].map((item) => item.trim());
  const trackingIndex = header.indexOf("Tracking No");
  const valueIndex = header.indexOf("Value");
  const riderIndex = header.indexOf("Rider Name");
  const branchIndex = header.indexOf("Delivered Branch");
  const dateIndex = header.indexOf("Delivered Date");
  const dataRows = rows.slice(headerIndex + 1).filter((row) => row.length > 1 && normalizeTrackingNo(row[trackingIndex]));
  const riderNames = uniqueValues(dataRows.map((row) => cleanRiderName(row[riderIndex])));

  if (!dataRows.length) throw new Error("Delivered CSV has no tracking rows.");
  if (riderNames.length !== 1) throw new Error("Delivered CSV must contain exactly one rider.");

  const entries = uniqueByTracking(
    dataRows.map((row) => ({
      trackingNo: normalizeTrackingNo(row[trackingIndex]),
      value: normalizeMoney(row[valueIndex] || "0"),
    })),
  );
  const branches = uniqueValues(dataRows.map((row) => row[branchIndex]?.trim()));

  return {
    entries,
    trackingNumbers: entries.map((entry) => entry.trackingNo),
    riderName: riderNames[0],
    branchName: branches.length === 1 ? branches[0] : metadata.CompanyName || "",
    reportDate: parseCsvDate(dataRows[0]?.[dateIndex] || metadata.TimeStamp),
  };
}

export function parseRescheduleCsv(text, selectedRiderName) {
  const rows = parseCsv(text);
  const headerIndex = rows.findIndex((row) => row.includes("Tracking No") && row.includes("Rider Name"));
  if (headerIndex === -1) throw new Error("Reschedule CSV does not contain Tracking No and Rider Name columns.");

  const header = rows[headerIndex].map((item) => item.trim());
  const trackingIndex = header.indexOf("Tracking No");
  const riderIndex = header.indexOf("Rider Name");
  const reasonIndex = header.indexOf("Reason");
  const dateIndex = header.indexOf("Created Date");
  const selectedKey = normalizeRiderName(selectedRiderName);
  const allRows = rows
    .slice(headerIndex + 1)
    .filter((row) => row.length > 1 && normalizeTrackingNo(row[trackingIndex]))
    .map((row) => ({
      trackingNo: normalizeTrackingNo(row[trackingIndex]),
      riderName: cleanRiderName(row[riderIndex]),
      reason: reasonIndex >= 0 ? String(row[reasonIndex] || "").trim() : "",
      reportDate: parseCsvDate(row[dateIndex]),
    }));
  const riderRows = uniqueByTracking(allRows.filter((row) => normalizeRiderName(row.riderName) === selectedKey));

  if (!allRows.length) throw new Error("Reschedule CSV has no tracking rows.");

  return {
    trackingNumbers: riderRows.map((row) => row.trackingNo),
    riderRows,
    allRiderNames: uniqueValues(allRows.map((row) => row.riderName)),
    reportDate: riderRows[0]?.reportDate || "",
  };
}

export function detectRiderReportCsvType(text) {
  const rows = parseCsv(text);
  const header = rows.find((row) => row.includes("Tracking No") && row.includes("Rider Name"));
  if (!header) return "unknown";
  if (header.includes("Reason") || header.includes("Created Date")) return "reschedule";
  if (header.includes("Value") || header.includes("Delivered Date") || header.includes("Delivered Branch")) return "delivered";
  return "reschedule";
}

export function reconcileDeliveredTracking({ outForDeliveryTracking = [], deliveredTracking = [], rescheduledTracking = [] }) {
  const outMap = trackingMap(outForDeliveryTracking);
  const deliveredMap = trackingMap(deliveredTracking);
  const rescheduledMap = trackingMap(rescheduledTracking);
  const resolvedKeys = new Set([...deliveredMap.keys(), ...rescheduledMap.keys()]);

  const missing = [...outMap].filter(([key]) => !resolvedKeys.has(key)).map(([, value]) => value);
  const extraDelivered = [...deliveredMap].filter(([key]) => !outMap.has(key)).map(([, value]) => value);
  const extraRescheduled = [...rescheduledMap].filter(([key]) => !outMap.has(key)).map(([, value]) => value);
  const deliveredAndRescheduled = [...deliveredMap]
    .filter(([key]) => rescheduledMap.has(key))
    .map(([, value]) => value);

  return {
    outForDeliveryCount: outMap.size,
    deliveredCount: deliveredMap.size,
    rescheduledCount: rescheduledMap.size,
    accountedCount: [...outMap.keys()].filter((key) => resolvedKeys.has(key)).length,
    missing,
    extraDelivered,
    extraRescheduled,
    deliveredAndRescheduled,
    balanced: missing.length === 0 && extraDelivered.length === 0 && extraRescheduled.length === 0 && deliveredAndRescheduled.length === 0,
  };
}

export function parseCsvDate(value) {
  if (!value) return "";
  const match = String(value).match(/^(\d{2})\/(\d{2})\/(\d{4})|^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "";
  if (match[1]) return `${match[3]}-${match[1]}-${match[2]}`;
  return `${match[4]}-${match[5]}-${match[6]}`;
}

function trackingMap(values) {
  const map = new Map();
  values.forEach((item) => {
    const value = typeof item === "string" ? item : item?.trackingNo;
    const key = normalizeTrackingNo(value);
    if (key && !map.has(key)) map.set(key, key);
  });
  return map;
}

function uniqueByTracking(values) {
  const seen = new Set();
  return values.filter((item) => {
    const key = normalizeTrackingNo(item.trackingNo);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function parseMoney(value) {
  const parsed = parseFloat(String(value || "0").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeMoney(value) {
  return parseMoney(value).toFixed(2);
}
