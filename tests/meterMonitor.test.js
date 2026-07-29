import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMeterTodayStatus,
  buildReminderSlots,
  hasMeterPhoto,
  isTimeWithinWindow,
} from "../backend/whatsapp/meterMonitorService.js";

test("meter photo window supports normal and overnight ranges", () => {
  assert.equal(isTimeWithinWindow("18:15", "17:00", "19:00"), true);
  assert.equal(isTimeWithinWindow("19:01", "17:00", "19:00"), false);
  assert.equal(isTimeWithinWindow("23:30", "22:00", "01:00"), true);
  assert.equal(isTimeWithinWindow("00:30", "22:00", "01:00"), true);
  assert.equal(isTimeWithinWindow("12:00", "22:00", "01:00"), false);
});

test("meter monitor detects regular, view-once, and image document messages", () => {
  assert.equal(hasMeterPhoto({ imageMessage: {} }), true);
  assert.equal(hasMeterPhoto({ viewOnceMessageV2: { message: { imageMessage: {} } } }), true);
  assert.equal(hasMeterPhoto({ documentMessage: { mimetype: "image/jpeg" } }), true);
  assert.equal(hasMeterPhoto({ documentMessage: { mimetype: "application/pdf" } }), false);
  assert.equal(hasMeterPhoto({ conversation: "photo sent" }), false);
});

test("hourly reminder slots include the exact window end", () => {
  assert.deepEqual(
    buildReminderSlots("08:00", "11:30", 60),
    ["09:00", "10:00", "11:00", "11:30"],
  );
  assert.deepEqual(
    buildReminderSlots("17:00", "20:00", 60),
    ["18:00", "19:00", "20:00"],
  );
});

test("today status separates IN and OUT submissions and missing riders", () => {
  const config = {
    inWindowStart: "08:00",
    inWindowEnd: "11:30",
    outWindowStart: "17:00",
    outWindowEnd: "20:00",
    riders: [
      { name: "Akila", jid: "94770000001@s.whatsapp.net", phoneNumber: "94770000001" },
      { name: "Sudesh", jid: "94770000002@s.whatsapp.net", phoneNumber: "94770000002" },
    ],
  };
  const state = {
    days: {
      "2026-07-28": {
        sessions: {
          in: {
            submissions: {
              "94770000001": { name: "Akila", receivedAt: "2026-07-28T08:30:00+05:30" },
            },
          },
          out: {
            submissions: {
              "94770000002": { name: "Sudesh", receivedAt: "2026-07-28T18:00:00+05:30" },
            },
          },
        },
      },
    },
  };

  const result = buildMeterTodayStatus(config, state, "2026-07-28");
  assert.equal(result.in.submissionCount, 1);
  assert.equal(result.in.missing[0].name, "Sudesh");
  assert.equal(result.out.submissionCount, 1);
  assert.equal(result.out.missing[0].name, "Akila");
  assert.equal(result.submissionCount, 2);
  assert.equal(result.missingCount, 2);
});
