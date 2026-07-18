export const DELIVERED_RIDER_TEMPLATE_PRESETS = [
  "📦 *Daily Delivered Summary*\n📅 Date: *{date}*\n👤 Rider: *{rider}*\n🏢 Branch: *{branch}*\n\n🚚 Out for Delivery: *{outForDelivery}*\n✅ Delivered: *{delivered}*\n🔄 Rescheduled: *{reschedule}*\n💰 Amount to hand over: *LKR {amount}*\n\n_Please check the attached report and hand over the collection to the branch._",
  "✅ *Delivery Duty Completed*\n\n👤 *{rider}* | 📅 *{date}*\n🏢 _{branch} Branch_\n\n📤 Out for Delivery: *{outForDelivery}*\n📦 Delivered: *{delivered}*\n🔁 Rescheduled: *{reschedule}*\n💵 Branch collection: *LKR {amount}*\n\n_Thank you. Please confirm after handing over the collection._",
  "🚚 *Rider Daily Collection Report*\n━━━━━━━━━━━━━━\n📅 *{date}*\n👤 *{rider}*\n📍 *{branch}*\n━━━━━━━━━━━━━━\n▫️ Out for Delivery: *{outForDelivery}*\n▫️ Delivered: *{delivered}*\n▫️ Rescheduled: *{reschedule}*\n━━━━━━━━━━━━━━\n💰 *Amount due to branch: LKR {amount}*\n\n_Attached is your detailed delivered report._",
  "📊 *Today's Delivery Update*\n\nHello *{rider}*,\nYour summary for *{date}* is ready.\n\n🚛 OFD parcels: *{outForDelivery}*\n✅ Delivered parcels: *{delivered}*\n🗓️ Rescheduled parcels: *{reschedule}*\n💳 Amount payable to *{branch} Branch*: *LKR {amount}*\n\n_Please review the attached report._",
  "🏢 *DOMEX {branch} - Rider Summary*\n📅 _{date}_\n\n👤 Rider: *{rider}*\n📦 Out for Delivery: *{outForDelivery}*\n☑️ Delivered: *{delivered}*\n🔄 Rescheduled: *{reschedule}*\n\n💰 *Collection to be handed over*\n*LKR {amount}*\n\n_This message was generated automatically by the Daily Courier Report System._",
];

export const DEFAULT_DELIVERED_RIDER_TEMPLATE = DELIVERED_RIDER_TEMPLATE_PRESETS[0];

export function findDeliveredRiderTemplate(templates, riderName) {
  const entries = Object.entries(templates || {});
  const exact = entries.find(([name]) => name === riderName);
  if (exact) return exact[1];

  const normalizedRider = normalizeName(riderName);
  return entries.find(([name]) => normalizeName(name) === normalizedRider)?.[1] || "";
}

export function buildDeliveredRiderWhatsAppCaption({
  settings,
  riderName,
  reportDate,
  branchName,
  outForDeliveryCount,
  deliveredCount,
  rescheduleCount,
  amount,
}) {
  const riderTemplate = findDeliveredRiderTemplate(settings?.deliveredRiderCaptionTemplates, riderName);
  const template = riderTemplate || settings?.deliveredRiderDefaultCaptionTemplate || DEFAULT_DELIVERED_RIDER_TEMPLATE;
  const values = {
    date: reportDate || "-",
    rider: riderName || "-",
    branch: branchName || settings?.branchName || "-",
    outForDelivery: numberValue(outForDeliveryCount),
    delivered: numberValue(deliveredCount),
    reschedule: numberValue(rescheduleCount),
    amount: amount || "0.00",
  };

  return Object.entries(values).reduce(
    (caption, [key, value]) => caption.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

function normalizeName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}
