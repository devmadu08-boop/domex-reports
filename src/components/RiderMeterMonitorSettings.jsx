import {
  CalendarDays,
  Camera,
  CheckCircle2,
  Clock3,
  LogOut,
  MessageCircleWarning,
  RefreshCw,
  Save,
  Send,
  Users,
  X,
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
  accountMode: "separate",
  enabled: false,
  groupJid: "",
  groupName: "",
  inWindowStart: "08:00",
  inWindowEnd: "11:30",
  outWindowStart: "17:00",
  outWindowEnd: "20:30",
  reminderIntervalMinutes: 60,
  messageDelaySeconds: 15,
  specialHolidays: [],
  groupReminder: true,
  privateReminder: true,
  reminderTemplate: "📸 *Daily Rider {type} Photo Reminder*\n\n{name}, please send today's {type} photo before {end}.",
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
  const [holidayDraft, setHolidayDraft] = useState("");
  const [leaveDrafts, setLeaveDrafts] = useState({});
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
      if (!nextStatus.connected && nextStatus.accountMode !== "primary") {
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
                leaveDates: participant.leaveDates || [],
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

  function addSpecialHoliday() {
    if (!holidayDraft) return;
    setConfig((current) => ({
      ...current,
      specialHolidays: [...new Set([...(current.specialHolidays || []), holidayDraft])].sort(),
    }));
    setHolidayDraft("");
  }

  function removeSpecialHoliday(date) {
    setConfig((current) => ({
      ...current,
      specialHolidays: (current.specialHolidays || []).filter((item) => item !== date),
    }));
  }

  function addRiderLeave(key) {
    const date = leaveDrafts[key];
    if (!date) return;
    setConfig((current) => ({
      ...current,
      riders: current.riders.map((rider) => (
        participantKey(rider) === key
          ? { ...rider, leaveDates: [...new Set([...(rider.leaveDates || []), date])].sort() }
          : rider
      )),
    }));
    setLeaveDrafts((current) => ({ ...current, [key]: "" }));
  }

  function removeRiderLeave(key, date) {
    setConfig((current) => ({
      ...current,
      riders: current.riders.map((rider) => (
        participantKey(rider) === key
          ? { ...rider, leaveDates: (rider.leaveDates || []).filter((item) => item !== date) }
          : rider
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

  async function handleAccountModeChange(accountMode) {
    const nextConfig = { ...config, accountMode };
    setConfig(nextConfig);
    setGroups([]);
    setParticipants([]);
    setQrDataUrl("");
    await runAction(async () => {
      const result = await saveMeterMonitorConfig(nextConfig);
      setConfig({ ...EMPTY_CONFIG, ...result.config });
      return result;
    }, accountMode === "primary"
      ? "Meter Monitor now uses the Primary Report WhatsApp account."
      : "Meter Monitor now uses its separate WhatsApp account.");
  }

  async function handleCheckNow(sessionKey) {
    await runAction(
      () => runMeterMonitorCheck(sessionKey),
      (result) => {
        if (result.skipped) return result.reason || "Reminder check skipped.";
        if (result.duplicatePrevented) {
          return `${result.sessionLabel} reminder batch is already being sent. A duplicate batch was not added.`;
        }
        if (result.queued) {
          return `${result.sessionLabel} reminder batch queued. ${result.missingCount} missing rider${result.missingCount === 1 ? "" : "s"} will receive messages one by one with at least ${result.messageDelaySeconds} seconds between messages.`;
        }
        return result.missingCount
          ? `${result.sessionLabel}: ${result.missingCount} rider${result.missingCount === 1 ? "" : "s"} had not sent a photo.`
          : `All required riders have sent today's ${result.sessionLabel} photo.`;
      },
    );
  }

  const connected = Boolean(status?.connected);
  const accountMode = config.accountMode || "separate";
  const today = status?.today || {};
  const inStatus = today.in || {};
  const outStatus = today.out || {};
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
              Use the Primary Report WhatsApp or keep an independent monitor account.
            </p>
          </div>
        </div>
        <span className={`rounded-2xl px-4 py-2 text-sm font-black ${connected ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"}`}>
          {connected ? "Connected" : "Disconnected"}
        </span>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-2">
        <button
          type="button"
          disabled={loading}
          aria-pressed={accountMode === "primary"}
          onClick={() => handleAccountModeChange("primary")}
          className={`grid min-h-28 gap-2 rounded-2xl border p-4 text-left transition ${
            accountMode === "primary"
              ? "border-emerald-400 bg-emerald-50 shadow-lg shadow-emerald-100"
              : "border-white bg-white/65 hover:border-emerald-200"
          }`}
        >
          <span className="text-sm font-black text-[#071537]">Use Primary Report WhatsApp</span>
          <span className="text-xs font-semibold leading-5 text-blue-950/60">
            Reports and meter monitoring share the already connected primary account. No second QR is required.
          </span>
        </button>
        <button
          type="button"
          disabled={loading}
          aria-pressed={accountMode === "separate"}
          onClick={() => handleAccountModeChange("separate")}
          className={`grid min-h-28 gap-2 rounded-2xl border p-4 text-left transition ${
            accountMode === "separate"
              ? "border-cyan-400 bg-cyan-50 shadow-lg shadow-cyan-100"
              : "border-white bg-white/65 hover:border-cyan-200"
          }`}
        >
          <span className="text-sm font-black text-[#071537]">Use Separate Monitor Account</span>
          <span className="text-xs font-semibold leading-5 text-blue-950/60">
            Keep meter photos and reminders on a second WhatsApp session with its own QR login.
          </span>
        </button>
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[290px_minmax(0,1fr)]">
        <div className="whatsapp-settings-card text-center">
          {connected ? (
            <div className="grid min-h-[260px] place-items-center">
              <div>
                <Camera className="mx-auto h-16 w-16 text-cyan-700" />
                <p className="mt-3 text-lg font-black text-[#071537]">
                  {accountMode === "primary" ? "Primary Account Connected" : "Monitor Account Connected"}
                </p>
                <p className="mt-1 text-sm font-bold text-blue-950/65">{status?.connectedNumber || "Number unavailable"}</p>
                <p className="mt-2 text-xs font-black text-cyan-700">{status?.connectionSource}</p>
              </div>
            </div>
          ) : accountMode === "primary" ? (
            <div className="grid min-h-[260px] place-items-center text-sm font-bold text-blue-950/65">
              Connect the Primary Report WhatsApp in the Report WhatsApp section.
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
          {accountMode === "separate" ? (
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
          ) : (
            <p className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-900">
              Primary mode is active. Reconnect or logout the account only from the Report WhatsApp section.
            </p>
          )}

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
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="grid gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 p-3">
                <div>
                  <p className="text-sm font-black text-amber-900">Morning IN Meter Photo</p>
                  <p className="text-xs font-semibold text-amber-800/70">Two checks only, at the opening and closing times.</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <span className="rounded-xl bg-white/80 px-3 py-3 text-center text-sm font-black text-amber-900">08:00</span>
                  <span className="rounded-xl bg-white/80 px-3 py-3 text-center text-sm font-black text-amber-900">11:30</span>
                </div>
              </div>

              <div className="grid gap-3 rounded-2xl border border-indigo-200 bg-indigo-50/80 p-3">
                <div>
                  <p className="text-sm font-black text-indigo-900">Evening OUT Meter Photo</p>
                  <p className="text-xs font-semibold text-indigo-800/70">Two checks only, at the opening and closing times.</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <span className="rounded-xl bg-white/80 px-3 py-3 text-center text-sm font-black text-indigo-900">17:00</span>
                  <span className="rounded-xl bg-white/80 px-3 py-3 text-center text-sm font-black text-indigo-900">20:30</span>
                </div>
              </div>
            </div>

            <p className="rounded-2xl bg-cyan-50 p-3 text-sm font-bold text-cyan-900">
              Automatic reminders run only at 08:00, 11:30, 17:00, and 20:30. Riders who already submitted the correct photo are skipped.
            </p>

            <label className="grid gap-2 text-sm font-black text-[#071537] sm:max-w-sm">
              Delay between WhatsApp messages
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="5"
                  max="120"
                  step="1"
                  value={config.messageDelaySeconds}
                  onChange={(event) => setConfig((current) => ({ ...current, messageDelaySeconds: Number(event.target.value) }))}
                  className="whatsapp-control h-11 min-w-0 flex-1"
                />
                <span className="text-sm font-bold text-blue-950/60">seconds</span>
              </div>
              <span className="text-xs font-semibold text-blue-950/55">
                Messages are sent one by one with this delay plus a random 0-5 second gap. Recommended: 15 seconds or more.
              </span>
            </label>

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
                Available: {"{name}"}, {"{date}"}, {"{group}"}, {"{type}"}, {"{start}"}, {"{end}"}
              </span>
            </label>
          </div>

          <div className="whatsapp-settings-card grid gap-4">
            <div className="flex items-start gap-3">
              <CalendarDays className="mt-0.5 h-5 w-5 text-violet-600" />
              <div>
                <p className="text-sm font-black text-[#071537]">Branch Holidays</p>
                <p className="text-xs font-semibold text-blue-950/60">
                  Every Sunday is automatically disabled. Add special holidays below to stop all meter checks and reminders.
                </p>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,240px)_auto] sm:justify-start">
              <input
                type="date"
                value={holidayDraft}
                onChange={(event) => setHolidayDraft(event.target.value)}
                className="whatsapp-control h-11"
              />
              <button type="button" onClick={addSpecialHoliday} disabled={!holidayDraft} className="secondary-action disabled:opacity-50">
                <CalendarDays className="h-4 w-4" />
                Add Special Holiday
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-xl bg-violet-100 px-3 py-2 text-xs font-black text-violet-800">
                Sundays: Always off
              </span>
              {(config.specialHolidays || []).map((date) => (
                <span key={date} className="inline-flex items-center gap-2 rounded-xl bg-rose-100 px-3 py-2 text-xs font-black text-rose-800">
                  {date}
                  <button type="button" onClick={() => removeSpecialHoliday(date)} aria-label={`Remove special holiday ${date}`} className="grid h-5 w-5 place-items-center rounded-full hover:bg-rose-200">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
            </div>
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
                      <div className="grid min-w-0 gap-3">
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
                        <div className="grid gap-2 rounded-xl bg-white/70 p-2">
                          <p className="text-xs font-black text-[#071537]">Rider Leave Dates</p>
                          <div className="grid gap-2 sm:grid-cols-[minmax(0,220px)_auto] sm:justify-start">
                            <input
                              type="date"
                              value={leaveDrafts[key] || ""}
                              onChange={(event) => setLeaveDrafts((current) => ({ ...current, [key]: event.target.value }))}
                              className="whatsapp-control h-10"
                            />
                            <button type="button" disabled={!leaveDrafts[key]} onClick={() => addRiderLeave(key)} className="secondary-action disabled:opacity-50">
                              Add Leave
                            </button>
                          </div>
                          {(selectedRider.leaveDates || []).length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {selectedRider.leaveDates.map((date) => (
                                <span key={date} className="inline-flex items-center gap-2 rounded-lg bg-amber-100 px-2 py-1 text-xs font-black text-amber-900">
                                  {date}
                                  <button type="button" onClick={() => removeRiderLeave(key, date)} aria-label={`Remove ${selectedRider.name || "rider"} leave ${date}`} className="grid h-5 w-5 place-items-center rounded-full hover:bg-amber-200">
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
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
            {today.inactive && (
              <p className="rounded-2xl bg-violet-100 p-3 text-sm font-black text-violet-900">
                Monitor inactive today: {today.inactiveReason}
              </p>
            )}
            {!today.inactive && today.onLeaveCount > 0 && (
              <p className="rounded-2xl bg-amber-100 p-3 text-sm font-bold text-amber-900">
                On leave today: {today.onLeave.map((rider) => rider.name).join(", ")}
              </p>
            )}
            <div className="grid gap-3 lg:grid-cols-2">
              {[
                { key: "in", title: "IN Meter", status: inStatus, tone: "amber" },
                { key: "out", title: "OUT Meter", status: outStatus, tone: "indigo" },
              ].map((item) => (
                <div
                  key={item.key}
                  className={`grid gap-3 rounded-2xl border p-3 ${
                    item.tone === "amber"
                      ? "border-amber-200 bg-amber-50/80"
                      : "border-indigo-200 bg-indigo-50/80"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-black text-[#071537]">{item.title}</p>
                    <span className="rounded-xl bg-white/80 px-2 py-1 text-xs font-black text-blue-950/65">
                      {item.status.start || "--:--"} - {item.status.end || "--:--"}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-xl bg-emerald-100/80 p-2 text-center">
                      <p className="text-[10px] font-black uppercase text-emerald-700">Received</p>
                      <p className="text-xl font-black text-emerald-800">{item.status.submissionCount || 0}</p>
                    </div>
                    <div className="rounded-xl bg-rose-100/80 p-2 text-center">
                      <p className="text-[10px] font-black uppercase text-rose-700">Missing</p>
                      <p className="text-xl font-black text-rose-800">{item.status.missingCount || 0}</p>
                    </div>
                    <div className="rounded-xl bg-violet-100/80 p-2 text-center">
                      <p className="text-[10px] font-black uppercase text-violet-700">Required</p>
                      <p className="text-xl font-black text-violet-800">{item.status.riderCount || config.riders.length}</p>
                    </div>
                  </div>
                  {item.status.missing?.length > 0 && (
                    <p className="rounded-xl bg-white/75 p-2 text-xs font-bold text-rose-800">
                      Missing: {item.status.missing.map((rider) => rider.name).join(", ")}
                    </p>
                  )}
                  {item.status.lastReminderSlot && (
                    <p className="flex items-center gap-2 text-xs font-bold text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" /> Last hourly check: {item.status.lastReminderSlot}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <button type="button" disabled={loading} onClick={handleSave} className="primary-action primary-action-green disabled:opacity-50">
              <Save className="h-5 w-5" />
              Save Meter Monitor
            </button>
            <button type="button" disabled={loading || !connected || today.inactive} onClick={() => handleCheckNow("in")} className="primary-action primary-action-blue disabled:opacity-50">
              <Send className="h-5 w-5" />
              Remind Missing IN
            </button>
            <button type="button" disabled={loading || !connected || today.inactive} onClick={() => handleCheckNow("out")} className="primary-action primary-action-purple disabled:opacity-50">
              <Send className="h-5 w-5" />
              Remind Missing OUT
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
