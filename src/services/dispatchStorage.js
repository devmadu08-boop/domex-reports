/**
 * Storage service for Branch Dispatch Targets and Dispatch Reports
 * Stores in LocalStorage with optional Firebase Realtime DB synchronization.
 */

const TARGETS_STORAGE_KEY = "daily-courier-report-dispatch-targets-v1";
const REPORTS_STORAGE_KEY = "daily-courier-report-dispatch-reports-v1";

const DEFAULT_TARGETS = [
  { id: "target-colombo", branch_name: "Colombo", target: 500, created_at: "2026-01-01T00:00:00.000Z" },
  { id: "target-kandy", branch_name: "Kandy", target: 300, created_at: "2026-01-01T00:00:00.000Z" },
  { id: "target-galle", branch_name: "Galle", target: 250, created_at: "2026-01-01T00:00:00.000Z" },
  { id: "target-embilipitiya", branch_name: "Embilipitiya", target: 200, created_at: "2026-01-01T00:00:00.000Z" },
  { id: "target-middeniya", branch_name: "Middeniya", target: 150, created_at: "2026-01-01T00:00:00.000Z" },
  { id: "target-tangalle", branch_name: "Tangalle", target: 180, created_at: "2026-01-01T00:00:00.000Z" },
  { id: "target-matara", branch_name: "Matara", target: 220, created_at: "2026-01-01T00:00:00.000Z" },
  { id: "target-kurunegala", branch_name: "Kurunegala", target: 260, created_at: "2026-01-01T00:00:00.000Z" },
  { id: "target-negombo", branch_name: "Negombo", target: 280, created_at: "2026-01-01T00:00:00.000Z" },
  { id: "target-gampaha", branch_name: "Gampaha", target: 350, created_at: "2026-01-01T00:00:00.000Z" }
];

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error(`Failed to write ${key} to localStorage:`, err);
  }
}

/**
 * Get all configured branch targets
 */
export function getDispatchTargets() {
  const saved = readJson(TARGETS_STORAGE_KEY, null);
  if (!saved || !Array.isArray(saved) || saved.length === 0) {
    writeJson(TARGETS_STORAGE_KEY, DEFAULT_TARGETS);
    return DEFAULT_TARGETS;
  }
  return saved;
}

/**
 * Save entire targets list
 */
export function saveDispatchTargets(targets) {
  const clean = Array.isArray(targets) ? targets : [];
  writeJson(TARGETS_STORAGE_KEY, clean);
  return clean;
}

/**
 * Add a new branch target
 */
export function addDispatchTarget(branch_name, target) {
  const cleanName = String(branch_name || "").trim();
  const cleanTarget = Math.max(0, parseInt(target || 0, 10));
  if (!cleanName) throw new Error("Branch name cannot be empty");

  const current = getDispatchTargets();
  const existing = current.find(
    (t) => t.branch_name.toLowerCase() === cleanName.toLowerCase()
  );

  if (existing) {
    throw new Error(`Branch target for "${cleanName}" already exists.`);
  }

  const newTarget = {
    id: `target-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    branch_name: cleanName,
    target: cleanTarget,
    created_at: new Date().toISOString()
  };

  const updated = [...current, newTarget].sort((a, b) => a.branch_name.localeCompare(b.branch_name));
  saveDispatchTargets(updated);
  return newTarget;
}

/**
 * Update an existing branch target
 */
export function updateDispatchTarget(id, updates) {
  const current = getDispatchTargets();
  const index = current.findIndex((t) => t.id === id);
  if (index === -1) throw new Error("Target not found");

  const updatedItem = {
    ...current[index],
    ...updates,
    target: updates.target !== undefined ? Math.max(0, parseInt(updates.target || 0, 10)) : current[index].target
  };

  const updatedList = [...current];
  updatedList[index] = updatedItem;
  saveDispatchTargets(updatedList);
  return updatedItem;
}

/**
 * Delete a branch target
 */
export function deleteDispatchTarget(id) {
  const current = getDispatchTargets();
  const filtered = current.filter((t) => t.id !== id);
  saveDispatchTargets(filtered);
  return filtered;
}

/**
 * Reset branch targets to standard DOMEX defaults
 */
export function resetDefaultDispatchTargets() {
  saveDispatchTargets(DEFAULT_TARGETS);
  return DEFAULT_TARGETS;
}

/**
 * Calculation Engine for Performance Metrics
 */
export function calculateDispatchMetrics(parsedItems = [], branchTargets = []) {
  const targetMap = new Map(
    branchTargets.map((t) => [t.branch_name.toLowerCase(), t.target || 0])
  );

  let totalTarget = 0;
  let totalDispatch = 0;

  const rows = parsedItems.map((item) => {
    const branchName = String(item.branch || "").trim();
    const dispatch = Math.max(0, parseInt(item.dispatch || 0, 10));
    const target = targetMap.get(branchName.toLowerCase()) || 0;

    const percentage = target > 0 ? Number(((dispatch / target) * 100).toFixed(1)) : 0;
    
    // Status classification:
    // 🟢 Excellent: >= 100%
    // 🟡 Good: >= 70% and < 100%
    // 🔴 Poor: < 70%
    let status = "poor";
    let statusLabel = "Poor";
    let statusColor = "red";

    if (percentage >= 100) {
      status = "excellent";
      statusLabel = "Excellent";
      statusColor = "emerald";
    } else if (percentage >= 70) {
      status = "good";
      statusLabel = "Good";
      statusColor = "amber";
    }

    totalTarget += target;
    totalDispatch += dispatch;

    return {
      branch: branchName,
      target,
      dispatch,
      percentage,
      status,
      statusLabel,
      statusColor
    };
  });

  // Auto-sort list descending by achievement percentage
  rows.sort((a, b) => b.percentage - a.percentage);

  const overallPercentage = totalTarget > 0 ? Number(((totalDispatch / totalTarget) * 100).toFixed(1)) : 0;

  const topBranch = rows.length > 0 ? rows[0] : null;
  const lowestBranch = rows.length > 0 ? rows[rows.length - 1] : null;

  return {
    rows,
    summary: {
      totalTarget,
      totalDispatch,
      overallPercentage,
      topBranch: topBranch ? { branch: topBranch.branch, percentage: topBranch.percentage } : null,
      lowestBranch: lowestBranch ? { branch: lowestBranch.branch, percentage: lowestBranch.percentage } : null,
      branchCount: rows.length
    }
  };
}

/**
 * History tracking for Dispatch Reports
 */
export function getDispatchReportsHistory() {
  const saved = readJson(REPORTS_STORAGE_KEY, []);
  return Array.isArray(saved) ? saved : [];
}

export function getDispatchReportByDate(date) {
  const history = getDispatchReportsHistory();
  return history.find((r) => r.date === date) || null;
}

export function saveDispatchReport({ date, items, summary, rawText, user }) {
  const history = getDispatchReportsHistory();
  const id = `dispatch-report-${date}`;

  const report = {
    id,
    date,
    items,
    summary,
    rawText: rawText || "",
    created_by: user?.userId || user?.branchName || "Regional Manager",
    created_at: new Date().toISOString()
  };

  const existingIndex = history.findIndex((r) => r.date === date);
  let updated;
  if (existingIndex >= 0) {
    updated = [...history];
    updated[existingIndex] = report;
  } else {
    updated = [report, ...history];
  }

  writeJson(REPORTS_STORAGE_KEY, updated);
  return report;
}

export function deleteDispatchReport(dateOrId) {
  const history = getDispatchReportsHistory();
  const filtered = history.filter((r) => r.date !== dateOrId && r.id !== dateOrId);
  writeJson(REPORTS_STORAGE_KEY, filtered);
  return filtered;
}
