import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import Pino from "pino";
import QRCode from "qrcode";
import * as primary from "./whatsappService.js";
import { renderRescheduleReportImages } from "../reports/rescheduleReportRenderer.js";

export const PRIMARY_WHATSAPP_ACCOUNT = "default";
const accountsDir = path.resolve("backend", "data", "whatsapp-accounts");
const runtimes = new Map();

export function normalizeWhatsAppAccountKey(value) {
  const clean = String(value || PRIMARY_WHATSAPP_ACCOUNT).trim().toLowerCase();
  if (!clean || clean === PRIMARY_WHATSAPP_ACCOUNT) return PRIMARY_WHATSAPP_ACCOUNT;
  const normalized = clean.replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  if (!normalized) return "account";
  return normalized === PRIMARY_WHATSAPP_ACCOUNT ? `account-${normalized}` : normalized;
}

function getRuntime(accountKey) {
  const key = normalizeWhatsAppAccountKey(accountKey);
  if (!runtimes.has(key)) {
    const rootDir = path.join(accountsDir, key);
    runtimes.set(key, {
      key,
      rootDir,
      authDir: path.join(rootDir, "auth"),
      configPath: path.join(rootDir, "config.json"),
      socket: null,
      qr: "",
      qrDataUrl: "",
      status: "disconnected",
      connectedNumber: "",
      reconnecting: false,
      approvalSending: false,
    });
  }
  return runtimes.get(key);
}

function normalizeGroupJids(groupJids) {
  return [...new Set((Array.isArray(groupJids) ? groupJids : [groupJids])
    .map((jid) => String(jid || "").trim()).filter(Boolean))];
}

function normalizeConfig(config = {}) {
  const keys = ["default", "convertDefault", "rescheduleDefault", "auditDefault"];
  const next = { ...config };
  for (const key of keys) {
    const plural = `${key}GroupJids`;
    const singular = `${key}GroupJid`;
    const values = normalizeGroupJids(config[plural]?.length ? config[plural] : config[singular]);
    next[singular] = values[0] || "";
    next[plural] = values;
  }
  next.backupWhatsappNumber = String(config.backupWhatsappNumber || "");
  next.latestBackupSnapshot = config.latestBackupSnapshot || null;
  next.lastDailyBackupDate = config.lastDailyBackupDate || "";
  next.lastRescheduleApprovalDate = config.lastRescheduleApprovalDate || "";
  next.rescheduleApprovalReaction = String(config.rescheduleApprovalReaction || "✅").trim() || "✅";
  next.pendingRescheduleApproval = config.pendingRescheduleApproval || null;
  return next;
}

async function readConfig(runtime) {
  try {
    return normalizeConfig(JSON.parse(await fs.readFile(runtime.configPath, "utf8")));
  } catch {
    return normalizeConfig();
  }
}

async function writeConfig(runtime, config) {
  await fs.mkdir(runtime.rootDir, { recursive: true });
  const normalized = normalizeConfig(config);
  await fs.writeFile(runtime.configPath, JSON.stringify(normalized, null, 2));
  return normalized;
}

function normalizePhone(jid) {
  return jid ? String(jid).split("@")[0].split(":")[0] : "";
}

function normalizeRecipientJid(phoneNumber) {
  const raw = String(phoneNumber || "").trim();
  if (!raw) return "";
  if (raw.includes("@")) return raw;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  return `${digits.length === 10 && digits.startsWith("0") ? `94${digits.slice(1)}` : digits}@s.whatsapp.net`;
}

async function ensureConnected(runtime) {
  if (!runtime.socket || runtime.status !== "connected") {
    throw new Error("WhatsApp is not connected for this login. Scan its QR from Settings.");
  }
  return runtime.socket;
}

async function startAccountClient(accountKey, force = false) {
  const runtime = getRuntime(accountKey);
  if (runtime.socket && !force) return runtime.socket;
  if (runtime.reconnecting) return runtime.socket;
  runtime.reconnecting = true;
  await fs.mkdir(runtime.authDir, { recursive: true });
  try {
    const { state, saveCreds } = await useMultiFileAuthState(runtime.authDir);
    const { version } = await fetchLatestBaileysVersion();
    const socket = makeWASocket({
      auth: state,
      version,
      printQRInTerminal: false,
      logger: Pino({ level: "silent" }),
      browser: [`Daily Report - ${runtime.key}`, "Chrome", "1.0.0"],
      syncFullHistory: false,
    });
    runtime.socket = socket;
    socket.ev.on("creds.update", saveCreds);
    socket.ev.on("messages.reaction", (reactions) => {
      for (const update of reactions || []) {
        handleAccountApprovalReaction(runtime.key, update).catch((error) => {
          console.error(`[whatsapp-approval:${runtime.key}]`, error.message || error);
        });
      }
    });
    socket.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        runtime.qr = qr;
        runtime.qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 280 });
        runtime.status = "qr";
      }
      if (connection === "open") {
        runtime.qr = "";
        runtime.qrDataUrl = "";
        runtime.status = "connected";
        runtime.connectedNumber = normalizePhone(socket.user?.id);
      }
      if (connection === "close") {
        const loggedOut = lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut;
        runtime.socket = null;
        runtime.status = "disconnected";
        runtime.connectedNumber = "";
        if (!loggedOut) setTimeout(() => startAccountClient(runtime.key, true).catch(console.error), 2500);
      }
    });
    return socket;
  } finally {
    runtime.reconnecting = false;
  }
}

function imageBuffers({ imageDataUrl, imageDataUrls }) {
  const urls = Array.isArray(imageDataUrls) && imageDataUrls.length ? imageDataUrls : [imageDataUrl].filter(Boolean);
  if (!urls.length || urls.some((url) => !url?.startsWith("data:image/png;base64,"))) {
    throw new Error("One or more PNG report images are required.");
  }
  return urls.map((url) => Buffer.from(url.split(",")[1], "base64"));
}

async function sendImages(socket, recipientJid, buffers, caption) {
  if (buffers.length === 1) {
    const message = await socket.sendMessage(recipientJid, { image: buffers[0], caption });
    return { primaryKey: message.key, messageKeys: [message.key] };
  }
  const album = await socket.sendMessage(recipientJid, { album: { expectedImageCount: buffers.length } });
  const messageKeys = [album.key];
  for (let index = 0; index < buffers.length; index += 1) {
    const message = await socket.sendMessage(recipientJid, {
      image: buffers[index],
      ...(index === 0 && caption ? { caption } : {}),
      albumParentKey: album.key,
    });
    messageKeys.push(message.key);
  }
  return { primaryKey: messageKeys[1] || album.key, messageKeys };
}

function isPrimary(accountKey) {
  return normalizeWhatsAppAccountKey(accountKey) === PRIMARY_WHATSAPP_ACCOUNT;
}

export async function getAccountWhatsAppStatus(accountKey) {
  if (isPrimary(accountKey)) return primary.getWhatsAppStatus();
  const runtime = getRuntime(accountKey);
  const config = await readConfig(runtime);
  if (!runtime.socket && runtime.status === "disconnected") startAccountClient(runtime.key).catch(console.error);
  return {
    status: runtime.status,
    connected: runtime.status === "connected",
    connectedNumber: runtime.connectedNumber,
    hasQr: Boolean(runtime.qrDataUrl),
    accountKey: runtime.key,
    defaultGroupJid: config.defaultGroupJid,
    defaultGroupJids: config.defaultGroupJids,
    convertDefaultGroupJid: config.convertDefaultGroupJid,
    convertDefaultGroupJids: config.convertDefaultGroupJids,
    rescheduleDefaultGroupJid: config.rescheduleDefaultGroupJid,
    rescheduleDefaultGroupJids: config.rescheduleDefaultGroupJids,
    auditDefaultGroupJid: config.auditDefaultGroupJid,
    auditDefaultGroupJids: config.auditDefaultGroupJids,
    backupWhatsappNumber: config.backupWhatsappNumber,
    rescheduleApprovalReaction: config.rescheduleApprovalReaction,
    lastDailyBackupDate: config.lastDailyBackupDate,
    lastRescheduleApprovalDate: config.lastRescheduleApprovalDate,
    hasBackupSnapshot: Boolean(config.latestBackupSnapshot),
  };
}

export async function getAccountQr(accountKey) {
  if (isPrimary(accountKey)) return primary.getQrCode();
  const runtime = getRuntime(accountKey);
  if (!runtime.socket) await startAccountClient(runtime.key);
  return { qr: runtime.qr, qrDataUrl: runtime.qrDataUrl };
}

export async function reconnectAccountWhatsApp(accountKey) {
  if (isPrimary(accountKey)) return primary.reconnectWhatsApp();
  const runtime = getRuntime(accountKey);
  try { runtime.socket?.end(undefined); } catch { /* already closed */ }
  runtime.socket = null;
  runtime.status = "disconnected";
  await startAccountClient(runtime.key, true);
  return getAccountWhatsAppStatus(runtime.key);
}

export async function logoutAccountWhatsApp(accountKey) {
  if (isPrimary(accountKey)) return primary.logoutWhatsApp();
  const runtime = getRuntime(accountKey);
  try { await runtime.socket?.logout(); } catch { /* remove local auth regardless */ }
  runtime.socket = null;
  runtime.qr = "";
  runtime.qrDataUrl = "";
  runtime.status = "disconnected";
  runtime.connectedNumber = "";
  await fs.rm(runtime.authDir, { recursive: true, force: true });
  return getAccountWhatsAppStatus(runtime.key);
}

export async function fetchAccountGroups(accountKey) {
  if (isPrimary(accountKey)) return primary.fetchWhatsAppGroups();
  const runtime = getRuntime(accountKey);
  const socket = await ensureConnected(runtime);
  const groups = await socket.groupFetchAllParticipating();
  return Object.values(groups).map((group) => ({
    jid: group.id,
    name: group.subject,
    participants: group.participants?.length || 0,
  })).sort((a, b) => a.name.localeCompare(b.name));
}

const configFieldByType = {
  default: "defaultGroupJids",
  delivered: "convertDefaultGroupJids",
  reschedule: "rescheduleDefaultGroupJids",
  audit: "auditDefaultGroupJids",
};

export async function saveAccountGroups(accountKey, type, groupJids) {
  if (isPrimary(accountKey)) {
    if (type === "delivered") return primary.saveConvertDefaultGroupJids(groupJids);
    if (type === "reschedule") return primary.saveRescheduleDefaultGroupJids(groupJids);
    if (type === "audit") return primary.saveAuditDefaultGroupJids(groupJids);
    return primary.saveDefaultGroupJids(groupJids);
  }
  const values = normalizeGroupJids(groupJids);
  if (!values.length) throw new Error("At least one WhatsApp group is required.");
  const runtime = getRuntime(accountKey);
  const field = configFieldByType[type] || configFieldByType.default;
  const singular = field.replace(/s$/, "");
  return writeConfig(runtime, { ...(await readConfig(runtime)), [field]: values, [singular]: values[0] });
}

export async function sendAccountGroupReport(accountKey, type, payload) {
  if (isPrimary(accountKey)) {
    if (type === "delivered") return primary.sendReportToConvertDefaultGroup(payload);
    if (type === "reschedule") return primary.sendReportToRescheduleDefaultGroup(payload);
    if (type === "audit") return primary.sendReportToAuditDefaultGroup(payload);
    return primary.sendReportToDefaultGroup(payload);
  }
  const runtime = getRuntime(accountKey);
  const socket = await ensureConnected(runtime);
  const config = await readConfig(runtime);
  const groupJids = normalizeGroupJids(config[configFieldByType[type] || configFieldByType.default]);
  if (!groupJids.length) throw new Error("Default WhatsApp groups are not selected for this login.");
  const buffers = imageBuffers(payload);
  for (const jid of groupJids) await sendImages(socket, jid, buffers, payload.caption);
  return { ok: true, groupJids, sentCount: groupJids.length, mediaCount: buffers.length, sentAt: new Date().toISOString() };
}

export async function sendAccountRecipientReport(accountKey, payload) {
  if (isPrimary(accountKey)) return primary.sendReportToRecipient(payload);
  const runtime = getRuntime(accountKey);
  const socket = await ensureConnected(runtime);
  const recipientJid = normalizeRecipientJid(payload.phoneNumber);
  if (!recipientJid) throw new Error("Rider WhatsApp number is required.");
  const buffers = imageBuffers(payload);
  await sendImages(socket, recipientJid, buffers, payload.caption);
  return { ok: true, recipientJid, sentCount: 1, mediaCount: buffers.length, sentAt: new Date().toISOString() };
}

export async function sendAccountRecipientText(accountKey, payload) {
  if (isPrimary(accountKey)) return primary.sendTextToRecipient(payload);
  const runtime = getRuntime(accountKey);
  const socket = await ensureConnected(runtime);
  const recipientJid = normalizeRecipientJid(payload.phoneNumber);
  const text = String(payload.message || "").trim();
  if (!recipientJid || !text) throw new Error("Recipient number and message are required.");
  await socket.sendMessage(recipientJid, { text });
  return { ok: true, recipientJid, sentCount: 1, sentAt: new Date().toISOString() };
}

export async function saveAccountBackupConfig(accountKey, { phoneNumber, snapshot, approvalReaction }) {
  if (isPrimary(accountKey)) return primary.saveBackupConfig({ phoneNumber, snapshot, approvalReaction });
  const runtime = getRuntime(accountKey);
  const config = await writeConfig(runtime, {
    ...(await readConfig(runtime)),
    backupWhatsappNumber: String(phoneNumber || "").trim(),
    latestBackupSnapshot: snapshot || null,
    rescheduleApprovalReaction: approvalReaction || "✅",
  });
  return { ok: true, backupWhatsappNumber: config.backupWhatsappNumber, hasBackupSnapshot: Boolean(config.latestBackupSnapshot) };
}

export async function saveAccountBackupSnapshot(accountKey, payload) {
  if (isPrimary(accountKey)) return primary.saveLatestBackupSnapshot(payload);
  const runtime = getRuntime(accountKey);
  const previous = await readConfig(runtime);
  return saveAccountBackupConfig(runtime.key, {
    phoneNumber: payload.phoneNumber || previous.backupWhatsappNumber,
    snapshot: payload.snapshot || previous.latestBackupSnapshot,
    approvalReaction: payload.approvalReaction || previous.rescheduleApprovalReaction,
  });
}

export async function sendAccountBackup(accountKey, { force = false } = {}) {
  if (isPrimary(accountKey)) return primary.sendBackupToWhatsApp({ force });
  const runtime = getRuntime(accountKey);
  const socket = await ensureConnected(runtime);
  const config = await readConfig(runtime);
  const recipientJid = normalizeRecipientJid(config.backupWhatsappNumber);
  if (!recipientJid || !config.latestBackupSnapshot) throw new Error("Backup number and snapshot are required for this login.");
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Colombo" }).format(new Date());
  if (!force && config.lastDailyBackupDate === date) return { ok: true, skipped: true, reason: "Daily backup already sent." };
  const fileName = `Daily_Courier_Backup_${date}_${runtime.key}.json`;
  await socket.sendMessage(recipientJid, {
    document: Buffer.from(JSON.stringify(config.latestBackupSnapshot, null, 2), "utf8"),
    mimetype: "application/json",
    fileName,
    caption: `Daily Courier Report System backup\nAccount: ${runtime.key}\nDate: ${date}`,
  });
  await writeConfig(runtime, { ...config, lastDailyBackupDate: date });
  return { ok: true, fileName, recipientJid, sentAt: new Date().toISOString() };
}

function comparableReaction(value) {
  return String(value || "").trim().replaceAll("\uFE0F", "");
}

export async function sendAccountRescheduleApproval(accountKey, { force = false } = {}) {
  if (isPrimary(accountKey)) return primary.sendRescheduleApprovalRequest({ force });
  const runtime = getRuntime(accountKey);
  const socket = await ensureConnected(runtime);
  const config = await readConfig(runtime);
  const recipientJid = normalizeRecipientJid(config.backupWhatsappNumber);
  if (!recipientJid) throw new Error("Backup WhatsApp number is required for Reschedule approval.");
  const groupJids = normalizeGroupJids(config.rescheduleDefaultGroupJids);
  if (!groupJids.length) throw new Error("Select a Reschedule Report WhatsApp group for this login.");
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Colombo" }).format(new Date());
  if (!force && config.lastRescheduleApprovalDate === date) {
    return { ok: true, skipped: true, reason: "Today's Reschedule approval was already sent." };
  }
  const rows = config.latestBackupSnapshot?.reports?.[date]?.rescheduleRows || [];
  if (!rows.length) return { ok: true, skipped: true, reason: `No Reschedule Report rows are saved for ${date}.` };
  const branchName = config.latestBackupSnapshot?.settings?.branchName || runtime.key;
  const captionTemplate = config.latestBackupSnapshot?.settings?.whatsappCaptionTemplates?.reschedule
    || "📋 *{title}*\n📅 Date: *{date}*\n\nPlease check the attached rescheduled parcel list.";
  const groupCaption = captionTemplate.replaceAll("{title}", "Reschedule Report").replaceAll("{date}", date);
  const imagePaths = await renderRescheduleReportImages({ rows, reportDate: date, branchName });
  const buffers = await Promise.all(imagePaths.map((imagePath) => fs.readFile(imagePath)));
  const reaction = config.rescheduleApprovalReaction || "✅";
  const reportMessage = await sendImages(socket, recipientJid, buffers,
    `${groupCaption}\n\n🔐 *Approval required*\nReact with ${reaction} to send this report to ${groupJids.length} assigned group${groupJids.length === 1 ? "" : "s"}.`);
  const requestMessageIds = reportMessage.messageKeys.map((key) => key?.id || "").filter(Boolean);
  const pending = {
    id: crypto.randomUUID(), date, status: "pending", recipientJid, groupJids, imagePaths,
    groupCaption, reaction, requestMessageIds, rowCount: rows.length, pageCount: imagePaths.length,
    requestedAt: new Date().toISOString(),
  };
  await writeConfig(runtime, { ...config, lastRescheduleApprovalDate: date, pendingRescheduleApproval: pending });
  return { ok: true, sentDate: date, rowCount: rows.length, pageCount: imagePaths.length, groupCount: groupJids.length };
}

async function handleAccountApprovalReaction(accountKey, { key, reaction }) {
  if (!key?.id || reaction?.key?.fromMe) return;
  const runtime = getRuntime(accountKey);
  const config = await readConfig(runtime);
  const pending = config.pendingRescheduleApproval;
  if (!pending || pending.status !== "pending") return;
  if (!pending.requestMessageIds?.includes(key.id)) return;
  if (comparableReaction(reaction?.text) !== comparableReaction(pending.reaction)) return;
  if (runtime.approvalSending) return;
  runtime.approvalSending = true;
  try {
    const socket = await ensureConnected(runtime);
    const buffers = await Promise.all(pending.imagePaths.map((imagePath) => fs.readFile(imagePath)));
    const latest = await readConfig(runtime);
    const groupJids = normalizeGroupJids(latest.rescheduleDefaultGroupJids?.length
      ? latest.rescheduleDefaultGroupJids : pending.groupJids);
    for (const jid of groupJids) await sendImages(socket, jid, buffers, pending.groupCaption);
    await writeConfig(runtime, {
      ...latest,
      pendingRescheduleApproval: { ...pending, status: "sent", confirmedAt: new Date().toISOString(), sentGroupCount: groupJids.length },
    });
    await socket.sendMessage(pending.recipientJid, { text: `✅ ${pending.date} Reschedule Report sent to ${groupJids.length} assigned group${groupJids.length === 1 ? "" : "s"}.` });
  } finally {
    runtime.approvalSending = false;
  }
}

export async function listAccountKeys() {
  try {
    const entries = await fs.readdir(accountsDir, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => normalizeWhatsAppAccountKey(entry.name));
  } catch {
    return [];
  }
}

export async function startSavedAccountClients() {
  for (const key of await listAccountKeys()) startAccountClient(key).catch(console.error);
}

export function startAccountBackupScheduler() {
  setInterval(async () => {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Colombo", hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(new Date()).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
    const hour = Number(parts.hour);
    const minute = Number(parts.minute);
    if (minute !== 0 || (hour !== 8 && hour !== 20)) return;
    for (const key of await listAccountKeys()) {
      const action = hour === 8 ? sendAccountBackup(key, { force: false }) : sendAccountRescheduleApproval(key, { force: false });
      action.catch((error) => console.error(`[whatsapp-scheduler:${key}]`, error.message || error));
    }
  }, 60_000);
}
