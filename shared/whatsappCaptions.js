export const DEFAULT_REPORT_CAPTIONS = {
  courier: '🚚 *DOMEX · Courier Performance*\n━━━━━━━━━━━━━━━━\n🏢 *{branch} Branch*\n📅 *{date}*\n\n📊 The daily courier performance report is attached.\nPlease review delivery, resend and pickup totals.\n━━━━━━━━━━━━━━━━\n_DOMEX — We deliver islandwide._',
  operation: '🏢 *DOMEX · Branch Operations*\n━━━━━━━━━━━━━━━━\n📍 *{branch} Branch*\n📅 *{date}*\n\n📦 The daily inward, outward and achievement report is attached.\nPlease review the branch figures.\n━━━━━━━━━━━━━━━━\n_DOMEX — We deliver islandwide._',
  delivered: '✅ *DOMEX · Delivered Collection Report*\n━━━━━━━━━━━━━━━━\n🏢 *{branch} Branch*\n📅 *{date}*\n📄 *{title}*\n\nThe detailed collection report is attached. Please verify the parcel values and collection handover.\n━━━━━━━━━━━━━━━━\n_DOMEX — We deliver islandwide._',
  reschedule: '📋 *DOMEX · Reschedule Report*\n━━━━━━━━━━━━━━━━\n🏢 *{branch} Branch*\n📅 *{date}*\n\n🔄 The rescheduled parcel register is attached.\nPlease follow up on the listed parcels and delivery reasons.\n━━━━━━━━━━━━━━━━\n_DOMEX — We deliver islandwide._',
};
export function formatReportCaption(template, values = {}) {
  return String(template || '').replace(/\{(title|date|branch)\}/g, (_, key) => String(values[key] || '-'));
}
export function upgradeDefaultCaptions(templates = {}) {
  const legacy = {
    courier: 'Branch Courier Performance Report - {date}\nSent automatically from Daily Report System',
    operation: 'Operation Report - {date}\nSent automatically from Daily Report System',
    delivered: 'Delivered Collection Report - {date}\nSent automatically from Daily Report System',
    reschedule: 'Reschedule Report - {date}\nSent automatically from Daily Report System',
  };
  return Object.fromEntries(Object.entries({ ...DEFAULT_REPORT_CAPTIONS, ...templates }).map(([key, value]) => [key, value === legacy[key] ? DEFAULT_REPORT_CAPTIONS[key] : value]));
}
