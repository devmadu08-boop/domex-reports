import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMeterRiderMention,
  buildMeterTodayStatus,
  buildReminderSlots,
  getDueReminderSlot,
  getMeterDayAvailability,
  getMeterReminderDelayMs,
  hasMeterPhoto,
  isTimeWithinWindow,
  normalizeMeterAccountMode,
} from "../backend/whatsapp/meterMonitorService.js";

test("group reminders include the rider name and all usable WhatsApp mention identities", () => {
  assert.deepEqual(
    buildMeterRiderMention({
      name: "Sudesh",
      phoneNumber: "076 123 4567",
      phoneJid: "94761234567@s.whatsapp.net",
      jid: "257676898492428@lid",
      lid: "257676898492428@lid",
    }),
    {
      text: "*Sudesh* - @94761234567",
      jids: ["94761234567@s.whatsapp.net", "257676898492428@lid"],
    },
  );

  assert.deepEqual(
    buildMeterRiderMention({ name: "Akila", jid: "123456789@lid" }),
    {
      text: "*Akila* - @123456789",
      jids: ["123456789@lid"],
    },
  );
});

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

test("meter reminders run only at each window start and end", () => {
  assert.deepEqual(
    buildReminderSlots("08:00", "11:30"),
    ["08:00", "11:30"],
  );
  assert.deepEqual(
    buildReminderSlots("17:00", "20:30"),
    ["17:00", "20:30"],
  );
  assert.deepEqual(buildReminderSlots("08:00", "08:00"), ["08:00"]);
  assert.deepEqual(buildReminderSlots("invalid", "11:30"), []);
});

test("meter scheduler sends only in the exact checkpoint minute", () => {
  assert.equal(getDueReminderSlot("08:00", "11:30", "08:00"), "08:00");
  assert.equal(getDueReminderSlot("08:00", "11:30", "08:01"), "");
  assert.equal(getDueReminderSlot("08:00", "11:30", "11:30", "08:00"), "11:30");
  assert.equal(getDueReminderSlot("08:00", "11:30", "11:30", "11:30"), "");
});

test("meter reminders are paced with a base delay and random gap", () => {
  assert.equal(getMeterReminderDelayMs({ messageDelaySeconds: 15 }, 0), 15000);
  assert.equal(getMeterReminderDelayMs({ messageDelaySeconds: 15 }, 0.999), 19995);
  assert.equal(getMeterReminderDelayMs({ messageDelaySeconds: 1 }, 0), 15000);
});

test("meter WhatsApp account mode preserves separate mode and supports primary mode", () => {
  assert.equal(normalizeMeterAccountMode("primary"), "primary");
  assert.equal(normalizeMeterAccountMode("separate"), "separate");
  assert.equal(normalizeMeterAccountMode("unknown"), "separate");
  assert.equal(normalizeMeterAccountMode(), "separate");
});

test("Sundays and special branch holidays disable the meter monitor", () => {
  assert.deepEqual(
    getMeterDayAvailability({ specialHolidays: [] }, "2026-08-02"),
    { inactive: true, reason: "Sunday branch holiday" },
  );
  assert.deepEqual(
    getMeterDayAvailability({ specialHolidays: ["2026-08-03"] }, "2026-08-03"),
    { inactive: true, reason: "Special branch holiday" },
  );
  assert.deepEqual(
    getMeterDayAvailability({ specialHolidays: [] }, "2026-08-03"),
    { inactive: false, reason: "" },
  );
});

test("today status separates IN and OUT submissions and missing riders", () => {
  const config = {
    inWindowStart: "08:00",
    inWindowEnd: "11:30",
    outWindowStart: "17:00",
    outWindowEnd: "20:30",
    riders: [
      { name: "Akila", jid: "94770000001@s.whatsapp.net", phoneNumber: "94770000001" },
      {
        name: "Sudesh",
        jid: "94770000002@s.whatsapp.net",
        phoneNumber: "94770000002",
        leaveDates: ["2026-07-28"],
      },
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
  assert.equal(result.in.missingCount, 0);
  assert.equal(result.out.submissionCount, 0);
  assert.equal(result.out.missing[0].name, "Akila");
  assert.equal(result.submissionCount, 1);
  assert.equal(result.missingCount, 1);
  assert.equal(result.onLeave[0].name, "Sudesh");
  assert.equal(result.riderCount, 1);
});
