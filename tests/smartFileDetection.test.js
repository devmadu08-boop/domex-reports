import assert from "node:assert/strict";
import test from "node:test";
import { detectRiderReportCsvType } from "../src/utils/deliveredReconciliation.js";

test("detects Delivered CSV from report columns", () => {
  const csv = "Tracking No,Value,Rider Name,Delivered Date,Delivered Branch\nAA100,500,Rider One,07/27/2026,Middeniya";
  assert.equal(detectRiderReportCsvType(csv), "delivered");
});

test("detects Reschedule CSV before considering optional Value columns", () => {
  const csv = "Tracking No,Value,Rider Name,Reason,Created Date\nAA100,0,Rider One,Customer request,07/27/2026";
  assert.equal(detectRiderReportCsvType(csv), "reschedule");
});

test("rejects unrelated CSV files", () => {
  assert.equal(detectRiderReportCsvType("Name,Amount\nTest,100"), "unknown");
});
