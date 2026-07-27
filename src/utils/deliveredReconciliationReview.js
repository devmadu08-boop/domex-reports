import { normalizeTrackingNo } from "./deliveredReconciliation.js";

export const DELIVERY_EXCEPTION_REASONS = ["Missroute", "Return"];
export const EXTRA_RESCHEDULE_IGNORE_REASONS = ["Credit Card", "Temu Parcel"];

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
  const previousExtraRescheduled = new Map(
    (reconciliation.extraRescheduledParcels || []).map((item) => [normalizeTrackingNo(item.trackingNo), item]),
  );
  const extraRescheduledParcels = (reconciliation.extraRescheduled || []).map((trackingNo) => {
    const normalizedTrackingNo = normalizeTrackingNo(trackingNo);
    const previous = previousExtraRescheduled.get(normalizedTrackingNo);
    return {
      trackingNo: normalizedTrackingNo,
      reason: EXTRA_RESCHEDULE_IGNORE_REASONS.includes(previous?.reason) ? previous.reason : "",
      ignoredAt: EXTRA_RESCHEDULE_IGNORE_REASONS.includes(previous?.reason) ? previous.ignoredAt || "" : "",
    };
  });

  return {
    ...reconciliation,
    rescheduledParcels,
    missingParcels,
    extraRescheduledParcels,
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
      rescheduledReviewCount: 0,
      effectiveRescheduledCount: 0,
      unreviewedExtraRescheduled: [],
      ignoredExtraRescheduled: [],
      blockingDifferenceCount: 0,
    };
  }

  const extraRescheduledKeys = new Set(normalized.extraRescheduledParcels.map((item) => normalizeTrackingNo(item.trackingNo)));
  const reviewableRescheduled = normalized.rescheduledParcels.filter(
    (item) => !extraRescheduledKeys.has(normalizeTrackingNo(item.trackingNo)),
  );
  const unconfirmedRescheduled = reviewableRescheduled.filter((item) => !item.confirmed);
  const unclassifiedMissing = normalized.missingParcels.filter((item) => !DELIVERY_EXCEPTION_REASONS.includes(item.reason));
  const ignoredExtraRescheduled = normalized.extraRescheduledParcels.filter(
    (item) => EXTRA_RESCHEDULE_IGNORE_REASONS.includes(item.reason),
  );
  const unreviewedExtraRescheduled = normalized.extraRescheduledParcels.filter(
    (item) => !EXTRA_RESCHEDULE_IGNORE_REASONS.includes(item.reason),
  );
  const missrouteCount = normalized.missingParcels.filter((item) => item.reason === "Missroute").length;
  const returnCount = normalized.missingParcels.filter((item) => item.reason === "Return").length;
  const blockingDifferenceCount =
    (normalized.extraDelivered?.length || 0) +
    unreviewedExtraRescheduled.length +
    (normalized.deliveredAndRescheduled?.length || 0);

  return {
    ready: unconfirmedRescheduled.length === 0 && unclassifiedMissing.length === 0 && blockingDifferenceCount === 0,
    confirmedRescheduledCount: reviewableRescheduled.length - unconfirmedRescheduled.length,
    rescheduledReviewCount: reviewableRescheduled.length,
    effectiveRescheduledCount: Math.max(0, Number(normalized.rescheduledCount || 0) - normalized.extraRescheduledParcels.length),
    unconfirmedRescheduled,
    unclassifiedMissing,
    unreviewedExtraRescheduled,
    ignoredExtraRescheduled,
    missrouteCount,
    returnCount,
    blockingDifferenceCount,
  };
}
