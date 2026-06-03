import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Download,
  Eye,
  FileDown,
  FileText,
  History,
  Image,
  ListChecks,
  Package,
  PackageCheck,
  RotateCcw,
  Send,
  Settings,
  Target,
  Trash2,
  Truck,
  UserRound,
} from "lucide-react";
import CourierPerformanceForm, { emptyCourierForm } from "./components/CourierPerformanceForm.jsx";
import DateSelector from "./components/DateSelector.jsx";
import DeliveredReportConverter from "./components/DeliveredReportConverter.jsx";
import ExportButtons from "./components/ExportButtons.jsx";
import OperationReportForm, { emptyOperationForm } from "./components/OperationReportForm.jsx";
import { CourierPerformanceReport, OperationReport } from "./components/ReportTable.jsx";
import SendToWhatsAppButton from "./components/SendToWhatsAppButton.jsx";
import SettingsPage from "./components/SettingsPage.jsx";
import {
  clearReportByDate,
  deleteReportType,
  deleteCourierName,
  downloadBackupFile,
  addDataChangeListener,
  getCourierNames,
  getReportByDate,
  getReportHistory,
  getSettings,
  getLocalUpdatedAt,
  markWeeklyBackupComplete,
  restoreBackupData,
  saveCourierName,
  saveReportType,
  saveSettings,
  shouldRunWeeklyBackup,
} from "./services/reportStorage.js";
import { downloadSnapshotFromFirestore, saveWeeklyBackupToFirestore, subscribeToFirestoreSnapshot, uploadLocalSnapshotToFirestore } from "./services/cloudSync.js";
import { todayIso, displayDate } from "./utils/date.js";
import { exportBothAsPdf, exportElementAsPdf, exportElementAsPng } from "./utils/exportReports.js";

const tabs = [
  { id: "dashboard", label: "Dashboard", mobileLabel: "Home", icon: BarChart3 },
  { id: "courier", label: "Courier Performance", mobileLabel: "Courier", icon: Truck },
  { id: "operation", label: "Operation Report", mobileLabel: "Operation", icon: PackageCheck },
  { id: "exports", label: "Export / History", mobileLabel: "Export", icon: History },
  { id: "deliveredConverter", label: "Convert Delivered Report", mobileLabel: "Convert", icon: FileText },
  { id: "settings", label: "Settings", mobileLabel: "Settings", icon: Settings },
];

function getSyncClientId() {
  const key = "daily-courier-report-sync-client-id";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const nextId = crypto.randomUUID();
  localStorage.setItem(key, nextId);
  return nextId;
}

function calculateOutwardAchievement(operation) {
  const target = Number(operation?.target) || 0;
  const outward = Number(operation?.outward) || 0;
  if (target <= 0) return "0.00";
  return ((outward / target) * 100).toFixed(2);
}

function parsePercent(value) {
  const parsed = parseFloat(String(value || "").replace("%", ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function calculateTotalPercent(operation) {
  return (parsePercent(operation?.sameDayPercent) + parsePercent(operation?.firstDayPercent)).toFixed(2);
}

function withAchievement(operation) {
  const normalized = {
    ...operation,
    inward: operation.inward ?? operation.inword ?? "",
    outward: operation.outward ?? operation.outWord ?? "",
  };

  return {
    ...normalized,
    totalPercent: calculateTotalPercent(normalized),
    achievement: calculateOutwardAchievement(normalized),
  };
}

function normalizeOperation(operation, stableTarget) {
  if (!operation) return null;

  return withAchievement({
    ...operation,
    inward: operation.inward ?? operation.inword ?? "",
    outward: operation.outward ?? operation.outWord ?? "",
    target: operation.target || stableTarget || "",
  });
}

function reportTypeLabel(type) {
  if (type === "courierRows") return "Courier Performance";
  if (type === "operation") return "Operation";
  return "Delivered";
}

export default function App() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [searchDate, setSearchDate] = useState("");
  const [courierRows, setCourierRows] = useState([]);
  const [operation, setOperation] = useState(null);
  const [courierForm, setCourierForm] = useState(emptyCourierForm);
  const [operationForm, setOperationForm] = useState(emptyOperationForm);
  const [editingCourierId, setEditingCourierId] = useState(null);
  const [history, setHistory] = useState([]);
  const [exporting, setExporting] = useState(false);
  const [courierNames, setCourierNames] = useState([]);
  const [stableTarget, setStableTarget] = useState("");
  const [settings, setSettingsState] = useState(getSettings);
  const [cloudStatus, setCloudStatus] = useState("Cloud sync ready.");
  const [notice, setNotice] = useState("");

  const courierReportRef = useRef(null);
  const operationReportRef = useRef(null);
  const realtimeUploadTimerRef = useRef(null);
  const applyingRemoteSnapshotRef = useRef(false);
  const lastCloudUpdateRef = useRef("");
  const bootstrappedCloudRef = useRef(false);
  const unsavedDraftUpdatedAtRef = useRef("");
  const syncClientIdRef = useRef(getSyncClientId());

  useEffect(() => {
    const savedSettings = getSettings();
    setSettingsState(savedSettings);
    setStableTarget(savedSettings.operationTarget || "");
    setCourierNames(getCourierNames());
  }, []);

  useEffect(() => {
    bootstrapFromFirestore();
  }, []);

  useEffect(() => {
    if (!shouldRunWeeklyBackup(settings)) return;
    downloadBackupFile("weekly-auto");
    saveWeeklyBackupToFirestore()
      .then(() => setCloudStatus("Weekly Firebase backup saved."))
      .catch((error) => setCloudStatus(error.message || "Weekly Firebase backup failed."));
    setSettingsState(markWeeklyBackupComplete());
  }, [settings]);

  useEffect(() => {
    loadDate(selectedDate);
  }, [selectedDate]);

  useEffect(() => {
    if (!settings.firestoreRealtimeSync) return undefined;

    setCloudStatus("Realtime sync active.");
    uploadLocalSnapshotToFirestore("realtime-enabled", syncClientIdRef.current)
      .then((snapshot) => {
        lastCloudUpdateRef.current = snapshot.cloudUpdatedAt;
        setCloudStatus(`Realtime synced: ${new Date(snapshot.cloudUpdatedAt).toLocaleTimeString()}`);
      })
      .catch((error) => setCloudStatus(error.message || "Initial realtime sync failed."));

    const unsubscribeLocal = addDataChangeListener(() => {
      if (applyingRemoteSnapshotRef.current) return;
      window.clearTimeout(realtimeUploadTimerRef.current);
      realtimeUploadTimerRef.current = window.setTimeout(async () => {
        try {
          const snapshot = await uploadLocalSnapshotToFirestore("realtime-auto", syncClientIdRef.current);
          lastCloudUpdateRef.current = snapshot.cloudUpdatedAt;
          setCloudStatus(`Realtime uploaded: ${new Date(snapshot.cloudUpdatedAt).toLocaleTimeString()}`);
        } catch (error) {
          setCloudStatus(error.message || "Realtime upload failed.");
        }
      }, 900);
    });

    const unsubscribeCloud = subscribeToFirestoreSnapshot(
      (snapshot) => {
        if (!snapshot?.reports || snapshot.cloudUpdatedAt === lastCloudUpdateRef.current) return;
        if (snapshot.sourceClientId === syncClientIdRef.current) return;
        if (!shouldApplyCloudSnapshot(snapshot)) return;
        lastCloudUpdateRef.current = snapshot.cloudUpdatedAt || "";
        applyingRemoteSnapshotRef.current = true;
        try {
          restoreBackupData(snapshot, { silent: true });
          handleRestoreBackup();
          setCloudStatus(`Realtime downloaded: ${new Date(snapshot.cloudUpdatedAt || snapshot.exportedAt).toLocaleTimeString()}`);
        } catch (error) {
          setCloudStatus(error.message || "Realtime download failed.");
        } finally {
          applyingRemoteSnapshotRef.current = false;
        }
      },
      (error) => setCloudStatus(error.message || "Realtime sync error."),
    );

    return () => {
      window.clearTimeout(realtimeUploadTimerRef.current);
      unsubscribeLocal();
      unsubscribeCloud();
    };
  }, [settings.firestoreRealtimeSync, selectedDate]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(""), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function showNotice(message) {
    setNotice(message);
  }

  function shouldApplyCloudSnapshot(snapshot) {
    if (unsavedDraftUpdatedAtRef.current) return false;
    const cloudTime = new Date(snapshot.cloudUpdatedAt || snapshot.exportedAt || 0).getTime();
    const localTime = new Date(getLocalUpdatedAt() || 0).getTime();
    const draftTime = new Date(unsavedDraftUpdatedAtRef.current || 0).getTime();
    const newestLocalTime = Math.max(Number.isFinite(localTime) ? localTime : 0, Number.isFinite(draftTime) ? draftTime : 0);
    if (!Number.isFinite(cloudTime)) return false;
    return cloudTime >= newestLocalTime;
  }

  async function bootstrapFromFirestore() {
    if (bootstrappedCloudRef.current) return;
    bootstrappedCloudRef.current = true;

    try {
      const snapshot = await downloadSnapshotFromFirestore();
      if (!snapshot?.reports) return;

      lastCloudUpdateRef.current = snapshot.cloudUpdatedAt || "";
      const remoteSyncEnabled = Boolean(snapshot.settings?.firestoreRealtimeSync);

      if (remoteSyncEnabled && shouldApplyCloudSnapshot(snapshot)) {
        applyingRemoteSnapshotRef.current = true;
        restoreBackupData(snapshot, { silent: true });
        handleRestoreBackup();
        setCloudStatus("Firestore settings and reports loaded.");
      } else if (remoteSyncEnabled) {
        setSettingsState((current) => ({ ...current, firestoreRealtimeSync: true }));
        setCloudStatus("Firestore sync enabled. Local data is newer.");
      }
    } catch (error) {
      setCloudStatus(error.message || "Firestore bootstrap failed.");
    } finally {
      applyingRemoteSnapshotRef.current = false;
    }
  }

  function refreshHistory() {
    setHistory(getReportHistory());
  }

  function loadDate(date) {
    const report = getReportByDate(date);
    const savedSettings = getSettings();
    const normalizedOperation = normalizeOperation(report.operation, savedSettings.operationTarget);
    setCourierRows(report.courierRows || []);
    setOperation(normalizedOperation);
    setOperationForm(normalizedOperation || { ...emptyOperationForm, target: savedSettings.operationTarget || "" });
    setCourierForm(emptyCourierForm);
    setEditingCourierId(null);
    refreshHistory();
  }

  function calculateDeliveryPercent(row) {
    const onRoute = Number(row.onRouteCount) || 0;
    const delivery = Number(row.deliveryCount) || 0;
    if (onRoute <= 0) return "0.00";
    return ((delivery / onRoute) * 100).toFixed(2);
  }

  function handleCourierSubmit(event) {
    event.preventDefault();
    const normalized = {
      ...courierForm,
      courierName: courierForm.courierName.trim(),
      id: editingCourierId || crypto.randomUUID(),
      deliveryPercent: calculateDeliveryPercent(courierForm),
    };
    const nextRows = editingCourierId
      ? courierRows.map((row) => (row.id === editingCourierId ? normalized : row))
      : [...courierRows, normalized];

    setCourierRows(nextRows);
    unsavedDraftUpdatedAtRef.current = new Date().toISOString();
    setCourierForm(emptyCourierForm);
    setEditingCourierId(null);
    setCourierNames(saveCourierName(normalized.courierName));
    showNotice(editingCourierId ? "Courier row updated successfully." : "Courier row added successfully.");
  }

  function handleCourierEdit(row) {
    setCourierForm({
      courierName: row.courierName || "",
      onRouteCount: row.onRouteCount || "",
      deliveryCount: row.deliveryCount || "",
      resendCount: row.resendCount || "",
      pickupCount: row.pickupCount || "",
    });
    setEditingCourierId(row.id);
    setActiveTab("courier");
  }

  function handleCourierDelete(id) {
    if (!confirm("Delete this courier row?")) return;
    const nextRows = courierRows.filter((row) => row.id !== id);
    unsavedDraftUpdatedAtRef.current = new Date().toISOString();
    setCourierRows(nextRows);
    showNotice("Courier row deleted.");
  }

  function handleOperationSubmit(event) {
    event.preventDefault();
    const nextOperation = withAchievement(operationForm);
    setOperation(nextOperation);
    saveReportType(selectedDate, "operation", nextOperation);
    refreshHistory();
    showNotice("Operation report saved successfully.");
  }

  function handleSaveCourierReport() {
    saveReportType(selectedDate, "courierRows", courierRows);
    unsavedDraftUpdatedAtRef.current = "";
    refreshHistory();
    showNotice("Courier performance report saved successfully.");
  }

  function handleDeleteSavedReportType(type) {
    if (!confirm(`Delete saved ${reportTypeLabel(type)} report for ${selectedDate}?`)) return;
    deleteReportType(selectedDate, type);
    loadDate(selectedDate);
    showNotice(`${reportTypeLabel(type)} report deleted.`);
  }

  function handleHistoryDeleteType(date, type) {
    if (!confirm(`Delete saved ${reportTypeLabel(type)} report for ${date}?`)) return;
    deleteReportType(date, type);
    refreshHistory();
    if (date === selectedDate) loadDate(selectedDate);
    showNotice(`${reportTypeLabel(type)} report deleted.`);
  }

  function handleSaveCourierName(name) {
    const nextNames = saveCourierName(name);
    setCourierNames(nextNames);
    showNotice("Courier name saved successfully.");
  }

  function handleDeleteCourierName(name) {
    if (!confirm(`Delete courier name "${name}"?`)) return;
    setCourierNames(deleteCourierName(name));
    showNotice("Courier name deleted.");
  }

  function handleApplyStableTarget() {
    const savedSettings = saveSettings({ operationTarget: stableTarget });
    setSettingsState(savedSettings);
    const nextForm = {
      ...operationForm,
      target: savedSettings.operationTarget || "",
    };
    setOperationForm(nextForm);
    showNotice("Stable target saved successfully.");
  }

  async function handleSaveAppSettings(nextSettings) {
    const savedSettings = saveSettings(nextSettings);
    setSettingsState(savedSettings);
    setStableTarget(savedSettings.operationTarget || "");
    setOperationForm((current) => ({ ...current, target: savedSettings.operationTarget || "" }));
    showNotice("Settings saved successfully.");

    setCloudStatus("Saving settings to Firestore...");
    try {
      const snapshot = await uploadLocalSnapshotToFirestore("settings-save", syncClientIdRef.current);
      lastCloudUpdateRef.current = snapshot.cloudUpdatedAt;
      setCloudStatus(`Settings synced to Firestore: ${new Date(snapshot.cloudUpdatedAt).toLocaleTimeString()}`);
    } catch (error) {
      setCloudStatus(error.message || "Settings Firestore sync failed.");
    }
  }

  function handleRestoreBackup() {
    const savedSettings = getSettings();
    setSettingsState(savedSettings);
    setStableTarget(savedSettings.operationTarget || "");
    setCourierNames(getCourierNames());
    loadDate(selectedDate);
  }

  async function handleCloudUpload() {
    setCloudStatus("Uploading local data to Firestore...");
    try {
      const snapshot = await uploadLocalSnapshotToFirestore("manual-upload", syncClientIdRef.current);
      lastCloudUpdateRef.current = snapshot.cloudUpdatedAt;
      const savedSettings = saveSettings({ cloudLastSyncedAt: snapshot.cloudUpdatedAt });
      setSettingsState(savedSettings);
      setCloudStatus(`Uploaded to Firestore: ${new Date(snapshot.cloudUpdatedAt).toLocaleString()}`);
      showNotice("Uploaded to Firestore successfully.");
    } catch (error) {
      setCloudStatus(error.message || "Cloud upload failed.");
    }
  }

  async function handleCloudDownload() {
    if (!confirm("Download Firestore cloud data and replace this device LocalStorage?")) return;
    setCloudStatus("Downloading Firestore data...");
    try {
      const snapshot = await downloadSnapshotFromFirestore();
      if (!snapshot) {
        setCloudStatus("No cloud data found yet.");
        return;
      }
      applyingRemoteSnapshotRef.current = true;
      restoreBackupData(snapshot, { silent: true });
      handleRestoreBackup();
      lastCloudUpdateRef.current = snapshot.cloudUpdatedAt || "";
      setCloudStatus(`Downloaded from Firestore: ${new Date(snapshot.cloudUpdatedAt || snapshot.exportedAt).toLocaleString()}`);
      showNotice("Downloaded from Firestore successfully.");
    } catch (error) {
      setCloudStatus(error.message || "Cloud download failed.");
    } finally {
      applyingRemoteSnapshotRef.current = false;
    }
  }

  function handleSearch() {
    if (!searchDate) return;
    setSelectedDate(searchDate);
    setActiveTab("exports");
  }

  function handleClearDate() {
    if (!confirm(`Clear all saved data for ${selectedDate}?`)) return;
    clearReportByDate(selectedDate);
    loadDate(selectedDate);
    showNotice("Selected date data cleared.");
  }

  async function runExport(action) {
    setExporting(true);
    try {
      await action();
    } finally {
      setExporting(false);
    }
  }

  const stats = useMemo(() => {
    const totalOnRoute = courierRows.reduce((sum, row) => sum + (Number(row.onRouteCount) || 0), 0);
    const totalDelivery = courierRows.reduce((sum, row) => sum + (Number(row.deliveryCount) || 0), 0);
    const deliveryPercent = totalOnRoute > 0 ? ((totalDelivery / totalOnRoute) * 100).toFixed(2) : "0.00";
    const outward = Number(operation?.outward) || 0;
    const targetValue = Number(operation?.target || stableTarget) || 0;
    const achievement = targetValue > 0 ? ((outward / targetValue) * 100).toFixed(2) : "0.00";
    return { totalOnRoute, totalDelivery, deliveryPercent, outward, targetValue, achievement };
  }, [courierRows, operation, stableTarget]);

  const activeTabLabel = tabs.find((tab) => tab.id === activeTab)?.label || "Dashboard";

  return (
    <div className="app-shell app-background pb-24 text-[#071537] md:grid md:grid-cols-[250px_1fr] md:gap-4 md:p-3 md:pb-3">
      {notice && (
        <div className="fixed right-4 top-4 z-50 max-w-sm rounded-2xl border border-white/70 bg-emerald-600 px-5 py-3 text-sm font-black text-white shadow-2xl">
          {notice}
        </div>
      )}
      <aside className="glass-sidebar no-print hidden md:flex">
        <div className="grid gap-3 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br from-emerald-500 to-green-800 text-white shadow-[0_18px_35px_rgba(16,185,129,0.35)]">
            <Truck className="h-9 w-9" />
          </div>
          <div>
            <h2 className="text-xl font-black leading-tight">Daily Courier</h2>
            <p className="text-sm font-semibold text-blue-900/75">Report System</p>
          </div>
        </div>

        <nav className="mt-8 grid gap-3">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`sidebar-link ${isActive ? "sidebar-link-active" : ""}`}
              >
                <span className="sidebar-icon">
                  <Icon className="h-5 w-5" />
                </span>
                {tab.label}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto rounded-[28px] border border-white/70 bg-cyan-50/55 p-5 text-center shadow-inner">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-cyan-500 to-emerald-500 text-white shadow-lg">
            <Send className="h-8 w-8" />
          </div>
          <p className="font-black">Fast. Accurate.</p>
          <p className="text-sm font-semibold text-blue-900/70">Daily Courier Reporting</p>
        </div>
      </aside>

      <div className="min-w-0 md:rounded-[32px] md:border md:border-white/70 md:bg-white/25 md:p-7 md:shadow-[0_25px_80px_rgba(28,80,140,0.18)]">
      <header className="sticky top-0 z-30 border-b border-white/50 bg-white/80 backdrop-blur md:static md:border-0 md:bg-transparent">
        <div className="flex flex-col gap-3 px-4 py-3 md:px-0 md:py-0 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-wide text-teal-700 md:text-sm">Daily <span className="text-emerald-600">Courier</span> Branch Reporting</p>
            <h1 className="mt-0.5 text-2xl font-black tracking-tight text-[#091333] md:mt-3 md:text-5xl">Daily Courier Report System</h1>
            <p className="mt-1 text-sm font-semibold text-blue-950/80 md:text-base">Fast daily entry, saved courier names, clean WhatsApp-ready exports.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:min-w-[460px]">
            <TopMetric icon={CalendarDays} label="Today" value={displayDate(todayIso())} tone="red" />
            <TopMetric icon={Target} label="Target" value={stableTarget || "Not set"} tone="green" />
          </div>
        </div>
      </header>

      <main className="grid gap-4 px-3 py-4 md:gap-5 md:px-0 md:py-6">
        <div className="md:hidden">
          <p className="text-sm font-black text-stone-900">{activeTabLabel}</p>
          <p className="text-xs font-semibold text-stone-500">Mobile app mode</p>
        </div>

        {activeTab !== "deliveredConverter" && activeTab !== "settings" && (
          <DateSelector
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            searchDate={searchDate}
            onSearchDateChange={setSearchDate}
            onSearch={handleSearch}
          />
        )}

        {activeTab === "dashboard" && (
          <section className="grid gap-5">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <SummaryCard label="Courier Rows" value={courierRows.length} helper="Total entries for this report" icon={Truck} color="green" />
              <SummaryCard label="Saved Names" value={courierNames.length} helper="Unique courier names saved" icon={UserRound} color="purple" />
              <SummaryCard label="Delivery %" value={`${stats.deliveryPercent}%`} helper="Successful deliveries" icon={Target} color="blue" />
              <SummaryCard label="Outward Achievement" value={`${stats.achievement}%`} helper="Outward target achieved" icon={ArrowRight} color="red" />
            </div>

            <div className="glass-panel grid grid-cols-2 gap-3 p-3 md:grid-cols-5">
              <QuickButton label="Add Courier" icon={Truck} onClick={() => setActiveTab("courier")} tone="green" />
              <QuickButton label="Add Operation" icon={Package} onClick={() => setActiveTab("operation")} tone="red" />
              <QuickButton label="View Reports" icon={History} onClick={() => setActiveTab("exports")} tone="blue" className="col-span-2 md:col-span-1" />
              <QuickButton label="Export PNG" icon={Image} onClick={() => setActiveTab("exports")} tone="teal" />
              <QuickButton label="Export PDF" icon={FileDown} onClick={() => setActiveTab("exports")} tone="red" />
            </div>

            <HistoryList history={history} savedNamesCount={courierNames.length} onOpenExports={() => setActiveTab("exports")} onSelect={(date) => setSelectedDate(date)} onDeleteType={handleHistoryDeleteType} />
          </section>
        )}

        {activeTab === "courier" && (
          <CourierPerformanceForm
            selectedDate={selectedDate}
            rows={courierRows}
            form={courierForm}
            setForm={setCourierForm}
            editingId={editingCourierId}
            onSubmit={handleCourierSubmit}
            onEdit={handleCourierEdit}
            onDelete={handleCourierDelete}
            onSaveReport={handleSaveCourierReport}
            onDeleteSavedReport={() => handleDeleteSavedReportType("courierRows")}
            courierNames={courierNames}
            onSaveCourierName={handleSaveCourierName}
            onDeleteCourierName={handleDeleteCourierName}
            onCancel={() => {
              setCourierForm(emptyCourierForm);
              setEditingCourierId(null);
            }}
          />
        )}

        {activeTab === "operation" && (
          <OperationReportForm
            selectedDate={selectedDate}
            form={operationForm}
            setForm={setOperationForm}
            onSubmit={handleOperationSubmit}
            onDeleteSavedReport={() => handleDeleteSavedReportType("operation")}
            stableTarget={stableTarget}
            onStableTargetChange={setStableTarget}
            onApplyStableTarget={handleApplyStableTarget}
          />
        )}

        {activeTab === "exports" && (
          <section className="grid gap-5">
            <div className="glass-panel p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black text-stone-900">Export Reports</h2>
                  <p className="text-sm font-semibold text-stone-500">Exports use only the official report areas below.</p>
                </div>
                <button type="button" onClick={handleClearDate} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-red-200 px-4 py-2 text-sm font-extrabold text-red-700 hover:bg-red-50">
                  <RotateCcw className="h-4 w-4" />
                  Clear Date
                </button>
              </div>
              <ExportButtons
                disabled={exporting}
                courierReportRef={courierReportRef}
                operationReportRef={operationReportRef}
                reportDate={selectedDate}
                onCourierPng={() => runExport(() => exportElementAsPng(courierReportRef.current, "Branch_Courier_Performance_Report", selectedDate))}
                onCourierPdf={() => runExport(() => exportElementAsPdf(courierReportRef.current, "Branch_Courier_Performance_Report", selectedDate))}
                onOperationPng={() => runExport(() => exportElementAsPng(operationReportRef.current, "Operation_Report", selectedDate))}
                onOperationPdf={() => runExport(() => exportElementAsPdf(operationReportRef.current, "Operation_Report", selectedDate))}
                onBothPdf={() => runExport(() => exportBothAsPdf([courierReportRef.current, operationReportRef.current], selectedDate))}
              />
            </div>

            <div className="grid gap-5 overflow-hidden xl:grid-cols-2">
              <div className="overflow-x-auto rounded-3xl border border-white/70 bg-white/55 shadow-xl">
                <CourierPerformanceReport selectedDate={selectedDate} rows={courierRows} reportRef={courierReportRef} companyName={settings.companyName} branchName={settings.branchName} />
              </div>
              <div className="overflow-x-auto rounded-3xl border border-white/70 bg-white/55 shadow-xl">
                <OperationReport selectedDate={selectedDate} operation={operation} reportRef={operationReportRef} companyName={settings.companyName} branchName={settings.branchName} />
              </div>
            </div>

            <HistoryList history={history} savedNamesCount={courierNames.length} onOpenExports={() => setActiveTab("exports")} onSelect={(date) => setSelectedDate(date)} onDeleteType={handleHistoryDeleteType} />
          </section>
        )}

        {activeTab === "deliveredConverter" && <DeliveredReportConverter onSaved={refreshHistory} companyName={settings.companyName} defaultBranchName={settings.branchName} />}

        {activeTab === "settings" && (
          <SettingsPage
            settings={settings}
            onSaveSettings={handleSaveAppSettings}
            courierNames={courierNames}
            onSaveCourierName={handleSaveCourierName}
            onDeleteCourierName={handleDeleteCourierName}
            onRestore={handleRestoreBackup}
            onCloudUpload={handleCloudUpload}
            onCloudDownload={handleCloudDownload}
            cloudStatus={cloudStatus}
          />
        )}
      </main>
      </div>

      <nav className="mobile-bottom-nav no-print fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-white/95 px-2 pt-2 shadow-[0_-8px_24px_rgba(20,40,20,0.10)] backdrop-blur md:hidden">
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-md px-1 text-[11px] font-black transition ${
                  isActive ? "bg-green-700 text-white" : "text-stone-600 hover:bg-green-50 hover:text-green-800"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="max-w-full truncate">{tab.mobileLabel || tab.label.split(" ")[0]}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function TopMetric({ icon: Icon, label, value, tone }) {
  const toneClass = tone === "red" ? "from-rose-50/90 to-white/65 text-red-600" : "from-emerald-50/90 to-white/65 text-emerald-700";
  return (
    <div className={`glass-panel flex items-center gap-3 bg-gradient-to-br ${toneClass} p-3 md:p-4`}>
      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/75 shadow-inner md:h-16 md:w-16">
        <Icon className="h-7 w-7" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-black uppercase text-[#071537]"> {label}</p>
        <p className="truncate text-lg font-black md:text-2xl">{value}</p>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, helper, icon: Icon, color }) {
  const colorClass =
    color === "red"
      ? "from-rose-50/95 to-pink-100/70 text-red-600"
      : color === "blue"
        ? "from-sky-50/95 to-cyan-100/75 text-blue-600"
        : color === "purple"
          ? "from-violet-50/95 to-purple-100/70 text-violet-700"
          : "from-emerald-50/95 to-green-100/75 text-emerald-700";
  return (
    <div className={`glass-panel relative overflow-hidden bg-gradient-to-br p-4 ${colorClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/70 shadow-lg md:h-16 md:w-16">
          <Icon className="h-7 w-7 md:h-9 md:w-9" />
        </div>
        <ListChecks className="h-5 w-5 opacity-55" />
      </div>
      <div className="mt-4">
        <p className="text-[11px] font-black uppercase tracking-wide text-[#071537] md:text-xs">{label}</p>
        <p className="mt-1 text-3xl font-black text-[#071537] md:text-4xl">{value}</p>
        <p className="mt-3 max-w-36 text-xs font-semibold text-blue-950/80 md:text-sm">{helper}</p>
      </div>
      <div className="mini-chart" />
    </div>
  );
}

function QuickButton({ label, icon: Icon, onClick, tone, className = "" }) {
  const toneClass =
    tone === "red"
      ? "from-red-500 to-rose-600 shadow-red-300/60"
      : tone === "blue"
        ? "from-blue-700 to-sky-500 shadow-blue-300/60"
        : tone === "teal"
          ? "from-teal-600 to-emerald-500 shadow-emerald-300/60"
          : "from-emerald-700 to-green-400 shadow-emerald-300/60";
  return (
    <button type="button" onClick={onClick} className={`inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-white/55 bg-gradient-to-br px-3 py-3 text-sm font-extrabold text-white shadow-xl transition hover:-translate-y-0.5 md:min-h-16 md:px-4 md:text-base ${toneClass} ${className}`}>
      <Icon className="h-5 w-5" />
      {label}
    </button>
  );
}

function HistoryList({ history, onSelect, savedNamesCount, onOpenExports, onDeleteType }) {
  return (
    <section className="glass-panel p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-100 text-emerald-700 shadow-inner">
            <ListChecks className="h-6 w-6" />
          </span>
          <h2 className="text-lg font-black text-[#071537]">Saved Report History</h2>
        </div>
        <span className="hidden items-center gap-2 rounded-2xl border border-white/70 bg-white/50 px-4 py-2 text-sm font-black text-blue-950 md:inline-flex">
          View All History
          <ArrowRight className="h-4 w-4" />
        </span>
      </div>
      {history.length === 0 ? (
        <p className="rounded-2xl bg-white/55 p-4 text-sm font-semibold text-blue-950/65">No saved reports yet.</p>
      ) : (
        <div className="grid gap-2">
          {history.map((item) => (
            <div key={item.date} className="grid gap-3 rounded-2xl border border-white/65 bg-white/55 px-4 py-3 text-left shadow-sm md:grid-cols-[1.1fr_1.7fr_auto] md:items-center">
              <button type="button" onClick={() => onSelect(item.date)} className="flex items-center gap-3 text-left">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-100 text-emerald-700">
                  <CalendarDays className="h-5 w-5" />
                </span>
                <span>
                  <span className="block font-black text-[#071537]">{displayDate(item.date)}</span>
                  <span className="text-xs font-bold text-blue-950/60">{item.date}</span>
                </span>
              </button>
              <div className="flex flex-wrap gap-2">
                <ReportBadge label={`Courier ${item.courierCount || ""}`} active={item.hasCourier} onDelete={() => onDeleteType?.(item.date, "courierRows")} />
                <ReportBadge label="Operation" active={item.hasOperation} onDelete={() => onDeleteType?.(item.date, "operation")} />
                <ReportBadge label={`Delivered ${item.deliveredCount || ""}`} active={item.hasDelivered} onDelete={() => onDeleteType?.(item.date, "delivered")} />
                <span className="inline-flex items-center rounded-xl bg-violet-100 px-3 py-2 text-xs font-black text-violet-700">{savedNamesCount} names</span>
              </div>
              <div className="flex gap-2 md:justify-end">
                <button type="button" onClick={() => onSelect(item.date)} className="history-action text-blue-700" aria-label="View report">
                  <Eye className="h-5 w-5" />
                </button>
                <button type="button" onClick={onOpenExports} className="history-action text-blue-700" aria-label="Download report">
                  <Download className="h-5 w-5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ReportBadge({ label, active, onDelete }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-black ${active ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-700"}`}>
      <CheckCircle2 className="h-4 w-4" />
      {active ? label : `${label} empty`}
      {active && (
        <button type="button" onClick={onDelete} className="rounded-full text-red-600 hover:bg-red-50" aria-label={`Delete ${label}`}>
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </span>
  );
}
