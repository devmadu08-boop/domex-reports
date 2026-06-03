import { ChevronDown, Download, FileDown, Files, MessageCircle } from "lucide-react";
import { useState } from "react";
import SendToWhatsAppButton from "./SendToWhatsAppButton.jsx";

export default function ExportButtons({
  onCourierPng,
  onCourierPdf,
  onOperationPng,
  onOperationPdf,
  onBothPdf,
  courierReportRef,
  operationReportRef,
  reportDate,
  disabled,
}) {
  return (
    <div className="grid items-start gap-3 lg:grid-cols-[1fr_1fr_0.75fr]">
      <ExportCard
        title="Courier Performance"
        helper="Branch courier report"
        pngLabel="PNG"
        pdfLabel="PDF"
        onPng={onCourierPng}
        onPdf={onCourierPdf}
        disabled={disabled}
        reportRef={courierReportRef}
        reportTitle="Branch Courier Performance Report"
        reportType="courier"
        reportDate={reportDate}
      />
      <ExportCard
        title="Operation Report"
        helper="Daily operation summary"
        pngLabel="PNG"
        pdfLabel="PDF"
        onPng={onOperationPng}
        onPdf={onOperationPdf}
        disabled={disabled}
        reportRef={operationReportRef}
        reportTitle="Operation Report"
        reportType="operation"
        reportDate={reportDate}
      />
      <div className="export-glass-card">
        <div className="mb-3">
          <p className="text-sm font-black text-[#071537]">Both Reports</p>
          <p className="text-xs font-semibold text-blue-950/60">Single combined PDF</p>
        </div>
        <DropdownMenu
          label="Export Options"
          disabled={disabled}
          tone="blue"
          items={[
            {
              label: "Both PDF",
              icon: Files,
              onClick: onBothPdf,
              tone: "blue",
            },
          ]}
        />
      </div>
    </div>
  );
}

function ExportCard({ title, helper, pngLabel, pdfLabel, onPng, onPdf, disabled, reportRef, reportTitle, reportType, reportDate }) {
  return (
    <div className="export-glass-card">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-[#071537]">{title}</p>
          <p className="text-xs font-semibold text-blue-950/60">{helper}</p>
        </div>
        <MessageCircle className="h-5 w-5 text-emerald-700" />
      </div>
      <DropdownMenu
        label="Report Actions"
        disabled={disabled}
        tone="green"
        items={[
          { label: pngLabel, icon: Download, onClick: onPng, tone: "green" },
          { label: pdfLabel, icon: FileDown, onClick: onPdf, tone: "red" },
        ]}
        extraAction={<SendToWhatsAppButton reportRef={reportRef} reportTitle={reportTitle} reportType={reportType} reportDate={reportDate} disabled={disabled} compact />}
      />
    </div>
  );
}

function DropdownMenu({ label, disabled, tone, items, extraAction }) {
  const [open, setOpen] = useState(false);
  const toneClass = tone === "blue" ? "from-blue-700 to-violet-700 shadow-blue-300/50" : "from-emerald-700 to-green-400 shadow-emerald-300/50";

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className={`export-menu-trigger bg-gradient-to-br ${toneClass}`}
      >
        {label}
        <ChevronDown className={`h-5 w-5 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="export-dropdown-menu">
          {items.map((item) => {
            const Icon = item.icon;
            const itemTone =
              item.tone === "red"
                ? "from-red-500 to-rose-600 shadow-red-300/50"
                : item.tone === "blue"
                  ? "from-blue-700 to-violet-700 shadow-blue-300/50"
                  : "from-emerald-700 to-green-400 shadow-emerald-300/50";
            return (
              <button
                key={item.label}
                type="button"
                disabled={disabled}
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
                className={`export-action-button bg-gradient-to-br ${itemTone}`}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </button>
            );
          })}
          {extraAction}
        </div>
      )}
    </div>
  );
}
