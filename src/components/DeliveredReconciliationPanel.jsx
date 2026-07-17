import { AlertTriangle, Check, CheckCircle2, FileCheck2, FileSearch, MessageCircle, Upload } from "lucide-react";

export default function DeliveredReconciliationPanel({
  sources,
  reconciliation,
  reminderStatus,
  reminderSending,
  onOutForDeliveryUpload,
  onDeliveredUpload,
  onRescheduleUpload,
  onMarkFound,
  onMarkMissing,
  onSendReminder,
}) {
  const unresolvedMissing = reconciliation?.missingParcels?.filter((item) => item.status !== "found") || [];

  return (
    <div className="mb-5 rounded-3xl border border-violet-200 bg-[#f8f1ff] p-3 shadow-[10px_10px_24px_rgba(80,55,130,0.12)] md:p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-violet-600 text-white shadow-lg shadow-violet-200">
          <FileSearch className="h-5 w-5" />
        </span>
        <div>
          <p className="text-xs font-black uppercase text-violet-700">Required reconciliation</p>
          <h3 className="text-lg font-black text-[#071537]">Match delivery status before creating the report</h3>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <UploadStep
          number="1"
          title="Out for Delivery"
          accept=".pdf,application/pdf"
          source={sources.outForDelivery}
          onChange={onOutForDeliveryUpload}
        />
        <UploadStep
          number="2"
          title="Delivered Report"
          accept=".csv,text/csv"
          source={sources.delivered}
          disabled={!sources.outForDelivery}
          onChange={onDeliveredUpload}
        />
        <UploadStep
          number="3"
          title="Reschedule Report"
          accept=".csv,text/csv"
          source={sources.reschedule}
          disabled={!sources.delivered}
          onChange={onRescheduleUpload}
        />
      </div>

      {reconciliation && (
        <div className="mt-4 grid gap-4">
          <div className={`rounded-2xl border px-4 py-3 ${reconciliation.balanced ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
            <div className="flex items-center gap-2">
              {reconciliation.balanced ? <CheckCircle2 className="h-5 w-5 text-emerald-700" /> : <AlertTriangle className="h-5 w-5 text-amber-700" />}
              <p className={`font-black ${reconciliation.balanced ? "text-emerald-800" : "text-amber-900"}`}>
                {reconciliation.balanced ? "All Out for Delivery parcels are balanced." : "Differences found. Review the tracking lists below."}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric label="Out for Delivery" value={reconciliation.outForDeliveryCount} tone="violet" />
            <Metric label="Delivered" value={reconciliation.deliveredCount} tone="green" />
            <Metric label="Rescheduled" value={reconciliation.rescheduledCount} tone="blue" />
            <Metric label="Missing" value={unresolvedMissing.length} tone={unresolvedMissing.length ? "red" : "green"} />
          </div>

          {reconciliation.missingParcels?.length > 0 && (
            <TrackingSection title="Missing parcels" tone="red">
              {reconciliation.missingParcels.map((item) => {
                const found = item.status === "found";
                return (
                  <div key={item.trackingNo} className={`flex min-w-0 items-center justify-between gap-3 rounded-xl px-3 py-2 ${found ? "bg-emerald-50" : "bg-red-50"}`}>
                    <div className="min-w-0">
                      <p className={`break-all text-sm font-black ${found ? "text-emerald-800 line-through" : "text-red-800"}`}>{item.trackingNo}</p>
                      <p className="text-xs font-bold text-blue-950/55">{found ? `Found ${formatTime(item.foundAt)}` : "Still missing"}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => (found ? onMarkMissing(item.trackingNo) : onMarkFound(item.trackingNo))}
                      className={`inline-flex min-h-10 shrink-0 items-center gap-1 rounded-xl px-3 text-xs font-black ${found ? "bg-white text-amber-700" : "bg-emerald-600 text-white"}`}
                    >
                      <Check className="h-4 w-4" />
                      {found ? "Reopen" : "Mark Found"}
                    </button>
                  </div>
                );
              })}
            </TrackingSection>
          )}

          <DifferenceList title="Delivered but not Out for Delivery" values={reconciliation.extraDelivered} />
          <DifferenceList title="Rescheduled but not Out for Delivery" values={reconciliation.extraRescheduled} />
          <DifferenceList title="Appears in both Delivered and Rescheduled" values={reconciliation.deliveredAndRescheduled} />

          {unresolvedMissing.length > 0 && (
            <button
              type="button"
              onClick={onSendReminder}
              disabled={reminderSending}
              className="primary-action primary-action-green min-h-12 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <MessageCircle className="h-5 w-5" />
              {reminderSending ? "Sending Reminder..." : "Send Missing Reminder to Rider"}
            </button>
          )}
          {reminderStatus && <p className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-blue-950">{reminderStatus}</p>}
        </div>
      )}
    </div>
  );
}

function UploadStep({ number, title, accept, source, disabled = false, onChange }) {
  return (
    <label className={`relative flex min-h-32 flex-col justify-between rounded-2xl border p-4 transition ${disabled ? "cursor-not-allowed border-slate-200 bg-slate-100 opacity-55" : source ? "cursor-pointer border-emerald-200 bg-emerald-50" : "cursor-pointer border-violet-200 bg-white hover:border-violet-400"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`grid h-8 w-8 place-items-center rounded-xl text-sm font-black ${source ? "bg-emerald-600 text-white" : "bg-violet-100 text-violet-700"}`}>
          {source ? <FileCheck2 className="h-4 w-4" /> : number}
        </span>
        {!disabled && <Upload className="h-4 w-4 text-violet-600" />}
      </div>
      <div className="mt-3 min-w-0">
        <p className="text-sm font-black text-[#071537]">{title}</p>
        <p className="mt-1 truncate text-xs font-bold text-blue-950/55">{source ? `${source.fileName} (${source.count})` : disabled ? "Complete previous step" : "Choose file"}</p>
      </div>
      <input
        type="file"
        accept={accept}
        onChange={onChange}
        disabled={disabled}
        aria-label={`Upload ${title}`}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
      />
    </label>
  );
}

function Metric({ label, value, tone }) {
  const colors = {
    violet: "bg-violet-100 text-violet-800",
    green: "bg-emerald-100 text-emerald-800",
    blue: "bg-sky-100 text-sky-800",
    red: "bg-red-100 text-red-800",
  };
  return (
    <div className={`rounded-2xl px-3 py-3 ${colors[tone]}`}>
      <p className="text-[11px] font-black uppercase">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
    </div>
  );
}

function TrackingSection({ title, children }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-white p-3">
      <p className="mb-2 text-sm font-black text-red-800">{title}</p>
      <div className="grid gap-2 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function DifferenceList({ title, values }) {
  if (!values?.length) return null;
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
      <p className="text-sm font-black text-amber-900">{title} ({values.length})</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {values.map((value) => <span key={value} className="rounded-lg bg-white px-2 py-1 text-xs font-black text-amber-800">{value}</span>)}
      </div>
    </div>
  );
}

function formatTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString();
}
