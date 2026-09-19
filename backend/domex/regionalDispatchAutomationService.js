import fs from "node:fs/promises";
import path from "node:path";
import { 
  subscribeToAccountMessages, 
  sendAccountRecipientText, 
  sendAccountRecipientReport, 
  getAccountWhatsAppStatus,
  deleteAccountMessage,
  reactToAccountMessage
} from "../whatsapp/accountWhatsappService.js";
import { chromium } from "playwright-core";

const dataDir = path.resolve("backend", "data", "regional-dispatch");
const configFile = path.join(dataDir, "config.json");
const reportsFile = path.join(dataDir, "reports.json");
const sentMessagesFile = path.join(dataDir, "sent-messages.json");
const messagesDir = path.join(dataDir, "messages");
const dispatchesDir = path.join(dataDir, "dispatches");

// Helper to ensure directory exists
async function ensureDir(dir) {
  try { await fs.mkdir(dir, { recursive: true }); } catch (e) {}
}

export async function getRegionalDispatchReports(accountKey) {
  await ensureDir(dataDir);
  try {
    const raw = await fs.readFile(reportsFile, "utf8");
    const all = JSON.parse(raw) || {};
    const clean = String(accountKey || "default").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
    const candidates = [
      clean,
      clean.startsWith("user-") ? clean.replace(/^user-/, "") : `user-${clean}`,
      "global",
      "default"
    ];
    
    // Merge reports from all candidates by report id/date
    const reportMap = new Map();
    for (const k of candidates) {
      if (Array.isArray(all[k])) {
        for (const r of all[k]) {
          const key = r.id || r.date;
          if (key && !reportMap.has(key)) {
            reportMap.set(key, r);
          }
        }
      }
    }
    const merged = Array.from(reportMap.values());
    merged.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    return merged;
  } catch (error) {
    return [];
  }
}

export async function saveRegionalDispatchReport(accountKey, report) {
  await ensureDir(dataDir);
  let all = {};
  try {
    const raw = await fs.readFile(reportsFile, "utf8");
    all = JSON.parse(raw) || {};
  } catch (error) {}

  const clean = String(accountKey || "default").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  const reportId = report.id || `dispatch-report-${report.date || getTodayString()}`;
  const reportRecord = {
    ...report,
    id: reportId,
    date: report.date || getTodayString(),
    updated_at: new Date().toISOString()
  };

  const keysToUpdate = new Set([
    clean,
    clean.startsWith("user-") ? clean.replace(/^user-/, "") : `user-${clean}`,
    "global",
    "default"
  ]);

  for (const k of keysToUpdate) {
    let list = Array.isArray(all[k]) ? [...all[k]] : [];
    const existingIdx = list.findIndex(r => r.id === reportId || r.date === reportRecord.date);
    if (existingIdx >= 0) {
      list[existingIdx] = { ...list[existingIdx], ...reportRecord };
    } else {
      list.unshift(reportRecord);
    }
    all[k] = list;
  }

  await fs.writeFile(reportsFile, JSON.stringify(all, null, 2));
  return reportRecord;
}

export async function deleteRegionalDispatchReport(accountKey, dateOrId) {
  await ensureDir(dataDir);
  let all = {};
  try {
    const raw = await fs.readFile(reportsFile, "utf8");
    all = JSON.parse(raw) || {};
  } catch (error) {}

  const clean = String(accountKey || "default").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  const keysToUpdate = new Set([
    clean,
    clean.startsWith("user-") ? clean.replace(/^user-/, "") : `user-${clean}`,
    "global",
    "default"
  ]);

  for (const k of keysToUpdate) {
    if (Array.isArray(all[k])) {
      all[k] = all[k].filter(r => r.id !== dateOrId && r.date !== dateOrId);
    }
  }

  await fs.writeFile(reportsFile, JSON.stringify(all, null, 2));
  return { ok: true };
}

export async function getRecentSentMessages(accountKey) {
  await ensureDir(dataDir);
  try {
    const raw = await fs.readFile(sentMessagesFile, "utf8");
    const all = JSON.parse(raw) || [];
    return Array.isArray(all) ? all.slice(0, 50) : [];
  } catch (e) {
    return [];
  }
}

export async function recordSentMessage(accountKey, entry) {
  await ensureDir(dataDir);
  try {
    let all = [];
    try {
      const raw = await fs.readFile(sentMessagesFile, "utf8");
      all = JSON.parse(raw) || [];
    } catch (e) {}

    const record = {
      id: entry.id || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: entry.type || "text",
      title: entry.title || "Sent Message",
      groupId: entry.groupId || "",
      recipientPhone: entry.recipientPhone || "",
      accountKey: accountKey || "default",
      messageKey: entry.messageKey || null,
      messageKeys: Array.isArray(entry.messageKeys) ? entry.messageKeys : (entry.messageKey ? [entry.messageKey] : []),
      personalMessages: Array.isArray(entry.personalMessages) ? entry.personalMessages : [],
      sentAt: entry.sentAt || new Date().toISOString(),
      status: "sent",
      preview: entry.preview || ""
    };

    all.unshift(record);
    if (all.length > 150) all = all.slice(0, 150);

    await fs.writeFile(sentMessagesFile, JSON.stringify(all, null, 2));
    return record;
  } catch (err) {
    console.error("[regional-dispatch] Failed to record sent message:", err);
  }
}

export async function deleteSentMessage(accountKey, messageId) {
  await ensureDir(dataDir);
  let all = [];
  try {
    const raw = await fs.readFile(sentMessagesFile, "utf8");
    all = JSON.parse(raw) || [];
  } catch (e) {
    throw new Error("No sent messages found");
  }

  const idx = all.findIndex(m => m.id === messageId);
  if (idx === -1) {
    throw new Error("Message not found or already deleted");
  }

  const target = all[idx];
  const activeKey = await getRegionalManagerActiveKey();

  // Target destination can be a group (target.groupId) or personal chat (target.recipientPhone)
  const targetDestination = target.groupId || target.recipientPhone;

  const keysToDelete = Array.isArray(target.messageKeys) && target.messageKeys.length > 0
    ? target.messageKeys
    : (target.messageKey ? [target.messageKey] : []);

  let mainResult = null;
  if (targetDestination && keysToDelete.length > 0) {
    try {
      mainResult = await deleteAccountMessage(activeKey, {
        phoneNumber: targetDestination,
        messageKeys: keysToDelete,
        messageKey: target.messageKey
      });
    } catch (err) {
      console.warn(`[regional-dispatch] Main message revoke error:`, err.message || err);
    }
  }

  // Also delete all linked personal messages from branch personal chats if present
  let deletedPersonalCount = 0;
  if (Array.isArray(target.personalMessages) && target.personalMessages.length > 0) {
    for (const pMsg of target.personalMessages) {
      const pPhone = pMsg.phone;
      const pKeys = Array.isArray(pMsg.messageKeys) && pMsg.messageKeys.length > 0
        ? pMsg.messageKeys
        : (pMsg.messageKey ? [pMsg.messageKey] : []);
      if (pPhone && pKeys.length > 0) {
        try {
          await deleteAccountMessage(activeKey, {
            phoneNumber: pPhone,
            messageKeys: pKeys,
            messageKey: pMsg.messageKey
          });
          deletedPersonalCount++;
        } catch (pErr) {
          console.warn(`[regional-dispatch] Personal message revoke error for ${pPhone}:`, pErr.message || pErr);
        }
      }
    }
  }

  all[idx] = {
    ...target,
    status: "deleted",
    deletedAt: new Date().toISOString(),
    deletedPersonalCount
  };

  await fs.writeFile(sentMessagesFile, JSON.stringify(all, null, 2));
  return { ok: true, result: mainResult, deletedPersonalCount };
}


async function readAllConfigs() {
  await ensureDir(dataDir);
  try {
    const data = await fs.readFile(configFile, "utf8");
    return JSON.parse(data);
  } catch (error) {
    return {};
  }
}

export function isRegionalManagerAccount(accountKey) {
  if (!accountKey) return true;
  const clean = String(accountKey).trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  return (
    clean === "default" ||
    clean === "user-default" ||
    clean === "admin" ||
    clean === "user-admin" ||
    clean === "regional" ||
    clean === "user-regional" ||
    clean === "regional-manager" ||
    clean === "user-regional-manager"
  );
}

export async function getRegionalManagerActiveKey() {
  const candidates = [
    "default",
    "user-default",
    "admin",
    "user-admin",
    "regional",
    "user-regional",
    "regional-manager",
    "user-regional-manager"
  ];
  for (const k of candidates) {
    try {
      const st = await getAccountWhatsAppStatus(k);
      if (st && st.status === "connected") {
        return k;
      }
    } catch (e) {}
  }
  return "default";
}

export async function getRegionalConfig(accountKey) {
  const configs = await readAllConfigs();
  const clean = String(accountKey || "default").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");

  // If a branch account queries regional config, strictly return disabled!
  // Regional dispatch is exclusively controlled by the Regional Manager.
  if (!isRegionalManagerAccount(clean)) {
    return {
      enabled: false,
      groupId: "",
      geminiApiKey: "",
      targets: [],
      checkInStartTime: "16:00",
      reportSendTime: "23:30",
      reminderTimes: ["23:00"],
      userName: "",
      userRole: "branch",
      isBranchLogin: true
    };
  }

  const cfg = configs["default"] || configs[clean] || {};
  return {
    enabled: Boolean(cfg?.enabled),
    groupId: String(cfg?.groupId || "").trim(),
    geminiApiKey: String(cfg?.geminiApiKey || "").trim(),
    targets: Array.isArray(cfg?.targets) ? cfg.targets : [],
    checkInStartTime: String(cfg?.checkInStartTime || "16:00").trim(),
    reportSendTime: String(cfg?.reportSendTime || "23:30").trim(),
    reminderTimes: Array.isArray(cfg?.reminderTimes) && cfg.reminderTimes.length > 0
      ? cfg.reminderTimes
      : (cfg?.reminderTime ? [String(cfg.reminderTime).trim()] : ["23:00"]),
    userName: cfg?.userName || "",
    userRole: cfg?.userRole || "regional_manager"
  };
}

export async function saveRegionalConfig(accountKey, payload) {
  const configs = await readAllConfigs();
  const existing = configs["default"] || configs[accountKey] || {};
  const data = {
    enabled: payload.enabled !== undefined ? Boolean(payload.enabled) : Boolean(existing.enabled),
    groupId: payload.groupId !== undefined ? String(payload.groupId || "").trim() : String(existing.groupId || "").trim(),
    geminiApiKey: payload.geminiApiKey !== undefined ? String(payload.geminiApiKey || "").trim() : String(existing.geminiApiKey || "").trim(),
    targets: Array.isArray(payload.targets) ? payload.targets : (Array.isArray(existing.targets) ? existing.targets : []),
    checkInStartTime: payload.checkInStartTime !== undefined ? String(payload.checkInStartTime || "16:00").trim() : String(existing.checkInStartTime || "16:00").trim(),
    reportSendTime: payload.reportSendTime !== undefined ? String(payload.reportSendTime || "23:30").trim() : String(existing.reportSendTime || "23:30").trim(),
    reminderTimes: Array.isArray(payload.reminderTimes) && payload.reminderTimes.length > 0
      ? payload.reminderTimes.map(t => String(t || "").trim()).filter(Boolean)
      : (payload.reminderTime ? [String(payload.reminderTime).trim()] : (existing.reminderTimes || ["23:00"])),
    userName: payload.userName !== undefined ? payload.userName : (existing.userName || ""),
    userRole: payload.userRole !== undefined ? payload.userRole : (existing.userRole || "regional_manager"),
    botAuthorizedNumbers: payload.botAuthorizedNumbers !== undefined ? payload.botAuthorizedNumbers : (existing.botAuthorizedNumbers || "")
  };

  // Always store regional dispatch configuration under "default"
  configs["default"] = data;

  // Purge any branch configs that may have been saved previously so they never cause duplicate cron execution
  for (const k of Object.keys(configs)) {
    if (k !== "default" && !isRegionalManagerAccount(k)) {
      delete configs[k];
    }
  }

  await fs.writeFile(configFile, JSON.stringify(configs, null, 2));
  return configs["default"];
}

function getTodayString() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Colombo" }).format(new Date());
}

export function toInternationalPhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10 && digits.startsWith("0")) {
    return "94" + digits.slice(1);
  }
  if (digits.length === 9) {
    return "94" + digits;
  }
  return digits;
}

export async function resolveConnectedActiveKey(accountKey) {
  // STRICT: Regional Dispatch ONLY ever uses the Regional Manager WhatsApp socket!
  // Branch sockets must NEVER be used for dispatch operations!
  return await getRegionalManagerActiveKey();
}

export async function resolveLidPhone(lidUser, activeKey = "default") {
  const clean = String(lidUser || "").replace(/@.*$/, "").replace(/:\d+$/, "").replace(/\D/g, "");
  if (!clean) return null;
  const candidateDirs = [
    path.resolve("backend", "data", "whatsapp-auth"),
    path.resolve("backend", "data", "whatsapp-meter-auth"),
    path.resolve("backend", "data", "whatsapp-accounts", activeKey || "default")
  ];
  for (const dir of candidateDirs) {
    try {
      const revFile = path.join(dir, `lid-mapping-${clean}_reverse.json`);
      const raw = await fs.readFile(revFile, "utf8");
      const phone = JSON.parse(raw);
      if (phone && String(phone).length >= 9) return String(phone).replace(/\D/g, "");
    } catch (e) {}
  }
  return null;
}

function normalizeBranchStem(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/th/g, "t")
    .replace(/[aeiou]+$/g, "");
}

function levenshteinDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) matrix[i][j] = matrix[i - 1][j - 1];
      else matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
    }
  }
  return matrix[b.length][a.length];
}

export function findBranchInLine(line, targetBranches) {
  const cleanLine = String(line || "").toLowerCase().replace(/[^a-z0-9]/g, " ");
  const lineWords = cleanLine.split(/\s+/).filter(Boolean);
  const stemWords = lineWords.map(normalizeBranchStem);

  for (const t of targetBranches) {
    const orig = t.branch || t.branch_name || t;
    const cleanT = String(orig).toLowerCase().replace(/[^a-z0-9]/g, "");
    const stemT = normalizeBranchStem(orig);

    if (cleanLine.includes(cleanT)) return orig;

    if (stemT.length >= 4) {
      for (let i = 0; i < stemWords.length; i++) {
        const sw = stemWords[i];
        if (sw.length >= 4 && (sw.includes(stemT) || stemT.includes(sw))) {
          return orig;
        }
      }
    }

    if (cleanT.length >= 5) {
      for (const w of lineWords) {
        if (w.length >= 4 && Math.abs(w.length - cleanT.length) <= 2) {
          if (levenshteinDistance(w, cleanT) <= (cleanT.length >= 7 ? 2 : 1)) {
            return orig;
          }
        }
      }
    }
  }

  return null;
}

// Whitelist of words allowed in a dispatch line alongside the branch name
const ALLOWED_DISPATCH_TOKENS = new Set([
  "dispatch", "dispatches", "dispatched",
  "count", "counts",
  "dis", "dp",
  "branch", "br",
  "pcs", "pkts", "parcels", "packets", "items", "nos", "no", "qty",
  "today", "ada",
  "target", "tgt",
  "total", "tot",
  "d", "c", "p"
]);

export function parseStrictDispatchLine(rawLine, targetBranches) {
  if (!rawLine || typeof rawLine !== "string") return null;
  let line = rawLine.trim();
  if (!line) return null;

  // 1. Remove list / bullet prefixes at start: e.g. "1.", "1)", "1 -", "•", "-", "*", "#", ">"
  line = line.replace(/^\s*(?:(?:\d{1,2}[.)\-\:]|[•*#\-–—>]|(?:\(\d{1,2}\)))\s*)+/, "").trim();

  // 2. Remove whatsapp bold/italics/code markdown: *text*, _text_, ~text~, `text`
  line = line.replace(/[*_~`]/g, " ").trim();

  // 3. Find matching branch from target branches
  const branch = findBranchInLine(line, targetBranches);
  if (!branch) return null;

  // 4. Remove the branch name words from the line to inspect the rest
  const cleanBranch = String(branch).toLowerCase().replace(/[^a-z0-9]/g, "");
  const branchStem = normalizeBranchStem(branch);
  const branchWords = String(branch).toLowerCase().replace(/[^a-z0-9]/g, " ").split(/\s+/).filter(Boolean);

  const normalizedLine = line.replace(/[:=\-\/\|\(\),]/g, " ");
  const rawWords = normalizedLine.split(/\s+/).filter(Boolean);

  const nonBranchWords = [];
  let matchedBranchWord = false;

  for (const word of rawWords) {
    const cleanWord = word.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!cleanWord) continue;

    const wordStem = normalizeBranchStem(cleanWord);
    const isBranchWord = branchWords.includes(cleanWord);
    const isBranchMatch = 
      isBranchWord ||
      cleanWord === cleanBranch ||
      (cleanBranch.includes(cleanWord) && cleanWord.length >= 3) ||
      (cleanWord.includes(cleanBranch) && cleanBranch.length >= 3) ||
      (branchStem.length >= 3 && (wordStem.includes(branchStem) || branchStem.includes(wordStem))) ||
      (cleanBranch.length >= 5 && levenshteinDistance(cleanWord, cleanBranch) <= (cleanBranch.length >= 7 ? 2 : 1));

    if (isBranchMatch && (!matchedBranchWord || isBranchWord)) {
      matchedBranchWord = true;
      continue;
    }

    nonBranchWords.push(cleanWord);
  }

  if (!matchedBranchWord) return null;

  // 5. Inspect the remaining non-branch words
  let foundNumbers = [];
  for (const w of nonBranchWords) {
    if (/^\d+$/.test(w)) {
      const num = parseInt(w, 10);
      if (w.length <= 5 && num >= 0 && num <= 99999) {
        foundNumbers.push(num);
      } else {
        return null; // Reject long numbers (phone numbers, timestamps, etc.)
      }
    } else {
      if (!ALLOWED_DISPATCH_TOKENS.has(w)) {
        return null; // Reject casual/conversational words
      }
    }
  }

  if (foundNumbers.length === 0) return null;

  let dispatchCount = foundNumbers[foundNumbers.length - 1];
  if (foundNumbers.length === 2) {
    const hasTargetWord = nonBranchWords.includes("target") || nonBranchWords.includes("tgt");
    const hasDispatchWord = nonBranchWords.includes("dispatch") || nonBranchWords.includes("dis");
    if (hasTargetWord && hasDispatchWord) {
      const dispIdx = nonBranchWords.findIndex(w => w === "dispatch" || w === "dis");
      const nextWord = nonBranchWords[dispIdx + 1];
      if (nextWord && /^\d+$/.test(nextWord)) {
        dispatchCount = parseInt(nextWord, 10);
      }
    } else {
      dispatchCount = foundNumbers[0];
    }
  } else if (foundNumbers.length > 2) {
    return null;
  }

  return { branch, dispatch: dispatchCount };
}

export function extractAllBranchDispatchesFromText(text, targets) {
  if (!text || !Array.isArray(targets) || targets.length === 0) return [];
  const lines = String(text).split("\n");
  const results = [];
  const seen = new Set();
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parsed = parseStrictDispatchLine(trimmed, targets);
    if (parsed && !seen.has(parsed.branch)) {
      results.push(parsed);
      seen.add(parsed.branch);
    }
  }
  return results;
}

export function extractMessageInfo(msg) {
  if (!msg) return null;
  const key = msg.key;
  const id = key?.id;
  const remoteJid = key?.remoteJid;
  const participant = key?.participant || msg.participant;
  const fromMe = Boolean(key?.fromMe);

  // 1. Check if editedMessage is present directly on msg.message
  const directEdit = msg.message?.editedMessage?.message;
  if (directEdit) {
    let editM = directEdit;
    if (editM?.ephemeralMessage?.message) editM = editM.ephemeralMessage.message;
    if (editM?.viewOnceMessage?.message) editM = editM.viewOnceMessage.message;
    if (editM?.documentWithCaptionMessage?.message) editM = editM.documentWithCaptionMessage.message;
    const text = (
      editM?.conversation ||
      editM?.extendedTextMessage?.text ||
      editM?.imageMessage?.caption ||
      editM?.videoMessage?.caption ||
      editM?.documentMessage?.caption ||
      ""
    ).trim();
    if (text) {
      return {
        type: "edit",
        targetKey: key,
        targetId: id,
        text,
        key,
        remoteJid,
        participant,
        fromMe
      };
    }
  }

  let m = msg.message;
  if (m?.ephemeralMessage?.message) m = m.ephemeralMessage.message;
  if (m?.viewOnceMessage?.message) m = m.viewOnceMessage.message;
  if (m?.viewOnceMessageV2?.message) m = m.viewOnceMessageV2.message;
  if (m?.documentWithCaptionMessage?.message) m = m.documentWithCaptionMessage.message;
  if (m?.editedMessage?.message) m = m.editedMessage.message;

  const protocolMsg = m?.protocolMessage || msg.message?.protocolMessage;
  if (protocolMsg) {
    const pType = protocolMsg.type;
    // REVOKE (0)
    if (pType === 0 || pType === "REVOKE") {
      return {
        type: "revoke",
        targetKey: protocolMsg.key,
        targetId: protocolMsg.key?.id || id,
        key,
        remoteJid,
        participant,
        fromMe
      };
    }
    // MESSAGE_EDIT (14)
    if (pType === 14 || pType === "MESSAGE_EDIT") {
      let editM = protocolMsg.editedMessage;
      if (editM?.message) editM = editM.message;
      if (editM?.ephemeralMessage?.message) editM = editM.ephemeralMessage.message;
      if (editM?.viewOnceMessage?.message) editM = editM.viewOnceMessage.message;
      if (editM?.documentWithCaptionMessage?.message) editM = editM.documentWithCaptionMessage.message;
      const text = (
        editM?.conversation ||
        editM?.extendedTextMessage?.text ||
        editM?.imageMessage?.caption ||
        editM?.videoMessage?.caption ||
        editM?.documentMessage?.caption ||
        ""
      ).trim();
      return {
        type: "edit",
        targetKey: protocolMsg.key,
        targetId: protocolMsg.key?.id || id,
        text,
        key,
        remoteJid,
        participant,
        fromMe
      };
    }
  }

  const text = (
    m?.conversation ||
    m?.extendedTextMessage?.text ||
    m?.imageMessage?.caption ||
    m?.videoMessage?.caption ||
    m?.documentMessage?.caption ||
    ""
  ).trim();

  return {
    type: "normal",
    id,
    key,
    remoteJid,
    participant,
    fromMe,
    text
  };
}

export function extractInfoFromUpdate(upd) {
  if (!upd) return null;
  const key = upd.key;
  const id = key?.id;
  const remoteJid = key?.remoteJid;
  const participant = key?.participant || upd.participant;
  const fromMe = Boolean(key?.fromMe);

  const update = upd.update;
  const updMsg = update?.message;
  const proto = updMsg?.protocolMessage;

  // 1. Revoke / Delete
  if (
    proto?.type === 0 ||
    proto?.type === "REVOKE" ||
    update?.messageStubType === 1 ||
    update?.messageStubType === "REVOKE" ||
    update?.messageStubType === 68 ||
    (update && update.message === null)
  ) {
    const targetId = proto?.key?.id || id;
    const targetKey = proto?.key || key;
    return {
      type: "revoke",
      targetId,
      targetKey,
      remoteJid,
      participant,
      fromMe
    };
  }

  // 2. Edit
  // Standard Baileys format: update.message.editedMessage.message
  let editContent = updMsg?.editedMessage?.message || updMsg?.editedMessage;
  if (!editContent && proto && (proto.type === 14 || proto.type === "MESSAGE_EDIT")) {
    editContent = proto.editedMessage?.message || proto.editedMessage;
  }
  if (!editContent && updMsg?.protocolMessage?.editedMessage) {
    editContent = updMsg.protocolMessage.editedMessage?.message || updMsg.protocolMessage.editedMessage;
  }

  let editText = "";
  if (editContent) {
    if (editContent.ephemeralMessage?.message) editContent = editContent.ephemeralMessage.message;
    if (editContent.viewOnceMessage?.message) editContent = editContent.viewOnceMessage.message;
    if (editContent.documentWithCaptionMessage?.message) editContent = editContent.documentWithCaptionMessage.message;
    editText = (
      editContent.conversation ||
      editContent.extendedTextMessage?.text ||
      editContent.imageMessage?.caption ||
      editContent.videoMessage?.caption ||
      editContent.documentMessage?.caption ||
      ""
    ).trim();
  }

  // Direct conversation / extendedTextMessage on update.message (fallback)
  if (!editText && updMsg && !proto) {
    let directM = updMsg;
    if (directM.ephemeralMessage?.message) directM = directM.ephemeralMessage.message;
    editText = (
      directM.conversation ||
      directM.extendedTextMessage?.text ||
      directM.imageMessage?.caption ||
      ""
    ).trim();
  }

  if (editText) {
    const targetId = proto?.key?.id || id;
    const targetKey = proto?.key || key;
    return {
      type: "edit",
      targetId,
      targetKey,
      text: editText,
      remoteJid,
      participant,
      fromMe
    };
  }

  return null;
}

export async function getDailyState(accountKey) {
  const today = getTodayString();
  const clean = String(accountKey || "default").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  await ensureDir(path.join(dispatchesDir, today));
  const file = path.join(dispatchesDir, today, `${clean}.json`);
  try {
    const raw = await fs.readFile(file, "utf8");
    const data = JSON.parse(raw);
    if (data && typeof data === "object") {
      if (!data.dispatches) data.dispatches = {};
      if (!data.messages) data.messages = {};
      if (!data.manualOverrides) data.manualOverrides = {};
      return data;
    }
  } catch {}
  return { date: today, dispatches: {}, messages: {}, manualOverrides: {} };
}

export async function saveDailyState(accountKey, state) {
  const today = getTodayString();
  const clean = String(accountKey || "default").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  await ensureDir(path.join(dispatchesDir, today));
  const keys = new Set([
    clean,
    clean.startsWith("user-") ? clean.replace(/^user-/, "") : `user-${clean}`
  ]);
  for (const k of keys) {
    const file = path.join(dispatchesDir, today, `${k}.json`);
    try {
      await fs.writeFile(file, JSON.stringify(state, null, 2));
    } catch (e) {
      console.error("[regional-dispatch] Error writing daily state JSON:", e);
    }
  }
}

export async function syncMessagesTxtFile(accountKey, state) {
  const today = getTodayString();
  await ensureDir(path.join(messagesDir, today));
  const clean = String(accountKey || "default").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  
  const lines = [];
  const sortedMsgs = Object.values(state.messages || {}).sort((a, b) => 
    String(a.timestamp || "").localeCompare(String(b.timestamp || ""))
  );
  for (const m of sortedMsgs) {
    if (m.text) {
      lines.push(m.text);
    } else if (m.branch && m.dispatch != null) {
      lines.push(`${m.branch} dispatch ${m.dispatch}`);
    }
  }

  for (const [branch, data] of Object.entries(state.manualOverrides || {})) {
    if (data?.dispatch != null && !sortedMsgs.some(m => m.branch === branch)) {
      lines.push(`${branch} dispatch ${data.dispatch}`);
    }
  }

  const content = lines.join("\n---\n") + (lines.length > 0 ? "\n---\n" : "");

  const keys = new Set([
    clean,
    clean.startsWith("user-") ? clean.replace(/^user-/, "") : `user-${clean}`
  ]);
  for (const k of keys) {
    const msgFile = path.join(messagesDir, today, `${k}.txt`);
    try {
      await fs.writeFile(msgFile, content, "utf8");
    } catch (e) {
      console.error("[regional-dispatch] Error syncing txt file:", e);
    }
  }
}

export async function recordBranchDispatch(accountKey, { messageId, branch, dispatch, text, sender, fromMe, source = "group" }) {
  const state = await getDailyState(accountKey);
  const cfg = await getRegionalConfig(accountKey);
  const targets = Array.isArray(cfg?.targets) ? cfg.targets : [];
  const canonicalBranch = findBranchInLine(branch, targets) || branch;

  if (messageId) {
    state.messages[messageId] = {
      id: messageId,
      branch: canonicalBranch,
      dispatch: Number(dispatch),
      text,
      sender: sender || "",
      fromMe: Boolean(fromMe),
      timestamp: new Date().toISOString()
    };
  }

  state.dispatches[canonicalBranch] = {
    dispatch: Number(dispatch),
    messageId: messageId || "",
    sender: sender || "",
    updatedAt: new Date().toISOString(),
    source
  };

  if (Array.isArray(state.clearedBranches)) {
    state.clearedBranches = state.clearedBranches.filter(b => b !== canonicalBranch);
  }
  if (state.manualOverrides && state.manualOverrides[canonicalBranch]) {
    delete state.manualOverrides[canonicalBranch];
  }

  await saveDailyState(accountKey, state);
  await syncMessagesTxtFile(accountKey, state);
  return state;
}

export async function handleMessageEdit(accountKey, { targetId, targetKey, newText, sender, fromMe }) {
  const state = await getDailyState(accountKey);
  const cfg = await getRegionalConfig(accountKey);
  const targets = Array.isArray(cfg?.targets) ? cfg.targets : [];
  const extracted = extractAllBranchDispatchesFromText(newText, targets);

  if (extracted.length > 0) {
    const item = extracted[0];
    const canonicalBranch = item.branch;
    const newDispatch = item.dispatch;

    // Check if targetId was previously associated with another branch
    let previousBranch = state.messages[targetId]?.branch;
    if (!previousBranch) {
      for (const [id, m] of Object.entries(state.messages || {})) {
        if (id === targetId || id.includes(targetId) || targetId.includes(id)) {
          previousBranch = m.branch;
          break;
        }
      }
    }

    if (previousBranch && previousBranch !== canonicalBranch) {
      if (state.dispatches[previousBranch]?.messageId === targetId) {
        delete state.dispatches[previousBranch];
      }
    }

    state.messages[targetId] = {
      id: targetId,
      branch: canonicalBranch,
      dispatch: newDispatch,
      text: newText,
      sender: sender || state.messages[targetId]?.sender || "",
      fromMe: Boolean(fromMe),
      timestamp: new Date().toISOString(),
      edited: true
    };

    state.dispatches[canonicalBranch] = {
      dispatch: newDispatch,
      messageId: targetId,
      sender: sender || state.dispatches[canonicalBranch]?.sender || "",
      updatedAt: new Date().toISOString(),
      source: "edit"
    };

    // Remove from clearedBranches if previously cleared
    if (Array.isArray(state.clearedBranches)) {
      state.clearedBranches = state.clearedBranches.filter(b => b !== canonicalBranch);
    }
    // Remove manual override so edited message takes effect
    if (state.manualOverrides && state.manualOverrides[canonicalBranch]) {
      delete state.manualOverrides[canonicalBranch];
    }

    await saveDailyState(accountKey, state);
    await syncMessagesTxtFile(accountKey, state);

    console.log(`[regional-dispatch] ✏️ Successfully applied edit for ${canonicalBranch} -> ${newDispatch}`);

    if (targetKey) {
      const rJid = targetKey.remoteJid || cfg.groupId;
      if (rJid) {
        reactToAccountMessage(accountKey, {
          remoteJid: rJid,
          key: {
            ...targetKey,
            remoteJid: targetKey.remoteJid || rJid
          },
          emoji: "✅"
        }).catch((e) => console.warn(`[regional-dispatch] Edit reaction failed:`, e.message || e));
      }
    }

    checkAllAccountsEarlyCompletion().catch(() => {});
    return true;
  } else {
    // If edited to non-dispatch text, remove previous branch record
    let foundBranch = state.messages[targetId]?.branch;
    if (!foundBranch) {
      for (const [id, m] of Object.entries(state.messages || {})) {
        if (id === targetId || id.includes(targetId) || targetId.includes(id)) {
          foundBranch = m.branch;
          delete state.messages[id];
          break;
        }
      }
    } else {
      delete state.messages[targetId];
    }

    if (foundBranch) {
      if (state.dispatches[foundBranch]?.messageId === targetId || !state.dispatches[foundBranch]?.messageId) {
        delete state.dispatches[foundBranch];
      }
      if (state.manualOverrides && state.manualOverrides[foundBranch]) {
        delete state.manualOverrides[foundBranch];
      }
      if (!Array.isArray(state.clearedBranches)) state.clearedBranches = [];
      if (!state.clearedBranches.includes(foundBranch)) {
        state.clearedBranches.push(foundBranch);
      }
      await saveDailyState(accountKey, state);
      await syncMessagesTxtFile(accountKey, state);
      console.log(`[regional-dispatch] ✏️ Message edited to non-dispatch text. Cleared record for ${foundBranch}`);
      return true;
    }
  }
  return false;
}

export async function handleMessageRevoke(accountKey, { targetId, targetKey }) {
  if (!targetId) return false;
  const state = await getDailyState(accountKey);

  let targetEntry = state.messages[targetId];
  let actualId = targetId;
  if (!targetEntry) {
    for (const [id, m] of Object.entries(state.messages || {})) {
      if (id === targetId || id.includes(targetId) || targetId.includes(id)) {
        targetEntry = m;
        actualId = id;
        break;
      }
    }
  }

  if (targetEntry) {
    const bName = targetEntry.branch;
    const val = targetEntry.dispatch;
    delete state.messages[actualId];

    delete state.dispatches[bName];
    if (state.manualOverrides && state.manualOverrides[bName]) {
      delete state.manualOverrides[bName];
    }
    if (!Array.isArray(state.clearedBranches)) state.clearedBranches = [];
    if (!state.clearedBranches.includes(bName)) {
      state.clearedBranches.push(bName);
    }

    await saveDailyState(accountKey, state);
    await syncMessagesTxtFile(accountKey, state);

    console.log(`[regional-dispatch] 🗑️ Revoked/deleted message ${actualId} for ${bName} (${val}). Record completely removed.`);
    return true;
  }
  return false;
}

export async function setManualBranchDispatch(accountKey, branch, dispatch, source = "inbox") {
  const state = await getDailyState(accountKey);
  const cfg = await getRegionalConfig(accountKey);
  const targets = Array.isArray(cfg?.targets) ? cfg.targets : [];
  const canonicalBranch = findBranchInLine(branch, targets) || branch;

  if (!state.manualOverrides) state.manualOverrides = {};
  if (!state.dispatches) state.dispatches = {};

  const val = Number(dispatch) || 0;
  state.manualOverrides[canonicalBranch] = {
    dispatch: val,
    updatedAt: new Date().toISOString(),
    source
  };
  state.dispatches[canonicalBranch] = {
    dispatch: val,
    updatedAt: new Date().toISOString(),
    source
  };

  // Remove from clearedBranches if previously cleared
  if (Array.isArray(state.clearedBranches)) {
    state.clearedBranches = state.clearedBranches.filter(b => b !== canonicalBranch);
  }

  await saveDailyState(accountKey, state);
  await syncMessagesTxtFile(accountKey, state);
  checkAllAccountsEarlyCompletion().catch(() => {});
  return { ok: true, branch: canonicalBranch, dispatch: val };
}

export async function resetManualBranchDispatch(accountKey, branch) {
  const state = await getDailyState(accountKey);
  const cfg = await getRegionalConfig(accountKey);
  const targets = Array.isArray(cfg?.targets) ? cfg.targets : [];
  const canonicalBranch = findBranchInLine(branch, targets) || branch;

  if (state.manualOverrides && state.manualOverrides[canonicalBranch]) {
    delete state.manualOverrides[canonicalBranch];
  }
  if (state.dispatches && state.dispatches[canonicalBranch]) {
    delete state.dispatches[canonicalBranch];
  }

  if (state.messages) {
    for (const [id, m] of Object.entries(state.messages)) {
      if (m.branch === canonicalBranch) {
        delete state.messages[id];
      }
    }
  }

  if (!Array.isArray(state.clearedBranches)) state.clearedBranches = [];
  if (!state.clearedBranches.includes(canonicalBranch)) {
    state.clearedBranches.push(canonicalBranch);
  }

  await saveDailyState(accountKey, state);
  await syncMessagesTxtFile(accountKey, state);
  console.log(`[regional-dispatch] 🗑️ Reset branch dispatch for ${canonicalBranch}. Branch is now pending.`);
  return { ok: true, branch: canonicalBranch };
}

export async function resetAllBranchDispatches(accountKey) {
  const state = await getDailyState(accountKey);
  const cfg = await getRegionalConfig(accountKey);
  const targets = Array.isArray(cfg?.targets) ? cfg.targets : [];

  state.dispatches = {};
  state.manualOverrides = {};
  state.messages = {};
  state.clearedBranches = targets.map(t => t.branch || t.branch_name).filter(Boolean);

  await saveDailyState(accountKey, state);
  await syncMessagesTxtFile(accountKey, state);
  console.log(`[regional-dispatch] 🗑️ Cleared ALL branch dispatch records for ${accountKey}`);
  return { ok: true, message: "All branch records have been cleared." };
}

async function saveMessage(accountKey, text) {
  const today = getTodayString();
  await ensureDir(path.join(messagesDir, today));
  const clean = String(accountKey || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  const keys = new Set([
    clean,
    clean.startsWith("user-") ? clean.replace(/^user-/, "") : `user-${clean}`
  ]);
  for (const k of keys) {
    const msgFile = path.join(messagesDir, today, `${k}.txt`);
    try {
      await fs.appendFile(msgFile, text + "\n---\n");
    } catch (error) {
      console.error("[regional-dispatch] Error saving message", error);
    }
  }
}

export async function getTodayMessages(accountKey) {
  const today = getTodayString();
  const clean = String(accountKey || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  const candidates = [
    clean,
    clean.startsWith("user-") ? clean.replace(/^user-/, "") : `user-${clean}`,
    accountKey
  ];
  for (const k of candidates) {
    const msgFile = path.join(messagesDir, today, `${k}.txt`);
    try {
      const data = await fs.readFile(msgFile, "utf8");
      if (data && data.trim()) return data;
    } catch {}
  }
  return "";
}

const recentBotReplyIds = new Set();

function isAutomatedSystemMessage(text) {
  const t = String(text || "").trim();
  return (
    t.includes("DOMEX Dispatch Count Reminder") ||
    t.includes("Regional Dispatch Performance") ||
    t.includes("DOMEX Regional Dispatch Assistant") ||
    t.includes("DOMEX Live Dispatch Status") ||
    t.includes("DOMEX Regional Performance Summary") ||
    t.includes("Dispatch Count එක සාර්ථකව") ||
    t.includes("Dispatch Count එක ඉවත් කරන ලදී") ||
    t.startsWith("📊 *Regional Dispatch") ||
    t.startsWith("🚨 *DOMEX Dispatch") ||
    t.startsWith("🤖 *DOMEX") ||
    t.startsWith("📊 *DOMEX") ||
    t.startsWith("📋 *DOMEX") ||
    t.includes("Delete for Everyone කරන ලදී") ||
    t.includes("Reminder පණිවිඩය සාර්ථකව") ||
    t.includes("Performance Report පින්තූරය සාර්ථකව")
  );
}

export function getMessageColomboDateTime(msg) {
  let unixSeconds = 0;
  const raw = msg?.messageTimestamp;
  if (typeof raw === "number") {
    unixSeconds = raw;
  } else if (raw && typeof raw === "object") {
    unixSeconds = Number(raw.low || raw) || 0;
  } else if (typeof raw === "string") {
    unixSeconds = Number(raw) || 0;
  }

  const dateObj = unixSeconds > 1000000000 ? new Date(unixSeconds * 1000) : new Date();

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  const parts = formatter.formatToParts(dateObj);
  const partMap = {};
  for (const p of parts) partMap[p.type] = p.value;

  const dateStr = `${partMap.year}-${partMap.month}-${partMap.day}`;
  const hour = parseInt(partMap.hour || "0", 10);
  const minute = parseInt(partMap.minute || "0", 10);
  const minutes = hour * 60 + minute;

  return { dateStr, hour, minute, minutes, dateObj };
}

export function isMessageInsideCheckInWindow(msg, config) {
  const msgDt = getMessageColomboDateTime(msg);
  const todayStr = getTodayString();

  // 1. Must be sent today in Colombo
  if (msgDt.dateStr !== todayStr) {
    return { ok: false, reason: `Message is from ${msgDt.dateStr}, not today (${todayStr})` };
  }

  // 2. Check window [checkInStartTime, reportSendTime]
  const { h: startH, m: startM } = parseTime(config.checkInStartTime, 16, 0);
  const { h: endH, m: endM } = parseTime(config.reportSendTime, 23, 30);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  let inside = false;
  if (startMinutes <= endMinutes) {
    inside = msgDt.minutes >= startMinutes && msgDt.minutes <= endMinutes;
  } else {
    inside = msgDt.minutes >= startMinutes || msgDt.minutes <= endMinutes;
  }

  if (!inside) {
    const timeFormatted = `${String(msgDt.hour).padStart(2, "0")}:${String(msgDt.minute).padStart(2, "0")}`;
    return { ok: false, reason: `Message sent at ${timeFormatted} is outside check-in window [${config.checkInStartTime} - ${config.reportSendTime}]` };
  }

  return { ok: true, msgDt };
}

function phonesMatch(p1, p2) {
  const d1 = String(p1 || "").replace(/\D/g, "");
  const d2 = String(p2 || "").replace(/\D/g, "");
  if (!d1 || !d2) return false;
  if (d1 === d2) return true;
  const s1 = d1.startsWith("94") && d1.length === 11 ? "0" + d1.slice(2) : d1;
  const s2 = d2.startsWith("94") && d2.length === 11 ? "0" + d2.slice(2) : d2;
  return s1 === s2;
}

async function isPersonalChatAuthorized(senderNumber, config) {
  if (!senderNumber) return false;
  let cleanNumber = String(senderNumber).replace(/\D/g, "");
  if (!cleanNumber) return false;

  // Resolve LID if applicable
  if (cleanNumber.length > 13) {
    const resolved = await resolveLidPhone(cleanNumber);
    if (resolved) cleanNumber = resolved;
  }

  // 1. In config.botAuthorizedNumbers
  if (config.botAuthorizedNumbers && String(config.botAuthorizedNumbers).trim()) {
    const list = String(config.botAuthorizedNumbers)
      .split(",")
      .map(n => n.replace(/\D/g, ""))
      .filter(Boolean);
    if (list.some(authPhone => phonesMatch(authPhone, cleanNumber))) return true;
  } else {
    // Whitelist is not restricted, allow personal chat
    return true;
  }

  // 2. In targets assigned phones
  if (Array.isArray(config.targets)) {
    for (const t of config.targets) {
      const p = String(t.assigned_phone || t.assignedPhone || t.assigned_jid || "").replace(/\D/g, "");
      if (p && phonesMatch(p, cleanNumber)) {
        return true;
      }
    }
  }
  return false;
}

async function resolveActiveConfig(accountKey) {
  // STRICT: Only Regional Manager account can activate regional dispatch
  if (!isRegionalManagerAccount(accountKey)) {
    return { config: null, configKey: null };
  }

  const clean = "default";
  const cfg = await getRegionalConfig(clean);

  if (cfg) {
    return { config: cfg, configKey: clean };
  }

  return { config: null, configKey: clean };
}

// Active bot sessions: sessionKey -> expiresAt timestamp (valid for 5 minutes after .menu)
export const activeBotSessions = new Map();
const BOT_SESSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export function getBotSessionKey(incomingJid, senderJidOrNumber) {
  const isGroup = String(incomingJid || "").endsWith("@g.us");
  const senderNumber = String(senderJidOrNumber || incomingJid || "").split("@")[0].replace(/\D/g, "");
  return isGroup ? `${incomingJid}:${senderNumber}` : incomingJid;
}

async function sendBotReply(accountKey, recipientJid, messageText) {
  try {
    // STRICT: Always send bot replies through the Regional Manager account!
    const activeKey = await getRegionalManagerActiveKey();
    const st = await getAccountWhatsAppStatus(activeKey);
    if (st?.status !== "connected") {
      console.warn(`[regional-dispatch:bot] Cannot send bot reply: Regional WhatsApp (${activeKey}) is not connected.`);
      return;
    }

    console.log(`[regional-dispatch:bot] 📤 Sending bot reply to ${recipientJid} via ${activeKey}`);
    const res = await sendAccountRecipientText(activeKey, {
      phoneNumber: recipientJid,
      message: messageText
    });
    if (res?.messageKey?.id) {
      recentBotReplyIds.add(res.messageKey.id);
      if (recentBotReplyIds.size > 200) {
        const first = recentBotReplyIds.values().next().value;
        recentBotReplyIds.delete(first);
      }
    }
    return res;
  } catch (err) {
    console.error(`[regional-dispatch:bot] Failed to send reply to ${recipientJid}:`, err.message || err);
  }
}

async function handleBotCommand(accountKey, config, incomingJid, msg, rawText) {
  const text = String(rawText || "").trim();
  if (!text) return;

  const isFromMe = Boolean(msg.key?.fromMe);
  const senderJid = msg.key?.participant || msg.participant || incomingJid;
  const senderNumber = senderJid.split("@")[0].replace(/\D/g, "");

  console.log(`[regional-dispatch:bot] 📩 Incoming command from ${incomingJid} (sender: ${senderNumber}, fromMe: ${isFromMe}): "${text}"`);

  // Authorization check:
  if (config.botAuthorizedNumbers && String(config.botAuthorizedNumbers).trim()) {
    const list = String(config.botAuthorizedNumbers)
      .split(",")
      .map(n => n.replace(/\D/g, ""))
      .filter(Boolean);
    const resolved = (senderNumber.length > 13 ? (await resolveLidPhone(senderNumber)) : senderNumber) || senderNumber;
    if (!isFromMe && !list.some(authPhone => phonesMatch(authPhone, resolved))) {
      console.log(`[regional-dispatch:bot] Sender ${senderNumber} (${resolved}) not in botAuthorizedNumbers whitelist. Ignoring.`);
      return;
    }
  }

  const sessionKey = getBotSessionKey(incomingJid, senderJid);
  const now = Date.now();
  const sessionExpiry = activeBotSessions.get(sessionKey) || 0;
  const isSessionActive = sessionExpiry > now;

  const lower = text.toLowerCase().trim();
  const cleanCmd = lower.replace(/^[./!#]/, "").trim();

  // Status text for header
  const statusNote = config.enabled ? "✅ Auto Report Enabled" : "⚠️ Auto Report Disabled";

  // Interactive Bot Menu
  const menuText = `🤖 *DOMEX Regional Dispatch Assistant*
_${statusNote}_

🟢 *Bot Session Activated (ක්‍රියාත්මකයි)*
_(විනාඩි 5ක් ඇතුළත ඔබට අවශ්‍ය අංකය Reply කරන්න)_

1️⃣ *Live Status* (.status)
දැනට ලැබී ඇති සහ නොලැබී ඇති ශාඛා විස්තර බැලීම

2️⃣ *Send Reminder to Group* (.reminder)
Group එකට Dispatch Count Reminder පණිවිඩය යැවීම

3️⃣ *Send Report to Group* (.report)
Group එකට 11:30 PM Performance Report පින්තූරය යැවීම

4️⃣ *View Today's Summary* (.summary)
අද දවසේ කාර්ය සාධන සාරාංශය මෙතැනින් බැලීම

5️⃣ *Delete Last Message* (.delete)
Group එකට අවසන් වරට යැවූ පණිවිඩය Delete for Everyone කිරීම

6️⃣ *View Saved Reports* (.saved)
පසුගිය සුරකින ලද වාර්තා ලැයිස්තුව බැලීම

7️⃣ *Edit/Set Dispatch Count* (.set <ශාඛාව> <ගණන>)
ශාඛාවක Dispatch එක වෙනස් කිරීම
_(උදා: .set Middeniya 450)_

8️⃣ *Reset Branch* (.reset <ශාඛාව>)
ශාඛාවක Dispatch එක ඉවත් කර නැවත Pending කිරීම
_(උදා: .reset Middeniya)_

🛑 *Session අවසන් කිරීමට:* *exit* හෝ *stop* ටයිප් කරන්න.
💡 _ඔබට අවශ්‍ය අංකය (1-8) හෝ Command එක Reply කරන්න._`;

  // 1. Menu & Start Triggers
  const isMenuTrigger = (
    cleanCmd === "menu" ||
    cleanCmd === "help" ||
    cleanCmd === "start" ||
    cleanCmd === "bot" ||
    cleanCmd === "බොට්" ||
    cleanCmd === "hi" ||
    cleanCmd === "hello" ||
    cleanCmd === "hey" ||
    cleanCmd.includes("menu") ||
    cleanCmd.includes("help")
  );

  if (isMenuTrigger) {
    activeBotSessions.set(sessionKey, now + BOT_SESSION_TIMEOUT_MS);
    await sendBotReply(accountKey, incomingJid, menuText);
    return;
  }

  // 2. Exit / Cancel Active Session
  if (cleanCmd === "exit" || cleanCmd === "cancel" || cleanCmd === "stop") {
    if (isSessionActive) {
      activeBotSessions.delete(sessionKey);
      await sendBotReply(accountKey, incomingJid, "🛑 *Bot Session අවසන් කරන ලදී.*\nනැවත අවශ්‍ය වූ විට *.menu* ටයිප් කර Start කරගන්න.");
    }
    return;
  }

  // 3. STRICT: If session is NOT active, bot commands only work after typing .menu
  if (!isSessionActive) {
    if (text.startsWith(".") || text.startsWith("/") || text.startsWith("!")) {
      await sendBotReply(accountKey, incomingJid, "🤖 Bot Commands ක්‍රියාත්මක කිරීමට කරුණාකර පළමුව *.menu* ටයිප් කර Bot Session එක ආරම්භ කරගන්න.");
    }
    // If it was just a raw number (1-8) or chat without active session, ignore completely!
    return;
  }

  // Session IS active: renew session timeout for 5 minutes
  activeBotSessions.set(sessionKey, now + BOT_SESSION_TIMEOUT_MS);

  // 2. Option 1: Live Status
  if (
    cleanCmd === "1" ||
    cleanCmd === "status" ||
    cleanCmd === "live" ||
    cleanCmd.includes("check dispatch") ||
    cleanCmd.includes("live status")
  ) {
    try {
      const live = await getRegionalLiveStatus(accountKey);
      const today = getTodayString();
      let statusMsg = `📊 *DOMEX Live Dispatch Status*\n`;
      statusMsg += `📅 දිනය: *${today}*\n`;
      statusMsg += `🎯 Total Target: *${live.totalTarget.toLocaleString()}*\n`;
      statusMsg += `📦 Dispatched: *${live.totalDispatch.toLocaleString()}*\n`;
      statusMsg += `📈 ප්‍රගතිය: *${live.overallPercentage}%* (${live.submittedCount}/${live.totalBranches} Branches)\n\n`;

      statusMsg += `*✅ ලැබී ඇති ශාඛාවන් (${live.submittedCount}):*\n`;
      if (live.submitted.length > 0) {
        statusMsg += live.submitted.map(b => `• ${b.branch}: *${b.dispatch}* (${b.percentage}%)`).join("\n") + "\n\n";
      } else {
        statusMsg += "කිසිවක් නැත\n\n";
      }

      statusMsg += `*❌ ලැබී නොමැති ශාඛාවන් (${live.unsubmittedCount}):*\n`;
      if (live.unsubmitted.length > 0) {
        statusMsg += live.unsubmitted.map(b => `• ${b.branch} (Target: ${b.target})`).join("\n");
      } else {
        statusMsg += "🎉 සියලුම ශාඛාවන්ගේ Dispatches ලැබී ඇත!";
      }

      await sendBotReply(accountKey, incomingJid, statusMsg);
    } catch (err) {
      await sendBotReply(accountKey, incomingJid, `❌ Error: ${err.message || "Failed to load live status"}`);
    }
    return;
  }

  // 3. Option 2: Send Reminder
  if (
    cleanCmd === "2" ||
    cleanCmd === "reminder" ||
    cleanCmd.includes("send reminder")
  ) {
    try {
      await sendBotReply(accountKey, incomingJid, "⏳ Group එකට Reminder එක යවමින් පවතී...");
      const res = await manualTrigger(accountKey, "reminder");
      if (res?.sent > 0) {
        await sendBotReply(accountKey, incomingJid, "✅ Dispatch Count Reminder පණිවිඩය සාර්ථකව WhatsApp Group එකට යවන ලදී!");
      } else {
        await sendBotReply(accountKey, incomingJid, "ℹ️ සියලුම ශාඛාවන් දැනටමත් Dispatch Counts ලබා දී ඇති බැවින් Reminder එකක් යැවීම අවශ්‍ය නොවේ.");
      }
    } catch (err) {
      await sendBotReply(accountKey, incomingJid, `❌ Reminder Error: ${err.message || "Failed to send reminder"}`);
    }
    return;
  }

  // 4. Option 3: Send Report to Group
  if (
    cleanCmd === "3" ||
    cleanCmd === "report" ||
    cleanCmd.includes("send report")
  ) {
    try {
      await sendBotReply(accountKey, incomingJid, "⏳ Performance Report පින්තූරය සකස් කර Group එකට යවමින් පවතී...");
      const res = await manualTrigger(accountKey, "report");
      if (res?.sent > 0) {
        await sendBotReply(accountKey, incomingJid, "✅ 11:30 PM Performance Report පින්තූරය සාර්ථකව WhatsApp Group එකට යවා පද්ධතිය තුළ සුරකින ලදී!");
      } else {
        await sendBotReply(accountKey, incomingJid, "❌ Report එක යැවීමට නොහැකි විය. Settings සහ WhatsApp Connection එක පරීක්ෂා කරන්න.");
      }
    } catch (err) {
      await sendBotReply(accountKey, incomingJid, `❌ Report Error: ${err.message || "Failed to send report"}`);
    }
    return;
  }

  // 5. Option 4: View Today's Summary
  if (
    cleanCmd === "4" ||
    cleanCmd === "summary" ||
    cleanCmd.includes("view report") ||
    cleanCmd.includes("view summary")
  ) {
    try {
      const live = await getRegionalLiveStatus(accountKey);
      const today = getTodayString();
      let summaryMsg = `📋 *DOMEX Regional Performance Summary*\n`;
      summaryMsg += `📅 දිනය: *${today}*\n`;
      summaryMsg += `━━━━━━━━━━━━━━━━━━\n`;
      summaryMsg += `🎯 Total Target: *${live.totalTarget.toLocaleString()}*\n`;
      summaryMsg += `📦 Total Dispatched: *${live.totalDispatch.toLocaleString()}*\n`;
      summaryMsg += `📊 Achievement: *${live.overallPercentage}%*\n`;
      summaryMsg += `🏢 Submitted: *${live.submittedCount} / ${live.totalBranches}*\n\n`;

      const top = live.submitted.length > 0 ? live.submitted[0] : null;
      const low = live.submitted.length > 0 ? live.submitted[live.submitted.length - 1] : null;

      if (top) {
        summaryMsg += `🏆 *Top Branch:* ${top.branch} (${top.dispatch} - ${top.percentage}%)\n`;
      }
      if (low && low !== top) {
        summaryMsg += `⚠️ *Lowest Branch:* ${low.branch} (${low.dispatch} - ${low.percentage}%)\n`;
      }
      if (live.unsubmitted.length > 0) {
        summaryMsg += `⏳ *Pending Branches:* ${live.unsubmitted.map(u => u.branch).join(", ")}\n`;
      }
      summaryMsg += `━━━━━━━━━━━━━━━━━━`;
      await sendBotReply(accountKey, incomingJid, summaryMsg);
    } catch (err) {
      await sendBotReply(accountKey, incomingJid, `❌ Summary Error: ${err.message || "Failed to generate summary"}`);
    }
    return;
  }

  // 6. Option 5: Delete Last Sent Message from Group
  if (
    cleanCmd === "5" ||
    cleanCmd === "delete" ||
    cleanCmd === "delete last" ||
    cleanCmd === "delete message" ||
    cleanCmd === "delete for everyone"
  ) {
    try {
      const messages = await getRecentSentMessages(accountKey);
      const activeMessage = messages.find(m => m.status !== "deleted");
      if (!activeMessage) {
        await sendBotReply(accountKey, incomingJid, "ℹ️ Delete කිරීමට මෑතකදී Group එකට යැවූ පණිවිඩ කිසිවක් හමු නොවීය.");
        return;
      }

      await sendBotReply(accountKey, incomingJid, `⏳ "${activeMessage.title}" පණිවිඩය Group එකෙන් Delete for Everyone කරමින් පවතී...`);
      await deleteSentMessage(accountKey, activeMessage.id);
      await sendBotReply(accountKey, incomingJid, `🗑️ "${activeMessage.title}" පණිවිඩය WhatsApp Group එකෙන් සාර්ථකව Delete for Everyone කරන ලදී!`);
    } catch (err) {
      await sendBotReply(accountKey, incomingJid, `❌ Delete Error: ${err.message || "Failed to delete message"}`);
    }
    return;
  }

  // 7. Option 6: View Saved Reports (.saved)
  if (
    cleanCmd === "6" ||
    cleanCmd === "saved" ||
    cleanCmd === "reports" ||
    cleanCmd.includes("saved report") ||
    cleanCmd.includes("view saved")
  ) {
    try {
      const reports = await getRegionalDispatchReports(accountKey);
      if (!reports || reports.length === 0) {
        await sendBotReply(accountKey, incomingJid, "📁 තවමත් සුරකින ලද වාර්තා (Saved Reports) කිසිවක් පද්ධතිය තුළ නොමැත.");
        return;
      }

      let msg = `📁 *DOMEX Saved Dispatch Reports*\n\n`;
      msg += `මෑතකදී සුරකින ලද වාර්තා (${Math.min(5, reports.length)}):\n`;
      reports.slice(0, 5).forEach((r, idx) => {
        const perc = r.summary?.overallPercentage != null ? r.summary.overallPercentage : (r.percentage || 0);
        const disp = r.summary?.totalDispatch != null ? r.summary.totalDispatch : (r.totalDispatch || 0);
        const tgt = r.summary?.totalTarget != null ? r.summary.totalTarget : (r.totalTarget || 0);
        msg += `${idx + 1}️⃣ 📅 *${r.date}*: ${disp.toLocaleString()}/${tgt.toLocaleString()} (*${perc}%*)\n`;
      });
      msg += `\n💡 _විශේෂිත දිනයක සම්පූර්ණ විස්තර බැලීමට *.report දිනය* ලෙස එවන්න._\n_(උදා: *.report ${reports[0].date}*)_`;
      await sendBotReply(accountKey, incomingJid, msg);
    } catch (err) {
      await sendBotReply(accountKey, incomingJid, `❌ Error loading saved reports: ${err.message || err}`);
    }
    return;
  }

  // 8. Option 7: Edit / Set Branch Dispatch: e.g. ".set Middeniya 450" or ".edit Middeniya 450"
  if (
    cleanCmd === "7" ||
    cleanCmd.startsWith("set ") ||
    cleanCmd.startsWith("edit ") ||
    cleanCmd.startsWith("dispatch ")
  ) {
    if (cleanCmd === "7") {
      await sendBotReply(accountKey, incomingJid, "ℹ️ Dispatch එක වෙනස් කිරීමට ශාඛාව සහ අගය ටයිප් කරන්න:\n\n*උදාහරණ:*\n• `.set Middeniya 450`\n• `.edit Kahawatta 96`\n• හෝ සරලව `Middeniya 450`");
      return;
    }
    const cleanArgs = cleanCmd.replace(/^(set|edit|dispatch)\s+/i, "").trim();
    const branch = findBranchInLine(cleanArgs, config.targets || []);
    const cleanNumbers = cleanArgs
      .replace(/\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b/g, "")
      .replace(/\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b/g, "")
      .replace(/\b\d{1,2}[:.]\d{2}(?::\d{2})?\s*(?:am|pm)?\b/gi, "");
    const numbers = cleanNumbers.match(/\b\d{1,5}\b/g);

    if (branch && numbers && numbers.length > 0) {
      const count = parseInt(numbers[numbers.length - 1], 10);
      await setManualBranchDispatch(accountKey, branch, count, "inbox");
      const targetObj = (config.targets || []).find(t => (t.branch || t.branch_name) === branch);
      const tgt = targetObj ? Number(targetObj.target) : 0;
      const perc = tgt > 0 ? Math.round((count / tgt) * 100) : 0;
      await sendBotReply(accountKey, incomingJid, `✅ *${branch}* ශාඛාවේ Dispatch Count එක *${count}* ලෙස සාර්ථකව සටහන් විය!\n\n🎯 Target: *${tgt}*\n📊 ප්‍රගතිය: *${perc}%*\n\n_(අද Live Status එකට සහ Report එකට මෙම අගය එකතු කර ඇත)_`);
      return;
    } else {
      await sendBotReply(accountKey, incomingJid, "⚠️ ශාඛාවේ නම හෝ Dispatch අගය හඳුනාගත නොහැකි විය.\nකරුණාකර `.set [ශාඛාව] [අගය]` ලෙස එවන්න.\n_(උදා: `.set Middeniya 450`)_");
      return;
    }
  }

  // 9. Option 8: Reset Branch Dispatch: e.g. ".reset Middeniya", ".delete Middeniya", ".clear Middeniya", or ".reset all" / ".delete all"
  if (
    cleanCmd === "8" ||
    cleanCmd === "reset all" ||
    cleanCmd === "delete all" ||
    cleanCmd === "clear all" ||
    cleanCmd === "reset-all" ||
    cleanCmd === "delete-all" ||
    cleanCmd.startsWith("reset ") ||
    cleanCmd.startsWith("clear ") ||
    (cleanCmd.startsWith("delete ") && !["delete", "delete last", "delete message", "delete for everyone"].includes(cleanCmd))
  ) {
    if (cleanCmd === "8") {
      await sendBotReply(accountKey, incomingJid, "ℹ️ ශාඛාවක Dispatch Count ඉවත් කිරීමට:\n\n*උදාහරණ:*\n• `.reset Middeniya` (හෝ `.delete Middeniya`)\n• `.reset all` (සියලුම ශාඛා Reset කිරීමට)");
      return;
    }
    const branchPart = cleanCmd.replace(/^(reset|delete|clear)\s+/i, "").trim();
    if (branchPart.toLowerCase() === "all" || cleanCmd.includes("all")) {
      await resetAllBranchDispatches(accountKey);
      await sendBotReply(accountKey, incomingJid, "🗑️ අද දිනට අදාළ *සියලුම ශාඛාවන්හි* Dispatch Records සාර්ථකව Reset කරන ලදී! සියලු ශාඛා නැවත Pending තත්ත්වයට පත්විය.");
      return;
    }
    const branch = findBranchInLine(branchPart, config.targets || []);
    if (branch) {
      await resetManualBranchDispatch(accountKey, branch);
      await sendBotReply(accountKey, incomingJid, `🗑️ *${branch}* ශාඛාවේ Dispatch Count එක සාර්ථකව ඉවත් කරන ලදී. ශාඛාව නැවත Pending ලැයිස්තුවට එක් විය.`);
      return;
    } else {
      await sendBotReply(accountKey, incomingJid, `⚠️ "${branchPart}" නමින් ශාඛාවක් හමු නොවීය. කරුණාකර නිවැරදි ශාඛාවේ නම ලබා දෙන්න.\n_(උදා: .reset Middeniya)_`);
      return;
    }
  }

  // 10. Direct input in 1-on-1 private chat: e.g. manager just types "Middeniya 450"
  if (!incomingJid.endsWith("@g.us")) {
    const extracted = extractAllBranchDispatchesFromText(text, config.targets || []);
    if (extracted.length > 0) {
      for (const item of extracted) {
        await setManualBranchDispatch(accountKey, item.branch, item.dispatch, "inbox");
      }
      const item = extracted[0];
      const targetObj = (config.targets || []).find(t => (t.branch || t.branch_name) === item.branch);
      const tgt = targetObj ? Number(targetObj.target) : 0;
      const perc = tgt > 0 ? Math.round((item.dispatch / tgt) * 100) : 0;
      await sendBotReply(accountKey, incomingJid, `✅ *${item.branch}* ශාඛාවේ Dispatch Count එක *${item.dispatch}* ලෙස සාර්ථකව සටහන් විය!\n\n🎯 Target: *${tgt}*\n📊 ප්‍රගතිය: *${perc}%*\n\n_(අද Live Status එකට සහ Report එකට මෙම අගය එකතු කර ඇත)_`);
      return;
    }
  }

  // Handle specific date report query: e.g. ".report 2026-09-11" or "2026-09-11"
  const dateMatch = cleanCmd.match(/\b\d{4}-\d{2}-\d{2}\b/);
  if (dateMatch && (cleanCmd.includes("report") || cleanCmd.includes("saved") || cleanCmd === dateMatch[0])) {
    const targetDate = dateMatch[0];
    try {
      const reports = await getRegionalDispatchReports(accountKey);
      const rep = reports.find(r => r.date === targetDate || r.id === targetDate || r.id === `dispatch-report-${targetDate}`);
      if (!rep) {
        await sendBotReply(accountKey, incomingJid, `⚠️ *${targetDate}* දිනයට අදාළව සුරකින ලද වාර්තාවක් හමු නොවීය.`);
        return;
      }
      const sum = rep.summary || {};
      let msg = `📊 *DOMEX Performance Report - ${targetDate}*\n`;
      msg += `━━━━━━━━━━━━━━━━━━\n`;
      msg += `🎯 Target: *${(sum.totalTarget || 0).toLocaleString()}*\n`;
      msg += `📦 Dispatched: *${(sum.totalDispatch || 0).toLocaleString()}*\n`;
      msg += `📈 Achievement: *${sum.overallPercentage || 0}%*\n\n`;

      if (Array.isArray(rep.items) && rep.items.length > 0) {
        msg += `*ශාඛා විස්තර:*\n`;
        msg += rep.items.map(it => `• ${it.branch}: *${it.dispatch}* / ${it.target} (${it.percentage}%)`).join("\n") + "\n";
      }
      msg += `━━━━━━━━━━━━━━━━━━`;
      await sendBotReply(accountKey, incomingJid, msg);
    } catch (err) {
      await sendBotReply(accountKey, incomingJid, `❌ Error loading report for ${targetDate}: ${err.message || err}`);
    }
    return;
  }

  // If message starts with a dot or slash but didn't match above, send menu guidance
  if (text.startsWith(".") || text.startsWith("/")) {
    await sendBotReply(accountKey, incomingJid, `❓ අවලංගු Command එකකි. කරුණාකර *.menu* ටයිප් කර ලබාගත හැකි Options පරීක්ෂා කරන්න.\n\n${menuText}`);
  }
}

// 1. Subscribe to messages from accountWhatsappService
subscribeToAccountMessages(async (accountKey, { messages, updates, type }) => {
  // STRICT: Only the Regional Manager WhatsApp account handles regional dispatch!
  // Branch accounts must NEVER listen, react, or process messages for regional dispatch!
  if (!isRegionalManagerAccount(accountKey)) {
    return;
  }

  const { config, configKey } = await resolveActiveConfig(accountKey);
  // Ensure this is an active RM account! If non-RM, IGNORE completely!
  if (!config) {
    return;
  }
  const targetGroupId = String(config.groupId || "").trim();

  // Handle Baileys messages.update (revokes & edits)
  if (type === "update" && Array.isArray(updates)) {
    for (const upd of updates) {
      const updKey = upd.key;
      const updId = updKey?.id;
      const updJid = updKey?.remoteJid;
      if (!updId) continue;
      if (targetGroupId && updJid !== targetGroupId) continue;

      const info = extractInfoFromUpdate(upd);
      if (!info) continue;

      if (info.type === "revoke") {
        await handleMessageRevoke(configKey, {
          targetId: info.targetId,
          targetKey: info.targetKey
        });
      } else if (info.type === "edit") {
        await handleMessageEdit(configKey, {
          targetId: info.targetId,
          targetKey: info.targetKey,
          newText: info.text,
          sender: info.participant || updJid,
          fromMe: info.fromMe
        });
      }
    }
    return;
  }

  for (const msg of messages || []) {
    const info = extractMessageInfo(msg);
    if (!info) continue;

    const incomingJid = String(info.remoteJid || "").trim();
    const isGroup = incomingJid.endsWith("@g.us");

    // Case A: Revoke message in group
    if (info.type === "revoke") {
      if (targetGroupId && incomingJid === targetGroupId) {
        await handleMessageRevoke(configKey, {
          targetId: info.targetId,
          targetKey: info.targetKey || info.key
        });
      }
      continue;
    }

    // Case B: Edited message in group
    if (info.type === "edit") {
      if (targetGroupId && incomingJid === targetGroupId) {
        const windowCheck = isMessageInsideCheckInWindow(msg, config);
        if (windowCheck.ok) {
          await handleMessageEdit(configKey, {
            targetId: info.targetId,
            targetKey: info.targetKey || info.key,
            newText: info.text,
            sender: info.participant || incomingJid,
            fromMe: info.fromMe
          });
        }
      }
      continue;
    }

    // Case C: Normal message
    const text = info.text;
    const msgId = info.id;
    if (!text) continue;
    if (msgId && recentBotReplyIds.has(msgId)) continue;
    if (isAutomatedSystemMessage(text)) continue;

    // IF GROUP MESSAGE:
    if (isGroup) {
      // ONLY process the selected group! Ignore all other groups!
      if (!targetGroupId || incomingJid !== targetGroupId) {
        continue;
      }

      // Check if message is a bot command in target group
      const sessionKey = getBotSessionKey(incomingJid, info.participant || incomingJid);
      const isSessionActive = (activeBotSessions.get(sessionKey) || 0) > Date.now();
      const isMenuCommand = /^[./!#]?(menu|help|start|bot|බොට්)\b/i.test(text.trim());
      const isPrefixedCommand = /^[./!#](status|live|reminder|report|summary|delete|saved|set|edit|reset|clear)\b/i.test(text.trim());
      const isSessionOption = isSessionActive && /^(?:[1-8]|exit|cancel|stop)\b/i.test(text.trim());

      if (isMenuCommand || isPrefixedCommand || isSessionOption) {
        console.log(`[regional-dispatch:bot] 🤖 Bot command detected: "${text.slice(0, 30)}" from ${incomingJid}`);
        await handleBotCommand(configKey, config, incomingJid, msg, text);
        continue;
      }

      // If auto report is disabled, don't collect dispatches or react in group
      if (!config.enabled) {
        continue;
      }

      // STRICT TIME WINDOW CHECK:
      // Verify message was sent today and during check-in window [checkInStartTime, reportSendTime]
      const windowCheck = isMessageInsideCheckInWindow(msg, config);
      if (!windowCheck.ok) {
        // Outside time period -> completely ignore for dispatch collection & do NOT react!
        continue;
      }

      // STRICT FORMAT PARSING:
      const targets = Array.isArray(config.targets) ? config.targets : [];
      const extracted = extractAllBranchDispatchesFromText(text, targets);

      // ONLY react and collect if valid branch dispatches were captured!
      if (extracted.length > 0) {
        console.log(`[regional-dispatch] 📥 Captured ${extracted.length} branch dispatch(es) from ${info.participant || incomingJid}: "${text.slice(0, 70)}"`);
        for (const item of extracted) {
          await recordBranchDispatch(configKey, {
            messageId: msgId,
            branch: item.branch,
            dispatch: item.dispatch,
            text,
            sender: info.participant || incomingJid,
            fromMe: info.fromMe,
            source: "group"
          });
        }

        // React ONLY when valid branch dispatch is captured!
        try {
          await reactToAccountMessage(configKey, {
            remoteJid: incomingJid,
            key: msg.key,
            emoji: "✅"
          });
          console.log(`[regional-dispatch] ✅ Reacted to message from ${info.participant || incomingJid} for branch(es): ${extracted.map(e => e.branch).join(", ")}`);
        } catch (reactErr) {
          console.warn("[regional-dispatch] Reaction error:", reactErr.message || reactErr);
        }

        checkAllAccountsEarlyCompletion().catch(() => {});
      }
      // If not a valid dispatch format, do nothing and DO NOT react!
      continue;
    }

    // IF DIRECT MESSAGE (1-on-1 personal chat):
    if (!isGroup) {
      const isFromMe = Boolean(info.fromMe);
      const senderJid = info.participant || incomingJid;
      const senderNumber = senderJid.split("@")[0].replace(/\D/g, "");

      // Only allow if message is from the RM themselves, or from authorized personal numbers / branch phones!
      const isAuthorized = isFromMe || await isPersonalChatAuthorized(senderNumber, config);
      if (!isAuthorized) {
        // Do not respond to random personal chats
        continue;
      }

      // Check if this personal chat is a bot command or menu
      const sessionKey = getBotSessionKey(incomingJid, senderNumber);
      const isSessionActive = (activeBotSessions.get(sessionKey) || 0) > Date.now();
      const isMenuCommand = /^[./!#]?(menu|help|start|bot|බොට්|hi|hello|hey)\b/i.test(text.trim());
      const isPrefixedCommand = /^[./!#](status|live|reminder|report|summary|delete|saved|set|edit|reset|clear)\b/i.test(text.trim());
      const isSessionOption = isSessionActive && /^(?:[1-8]|exit|cancel|stop)\b/i.test(text.trim());

      if (isMenuCommand || isPrefixedCommand || isSessionOption) {
        console.log(`[regional-dispatch:bot] 🤖 Bot command detected in DM: "${text.slice(0, 30)}" from ${incomingJid}`);
        await handleBotCommand(configKey, config, incomingJid, msg, text);
        continue;
      }

      // Check if this personal chat is submitting a direct dispatch
      const windowCheck = isMessageInsideCheckInWindow(msg, config);
      const targets = Array.isArray(config.targets) ? config.targets : [];
      let extracted = extractAllBranchDispatchesFromText(text, targets);

      // If branch manager replied just with a number (e.g. "80", "120", "dispatch 80"):
      // Automatically detect their assigned branch from their phone number!
      if (extracted.length === 0 && !isFromMe) {
        let assignedBranch = null;
        let assignedTarget = 0;
        const senderInt = toInternationalPhone(senderNumber);
        for (const t of targets) {
          const p = toInternationalPhone(t.assigned_phone || t.assignedPhone || t.assigned_jid || "");
          if (p && senderInt && p === senderInt) {
            assignedBranch = t.branch || t.branch_name;
            assignedTarget = Number(t.target) || 0;
            break;
          }
        }

        if (assignedBranch) {
          const cleanText = text.replace(/[*_~`]/g, " ").trim();
          const numMatch = cleanText.match(/^\s*(?:(?:dispatch|count|dis|dp|qty|pcs|total|ada)\s*[:=-]?\s*)?(\d{1,5})(?:\s*(?:pcs|pkts|parcels|items)?\s*)?$/i);
          if (numMatch && numMatch[1]) {
            const count = parseInt(numMatch[1], 10);
            if (!isNaN(count) && count >= 0) {
              extracted = [{ branch: assignedBranch, dispatch: count }];
            }
          }
        }
      }

      if (windowCheck.ok && extracted.length > 0) {
        for (const item of extracted) {
          await recordBranchDispatch(configKey, {
            messageId: msgId,
            branch: item.branch,
            dispatch: item.dispatch,
            text,
            sender: senderJid,
            fromMe: info.fromMe,
            source: "dm"
          });
        }
        try {
          await reactToAccountMessage(configKey, {
            remoteJid: incomingJid,
            key: msg.key,
            emoji: "✅"
          });
        } catch (e) {}

        const item = extracted[0];
        const targetObj = targets.find(t => (t.branch || t.branch_name) === item.branch);
        const tgt = targetObj ? Number(targetObj.target) : 0;
        const perc = tgt > 0 ? Math.round((item.dispatch / tgt) * 100) : 0;

        await sendBotReply(configKey, incomingJid, `✅ *${item.branch}* ශාඛාවේ Dispatch Count එක *${item.dispatch}* ලෙස සාර්ථකව සටහන් විය!\n\n🎯 Target: *${tgt}*\n📊 ප්‍රගතිය: *${perc}%*\n\n_(ස්තූතියි! අද දින වාර්තාවට මෙම අගය එකතු කර ඇත)_`);

        checkAllAccountsEarlyCompletion().catch(() => {});
        continue;
      }

      // If user typed a dot command or other non-dispatch text in DM:
      if (text.startsWith(".") || text.startsWith("/") || text.startsWith("!")) {
        await handleBotCommand(configKey, config, incomingJid, msg, text);
      }
    }
  }
});

const FREE_OPENROUTER_MODELS = [
  "nvidia/nemotron-3-ultra:free",
  "poolside/laguna-s-2.1:free",
  "nvidia/nemotron-3.5-lightning:free",
  "inclusionai/ling-3.0-flash-fin:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "google/gemini-2.0-flash-exp:free",
  "google/gemini-2.0-flash-thinking-exp:free"
];

async function parseWithOpenRouter(apiKey, text, branchNames) {
  if (!text || !text.trim()) return [];
  const cleanKey = String(apiKey || "").trim();
  if (!cleanKey) return [];

  const prompt = `Extract dispatch counts from the following text.
Branches available: ${branchNames.join(", ")}

IMPORTANT: Branch names in messages may have minor spelling variations (for example: "Kahawatta" for "Kahawatte", "Ratnapura" for "Rathnapura", "Eheliyagoda" for "Ehaliyagoda"). Map each branch to the exact branch name from the available branches list.

Text:
${text}

Return a valid JSON array exactly matching this format: [{"branch": "Branch Name", "dispatch": 123}]. If none found, return []. Do NOT include markdown blocks.`;

  for (const model of FREE_OPENROUTER_MODELS) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${cleanKey}`
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          max_tokens: 1500
        })
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.warn(`[regional-dispatch] Free model ${model} failed (${res.status}): ${errText.slice(0, 100)}`);
        continue;
      }

      const data = await res.json();
      let resultText = data?.choices?.[0]?.message?.content || "[]";
      resultText = resultText.replace(/```json/gi, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(resultText);
      if (Array.isArray(parsed)) {
        console.log(`[regional-dispatch] Successfully parsed dispatch with free model: ${model}`);
        return parsed;
      }
    } catch (error) {
      console.warn(`[regional-dispatch] Model ${model} error:`, error.message);
    }
  }

  console.error("[regional-dispatch] All free OpenRouter models exhausted.");
  return [];
}

// Helper to find chromium path across Linux VPS / EC2 and Windows
export async function findBrowserExecutable() {
  const candidates = [
    process.env.DOMEX_BROWSER_PATH,
    process.env.CHROME_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/snap/bin/chromium",
    "/usr/bin/brave-browser",
    "/usr/bin/microsoft-edge-stable",
    "/usr/bin/microsoft-edge",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter(Boolean);

  for (const p of candidates) {
    try {
      await fs.access(p);
      return p;
    } catch (e) {}
  }
  return undefined;
}

// 2. Playwright Renderer
export async function renderDispatchImage(date, rows, summary, userName, userRole) {
  const execPath = await findBrowserExecutable();
  if (!execPath) {
    console.error("[regional-dispatch] ⚠️ No Chrome/Chromium executable found! Please install Google Chrome or Chromium (e.g. sudo apt install -y chromium-browser or google-chrome-stable).");
    throw new Error("No browser executable found for rendering dispatch image.");
  }

  let browser = null;
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: execPath,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-zygote"
      ],
    });

    const page = await browser.newPage({ 
      viewport: { width: 600, height: 1600 },
      deviceScaleFactor: 2.5 
    });
    
    // 1. Load DOMEX logo from disk as base64
    let domexLogoBase64 = "";
    const possibleLogoPaths = [
      path.resolve("public", "report-assets", "domex-logo-new.jpg"),
      path.resolve("dist", "report-assets", "domex-logo-new.jpg"),
      path.resolve("public", "report-assets", "domex-logo.png"),
      path.resolve("dist", "report-assets", "domex-logo.png")
    ];
    for (const p of possibleLogoPaths) {
      try {
        const buf = await fs.readFile(p);
        const mime = p.endsWith(".png") ? "image/png" : "image/jpeg";
        domexLogoBase64 = `data:${mime};base64,${buf.toString("base64")}`;
        break;
      } catch (e) {}
    }

    // 2. Clean formatted user name and role
    let cleanUser = String(userName || "Regional Manager").trim();
    if (cleanUser.includes("@")) {
      cleanUser = cleanUser.split("@")[0];
    }
    cleanUser = cleanUser.charAt(0).toUpperCase() + cleanUser.slice(1);

    let cleanRole = String(userRole || "Regional Manager").trim();
    if (cleanRole.toLowerCase() === "regional_manager" || cleanRole.toLowerCase() === "regional manager") {
      cleanRole = "Regional Manager";
    } else if (cleanRole.toLowerCase() === "superadmin") {
      cleanRole = "Super Admin";
    }

    // 3. Clean SVG icons (so Linux headless chromium never shows missing glyph boxes)
    const userIconSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6b21a8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -1px; margin-right: 4px; display: inline-block;"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
    const trophySvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#065f46" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 3px; display: inline-block;"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>`;
    const alertSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9f1239" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 3px; display: inline-block;"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;

    const rowsHtml = rows.map((r, idx) => {
      const perc = r.percentage;
      const bg = idx % 2 === 0 ? "#ffffff" : "#f8fafc";
      const pillBg = perc >= 100 ? "#d1fae5" : perc >= 70 ? "#fef3c7" : "#ffe4e6";
      const pillCol = perc >= 100 ? "#065f46" : perc >= 70 ? "#92400e" : "#9f1239";
      const barCol = perc >= 100 ? "#10b981" : perc >= 70 ? "#f59e0b" : "#f43f5e";
      
      return `
        <tr style="background-color: ${bg}; border-top: 1px solid #f1f5f9; font-weight: 700;">
          <td style="padding: 10px 6px; color: #94a3b8; font-weight: 900; text-align: center; vertical-align: middle; overflow: hidden;">#${idx + 1}</td>
          <td style="padding: 10px 8px; color: #071537; font-weight: 900; text-align: left; vertical-align: middle; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 140px;">${r.branch}</td>
          <td style="padding: 10px 6px; text-align: right; color: #64748b; vertical-align: middle; overflow: hidden;">${r.target}</td>
          <td style="padding: 10px 6px; text-align: right; color: #1e3a8a; font-weight: 900; vertical-align: middle; overflow: hidden;">${r.dispatch}</td>
          <td style="padding: 10px 8px; text-align: center; vertical-align: middle; overflow: hidden;">
            <div style="height: 8px; width: 100%; background-color: #e2e8f0; border-radius: 9999px; overflow: hidden; margin: 0 auto;">
              <div style="height: 100%; border-radius: 9999px; width: ${Math.min(100, perc)}%; background-color: ${barCol};"></div>
            </div>
          </td>
          <td style="padding: 10px 6px; text-align: center; vertical-align: middle; overflow: hidden;">
            <span style="display: inline-block; width: 54px; padding: 3px 4px; border-radius: 6px; text-align: center; font-weight: 900; font-size: 11px; line-height: 15px; overflow: hidden; background-color: ${pillBg}; color: ${pillCol};">${perc}%</span>
          </td>
        </tr>
      `;
    }).join("");

    const summaryHtml = `
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 16px; box-sizing: border-box;">
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 12px; text-align: center; box-sizing: border-box;">
          <p style="font-size: 10px; font-weight: 900; text-transform: uppercase; color: #64748b; margin: 0;">Total Target</p>
          <p style="font-size: 24px; font-weight: 900; color: #071537; margin: 4px 0 0 0; line-height: 1;">${summary.totalTarget || 0}</p>
        </div>
        <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 16px; padding: 12px; text-align: center; box-sizing: border-box;">
          <p style="font-size: 10px; font-weight: 900; text-transform: uppercase; color: #1e40af; margin: 0;">Dispatched</p>
          <p style="font-size: 24px; font-weight: 900; color: #1e3a8a; margin: 4px 0 0 0; line-height: 1;">${summary.totalDispatch || 0}</p>
        </div>
        <div style="background-color: ${summary.overallPercentage >= 100 ? "#ecfdf5" : summary.overallPercentage >= 70 ? "#fffbeb" : "#fff1f2"}; color: ${summary.overallPercentage >= 100 ? "#065f46" : summary.overallPercentage >= 70 ? "#92400e" : "#9f1239"}; border: 1px solid ${summary.overallPercentage >= 100 ? "#a7f3d0" : summary.overallPercentage >= 70 ? "#fde68a" : "#fecdd3"}; border-radius: 16px; padding: 12px; text-align: center; box-sizing: border-box;">
          <p style="font-size: 10px; font-weight: 900; text-transform: uppercase; margin: 0;">Achievement</p>
          <p style="font-size: 24px; font-weight: 900; margin: 4px 0 0 0; line-height: 1;">${summary.overallPercentage || 0}%</p>
        </div>
      </div>
    `;

    const highlightsHtml = `
      <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; font-size: 12px; font-weight: 700;">
        ${summary.topBranch ? `
          <span style="display: inline-flex; align-items: center; gap: 4px; background-color: #d1fae5; color: #065f46; padding: 4px 10px; border-radius: 12px; white-space: nowrap;">
            ${trophySvg} Top: <strong>${summary.topBranch.branch}</strong> (${summary.topBranch.percentage}%)
          </span>
        ` : ''}
        ${summary.lowestBranch ? `
          <span style="display: inline-flex; align-items: center; gap: 4px; background-color: #ffe4e6; color: #9f1239; padding: 4px 10px; border-radius: 12px; white-space: nowrap;">
            ${alertSvg} Needs Attention: <strong>${summary.lowestBranch.branch}</strong> (${summary.lowestBranch.percentage}%)
          </span>
        ` : ''}
      </div>
    `;

    const logoHtml = domexLogoBase64
      ? `<img src="${domexLogoBase64}" alt="DOMEX" style="height: 48px; width: auto; max-width: 120px; object-fit: contain; display: block; flex-shrink: 0;" />`
      : `<div style="height: 48px; width: 64px; background: #991b1b; color: #ffffff; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 13px; letter-spacing: 1px;">DOMEX</div>`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            * { box-sizing: border-box !important; letter-spacing: normal !important; }
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              background-color: #ffffff !important;
              color: #071537 !important;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
              -webkit-font-smoothing: antialiased;
              -moz-osx-font-smoothing: grayscale;
              display: inline-block;
            }
            table {
              border-collapse: collapse !important;
              table-layout: fixed !important;
              width: 100% !important;
            }
          </style>
        </head>
        <body>
          <div id="capture-card" style="width: 560px; min-width: 560px; margin: 0; background-color: #ffffff; color: #071537; border: 1px solid #e2e8f0; border-radius: 24px; padding: 24px; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.05);">
            
            <div style="display: flex; align-items: flex-start; justify-content: space-between; border-bottom: 2px solid #f1f5f9; padding-bottom: 16px; box-sizing: border-box;">
              <div style="display: flex; align-items: flex-start; gap: 12px; flex: 1; min-width: 0;">
                ${logoHtml}
                <div style="flex: 1; min-width: 0;">
                  <h2 style="font-size: 18px; font-weight: 900; text-transform: uppercase; color: #071537; margin: 0 0 2px 0; line-height: 1.2; white-space: nowrap;">Regional Dispatch Performance</h2>
                  <p style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: #6d28d9; margin: 0 0 6px 0;">Daily Courier Branch Analytics</p>
                  <div style="margin-top: 6px;">
                    <div style="display: inline-block; background-color: #f5f3ff; color: #6b21a8; padding: 4px 12px; border-radius: 8px; font-size: 11px; font-weight: 800; border: 1px solid #ddd6fe; line-height: 18px; white-space: nowrap;">
                      ${userIconSvg} Prepared by: <strong style="color: #4c1d95;">${cleanUser}</strong> (${cleanRole})
                    </div>
                  </div>
                </div>
              </div>
              <div style="text-align: right; min-width: 100px; flex-shrink: 0; margin-left: 8px;">
                <p style="font-size: 10px; font-weight: 900; text-transform: uppercase; color: #94a3b8; margin: 0;">Report Date</p>
                <p style="font-size: 15px; font-weight: 900; color: #1e293b; margin: 3px 0 0 0; line-height: 1.2;">${date}</p>
              </div>
            </div>

            ${summaryHtml}
            ${highlightsHtml}

            <div style="margin-top: 14px; border: 1px solid #f1f5f9; border-radius: 16px; overflow: hidden; box-sizing: border-box;">
              <table style="width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 12px; line-height: 1.3;">
                <colgroup>
                  <col style="width: 44px;" />
                  <col style="width: 140px;" />
                  <col style="width: 60px;" />
                  <col style="width: 62px;" />
                  <col style="width: 118px;" />
                  <col style="width: 76px;" />
                </colgroup>
                <thead>
                  <tr style="background-color: #f8fafc; color: #64748b; font-weight: 900; text-transform: uppercase; font-size: 10px;">
                    <th style="padding: 10px 6px; text-align: center; vertical-align: middle; overflow: hidden;">Rank</th>
                    <th style="padding: 10px 8px; text-align: left; vertical-align: middle; overflow: hidden;">Branch</th>
                    <th style="padding: 10px 6px; text-align: right; vertical-align: middle; overflow: hidden;">Target</th>
                    <th style="padding: 10px 6px; text-align: right; vertical-align: middle; overflow: hidden;">Actual</th>
                    <th style="padding: 10px 8px; text-align: center; vertical-align: middle; overflow: hidden;">Progress</th>
                    <th style="padding: 10px 6px; text-align: center; vertical-align: middle; overflow: hidden;">Achv %</th>
                  </tr>
                </thead>
                <tbody>
                  ${rowsHtml}
                </tbody>
              </table>
            </div>

            <div style="display: flex; align-items: center; justify-content: space-between; border-top: 1px solid #f1f5f9; padding-top: 10px; margin-top: 14px; font-size: 10px; font-weight: 700; color: #94a3b8;">
              <span>Domestic Express (PVT) Ltd • Regional Management</span>
              <span>Confidential • Internal Only</span>
            </div>

          </div>
        </body>
      </html>
    `;

    await page.setContent(html, { waitUntil: "load", timeout: 15000 });
    const element = await page.$("#capture-card");
    if (!element) {
      throw new Error("#capture-card element not found in HTML");
    }
    
    const buffer = await element.screenshot({ type: "png", omitBackground: false });
    return `data:image/png;base64,${buffer.toString("base64")}`;
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (closeErr) {
        console.warn("[regional-dispatch] Warning closing browser:", closeErr.message || closeErr);
      }
    }
  }
}

// 3. Cron Schedules
async function runRegionalAutomation(mode = "reminder", manualAccountKey = null, customTargets = null) {
  await ensureDir(dataDir);

  // STRICT: Regional automation strictly operates for the Regional Manager account ("default")
  const config = await getRegionalConfig("default");
  if (!config || !config.enabled) {
    if (manualAccountKey) throw new Error("Automation is disabled. Please check 'Enable Auto Report' and save settings.");
    return { ok: false, message: "Automation disabled" };
  }
  if (!config.groupId) {
    if (manualAccountKey) throw new Error("No WhatsApp Group selected. Please select a group and save settings.");
    return { ok: false, message: "No group configured" };
  }

  // Resolve connected active key exclusively among Regional Manager sockets!
  const activeKey = await getRegionalManagerActiveKey();
  const st = await getAccountWhatsAppStatus(activeKey);
  if (st?.status !== "connected") {
    if (manualAccountKey) throw new Error("Regional Manager WhatsApp is disconnected. Please scan QR code in Regional Settings to connect.");
    console.warn(`[regional-dispatch] Regional WhatsApp (${activeKey}) is disconnected. Skipping automation.`);
    return { ok: false, message: "WhatsApp disconnected" };
  }

  let totalSent = 0;
  const seenGroupIds = new Set();

    let targets = (Array.isArray(customTargets) && customTargets.length > 0)
      ? customTargets
      : (Array.isArray(config.targets) && config.targets.length > 0 ? config.targets : []);

    // Persist targets to config.targets if provided
    if (Array.isArray(customTargets) && customTargets.length > 0) {
      const existingMap = new Map((config.targets || []).map(t => [t.branch || t.branch_name, t]));
      config.targets = customTargets.map(t => {
        const bName = t.branch || t.branch_name;
        const prev = existingMap.get(bName) || {};
        return {
          branch: bName,
          target: Number(t.target) || 0,
          assigned_name: t.assigned_name !== undefined ? t.assigned_name : (prev.assigned_name || ""),
          assigned_phone: t.assigned_phone !== undefined ? t.assigned_phone : (prev.assigned_phone || ""),
          assigned_jid: t.assigned_jid !== undefined ? t.assigned_jid : (prev.assigned_jid || ""),
          assigned_lid: t.assigned_lid !== undefined ? t.assigned_lid : (prev.assigned_lid || "")
        };
      });
      await saveRegionalConfig(activeKey, config);
    }

    const dailyState = await getDailyState(activeKey);
    const clearedSet = new Set(Array.isArray(dailyState.clearedBranches) ? dailyState.clearedBranches : []);
    const submittedMap = {};

    // 1. From daily state dispatches (captured group messages, edits)
    for (const [b, d] of Object.entries(dailyState.dispatches || {})) {
      if (d?.dispatch != null) {
        const canonical = findBranchInLine(b, targets) || b;
        if (!clearedSet.has(canonical)) {
          submittedMap[canonical] = Number(d.dispatch);
        }
      }
    }

    // 2. From daily state manual overrides (set via inbox or API)
    for (const [b, d] of Object.entries(dailyState.manualOverrides || {})) {
      if (d?.dispatch != null) {
        const canonical = findBranchInLine(b, targets) || b;
        if (!clearedSet.has(canonical)) {
          submittedMap[canonical] = Number(d.dispatch);
        }
      }
    }

    const rawText = await getTodayMessages(activeKey);
    const branchNames = targets.map(t => t.branch || t.branch_name).filter(Boolean);
    const pendingBranchNames = branchNames.filter(b => submittedMap[b] == null && !clearedSet.has(b));

    // Parse using OpenRouter
    let extractedData = [];
    if (config.geminiApiKey && rawText.trim() && pendingBranchNames.length > 0) {
      extractedData = await parseWithOpenRouter(config.geminiApiKey, rawText, pendingBranchNames);
    }

    for (const item of extractedData) {
      if (item.branch && item.dispatch != null) {
        const val = Number(item.dispatch);
        if (!isNaN(val)) {
          // Find canonical target branch via fuzzy matcher
          const canonical = findBranchInLine(item.branch, targets) || item.branch;
          if (submittedMap[canonical] == null && !clearedSet.has(canonical)) {
            submittedMap[canonical] = val;
          }
        }
      }
    }

    // Local Regex Fallback with Fuzzy Matching for all lines
    if (rawText.trim()) {
      for (const line of rawText.split("\n")) {
        const fuzzyBranch = findBranchInLine(line, targets);
        if (fuzzyBranch && !clearedSet.has(fuzzyBranch) && submittedMap[fuzzyBranch] == null) {
          const numbers = line.match(/\b\d{1,5}\b/g);
          if (numbers && numbers.length > 0) {
            const val = parseInt(numbers[numbers.length - 1], 10);
            if (!isNaN(val)) {
              submittedMap[fuzzyBranch] = val;
            }
          }
        }
      }
    }

    const targetMap = {};
    for (const t of targets) {
      targetMap[t.branch || t.branch_name] = t.target;
    }

    const unsubmitted = targets.filter(t => submittedMap[t.branch || t.branch_name] == null).map(t => t.branch || t.branch_name);
    const submitted = targets.filter(t => submittedMap[t.branch || t.branch_name] != null).map(t => t.branch || t.branch_name);

    if (mode === "reminder") {
      if (unsubmitted.length === 0) {
        console.log(`[regional-dispatch] All branches already submitted (${submitted.length}). Skipping reminder for ${config.groupId}`);
        return { ok: true, sent: 0, message: "All branches have already submitted their dispatch counts. No reminder needed." };
      }

      // Helper to resolve LID to real phone number from reverse mapping files
      async function resolveLidPhone(lidUser) {
        const clean = String(lidUser || "").replace(/@.*$/, "").replace(/:\d+$/, "").replace(/\D/g, "");
        if (!clean) return null;
        const candidateDirs = [
          path.resolve("backend", "data", "whatsapp-auth"),
          path.resolve("backend", "data", "whatsapp-meter-auth"),
          path.resolve("backend", "data", "whatsapp-accounts", activeKey)
        ];
        for (const dir of candidateDirs) {
          try {
            const revFile = path.join(dir, `lid-mapping-${clean}_reverse.json`);
            const raw = await fs.readFile(revFile, "utf8");
            const phone = JSON.parse(raw);
            if (phone && String(phone).length >= 9) return String(phone).replace(/\D/g, "");
          } catch (e) {}
        }
        return null;
      }

      // Collect unsubmitted target items with assigned members
      const unsubmittedTargets = targets.filter(t => submittedMap[t.branch || t.branch_name] == null);
      const mentionJids = [];
      const unsubmittedLines = await Promise.all(unsubmittedTargets.map(async (t) => {
        const bName = t.branch || t.branch_name;
        const tgt = targetMap[bName] || 0;
        let phone = t.assigned_phone || t.assignedPhone || (t.assigned_jid ? t.assigned_jid.split("@")[0] : null);
        let jid = t.assigned_jid || t.assignedJid;
        let lid = t.assigned_lid || t.assignedLid;

        if (phone && String(phone).replace(/\D/g, "").length > 13) {
          const resolved = await resolveLidPhone(phone);
          if (resolved) {
            if (!lid) lid = `${phone}@lid`;
            phone = resolved;
            jid = `${resolved}@s.whatsapp.net`;
          }
        }

        const cleanPhone = toInternationalPhone(phone);
        if (cleanPhone && (!jid || !jid.endsWith("@s.whatsapp.net"))) {
          jid = `${cleanPhone}@s.whatsapp.net`;
        }

        if (jid && !mentionJids.includes(jid)) {
          mentionJids.push(jid);
        }
        if (lid && !mentionJids.includes(lid)) {
          mentionJids.push(lid);
        }

        const assignedName = (t.assigned_name && t.assigned_name !== t.assigned_phone && t.assigned_name !== cleanPhone)
          ? String(t.assigned_name).trim()
          : "";

        let tagStr = "";
        if (cleanPhone) {
          tagStr = ` 👉 @${cleanPhone}${assignedName ? ` (${assignedName})` : ""}`;
        } else if (assignedName) {
          tagStr = ` 👉 (${assignedName})`;
        }

        return `❌ *${bName}* (Target: ${tgt})${tagStr}`;
      }));

      const reminderDeadline = config.reportSendTime ? `රාත්‍රී ${config.reportSendTime}` : "රාත්‍රී 11.30";
      const reminderMsg = 
`🚨 *DOMEX Dispatch Count Reminder*

සුභ සන්ධ්‍යාවක්! කරුණාකර පහත ශාඛාවන් ${reminderDeadline} ට පෙර ඔබගේ Dispatch Counts ලබා දෙන්න:

*ලබා දී නොමැති ශාඛාවන් (${unsubmitted.length}):*
${unsubmittedLines.join("\n")}

*ලබා දී ඇති ශාඛාවන් (${submitted.length}/${targets.length}):*
${submitted.length > 0 ? submitted.map(b => `✅ *${b}*: ${submittedMap[b]}`).join("\n") : "කිසිවක් නැත"}

📌 Format: *[ශාඛාව] [ගණන]* (උදා: *Middeniya 80*)`;
      
      const sendRes = await sendAccountRecipientText(activeKey, { 
        phoneNumber: config.groupId, 
        message: reminderMsg,
        mentions: mentionJids
      });
      console.log(`[regional-dispatch] Sent group reminder to ${config.groupId} via ${activeKey} (mentions: ${mentionJids.length})`);
      totalSent++;
      seenGroupIds.add(config.groupId);

      // Send personalized WhatsApp reminder to each unsubmitted branch's assigned person
      const sentPersonalMessages = [];
      for (const t of unsubmittedTargets) {
        const bName = t.branch || t.branch_name;
        const tgt = targetMap[bName] || 0;
        let targetPhone = t.assigned_phone || t.assignedPhone || t.assigned_jid || t.assignedJid;
        if (targetPhone && String(targetPhone).replace(/\D/g, "").length > 13) {
          const resolved = await resolveLidPhone(targetPhone, activeKey);
          if (resolved) targetPhone = resolved;
        }
        const cleanPhone = toInternationalPhone(targetPhone);
        if (cleanPhone) {
          const assignedName = (t.assigned_name && t.assigned_name !== t.assigned_phone && t.assigned_name !== cleanPhone)
            ? String(t.assigned_name).trim()
            : "";

          const personalMsg = 
`🚨 *DOMEX Dispatch Reminder*

සුභ සන්ධ්‍යාවක්${assignedName ? ` ${assignedName}` : ""}!
ඔබ භාරව සිටින *${bName}* ශාඛාවේ අද දින Dispatch Count එක මෙතෙක් ලැබී නොමැත.

🏢 *ශාඛාව:* ${bName}
🎯 *දෛනික Target එක:* ${tgt}
⏰ *අවසන් වේලාව:* ${reminderDeadline} ට පෙර

කරුණාකර ඔබගේ Dispatch Count එක මෙම Chat එකට (උදා: *${bName} 80* හෝ *80*) Reply කරන්න, නැතහොත් Regional WhatsApp Group එකට යොමු කරන්න.

ස්තූතියි!
— Regional Management (DOMEX Express)`;

          try {
            const pSendRes = await sendAccountRecipientText(activeKey, {
              phoneNumber: cleanPhone,
              message: personalMsg
            });
            console.log(`[regional-dispatch] 👤 Sent personal reminder to ${bName} (${cleanPhone} - ${assignedName || 'assigned'})`);
            if (pSendRes) {
              const pKey = pSendRes.primaryKey || pSendRes.messageKey;
              const pKeys = pSendRes.messageKeys || (pKey ? [pKey] : []);
              sentPersonalMessages.push({
                branch: bName,
                phone: cleanPhone,
                name: assignedName,
                messageKey: pKey,
                messageKeys: pKeys
              });

              // Also record individual personal_reminder so user can revoke it separately if desired
              await recordSentMessage(activeKey, {
                type: "personal_reminder",
                title: `Reminder - ${bName}`,
                recipientPhone: cleanPhone,
                branch: bName,
                messageKey: pKey,
                messageKeys: pKeys,
                sentAt: new Date().toISOString(),
                preview: personalMsg.slice(0, 140) + "..."
              });
            }
          } catch (pErr) {
            console.warn(`[regional-dispatch] Failed personal reminder to ${bName} (${cleanPhone}):`, pErr.message || pErr);
          }
        }
      }

      // Record sent message
      await recordSentMessage(activeKey, {
        type: "reminder",
        title: `Reminder (${unsubmitted.length} pending)`,
        groupId: config.groupId,
        messageKey: sendRes?.messageKey,
        messageKeys: sendRes?.messageKeys,
        personalMessages: sentPersonalMessages,
        sentAt: new Date().toISOString(),
        preview: reminderMsg.slice(0, 140) + "..."
      });
    } 
    else if (mode === "report") {
      const dateStr = getTodayString();
      const rows = [];
      let totalTarget = 0;
      let totalDispatch = 0;

      for (const t of targets) {
        const bName = t.branch || t.branch_name;
        const tgt = Number(t.target) || 0;
        const actual = submittedMap[bName] || 0;
        const perc = tgt > 0 ? Math.round((actual / tgt) * 100) : 0;
        rows.push({ branch: bName, target: tgt, dispatch: actual, percentage: perc });
        totalTarget += tgt;
        totalDispatch += actual;
      }

      rows.sort((a, b) => b.percentage - a.percentage);

      const overallPercentage = totalTarget > 0 ? Math.round((totalDispatch / totalTarget) * 100) : 0;
      const topBranch = rows.length > 0 ? rows[0] : null;
      const lowestBranch = rows.length > 0 ? rows[rows.length - 1] : null;
      const summary = { totalTarget, totalDispatch, overallPercentage, topBranch, lowestBranch };

      let base64Img = "";
      try {
        base64Img = await renderDispatchImage(dateStr, rows, summary, config.userName || "Regional Manager", config.userRole || "Regional Manager");
      } catch (e) {
        console.error("[regional-dispatch] Image render failed:", e);
      }

      let caption = `📊 *Regional Dispatch Performance*\nDate: ${dateStr}\nTotal Dispatched: ${totalDispatch}\nAchievement: ${overallPercentage}%\n\n`;
      caption += `*ලබා දී ඇති ශාඛාවන්:*\n${submitted.length > 0 ? submitted.map(b => `✅ ${b}: ${submittedMap[b]}`).join("\n") : "කිසිවක් නැත"}\n\n`;
      if (unsubmitted.length > 0) {
        caption += `*ලබා දී නොමැති ශාඛාවන්:*\n${unsubmitted.map(b => `❌ ${b} (Target: ${targetMap[b] || 0})`).join("\n")}`;
      } else {
        caption += `✅ *සියලුම ශාඛාවන් Dispatch Counts ලබා දී ඇත!*`;
      }

      let sendRes = null;
      if (base64Img) {
        sendRes = await sendAccountRecipientReport(activeKey, { 
          phoneNumber: config.groupId, 
          imageDataUrl: base64Img,
          caption: caption 
        });
      } else {
        sendRes = await sendAccountRecipientText(activeKey, { phoneNumber: config.groupId, message: caption });
      }
      console.log(`[regional-dispatch] Sent report to ${config.groupId} via ${activeKey}`);
      totalSent++;
      seenGroupIds.add(config.groupId);

      // Record sent message
      await recordSentMessage(activeKey, {
        type: "report",
        title: `Dispatch Report - ${dateStr} (${overallPercentage}%)`,
        groupId: config.groupId,
        messageKey: sendRes?.primaryKey || sendRes?.messageKey,
        messageKeys: sendRes?.messageKeys,
        sentAt: new Date().toISOString(),
        preview: `Dispatched: ${totalDispatch}/${totalTarget} (${overallPercentage}%)`
      });

      // Automatically persist saved report to persistent backend storage
      try {
        const reportRecord = {
          id: `dispatch-report-${dateStr}`,
          date: dateStr,
          items: rows,
          summary,
          rawText: rawText || "",
          created_by: config.userName || "Regional Automation (11:30 PM)",
          created_at: new Date().toISOString(),
          isAutoGenerated: true
        };
        await saveRegionalDispatchReport(activeKey, reportRecord);
        console.log(`[regional-dispatch] 💾 Auto-saved dispatch report for ${dateStr} into reports.json`);
      } catch (saveErr) {
        console.error(`[regional-dispatch] Failed to auto-save report for ${dateStr}:`, saveErr);
      }
    }

  return { ok: true, sent: totalSent };
}

const triggeredReminders = new Set();
const triggeredReports = new Set();

function parseTime(str, defaultH, defaultM) {
  if (!str || typeof str !== "string") return { h: defaultH, m: defaultM };
  const parts = str.split(":");
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  return {
    h: isNaN(h) ? defaultH : h,
    m: isNaN(m) ? defaultM : m
  };
}

function isTimeMatch(colomboTime, targetH, targetM) {
  const h = colomboTime.getHours();
  const m = colomboTime.getMinutes();
  return h === targetH && m >= targetM && m < targetM + 5;
}

// Start Cron-like Scheduler
export function startRegionalDispatchAutomation() {
  setInterval(async () => {
    try {
      const colomboTime = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Colombo" }));
      const dateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Colombo" }).format(new Date());
      const hours = colomboTime.getHours();
      const minutes = colomboTime.getMinutes();

      // Clean up older dates from memory
      for (const tKey of triggeredReminders) {
        if (!tKey.startsWith(dateStr)) triggeredReminders.delete(tKey);
      }
      for (const rKey of triggeredReports) {
        if (!rKey.startsWith(dateStr)) triggeredReports.delete(rKey);
      }

      // STRICT: Regional dispatch automation strictly belongs to the Regional Manager account ("default")
      const rmKey = "default";
      const config = await getRegionalConfig(rmKey);
      if (!config || !config.enabled || !config.groupId) return;

      const reportKey = `${dateStr}_${rmKey}_report`;
      const { h: repH, m: repM } = parseTime(config.reportSendTime, 23, 30);

      // 1. Check Multiple Reminder Times
      const reminderTimes = Array.isArray(config.reminderTimes) && config.reminderTimes.length > 0
        ? config.reminderTimes
        : (config.reminderTime ? [config.reminderTime] : ["23:00"]);

      for (const rTime of reminderTimes) {
        const { h: remH, m: remM } = parseTime(rTime, 23, 0);
        const reminderKey = `${dateStr}_${rmKey}_reminder_${rTime}`;

        if (isTimeMatch(colomboTime, remH, remM) && !triggeredReminders.has(reminderKey)) {
          triggeredReminders.add(reminderKey);
          if (triggeredReports.has(reportKey)) {
            console.log(`[regional-dispatch] ⏰ Skipping reminder at ${rTime} because final report has already been sent today.`);
          } else {
            console.log(`[regional-dispatch] ⏰ Triggering scheduled reminder (${rTime}) via Regional WhatsApp`);
            runRegionalAutomation("reminder", rmKey).catch(e => console.error(`[regional-dispatch] Reminder error:`, e));
          }
        }
      }

      // 2. Check Report Send Time
      if (isTimeMatch(colomboTime, repH, repM) && !triggeredReports.has(reportKey)) {
        triggeredReports.add(reportKey);
        console.log(`[regional-dispatch] ⏰ Triggering scheduled report (${config.reportSendTime || '23:30'}) via Regional WhatsApp`);
        runRegionalAutomation("report", rmKey).catch(e => console.error(`[regional-dispatch] Report error:`, e));
      }

      // 3. Auto-Send & Save Early if 100% of branches have submitted before report send time
      const { h: startH, m: startM } = parseTime(config.checkInStartTime, 16, 0);
      const currentMinutes = hours * 60 + minutes;
      const startMinutes = startH * 60 + startM;
      if (currentMinutes >= startMinutes && !triggeredReports.has(reportKey)) {
        checkAllAccountsEarlyCompletion().catch(() => {});
      }
    } catch (schedErr) {
      console.error("[regional-dispatch] Scheduler error:", schedErr.message || schedErr);
    }
  }, 10000).unref();

  console.log("[regional-dispatch] Automation scheduler active (Strictly bound to Regional WhatsApp account)");
}

export async function manualTrigger(accountKey, mode, customTargets = null) {
  return await runRegionalAutomation(mode, accountKey, customTargets);
}

export async function sendSingleBranchReminder(accountKey, { branch, customPhone } = {}) {
  const activeKey = (await resolveConnectedActiveKey(accountKey)) || accountKey || "default";
  const st = await getAccountWhatsAppStatus(activeKey);
  if (st?.status !== "connected") {
    throw new Error("WhatsApp is disconnected. Please connect WhatsApp in Settings before sending reminders.");
  }

  const config = await getRegionalConfig(activeKey);
  const targets = Array.isArray(config.targets) ? config.targets : [];

  let matchedTarget = targets.find(t => {
    const name = (t.branch || t.branch_name || "").toLowerCase().trim();
    return name === String(branch || "").toLowerCase().trim();
  });

  if (!matchedTarget) {
    const fuzzyName = findBranchInLine(branch, targets);
    if (fuzzyName) {
      matchedTarget = targets.find(t => (t.branch || t.branch_name) === fuzzyName);
    }
  }

  const bName = matchedTarget ? (matchedTarget.branch || matchedTarget.branch_name) : String(branch || "").trim();
  const tgt = matchedTarget ? (Number(matchedTarget.target) || 0) : 0;

  let targetPhone = customPhone || (matchedTarget ? (matchedTarget.assigned_phone || matchedTarget.assignedPhone || matchedTarget.assigned_jid || matchedTarget.assignedJid) : null);
  if (targetPhone && String(targetPhone).replace(/\D/g, "").length > 13) {
    const resolved = await resolveLidPhone(targetPhone, activeKey);
    if (resolved) targetPhone = resolved;
  }

  const cleanPhone = toInternationalPhone(targetPhone);
  if (!cleanPhone) {
    throw new Error(`No valid phone number assigned for branch "${bName}". Please assign a phone number in Branch Targets.`);
  }

  const assignedName = (matchedTarget?.assigned_name && matchedTarget.assigned_name !== matchedTarget.assigned_phone && matchedTarget.assigned_name !== cleanPhone)
    ? String(matchedTarget.assigned_name).trim()
    : "";

  const reminderDeadline = config.reportSendTime ? `රාත්‍රී ${config.reportSendTime}` : "රාත්‍රී 11.30";

  const personalMsg = 
`🚨 *DOMEX Dispatch Reminder*

සුභ සන්ධ්‍යාවක්${assignedName ? ` ${assignedName}` : ""}!
ඔබ භාරව සිටින *${bName}* ශාඛාවේ අද දින Dispatch Count එක මෙතෙක් ලැබී නොමැත.

🏢 *ශාඛාව:* ${bName}
🎯 *දෛනික Target එක:* ${tgt}
⏰ *අවසන් වේලාව:* ${reminderDeadline} ට පෙර

කරුණාකර ඔබගේ Dispatch Count එක මෙම Chat එකට (උදා: *${bName} 80* හෝ *80*) Reply කරන්න, නැතහොත් Regional WhatsApp Group එකට යොමු කරන්න.

ස්තූතියි!
— Regional Management (DOMEX Express)`;

  const sendRes = await sendAccountRecipientText(activeKey, {
    phoneNumber: cleanPhone,
    message: personalMsg
  });

  const record = await recordSentMessage(activeKey, {
    type: "personal_reminder",
    title: `Reminder - ${bName}`,
    recipientPhone: cleanPhone,
    branch: bName,
    messageKey: sendRes?.primaryKey || sendRes?.messageKey,
    messageKeys: sendRes?.messageKeys || (sendRes?.messageKey ? [sendRes.messageKey] : []),
    sentAt: new Date().toISOString(),
    preview: personalMsg.slice(0, 140) + "..."
  });

  console.log(`[regional-dispatch] 👤 Sent single branch reminder to ${bName} (${cleanPhone}) via ${activeKey}`);
  return {
    ok: true,
    branch: bName,
    phone: cleanPhone,
    record,
    sendResult: sendRes
  };
}

export async function resendRegionalDispatchReport(accountKey, dateOrId, options = {}) {
  const activeKey = (await resolveConnectedActiveKey(accountKey)) || accountKey || "default";
  const st = await getAccountWhatsAppStatus(activeKey);
  if (st?.status !== "connected") {
    throw new Error("WhatsApp is disconnected. Please connect WhatsApp in Settings before sending reports.");
  }

  const reports = await getRegionalDispatchReports(activeKey);
  const report = reports.find(r => r.id === dateOrId || r.date === dateOrId);
  if (!report) {
    throw new Error(`Report not found for identifier "${dateOrId}".`);
  }

  const config = await getRegionalConfig(activeKey);
  const targetGroup = options.groupId || config.groupId;
  if (!targetGroup) {
    throw new Error("No WhatsApp Group ID configured in settings. Please set Regional Group ID.");
  }

  const dateStr = report.date || getTodayString();
  const rows = Array.isArray(report.items) ? [...report.items] : [];
  rows.sort((a, b) => (Number(b.percentage) || 0) - (Number(a.percentage) || 0));

  let totalTarget = 0;
  let totalDispatch = 0;
  for (const r of rows) {
    totalTarget += Number(r.target) || 0;
    totalDispatch += Number(r.dispatch) || 0;
  }
  const overallPercentage = totalTarget > 0 ? Math.round((totalDispatch / totalTarget) * 100) : (report.summary?.overallPercentage || 0);

  const summary = {
    totalTarget: report.summary?.totalTarget || totalTarget,
    totalDispatch: report.summary?.totalDispatch || totalDispatch,
    overallPercentage: report.summary?.overallPercentage || overallPercentage,
    topBranch: rows.length > 0 ? rows[0] : null,
    lowestBranch: rows.length > 0 ? rows[rows.length - 1] : null
  };

  let base64Img = "";
  try {
    base64Img = await renderDispatchImage(
      dateStr,
      rows,
      summary,
      config.userName || "Regional Manager",
      config.userRole || "Regional Manager"
    );
  } catch (e) {
    console.error("[regional-dispatch] Playwright render failed on resend, falling back to text:", e);
  }

  const submitted = rows.filter(r => (Number(r.dispatch) || 0) > 0);
  const unsubmitted = rows.filter(r => (Number(r.dispatch) || 0) <= 0);

  let caption = `📊 *Regional Dispatch Performance (Resent)*\nDate: ${dateStr}\nTotal Dispatched: ${summary.totalDispatch}\nAchievement: ${summary.overallPercentage}%\n\n`;
  caption += `*ලබා දී ඇති ශාඛාවන්:*\n${submitted.length > 0 ? submitted.map(b => `✅ ${b.branch || b.branch_name}: ${b.dispatch}`).join("\n") : "කිසිවක් නැත"}\n\n`;
  if (unsubmitted.length > 0) {
    caption += `*ලබා දී නොමැති ශාඛාවන්:*\n${unsubmitted.map(b => `❌ ${b.branch || b.branch_name} (Target: ${b.target || 0})`).join("\n")}`;
  } else {
    caption += `✅ *සියලුම ශාඛාවන් Dispatch Counts ලබා දී ඇත!*`;
  }

  let sendRes = null;
  if (base64Img) {
    sendRes = await sendAccountRecipientReport(activeKey, {
      phoneNumber: targetGroup,
      imageDataUrl: base64Img,
      caption: caption
    });
  } else {
    sendRes = await sendAccountRecipientText(activeKey, {
      phoneNumber: targetGroup,
      message: caption
    });
  }

  const record = await recordSentMessage(activeKey, {
    type: "report",
    title: `Resent Report - ${dateStr} (${summary.overallPercentage}%)`,
    groupId: targetGroup,
    messageKey: sendRes?.primaryKey || sendRes?.messageKey,
    messageKeys: sendRes?.messageKeys || (sendRes?.messageKey ? [sendRes.messageKey] : []),
    sentAt: new Date().toISOString(),
    preview: `Resent: Dispatched ${summary.totalDispatch}/${summary.totalTarget} (${summary.overallPercentage}%)`
  });

  console.log(`[regional-dispatch] 📊 Resent report for ${dateStr} to ${targetGroup} via ${activeKey}`);
  return {
    ok: true,
    date: dateStr,
    groupId: targetGroup,
    record,
    sendResult: sendRes
  };
}

export async function getRegionalLiveStatus(accountKey, customTargets = null) {
  const rmKey = "default";
  const config = await getRegionalConfig(rmKey);
  const rawText = await getTodayMessages(rmKey);
  const targets = (Array.isArray(customTargets) && customTargets.length > 0)
    ? customTargets
    : (Array.isArray(config.targets) ? config.targets : []);

  // Save targets to config if provided and not yet saved
  if (Array.isArray(customTargets) && customTargets.length > 0 && (!config.targets || config.targets.length === 0)) {
    config.targets = customTargets.map(t => ({
      branch: t.branch || t.branch_name,
      target: Number(t.target) || 0
    }));
    await saveRegionalConfig(rmKey, config);
  }

  const dailyState = await getDailyState(rmKey);
  const clearedSet = new Set(Array.isArray(dailyState.clearedBranches) ? dailyState.clearedBranches : []);
  const submittedMap = {};

  for (const [b, d] of Object.entries(dailyState.dispatches || {})) {
    if (d?.dispatch != null) {
      const canonical = findBranchInLine(b, targets) || b;
      if (!clearedSet.has(canonical)) {
        submittedMap[canonical] = Number(d.dispatch);
      }
    }
  }
  for (const [b, d] of Object.entries(dailyState.manualOverrides || {})) {
    if (d?.dispatch != null) {
      const canonical = findBranchInLine(b, targets) || b;
      if (!clearedSet.has(canonical)) {
        submittedMap[canonical] = Number(d.dispatch);
      }
    }
  }

  if (rawText && rawText.trim()) {
    for (const line of rawText.split("\n")) {
      const fuzzyBranch = findBranchInLine(line, targets);
      if (fuzzyBranch && !clearedSet.has(fuzzyBranch) && submittedMap[fuzzyBranch] == null) {
        const numbers = line.match(/\b\d{1,5}\b/g);
        if (numbers && numbers.length > 0) {
          const val = parseInt(numbers[numbers.length - 1], 10);
          if (!isNaN(val)) {
            submittedMap[fuzzyBranch] = val;
          }
        }
      }
    }
  }

  const submitted = [];
  const unsubmitted = [];
  let totalTarget = 0;
  let totalDispatch = 0;

  for (const t of targets) {
    const bName = t.branch || t.branch_name;
    if (!bName) continue;
    const tgt = Number(t.target) || 0;
    const hasSubmitted = submittedMap[bName] != null;
    const dispatch = hasSubmitted ? submittedMap[bName] : 0;
    const percentage = tgt > 0 ? Math.round((dispatch / tgt) * 100) : 0;

    totalTarget += tgt;
    totalDispatch += dispatch;

    const row = {
      branch: bName,
      target: tgt,
      dispatch,
      percentage,
      isSubmitted: hasSubmitted,
    };

    if (hasSubmitted) {
      submitted.push(row);
    } else {
      unsubmitted.push(row);
    }
  }

  submitted.sort((a, b) => b.percentage - a.percentage);
  unsubmitted.sort((a, b) => b.target - a.target);

  const overallPercentage = totalTarget > 0 ? Math.round((totalDispatch / totalTarget) * 100) : 0;

  return {
    ok: true,
    enabled: Boolean(config.enabled),
    groupId: config.groupId || "",
    rawMessagesCount: rawText ? rawText.split("---").filter((s) => s.trim()).length : 0,
    rawText: rawText || "",
    totalTarget,
    totalDispatch,
    overallPercentage,
    submittedCount: submitted.length,
    unsubmittedCount: unsubmitted.length,
    totalBranches: targets.length,
    submitted,
    unsubmitted,
    lastUpdated: new Date().toISOString(),
  };
}

let isEarlyChecking = false;

export async function checkAllAccountsEarlyCompletion() {
  if (isEarlyChecking) return;
  const dateStr = getTodayString();
  const colomboNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Colombo" }));
  const hours = colomboNow.getHours();
  const minutes = colomboNow.getMinutes();
  const currentMinutes = hours * 60 + minutes;

  isEarlyChecking = true;
  try {
    const rmKey = "default";
    const reportKey = `${dateStr}_${rmKey}_report`;
    if (triggeredReports.has(reportKey)) return;

    const cfg = await getRegionalConfig(rmKey);
    if (!cfg || !cfg.enabled || !cfg.groupId || !Array.isArray(cfg.targets) || cfg.targets.length === 0) {
      return;
    }

    // Verify current time is during or after check-in start time
    const { h: startH, m: startM } = parseTime(cfg.checkInStartTime, 16, 0);
    const startMinutes = startH * 60 + startM;
    if (currentMinutes < startMinutes) return;

    const live = await getRegionalLiveStatus(rmKey);
    if (
      live &&
      live.totalBranches > 0 &&
      live.unsubmittedCount === 0 &&
      live.submittedCount >= live.totalBranches
    ) {
      triggeredReports.add(reportKey);
      console.log(`[regional-dispatch] 🎯 100% Branches Submitted (${live.submittedCount}/${live.totalBranches}) during check-in window! Auto-sending and saving report early via Regional WhatsApp...`);
      await runRegionalAutomation("report", rmKey);
    }
  } catch (err) {
    console.error("[regional-dispatch] Early completion check error:", err);
  } finally {
    isEarlyChecking = false;
  }
}
