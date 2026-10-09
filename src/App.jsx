import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CalendarClock,
  ClipboardCheck,
  CheckCircle2,
  Download,
  Eye,
  FileDown,
  FileSpreadsheet,
  FileText,
  History,
  Home,
  Image,
  ListChecks,
  MessagesSquare,
  Package,
  PackageCheck,
  Pencil,
  RotateCcw,
  Settings,
  ShieldCheck,
  Trash2,
  TrendingUp,
  Truck,
  UserRound,
  UserPlus,
  WalletCards,
} from "lucide-react";
import CourierPerformanceForm, { emptyCourierForm } from "./components/CourierPerformanceForm.jsx";
import DateSelector from "./components/DateSelector.jsx";
import DeliveredReportConverter from "./components/DeliveredReportConverter.jsx";
import RiderDeliveryPerformance from "./components/RiderDeliveryPerformance.jsx";
import RescheduleReport from "./components/RescheduleReport.jsx";
import PettyCashManagement from "./components/PettyCashManagement.jsx";
import AuditReport from "./components/AuditReport.jsx";
import ExportButtons from "./components/ExportButtons.jsx";
import AllInOneReports from "./components/AllInOneReports.jsx";
import OperationReportForm, { emptyOperationForm } from "./components/OperationReportForm.jsx";
import { CourierPerformanceReport, OperationReport } from "./components/ReportTable.jsx";
import SendToWhatsAppButton from "./components/SendToWhatsAppButton.jsx";
import SettingsPage from "./components/SettingsPage.jsx";
import MeterChatsDashboard from "./components/MeterChatsDashboard.jsx";
import DashboardHeader from "./components/DashboardHeader.jsx";
import IslandwideDashboard from "./components/IslandwideDashboard.jsx";
import SystemHealthPanel from "./components/SystemHealthPanel.jsx";
import SystemRecoveryPanel from "./components/SystemRecoveryPanel.jsx";
import TodayOperationsDashboard from "./components/TodayOperationsDashboard.jsx";
import ThemeSwitcher from "./components/ThemeSwitcher.jsx";
import ReceiptGenerator from "./components/ReceiptGenerator.jsx";
import AutoDispatchManager from "./components/dispatch/AutoDispatchManager.jsx";
import WhatsAppQueuePanel from "./components/WhatsAppQueuePanel.jsx";
import { getTabFromPath, getTabPath } from "./navigation.js";
import { normalizeThemeId } from "./themeConfig.js";
import {
  clearReportByDate,
  deleteReportType,
  deleteCourierName,
  downloadBackupFile,
  addDataChangeListener,
  clearStoredSession,
  createSessionFromUser,
  getCourierNames,
  getReportByDate,
  getReportHistory,
  getSettings,
  getLocalUpdatedAt,
  getRedoHistory,
  getStoredSession,
  getUndoHistory,
  getUsers,
  loginWithBranch,
  markWeeklyBackupComplete,
  restoreBackupData,
  redoLastChange,
  replaceUserAccounts,
  saveCourierName,
  saveReportType,
  saveSettings,
  saveStoredSession,
  saveUserAccount,
  deleteUserAccount,
  setActiveBranch,
  shouldRunWeeklyBackup,
  createBackupData,
  undoLastChange,
} from "./services/reportStorage.js";
import {
  createSystemVersion,
  downloadSnapshotFromFirebase,
  downloadUsersFromFirebase,
  flushPendingCloudSync,
  getPendingCloudSync,
  listSystemVersions,
  getGoogleApproval,
  requestGoogleLoginApproval,
  restoreSystemVersionToFirebase,
  saveWeeklyBackupToFirebase,
  subscribeToFirebaseSnapshot,
  subscribeToGoogleApprovals,
  subscribeToUsers,
  saveGoogleApproval,
  syncLocalSnapshotWithRecovery,
  uploadUsersToFirebase,
} from "./services/cloudSync.js";
import { ensureFirebaseAuthForSession, loginWithGoogleAccount, logoutFirebaseAccount } from "./services/authService.js";
import {
  canAccessTab,
  canManageUsers,
  getAccessibleBranches,
  getFirstAccessibleTab,
  hasPermission,
  isSuperAdmin,
  normalizeAssignedBranches,
  normalizeUserPermissions,
  normalizeUserRole,
  REGIONAL_MANAGER_ACCESS,
  SYSTEM_ACCESS_OPTIONS,
  USER_ROLE_OPTIONS,
} from "./permissions.js";
import {
  getWhatsAppQueue,
  getBackendHealth,
  getSystemHealth,
  retryFailedWhatsAppQueue,
  saveWhatsAppBackupConfig,
  setWhatsAppAccountContext,
  syncWhatsAppBackupSnapshot,
} from "./services/whatsappApi.js";
import { todayIso, displayDate } from "./utils/date.js";
import { exportBothAsPdf, exportElementAsPdf, exportElementAsPng } from "./utils/exportReports.js";
import { getReconciliationReviewStatus } from "./utils/deliveredReconciliationReview.js";

const tabs = [
  { id: "dashboard", label: "Dashboard", mobileLabel: "Home", icon: Home },
  { id: "courier", label: "Courier Performance", mobileLabel: "Courier", icon: Truck },
  { id: "riderPerformance", label: "Rider Delivery Performance", mobileLabel: "Rider Stats", icon: TrendingUp },
  { id: "operation", label: "Operation Report", mobileLabel: "Operation", icon: PackageCheck },
  { id: "exports", label: "Export / History", mobileLabel: "Export", icon: History },
  { id: "allReports", label: "All Reports", mobileLabel: "All", icon: FileSpreadsheet },
  { id: "deliveredConverter", label: "Delivered Report", mobileLabel: "Delivered", icon: FileText },
  { id: "reschedule", label: "Reschedule Report", mobileLabel: "Reschedule", icon: CalendarClock },
  { id: "receipt", label: "Receipt", mobileLabel: "Receipt", icon: FileText },
  { id: "pettyCash", label: "Petty Cash Management", mobileLabel: "Petty Cash", icon: WalletCards },
  { id: "audit", label: "Audit Report", mobileLabel: "Audit", icon: ClipboardCheck },
  { id: "autoDispatch", label: "Auto-Dispatch", mobileLabel: "Dispatch", icon: TrendingUp },
  { id: "meterChats", label: "Meter Chats", mobileLabel: "Chats", icon: MessagesSquare, adminOnly: true },
  { id: "whatsappQueue", label: "WhatsApp Queue", mobileLabel: "Queue", icon: MessagesSquare },
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
  setWhatsAppAccountContext(initialSession);
  const [session, setSession] = useState(initialSession);
  const [firebaseStatus, setFirebaseStatus] = useState("Firebase waiting for login.");
  const [firebaseBootstrapped, setFirebaseBootstrapped] = useState(false);
  const [firebaseAuthReady, setFirebaseAuthReady] = useState(false);
  const [backendStatus, setBackendStatus] = useState("Checking backend...");
  const [users, setUsers] = useState(getUsers);
  const [googleApprovals, setGoogleApprovals] = useState([]);
  const [activeTab, setActiveTab] = useState(() => getTabFromPath(window.location.pathname));
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
  const [systemHealth, setSystemHealth] = useState(null);
  const [whatsappQueue, setWhatsAppQueue] = useState(null);
  const [healthRefreshing, setHealthRefreshing] = useState(false);
  const [pendingCloudSync, setPendingCloudSync] = useState(getPendingCloudSync);
  const [systemVersions, setSystemVersions] = useState([]);
  const [versionBusy, setVersionBusy] = useState(false);
  const [undoCount, setUndoCount] = useState(() => getUndoHistory().length);
  const [redoCount, setRedoCount] = useState(() => getRedoHistory().length);

  const courierReportRef = useRef(null);
  const operationReportRef = useRef(null);
  const realtimeUploadTimerRef = useRef(null);
  const applyingRemoteSnapshotRef = useRef(false);
  const lastCloudUpdateRef = useRef("");
  const bootstrappedCloudRef = useRef(false);
  const unsavedDraftUpdatedAtRef = useRef("");
  const backupSyncTimerRef = useRef(null);
  const syncClientIdRef = useRef(getSyncClientId());
  const versionBootstrapRef = useRef({ branchName: "", promise: null });
  const visibleTabs = useMemo(
    () => tabs.filter((tab) => (tab.adminOnly ? canManageUsers(session) : canAccessTab(session, tab.id))),
    [session],
  );
  const accessibleBranches = useMemo(() => getAccessibleBranches(session), [session]);

  useEffect(() => {
    const onPopState = () => setActiveTab(getTabFromPath(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (!session) return;
    const allowed = visibleTabs.some((tab) => tab.id === activeTab);
    if (!allowed) return;
    const path = getTabPath(activeTab);
    if (window.location.pathname !== path) {
      const initial = window.location.pathname === "/";
      window.history[initial ? "replaceState" : "pushState"]({ tab: activeTab }, "", path);
    }
  }, [session, activeTab, visibleTabs]);

  useEffect(() => {
    if (!session) { setWhatsAppQueue(null); return; }
    let cancelled = false;
    setWhatsAppQueue(null);
    const refresh = () => getWhatsAppQueue().then((queue) => { if (!cancelled) setWhatsAppQueue(queue); }).catch(() => {});
    refresh();
    const timer = window.setInterval(refresh, 10000);
    window.addEventListener("whatsapp-queue-changed", refresh);
    return () => { cancelled = true; window.clearInterval(timer); window.removeEventListener("whatsapp-queue-changed", refresh); };
  }, [session?.userId, session?.branchName, session?.role]);


  useEffect(() => {
    setWhatsAppAccountContext(session);
  }, [session?.userId, session?.branchName, session?.role]);

  useEffect(() => {
    if (!session) return;
    if (!canAccessTab(session, activeTab) && !(canManageUsers(session) && tabs.some((tab) => tab.id === activeTab && tab.adminOnly))) {
      setActiveTab(getFirstAccessibleTab(session, tabs));
    }
  }, [session, activeTab]);

  useEffect(() => {
    if (!session?.branchName) {
      setFirebaseAuthReady(false);
      return undefined;
    }
    let cancelled = false;
    setFirebaseAuthReady(false);
    ensureFirebaseAuthForSession(session.authProvider || "password")
      .then(() => {
        if (!cancelled) setFirebaseAuthReady(true);
      })
      .catch((error) => {
        if (cancelled) return;
        setFirebaseStatus("Firebase authentication required");
        setCloudStatus(error.message || "Firebase authentication failed.");
      });
    return () => { cancelled = true; };
  }, [session?.branchName, session?.authProvider, session?.userId]);

  useEffect(() => {
    if (!session?.branchName) return;
    setActiveBranch(session.branchName);
    const savedSettings = getSettings();
    setSettingsState(savedSettings);
    setStableTarget(savedSettings.operationTarget || "");
    setCourierNames(getCourierNames());
    refreshRecoveryState();
  }, [session?.branchName]);

  useEffect(() => {
    if (!session?.branchName || isSuperAdmin(session) || !firebaseAuthReady) return undefined;
    return subscribeToUsers((cloudUsers) => {
      if (!cloudUsers.length) return;
      const nextUsers = replaceUserAccounts(cloudUsers);
      setUsers(nextUsers);
      const account = nextUsers.find((user) =>
        (session.userId && user.id === session.userId)
        || (session.authProvider === "google" && user.authProvider === "google" && user.email === session.email)
        || (session.authProvider !== "google" && user.authProvider !== "google" && user.branchName === (session.homeBranchName || session.branchName)),
      );
      if (!account) return;
      if (account.status === "disabled") {
        showNotice("This account has been disabled by the administrator.");
        handleLogout();
        return;
      }
      const nextPermissions = normalizeUserPermissions(account.permissions);
      const permissionsChanged = JSON.stringify(nextPermissions) !== JSON.stringify(normalizeUserPermissions(session.permissions));
      const nextRole = normalizeUserRole(account.role);
      const roleChanged = nextRole !== normalizeUserRole(session.role);
      const nextAssignedBranches = normalizeAssignedBranches(account.assignedBranches);
      const branchesChanged = JSON.stringify(nextAssignedBranches) !== JSON.stringify(normalizeAssignedBranches(session.assignedBranches));
      const homeBranchChanged = account.branchName !== (session.homeBranchName || session.branchName);
      if (!permissionsChanged && !roleChanged && !branchesChanged && !homeBranchChanged) return;
      const refreshedSession = createSessionFromUser(account, {
        authProvider: account.authProvider,
        email: account.email,
        activeBranchName: session.branchName,
      });
      setFirebaseBootstrapped(false);
      bootstrappedCloudRef.current = false;
      setSession(refreshedSession);
      setActiveTab(getFirstAccessibleTab(refreshedSession, tabs));
      showNotice("Your account access was updated by the administrator.");
    }, () => {});
  }, [session?.userId, session?.branchName, session?.homeBranchName, session?.assignedBranches, session?.authProvider, session?.email, session?.role, firebaseAuthReady]);

  useEffect(() => {
    if (!session?.branchName || !isSuperAdmin(session) || !firebaseAuthReady) return undefined;
    let cancelled = false;
    if (versionBootstrapRef.current.branchName !== session.branchName) {
      versionBootstrapRef.current = {
        branchName: session.branchName,
        promise: (async () => {
          let versions = await listSystemVersions();
          if (!versions.length) {
            await createSystemVersion("Initial protected system state", syncClientIdRef.current);
            versions = await listSystemVersions();
          }
          return versions;
        })(),
      };
    }
    versionBootstrapRef.current.promise
      .then((versions) => {
        if (!cancelled) setSystemVersions(versions);
      })
      .catch(() => {
        if (!cancelled) setSystemVersions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.branchName, session?.role, firebaseAuthReady]);

  useEffect(() => {
    if (!session?.branchName || !firebaseAuthReady) return undefined;
    const refresh = () => refreshRecoveryState();
    const unsubscribe = addDataChangeListener(refresh);
    window.addEventListener("online", refresh);
    return () => {
      unsubscribe();
      window.removeEventListener("online", refresh);
    };
  }, [session?.branchName, firebaseAuthReady]);

  useEffect(() => {
    if (!session?.branchName || !firebaseAuthReady) return undefined;
    let cancelled = false;

    async function recoverCloudQueue() {
      if (!navigator.onLine || !getPendingCloudSync()) return;
      try {
        const recovered = await flushPendingCloudSync();
        if (!recovered || cancelled) return;
        lastCloudUpdateRef.current = recovered.cloudUpdatedAt;
        setCloudStatus(`Recovered queued Firebase changes at ${new Date(recovered.cloudUpdatedAt).toLocaleTimeString()}.`);
        setFirebaseStatus("Firebase connected");
      } catch {
        if (!cancelled) setFirebaseStatus("Firebase recovery waiting");
      } finally {
        if (!cancelled) setPendingCloudSync(getPendingCloudSync());
      }
    }

    recoverCloudQueue();
    window.addEventListener("online", recoverCloudQueue);
    const timer = window.setInterval(recoverCloudQueue, 15_000);
    return () => {
      cancelled = true;
      window.removeEventListener("online", recoverCloudQueue);
      window.clearInterval(timer);
    };
  }, [session?.branchName, firebaseAuthReady]);

  useEffect(() => {
    if (!canManageUsers(session) || !firebaseAuthReady) return;
    downloadUsersFromFirebase()
      .then((cloudUsers) => {
        if (cloudUsers.length) setUsers(replaceUserAccounts(cloudUsers));
      })
      .catch(() => {
        setUsers(getUsers());
      });
  }, [session?.role, firebaseAuthReady]);

  useEffect(() => {
    if (!canManageUsers(session) || !firebaseAuthReady) {
      setGoogleApprovals([]);
      return undefined;
    }
    return subscribeToGoogleApprovals(
      setGoogleApprovals,
      (error) => showNotice(error.message || "Google approval queue could not be loaded."),
    );
  }, [session?.role, firebaseAuthReady]);

  useEffect(() => {
    if (!session?.branchName) return;
    if (!firebaseBootstrapped) return;
    if (!shouldRunWeeklyBackup(settings)) return;
    downloadBackupFile("weekly-auto");
    saveWeeklyBackupToFirebase()
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

    function scheduleBackupSync() {
      window.clearTimeout(backupSyncTimerRef.current);
      backupSyncTimerRef.current = window.setTimeout(() => {
        syncBackupSnapshotToBackend();
      }, 1200);
    }

    scheduleBackupSync();
    const unsubscribe = addDataChangeListener(scheduleBackupSync);
    const snapshotTimer = window.setInterval(scheduleBackupSync, 60000);
    window.addEventListener("online", scheduleBackupSync);
    return () => {
      window.clearTimeout(backupSyncTimerRef.current);
      window.clearInterval(snapshotTimer);
      window.removeEventListener("online", scheduleBackupSync);
      unsubscribe();
    };
  }, [session?.branchName, settings.backupWhatsappNumber, settings.rescheduleApprovalReaction]);

  useEffect(() => {
    if (!session?.branchName || !firebaseAuthReady) return undefined;

    let cancelled = false;
    setCloudStatus("Loading Firebase branch data...");
    setFirebaseStatus("Firebase syncing...");

    async function bootstrapThenUpload() {
      try {
        await bootstrapFromFirebase();
        if (cancelled) return;
        const snapshot = await syncLocalSnapshotWithRecovery("auto-sync-enabled", syncClientIdRef.current);
        if (cancelled) return;
        lastCloudUpdateRef.current = snapshot.cloudUpdatedAt;
        setPendingCloudSync(getPendingCloudSync());
        setCloudStatus(
          snapshot.queued
            ? "Firebase unavailable. Changes are stored in the automatic recovery queue."
            : `Firebase synced: ${new Date(snapshot.cloudUpdatedAt).toLocaleTimeString()}`,
        );
        setFirebaseStatus(snapshot.queued ? "Firebase recovery queued" : "Firebase connected");
      } catch (error) {
        if (cancelled) return;
        setCloudStatus(error.message || "Initial Firebase Realtime sync failed.");
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
          const snapshot = await syncLocalSnapshotWithRecovery("realtime-auto", syncClientIdRef.current);
          lastCloudUpdateRef.current = snapshot.cloudUpdatedAt;
          setPendingCloudSync(getPendingCloudSync());
          setCloudStatus(
            snapshot.queued
              ? "Firebase unavailable. Latest changes are queued for automatic recovery."
              : `Firebase uploaded: ${new Date(snapshot.cloudUpdatedAt).toLocaleTimeString()}`,
          );
          setFirebaseStatus(snapshot.queued ? "Firebase recovery queued" : "Firebase connected");
        } catch (error) {
          setCloudStatus(error.message || "Firebase Realtime upload failed.");
          setFirebaseStatus("Firebase error");
        }
      }, 900);
    });

    const unsubscribeCloud = subscribeToFirebaseSnapshot(
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
        setCloudStatus(error.message || "Firebase Realtime sync error.");
        setFirebaseStatus("Firebase error");
      },
    );

    return () => {
      cancelled = true;
      window.clearTimeout(realtimeUploadTimerRef.current);
      unsubscribeLocal();
      unsubscribeCloud();
    };
  }, [session?.branchName, selectedDate, firebaseBootstrapped, firebaseAuthReady]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(""), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!session) return undefined;

    let cancelled = false;
    async function checkBackend() {
      try {
        const health = isSuperAdmin(session) ? await getSystemHealth() : await getBackendHealth();
        if (!cancelled) {
          if (isSuperAdmin(session)) setSystemHealth(health);
          setBackendStatus("Backend server running");
        }
      } catch {
        try {
          await getBackendHealth();
          if (!cancelled) setBackendStatus("Backend server running (health details unavailable)");
        } catch {
          if (!cancelled) setBackendStatus("Backend server offline");
        }
      }
    }

    checkBackend();
    const timer = window.setInterval(checkBackend, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [session?.role, session?.branchName]);

  function showNotice(message) {
    setNotice(message);
  }

  function refreshRecoveryState() {
    setUndoCount(getUndoHistory().length);
    setRedoCount(getRedoHistory().length);
    setPendingCloudSync(getPendingCloudSync());
  }

  async function refreshSystemHealth() {
    setHealthRefreshing(true);
    try {
      const health = await getSystemHealth();
      setSystemHealth(health);
      setBackendStatus("Backend server running");
      setPendingCloudSync(getPendingCloudSync());
    } catch (error) {
      setBackendStatus("Backend server offline");
      showNotice(error.message || "System health check failed.");
    } finally {
      setHealthRefreshing(false);
    }
  }

  async function handleRetryWhatsAppQueue() {
    try {
      await retryFailedWhatsAppQueue();
      await refreshSystemHealth();
      showNotice("Failed WhatsApp sends were queued for retry.");
    } catch (error) {
      showNotice(error.message || "WhatsApp queue retry failed.");
    }
  }

  async function syncRecoveredLocalState(reason) {
    const snapshot = await syncLocalSnapshotWithRecovery(reason, syncClientIdRef.current);
    lastCloudUpdateRef.current = snapshot.cloudUpdatedAt;
    setPendingCloudSync(getPendingCloudSync());
    setFirebaseStatus(snapshot.queued ? "Firebase recovery queued" : "Firebase connected");
    return snapshot;
  }

  async function handleUndo() {
    const entry = undoLastChange();
    if (!entry) return;
    handleRestoreBackup();
    refreshRecoveryState();
    await syncRecoveredLocalState("undo");
    showNotice(`Undone: ${entry.action}.`);
  }

  async function handleRedo() {
    const entry = redoLastChange();
    if (!entry) return;
    handleRestoreBackup();
    refreshRecoveryState();
    await syncRecoveredLocalState("redo");
    showNotice(`Restored forward: ${entry.action}.`);
  }

  async function handleCreateSystemVersion(label = "Manual admin checkpoint") {
    setVersionBusy(true);
    try {
      const version = await createSystemVersion(label, syncClientIdRef.current);
      setSystemVersions(await listSystemVersions());
      showNotice(`${version.name} system checkpoint created.`);
      return version;
    } catch (error) {
      showNotice(error.message || "Could not create system checkpoint.");
      return null;
    } finally {
      setVersionBusy(false);
    }
  }

  async function handleSwitchSystemVersion(version) {
    if (!confirm(`Switch all branch reports, settings, and saved names to ${version.name}? The current state will be saved first.`)) return;
    setVersionBusy(true);
    try {
      await createSystemVersion(`Before switching to ${version.name}`, syncClientIdRef.current);
      const selectedVersion = await restoreSystemVersionToFirebase(version.id, syncClientIdRef.current);
      if (!selectedVersion?.snapshot) throw new Error("Selected system version could not be loaded.");
      applyingRemoteSnapshotRef.current = true;
      restoreBackupData(selectedVersion.snapshot, { silent: true });
      handleRestoreBackup();
      await syncRecoveredLocalState(`system-version-switch-${version.name}`);
      setSystemVersions(await listSystemVersions());
      refreshRecoveryState();
      showNotice(`System switched to ${version.name}.`);
    } catch (error) {
      showNotice(error.message || "System version switch failed.");
    } finally {
      applyingRemoteSnapshotRef.current = false;
      setVersionBusy(false);
    }
  }

  async function handleLogin(branchName, password) {
    try {
      await ensureFirebaseAuthForSession("password").catch((error) => {
        setFirebaseStatus("Firebase authentication required");
        setCloudStatus(error.message || "Enable Firebase Anonymous authentication for branch sync.");
      });
      const cloudUsers = await downloadUsersFromFirebase().catch(() => []);
      if (cloudUsers.length) setUsers(replaceUserAccounts(cloudUsers));
      const nextSession = loginWithBranch(branchName, password);
      setFirebaseBootstrapped(false);
      setSession(nextSession);
      setActiveTab(canAccessTab(nextSession, getTabFromPath(window.location.pathname)) ? getTabFromPath(window.location.pathname) : getFirstAccessibleTab(nextSession, tabs));
      bootstrappedCloudRef.current = false;
      showNotice(`Logged in as ${nextSession.branchName}.`);
    } catch (error) {
      throw error;
    }
  }

  async function handleGoogleLogin() {
    const profile = await loginWithGoogleAccount();
    const cloudUsers = await downloadUsersFromFirebase().catch(() => []);
    if (cloudUsers.length) setUsers(replaceUserAccounts(cloudUsers));
    const availableUsers = cloudUsers.length ? cloudUsers : getUsers();
    const approvedUser = availableUsers.find((user) =>
      user.authProvider === "google"
      && user.status !== "disabled"
      && (user.authUid === profile.uid || String(user.email || "").toLowerCase() === profile.email.toLowerCase()),
    );
    const approval = await getGoogleApproval(profile.uid).catch(() => null);
    const account = approvedUser || (approval?.status === "approved" && approval.branchName ? {
      id: `google-${profile.uid}`,
      authUid: profile.uid,
      authProvider: "google",
      status: "approved",
      role: approval.role || "branch",
      branchName: approval.branchName,
      assignedBranches: approval.assignedBranches || [],
      permissions: approval.permissions,
      ...profile,
    } : null);

    if (!account) {
      await requestGoogleLoginApproval(profile);
      return { pending: true, email: profile.email };
    }

    const nextSession = createSessionFromUser(account, { ...profile, authProvider: "google" });
    setFirebaseBootstrapped(false);
    setSession(nextSession);
    setActiveTab(canAccessTab(nextSession, getTabFromPath(window.location.pathname)) ? getTabFromPath(window.location.pathname) : getFirstAccessibleTab(nextSession, tabs));
    bootstrappedCloudRef.current = false;
    showNotice(`Google login successful: ${nextSession.branchName}.`);
    return { pending: false };
  }

  function handleLogout() {
    logoutFirebaseAccount().catch(() => {});
    clearStoredSession();
    setSession(null);
    setActiveTab("dashboard");
    setCourierRows([]);
    setOperation(null);
    setHistory([]);
    setCourierNames([]);
    setFirebaseStatus("Firebase waiting for login.");
    setFirebaseBootstrapped(false);
    setFirebaseAuthReady(false);
    setBackendStatus("Checking backend...");
  }

  function handleWorkspaceBranchChange(event) {
    const branchName = String(event.target.value || "").trim().toLowerCase();
    if (!accessibleBranches.includes(branchName) || branchName === session.branchName) return;
    const nextSession = { ...session, branchName };
    setActiveBranch(branchName);
    saveStoredSession(nextSession);
    setFirebaseBootstrapped(false);
    bootstrappedCloudRef.current = false;
    lastCloudUpdateRef.current = "";
    setSession(nextSession);
    showNotice(`Now viewing ${branchName} branch reports.`);
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

  async function bootstrapFromFirebase() {
    if (bootstrappedCloudRef.current) return;
    bootstrappedCloudRef.current = true;

    try {
      const snapshot = await downloadSnapshotFromFirebase();
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
      setCloudStatus(error.message || "Firebase Realtime bootstrap failed.");
    } finally {
      applyingRemoteSnapshotRef.current = false;
    }
  }

  function refreshHistory() {
    setHistory(getReportHistory());
  }

  function handleDeliveredReportSaved(result) {
    refreshHistory();
    if (result?.date === selectedDate && Array.isArray(result.courierRows)) {
      setCourierRows(result.courierRows);
      setCourierNames(getCourierNames());
    }
    if (result?.message) showNotice(result.message);
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

    setCloudStatus("Saving settings to Firebase Realtime Database...");
    try {
      const snapshot = await syncLocalSnapshotWithRecovery("settings-save", syncClientIdRef.current);
      lastCloudUpdateRef.current = snapshot.cloudUpdatedAt;
      setPendingCloudSync(getPendingCloudSync());
      setCloudStatus(
        snapshot.queued
          ? "Settings saved locally and queued for Firebase recovery."
          : `Settings synced to Firebase: ${new Date(snapshot.cloudUpdatedAt).toLocaleTimeString()}`,
      );
    } catch (error) {
      setCloudStatus(error.message || "Settings Firebase sync failed.");
    }

    syncBackupConfigToBackend(savedSettings);
  }

  async function handleThemeChange(themeId) {
    const normalizedTheme = normalizeThemeId(themeId);
    const savedSettings = saveSettings({ uiTheme: normalizedTheme });
    setSettingsState(savedSettings);
    showNotice(`${normalizedTheme === "default" ? "Default" : normalizedTheme} theme applied.`);
    try {
      const snapshot = await syncLocalSnapshotWithRecovery("theme-change", syncClientIdRef.current);
      lastCloudUpdateRef.current = snapshot.cloudUpdatedAt;
      setPendingCloudSync(getPendingCloudSync());
    } catch {
      // The local theme remains active and automatic cloud recovery will retry.
    }
  }

  async function syncBackupConfigToBackend(savedSettings = getSettings()) {
    try {
      await saveWhatsAppBackupConfig({
        phoneNumber: savedSettings.backupWhatsappNumber,
        snapshot: createBackupData(),
        approvalReaction: savedSettings.rescheduleApprovalReaction,
      });
    } catch {
      // WhatsApp backend may be offline on local/Vercel. The app still keeps the setting in Firebase/local storage.
    }
  }

  async function syncBackupSnapshotToBackend() {
    const savedSettings = getSettings();
    if (!savedSettings.backupWhatsappNumber) return;
    if (!savedSettings.backupWhatsappNumber) return;
    try {
      await syncWhatsAppBackupSnapshot({
        phoneNumber: savedSettings.backupWhatsappNumber,
        snapshot: createBackupData(),
        approvalReaction: savedSettings.rescheduleApprovalReaction,
      });
    } catch {
      // Background sync must stay quiet to avoid interrupting report entry.
    }
  }

  function handleRestoreBackup() {
    const savedSettings = getSettings();
    setSettingsState(savedSettings);
    setStableTarget(savedSettings.operationTarget || "");
    setCourierNames(getCourierNames());
    if (canManageUsers(session)) setUsers(getUsers());
    loadDate(selectedDate);
  }

  async function handleCloudUpload() {
    setCloudStatus("Uploading local data to Firebase...");
    try {
      const snapshot = await syncLocalSnapshotWithRecovery("manual-upload", syncClientIdRef.current);
      lastCloudUpdateRef.current = snapshot.cloudUpdatedAt;
      const savedSettings = saveSettings({ cloudLastSyncedAt: snapshot.cloudUpdatedAt });
      setSettingsState(savedSettings);
      setPendingCloudSync(getPendingCloudSync());
      setCloudStatus(
        snapshot.queued
          ? "Firebase is unavailable. The latest snapshot is queued for automatic upload."
          : `Uploaded to Firebase: ${new Date(snapshot.cloudUpdatedAt).toLocaleString()}`,
      );
      showNotice(snapshot.queued ? "Saved to the cloud recovery queue." : "Uploaded to Firebase successfully.");
    } catch (error) {
      setCloudStatus(error.message || "Cloud upload failed.");
    }
  }

  async function handleCloudDownload() {
    if (!confirm("Download Firebase cloud data and replace this device LocalStorage?")) return;
    setCloudStatus("Downloading Firebase data...");
    try {
      const snapshot = await downloadSnapshotFromFirebase();
      if (!snapshot) {
        setCloudStatus("No cloud data found yet.");
        return;
      }
      applyingRemoteSnapshotRef.current = true;
      restoreBackupData(snapshot, { silent: true });
      handleRestoreBackup();
      lastCloudUpdateRef.current = snapshot.cloudUpdatedAt || "";
      setCloudStatus(`Downloaded from Firebase: ${new Date(snapshot.cloudUpdatedAt || snapshot.exportedAt).toLocaleString()}`);
      showNotice("Downloaded from Firebase successfully.");
    } catch (error) {
      setCloudStatus(error.message || "Cloud download failed.");
    } finally {
      applyingRemoteSnapshotRef.current = false;
    }
  }

  async function handleSaveUser(user) {
    try {
      if (normalizeUserRole(user.role) === "superadmin" && !isSuperAdmin(session)) {
        throw new Error("Only the Super Admin can assign the Super Admin role.");
      }
      const nextUsers = saveUserAccount(user);
      setUsers(nextUsers);
      await uploadUsersToFirebase();
      showNotice("Branch user saved and synced.");
    } catch (error) {
      showNotice(error.message || "Could not save user.");
    }
  }

  async function handleDeleteUser(userId) {
    if (!confirm("Delete this user account? Existing branch report data will not be deleted.")) return;
    try {
      const account = users.find((user) => user.id === userId);
      if (account?.authProvider === "google" && account.authUid) {
        await saveGoogleApproval({
          uid: account.authUid,
          email: account.email,
          displayName: account.displayName,
          status: "revoked",
          revokedAt: new Date().toISOString(),
        });
      }
      const nextUsers = deleteUserAccount(userId);
      setUsers(nextUsers);
      await uploadUsersToFirebase();
      showNotice("Branch user deleted and synced.");
    } catch (error) {
      showNotice(error.message || "Could not delete user.");
    }
  }

  async function handleApproveGoogleUser(approval, branchName, permissions, role = "branch", assignedBranches = []) {
    try {
      const normalizedRole = normalizeUserRole(role);
      if (normalizedRole === "superadmin" && !isSuperAdmin(session)) throw new Error("Only the Super Admin can assign the Super Admin role.");
      const approved = await saveGoogleApproval({
        ...approval,
        branchName,
        role: normalizedRole,
        assignedBranches: normalizeAssignedBranches(assignedBranches),
        permissions: normalizeUserPermissions(permissions, { legacyDefault: false }),
        status: "approved",
        approvedAt: new Date().toISOString(),
        approvedBy: session.branchName,
      });
      const nextUsers = saveUserAccount({
        id: `google-${approval.uid}`,
        authUid: approval.uid,
        authProvider: "google",
        email: approval.email,
        displayName: approval.displayName,
        photoURL: approval.photoURL,
        branchName,
        permissions: approved.permissions,
        status: "approved",
        role: normalizedRole,
        assignedBranches: approved.assignedBranches,
      });
      setUsers(nextUsers);
      await uploadUsersToFirebase();
      showNotice(`${approval.email} approved for ${branchName}.`);
    } catch (error) {
      showNotice(error.message || "Google user approval failed.");
    }
  }

  async function handleRejectGoogleUser(approval) {
    try {
      await saveGoogleApproval({ ...approval, status: "rejected", rejectedAt: new Date().toISOString() });
      showNotice(`${approval.email} login request rejected.`);
    } catch (error) {
      showNotice(error.message || "Google user rejection failed.");
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
      showNotice("This date only has rider delivered reports. Open Delivered Report and select a rider to export.");
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

  const todayOperations = useMemo(() => {
    const report = getReportByDate(selectedDate);
    const deliveredReports = Object.values(report.delivered || {});
    const exceptions = deliveredReports.reduce((total, deliveredReport) => {
      const status = getReconciliationReviewStatus(deliveredReport.reconciliation);
      return total
        + status.unconfirmedRescheduled.length
        + status.unclassifiedMissing.length
        + status.unreviewedExtraRescheduled.length
        + (deliveredReport.reconciliation?.extraDelivered?.length || 0)
        + (deliveredReport.reconciliation?.deliveredAndRescheduled?.length || 0);
    }, 0);
    const hasCourier = (report.courierRows?.length || 0) > 0;
    const hasOperation = Boolean(report.operation);
    const whatsappPending =
      Number(whatsappQueue?.counts?.pending || 0)
      + Number(whatsappQueue?.counts?.sending || 0)
      + Number(whatsappQueue?.counts?.failed || 0);
    const deliveredComplete = deliveredReports.length > 0 && exceptions === 0;
    const reportsRemaining = Number(!hasCourier) + Number(!hasOperation);

    return {
      date: displayDate(selectedDate),
      deliveredRiders: deliveredReports.length,
      exceptions,
      reportsRemaining,
      whatsappPending,
      hasCourier,
      hasOperation,
      ready: deliveredComplete && hasCourier && hasOperation && whatsappPending === 0,
      steps: [
        {
          id: "delivered",
          tab: "deliveredConverter",
          label: "Prepare rider Delivered Reports",
          helper: deliveredComplete
            ? `${deliveredReports.length} rider report(s) checked`
            : deliveredReports.length === 0
              ? "No rider Delivered Reports saved"
              : `${exceptions} exception(s) need attention`,
          complete: deliveredComplete,
        },
        {
          id: "courier",
          tab: "courier",
          label: "Save Courier Performance",
          helper: hasCourier ? `${report.courierRows.length} courier row(s) saved` : "Courier Performance is not saved",
          complete: hasCourier,
        },
        {
          id: "operation",
          tab: "operation",
          label: "Save Operation Report",
          helper: hasOperation ? "Operation Report saved" : "Operation Report is not saved",
          complete: hasOperation,
        },
        {
          id: "send",
          tab: whatsappPending ? "whatsappQueue" : "exports",
          label: "Complete exports and WhatsApp sends",
          helper: whatsappPending ? `${whatsappPending} send(s) pending or failed` : "WhatsApp queue is clear",
          complete: deliveredComplete && hasCourier && hasOperation && whatsappPending === 0,
        },
      ],
    };
  }, [selectedDate, history, courierRows, operation, systemHealth, whatsappQueue]);

  const effectiveActiveTab = visibleTabs.some((tab) => tab.id === activeTab) ? activeTab : getFirstAccessibleTab(session, tabs);
  const activeTabLabel = visibleTabs.find((tab) => tab.id === effectiveActiveTab)?.label || "Account Access";

  if (!session) {
    return <LoginScreen onLogin={handleLogin} onGoogleLogin={handleGoogleLogin} />;
  }

  return (
    <div
      data-theme={normalizeThemeId(settings.uiTheme)}
      className={`app-shell app-background domex-app theme-${normalizeThemeId(settings.uiTheme)} ${effectiveActiveTab === "dashboard" ? "domex-dashboard-page" : "domex-workspace-page"}`}
    >
      {notice && (
        <div className="fixed right-4 top-4 z-50 max-w-sm rounded-[22px] border border-white/70 bg-violet-600 px-5 py-3 text-sm font-black text-white shadow-2xl shadow-violet-300/50">
          {notice}
        </div>
      )}
      <DashboardHeader
        tabs={visibleTabs} activeTab={effectiveActiveTab} onOpen={setActiveTab}
        session={session} branchName={settings.branchName || session.branchName}
        branches={normalizeUserRole(session.role) === "regional_manager" ? accessibleBranches : []}
        onBranchChange={handleWorkspaceBranchChange} onLogout={handleLogout}
        theme={settings.uiTheme} onThemeChange={handleThemeChange}
        summary={todayOperations} history={history} onHistoryView={handleHistoryView}
        approvals={canManageUsers(session) ? googleApprovals.filter((approval) => approval.status === "pending").length : 0}
      />
      <div className="main-dashboard-surface min-w-0">
      <main className="domex-main">
        {effectiveActiveTab !== "dashboard" ? <div className="workspace-page-heading"><span>DOMEX / {settings.branchName || session.branchName} Branch</span><h1>{activeTabLabel}</h1></div> : null}
        {!["deliveredConverter", "settings", "dashboard", "meterChats", "autoDispatch", "whatsappQueue", "riderPerformance"].includes(effectiveActiveTab) && effectiveActiveTab !== "noAccess" && (
          <DateSelector
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            searchDate={searchDate}
            onSearchDateChange={setSearchDate}
            onSearch={handleSearch}
          />
        )}

        {effectiveActiveTab === "dashboard" && (
          <>
            <IslandwideDashboard session={session} branchName={settings.branchName || session.branchName}
              summary={todayOperations} stats={stats} history={history} courierNames={courierNames}
              selectedDate={selectedDate} onDateChange={setSelectedDate}
              onOpen={(tab) => { if (visibleTabs.some((item) => item.id === tab)) setActiveTab(tab); else showNotice("This section is not assigned to your account."); }}
              backendOnline={backendStatus.startsWith("Checking") ? null : backendStatus.includes("running")} />
            <section className="dashboard-report-workspace">
              <div className="workspace-section-heading"><div><span>YOUR DAILY WORKSPACE</span><h2>Reports & History</h2></div><p>Pick a date, continue a report, or export your saved work.</p></div>
              <DateSelector selectedDate={selectedDate} onDateChange={setSelectedDate} searchDate={searchDate} onSearchDateChange={setSearchDate} onSearch={handleSearch} />
              <div className="action-dock">
                {visibleTabs.some((tab) => tab.id === "courier") ? <QuickButton label="Add Courier" icon={Truck} onClick={() => setActiveTab("courier")} tone="purple" /> : null}
                {visibleTabs.some((tab) => tab.id === "operation") ? <QuickButton label="Add Operation" icon={Package} onClick={() => setActiveTab("operation")} tone="pink" /> : null}
                {visibleTabs.some((tab) => tab.id === "exports") ? <><QuickButton label="View Reports" icon={FileText} onClick={() => setActiveTab("exports")} tone="orange" /><QuickButton label="Export PNG" icon={Image} onClick={() => setActiveTab("exports")} tone="blue" /><QuickButton label="Export PDF" icon={FileDown} onClick={() => setActiveTab("exports")} tone="green" /></> : null}
              </div>
              <HistoryList history={history} savedNamesCount={courierNames.length} onView={handleHistoryView} onDownload={handleHistoryDownload} onSelect={(date) => setSelectedDate(date)} onDeleteType={handleHistoryDeleteType} />
              {isSuperAdmin(session) ? <SystemHealthPanel firebaseStatus={firebaseStatus} backendStatus={backendStatus} health={systemHealth} pendingCloudSync={pendingCloudSync} refreshing={healthRefreshing} onRefresh={refreshSystemHealth} onRetryQueue={handleRetryWhatsAppQueue} /> : null}
            </section>
          </>
        )}

        {effectiveActiveTab === "whatsappQueue" && <WhatsAppQueuePanel accountLabel={settings.branchName || session.branchName} />}

        {effectiveActiveTab === "riderPerformance" && <RiderDeliveryPerformance key={session.branchName} branchName={settings.branchName || session.branchName} />}

        {effectiveActiveTab === "courier" && (
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

        {effectiveActiveTab === "operation" && (
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

        {effectiveActiveTab === "exports" && (
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

        {effectiveActiveTab === "allReports" && (
          <AllInOneReports companyName={settings.companyName} branchName={settings.branchName || session.branchName} />
        )}

        {effectiveActiveTab === "deliveredConverter" && <DeliveredReportConverter onSaved={handleDeliveredReportSaved} companyName={settings.companyName} defaultBranchName={settings.branchName} />}

        {effectiveActiveTab === "reschedule" && (
          <RescheduleReport selectedDate={selectedDate} branchName={settings.branchName || "Middeniya"} />
        )}

        {effectiveActiveTab === "receipt" && <ReceiptGenerator session={session} />}

        {effectiveActiveTab === "autoDispatch" && (
          <AutoDispatchManager
            session={session}
            onBackToDashboard={() => setActiveTab("dashboard")}
          />
        )}

        {effectiveActiveTab === "pettyCash" && (
          <PettyCashManagement
            selectedDate={selectedDate}
            branchName={settings.branchName || session.branchName || "Middeniya"}
            companyName={settings.companyName}
            vehicleEmployeeMappings={settings.pettyCashVehicleEmployees || []}
            floatAmount={settings.pettyCashFloatAmount || 0}
            onSaveFloatAmount={(value) => handleSaveAppSettings({ pettyCashFloatAmount: value })}
            canManageFloat={hasPermission(session, "pettyCash.float")}
          />
        )}

        {effectiveActiveTab === "audit" && (
          <AuditReport
            selectedDate={selectedDate}
            branchName={settings.branchName || session.branchName || "Middeniya"}
          />
        )}

        {effectiveActiveTab === "meterChats" && canManageUsers(session) && <MeterChatsDashboard />}

        {effectiveActiveTab === "settings" && (
          <>
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
              onThemeChange={handleThemeChange}
              whatsappAccountLabel={`${session.branchName}${session.email ? ` (${session.email})` : ""}`}
              session={session}
            >
              {isSuperAdmin(session) && (
                <SystemRecoveryPanel
                  versions={systemVersions}
                  undoCount={undoCount}
                  redoCount={redoCount}
                  busy={versionBusy}
                  onUndo={handleUndo}
                  onRedo={handleRedo}
                  onCreateVersion={() => handleCreateSystemVersion()}
                  onSwitchVersion={handleSwitchSystemVersion}
                />
              )}
            </SettingsPage>
          </>
        )}

        {effectiveActiveTab === "users" && canManageUsers(session) && (
          <UserManagement
            users={users}
            googleApprovals={googleApprovals}
            currentSession={session}
            onSaveUser={handleSaveUser}
            onDeleteUser={handleDeleteUser}
            onApproveGoogle={handleApproveGoogleUser}
            onRejectGoogle={handleRejectGoogleUser}
          />
        )}

        {effectiveActiveTab === "noAccess" && (
          <section className="access-empty-state">
            <ShieldCheck className="h-12 w-12" />
            <h2>No sections assigned</h2>
            <p>Ask the system administrator to assign the sections required for this account.</p>
          </section>
        )}
      </main>
      </div>


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

function LoginScreen({ onLogin, onGoogleLogin }) {
  const [branchName, setBranchName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [googlePending, setGooglePending] = useState("");

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

  async function handleGoogle() {
    setError("");
    setGooglePending("");
    setLoggingIn(true);
    try {
      const result = await onGoogleLogin();
      if (result?.pending) setGooglePending(`Approval request sent for ${result.email}. Ask the administrator to approve and assign a branch.`);
    } catch (loginError) {
      setError(loginError.message || "Google login failed.");
    } finally {
      setLoggingIn(false);
    }
  }

  return (
    <main className="app-shell domex-login grid place-items-center p-4 text-[#15143b]">
      <form onSubmit={handleSubmit} className="login-card">
        <img className="domex-login-logo" src="/report-assets/domex-logo.png" alt="DOMEX — We deliver islandwide" />
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
          <div className="login-divider"><span>or</span></div>
          <button type="button" onClick={handleGoogle} disabled={loggingIn} className="google-login-button">
            <span className="google-mark">G</span>
            Continue with Google
          </button>
          {googlePending ? <p className="login-approval-message">{googlePending}</p> : null}
        </div>
      </form>
    </main>
  );
}

function UserManagement({ users, googleApprovals, currentSession, onSaveUser, onDeleteUser, onApproveGoogle, onRejectGoogle }) {
  const emptyForm = { id: "", branchName: "", password: "", role: "branch", assignedBranches: [], permissions: [], authProvider: "password", authUid: "", email: "", displayName: "", photoURL: "" };
  const [form, setForm] = useState(emptyForm);
  const groupedPermissions = useMemo(
    () => SYSTEM_ACCESS_OPTIONS.reduce((groups, option) => ({ ...groups, [option.group]: [...(groups[option.group] || []), option] }), {}),
    [],
  );
  const knownBranches = useMemo(
    () => [...new Set(users.filter((user) => user.role === "branch").map((user) => user.branchName).filter(Boolean))].sort(),
    [users],
  );
  const availableRoles = USER_ROLE_OPTIONS.filter((role) => role.id !== "superadmin" || isSuperAdmin(currentSession));

  function togglePermission(permission) {
    setForm((current) => ({
      ...current,
      permissions: current.permissions.includes(permission)
        ? current.permissions.filter((item) => item !== permission)
        : [...current.permissions, permission],
    }));
  }

  function handleSave(event) {
    event.preventDefault();
    onSaveUser({ ...form, status: "approved" });
    setForm(emptyForm);
  }

  function changeRole(role) {
    setForm((current) => ({
      ...current,
      role,
      assignedBranches: role === "regional_manager" ? current.assignedBranches : [],
      permissions: role === "regional_manager" && current.permissions.length === 0 ? [...REGIONAL_MANAGER_ACCESS] : current.permissions,
    }));
  }

  function toggleAssignedBranch(branch) {
    const normalized = String(branch || "").trim().toLowerCase();
    if (!normalized) return;
    setForm((current) => ({
      ...current,
      assignedBranches: current.assignedBranches.includes(normalized)
        ? current.assignedBranches.filter((item) => item !== normalized)
        : [...current.assignedBranches, normalized],
    }));
  }

  function editUser(user) {
    setForm({
      id: user.id,
      branchName: user.branchName,
      password: "",
      role: normalizeUserRole(user.role),
      assignedBranches: normalizeAssignedBranches(user.assignedBranches),
      permissions: normalizeUserPermissions(user.permissions),
      authProvider: user.authProvider || "password",
      authUid: user.authUid || "",
      email: user.email || "",
      displayName: user.displayName || "",
      photoURL: user.photoURL || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const pendingApprovals = (googleApprovals || []).filter((approval) => approval.status === "pending");

  return (
    <section className="user-management-grid">
      {pendingApprovals.length ? (
        <div className="glass-panel user-approval-panel">
          <div className="user-management-heading">
            <span><ShieldCheck className="h-6 w-6" /></span>
            <div><h2>Google Login Approvals</h2><p>Assign a role, home branch, managed branches, and section access.</p></div>
          </div>
          <div className="grid gap-3">
            {pendingApprovals.map((approval) => (
              <GoogleApprovalCard key={approval.uid} approval={approval} currentSession={currentSession} knownBranches={knownBranches} onApprove={onApproveGoogle} onReject={onRejectGoogle} />
            ))}
          </div>
        </div>
      ) : null}

      <div className="glass-panel user-editor-panel">
        <div className="user-management-heading">
          <span><UserPlus className="h-6 w-6" /></span>
          <div><h2>{form.id ? "Edit Account & Role" : "Create User Account"}</h2><p>Assign a role and control which branch workspaces and sections this login can use.</p></div>
        </div>
        <form onSubmit={handleSave} className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-2"><span className="text-sm font-black text-[#071537]">Login / Home Branch</span><input required value={form.branchName} onChange={(event) => setForm({ ...form, branchName: event.target.value })} className="login-input" placeholder="kahawatta" /></label>
            {form.authProvider === "google" ? <div className="google-account-readonly"><strong>Google account</strong><span>{form.email}</span></div> : <label className="grid gap-2"><span className="text-sm font-black text-[#071537]">Password {form.id ? "(leave blank to keep current)" : ""}</span><input required={!form.id} type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} className="login-input" placeholder="Secure password" /></label>}
          </div>
          <label className="grid gap-2"><span className="text-sm font-black text-[#071537]">User Role</span><select value={form.role} onChange={(event) => changeRole(event.target.value)} className="login-input">{availableRoles.map((role) => <option key={role.id} value={role.id}>{role.label}</option>)}</select></label>
          {form.role === "regional_manager" ? <BranchAssignmentPicker branches={knownBranches} selected={form.assignedBranches} onToggle={toggleAssignedBranch} onChange={(assignedBranches) => setForm({ ...form, assignedBranches })} /> : null}
          {!['admin', 'superadmin'].includes(form.role) ? <PermissionPicker groupedPermissions={groupedPermissions} selected={form.permissions} onToggle={togglePermission} onSelectAll={() => setForm({ ...form, permissions: SYSTEM_ACCESS_OPTIONS.map((option) => option.id) })} onClear={() => setForm({ ...form, permissions: [] })} /> : <div className="role-full-access-note"><ShieldCheck className="h-5 w-5" /><span>This role has full section access.</span></div>}
          <div className="flex flex-wrap justify-end gap-2">
            {form.id ? <button type="button" onClick={() => setForm(emptyForm)} className="petty-action petty-action-neutral">Cancel Edit</button> : null}
            <button type="submit" className="primary-action primary-action-green"><SaveUserIcon />{form.id ? "Update Access" : "Create User"}</button>
          </div>
        </form>
      </div>

      <div className="glass-panel user-list-panel">
        <h3>Accounts & Access</h3>
        <div className="grid gap-3">
          {users.map((user) => {
            const userPermissions = normalizeUserPermissions(user.permissions);
            const roleLabel = USER_ROLE_OPTIONS.find((role) => role.id === normalizeUserRole(user.role))?.label || "Branch User";
            const protectedAccount = normalizeUserRole(user.role) === "superadmin";
            return <article key={user.id || user.branchName} className="user-account-row">
              <div className="user-account-identity">
                {user.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : <span><UserRound className="h-5 w-5" /></span>}
                <div><strong>{user.displayName || user.branchName}</strong><small>{user.email || `${user.branchName} branch login`}</small></div>
              </div>
              <div className="user-access-summary">
                <span className="user-branch-pill">{user.branchName}</span>
                <span>{roleLabel} · {['admin', 'superadmin'].includes(normalizeUserRole(user.role)) ? "Full section access" : `${userPermissions.length} permission${userPermissions.length === 1 ? "" : "s"}`}</span>
                {normalizeUserRole(user.role) === "regional_manager" ? <div>{normalizeAssignedBranches(user.assignedBranches).map((branch) => <small key={branch}>Branch: {branch}</small>)}</div> : null}
                {!['admin', 'superadmin'].includes(normalizeUserRole(user.role)) ? <div>{userPermissions.map((permission) => <small key={permission}>{SYSTEM_ACCESS_OPTIONS.find((option) => option.id === permission)?.label || permission}</small>)}</div> : null}
              </div>
              <div className="user-account-actions">
                <span className={user.authProvider === "google" ? "google" : "password"}>{user.authProvider === "google" ? "Google" : "Password"}</span>
                <button type="button" disabled={protectedAccount} onClick={() => editUser(user)} className="history-action text-blue-700 disabled:opacity-30" aria-label={`Edit ${user.branchName}`}><Pencil className="h-5 w-5" /></button>
                <button type="button" disabled={protectedAccount} onClick={() => onDeleteUser(user.id)} className="history-action text-red-600 disabled:opacity-30" aria-label={`Delete ${user.branchName}`}><Trash2 className="h-5 w-5" /></button>
              </div>
            </article>;
          })}
        </div>
      </div>
    </section>
  );
}

function BranchAssignmentPicker({ branches, selected, onToggle, onChange }) {
  const [customBranch, setCustomBranch] = useState("");
  function addCustomBranch() {
    const normalized = String(customBranch || "").trim().toLowerCase();
    if (!normalized) return;
    onChange([...new Set([...selected, normalized])]);
    setCustomBranch("");
  }
  const options = [...new Set([...branches, ...selected])].sort();
  return <div className="branch-assignment-picker">
    <div className="permission-picker-heading"><div><strong>Assigned Branches</strong><small>Regional Managers can switch between only these branch report workspaces.</small></div><span>{selected.length} selected</span></div>
    <div className="branch-assignment-options">{options.map((branch) => <label key={branch}><input type="checkbox" checked={selected.includes(branch)} onChange={() => onToggle(branch)} /><span>{branch.toUpperCase()}</span></label>)}</div>
    <div className="branch-assignment-add"><input value={customBranch} onChange={(event) => setCustomBranch(event.target.value)} className="login-input" placeholder="Add another branch" /><button type="button" onClick={addCustomBranch} className="petty-action petty-action-neutral">Add Branch</button></div>
  </div>;
}

function PermissionPicker({ groupedPermissions, selected, onToggle, onSelectAll, onClear }) {
  return <div className="permission-picker">
    <div className="permission-picker-heading"><div><strong>Section Access</strong><small>Only selected sections appear after login.</small></div><div><button type="button" onClick={onSelectAll}>Select All</button><button type="button" onClick={onClear}>Clear</button></div></div>
    <div className="permission-groups">{Object.entries(groupedPermissions).map(([group, options]) => <fieldset key={group}><legend>{group}</legend>{options.map((option) => <label key={option.id}><input type="checkbox" checked={selected.includes(option.id)} onChange={() => onToggle(option.id)} /><span><CheckCircle2 className="h-4 w-4" />{option.label}</span></label>)}</fieldset>)}</div>
  </div>;
}

function GoogleApprovalCard({ approval, currentSession, knownBranches, onApprove, onReject }) {
  const [branchName, setBranchName] = useState("");
  const [role, setRole] = useState("branch");
  const [assignedBranches, setAssignedBranches] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const grouped = useMemo(() => SYSTEM_ACCESS_OPTIONS.reduce((groups, option) => ({ ...groups, [option.group]: [...(groups[option.group] || []), option] }), {}), []);
  function toggle(permission) { setPermissions((current) => current.includes(permission) ? current.filter((item) => item !== permission) : [...current, permission]); }
  return <article className="google-approval-card">
    <div className="user-account-identity">{approval.photoURL ? <img src={approval.photoURL} alt="" referrerPolicy="no-referrer" /> : <span><UserRound className="h-5 w-5" /></span>}<div><strong>{approval.displayName}</strong><small>{approval.email}</small></div></div>
    <div className="grid gap-3 md:grid-cols-2"><label className="grid gap-2"><span className="text-sm font-black">Login / Home Branch</span><input value={branchName} onChange={(event) => setBranchName(event.target.value)} className="login-input" placeholder="Branch name" /></label><label className="grid gap-2"><span className="text-sm font-black">User Role</span><select value={role} onChange={(event) => setRole(event.target.value)} className="login-input">{USER_ROLE_OPTIONS.filter((option) => option.id !== "superadmin" || isSuperAdmin(currentSession)).map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label></div>
    {role === "regional_manager" ? <BranchAssignmentPicker branches={knownBranches} selected={assignedBranches} onToggle={(branch) => setAssignedBranches((current) => current.includes(branch) ? current.filter((item) => item !== branch) : [...current, branch])} onChange={setAssignedBranches} /> : null}
    <PermissionPicker groupedPermissions={grouped} selected={permissions} onToggle={toggle} onSelectAll={() => setPermissions(SYSTEM_ACCESS_OPTIONS.map((option) => option.id))} onClear={() => setPermissions([])} />
    <div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={() => onReject(approval)} className="petty-action petty-action-red">Reject</button><button type="button" disabled={!branchName.trim() || (role === "regional_manager" && !assignedBranches.length)} onClick={() => onApprove(approval, branchName, permissions, role, assignedBranches)} className="petty-action petty-action-green disabled:opacity-40"><ShieldCheck className="h-4 w-4" /> Approve & Assign</button></div>
  </article>;
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
