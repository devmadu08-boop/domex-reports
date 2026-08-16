import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const queuePath = path.resolve("backend", "data", "whatsapp-send-queue.json");
const MAX_HISTORY = 100;
const RETRY_DELAYS = [30_000, 120_000, 300_000, 900_000];

let processor = null;
let processing = false;
let workerStarted = false;
let queueLock = Promise.resolve();

function withQueueLock(task) {
  const operation = queueLock.then(task, task);
  queueLock = operation.catch(() => {});
  return operation;
}

async function readQueue() {
  try {
    const value = JSON.parse(await fs.readFile(queuePath, "utf8"));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

async function writeQueue(queue) {
  await fs.mkdir(path.dirname(queuePath), { recursive: true });
  await fs.writeFile(queuePath, JSON.stringify(queue.slice(0, MAX_HISTORY), null, 2));
}

function compactPayload(payload, keepMedia = true) {
  if (keepMedia) return payload;
  return {
    ...payload,
    imageDataUrl: payload?.imageDataUrl ? "[sent image removed]" : undefined,
    imageDataUrls: payload?.imageDataUrls?.length ? [`[${payload.imageDataUrls.length} sent images removed]`] : undefined,
  };
}

function nextRetryAt(attempts) {
  const delay = RETRY_DELAYS[Math.min(Math.max(attempts - 1, 0), RETRY_DELAYS.length - 1)];
  return new Date(Date.now() + delay).toISOString();
}

export function configureWhatsAppQueue(nextProcessor) {
  processor = nextProcessor;
}

export async function sendWithWhatsAppQueue(type, payload, accountKey = "default") {
  if (!processor) throw new Error("WhatsApp queue processor is not configured.");
  const job = {
    id: crypto.randomUUID(),
    type,
    accountKey,
    payload,
    status: "pending",
    attempts: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nextRetryAt: new Date().toISOString(),
    lastError: "",
  };
  await withQueueLock(async () => {
    const queue = await readQueue();
    await writeQueue([job, ...queue]);
  });
  const result = await processJob(job.id);
  return result.status === "sent"
    ? { ...(result.result || {}), ok: true, queued: false, job: sanitizeJob(result), result: result.result }
    : { ok: true, queued: true, job: sanitizeJob(result), message: "WhatsApp send queued and will retry automatically." };
}

async function processJob(jobId) {
  const claim = await withQueueLock(async () => {
    const queue = await readQueue();
    const index = queue.findIndex((item) => item.id === jobId);
    if (index < 0) throw new Error("WhatsApp queue job was not found.");
    if (queue[index].status === "sent") return { job: queue[index], claimed: false };
    if (
      queue[index].status === "sending"
      && Date.now() - new Date(queue[index].updatedAt || 0).getTime() < 300_000
    ) {
      return { job: queue[index], claimed: false };
    }

    queue[index].status = "sending";
    queue[index].attempts = Number(queue[index].attempts || 0) + 1;
    queue[index].updatedAt = new Date().toISOString();
    await writeQueue(queue);
    return { job: structuredClone(queue[index]), claimed: true };
  });
  const job = claim.job;
  if (!claim.claimed) return job;

  try {
    const result = await processor(job.type, job.payload);
    job.status = "sent";
    job.result = result;
    job.sentAt = new Date().toISOString();
    job.updatedAt = job.sentAt;
    job.lastError = "";
    job.payload = compactPayload(job.payload, false);
  } catch (error) {
    job.status = "failed";
    job.lastError = error?.message || "WhatsApp send failed.";
    job.updatedAt = new Date().toISOString();
    job.nextRetryAt = nextRetryAt(job.attempts);
  }

  await withQueueLock(async () => {
    const queue = await readQueue();
    const index = queue.findIndex((item) => item.id === jobId);
    if (index < 0) throw new Error("WhatsApp queue job was removed while sending.");
    queue[index] = job;
    await writeQueue(queue);
  });
  return job;
}

export async function processDueWhatsAppJobs() {
  if (processing || !processor) return;
  processing = true;
  try {
    const queue = await readQueue();
    const now = Date.now();
    const dueJobs = queue
      .filter((job) => {
        if (job.status === "pending" || job.status === "failed") {
          return new Date(job.nextRetryAt || 0).getTime() <= now;
        }
        return job.status === "sending" && now - new Date(job.updatedAt || 0).getTime() >= 300_000;
      })
      .slice(0, 3);
    for (const job of dueJobs) {
      await processJob(job.id);
    }
  } finally {
    processing = false;
  }
}

export function startWhatsAppQueueWorker() {
  if (workerStarted) return;
  workerStarted = true;
  setInterval(() => {
    processDueWhatsAppJobs().catch((error) => {
      console.error("[whatsapp-queue]", error.message || error);
    });
  }, 15_000);
}

export async function retryWhatsAppJob(jobId, accountKey = "default") {
  await withQueueLock(async () => {
    const queue = await readQueue();
    const job = queue.find((item) => item.id === jobId);
    if (!job) throw new Error("WhatsApp queue job was not found.");
    if ((job.accountKey || "default") !== accountKey) throw new Error("WhatsApp queue job belongs to another login.");
    job.status = "pending";
    job.nextRetryAt = new Date().toISOString();
    job.updatedAt = new Date().toISOString();
    await writeQueue(queue);
  });
  return sanitizeJob(await processJob(jobId));
}

export async function retryFailedWhatsAppJobs(accountKey = "default") {
  await withQueueLock(async () => {
    const queue = await readQueue();
    const now = new Date().toISOString();
    queue.forEach((job) => {
      if (job.status === "failed" && (job.accountKey || "default") === accountKey) {
        job.status = "pending";
        job.nextRetryAt = now;
        job.updatedAt = now;
      }
    });
    await writeQueue(queue);
  });
  await processDueWhatsAppJobs();
  return getWhatsAppQueueStatus(accountKey);
}

export async function getWhatsAppQueueStatus(accountKey = "default") {
  const allJobs = await withQueueLock(readQueue);
  const queue = allJobs.filter((job) => (job.accountKey || "default") === accountKey);
  const counts = queue.reduce(
    (result, job) => ({ ...result, [job.status]: (result[job.status] || 0) + 1 }),
    { pending: 0, sending: 0, failed: 0, sent: 0 },
  );
  return {
    counts,
    jobs: queue.slice(0, 25).map(sanitizeJob),
  };
}

function sanitizeJob(job) {
  return {
    id: job.id,
    type: job.type,
    accountKey: job.accountKey || "default",
    status: job.status,
    attempts: job.attempts,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    sentAt: job.sentAt || "",
    nextRetryAt: job.nextRetryAt || "",
    lastError: job.lastError || "",
  };
}
