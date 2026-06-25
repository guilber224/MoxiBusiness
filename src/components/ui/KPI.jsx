import { R } from "../../theme.jsx";
import { card, lbl } from "../../styles.js";

export function KPI({ label, value, sub, color = "var(--color-text)", Icon }) {
  return (
    <div style={{ ...card(), flex: 1, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...lbl, marginBottom: 6 }}>{label}</div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.04em", color, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
          {sub && <div style={{ fontSize: 12, color: "var(--color-text-faint)", marginTop: 3 }}>{sub}</div>}
        </div>
        {Icon && (
          <div style={{ width: 36, height: 36, background: "var(--color-bg-primary)", borderRadius: R.md, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--color-border)", flexShrink: 0, marginLeft: 8 }}>
            <span style={{ fontSize: 16 }}>{Icon}</span>
          </div>
        )}
      </div>
    </div>
  );
}
