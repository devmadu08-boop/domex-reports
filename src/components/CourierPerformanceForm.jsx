import { Edit3, Plus, Save, Trash2, UserPlus, X } from "lucide-react";

const emptyForm = {
  courierName: "",
  onRouteCount: "",
  deliveryCount: "",
  resendCount: "",
  pickupCount: "",
};

export default function CourierPerformanceForm({
  selectedDate,
  rows,
  form,
  setForm,
  editingId,
  onSubmit,
  onEdit,
  onDelete,
  onSaveReport,
  onDeleteSavedReport,
  onCancel,
  courierNames,
  onSaveCourierName,
  onDeleteCourierName,
}) {
  function handleChange(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  return (
    <section className="grid gap-4">
      <form onSubmit={onSubmit} className="glass-panel p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-stone-900">Branch Courier Performance</h2>
            <p className="text-sm font-semibold text-stone-500">Saved courier names can be selected again next day.</p>
          </div>
          {editingId && (
            <button type="button" onClick={onCancel} className="inline-flex items-center gap-2 rounded-md border border-stone-300 px-3 py-2 text-sm font-bold text-stone-700">
              <X className="h-4 w-4" />
              Cancel Edit
            </button>
          )}
        </div>

        <div className="mb-4 rounded-2xl border border-white/70 bg-white/45 p-3">
          <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <label className="grid gap-2">
              <span className="text-sm font-bold text-stone-700">Courier Name</span>
              <input
                list="saved-courier-names"
                value={form.courierName}
                required
                onChange={(event) => handleChange("courierName", event.target.value)}
                placeholder="Type or select courier name"
                className="h-12 rounded-md border border-stone-300 bg-white px-3 text-base outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
              />
              <datalist id="saved-courier-names">
                {courierNames.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </label>
            <button
              type="button"
              onClick={() => onSaveCourierName(form.courierName)}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-green-200 bg-white px-4 py-2 text-sm font-extrabold text-green-800 transition hover:bg-green-50"
            >
              <UserPlus className="h-5 w-5" />
              Save Name
            </button>
          </div>

          {courierNames.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {courierNames.map((name) => (
                <span key={name} className="inline-flex overflow-hidden rounded-md border border-green-100 bg-white text-sm font-bold text-stone-700">
                  <button type="button" onClick={() => handleChange("courierName", name)} className="px-3 py-2 hover:bg-green-50">
                    {name}
                  </button>
                  <button type="button" onClick={() => onDeleteCourierName(name)} className="border-l border-green-100 px-2 text-red-600 hover:bg-red-50" aria-label={`Delete ${name}`}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <Field label="On Route Count" type="number" value={form.onRouteCount} onChange={(value) => handleChange("onRouteCount", value)} />
          <Field label="Delivery Count" type="number" value={form.deliveryCount} onChange={(value) => handleChange("deliveryCount", value)} />
          <Field label="Resend Count" type="number" value={form.resendCount} onChange={(value) => handleChange("resendCount", value)} />
          <Field label="Pickup Count" type="number" value={form.pickupCount} onChange={(value) => handleChange("pickupCount", value)} />
        </div>

        <button type="submit" className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/60 bg-gradient-to-br from-emerald-700 to-green-400 px-5 py-3 text-base font-extrabold text-white shadow-xl shadow-emerald-300/50 transition hover:-translate-y-0.5 md:w-auto">
          {editingId ? <Save className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
          {editingId ? "Save Row" : "Add Courier Row"}
        </button>
      </form>

      <div className="glass-panel grid gap-3 p-3 md:grid-cols-2">
        <button
          type="button"
          onClick={onSaveReport}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/60 bg-gradient-to-br from-blue-700 to-sky-500 px-5 py-3 text-base font-extrabold text-white shadow-xl shadow-blue-300/50"
        >
          <Save className="h-5 w-5" />
          Save Courier Performance Report
        </button>
        <button
          type="button"
          onClick={onDeleteSavedReport}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-red-200 bg-white/65 px-5 py-3 text-base font-extrabold text-red-700 hover:bg-red-50"
        >
          <Trash2 className="h-5 w-5" />
          Delete Saved Courier Report
        </button>
      </div>

      <div className="grid gap-3 md:hidden">
        {rows.length === 0 ? (
          <div className="glass-panel p-4 text-center text-sm font-semibold text-stone-500">
            No courier rows added yet.
          </div>
        ) : (
          rows.map((row) => (
            <div key={row.id} className="glass-panel p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-black text-stone-900">{row.courierName}</p>
                  <p className="text-sm font-bold text-green-700">Delivery {row.deliveryPercent}%</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => onEdit(row)} className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-green-200 text-green-700 hover:bg-green-50" aria-label="Edit courier row">
                    <Edit3 className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => onDelete(row.id)} className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-red-200 text-red-600 hover:bg-red-50" aria-label="Delete courier row">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <MobileStat label="On Route" value={row.onRouteCount || 0} />
                <MobileStat label="Delivery" value={row.deliveryCount || 0} />
                <MobileStat label="Resend" value={row.resendCount || 0} />
                <MobileStat label="Pickup" value={row.pickupCount || 0} />
              </div>
            </div>
          ))
        )}
      </div>

      <div className="hidden overflow-x-auto rounded-lg border border-stone-200 bg-white shadow-sm md:block">
        <table className="min-w-[760px] w-full text-left text-sm">
          <thead className="bg-stone-100 text-stone-700">
            <tr>
              <th className="px-3 py-3">Courier Name</th>
              <th className="px-3 py-3 text-center">On Route</th>
              <th className="px-3 py-3 text-center">Delivery</th>
              <th className="px-3 py-3 text-center">Resend</th>
              <th className="px-3 py-3 text-center">Delivery %</th>
              <th className="px-3 py-3 text-center">Pickup</th>
              <th className="px-3 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-center text-stone-500" colSpan="7">
                  No courier rows added yet.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t border-stone-100">
                  <td className="px-3 py-3 font-bold">{row.courierName}</td>
                  <td className="px-3 py-3 text-center">{row.onRouteCount || 0}</td>
                  <td className="px-3 py-3 text-center">{row.deliveryCount || 0}</td>
                  <td className="px-3 py-3 text-center">{row.resendCount || 0}</td>
                  <td className="px-3 py-3 text-center font-bold text-green-700">{row.deliveryPercent}%</td>
                  <td className="px-3 py-3 text-center">{row.pickupCount || 0}</td>
                  <td className="px-3 py-3">
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => onEdit(row)} className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-green-200 text-green-700 hover:bg-green-50" aria-label="Edit courier row">
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => onDelete(row.id)} className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-red-200 text-red-600 hover:bg-red-50" aria-label="Delete courier row">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export { emptyForm as emptyCourierForm };

function MobileStat({ label, value }) {
  return (
    <div className="rounded-md bg-stone-50 px-3 py-2">
      <p className="text-[11px] font-black uppercase tracking-wide text-stone-500">{label}</p>
      <p className="text-base font-black text-stone-900">{value}</p>
    </div>
  );
}

function Field({ label, type = "text", value, onChange, required = false }) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-bold text-stone-700">{label}</span>
      <input
        type={type}
        min={type === "number" ? "0" : undefined}
        value={value}
        required={required}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 rounded-md border border-stone-300 bg-white px-3 text-base outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
      />
    </label>
  );
}
