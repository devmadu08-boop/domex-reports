import { useEffect, useState } from "react";
import { CalendarClock, Eye, Loader2, Send } from "lucide-react";
import { createBackupData, getSettings } from "../services/reportStorage.js";
import { getCourierAutomationStatus, previewCourierSummary, sendCourierSummary, syncWhatsAppBackupSnapshot } from "../services/whatsappApi.js";

export default function CourierAutomationPanel({ selectedDate, accountKey, settings, onSaveSettings }) {
  const [status, setStatus] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [preview, setPreview] = useState(null);
  useEffect(() => {
    let cancelled = false;
    const refresh = () => getCourierAutomationStatus(accountKey).then((value) => {
      if (!cancelled) { setStatus(value); setError(""); }
    }).catch((err) => { if (!cancelled) setError(err.message); });
    refresh();
    const timer = window.setInterval(refresh, 15000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [accountKey]);
  useEffect(() => { setPreview(null); setMessage(""); }, [selectedDate, accountKey]);

  async function syncRows() {
    const current = getSettings();
    const snapshot = createBackupData();
    if (!Object.keys(snapshot.reports || {}).length && !snapshot.localUpdatedAt) throw new Error("Load or save this branch's courier report before previewing or sending.");
    await syncWhatsAppBackupSnapshot({ snapshot, phoneNumber: current.backupWhatsappNumber,
      approvalReaction: current.rescheduleApprovalReaction, accountKey });
  }
  async function action(type) {
    setBusy(type); setMessage("");
    try {
      await syncRows();
      if (type === "preview") setPreview(await previewCourierSummary(selectedDate, accountKey));
      else {
        await sendCourierSummary(selectedDate, accountKey);
        setMessage(`Modern Courier Summary for ${selectedDate} added to your WhatsApp queue.`);
      }
      setStatus(await getCourierAutomationStatus(accountKey));
    } catch (err) { setMessage(err.message || "Courier report action failed."); }
    finally { setBusy(""); }
  }
  async function toggle(enabled) {
    setBusy("settings"); setMessage("");
    try {
      // Local settings are saved synchronously; cloud recovery may remain pending while offline.
      Promise.resolve(onSaveSettings({ ...getSettings(), courierAutoSendEnabled: enabled }))
        .catch((err) => setMessage(err.message || "Cloud settings sync is pending."));
      await syncRows();
      setStatus(await getCourierAutomationStatus(accountKey));
    } catch (err) { setMessage(err.message); }
    finally { setBusy(""); }
  }
  return <section className="glass-panel grid min-w-0 gap-4 p-4" aria-label="Automatic courier summary">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex gap-3"><CalendarClock className="mt-1 h-6 w-6 shrink-0 text-rose-800" /><div>
        <h3 className="text-lg font-black text-stone-900">8 PM Courier Summary</h3>
        <p className="text-sm font-semibold text-stone-600">Today's modern report sends to your default groups at 20:00 Sri Lanka time, or earlier when all {status?.requiredCount || 4} couriers are complete.</p>
        <p className="mt-1 text-xs text-stone-500">Fill On Route, Delivery, Resend and Pickup for every saved courier. Zero is valid. Automatic delivery happens once per day; manual sends remain available.</p>
      </div></div>
      <label className="flex shrink-0 items-center gap-2 text-sm font-bold"><input type="checkbox" className="h-5 w-5 accent-emerald-700" checked={settings.courierAutoSendEnabled !== false} disabled={Boolean(busy)} onChange={(event) => toggle(event.target.checked)} />Auto-send enabled</label>
    </div>
    {error ? <p role="status" className="text-sm font-semibold text-red-700">{error}</p> : status ? <div className="flex flex-wrap gap-2 text-xs font-bold">
      <span className="rounded-xl bg-stone-100 px-3 py-2">Today {status.date}: {status.completedCount}/{status.requiredCount} complete</span>
      <span className="rounded-xl bg-stone-100 px-3 py-2">{status.groupCount} default group(s)</span>
      <span className={`rounded-xl px-3 py-2 ${status.status === "sent" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>{status.status === "sent" ? "Automatic report sent today" : status.status === "pending" ? "Delivery pending · retries today" : "Waiting for complete data or 20:00"}</span>
      {!status.connected && <span className="rounded-xl bg-red-100 px-3 py-2 text-red-800">Connect this account's WhatsApp in Settings</span>}
      {!status.groupCount && <span className="rounded-xl bg-red-100 px-3 py-2 text-red-800">Select and save default groups in Settings</span>}
      {status.lastError && <span className="rounded-xl bg-red-50 px-3 py-2 text-red-800">{status.lastError}</span>}
    </div> : <p className="text-sm text-stone-500">Checking today's automatic report…</p>}
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={() => action("preview")} disabled={Boolean(busy)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-bold disabled:opacity-50">{busy === "preview" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}Preview modern report</button>
      <button type="button" onClick={() => action("send")} disabled={Boolean(busy)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy === "send" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Send modern report now</button>
      <span className="text-xs font-semibold text-stone-500">Preview / manual send date: {selectedDate}</span>
    </div>
    {message && <p role="status" className="rounded-xl bg-stone-100 p-3 text-sm font-bold text-stone-800">{message}</p>}
    {preview?.reportDate === selectedDate && <img src={preview.imageDataUrl} alt={`Modern Branch Courier Performance Report for ${selectedDate}`} className="h-auto w-full rounded-2xl border border-stone-200" />}
  </section>;
}
