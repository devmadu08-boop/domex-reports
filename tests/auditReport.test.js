import test from "node:test";
import assert from "node:assert/strict";
import { calculateAuditReport, createEmptyAuditReport, normalizeAuditReport } from "../src/utils/auditReport.js";

test("audit workbook totals and A-B differences follow the source formula layout", () => {
  const report = createEmptyAuditReport("2026-07-31", "Middeniya");
  Object.assign(report.statuses.outstanding, { codBills: 13, codAmount: 16350, ecomBills: 91, ecomAmount: 286587 });
  Object.assign(report.statuses.scanBranchToday, { codBills: 4, codAmount: 5050, ecomBills: 38, ecomAmount: 115575 });
  Object.assign(report.statuses.onRouteToday, { codBills: 7, codAmount: 4000, ecomBills: 43, ecomAmount: 132272 });
  Object.assign(report.statuses.pending, { codBills: 1, codAmount: 4300, ecomBills: 3, ecomAmount: 6340 });
  Object.assign(report.statuses.otherBranch, { codBills: 1, codAmount: 3000, ecomBills: 7, ecomAmount: 32400 });

  const result = calculateAuditReport(report);
  assert.deepEqual(result.totalA, {
    cashBills: 0, cashAmount: 0, codBills: 13, codAmount: 16350, ecomBills: 91, ecomAmount: 286587,
  });
  assert.deepEqual(result.totalB, result.totalA);
  assert.deepEqual(result.difference, {
    cashBills: 0, cashAmount: 0, codBills: 0, codAmount: 0, ecomBills: 0, ecomAmount: 0,
  });
});

test("denominations, vouchers, IOU, and float balancing are calculated automatically", () => {
  const report = createEmptyAuditReport("2026-07-31", "Middeniya");
  Object.assign(report.cashInHandDenominations, { 1000: 6, 500: 4, 100: 31, 50: 5, 20: 4, 1: 62 });
  report.pendingPettyCash = [{ id: "p1", voucher: "PV-01", amount: 23808.56 }];
  report.inHandVouchers = [{ id: "v1", voucher: "VH-01", amount: 1000 }];
  report.ious = [{ id: "i1", date: "2026-07-31", name: "Staff", reason: "Advance", amount: 500 }];
  report.pettyCashFloat = 25000;

  const result = calculateAuditReport(report);
  assert.equal(result.cashInHandTotal, 11492);
  assert.equal(result.pendingPettyCashTotal, 23808.56);
  assert.equal(result.inHandVoucherTotal, 1000);
  assert.equal(result.iouTotal, 500);
  assert.equal(result.balancingTotal, 36800.56);
  assert.equal(result.floatDifference, -11800.56);
});

test("older audit saves normalize safely with all workbook rows", () => {
  const normalized = normalizeAuditReport({ statuses: { pending: { codBills: 2 } } }, "2026-08-13", "Middeniya");
  assert.equal(normalized.statuses.pending.codBills, 2);
  assert.equal(normalized.statuses.pending.codAmount, 0);
  assert.equal(normalized.statuses.otherBranch.ecomBills, 0);
  assert.equal(normalized.pettyCashFloat, 25000);
});
