import cors from "cors";
import express from "express";
import whatsappRoutes from "./whatsapp/whatsappRoutes.js";
import { startWhatsAppClient } from "./whatsapp/whatsappService.js";

const app = express();
const port = Number(process.env.PORT || 3001);

app.use(cors({ origin: true }));
app.use(express.json({ limit: "25mb" }));

app.get("/api/health", (_request, response) => {
  response.json({ ok: true, service: "daily-report-backend" });
});

app.use("/api/whatsapp", whatsappRoutes);

app.listen(port, () => {
  console.log(`Daily Report backend running at http://127.0.0.1:${port}`);
});

startWhatsAppClient().catch((error) => {
  console.error("[whatsapp-startup]", error);
});

