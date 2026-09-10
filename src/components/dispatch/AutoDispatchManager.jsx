import { useEffect, useMemo, useState } from "react";
import {
  Send,
  Target,
  History,
  Calendar,
  Sparkles,
  TrendingUp,
  Settings,
  Layers,
  Clock,
  RotateCcw
} from "lucide-react";
import SpecialUserGuard from "./SpecialUserGuard.jsx";
import DispatchProcessor from "./DispatchProcessor.jsx";
import DispatchAnalytics from "./DispatchAnalytics.jsx";
import BranchTargetModal from "./BranchTargetModal.jsx";
import DispatchShareCard from "./DispatchShareCard.jsx";
import LiveWhatsAppDispatchTracker from "./LiveWhatsAppDispatchTracker.jsx";
import { parseDispatchText } from "../../services/geminiDispatchService.js";
import {
  getDispatchTargets,
  calculateDispatchMetrics,
  getDispatchReportsHistory,
  getDispatchReportByDate,
  saveDispatchReport,
  deleteDispatchReport
} from "../../services/dispatchStorage.js";
import { getSettings, saveSettings } from "../../services/reportStorage.js";
import { todayIso, displayDate } from "../../utils/date.js";

export default function AutoDispatchManager({ session, onBackToDashboard }) {
  const [date, setDate] = useState(todayIso());
  const [targets, setTargets] = useState([]);
  const [rawText, setRawText] = useState("");
  const [parsedItems, setParsedItems] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [processMeta, setProcessMeta] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");

  const [showTargetModal, setShowTargetModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  const [settings, setLocalSettings] = useState(() => getSettings());

  // Load targets
  useEffect(() => {
    setTargets(getDispatchTargets());
  }, []);

  // Check if a saved report exists for the selected date
  useEffect(() => {
    const saved = getDispatchReportByDate(date);
    if (saved) {
      setParsedItems(saved.items || []);
      setRawText(saved.rawText || "");
      setProcessMeta({ method: "saved", modelUsed: "loaded-from-history" });
    } else {
      setParsedItems([]);
      setRawText("");
      setProcessMeta(null);
    }
    setSaveStatus("");
  }, [date]);

  function refreshTargets() {
    setTargets(getDispatchTargets());
  }

  function handleSaveApiKey(key) {
    const next = saveSettings({ geminiApiKey: key });
    setLocalSettings(next);
  }

  // Calculate Metrics whenever parsedItems or targets change
  const metrics = useMemo(() => {
    return calculateDispatchMetrics(parsedItems, targets);
  }, [parsedItems, targets]);

  async function handleProcess() {
    if (!rawText.trim()) return;
    setProcessing(true);
    setProcessMeta(null);

    try {
      const result = await parseDispatchText(rawText, targets, settings.geminiApiKey);
      setParsedItems(result.items || []);
      setProcessMeta({
        method: result.method,
        modelUsed: result.modelUsed,
        warning: result.warning
      });
    } catch (err) {
      console.error("Processing error:", err);
    } finally {
      setProcessing(false);
    }
  }

  function handleUpdateItemDispatch(branchName, newDispatch) {
    setParsedItems((prev) => {
      const idx = prev.findIndex((i) => i.branch.toLowerCase() === branchName.toLowerCase());
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], dispatch: newDispatch };
        return next;
      }
      return [...prev, { branch: branchName, dispatch: newDispatch }];
    });
  }

  function handleSaveReport() {
    if (!parsedItems.length) return;
    setSaving(true);
    setSaveStatus("");

    try {
      saveDispatchReport({
        date,
        items: parsedItems,
        summary: metrics.summary,
        rawText,
        user: session
      });
      setSaveStatus(`Dispatch report for ${date} saved successfully.`);
      setTimeout(() => setSaveStatus(""), 3500);
    } catch (err) {
      setSaveStatus(`Failed to save: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SpecialUserGuard session={session} onBack={onBackToDashboard}>
      <div className="grid gap-4 md:gap-5">
        {/* Header Banner with DOMEX Branding */}
        <div className="glass-panel p-3.5 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
            <div className="flex items-start gap-3">
              <img
                src="/report-assets/domex-logo-new.jpg"
                alt="DOMEX Logo"
                className="h-11 sm:h-12 w-auto object-contain rounded-xl shadow-sm"
                onError={(e) => {
                  e.target.src = "/report-assets/domex-logo.png";
                }}
              />
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-[10px] sm:text-[11px] font-black uppercase text-violet-800">
                    Restricted Module
                  </span>
                  <span className="text-xs font-bold text-slate-400">•</span>
                  <span className="text-xs font-bold text-slate-600">Regional Manager</span>
                </div>
                <h1 className="text-lg sm:text-2xl font-black text-[#071537] leading-tight">
                  Auto-Dispatch &amp; Branch Analytics
                </h1>
                {/* Highlighted Logged-in User */}
                <div className="mt-1">
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-violet-100/80 px-2.5 py-0.5 text-xs font-black text-violet-900 border border-violet-200">
                    👤 Logged in as: <strong className="underline">{session?.branchName || session?.homeBranchName || "Regional Manager"}</strong>
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Actions - Mobile Friendly Toolbar */}
            <div className="grid grid-cols-3 sm:flex sm:items-center gap-2 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200">
              <div className="flex items-center justify-center gap-1 rounded-2xl border border-white/80 bg-white/80 px-2 py-2 shadow-sm text-center">
                <Calendar className="h-3.5 w-3.5 text-violet-700 shrink-0" />
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="bg-transparent text-xs font-black text-[#071537] outline-none max-w-[105px]"
                />
              </div>

              <button
                type="button"
                onClick={() => setShowTargetModal(true)}
                className="inline-flex items-center justify-center gap-1 rounded-2xl border border-white/80 bg-white/80 px-2.5 py-2 text-xs font-black text-[#071537] shadow-sm transition hover:bg-white text-center"
              >
                <Target className="h-3.5 w-3.5 text-violet-700" />
                <span>Targets ({targets.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setShowHistoryModal(true)}
                className="inline-flex items-center justify-center gap-1 rounded-2xl border border-white/80 bg-white/80 px-2.5 py-2 text-xs font-black text-[#071537] shadow-sm transition hover:bg-white text-center"
              >
                <History className="h-3.5 w-3.5 text-blue-700" />
                <span>History</span>
              </button>
            </div>
          </div>
        </div>

        {/* Live WhatsApp Group Dispatch Stream Tracker */}
        <LiveWhatsAppDispatchTracker
          targets={targets}
          session={session}
          onApplyLiveText={(text) => {
            setRawText(text);
          }}
          onApplyLiveItems={(items) => {
            setParsedItems(items);
            setProcessMeta({
              method: "whatsapp-live",
              modelUsed: "live-stream-sync"
            });
          }}
        />

        {/* Text Processor Section */}
        <DispatchProcessor
          rawText={rawText}
          onRawTextChange={setRawText}
          onProcess={handleProcess}
          processing={processing}
          processMeta={processMeta}
          apiKey={settings.geminiApiKey}
          onSaveApiKey={handleSaveApiKey}
        />

        {/* Analytics Dashboard Section */}
        <DispatchAnalytics
          date={date}
          metrics={metrics}
          onUpdateItemDispatch={handleUpdateItemDispatch}
          onSaveReport={handleSaveReport}
          saving={saving}
          saveStatus={saveStatus}
          onOpenShareCard={() => setShowShareModal(true)}
        />

        {/* Branch Targets Modal */}
        {showTargetModal && (
          <BranchTargetModal
            targets={targets}
            onTargetsChange={refreshTargets}
            onClose={() => setShowTargetModal(false)}
          />
        )}

        {/* Share Card Modal */}
        {showShareModal && (
          <DispatchShareCard
            date={date}
            metrics={metrics}
            branchCount={targets.length}
            session={session}
            onClose={() => setShowShareModal(false)}
          />
        )}

        {/* History Modal */}
        {showHistoryModal && (
          <HistoryModal
            currentDate={date}
            onSelectReport={(r) => {
              setDate(r.date);
              setShowHistoryModal(false);
            }}
            onDeleteReport={(id) => {
              deleteDispatchReport(id);
            }}
            onClose={() => setShowHistoryModal(false)}
          />
        )}
      </div>
    </SpecialUserGuard>
  );
}

function HistoryModal({ currentDate, onSelectReport, onDeleteReport, onClose }) {
  const [history, setHistory] = useState(() => getDispatchReportsHistory());

  function handleDelete(e, id) {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this saved dispatch report?")) return;
    onDeleteReport(id);
    setHistory(getDispatchReportsHistory());
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-3xl border border-white bg-white p-5 shadow-2xl">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-blue-700" />
            <h3 className="text-base font-black text-[#071537]">Saved Dispatch Reports</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200"
          >
            Close
          </button>
        </div>

        <div className="mt-3 flex-1 overflow-y-auto space-y-2">
          {history.length === 0 ? (
            <p className="py-8 text-center text-xs font-bold text-slate-400">
              No saved daily reports found.
            </p>
          ) : (
            history.map((r) => (
              <div
                key={r.id || r.date}
                onClick={() => onSelectReport(r)}
                className={`flex cursor-pointer items-center justify-between rounded-2xl border p-3.5 transition ${
                  r.date === currentDate
                    ? "border-violet-300 bg-violet-50/70"
                    : "border-slate-100 bg-slate-50 hover:border-slate-300"
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-black text-[#071537] text-sm">{r.date}</span>
                    {r.date === currentDate && (
                      <span className="rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-black text-white">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs font-bold text-slate-500">
                    Dispatched: {r.summary?.totalDispatch || 0} / {r.summary?.totalTarget || 0} (
                    {r.summary?.overallPercentage || 0}%) • {r.items?.length || 0} branches
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={(e) => handleDelete(e, r.id || r.date)}
                    className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    title="Delete report"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
