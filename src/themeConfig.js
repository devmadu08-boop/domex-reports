export const DEFAULT_THEME_ID = "default";

export const UI_THEMES = [
  {
    id: "default",
    name: "Current Default",
    shortName: "Default",
    description: "The current pastel 3D dashboard, unchanged.",
    colors: ["#fff7f1", "#b79af6", "#ffdce5", "#dcecff"],
  },
  {
    id: "pastel",
    name: "Soft Pastel Operations",
    shortName: "Pastel",
    description: "Friendly lavender, pink, mint, and sky cards with softer depth.",
    colors: ["#fff8fb", "#c7a7ff", "#ffb8cf", "#aee8d0"],
  },
  {
    id: "corporate",
    name: "DOMEX Command Center",
    shortName: "Corporate",
    description: "Maroon and gold corporate styling with a compact operations layout.",
    colors: ["#fffaf3", "#8f1022", "#e5aa2a", "#242124"],
  },
  {
    id: "workspace",
    name: "Clean Logistics Workspace",
    shortName: "Workspace",
    description: "Flatter, denser, scan-friendly panels for fast office data entry.",
    colors: ["#f4f7fb", "#ffffff", "#2563eb", "#16a36a"],
  },
  {
    id: "night",
    name: "Dark Night Dispatch",
    shortName: "Night",
    description: "Low-glare dark surfaces with clear cyan, mint, and coral status colors.",
    colors: ["#10131c", "#1d2330", "#22c7a9", "#ff6b7c"],
  },
  {
    id: "mobile",
    name: "Smart Mobile Courier",
    shortName: "Mobile",
    description: "Touch-first cards, larger actions, and a fresh blue and mint app feel.",
    colors: ["#f2f8ff", "#4f7cff", "#35c99a", "#ffca62"],
  },
];

export function normalizeThemeId(themeId) {
  return UI_THEMES.some((theme) => theme.id === themeId) ? themeId : DEFAULT_THEME_ID;
}

export function getTheme(themeId) {
  return UI_THEMES.find((theme) => theme.id === normalizeThemeId(themeId)) || UI_THEMES[0];
}
