import assert from "node:assert/strict";
import test from "node:test";

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

globalThis.localStorage = new MemoryStorage();
globalThis.window = {
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {},
};
globalThis.CustomEvent = class CustomEvent {
  constructor(type) {
    this.type = type;
  }
};

const storage = await import(`../src/services/reportStorage.js?history-test=${Date.now()}`);

test("report changes can be undone and restored forward", () => {
  storage.setActiveBranch("middeniya");
  storage.saveReportType("2026-07-27", "operation", { target: 100 });
  storage.saveReportType("2026-07-27", "courierRows", [{ id: "row-1", courierName: "Rider" }]);

  assert.equal(storage.getReportByDate("2026-07-27").courierRows.length, 1);
  assert.equal(storage.getUndoHistory().length, 2);

  storage.undoLastChange();
  assert.equal(storage.getReportByDate("2026-07-27").courierRows.length, 0);
  assert.equal(storage.getReportByDate("2026-07-27").operation.target, 100);
  assert.equal(storage.getRedoHistory().length, 1);

  storage.redoLastChange();
  assert.equal(storage.getReportByDate("2026-07-27").courierRows.length, 1);
  assert.equal(storage.getRedoHistory().length, 0);
});

test("report saving continues when optional browser history storage is full", () => {
  globalThis.sessionStorage = {
    getItem() {
      return null;
    },
    setItem() {
      throw new DOMException("Storage quota exceeded", "QuotaExceededError");
    },
    removeItem() {},
  };

  storage.setActiveBranch("quota-branch");
  assert.doesNotThrow(() => {
    storage.saveReportType("2026-08-03", "operation", { target: 100 });
  });
  assert.equal(storage.getReportByDate("2026-08-03").operation.target, 100);
  assert.equal(storage.getUndoHistory().length, 1);

  delete globalThis.sessionStorage;
});
