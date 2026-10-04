import { useState } from "react";
import toast from "react-hot-toast";
import { Bs } from "../currency.js";
import { C } from "../theme.jsx";
import { inp, lbl, mkBtn } from "../styles.js";

const VACIA = { name: "", factor: "", price: "", barcode: "" };

/** Presentaciones de un producto: "Caja x12" = 12 unidades base a su propio precio. */
export function PresentacionesEditor({ producto, presentaciones, A }) {
  const [nueva, setNueva] = useState(VACIA);
  const [guardando, setGuardando] = useState(false);
  const unidad = producto.unit || "unidad";

  const agregar = async () => {
    if (!nueva.name.trim()) { toast.error("Escribe el nombre (ej: Caja x12)"); return; }
    if (!(Number(nueva.factor) > 0)) { toast.error(`¿Cuántas ${unidad} trae? Debe ser mayor a 0`); return; }
    if (nueva.price === "" || Number(nueva.price) < 0) { toast.error("Escribe el precio de la presentación"); return; }
    setGuardando(true);
    try { await A.guardarPresentacion({ ...nueva, productId: producto.id, order: presentaciones.length }); setNueva(VACIA); toast.success("Presentación agregada"); }
    catch (e) { toast.error(e.message); } finally { setGuardando(false); }
  };
  const quitar = async p => {
    if (!window.confirm(`¿Quitar la presentación "${p.name}"?`)) return;
    try { await A.eliminarPresentacion(p.id); } catch (e) { toast.error(e.message); }
  };

  return (
    <div>
      {presentaciones.length > 0 && <div style={{ display: "grid", gap: 4, marginBottom: 8 }}>
        {presentaciones.map(p => {
          const porUnidad = p.factor > 0 ? p.price / p.factor : 0;
          return (
            <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, fontSize: 13, padding: "6px 8px", borderRadius: 8, background: "var(--color-bg-surface)", border: `1px solid ${C.border}` }}>
              <span><strong>{p.name}</strong> = {p.factor} {unidad} · {Bs(p.price)} <span style={{ color: C.textFaint, fontSize: 11 }}>({Bs(porUnidad)} c/u{producto.price > 0 && porUnidad < producto.price ? `, ahorra ${Math.round((1 - porUnidad / producto.price) * 100)}%` : ""}){p.barcode ? ` · cód. ${p.barcode}` : ""}</span></span>
              <button onClick={() => quitar(p)} aria-label={`Quitar ${p.name}`} style={{ ...mkBtn("danger"), padding: "3px 8px", fontSize: 11 }}>✕</button>
            </div>
          );
        })}
      </div>}
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.8fr 0.9fr 1.2fr auto", gap: 6, alignItems: "end" }} className="fila-presentacion">
        <div><label style={lbl}>Presentación</label><input style={inp} value={nueva.name} onChange={e => setNueva({ ...nueva, name: e.target.value })} placeholder="Caja x12" /></div>
        <div><label style={lbl}>Trae ({unidad})</label><input type="number" min="0" step="any" style={inp} value={nueva.factor} onChange={e => setNueva({ ...nueva, factor: e.target.value })} placeholder="12" /></div>
        <div><label style={lbl}>Precio</label><input type="number" min="0" step="0.01" style={inp} value={nueva.price} onChange={e => setNueva({ ...nueva, price: e.target.value })} placeholder="0.00" /></div>
        <div><label style={lbl}>Código (opcional)</label><input style={inp} value={nueva.barcode} onChange={e => setNueva({ ...nueva, barcode: e.target.value })} /></div>
        <button onClick={agregar} disabled={guardando} style={{ ...mkBtn("primary"), padding: "8px 12px" }}>+ Agregar</button>
      </div>
      <style>{`@media (max-width: 640px) { .fila-presentacion { grid-template-columns: 1fr 1fr !important; } }`}</style>
    </div>
  );
}
