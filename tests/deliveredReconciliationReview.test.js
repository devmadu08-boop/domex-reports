import assert from "node:assert/strict";
import test from "node:test";
import {
  getReconciliationReviewStatus,
  normalizeReconciliationReview,
} from "../src/utils/deliveredReconciliationReview.js";

function reconciliationWithExtra(reason = "") {
  return {
    rescheduledCount: 2,
    rescheduledTracking: ["OFD100", "EXTRA200"],
    rescheduledParcels: [
      { trackingNo: "OFD100", confirmed: true, confirmedAt: "2026-07-27T08:00:00.000Z" },
      { trackingNo: "EXTRA200", confirmed: false, confirmedAt: "" },
    ],
    extraRescheduled: ["EXTRA200"],
    extraRescheduledParcels: [
      { trackingNo: "EXTRA200", reason, ignoredAt: reason ? "2026-07-27T08:05:00.000Z" : "" },
    ],
    missingParcels: [],
    extraDelivered: [],
    deliveredAndRescheduled: [],
  };
}

test("non-OFD Rescheduled parcel blocks generation until reviewed", () => {
  const status = getReconciliationReviewStatus(reconciliationWithExtra());

  assert.equal(status.ready, false);
  assert.equal(status.unreviewedExtraRescheduled.length, 1);
  assert.equal(status.blockingDifferenceCount, 1);
  assert.equal(status.effectiveRescheduledCount, 1);
});

test("Credit Card and Temu Parcel reasons allow the non-OFD parcel to be ignored", () => {
  for (const reason of ["Credit Card", "Temu Parcel"]) {
    const status = getReconciliationReviewStatus(reconciliationWithExtra(reason));

    assert.equal(status.ready, true);
    assert.equal(status.ignoredExtraRescheduled.length, 1);
    assert.equal(status.unreviewedExtraRescheduled.length, 0);
    assert.equal(status.effectiveRescheduledCount, 1);
  }
});

test("unsupported ignore reasons are removed during normalization", () => {
  const normalized = normalizeReconciliationReview(reconciliationWithExtra("Other"));
  const status = getReconciliationReviewStatus(normalized);

  assert.equal(normalized.extraRescheduledParcels[0].reason, "");
  assert.equal(status.ready, false);
});
