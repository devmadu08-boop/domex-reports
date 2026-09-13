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
      accountKey: accountKey || "default",
      messageKey: entry.messageKey || null,
      messageKeys: Array.isArray(entry.messageKeys) ? entry.messageKeys : (entry.messageKey ? [entry.messageKey] : []),
      sentAt: entry.sentAt || new Date().toISOString(),
      status: "sent",
      preview: entry.preview || ""
    };

    all.unshift(record);
    if (all.length > 100) all = all.slice(0, 100);

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
  const activeKey = accountKey || target.accountKey || "default";

  const keysToDelete = Array.isArray(target.messageKeys) && target.messageKeys.length > 0
    ? target.messageKeys
    : (target.messageKey ? [target.messageKey] : []);

  if (keysToDelete.length === 0) {
    throw new Error("No message key found for revoking this message");
  }

  const res = await deleteAccountMessage(activeKey, {
    phoneNumber: target.groupId,
    messageKeys: keysToDelete,
    messageKey: target.messageKey
  });

  all[idx] = {
    ...target,
    status: "deleted",
    deletedAt: new Date().toISOString()
  };

  await fs.writeFile(sentMessagesFile, JSON.stringify(all, null, 2));
  return { ok: true, result: res };
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

export async function getRegionalConfig(accountKey) {
  const configs = await readAllConfigs();
  const clean = String(accountKey || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  const candidates = [
    clean,
    clean.startsWith("user-") ? clean.replace(/^user-/, "") : `user-${clean}`,
    accountKey,
    "default"
  ];
  let cfg = null;
  for (const k of candidates) {
    if (configs[k]) {
      cfg = configs[k];
      break;
    }
  }
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
    userRole: cfg?.userRole || ""
  };
}

export async function saveRegionalConfig(accountKey, payload) {
  const configs = await readAllConfigs();
  const clean = String(accountKey || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  const data = {
    enabled: Boolean(payload.enabled),
    groupId: String(payload.groupId || "").trim(),
    geminiApiKey: String(payload.geminiApiKey || "").trim(),
    targets: Array.isArray(payload.targets) ? payload.targets : [],
    checkInStartTime: String(payload.checkInStartTime || "16:00").trim(),
    reportSendTime: String(payload.reportSendTime || "23:30").trim(),
    reminderTimes: Array.isArray(payload.reminderTimes) && payload.reminderTimes.length > 0
      ? payload.reminderTimes.map(t => String(t || "").trim()).filter(Boolean)
      : (payload.reminderTime ? [String(payload.reminderTime).trim()] : ["23:00"]),
    userName: payload.userName || "",
    userRole: payload.userRole || ""
  };
  configs[clean] = data;
  if (clean.startsWith("user-")) {
    configs[clean.replace(/^user-/, "")] = data;
  } else {
    configs[`user-${clean}`] = data;
  }
  await fs.writeFile(configFile, JSON.stringify(configs, null, 2));
  return configs[clean];
}

function getTodayString() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Colombo" }).format(new Date());
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

async function resolveActiveConfig(accountKey) {
  let cfg = await getRegionalConfig(accountKey);
  if (cfg && cfg.enabled) {
    return { config: cfg, configKey: accountKey };
  }
  const allConfigs = await readAllConfigs();
  for (const [key, c] of Object.entries(allConfigs)) {
    if (c && c.enabled) {
      return { config: c, configKey: key };
    }
  }
  for (const [key, c] of Object.entries(allConfigs)) {
    if (c && (c.groupId || (Array.isArray(c.targets) && c.targets.length > 0))) {
      return { config: c, configKey: key };
    }
  }
  return { config: cfg || { enabled: true }, configKey: accountKey };
}

async function sendBotReply(accountKey, recipientJid, messageText) {
  try {
    const cleanKey = String(accountKey || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
    const candidateKeys = [
      accountKey,
      cleanKey,
      cleanKey.startsWith("user-") ? cleanKey.replace(/^user-/, "") : `user-${cleanKey}`,
      "default"
    ];

    let activeKey = accountKey;
    for (const ck of candidateKeys) {
      const st = await getAccountWhatsAppStatus(ck);
      if (st.status === "connected") {
        activeKey = ck;
        break;
      }
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
  // If config.botAuthorizedNumbers is explicitly set, check whitelist.
  // Otherwise (by default), any user interacting with the bot in private chat is allowed!
  if (config.botAuthorizedNumbers && String(config.botAuthorizedNumbers).trim()) {
    const list = String(config.botAuthorizedNumbers)
      .split(",")
      .map(n => n.replace(/\D/g, ""))
      .filter(Boolean);
    if (!isFromMe && !list.includes(senderNumber)) {
      console.log(`[regional-dispatch:bot] Sender ${senderNumber} not in botAuthorizedNumbers whitelist. Ignoring.`);
      return;
    }
  }

  const lower = text.toLowerCase().trim();
  const cleanCmd = lower.replace(/^[./!#]/, "").trim();

  // Interactive Bot Menu
  const menuText = `🤖 *DOMEX Regional Dispatch Assistant*

කරුණාකර ඔබට අවශ්‍ය අංකය හෝ Command එක Reply කරන්න:

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

💡 _ඔබට අවශ්‍ය අංකය (1, 2, 3, 4, 5, 6) හෝ Command එක ටයිප් කර එවන්න._`;

  // 1. Menu triggers
  if (
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
  ) {
    await sendBotReply(accountKey, incomingJid, menuText);
    return;
  }

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

  // 6. Option 5: Delete Last Sent Message
  if (
    cleanCmd === "5" ||
    cleanCmd === "delete" ||
    cleanCmd.includes("delete last") ||
    cleanCmd.includes("delete message") ||
    cleanCmd.includes("delete for everyone")
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
subscribeToAccountMessages(async (accountKey, { messages, type }) => {
  const { config, configKey } = await resolveActiveConfig(accountKey);
  const targetGroupId = String(config.groupId || "").trim();

  for (const msg of messages || []) {
    if (!msg?.message) continue;
    const msgId = msg.key?.id;
    if (msgId && recentBotReplyIds.has(msgId)) continue;

    const incomingJid = String(msg.key?.remoteJid || "").trim();

    let m = msg.message;
    if (m?.ephemeralMessage?.message) m = m.ephemeralMessage.message;
    if (m?.viewOnceMessage?.message) m = m.viewOnceMessage.message;
    if (m?.viewOnceMessageV2?.message) m = m.viewOnceMessageV2.message;
    if (m?.documentWithCaptionMessage?.message) m = m.documentWithCaptionMessage.message;

    const text = (
      m?.conversation ||
      m?.extendedTextMessage?.text ||
      m?.imageMessage?.caption ||
      m?.videoMessage?.caption ||
      m?.documentMessage?.caption ||
      ""
    ).trim();

    if (!text) continue;

    // Ignore messages sent by the bot's own automated replies
    if (isAutomatedSystemMessage(text)) continue;

    const isGroup = incomingJid.endsWith("@g.us");

    // Check if message is a bot command (e.g. .menu, .status, .report, .reminder, .summary, .delete, .saved, or 1-6)
    const isBotCommand = isGroup
      ? /^[./!#](menu|help|start|bot|බොට්|status|live|reminder|report|summary|delete|saved)\b/i.test(text.trim())
      : /^[./!#]?(menu|help|start|bot|බොට්|status|live|reminder|report|summary|delete|saved|1|2|3|4|5|6)\b/i.test(text.trim());

    if (isBotCommand) {
      console.log(`[regional-dispatch:bot] 🤖 Bot command detected: "${text.slice(0, 30)}" from ${incomingJid}`);
      await handleBotCommand(configKey, config, incomingJid, msg, text);
      continue;
    }

    // Case 1: Message in the target dispatch group
    if (isGroup && targetGroupId && incomingJid === targetGroupId) {
      const colomboNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Colombo" }));
      const { h: startH, m: startM } = parseTime(config.checkInStartTime, 16, 0);
      const currentMinutes = colomboNow.getHours() * 60 + colomboNow.getMinutes();
      const startMinutes = startH * 60 + startM;

      if (currentMinutes >= startMinutes) {
        console.log(`[regional-dispatch] 📥 Captured group message (fromMe: ${Boolean(msg.key?.fromMe)}) for ${configKey}: "${text.slice(0, 70)}"`);
        await saveMessage(configKey, text);

        // React with ✅ if the message contains a recognized branch dispatch or numbers!
        const targets = Array.isArray(config.targets) ? config.targets : [];
        const matchedBranch = findBranchInLine(text, targets);
        const hasNumbers = /\b\d{1,5}\b/.test(text);
        if (matchedBranch || hasNumbers) {
          try {
            await reactToAccountMessage(accountKey, {
              remoteJid: incomingJid,
              key: msg.key,
              emoji: "✅"
            });
            console.log(`[regional-dispatch] ✅ Reacted to message from ${msg.key?.participant || msg.key?.remoteJid} for branch ${matchedBranch || 'dispatch'}`);
          } catch (reactErr) {
            console.warn("[regional-dispatch] Reaction error:", reactErr.message || reactErr);
          }
        }

        checkAllAccountsEarlyCompletion().catch(() => {});
      }
      continue;
    }

    // Case 2: Interactive WhatsApp Bot (Direct Messages or Self-Chat / Note to Self)
    if (!isGroup) {
      await handleBotCommand(configKey, config, incomingJid, msg, text);
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

function findBranchInLine(line, targetBranches) {
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

// Helper to find chromium path (copied from rescheduleReportRenderer)
async function findBrowserExecutable() {
  const paths = [
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ];
  for (const p of paths) {
    try {
      await fs.access(p);
      return p;
    } catch (e) {}
  }
  return undefined;
}

// 2. Playwright Renderer
async function renderDispatchImage(date, rows, summary, userName, userRole) {
  const browser = await chromium.launch({
    headless: true,
    executablePath: await findBrowserExecutable(),
    args: ["--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage"],
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

  await page.setContent(html, { waitUntil: "networkidle" });
  const element = await page.$("#capture-card");
  
  const buffer = await element.screenshot({ type: "png", omitBackground: false });
  await browser.close();
  
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

// 3. Cron Schedules
async function runRegionalAutomation(mode = "reminder", manualAccountKey = null, customTargets = null) {
  await ensureDir(dataDir);
  const configs = await readAllConfigs();
  const keys = manualAccountKey ? [manualAccountKey] : Object.keys(configs);
  let totalSent = 0;
  const seenGroupIds = new Set();

  for (const requestedKey of keys) {
    const config = await getRegionalConfig(requestedKey);
    if (!config || !config.enabled) {
      if (manualAccountKey) throw new Error("Automation is disabled. Please check 'Enable Auto Report' and save settings.");
      continue;
    }
    if (!config.groupId) {
      if (manualAccountKey) throw new Error("No WhatsApp Group selected. Please select a group and save settings.");
      continue;
    }

    if (!manualAccountKey && seenGroupIds.has(config.groupId)) {
      console.log(`[regional-dispatch] Group ${config.groupId} already processed in this automation cycle. Skipping duplicate key ${requestedKey}.`);
      continue;
    }

    // Resolve which runtime key is actually connected
    const cleanKey = String(requestedKey).trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
    const candidateKeys = [
      cleanKey.startsWith("user-") ? cleanKey : `user-${cleanKey}`,
      cleanKey.replace(/^user-/, ""),
      requestedKey
    ];

    let activeKey = null;
    for (const ck of candidateKeys) {
      const st = await getAccountWhatsAppStatus(ck);
      if (st.status === "connected") {
        activeKey = ck;
        break;
      }
    }

    if (!activeKey) {
      if (manualAccountKey) throw new Error("WhatsApp is disconnected. Please scan QR code in Settings to connect.");
      continue;
    }

    let targets = (Array.isArray(customTargets) && customTargets.length > 0)
      ? customTargets
      : (Array.isArray(config.targets) && config.targets.length > 0 ? config.targets : []);

    // Persist targets to config.targets if provided
    if (Array.isArray(customTargets) && customTargets.length > 0) {
      config.targets = customTargets.map(t => ({
        branch: t.branch || t.branch_name,
        target: Number(t.target) || 0
      }));
      await saveRegionalConfig(activeKey, config);
    }

    const rawText = await getTodayMessages(activeKey);
    const branchNames = targets.map(t => t.branch || t.branch_name).filter(Boolean);

    // Parse using OpenRouter
    let extractedData = [];
    if (config.geminiApiKey && rawText.trim()) {
      extractedData = await parseWithOpenRouter(config.geminiApiKey, rawText, branchNames);
    }

    const submittedMap = {};
    for (const item of extractedData) {
      if (item.branch && item.dispatch != null) {
        const val = Number(item.dispatch);
        if (!isNaN(val)) {
          // Find canonical target branch via fuzzy matcher
          const canonical = findBranchInLine(item.branch, targets) || item.branch;
          submittedMap[canonical] = (submittedMap[canonical] || 0) + val;
        }
      }
    }

    // Local Regex Fallback with Fuzzy Matching for all lines
    if (rawText.trim()) {
      for (const line of rawText.split("\n")) {
        const fuzzyBranch = findBranchInLine(line, targets);
        if (fuzzyBranch && submittedMap[fuzzyBranch] == null) {
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
        if (manualAccountKey) {
          return { ok: true, sent: 0, message: "All branches have already submitted their dispatch counts. No reminder needed." };
        }
        continue;
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

        if (phone && phone.length > 13) {
          const resolved = await resolveLidPhone(phone);
          if (resolved) {
            if (!lid) lid = `${phone}@lid`;
            phone = resolved;
            jid = `${resolved}@s.whatsapp.net`;
          }
        }

        if (jid && !mentionJids.includes(jid)) {
          mentionJids.push(jid);
        }
        if (lid && !mentionJids.includes(lid)) {
          mentionJids.push(lid);
        }

        const tagStr = phone ? ` @${phone.replace(/\D/g, '')}` : (t.assigned_name ? ` (${t.assigned_name})` : "");
        return `❌ ${bName} (Target: ${tgt})${tagStr}`;
      }));

      const reminderMsg = `🚨 *DOMEX Dispatch Count Reminder*\n\nකරුණාකර පහත ශාඛාවන් රාත්‍රී 11.30 ට පෙර ඔබගේ Dispatch Counts ලබා දෙන්න:\n\n*ලබා දී නොමැති ශාඛාවන්:*\n${unsubmittedLines.join("\n")}\n\n*ලබා දී ඇති ශාඛාවන්:*\n${submitted.length > 0 ? submitted.map(b => `✅ ${b}: ${submittedMap[b]}`).join("\n") : "කිසිවක් නැත"}`;
      
      const sendRes = await sendAccountRecipientText(activeKey, { 
        phoneNumber: config.groupId, 
        message: reminderMsg,
        mentions: mentionJids
      });
      console.log(`[regional-dispatch] Sent reminder to ${config.groupId} via ${activeKey} (mentions: ${mentionJids.length})`);
      totalSent++;
      seenGroupIds.add(config.groupId);

      // Send personal WhatsApp reminder to each unsubmitted branch's assigned person
      for (const t of unsubmittedTargets) {
        const bName = t.branch || t.branch_name;
        const tgt = targetMap[bName] || 0;
        let targetPhone = t.assigned_phone || t.assignedPhone || t.assigned_jid || t.assignedJid;
        if (targetPhone && String(targetPhone).replace(/\D/g, "").length > 13) {
          const resolved = await resolveLidPhone(targetPhone);
          if (resolved) targetPhone = resolved;
        }
        if (targetPhone) {
          const personalMsg = `🚨 *DOMEX Dispatch Reminder*\n\nසුභ සන්ධ්‍යාවක්! කරුණාකර ඔබගේ *${bName}* ශාඛාවේ අද දින Dispatch Count එක රාත්‍රී 11.30 ට පෙර ලබා දෙන්න.\n\n🎯 දෛනික Target එක: *${tgt}*\n\nස්තූතියි!`;
          try {
            await sendAccountRecipientText(activeKey, {
              phoneNumber: targetPhone,
              message: personalMsg
            });
            console.log(`[regional-dispatch] 👤 Sent personal reminder to ${bName} (${targetPhone})`);
          } catch (pErr) {
            console.warn(`[regional-dispatch] Failed personal reminder to ${bName} (${targetPhone}):`, pErr.message || pErr);
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

      const allConfigs = await readAllConfigs();
      const keys = Object.keys(allConfigs);
      if (!keys.includes("default")) keys.push("default");

      for (const key of keys) {
        const config = await getRegionalConfig(key);
        if (!config || !config.enabled || !config.groupId) continue;

        const reportKey = `${dateStr}_${key}_report`;
        const { h: repH, m: repM } = parseTime(config.reportSendTime, 23, 30);

        // 1. Check Multiple Reminder Times
        const reminderTimes = Array.isArray(config.reminderTimes) && config.reminderTimes.length > 0
          ? config.reminderTimes
          : (config.reminderTime ? [config.reminderTime] : ["23:00"]);

        for (const rTime of reminderTimes) {
          const { h: remH, m: remM } = parseTime(rTime, 23, 0);
          const reminderKey = `${dateStr}_${key}_reminder_${rTime}`;

          if (isTimeMatch(colomboTime, remH, remM) && !triggeredReminders.has(reminderKey)) {
            triggeredReminders.add(reminderKey);
            if (triggeredReports.has(reportKey)) {
              console.log(`[regional-dispatch] ⏰ Skipping reminder at ${rTime} for ${key} because final report has already been sent today.`);
            } else {
              console.log(`[regional-dispatch] ⏰ Triggering scheduled reminder (${rTime}) for ${key}`);
              runRegionalAutomation("reminder", key).catch(e => console.error(`[regional-dispatch] Reminder error for ${key}:`, e));
            }
          }
        }

        // 2. Check Report Send Time
        if (isTimeMatch(colomboTime, repH, repM) && !triggeredReports.has(reportKey)) {
          triggeredReports.add(reportKey);
          console.log(`[regional-dispatch] ⏰ Triggering scheduled report (${config.reportSendTime || '23:30'}) for ${key}`);
          runRegionalAutomation("report", key).catch(e => console.error(`[regional-dispatch] Report error for ${key}:`, e));
        }

        // 3. Auto-Send & Save Early if 100% of branches have submitted before report send time
        const { h: startH, m: startM } = parseTime(config.checkInStartTime, 16, 0);
        const currentMinutes = hours * 60 + minutes;
        const startMinutes = startH * 60 + startM;
        if (currentMinutes >= startMinutes && !triggeredReports.has(reportKey)) {
          checkAllAccountsEarlyCompletion().catch(() => {});
        }
      }
    } catch (schedErr) {
      console.error("[regional-dispatch] Scheduler error:", schedErr.message || schedErr);
    }
  }, 10000).unref();

  console.log("[regional-dispatch] Automation scheduler active with customizable check-in, report, and multiple reminder times");
}

export async function manualTrigger(accountKey, mode, customTargets = null) {
  return await runRegionalAutomation(mode, accountKey, customTargets);
}

export async function getRegionalLiveStatus(accountKey, customTargets = null) {
  const config = await getRegionalConfig(accountKey);
  const rawText = await getTodayMessages(accountKey);
  const targets = (Array.isArray(customTargets) && customTargets.length > 0)
    ? customTargets
    : (Array.isArray(config.targets) ? config.targets : []);

  // Save targets to config if provided and not yet saved
  if (Array.isArray(customTargets) && customTargets.length > 0 && (!config.targets || config.targets.length === 0)) {
    config.targets = customTargets.map(t => ({
      branch: t.branch || t.branch_name,
      target: Number(t.target) || 0
    }));
    await saveRegionalConfig(accountKey, config);
  }

  const submittedMap = {};
  if (rawText && rawText.trim()) {
    for (const line of rawText.split("\n")) {
      const fuzzyBranch = findBranchInLine(line, targets);
      if (fuzzyBranch && submittedMap[fuzzyBranch] == null) {
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
  if (lastReportTriggerDate === dateStr) return;

  const colomboNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Colombo" }));
  const hours = colomboNow.getHours();
  if (hours < 12) return;

  isEarlyChecking = true;
  try {
    const configs = await readAllConfigs();
    for (const key of Object.keys(configs)) {
      if (lastReportTriggerDate === dateStr) break;
      const cfg = configs[key];
      if (cfg?.enabled && cfg?.groupId && Array.isArray(cfg?.targets) && cfg.targets.length > 0) {
        const live = await getRegionalLiveStatus(key);
        if (
          live &&
          live.enabled &&
          live.totalBranches > 0 &&
          live.unsubmittedCount === 0 &&
          live.submittedCount >= live.totalBranches
        ) {
          console.log(`[regional-dispatch] 🎯 100% Branches Submitted (${live.submittedCount}/${live.totalBranches})! Auto-sending and saving report early for ${key} without waiting for 11:30 PM...`);
          lastReportTriggerDate = dateStr;
          await runRegionalAutomation("report", key);
          break;
        }
      }
    }
  } catch (err) {
    console.error("[regional-dispatch] Early completion check error:", err);
  } finally {
    isEarlyChecking = false;
  }
}
