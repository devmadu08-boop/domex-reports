export const SYSTEM_ACCESS_OPTIONS = [
  { id: "dashboard", label: "Dashboard", group: "General" },
  { id: "courier", label: "Courier Performance", group: "Reports" },
  { id: "operation", label: "Operation Report", group: "Reports" },
  { id: "exports", label: "Export / History", group: "Reports" },
  { id: "allReports", label: "All Reports", group: "Reports" },
  { id: "deliveredConverter", label: "Delivered Report", group: "Reports" },
  { id: "reschedule", label: "Reschedule Report", group: "Reports" },
  { id: "receipt", label: "Receipt Generator", group: "Tools" },
  { id: "pettyCash.report", label: "Petty Cash CSV / Report Export", group: "Petty Cash" },
  { id: "pettyCash.float", label: "Petty Cash Float Management", group: "Petty Cash" },
  { id: "audit", label: "Audit Report", group: "Reports" },
  { id: "autoDispatch", label: "Auto-Dispatch & Branch Analytics", group: "Regional" },
  { id: "settings", label: "Settings", group: "Account" },
];

export const LEGACY_BRANCH_ACCESS = SYSTEM_ACCESS_OPTIONS
  .filter((option) => option.id !== "autoDispatch")
  .map((option) => option.id);
export const REGIONAL_MANAGER_ACCESS = SYSTEM_ACCESS_OPTIONS
  .filter((option) => option.id !== "settings")
  .map((option) => option.id);

export const USER_ROLE_OPTIONS = [
  { id: "branch", label: "Branch User" },
  { id: "regional_manager", label: "Regional Manager" },
  { id: "admin", label: "Admin" },
  { id: "superadmin", label: "Super Admin" },
];

const TAB_ACCESS = {
  dashboard: ["dashboard"],
  courier: ["courier"],
  operation: ["operation"],
  exports: ["exports"],
  allReports: ["allReports"],
  deliveredConverter: ["deliveredConverter"],
  reschedule: ["reschedule"],
  receipt: ["receipt"],
  autoDispatch: ["autoDispatch"],
  pettyCash: ["pettyCash.report", "pettyCash.float"],
  audit: ["audit"],
  settings: ["settings"],
};

export function normalizeUserPermissions(value, { legacyDefault = true } = {}) {
  if (!Array.isArray(value)) return legacyDefault ? [...LEGACY_BRANCH_ACCESS] : [];
  const allowed = new Set(SYSTEM_ACCESS_OPTIONS.map((option) => option.id));
  return [...new Set(value.filter((permission) => allowed.has(permission)))];
}

export function normalizeUserRole(value, { systemAdmin = false } = {}) {
  if (systemAdmin) return "superadmin";
  const role = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (role === "superadmin" || role === "super_admin") return "superadmin";
  if (role === "admin") return "admin";
  if (role === "regional" || role === "regional_manager") return "regional_manager";
  return "branch";
}

export function isSuperAdmin(value) {
  return normalizeUserRole(typeof value === "string" ? value : value?.role) === "superadmin";
}

export function canManageUsers(value) {
  const role = normalizeUserRole(typeof value === "string" ? value : value?.role);
  return role === "admin" || role === "superadmin";
}

export function normalizeAssignedBranches(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((branch) => String(branch || "").trim().toLowerCase()).filter(Boolean))];
}

export function getAccessibleBranches(session) {
  const homeBranch = String(session?.homeBranchName || session?.branchName || "").trim().toLowerCase();
  if (normalizeUserRole(session?.role) !== "regional_manager") return homeBranch ? [homeBranch] : [];
  const assigned = normalizeAssignedBranches(session?.assignedBranches);
  return assigned.length ? assigned : (homeBranch ? [homeBranch] : []);
}

export function hasPermission(session, permission) {
  if (session?.role === "admin" || session?.role === "superadmin") return true;
  return normalizeUserPermissions(session?.permissions).includes(permission);
}

export function isSpecialDispatchUser(session) {
  const role = normalizeUserRole(session?.role);
  if (role === "regional_manager" || role === "admin" || role === "superadmin") return true;
  if (session?.canAccessDispatch === true || session?.can_access_dispatch === true) return true;
  return normalizeUserPermissions(session?.permissions, { legacyDefault: false }).includes("autoDispatch");
}

export function canAccessTab(session, tabId) {
  if (tabId === "autoDispatch") {
    return isSpecialDispatchUser(session);
  }
  if (session?.role === "admin" || session?.role === "superadmin") return true;
  if (tabId === "receipt") return true; // Always allow access to the receipt tool
  const required = TAB_ACCESS[tabId] || [];
  return required.some((permission) => hasPermission(session, permission));
}

export function getFirstAccessibleTab(session, tabs) {
  return tabs.find((tab) => !tab.adminOnly && canAccessTab(session, tab.id))?.id || "noAccess";
}
