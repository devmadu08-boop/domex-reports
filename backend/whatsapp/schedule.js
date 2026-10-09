export function getColomboClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Colombo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return { date: `${values.year}-${values.month}-${values.day}`, hour: Number(values.hour), minute: Number(values.minute) };
}
export function shouldRunDailyTask(now, scheduledHour, lastDate) {
  const clock = getColomboClock(now);
  return clock.hour >= scheduledHour && lastDate !== clock.date;
}
export function getRescheduleReadiness(config, now = new Date()) {
  const clock = getColomboClock(now);
  const rows = config.latestBackupSnapshot?.reports?.[clock.date]?.rescheduleRows || [];
  const groupCount = config.rescheduleDefaultGroupJids?.length || Number(Boolean(config.rescheduleDefaultGroupJid));
  const missing = [];
  if (!config.backupWhatsappNumber) missing.push('Save a Backup WhatsApp Number for approval.');
  if (!groupCount) missing.push('Select and save at least one Reschedule Report group.');
  if (!rows.length) missing.push(`No Reschedule rows are saved for ${clock.date}.`);
  return { date: clock.date, rowCount: rows.length, groupCount, ready: !missing.length, missing, scheduledTime: '20:00 Asia/Colombo', lastApprovalDate: config.lastRescheduleApprovalDate || '', status: config.pendingRescheduleApproval?.status || 'waiting' };
}
