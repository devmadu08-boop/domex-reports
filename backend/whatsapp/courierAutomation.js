import { buildCourierSummary, getCourierCompletion } from "../../shared/courierSummary.js";
import { DEFAULT_REPORT_CAPTIONS, formatReportCaption } from "../../shared/whatsappCaptions.js";
import { getColomboClock } from "./schedule.js";

function groups(config) {
  return [...new Set((config.defaultGroupJids?.length ? config.defaultGroupJids : [config.defaultGroupJid])
    .map((jid) => String(jid || "").trim()).filter(Boolean))];
}

export function getCourierAutomationReadiness(config, now = new Date()) {
  const { date, hour } = getColomboClock(now);
  const completion = getCourierCompletion(config.latestBackupSnapshot, date);
  const record = config.courierAutoReports?.[date];
  const enabled = config.latestBackupSnapshot?.settings?.courierAutoSendEnabled !== false;
  return { date, ...completion, enabled, groupCount: groups(config).length, scheduledTime: "20:00 Asia/Colombo",
    due: enabled && completion.rowCount > 0 && (completion.complete || hour >= 20) && record?.status !== "sent",
    reason: completion.complete ? "all-couriers-complete" : "20:00-deadline",
    status: record?.status || "waiting", sentAt: record?.sentAt || "", lastError: record?.lastError || "",
    sentGroupCount: record?.sentGroupJids?.length || 0 };
}

export function createCourierAutomation({ readConfig, updateConfig, connected, sendImages, render, now = () => new Date() }) {
  let running = false;
  async function saveRecord(date, record) {
    await updateConfig((config) => {
      const records = { ...config.courierAutoReports, [date]: record };
      return { courierAutoReports: Object.fromEntries(Object.entries(records).sort(([a], [b]) => b.localeCompare(a)).slice(0, 14)) };
    });
  }
  function caption(config, report) {
    return formatReportCaption(config.latestBackupSnapshot?.settings?.whatsappCaptionTemplates?.courier || DEFAULT_REPORT_CAPTIONS.courier,
      { title: "Branch Courier Performance Report", branch: report.branchName, date: report.date });
  }
  return {
    async status() {
      return { ...getCourierAutomationReadiness(await readConfig(), now()), connected: connected() };
    },
    async preview(date) {
      const report = buildCourierSummary((await readConfig()).latestBackupSnapshot, date);
      const image = await render(report);
      return { reportDate: date, imageDataUrl: `data:image/png;base64,${image.toString("base64")}` };
    },
    async manual({ date }) {
      const config = await readConfig();
      if (!connected()) throw new Error("Connect this account's WhatsApp in Settings before sending.");
      const targets = groups(config);
      if (!targets.length) throw new Error("Select and save the default WhatsApp groups in Settings.");
      const report = buildCourierSummary(config.latestBackupSnapshot, date);
      const image = await render(report);
      for (const jid of targets) await sendImages(jid, [image], caption(config, report));
      // Manual sends may repeat, and never consume the once-per-day automatic send.
      return { ok: true, sentCount: targets.length, reportDate: date, sentAt: now().toISOString() };
    },
    async run() {
      if (running || !connected()) return { skipped: true };
      running = true;
      let record;
      let date;
      try {
        const config = await readConfig();
        const readiness = getCourierAutomationReadiness(config, now());
        date = readiness.date;
        if (!readiness.enabled || config.courierAutoReports?.[date]?.status === "sent") return { skipped: true };
        record = config.courierAutoReports?.[date];
        if (!record && !readiness.due) return { skipped: true };
        if (!groups(config).length) return { skipped: true, reason: "Default WhatsApp groups are not selected." };
        if (!record) {
          const report = buildCourierSummary(config.latestBackupSnapshot, date);
          record = { status: "pending", report,
            caption: caption(config, report),
            reason: readiness.reason, createdAt: now().toISOString(), sentGroupJids: [], lastError: "" };
          await saveRecord(date, record);
        }
        const image = await render(record.report);
        const targets = groups(await readConfig());
        if (!targets.length) return { skipped: true, reason: "Default WhatsApp groups are not selected." };
        // Midnight is a hard boundary: yesterday's automatic report must not be sent the next day.
        for (const jid of targets) {
          if (getColomboClock(now()).date !== date) return { skipped: true, reason: "Report date has ended." };
          if (record.sentGroupJids.includes(jid)) continue;
          await sendImages(jid, [image], record.caption);
          record = { ...record, sentGroupJids: [...record.sentGroupJids, jid], lastError: "" };
          await saveRecord(date, record);
        }
        record = { ...record, status: "sent", sentAt: now().toISOString(), lastError: "" };
        await saveRecord(date, record);
        return { ok: true, sentCount: record.sentGroupJids.length, reportDate: date };
      } catch (error) {
        if (record && date) await saveRecord(date, { ...record, status: "pending", lastError: error.message || "Automatic courier send failed." });
        throw error;
      } finally {
        running = false;
      }
    },
  };
}
