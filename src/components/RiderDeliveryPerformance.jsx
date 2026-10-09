import { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, CalendarDays, Download, FileDown, Image, Send, Upload, Users, PackageCheck } from 'lucide-react';
import { addDataChangeListener, getAllReports, getReportByDate, saveReportType } from '../services/reportStorage.js';
import { getCurrentWhatsAppAccountKey, getWhatsAppStatus, sendReportToWhatsApp } from '../services/whatsappApi.js';
import { captureElementAsPngDataUrl, exportElementsAsLandscapePdf, exportElementsAsPng } from '../utils/exportReports.js';
import { buildPerformancePages, parseRiderPerformanceCsv, performanceCaption, summarizeRiderPerformance } from '../utils/riderPerformance.js';
import { displayDate } from '../utils/date.js';

const colors = ['#319e26', '#0095eb', '#f58b00', '#9251ee', '#ef428d', '#147987'];
function savedReports() {
  return getAllReports().flatMap(day => Object.entries(day.riderDeliveryPerformance || {}).map(([id, data]) => ({ id: `${day.date}|${id}`, ...data }))).filter(item => Array.isArray(item.source?.riders) && Array.isArray(item.source?.dates)).sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''));
}
export default function RiderDeliveryPerformance({ branchName }) {
  const [history, setHistory] = useState(savedReports);
  const [source, setSource] = useState(null);
  const [fileName, setFileName] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [branch, setBranch] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [customCaption, setCustomCaption] = useState('');
  const [savedSelection, setSavedSelection] = useState('');
  const [destination, setDestination] = useState(null);
  const pageRefs = useRef([]);
  const fileInput = useRef(null);

  useEffect(() => addDataChangeListener(() => setHistory(savedReports())), []);
  useEffect(() => {
    let cancelled = false;
    const refresh = () => getWhatsAppStatus().then(value => { if (!cancelled) setDestination(value); }).catch(() => {});
    refresh();
    const timer = window.setInterval(refresh, 30000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);
  useEffect(() => { const latest = savedReports()[0]; if (latest) loadSaved(latest.id); }, []);
  const branches = source ? [...new Set(source.riders.map(rider => rider.branch))].sort() : [];
  const months = source ? [...new Set(source.dates.map(date => date.slice(0, 7)))] : [];
  const { summary, error } = useMemo(() => {
    if (!source) return {};
    try { return { summary: summarizeRiderPerformance(source, { start, end, branch }) }; }
    catch (error) { return { error: error.message }; }
  }, [source, start, end, branch]);
  const pages = summary ? buildPerformancePages(summary) : [];
  const reportBranch = branch || (branches.length === 1 ? branches[0] : 'All imported branches') || branchName;
  const caption = summary ? performanceCaption(summary, reportBranch) : '';

  async function upload(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true); setStatus('Reading CSV…');
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('Upload a CSV smaller than 10 MB.');
      const bytes = await file.arrayBuffer();
      const prefix = new Uint8Array(bytes);
      const text = new TextDecoder(prefix[0] === 255 && prefix[1] === 254 ? 'utf-16le' : 'utf-8').decode(bytes);
      const parsed = parseRiderPerformanceCsv(text);
      const availableBranches = [...new Set(parsed.riders.map(rider => rider.branch))];
      const own = availableBranches.find(value => value.toLowerCase() === String(branchName).toLowerCase());
      setSource(parsed); setStart(parsed.start); setEnd(parsed.end); setBranch(own || (availableBranches.length === 1 ? availableBranches[0] : ''));
      setFileName(file.name); setCustomCaption(''); setSavedSelection('');
      setStatus(`Imported ${parsed.riders.length} riders across ${parsed.dates.length} date columns. Counts use Delivered Date.`);
    } catch (error) { setStatus(error.message || 'Could not read this CSV.'); }
    finally { setBusy(false); }
  }
  const selectedPreset = source && start === source.start && end === source.end ? '' : months.find(month => { const [year, m] = month.split('-').map(Number); return start === month + '-01' && end === month + '-' + String(new Date(Date.UTC(year, m, 0)).getUTCDate()).padStart(2, '0'); }) || 'custom';
  function chooseMonth(value) {
    if (value === 'custom') return;
    setCustomCaption('');
    if (!value) { setStart(source.start); setEnd(source.end); return; }
    const [year, month] = value.split('-').map(Number);
    setStart(value + '-01');
    setEnd(`${value}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, '0')}`);
  }
  function loadSaved(id) {
    setSavedSelection(id);
    const saved = history.find(item => item.id === id);
    if (!saved) return;
    setSource(saved.source); setStart(saved.start); setEnd(saved.end); setBranch(saved.branch || '');
    setFileName(saved.fileName || 'Saved report'); setCustomCaption(saved.customCaption || ''); setStatus('Saved rider performance loaded.');
  }
  function save() {
    if (!summary || !summary.riders.length) return;
    const id = `${start}_${end}_${branch || 'all'}`;
    const existing = getReportByDate(end).riderDeliveryPerformance || {};
    try { saveReportType(end, 'riderDeliveryPerformance', { ...existing, [id]: { source, start, end, branch, fileName, customCaption, savedAt: new Date().toISOString() } });
    setStatus('Rider performance saved for this branch. Existing courier and delivered reports are preserved.'); } catch (error) { setStatus(error.message || 'Could not save this report.'); }
  }
  async function run(action) {
    setBusy(true); setStatus('Preparing report pages…');
    try { await action(pageRefs.current.filter(Boolean)); }
    catch (error) { setStatus(error.message || 'Could not prepare the report.'); }
    finally { setBusy(false); }
  }
  function exportReport(type) {
    return run(async elements => {
      const result = type === 'png'
        ? await exportElementsAsPng(elements, 'Rider_Delivery_Performance', `${start}_${end}`)
        : await exportElementsAsLandscapePdf(elements, 'Rider_Delivery_Performance', `${start}_${end}`);
      setStatus(`${type.toUpperCase()} downloaded: ${result.pageCount} report page(s).`);
    });
  }
  function send() {
    const accountKey = getCurrentWhatsAppAccountKey();
    return run(async elements => {
      const configured = await getWhatsAppStatus(accountKey);
      setDestination(configured);
      if (!(configured.defaultGroupJids?.length || configured.defaultGroupJid)) throw new Error("Choose and save a Default Report Group in Settings → Report WhatsApp before sending this report.");
      const imageDataUrls = [];
      for (const element of elements) imageDataUrls.push(await captureElementAsPngDataUrl(element));
      const result = await sendReportToWhatsApp({ imageDataUrls, caption: customCaption || caption, accountKey });
      setStatus(result.queued ? 'Report saved to your WhatsApp Outbox. It will send to this account’s configured default report group(s).' : 'Report sent to the default report group(s).');
    });
  }

  return (
    <section className="rider-performance-workspace">
      <div className="rpp-upload-panel">
        <span className="rpp-feature-icon"><BarChart3 size={27} /></span>
        <div><h2>Rider Delivery Performance</h2><p>Turn a rider-wise delivery-count CSV into a branded daily performance report.</p></div>
        <button type="button" className="domex-primary-button" disabled={busy} onClick={() => fileInput.current.click()}><Upload size={17} />Upload CSV</button>
        <input ref={fileInput} type="file" accept=".csv,text/csv" aria-label="Upload rider performance CSV" onChange={upload} hidden />
      </div>
      <label className="rpp-saved-select">Saved branch reports<select aria-label="Saved rider performance reports" value={savedSelection} onChange={event => loadSaved(event.target.value)}><option value="">Choose a saved report</option>{history.map(item => <option key={item.id} value={item.id}>{item.start} → {item.end} · {item.branch || 'All branches'} · {item.fileName}</option>)}</select></label>
      {source ? <>
        <div className="rpp-controls">
          <label>CSV branch<select aria-label="Performance branch" value={branch} onChange={event => { setBranch(event.target.value); setCustomCaption(''); }}><option value="">All imported branches</option>{branches.map(value => <option key={value} value={value}>{value || 'Branch not specified'}</option>)}</select></label>
          <label>Quick period<select aria-label="Performance month" value={selectedPreset} onChange={event => chooseMonth(event.target.value)}><option value="">Full CSV period</option><option value="custom">Custom date range</option>{months.map(value => <option key={value} value={value}>{new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(value + '-01T00:00:00Z'))}</option>)}</select></label>
          <label>From<input type="date" aria-label="Performance start date" value={start} onChange={event => { setStart(event.target.value); setCustomCaption(''); }} /></label>
          <label>To<input type="date" aria-label="Performance end date" value={end} onChange={event => { setEnd(event.target.value); setCustomCaption(''); }} /></label>
        </div>
        <div className="rpp-actions"><button type="button" disabled={busy || !summary?.riders.length} onClick={save}><Download size={16} />Save report</button><button type="button" disabled={busy || !pages.length} onClick={() => exportReport('png')}><Image size={16} />Export PNG</button><button type="button" disabled={busy || !pages.length} onClick={() => exportReport('pdf')}><FileDown size={16} />Export A4 PDF</button><button type="button" disabled={busy || !pages.length} onClick={send}><Send size={16} />Send to Default Group</button></div>
        <p className="rpp-file-note">{destination ? ((destination.defaultGroupJids?.length || destination.defaultGroupJid) ? `Default destinations: ${destination.defaultGroupJids?.length || 1} group(s). ${destination.connected ? "WhatsApp connected." : "WhatsApp offline; sends will stay in the Outbox until it reconnects."}` : "No default report group saved. Configure it in Settings → Report WhatsApp before sending.") : "Checking this account’s default report group…"}</p>
        <p className="rpp-file-note">{fileName} · {pages.length} report page(s) · Up to 6 riders and 31 dates per page. Sending uses the default report groups saved in Report WhatsApp settings.</p>
        {summary ? <details className="rpp-caption"><summary>WhatsApp message</summary><textarea aria-label="Performance WhatsApp caption" rows={10} value={customCaption || caption} onChange={event => setCustomCaption(event.target.value)} /></details> : null}
      </> : <div className="rpp-empty"><Upload size={36} /><h3>Upload your rider-wise delivery CSV</h3><p>The file should include Rider Name, Delivered Branch and date columns such as 01/09/2026. Dates in this export are read as day/month/year.</p></div>}
      {status ? <p role="status" className="rpp-status">{status}</p> : null}
      {error ? <p role="alert" className="rpp-error">{error}</p> : null}
      {source?.warnings?.map(warning => <p key={warning} className="rpp-error">{warning}</p>)}
      {summary ? <div className="rpp-preview">{pages.map((page, index) => <PerformanceReportPage key={`${index}-${start}-${end}-${branch}`} page={page} summary={summary} branchName={reportBranch} pageNumber={index + 1} pageCount={pages.length} reportRef={node => { pageRefs.current[index] = node; }} />)}</div> : null}
    </section>
  );
}

function PerformanceReportPage({ page, summary, branchName, pageNumber, pageCount, reportRef }) {
  const midpoint = Math.ceil(page.daily.length / 2);
  const dailyHalves = [page.daily.slice(0, midpoint), page.daily.slice(midpoint)];
  const max = Math.ceil(Math.max(4, ...page.riders.map(rider => rider.total)) / 4) * 4;
  const shownTotal = page.riders.reduce((sum, rider) => sum + rider.total, 0);
  const oneMonth = summary.start.slice(0, 7) === summary.end.slice(0, 7);
  const period = oneMonth ? new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(summary.start + 'T00:00:00Z')) : `${displayDate(summary.start)} – ${displayDate(summary.end)}`;
  const metrics = [
    { label: 'Total Deliveries', value: summary.total.toLocaleString('en-US'), icon: PackageCheck, tone: 'red' },
    { label: 'Total Riders', value: summary.riders.length, icon: Users, tone: 'blue' },
    { label: 'Period', value: `${displayDate(summary.start)} – ${displayDate(summary.end)}`, icon: CalendarDays, tone: 'gold' },
    { label: 'Delivery Days', value: summary.deliveryDays, helper: `out of ${summary.periodDays} days`, icon: CalendarDays, tone: 'red' },
    { label: 'Daily Average', value: summary.average.toFixed(1), helper: 'per delivery day', icon: BarChart3, tone: 'purple' },
  ];
  return (
    <article ref={reportRef} className="rider-performance-paper">
      <header className="rpp-report-header"><img src="/report-assets/domex-logo.png" alt="DOMEX — We deliver islandwide" /><div><h1>{branchName.toUpperCase()} BRANCH</h1><h2><span>RIDER WISE DAY BY DAY</span><br />DELIVERY COUNT</h2><p><CalendarDays size={22} />{period}<span>Based on Delivered Date</span></p></div></header>
      <div className="rpp-metrics">{metrics.map(({ label, value, helper, icon: Icon, tone }) => <div key={label} className={`rpp-metric rpp-${tone}`}><span className="rpp-metric-icon"><Icon size={35} /></span><div><small>{label}</small><strong className={label === 'Period' ? 'rpp-period-value' : ''}>{value}</strong>{helper ? <em>{helper}</em> : null}</div></div>)}</div>
      <div className="rpp-summary-grid">
        <section><ReportTitle title={`Rider wise ${oneMonth ? 'monthly' : 'period'} totals`} /><table className="rpp-totals-table"><thead><tr><th>#</th><th>Rider Name</th><th>Total<br />Deliveries</th><th>Active<br />Days</th><th>Average<br />Per Active Day</th></tr></thead><tbody>{page.riders.map((rider, index) => <tr key={rider.key}><td><span className="rpp-rank" style={{ backgroundColor: colors[index] }}>{page.riderStart + index + 1}</span></td><td>{rider.name}</td><td style={{ backgroundColor: `${colors[index]}45` }}><strong>{rider.total.toLocaleString('en-US')}</strong></td><td>{rider.activeDays}</td><td>{rider.average.toFixed(1)}</td></tr>)}</tbody><tfoot><tr><th colSpan={2}>{summary.riders.length > 6 ? 'Shown rider subtotal' : 'TOTAL'}</th><th>{shownTotal.toLocaleString('en-US')}</th><th>—</th><th>—</th></tr></tfoot></table></section>
        <section><ReportTitle title="Rider wise delivery count" /><div className="rpp-chart" role="img" aria-label={page.riders.map(rider => `${rider.name}: ${rider.total}`).join(', ')}><div className="rpp-chart-scale">{[1, .75, .5, .25, 0].map(value => <span key={value}>{Math.round(max * value).toLocaleString('en-US')}</span>)}</div><div className="rpp-chart-plot"><div className="rpp-chart-lines">{[0,1,2,3,4].map(value => <i key={value} />)}</div>{page.riders.map((rider,index) => <div key={rider.key} className="rpp-chart-column"><div className="rpp-bar-area"><div className="rpp-bar" style={{ height: `${rider.total / max * 100}%`, background: colors[index] }}><strong>{rider.total}</strong></div></div><small>{rider.name}</small></div>)}</div></div></section>
      </div>
      <section className="rpp-daily-section"><ReportTitle title={`Day by day delivery count${pageCount > 1 ? ` · ${displayDate(page.daily[0].date)} – ${displayDate(page.daily.at(-1).date)}` : ''}`} /><div className="rpp-daily-tables">{dailyHalves.map((days,index) => days.length ? <DailyTable key={index} days={days} riders={page.riders} showTotal={index === 1 || !dailyHalves[1].length} totalDays={page.daily} totalLabel={summary.daily.length > 31 ? "Page Total" : "TOTAL"} /> : null)}</div></section>
      <footer className="rpp-insights"><strong>☀ Key Insights</strong><div><p>Total deliveries: <b>{summary.total.toLocaleString('en-US')}</b> · Riders: <b>{summary.riders.length}</b> · Delivery days: <b>{summary.deliveryDays} / {summary.periodDays}</b> · Daily average: <b>{summary.average.toFixed(1)}</b></p><p>Counts are based on Delivered Date. Active days count dates with at least one delivery; no holiday assumptions.</p>{summary.missingDays ? <p>{summary.missingDays} dates were not included in the CSV. “—” means not provided; “0” means reported with no deliveries.</p> : null}{pageCount > 1 ? <p>Page {pageNumber} / {pageCount}. Overall metrics cover the full period; tables and chart show the riders on this page.</p> : null}</div></footer>
    </article>
  );
}
function ReportTitle({ title }) { return <h3 className="rpp-section-title"><CalendarDays size={22} />{title}</h3>; }
function DailyTable({ days, riders, showTotal, totalDays, totalLabel }) {
  const subtotal = riders.map(rider => (totalDays || days).reduce((sum, day) => sum + (day.reported ? rider.counts[day.date] || 0 : 0), 0));
  return <table className="rpp-daily-table"><thead><tr><th>Date</th>{riders.map((rider,index) => <th key={rider.key} style={{ backgroundColor: colors[index] }}>{rider.name}</th>)}<th>Daily Total</th></tr></thead><tbody>{days.map(day => <tr key={day.date}><td>{new Intl.DateTimeFormat('en-GB', { month:'short',day:'2-digit',timeZone:'UTC' }).format(new Date(day.date + 'T00:00:00Z'))}</td>{riders.map(rider => <td key={rider.key}>{day.reported ? rider.counts[day.date] || 0 : '—'}</td>)}<td><strong>{day.reported ? riders.reduce((sum,rider) => sum + (rider.counts[day.date] || 0),0) : '—'}</strong></td></tr>)}</tbody>{showTotal ? <tfoot><tr><th>{totalLabel}</th>{subtotal.map((count,index) => <th key={index} style={{ backgroundColor: `${colors[index]}30` }}>{count}</th>)}<th>{subtotal.reduce((sum,count) => sum + count,0).toLocaleString("en-US")}</th></tr></tfoot> : null}</table>;
}
