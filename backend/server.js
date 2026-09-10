import cors from "cors";
import express from "express";
import domexAutomationRoutes from "./domex/domexAutomationRoutes.js";
import meterMonitorRoutes from "./whatsapp/meterMonitorRoutes.js";
import {
  getMeterMonitorStatus,
  startMeterMonitorClient,
  startMeterMonitorScheduler,
} from "./whatsapp/meterMonitorService.js";
import whatsappRoutes from "./whatsapp/whatsappRoutes.js";
import { startAccountBackupScheduler, startSavedAccountClients } from "./whatsapp/accountWhatsappService.js";
import { getWhatsAppStatus, startDailyBackupScheduler, startWhatsAppClient } from "./whatsapp/whatsappService.js";
import { getWhatsAppQueueStatus, startWhatsAppQueueWorker } from "./whatsapp/whatsappQueue.js";
import { startRegionalDispatchAutomation } from "./domex/regionalDispatchAutomationService.js";
import regionalDispatchRoutes from "./domex/regionalDispatchRoutes.js";

const app = express();
const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || "127.0.0.1";
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      const isVercelOrigin = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin || "");
      const isLocalOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin || "");
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin) || isVercelOrigin || isLocalOrigin) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS blocked for origin: ${origin}`));
    },
  }),
);
app.use(express.json({ limit: "25mb" }));

app.get("/api/health", (_request, response) => {
  response.json({ ok: true, service: "daily-report-backend" });
});

app.get("/api/system-health", async (_request, response) => {
  try {
    const [whatsapp, meterMonitor, queue] = await Promise.all([
      getWhatsAppStatus(),
      getMeterMonitorStatus(),
      getWhatsAppQueueStatus(),
    ]);
    response.json({
      ok: true,
      service: "daily-report-backend",
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      whatsapp,
      meterMonitor: {
        status: meterMonitor.status,
        connected: meterMonitor.connected,
        enabled: Boolean(meterMonitor.config?.enabled),
        riderCount: meterMonitor.today?.riderCount || 0,
        submissionCount: meterMonitor.today?.submissionCount || 0,
        missingCount: meterMonitor.today?.missingCount || 0,
      },
      queue,
    });
  } catch (error) {
    response.status(500).json({ ok: false, error: error.message || "System health check failed." });
  }
});

app.use("/api/whatsapp", whatsappRoutes);
app.use("/api/meter-monitor", meterMonitorRoutes);
app.use("/api/domex", domexAutomationRoutes);
app.use("/api/regional-dispatch", regionalDispatchRoutes);

app.listen(port, host, () => {
  console.log(`Daily Report backend running at http://${host}:${port}`);
});

startWhatsAppClient().catch((error) => {
  console.error("[whatsapp-startup]", error);
});
startSavedAccountClients().catch((error) => {
  console.error("[whatsapp-account-startup]", error);
});
startMeterMonitorClient().catch((error) => {
  console.error("[meter-monitor-startup]", error);
});
startDailyBackupScheduler();
startAccountBackupScheduler();
startMeterMonitorScheduler();
startWhatsAppQueueWorker();
startRegionalDispatchAutomation();
