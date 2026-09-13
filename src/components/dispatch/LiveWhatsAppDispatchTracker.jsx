import { useEffect, useState, useCallback } from "react";
import {
  Radio,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Clock,
  ArrowRight,
  Copy,
  Check,
  Sparkles,
  Layers,
  MessageSquare,
  Send,
  Trash2,
  Pencil,
  X
} from "lucide-react";
import { getWhatsAppAccountKey } from "../../services/whatsappApi.js";

export default function LiveWhatsAppDispatchTracker({
  targets = [],
  session,
  onApplyLiveText,
  onApplyLiveItems
}) {
  const [liveData, setLiveData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [activeView, setActiveView] = useState("all");
  const [copiedReminder, setCopiedReminder] = useState(false);
  const [sendingReminder, setSendingReminder] = useState(false);
  const [sendingReport, setSendingReport] = useState(false);
  const [sentMessages, setSentMessages] = useState([]);
  const [deletingId, setDeletingId] = useState(null);
  const [editingBranch, setEditingBranch] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  async function handleSaveBranchDispatch(branch, count) {
    if (!branch) return;
    setSavingEdit(true);
    try {
      const accountKey = getWhatsAppAccountKey(session);
      const res = await fetch("/api/regional-dispatch/set-dispatch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-whatsapp-account": accountKey
        },
        body: JSON.stringify({ branch, dispatch: Number(count) || 0 })
      });
      if (res.ok) {
        setEditingBranch(null);
        setEditValue("");
        await fetchLiveStatus();
      } else {
        const data = await res.json();
        alert("Failed to update: " + (data.error || "Unknown error"));
      }
    } catch (e) {
      alert("Error: " + e.message);
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDeleteBranchDispatch(branch) {
    if (!window.confirm(`Are you sure you want to delete/reset the dispatch record for "${branch}"? It will return to Pending.`)) {
      return;
    }
    try {
      const accountKey = getWhatsAppAccountKey(session);
      const res = await fetch("/api/regional-dispatch/reset-dispatch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-whatsapp-account": accountKey
        },
        body: JSON.stringify({ branch })
      });
      if (res.ok) {
        await fetchLiveStatus();
      } else {
        const data = await res.json();
        alert("Failed to reset: " + (data.error || "Unknown error"));
      }
    } catch (e) {
      alert("Error: " + e.message);
    }
  }

  async function handleResetAllDispatches() {
    if (!window.confirm("⚠️ Are you sure you want to RESET ALL dispatch records for today? All branches will return to Pending!")) {
      return;
    }
    try {
      const accountKey = getWhatsAppAccountKey(session);
      const res = await fetch("/api/regional-dispatch/reset-all", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-whatsapp-account": accountKey
        }
      });
      if (res.ok) {
        await fetchLiveStatus();
      } else {
        const data = await res.json();
        alert("Failed to reset all: " + (data.error || "Unknown error"));
      }
    } catch (e) {
      alert("Error: " + e.message);
    }
  }

  const fetchSentMessages = useCallback(async () => {
    try {
      const accountKey = getWhatsAppAccountKey(session);
      const res = await fetch("/api/regional-dispatch/sent-messages", {
        headers: { "x-whatsapp-account": accountKey }
      });
      if (res.ok) {
        const data = await res.json();
        setSentMessages(Array.isArray(data.messages) ? data.messages : []);
      }
    } catch (e) {
      console.warn("Failed to fetch sent messages:", e);
    }
  }, [session]);

  async function handleSendReminderToGroup() {
    if (!window.confirm("Send dispatch count reminder to WhatsApp group now?")) return;
    setSendingReminder(true);
    try {
      const accountKey = getWhatsAppAccountKey(session);
      const res = await fetch("/api/regional-dispatch/trigger", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-whatsapp-account": accountKey
        },
        body: JSON.stringify({
          mode: "reminder",
          targets: targets.map(t => ({
            branch: t.branch_name,
            target: Number(t.target) || 0
          }))
        })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        alert("✅ Reminder message sent to WhatsApp group successfully!");
        fetchSentMessages();
      } else {
        alert(`❌ Failed: ${data.error || "Could not send reminder"}`);
      }
    } catch (e) {
      alert("❌ Error: " + e.message);
    } finally {
      setSendingReminder(false);
    }
  }

  async function handleSendReportToGroup() {
    if (!window.confirm("Send 11:30 PM performance report image to WhatsApp group now?")) return;
    setSendingReport(true);
    try {
      const accountKey = getWhatsAppAccountKey(session);
      const res = await fetch("/api/regional-dispatch/trigger", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-whatsapp-account": accountKey
        },
        body: JSON.stringify({
          mode: "report",
          targets: targets.map(t => ({
            branch: t.branch_name,
            target: Number(t.target) || 0
          }))
        })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        alert("✅ Performance report sent to WhatsApp group successfully!");
        fetchSentMessages();
      } else {
        alert(`❌ Failed: ${data.error || "Could not send report"}`);
      }
    } catch (e) {
      alert("❌ Error: " + e.message);
    } finally {
      setSendingReport(false);
    }
  }

  async function handleDeleteMessage(msg) {
    if (!window.confirm(`Are you sure you want to Delete for Everyone "${msg.title}" from WhatsApp group? This cannot be undone.`)) {
      return;
    }
    setDeletingId(msg.id);
    try {
      const accountKey = getWhatsAppAccountKey(session);
      const res = await fetch("/api/regional-dispatch/delete-message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-whatsapp-account": accountKey
        },
        body: JSON.stringify({ messageId: msg.id })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        alert("🗑️ Message deleted for everyone in the WhatsApp group successfully!");
        fetchSentMessages();
      } else {
        alert(`❌ Delete failed: ${data.error || "Could not delete message"}`);
      }
    } catch (err) {
      alert("❌ Error: " + err.message);
    } finally {
      setDeletingId(null);
    }
  }

  const fetchLiveStatus = useCallback(async () => {
    setLoading(true);
    try {
      const accountKey = getWhatsAppAccountKey(session);

      const res = await fetch("/api/regional-dispatch/live", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-whatsapp-account": accountKey
        },
        body: JSON.stringify({
          targets: targets.map(t => ({
            branch: t.branch_name,
            target: Number(t.target) || 0
          }))
        })
      });

      if (res.ok) {
        const data = await res.json();
        setLiveData(data);
        setLastRefreshed(new Date());
      }
    } catch (err) {
      console.warn("Failed to fetch live dispatch status:", err);
    } finally {
      setLoading(false);
    }
  }, [session, targets]);

  useEffect(() => {
    fetchLiveStatus();
    fetchSentMessages();
  }, [fetchLiveStatus, fetchSentMessages]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => {
      fetchLiveStatus();
      fetchSentMessages();
    }, 15000);
    return () => clearInterval(timer);
  }, [autoRefresh, fetchLiveStatus, fetchSentMessages]);

  function handleCopyReminder() {
    if (!liveData?.unsubmitted) return;
    const list = liveData.unsubmitted.map(b => `❌ ${b.branch} (Target: ${b.target})`).join("\n");
    const submittedList = liveData.submitted?.length > 0
      ? liveData.submitted.map(b => `✅ ${b.branch}: ${b.dispatch}`).join("\n")
      : "කිසිවක් නැත";

    const text = `🚨 *DOMEX Dispatch Count Reminder*\n\nකරුණාකර පහත ශාඛාවන් රාත්‍රී 11.30 ට පෙර ඔබගේ Dispatch Counts ලබා දෙන්න:\n\n*ලබා දී නොමැති ශාඛාවන්:*\n${list}\n\n*ලබා දී ඇති ශාඛාවන්:*\n${submittedList}`;
    navigator.clipboard.writeText(text);
    setCopiedReminder(true);
    setTimeout(() => setCopiedReminder(false), 2500);
  }

  function handleApplyToParser() {
    if (liveData?.rawText && onApplyLiveText) {
      onApplyLiveText(liveData.rawText);
    }
  }

  function handleApplyToReport() {
    if (liveData?.submitted && onApplyLiveItems) {
      const items = liveData.submitted.map(s => ({
        branch: s.branch,
        dispatch: s.dispatch
      }));
      onApplyLiveItems(items);
    }
  }

  const submitted = liveData?.submitted || [];
  const unsubmitted = liveData?.unsubmitted || [];
  const totalBranches = (submitted.length + unsubmitted.length) || targets.length || 0;
  const submittedCount = submitted.length;
  const unsubmittedCount = unsubmitted.length;
  const totalDispatch = liveData?.totalDispatch || 0;
  const totalTarget = liveData?.totalTarget || 0;
  const overallPercentage = liveData?.overallPercentage || 0;

  return (
    <div className="glass-panel overflow-hidden border border-violet-200/80 bg-gradient-to-br from-white via-violet-50/20 to-purple-50/30 p-4 sm:p-5 shadow-lg shadow-violet-100/50">
      {/* Top Header with Live Indicator and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3.5 border-b border-violet-100">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-3.5 w-3.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500"></span>
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base sm:text-lg font-black text-[#071537]">
                Live WhatsApp Dispatch Stream
              </h3>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black uppercase text-emerald-800">
                Live (4 PM - 11:30 PM)
              </span>
            </div>
            <p className="text-xs font-semibold text-slate-500">
              {liveData?.rawMessagesCount || 0} messages captured today from group
              {lastRefreshed && (
                <span> &bull; Refreshed at {lastRefreshed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-bold transition ${
              autoRefresh
                ? "bg-violet-100 text-violet-800 hover:bg-violet-200"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
            title={autoRefresh ? "Auto-refreshing every 15s" : "Auto-refresh is paused"}
          >
            <Radio className={`h-3.5 w-3.5 ${autoRefresh ? "animate-pulse text-violet-600" : ""}`} />
            <span>{autoRefresh ? "Auto-Live: ON" : "Auto-Live: OFF"}</span>
          </button>

          <button
            type="button"
            onClick={fetchLiveStatus}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-xl border border-violet-200 bg-white px-2.5 py-1.5 text-xs font-black text-violet-900 shadow-sm transition hover:bg-violet-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-violet-700 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* KPI Metric Summary Cards */}
      <div className="mt-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/60 p-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase text-emerald-800">Submitted</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-xl sm:text-2xl font-black text-emerald-950">{submittedCount}</span>
            <span className="text-xs font-bold text-emerald-700">/ {totalBranches}</span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-emerald-200/70">
            <div
              className="h-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${totalBranches > 0 ? (submittedCount / totalBranches) * 100 : 0}%` }}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-amber-200/80 bg-amber-50/60 p-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase text-amber-800">Pending / Missing</span>
            <AlertCircle className="h-4 w-4 text-amber-600" />
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-xl sm:text-2xl font-black text-amber-950">{unsubmittedCount}</span>
            <span className="text-xs font-bold text-amber-700">branches</span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-amber-200/70">
            <div
              className="h-full bg-amber-500 transition-all duration-500"
              style={{ width: `${totalBranches > 0 ? (unsubmittedCount / totalBranches) * 100 : 0}%` }}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-blue-200/80 bg-blue-50/60 p-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase text-blue-800">Live Dispatched</span>
            <TrendingUp className="h-4 w-4 text-blue-600" />
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-xl sm:text-2xl font-black text-blue-950">{totalDispatch.toLocaleString()}</span>
            <span className="text-xs font-bold text-blue-700">/ {totalTarget.toLocaleString()}</span>
          </div>
          <p className="mt-1.5 text-[10px] font-bold text-blue-700 truncate">
            Expected Target: {totalTarget}
          </p>
        </div>

        <div className="rounded-2xl border border-violet-200/80 bg-violet-50/60 p-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase text-violet-800">Achievement</span>
            <span className="text-xs font-black text-violet-700">%</span>
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-xl sm:text-2xl font-black text-violet-950">{overallPercentage}%</span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-violet-200/70">
            <div
              className="h-full bg-violet-600 transition-all duration-500"
              style={{ width: `${Math.min(overallPercentage, 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Filter Tabs & Quick Action Bar */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2.5">
        <div className="inline-flex rounded-xl bg-slate-100/90 p-1 border border-slate-200/60">
          <button
            type="button"
            onClick={() => setActiveView("all")}
            className={`rounded-lg px-3 py-1 text-xs font-black transition ${
              activeView === "all" ? "bg-white text-[#071537] shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            All ({totalBranches})
          </button>
          <button
            type="button"
            onClick={() => setActiveView("submitted")}
            className={`rounded-lg px-3 py-1 text-xs font-black transition ${
              activeView === "submitted" ? "bg-emerald-600 text-white shadow-sm" : "text-emerald-800 hover:text-emerald-950"
            }`}
          >
            Submitted ({submittedCount})
          </button>
          <button
            type="button"
            onClick={() => setActiveView("unsubmitted")}
            className={`rounded-lg px-3 py-1 text-xs font-black transition ${
              activeView === "unsubmitted" ? "bg-amber-600 text-white shadow-sm" : "text-amber-800 hover:text-amber-950"
            }`}
          >
            Pending ({unsubmittedCount})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Send Reminder to Group Button */}
          <button
            type="button"
            onClick={handleSendReminderToGroup}
            disabled={sendingReminder}
            className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400 bg-amber-500 px-3.5 py-1.5 text-xs font-black text-slate-950 shadow-md shadow-amber-200 transition hover:bg-amber-400 disabled:opacity-50"
            title="Send reminder to WhatsApp group now"
          >
            <Send className={`h-3.5 w-3.5 ${sendingReminder ? "animate-spin" : ""}`} />
            <span>{sendingReminder ? "Sending..." : "Send Reminder to Group"}</span>
          </button>

          {/* Send Full Report to Group Button */}
          <button
            type="button"
            onClick={handleSendReportToGroup}
            disabled={sendingReport}
            className="inline-flex items-center gap-1.5 rounded-xl border border-blue-400 bg-blue-600 px-3 py-1.5 text-xs font-black text-white shadow-md shadow-blue-200 transition hover:bg-blue-700 disabled:opacity-50"
            title="Send full 11:30 PM performance report image to WhatsApp group now"
          >
            <Layers className={`h-3.5 w-3.5 ${sendingReport ? "animate-spin" : ""}`} />
            <span>{sendingReport ? "Sending Report..." : "Send Report to Group"}</span>
          </button>

          {unsubmittedCount > 0 && (
            <button
              type="button"
              onClick={handleCopyReminder}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              {copiedReminder ? <Check className="h-3.5 w-3.5 text-emerald-700" /> : <Copy className="h-3.5 w-3.5 text-slate-500" />}
              <span>{copiedReminder ? "Copied!" : "Copy Reminder Text"}</span>
            </button>
          )}

          {liveData?.rawText && (
            <button
              type="button"
              onClick={handleApplyToParser}
              className="inline-flex items-center gap-1.5 rounded-xl border border-violet-300 bg-violet-600 px-3 py-1.5 text-xs font-black text-white shadow-sm transition hover:bg-violet-700"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span>Load into Parser</span>
            </button>
          )}

          {submittedCount > 0 && (
            <button
              type="button"
              onClick={handleApplyToReport}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-xs font-black text-white shadow-sm transition hover:bg-emerald-700"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Apply to Report</span>
            </button>
          )}

          {submittedCount > 0 && (
            <button
              type="button"
              onClick={handleResetAllDispatches}
              className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 shadow-sm transition hover:bg-rose-100 hover:text-rose-800"
              title="Reset all branch records back to Pending"
            >
              <Trash2 className="h-3.5 w-3.5 text-rose-500" />
              <span>Reset All</span>
            </button>
          )}
        </div>
      </div>

      {/* Grid of Branch Status Cards */}
      <div className="mt-3.5 max-h-[360px] overflow-y-auto pr-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {(activeView === "all" || activeView === "submitted") &&
            submitted.map((b) => (
              <div
                key={b.branch}
                className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/40 p-2.5 transition hover:bg-emerald-50"
              >
                <div className="min-w-0 flex-1 pr-2">
                  <div className="flex items-center gap-1.5">
                    <span className="flex h-2 w-2 rounded-full bg-emerald-500"></span>
                    <h4 className="text-xs font-black text-emerald-950 truncate" title={b.branch}>
                      {b.branch}
                    </h4>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] font-bold text-slate-500">
                    <span>Target: {b.target}</span>
                    <span>&bull;</span>
                    <span className={b.percentage >= 100 ? "text-emerald-700" : "text-slate-700"}>
                      {b.percentage}%
                    </span>
                  </div>
                </div>

                {editingBranch === b.branch ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="w-16 rounded border border-emerald-400 bg-white px-1.5 py-0.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      autoFocus
                      placeholder="Count"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveBranchDispatch(b.branch, editValue);
                        if (e.key === "Escape") setEditingBranch(null);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveBranchDispatch(b.branch, editValue)}
                      disabled={savingEdit}
                      className="rounded bg-emerald-600 p-1 text-white hover:bg-emerald-700 transition"
                      title="Save"
                    >
                      <Check className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingBranch(null)}
                      className="rounded bg-slate-200 p-1 text-slate-600 hover:bg-slate-300 transition"
                      title="Cancel"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="text-right shrink-0">
                      <span className="text-base font-black text-emerald-800">
                        {b.dispatch.toLocaleString()}
                      </span>
                      <span className="block text-[9px] font-black uppercase tracking-wider text-emerald-600">
                        Dispatched
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingBranch(b.branch);
                        setEditValue(String(b.dispatch));
                      }}
                      className="rounded p-1 text-slate-400 hover:bg-emerald-100 hover:text-emerald-700 transition"
                      title="Edit Dispatch Count"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteBranchDispatch(b.branch)}
                      className="rounded p-1 text-slate-400 hover:bg-rose-100 hover:text-rose-600 transition"
                      title="Delete / Reset record"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            ))}

          {(activeView === "all" || activeView === "unsubmitted") &&
            unsubmitted.map((b) => (
              <div
                key={b.branch}
                className="flex items-center justify-between rounded-xl border border-dashed border-amber-300 bg-amber-50/40 p-2.5 transition hover:bg-amber-50"
              >
                <div className="min-w-0 flex-1 pr-2">
                  <div className="flex items-center gap-1.5">
                    <span className="flex h-2 w-2 rounded-full bg-amber-400"></span>
                    <h4 className="text-xs font-black text-amber-950 truncate" title={b.branch}>
                      {b.branch}
                    </h4>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] font-bold text-slate-500">
                    <span>Target: {b.target}</span>
                  </div>
                </div>

                {editingBranch === b.branch ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="w-16 rounded border border-amber-400 bg-white px-1.5 py-0.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      autoFocus
                      placeholder="Count"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveBranchDispatch(b.branch, editValue);
                        if (e.key === "Escape") setEditingBranch(null);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveBranchDispatch(b.branch, editValue)}
                      disabled={savingEdit}
                      className="rounded bg-amber-600 p-1 text-white hover:bg-amber-700 transition"
                      title="Save"
                    >
                      <Check className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingBranch(null)}
                      className="rounded bg-slate-200 p-1 text-slate-600 hover:bg-slate-300 transition"
                      title="Cancel"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="text-right shrink-0">
                      <span className="rounded-lg bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800">
                        Pending
                      </span>
                      <span className="block text-[9px] font-bold text-slate-400 mt-0.5">
                        Not sent yet
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingBranch(b.branch);
                        setEditValue("");
                      }}
                      className="rounded p-1 text-slate-400 hover:bg-amber-100 hover:text-amber-700 transition"
                      title="Enter Dispatch Count"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            ))}
        </div>

        {totalBranches === 0 && (
          <div className="p-8 text-center text-xs font-semibold text-slate-500">
            No branch targets configured. Add targets to track live dispatches.
          </div>
        )}
      </div>

      {/* Recent Sent Messages History & Delete for Everyone */}
      <div className="mt-4 border-t border-slate-200/80 pt-3.5">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-blue-500 animate-pulse"></span>
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
              <span>Recent WhatsApp Messages</span>
              <span className="text-slate-400 font-normal">&bull;</span>
              <span className="text-slate-600 font-bold">මෑතකදී යැවූ පණිවිඩ</span>
            </h4>
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-black text-blue-700 border border-blue-200">
              {sentMessages.length} {sentMessages.length === 1 ? "Message" : "Messages"}
            </span>
          </div>
          <span className="text-[10px] font-bold text-slate-400">
            Revoke / Delete for Everyone
          </span>
        </div>

        {sentMessages.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-4 text-center">
            <p className="text-xs font-semibold text-slate-600">
              තවමත් පද්ධතියෙන් පණිවිඩ යවා නොමැත.
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              "Send Reminder to Group" හෝ "Send Report to Group" ක්ලික් කළ විට හෝ ස්වයංක්‍රීයව පණිවිඩ යැවූ පසු ඒවා මෙහි සටහන් වන අතර, ඕනෑම මොහොතක <b>Delete for Everyone</b> කළ හැක.
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {sentMessages.slice(0, 15).map((msg) => (
              <div
                key={msg.id}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/80 p-2.5 transition hover:bg-slate-100"
              >
                <div className="min-w-0 flex-1 pr-3">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                      msg.type === "reminder" ? "bg-amber-100 text-amber-800 border border-amber-200" : "bg-blue-100 text-blue-800 border border-blue-200"
                    }`}>
                      {msg.type}
                    </span>
                    <h5 className="text-xs font-bold text-slate-900 truncate">
                      {msg.title}
                    </h5>
                    <span className="text-[10px] text-slate-400">
                      {new Date(msg.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  {msg.preview && (
                    <p className="mt-0.5 text-[11px] text-slate-500 truncate">
                      {msg.preview}
                    </p>
                  )}
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  {msg.status === "deleted" ? (
                    <span className="rounded-lg bg-rose-50 px-2.5 py-1 text-[10px] font-black text-rose-600 border border-rose-200">
                      Deleted for Everyone
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={deletingId === msg.id}
                      onClick={() => handleDeleteMessage(msg)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 shadow-sm transition hover:bg-rose-600 hover:text-white disabled:opacity-50"
                      title="Delete this message for everyone from the WhatsApp group"
                    >
                      <Trash2 className={`h-3 w-3 ${deletingId === msg.id ? "animate-spin" : ""}`} />
                      <span>{deletingId === msg.id ? "Deleting..." : "Delete for Everyone"}</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
