import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_THEME_ID, getTheme, normalizeThemeId, UI_THEMES } from "../src/themeConfig.js";

test("theme catalog contains the default and five selectable alternatives", () => {
  assert.equal(UI_THEMES.length, 6);
  assert.equal(UI_THEMES[0].id, DEFAULT_THEME_ID);
  assert.equal(new Set(UI_THEMES.map((theme) => theme.id)).size, UI_THEMES.length);
});

test("unknown or missing theme values safely fall back to the current default", () => {
  assert.equal(normalizeThemeId("unknown-theme"), DEFAULT_THEME_ID);
  assert.equal(normalizeThemeId(undefined), DEFAULT_THEME_ID);
  assert.equal(getTheme("unknown-theme").id, DEFAULT_THEME_ID);
});
