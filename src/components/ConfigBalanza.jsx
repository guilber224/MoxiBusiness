import { useState } from "react";
import toast from "react-hot-toast";
import { leerBalanza, leerEtiquetaBalanza } from "../utils/precios.js";
import { C } from "../theme.jsx";
import { card, inp, lbl, mkBtn } from "../styles.js";

/** Ajustes → Balanza: formato de las etiquetas que imprime la balanza (peso o precio dentro del código de barras). */
export function ConfigBalanza({ A, config, puedeEditar }) {
  const [cfg, setCfg] = useState(() => leerBalanza(config));
  const [abierto, setAbierto] = useState(false);
  const [prueba, setPrueba] = useState("");
  const [guardando, setGuardando] = useState(false);
  const res = prueba ? leerEtiquetaBalanza(prueba, { ...cfg, activa: true }) : null;

  const guardar = async () => {
    setGuardando(true);
    try { await A.actualizarConfig({ balanza: cfg }); toast.success("Balanza guardada"); }
    catch (e) { toast.error(e.message); } finally { setGuardando(false); }
  };

  return (
    <div style={{ ...card(), marginTop: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>⚖️ Balanza con etiquetas</div>
          <div style={{ fontSize: 12, color: C.textFaint, marginTop: 2 }}>{cfg.activa ? "Activa: el lector reconoce las etiquetas de la balanza y agrega el peso al carrito." : "Para carnicerías, fiambrerías y verdulerías que pesan e imprimen etiqueta."}</div>
        </div>
        <button onClick={() => setAbierto(v => !v)} style={mkBtn("ghost")}>{abierto ? "Cerrar" : "Configurar"}</button>
      </div>
      {abierto && <div style={{ marginTop: 12 }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, marginBottom: 10, cursor: "pointer" }}>
          <input type="checkbox" checked={cfg.activa} disabled={!puedeEditar} onChange={e => setCfg({ ...cfg, activa: e.target.checked })} /> Usar etiquetas de balanza
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
          <div><label style={lbl}>Prefijos</label><input style={inp} value={cfg.prefijos} disabled={!puedeEditar} onChange={e => setCfg({ ...cfg, prefijos: e.target.value })} /></div>
          <div><label style={lbl}>Dígitos del producto</label>
            <select style={inp} value={cfg.digitosProducto} disabled={!puedeEditar} onChange={e => setCfg({ ...cfg, digitosProducto: Number(e.target.value) })}>{[4, 5, 6].map(d => <option key={d} value={d}>{d}</option>)}</select></div>
          <div><label style={lbl}>La etiqueta trae</label>
            <select style={inp} value={cfg.valor} disabled={!puedeEditar} onChange={e => setCfg({ ...cfg, valor: e.target.value })}>
              <option value="peso">Peso (gramos)</option><option value="precio">Precio (centavos)</option>
            </select></div>
        </div>
        <div style={{ fontSize: 12, color: C.textMid, margin: "10px 0" }}>
          El <strong>código del producto</strong> en la balanza debe coincidir con el <strong>código de barras</strong> del producto en Moxi (por ejemplo, 123 o 00123).
        </div>
        <label style={lbl}>Probar con una etiqueta</label>
        <input style={inp} value={prueba} onChange={e => setPrueba(e.target.value.replace(/\D/g, "").slice(0, 13))} placeholder="Ej: 2000123012504" inputMode="numeric" />
        {prueba.length === 13 && <div style={{ fontSize: 12, marginTop: 6, color: res ? C.green : C.red }}>
          {res ? `Producto ${res.plu} · ${res.peso != null ? `${res.peso.toLocaleString("es-BO")} kg` : `Bs ${res.monto.toLocaleString("es-BO")}`}` : "No coincide con el formato configurado"}
        </div>}
        {puedeEditar && <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
          <button onClick={guardar} disabled={guardando} style={mkBtn("primary")}>{guardando ? "Guardando…" : "Guardar balanza"}</button>
        </div>}
      </div>}
    </div>
  );
}
