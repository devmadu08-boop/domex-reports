import { parseCsv, cleanRiderName } from './deliveredReconciliation.js';

const fieldKey = value => String(value || '').replace(/^\uFEFF/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
export function parsePerformanceDate(value) {
  const text = String(value || '').trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const dmy = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!iso && !dmy) return '';
  const year = Number(iso ? iso[1] : dmy[3]);
  const month = Number(iso ? iso[2] : dmy[2]);
  const day = Number(iso ? iso[3] : dmy[1]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '';
  return date.toISOString().slice(0, 10);
}
function countValue(value, rider, date) {
  const clean = String(value || '').trim().replaceAll(',', '');
  if (!clean || clean === '-') return 0;
  const count = Number(clean);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error(`Invalid delivery count for ${rider} on ${date}. Counts must be whole non-negative numbers.`);
  return count;
}
export function parseRiderPerformanceCsv(text) {
  const rows = parseCsv(String(text).replace(/^\uFEFF/, ''));
  const headerIndex = rows.findIndex(row => row.some(cell => fieldKey(cell) === 'ridername') && row.some(cell => parsePerformanceDate(cell)));
  if (headerIndex < 0) throw new Error('Upload a Rider Wise Delivery Count CSV with Rider Name and day-by-day date columns.');
  const header = rows[headerIndex];
  const invalidDate = header.find(cell => /^(?:\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{4}-\d{2}-\d{2})$/.test(cell.trim()) && !parsePerformanceDate(cell));
  if (invalidDate) throw new Error(`Invalid date column: ${invalidDate}.`);
  const riderIndex = header.findIndex(cell => fieldKey(cell) === 'ridername');
  const branchIndex = header.findIndex(cell => ['deliveredbranch', 'branch', 'branchname'].includes(fieldKey(cell)));
  const totalIndex = header.findIndex(cell => fieldKey(cell) === 'total');
  const columns = header.map((cell, index) => ({ date: parsePerformanceDate(cell), index })).filter(column => column.date);
  const dates = columns.map(column => column.date).sort();
  if (new Set(dates).size !== dates.length) throw new Error('The CSV contains duplicate date columns. Please export it again.');
  const warnings = [];
  const riders = [];
  const seen = new Set();
  rows.slice(headerIndex + 1).forEach(row => {
    const name = cleanRiderName(row[riderIndex]);
    if (!name || ['total', 'grandtotal', 'ridername'].includes(fieldKey(name))) return;
    const branch = branchIndex >= 0 ? String(row[branchIndex] || '').trim() : '';
    const key = `${branch.toUpperCase()}|${name.toUpperCase()}`;
    if (seen.has(key)) throw new Error(`Duplicate rider row: ${name}. Please upload a single report export.`);
    seen.add(key);
    const counts = Object.fromEntries(columns.map(({ date, index }) => [date, countValue(row[index], name, date)]));
    const sum = Object.values(counts).reduce((total, count) => total + count, 0);
    if (totalIndex >= 0 && String(row[totalIndex] || '').trim() && countValue(row[totalIndex], name, 'Total') !== sum) warnings.push(`${name}: the CSV Total differs from its daily counts. This report uses the daily-count sum.`);
    riders.push({ key, name, branch, counts });
  });
  if (!riders.length) throw new Error('No rider delivery rows were found in this CSV.');
  return { version: 1, dates, riders, warnings, start: dates[0], end: dates.at(-1) };
}
export function datesBetween(start, end) {
  if (!parsePerformanceDate(start) || !parsePerformanceDate(end) || start > end) throw new Error('Choose a valid start and end date.');
  const days = Math.round((new Date(end + 'T00:00:00Z') - new Date(start + 'T00:00:00Z')) / 86400000) + 1;
  if (days > 366) throw new Error('Select a period of one year or less.');
  return Array.from({ length: days }, (_, index) => new Date(new Date(start + 'T00:00:00Z').getTime() + index * 86400000).toISOString().slice(0, 10));
}
export function summarizeRiderPerformance(source, { start = source.start, end = source.end, branch = '' } = {}) {
  const reported = new Set(source.dates);
  const dates = datesBetween(start, end);
  const riders = source.riders.filter(rider => !branch || rider.branch === branch).map(rider => {
    const total = dates.reduce((sum, date) => sum + (rider.counts[date] || 0), 0);
    const activeDays = dates.filter(date => (rider.counts[date] || 0) > 0).length;
    return { ...rider, total, activeDays, average: activeDays ? total / activeDays : 0 };
  }).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  const daily = dates.map(date => ({ date, reported: reported.has(date), total: reported.has(date) ? riders.reduce((sum, rider) => sum + (rider.counts[date] || 0), 0) : null }));
  const total = riders.reduce((sum, rider) => sum + rider.total, 0);
  const deliveryDays = daily.filter(day => day.total > 0).length;
  return { start, end, branch, riders, daily, total, deliveryDays, average: deliveryDays ? total / deliveryDays : 0, periodDays: dates.length, missingDays: daily.filter(day => !day.reported).length };
}
export function buildPerformancePages(summary) {
  const pages = [];
  for (let riderStart = 0; riderStart < summary.riders.length; riderStart += 6) {
    for (let dayStart = 0; dayStart < summary.daily.length; dayStart += 31) {
      pages.push({ riders: summary.riders.slice(riderStart, riderStart + 6), daily: summary.daily.slice(dayStart, dayStart + 31), riderStart, dayStart });
    }
  }
  return pages;
}
export function performanceCaption(summary, branchName) {
  return `📊 *DOMEX · Rider Delivery Performance*\n━━━━━━━━━━━━━━━━\n🏢 *${branchName} Branch*\n📅 *${summary.start} → ${summary.end}*\n\n📦 Deliveries: *${summary.total.toLocaleString('en-US')}*\n🛵 Riders: *${summary.riders.length}*\n🗓️ Delivery days: *${summary.deliveryDays} / ${summary.periodDays}*\n📈 Daily average: *${summary.average.toFixed(1)}*\n\n_Based on Delivered Date. The detailed rider/day report is attached._\n_DOMEX — We deliver islandwide._`;
}
