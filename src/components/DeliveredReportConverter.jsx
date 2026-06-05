import { useEffect, useMemo, useRef, useState } from "react";
import { FileDown, Image, Plus, RotateCcw, Trash2, Upload } from "lucide-react";
import { todayIso } from "../utils/date.js";
import { captureElementAsPngDataUrl, exportElementAsPng, exportElementsAsPortraitPdf } from "../utils/exportReports.js";
import { deleteDeliveredReport, getDeliveredReport, getDeliveredRiderNames, getSettings, saveDeliveredReport as saveDeliveredReportByRider, saveSettings } from "../services/reportStorage.js";
import { sendConvertReportToWhatsApp, sendReportToWhatsAppRecipient } from "../services/whatsappApi.js";
import SendToWhatsAppButton from "./SendToWhatsAppButton.jsx";

const emptyEntry = {
  trackingNo: "",
  value: "",
};

export default function DeliveredReportConverter({ onSaved, companyName = "Domestic Express (pvt) ltd", defaultBranchName = "" }) {
  const [reportDate, setReportDate] = useState(todayIso());
  const [riderName, setRiderName] = useState("");
  const [branchName, setBranchName] = useState("");
  const [entries, setEntries] = useState([]);
  const [newEntry, setNewEntry] = useState(emptyEntry);
  const [fileName, setFileName] = useState("");
  const [includeSpecialTracking, setIncludeSpecialTracking] = useState(false);
  const [savedRiderNames, setSavedRiderNames] = useState([]);
  const [exportPrompt, setExportPrompt] = useState(null);
  const [sendToRiderWhatsApp, setSendToRiderWhatsApp] = useState(false);
  const [rememberSendChoice, setRememberSendChoice] = useState(false);
  const [exportStatus, setExportStatus] = useState("");
  const [exportingDelivered, setExportingDelivered] = useState(false);
  const reportRef = useRef(null);
  const reportPageRefs = useRef([]);

  useEffect(() => {
    setSavedRiderNames(getDeliveredRiderNames(reportDate));
  }, [reportDate]);

  const riderOptions = useMemo(() => {
    return [...new Set([...savedRiderNames, riderName].filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }, [savedRiderNames, riderName]);

  const specialValue = entries.reduce((sum, entry) => (isSpecialTrackingNo(entry.trackingNo) ? sum + parseMoney(entry.value) : sum), 0);
  const totalValue = entries.reduce((sum, entry) => {
    if (!includeSpecialTracking && isSpecialTrackingNo(entry.trackingNo)) return sum;
    return sum + parseMoney(entry.value);
  }, 0);
  const reportPages = useMemo(() => paginateDeliveredEntries(entries), [entries]);
  const pageCount = reportPages.length || 1;
  const hasMultiplePdfPages = pageCount > 1;

  async function handleCsvUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const parsed = parseDeliveredCsv(text);
    setFileName(file.name);
    setEntries(parsed.entries);
    setRiderName(parsed.riderName);
    setBranchName(parsed.branchName);
    if (parsed.reportDate) setReportDate(parsed.reportDate);
    event.target.value = "";
  }

  function updateEntry(index, field, value) {
    setEntries((current) => current.map((entry, itemIndex) => (itemIndex === index ? { ...entry, [field]: value } : entry)));
  }

  function deleteEntry(index) {
    setEntries((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function addEntry() {
    if (!newEntry.trackingNo.trim() && !newEntry.value.trim()) return;
    setEntries((current) => [
      ...current,
      {
        trackingNo: newEntry.trackingNo.trim(),
        value: normalizeMoney(newEntry.value),
      },
    ]);
    setNewEntry(emptyEntry);
  }

  function clearAll() {
    if (!entries.length && !riderName && !branchName && !fileName) return;
    if (!confirm("Clear converted delivered report data?")) return;
    setEntries([]);
    setRiderName("");
    setBranchName("");
    setFileName("");
    setIncludeSpecialTracking(false);
    setNewEntry(emptyEntry);
  }

  function saveDeliveredReport() {
    if (!riderName.trim()) {
      alert("Please enter or upload Rider Name before saving.");
      return;
    }
    saveDeliveredReportByRider(reportDate, riderName, {
      riderName,
      branchName,
      entries,
      includeSpecialTracking,
      fileName,
    });
    setSavedRiderNames(getDeliveredRiderNames(reportDate));
    onSaved?.();
  }

  function applySavedDeliveredReport(saved) {
    setRiderName(saved.riderName || "");
    setBranchName(saved.branchName || "");
    setEntries(saved.entries || []);
    setIncludeSpecialTracking(Boolean(saved.includeSpecialTracking));
    setFileName(saved.fileName || "Saved delivered report");
  }

  function handleRiderSelect(name) {
    setRiderName(name);
    if (!name) return;

    const saved = getDeliveredReport(reportDate, name);
    if (saved) {
      applySavedDeliveredReport(saved);
    }
  }

  function loadSavedDeliveredReport() {
    if (!riderName.trim()) {
      alert("Please enter Rider Name to load saved report.");
      return;
    }
    const saved = getDeliveredReport(reportDate, riderName);
    if (!saved) {
      alert(`No delivered report saved for ${riderName} on ${reportDate}.`);
      return;
    }
    applySavedDeliveredReport(saved);
  }

  function deleteSavedDeliveredReport() {
    if (!riderName.trim()) {
      alert("Please enter Rider Name to delete saved report.");
      return;
    }
    if (!confirm(`Delete saved delivered report for ${riderName} on ${reportDate}?`)) return;
    deleteDeliveredReport(reportDate, riderName);
    setSavedRiderNames(getDeliveredRiderNames(reportDate));
    setRiderName("");
    setEntries([]);
    setBranchName("");
    setFileName("");
    setIncludeSpecialTracking(false);
    onSaved?.();
  }

  async function handlePdfExport() {
    const pageElements = reportPageRefs.current.filter(Boolean);
    await exportElementsAsPortraitPdf(pageElements, "Delivered_Collection_Report", reportDate);
  }

  function openExportPrompt(type) {
    const settings = getSettings();
    const riderPhone = settings.deliveredRiderWhatsAppNumbers?.[riderName] || "";
    setSendToRiderWhatsApp(Boolean(settings.deliveredExportAutoWhatsApp && riderPhone));
    setRememberSendChoice(Boolean(settings.deliveredExportAutoWhatsApp));
    setExportStatus("");
    setExportPrompt({
      type,
      riderPhone,
      pageCount,
    });
  }

  function updateSendToRiderWhatsApp(checked) {
    setSendToRiderWhatsApp(checked);
    if (checked && !rememberSendChoice) {
      setRememberSendChoice(confirm("මෙය හැම export එකකදීම auto tick වෙන්න save කරන්නද?"));
    }
  }

  async function confirmExport() {
    if (!exportPrompt) return;

    setExportingDelivered(true);
    setExportStatus("");
    try {
      if (exportPrompt.type === "pdf") {
        await handlePdfExport();
      } else {
        await exportElementAsPng(reportRef.current, "Delivered_Collection_Report", reportDate);
      }

      if (sendToRiderWhatsApp) {
        if (!exportPrompt.riderPhone) {
          throw new Error("This rider has no saved WhatsApp number. Add it in Settings first.");
        }
        const imageDataUrl = await captureElementAsPngDataUrl(reportRef.current);
        const riderCaption = `Delivered Collection Report - ${reportDate}\nRider: ${riderName || "-"}\nSent automatically from Daily Report System`;
        await sendReportToWhatsAppRecipient({
          phoneNumber: exportPrompt.riderPhone,
          imageDataUrl,
          caption: riderCaption,
        });
        await sendConvertReportToWhatsApp({
          imageDataUrl,
          caption: `${riderCaption}\n\nDefault group copy for rider: ${riderName || "-"}`,
        });
      }

      const nextAutoWhatsApp = Boolean(rememberSendChoice && sendToRiderWhatsApp);
      if (nextAutoWhatsApp !== Boolean(getSettings().deliveredExportAutoWhatsApp)) {
        saveSettings({ deliveredExportAutoWhatsApp: nextAutoWhatsApp });
      }

      setExportStatus(sendToRiderWhatsApp ? "Export complete and sent to rider WhatsApp + Convert default group." : "Export complete.");
      window.setTimeout(() => setExportPrompt(null), 900);
    } catch (error) {
      setExportStatus(error.message || "Export failed.");
    } finally {
      setExportingDelivered(false);
    }
  }

  reportPageRefs.current = [];

  return (
    <section className="delivered-converter-section grid min-w-0 gap-4 md:gap-5">
      <div className="glass-panel p-3 md:p-4">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-wide text-emerald-700">Standalone Tool</p>
            <h2 className="text-xl font-black text-[#071537] md:text-2xl">Convert Delivered Report</h2>
            <p className="mt-1 text-sm font-semibold text-blue-950/70">
              CSV upload එකෙන් Tracking No, Value, Rider Name auto detect කරලා A4 portrait collection report එකක් හදයි.
            </p>
          </div>
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-red-200 bg-white/55 px-4 py-2 text-sm font-extrabold text-red-700 hover:bg-red-50"
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </button>
        </div>

        <label className="mb-4 flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-blue-300 bg-white/55 p-4 text-center transition hover:bg-blue-50/70 md:min-h-28">
          <Upload className="h-8 w-8 text-blue-700" />
          <span className="text-base font-black text-[#071537]">Upload Rider Wise Delivered CSV</span>
          <span className="text-sm font-semibold text-blue-950/65">{fileName || "Choose CSV file"}</span>
          <input type="file" accept=".csv,text/csv" onChange={handleCsvUpload} className="hidden" />
        </label>

        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Report Date" type="date" value={reportDate} onChange={setReportDate} />
          <RiderSelect riderName={riderName} riderOptions={riderOptions} onChange={handleRiderSelect} savedCount={savedRiderNames.length} />
          <Field label="Branch Name" value={branchName} onChange={setBranchName} placeholder="Optional" />
        </div>

        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-white/70 bg-white/55 p-3">
          <input
            type="checkbox"
            checked={includeSpecialTracking}
            onChange={(event) => setIncludeSpecialTracking(event.target.checked)}
            className="mt-1 h-5 w-5 accent-emerald-700"
          />
          <span>
            <span className="block text-sm font-black text-[#071537]">Include CS40 / CS80 tracking values in total</span>
            <span className="block text-xs font-semibold text-blue-950/65">
              Default: CS40/CS80 numbers stay visible at 50% opacity and are not added to total. Special value: {formatMoney(specialValue)}
            </span>
          </span>
        </label>

        <div className="mt-5 grid gap-3 md:hidden">
          {entries.length === 0 ? (
            <div className="rounded-2xl border border-white/70 bg-white/55 p-4 text-center text-sm font-semibold text-blue-950/55">
              Upload CSV file to generate delivered collection rows.
            </div>
          ) : (
            entries.map((entry, index) => (
              <div key={`${entry.trackingNo}-${index}`} className={`rounded-2xl border border-white/70 bg-white/60 p-3 shadow-sm ${isSpecialTrackingNo(entry.trackingNo) ? "special-tracking-muted" : ""}`}>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="grid h-8 w-8 place-items-center rounded-xl bg-blue-100 text-sm font-black text-blue-700">{index + 1}</span>
                  <button type="button" onClick={() => deleteEntry(index)} className="inline-grid h-9 w-9 place-items-center rounded-xl bg-red-50 text-red-600 hover:bg-red-100" aria-label="Delete row">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid gap-3">
                  <Field label="Tracking No" value={entry.trackingNo} onChange={(value) => updateEntry(index, "trackingNo", value)} />
                  <Field label="Value" value={entry.value} onChange={(value) => updateEntry(index, "value", value)} />
                </div>
              </div>
            ))
          )}

          <div className="rounded-2xl border border-white/70 bg-white/60 p-3">
            <p className="mb-3 text-sm font-black text-[#071537]">Add New Entry</p>
            <div className="grid gap-3">
              <Field label="Tracking No" value={newEntry.trackingNo} onChange={(value) => setNewEntry((current) => ({ ...current, trackingNo: value }))} placeholder="Tracking No" />
              <Field label="Value" value={newEntry.value} onChange={(value) => setNewEntry((current) => ({ ...current, value }))} placeholder="Value" />
              <button type="button" onClick={addEntry} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 text-sm font-black text-white hover:bg-emerald-700">
                <Plus className="h-4 w-4" />
                Add Entry
              </button>
            </div>
          </div>
        </div>

        <div className="mt-5 hidden overflow-x-auto rounded-3xl border border-white/70 bg-white/55 md:block">
          <table className="min-w-[680px] w-full text-sm">
            <thead className="bg-blue-50/75 text-left text-[#071537]">
              <tr>
                <th className="px-4 py-3">No</th>
                <th className="px-4 py-3">Tracking No</th>
                <th className="px-4 py-3">Value</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr>
                  <td colSpan="4" className="px-4 py-8 text-center font-semibold text-blue-950/55">
                    Upload CSV file to generate delivered collection rows.
                  </td>
                </tr>
              ) : (
                entries.map((entry, index) => (
                  <tr key={`${entry.trackingNo}-${index}`} className={`border-t border-white/75 ${isSpecialTrackingNo(entry.trackingNo) ? "special-tracking-muted" : ""}`}>
                    <td className="px-4 py-3 font-bold">{index + 1}</td>
                    <td className="px-4 py-3">
                      <input
                        value={entry.trackingNo}
                        onChange={(event) => updateEntry(index, "trackingNo", event.target.value)}
                        className="h-11 w-full rounded-xl border border-white/80 bg-white/75 px-3 font-bold outline-none focus:border-blue-500"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        value={entry.value}
                        onChange={(event) => updateEntry(index, "value", event.target.value)}
                        className="h-11 w-full rounded-xl border border-white/80 bg-white/75 px-3 text-right font-bold outline-none focus:border-blue-500"
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button type="button" onClick={() => deleteEntry(index)} className="inline-grid h-10 w-10 place-items-center rounded-xl bg-red-50 text-red-600 hover:bg-red-100" aria-label="Delete row">
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
              <tr className="border-t border-white/75 bg-white/45">
                <td className="px-4 py-3 font-black">Add</td>
                <td className="px-4 py-3">
                  <input
                    value={newEntry.trackingNo}
                    onChange={(event) => setNewEntry((current) => ({ ...current, trackingNo: event.target.value }))}
                    placeholder="Tracking No"
                    className="h-11 w-full rounded-xl border border-white/80 bg-white/75 px-3 font-bold outline-none focus:border-green-500"
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    value={newEntry.value}
                    onChange={(event) => setNewEntry((current) => ({ ...current, value: event.target.value }))}
                    placeholder="Value"
                    className="h-11 w-full rounded-xl border border-white/80 bg-white/75 px-3 text-right font-bold outline-none focus:border-green-500"
                  />
                </td>
                <td className="px-4 py-3 text-right">
                  <button type="button" onClick={addEntry} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-black text-white hover:bg-emerald-700">
                    <Plus className="h-4 w-4" />
                    Add
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <ActionButton label="Save Rider Report" icon={Upload} onClick={saveDeliveredReport} disabled={entries.length === 0} tone="blue" />
          <ActionButton label="Load Saved" icon={RotateCcw} onClick={loadSavedDeliveredReport} disabled={!reportDate} tone="dark" />
          <ActionButton label="Delete Saved" icon={Trash2} onClick={deleteSavedDeliveredReport} disabled={!reportDate} tone="red" />
          <ActionButton label="Export A4 PNG" icon={Image} onClick={() => openExportPrompt("png")} disabled={entries.length === 0} tone="green" />
          <ActionButton
            label={`Export A4 PDF${hasMultiplePdfPages ? ` (${pageCount} pages)` : ""}`}
            icon={FileDown}
            onClick={() => openExportPrompt("pdf")}
            disabled={entries.length === 0}
            tone="red"
            highlight={hasMultiplePdfPages}
          />
          <SendToWhatsAppButton reportRef={reportRef} reportTitle={`Delivered Collection Report - ${riderName || "-"}`} reportType="delivered" reportDate={reportDate} disabled={entries.length === 0} />
          <div className="rounded-2xl border border-white/70 bg-white/55 px-4 py-3 text-right sm:col-span-2 lg:col-span-1">
            <p className="text-xs font-black uppercase text-blue-950/60">Total Value</p>
            <p className="text-2xl font-black text-[#071537]">{formatMoney(totalValue)}</p>
            {!includeSpecialTracking && specialValue > 0 && (
              <p className="text-xs font-bold text-red-700">CS40/CS80 excluded: {formatMoney(specialValue)}</p>
            )}
          </div>
        </div>
        {hasMultiplePdfPages && (
          <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-black text-red-700">
            Items වැඩි නිසා මෙම report එක A4 pages {pageCount} කට බෙදෙයි. Print balance හොඳට තියාගන්න highlighted PDF button එකෙන් export කරන්න.
          </div>
        )}
      </div>

      <div className="delivered-preview-card rounded-3xl border border-white/70 bg-white/55 p-2 shadow-xl md:overflow-x-auto md:p-0">
        <div ref={reportRef} className="delivered-preview-stack mobile-a4-preview">
          {reportPages.map((page, pageIndex) => (
            <DeliveredCollectionReportPage
              key={`delivered-page-${pageIndex}`}
              reportRef={(node) => {
                if (node) reportPageRefs.current[pageIndex] = node;
              }}
              reportDate={reportDate}
              riderName={riderName}
              branchName={branchName || defaultBranchName}
              companyName={companyName}
              entries={page.entries}
              startIndex={page.startIndex}
              totalValue={totalValue}
              includeSpecialTracking={includeSpecialTracking}
              specialValue={specialValue}
              pageNumber={pageIndex + 1}
              pageCount={pageCount}
              isFinalPage={page.isFinalPage}
            />
          ))}
        </div>
      </div>

      {exportPrompt && (
        <ExportPromptModal
          type={exportPrompt.type}
          pageCount={exportPrompt.pageCount}
          riderName={riderName}
          riderPhone={exportPrompt.riderPhone}
          sendToRiderWhatsApp={sendToRiderWhatsApp}
          rememberSendChoice={rememberSendChoice}
          exporting={exportingDelivered}
          status={exportStatus}
          onSendChange={updateSendToRiderWhatsApp}
          onRememberChange={setRememberSendChoice}
          onCancel={() => setExportPrompt(null)}
          onConfirm={confirmExport}
        />
      )}
    </section>
  );
}

function DeliveredCollectionReportPage({ reportRef, reportDate, riderName, branchName, companyName, entries, startIndex, totalValue, includeSpecialTracking, specialValue, pageNumber, pageCount, isFinalPage }) {
  return (
    <div ref={reportRef} className={`report-paper a4-portrait-report delivered-report-page ${isFinalPage ? "delivered-final-page" : "delivered-continuation-page"}`}>
      <p className="report-company">{companyName}</p>
      <h2 className="report-title text-2xl">Delivered Collection Report</h2>
      <div className="delivered-report-meta">
        <p>Date: {reportDate}</p>
        <p className="text-right">Rider Name: {riderName || "-"}</p>
        {branchName && <p>Branch: {branchName}</p>}
        <p className="text-right">Page: {pageNumber} / {pageCount}</p>
      </div>

      <table className="report-table delivered-money-table">
        <thead>
          <tr>
            <th style={{ width: "56px" }}>No</th>
            <th>Tracking No</th>
            <th style={{ width: "160px" }}>Value</th>
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 ? (
            <tr>
              <td colSpan="3">Upload CSV file to generate report.</td>
            </tr>
          ) : (
            entries.map((entry, index) => (
              <tr key={`${entry.trackingNo}-${index}`} className={isSpecialTrackingNo(entry.trackingNo) ? "special-tracking-muted" : ""}>
                <td>{startIndex + index + 1}</td>
                <td>{entry.trackingNo}</td>
                <td className="money-cell">{formatMoney(parseMoney(entry.value))}</td>
              </tr>
            ))
          )}
          <tr className="delivered-total-row">
            <td colSpan="2">
              <strong>Total Value</strong>
              {!includeSpecialTracking && specialValue > 0 && <span className="total-note"> CS40/CS80 excluded</span>}
            </td>
            <td className="money-cell">
              <strong>{formatMoney(totalValue)}</strong>
            </td>
          </tr>
        </tbody>
      </table>

      <div className="paid-amount-row delivered-final-only">
        <span>ලබාදුන් මුදල</span>
        <div className="paid-amount-line" />
      </div>

      <div className="signature-row delivered-final-only">
        <div>
          <div className="signature-line" />
          <p>මුදල් ලබා දුන් බවට අත්සන</p>
        </div>
        <div>
          <div className="signature-line" />
          <p>මුදල් ලබාගත් බවට අත්සන</p>
        </div>
      </div>
    </div>
  );
}

function paginateDeliveredEntries(entries) {
  const normalRowsPerPage = 24;
  const finalRowsPerPage = 18;

  if (!entries.length) {
    return [{ entries: [], startIndex: 0, isFinalPage: true }];
  }

  if (entries.length <= finalRowsPerPage) {
    return [{ entries, startIndex: 0, isFinalPage: true }];
  }

  const pages = [];
  let startIndex = 0;

  while (entries.length - startIndex > normalRowsPerPage + finalRowsPerPage) {
    pages.push({
      entries: entries.slice(startIndex, startIndex + normalRowsPerPage),
      startIndex,
      isFinalPage: false,
    });
    startIndex += normalRowsPerPage;
  }

  if (entries.length - startIndex > finalRowsPerPage) {
    const remaining = entries.length - startIndex;
    const take = Math.min(normalRowsPerPage, Math.max(Math.ceil(remaining / 2), remaining - finalRowsPerPage));

    pages.push({
      entries: entries.slice(startIndex, startIndex + take),
      startIndex,
      isFinalPage: false,
    });
    startIndex += take;
  }

  pages.push({
    entries: entries.slice(startIndex),
    startIndex,
    isFinalPage: true,
  });

  return pages;
}

function parseDeliveredCsv(text) {
  const rows = parseCsv(text);
  const metadata = {};
  let headerIndex = -1;

  rows.forEach((row, index) => {
    if (row.includes("Tracking No") && row.includes("Value") && row.includes("Rider Name")) {
      headerIndex = index;
    }
    if (row.length >= 2 && headerIndex === -1) {
      metadata[row[0]] = row[1];
    }
  });

  if (headerIndex === -1) {
    return { entries: [], riderName: "", branchName: "", reportDate: "" };
  }

  const header = rows[headerIndex].map((item) => item.trim());
  const trackingIndex = header.indexOf("Tracking No");
  const valueIndex = header.indexOf("Value");
  const riderIndex = header.indexOf("Rider Name");
  const branchIndex = header.indexOf("Delivered Branch");
  const dateIndex = header.indexOf("Delivered Date");

  const dataRows = rows.slice(headerIndex + 1).filter((row) => row.length > 1 && row[trackingIndex]);
  const entries = dataRows.map((row) => ({
    trackingNo: row[trackingIndex]?.trim() || "",
    value: normalizeMoney(row[valueIndex] || "0"),
  }));

  const riderNames = uniqueValues(dataRows.map((row) => cleanName(row[riderIndex])));
  const branches = uniqueValues(dataRows.map((row) => row[branchIndex]?.trim()));
  const firstDate = dataRows[0]?.[dateIndex];

  return {
    entries,
    riderName: riderNames.length === 1 ? riderNames[0] : riderNames.join(", "),
    branchName: branches.length === 1 ? branches[0] : metadata.CompanyName || "",
    reportDate: parseCsvDate(firstDate || metadata.TimeStamp),
  };
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows.map((items) => items.map((item) => item.trim()));
}

function parseCsvDate(value) {
  if (!value) return "";
  const match = String(value).match(/^(\d{2})\/(\d{2})\/(\d{4})|^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "";
  if (match[1]) return `${match[3]}-${match[1]}-${match[2]}`;
  return `${match[4]}-${match[5]}-${match[6]}`;
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function cleanName(value) {
  return String(value || "").replaceAll("_", " ").replace(/\s+/g, " ").trim();
}

function isSpecialTrackingNo(value) {
  return /^CS(?:40|80)\d{7}$/i.test(String(value || "").trim());
}

function parseMoney(value) {
  const parsed = parseFloat(String(value || "0").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeMoney(value) {
  return parseMoney(value).toFixed(2);
}

function formatMoney(value) {
  return parseMoney(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function Field({ label, type = "text", value, onChange, placeholder }) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-black text-[#071537]">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-12 rounded-2xl border border-white/80 bg-white/70 px-4 text-base font-bold outline-none focus:border-green-500 focus:ring-4 focus:ring-green-100"
      />
    </label>
  );
}

function RiderSelect({ riderName, riderOptions, onChange, savedCount }) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-black text-[#071537]">Rider Name</span>
      <select
        value={riderName}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 rounded-2xl border border-white/80 bg-white/70 px-4 text-base font-bold outline-none focus:border-green-500 focus:ring-4 focus:ring-green-100"
      >
        <option value="">Select saved rider</option>
        {riderOptions.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
      <span className="text-xs font-semibold text-blue-950/60">
        {savedCount} saved rider{savedCount === 1 ? "" : "s"} for this date. Upload CSV to detect a new rider.
      </span>
    </label>
  );
}

function ExportPromptModal({
  type,
  pageCount,
  riderName,
  riderPhone,
  sendToRiderWhatsApp,
  rememberSendChoice,
  exporting,
  status,
  onSendChange,
  onRememberChange,
  onCancel,
  onConfirm,
}) {
  const isPdf = type === "pdf";
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4">
      <div className="w-full max-w-lg rounded-[28px] border border-[#eadff2] bg-[#fff8f4] p-5 shadow-[18px_18px_45px_rgba(30,20,60,0.24)]">
        <div className="mb-4">
          <p className="text-sm font-black uppercase text-violet-700">Export {isPdf ? "PDF" : "PNG"}</p>
          <h3 className="text-xl font-black text-[#071537]">Send to WhatsApp?</h3>
          <p className="mt-2 text-sm font-semibold text-blue-950/70">
            {isPdf
              ? `මෙම Delivered Collection Report එක A4 PDF page ${pageCount} කට export වෙනවා.`
              : "PNG export එකෙන් පසු අවශ්‍ය නම් rider WhatsApp number එකට image එක send කළ හැක."}
          </p>
        </div>

        <div className="rounded-2xl border border-[#eadff2] bg-white px-4 py-3 text-sm font-bold text-blue-950">
          <p>Rider: <span className="font-black">{riderName || "-"}</span></p>
          <p className="mt-1">WhatsApp: <span className={riderPhone ? "font-black text-emerald-700" : "font-black text-red-700"}>{riderPhone || "Not saved in Settings"}</span></p>
        </div>

        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-[#eadff2] bg-white px-4 py-3">
          <input
            type="checkbox"
            checked={sendToRiderWhatsApp}
            onChange={(event) => onSendChange(event.target.checked)}
            disabled={!riderPhone}
            className="mt-1 h-5 w-5 accent-emerald-700 disabled:opacity-40"
          />
          <span>
            <span className="block text-sm font-black text-[#071537]">WhatsApp send</span>
            <span className="block text-xs font-semibold text-blue-950/60">Export complete උනාම report PNG එක rider ගෙ WhatsApp number එකට send කරන්න.</span>
          </span>
        </label>

        <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-2xl border border-[#eadff2] bg-white px-4 py-3">
          <input
            type="checkbox"
            checked={rememberSendChoice}
            onChange={(event) => onRememberChange(event.target.checked)}
            className="mt-1 h-5 w-5 accent-violet-700"
          />
          <span>
            <span className="block text-sm font-black text-[#071537]">Always tick this option</span>
            <span className="block text-xs font-semibold text-blue-950/60">ඊළඟ exports වලදී WhatsApp send option එක auto tick කරන්න.</span>
          </span>
        </label>

        {status && <p className={`mt-4 rounded-2xl px-4 py-3 text-sm font-black ${status.includes("failed") || status.includes("no saved") ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{status}</p>}

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={onCancel} disabled={exporting} className="secondary-action">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={exporting} className="primary-action primary-action-green">
            {exporting ? "Exporting..." : `Export ${isPdf ? "PDF" : "PNG"}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function ActionButton({ label, icon: Icon, onClick, disabled, tone, highlight = false }) {
  const toneClass =
    tone === "red"
      ? "from-red-500 to-rose-600 shadow-red-300/60"
      : tone === "blue"
        ? "from-blue-700 to-sky-500 shadow-blue-300/60"
        : tone === "dark"
          ? "from-slate-800 to-slate-600 shadow-slate-300/50"
      : "from-emerald-700 to-green-400 shadow-emerald-300/60";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-white/60 bg-gradient-to-br px-4 py-3 text-sm font-extrabold text-white shadow-xl transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 ${toneClass} ${highlight ? "pdf-export-highlight" : ""}`}
    >
      <Icon className="h-5 w-5" />
      {label}
    </button>
  );
}
