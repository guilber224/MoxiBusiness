import { FONT } from "../../theme.jsx";
import { useIsMobile } from "../../hooks/useIsMobile.js";

export function Chip({ value, onChange, options }) {
  const isMobileChip = useIsMobile();
  if (isMobileChip) {
    return (
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{
          padding: "6px 10px", borderRadius: 10, cursor: "pointer",
          fontSize: 13, fontFamily: FONT, fontWeight: 600,
          background: "var(--color-bg-surface)",
          color: "var(--color-text)",
          border: "1px solid var(--color-border)",
          outline: "none",
        }}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    );
  }
  return (
    <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
      {options.map(([v, l]) => (
        <button key={v} onClick={() => onChange(v)}
          style={{
            padding: "5px 12px", borderRadius: 20, cursor: "pointer",
            fontSize: 12, fontWeight: 500, fontFamily: FONT,
            background: value === v ? "#111E7B" : "var(--color-bg-primary)",
            color: value === v ? "white" : "var(--color-text-mid)",
            border: value === v ? "1px solid #111E7B" : "1px solid var(--color-border)",
            transition: "background 0.15s, color 0.15s",
          }}
        >{l}</button>
      ))}
    </div>
  );
}
