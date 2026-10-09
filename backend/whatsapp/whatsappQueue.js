import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const queuePath = path.resolve(process.env.WHATSAPP_QUEUE_PATH || "backend/data/whatsapp-send-queue.json");
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
  const active = queue.filter((job) => job.status !== "sent");
  const history = queue.filter((job) => job.status === "sent").slice(0, MAX_HISTORY);
  const temporary = queuePath + ".next";
  await fs.writeFile(temporary, JSON.stringify([...active, ...history], null, 2));
  await fs.rename(temporary, queuePath);
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
  scheduleProcessing();
  return { ok: true, queued: true, job: sanitizeJob(job), message: "Saved to your WhatsApp queue. Delivery continues in the background." };
}

async function processJob(jobId) {
  const claim = await withQueueLock(async () => {
    const queue = await readQueue();
    const index = queue.findIndex((item) => item.id === jobId);
    if (index < 0) return { job: null, claimed: false };
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
    const result = await processor(job.type, { ...job.payload, __whatsappAccountKey: job.accountKey || "default" });
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
    if (index < 0) return;
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
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
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
  scheduleProcessing();
  setInterval(() => {
    processDueWhatsAppJobs().catch((error) => {
      console.error("[whatsapp-queue]", error.message || error);
    });
  }, 15_000);
}

function scheduleProcessing() {
  setImmediate(() => processDueWhatsAppJobs().catch((error) => console.error("[whatsapp-queue]", error.message || error)));
}

function findAccountJob(queue, jobId, accountKey) {
  const job = queue.find((item) => item.id === jobId && (item.accountKey || "default") === accountKey);
  if (!job) throw Object.assign(new Error("WhatsApp queue message was not found for this account."), { statusCode: 404 });
  return job;
}

function requireEditable(job) {
  if (!["pending", "failed"].includes(job.status)) {
    throw Object.assign(new Error("Only pending or failed messages can be edited or retried."), { statusCode: 409 });
  }
}

export async function retryWhatsAppJob(jobId, accountKey = "default") {
  const job = await withQueueLock(async () => {
    const queue = await readQueue();
    const job = findAccountJob(queue, jobId, accountKey);
    requireEditable(job);
    Object.assign(job, { status: "pending", nextRetryAt: new Date().toISOString(), updatedAt: new Date().toISOString(), lastError: "" });
    await writeQueue(queue);
    return sanitizeJob(job);
  });
  scheduleProcessing();
  return job;
}

export async function retryFailedWhatsAppJobs(accountKey = "default") {
  await withQueueLock(async () => {
    const queue = await readQueue();
    const now = new Date().toISOString();
    queue.forEach((job) => {
      if (job.status === "failed" && (job.accountKey || "default") === accountKey) {
        Object.assign(job, { status: "pending", nextRetryAt: now, updatedAt: now });
      }
    });
    await writeQueue(queue);
  });
  scheduleProcessing();
  return getWhatsAppQueueStatus(accountKey);
}

export async function getWhatsAppQueueJob(jobId, accountKey = "default") {
  return withQueueLock(async () => {
    const job = findAccountJob(await readQueue(), jobId, accountKey);
    const { __whatsappAccountKey, ...payload } = job.payload || {};
    return { ...sanitizeJob(job), payload };
  });
}

export async function updateWhatsAppQueueJob(jobId, patch, accountKey = "default") {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw Object.assign(new Error("A message update object is required."), { statusCode: 400 });
  return withQueueLock(async () => {
    const queue = await readQueue();
    const job = findAccountJob(queue, jobId, accountKey);
    requireEditable(job);
    const allowed = job.type === "recipient-text" ? ["message", "phoneNumber"]
      : job.type.endsWith("report") ? ["caption", ...(job.type === "recipient-report" ? ["phoneNumber"] : [])] : [];
    if (!allowed.length) throw Object.assign(new Error("This automated task cannot be edited."), { statusCode: 409 });
    for (const field of allowed) {
      if (!(field in patch)) continue;
      if (typeof patch[field] !== "string" || patch[field].length > (field === "message" ? 65536 : 4096)) {
        throw Object.assign(new Error("Message field is invalid or too long."), { statusCode: 400 });
      }
      if (field === "phoneNumber" && !/^\+?[\d\s()-]{7,25}$/.test(patch[field])) {
        throw Object.assign(new Error("Enter a valid WhatsApp phone number."), { statusCode: 400 });
      }
      job.payload[field] = patch[field];
    }
    job.updatedAt = new Date().toISOString();
    await writeQueue(queue);
    return sanitizeJob(job);
  });
}

export async function deleteWhatsAppQueueJob(jobId, accountKey = "default") {
  return withQueueLock(async () => {
    const queue = await readQueue();
    const job = findAccountJob(queue, jobId, accountKey);
    if (job.status === "sending") throw Object.assign(new Error("This message is already being sent."), { statusCode: 409 });
    await writeQueue(queue.filter((item) => item.id !== jobId));
    return { ok: true, deletedCount: 1 };
  });
}

export async function clearWhatsAppQueue(accountKey = "default") {
  return withQueueLock(async () => {
    const queue = await readQueue();
    const retained = queue.filter((job) => (job.accountKey || "default") !== accountKey || job.status === "sending");
    await writeQueue(retained);
    return { ok: true, deletedCount: queue.length - retained.length, sendingKept: retained.filter((job) => (job.accountKey || "default") === accountKey).length };
  });
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
    jobs: queue.map(sanitizeJob),
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
    preview: String(job.payload?.caption || job.payload?.message || "Automated " + job.type).slice(0, 180),
    phoneNumber: job.payload?.phoneNumber || "",
  };
}
