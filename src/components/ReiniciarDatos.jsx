import { useState } from "react";
import toast from "react-hot-toast";
import { AlertTriangle } from "lucide-react";
import { C } from "../theme.jsx";
import { card, inp, lbl, mkBtn } from "../styles.js";
import { Modal } from "./ui/Modal.jsx";

const MODULOS = [
  ["ventas", "Ventas y cobros", "Todas las ventas, sus pagos y la numeración (la próxima nota será la N° 1). El stock NO se devuelve."],
  ["caja", "Caja y gastos", "Turnos de caja, gastos e ingresos."],
  ["productos", "Productos e inventario", "Productos, variantes, categorías, kardex y lotes. Las ventas que conserves mantienen el nombre del producto."],
  ["clientes", "Clientes", "La lista de clientes. Las ventas que conserves mantienen el nombre del cliente."],
  ["proveedores", "Proveedores y compras", "Proveedores, compras y deudas con proveedores."],
  ["pedidos", "Pedidos y cotizaciones", "Todos los pedidos y cotizaciones."],
  ["produccion", "Producción", "Fórmulas y órdenes de producción."],
  ["actividad", "Registro de actividad", "El historial de quién hizo qué."],
];

/** Zona de peligro de Ajustes: borrar módulos para empezar de cero (solo administrador). */
export function ReiniciarDatos({ A, config, setTab }) {
  const [abierto, setAbierto] = useState(false);
  const [elegidos, setElegidos] = useState([]);
  const [conf, setConf] = useState("");
  const [borrando, setBorrando] = useState(false);
  const [err, setErr] = useState("");
  const nombre = config?.businessName || "";
  const coincide = conf.trim().toLowerCase() === nombre.trim().toLowerCase() && nombre.trim() !== "";

  const alternar = id => setElegidos(e => (e.includes(id) ? e.filter(x => x !== id) : [...e, id]));
  const cerrar = () => { if (!borrando) { setAbierto(false); setElegidos([]); setConf(""); setErr(""); } };
  const borrar = async () => {
    setBorrando(true); setErr("");
    try {
      await A.reiniciarDatos(elegidos, conf);
      toast.success("Datos borrados. Puedes empezar de cero.");
      setAbierto(false); setElegidos([]); setConf("");
    } catch (e) { setErr(e.message); } finally { setBorrando(false); }
  };

  return (
    <>
      <div style={{ ...card(), marginTop: 14, borderColor: "rgba(239,68,68,0.35)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: C.red }}>Empezar de cero</div>
            <div style={{ fontSize: 12, color: C.textFaint, marginTop: 2 }}>Borra los datos de los módulos que elijas (por ejemplo, después de hacer pruebas). Tu cuenta, tu equipo y tu suscripción no se tocan.</div>
          </div>
          <button onClick={() => setAbierto(true)} style={mkBtn("danger")}>Borrar datos…</button>
        </div>
      </div>

      {abierto && <Modal title="Borrar datos para empezar de cero" onClose={cerrar} width={620}>
        <div style={{ display: "flex", gap: 10, padding: 12, borderRadius: 10, background: "rgba(239,68,68,0.08)", marginBottom: 14, fontSize: 13 }}>
          <AlertTriangle size={18} color={C.red} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>Esto <strong>no se puede deshacer</strong>. Antes, te recomendamos descargar una copia en
            <button onClick={() => { cerrar(); setTab?.("exportar"); }} style={{ background: "none", border: "none", padding: "0 4px", color: "#111E7B", fontWeight: 700, cursor: "pointer", textDecoration: "underline", fontFamily: "inherit", fontSize: 13 }}>Exportar a Excel</button>.
          </div>
        </div>
        <label style={lbl}>¿Qué quieres borrar?</label>
        <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
          {MODULOS.map(([id, titulo, desc]) => (
            <label key={id} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 10px", borderRadius: 10, cursor: "pointer",
              border: `1px solid ${elegidos.includes(id) ? "rgba(239,68,68,0.5)" : C.border}`, background: elegidos.includes(id) ? "rgba(239,68,68,0.05)" : "transparent" }}>
              <input type="checkbox" checked={elegidos.includes(id)} onChange={() => alternar(id)} style={{ marginTop: 3 }} />
              <span><strong style={{ fontSize: 13 }}>{titulo}</strong><br /><span style={{ fontSize: 12, color: C.textMid }}>{desc}</span></span>
            </label>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button onClick={() => setElegidos(MODULOS.map(m => m[0]))} style={{ ...mkBtn("ghost"), fontSize: 12 }}>Marcar todo</button>
          <button onClick={() => setElegidos([])} style={{ ...mkBtn("ghost"), fontSize: 12 }}>Ninguno</button>
        </div>
        <label style={lbl}>Para confirmar, escribe el nombre de tu empresa: <span style={{ textTransform: "none", color: C.text }}>{nombre}</span></label>
        <input style={inp} value={conf} onChange={e => setConf(e.target.value)} placeholder={nombre} autoComplete="off" />
        {err && <div style={{ color: C.red, fontSize: 13, marginTop: 10 }}>{err}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
          <button onClick={cerrar} disabled={borrando} style={mkBtn("ghost")}>Cancelar</button>
          <button onClick={borrar} disabled={borrando || !elegidos.length || !coincide}
            style={{ ...mkBtn("primary"), background: C.red, opacity: borrando || !elegidos.length || !coincide ? 0.5 : 1 }}>
            {borrando ? "Borrando…" : `Borrar ${elegidos.length || ""} módulo${elegidos.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </Modal>}
    </>
  );
}
