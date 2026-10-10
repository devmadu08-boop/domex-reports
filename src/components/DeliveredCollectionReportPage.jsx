import { Barcode, CalendarDays, Check, Coins, FileText, Globe, MapPin, PackageCheck, PieChart, ShieldCheck, Truck, UserRound } from 'lucide-react';

const amount = value => { const n = Number(String(value || 0).replaceAll(',', '')); return Number.isFinite(n) ? n : 0; };
const money = value => amount(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const special = tracking => /^CS(?:40|80)\d{7}$/i.test(String(tracking).trim());
export default function DeliveredCollectionReportPage({ reportRef, reportDate, riderName, branchName, companyName, entries, startIndex, totalValue, includeSpecialTracking, pageNumber, pageCount, isFinalPage, outForDeliveryCount, deliveredCount, previewMode }) {
  const branch = String(branchName || 'Branch').trim();
  const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'long' }).format(new Date(reportDate + 'T12:00:00'));
  const percent = outForDeliveryCount > 0 ? (deliveredCount / outForDeliveryCount * 100).toFixed(2) : '0.00';
  const subtotal = entries.reduce((sum, entry) => sum + (!includeSpecialTracking && special(entry.trackingNo) ? 0 : amount(entry.value)), 0);
  const rows = Array.from({ length: 20 }, (_, index) => entries[index] || null);
  return (
    <article ref={reportRef} className={`delivered-document ${previewMode === 'monochrome' ? 'delivered-monochrome' : ''}`}>
      <header className="dc-banner">
        <div className="dc-logo-panel"><img src="/report-assets/domex-logo.png" alt="DOMEX — We deliver islandwide" /><small>{companyName}</small></div>
        <div className="dc-banner-branch"><MapPin size={34} /><span><strong>{branch.toUpperCase()} BRANCH</strong><small>Reliable Delivery. Every Time.</small></span></div>
      </header>
      <div className="dc-heading"><span>Domex {branch} Branch</span><h2><em>DELIVERED</em> COLLECTION REPORT</h2><p>Daily delivery collections summary for your branch operations.</p><img className="dc-watermark" src="/report-assets/domex-logo.png" alt="" /></div>
      <div className="dc-meta">
        <div className="dc-meta-card dc-date"><span className="dc-meta-icon"><CalendarDays size={25} /></span><div><small>DATE</small><strong>{reportDate}</strong><span>{weekday}</span></div></div>
        <div className="dc-meta-card dc-page"><span className="dc-meta-icon"><FileText size={25} /></span><div><small>PAGE</small><strong>{pageNumber} / {pageCount}</strong></div></div>
        <div className="dc-meta-card dc-rider"><span className="dc-meta-icon"><UserRound size={25} /></span><div><small>RIDER NAME</small><strong>{riderName || '—'}</strong></div></div>
      </div>
      <div className="dc-metrics">
        <div className="dc-stat dc-ofd"><span><PackageCheck size={28} /></span><div><small>Total OFD</small><strong>{outForDeliveryCount}</strong></div></div>
        <div className="dc-stat dc-delivered"><span><Check size={30} /></span><div><small>Delivered</small><strong>{deliveredCount}</strong></div></div>
        <div className="dc-stat dc-percent"><span><PieChart size={28} /></span><div><small>Percentage</small><strong>{percent}%</strong></div></div>
      </div>
      <table className="dc-table"><colgroup><col style={{width:'70px'}} /><col /><col style={{width:'188px'}} /></colgroup><thead><tr><th>No</th><th><Barcode size={20} />Tracking No</th><th><Coins size={20} />Value (LKR)</th></tr></thead><tbody>{rows.map((entry,index) => <tr key={index} className={entry && special(entry.trackingNo) && !includeSpecialTracking ? 'dc-excluded' : ''} data-empty={!entry}><td><span className="dc-row-number">{String(startIndex + index + 1).padStart(2,'0')}</span></td><td>{entry?.trackingNo || ''}</td><td>{entry ? money(entry.value) : ''}</td></tr>)}</tbody><tfoot><tr><td colSpan={2}><strong>{isFinalPage ? 'Total Value (All Pages)' : 'Page Subtotal'}</strong>{!includeSpecialTracking ? <small>CS40/CS80 excluded</small> : null}</td><td><strong>{money(isFinalPage ? totalValue : subtotal)}</strong></td></tr></tfoot></table>
      <div className="dc-signatures">{isFinalPage ? <><p><span>ලබාදුන් මුදල :</span><i /></p><div><p><i /><span>මුදල් ලබා දුන් බවට අත්සන</span></p><p><i /><span>මුදල් ලබාගත් බවට අත්සන</span></p></div></> : <p className="dc-continued">Continued on next page. Collection total covers all {pageCount} pages.</p>}</div>
      <footer className="dc-footer"><div className="dc-footer-total"><PackageCheck size={32} /><span><small>TOTAL COLLECTION VALUE</small><strong>{money(totalValue)} <em>LKR</em></strong></span></div><div className="dc-manager"><img src="/report-assets/branch-manager-signature.png" alt="Branch Manager signature" /><strong>Branch Manager</strong><small>Domex {branch} Branch</small></div><span className="dc-seal">DOMEX<small>COURIER SERVICE</small></span><em className="dc-promise">Delivering a<br />Better Tomorrow</em></footer>
      <div className="dc-bottom"><span><MapPin size={14} />{branch}, Sri Lanka</span><span><Globe size={14} />www.domex.lk</span><span><Truck size={14} />Fast</span><span><ShieldCheck size={14} />Secure</span><span><PackageCheck size={14} />Reliable</span></div>
    </article>
  );
}
