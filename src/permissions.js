export const SYSTEM_ACCESS_OPTIONS = [
  { id: "dashboard", label: "Dashboard", group: "General" },
  { id: "courier", label: "Courier Performance", group: "Reports" },
  { id: "operation", label: "Operation Report", group: "Reports" },
  { id: "exports", label: "Export / History", group: "Reports" },
  { id: "allReports", label: "All Reports", group: "Reports" },
  { id: "deliveredConverter", label: "Delivered Report", group: "Reports" },
  { id: "reschedule", label: "Reschedule Report", group: "Reports" },
  { id: "pettyCash.report", label: "Petty Cash CSV / Report Export", group: "Petty Cash" },
  { id: "pettyCash.float", label: "Petty Cash Float Management", group: "Petty Cash" },
  { id: "audit", label: "Audit Report", group: "Reports" },
  { id: "settings", label: "Settings", group: "Account" },
];

export const LEGACY_BRANCH_ACCESS = SYSTEM_ACCESS_OPTIONS.map((option) => option.id);

const TAB_ACCESS = {
  dashboard: ["dashboard"],
  courier: ["courier"],
  operation: ["operation"],
  exports: ["exports"],
  allReports: ["allReports"],
  deliveredConverter: ["deliveredConverter"],
  reschedule: ["reschedule"],
  pettyCash: ["pettyCash.report", "pettyCash.float"],
  audit: ["audit"],
  settings: ["settings"],
};

export function normalizeUserPermissions(value, { legacyDefault = true } = {}) {
  if (!Array.isArray(value)) return legacyDefault ? [...LEGACY_BRANCH_ACCESS] : [];
  const allowed = new Set(SYSTEM_ACCESS_OPTIONS.map((option) => option.id));
  return [...new Set(value.filter((permission) => allowed.has(permission)))];
}

export function hasPermission(session, permission) {
  if (session?.role === "admin" || session?.role === "superadmin") return true;
  return normalizeUserPermissions(session?.permissions).includes(permission);
}

export function canAccessTab(session, tabId) {
  if (session?.role === "admin" || session?.role === "superadmin") return true;
  const required = TAB_ACCESS[tabId] || [];
  return required.some((permission) => hasPermission(session, permission));
}

export function getFirstAccessibleTab(session, tabs) {
  return tabs.find((tab) => !tab.adminOnly && canAccessTab(session, tab.id))?.id || "noAccess";
}
