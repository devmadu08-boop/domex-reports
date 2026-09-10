import {
  Bot,
  Camera,
  Cloud,
  CloudDownload,
  CloudUpload,
  DatabaseBackup,
  Download,
  MessageCircle,
  ReceiptText,
  RotateCcw,
  Save,
  Settings,
  SlidersHorizontal,
  Sparkles,
  KeyRound,
  RefreshCw,
  Trash2,
  Upload,
  UserPlus,
  Users,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { downloadBackupFile, getAllDeliveredRiderNames, restoreBackupFile } from "../services/reportStorage.js";
import { getDomexAutomationStatus, saveDomexAutomationConfig } from "../services/domexAutomationApi.js";
import { testGeminiApiKey } from "../services/geminiDispatchService.js";
import WhatsAppSettings from "./WhatsAppSettings.jsx";
import RegionalWhatsAppSettings from "./RegionalWhatsAppSettings.jsx";
import RiderMeterMonitorSettings from "./RiderMeterMonitorSettings.jsx";
import ThemeSwitcher from "./ThemeSwitcher.jsx";

const APPROVAL_REACTION_PRESETS = ["✅", "👍", "❤️", "🚀", "📤"];

function firstGrapheme(value) {
  const cleanValue = String(value || "").trim();
  if (!cleanValue) return "";
  const grapheme = [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(cleanValue)][0]?.segment || "";
  return /[\p{Extended_Pictographic}\p{Emoji_Presentation}\u20E3]/u.test(grapheme) ? grapheme : "";
}

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
  onThemeChange,
  whatsappAccountLabel,
  session,
  children,
}) {
  const [draftSettings, setDraftSettings] = useState(settings);
  const [newCourierName, setNewCourierName] = useState("");
  const [newRiderName, setNewRiderName] = useState("");
  const [newRiderPhone, setNewRiderPhone] = useState("");
  const [newPettyVehicleNo, setNewPettyVehicleNo] = useState("");
  const [newPettyEmployeeName, setNewPettyEmployeeName] = useState("");
  const [restoreStatus, setRestoreStatus] = useState("");
  const [domexConfig, setDomexConfig] = useState({ username: "", password: "", branchName: "Middeniya" });
  const [domexStatus, setDomexStatus] = useState("");
  const [activeSection, setActiveSection] = useState("general");
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

  function handleThemeChange(themeId) {
    updateSetting("uiTheme", themeId);
    onThemeChange?.(themeId);
  }

  const [testingGemini, setTestingGemini] = useState(false);
  const [geminiTestStatus, setGeminiTestStatus] = useState(null);

  async function handleTestGeminiKey() {
    setTestingGemini(true);
    setGeminiTestStatus(null);
    const res = await testGeminiApiKey(draftSettings.geminiApiKey);
    setGeminiTestStatus(res);
    setTestingGemini(false);
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

  function handleAddPettyCashVehicle() {
    const vehicleNo = newPettyVehicleNo.trim();
    const employeeName = newPettyEmployeeName.trim();
    if (!vehicleNo || !employeeName) return;
    const normalizedVehicle = vehicleNo.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const mappings = Array.isArray(draftSettings.pettyCashVehicleEmployees) ? draftSettings.pettyCashVehicleEmployees : [];
    const nextMappings = [
      ...mappings.filter((item) => String(item.vehicleNo || "").toUpperCase().replace(/[^A-Z0-9]/g, "") !== normalizedVehicle),
      { vehicleNo, employeeName },
    ].sort((a, b) => a.vehicleNo.localeCompare(b.vehicleNo));
    updateSetting("pettyCashVehicleEmployees", nextMappings);
    setNewPettyVehicleNo("");
    setNewPettyEmployeeName("");
  }

  function updatePettyCashVehicle(index, field, value) {
    updateSetting("pettyCashVehicleEmployees", (draftSettings.pettyCashVehicleEmployees || []).map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item));
  }

  function deletePettyCashVehicle(index) {
    updateSetting("pettyCashVehicleEmployees", (draftSettings.pettyCashVehicleEmployees || []).filter((_, itemIndex) => itemIndex !== index));
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
      <div className="settings-hub glass-panel grid gap-4 p-4">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-violet-100 text-violet-700 shadow-inner">
            <Settings className="h-6 w-6" />
          </span>
          <div>
            <h2 className="text-xl font-black text-[#071537]">Settings Center</h2>
            <p className="text-sm font-semibold text-blue-950/65">Choose a category and manage only what you need.</p>
          </div>
        </div>
        <nav className="settings-category-nav" aria-label="Settings categories">
          <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-hide lg:flex-col lg:overflow-visible lg:pb-0">
            {[
              { id: "general", label: "General", helper: "Theme & API keys", icon: SlidersHorizontal },
              { id: "whatsapp", label: "WhatsApp Bot", helper: "Reports & automation", icon: MessageCircle },
              ...(session?.role?.toLowerCase() === "regional manager" ? [{ id: "regionalDispatch", label: "Regional Automations", helper: "Dispatch setup", icon: Sparkles }] : []),
              { id: "meter", label: "Meter Monitor", helper: "Photos & reminders", icon: Camera },
              { id: "people", label: "People", helper: "Couriers & riders", icon: Users },
              { id: "pettyCash", label: "Petty Cash", helper: "Vehicle employees", icon: ReceiptText },
              { id: "automation", label: "Automation", helper: "DOMEX login", icon: Bot },
              { id: "data", label: "Data & Backup", helper: "Sync & recovery", icon: DatabaseBackup },
            ].map((item) => {
            const Icon = item.icon;
            const selected = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setActiveSection(item.id)}
                className={`settings-category-button ${selected ? "settings-category-button-active" : ""}`}
              >
                <Icon className="h-5 w-5" />
                <span className="min-w-0">
                  <strong>{item.label}</strong>
                  <small>{item.helper}</small>
                </span>
              </button>
            );
            })}
          </div>
        </nav>
      </div>

      {activeSection === "general" && <div className="glass-panel p-4">
        <div className="mb-4 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-100 text-emerald-700 shadow-inner">
            <Settings className="h-6 w-6" />
          </span>
          <div>
            <h2 className="text-xl font-black text-[#071537]">General & Appearance</h2>
            <p className="text-sm font-semibold text-blue-950/65">Report identity, branch defaults, theme, and scheduled approval.</p>
          </div>
        </div>

        <ThemeSwitcher value={draftSettings.uiTheme} onChange={handleThemeChange} />

        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Company Header" value={draftSettings.companyName || ""} onChange={(value) => updateSetting("companyName", value)} />
          <Field label="Branch Name" value={draftSettings.branchName || ""} onChange={(value) => updateSetting("branchName", value)} placeholder="Example: Middeniya" />
          <Field label="Stable Operation Target" type="number" value={draftSettings.operationTarget || ""} onChange={(value) => updateSetting("operationTarget", value)} />
          <Field label="Backup WhatsApp Number" value={draftSettings.backupWhatsappNumber || ""} onChange={(value) => updateSetting("backupWhatsappNumber", value)} placeholder="947XXXXXXXX" />
          <div className="md:col-span-2">
            <span className="mb-2 block text-sm font-black text-[#071537]">Reschedule Approval Reaction</span>
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-violet-200 bg-violet-50 p-3 shadow-inner">
              {APPROVAL_REACTION_PRESETS.map((reaction) => (
                <button
                  key={reaction}
                  type="button"
                  title={`Use ${reaction} to approve`}
                  aria-label={`Use ${reaction} to approve Reschedule Reports`}
                  aria-pressed={(draftSettings.rescheduleApprovalReaction || "✅") === reaction}
                  onClick={() => updateSetting("rescheduleApprovalReaction", reaction)}
                  className={`grid h-12 w-12 place-items-center rounded-xl border text-2xl transition ${
                    (draftSettings.rescheduleApprovalReaction || "✅") === reaction
                      ? "border-violet-600 bg-violet-600 shadow-lg shadow-violet-300"
                      : "border-white bg-white shadow-sm hover:-translate-y-0.5"
                  }`}
                >
                  {reaction}
                </button>
              ))}
              <label className="min-w-[170px] flex-1">
                <span className="sr-only">Custom approval reaction</span>
                <input
                  value={draftSettings.rescheduleApprovalReaction || "✅"}
                  onChange={(event) => updateSetting("rescheduleApprovalReaction", firstGrapheme(event.target.value) || "✅")}
                  className="h-12 w-full rounded-xl border border-violet-200 bg-white px-4 text-lg font-black text-[#071537] outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
                  placeholder="Custom emoji"
                />
              </label>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-3 text-sm font-bold text-blue-950/75">
          The JSON backup is sent at 08:00. At 20:00, today's Reschedule Report is sent to this number for approval. React with {draftSettings.rescheduleApprovalReaction || "✅"} to send it to the assigned groups.
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
      </div>}

      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {activeSection === "regionalDispatch" && <RegionalWhatsAppSettings accountKey={session?.userId || "regional"} session={session} />}
        {activeSection === "whatsapp" && <WhatsAppSettings settings={settings} onSaveSettings={onSaveSettings} accountLabel={whatsappAccountLabel} />}
        {activeSection === "meter" && <RiderMeterMonitorSettings />}

        {activeSection === "pettyCash" && <div className="glass-panel p-4 lg:col-span-2">
          <div className="mb-4 flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-amber-100 text-amber-700 shadow-inner">
              <ReceiptText className="h-6 w-6" />
            </span>
            <div>
              <h3 className="text-lg font-black text-[#071537]">Petty Cash Vehicle Employees</h3>
              <p className="text-sm font-semibold text-blue-950/65">Replace incorrect CSV employee names using the saved vehicle number.</p>
            </div>
          </div>

          <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] sm:items-end">
            <Field label="Vehicle No" value={newPettyVehicleNo} onChange={setNewPettyVehicleNo} placeholder="Example: BKZ 8841" />
            <Field label="Employee Name" value={newPettyEmployeeName} onChange={setNewPettyEmployeeName} placeholder="Correct employee name" />
            <button type="button" onClick={handleAddPettyCashVehicle} className="primary-action primary-action-blue">
              <UserPlus className="h-5 w-5" />
              Add Mapping
            </button>
          </div>

          <div className="mt-4 grid gap-2">
            {(draftSettings.pettyCashVehicleEmployees || []).length === 0 ? (
              <p className="rounded-2xl bg-white/55 p-4 text-sm font-semibold text-blue-950/60">No vehicle employee mappings saved yet.</p>
            ) : (draftSettings.pettyCashVehicleEmployees || []).map((item, index) => (
              <div key={`${item.vehicleNo}-${index}`} className="grid gap-3 rounded-2xl border border-white/70 bg-white/55 p-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_auto] sm:items-center">
                <input value={item.vehicleNo || ""} onChange={(event) => updatePettyCashVehicle(index, "vehicleNo", event.target.value)} aria-label="Vehicle number" className="h-11 rounded-2xl border border-white/80 bg-white/75 px-4 font-bold outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100" />
                <input value={item.employeeName || ""} onChange={(event) => updatePettyCashVehicle(index, "employeeName", event.target.value)} aria-label="Employee name" className="h-11 rounded-2xl border border-white/80 bg-white/75 px-4 font-bold outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100" />
                <button type="button" onClick={() => deletePettyCashVehicle(index)} className="history-action text-red-600" aria-label={`Delete ${item.vehicleNo} mapping`}>
                  <Trash2 className="h-5 w-5" />
                </button>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" onClick={handleSaveSettings} className="primary-action primary-action-green">
              <Save className="h-5 w-5" />
              Save Petty Cash Settings
            </button>
            <p className="text-sm font-semibold text-blue-950/65">Saved mappings are applied automatically to newly uploaded and previously saved Petty Cash reports.</p>
          </div>
        </div>}

        {activeSection === "automation" && <div className="glass-panel p-4 lg:col-span-2">
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

          <div className="mt-6 border-t border-white/60 pt-6">
            <div className="mb-4 flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-violet-100 text-violet-700 shadow-inner">
                <Sparkles className="h-6 w-6" />
              </span>
              <div>
                <h3 className="text-lg font-black text-[#071537]">Google Gemini AI Parser Configuration</h3>
                <p className="text-sm font-semibold text-blue-950/65">
                  Used by the Regional Manager Auto-Dispatch feature to extract branch dispatch figures from unstructured WhatsApp/SMS updates.
                </p>
              </div>
            </div>

            <div className="max-w-xl">
              <Field
                label="Google Gemini API Key"
                type="password"
                value={draftSettings.geminiApiKey || ""}
                onChange={(value) => updateSetting("geminiApiKey", value)}
                placeholder="AIzaSy..."
              />
              <p className="mt-1.5 text-xs font-semibold text-blue-950/60">
                Get a free API key at{" "}
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="font-bold text-violet-600 underline"
                >
                  Google AI Studio
                </a>
                . The system automatically cascades through models (2.5 &rarr; 2.0 &rarr; 1.5) and falls back to offline Smart Regex if unreachable.
              </p>
            </div>

            {geminiTestStatus && (
              <div
                className={`mt-3 max-w-xl rounded-2xl p-3 text-xs font-bold ${
                  geminiTestStatus.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"
                }`}
              >
                {geminiTestStatus.message}
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleSaveSettings}
                className="primary-action primary-action-green"
              >
                <Save className="h-5 w-5" />
                Save AI Settings
              </button>

              <button
                type="button"
                onClick={handleTestGeminiKey}
                disabled={testingGemini || !draftSettings.geminiApiKey?.trim()}
                className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-violet-200 bg-white px-4 py-2 text-xs font-black text-violet-800 shadow-sm transition hover:bg-violet-50 disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${testingGemini ? "animate-spin" : ""}`} />
                {testingGemini ? "Testing Connection..." : "Test Gemini Key"}
              </button>
            </div>
          </div>
        </div>}

        {activeSection === "people" && <div className="glass-panel p-4">
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
        </div>}

        {activeSection === "people" && <div className="glass-panel p-4">
          <h3 className="mb-3 text-lg font-black text-[#071537]">Delivered Rider WhatsApp Numbers</h3>
          <p className="mb-4 text-sm font-semibold text-blue-950/65">
            Delivered Report එකේ saved rider names සඳහා WhatsApp number save කරන්න.
          </p>

          <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
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
        </div>}

        {activeSection === "data" && <div className="glass-panel p-4">
          <div className="mb-3 flex items-center gap-2">
            <Cloud className="h-5 w-5 text-blue-700" />
            <h3 className="text-lg font-black text-[#071537]">Firebase Realtime Sync</h3>
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
        </div>}

        {activeSection === "data" && <div className="glass-panel p-4">
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
        </div>}
        {activeSection === "data" && children && <div className="lg:col-span-2">{children}</div>}
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
