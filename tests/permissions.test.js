import test from "node:test";
import assert from "node:assert/strict";
import {
  canAccessTab,
  canManageUsers,
  getAccessibleBranches,
  hasPermission,
  isSuperAdmin,
  LEGACY_BRANCH_ACCESS,
  normalizeUserPermissions,
  normalizeUserRole,
} from "../src/permissions.js";

test("legacy users keep their existing full branch access", () => {
  assert.deepEqual(normalizeUserPermissions(undefined), LEGACY_BRANCH_ACCESS);
  assert.equal(canAccessTab({ role: "branch" }, "deliveredConverter"), true);
  assert.equal(canAccessTab({ role: "branch" }, "pettyCash"), true);
});

test("assigned users only access selected sections", () => {
  const session = { role: "branch", permissions: ["deliveredConverter"] };
  assert.equal(canAccessTab(session, "deliveredConverter"), true);
  assert.equal(canAccessTab(session, "courier"), false);
  assert.equal(canAccessTab(session, "settings"), false);
});

test("petty cash report and float permissions remain independent", () => {
  const reportOnly = { role: "branch", permissions: ["pettyCash.report"] };
  assert.equal(canAccessTab(reportOnly, "pettyCash"), true);
  assert.equal(hasPermission(reportOnly, "pettyCash.report"), true);
  assert.equal(hasPermission(reportOnly, "pettyCash.float"), false);
});

test("admin accounts always retain full system access", () => {
  const admin = { role: "admin", permissions: [] };
  assert.equal(canAccessTab(admin, "audit"), true);
  assert.equal(hasPermission(admin, "pettyCash.float"), true);
});

test("legacy and new role names normalize without changing branch users", () => {
  assert.equal(normalizeUserRole("user"), "branch");
  assert.equal(normalizeUserRole("regional manager"), "regional_manager");
  assert.equal(normalizeUserRole("super_admin"), "superadmin");
  assert.equal(canManageUsers({ role: "admin" }), true);
  assert.equal(canManageUsers({ role: "regional_manager" }), false);
  assert.equal(isSuperAdmin({ role: "superadmin" }), true);
});

test("regional managers are limited to their assigned branch workspaces", () => {
  const session = {
    role: "regional_manager",
    homeBranchName: "regional-south",
    branchName: "middeniya",
    assignedBranches: ["Middeniya", "kahawatta", "middeniya"],
  };
  assert.deepEqual(getAccessibleBranches(session), ["middeniya", "kahawatta"]);
});
