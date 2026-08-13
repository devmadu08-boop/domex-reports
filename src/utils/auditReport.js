const OUTSTANDING_A_KEYS = ["outstanding", "notEntered"];
const OUTSTANDING_B_KEYS = ["scanBranchToday", "onRouteToday", "staffOutstanding", "notReceived", "temporaryCredit", "creditClient", "pending", "manual", "otherBranch"];

export const AUDIT_STATUS_ROWS = [
  ["outstanding", "Outstanding", "A"],
  ["notEntered", "Not Entered", "A"],
  ["scanBranchToday", "Scan Branch Today", "B"],
  ["onRouteToday", "On Route Today", "B"],
  ["staffOutstanding", "Staff Outstanding", "B"],
  ["notReceived", "Not Received", "B"],
  ["temporaryCredit", "Temporary Credit (TR)", "B"],
  ["creditClient", "Credit Client", "B"],
  ["pending", "Pending", "B"],
  ["manual", "Manual", "B"],
  ["otherBranch", "Other Branch", "B"],
];

export const AUDIT_DENOMINATIONS = [5000, 2000, 1000, 500, 100, 50, 20, 10, 5, 2, 1];
export const AUDIT_METRICS = ["cashBills", "cashAmount", "codBills", "codAmount", "ecomBills", "ecomAmount"];

const number = (value) => Number(value) || 0;
const money = (value) => Math.round((number(value) + Number.EPSILON) * 100) / 100;
const emptyStatus = () => Object.fromEntries(AUDIT_METRICS.map((key) => [key, 0]));
const emptyDenominations = () => Object.fromEntries(AUDIT_DENOMINATIONS.map((value) => [value, 0]));

export function createEmptyAuditReport(date = "", branchName = "Middeniya") {
  return {
    date,
    branchName,
    statuses: Object.fromEntries(AUDIT_STATUS_ROWS.map(([key]) => [key, emptyStatus()])),
    pettyCashOutstanding: 0,
    exShort: 0,
    salesCashDenominations: emptyDenominations(),
    salesCashCoins: 0,
    pendingPettyCash: [],
    cashInHandDenominations: emptyDenominations(),
    cashInHandCoins: 0,
    inHandVouchers: [],
    ious: [],
    pettyCashFloat: 25000,
    note: "",
    branchHead: "",
  };
}

export function normalizeAuditReport(value, date = "", branchName = "Middeniya") {
  const base = createEmptyAuditReport(date, branchName);
  const source = value && typeof value === "object" ? value : {};
  return {
    ...base,
    ...source,
    date: source.date || date,
    branchName: source.branchName || branchName,
    statuses: Object.fromEntries(AUDIT_STATUS_ROWS.map(([key]) => [key, { ...emptyStatus(), ...(source.statuses?.[key] || {}) }])),
    salesCashDenominations: { ...base.salesCashDenominations, ...(source.salesCashDenominations || {}) },
    cashInHandDenominations: { ...base.cashInHandDenominations, ...(source.cashInHandDenominations || {}) },
    pendingPettyCash: Array.isArray(source.pendingPettyCash) ? source.pendingPettyCash : [],
    inHandVouchers: Array.isArray(source.inHandVouchers) ? source.inHandVouchers : [],
    ious: Array.isArray(source.ious) ? source.ious : [],
  };
}

function sumStatuses(statuses, keys) {
  return Object.fromEntries(AUDIT_METRICS.map((metric) => [metric, keys.reduce((sum, key) => sum + number(statuses?.[key]?.[metric]), 0)]));
}

function sumList(rows, field = "amount") {
  return (Array.isArray(rows) ? rows : []).reduce((sum, row) => sum + number(row?.[field]), 0);
}

function denominationTotal(denominations, coins) {
  return AUDIT_DENOMINATIONS.reduce((sum, value) => sum + value * number(denominations?.[value]), 0) + number(coins);
}

export function calculateAuditReport(report) {
  const normalized = normalizeAuditReport(report, report?.date, report?.branchName);
  const totalA = sumStatuses(normalized.statuses, OUTSTANDING_A_KEYS);
  const totalB = sumStatuses(normalized.statuses, OUTSTANDING_B_KEYS);
  const difference = Object.fromEntries(AUDIT_METRICS.map((metric) => [metric, number(totalA[metric]) - number(totalB[metric])]));
  const outstandingAmounts = {
    cash: difference.cashAmount,
    cod: difference.codAmount,
    ecom: difference.ecomAmount,
  };
  outstandingAmounts.total = outstandingAmounts.cash + outstandingAmounts.cod + outstandingAmounts.ecom;

  const salesCashTotal = denominationTotal(normalized.salesCashDenominations, normalized.salesCashCoins);
  const cashInHandTotal = denominationTotal(normalized.cashInHandDenominations, normalized.cashInHandCoins);
  const pendingPettyCashTotal = sumList(normalized.pendingPettyCash);
  const inHandVoucherTotal = sumList(normalized.inHandVouchers);
  const iouTotal = sumList(normalized.ious);
  const cashUsedForPettyCash = money(number(normalized.pettyCashOutstanding) + salesCashTotal + number(normalized.exShort));
  const balancingTotal = money(pendingPettyCashTotal + inHandVoucherTotal + iouTotal + cashInHandTotal);

  return {
    totalA,
    totalB,
    difference,
    outstandingAmounts,
    salesCashTotal,
    cashInHandTotal,
    pendingPettyCashTotal,
    inHandVoucherTotal,
    iouTotal,
    cashUsedForPettyCash,
    balancingTotal,
    floatDifference: money(number(normalized.pettyCashFloat) - balancingTotal),
  };
}

export function createAuditListRow(type) {
  const id = crypto.randomUUID();
  if (type === "iou") return { id, date: "", name: "", reason: "", amount: 0 };
  return { id, voucher: "", amount: 0 };
}
