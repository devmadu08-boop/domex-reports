import { normalizeTrackingNo } from "./deliveredReconciliation.js";

export const DELIVERY_EXCEPTION_REASONS = ["Missroute", "Return"];

export function normalizeReconciliationReview(reconciliation) {
  if (!reconciliation) return null;

  const previousRescheduled = new Map(
    (reconciliation.rescheduledParcels || []).map((item) => [normalizeTrackingNo(item.trackingNo), item]),
  );
  const rescheduledParcels = (reconciliation.rescheduledTracking || []).map((trackingNo) => {
    const normalizedTrackingNo = normalizeTrackingNo(trackingNo);
    const previous = previousRescheduled.get(normalizedTrackingNo);
    return {
      trackingNo: normalizedTrackingNo,
      confirmed: Boolean(previous?.confirmed),
      confirmedAt: previous?.confirmedAt || "",
    };
  });
  const missingParcels = (reconciliation.missingParcels || []).map((item) => ({
    ...item,
    reason: DELIVERY_EXCEPTION_REASONS.includes(item.reason) ? item.reason : "",
  }));

  return {
    ...reconciliation,
    rescheduledParcels,
    missingParcels,
  };
}

export function getReconciliationReviewStatus(reconciliation) {
  const normalized = normalizeReconciliationReview(reconciliation);
  if (!normalized) {
    return {
      ready: false,
      confirmedRescheduledCount: 0,
      unconfirmedRescheduled: [],
      unclassifiedMissing: [],
      missrouteCount: 0,
      returnCount: 0,
      blockingDifferenceCount: 0,
    };
  }

  const unconfirmedRescheduled = normalized.rescheduledParcels.filter((item) => !item.confirmed);
  const unclassifiedMissing = normalized.missingParcels.filter((item) => !DELIVERY_EXCEPTION_REASONS.includes(item.reason));
  const missrouteCount = normalized.missingParcels.filter((item) => item.reason === "Missroute").length;
  const returnCount = normalized.missingParcels.filter((item) => item.reason === "Return").length;
  const blockingDifferenceCount =
    (normalized.extraDelivered?.length || 0) +
    (normalized.extraRescheduled?.length || 0) +
    (normalized.deliveredAndRescheduled?.length || 0);

  return {
    ready: unconfirmedRescheduled.length === 0 && unclassifiedMissing.length === 0 && blockingDifferenceCount === 0,
    confirmedRescheduledCount: normalized.rescheduledParcels.length - unconfirmedRescheduled.length,
    unconfirmedRescheduled,
    unclassifiedMissing,
    missrouteCount,
    returnCount,
    blockingDifferenceCount,
  };
}
