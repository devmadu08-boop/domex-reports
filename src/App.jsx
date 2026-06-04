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
  Home,
  Image,
  KeyRound,
  ListChecks,
  LogOut,
  Package,
  PackageCheck,
  RotateCcw,
  Search,
  Send,
  Server,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  Truck,
  UserRound,
  UserPlus,
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
  clearStoredSession,
  getCourierNames,
  getReportByDate,
  getReportHistory,
  getSettings,
  getLocalUpdatedAt,
  getStoredSession,
  getUsers,
  loginWithBranch,
  markWeeklyBackupComplete,
  restoreBackupData,
  replaceUserAccounts,
  saveCourierName,
  saveReportType,
  saveSettings,
  saveUserAccount,
  deleteUserAccount,
  setActiveBranch,
  shouldRunWeeklyBackup,
} from "./services/reportStorage.js";
import { downloadSnapshotFromFirestore, downloadUsersFromFirestore, saveWeeklyBackupToFirestore, subscribeToFirestoreSnapshot, uploadLocalSnapshotToFirestore, uploadUsersToFirestore } from "./services/cloudSync.js";
import { getBackendHealth } from "./services/whatsappApi.js";
import { todayIso, displayDate } from "./utils/date.js";
import { exportBothAsPdf, exportElementAsPdf, exportElementAsPng } from "./utils/exportReports.js";

const tabs = [
  { id: "dashboard", label: "Dashboard", mobileLabel: "Home", icon: Home },
  { id: "courier", label: "Courier Performance", mobileLabel: "Courier", icon: Truck },
  { id: "operation", label: "Operation Report", mobileLabel: "Operation", icon: PackageCheck },
  { id: "exports", label: "Export / History", mobileLabel: "Export", icon: History },
  { id: "deliveredConverter", label: "Convert Report", mobileLabel: "Convert", icon: FileText },
  { id: "settings", label: "Settings", mobileLabel: "Settings", icon: Settings },
  { id: "users", label: "User Management", mobileLabel: "Users", icon: ShieldCheck, adminOnly: true },
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
  const initialSession = getStoredSession();
  if (initialSession?.branchName) setActiveBranch(initialSession.branchName);
  const [session, setSession] = useState(initialSession);
  const [firebaseStatus, setFirebaseStatus] = useState("Firebase waiting for login.");
  const [firebaseBootstrapped, setFirebaseBootstrapped] = useState(false);
  const [backendStatus, setBackendStatus] = useState("Checking backend...");
  const [users, setUsers] = useState(getUsers);
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
  const [pendingHistoryDownload, setPendingHistoryDownload] = useState(null);

  const courierReportRef = useRef(null);
  const operationReportRef = useRef(null);
  const realtimeUploadTimerRef = useRef(null);
  const applyingRemoteSnapshotRef = useRef(false);
  const lastCloudUpdateRef = useRef("");
  const bootstrappedCloudRef = useRef(false);
  const unsavedDraftUpdatedAtRef = useRef("");
  const syncClientIdRef = useRef(getSyncClientId());

  const visibleTabs = useMemo(() => tabs.filter((tab) => !tab.adminOnly || session?.role === "admin"), [session?.role]);

  useEffect(() => {
    if (!session?.branchName) return;
    setActiveBranch(session.branchName);
    const savedSettings = getSettings();
    setSettingsState(savedSettings);
    setStableTarget(savedSettings.operationTarget || "");
    setCourierNames(getCourierNames());
  }, [session?.branchName]);

  useEffect(() => {
    if (session?.role !== "admin") return;
    downloadUsersFromFirestore()
      .then((cloudUsers) => {
        if (cloudUsers.length) setUsers(replaceUserAccounts(cloudUsers));
      })
      .catch(() => {
        setUsers(getUsers());
      });
  }, [session?.role]);

  useEffect(() => {
    if (!session?.branchName) return;
    if (!firebaseBootstrapped) return;
    if (!shouldRunWeeklyBackup(settings)) return;
    downloadBackupFile("weekly-auto");
    saveWeeklyBackupToFirestore()
      .then(() => setCloudStatus("Weekly Firebase backup saved."))
      .catch((error) => setCloudStatus(error.message || "Weekly Firebase backup failed."));
    setSettingsState(markWeeklyBackupComplete());
  }, [settings, session?.branchName, firebaseBootstrapped]);

  useEffect(() => {
    if (!session?.branchName) return;
    loadDate(selectedDate);
  }, [selectedDate, session?.branchName]);

  useEffect(() => {
    if (!pendingHistoryDownload || activeTab !== "exports" || selectedDate !== pendingHistoryDownload.date) return undefined;

    const timer = window.setTimeout(() => {
      runHistoryDownload(pendingHistoryDownload);
    }, 350);

    return () => window.clearTimeout(timer);
  }, [pendingHistoryDownload, selectedDate, activeTab, courierRows, operation]);

  useEffect(() => {
    if (!session?.branchName) return undefined;

    let cancelled = false;
    setCloudStatus("Loading Firebase branch data...");
    setFirebaseStatus("Firebase syncing...");

    async function bootstrapThenUpload() {
      try {
        await bootstrapFromFirestore();
        if (cancelled) return;
        const snapshot = await uploadLocalSnapshotToFirestore("auto-sync-enabled", syncClientIdRef.current);
        if (cancelled) return;
        lastCloudUpdateRef.current = snapshot.cloudUpdatedAt;
        setCloudStatus(`Firebase synced: ${new Date(snapshot.cloudUpdatedAt).toLocaleTimeString()}`);
        setFirebaseStatus("Firebase connected");
      } catch (error) {
        if (cancelled) return;
        setCloudStatus(error.message || "Initial Firebase sync failed.");
        setFirebaseStatus("Firebase error");
      } finally {
        if (!cancelled) setFirebaseBootstrapped(true);
      }
    }

    bootstrapThenUpload();

    const unsubscribeLocal = addDataChangeListener(() => {
      if (!firebaseBootstrapped) return;
      if (applyingRemoteSnapshotRef.current) return;
      window.clearTimeout(realtimeUploadTimerRef.current);
      realtimeUploadTimerRef.current = window.setTimeout(async () => {
        try {
          const snapshot = await uploadLocalSnapshotToFirestore("realtime-auto", syncClientIdRef.current);
          lastCloudUpdateRef.current = snapshot.cloudUpdatedAt;
          setCloudStatus(`Firebase uploaded: ${new Date(snapshot.cloudUpdatedAt).toLocaleTimeString()}`);
          setFirebaseStatus("Firebase connected");
        } catch (error) {
          setCloudStatus(error.message || "Firebase upload failed.");
          setFirebaseStatus("Firebase error");
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
          setCloudStatus(`Firebase downloaded: ${new Date(snapshot.cloudUpdatedAt || snapshot.exportedAt).toLocaleTimeString()}`);
          setFirebaseStatus("Firebase connected");
        } catch (error) {
          setCloudStatus(error.message || "Firebase download failed.");
          setFirebaseStatus("Firebase error");
        } finally {
          applyingRemoteSnapshotRef.current = false;
        }
      },
      (error) => {
        setCloudStatus(error.message || "Firebase sync error.");
        setFirebaseStatus("Firebase error");
      },
    );

    return () => {
      cancelled = true;
      window.clearTimeout(realtimeUploadTimerRef.current);
      unsubscribeLocal();
      unsubscribeCloud();
    };
  }, [session?.branchName, selectedDate, firebaseBootstrapped]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(""), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (session?.role !== "admin") return undefined;

    let cancelled = false;
    async function checkBackend() {
      try {
        await getBackendHealth();
        if (!cancelled) setBackendStatus("Backend server running");
      } catch {
        if (!cancelled) setBackendStatus("Backend server offline");
      }
    }

    checkBackend();
    const timer = window.setInterval(checkBackend, 10000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [session?.role]);

  function showNotice(message) {
    setNotice(message);
  }

  async function handleLogin(branchName, password) {
    try {
      const cloudUsers = await downloadUsersFromFirestore().catch(() => []);
      if (cloudUsers.length) setUsers(replaceUserAccounts(cloudUsers));
      const nextSession = loginWithBranch(branchName, password);
      setFirebaseBootstrapped(false);
      setSession(nextSession);
      setActiveTab("dashboard");
      bootstrappedCloudRef.current = false;
      showNotice(`Logged in as ${nextSession.branchName}.`);
    } catch (error) {
      throw error;
    }
  }

  function handleLogout() {
    clearStoredSession();
    setSession(null);
    setActiveTab("dashboard");
    setCourierRows([]);
    setOperation(null);
    setHistory([]);
    setCourierNames([]);
    setFirebaseStatus("Firebase waiting for login.");
    setFirebaseBootstrapped(false);
    setBackendStatus("Checking backend...");
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

      if (shouldApplyCloudSnapshot(snapshot)) {
        applyingRemoteSnapshotRef.current = true;
        restoreBackupData(snapshot, { silent: true });
        handleRestoreBackup();
        setCloudStatus("Firebase settings and reports loaded.");
        setFirebaseStatus("Firebase connected");
      } else {
        setCloudStatus("Firebase sync enabled. Local data is newer.");
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

  async function handleSaveUser(user) {
    try {
      const nextUsers = saveUserAccount(user);
      setUsers(nextUsers);
      await uploadUsersToFirestore();
      showNotice("Branch user saved and synced.");
    } catch (error) {
      showNotice(error.message || "Could not save user.");
    }
  }

  async function handleDeleteUser(branchName) {
    if (!confirm(`Delete branch user "${branchName}"?`)) return;
    try {
      const nextUsers = deleteUserAccount(branchName);
      setUsers(nextUsers);
      await uploadUsersToFirestore();
      showNotice("Branch user deleted and synced.");
    } catch (error) {
      showNotice(error.message || "Could not delete user.");
    }
  }

  function handleSearch() {
    if (!searchDate) return;
    setSelectedDate(searchDate);
    setActiveTab("exports");
  }

  function handleHistoryView(date) {
    setSelectedDate(date);
    setActiveTab("exports");
    showNotice(`Loaded reports for ${date}.`);
  }

  function handleHistoryDownload(item) {
    if (!item.hasCourier && !item.hasOperation) {
      showNotice("This date only has rider delivered reports. Open Convert Delivered Report and select rider to export.");
      setSelectedDate(item.date);
      setActiveTab("deliveredConverter");
      return;
    }

    setPendingHistoryDownload(item);
    setSelectedDate(item.date);
    setActiveTab("exports");
    showNotice(`Preparing download for ${item.date}...`);
  }

  async function runHistoryDownload(item) {
    setPendingHistoryDownload(null);
    await runExport(async () => {
      if (item.hasCourier && item.hasOperation) {
        await exportBothAsPdf([courierReportRef.current, operationReportRef.current], item.date);
      } else if (item.hasCourier) {
        await exportElementAsPdf(courierReportRef.current, "Branch_Courier_Performance_Report", item.date);
      } else if (item.hasOperation) {
        await exportElementAsPdf(operationReportRef.current, "Operation_Report", item.date);
      }
    });
    showNotice(`Downloaded saved report for ${item.date}.`);
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

  const activeTabLabel = visibleTabs.find((tab) => tab.id === activeTab)?.label || "Dashboard";

  if (!session) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <div className="app-shell app-background pb-24 text-[#15143b] xl:grid xl:grid-cols-[260px_1fr] xl:gap-5 xl:p-5 xl:pb-5">
      {notice && (
        <div className="fixed right-4 top-4 z-50 max-w-sm rounded-[22px] border border-white/70 bg-violet-600 px-5 py-3 text-sm font-black text-white shadow-2xl shadow-violet-300/50">
          {notice}
        </div>
      )}
      <aside className="glass-sidebar no-print hidden xl:flex">
        <div className="sidebar-profile">
          <div className="profile-avatar">
            <span className="avatar-hair" />
            <span className="avatar-face" />
            <span className="avatar-body" />
          </div>
          <div>
            <h2 className="text-2xl font-black leading-tight text-white drop-shadow">Hi, {settings.branchName || session.branchName || "Branch"}!</h2>
            <p className="text-sm font-bold text-white/88">Welcome back</p>
          </div>
        </div>

        <nav className="mt-7 grid gap-3">
          {visibleTabs.map((tab) => {
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

        <button type="button" onClick={handleLogout} className="mt-auto inline-flex min-h-12 items-center justify-center gap-2 rounded-[20px] border border-[#d6c7f7] bg-[#fff8f4] text-sm font-black text-violet-700 shadow-[7px_8px_16px_rgba(92,68,166,0.18),-5px_-5px_14px_rgba(221,207,255,0.38)]">
          <LogOut className="h-5 w-5" />
          Logout
        </button>

        <div className="rounded-[26px] border border-[#cdbcf5] bg-[#b497f1] p-4 shadow-[inset_7px_7px_15px_rgba(101,72,178,0.24),inset_-7px_-7px_15px_rgba(224,209,255,0.5),9px_10px_20px_rgba(92,68,166,0.22)]">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-lg shadow-violet-400/40">
              <Send className="h-6 w-6" />
            </span>
            <span>
              <span className="block text-sm font-black text-white">Fast. Accurate.</span>
              <span className="block text-xs font-semibold text-white/82">Daily Courier Reporting</span>
            </span>
          </div>
        </div>
      </aside>

      <div className="main-dashboard-surface min-w-0">
      {session.role === "admin" && (
        <div className="mb-4 grid gap-3 md:grid-cols-2">
          <StatusPill icon={ShieldCheck} label="Firebase" value={firebaseStatus} ok={firebaseStatus.includes("connected")} />
          <StatusPill icon={Server} label="Backend" value={backendStatus} ok={backendStatus.includes("running")} />
        </div>
      )}
      <header className="sticky top-0 z-30 border-b border-[#eadff2] bg-[#fff7f2] xl:static xl:border-0 xl:bg-transparent">
        <div className="flex flex-col gap-4 px-4 py-4 xl:px-0 xl:py-0">
          <div className="grid gap-4 xl:grid-cols-[1fr_420px] xl:items-center">
            <div>
              <p className="text-sm font-black text-violet-600">{activeTabLabel}</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-[#101233] md:text-5xl">Daily Courier Report System</h1>
              <p className="mt-2 text-sm font-semibold text-[#4d4b86] md:text-base">Fast daily entry, saved courier names, clean WhatsApp-ready exports.</p>
            </div>
            <label className="top-search-bar">
              <Search className="h-6 w-6 text-violet-400" />
              <input type="search" placeholder="Search reports, couriers..." className="min-w-0 flex-1 bg-transparent text-sm font-bold text-[#15143b] outline-none placeholder:text-[#8b7bb5]" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3 xl:hidden">
            <TopMetric icon={CalendarDays} label="Today" value={displayDate(todayIso())} tone="red" />
            <TopMetric icon={Target} label="Target" value={stableTarget || "Not set"} tone="green" />
          </div>
        </div>
      </header>

      <main className="grid gap-4 px-3 py-4 md:gap-5 md:px-4 xl:px-0 xl:py-6">
        <div className="xl:hidden">
          <p className="text-sm font-black text-[#15143b]">{activeTabLabel}</p>
          <p className="text-xs font-semibold text-[#6f6597]">Mobile app mode</p>
        </div>

        {activeTab !== "deliveredConverter" && activeTab !== "settings" && activeTab !== "dashboard" && (
          <DateSelector
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            searchDate={searchDate}
            onSearchDateChange={setSearchDate}
            onSearch={handleSearch}
          />
        )}

        {activeTab === "dashboard" && (
          <section className="dashboard-layout">
            <div className="dashboard-main-column">
              <DateSelector
                selectedDate={selectedDate}
                onDateChange={setSelectedDate}
                searchDate={searchDate}
                onSearchDateChange={setSearchDate}
                onSearch={handleSearch}
              />

              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <SummaryCard label="Courier Rows" value={courierRows.length} helper="Total entries for this report" icon={Package} color="purple" />
                <SummaryCard label="Saved Names" value={courierNames.length} helper="Unique courier names saved" icon={UserRound} color="pink" />
                <SummaryCard label="Delivery %" value={`${stats.deliveryPercent}%`} helper="Successful deliveries" icon={Target} color="orange" />
                <SummaryCard label="Outward Achievement" value={`${stats.achievement}%`} helper="Outward target achieved" icon={ArrowRight} color="blue" />
              </div>

              <div className="action-dock">
                <QuickButton label="Add Courier" icon={Truck} onClick={() => setActiveTab("courier")} tone="purple" />
                <QuickButton label="Add Operation" icon={Package} onClick={() => setActiveTab("operation")} tone="pink" />
                <QuickButton label="View Reports" icon={FileText} onClick={() => setActiveTab("exports")} tone="orange" />
                <QuickButton label="Export PNG" icon={Image} onClick={() => setActiveTab("exports")} tone="blue" />
                <QuickButton label="Export PDF" icon={FileDown} onClick={() => setActiveTab("exports")} tone="green" />
              </div>

              <HistoryList history={history} savedNamesCount={courierNames.length} onView={handleHistoryView} onDownload={handleHistoryDownload} onSelect={(date) => setSelectedDate(date)} onDeleteType={handleHistoryDeleteType} />
              <BottomBanner onClick={() => setActiveTab("courier")} />
            </div>

            <aside className="dashboard-side-column">
              <CourierBanner />
              <PerformanceOverview stats={stats} />
              <QuickSummary history={history} stats={stats} courierNames={courierNames} />
            </aside>
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
              <div className="overflow-x-auto rounded-3xl border border-[#eadff2] bg-[#fff8f4] shadow-xl">
                <CourierPerformanceReport selectedDate={selectedDate} rows={courierRows} reportRef={courierReportRef} companyName={settings.companyName} branchName={settings.branchName} />
              </div>
              <div className="overflow-x-auto rounded-3xl border border-[#eadff2] bg-[#fff8f4] shadow-xl">
                <OperationReport selectedDate={selectedDate} operation={operation} reportRef={operationReportRef} companyName={settings.companyName} branchName={settings.branchName} />
              </div>
            </div>

            <HistoryList history={history} savedNamesCount={courierNames.length} onView={handleHistoryView} onDownload={handleHistoryDownload} onSelect={(date) => setSelectedDate(date)} onDeleteType={handleHistoryDeleteType} />
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

        {activeTab === "users" && session.role === "admin" && (
          <UserManagement users={users} onSaveUser={handleSaveUser} onDeleteUser={handleDeleteUser} />
        )}
      </main>
      </div>

      <nav className="mobile-bottom-nav no-print fixed inset-x-0 bottom-0 z-40 border-t border-violet-100 bg-[#fff8f4] px-2 pt-2 shadow-[0_-8px_24px_rgba(128,104,178,0.14)] xl:hidden">
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-md px-1 text-[11px] font-black transition ${
                  isActive ? "bg-violet-600 text-white shadow-lg shadow-violet-200" : "text-[#6d6195] hover:bg-violet-50 hover:text-violet-700"
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
  const toneClass = tone === "red" ? "from-rose-100/90 to-pink-50/80 text-rose-600" : "from-emerald-100/90 to-emerald-50/80 text-emerald-700";
  return (
    <div className={`metric-card flex items-center gap-3 bg-gradient-to-br ${toneClass} p-4`}>
      <div className="grid h-14 w-14 shrink-0 place-items-center rounded-[22px] bg-[#fff8f4] shadow-[8px_8px_18px_rgba(128,104,178,0.16),-8px_-8px_18px_rgba(255,255,255,0.9)]">
        <Icon className="h-7 w-7" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-black uppercase text-[#15143b]">{label}</p>
        <p className="truncate text-lg font-black md:text-2xl">{value}</p>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, helper, icon: Icon, color }) {
  const colorClass =
    color === "pink"
      ? "from-rose-50/95 to-pink-100/75 text-rose-500"
    : color === "blue"
        ? "from-blue-50/95 to-sky-100/75 text-blue-500"
        : color === "orange"
          ? "from-orange-50/95 to-amber-100/75 text-orange-500"
          : "from-violet-50/95 to-purple-100/75 text-violet-600";
  return (
    <div className={`kpi-card relative overflow-hidden bg-gradient-to-br p-5 ${colorClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="kpi-icon">
          <Icon className="h-7 w-7" />
        </div>
        <span className="grid h-8 w-8 place-items-center rounded-full bg-[#fff8f4] text-current shadow-[inset_3px_3px_7px_rgba(128,104,178,0.10),inset_-3px_-3px_7px_rgba(255,255,255,0.9)]">
          <ListChecks className="h-4 w-4 opacity-55" />
        </span>
      </div>
      <div className="mt-4">
        <p className="text-[11px] font-black uppercase tracking-wide text-[#15143b] md:text-xs">{label}</p>
        <p className="mt-1 text-3xl font-black text-[#101233] md:text-4xl">{value}</p>
        <p className="mt-3 max-w-36 text-xs font-semibold text-[#464170] md:text-sm">{helper}</p>
      </div>
      <div className="mini-chart" />
    </div>
  );
}

function QuickButton({ label, icon: Icon, onClick, tone, className = "" }) {
  const toneClass =
    tone === "pink"
      ? "from-rose-400 to-pink-500 shadow-pink-300/60"
    : tone === "blue"
        ? "from-blue-400 to-sky-500 shadow-blue-300/60"
        : tone === "orange"
          ? "from-amber-400 to-orange-500 shadow-orange-300/60"
          : tone === "green"
            ? "from-emerald-400 to-green-500 shadow-emerald-300/60"
            : "from-violet-500 to-purple-600 shadow-violet-300/60";
  return (
    <button type="button" onClick={onClick} className={`inline-flex min-h-14 items-center justify-center gap-2 rounded-[22px] border border-white/55 bg-gradient-to-br px-3 py-3 text-sm font-extrabold text-white shadow-xl transition hover:-translate-y-0.5 md:min-h-16 md:px-4 md:text-base ${toneClass} ${className}`}>
      <Icon className="h-5 w-5" />
      {label}
    </button>
  );
}

function CourierBanner() {
  return (
    <div className="courier-banner">
      <div className="relative z-10">
        <p className="text-2xl font-black leading-tight text-[#15143b]">Deliver<br />Performance</p>
        <p className="mt-2 text-sm font-semibold text-[#4f4779]">Track. Analyze. Deliver.</p>
        <button type="button" className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 px-5 py-3 text-sm font-black text-white shadow-xl shadow-violet-300/60">
          <BarChart3 className="h-5 w-5" />
          View Insights
        </button>
      </div>
      <div className="courier-illustration" aria-hidden="true">
        <div className="cloud cloud-one" />
        <div className="cloud cloud-two" />
        <div className="truck-3d">
          <div className="truck-box" />
          <div className="truck-cab" />
          <div className="truck-window" />
          <div className="wheel wheel-left" />
          <div className="wheel wheel-right" />
        </div>
        <div className="parcel-stack">
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  );
}

function PerformanceOverview({ stats }) {
  const delivered = Math.max(0, Math.min(100, Number(stats.deliveryPercent) || 0));
  const pending = Math.max(0, 100 - delivered);
  return (
    <section className="side-card">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-2xl bg-violet-100 text-violet-600">
            <BarChart3 className="h-5 w-5" />
          </span>
          <h2 className="font-black text-[#15143b]">Performance Overview</h2>
        </div>
        <span className="rounded-2xl bg-[#fff8f4] px-4 py-2 text-xs font-black text-violet-600 shadow-[inset_3px_3px_7px_rgba(128,104,178,0.10),inset_-3px_-3px_7px_rgba(255,255,255,0.9)]">This Week</span>
      </div>
      <div className="grid gap-5 sm:grid-cols-[150px_1fr] sm:items-center">
        <div className="donut-chart" style={{ "--value": `${delivered}%` }}>
          <div>
            <strong>{delivered.toFixed(0)}%</strong>
            <span>Overall</span>
          </div>
        </div>
        <div className="grid gap-4 text-sm font-bold text-[#4b4771]">
          <MetricLine color="bg-emerald-400" label="Delivered" value={`${delivered.toFixed(0)}% (${stats.totalDelivery})`} />
          <MetricLine color="bg-rose-400" label="Pending" value={`${pending.toFixed(0)}% (${Math.max(0, stats.totalOnRoute - stats.totalDelivery)})`} />
          <MetricLine color="bg-blue-400" label="Total" value={stats.totalOnRoute} />
        </div>
      </div>
    </section>
  );
}

function MetricLine({ color, label, value }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="inline-flex items-center gap-2">
        <span className={`h-3 w-3 rounded-full ${color}`} />
        {label}
      </span>
      <span className="font-black text-[#15143b]">{value}</span>
    </div>
  );
}

function QuickSummary({ history, stats, courierNames }) {
  const pendingItems = Math.max(0, stats.totalOnRoute - stats.totalDelivery);
  const items = [
    { label: "Total Reports", value: history.length, icon: CalendarDays, tone: "violet" },
    { label: "Total Deliveries", value: stats.totalDelivery, icon: PackageCheck, tone: "blue" },
    { label: "Pending Items", value: pendingItems, icon: Package, tone: "orange" },
    { label: "Saved Couriers", value: courierNames.length, icon: UserRound, tone: "green" },
  ];
  return (
    <section className="side-card">
      <div className="mb-4 flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-2xl bg-emerald-100 text-emerald-600">
          <ListChecks className="h-5 w-5" />
        </span>
        <h2 className="font-black text-[#15143b]">Quick Summary</h2>
      </div>
      <div className="grid gap-1">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="summary-line">
              <span className={`summary-icon summary-${item.tone}`}>
                <Icon className="h-5 w-5" />
              </span>
              <span className="flex-1 text-sm font-bold text-[#4b4771]">{item.label}</span>
              <strong className="text-[#15143b]">{item.value}</strong>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function BottomBanner({ onClick }) {
  return (
    <section className="bottom-banner">
      <div className="banner-parcels" aria-hidden="true">
        <Package className="h-14 w-14" />
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="text-xl font-black text-white md:text-2xl">
          Make reporting easier <Sparkles className="inline h-5 w-5 text-amber-200" />
        </h2>
        <p className="text-sm font-semibold text-white/86 md:text-base">Save time, stay organized, deliver more.</p>
      </div>
      <button type="button" onClick={onClick} className="rounded-[22px] border border-[#c8b0ff] bg-[#a984f1] px-8 py-3 text-sm font-black text-white shadow-[inset_4px_4px_9px_rgba(93,61,160,0.28),inset_-4px_-4px_9px_rgba(220,202,255,0.32),8px_9px_18px_rgba(84,53,155,0.22)] transition hover:bg-[#9d78e9]">
        Get Started
      </button>
    </section>
  );
}

function LoginScreen({ onLogin }) {
  const [branchName, setBranchName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setLoggingIn(true);
    try {
      await onLogin(branchName, password);
    } catch (loginError) {
      setError(loginError.message || "Login failed.");
    } finally {
      setLoggingIn(false);
    }
  }

  return (
    <main className="app-shell app-background grid place-items-center p-4 text-[#15143b]">
      <form onSubmit={handleSubmit} className="login-card">
        <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-[28px] bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-xl shadow-violet-300/50">
          <KeyRound className="h-10 w-10" />
        </div>
        <p className="text-sm font-black text-violet-600">Daily Courier Report System</p>
        <h1 className="mt-2 text-3xl font-black text-[#101233]">Branch Login</h1>
        <p className="mt-2 text-sm font-semibold text-[#625987]">Enter branch name and password to sync reports with Firebase.</p>

        <div className="mt-6 grid gap-4">
          <label className="grid gap-2 text-left">
            <span className="text-sm font-black text-[#071537]">Branch Name</span>
            <input value={branchName} onChange={(event) => setBranchName(event.target.value)} className="login-input" placeholder="madu" />
          </label>
          <label className="grid gap-2 text-left">
            <span className="text-sm font-black text-[#071537]">Password</span>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="login-input" placeholder="Password" />
          </label>
          {error && <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-black text-red-700">{error}</p>}
          <button type="submit" disabled={loggingIn} className="primary-action primary-action-blue min-h-14 disabled:opacity-60">
            <ShieldCheck className="h-5 w-5" />
            {loggingIn ? "Logging in..." : "Login"}
          </button>
        </div>
      </form>
    </main>
  );
}

function StatusPill({ icon: Icon, label, value, ok }) {
  return (
    <div className={`status-pill ${ok ? "status-pill-ok" : "status-pill-warn"}`}>
      <Icon className="h-5 w-5" />
      <span className="font-black">{label}</span>
      <span className="text-sm font-bold">{value}</span>
    </div>
  );
}

function UserManagement({ users, onSaveUser, onDeleteUser }) {
  const [branchName, setBranchName] = useState("");
  const [password, setPassword] = useState("");

  function handleSave(event) {
    event.preventDefault();
    onSaveUser({ branchName, password });
    setBranchName("");
    setPassword("");
  }

  return (
    <section className="grid gap-5">
      <div className="glass-panel p-4">
        <div className="mb-4 flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-violet-100 text-violet-700 shadow-inner">
            <UserPlus className="h-6 w-6" />
          </span>
          <div>
            <h2 className="text-xl font-black text-[#071537]">User Management</h2>
            <p className="text-sm font-semibold text-blue-950/65">Create branch accounts. Each branch keeps separate Firebase synced data.</p>
          </div>
        </div>

        <form onSubmit={handleSave} className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <label className="grid gap-2">
            <span className="text-sm font-black text-[#071537]">Branch Name</span>
            <input value={branchName} onChange={(event) => setBranchName(event.target.value)} className="login-input" placeholder="branch name" />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-black text-[#071537]">Password</span>
            <input value={password} onChange={(event) => setPassword(event.target.value)} className="login-input" placeholder="password" />
          </label>
          <button type="submit" className="primary-action primary-action-green">
            <SaveUserIcon />
            Save User
          </button>
        </form>
      </div>

      <div className="glass-panel p-4">
        <h3 className="mb-3 text-lg font-black text-[#071537]">Branch Accounts</h3>
        <div className="grid gap-2">
          {users.map((user) => (
            <div key={user.branchName} className="grid gap-3 rounded-2xl border border-[#eadff2] bg-[#fff8f4] px-4 py-3 md:grid-cols-[1fr_auto_auto] md:items-center">
              <span>
                <span className="block font-black text-[#071537]">{user.branchName}</span>
                <span className="text-xs font-bold text-blue-950/60">{user.role === "admin" ? "Admin login" : "Branch account"}</span>
              </span>
              <span className="rounded-2xl bg-violet-50 px-3 py-2 text-xs font-black text-violet-700">{user.role || "branch"}</span>
              <button type="button" disabled={user.role === "admin"} onClick={() => onDeleteUser(user.branchName)} className="history-action text-red-600 disabled:cursor-not-allowed disabled:opacity-40" aria-label={`Delete ${user.branchName}`}>
                <Trash2 className="h-5 w-5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SaveUserIcon() {
  return <UserPlus className="h-5 w-5" />;
}

function HistoryList({ history, onSelect, savedNamesCount, onView, onDownload, onDeleteType }) {
  return (
    <section className="glass-panel p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-violet-100 text-violet-600 shadow-inner">
            <ListChecks className="h-6 w-6" />
          </span>
          <h2 className="text-lg font-black text-[#071537]">Saved Report History</h2>
        </div>
        <span className="hidden items-center gap-2 rounded-2xl border border-[#eadff2] bg-[#fff8f4] px-4 py-2 text-sm font-black text-blue-950 shadow-[inset_3px_3px_8px_rgba(128,104,178,0.08),inset_-3px_-3px_8px_rgba(255,255,255,0.9)] md:inline-flex">
          View All History
          <ArrowRight className="h-4 w-4" />
        </span>
      </div>
      {history.length === 0 ? (
        <p className="rounded-2xl bg-[#fff8f4] p-4 text-sm font-semibold text-blue-950/65 shadow-[inset_4px_4px_9px_rgba(128,104,178,0.08),inset_-4px_-4px_9px_rgba(255,255,255,0.9)]">No saved reports yet.</p>
      ) : (
        <div className="grid gap-2">
          {history.map((item) => (
            <div key={item.date} className="grid gap-3 rounded-[18px] border border-[#eadff2] bg-[#fff8f4] px-4 py-3 text-left shadow-[7px_8px_18px_rgba(128,104,178,0.12),-5px_-5px_14px_rgba(255,255,255,0.9)] md:grid-cols-[1.1fr_1.7fr_auto] md:items-center">
              <button type="button" onClick={() => onSelect(item.date)} className="flex items-center gap-3 text-left">
                <span className="history-date-badge">
                  <strong>{String(new Date(`${item.date}T00:00:00`).getDate()).padStart(2, "0")}</strong>
                  <small>{new Date(`${item.date}T00:00:00`).toLocaleDateString("en-US", { month: "short" }).toUpperCase()}</small>
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
                <button type="button" onClick={() => onView(item.date)} className="history-action text-blue-700" aria-label="View report">
                  <Eye className="h-5 w-5" />
                </button>
                <button type="button" onClick={() => onDownload(item)} className="history-action text-blue-700" aria-label="Download report">
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
