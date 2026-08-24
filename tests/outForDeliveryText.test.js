import test from "node:test";
import assert from "node:assert/strict";
import { findTrackingColumn } from "../src/utils/outForDeliveryText.js";

test("findTrackingColumn keeps short valid tracking numbers from the Tracking No column", () => {
  const items = [
    { text: "Tracking No", x: 200, y: 672 },
    { text: "Route", x: 290, y: 672 },
    { text: "W88", x: 200, y: 163 },
    { text: "THALAWA", x: 290, y: 163 },
    { text: "AA14715", x: 200, y: 142 },
    { text: "THALAWA", x: 290, y: 142 },
  ];

  assert.deepEqual(findTrackingColumn(items), ["W88", "AA14715"]);
});
