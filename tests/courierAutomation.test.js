import test from "node:test";
import assert from "node:assert/strict";
import { buildCourierSummary, getCourierCompletion } from "../shared/courierSummary.js";
import { createCourierAutomation, getCourierAutomationReadiness } from "../backend/whatsapp/courierAutomation.js";
import { buildCourierSummaryHtml } from "../backend/reports/courierSummaryRenderer.js";

const date = "2026-10-24";
const row = (name, overrides = {}) => ({ courierName: name, onRouteCount: "20", deliveryCount: "16", resendCount: "3", pickupCount: "0", ...overrides });
function snapshot(rows = [row("A"), row("B"), row("C"), row("D")]) {
  return { courierNames: ["A", "B", "C", "D"], settings: { branchName: "Middeniya" }, reports: { [date]: { courierRows: rows } } };
}
function fixture(rows) {
  const fixture = { config: { defaultGroupJids: ["one@g.us", "two@g.us"], latestBackupSnapshot: snapshot(rows) },
    time: new Date("2026-10-24T10:00:00Z"), connected: true, sends: [], renders: [] };
  fixture.create = () => createCourierAutomation({
    now: () => fixture.time, connected: () => fixture.connected,
    readConfig: async () => structuredClone(fixture.config),
    updateConfig: async (patch) => { const changes = typeof patch === "function" ? await patch(fixture.config) : patch; fixture.config = { ...fixture.config, ...structuredClone(changes) }; },
    render: async (report) => { fixture.renders.push(report); if (fixture.renderGate) await fixture.renderGate; return Buffer.from("png"); },
    sendImages: async (jid, images, caption) => { if (jid === fixture.failJid) throw new Error("Temporary disconnect"); fixture.sends.push({ jid, images, caption }); },
  });
  fixture.engine = fixture.create();
  return fixture;
}

test("early send requires all four named couriers, every count, unique rows, and accepts explicit zeros", () => {
  assert.equal(getCourierCompletion(snapshot(), date).complete, true);
  const incomplete = [row("A"), row("B"), row("C")];
  assert.equal(getCourierCompletion(snapshot(incomplete), date).complete, false);
  for (const field of ["onRouteCount", "deliveryCount", "resendCount", "pickupCount"]) {
    assert.equal(getCourierCompletion(snapshot([...incomplete, row("D", { [field]: "" })]), date).complete, false);
    assert.equal(getCourierCompletion(snapshot([...incomplete, row("D", { [field]: 0 })]), date).complete, true);
    assert.equal(getCourierCompletion(snapshot([...incomplete, row("D", { [field]: -1 })]), date).complete, false);
  }
  assert.equal(getCourierCompletion(snapshot([...incomplete, row("A")]), date).complete, false);
  assert.equal(getCourierCompletion(snapshot([...incomplete, row("Stranger")]), date).complete, false);
  assert.equal(getCourierCompletion({ ...snapshot([row("A")]), courierNames: ["A"] }, date).complete, false);
});

test("deadline uses Colombo 20:00, sends partial current-day data, and never sends an empty day", () => {
  const config = { latestBackupSnapshot: snapshot([row("A")]) };
  assert.equal(getCourierAutomationReadiness(config, new Date("2026-10-24T14:29:59Z")).due, false);
  assert.equal(getCourierAutomationReadiness(config, new Date("2026-10-24T14:30:00Z")).due, true);
  assert.equal(getCourierAutomationReadiness({ latestBackupSnapshot: snapshot([]) }, new Date("2026-10-24T15:00:00Z")).due, false);
  config.latestBackupSnapshot.settings.courierAutoSendEnabled = false;
  assert.equal(getCourierAutomationReadiness(config, new Date("2026-10-24T15:00:00Z")).due, false);
});

test("all four complete sends early once; 20:00 ticks and a fresh service instance do not duplicate it", async () => {
  const f = fixture();
  assert.equal((await f.engine.run()).sentCount, 2);
  assert.equal(f.config.courierAutoReports[date].reason, "all-couriers-complete");
  f.time = new Date("2026-10-24T14:30:00Z");
  assert.equal((await f.engine.run()).skipped, true);
  assert.equal((await f.create().run()).skipped, true);
  assert.equal(f.sends.length, 2);
});

test("a deadline report sends available rows and manual modern sends do not consume automatic delivery", async () => {
  const f = fixture([row("A")]);
  await f.engine.manual({ date });
  assert.equal(f.config.courierAutoReports, undefined);
  assert.equal((await f.engine.run()).skipped, true);
  f.time = new Date("2026-10-24T14:30:00Z");
  await f.engine.run();
  assert.equal(f.renders.at(-1).rows.length, 1);
  assert.equal(f.config.courierAutoReports[date].reason, "20:00-deadline");
  await f.engine.manual({ date });
  assert.equal(f.sends.length, 6);
});

test("partial group failure persists progress and a restart retries only the failed group", async () => {
  const f = fixture();
  f.failJid = "two@g.us";
  await assert.rejects(f.engine.run(), /Temporary disconnect/);
  assert.deepEqual(f.config.courierAutoReports[date].sentGroupJids, ["one@g.us"]);
  assert.match(f.config.courierAutoReports[date].lastError, /Temporary/);
  f.failJid = null;
  await f.create().run();
  assert.deepEqual(f.sends.map((s) => s.jid), ["one@g.us", "two@g.us"]);
  assert.equal((await f.engine.status()).status, "sent");
});

test("parallel save notifications and scheduler ticks claim one automatic send", async () => {
  const f = fixture();
  let release;
  f.renderGate = new Promise((resolve) => { release = resolve; });
  const first = f.engine.run();
  const others = await Promise.all(Array.from({ length: 10 }, () => f.engine.run()));
  assert.ok(others.every((result) => result.skipped));
  release(); await first;
  assert.equal(f.sends.length, 2);
});

test("yesterday's pending automatic report is not sent after midnight; manual old-date sends remain available", async () => {
  const f = fixture();
  f.failJid = "two@g.us";
  await assert.rejects(f.engine.run());
  f.failJid = null;
  f.time = new Date("2026-10-24T18:30:00Z");
  await f.create().run();
  assert.equal(f.sends.length, 1);
  await f.engine.manual({ date });
  assert.equal(f.sends.length, 3);
  assert.match(f.sends.at(-1).caption, /2026-10-24/);
});

test("a render crossing midnight does not publish a stale automatic report", async () => {
  const f = fixture();
  let release;
  f.renderGate = new Promise((resolve) => { release = resolve; });
  const running = f.engine.run();
  for (let i = 0; i < 10 && !f.renders.length; i++) await new Promise((resolve) => setImmediate(resolve));
  f.time = new Date("2026-10-24T18:30:00Z"); release();
  assert.equal((await running).skipped, true);
  assert.equal(f.sends.length, 0);
});

test("offline or missing group setup waits and subsequently sends when setup is ready", async () => {
  const f = fixture(); f.connected = false;
  await f.engine.run(); assert.equal(f.sends.length, 0);
  f.connected = true; f.config.defaultGroupJids = [];
  await f.engine.run(); assert.equal(f.sends.length, 0);
  f.config.defaultGroupJids = ["saved@g.us"];
  await f.engine.run(); assert.equal(f.sends.length, 1);
});

test("report calculations use real previous-day figures and escape row and branch text", () => {
  const source = snapshot([row('<script>alert("x")</script>', { onRouteCount: "55", deliveryCount: "43", resendCount: "10", pickupCount: "17" })]);
  source.reports["2026-10-23"] = { courierRows: [row("A", { onRouteCount: "50", deliveryCount: "40", pickupCount: "10" })] };
  source.settings.branchName = "<img src=x onerror=alert(1)>";
  const report = buildCourierSummary(source, date);
  assert.equal(report.totals.pending, 2);
  assert.equal(report.totals.deliveryPercent.toFixed(2), "78.18");
  assert.equal(report.previousTotals.pickupCount, 10);
  const html = buildCourierSummaryHtml(report);
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes("&lt;SCRIPT&gt;"));
  assert.ok(html.includes("+70.0%"));
  assert.ok(!html.includes("<img src=x"));
  assert.throws(() => buildCourierSummary(source, "2026-02-31"), /valid/);
});
