// Aviso discreto del estado de sincronización. Nunca se muestra una lista vacía "falsa":
// si una parte no se pudo actualizar, se dice cuál y se ofrece reintentar.
const NOMBRES = {
  config: "datos de la empresa", products: "productos", categories: "categorías", customers: "clientes",
  sales: "ventas", expenses: "gastos", movements: "kardex", pedidos: "pedidos", suppliers: "proveedores",
  purchases: "compras", formulas: "fórmulas", orders: "producción", users: "usuarios", activityLogs: "actividad", caja: "caja",
};

export function EstadoDatos({ estado, onReintentar }) {
  const fallos = Object.keys(estado?.errores || {});
  if (fallos.length) {
    const sinRed = Object.values(estado.errores).some(m => /conexión/i.test(m));
    return (
      <div role="status" style={{ background: "var(--color-amber-bg, #fffbeb)", borderBottom: "1px solid var(--color-amber, #f59e0b)", color: "var(--color-text)", padding: "8px 18px", fontSize: 13, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", flexShrink: 0 }}>
        <span>⚠️ {sinRed ? "Sin conexión." : "No se pudo actualizar:"} {fallos.map(k => NOMBRES[k] || k).join(", ")}. Se muestra la última información guardada en este dispositivo.</span>
        <button onClick={onReintentar} disabled={estado.cargando} style={{ marginLeft: "auto", border: "1px solid var(--color-border)", background: "var(--color-bg-surface)", color: "var(--color-text)", borderRadius: 6, padding: "4px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
          {estado.cargando ? "Reintentando…" : "Reintentar"}
        </button>
      </div>
    );
  }
  if (estado?.cargando && estado?.cargadoUnaVez) {
    return (
      <div role="status" aria-live="polite" style={{ position: "fixed", bottom: 16, left: "50%", transform: "translateX(-50%)", zIndex: 50, background: "var(--color-bg-surface)", border: "1px solid var(--color-border)", borderRadius: 999, padding: "6px 14px", fontSize: 12, color: "var(--color-text-mid)", boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }}>
        Actualizando…
      </div>
    );
  }
  return null;
}
