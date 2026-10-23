import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createConfigStore } from "../backend/whatsapp/configStore.js";

async function fixture(t) {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "domex-config-test-"));
  t.after(() => fs.rm(folder, { recursive: true, force: true }));
  const file = path.join(folder, "config.json");
  return { folder, file, store: createConfigStore(file, (value) => value) };
}

test("concurrent settings patches preserve all report groups and background updates", async (t) => {
  const { file, store } = await fixture(t);
  await store.update({ defaultGroupJids: ["courier@g.us"], lastDailyBackupDate: "2026-10-22" });
  const anotherStore = createConfigStore(file, (value) => value);
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const first = store.update(async () => { await gate; return { convertDefaultGroupJids: ["delivered@g.us"] }; });
  const changes = [first, anotherStore.update({ rescheduleDefaultGroupJids: ["reschedule@g.us"] }),
    store.update({ auditDefaultGroupJids: ["audit@g.us"] }),
    ...Array.from({ length: 20 }, (_, revision) => anotherStore.update({ latestBackupSnapshot: { revision } })),
    store.update({ lastDailyBackupDate: "2026-10-23" })];
  release();
  await Promise.all(changes);
  const persisted = await createConfigStore(file, (value) => value).read();
  assert.deepEqual(persisted, {
    defaultGroupJids: ["courier@g.us"], convertDefaultGroupJids: ["delivered@g.us"],
    rescheduleDefaultGroupJids: ["reschedule@g.us"], auditDefaultGroupJids: ["audit@g.us"],
    lastDailyBackupDate: "2026-10-23", latestBackupSnapshot: { revision: 19 },
  });
});

test("readers see complete JSON during repeated saves and retain groups after reopening", async (t) => {
  const { file, store } = await fixture(t);
  await store.update({ defaultGroupJids: ["saved@g.us"] });
  const writes = Promise.all(Array.from({ length: 30 }, (_, revision) => store.update({ revision, snapshot: "x".repeat(20000) })));
  for (let i = 0; i < 60; i++) {
    const value = JSON.parse(await fs.readFile(file, "utf8"));
    assert.deepEqual(value.defaultGroupJids, ["saved@g.us"]);
  }
  await writes;
  assert.equal((await createConfigStore(file, (value) => value).read()).revision, 29);
});

test("a damaged or missing config recovers the latest saved groups from its durable backup", async (t) => {
  const { file, folder, store } = await fixture(t);
  await store.update({ defaultGroupJids: ["old@g.us"] });
  await store.update({ defaultGroupJids: ["latest@g.us"] });
  await fs.writeFile(file, '{"defaultGroupJids":');
  assert.deepEqual(await store.read(), { defaultGroupJids: ["latest@g.us"] });
  await store.update({ lastDailyBackupDate: "2026-10-23" });
  assert.deepEqual(JSON.parse(await fs.readFile(file, "utf8")).defaultGroupJids, ["latest@g.us"]);
  await fs.rm(file);
  assert.deepEqual((await store.read()).defaultGroupJids, ["latest@g.us"]);
  assert.deepEqual((await fs.readdir(folder)).sort(), ["config.json.bak"]);
});

test("unrecoverable settings fail visibly without allowing a background sync to overwrite them", async (t) => {
  const { file, store } = await fixture(t);
  await fs.writeFile(file, "broken-settings");
  await assert.rejects(store.read(), /could not be read or recovered/);
  await assert.rejects(store.update({ latestBackupSnapshot: {} }), /could not be read or recovered/);
  assert.equal(await fs.readFile(file, "utf8"), "broken-settings");
  await fs.writeFile(file, JSON.stringify({ defaultGroupJids: ["restored@g.us"] }));
  await store.update({ latestBackupSnapshot: {} });
  assert.deepEqual((await store.read()).defaultGroupJids, ["restored@g.us"]);
});
