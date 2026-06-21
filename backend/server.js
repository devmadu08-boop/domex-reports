import cors from "cors";
import express from "express";
import domexAutomationRoutes from "./domex/domexAutomationRoutes.js";
import whatsappRoutes from "./whatsapp/whatsappRoutes.js";
import { startDailyBackupScheduler, startWhatsAppClient } from "./whatsapp/whatsappService.js";

const app = express();
const port = Number(process.env.PORT || 3001);
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
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

app.use("/api/whatsapp", whatsappRoutes);
app.use("/api/domex", domexAutomationRoutes);

app.listen(port, () => {
  console.log(`Daily Report backend running at http://127.0.0.1:${port}`);
});

startWhatsAppClient().catch((error) => {
  console.error("[whatsapp-startup]", error);
});
startDailyBackupScheduler();
