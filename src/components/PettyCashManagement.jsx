import { Download, FileDown, Pencil, Plus, Save, Trash2, Upload, WalletCards, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { deleteReportType, getReportByDate, saveReportType } from "../services/reportStorage.js";
import { exportElementsAsLandscapePdf, exportElementsAsPng } from "../utils/exportReports.js";
import { amountToWords, emptyPettyCashEntry, formatPettyCashDate, parsePettyCashCsv } from "../utils/pettyCash.js";

const ROWS_PER_PAGE = 14;
const currency = (value) => Number(value || 0).toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PettyCashManagement({ selectedDate, branchName = "Middeniya", companyName = "Domestic Express (pvt) ltd" }) {
  const [entries, setEntries] = useState([]);
  const [reportBranch, setReportBranch] = useState(branchName);
  const [preparedBy, setPreparedBy] = useState("");
  const [authorizedBy, setAuthorizedBy] = useState("");
  const [editing, setEditing] = useState(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const pageRefs = useRef([]);

  useEffect(() => {
    const saved = getReportByDate(selectedDate).pettyCash;
    setEntries(Array.isArray(saved?.entries) ? saved.entries : []);
    setReportBranch(saved?.branchName || branchName || "Middeniya");
    setPreparedBy(saved?.preparedBy || ""); setAuthorizedBy(saved?.authorizedBy || ""); setEditing(null);
    setMessage(saved?.entries?.length ? "Saved Petty Cash report loaded." : "Upload the Voucher Request History CSV to begin.");
  }, [selectedDate, branchName]);

  const total = useMemo(() => entries.reduce((sum, entry) => sum + (Number(entry.value) || 0), 0), [entries]);
  const pages = useMemo(() => {
    if (!entries.length) return [[]]; const chunks = [];
    for (let index = 0; index < entries.length; index += ROWS_PER_PAGE) chunks.push(entries.slice(index, index + ROWS_PER_PAGE));
    return chunks;
  }, [entries]);

  async function handleFile(file) {
    if (!file) return; setBusy(true);
    try {
      const parsed = parsePettyCashCsv(await file.text()); setEntries(parsed.entries); setReportBranch(parsed.branchName || branchName || "Middeniya");
      setMessage(`${parsed.entries.length} voucher row${parsed.entries.length === 1 ? "" : "s"} imported successfully.`);
    } catch (error) { setMessage(error.message || "Petty Cash CSV import failed."); } finally { setBusy(false); }
  }

  function saveReport() {
    if (!entries.length) return setMessage("Upload or add at least one petty cash row before saving.");
    saveReportType(selectedDate, "pettyCash", { entries, branchName: reportBranch, preparedBy, authorizedBy, total, updatedAt: new Date().toISOString() });
    setMessage("Petty Cash report saved successfully.");
  }
  function deleteSavedReport() {
    if (!window.confirm(`Delete the saved Petty Cash report for ${selectedDate}?`)) return;
    deleteReportType(selectedDate, "pettyCash"); setEntries([]); setEditing(null); setMessage("Saved Petty Cash report deleted.");
  }
  function saveEntry(event) {
    event.preventDefault();
    if (!editing.referenceNo && !editing.paymentType) return setMessage("Reference No or Payment Type is required.");
    const next = { ...editing, value: Number(editing.value) || 0 };
    setEntries((current) => current.some((entry) => entry.id === next.id) ? current.map((entry) => entry.id === next.id ? next : entry) : [...current, next]);
    setEditing(null); setMessage("Petty cash row updated. Press Save Report to store it.");
  }
  async function runExport(type) {
    if (!entries.length) return setMessage("There are no petty cash rows to export."); setBusy(true);
    try {
      const elements = pageRefs.current.slice(0, pages.length).filter(Boolean);
      const result = type === "pdf" ? await exportElementsAsLandscapePdf(elements, "Petty_Cash_Summary", selectedDate) : await exportElementsAsPng(elements, "Petty_Cash_Summary", selectedDate);
      setMessage(`${type.toUpperCase()} exported successfully${result?.pageCount > 1 ? ` as ${result.pageCount} A4 pages` : ""}.`);
    } catch (error) { setMessage(error.message || "Petty Cash export failed."); } finally { setBusy(false); }
  }

  return <section className="petty-cash-section grid min-w-0 gap-5">
    <div className="glass-panel petty-cash-workspace p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-100 text-emerald-700 shadow-inner"><WalletCards className="h-6 w-6" /></span><div><h2 className="text-xl font-black text-[#101233]">Petty Cash Management</h2><p className="text-sm font-semibold text-[#6f6597]">Import vouchers, review details, and create the official A4 landscape summary.</p></div></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => setEditing(emptyPettyCashEntry(reportBranch))} className="petty-action petty-action-neutral"><Plus className="h-4 w-4" /> Add Row</button><button type="button" onClick={saveReport} className="petty-action petty-action-green"><Save className="h-4 w-4" /> Save Report</button><button type="button" onClick={deleteSavedReport} className="petty-action petty-action-red"><Trash2 className="h-4 w-4" /> Delete Saved</button></div></div>
      <label className="petty-cash-upload mt-5 cursor-pointer"><Upload className="h-8 w-8 text-violet-600" /><span className="font-black text-[#101233]">Upload Petty Cash CSV</span><span className="text-sm font-semibold text-[#6f6597]">Select the Voucher Request History CSV exported from DOMEX.</span><input type="file" accept=".csv,text/csv" className="sr-only" disabled={busy} onChange={(event) => handleFile(event.target.files?.[0])} /></label>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="petty-field"><span>Branch</span><input value={reportBranch} onChange={(event) => setReportBranch(event.target.value)} /></label><label className="petty-field"><span>Prepared By</span><input value={preparedBy} onChange={(event) => setPreparedBy(event.target.value)} placeholder="Name / signature" /></label><label className="petty-field"><span>Authorized By</span><input value={authorizedBy} onChange={(event) => setAuthorizedBy(event.target.value)} placeholder="Name / signature" /></label><div className="petty-total-card"><span>Full Total</span><strong>LKR {currency(total)}</strong></div></div>
      {message ? <p className="mt-4 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm font-bold text-violet-900">{message}</p> : null}
      <div className="mt-5 overflow-x-auto rounded-2xl border border-[#e6dcf2] bg-white"><table className="petty-edit-table min-w-[1180px]"><thead><tr><th>No</th><th>Reference</th><th>Date</th><th>Payment Type / For</th><th>Vehicle</th><th>KMs</th><th>Employee</th><th>OFD</th><th>Memo / Note</th><th>Value</th><th>Actions</th></tr></thead><tbody>{entries.map((entry, index) => <tr key={entry.id}><td>{index + 1}</td><td>{entry.referenceNo || "-"}</td><td>{formatPettyCashDate(entry.paymentDate)}</td><td><strong>{entry.paymentType || "-"}</strong><small>{entry.paymentFor || ""}</small></td><td>{entry.vehicleNo || "-"}</td><td>{entry.fromKms || "-"} to {entry.toKms || "-"}<small>Total: {entry.totalKms || "0"}</small></td><td>{entry.employeeName || "-"}</td><td>{entry.ofdReportNo || "-"}</td><td>{entry.memo || "-"}<small>{entry.note || ""}</small></td><td className="text-right font-black">{currency(entry.value)}</td><td><div className="flex justify-center gap-1"><button type="button" title="Edit row" onClick={() => setEditing({ ...entry })} className="petty-icon-button text-blue-600"><Pencil className="h-4 w-4" /></button><button type="button" title="Delete row" onClick={() => setEntries((current) => current.filter((item) => item.id !== entry.id))} className="petty-icon-button text-red-600"><Trash2 className="h-4 w-4" /></button></div></td></tr>)}{!entries.length ? <tr><td colSpan="11" className="py-10 text-center font-bold text-[#8b7bb5]">No petty cash vouchers imported.</td></tr> : null}</tbody></table></div>
      <div className="mt-5 flex flex-wrap gap-3"><button type="button" disabled={busy || !entries.length} onClick={() => runExport("png")} className="petty-action petty-action-blue disabled:opacity-50"><Download className="h-5 w-5" /> Export A4 PNG</button><button type="button" disabled={busy || !entries.length} onClick={() => runExport("pdf")} className="petty-action petty-action-red disabled:opacity-50"><FileDown className="h-5 w-5" /> Export A4 PDF</button><span className="self-center text-sm font-bold text-[#6f6597]">{entries.length} vouchers | {pages.length} A4 page{pages.length === 1 ? "" : "s"}</span></div>
    </div>
    {editing ? <PettyCashEditor entry={editing} setEntry={setEditing} onSubmit={saveEntry} onClose={() => setEditing(null)} /> : null}
    <div className="petty-cash-preview grid gap-5 overflow-x-auto rounded-3xl border border-[#eadff2] bg-[#dcd7e4] p-3 shadow-xl">{pages.map((rows, pageIndex) => <PettyCashReportPage key={`${selectedDate}-${pageIndex}`} reportRef={(node) => { pageRefs.current[pageIndex] = node; }} companyName={companyName} branchName={reportBranch} reportDate={selectedDate} rows={rows} startIndex={pageIndex * ROWS_PER_PAGE} pageIndex={pageIndex} pageCount={pages.length} total={total} preparedBy={preparedBy} authorizedBy={authorizedBy} />)}</div>
  </section>;
}

function PettyCashEditor({ entry, setEntry, onSubmit, onClose }) {
  const fields = [["referenceNo", "Reference No"], ["paymentDate", "Payment Date", "date"], ["paymentType", "Payment Type"], ["paymentFor", "Payment For"], ["vehicleNo", "Vehicle No"], ["fromKms", "From KMs", "number"], ["toKms", "To KMs", "number"], ["totalKms", "Total KMs", "number"], ["employeeName", "Employee Name"], ["ofdReportNo", "OFD Report No"], ["memo", "Memo"], ["note", "Note"], ["value", "Value", "number"]];
  return <div className="fixed inset-0 z-50 grid place-items-center bg-[#15143b]/45 p-3 backdrop-blur-sm"><form onSubmit={onSubmit} className="max-h-[92dvh] w-full max-w-5xl overflow-y-auto rounded-[28px] border border-white bg-[#fff8f4] p-5 shadow-2xl"><div className="flex items-center justify-between"><h3 className="text-lg font-black text-[#101233]">Petty Cash Voucher</h3><button type="button" onClick={onClose} className="petty-icon-button"><X className="h-5 w-5" /></button></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{fields.map(([key, label, type = "text"]) => <label key={key} className="petty-field"><span>{label}</span><input type={type} step={type === "number" ? "0.01" : undefined} value={entry[key] ?? ""} onChange={(event) => setEntry({ ...entry, [key]: event.target.value })} /></label>)}</div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="petty-action petty-action-neutral">Cancel</button><button type="submit" className="petty-action petty-action-green"><Save className="h-4 w-4" /> Apply Row</button></div></form></div>;
}

function PettyCashReportPage({ reportRef, companyName, branchName, reportDate, rows, startIndex, pageIndex, pageCount, total, preparedBy, authorizedBy }) {
  const finalPage = pageIndex === pageCount - 1;
  return <article ref={reportRef} className="petty-cash-a4-report"><header className="petty-report-heading"><h2>{String(companyName || "DOMESTIC EXPRESS ( PVT ) LTD").toUpperCase()}</h2><h1>SUMMARY OF PETTY CASH EXPENCES</h1></header><div className="petty-report-meta"><p><strong>BRANCH</strong><span>{String(branchName || "-").toUpperCase()}</span></p><p><strong>DATE</strong><span>{formatPettyCashDate(reportDate)}</span></p><p className="petty-page-number">PAGE {pageIndex + 1} / {pageCount}</p></div><table className="petty-report-table"><thead><tr><th>No</th><th>Reference No</th><th>Payment Date</th><th>Payment Type</th><th>Payment For</th><th>Vehicle No</th><th>From KMs</th><th>To KMs</th><th>Total KMs</th><th>Employee Name</th><th>OFD Report No</th><th>Memo</th><th>Note</th><th>Value</th><th>Signature</th></tr></thead><tbody>{rows.map((entry, index) => <tr key={entry.id}><td>{String(startIndex + index + 1).padStart(2, "0")}</td><td>{entry.referenceNo}</td><td>{formatPettyCashDate(entry.paymentDate)}</td><td>{entry.paymentType}</td><td>{entry.paymentFor}</td><td>{entry.vehicleNo}</td><td>{entry.fromKms}</td><td>{entry.toKms}</td><td>{entry.totalKms}</td><td>{entry.employeeName}</td><td>{entry.ofdReportNo}</td><td>{entry.memo}</td><td>{entry.note}</td><td>{currency(entry.value)}</td><td /></tr>)}</tbody>{finalPage ? <tfoot><tr><th colSpan="13">FULL TOTAL</th><th>{currency(total)}</th><th /></tr></tfoot> : null}</table>{finalPage ? <footer className="petty-report-footer"><div className="petty-amount-words"><strong>AMOUNT IN WORDS</strong><span>{amountToWords(total).toUpperCase()}</span></div><div className="petty-signatures"><p><span>{preparedBy}</span><strong>PREPARED BY</strong></p><p><span>{authorizedBy}</span><strong>AUTHORIZED BY</strong></p></div></footer> : <p className="petty-continued">CONTINUED ON NEXT A4 PAGE...</p>}</article>;
}
