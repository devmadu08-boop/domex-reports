import { Calculator, Save, Settings, Trash2 } from "lucide-react";

const emptyOperationForm = {
  inward: "",
  sameDayPercent: "",
  firstDayPercent: "",
  totalPercent: "",
  outward: "",
  missedRouteCount: "",
  target: "",
  achievement: "",
};

export default function OperationReportForm({
  selectedDate,
  form,
  setForm,
  onSubmit,
  onDeleteSavedReport,
  stableTarget,
  onStableTargetChange,
  onApplyStableTarget,
}) {
  function handleChange(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  const target = Number(form.target) || 0;
  const outward = Number(form.outward) || 0;
  const achievement = target > 0 ? ((outward / target) * 100).toFixed(2) : "0.00";
  const totalPercent = (parsePercent(form.sameDayPercent) + parsePercent(form.firstDayPercent)).toFixed(2);

  return (
    <section className="grid gap-4">
      <div className="glass-panel p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-stone-900">Operation Report</h2>
            <p className="text-sm font-semibold text-stone-500">Date: {selectedDate}</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-green-800">
            <Calculator className="h-5 w-5" />
            <span className="text-sm font-black">Achievement {achievement}%</span>
          </div>
        </div>

        <div className="mb-5 rounded-2xl border border-white/70 bg-white/45 p-3">
          <div className="mb-3 flex items-center gap-2 text-stone-800">
            <Settings className="h-5 w-5 text-green-700" />
            <h3 className="text-sm font-black uppercase tracking-wide">Stable Dispatch Target</h3>
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <Field label="Default Target" type="number" value={stableTarget} onChange={onStableTargetChange} />
            <button
              type="button"
              onClick={onApplyStableTarget}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-green-200 bg-white px-4 py-2 text-sm font-extrabold text-green-800 transition hover:bg-green-50"
            >
              <Save className="h-5 w-5" />
              Save / Apply Target
            </button>
          </div>
          <p className="mt-2 text-xs font-semibold text-stone-500">This target stays saved and can be changed any time.</p>
        </div>

        <form onSubmit={onSubmit} className="grid gap-5">
          <div>
            <h3 className="mb-3 text-sm font-black uppercase tracking-wide text-green-800">Delivery</h3>
            <div className="grid gap-3 md:grid-cols-4">
              <Field label="Inward" type="number" value={form.inward} onChange={(value) => handleChange("inward", value)} />
              <Field label="Same Day %" value={form.sameDayPercent} onChange={(value) => handleChange("sameDayPercent", value)} />
              <Field label="1St day %" value={form.firstDayPercent} onChange={(value) => handleChange("firstDayPercent", value)} />
              <ReadOnlyField label="Total %" value={`${totalPercent}%`} />
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-black uppercase tracking-wide text-red-700">Missed Route</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Outward" type="number" value={form.outward} onChange={(value) => handleChange("outward", value)} />
              <Field label="M/Route Count" type="number" value={form.missedRouteCount} onChange={(value) => handleChange("missedRouteCount", value)} />
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-black uppercase tracking-wide text-stone-800">Dispatch</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Target" type="number" value={form.target} onChange={(value) => handleChange("target", value)} />
              <ReadOnlyField label="Achievement %" value={`${achievement}%`} />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <button type="submit" className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/60 bg-gradient-to-br from-emerald-700 to-green-400 px-5 py-3 text-base font-extrabold text-white shadow-xl shadow-emerald-300/50 transition hover:-translate-y-0.5">
              <Save className="h-5 w-5" />
              Save Operation Report
            </button>
            <button type="button" onClick={onDeleteSavedReport} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-red-200 bg-white/65 px-5 py-3 text-base font-extrabold text-red-700 hover:bg-red-50">
              <Trash2 className="h-5 w-5" />
              Delete Saved Operation Report
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

export { emptyOperationForm };

function parsePercent(value) {
  const parsed = parseFloat(String(value || "").replace("%", ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function Field({ label, type = "text", value, onChange }) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-bold text-stone-700">{label}</span>
      <input
        type={type}
        min={type === "number" ? "0" : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 rounded-md border border-stone-300 bg-white px-3 text-base outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
      />
    </label>
  );
}

function ReadOnlyField({ label, value }) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-bold text-stone-700">{label}</span>
      <input
        type="text"
        value={value}
        readOnly
        className="h-12 rounded-md border border-stone-300 bg-stone-100 px-3 text-base font-black text-green-800 outline-none"
      />
    </label>
  );
}
