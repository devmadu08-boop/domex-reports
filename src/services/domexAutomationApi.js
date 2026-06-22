const backendBaseUrl = (import.meta.env.VITE_WHATSAPP_API_BASE_URL || "").replace(/\/$/, "");

async function requestDomex(path, options = {}) {
  const url = backendBaseUrl ? `${backendBaseUrl}/api/domex${path}` : `/api/domex${path}`;
  let response;
  try {
    response = await fetch(url, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    });
  } catch {
    throw new Error("DOMEX automation backend is not reachable. Check the VPS backend and Cloudflare tunnel.");
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 404) throw new Error("DOMEX automation API was not found. Pull the latest GitHub code on the VPS and restart the backend.");
    throw new Error(data.error || "DOMEX automation request failed.");
  }
  return data;
}

export function getDomexAutomationStatus() {
  return requestDomex("/status");
}

export function saveDomexAutomationConfig(config) {
  return requestDomex("/config", { method: "POST", body: JSON.stringify(config) });
}

export function fetchDomexDeliveredCsv({ riderName, reportDate, branchName }) {
  return startAndWaitForDomexJob({ riderName, reportDate, branchName });
}

async function startAndWaitForDomexJob(payload) {
  const started = await requestDomex("/delivered-csv/start", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!started.jobId) throw new Error("DOMEX automation did not return a job ID.");

  const deadline = Date.now() + 4 * 60 * 1000;
  while (Date.now() < deadline) {
    await wait(2000);
    const job = await requestDomex(`/delivered-csv/jobs/${started.jobId}`);
    if (job.status === "complete") return job.result;
    if (job.status === "failed") throw new Error(job.error || "DOMEX automation failed.");
  }
  throw new Error("DOMEX automation timed out after four minutes.");
}

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}
