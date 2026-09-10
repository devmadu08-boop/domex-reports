import fs from "node:fs/promises";
import path from "node:path";
import { subscribeToAccountMessages, sendAccountRecipientText, sendAccountRecipientReport, getAccountWhatsAppStatus } from "../whatsapp/accountWhatsappService.js";
import { chromium } from "playwright-core";

const dataDir = path.resolve("backend", "data", "regional-dispatch");
const configFile = path.join(dataDir, "config.json");
const messagesDir = path.join(dataDir, "messages");

// Helper to ensure directory exists
async function ensureDir(dir) {
  try { await fs.mkdir(dir, { recursive: true }); } catch (e) {}
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
  return configs[accountKey] || { enabled: false, groupId: "", geminiApiKey: "", targets: [] };
}

export async function saveRegionalConfig(accountKey, payload) {
  const configs = await readAllConfigs();
  configs[accountKey] = {
    enabled: Boolean(payload.enabled),
    groupId: payload.groupId || "",
    geminiApiKey: payload.geminiApiKey || "",
    targets: Array.isArray(payload.targets) ? payload.targets : [],
    userName: payload.userName || "",
    userRole: payload.userRole || ""
  };
  await fs.writeFile(configFile, JSON.stringify(configs, null, 2));
  return configs[accountKey];
}

function getTodayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function saveMessage(accountKey, text) {
  const today = getTodayString();
  await ensureDir(path.join(messagesDir, today));
  const msgFile = path.join(messagesDir, today, `${accountKey}.txt`);
  
  try {
    await fs.appendFile(msgFile, text + "\n---\n");
  } catch (error) {
    console.error("[regional-dispatch] Error saving message", error);
  }
}

export async function getTodayMessages(accountKey) {
  const today = getTodayString();
  const msgFile = path.join(messagesDir, today, `${accountKey}.txt`);
  try {
    return await fs.readFile(msgFile, "utf8");
  } catch (error) {
    return "";
  }
}

// 1. Subscribe to messages from accountWhatsappService
subscribeToAccountMessages(async (accountKey, { messages, type }) => {
  if (type !== "notify") return;
  const config = await getRegionalConfig(accountKey);
  if (!config.enabled || !config.groupId) return;

  const now = new Date();
  const hours = now.getHours();
  // Only collect between 16:00 and 23:30 (16 to 23)
  if (hours < 16 || hours > 23) return;

  for (const msg of messages) {
    const isGroup = msg.key?.remoteJid === config.groupId;
    if (!isGroup) continue;
    if (msg.key?.fromMe) continue;

    const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
    if (text && text.trim()) {
      await saveMessage(accountKey, text.trim());
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

  const page = await browser.newPage({ viewport: { width: 600, height: 1200 } });
  
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
        <p style="font-size: 24px; font-weight: 900; color: #071537; margin: 4px 0 0 0; line-height: 1;">${summary.totalTarget}</p>
      </div>
      <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 16px; padding: 12px; text-align: center; box-sizing: border-box;">
        <p style="font-size: 10px; font-weight: 900; text-transform: uppercase; color: #1e40af; margin: 0;">Dispatched</p>
        <p style="font-size: 24px; font-weight: 900; color: #1e3a8a; margin: 4px 0 0 0; line-height: 1;">${summary.totalDispatch}</p>
      </div>
      <div style="background-color: ${summary.overallPercentage >= 100 ? "#ecfdf5" : summary.overallPercentage >= 70 ? "#fffbeb" : "#fff1f2"}; color: ${summary.overallPercentage >= 100 ? "#065f46" : summary.overallPercentage >= 70 ? "#92400e" : "#9f1239"}; border: 1px solid ${summary.overallPercentage >= 100 ? "#a7f3d0" : summary.overallPercentage >= 70 ? "#fde68a" : "#fecdd3"}; border-radius: 16px; padding: 12px; text-align: center; box-sizing: border-box;">
        <p style="font-size: 10px; font-weight: 900; text-transform: uppercase; margin: 0;">Achievement</p>
        <p style="font-size: 24px; font-weight: 900; margin: 4px 0 0 0; line-height: 1;">${summary.overallPercentage}%</p>
      </div>
    </div>
  `;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          * { box-sizing: border-box !important; letter-spacing: normal !important; }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background-color: #ffffff !important;
            color: #071537 !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
            -webkit-font-smoothing: antialiased;
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
              <!-- Empty logo placeholder for backend -->
              <div style="height: 48px; width: 48px; background: #f8fafc; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 11px; color: #94a3b8;">DOMEX</div>
              <div style="flex: 1; min-width: 0;">
                <h2 style="font-size: 18px; font-weight: 900; text-transform: uppercase; color: #071537; margin: 0 0 2px 0; line-height: 1.2; white-space: nowrap;">Regional Dispatch Performance</h2>
                <p style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: #6d28d9; margin: 0 0 6px 0;">Daily Courier Branch Analytics</p>
                <div style="margin-top: 6px;">
                  <div style="display: inline-block; background-color: #f5f3ff; color: #6b21a8; padding: 4px 12px; border-radius: 8px; font-size: 11px; font-weight: 800; border: 1px solid #ddd6fe; line-height: 18px; white-space: nowrap;">
                    👤 Prepared by: <strong style="color: #4c1d95;">${userName}</strong> (${userRole})
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
  
  const buffer = await element.screenshot({ type: "png", omitBackground: true });
  await browser.close();
  
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

// 3. Cron Schedules
async function runRegionalAutomation(mode = "reminder", manualAccountKey = null) {
  await ensureDir(dataDir);
  const configs = await readAllConfigs();
  const keys = manualAccountKey ? [manualAccountKey] : Object.keys(configs);
  
  for (const accountKey of keys) {
    const config = configs[accountKey];
    if (!config || !config.enabled || !config.groupId || !config.geminiApiKey || config.targets.length === 0) continue;
    
    // Make sure socket is alive
    const status = await getAccountWhatsAppStatus(accountKey);
    if (status.status !== "connected") continue;

    const rawText = await getTodayMessages(accountKey);
    const branchNames = config.targets.map(t => t.branch);
    
    // Parse using OpenRouter
    const extractedData = await parseWithOpenRouter(config.geminiApiKey, rawText, branchNames);
    
    // Calculate unsubmitted and submitted
    const submittedMap = {};
    for (const item of extractedData) {
      if (item.branch && item.dispatch != null) {
        // Ensure dispatch is a number
        const val = Number(item.dispatch);
        if (!isNaN(val)) {
          submittedMap[item.branch] = (submittedMap[item.branch] || 0) + val;
        }
      }
    }
    
    const unsubmitted = config.targets.filter(t => submittedMap[t.branch] == null).map(t => t.branch);
    const submitted = config.targets.filter(t => submittedMap[t.branch] != null).map(t => t.branch);
    
    if (mode === "reminder") {
      if (unsubmitted.length === 0) continue; // Everyone submitted
      const reminderMsg = `🚨 *Dispatch Count Reminder*\n\nකරුණාකර අදාල ශාඛාවන් 11.30 ට පෙර ඔබගේ Dispatch Counts ලබා දෙන්න:\n\n*ලබා දී නොමැති ශාඛාවන්:*\n${unsubmitted.map(b => "❌ " + b).join("\n")}\n\n*ලබා දී ඇති ශාඛාවන්:*\n${submitted.length > 0 ? submitted.map(b => "✅ " + b).join("\n") : "කිසිවක් නැත"}`;
      await sendAccountRecipientText(accountKey, { phoneNumber: config.groupId, message: reminderMsg });
      console.log(`[regional-dispatch] Sent 11PM reminder to ${accountKey}`);
    } 
    else if (mode === "report") {
      // Generate Image
      const dateStr = getTodayString();
      const rows = [];
      let totalTarget = 0;
      let totalDispatch = 0;
      
      for (const t of config.targets) {
        const actual = submittedMap[t.branch] || 0;
        const perc = t.target > 0 ? Math.round((actual / t.target) * 100) : 0;
        rows.push({ branch: t.branch, target: t.target, dispatch: actual, percentage: perc });
        totalTarget += t.target;
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
      caption += `*ලබා දී ඇති ශාඛාවන්:*\n${submitted.length > 0 ? submitted.map(b => "✅ " + b).join("\n") : "කිසිවක් නැත"}\n\n`;
      if (unsubmitted.length > 0) {
        caption += `*ලබා දී නොමැති ශාඛාවන්:*\n${unsubmitted.map(b => "❌ " + b).join("\n")}`;
      } else {
        caption += `✅ *සියලුම ශාඛාවන් Dispatch Counts ලබා දී ඇත!*`;
      }
      
      if (base64Img) {
        await sendAccountRecipientReport(accountKey, { 
          phoneNumber: config.groupId, 
          imageDataUrl: base64Img,
          caption: caption 
        });
      } else {
        await sendAccountRecipientText(accountKey, { phoneNumber: config.groupId, message: caption });
      }
      console.log(`[regional-dispatch] Sent 11:30PM report to ${accountKey}`);
    }
  }
}

// Start Cron-like Scheduler
export function startRegionalDispatchAutomation() {
  setInterval(() => {
    const d = new Date();
    // Convert current UTC time to Asia/Colombo
    const colomboTime = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Colombo" }));
    const hours = colomboTime.getHours();
    const minutes = colomboTime.getMinutes();
    const seconds = colomboTime.getSeconds();

    if (hours === 23 && minutes === 0 && seconds === 0) {
      runRegionalAutomation("reminder").catch(e => console.error("[regional-dispatch] Reminder error", e));
    }
    if (hours === 23 && minutes === 30 && seconds === 0) {
      runRegionalAutomation("report").catch(e => console.error("[regional-dispatch] Report error", e));
    }
  }, 1000).unref();
  
  console.log("[regional-dispatch] Automation scheduler started");
}

export async function manualTrigger(accountKey, mode) {
  await runRegionalAutomation(mode, accountKey);
}

export async function getRegionalLiveStatus(accountKey, customTargets = null) {
  const config = await getRegionalConfig(accountKey);
  const rawText = await getTodayMessages(accountKey);
  const targets = (Array.isArray(customTargets) && customTargets.length > 0)
    ? customTargets
    : (Array.isArray(config.targets) ? config.targets : []);

  const branchNames = targets.map((t) => t.branch || t.branch_name).filter(Boolean);

  const submittedMap = {};
  if (rawText && rawText.trim()) {
    for (const bName of branchNames) {
      const cleanBranch = bName.toLowerCase().replace(/[^a-z0-9]/g, "");
      const lines = rawText.split("\n");
      for (const line of lines) {
        const cleanLine = line.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (cleanLine.includes(cleanBranch)) {
          const numbers = line.match(/\b\d{1,5}\b/g);
          if (numbers && numbers.length > 0) {
            const val = parseInt(numbers[numbers.length - 1], 10);
            if (!isNaN(val)) {
              submittedMap[bName] = val;
            }
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
