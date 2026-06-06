import { useMemo, useRef, useState } from "react";
import { CalendarDays, Download, FileDown, FileSpreadsheet, Filter, Search } from "lucide-react";
import { getAllReports } from "../services/reportStorage.js";
import { displayDate, todayIso } from "../utils/date.js";
import { exportElementsAsPortraitPdf } from "../utils/exportReports.js";

const sectionOptions = [
  { value: "all", label: "All Sections" },
  { value: "courier", label: "Courier Performance" },
  { value: "operation", label: "Operation Report" },
  { value: "delivered", label: "Delivered Collection" },
];

const rowsPerPage = {
  courier: 22,
  operation: 24,
  delivered: 24,
};

export default function AllInOneReports({ companyName = "Domestic Express (pvt) ltd", branchName = "" }) {
  const [period, setPeriod] = useState("month");
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [selectedMonth, setSelectedMonth] = useState(todayIso().slice(0, 7));
  const [customStartDate, setCustomStartDate] = useState(todayIso());
  const [customEndDate, setCustomEndDate] = useState(todayIso());
  const [sectionFilter, setSectionFilter] = useState("all");
  const [status, setStatus] = useState("");
  const pageRefs = useRef([]);

  const range = useMemo(
    () => getDateRange(period, period === "month" ? selectedMonth : selectedDate, customStartDate, customEndDate),
    [period, selectedDate, selectedMonth, customStartDate, customEndDate],
  );
  const reports = useMemo(() => getAllReports().filter((report) => report.date >= range.start && report.date <= range.end), [range.end, range.start]);
  const sections = useMemo(() => buildReportSections(reports, sectionFilter), [reports, sectionFilter]);
  const pages = useMemo(() => buildPages(sections), [sections]);
  const summary = useMemo(() => buildSummary(sections), [sections]);

  async function handlePdfExport() {
    if (!pages.length) {
      setStatus("No report records available for this date range.");
      return;
    }

    const pageElements = pageRefs.current.filter(Boolean);
    setStatus(`PDF export has ${pageElements.length} A4 page${pageElements.length === 1 ? "" : "s"}. Exporting...`);
    try {
      await exportElementsAsPortraitPdf(pageElements, `All_In_One_${range.fileLabel}_Report`, range.fileLabel);
      setStatus(`PDF exported successfully (${pageElements.length} A4 page${pageElements.length === 1 ? "" : "s"}).`);
    } catch (error) {
      setStatus(error.message || "PDF export failed.");
    }
  }

  function handleExcelExport() {
    if (!sections.some((section) => section.rows.length)) {
      setStatus("No report records available for this date range.");
      return;
    }

    const html = createExcelWorkbook({ companyName, branchName, range, sections, summary });
    const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `All_In_One_${range.fileLabel}_Report.xls`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setStatus("Excel report exported successfully.");
  }

  pageRefs.current = [];

  return (
    <section className="grid gap-5">
      <div className="glass-panel p-5">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-violet-100 px-3 py-1 text-sm font-black text-violet-700">
              <FileSpreadsheet className="h-4 w-4" />
              All-in-One Exports
            </div>
            <h2 className="mt-3 text-2xl font-black text-[#15143b]">Day, Weekly, Monthly Reports</h2>
            <p className="text-sm font-semibold text-[#6e6496]">Black and white A4 report pages, section by section, ready for office PDF and Excel export.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={handleExcelExport} className="primary-action primary-action-green">
              <Download className="h-5 w-5" />
              Export Excel
            </button>
            <button type="button" onClick={handlePdfExport} className="primary-action primary-action-purple">
              <FileDown className="h-5 w-5" />
              Export PDF
            </button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr_auto]">
          <FieldShell label="Report Type" icon={Filter}>
            <select className="report-filter-input" value={period} onChange={(event) => setPeriod(event.target.value)}>
              <option value="day">Day to Day</option>
              <option value="week">Weekly</option>
              <option value="month">Monthly</option>
              <option value="custom">Custom Date Range</option>
            </select>
          </FieldShell>

          <FieldShell label={period === "month" ? "Report Month" : period === "custom" ? "Start Date" : "Report Date"} icon={CalendarDays}>
            {period === "custom" ? (
              <input className="report-filter-input" type="date" value={customStartDate} onChange={(event) => setCustomStartDate(event.target.value)} />
            ) : period === "month" ? (
              <input className="report-filter-input" type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} />
            ) : (
              <input className="report-filter-input" type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
            )}
          </FieldShell>

          {period === "custom" && (
            <FieldShell label="End Date" icon={CalendarDays}>
              <input className="report-filter-input" type="date" value={customEndDate} onChange={(event) => setCustomEndDate(event.target.value)} />
            </FieldShell>
          )}

          <FieldShell label="Section" icon={Search}>
            <select className="report-filter-input" value={sectionFilter} onChange={(event) => setSectionFilter(event.target.value)}>
              {sectionOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </FieldShell>

          <div className="rounded-[24px] bg-[#fff8f4] p-4 shadow-[inset_7px_7px_15px_rgba(128,104,178,0.14),inset_-7px_-7px_15px_rgba(255,255,255,0.9)]">
            <p className="text-xs font-black uppercase text-[#6e6496]">Selected Range</p>
            <p className="mt-2 text-lg font-black text-[#15143b]">{range.label}</p>
            <p className="text-sm font-bold text-[#6e6496]">{summary.totalRows} records</p>
          </div>
        </div>

        {status && <p className="mt-4 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-[#15143b] shadow-sm">{status}</p>}
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Metric label="Courier Rows" value={summary.courierRows} />
        <Metric label="Operation Days" value={summary.operationRows} />
        <Metric label="Delivered Riders" value={summary.deliveredRows} />
        <Metric label="Delivered Value" value={formatMoney(summary.deliveredValue)} />
      </div>

      <div className="all-report-preview">
        {pages.length ? (
          pages.map((page, index) => (
            <article
              key={`${page.section.key}-${page.chunkIndex}`}
              ref={(node) => {
                if (node) pageRefs.current[index] = node;
              }}
              className="all-report-paper"
            >
              <ReportHeader companyName={companyName} branchName={branchName} range={range} pageNumber={index + 1} pageCount={pages.length} />
              <h3 className="all-report-section-title">{page.section.title}</h3>
              <table className="all-report-table">
                <thead>
                  <tr>
                    {page.section.columns.map((column) => (
                      <th key={column}>{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {page.rows.map((row, rowIndex) => page.section.renderRow(row, rowIndex + page.offset))}
                </tbody>
              </table>
              {page.section.footer?.(page.rows, page.section.rows)}
            </article>
          ))
        ) : (
          <article
            ref={(node) => {
              if (node) pageRefs.current[0] = node;
            }}
            className="all-report-paper"
          >
            <ReportHeader companyName={companyName} branchName={branchName} range={range} pageNumber={1} pageCount={1} />
            <div className="all-report-empty">No saved report data found for this range.</div>
          </article>
        )}
      </div>
    </section>
  );
}

function FieldShell({ label, icon: Icon, children }) {
  return (
    <label className="grid gap-2">
      <span className="flex items-center gap-2 text-sm font-black text-[#15143b]">
        <Icon className="h-4 w-4 text-violet-600" />
        {label}
      </span>
      {children}
    </label>
  );
}

function Metric({ label, value }) {
  return (
    <div className="glass-panel p-4">
      <p className="text-xs font-black uppercase text-[#6e6496]">{label}</p>
      <p className="mt-2 text-2xl font-black text-[#15143b]">{value}</p>
    </div>
  );
}

function ReportHeader({ companyName, branchName, range, pageNumber, pageCount }) {
  return (
    <header className="all-report-header">
      <div>
        <h2>{companyName}</h2>
        <p>Branch: {branchName || "All Branch Data"}</p>
      </div>
      <div className="text-right">
        <h1>All-in-One Report</h1>
        <p>{range.label}</p>
        <p>Page {pageNumber} of {pageCount}</p>
      </div>
    </header>
  );
}

function buildReportSections(reports, sectionFilter) {
  const sections = [
    {
      key: "courier",
      title: "Courier Performance Report",
      columns: ["Date", "Courier Name", "On Route", "Delivery", "Resend", "Delivery %", "Pickup"],
      rows: reports.flatMap((report) =>
        (report.courierRows || []).map((row) => ({
          date: report.date,
          courierName: row.courierName || "",
          onRouteCount: numberValue(row.onRouteCount),
          deliveryCount: numberValue(row.deliveryCount),
          resendCount: numberValue(row.resendCount),
          deliveryPercent: calculateDeliveryPercent(row),
          pickupCount: numberValue(row.pickupCount),
        })),
      ),
      renderRow: (row, index) => (
        <tr key={`${row.date}-${row.courierName}-${index}`}>
          <td>{row.date}</td>
          <td>{row.courierName}</td>
          <td>{row.onRouteCount}</td>
          <td>{row.deliveryCount}</td>
          <td>{row.resendCount}</td>
          <td>{row.deliveryPercent}%</td>
          <td>{row.pickupCount}</td>
        </tr>
      ),
    },
    {
      key: "operation",
      title: "Operation Report",
      columns: ["Date", "Inward", "Same Day %", "1st Day %", "Total %", "Outward", "M/Route", "Target", "Achievement"],
      rows: reports
        .filter((report) => report.operation)
        .map((report) => {
          const operation = report.operation || {};
          const sameDay = percentValue(operation.sameDayPercent);
          const firstDay = percentValue(operation.firstDayPercent);
          const target = numberValue(operation.target);
          const outward = numberValue(operation.outward ?? operation.outWord);
          return {
            date: report.date,
            inward: numberValue(operation.inward ?? operation.inword),
            sameDay,
            firstDay,
            total: (sameDay + firstDay).toFixed(2),
            outward,
            missedRouteCount: numberValue(operation.missedRouteCount),
            target,
            achievement: target > 0 ? ((outward / target) * 100).toFixed(2) : "0.00",
          };
        }),
      renderRow: (row) => (
        <tr key={row.date}>
          <td>{row.date}</td>
          <td>{row.inward}</td>
          <td>{row.sameDay}%</td>
          <td>{row.firstDay}%</td>
          <td>{row.total}%</td>
          <td>{row.outward}</td>
          <td>{row.missedRouteCount}</td>
          <td>{row.target}</td>
          <td>{row.achievement}%</td>
        </tr>
      ),
    },
    {
      key: "delivered",
      title: "Delivered Collection Report",
      columns: ["Date", "Rider Name", "Tracking Count", "Special Excluded", "Total Value"],
      rows: reports.flatMap((report) =>
        Object.values(report.delivered || {}).map((deliveredReport) => {
          const entries = Array.isArray(deliveredReport.entries) ? deliveredReport.entries : [];
          const includeSpecial = Boolean(deliveredReport.includeSpecialTracking);
          const totalValue = entries.reduce((sum, entry) => {
            if (!includeSpecial && isSpecialTrackingNo(entry.trackingNo)) return sum;
            return sum + moneyValue(entry.value);
          }, 0);
          const specialCount = entries.filter((entry) => isSpecialTrackingNo(entry.trackingNo)).length;
          return {
            date: report.date,
            riderName: deliveredReport.riderName || "Unknown Rider",
            trackingCount: entries.length,
            specialCount,
            totalValue,
          };
        }),
      ),
      renderRow: (row, index) => (
        <tr key={`${row.date}-${row.riderName}-${index}`}>
          <td>{row.date}</td>
          <td>{row.riderName}</td>
          <td>{row.trackingCount}</td>
          <td>{row.specialCount}</td>
          <td>{formatMoney(row.totalValue)}</td>
        </tr>
      ),
      footer: (_pageRows, allRows) => (
        <div className="all-report-total">Total Delivered Value: {formatMoney(allRows.reduce((sum, row) => sum + row.totalValue, 0))}</div>
      ),
    },
  ];

  return sections.filter((section) => sectionFilter === "all" || section.key === sectionFilter);
}

function buildPages(sections) {
  return sections.flatMap((section) => {
    if (!section.rows.length) return [];
    return chunk(section.rows, rowsPerPage[section.key] || 22).map((rows, index) => ({
      section,
      rows,
      chunkIndex: index,
      offset: index * (rowsPerPage[section.key] || 22),
    }));
  });
}

function buildSummary(sections) {
  const courierRows = sections.find((section) => section.key === "courier")?.rows.length || 0;
  const operationRows = sections.find((section) => section.key === "operation")?.rows.length || 0;
  const deliveredRows = sections.find((section) => section.key === "delivered")?.rows.length || 0;
  const deliveredValue = sections.find((section) => section.key === "delivered")?.rows.reduce((sum, row) => sum + row.totalValue, 0) || 0;
  return {
    courierRows,
    operationRows,
    deliveredRows,
    deliveredValue,
    totalRows: courierRows + operationRows + deliveredRows,
  };
}

function createExcelWorkbook({ companyName, branchName, range, sections, summary }) {
  const styles = `
    table { border-collapse: collapse; margin-bottom: 24px; width: 100%; }
    th, td { border: 1px solid #000; padding: 6px; text-align: center; }
    th { font-weight: bold; background: #eee; }
    h1, h2, p { font-family: Arial, sans-serif; }
  `;
  const sectionTables = sections
    .map((section) => {
      const head = section.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("");
      const body = section.rows.map((row) => `<tr>${excelCellsForSection(section.key, row)}</tr>`).join("");
      return `<h2>${escapeHtml(section.title)}</h2><table><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${section.columns.length}">No records</td></tr>`}</tbody></table>`;
    })
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"><style>${styles}</style></head><body>
    <h1>${escapeHtml(companyName)}</h1>
    <p><strong>Branch:</strong> ${escapeHtml(branchName || "All Branch Data")}</p>
    <p><strong>Range:</strong> ${escapeHtml(range.label)}</p>
    <p><strong>Summary:</strong> Courier ${summary.courierRows}, Operation ${summary.operationRows}, Delivered ${summary.deliveredRows}, Value ${formatMoney(summary.deliveredValue)}</p>
    ${sectionTables}
  </body></html>`;
}

function excelCellsForSection(sectionKey, row) {
  if (sectionKey === "courier") {
    return [row.date, row.courierName, row.onRouteCount, row.deliveryCount, row.resendCount, `${row.deliveryPercent}%`, row.pickupCount].map(cell).join("");
  }
  if (sectionKey === "operation") {
    return [row.date, row.inward, `${row.sameDay}%`, `${row.firstDay}%`, `${row.total}%`, row.outward, row.missedRouteCount, row.target, `${row.achievement}%`].map(cell).join("");
  }
  return [row.date, row.riderName, row.trackingCount, row.specialCount, formatMoney(row.totalValue)].map(cell).join("");
}

function cell(value) {
  return `<td>${escapeHtml(value)}</td>`;
}

function getDateRange(period, value, customStartDate, customEndDate) {
  if (period === "custom") {
    const start = customStartDate <= customEndDate ? customStartDate : customEndDate;
    const end = customStartDate <= customEndDate ? customEndDate : customStartDate;
    return { start, end, label: `${displayDate(start)} - ${displayDate(end)}`, fileLabel: `${start}_to_${end}` };
  }

  if (period === "month") {
    const [year, month] = String(value || todayIso().slice(0, 7)).split("-").map(Number);
    const start = makeIsoDate(year, month, 1);
    const endDate = new Date(year, month, 0);
    const end = makeIsoDate(endDate.getFullYear(), endDate.getMonth() + 1, endDate.getDate());
    return { start, end, label: `${monthName(month)} ${year}`, fileLabel: `${year}-${String(month).padStart(2, "0")}` };
  }

  if (period === "week") {
    const startDate = startOfWeek(value || todayIso());
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);
    const start = toIsoDate(startDate);
    const end = toIsoDate(endDate);
    return { start, end, label: `${displayDate(start)} - ${displayDate(end)}`, fileLabel: `${start}_to_${end}` };
  }

  const date = value || todayIso();
  return { start: date, end: date, label: displayDate(date), fileLabel: date };
}

function startOfWeek(iso) {
  const date = dateFromIso(iso);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
}

function dateFromIso(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toIsoDate(date) {
  return makeIsoDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function makeIsoDate(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthName(month) {
  return new Date(2026, month - 1, 1).toLocaleString("en", { month: "long" });
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function percentValue(value) {
  const parsed = parseFloat(String(value || "").replace("%", ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function moneyValue(value) {
  const parsed = parseFloat(String(value || "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function calculateDeliveryPercent(row) {
  const onRoute = numberValue(row.onRouteCount);
  const delivered = numberValue(row.deliveryCount);
  if (onRoute <= 0) return "0.00";
  return ((delivered / onRoute) * 100).toFixed(2);
}

function isSpecialTrackingNo(value) {
  return /^CS(?:40|80)\d{7}$/i.test(String(value || "").trim());
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
