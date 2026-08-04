import fs from "node:fs/promises";
import path from "node:path";
import {
  fetchMeterMonitorGroups,
  getMeterMonitorAccountMode,
  getMeterMonitorStatus,
  sendMeterChatText,
  subscribeToMeterMonitorMessages,
} from "./meterMonitorService.js";

const dataDir = path.resolve("backend", "data");
const storePath = path.join(dataDir, "meter-chat-store.json");
const accessKeyPath = path.join(dataDir, "meter-chat-access-key");
const MAX_CHATS = 150;
const MAX_MESSAGES_PER_CHAT = 250;
let chatStore = null;
let storeWriteQueue = Promise.resolve();

function emptyStore() {
  return { accounts: { primary: { chats: {} }, separate: { chats: {} } } };
}

async function loadStore() {
  if (chatStore) return chatStore;
  await fs.mkdir(dataDir, { recursive: true });
  try {
    const parsed = JSON.parse(await fs.readFile(storePath, "utf8"));
    chatStore = parsed?.accounts ? parsed : emptyStore();
  } catch {
    chatStore = emptyStore();
  }
  chatStore.accounts.primary ||= { chats: {} };
  chatStore.accounts.separate ||= { chats: {} };
  return chatStore;
}

async function persistStore() {
  storeWriteQueue = storeWriteQueue.then(async () => {
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(storePath, JSON.stringify(chatStore, null, 2));
  });
  await storeWriteQueue;
}

function unwrapMessageContent(message) {
  let content = message || {};
  for (let index = 0; index < 5; index += 1) {
    const wrapped = content.ephemeralMessage?.message
      || content.viewOnceMessage?.message
      || content.viewOnceMessageV2?.message
      || content.viewOnceMessageV2Extension?.message
      || content.documentWithCaptionMessage?.message;
    if (!wrapped) break;
    content = wrapped;
  }
  return content;
}

function timestampSeconds(value) {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value?.toNumber === "function") return value.toNumber();
  if (Number.isFinite(value?.low)) return Number(value.low);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Math.floor(Date.now() / 1000);
}

function messageSummary(content) {
  if (content.conversation) return { type: "text", text: content.conversation };
  if (content.extendedTextMessage) return { type: "text", text: content.extendedTextMessage.text || "" };
  if (content.imageMessage) return { type: "image", text: content.imageMessage.caption || "Photo" };
  if (content.videoMessage) return { type: "video", text: content.videoMessage.caption || "Video" };
  if (content.documentMessage) return { type: "document", text: content.documentMessage.fileName || content.documentMessage.caption || "Document" };
  if (content.audioMessage) return { type: "audio", text: content.audioMessage.ptt ? "Voice message" : "Audio" };
  if (content.stickerMessage) return { type: "sticker", text: "Sticker" };
  if (content.contactMessage || content.contactsArrayMessage) return { type: "contact", text: "Contact" };
  if (content.locationMessage || content.liveLocationMessage) return { type: "location", text: "Location" };
  if (content.reactionMessage) return { type: "reaction", text: content.reactionMessage.text || "Reaction" };
  return { type: "system", text: "WhatsApp message" };
}

function quotedText(content) {
  const context = content.extendedTextMessage?.contextInfo
    || content.imageMessage?.contextInfo
    || content.videoMessage?.contextInfo
    || content.documentMessage?.contextInfo;
  if (!context?.quotedMessage) return "";
  return messageSummary(unwrapMessageContent(context.quotedMessage)).text;
}

export function serializeMeterMessage(message) {
  const chatJid = String(message?.key?.remoteJid || "").trim();
  if (!chatJid || chatJid === "status@broadcast" || chatJid.endsWith("@newsletter")) return null;
  const content = unwrapMessageContent(message.message);
  const summary = messageSummary(content);
  const timestamp = timestampSeconds(message.messageTimestamp);
  const senderJid = String(message.key?.participant || message.key?.participantAlt || chatJid).trim();
  return {
    id: String(message.key?.id || `${chatJid}-${timestamp}-${senderJid}`),
    chatJid,
    fromMe: Boolean(message.key?.fromMe),
    senderJid,
    senderName: String(message.pushName || "").trim(),
    timestamp,
    sentAt: new Date(timestamp * 1000).toISOString(),
    type: summary.type,
    text: String(summary.text || "").slice(0, 8000),
    quotedText: String(quotedText(content) || "").slice(0, 500),
  };
}

function fallbackChatName(jid) {
  const value = String(jid || "").split("@")[0].split(":")[0];
  return value || "WhatsApp chat";
}

function metadataTimestamp(value) {
  if (value === undefined || value === null || value === "") return "";
  const timestamp = timestampSeconds(value);
  return timestamp > 0 ? new Date(timestamp * 1000).toISOString() : "";
}

async function ingestMeterMessages(messages, eventType, sourceMode, metadata = {}) {
  const activeMode = await getMeterMonitorAccountMode();
  if (sourceMode !== activeMode) return;
  const store = await loadStore();
  const account = store.accounts[sourceMode] ||= { chats: {} };
  let changed = false;

  const contactNames = new Map((metadata.contacts || []).map((contact) => [
    String(contact.id || ""),
    String(contact.name || contact.notify || contact.verifiedName || "").trim(),
  ]));
  for (const rawChat of metadata.chats || []) {
    const jid = String(rawChat.id || "").trim();
    if (!jid || jid === "status@broadcast" || jid.endsWith("@newsletter")) continue;
    const isGroup = jid.endsWith("@g.us");
    const existing = account.chats[jid] || {
      jid,
      type: isGroup ? "group" : "private",
      unreadCount: 0,
      messages: [],
    };
    existing.name = String(rawChat.name || contactNames.get(jid) || existing.name || fallbackChatName(jid));
    existing.unreadCount = Math.max(existing.unreadCount || 0, Number(rawChat.unreadCount) || 0);
    existing.lastMessageAt ||= metadataTimestamp(rawChat.conversationTimestamp);
    account.chats[jid] = existing;
    changed = true;
  }

  for (const [jid, name] of contactNames) {
    if (!name || !account.chats[jid] || account.chats[jid].type === "group") continue;
    account.chats[jid].name = name;
    changed = true;
  }

  for (const rawMessage of messages || []) {
    const message = serializeMeterMessage(rawMessage);
    if (!message) continue;
    const isGroup = message.chatJid.endsWith("@g.us");
    const existing = account.chats[message.chatJid] || {
      jid: message.chatJid,
      name: isGroup ? "WhatsApp Group" : fallbackChatName(message.chatJid),
      type: isGroup ? "group" : "private",
      unreadCount: 0,
      messages: [],
    };
    if (!message.fromMe && message.senderName && !isGroup) existing.name = message.senderName;
    if (existing.messages.some((item) => item.id === message.id)) continue;
    existing.messages.push(message);
    existing.messages.sort((a, b) => a.timestamp - b.timestamp);
    existing.messages = existing.messages.slice(-MAX_MESSAGES_PER_CHAT);
    existing.lastMessageAt = message.sentAt;
    existing.lastMessage = message.text;
    existing.lastMessageType = message.type;
    if (!message.fromMe && eventType === "notify") existing.unreadCount = (existing.unreadCount || 0) + 1;
    account.chats[message.chatJid] = existing;
    changed = true;
  }

  if (!changed) return;
  const retained = Object.values(account.chats)
    .sort((a, b) => String(b.lastMessageAt || "").localeCompare(String(a.lastMessageAt || "")))
    .slice(0, MAX_CHATS);
  account.chats = Object.fromEntries(retained.map((chat) => [chat.jid, chat]));
  await persistStore();
}

subscribeToMeterMonitorMessages(({ messages, type, sourceMode, chats, contacts }) => {
  ingestMeterMessages(messages, type, sourceMode, { chats, contacts }).catch((error) => {
    console.error("[meter-chat-store]", error.message || error);
  });
});

export async function isMeterChatAccessAllowed(value) {
  const supplied = String(value || "").trim();
  if (!supplied) return false;
  const environmentKey = String(process.env.METER_CHAT_ACCESS_KEY || "").trim();
  if (environmentKey) return supplied === environmentKey;
  try {
    return supplied === String(await fs.readFile(accessKeyPath, "utf8")).trim();
  } catch {
    return false;
  }
}

export async function listMeterChats() {
  const [mode, status, store] = await Promise.all([
    getMeterMonitorAccountMode(),
    getMeterMonitorStatus(),
    loadStore(),
  ]);
  const account = store.accounts[mode] ||= { chats: {} };
  let groups = [];
  if (status.connected) {
    try {
      groups = await fetchMeterMonitorGroups();
    } catch {
      groups = [];
    }
  }
  const groupNames = new Map(groups.map((group) => [group.jid, group.name]));
  const chats = Object.values(account.chats).map((chat) => ({
    ...chat,
    name: groupNames.get(chat.jid) || chat.name || fallbackChatName(chat.jid),
    messages: undefined,
    messageCount: chat.messages?.length || 0,
  }));
  for (const group of groups) {
    if (chats.some((chat) => chat.jid === group.jid)) continue;
    chats.push({
      jid: group.jid,
      name: group.name,
      type: "group",
      unreadCount: 0,
      messageCount: 0,
      lastMessage: "",
      lastMessageAt: "",
    });
  }
  chats.sort((a, b) => String(b.lastMessageAt || "").localeCompare(String(a.lastMessageAt || "")) || a.name.localeCompare(b.name));
  return {
    accountMode: mode,
    connected: status.connected,
    connectedNumber: status.connectedNumber,
    chats,
  };
}

export async function getMeterChatMessages(jid, limit = 150) {
  const mode = await getMeterMonitorAccountMode();
  const store = await loadStore();
  const chat = store.accounts[mode]?.chats?.[String(jid || "").trim()];
  const safeLimit = Math.max(1, Math.min(Number(limit) || 150, MAX_MESSAGES_PER_CHAT));
  return {
    jid: String(jid || "").trim(),
    messages: (chat?.messages || []).slice(-safeLimit),
  };
}

export async function markMeterChatRead(jid) {
  const mode = await getMeterMonitorAccountMode();
  const store = await loadStore();
  const chat = store.accounts[mode]?.chats?.[String(jid || "").trim()];
  if (chat && chat.unreadCount) {
    chat.unreadCount = 0;
    await persistStore();
  }
  return { ok: true };
}

export async function sendMeterChatReply(jid, text) {
  const mode = await getMeterMonitorAccountMode();
  const sent = await sendMeterChatText(jid, text);
  await ingestMeterMessages([sent], "sent", mode);
  return { ok: true, message: serializeMeterMessage(sent) };
}
