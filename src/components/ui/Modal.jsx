import { X } from "lucide-react";

export function Modal({ title, onClose, children, width = 560 }) {
  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.52)", zIndex: 200, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", overflowY: "auto", backdropFilter: "blur(4px)" }}>
      <div style={{ background: "var(--color-bg-surface)", borderRadius: 16, width: "100%", maxWidth: width, border: "1px solid var(--color-border)", boxShadow: "0 24px 64px rgba(0,0,0,0.18)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid var(--color-border)" }}>
          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-0.02em", color: "var(--color-text)" }}>{title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-mid)", fontSize: 20, lineHeight: 1, padding: "0 2px", display: "flex", alignItems: "center" }}>
            <X size={18} strokeWidth={1.8} />
          </button>
        </div>
        <div style={{ padding: "20px 20px 24px" }}>{children}</div>
      </div>
    </div>
  );
}
