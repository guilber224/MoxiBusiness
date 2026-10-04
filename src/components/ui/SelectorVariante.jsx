import { useMemo } from "react";
import { Bs } from "../../currency.js";
import { C } from "../../theme.jsx";
import { Modal } from "./Modal.jsx";

/** Al vender un producto con variantes: elegir talla/color viendo stock y precio de cada una. */
export function SelectorVariante({ grupo, variantes, onElegir, onClose }) {
  const ordenadas = useMemo(() => {
    const orden = Array.isArray(grupo.attrs) ? grupo.attrs : [];
    const pos = (v, i) => orden[i]?.valores?.indexOf(v?.attrs?.[orden[i].nombre]) ?? 0;
    return [...variantes].sort((a, b) => orden.reduce((r, _, i) => r || pos(a, i) - pos(b, i), 0));
  }, [grupo, variantes]);

  return (
    <Modal title={grupo.name} onClose={onClose} width={560} zIndex={300}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14 }}>
        {grupo.img && <img src={grupo.img} alt="" style={{ width: 56, height: 56, borderRadius: 10, objectFit: "cover" }} />}
        <div style={{ fontSize: 13, color: C.textMid }}>Elige la variante · stock total <strong>{grupo.stock} {grupo.unit}</strong></div>
      </div>
      {ordenadas.length === 0 && <div style={{ fontSize: 13, color: C.textFaint }}>Este producto no tiene variantes activas.</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))", gap: 8 }}>
        {ordenadas.map(v => {
          const sin = v.stock <= 0;
          return (
            <button key={v.id} onClick={() => onElegir(v)}
              style={{ padding: "10px 8px", borderRadius: 12, cursor: "pointer", textAlign: "center", fontFamily: "inherit", color: "var(--color-text)",
                border: `1.5px solid ${sin ? C.border : "#111E7B"}`, background: sin ? "var(--color-bg-primary)" : "var(--color-bg-surface)", opacity: sin ? 0.7 : 1 }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>{v.variantName || v.name}</div>
              <div style={{ fontSize: 12, color: "#111E7B", fontWeight: 700, marginTop: 2 }}>{Bs(v.price)}</div>
              <div style={{ fontSize: 11, color: sin ? C.red : C.green, fontWeight: 600 }}>{sin ? "Agotado" : `${v.stock} ${v.unit}`}</div>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
