import { Calculator, Image, MessageCircle, Plus, Save, Trash2 } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { getReportByDate, saveReportType } from "../services/reportStorage.js";
import { sendAuditReportToWhatsApp } from "../services/whatsappApi.js";
import { captureElementAsPngDataUrl, exportElementAsPng } from "../utils/exportReports.js";
import { AUDIT_DENOMINATIONS, AUDIT_STATUS_ROWS, calculateAuditReport, createAuditListRow, normalizeAuditReport } from "../utils/auditReport.js";

const money = (value) => Number(value || 0).toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const count = (value) => Number(value || 0).toLocaleString("en-LK", { maximumFractionDigits: 0 });

export default function AuditReport({ selectedDate, branchName = "Middeniya" }) {
  const [report, setReport] = useState(() => normalizeAuditReport(null, selectedDate, branchName));
  const [section, setSection] = useState("outstanding");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const reportRef = useRef(null);

  useEffect(() => {
    setReport(normalizeAuditReport(getReportByDate(selectedDate).audit, selectedDate, branchName));
    setStatus(getReportByDate(selectedDate).audit ? "Saved Audit Report loaded." : "Enter the audit values. All totals update automatically.");
  }, [selectedDate, branchName]);

  const calculated = useMemo(() => calculateAuditReport(report), [report]);
  const update = (field, value) => setReport((current) => ({ ...current, [field]: value }));
  const updateStatus = (rowKey, metric, value) => setReport((current) => ({ ...current, statuses: { ...current.statuses, [rowKey]: { ...current.statuses[rowKey], [metric]: Number(value) || 0 } } }));
  const updateDenomination = (field, denomination, value) => setReport((current) => ({ ...current, [field]: { ...current[field], [denomination]: Number(value) || 0 } }));
  const updateList = (field, index, key, value) => setReport((current) => ({ ...current, [field]: current[field].map((row, rowIndex) => rowIndex === index ? { ...row, [key]: key === "amount" ? Number(value) || 0 : value } : row) }));
  const addListRow = (field, type) => setReport((current) => ({ ...current, [field]: [...current[field], createAuditListRow(type)] }));
  const deleteListRow = (field, index) => setReport((current) => ({ ...current, [field]: current[field].filter((_, rowIndex) => rowIndex !== index) }));

  function saveReport() {
    saveReportType(selectedDate, "audit", { ...report, calculated, updatedAt: new Date().toISOString() });
    setStatus("Audit Report saved successfully.");
  }

  async function exportPng() {
    if (!reportRef.current) return;
    setBusy(true); setStatus("");
    try { await exportElementAsPng(reportRef.current, "Audit_Report", selectedDate); setStatus("Audit Report PNG exported successfully."); }
    catch (error) { setStatus(error.message || "Audit Report export failed."); }
    finally { setBusy(false); }
  }

  async function sendWhatsApp() {
    if (!reportRef.current) return;
    setBusy(true); setStatus("");
    try {
      const imageDataUrl = await captureElementAsPngDataUrl(reportRef.current);
      const caption = `📊 *Outstanding Audit Report*\n📅 Date: *${selectedDate}*\n🏢 Branch: *${report.branchName || branchName}*\n\n💵 Cash in hand: *LKR ${money(calculated.cashInHandTotal)}*\n⚖️ Float difference: *LKR ${money(calculated.floatDifference)}*`;
      const result = await sendAuditReportToWhatsApp({ imageDataUrl, caption });
      setStatus(result.queued ? "Audit Report added to the WhatsApp send queue." : "Audit Report sent to the assigned WhatsApp groups.");
    } catch (error) { setStatus(error.message || "Audit Report WhatsApp send failed."); }
    finally { setBusy(false); }
  }

  return <section className="grid min-w-0 gap-5">
    <div className="audit-entry-shell">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3"><span className="audit-feature-icon"><Calculator className="h-6 w-6" /></span><div><p className="text-xs font-black uppercase text-cyan-700">Formula-driven audit workspace</p><h2 className="text-2xl font-black text-[#101a3b]">Outstanding Audit Report</h2><p className="text-sm font-semibold text-[#66708e]">Enter only source values. Totals, differences, and float balancing are calculated automatically.</p></div></div>
        <div className="flex flex-wrap gap-2"><button type="button" onClick={saveReport} className="primary-action primary-action-green"><Save className="h-5 w-5" /> Save Report</button><button type="button" onClick={exportPng} disabled={busy} className="primary-action primary-action-blue"><Image className="h-5 w-5" /> Export PNG</button><button type="button" onClick={sendWhatsApp} disabled={busy} className="primary-action primary-action-purple"><MessageCircle className="h-5 w-5" /> {busy ? "Working..." : "Send WhatsApp"}</button></div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="Audit Date" type="date" value={report.date} onChange={(value) => update("date", value)} /><Field label="Branch" value={report.branchName} onChange={(value) => update("branchName", value)} /></div>
      <div className="audit-entry-tabs mt-4">{[["outstanding","Outstanding"],["cash","Cash Count"],["vouchers","Petty Cash & Vouchers"],["iou","IOU & Notes"]].map(([id,label]) => <button key={id} type="button" onClick={() => setSection(id)} className={section === id ? "active" : ""}>{label}</button>)}</div>
      {section === "outstanding" && <OutstandingEntry report={report} updateStatus={updateStatus} calculated={calculated} />}
      {section === "cash" && <CashEntry report={report} update={update} updateDenomination={updateDenomination} calculated={calculated} />}
      {section === "vouchers" && <div className="mt-4 grid gap-4 xl:grid-cols-2"><AuditList title="Pending Petty Cash" field="pendingPettyCash" rows={report.pendingPettyCash} updateList={updateList} addListRow={addListRow} deleteListRow={deleteListRow} total={calculated.pendingPettyCashTotal} /><AuditList title="In Hand Vouchers" field="inHandVouchers" rows={report.inHandVouchers} updateList={updateList} addListRow={addListRow} deleteListRow={deleteListRow} total={calculated.inHandVoucherTotal} /></div>}
      {section === "iou" && <div className="mt-4 grid gap-4"><IouEntry rows={report.ious} updateList={updateList} addListRow={addListRow} deleteListRow={deleteListRow} total={calculated.iouTotal} /><div className="grid gap-3 sm:grid-cols-2"><label className="audit-field sm:col-span-2"><span>Note</span><textarea value={report.note} onChange={(event) => update("note", event.target.value)} rows="3" /></label><Field label="Branch Head" value={report.branchHead} onChange={(value) => update("branchHead", value)} /></div></div>}
      {status && <p className="mt-4 rounded-2xl bg-cyan-50 px-4 py-3 text-sm font-black text-cyan-900">{status}</p>}
    </div>
    <div className="audit-preview-shell"><AuditLandscapeReport reportRef={reportRef} report={report} calculated={calculated} /></div>
  </section>;
}

function OutstandingEntry({ report, updateStatus, calculated }) {
  return <div className="mt-4 overflow-x-auto rounded-2xl border border-blue-100 bg-white"><table className="audit-input-table min-w-[920px]"><thead><tr><th>Description</th><th>Cash Bills</th><th>Cash Amount</th><th>COD Bills</th><th>COD Amount</th><th>E-Com Bills</th><th>E-Com Amount</th></tr></thead><tbody>{AUDIT_STATUS_ROWS.map(([key, label, group], index) => <Fragment key={key}><tr className={group === "A" ? "audit-row-a" : "audit-row-b"}><th>{label}</th>{["cashBills","cashAmount","codBills","codAmount","ecomBills","ecomAmount"].map((metric) => <td key={metric}><input type="number" min="0" step={metric.endsWith("Amount") ? "0.01" : "1"} value={report.statuses[key][metric] || ""} onChange={(event) => updateStatus(key, metric, event.target.value)} /></td>)}</tr>{index === 1 && <AuditTotalRow label="Total A" values={calculated.totalA} className="audit-inline-total" />}</Fragment>)}</tbody><tfoot><AuditTotalRow label="Total B" values={calculated.totalB} /><AuditTotalRow label="Difference A-B" values={calculated.difference} /></tfoot></table></div>;
}
function AuditTotalRow({ label, values, className = "" }) { return <tr className={className}><th>{label}</th>{["cashBills","cashAmount","codBills","codAmount","ecomBills","ecomAmount"].map((metric) => <td key={metric}>{metric.endsWith("Amount") ? money(values[metric]) : count(values[metric])}</td>)}</tr>; }

function CashEntry({ report, update, updateDenomination, calculated }) {
  return <div className="mt-4 grid gap-4 xl:grid-cols-2">
    <div className="audit-entry-card xl:col-span-2">
      <div className="mb-3"><h3>Cash & Float Controls</h3><p>These source values feed the workbook cash and float formulas.</p></div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Petty Cash Outstanding" type="number" value={report.pettyCashOutstanding} onChange={(value) => update("pettyCashOutstanding", Number(value) || 0)} />
        <Field label="EX / Short" type="number" value={report.exShort} onChange={(value) => update("exShort", Number(value) || 0)} />
        <Field label="Petty Cash Float" type="number" value={report.pettyCashFloat} onChange={(value) => update("pettyCashFloat", Number(value) || 0)} />
      </div>
    </div>
    <DenominationEntry title="Sales Cash Denomination" field="salesCashDenominations" values={report.salesCashDenominations} coins={report.salesCashCoins} onCoins={(value) => update("salesCashCoins", Number(value) || 0)} updateDenomination={updateDenomination} total={calculated.salesCashTotal} />
    <DenominationEntry title="Cash In Hand" field="cashInHandDenominations" values={report.cashInHandDenominations} coins={report.cashInHandCoins} onCoins={(value) => update("cashInHandCoins", Number(value) || 0)} updateDenomination={updateDenomination} total={calculated.cashInHandTotal} />
  </div>;
}
function DenominationEntry({ title, field, values, coins, onCoins, updateDenomination, total }) { return <div className="audit-entry-card"><div className="flex items-center justify-between"><h3>{title}</h3><strong>LKR {money(total)}</strong></div><div className="audit-denomination-grid">{AUDIT_DENOMINATIONS.map((value) => <label key={value}><span>LKR {value}</span><input type="number" min="0" value={values[value] || ""} onChange={(event) => updateDenomination(field, value, event.target.value)} /><small>{money(value * Number(values[value] || 0))}</small></label>)}<label><span>Coins</span><input type="number" min="0" step="0.01" value={coins || ""} onChange={(event) => onCoins(event.target.value)} /><small>{money(coins)}</small></label></div></div>; }

function AuditList({ title, field, rows, updateList, addListRow, deleteListRow, total }) { return <div className="audit-entry-card"><div className="flex items-center justify-between"><h3>{title}</h3><strong>LKR {money(total)}</strong></div><div className="grid gap-2">{rows.map((row,index) => <div key={row.id} className="grid grid-cols-[1fr_140px_42px] gap-2"><input value={row.voucher || ""} onChange={(event) => updateList(field,index,"voucher",event.target.value)} placeholder="Voucher serial" /><input type="number" min="0" step="0.01" value={row.amount || ""} onChange={(event) => updateList(field,index,"amount",event.target.value)} placeholder="Amount" /><button type="button" onClick={() => deleteListRow(field,index)} className="audit-delete"><Trash2 className="h-4 w-4" /></button></div>)}<button type="button" onClick={() => addListRow(field,"voucher")} className="audit-add"><Plus className="h-4 w-4" /> Add Voucher</button></div></div>; }
function IouEntry({ rows, updateList, addListRow, deleteListRow, total }) { return <div className="audit-entry-card"><div className="flex items-center justify-between"><h3>IOU Register</h3><strong>LKR {money(total)}</strong></div><div className="grid gap-2">{rows.map((row,index) => <div key={row.id} className="grid gap-2 md:grid-cols-[150px_1fr_1.4fr_140px_42px]"><input type="date" value={row.date || ""} onChange={(event) => updateList("ious",index,"date",event.target.value)} /><input value={row.name || ""} onChange={(event) => updateList("ious",index,"name",event.target.value)} placeholder="Name" /><input value={row.reason || ""} onChange={(event) => updateList("ious",index,"reason",event.target.value)} placeholder="Reason" /><input type="number" min="0" step="0.01" value={row.amount || ""} onChange={(event) => updateList("ious",index,"amount",event.target.value)} placeholder="Amount" /><button type="button" onClick={() => deleteListRow("ious",index)} className="audit-delete"><Trash2 className="h-4 w-4" /></button></div>)}<button type="button" onClick={() => addListRow("ious","iou")} className="audit-add"><Plus className="h-4 w-4" /> Add IOU</button></div></div>; }
function Field({ label, type="text", value, onChange }) { return <label className="audit-field"><span>{label}</span><input type={type} min={type === "number" ? "0" : undefined} step={type === "number" ? "0.01" : undefined} value={value ?? ""} onChange={(event) => onChange(event.target.value)} /></label>; }

function AuditLandscapeReport({ reportRef, report, calculated }) {
  return <article ref={reportRef} className="audit-landscape-report"><header><div className="audit-report-brand"><img src="/report-assets/domex-logo.png" alt="DOMEX" /></div><div><p>{String(report.branchName || "Middeniya").toUpperCase()} BRANCH</p><small>Daily Operations Audit</small></div></header><section className="audit-report-title"><div><small>DOMEX {report.branchName || "Middeniya"} Branch</small><h1>OUTSTANDING AUDIT REPORT</h1></div><div><span>DATE</span><strong>{report.date}</strong></div></section><div className="audit-report-grid"><section className="audit-report-panel audit-wide"><h2>Outstanding Summary</h2><table><thead><tr><th>Description</th><th>Cash Bill</th><th>Cash Amount</th><th>COD Bill</th><th>COD Amount</th><th>E-Com Bill</th><th>E-Com Amount</th></tr></thead><tbody>{AUDIT_STATUS_ROWS.map(([key,label,group], index) => <Fragment key={key}><tr className={group === "A" ? "group-a" : "group-b"}><th>{label}</th><td>{count(report.statuses[key].cashBills)}</td><td>{money(report.statuses[key].cashAmount)}</td><td>{count(report.statuses[key].codBills)}</td><td>{money(report.statuses[key].codAmount)}</td><td>{count(report.statuses[key].ecomBills)}</td><td>{money(report.statuses[key].ecomAmount)}</td></tr>{index === 1 && <AuditReportTotal label="Total A" values={calculated.totalA} className="audit-inline-total" />}</Fragment>)}</tbody><tfoot><AuditReportTotal label="Total B" values={calculated.totalB}/><AuditReportTotal label="Difference A-B" values={calculated.difference}/></tfoot></table></section><section className="audit-report-panel"><h2>Outstanding Amount</h2><Kpi label="Cash" value={calculated.outstandingAmounts.cash}/><Kpi label="COD" value={calculated.outstandingAmounts.cod}/><Kpi label="E-Commerce" value={calculated.outstandingAmounts.ecom}/><Kpi label="Total" value={calculated.outstandingAmounts.total} strong/></section><section className="audit-report-panel"><h2>Cash Position</h2><Kpi label="Sales Cash" value={calculated.salesCashTotal}/><Kpi label="Cash In Hand" value={calculated.cashInHandTotal}/><Kpi label="Petty Cash Used" value={calculated.cashUsedForPettyCash}/><Kpi label="EX / Short" value={report.exShort}/></section><section className="audit-report-panel"><h2>Petty Cash & Vouchers</h2><Kpi label="Pending Petty Cash" value={calculated.pendingPettyCashTotal}/><Kpi label="In Hand Voucher" value={calculated.inHandVoucherTotal}/><Kpi label="IOU" value={calculated.iouTotal}/><Kpi label="Balancing Total" value={calculated.balancingTotal} strong/></section><section className="audit-report-panel audit-balance"><h2>Float Balancing</h2><div><small>Petty Cash Float</small><strong>LKR {money(report.pettyCashFloat)}</strong></div><div><small>Recorded Total</small><strong>LKR {money(calculated.balancingTotal)}</strong></div><div className={calculated.floatDifference === 0 ? "balanced" : "difference"}><small>Difference</small><strong>LKR {money(calculated.floatDifference)}</strong></div></section></div><footer><p><strong>NOTE:</strong> {report.note || "Daily branch audit completed."}</p><p><span>{report.branchHead || "Branch Head"}</span><small>Authorized by</small></p></footer></article>;
}
function AuditReportTotal({label,values,className=""}) { return <tr className={className}><th>{label}</th><td>{count(values.cashBills)}</td><td>{money(values.cashAmount)}</td><td>{count(values.codBills)}</td><td>{money(values.codAmount)}</td><td>{count(values.ecomBills)}</td><td>{money(values.ecomAmount)}</td></tr>; }
function Kpi({label,value,strong=false}) { return <div className={strong ? "audit-kpi strong" : "audit-kpi"}><span>{label}</span><b>LKR {money(value)}</b></div>; }
