import test from "node:test";
import assert from "node:assert/strict";
import { normalizeWhatsAppAccountKey, PRIMARY_WHATSAPP_ACCOUNT } from "../backend/whatsapp/accountWhatsappService.js";

test("admin WhatsApp keeps the existing primary session", () => {
  assert.equal(normalizeWhatsAppAccountKey("default"), PRIMARY_WHATSAPP_ACCOUNT);
  assert.equal(normalizeWhatsAppAccountKey(""), PRIMARY_WHATSAPP_ACCOUNT);
});

test("login WhatsApp keys are safe isolated directory names", () => {
  assert.equal(normalizeWhatsAppAccountKey("user:google/ABC.123"), "user-google-abc-123");
  assert.equal(normalizeWhatsAppAccountKey("user-kahawatta"), "user-kahawatta");
  assert.equal(normalizeWhatsAppAccountKey("../../default"), "account-default");
});
