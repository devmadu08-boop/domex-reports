import assert from "node:assert/strict";
import test from "node:test";

import { serializeMeterMessage } from "../backend/whatsapp/meterChatService.js";

test("meter chat serializer preserves text, sender, direction, and timestamp", () => {
  assert.deepEqual(
    serializeMeterMessage({
      key: {
        id: "message-1",
        remoteJid: "120363000000@g.us",
        participant: "94770000001@s.whatsapp.net",
        fromMe: false,
      },
      pushName: "Akila",
      messageTimestamp: 1_775_246_400,
      message: { conversation: "Meter photo sent" },
    }),
    {
      id: "message-1",
      chatJid: "120363000000@g.us",
      fromMe: false,
      senderJid: "94770000001@s.whatsapp.net",
      senderName: "Akila",
      timestamp: 1_775_246_400,
      sentAt: "2026-04-03T20:00:00.000Z",
      type: "text",
      text: "Meter photo sent",
      quotedText: "",
    },
  );
});

test("meter chat serializer labels media captions and ignores status broadcasts", () => {
  const image = serializeMeterMessage({
    key: { id: "image-1", remoteJid: "94770000002@s.whatsapp.net", fromMe: true },
    messageTimestamp: 1_775_246_400,
    message: { imageMessage: { caption: "OUT meter" } },
  });

  assert.equal(image.type, "image");
  assert.equal(image.text, "OUT meter");
  assert.equal(image.fromMe, true);
  assert.equal(serializeMeterMessage({ key: { remoteJid: "status@broadcast" }, message: {} }), null);
});
