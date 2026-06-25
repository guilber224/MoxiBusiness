import { C, R, FONT } from "./theme.jsx";

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  CSS HELPERS                                                        ║
// ╚══════════════════════════════════════════════════════════════════════╝
export const card = (extra={}) => ({ background: "var(--color-bg-surface)", border: "1px solid var(--color-border)", borderRadius: 14, padding: "1rem 1.25rem", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", ...extra });
export const lbl = { fontSize: 11, color: "var(--color-text-mid)", fontWeight: 600, letterSpacing: "0.055em", textTransform: "uppercase", display: "block", marginBottom: 4 };
export const inp = { width: "100%", padding: "8px 11px", fontSize: 13, border: "1px solid var(--color-border)", borderRadius: R.md, background: "var(--color-bg-surface)", color: "var(--color-text)", boxSizing: "border-box", outline: "none", fontFamily: FONT, transition: "border 0.15s" };
export const row = g => ({ display:"flex", gap:g||10, marginBottom:10 });
export const mkBtn = (variant="default") => {
  const base = { padding:"7px 14px", borderRadius:R.md, cursor:"pointer", fontSize:13, fontWeight:500, border:"none", display:"inline-flex", alignItems:"center", gap:6, fontFamily:FONT, letterSpacing:"-0.01em", transition:"opacity 0.1s, background 0.1s", whiteSpace:"nowrap" };
  return { ...base, ...({
    primary: { background: "#111E7B", color: "white" },
    ghost:   { background: "transparent", color: "var(--color-text-mid)", border: "1px solid var(--color-border)" },
    danger:  { background: C.redBg, color: C.red },
    success: { background: C.greenBg, color: C.green },
    warning: { background: C.amberBg, color: C.amber },
    subtle:  { background: "var(--color-bg-primary)", color: "var(--color-text)", border: "1px solid var(--color-border)" },
    default: { background: "var(--color-bg-primary)", color: "var(--color-text)", border: "1px solid var(--color-border)" },
  }[variant]) };
};
export const mkBadge = (v="gray") => {
  const m = { red:[C.redBg,C.red], amber:[C.amberBg,C.amber], green:[C.greenBg,C.green], blue:[C.blueBg,C.blue], gray:["#F2F0EB",C.textMid] };
  const [bg,fg] = m[v]||m.gray;
  return { display:"inline-flex", alignItems:"center", padding:"2px 8px", borderRadius:20, fontSize:11, fontWeight:600, background:bg, color:fg, whiteSpace:"nowrap" };
};
