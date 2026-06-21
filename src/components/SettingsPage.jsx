import { Bot, Cloud, CloudDownload, CloudUpload, Download, RotateCcw, Save, Settings, Trash2, Upload, UserPlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { downloadBackupFile, getAllDeliveredRiderNames, restoreBackupFile } from "../services/reportStorage.js";
import { getDomexAutomationStatus, saveDomexAutomationConfig } from "../services/domexAutomationApi.js";
import WhatsAppSettings from "./WhatsAppSettings.jsx";

export default function SettingsPage({
  settings,
  onSaveSettings,
  courierNames,
  onSaveCourierName,
  onDeleteCourierName,
  onRestore,
  onCloudUpload,
  onCloudDownload,
  cloudStatus,
}) {
  const [draftSettings, setDraftSettings] = useState(settings);
  const [newCourierName, setNewCourierName] = useState("");
  const [newRiderName, setNewRiderName] = useState("");
  const [newRiderPhone, setNewRiderPhone] = useState("");
  const [restoreStatus, setRestoreStatus] = useState("");
  const [domexConfig, setDomexConfig] = useState({ username: "", password: "", branchName: "Middeniya" });
  const [domexStatus, setDomexStatus] = useState("");
  const fileInputRef = useRef(null);

  useEffect(() => {
    setDraftSettings(settings);
  }, [settings]);

  useEffect(() => {
    getDomexAutomationStatus()
      .then((status) => {
        setDomexConfig({ username: status.username || "", password: "", branchName: status.branchName || "Middeniya" });
        setDomexStatus(status.configured ? "DOMEX automation login is configured." : "Enter the DOMEX login details.");
      })
      .catch((error) => setDomexStatus(error.message));
  }, []);

  function updateSetting(field, value) {
    setDraftSettings((current) => ({ ...current, [field]: value }));
  }

  function handleSaveSettings() {
    onSaveSettings(draftSettings);
  }

  async function handleSaveDomexConfig() {
    setDomexStatus("Saving DOMEX automation settings...");
    try {
      const status = await saveDomexAutomationConfig(domexConfig);
      setDomexConfig((current) => ({ ...current, password: "" }));
      setDomexStatus(status.configured ? "DOMEX automation settings saved on the VPS." : "DOMEX automation is not configured.");
    } catch (error) {
      setDomexStatus(error.message || "Could not save DOMEX automation settings.");
    }
  }

  function handleSaveCourierName() {
    onSaveCourierName(newCourierName);
    setNewCourierName("");
  }

  function updateRiderPhone(name, phoneNumber) {
    updateSetting("deliveredRiderWhatsAppNumbers", {
      ...(draftSettings.deliveredRiderWhatsAppNumbers || {}),
      [name]: phoneNumber,
    });
  }

  function handleAddRiderPhone() {
    const cleanName = newRiderName.trim();
    if (!cleanName) return;
    updateRiderPhone(cleanName, newRiderPhone.trim());
    setNewRiderName("");
    setNewRiderPhone("");
  }

  function handleDeleteRiderPhone(name) {
    const nextNumbers = { ...(draftSettings.deliveredRiderWhatsAppNumbers || {}) };
    delete nextNumbers[name];
    updateSetting("deliveredRiderWhatsAppNumbers", nextNumbers);
  }

  const deliveredRiderNames = [
    ...new Set([
      ...getAllDeliveredRiderNames(),
      ...Object.keys(draftSettings.deliveredRiderWhatsAppNumbers || {}),
    ]),
  ].sort((a, b) => a.localeCompare(b));

  async function handleRestore(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!confirm("Restore this backup? Current LocalStorage data will be replaced.")) {
      event.target.value = "";
      return;
    }

    try {
      await restoreBackupFile(file);
      setRestoreStatus("Backup restored successfully.");
      onRestore?.();
    } catch (error) {
      setRestoreStatus(error.message || "Could not restore backup file.");
    } finally {
      event.target.value = "";
    }
  }

  return (
    <section className="grid gap-5">
      <div className="glass-panel p-4">
        <div className="mb-4 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-100 text-emerald-700 shadow-inner">
            <Settings className="h-6 w-6" />
          </span>
          <div>
            <h2 className="text-xl font-black text-[#071537]">Settings</h2>
            <p className="text-sm font-semibold text-blue-950/65">Manage report defaults, saved names, backup, and restore.</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Company Header" value={draftSettings.companyName || ""} onChange={(value) => updateSetting("companyName", value)} />
          <Field label="Branch Name" value={draftSettings.branchName || ""} onChange={(value) => updateSetting("branchName", value)} placeholder="Example: Middeniya" />
          <Field label="Stable Operation Target" type="number" value={draftSettings.operationTarget || ""} onChange={(value) => updateSetting("operationTarget", value)} />
          <Field label="Backup WhatsApp Number" value={draftSettings.backupWhatsappNumber || ""} onChange={(value) => updateSetting("backupWhatsappNumber", value)} placeholder="947XXXXXXXX" />
        </div>

        <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-3 text-sm font-bold text-blue-950/75">
          Backup JSON file will be sent automatically every day at 08:00 to this WhatsApp number when the backend is running.
        </div>

        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-white/70 bg-white/55 p-3">
          <input
            type="checkbox"
            checked={Boolean(draftSettings.autoWeeklyBackup)}
            onChange={(event) => updateSetting("autoWeeklyBackup", event.target.checked)}
            className="mt-1 h-5 w-5 accent-emerald-700"
          />
          <span>
            <span className="block text-sm font-black text-[#071537]">Auto weekly JSON backup</span>
            <span className="block text-xs font-semibold text-blue-950/65">
              Browser will download a backup once per week when this app is opened.
            </span>
          </span>
        </label>

        <div className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-sm font-black text-emerald-800">
          Firebase auto sync is always enabled after branch login.
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" onClick={handleSaveSettings} className="primary-action primary-action-green">
            <Save className="h-5 w-5" />
            Save Settings
          </button>
          <button type="button" onClick={() => setDraftSettings(settings)} className="secondary-action">
            <RotateCcw className="h-5 w-5" />
            Reset Changes
          </button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <WhatsAppSettings settings={settings} onSaveSettings={onSaveSettings} />

        <div className="glass-panel p-4 lg:col-span-2">
          <div className="mb-4 flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-100 text-blue-700 shadow-inner">
              <Bot className="h-6 w-6" />
            </span>
            <div>
              <h3 className="text-lg font-black text-[#071537]">DOMEX Delivered Report Automation</h3>
              <p className="text-sm font-semibold text-blue-950/65">Credentials are stored only on the VPS backend and are used to download Rider Wise CSV reports.</p>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="DOMEX Username" value={domexConfig.username} onChange={(value) => setDomexConfig((current) => ({ ...current, username: value }))} />
            <Field label="DOMEX Password" type="password" value={domexConfig.password} onChange={(value) => setDomexConfig((current) => ({ ...current, password: value }))} placeholder="Leave blank to keep saved password" />
            <Field label="DOMEX Branch Name" value={domexConfig.branchName} onChange={(value) => setDomexConfig((current) => ({ ...current, branchName: value }))} placeholder="Middeniya" />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" onClick={handleSaveDomexConfig} className="primary-action primary-action-blue">
              <Save className="h-5 w-5" />
              Save DOMEX Login
            </button>
            {domexStatus && <p className="rounded-2xl bg-white/60 px-4 py-3 text-sm font-black text-blue-950">{domexStatus}</p>}
          </div>
        </div>

        <div className="glass-panel p-4">
          <h3 className="mb-3 text-lg font-black text-[#071537]">Saved Courier Names</h3>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <Field label="Add Courier Name" value={newCourierName} onChange={setNewCourierName} placeholder="Courier name" />
            <button type="button" onClick={handleSaveCourierName} className="primary-action primary-action-blue">
              <UserPlus className="h-5 w-5" />
              Add Name
            </button>
          </div>

          <div className="mt-4 grid gap-2">
            {courierNames.length === 0 ? (
              <p className="rounded-2xl bg-white/55 p-4 text-sm font-semibold text-blue-950/60">No saved courier names yet.</p>
            ) : (
              courierNames.map((name) => (
                <div key={name} className="flex items-center justify-between gap-3 rounded-2xl border border-white/70 bg-white/55 px-4 py-3">
                  <span className="font-black text-[#071537]">{name}</span>
                  <button type="button" onClick={() => onDeleteCourierName(name)} className="history-action text-red-600" aria-label={`Delete ${name}`}>
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="glass-panel p-4">
          <h3 className="mb-3 text-lg font-black text-[#071537]">Delivered Rider WhatsApp Numbers</h3>
          <p className="mb-4 text-sm font-semibold text-blue-950/65">
            Convert Delivered Report එකේ saved rider names සඳහා WhatsApp number save කරන්න.
          </p>

          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Field label="Rider Name" value={newRiderName} onChange={setNewRiderName} placeholder="Rider name" />
            <Field label="WhatsApp Number" value={newRiderPhone} onChange={setNewRiderPhone} placeholder="947XXXXXXXX" />
            <button type="button" onClick={handleAddRiderPhone} className="primary-action primary-action-blue">
              <UserPlus className="h-5 w-5" />
              Add Rider
            </button>
          </div>

          <div className="mt-4 grid gap-2">
            {deliveredRiderNames.length === 0 ? (
              <p className="rounded-2xl bg-white/55 p-4 text-sm font-semibold text-blue-950/60">No delivered rider names saved yet.</p>
            ) : (
              deliveredRiderNames.map((name) => (
                <div key={name} className="grid gap-3 rounded-2xl border border-white/70 bg-white/55 px-4 py-3 md:grid-cols-[1fr_1.2fr_auto] md:items-center">
                  <span className="font-black text-[#071537]">{name}</span>
                  <input
                    value={draftSettings.deliveredRiderWhatsAppNumbers?.[name] || ""}
                    onChange={(event) => updateRiderPhone(name, event.target.value)}
                    placeholder="947XXXXXXXX"
                    className="h-11 rounded-2xl border border-white/80 bg-white/70 px-4 text-base font-bold outline-none focus:border-green-500 focus:ring-4 focus:ring-green-100"
                  />
                  <button type="button" onClick={() => handleDeleteRiderPhone(name)} className="history-action text-red-600" aria-label={`Delete ${name} WhatsApp number`}>
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="mt-4">
            <button type="button" onClick={handleSaveSettings} className="primary-action primary-action-green">
              <Save className="h-5 w-5" />
              Save Rider Numbers
            </button>
          </div>
        </div>

        <div className="glass-panel p-4">
          <div className="mb-3 flex items-center gap-2">
            <Cloud className="h-5 w-5 text-blue-700" />
            <h3 className="text-lg font-black text-[#071537]">Firestore Cloud Sync</h3>
          </div>
          <div className="grid gap-3">
            <button type="button" onClick={onCloudUpload} className="primary-action primary-action-blue">
              <CloudUpload className="h-5 w-5" />
              Upload Local to Cloud
            </button>
            <button type="button" onClick={onCloudDownload} className="primary-action primary-action-green">
              <CloudDownload className="h-5 w-5" />
              Download Cloud to Local
            </button>
          </div>
          <div className="mt-4 rounded-2xl border border-white/70 bg-white/55 p-4 text-sm font-semibold text-blue-950/70">
            <p>{cloudStatus || "Cloud sync ready."}</p>
            <p className="mt-2">
              Last cloud sync:{" "}
              <span className="font-black text-[#071537]">
                {settings.cloudLastSyncedAt ? new Date(settings.cloudLastSyncedAt).toLocaleString() : "Not yet"}
              </span>
            </p>
          </div>
        </div>

        <div className="glass-panel p-4 lg:col-span-2">
          <h3 className="mb-3 text-lg font-black text-[#071537]">Backup & Restore</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <button type="button" onClick={() => downloadBackupFile("manual")} className="primary-action primary-action-green">
              <Download className="h-5 w-5" />
              Export All Backup JSON
            </button>
            <button type="button" onClick={() => fileInputRef.current?.click()} className="primary-action primary-action-red">
              <Upload className="h-5 w-5" />
              Restore Backup JSON
            </button>
            <input ref={fileInputRef} type="file" accept="application/json,.json" onChange={handleRestore} className="hidden" />
          </div>

          <div className="mt-4 rounded-2xl border border-white/70 bg-white/55 p-4 text-sm font-semibold text-blue-950/70">
            <p>
              Last auto backup:{" "}
              <span className="font-black text-[#071537]">
                {settings.lastAutoBackupAt ? new Date(settings.lastAutoBackupAt).toLocaleString() : "Not yet"}
              </span>
            </p>
            {restoreStatus && <p className="mt-2 font-black text-emerald-700">{restoreStatus}</p>}
          </div>
        </div>
      </div>
    </section>
  );
}

function Field({ label, type = "text", value, onChange, placeholder }) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-black text-[#071537]">{label}</span>
      <input
        type={type}
        min={type === "number" ? "0" : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-12 rounded-2xl border border-white/80 bg-white/70 px-4 text-base font-bold outline-none focus:border-green-500 focus:ring-4 focus:ring-green-100"
      />
    </label>
  );
}
