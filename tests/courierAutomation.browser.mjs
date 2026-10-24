import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express from "express";
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { buildCourierSummary } from "../shared/courierSummary.js";
import { buildCourierSummaryHtml } from "../backend/reports/courierSummaryRenderer.js";

const systemTemp = process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Temp") : os.tmpdir();
const folder = await fs.mkdtemp(path.join(systemTemp, "domex-courier-flow-"));
process.env.WHATSAPP_DATA_DIR = folder;
process.env.WHATSAPP_QUEUE_PATH = path.join(folder, "queue.json");
const out = path.resolve(process.env.COURIER_TEST_ARTIFACTS || "tmp/export-layout-artifacts/courier-automation");
await fs.mkdir(out, { recursive: true });
const accounts = await import("../backend/whatsapp/accountWhatsappService.js");
const { default: routes } = await import("../backend/whatsapp/whatsappRoutes.js");
const accountKey = "user-courier-test";
const names = ["DILIPDILIPERANDA", "DILSHAN DILSHAN VIJITHA BANDARA VIJITHA", "K.G.WARNADASAWARNADASAWARNADASA", "NISHANTHA ..SUDESH"];
const row = (name, index) => ({ id: String(index), courierName: name, onRouteCount: "20", deliveryCount: String(16 + index), resendCount: "1", pickupCount: "0", deliveryPercent: String(80 + index * 5) });
const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Colombo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).map(p => [p.type, p.value]));
const date = `${parts.year}-${parts.month}-${parts.day}`;
const oldDate = new Date(new Date(date + "T00:00:00Z").getTime() - 86400000).toISOString().slice(0, 10);
const source = { courierNames: names, settings: { branchName: "Middeniya", autoWeeklyBackup: false, courierAutoSendEnabled: false },
  reports: { [date]: { courierRows: names.slice(0, 3).map(row) }, [oldDate]: { courierRows: names.map(row) } } };
const messages = [];
Object.assign(accounts.getRuntime(accountKey), { status: "connected", socket: {
  sendMessage: async (jid, content) => { messages.push({ jid, content }); return { key: { id: "test-" + messages.length } }; },
} });
await accounts.saveAccountGroups(accountKey, "default", ["fixture@g.us"]);
await accounts.saveAccountBackupSnapshot(accountKey, { snapshot: source });
const app = express();
const apiRequests = [];
app.use((req, res, next) => { apiRequests.push({ path: req.path, account: req.get("X-WhatsApp-Account") }); next(); });
app.use(express.json({ limit: "25mb" }));
app.get("/api/health", (_, res) => res.json({ ok: true }));
app.get("/api/system-health", (_, res) => res.json({ ok: true, whatsapp: { connected: true }, meterMonitor: {}, queue: { counts: {}, jobs: [] } }));
app.use("/api/whatsapp", routes);
const api = app.listen(0, "127.0.0.1");
await new Promise((resolve) => api.once("listening", resolve));
const apiUrl = "http://127.0.0.1:" + api.address().port;
const vite = await createServer({ server: { host: "127.0.0.1", port: 0, watch: { ignored: ["**/tmp/**"] }, proxy: { "/api": apiUrl } } });
await vite.listen();
const base = vite.resolvedUrls.local[0].replace(/\/$/, "");
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.DOMEX_BROWSER_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
  const context = await browser.newContext({ viewport: { width: 1450, height: 1100 } });
  await context.route("**/*", (route) => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
  await context.routeWebSocket("**/*", (socket) => {
    if (new URL(socket.url()).hostname === "127.0.0.1") socket.connectToServer();
    else socket.close();
  });
  await context.addInitScript(({ source, date }) => {
    if (localStorage.getItem("courier-flow-seeded")) return;
    localStorage.setItem("courier-flow-seeded", "true");
    localStorage.setItem("daily-courier-report-system-session-v1", JSON.stringify({ role: "branch", branchName: "courier-test", userId: "courier-test" }));
    localStorage.setItem("daily-courier-report-system-settings-v1::courier-test", JSON.stringify(source.settings));
    localStorage.setItem("daily-courier-report-system-courier-names-v1::courier-test", JSON.stringify(source.courierNames));
    localStorage.setItem("daily-courier-report-system-v1::courier-test", JSON.stringify(source.reports));
    localStorage.setItem("daily-courier-report-system-meta-v1::courier-test", JSON.stringify({ localUpdatedAt: new Date().toISOString() }));
  }, { source, date });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base + "/courier/", { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("Type or select courier name").fill(names[3]);
  for (const [label, value] of [["On Route Count", "20"], ["Delivery Count", "19"], ["Resend Count", "1"], ["Pickup Count", "0"]]) await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole("button", { name: "Add Courier Row", exact: true }).click();
  const saved = await page.evaluate(date => JSON.parse(localStorage.getItem("daily-courier-report-system-v1::courier-test"))[date].courierRows, date);
  assert.equal(saved.length, 4, "Adding the fourth row persists without a separate Save Report click");
  await page.goto(base + "/reports/", { waitUntil: "domcontentloaded" });
  const panel = page.getByRole("region", { name: "Automatic courier summary" });
  await panel.getByRole("checkbox", { name: "Auto-send enabled" }).check();
  const deadline = Date.now() + 60000;
  while ((await accounts.getAccountCourierAutomationStatus(accountKey)).status !== "sent" && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!messages.length) console.log(JSON.stringify({ proxy: vite.config.server.proxy, apiRequests,
    ownStatus: await accounts.getAccountCourierAutomationStatus(accountKey),
    ownSocketConnected: accounts.getRuntime(accountKey).status }, null, 2));
  assert.equal(messages.length, 1, "Four complete couriers cause one automatic modern report");
  assert.equal(messages[0].content.image.readUInt32BE(16), 2400);
  await fs.writeFile(path.join(out, "automatic-modern-report.png"), messages[0].content.image);
  await panel.getByRole("button", { name: "Preview modern report" }).click();
  await panel.getByRole("img", { name: "Modern Branch Courier Performance Report for " + date }).waitFor({ timeout: 45000 });
  await panel.screenshot({ path: path.join(out, "courier-automation-panel.png") });
  await panel.getByRole("button", { name: "Send modern report now" }).click();
  for (let i = 0; i < 100 && messages.length < 2; i++) await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(messages.length, 2, "Manual modern report remains available after the automatic send");
  assert.equal(messages[1].content.image.readUInt32BE(16), 2400);
  await page.getByRole("button", { name: "Report Actions", exact: true }).first().click();
  await page.getByRole("button", { name: "WhatsApp", exact: true }).first().click();
  for (let i = 0; i < 100 && messages.length < 3; i++) await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(messages.length, 3);
  assert.notEqual(messages[2].content.image.readUInt32BE(16), 2400, "Existing manual Send to WhatsApp retains its classic report capture");
  await fs.writeFile(path.join(out, "classic-manual-report.png"), messages[2].content.image);
  const oldPreview = await accounts.previewAccountCourierSummary(accountKey, oldDate);
  assert.equal(oldPreview.reportDate, oldDate);
  await fs.writeFile(path.join(out, "old-date-modern-preview.png"), Buffer.from(oldPreview.imageDataUrl.split(",")[1], "base64"));
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "The added panel fits mobile width");
  await panel.screenshot({ path: path.join(out, "courier-panel-mobile.png") });
  assert.deepEqual(errors, []);
  // Check text geometry on the rendered report, separately from image scaling in the app.
  const layout = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  await layout.setContent(buildCourierSummaryHtml(buildCourierSummary({ ...source, reports: { [date]: { courierRows: names.map(row) } } }, date)));
  const overflow = await layout.locator(".card,.card-value,.courier-name,.top-row").evaluateAll(nodes => nodes.filter(n => n.scrollWidth > n.clientWidth + 1).map(n => n.className));
  assert.deepEqual(overflow, [], "Summary text fits its cards and rows");
  await layout.close();
  console.log("PASS: form autosave → snapshot API → automatic modern PNG → manual modern PNG → unchanged classic send; old-date preview and mobile layout.");
  console.log("Artifacts: " + out);
} finally {
  await browser?.close();
  await vite.close();
  await new Promise(resolve => api.close(resolve));
  delete process.env.WHATSAPP_DATA_DIR; delete process.env.WHATSAPP_QUEUE_PATH;
  await fs.rm(folder, { recursive: true, force: true });
}
