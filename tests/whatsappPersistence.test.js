import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const folder = await fs.mkdtemp(path.join(os.tmpdir(), "domex-whatsapp-persistence-"));
process.env.WHATSAPP_DATA_DIR = folder;
const accounts = await import("../backend/whatsapp/accountWhatsappService.js");
const primary = await import("../backend/whatsapp/whatsappService.js");
after(async () => {
  delete process.env.WHATSAPP_DATA_DIR;
  await fs.rm(folder, { recursive: true, force: true });
});

const groups = {
  defaultGroupJids: ["courier-a@g.us", "courier-b@g.us"],
  convertDefaultGroupJids: ["delivered@g.us"],
  rescheduleDefaultGroupJids: ["reschedule@g.us"],
  auditDefaultGroupJids: ["audit@g.us"],
};
const types = ["default", "delivered", "reschedule", "audit"];

for (const accountKey of ["default", "user-branch-a"]) {
  test(`${accountKey}: concurrent group saves survive backup sync, scheduled sends and a process restart`, async () => {
    const sent = [];
    if (accountKey !== "default") {
      Object.assign(accounts.getRuntime(accountKey), {
        status: "connected",
        socket: { sendMessage: async (jid, content) => { sent.push({ jid, content }); return { key: { id: "test-id" } }; } },
      });
    }
    await Promise.all([
      ...types.map((type, i) => accounts.saveAccountGroups(accountKey, type, Object.values(groups)[i])),
      ...Array.from({ length: 10 }, (_, revision) => accounts.saveAccountBackupSnapshot(accountKey, {
        phoneNumber: "94771234567", snapshot: { revision },
      })),
    ]);
    const status = await accounts.getAccountWhatsAppStatus(accountKey);
    for (const [field, values] of Object.entries(groups)) assert.deepEqual(status[field], values);

    if (accountKey !== "default") {
      for (let i = 0; i < types.length; i++) {
        const result = await accounts.sendAccountGroupReport(accountKey, types[i], {
          imageDataUrl: "data:image/png;base64,dGVzdA==", caption: types[i],
        });
        assert.deepEqual(result.groupJids, Object.values(groups)[i]);
      }
      assert.deepEqual(sent.map((item) => item.jid), Object.values(groups).flat());
      // Simulate settings changing while the daily backup is in flight.
      const runtime = accounts.getRuntime(accountKey);
      runtime.socket.sendMessage = async () => {
        await accounts.saveAccountGroups(accountKey, "audit", ["updated-audit@g.us"]);
        return { key: { id: "backup" } };
      };
      await accounts.sendAccountBackup(accountKey, { force: true });
      assert.deepEqual((await accounts.getAccountWhatsAppStatus(accountKey)).auditDefaultGroupJids, ["updated-audit@g.us"]);
      await accounts.saveAccountGroups(accountKey, "audit", groups.auditDefaultGroupJids);
    } else {
      await Promise.all([
        primary.saveBackupConfig({ phoneNumber: "94771234567", snapshot: { revision: 11 } }),
        primary.saveLatestBackupSnapshot({ snapshot: { revision: 12 } }),
        primary.saveAuditDefaultGroupJids(groups.auditDefaultGroupJids),
      ]);
    }

    // A fresh process has no runtime cache and must load groups from disk.
    const moduleUrl = new URL("../backend/whatsapp/accountWhatsappService.js", import.meta.url).href;
    const statusUrl = new URL("../backend/whatsapp/whatsappService.js", import.meta.url).href;
    const program = accountKey === "default"
      ? `const m = await import(${JSON.stringify(statusUrl)}); console.log(JSON.stringify(await m.getWhatsAppStatus()));`
      : `const m = await import(${JSON.stringify(moduleUrl)}); m.getRuntime(${JSON.stringify(accountKey)}).socket = {}; console.log(JSON.stringify(await m.getAccountWhatsAppStatus(${JSON.stringify(accountKey)})));`;
    const { stdout } = await promisify(execFile)(process.execPath, ["--input-type=module", "-e", program], {
      env: { ...process.env, WHATSAPP_DATA_DIR: folder }, cwd: os.tmpdir(),
    });
    const restarted = JSON.parse(stdout.trim());
    for (const [field, values] of Object.entries(groups)) assert.deepEqual(restarted[field], values);
  });
}

test("legacy singular group settings still load for every report type", async () => {
  const legacy = Object.fromEntries(Object.entries(groups).map(([field, values]) => [field.slice(0, -1), values[0]]));
  await fs.writeFile(path.join(folder, "whatsapp-config.json"), JSON.stringify(legacy));
  const status = await primary.getWhatsAppStatus();
  for (const [field, values] of Object.entries(groups)) assert.deepEqual(status[field], [values[0]]);
});
