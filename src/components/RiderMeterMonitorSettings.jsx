import {
  Camera,
  CheckCircle2,
  Clock3,
  LogOut,
  MessageCircleWarning,
  RefreshCw,
  Save,
  Send,
  Users,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  fetchMeterGroupParticipants,
  fetchMeterMonitorGroups,
  getMeterMonitorQr,
  getMeterMonitorStatus,
  logoutMeterMonitor,
  reconnectMeterMonitor,
  runMeterMonitorCheck,
  saveMeterMonitorConfig,
} from "../services/meterMonitorApi.js";

const EMPTY_CONFIG = {
  enabled: false,
  groupJid: "",
  groupName: "",
  windowStart: "17:00",
  windowEnd: "19:00",
  reminderTime: "19:05",
  groupReminder: true,
  privateReminder: true,
  reminderTemplate: "📸 *Daily Rider Meter Photo Reminder*\n\n{name}, please send today's rider meter photo before the daily check closes.",
  riders: [],
};

function participantKey(participant) {
  return participant.jid || participant.lid || participant.phoneJid || participant.phoneNumber;
}

export default function RiderMeterMonitorSettings() {
  const [status, setStatus] = useState(null);
  const [config, setConfig] = useState(EMPTY_CONFIG);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [groups, setGroups] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const initializedRef = useRef(false);

  useEffect(() => {
    refreshStatus();
    const timer = window.setInterval(() => refreshStatus(false), 5000);
    return () => window.clearInterval(timer);
  }, []);

  async function refreshStatus(applyConfig = true) {
    try {
      const nextStatus = await getMeterMonitorStatus();
      setStatus(nextStatus);
      if (applyConfig || !initializedRef.current) {
        setConfig({ ...EMPTY_CONFIG, ...(nextStatus.config || {}) });
        initializedRef.current = true;
      }
      if (!nextStatus.connected) {
        const qr = await getMeterMonitorQr();
        setQrDataUrl(qr.qrDataUrl || "");
      } else {
        setQrDataUrl("");
      }
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function runAction(action, successText) {
    setLoading(true);
    setMessage("");
    try {
      const result = await action();
      setMessage(typeof successText === "function" ? successText(result) : successText);
      // Refresh connection and daily status without replacing unsaved form values.
      await refreshStatus(false);
      return result;
    } catch (error) {
      setMessage(error.message || "Rider Meter Monitor action failed.");
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function handleFetchGroups() {
    await runAction(async () => {
      const data = await fetchMeterMonitorGroups();
      setGroups(data.groups || []);
      return data;
    }, "Meter-monitor groups loaded.");
  }

  async function loadParticipants(groupJid, groupName = "") {
    if (!groupJid) {
      setParticipants([]);
      return;
    }
    await runAction(async () => {
      const data = await fetchMeterGroupParticipants(groupJid);
      setParticipants(data.participants || []);
      setConfig((current) => ({
        ...current,
        groupJid: data.groupJid || groupJid,
        groupName: data.groupName || groupName,
      }));
      return data;
    }, "Group members loaded. Select the riders who must send a daily photo.");
  }

  function handleGroupChange(groupJid) {
    const group = groups.find((item) => item.jid === groupJid);
    setConfig((current) => ({
      ...current,
      groupJid,
      groupName: group?.name || "",
      riders: [],
    }));
    loadParticipants(groupJid, group?.name || "");
  }

  function toggleRider(participant) {
    const key = participantKey(participant);
    setConfig((current) => {
      const exists = current.riders.some((rider) => participantKey(rider) === key);
      return {
        ...current,
        riders: exists
          ? current.riders.filter((rider) => participantKey(rider) !== key)
          : [
              ...current.riders,
              {
                ...participant,
                name: participant.name || participant.phoneNumber || participant.jid,
              },
            ],
      };
    });
  }

  function updateRider(key, field, value) {
    setConfig((current) => ({
      ...current,
      riders: current.riders.map((rider) => (
        participantKey(rider) === key ? { ...rider, [field]: value } : rider
      )),
    }));
  }

  async function handleSave() {
    await runAction(async () => {
      const result = await saveMeterMonitorConfig(config);
      setConfig({ ...EMPTY_CONFIG, ...result.config });
      return result;
    }, "Rider Meter Monitor settings saved.");
  }

  async function handleCheckNow() {
    await runAction(
      runMeterMonitorCheck,
      (result) => result.missingCount
        ? `Reminder sent. ${result.missingCount} rider${result.missingCount === 1 ? "" : "s"} had not sent a photo.`
        : "All required riders have sent today's meter photo.",
    );
  }

  const connected = Boolean(status?.connected);
  const today = status?.today || {};
  const knownParticipants = participants.length
    ? participants
    : config.riders.map((rider) => ({ ...rider, savedOnly: true }));

  return (
    <section className="glass-panel min-w-0 p-4 lg:col-span-2">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-cyan-100 text-cyan-700 shadow-inner">
            <Camera className="h-6 w-6" />
          </span>
          <div>
            <h3 className="text-lg font-black text-[#071537]">Rider Meter Photo Monitor</h3>
            <p className="text-sm font-semibold text-blue-950/65">
              A separate WhatsApp account checks daily rider photos without changing the report account.
            </p>
          </div>
        </div>
        <span className={`rounded-2xl px-4 py-2 text-sm font-black ${connected ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"}`}>
          {connected ? "Connected" : "Disconnected"}
        </span>
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[290px_minmax(0,1fr)]">
        <div className="whatsapp-settings-card text-center">
          {connected ? (
            <div className="grid min-h-[260px] place-items-center">
              <div>
                <Camera className="mx-auto h-16 w-16 text-cyan-700" />
                <p className="mt-3 text-lg font-black text-[#071537]">Monitor Account Connected</p>
                <p className="mt-1 text-sm font-bold text-blue-950/65">{status?.connectedNumber || "Number unavailable"}</p>
              </div>
            </div>
          ) : qrDataUrl ? (
            <>
              <img src={qrDataUrl} alt="Rider Meter WhatsApp QR code" className="mx-auto h-60 w-60 rounded-2xl bg-white p-2 shadow-lg" />
              <p className="mt-3 text-sm font-bold text-blue-950/65">Scan this QR using the second WhatsApp account.</p>
            </>
          ) : (
            <div className="grid min-h-[260px] place-items-center text-sm font-bold text-blue-950/65">
              Click Connect Monitor Account to generate its own QR.
            </div>
          )}
        </div>

        <div className="grid min-w-0 gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => runAction(reconnectMeterMonitor, "Rider Meter WhatsApp reconnect started.")}
              className="primary-action primary-action-blue disabled:opacity-50"
            >
              <RefreshCw className="h-5 w-5" />
              Connect Monitor Account
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => runAction(logoutMeterMonitor, "Only the Rider Meter Monitor session was removed.")}
              className="primary-action primary-action-red disabled:opacity-50"
            >
              <LogOut className="h-5 w-5" />
              Remove Monitor Session
            </button>
          </div>

          <div className="whatsapp-settings-card grid min-w-0 gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black text-[#071537]">Meter Photo Group</p>
                <p className="text-xs font-semibold text-blue-950/60">Choose the group where riders post their meter photos.</p>
              </div>
              <button type="button" disabled={loading || !connected} onClick={handleFetchGroups} className="secondary-action disabled:opacity-50">
                <Users className="h-5 w-5" />
                Fetch Groups
              </button>
            </div>

            <select
              value={config.groupJid}
              onChange={(event) => handleGroupChange(event.target.value)}
              className="whatsapp-control h-12 text-sm"
            >
              <option value="">Select meter photo group</option>
              {groups.map((group) => (
                <option key={group.jid} value={group.jid}>{group.name} ({group.participants})</option>
              ))}
              {config.groupJid && !groups.some((group) => group.jid === config.groupJid) && (
                <option value={config.groupJid}>{config.groupName || config.groupJid}</option>
              )}
            </select>

            {config.groupJid && (
              <button
                type="button"
                disabled={loading || !connected}
                onClick={() => loadParticipants(config.groupJid, config.groupName)}
                className="secondary-action justify-self-start disabled:opacity-50"
              >
                <RefreshCw className="h-4 w-4" />
                Load Group Riders
              </button>
            )}
          </div>

          <div className="whatsapp-settings-card grid gap-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="grid gap-2 text-sm font-black text-[#071537]">
                Photo window starts
                <input type="time" value={config.windowStart} onChange={(event) => setConfig((current) => ({ ...current, windowStart: event.target.value }))} className="whatsapp-control h-11" />
              </label>
              <label className="grid gap-2 text-sm font-black text-[#071537]">
                Photo window ends
                <input type="time" value={config.windowEnd} onChange={(event) => setConfig((current) => ({ ...current, windowEnd: event.target.value }))} className="whatsapp-control h-11" />
              </label>
              <label className="grid gap-2 text-sm font-black text-[#071537]">
                Reminder time
                <input type="time" value={config.reminderTime} onChange={(event) => setConfig((current) => ({ ...current, reminderTime: event.target.value }))} className="whatsapp-control h-11" />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="flex cursor-pointer items-center gap-3 rounded-2xl bg-white/70 p-3 text-sm font-black text-[#071537]">
                <input type="checkbox" checked={config.enabled} onChange={(event) => setConfig((current) => ({ ...current, enabled: event.target.checked }))} className="h-5 w-5 accent-cyan-600" />
                Enable daily monitor
              </label>
              <label className="flex cursor-pointer items-center gap-3 rounded-2xl bg-white/70 p-3 text-sm font-black text-[#071537]">
                <input type="checkbox" checked={config.groupReminder} onChange={(event) => setConfig((current) => ({ ...current, groupReminder: event.target.checked }))} className="h-5 w-5 accent-cyan-600" />
                Group reminder
              </label>
              <label className="flex cursor-pointer items-center gap-3 rounded-2xl bg-white/70 p-3 text-sm font-black text-[#071537]">
                <input type="checkbox" checked={config.privateReminder} onChange={(event) => setConfig((current) => ({ ...current, privateReminder: event.target.checked }))} className="h-5 w-5 accent-cyan-600" />
                Private reminder
              </label>
            </div>

            <label className="grid gap-2 text-sm font-black text-[#071537]">
              Private reminder template
              <textarea
                rows="3"
                value={config.reminderTemplate}
                onChange={(event) => setConfig((current) => ({ ...current, reminderTemplate: event.target.value }))}
                className="whatsapp-control min-h-24 resize-y px-4 py-3 text-sm"
              />
              <span className="text-xs font-semibold text-blue-950/55">
                Available: {"{name}"}, {"{date}"}, {"{group}"}, {"{start}"}, {"{end}"}
              </span>
            </label>
          </div>

          <div className="whatsapp-settings-card">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black text-[#071537]">Required Riders</p>
                <p className="text-xs font-semibold text-blue-950/60">
                  Select riders, then add a readable name and phone number for private reminders.
                </p>
              </div>
              <span className="rounded-xl bg-cyan-100 px-3 py-2 text-xs font-black text-cyan-800">
                {config.riders.length} selected
              </span>
            </div>

            <div className="grid max-h-[420px] gap-2 overflow-y-auto">
              {knownParticipants.length ? knownParticipants.map((participant) => {
                const key = participantKey(participant);
                const selectedRider = config.riders.find((rider) => participantKey(rider) === key);
                return (
                  <div key={key} className={`grid min-w-0 gap-3 rounded-2xl border p-3 ${selectedRider ? "border-cyan-300 bg-cyan-50/80" : "border-white bg-white/60"}`}>
                    <label className="flex min-w-0 cursor-pointer items-center gap-3">
                      <input type="checkbox" checked={Boolean(selectedRider)} onChange={() => toggleRider(participant)} className="h-5 w-5 shrink-0 accent-cyan-600" />
                      <span className="min-w-0 truncate text-sm font-black text-[#071537]">
                        {participant.phoneNumber || participant.jid}
                      </span>
                    </label>
                    {selectedRider && (
                      <div className="grid min-w-0 gap-2 sm:grid-cols-2">
                        <input
                          value={selectedRider.name || ""}
                          onChange={(event) => updateRider(key, "name", event.target.value)}
                          placeholder="Rider name"
                          className="whatsapp-control h-10 min-w-0 text-sm"
                        />
                        <input
                          value={selectedRider.phoneNumber || ""}
                          onChange={(event) => updateRider(key, "phoneNumber", event.target.value)}
                          placeholder="947XXXXXXXX"
                          className="whatsapp-control h-10 min-w-0 text-sm"
                        />
                      </div>
                    )}
                  </div>
                );
              }) : (
                <p className="rounded-2xl border border-dashed border-cyan-200 bg-white/60 p-5 text-center text-sm font-bold text-blue-950/60">
                  Connect the monitor account, fetch groups, and load group riders.
                </p>
              )}
            </div>
          </div>

          <div className="whatsapp-settings-card grid gap-3">
            <div className="flex items-center gap-3">
              <Clock3 className="h-5 w-5 text-violet-600" />
              <p className="text-sm font-black text-[#071537]">Today's Meter Photo Check</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-emerald-50 p-3">
                <p className="text-xs font-black uppercase text-emerald-700">Received</p>
                <p className="mt-1 text-2xl font-black text-emerald-800">{today.submissionCount || 0}</p>
              </div>
              <div className="rounded-2xl bg-rose-50 p-3">
                <p className="text-xs font-black uppercase text-rose-700">Missing</p>
                <p className="mt-1 text-2xl font-black text-rose-800">{today.missingCount || 0}</p>
              </div>
              <div className="rounded-2xl bg-violet-50 p-3">
                <p className="text-xs font-black uppercase text-violet-700">Required</p>
                <p className="mt-1 text-2xl font-black text-violet-800">{today.riderCount || config.riders.length}</p>
              </div>
            </div>
            {today.missing?.length > 0 && (
              <p className="rounded-2xl bg-rose-50 p-3 text-sm font-bold text-rose-800">
                Missing: {today.missing.map((rider) => rider.name).join(", ")}
              </p>
            )}
            {today.reminderSentAt && (
              <p className="flex items-center gap-2 text-sm font-bold text-emerald-700">
                <CheckCircle2 className="h-4 w-4" /> Reminder completed at {today.reminderSentAt}
              </p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" disabled={loading} onClick={handleSave} className="primary-action primary-action-green disabled:opacity-50">
              <Save className="h-5 w-5" />
              Save Meter Monitor
            </button>
            <button type="button" disabled={loading || !connected} onClick={handleCheckNow} className="primary-action primary-action-purple disabled:opacity-50">
              <Send className="h-5 w-5" />
              Check & Remind Now
            </button>
          </div>

          {message && (
            <p className="flex items-start gap-2 rounded-2xl bg-white/70 p-3 text-sm font-black text-blue-950">
              <MessageCircleWarning className="mt-0.5 h-4 w-4 shrink-0" />
              {message}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
