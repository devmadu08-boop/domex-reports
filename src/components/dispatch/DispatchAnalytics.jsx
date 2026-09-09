import { useState } from "react";
import {
  TrendingUp,
  Award,
  AlertCircle,
  Target,
  Truck,
  Share2,
  Save,
  Search,
  CheckCircle2,
  Edit3,
  Check,
  X
} from "lucide-react";

export default function DispatchAnalytics({
  date,
  metrics,
  onUpdateItemDispatch,
  onSaveReport,
  saving,
  saveStatus,
  onOpenShareCard
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [editingBranch, setEditingBranch] = useState(null);
  const [editValue, setEditValue] = useState("");

  const { rows = [], summary = {} } = metrics || {};

  const filteredRows = rows.filter((r) =>
    r.branch.toLowerCase().includes(searchTerm.toLowerCase().trim())
  );

  function startEdit(row) {
    setEditingBranch(row.branch);
    setEditValue(String(row.dispatch));
  }

  function saveEdit(branch) {
    const parsed = parseInt(editValue, 10);
    if (!isNaN(parsed) && parsed >= 0) {
      onUpdateItemDispatch(branch, parsed);
    }
    setEditingBranch(null);
  }

  return (
    <div className="grid gap-3 sm:gap-4 md:gap-5">
      {/* KPI Cards Row - 2 columns on mobile like a native app */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        {/* Total Target */}
        <div className="glass-panel p-3 sm:p-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-xs font-black uppercase text-blue-950/60">Total Target</span>
            <span className="grid h-7 w-7 sm:h-8 sm:w-8 place-items-center rounded-xl bg-slate-100 text-slate-700">
              <Target className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </span>
          </div>
          <p className="mt-1.5 text-2xl sm:text-3xl font-black text-[#071537]">{summary.totalTarget || 0}</p>
          <p className="mt-0.5 text-[10px] sm:text-xs font-semibold text-blue-950/55">
            {summary.branchCount || 0} branches
          </p>
        </div>

        {/* Total Actual Dispatch */}
        <div className="glass-panel p-3 sm:p-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-xs font-black uppercase text-blue-950/60">Actual Dispatched</span>
            <span className="grid h-7 w-7 sm:h-8 sm:w-8 place-items-center rounded-xl bg-blue-100 text-blue-700">
              <Truck className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </span>
          </div>
          <p className="mt-1.5 text-2xl sm:text-3xl font-black text-blue-900">{summary.totalDispatch || 0}</p>
          <p className="mt-0.5 text-[10px] sm:text-xs font-semibold text-blue-950/55">Total parcels handed over</p>
        </div>

        {/* Overall Achievement % */}
        <div className="glass-panel p-3 sm:p-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-xs font-black uppercase text-blue-950/60">Achievement</span>
            <span className={`grid h-7 w-7 sm:h-8 sm:w-8 place-items-center rounded-xl ${
              summary.overallPercentage >= 100
                ? "bg-emerald-100 text-emerald-700"
                : summary.overallPercentage >= 70
                ? "bg-amber-100 text-amber-700"
                : "bg-rose-100 text-rose-700"
            }`}>
              <TrendingUp className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </span>
          </div>
          <p className={`mt-1.5 text-2xl sm:text-3xl font-black ${
            summary.overallPercentage >= 100
              ? "text-emerald-700"
              : summary.overallPercentage >= 70
              ? "text-amber-700"
              : "text-rose-700"
          }`}>
            {summary.overallPercentage || 0}%
          </p>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                summary.overallPercentage >= 100
                  ? "bg-emerald-500"
                  : summary.overallPercentage >= 70
                  ? "bg-amber-500"
                  : "bg-rose-500"
              }`}
              style={{ width: `${Math.min(100, summary.overallPercentage || 0)}%` }}
            />
          </div>
        </div>

        {/* Highlights: Top & Lowest */}
        <div className="glass-panel p-3 sm:p-4 flex flex-col justify-between">
          <div>
            <span className="text-[10px] sm:text-xs font-black uppercase text-blue-950/60">Highlights</span>
            <div className="mt-1.5 space-y-1 text-[11px] sm:text-xs font-bold">
              {summary.topBranch ? (
                <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-2 py-0.5 text-emerald-800">
                  <span className="flex items-center gap-1">
                    <Award className="h-3 w-3 text-emerald-600" />
                    {summary.topBranch.branch}
                  </span>
                  <span className="font-black">{summary.topBranch.percentage}%</span>
                </div>
              ) : (
                <span className="text-slate-400">No data</span>
              )}

              {summary.lowestBranch && (
                <div className="flex items-center justify-between rounded-lg bg-rose-50 px-2 py-0.5 text-rose-800">
                  <span className="flex items-center gap-1">
                    <AlertCircle className="h-3 w-3 text-rose-600" />
                    {summary.lowestBranch.branch}
                  </span>
                  <span className="font-black">{summary.lowestBranch.percentage}%</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Interactive Table Panel */}
      <div className="glass-panel p-3.5 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-white/60">
          <div>
            <h3 className="text-base font-black text-[#071537]">
              Branch Performance Table
            </h3>
            <p className="text-xs font-bold text-slate-500">
              {filteredRows.length} active branches in this report
            </p>
          </div>

          <div className="grid grid-cols-1 sm:flex sm:items-center gap-2 w-full sm:w-auto">
            {/* Search filter */}
            <div className="relative w-full sm:w-44">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search branch..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-10 w-full rounded-xl border border-white/80 bg-white/80 pl-8 pr-3 text-xs font-bold text-[#071537] outline-none focus:bg-white focus:ring-2 focus:ring-violet-300"
              />
            </div>

            <button
              type="button"
              onClick={onOpenShareCard}
              disabled={!rows.length}
              className="inline-flex h-10 w-full sm:w-auto items-center justify-center gap-1.5 rounded-xl border border-violet-200 bg-white px-3 text-xs font-black text-violet-800 shadow-sm transition hover:bg-violet-50 disabled:opacity-40"
            >
              <Share2 className="h-4 w-4" />
              Share Card / Export
            </button>

            <button
              type="button"
              onClick={onSaveReport}
              disabled={saving || !rows.length}
              className="primary-action primary-action-green min-h-10 w-full sm:w-auto px-4 text-xs shadow-sm transition disabled:opacity-40"
            >
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : "Save Daily Report"}
            </button>
          </div>
        </div>

        {saveStatus && (
          <div className="mt-3 rounded-xl bg-emerald-50 px-4 py-2 text-xs font-bold text-emerald-800">
            {saveStatus}
          </div>
        )}

        {/* Performance Table (Desktop) */}
        <div className="mt-4 hidden md:block overflow-x-auto rounded-2xl border border-white/80 bg-white/70 shadow-sm">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="bg-slate-100/80 text-xs font-black uppercase text-slate-600">
              <tr>
                <th className="px-4 py-3">Rank</th>
                <th className="px-4 py-3">Branch Name</th>
                <th className="px-4 py-3 text-right">Target</th>
                <th className="px-4 py-3 text-right">Actual Dispatch</th>
                <th className="px-4 py-3" style={{ width: "200px" }}>Progress</th>
                <th className="px-4 py-3 text-right">Achievement</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Edit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-bold text-[#071537]">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-4 py-8 text-center text-xs text-slate-400">
                    No dispatch records matching. Paste unstructured text above and click Process.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row, idx) => (
                  <tr key={row.branch} className="hover:bg-white/90 transition-colors">
                    <td className="px-4 py-3 font-black text-slate-400">#{idx + 1}</td>
                    <td className="px-4 py-3">
                      <span className="font-black text-[#071537]">{row.branch}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-500">{row.target}</td>
                    <td className="px-4 py-3 text-right font-black text-blue-900">
                      {editingBranch === row.branch ? (
                        <input
                          type="number"
                          min="0"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="h-8 w-20 rounded border border-violet-300 bg-white px-1 text-right text-xs font-bold outline-none"
                        />
                      ) : (
                        row.dispatch
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            row.percentage >= 100
                              ? "bg-emerald-500"
                              : row.percentage >= 70
                              ? "bg-amber-400"
                              : "bg-rose-500"
                          }`}
                          style={{ width: `${Math.min(100, row.percentage)}%` }}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-black text-slate-800">{row.percentage}%</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-black ${
                          row.status === "excellent"
                            ? "bg-emerald-100 text-emerald-800"
                            : row.status === "good"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-rose-100 text-rose-800"
                        }`}
                      >
                        {row.statusLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {editingBranch === row.branch ? (
                        <div className="inline-flex gap-1">
                          <button
                            type="button"
                            onClick={() => saveEdit(row.branch)}
                            className="grid h-7 w-7 place-items-center rounded bg-emerald-100 text-emerald-700"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingBranch(null)}
                            className="grid h-7 w-7 place-items-center rounded bg-slate-100 text-slate-600"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEdit(row)}
                          className="grid h-7 w-7 place-items-center rounded bg-slate-100 text-slate-600 hover:bg-slate-200"
                          title="Edit dispatch number"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Performance List (Mobile Native App Style) */}
        <div className="mt-4 grid md:hidden gap-3">
          {filteredRows.length === 0 ? (
            <div className="rounded-2xl border border-white/80 bg-white/70 p-6 text-center text-xs text-slate-400 shadow-sm">
              No dispatch records matching. Paste unstructured text above and click Process.
            </div>
          ) : (
            filteredRows.map((row, idx) => (
              <div key={row.branch} className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm hover:shadow-md transition-shadow">
                 <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                       <span className="text-xs font-black text-slate-400">#{idx + 1}</span>
                       <span className="font-black text-[#071537] text-base leading-none">{row.branch}</span>
                    </div>
                    <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-black ${
                          row.status === "excellent"
                            ? "bg-emerald-100 text-emerald-800"
                            : row.status === "good"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-rose-100 text-rose-800"
                        }`}
                      >
                        {row.statusLabel}
                      </span>
                 </div>
                 
                 <div className="flex justify-between items-center mb-3 mt-4">
                    <div>
                       <p className="text-slate-400 font-black uppercase text-[10px]">Target</p>
                       <p className="font-black text-slate-600 text-sm">{row.target}</p>
                    </div>
                    <div className="text-right">
                       <p className="text-blue-900/50 font-black uppercase text-[10px]">Actual Dispatched</p>
                       {editingBranch === row.branch ? (
                         <input
                           type="number"
                           min="0"
                           value={editValue}
                           onChange={(e) => setEditValue(e.target.value)}
                           className="h-8 w-20 mt-1 rounded border border-violet-300 bg-slate-50 px-2 text-right text-sm font-black text-blue-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
                         />
                       ) : (
                         <p className="font-black text-blue-900 text-xl leading-none mt-1">{row.dispatch}</p>
                       )}
                    </div>
                 </div>

                 <div className="flex items-center gap-3 mb-3 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <div className="flex-1 h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            row.percentage >= 100
                              ? "bg-emerald-500"
                              : row.percentage >= 70
                              ? "bg-amber-400"
                              : "bg-rose-500"
                          }`}
                          style={{ width: `${Math.min(100, row.percentage)}%` }}
                        />
                    </div>
                    <span className="font-black text-slate-800 text-xs w-12 text-right">{row.percentage}%</span>
                 </div>
                 
                 <div className="flex justify-end pt-2 border-t border-slate-100">
                      {editingBranch === row.branch ? (
                        <div className="inline-flex gap-2 w-full sm:w-auto">
                          <button
                            type="button"
                            onClick={() => setEditingBranch(null)}
                            className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg bg-slate-100 text-slate-600 font-bold text-xs"
                          >
                            <X className="h-4 w-4" /> Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => saveEdit(row.branch)}
                            className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg bg-emerald-100 text-emerald-800 font-black text-xs"
                          >
                            <Check className="h-4 w-4" /> Save
                          </button>
                        </div>
                      ) : (
                        <button 
                          onClick={() => startEdit(row)} 
                          className="flex items-center gap-1.5 text-xs font-black text-slate-400 hover:text-slate-800 transition-colors"
                        >
                           <Edit3 className="h-3.5 w-3.5" /> Edit Actual
                        </button>
                      )}
                 </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
