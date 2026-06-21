import express from "express";
import { downloadRiderDeliveredCsv, getDomexAutomationStatus, saveDomexAutomationConfig } from "./domexAutomationService.js";

const router = express.Router();

function sendError(response, error) {
  console.error("[domex-automation]", error);
  response.status(500).json({ error: error.message || "DOMEX automation error." });
}

router.get("/status", async (_request, response) => {
  try {
    response.json(await getDomexAutomationStatus());
  } catch (error) {
    sendError(response, error);
  }
});

router.post("/config", async (request, response) => {
  try {
    response.json(await saveDomexAutomationConfig(request.body));
  } catch (error) {
    sendError(response, error);
  }
});

router.post("/delivered-csv", async (request, response) => {
  try {
    response.json(await downloadRiderDeliveredCsv(request.body));
  } catch (error) {
    sendError(response, error);
  }
});

export default router;
