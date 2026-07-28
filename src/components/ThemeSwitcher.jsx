import { Check, Palette } from "lucide-react";
import { getTheme, UI_THEMES } from "../themeConfig.js";

export default function ThemeSwitcher({ value, onChange, compact = false }) {
  const activeTheme = getTheme(value);

  if (compact) {
    return (
      <label className="theme-quick-switch" title="Change interface theme">
        <Palette className="h-5 w-5 shrink-0" />
        <span className="sr-only">Interface theme</span>
        <select value={activeTheme.id} onChange={(event) => onChange(event.target.value)} aria-label="Interface theme">
          {UI_THEMES.map((theme) => (
            <option key={theme.id} value={theme.id}>{theme.shortName}</option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <section className="theme-picker" aria-label="Interface themes">
      <div className="theme-picker-heading">
        <span className="theme-picker-icon"><Palette className="h-6 w-6" /></span>
        <div>
          <h3>Interface Theme</h3>
          <p>Changes only the system interface. Printable and exported reports keep their official design.</p>
        </div>
      </div>

      <div className="theme-option-grid">
        {UI_THEMES.map((theme) => {
          const selected = theme.id === activeTheme.id;
          return (
            <button
              key={theme.id}
              type="button"
              onClick={() => onChange(theme.id)}
              aria-pressed={selected}
              className={`theme-option ${selected ? "theme-option-active" : ""}`}
            >
              <span className="theme-swatches" aria-hidden="true">
                {theme.colors.map((color) => <span key={color} style={{ backgroundColor: color }} />)}
              </span>
              <span className="theme-option-copy">
                <strong>{theme.name}</strong>
                <small>{theme.description}</small>
              </span>
              <span className="theme-option-check">{selected && <Check className="h-4 w-4" />}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
