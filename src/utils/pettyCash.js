import { parseCsv } from "./deliveredReconciliation.js";

const REQUIRED_HEADERS = ["Reference No", "Payment Date", "Branch Name", "Payment Type Desc", "Memo", "Value"];

const clean = (value) => String(value ?? "").trim();
const money = (value) => {
  const parsed = Number(clean(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

export function parsePettyCashCsv(text) {
  const rows = parseCsv(String(text || "").replace(/^\uFEFF/, ""));
  const headerIndex = rows.findIndex((row) => REQUIRED_HEADERS.every((header) => row.includes(header)));
  if (headerIndex < 0) throw new Error("This is not a supported Petty Cash CSV. Export Voucher Request History and try again.");

  const metadata = Object.fromEntries(rows.slice(0, headerIndex).filter((row) => row.length >= 2 && clean(row[0])).map((row) => [clean(row[0]), clean(row[1])]));
  const headers = rows[headerIndex];
  const index = Object.fromEntries(headers.map((header, column) => [clean(header), column]));
  const get = (row, name) => clean(row[index[name]]);
  const entries = rows.slice(headerIndex + 1)
    .filter((row) => get(row, "Reference No") || get(row, "Id"))
    .map((row) => ({
      id: crypto.randomUUID(), sourceId: get(row, "Id"), status: get(row, "Status"), referenceNo: get(row, "Reference No"),
      paymentDate: normalizePettyCashDate(get(row, "Payment Date")), branchName: get(row, "Branch Name"),
      paymentType: get(row, "Payment Type Desc"), paymentFor: get(row, "Payment For"), cashReportNo: get(row, "Cash Report No"),
      vehicleNo: get(row, "Vehicle No"), fromKms: get(row, "From KMs"), toKms: get(row, "To KMs"), totalKms: get(row, "KMs"),
      employeeName: get(row, "Employee Name"), ofdReportNo: get(row, "OFD Report No"), memo: get(row, "Memo"), note: get(row, "Note"),
      value: money(get(row, "Value")),
    }));
  if (!entries.length) throw new Error("The Petty Cash CSV does not contain voucher rows.");
  return { entries, branchName: entries.find((entry) => entry.branchName)?.branchName || "", sourceTitle: metadata.Title || "Voucher Request History", sourceTimestamp: metadata.TimeStamp || "" };
}

export function normalizeVehicleNumber(value) {
  return clean(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function applyPettyCashEmployeeMappings(entries, mappings = []) {
  const employeeByVehicle = new Map(
    (Array.isArray(mappings) ? mappings : [])
      .map((item) => [normalizeVehicleNumber(item?.vehicleNo), clean(item?.employeeName)])
      .filter(([vehicleNo, employeeName]) => vehicleNo && employeeName),
  );

  return (Array.isArray(entries) ? entries : []).map((entry) => {
    const employeeName = employeeByVehicle.get(normalizeVehicleNumber(entry?.vehicleNo));
    return employeeName ? { ...entry, employeeName } : entry;
  });
}

export function getPettyCashVoucherKey(entry) {
  return clean(entry?.sourceId || entry?.referenceNo).toUpperCase();
}

export function mergePettyCashFloatEntries(importedEntries, savedEntries = [], importedAt = new Date().toISOString()) {
  const savedByKey = new Map(
    (Array.isArray(savedEntries) ? savedEntries : [])
      .map((entry) => [getPettyCashVoucherKey(entry), entry])
      .filter(([key]) => key),
  );

  return (Array.isArray(importedEntries) ? importedEntries : []).map((entry) => {
    const saved = savedByKey.get(getPettyCashVoucherKey(entry));
    return {
      ...entry,
      floatStatus: saved?.floatStatus === "passed" ? "passed" : "pending",
      pendingSince: saved?.pendingSince || entry.paymentDate || importedAt.slice(0, 10),
      passedAt: saved?.floatStatus === "passed" ? saved.passedAt || importedAt : "",
    };
  });
}

export function getPettyCashPendingAgeDays(entry, now = new Date()) {
  if (entry?.floatStatus === "passed") return 0;
  const source = entry?.pendingSince || entry?.paymentDate || entry?.importedAt;
  if (!source) return 0;
  const start = new Date(`${String(source).slice(0, 10)}T00:00:00`);
  const end = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return 0;
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86_400_000));
}

export function calculatePettyCashFloat(entries, floatAmount) {
  const rows = Array.isArray(entries) ? entries : [];
  const pending = rows.filter((entry) => entry.floatStatus !== "passed");
  const passed = rows.filter((entry) => entry.floatStatus === "passed");
  const sum = (items) => Number(items.reduce((total, entry) => total + (Number(entry.value) || 0), 0).toFixed(2));
  const pendingTotal = sum(pending);
  const passedTotal = sum(passed);
  return {
    pendingCount: pending.length,
    passedCount: passed.length,
    pendingTotal,
    passedTotal,
    cashInHand: Number(((Number(floatAmount) || 0) - pendingTotal).toFixed(2)),
  };
}

export function paginatePettyCashEntries(entries, rowsPerPage = 20) {
  const rows = Array.isArray(entries) ? entries : [];
  if (!rows.length) return [[]];
  const pages = [];
  for (let index = 0; index < rows.length; index += rowsPerPage) pages.push(rows.slice(index, index + rowsPerPage));
  return pages;
}

export function getPettyCashPageLayout(rowCount) {
  const count = Math.max(Number(rowCount) || 0, 1);
  return {
    rowHeight: Math.max(20, Math.min(104, Math.floor(420 / count))),
    fontSize: count <= 4 ? 13 : count <= 8 ? 11 : count <= 12 ? 9.5 : count <= 16 ? 8.5 : 7.5,
  };
}

export function normalizePettyCashDate(value) {
  const text = clean(value);
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return slash ? `${slash[3]}-${slash[1].padStart(2, "0")}-${slash[2].padStart(2, "0")}` : text;
}

export function formatPettyCashDate(value) {
  const match = clean(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : clean(value);
}

const ONES = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
function underThousand(value) {
  const number = Math.floor(value);
  if (number < 20) return ONES[number];
  if (number < 100) return `${TENS[Math.floor(number / 10)]}${number % 10 ? ` ${ONES[number % 10]}` : ""}`;
  return `${ONES[Math.floor(number / 100)]} Hundred${number % 100 ? ` and ${underThousand(number % 100)}` : ""}`;
}
export function amountToWords(value) {
  const amount = Math.max(0, Number(value) || 0); let remaining = Math.floor(amount); const words = [];
  [[10_000_000, "Crore"], [100_000, "Lakh"], [1_000, "Thousand"]].forEach(([size, label]) => {
    if (remaining >= size) { words.push(`${underThousand(Math.floor(remaining / size))} ${label}`); remaining %= size; }
  });
  if (remaining || !words.length) words.push(underThousand(remaining));
  const cents = Math.round((amount - Math.floor(amount)) * 100);
  return `Sri Lankan Rupees ${words.join(" ")}${cents ? ` and Cents ${underThousand(cents)}` : ""} Only`;
}

export function emptyPettyCashEntry(branchName = "") {
  return { id: crypto.randomUUID(), sourceId: "", status: "Pending", floatStatus: "pending", pendingSince: "", passedAt: "", referenceNo: "", paymentDate: "", branchName, paymentType: "", paymentFor: "", cashReportNo: "", vehicleNo: "", fromKms: "", toKms: "", totalKms: "", employeeName: "", ofdReportNo: "", memo: "", note: "", value: 0 };
}
