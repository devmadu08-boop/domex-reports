const whatsappApiBaseUrl = (import.meta.env.VITE_WHATSAPP_API_BASE_URL || "").replace(/\/$/, "");

async function requestJson(path, options = {}) {
  let response;
  const url = whatsappApiBaseUrl ? `${whatsappApiBaseUrl}/api/whatsapp${path}` : `/api/whatsapp${path}`;

  try {
    response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      ...options,
    });
  } catch {
    throw new Error("WhatsApp backend is not reachable. Start it locally with npm run server or set VITE_WHATSAPP_API_BASE_URL in Vercel.");
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 404) {
      if (path === "/send-report-to-recipient") {
        throw new Error("Rider WhatsApp send API was not found. Update/pull the WhatsApp backend on the VPS and restart it.");
      }
      if (path === "/send-text-to-recipient") {
        throw new Error("Rider reminder API was not found. Update the WhatsApp backend on the VPS and restart it.");
      }
      if (path === "/convert-default-group" || path === "/send-convert-report") {
        throw new Error("Delivered Report WhatsApp group API was not found. Pull the latest GitHub code on the VPS and restart the backend.");
      }
      if (path === "/reschedule-default-group" || path === "/send-reschedule-report") {
        throw new Error("Reschedule Report WhatsApp group API was not found. Pull the latest GitHub code on the VPS and restart the backend.");
      }
      if (path.startsWith("/backup") || path === "/send-backup-now") {
        throw new Error("WhatsApp backup API was not found. Pull the latest GitHub code on the VPS and restart the backend.");
      }
      throw new Error("WhatsApp API was not found. On Vercel, deploy the WhatsApp backend separately and set VITE_WHATSAPP_API_BASE_URL.");
    }
    if (response.status === 502) {
      throw new Error("WhatsApp backend is not running. Start it locally with npm run server or check the hosted backend URL.");
    }
    throw new Error(data.error || "WhatsApp API request failed.");
  }
  return data;
}

export function getWhatsAppStatus() {
  return requestJson("/status");
}

export function getBackendHealth() {
  const url = whatsappApiBaseUrl ? `${whatsappApiBaseUrl}/api/health` : "/api/health";
  return fetch(url).then((response) => {
    if (!response.ok) throw new Error("Backend server is not running.");
    return response.json();
  });
}

export function getSystemHealth() {
  const url = whatsappApiBaseUrl ? `${whatsappApiBaseUrl}/api/system-health` : "/api/system-health";
  return fetch(url).then(async (response) => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "System health check failed.");
    return data;
  });
}

export function getWhatsAppQueue() {
  return requestJson("/queue");
}

export function retryFailedWhatsAppQueue() {
  return requestJson("/queue/retry-failed", { method: "POST" });
}

export function retryWhatsAppQueueJob(jobId) {
  return requestJson(`/queue/${encodeURIComponent(jobId)}/retry`, { method: "POST" });
}

export function getWhatsAppQr() {
  return requestJson("/qr");
}

export function reconnectWhatsApp() {
  return requestJson("/reconnect", { method: "POST" });
}

export function logoutWhatsApp() {
  return requestJson("/logout", { method: "POST" });
}

export function fetchWhatsAppGroups() {
  return requestJson("/groups");
}

export function saveDefaultWhatsAppGroup(groupJids) {
  return requestJson("/default-group", {
    method: "POST",
    body: JSON.stringify({
      groupJids: Array.isArray(groupJids) ? groupJids : [groupJids].filter(Boolean),
    }),
  });
}

export function saveConvertWhatsAppGroup(groupJids) {
  return requestJson("/convert-default-group", {
    method: "POST",
    body: JSON.stringify({
      groupJids: Array.isArray(groupJids) ? groupJids : [groupJids].filter(Boolean),
    }),
  });
}

export function saveRescheduleWhatsAppGroup(groupJids) {
  return requestJson("/reschedule-default-group", {
    method: "POST",
    body: JSON.stringify({
      groupJids: Array.isArray(groupJids) ? groupJids : [groupJids].filter(Boolean),
    }),
  });
}

export function sendReportToWhatsApp({ imageDataUrl, imageDataUrls, caption }) {
  return requestJson("/send-report", {
    method: "POST",
    body: JSON.stringify({ imageDataUrl, imageDataUrls, caption }),
  });
}

export function sendConvertReportToWhatsApp({ imageDataUrl, imageDataUrls, caption }) {
  return requestJson("/send-convert-report", {
    method: "POST",
    body: JSON.stringify({ imageDataUrl, imageDataUrls, caption }),
  });
}

export function sendRescheduleReportToWhatsApp({ imageDataUrl, imageDataUrls, caption }) {
  return requestJson("/send-reschedule-report", {
    method: "POST",
    body: JSON.stringify({ imageDataUrl, imageDataUrls, caption }),
  });
}

export function sendReportToWhatsAppRecipient({ phoneNumber, imageDataUrl, imageDataUrls, caption }) {
  return requestJson("/send-report-to-recipient", {
    method: "POST",
    body: JSON.stringify({ phoneNumber, imageDataUrl, imageDataUrls, caption }),
  });
}

export function sendTextToWhatsAppRecipient({ phoneNumber, message }) {
  return requestJson("/send-text-to-recipient", {
    method: "POST",
    body: JSON.stringify({ phoneNumber, message }),
  });
}

export function saveWhatsAppBackupConfig({ phoneNumber, snapshot, approvalReaction }) {
  return requestJson("/backup-config", {
    method: "POST",
    body: JSON.stringify({ phoneNumber, snapshot, approvalReaction }),
  });
}

export function syncWhatsAppBackupSnapshot({ phoneNumber, snapshot, approvalReaction }) {
  return requestJson("/backup-snapshot", {
    method: "POST",
    body: JSON.stringify({ phoneNumber, snapshot, approvalReaction }),
  });
}

export function sendWhatsAppBackupNow() {
  return requestJson("/send-backup-now", { method: "POST" });
}

export function sendRescheduleApprovalNow() {
  return requestJson("/send-reschedule-approval-now", { method: "POST" });
}
