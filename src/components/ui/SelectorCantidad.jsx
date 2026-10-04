import { useState } from "react";
import { Bs } from "../../currency.js";
import { cantidadPorMonto } from "../../utils/precios.js";
import { C } from "../../theme.jsx";
import { inp, lbl, mkBtn } from "../../styles.js";
import { Modal } from "./Modal.jsx";

/**
 * Antes de agregar al carrito un producto que tiene presentaciones (Caja x12) o que se vende por peso/medida:
 * elegir la presentación, o escribir la cantidad (1,25 kg) o el monto (Bs 10).
 */
export function SelectorCantidad({ producto, presentaciones = [], onElegir, onClose }) {
  const [cantidad, setCantidad] = useState("");
  const [monto, setMonto] = useState("");
  const unidad = producto.unit || "unidad";
  const qMonto = cantidadPorMonto(monto, producto.price);
  const agregarFraccion = () => {
    const q = monto !== "" ? qMonto : Number(String(cantidad).replace(",", "."));
    if (!(q > 0)) return;
    onElegir({ qty: q });
  };

  return (
    <Modal title={producto.name} onClose={onClose} width={480} zIndex={300}>
      {presentaciones.length > 0 && <>
        <label style={lbl}>¿Cómo lo vendes?</label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(130px,1fr))", gap: 8, marginBottom: 14 }}>
          <button onClick={() => onElegir({ qty: 1 })} style={opcion}>
            <div style={{ fontWeight: 800 }}>1 {unidad}</div><div style={{ color: "#111E7B", fontWeight: 700, fontSize: 13 }}>{Bs(producto.price)}</div>
          </button>
          {presentaciones.map(p => (
            <button key={p.id} onClick={() => onElegir({ qty: 1, presentation: p })} style={opcion}>
              <div style={{ fontWeight: 800 }}>{p.name}</div>
              <div style={{ color: "#111E7B", fontWeight: 700, fontSize: 13 }}>{Bs(p.price)}</div>
              <div style={{ fontSize: 11, color: C.textFaint }}>{p.factor} {unidad} · {Bs(p.price / p.factor)} c/u</div>
            </button>
          ))}
        </div>
      </>}
      {producto.fraction && <>
        <label style={lbl}>Cantidad en {unidad}</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          {[0.25, 0.5, 0.75, 1, 1.5, 2].map(q => <button key={q} onClick={() => onElegir({ qty: q })} style={{ ...mkBtn("ghost"), padding: "6px 10px" }}>{q.toLocaleString("es-BO")} {unidad}</button>)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div><label style={lbl}>Otra cantidad</label>
            <input type="number" inputMode="decimal" min="0" step="any" style={inp} value={cantidad} onChange={e => { setCantidad(e.target.value); setMonto(""); }} placeholder={`Ej: 1.25 ${unidad}`} autoFocus onKeyDown={e => e.key === "Enter" && agregarFraccion()} /></div>
          <div><label style={lbl}>O por monto (Bs.)</label>
            <input type="number" inputMode="decimal" min="0" step="any" style={inp} value={monto} onChange={e => { setMonto(e.target.value); setCantidad(""); }} placeholder="Ej: 10" onKeyDown={e => e.key === "Enter" && agregarFraccion()} /></div>
        </div>
        {monto !== "" && <div style={{ fontSize: 12, color: C.textMid, marginTop: 6 }}>{Bs(Number(monto))} = {qMonto.toLocaleString("es-BO")} {unidad} a {Bs(producto.price)} por {unidad}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
          <button onClick={agregarFraccion} disabled={!(Number(cantidad) > 0 || qMonto > 0)} style={mkBtn("primary")}>Agregar al carrito</button>
        </div>
      </>}
    </Modal>
  );
}

const opcion = { padding: "10px 8px", borderRadius: 12, border: "1.5px solid #111E7B", background: "var(--color-bg-surface)", cursor: "pointer", textAlign: "center", fontFamily: "inherit", color: "var(--color-text)" };
