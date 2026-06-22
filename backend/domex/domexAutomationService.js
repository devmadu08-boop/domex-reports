import { chromium } from "playwright-core";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const dataDir = path.resolve("backend", "data");
const configPath = path.join(dataDir, "domex-automation-config.json");
const loginUrl = "https://stf.domex.lk/authentication/login";
const deliveredReportUrl = "https://stf.domex.lk/Staff/OperationReport/DeliveredReports";
let automationRunning = false;

async function readConfig() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    return JSON.parse(await fs.readFile(configPath, "utf8"));
  } catch {
    return {};
  }
}

async function writeConfig(config) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));
  return config;
}

export async function getDomexAutomationStatus() {
  const config = await readConfig();
  return {
    configured: Boolean((process.env.DOMEX_USERNAME || config.username) && (process.env.DOMEX_PASSWORD || config.password)),
    username: process.env.DOMEX_USERNAME || config.username || "",
    branchName: process.env.DOMEX_BRANCH_NAME || config.branchName || "Middeniya",
    hasPassword: Boolean(process.env.DOMEX_PASSWORD || config.password),
    running: automationRunning,
  };
}

export async function saveDomexAutomationConfig({ username, password, branchName }) {
  const current = await readConfig();
  const next = {
    username: String(username || current.username || "").trim(),
    password: String(password || current.password || ""),
    branchName: String(branchName || current.branchName || "Middeniya").trim(),
    updatedAt: new Date().toISOString(),
  };
  if (!next.username || !next.password) throw new Error("DOMEX username and password are required.");
  await writeConfig(next);
  return getDomexAutomationStatus();
}

export async function downloadRiderDeliveredCsv({ riderName, reportDate, branchName }) {
  if (automationRunning) throw new Error("A DOMEX report download is already running. Please wait.");
  automationRunning = true;

  let browser;
  let page;
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "domex-delivered-"));
  try {
    const config = await readConfig();
    const username = process.env.DOMEX_USERNAME || config.username;
    const password = process.env.DOMEX_PASSWORD || config.password;
    const selectedBranch = branchName || process.env.DOMEX_BRANCH_NAME || config.branchName || "Middeniya";
    if (!username || !password) throw new Error("Configure DOMEX login in Settings first.");
    if (!riderName) throw new Error("Select a rider before fetching the DOMEX report.");

    browser = await chromium.launch({
      headless: true,
      executablePath: await findBrowserExecutable(),
      args: ["--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage"],
    });
    const context = await browser.newContext({ acceptDownloads: true });
    page = await context.newPage();
    page.setDefaultTimeout(45000);

    await page.goto(loginUrl, { waitUntil: "domcontentloaded" });
    await fillLogin(page, username, password);
    await clickFirstVisible(page, ["button:has-text('Sign In')", "button[type='submit']", "input[type='submit']"]);
    await waitForSuccessfulLogin(page);

    await page.goto(deliveredReportUrl, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => undefined);
    if (page.url().toLowerCase().includes("/authentication/login")) {
      throw new Error("DOMEX redirected back to the login page. Check the saved username/password.");
    }
    await clickRiderWiseTab(page);

    await selectDropdownNearLabel(page, "Branch Name:", selectedBranch);
    await selectDropdownNearLabel(page, "Vehicle No:", "All");
    await selectDropdownNearLabel(page, "Rider Name:", riderName, { partial: true });
    await selectDropdownNearLabel(page, "Route Name:", "All");

    const formattedDate = formatPortalDate(reportDate || new Date().toISOString().slice(0, 10));
    await fillInputNearLabel(page, "From Date:", formattedDate);
    await fillInputNearLabel(page, "To Date:", formattedDate);
    await page.getByRole("button", { name: "Find", exact: true }).click();
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await page.waitForTimeout(1200);

    await clickDownloadMenu(page);
    const downloadPromise = page.waitForEvent("download", { timeout: 30000 });
    await clickCsvOption(page);
    const download = await downloadPromise;
    const suggestedName = download.suggestedFilename() || `Delivered_Report_${reportDate}.csv`;
    const filePath = path.join(tempDir, suggestedName.replace(/[\\/:*?"<>|]/g, "_"));
    await download.saveAs(filePath);
    const csvText = await fs.readFile(filePath, "utf8");
    if (!csvText.trim()) throw new Error("DOMEX returned an empty CSV report.");

    return {
      ok: true,
      fileName: suggestedName,
      csvText,
      riderName,
      branchName: selectedBranch,
      reportDate,
      downloadedAt: new Date().toISOString(),
    };
  } catch (error) {
    const diagnostics = await saveDebugArtifacts(page).catch(() => ({ url: "unknown", title: "unknown" }));
    throw new Error(`DOMEX automation failed: ${error.message} [page=${diagnostics.url}; title=${diagnostics.title}]`);
  } finally {
    automationRunning = false;
    await browser?.close().catch(() => undefined);
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function findBrowserExecutable() {
  const candidates = [
    process.env.DOMEX_BROWSER_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try the next installed browser path.
    }
  }
  throw new Error("Chrome or Microsoft Edge was not found on the VPS.");
}

async function fillLogin(page, username, password) {
  const usernameInput = page.locator("input[type='text'], input:not([type])").first();
  const passwordInput = page.locator("input[type='password']").first();
  await usernameInput.fill(username);
  await passwordInput.fill(password);
}

async function waitForSuccessfulLogin(page) {
  try {
    await page.waitForURL(
      (url) => !url.pathname.toLowerCase().includes("/authentication/login"),
      { timeout: 45000, waitUntil: "domcontentloaded" },
    );
  } catch {
    const loginMessage = await page
      .locator("[role='alert'], .alert, .toast, .validation-message, .text-danger")
      .allTextContents()
      .then((items) => items.map((item) => item.trim()).filter(Boolean).join(" "))
      .catch(() => "");
    throw new Error(loginMessage ? `DOMEX login failed: ${loginMessage}` : "DOMEX login did not complete. Check the saved credentials or portal availability.");
  }
}

async function clickRiderWiseTab(page) {
  const candidates = [
    page.getByRole("tab", { name: "Rider Wise", exact: false }),
    page.getByText("Rider Wise", { exact: false }),
    page.locator("a, button, [role='tab']").filter({ hasText: "Rider Wise" }),
  ];
  for (const candidate of candidates) {
    const count = await candidate.count();
    for (let index = 0; index < count; index += 1) {
      const item = candidate.nth(index);
      if (await item.isVisible().catch(() => false)) {
        await item.click();
        return;
      }
    }
  }
  throw new Error("Rider Wise tab was not found on the Delivered Reports page.");
}

async function saveDebugArtifacts(page) {
  if (!page) return { url: "unknown", title: "unknown" };
  await fs.mkdir(dataDir, { recursive: true });
  await page.screenshot({ path: path.join(dataDir, "domex-automation-debug.png"), fullPage: true }).catch(() => undefined);
  await fs.writeFile(path.join(dataDir, "domex-automation-debug.html"), await page.content(), "utf8").catch(() => undefined);
  return { url: page.url(), title: await page.title().catch(() => "unknown") };
}

async function clickFirstVisible(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.isVisible().catch(() => false)) {
      await locator.click();
      return;
    }
  }
  throw new Error("Sign In button was not found.");
}

async function fieldContainer(page, labelText) {
  const label = page.getByText(labelText, { exact: true }).first();
  await label.waitFor({ state: "visible" });
  return label.locator("xpath=ancestor::*[self::div or self::td][1]").locator("xpath=..");
}

async function selectDropdownNearLabel(page, labelText, requestedValue, { partial = false } = {}) {
  const container = await fieldContainer(page, labelText);
  const control = container.locator("[role='combobox'], input").first();
  await control.click();
  await page.waitForTimeout(250);

  const requested = String(requestedValue || "").trim();
  const search = partial ? requested.replace(/\d+/g, "").replaceAll("_", " ").trim() : requested;
  const options = page.locator("[role='option']:visible, .ant-select-item-option:visible, .e-list-item:visible, li:visible");
  const count = await options.count();
  for (let index = 0; index < count; index += 1) {
    const option = options.nth(index);
    const text = (await option.innerText().catch(() => "")).trim();
    const matches = partial ? normalize(text).includes(normalize(search)) : normalize(text) === normalize(search);
    if (matches) {
      await option.click();
      return;
    }
  }
  throw new Error(`${labelText} option '${requestedValue}' was not found.`);
}

async function fillInputNearLabel(page, labelText, value) {
  const container = await fieldContainer(page, labelText);
  const input = container.locator("input").first();
  await input.evaluate((element, nextValue) => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    descriptor?.set?.call(element, nextValue);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

async function clickDownloadMenu(page) {
  const candidates = [
    "button[aria-label*='download' i]",
    "[title*='download' i]",
    "svg[data-icon*='download']",
    ".fa-download",
    ".ri-download-line",
  ];
  for (const selector of candidates) {
    const locator = page.locator(selector).last();
    if (await locator.isVisible().catch(() => false)) {
      await locator.click();
      return;
    }
  }
  throw new Error("Report download menu button was not found.");
}

async function clickCsvOption(page) {
  const csvText = page.getByText("CSV", { exact: true }).last();
  if (await csvText.isVisible().catch(() => false)) {
    await csvText.click();
    return;
  }
  throw new Error("CSV download option was not found.");
}

function normalize(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function formatPortalDate(isoDate) {
  const [year, month, day] = String(isoDate).split("-");
  return `${Number(month)}/${Number(day)}/${year}`;
}
