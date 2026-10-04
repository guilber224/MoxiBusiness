import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Plus, X } from "lucide-react";
import { armarFilas, atributosDe, variantesQuitadas } from "../utils/variantes.js";
import { C } from "../theme.jsx";
import { inp, lbl, mkBtn, mkBadge } from "../styles.js";
import { Modal } from "./ui/Modal.jsx";

const SUGERENCIAS = {
  Talla: ["XS", "S", "M", "L", "XL", "XXL"],
  "Talla de calzado": ["35", "36", "37", "38", "39", "40", "41", "42", "43"],
  Color: ["Negro", "Blanco", "Rojo", "Azul", "Verde", "Gris"],
  Sabor: ["Fresa", "Chocolate", "Vainilla"],
  Tamaño: ["Pequeño", "Mediano", "Grande"],
};

/** Valores de un atributo como etiquetas: escribe y Enter (o coma) para agregar. */
function EntradaValores({ valores, onChange, sugerencias }) {
  const [txt, setTxt] = useState("");
  const agregar = v => {
    const nuevos = v.split(",").map(x => x.trim()).filter(x => x && !valores.includes(x));
    if (nuevos.length) onChange([...valores, ...nuevos]);
    setTxt("");
  };
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: 6, border: `1px solid ${C.border}`, borderRadius: 8, background: "var(--color-bg-surface)" }}>
        {valores.map(v => (
          <span key={v} style={{ ...mkBadge("blue"), gap: 4 }}>{v}
            <button onClick={() => onChange(valores.filter(x => x !== v))} aria-label={`Quitar ${v}`} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "inherit", display: "flex" }}><X size={11} /></button>
          </span>
        ))}
        <input value={txt} onChange={e => setTxt(e.target.value)} placeholder={valores.length ? "Agregar…" : "Escribe y presiona Enter"}
          onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); agregar(txt); } if (e.key === "Backspace" && !txt && valores.length) onChange(valores.slice(0, -1)); }}
          onBlur={() => txt && agregar(txt)}
          style={{ flex: 1, minWidth: 120, border: "none", outline: "none", background: "transparent", color: "var(--color-text)", fontSize: 13, fontFamily: "inherit" }} />
      </div>
      {sugerencias && <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
        {sugerencias.filter(s => !valores.includes(s)).map(s => <button key={s} onClick={() => onChange([...valores, s])} style={{ ...mkBtn("ghost"), padding: "2px 8px", fontSize: 11 }}>+ {s}</button>)}
      </div>}
    </div>
  );
}

/** Configura tallas/colores/etc. de un producto y edita precio, código y stock inicial de cada combinación. */
export function VariantesEditor({ producto, variantes, A, onClose }) {
  const inicial = atributosDe(producto);
  const [atributos, setAtributos] = useState(inicial.length ? inicial : [{ nombre: "Talla", valores: [] }]);
  const [cambios, setCambios] = useState({}); // por nombre de variante: { precio, costo, codigo, stock }
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState("");

  const filas = useMemo(() => armarFilas(atributos, variantes, producto).map(f => ({ ...f, ...(cambios[f.nombre] || {}) })), [atributos, variantes, producto, cambios]);
  const quitadas = useMemo(() => variantesQuitadas(atributos, variantes), [atributos, variantes]);
  const conStock = quitadas.filter(v => v.stock !== 0);
  const editar = (nombre, campo, valor) => setCambios(c => ({ ...c, [nombre]: { ...(c[nombre] || {}), [campo]: valor } }));
  const aplicarATodas = campo => {
    const v = filas[0]?.[campo];
    setCambios(c => Object.fromEntries(filas.map(f => [f.nombre, { ...(c[f.nombre] || {}), [campo]: v }])));
  };

  const guardar = async () => {
    setErr("");
    if (conStock.length) { setErr(`No puedes quitar ${conStock.map(v => v.variantName).join(", ")} porque tienen stock. Ajústalo a 0 en Inventario primero.`); return; }
    if (filas.length > 300) { setErr("Máximo 300 combinaciones por producto"); return; }
    const codigos = filas.map(f => String(f.codigo || "").trim()).filter(Boolean);
    if (new Set(codigos).size !== codigos.length) { setErr("Hay códigos de barras repetidos entre las variantes"); return; }
    if (!filas.length && !variantes.length) { setErr("Agrega al menos un valor (por ejemplo, la talla S)"); return; }
    if (!filas.length && !window.confirm(`Se quitarán todas las variantes y "${producto.name}" volverá a ser un producto simple. ¿Continuar?`)) return;
    setGuardando(true);
    try {
      const r = await A.guardarVariantes(producto.id,
        atributos.map(a => ({ nombre: a.nombre.trim(), valores: a.valores })).filter(a => a.nombre && a.valores.length),
        filas.map(f => ({ id: f.id, atributos: f.attrs, precio: f.precio === "" ? null : Number(f.precio), costo: f.costo === "" ? null : Number(f.costo), codigo: f.codigo || null, ...(f.existente ? {} : { stock: Number(f.stock) || 0 }) })));
      toast.success(`Variantes guardadas: ${r.nuevas} nuevas, ${r.actualizadas} actualizadas${r.quitadas ? `, ${r.quitadas} quitadas` : ""}`);
      onClose();
    } catch (e) { setErr(e.message); } finally { setGuardando(false); }
  };

  const celda = { ...inp, padding: "5px 7px", fontSize: 12 };
  return (
    <Modal title={`Variantes de "${producto.name}"`} onClose={() => !guardando && onClose()} width={820}>
      <div style={{ fontSize: 13, color: C.textMid, marginBottom: 12 }}>
        Define las características (talla, color, sabor…) y se crearán todas las combinaciones. Cada una tiene su propio stock, precio y código de barras.
        {!producto.isGroup && producto.stock !== 0 && <div style={{ color: C.amber, marginTop: 6 }}>⚠ Este producto tiene {producto.stock} {producto.unit} en stock. Para crear variantes, primero déjalo en 0 con un ajuste en Inventario y luego carga el stock en cada variante.</div>}
      </div>

      {atributos.map((a, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "160px 1fr auto", gap: 8, alignItems: "start", marginBottom: 10 }} className="fila-atributo">
          <div>
            <label style={lbl}>Característica</label>
            <input list="sugerencias-atributo" style={inp} value={a.nombre} onChange={e => setAtributos(at => at.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)))} placeholder="Ej: Talla" />
          </div>
          <div>
            <label style={lbl}>Valores</label>
            <EntradaValores valores={a.valores} onChange={vs => setAtributos(at => at.map((x, j) => (j === i ? { ...x, valores: vs } : x)))} sugerencias={SUGERENCIAS[a.nombre.trim()]} />
          </div>
          <button onClick={() => setAtributos(at => at.filter((_, j) => j !== i))} aria-label="Quitar característica" style={{ ...mkBtn("ghost"), marginTop: 18, padding: "7px 9px" }}><X size={14} /></button>
        </div>
      ))}
      <datalist id="sugerencias-atributo">{Object.keys(SUGERENCIAS).map(s => <option key={s} value={s} />)}</datalist>
      {atributos.length < 3 && <button onClick={() => setAtributos(at => [...at, { nombre: at.some(x => x.nombre === "Color") ? "" : "Color", valores: [] }])} style={{ ...mkBtn("ghost"), marginBottom: 14 }}><Plus size={14} /> Agregar característica</button>}
      <style>{`@media (max-width: 640px) { .fila-atributo { grid-template-columns: 1fr auto !important; } .fila-atributo > div:nth-child(2) { grid-column: 1 / -1; grid-row: 2; } }`}</style>

      {filas.length > 0 && <>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "6px 0 8px", flexWrap: "wrap", gap: 6 }}>
          <strong style={{ fontSize: 13 }}>{filas.length} variante{filas.length === 1 ? "" : "s"}</strong>
          <span style={{ display: "flex", gap: 6 }}>
            <button onClick={() => aplicarATodas("precio")} style={{ ...mkBtn("ghost"), fontSize: 11, padding: "3px 8px" }}>Mismo precio a todas</button>
            <button onClick={() => aplicarATodas("costo")} style={{ ...mkBtn("ghost"), fontSize: 11, padding: "3px 8px" }}>Mismo costo a todas</button>
          </span>
        </div>
        <div style={{ maxHeight: 320, overflow: "auto", border: `1px solid ${C.border}`, borderRadius: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead style={{ position: "sticky", top: 0, background: "var(--color-bg-surface)", zIndex: 1 }}>
              <tr>{["Variante", "Precio", "Costo", "Código de barras", "Stock"].map(h => <th key={h} style={{ textAlign: "left", padding: "7px 8px", whiteSpace: "nowrap" }}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {filas.map(f => (
                <tr key={f.nombre} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td style={{ padding: "5px 8px", fontWeight: 600, whiteSpace: "nowrap" }}>{f.nombre} {!f.existente && <span style={{ ...mkBadge("green"), fontSize: 9 }}>nueva</span>}</td>
                  <td style={{ padding: "4px 6px", minWidth: 80 }}><input type="number" min="0" style={celda} value={f.precio} onChange={e => editar(f.nombre, "precio", e.target.value)} /></td>
                  <td style={{ padding: "4px 6px", minWidth: 80 }}><input type="number" min="0" style={celda} value={f.costo} onChange={e => editar(f.nombre, "costo", e.target.value)} /></td>
                  <td style={{ padding: "4px 6px", minWidth: 130 }}><input style={celda} value={f.codigo} onChange={e => editar(f.nombre, "codigo", e.target.value)} placeholder="Opcional" /></td>
                  <td style={{ padding: "4px 6px", minWidth: 80 }}>
                    {f.existente ? <span title="El stock de una variante existente se cambia en Inventario">{f.stock} {producto.unit}</span>
                      : <input type="number" min="0" style={celda} value={f.stock} onChange={e => editar(f.nombre, "stock", e.target.value)} placeholder="Inicial" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>}
      {quitadas.length > 0 && <div style={{ fontSize: 12, color: conStock.length ? C.red : C.textMid, marginTop: 8 }}>
        Se quitarán: {quitadas.map(v => `${v.variantName}${v.stock ? ` (stock ${v.stock})` : ""}`).join(", ")}
      </div>}
      {err && <div style={{ color: C.red, fontSize: 13, marginTop: 10 }}>{err}</div>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
        <button onClick={onClose} disabled={guardando} style={mkBtn("ghost")}>Cancelar</button>
        <button onClick={guardar} disabled={guardando || (!producto.isGroup && producto.stock !== 0 && filas.length > 0)} style={mkBtn("primary")}>{guardando ? "Guardando…" : "Guardar variantes"}</button>
      </div>
    </Modal>
  );
}
