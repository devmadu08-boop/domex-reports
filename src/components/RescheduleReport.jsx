import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, FileDown, Image, MessageCircle } from "lucide-react";
import { addDataChangeListener, getRescheduleRows, getSettings } from "../services/reportStorage.js";
import { sendRescheduleReportToWhatsApp } from "../services/whatsappApi.js";
import { captureElementAsPngDataUrl, exportElementsAsPng, exportElementsAsPortraitPdf } from "../utils/exportReports.js";
import { BrandedReportFooter, BrandedReportHeader } from "./ReportBranding.jsx";

const rowsPerPage = 18;

export default function RescheduleReport({ selectedDate, branchName = "Middeniya" }) {
  const [rows, setRows] = useState(() => getRescheduleRows(selectedDate));
  const [exporting, setExporting] = useState(false);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");
  const pageRefs = useRef([]);

  useEffect(() => {
    const refresh = () => setRows(getRescheduleRows(selectedDate));
    refresh();
    return addDataChangeListener(refresh);
  }, [selectedDate]);

  const pages = useMemo(() => paginateRows(rows), [rows]);
  const riderCount = useMemo(() => new Set(rows.map((row) => row.riderName).filter(Boolean)).size, [rows]);

  async function runExport(type) {
    const elements = pageRefs.current.filter(Boolean);
    setExporting(true);
    setStatus("");
    try {
      const result = type === "png"
        ? await exportElementsAsPng(elements, "Reschedule_Report", selectedDate)
        : await exportElementsAsPortraitPdf(elements, "Reschedule_Report", selectedDate);
      setStatus(`${type.toUpperCase()} export complete: ${result.pageCount} A4 page${result.pageCount === 1 ? "" : "s"}.`);
    } catch (error) {
      setStatus(error.message || "Report export failed.");
    } finally {
      setExporting(false);
    }
  }

  async function sendToWhatsApp() {
    const elements = pageRefs.current.filter(Boolean);
    setSending(true);
    setStatus("");
    try {
      const settings = getSettings();
      const template = settings.whatsappCaptionTemplates?.reschedule
        || "Reschedule Report - {date}\nSent automatically from Daily Report System";
      const caption = template
        .replaceAll("{title}", "Reschedule Report")
        .replaceAll("{date}", selectedDate);

      const imageDataUrls = await Promise.all(
        elements.map((element) => captureElementAsPngDataUrl(element, { whatsappBranded: true })),
      );
      await sendRescheduleReportToWhatsApp({ imageDataUrls, caption });

      setStatus(`Reschedule Report sent to WhatsApp: ${elements.length} A4 page${elements.length === 1 ? "" : "s"}.`);
    } catch (error) {
      setStatus(error.message || "Could not send the Reschedule Report to WhatsApp.");
    } finally {
      setSending(false);
    }
  }

  pageRefs.current = [];

  return (
    <section className="grid min-w-0 gap-5">
      <div className="min-w-0 overflow-hidden rounded-[28px] border border-[#eadff2] bg-[#fff8f4] p-4 shadow-[12px_14px_30px_rgba(128,104,178,0.15)] md:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-violet-600 text-white shadow-lg shadow-violet-300/60">
              <CalendarClock className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-black uppercase text-violet-600">Daily Reschedule Register</p>
              <h2 className="text-xl font-black text-[#101233] md:text-2xl">Reschedule Report</h2>
              <p className="mt-1 text-sm font-semibold text-[#625985]">
                Delivered Report uploads are collected automatically and duplicate tracking numbers are removed.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 lg:min-w-[720px]">
            <Summary label="Parcels" value={rows.length} />
            <Summary label="Riders" value={riderCount} />
            <button type="button" onClick={() => runExport("png")} disabled={exporting || sending || !rows.length} className="primary-action primary-action-blue min-h-12 disabled:cursor-not-allowed disabled:opacity-45">
              <Image className="h-5 w-5" /> PNG
            </button>
            <button type="button" onClick={() => runExport("pdf")} disabled={exporting || sending || !rows.length} className="primary-action primary-action-green min-h-12 disabled:cursor-not-allowed disabled:opacity-45">
              <FileDown className="h-5 w-5" /> PDF
            </button>
            <button type="button" onClick={sendToWhatsApp} disabled={exporting || sending || !rows.length} className="primary-action primary-action-green col-span-2 min-h-12 disabled:cursor-not-allowed disabled:opacity-45 sm:col-span-1">
              <MessageCircle className="h-5 w-5" /> {sending ? "Sending..." : "Send to WhatsApp"}
            </button>
          </div>
        </div>
        {status && <p className="mt-4 rounded-2xl bg-violet-50 px-4 py-3 text-sm font-black text-violet-800">{status}</p>}
      </div>

      <div className="min-w-0 max-w-full overflow-hidden rounded-[28px] border border-[#eadff2] bg-[#fff8f4] p-2 shadow-xl md:overflow-x-auto md:p-4">
        <div className="delivered-preview-stack mobile-a4-preview min-w-0 max-w-full overflow-hidden">
          {pages.map((pageRows, pageIndex) => (
            <RescheduleA4Page
              key={`${selectedDate}-${pageIndex}`}
              reportRef={(node) => {
                if (node) pageRefs.current[pageIndex] = node;
              }}
              branchName={branchName}
              selectedDate={selectedDate}
              rows={pageRows}
              totalCount={rows.length}
              startIndex={pageIndex * rowsPerPage}
              pageNumber={pageIndex + 1}
              pageCount={pages.length}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function Summary({ label, value }) {
  return (
    <div className="rounded-2xl bg-violet-50 px-3 py-2 text-center">
      <p className="text-[11px] font-black uppercase text-violet-600">{label}</p>
      <p className="text-xl font-black text-[#101233]">{value}</p>
    </div>
  );
}

function RescheduleA4Page({ reportRef, branchName, selectedDate, rows, totalCount, startIndex, pageNumber, pageCount }) {
  const cleanBranchName = String(branchName || "Middeniya").trim() || "Middeniya";
  return (
    <div ref={reportRef} className="report-paper a4-portrait-report reschedule-report-page">
      <BrandedReportHeader branchName={cleanBranchName} accent="Reschedule" title="Report" date={selectedDate} pageNumber={pageNumber} pageCount={pageCount} />
      <div className="report-print-only">
        <p className="report-company">Domex {cleanBranchName} Branch</p>
        <h2 className="report-title text-2xl">Reschedule Report</h2>
        <div className="mb-4 flex items-center justify-between text-sm font-black text-black">
          <span>Date: {selectedDate}</span>
          <span>Page: {pageNumber} / {pageCount}</span>
        </div>
      </div>

      <div className="report-branded-content">
      <table className="report-table branded-data-table reschedule-report-table numbered-report-table">
        <thead>
          <tr>
            <th style={{ width: "48px" }}>No</th>
            <th style={{ width: "190px" }}>Rider Name</th>
            <th style={{ width: "190px" }}>Tracking No</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((row, index) => (
            <tr key={row.trackingNo}>
              <td><span className="report-row-number">{startIndex + index + 1}</span></td>
              <td>{row.riderName || "-"}</td>
              <td>{row.trackingNo}</td>
              <td>{row.reason || "-"}</td>
            </tr>
          )) : (
            <tr>
              <td colSpan="4" className="h-16">No reschedule records saved for this date.</td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
      <BrandedReportFooter branchName={cleanBranchName} summaryLabel="Total Rescheduled Parcels" summaryValue={totalCount} />
      <div className="report-print-only mt-4 flex items-center justify-between text-xs font-bold text-black">
        <span>Total rescheduled parcels: {totalCount}</span>
        <span>Generated by Daily Courier Report System</span>
      </div>
    </div>
  );
}

function paginateRows(rows) {
  if (!rows.length) return [[]];
  const pages = [];
  for (let index = 0; index < rows.length; index += rowsPerPage) {
    pages.push(rows.slice(index, index + rowsPerPage));
  }
  return pages;
}
