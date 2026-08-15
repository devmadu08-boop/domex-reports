import test from "node:test";
import assert from "node:assert/strict";
import { canAccessTab, hasPermission, LEGACY_BRANCH_ACCESS, normalizeUserPermissions } from "../src/permissions.js";

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
