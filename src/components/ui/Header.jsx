export function Header({ title, sub, action }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "-0.03em", color: "var(--color-text)" }}>{title}</h2>
        {sub && <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--color-text-mid)" }}>{sub}</p>}
      </div>
      {action && <div style={{ display: "flex", gap: 8 }}>{action}</div>}
    </div>
  );
}
