import express from "express";
import crypto from "node:crypto";
import { downloadRiderDeliveredCsv, getDomexAutomationStatus, saveDomexAutomationConfig } from "./domexAutomationService.js";

const router = express.Router();
const jobs = new Map();

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

router.post("/delivered-csv/start", (request, response) => {
  const jobId = crypto.randomUUID();
  jobs.set(jobId, { status: "running", createdAt: Date.now() });
  response.status(202).json({ ok: true, jobId, status: "running" });

  downloadRiderDeliveredCsv(request.body)
    .then((result) => {
      jobs.set(jobId, { status: "complete", result, createdAt: Date.now() });
    })
    .catch((error) => {
      console.error("[domex-automation-job]", error);
      jobs.set(jobId, { status: "failed", error: error.message || "DOMEX automation failed.", createdAt: Date.now() });
    });
});

router.get("/delivered-csv/jobs/:jobId", (request, response) => {
  const job = jobs.get(request.params.jobId);
  if (!job) {
    response.status(404).json({ error: "DOMEX automation job was not found or has expired." });
    return;
  }
  response.json(job);
  if (job.status !== "running") {
    setTimeout(() => jobs.delete(request.params.jobId), 60 * 1000);
  }
});

setInterval(() => {
  const expiry = Date.now() - 15 * 60 * 1000;
  for (const [jobId, job] of jobs.entries()) {
    if (job.createdAt < expiry) jobs.delete(jobId);
  }
}, 5 * 60 * 1000).unref();

export default router;
