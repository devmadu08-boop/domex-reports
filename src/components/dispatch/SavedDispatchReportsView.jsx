import { useState, useMemo } from "react";
import {
  Calendar,
  Search,
  RotateCw,
  Edit3,
  Trash2,
  Eye,
  CheckCircle2,
  TrendingUp,
  Award,
  AlertCircle,
  Plus,
  Save,
  X,
  Sparkles,
  Layers,
  ArrowRight
} from "lucide-react";
import { getWhatsAppAccountKey } from "../../services/whatsappApi.js";
import {
  saveDispatchReportWithSync,
  deleteDispatchReportWithSync,
  calculateDispatchMetrics
} from "../../services/dispatchStorage.js";

export default function SavedDispatchReportsView({
  reports = [],
  session,
  onRefresh,
  onSelectForActiveView
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("all");
  const [viewingReport, setViewingReport] = useState(null);
  const [editingReport, setEditingReport] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState("");

  const accountKey = getWhatsAppAccountKey(session);

  // Month filter options
  const months = useMemo(() => {
    const set = new Set();
    reports.forEach((r) => {
      if (r.date && r.date.length >= 7) {
        set.add(r.date.substring(0, 7)); // YYYY-MM
      }
    });
    return Array.from(set).sort().reverse();
  }, [reports]);

  // Filtered reports
  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
      const matchSearch =
        !searchTerm.trim() ||
        r.date.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.items?.some((i) => (i.branch || "").toLowerCase().includes(searchTerm.toLowerCase()));

      const matchMonth =
        selectedMonth === "all" || (r.date && r.date.startsWith(selectedMonth));

      return matchSearch && matchMonth;
    });
  }, [reports, searchTerm, selectedMonth]);

  // Overall Statistics
  const overallStats = useMemo(() => {
    if (reports.length === 0) return { totalReports: 0, avgPercentage: 0, latestDate: "None" };
    const totalPerc = reports.reduce((sum, r) => sum + (r.summary?.overallPercentage || 0), 0);
    const avg = Math.round(totalPerc / reports.length);
    const latest = reports[0]?.date || "None";
    return {
      totalReports: reports.length,
      avgPercentage: avg,
      latestDate: latest
    };
  }, [reports]);

  async function handleDelete(report) {
    const confirmMsg = `Are you sure you want to delete the saved report for ${report.date}?`;
    if (!window.confirm(confirmMsg)) return;

    await deleteDispatchReportWithSync(accountKey, report.id || report.date);
    if (onRefresh) onRefresh();
    if (viewingReport?.id === report.id || viewingReport?.date === report.date) {
      setViewingReport(null);
    }
    if (editingReport?.id === report.id || editingReport?.date === report.date) {
      setEditingReport(null);
    }
  }

  function handleStartEdit(report) {
    // Deep clone to avoid mutating parent list directly
    const clonedItems = (report.items || []).map((i) => ({
      branch: i.branch || i.branch_name || "",
      target: Number(i.target) || 0,
      dispatch: Number(i.dispatch) || 0
    }));

    setEditingReport({
      id: report.id || `dispatch-report-${report.date}`,
      date: report.date,
      rawText: report.rawText || "",
      items: clonedItems,
      created_by: report.created_by || session?.branchName || "Regional Manager"
    });
    setViewingReport(null);
  }

  function handleEditItemChange(index, field, value) {
    if (!editingReport) return;
    const nextItems = [...editingReport.items];
    nextItems[index] = {
      ...nextItems[index],
      [field]: field === "branch" ? value : Math.max(0, parseInt(value, 10) || 0)
    };
    setEditingReport({ ...editingReport, items: nextItems });
  }

  function handleAddBranchRow() {
    if (!editingReport) return;
    setEditingReport({
      ...editingReport,
      items: [...editingReport.items, { branch: "", target: 100, dispatch: 0 }]
    });
  }

  function handleRemoveBranchRow(index) {
    if (!editingReport) return;
    const nextItems = editingReport.items.filter((_, i) => i !== index);
    setEditingReport({ ...editingReport, items: nextItems });
  }

  // Recalculate metrics in real-time inside editor
  const editMetrics = useMemo(() => {
    if (!editingReport) return { totalTarget: 0, totalDispatch: 0, overallPercentage: 0 };
    let totalTarget = 0;
    let totalDispatch = 0;
    for (const item of editingReport.items) {
      totalTarget += Number(item.target) || 0;
      totalDispatch += Number(item.dispatch) || 0;
    }
    const overallPercentage = totalTarget > 0 ? Math.round((totalDispatch / totalTarget) * 100) : 0;
    return { totalTarget, totalDispatch, overallPercentage };
  }, [editingReport]);

  async function handleSaveEditedReport() {
    if (!editingReport) return;
    setIsSaving(true);
    setSaveSuccessMsg("");

    try {
      const formattedItems = editingReport.items
        .filter((i) => i.branch.trim().length > 0)
        .map((i) => {
          const tgt = Number(i.target) || 0;
          const dsp = Number(i.dispatch) || 0;
          return {
            branch: i.branch.trim(),
            target: tgt,
            dispatch: dsp,
            percentage: tgt > 0 ? Math.round((dsp / tgt) * 100) : 0
          };
        });

      formattedItems.sort((a, b) => b.percentage - a.percentage);

      const summary = {
        totalTarget: editMetrics.totalTarget,
        totalDispatch: editMetrics.totalDispatch,
        overallPercentage: editMetrics.overallPercentage,
        topBranch: formattedItems[0] || null,
        lowestBranch: formattedItems.length > 0 ? formattedItems[formattedItems.length - 1] : null
      };

      const updatedPayload = {
        id: editingReport.id,
        date: editingReport.date,
        items: formattedItems,
        summary,
        rawText: editingReport.rawText,
        user: session,
        updated_at: new Date().toISOString()
      };

      await saveDispatchReportWithSync(accountKey, updatedPayload);
      setSaveSuccessMsg("✅ Report updated and saved successfully!");
      if (onRefresh) onRefresh();

      setTimeout(() => {
        setSaveSuccessMsg("");
        setEditingReport(null);
      }, 1200);
    } catch (e) {
      alert("Failed to save report: " + e.message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Top Banner & Stats */}
      <div className="glass-panel p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-black uppercase text-emerald-800">
                Persistent Archive
              </span>
              <span className="text-xs font-bold text-slate-400">•</span>
              <span className="text-xs font-bold text-slate-600">Auto &amp; Manual Saved Records</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-[#071537] mt-0.5">
              Saved Dispatch Reports (වාර්තා ඉතිහාසය)
            </h2>
            <p className="text-xs font-semibold text-[#071537]/70">
              11:30 PM Auto-saved සහ manual save කරන ලද සියලු dispatch වාර්තා මෙතැනින් පරීක්ෂා කර සංස්කරණය (Edit) කළ හැක.
            </p>
          </div>

          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-black text-slate-700 shadow-sm transition hover:bg-slate-50 shrink-0"
          >
            <RotateCw className="h-3.5 w-3.5 text-violet-700" />
            <span>Sync / Refresh</span>
          </button>
        </div>

        {/* Quick Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
          <div className="rounded-2xl border border-white/80 bg-white/70 p-3 shadow-sm">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Reports</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-black text-[#071537]">{overallStats.totalReports}</span>
              <span className="text-xs font-bold text-slate-400">saved days</span>
            </div>
          </div>

          <div className="rounded-2xl border border-white/80 bg-white/70 p-3 shadow-sm">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Avg Achievement</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-black text-emerald-700">{overallStats.avgPercentage}%</span>
              <span className="text-xs font-bold text-slate-400">across records</span>
            </div>
          </div>

          <div className="rounded-2xl border border-white/80 bg-white/70 p-3 shadow-sm">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Latest Report</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-lg font-black text-violet-900">{overallStats.latestDate}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="glass-panel p-3.5 sm:p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by date (YYYY-MM-DD) or branch name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs font-bold text-slate-800 outline-none focus:border-violet-500 shadow-sm"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500">Filter Month:</span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-violet-500 shadow-sm"
            >
              <option value="all">All Months ({reports.length})</option>
              {months.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Reports List */}
      <div className="space-y-3">
        {filteredReports.length === 0 ? (
          <div className="glass-panel p-10 text-center">
            <AlertCircle className="h-10 w-10 text-slate-300 mx-auto mb-2" />
            <h3 className="text-sm font-black text-slate-600">No Saved Dispatch Reports Found</h3>
            <p className="text-xs font-semibold text-slate-400 mt-1 max-w-md mx-auto">
              රාත්‍රී 11.30 ට ස්වයංක්‍රීයව send වන වාර්තා හෝ dashboard එකෙන් save කරන වාර්තා මෙහි ස්වයංක්‍රීයව ලැයිස්තුගත වේ.
            </p>
          </div>
        ) : (
          filteredReports.map((report) => {
            const perc = report.summary?.overallPercentage || 0;
            const totalDsp = report.summary?.totalDispatch || 0;
            const totalTgt = report.summary?.totalTarget || 0;
            const itemCount = report.items?.length || 0;
            const isAuto = report.isAutoGenerated || (report.created_by && report.created_by.includes("11:30"));

            return (
              <div
                key={report.id || report.date}
                className="glass-panel p-4 sm:p-5 transition hover:shadow-md"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  {/* Left: Date & Badges */}
                  <div className="flex items-start gap-3.5">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-800 font-black shadow-inner border border-violet-200">
                      <Calendar className="h-6 w-6" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base sm:text-lg font-black text-[#071537]">
                          {report.date}
                        </h3>
                        {isAuto ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-[10px] font-black text-blue-800">
                            🤖 11:30 PM Auto-Generated
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-black text-slate-700">
                            👤 Manual Save
                          </span>
                        )}
                        <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-bold text-purple-700">
                          {itemCount} Branches
                        </span>
                      </div>
                      <p className="text-xs font-bold text-slate-500 mt-1">
                        Dispatched: <strong className="text-slate-800">{totalDsp.toLocaleString()}</strong> / Target:{" "}
                        <strong className="text-slate-800">{totalTgt.toLocaleString()}</strong>
                        {report.created_by && ` • Saved by: ${report.created_by}`}
                      </p>
                    </div>
                  </div>

                  {/* Middle: Progress Bar */}
                  <div className="w-full md:w-56 shrink-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-bold text-slate-500">Achievement</span>
                      <span
                        className={`text-sm font-black ${
                          perc >= 90
                            ? "text-emerald-700"
                            : perc >= 75
                            ? "text-blue-700"
                            : perc >= 50
                            ? "text-amber-700"
                            : "text-red-600"
                        }`}
                      >
                        {perc}%
                      </span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 border border-slate-200">
                      <div
                        className={`h-full transition-all duration-500 ${
                          perc >= 90
                            ? "bg-emerald-500"
                            : perc >= 75
                            ? "bg-blue-500"
                            : perc >= 50
                            ? "bg-amber-500"
                            : "bg-red-500"
                        }`}
                        style={{ width: `${Math.min(100, perc)}%` }}
                      />
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2 shrink-0 border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
                    <button
                      type="button"
                      onClick={() => setViewingReport(report)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
                      title="View full branch breakdown"
                    >
                      <Eye className="h-3.5 w-3.5 text-blue-600" />
                      <span>View</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleStartEdit(report)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-black text-amber-800 shadow-sm transition hover:bg-amber-100"
                      title="Edit this report (modify counts/targets)"
                    >
                      <Edit3 className="h-3.5 w-3.5 text-amber-700" />
                      <span>Edit</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDelete(report)}
                      className="inline-flex items-center justify-center rounded-xl border border-red-200 bg-red-50 p-2 text-xs font-black text-red-600 shadow-sm transition hover:bg-red-100"
                      title="Delete report"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* MODAL: VIEW REPORT DETAILS */}
      {viewingReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-3xl border border-white bg-white p-5 sm:p-6 shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-800">
                  <Calendar className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-[#071537]">
                    Dispatch Report Breakdown — {viewingReport.date}
                  </h3>
                  <p className="text-xs font-semibold text-slate-500">
                    Achievement: {viewingReport.summary?.overallPercentage || 0}% (
                    {viewingReport.summary?.totalDispatch || 0} / {viewingReport.summary?.totalTarget || 0})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewingReport(null)}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="mt-4 flex-1 overflow-y-auto space-y-4 pr-1">
              {/* Top & Lowest Highlight Cards */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3">
                  <div className="flex items-center gap-1.5 text-emerald-800 font-black text-xs">
                    <Award className="h-4 w-4" />
                    <span>Top Branch</span>
                  </div>
                  <div className="mt-1">
                    <span className="text-sm font-black text-emerald-950">
                      {viewingReport.summary?.topBranch?.branch || "N/A"}
                    </span>
                    <span className="ml-2 text-xs font-bold text-emerald-700">
                      {viewingReport.summary?.topBranch?.percentage || 0}%
                    </span>
                  </div>
                </div>

                <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-3">
                  <div className="flex items-center gap-1.5 text-amber-800 font-black text-xs">
                    <AlertCircle className="h-4 w-4" />
                    <span>Lowest Branch</span>
                  </div>
                  <div className="mt-1">
                    <span className="text-sm font-black text-amber-950">
                      {viewingReport.summary?.lowestBranch?.branch || "N/A"}
                    </span>
                    <span className="ml-2 text-xs font-bold text-amber-700">
                      {viewingReport.summary?.lowestBranch?.percentage || 0}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Branch Items Table */}
              <div className="rounded-2xl border border-slate-200 overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-black">
                    <tr>
                      <th className="py-2.5 px-3">Branch</th>
                      <th className="py-2.5 px-3 text-right">Target</th>
                      <th className="py-2.5 px-3 text-right">Dispatched</th>
                      <th className="py-2.5 px-3 text-right">Achievement</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(viewingReport.items || []).map((item, idx) => {
                      const p = Number(item.percentage) || 0;
                      return (
                        <tr key={idx} className="hover:bg-slate-50/80 transition font-bold">
                          <td className="py-2.5 px-3 text-[#071537]">{item.branch}</td>
                          <td className="py-2.5 px-3 text-right text-slate-600">{item.target}</td>
                          <td className="py-2.5 px-3 text-right text-violet-900 font-black">
                            {item.dispatch}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <span
                              className={`rounded-md px-2 py-0.5 text-[11px] font-black ${
                                p >= 90
                                  ? "bg-emerald-100 text-emerald-800"
                                  : p >= 75
                                  ? "bg-blue-100 text-blue-800"
                                  : p >= 50
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-red-100 text-red-700"
                              }`}
                            >
                              {p}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
              <button
                type="button"
                onClick={() => handleStartEdit(viewingReport)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-black text-white shadow-sm hover:bg-amber-600 transition"
              >
                <Edit3 className="h-3.5 w-3.5" />
                <span>Edit This Report</span>
              </button>

              <button
                type="button"
                onClick={() => setViewingReport(null)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EDIT REPORT */}
      {editingReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-3xl border border-white bg-white p-5 sm:p-6 shadow-2xl overflow-hidden">
            {/* Editor Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
                  <Edit3 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-[#071537]">
                    Edit Dispatch Report — {editingReport.date}
                  </h3>
                  <p className="text-xs font-semibold text-slate-500">
                    ශාඛාවල counts සහ targets වෙනස් කර සුරකින්න (Save changes).
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingReport(null)}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Real-time Recalculated Summary Banner */}
            <div className="my-3 grid grid-cols-3 gap-2 rounded-2xl bg-amber-50/70 border border-amber-200/80 p-3 text-center">
              <div>
                <span className="text-[10px] font-bold text-amber-700 uppercase">Target</span>
                <p className="text-sm font-black text-[#071537]">{editMetrics.totalTarget}</p>
              </div>
              <div>
                <span className="text-[10px] font-bold text-amber-700 uppercase">Dispatched</span>
                <p className="text-sm font-black text-violet-900">{editMetrics.totalDispatch}</p>
              </div>
              <div>
                <span className="text-[10px] font-bold text-amber-700 uppercase">Achievement</span>
                <p className="text-sm font-black text-emerald-800">{editMetrics.overallPercentage}%</p>
              </div>
            </div>

            {saveSuccessMsg && (
              <div className="mb-2 rounded-xl bg-emerald-100 p-2.5 text-center text-xs font-black text-emerald-800 border border-emerald-200">
                {saveSuccessMsg}
              </div>
            )}

            {/* Editable Branch Items List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              <div className="grid grid-cols-12 gap-2 text-[11px] font-black text-slate-500 uppercase px-2">
                <div className="col-span-5">Branch Name</div>
                <div className="col-span-3 text-center">Target</div>
                <div className="col-span-3 text-center">Dispatch</div>
                <div className="col-span-1"></div>
              </div>

              {editingReport.items.map((item, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-12 gap-2 items-center rounded-xl border border-slate-200 bg-slate-50/70 p-2 text-xs"
                >
                  <div className="col-span-5">
                    <input
                      type="text"
                      value={item.branch}
                      onChange={(e) => handleEditItemChange(idx, "branch", e.target.value)}
                      placeholder="Branch name"
                      className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-black text-slate-800 outline-none focus:border-violet-500"
                    />
                  </div>

                  <div className="col-span-3">
                    <input
                      type="number"
                      value={item.target}
                      onChange={(e) => handleEditItemChange(idx, "target", e.target.value)}
                      placeholder="Target"
                      className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-black text-center text-slate-700 outline-none focus:border-violet-500"
                    />
                  </div>

                  <div className="col-span-3">
                    <input
                      type="number"
                      value={item.dispatch}
                      onChange={(e) => handleEditItemChange(idx, "dispatch", e.target.value)}
                      placeholder="Dispatch"
                      className="w-full rounded-lg border border-violet-300 bg-violet-50/50 px-2.5 py-1.5 font-black text-center text-violet-900 outline-none focus:border-violet-600"
                    />
                  </div>

                  <div className="col-span-1 text-center">
                    <button
                      type="button"
                      onClick={() => handleRemoveBranchRow(idx)}
                      className="rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      title="Remove row"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={handleAddBranchRow}
                className="mt-2 w-full rounded-xl border border-dashed border-slate-300 bg-white p-2.5 text-xs font-bold text-slate-600 hover:border-violet-400 hover:text-violet-700 transition flex items-center justify-center gap-1.5"
              >
                <Plus className="h-4 w-4" />
                <span>Add Branch Row (තව ශාඛාවක් එකතු කරන්න)</span>
              </button>
            </div>

            {/* Editor Footer */}
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setEditingReport(null)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={isSaving}
                onClick={handleSaveEditedReport}
                className="inline-flex items-center gap-1.5 rounded-xl bg-violet-700 px-5 py-2 text-xs font-black text-white shadow-md hover:bg-violet-800 transition disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                <span>{isSaving ? "Saving..." : "Save Changes (වෙනස්කම් සුරකින්න)"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
