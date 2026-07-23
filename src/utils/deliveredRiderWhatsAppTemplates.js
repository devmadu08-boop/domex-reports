export const DELIVERED_RIDER_TEMPLATE_PRESETS = [
  "📦 *Daily Delivered Summary*\n📅 Date: *{date}*\n👤 Rider: *{rider}*\n🏢 Branch: *{branch}*\n\n🚚 Out for Delivery: *{outForDelivery}*\n✅ Delivered: *{delivered}*\n🔄 Rescheduled: *{reschedule}*\n⚠️ Missroute: *{missroute}*\n↩️ Return: *{return}*\n💰 Amount to hand over: *LKR {amount}*\n\n_Please check the attached report and hand over the collection to the branch._",
  "✅ *Delivery Duty Completed*\n\n👤 *{rider}* | 📅 *{date}*\n🏢 _{branch} Branch_\n\n📤 Out for Delivery: *{outForDelivery}*\n📦 Delivered: *{delivered}*\n🔁 Rescheduled: *{reschedule}*\n⚠️ Missroute: *{missroute}*\n↩️ Return: *{return}*\n💵 Branch collection: *LKR {amount}*\n\n_Thank you. Please confirm after handing over the collection._",
  "🚚 *Rider Daily Collection Report*\n━━━━━━━━━━━━━━\n📅 *{date}*\n👤 *{rider}*\n📍 *{branch}*\n━━━━━━━━━━━━━━\n▫️ Out for Delivery: *{outForDelivery}*\n▫️ Delivered: *{delivered}*\n▫️ Rescheduled: *{reschedule}*\n▫️ Missroute: *{missroute}*\n▫️ Return: *{return}*\n━━━━━━━━━━━━━━\n💰 *Amount due to branch: LKR {amount}*\n\n_Attached is your detailed delivered report._",
  "📊 *Today's Delivery Update*\n\nHello *{rider}*,\nYour summary for *{date}* is ready.\n\n🚛 OFD parcels: *{outForDelivery}*\n✅ Delivered parcels: *{delivered}*\n🗓️ Rescheduled parcels: *{reschedule}*\n⚠️ Missroute parcels: *{missroute}*\n↩️ Return parcels: *{return}*\n💳 Amount payable to *{branch} Branch*: *LKR {amount}*\n\n_Please review the attached report._",
  "🏢 *DOMEX {branch} - Rider Summary*\n📅 _{date}_\n\n👤 Rider: *{rider}*\n📦 Out for Delivery: *{outForDelivery}*\n☑️ Delivered: *{delivered}*\n🔄 Rescheduled: *{reschedule}*\n⚠️ Missroute: *{missroute}*\n↩️ Return: *{return}*\n\n💰 *Collection to be handed over*\n*LKR {amount}*\n\n_This message was generated automatically by the Daily Courier Report System._",
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
  missrouteCount,
  returnCount,
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
    missroute: numberValue(missrouteCount),
    return: numberValue(returnCount),
    amount: amount || "0.00",
  };
  const caption = Object.entries(values).reduce(
    (currentCaption, [key, value]) => currentCaption.replaceAll(`{${key}}`, String(value)),
    template,
  );
  const requiredReasonSummary = [
    template.includes("{missroute}") ? "" : `⚠️ Missroute: *${values.missroute}*`,
    template.includes("{return}") ? "" : `↩️ Return: *${values.return}*`,
  ].filter(Boolean);

  return requiredReasonSummary.length ? `${caption}\n\n${requiredReasonSummary.join("\n")}` : caption;
}

function normalizeName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}
