import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { MessageCircle, Plus, Settings2, Snowflake, Trash2, UserPlus, Check } from "lucide-react";
import { n, fDateTime } from "../utils/businessLogic.js";
import { Bs, getCurrencySymbol } from "../currency.js";
import { C } from "../theme.jsx";
import { card, inp, lbl, mkBtn, mkBadge, row } from "../styles.js";
import { useAccion } from "../hooks/useAccion.js";
import { useMostrarMas } from "../hooks/useMostrarMas.js";
import { Header } from "./ui/Header.jsx";
import { Modal } from "./ui/Modal.jsx";
import { Empty } from "./ui/Empty.jsx";
import { KPI } from "./ui/KPI.jsx";
import { SearchInput } from "./ui/SearchInput.jsx";
import { BotonMostrarMas } from "./ui/BotonMostrarMas.jsx";
import {
  ESTADOS_MEMBRESIA, UNIDADES, estadoMembresia, puedeIngresar, membresiaActual, cubiertoHasta, finMembresia, diasEntre,
  duracionTxt, fechaCorta, hoyLocal, sumarDiasF, textoRenovacion,
} from "../utils/membresias.js";
import { waNumero } from "../utils/agenda.js";
import { imprimirTicket, leerAnchoTicket } from "../utils/ticketTermico.js";

const BADGE = { ACTIVA: "green", POR_VENCER: "amber", PROGRAMADA: "blue", VENCIDA: "red", AGOTADA: "red", CONGELADA: "blue", CANCELADA: "gray" };
const COLOR = { ACTIVA: C.green, POR_VENCER: C.amber, PROGRAMADA: "#111E7B", VENCIDA: C.red, AGOTADA: C.red, CONGELADA: "#0EA5E9", CANCELADA: "#9CA3AF" };
const METODOS = [["efectivo", "Efectivo"], ["qr", "QR"], ["banco", "Transferencia"], ["tarjeta", "Tarjeta"]];
const esAdmin = u => ["admin", "superadmin"].includes(String(u?.role || "").toLowerCase());
const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function Membresias({ D, A, user }) {
  const planes = D.membresiaPlanes || [];
  const membresias = D.membresias || [];
  const asistencias = D.asistencias || [];
  const config = D.config || {};
  const hoy = hoyLocal();
  const [vista, setVista] = useState("ingreso");
  const [vender, setVender] = useState(null);       // {customerId?, planId?}
  const [detalleCli, setDetalleCli] = useState(null);
  const [planForm, setPlanForm] = useState(null);

  const clientes = useMemo(() => new Map(D.customers.map(c => [c.id, c])), [D.customers]);
  const porCliente = useMemo(() => {
    const m = new Map();
    membresias.forEach(x => m.set(x.customerId, [...(m.get(x.customerId) || []), x]));
    return m;
  }, [membresias]);
  // Una fila por cliente con su membresía actual
  const socios = useMemo(() => [...porCliente].map(([id, lista]) => {
    const actual = membresiaActual(lista, hoy);
    return { id, cliente: clientes.get(id), nombre: clientes.get(id)?.name || actual?.customerName || "", actual, estado: estadoMembresia(actual, hoy), hasta: cubiertoHasta(lista, hoy), lista };
  }), [porCliente, clientes, hoy]);

  const kpi = useMemo(() => {
    const mes = hoy.slice(0, 7);
    return {
      activos: socios.filter(s => puedeIngresar(s.estado)).length,
      porVencer: socios.filter(s => s.hasta && diasEntre(hoy, s.hasta) < 7).length,
      vencidos: socios.filter(s => s.estado === "VENCIDA" && diasEntre(s.actual.fin, hoy) <= 30).length,
      ingresosHoy: asistencias.length,
      vendidoMes: membresias.filter(m => String(m.createdAt).slice(0, 7) === mes && m.estado !== "CANCELADA").reduce((a, m) => a + m.precio, 0),
    };
  }, [socios, asistencias, membresias, hoy]);

  const abrirVenta = (customerId = "", planId = "") => setVender({ customerId, planId });

  return (
    <div>
      <Header title="Membresías" sub="Socios, control de ingreso y renovaciones"
        action={<button onClick={() => abrirVenta()} style={mkBtn("primary")}>+ Vender membresía</button>} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 14 }}>
        <KPI label="Socios activos" value={kpi.activos} Icon="🏋️" color={C.green} />
        <KPI label="Por vencer (7 días)" value={kpi.porVencer} sub="sin renovar" Icon="⏳" color={kpi.porVencer ? C.amber : C.green} />
        <KPI label="Ingresos hoy" value={kpi.ingresosHoy} Icon="🚪" color={C.blue} />
        <KPI label="Vendido este mes" value={Bs(kpi.vendidoMes)} sub={kpi.vencidos ? `${kpi.vencidos} vencidos por recuperar` : undefined} Icon="💵" color={C.green} />
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {[["ingreso", "Control de ingreso"], ["socios", "Socios"], ["planes", "Planes"], ["hoy", `Ingresos de hoy${asistencias.length ? ` (${asistencias.length})` : ""}`]].map(([id, t]) => (
          <button key={id} onClick={() => setVista(id)} style={{ ...mkBtn(vista === id ? "primary" : "ghost"), padding: "6px 12px", fontSize: 13 }}>{t}</button>
        ))}
      </div>

      {planes.length === 0 && vista !== "planes" && <div style={{ ...card({ padding: 12 }), marginBottom: 12, fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span>Primero crea tus planes (por ejemplo: Mensual, Trimestral, 12 clases).</span>
        {esAdmin(user) ? <button onClick={() => setVista("planes")} style={mkBtn("primary")}>Crear planes</button> : <span style={{ color: C.textFaint }}>Pide al administrador que los cree.</span>}
      </div>}

      {vista === "ingreso" && <ControlIngreso D={D} A={A} porCliente={porCliente} hoy={hoy} onVender={abrirVenta} onDetalle={setDetalleCli} />}
      {vista === "socios" && <ListaSocios socios={socios} hoy={hoy} config={config} onVender={abrirVenta} onDetalle={setDetalleCli} />}
      {vista === "planes" && <ListaPlanes planes={planes} admin={esAdmin(user)} A={A} onEditar={setPlanForm} onVender={p => abrirVenta("", p.id)} />}
      {vista === "hoy" && (asistencias.length === 0 ? <Empty icon="🚪" title="Todavía no hay ingresos hoy" />
        : <div style={{ display: "grid", gap: 6 }}>
          {asistencias.map(a => (
            <button key={a.id} onClick={() => setDetalleCli(a.customerId)} style={{ ...card({ padding: "8px 12px" }), cursor: "pointer", fontFamily: "inherit", color: C.text, textAlign: "left", display: "flex", justifyContent: "space-between", gap: 10 }}>
              <span><strong>{new Date(a.fecha).toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit" })}</strong> · {a.customerName}</span>
              <span style={{ fontSize: 12, color: C.textMid }}>{a.planNombre}{a.usuario ? ` · ${a.usuario}` : ""}</span>
            </button>
          ))}
        </div>)}

      {vender && <VenderMembresia inicial={vender} D={D} A={A} porCliente={porCliente} hoy={hoy} config={config} onClose={() => setVender(null)} />}
      {detalleCli && !vender && <DetalleSocio clienteId={detalleCli} cliente={clientes.get(detalleCli)} lista={porCliente.get(detalleCli) || []} hoy={hoy} A={A} admin={esAdmin(user)} config={config}
        onClose={() => setDetalleCli(null)} onVender={planId => abrirVenta(detalleCli, planId)} />}
      {planForm && <FormPlan inicial={planForm} A={A} onClose={() => setPlanForm(null)} />}
    </div>
  );
}

// ── Control de ingreso (recepción) ─────────────────────────────────────────
function ControlIngreso({ D, A, porCliente, hoy, onVender, onDetalle }) {
  const [q, setQ] = useState("");
  const [resultado, setResultado] = useState(null);   // {ok, nombre, texto}
  const [ejecutar, ocupado] = useAccion();
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);
  useEffect(() => { if (!resultado) return; const t = setTimeout(() => setResultado(null), 5000); return () => clearTimeout(t); }, [resultado]);

  const encontrados = useMemo(() => {
    const t = norm(q.trim());
    if (t.length < 2) return [];
    const digitos = t.replace(/\D/g, "");
    return D.customers.filter(c => norm(c.name).includes(t) || (digitos.length >= 3 && (String(c.phone).replace(/\D/g, "").includes(digitos) || String(c.ci).replace(/\D/g, "").includes(digitos))))
      .sort((a, b) => (porCliente.has(b.id) ? 1 : 0) - (porCliente.has(a.id) ? 1 : 0)).slice(0, 8);
  }, [q, D.customers, porCliente]);

  const ingresar = async (c, m, forzar = false) => {
    try {
      const r = await A.registrarAsistencia(m.id, forzar);
      const quedan = r.membresia.sesionesTotal ? ` · le quedan ${r.membresia.sesionesTotal - r.membresia.sesionesUsadas} sesiones` : "";
      setResultado({ ok: true, nombre: c.name, texto: `${m.planNombre} · vence el ${fechaCorta(r.membresia.fin)} (${r.diasRestantes} días)${quedan}` });
      setQ(""); ref.current?.focus();
    } catch (e) {
      const msg = String(e.message || e);
      if (msg.startsWith("REPETIDO:") && window.confirm(`${c.name} ${msg.slice(9).trim()}. ¿Registrar otro ingreso?`)) return ingresar(c, m, true);
      if (!msg.startsWith("REPETIDO:")) setResultado({ ok: false, nombre: c.name, texto: msg });
    }
  };

  return (
    <div>
      <input ref={ref} value={q} onChange={e => setQ(e.target.value)} placeholder="Nombre, celular o CI del socio…" aria-label="Buscar socio"
        onKeyDown={e => { if (e.key === "Enter" && encontrados.length === 1) { const c = encontrados[0]; const m = membresiaActual(porCliente.get(c.id), hoy); if (m && puedeIngresar(estadoMembresia(m, hoy))) ejecutar(() => ingresar(c, m)); } }}
        style={{ ...inp, fontSize: 18, padding: "14px 16px", marginBottom: 12 }} />
      {resultado && <div style={{ padding: "16px 18px", borderRadius: 14, marginBottom: 12, background: resultado.ok ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.10)", border: `2px solid ${resultado.ok ? C.green : C.red}` }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: resultado.ok ? C.green : C.red }}>{resultado.ok ? `✓ Bienvenido(a), ${resultado.nombre}` : `✕ ${resultado.nombre}: no puede ingresar`}</div>
        <div style={{ fontSize: 14, marginTop: 4 }}>{resultado.texto}</div>
      </div>}
      {q.trim().length >= 2 && encontrados.length === 0 && <Empty icon="🔍" title="No se encontró" sub="Revisa el nombre o registra al cliente al vender la membresía." />}
      <div style={{ display: "grid", gap: 8 }}>
        {encontrados.map(c => {
          const lista = porCliente.get(c.id) || [];
          const m = membresiaActual(lista, hoy);
          const est = m ? estadoMembresia(m, hoy) : null;
          return (
            <div key={c.id} style={{ ...card({ padding: "12px 14px" }), display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", borderLeft: `5px solid ${est ? COLOR[est] : C.border}` }}>
              <button onClick={() => onDetalle(c.id)} style={{ flex: 1, minWidth: 200, textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", color: C.text }}>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{c.name}</div>
                <div style={{ fontSize: 12, color: C.textMid }}>{[c.ci && `CI ${c.ci}`, c.phone].filter(Boolean).join(" · ") || "—"}</div>
                {m ? <div style={{ fontSize: 13, marginTop: 2 }}>
                  {m.planNombre} · {fechaCorta(m.inicio)} al {fechaCorta(m.fin)}
                  {m.sesionesTotal ? ` · ${m.sesionesUsadas}/${m.sesionesTotal} sesiones` : ""}
                </div> : <div style={{ fontSize: 13, marginTop: 2, color: C.textFaint }}>Sin membresía</div>}
              </button>
              {est && <span style={mkBadge(BADGE[est])}>{ESTADOS_MEMBRESIA[est]}{est === "POR_VENCER" ? ` · ${diasEntre(hoy, m.fin)} d` : ""}</span>}
              {m && puedeIngresar(est)
                ? <button onClick={() => ejecutar(() => ingresar(c, m))} disabled={ocupado} style={{ ...mkBtn("primary"), padding: "10px 16px", fontSize: 14, background: C.green }}><Check size={16} /> Registrar ingreso</button>
                : <button onClick={() => onVender(c.id, m?.planId || "")} style={{ ...mkBtn("primary"), padding: "10px 16px", fontSize: 14 }}>{m ? "Renovar" : "Vender membresía"}</button>}
            </div>
          );
        })}
      </div>
      {!q && <div style={{ fontSize: 12, color: C.textFaint, marginTop: 8 }}>Escribe al menos 2 letras. Con un solo resultado, Enter registra el ingreso.</div>}
    </div>
  );
}

// ── Socios ─────────────────────────────────────────────────────────────────
function ListaSocios({ socios, hoy, config, onVender, onDetalle }) {
  const [filtro, setFiltro] = useState("activos");
  const [q, setQ] = useState("");
  const conteo = useMemo(() => {
    const c = { activos: 0, porVencer: 0, vencidos: 0, CONGELADA: 0, PROGRAMADA: 0, todos: socios.length };
    socios.forEach(s => {
      if (puedeIngresar(s.estado)) c.activos++;
      if (s.hasta && diasEntre(hoy, s.hasta) < 7) c.porVencer++;
      if (s.estado === "VENCIDA" || s.estado === "AGOTADA") c.vencidos++;
      if (c[s.estado] !== undefined && (s.estado === "CONGELADA" || s.estado === "PROGRAMADA")) c[s.estado]++;
    });
    return c;
  }, [socios, hoy]);
  const lista = useMemo(() => {
    const t = norm(q.trim());
    return socios.filter(s => (filtro === "todos" || (filtro === "activos" ? puedeIngresar(s.estado) : filtro === "porVencer" ? s.hasta && diasEntre(hoy, s.hasta) < 7
      : filtro === "vencidos" ? s.estado === "VENCIDA" || s.estado === "AGOTADA" : s.estado === filtro))
      && (!t || norm(`${s.nombre} ${s.cliente?.phone || ""} ${s.cliente?.ci || ""} ${s.actual?.planNombre || ""}`).includes(t)))
      .sort((a, b) => (filtro === "vencidos" ? (a.actual.fin < b.actual.fin ? 1 : -1) : String(a.hasta || a.actual?.fin).localeCompare(String(b.hasta || b.actual?.fin))));
  }, [socios, filtro, q, hoy]);
  const pag = useMostrarMas(lista, 50, filtro + "|" + q);
  const recordar = s => {
    const num = waNumero(s.cliente?.phone); if (!num) { toast.error("El cliente no tiene celular"); return; }
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(textoRenovacion({ ...s.actual, fin: s.hasta || s.actual.fin, customerName: s.nombre }, config.businessName || "nuestro negocio", hoy))}`, "_blank", "noopener");
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}><SearchInput value={q} onChange={setQ} placeholder="Buscar socio, celular, CI o plan…" /></div>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 6, marginBottom: 10 }}>
        {[["activos", "Activos"], ["porVencer", "Por vencer"], ["vencidos", "Vencidos"], ["CONGELADA", "Congelados"], ["PROGRAMADA", "Programados"], ["todos", "Todos"]].map(([id, t]) => (
          <button key={id} onClick={() => setFiltro(id)} style={{ ...mkBtn(filtro === id ? "primary" : "ghost"), padding: "5px 10px", fontSize: 12, flexShrink: 0 }}>{t} ({conteo[id]})</button>
        ))}
      </div>
      {lista.length === 0 ? <Empty icon="🏋️" title={socios.length ? "No hay socios en este filtro" : "Aún no hay membresías vendidas"} />
        : <div style={{ display: "grid", gap: 6 }}>
          {pag.visibles.map(s => {
            const dias = s.hasta ? diasEntre(hoy, s.hasta) : null;
            return (
              <div key={s.id} style={{ ...card({ padding: "10px 12px" }), display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", borderLeft: `4px solid ${COLOR[s.estado]}` }}>
                <button onClick={() => onDetalle(s.id)} style={{ flex: 1, minWidth: 180, textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", color: C.text }}>
                  <div style={{ fontWeight: 700 }}>{s.nombre}</div>
                  <div style={{ fontSize: 12, color: C.textMid }}>{s.actual.planNombre} · {fechaCorta(s.actual.inicio)} al {fechaCorta(s.actual.fin)}
                    {s.hasta && s.hasta !== s.actual.fin ? ` · renovado hasta ${fechaCorta(s.hasta)}` : ""}</div>
                </button>
                <span style={mkBadge(BADGE[s.estado])}>{ESTADOS_MEMBRESIA[s.estado]}{dias !== null && dias < 7 && dias >= 0 ? ` · ${dias} d` : ""}</span>
                {(dias !== null ? dias < 7 : s.estado === "VENCIDA") && s.cliente?.phone && <button onClick={() => recordar(s)} style={{ ...mkBtn("ghost"), padding: "4px 10px", fontSize: 12, color: "#25D366" }}><MessageCircle size={13} /> Recordar</button>}
                {(s.estado === "VENCIDA" || s.estado === "AGOTADA" || (dias !== null && dias < 7)) && <button onClick={() => onVender(s.id, s.actual.planId || "")} style={{ ...mkBtn("ghost"), padding: "4px 10px", fontSize: 12 }}>Renovar</button>}
              </div>
            );
          })}
          <BotonMostrarMas restantes={pag.restantes} onClick={pag.mostrarMas} paso={50} />
        </div>}
    </div>
  );
}

// ── Planes ─────────────────────────────────────────────────────────────────
function ListaPlanes({ planes, admin, A, onEditar, onVender }) {
  const [ejecutar] = useAccion();
  return (
    <div>
      {admin && <button onClick={() => onEditar({ id: null, name: "", price: "", duracionValor: 1, duracionUnidad: "MES", sesiones: "", ingresosPorDia: 1, descripcion: "" })} style={{ ...mkBtn("primary"), marginBottom: 12 }}><Plus size={14} /> Nuevo plan</button>}
      {planes.length === 0 ? <Empty icon="🏷️" title="Aún no hay planes" sub="Ejemplos: Mensual (1 mes), Trimestral (3 meses), 12 clases (2 meses, 12 sesiones), Pase diario (1 día)." />
        : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 10 }}>
          {planes.map(p => (
            <div key={p.id} style={{ ...card({ padding: 14 }) }}>
              <div style={{ fontWeight: 800, fontSize: 16 }}>{p.name}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#111E7B", margin: "4px 0" }}>{Bs(p.price)}</div>
              <div style={{ fontSize: 12, color: C.textMid }}>{duracionTxt(p.duracionValor, p.duracionUnidad)} · {p.sesiones ? `${p.sesiones} sesiones` : "ingreso libre"}{p.ingresosPorDia > 1 ? ` · ${p.ingresosPorDia} ingresos por día` : ""}</div>
              {p.descripcion && <div style={{ fontSize: 12, color: C.textFaint, marginTop: 4 }}>{p.descripcion}</div>}
              <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                <button onClick={() => onVender(p)} style={{ ...mkBtn("primary"), padding: "5px 10px", fontSize: 12 }}>Vender</button>
                {admin && <button onClick={() => onEditar({ ...p })} style={{ ...mkBtn("ghost"), padding: "5px 10px", fontSize: 12 }}>Editar</button>}
                {admin && <button onClick={() => window.confirm(`¿Quitar el plan "${p.name}"? Las membresías ya vendidas se conservan.`) && ejecutar(() => A.eliminarPlanMembresia(p.id).then(() => true), { exito: "Plan quitado" })} aria-label="Quitar plan" style={{ background: "none", border: "none", color: C.red, cursor: "pointer" }}><Trash2 size={15} /></button>}
              </div>
            </div>
          ))}
        </div>}
    </div>
  );
}

function FormPlan({ inicial, A, onClose }) {
  const [f, setF] = useState(inicial);
  const [ejecutar, ocupado] = useAccion();
  const guardar = async () => {
    if (!f.name.trim()) { toast.error("Indica el nombre"); return; }
    if (f.price === "" || n(f.price) < 0) { toast.error("Indica el precio"); return; }
    if (await ejecutar(() => A.guardarPlanMembresia(f), { exito: "Plan guardado" })) onClose();
  };
  return (
    <Modal title={f.id ? "Editar plan" : "Nuevo plan"} onClose={() => !ocupado && onClose()} width={480}>
      <label style={lbl}>Nombre *</label>
      <input style={{ ...inp, marginBottom: 10 }} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Ej: Mensual, Trimestral, 12 clases" autoFocus />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 10 }}>
        <div><label style={lbl}>Precio *</label><input type="number" min="0" style={inp} value={f.price} onChange={e => setF({ ...f, price: e.target.value })} /></div>
        <div><label style={lbl}>Duración</label><input type="number" min="1" style={inp} value={f.duracionValor} onChange={e => setF({ ...f, duracionValor: e.target.value })} /></div>
        <div><label style={lbl}>&nbsp;</label><select style={inp} value={f.duracionUnidad} onChange={e => setF({ ...f, duracionUnidad: e.target.value })}>
          {Object.entries(UNIDADES).map(([k, [uno, varios]]) => <option key={k} value={k}>{Number(f.duracionValor) === 1 ? uno : varios}</option>)}
        </select></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginTop: 10 }}>
        <div><label style={lbl}>Sesiones (vacío = libre)</label><input type="number" min="1" style={inp} value={f.sesiones || ""} onChange={e => setF({ ...f, sesiones: e.target.value })} placeholder="Ej: 12" /></div>
        <div><label style={lbl}>Ingresos por día</label><input type="number" min="1" max="20" style={inp} value={f.ingresosPorDia} onChange={e => setF({ ...f, ingresosPorDia: e.target.value })} /></div>
      </div>
      <label style={{ ...lbl, marginTop: 10 }}>Descripción</label>
      <input style={inp} value={f.descripcion} onChange={e => setF({ ...f, descripcion: e.target.value })} placeholder="Ej: Acceso a máquinas y clases grupales" />
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
        <button onClick={onClose} style={mkBtn("ghost")}>Cancelar</button>
        <button onClick={guardar} disabled={ocupado} style={mkBtn("primary")}>{ocupado ? "Guardando…" : "Guardar"}</button>
      </div>
    </Modal>
  );
}

// ── Vender / renovar ───────────────────────────────────────────────────────
function VenderMembresia({ inicial, D, A, porCliente, hoy, config, onClose }) {
  const planes = D.membresiaPlanes || [];
  const [clienteId, setClienteId] = useState(inicial.customerId || "");
  const [buscar, setBuscar] = useState("");
  const [nuevo, setNuevo] = useState(null);           // {name, phone, ci}
  const [planId, setPlanId] = useState(inicial.planId || (planes.length === 1 ? planes[0].id : ""));
  const plan = planes.find(p => p.id === planId);
  const hasta = clienteId ? cubiertoHasta(porCliente.get(clienteId), hoy) : null;
  const sugerido = hasta ? sumarDiasF(hasta, 1) : hoy;
  const [inicio, setInicio] = useState("");
  const inicioReal = inicio || sugerido;
  const [precio, setPrecio] = useState("");
  const [descuento, setDescuento] = useState("");
  const [metodo, setMetodo] = useState("efectivo");
  const [monto, setMonto] = useState("");
  const [notas, setNotas] = useState("");
  const [ejecutar, ocupado] = useAccion();
  const precioReal = precio === "" ? plan?.price || 0 : n(precio);
  const total = Math.max(0, precioReal - n(descuento));
  const pago = monto === "" ? total : Math.min(n(monto), total);
  const cliente = D.customers.find(c => c.id === clienteId);
  const encontrados = useMemo(() => {
    const t = norm(buscar.trim()); if (t.length < 2) return [];
    return D.customers.filter(c => norm(`${c.name} ${c.phone} ${c.ci}`).includes(t)).slice(0, 8);
  }, [buscar, D.customers]);

  const crearCliente = async () => {
    if (!nuevo.name.trim()) { toast.error("Indica el nombre"); return; }
    const r = await ejecutar(() => A.crearCliente({ name: nuevo.name, phone: nuevo.phone, ci: nuevo.ci }), { exito: "Cliente registrado" });
    if (r?.id) { setClienteId(r.id); setNuevo(null); setBuscar(""); }
  };
  const confirmar = async () => {
    if (!clienteId) { toast.error("Elige el cliente"); return; }
    if (!plan) { toast.error("Elige el plan"); return; }
    if (n(descuento) > precioReal) { toast.error("El descuento es mayor que el precio"); return; }
    const r = await ejecutar(() => A.venderMembresia({ customerId: clienteId, planId, inicio: inicioReal, precio: precio === "" ? null : precio, descuento, notas,
      pagos: [{ amount: pago, method: metodo }] }), { exito: "Membresía registrada" });
    if (!r) return;
    if (r.sale && window.confirm(`Venta N° ${r.sale.numero || r.venta?.numero} registrada. ¿Imprimir ticket?`)) imprimirTicket({ sale: r.sale, config, ancho: leerAnchoTicket(), simbolo: getCurrencySymbol() });
    onClose();
  };

  return (
    <Modal title={hasta ? "Renovar membresía" : "Vender membresía"} onClose={() => !ocupado && onClose()} width={620}>
      <label style={lbl}>Cliente *</label>
      {cliente ? <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: 10, background: "var(--color-bg-primary)", marginBottom: 10 }}>
        <span><strong>{cliente.name}</strong>{cliente.ci ? ` · CI ${cliente.ci}` : ""}{cliente.phone ? ` · ${cliente.phone}` : ""}{hasta ? <span style={{ color: C.textMid }}> · cubierto hasta {fechaCorta(hasta)}</span> : null}</span>
        <button onClick={() => { setClienteId(""); setInicio(""); }} style={{ ...mkBtn("ghost"), padding: "3px 8px", fontSize: 12 }}>Cambiar</button>
      </div> : nuevo ? <div style={{ padding: 10, borderRadius: 10, background: "var(--color-bg-primary)", marginBottom: 10 }}>
        <div style={row()}>
          <input style={{ ...inp, flex: 2 }} value={nuevo.name} onChange={e => setNuevo({ ...nuevo, name: e.target.value })} placeholder="Nombre completo" autoFocus />
          <input style={{ ...inp, flex: 1 }} value={nuevo.ci} onChange={e => setNuevo({ ...nuevo, ci: e.target.value })} placeholder="CI" />
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <input style={{ ...inp, flex: 1 }} value={nuevo.phone} onChange={e => setNuevo({ ...nuevo, phone: e.target.value })} placeholder="Celular" inputMode="tel" />
          <button onClick={() => setNuevo(null)} style={mkBtn("ghost")}>Volver</button>
          <button onClick={crearCliente} disabled={ocupado} style={mkBtn("primary")}>Registrar</button>
        </div>
      </div> : <div style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", gap: 6 }}>
          <input style={{ ...inp, flex: 1 }} value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar por nombre, celular o CI…" autoFocus />
          <button onClick={() => setNuevo({ name: buscar, phone: "", ci: "" })} style={mkBtn("ghost")}><UserPlus size={14} /> Nuevo</button>
        </div>
        {encontrados.length > 0 && <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, marginTop: 6, overflow: "hidden" }}>
          {encontrados.map(c => <button key={c.id} onClick={() => { setClienteId(c.id); setInicio(""); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", border: "none", borderTop: `1px solid ${C.border}`, background: "var(--color-bg-surface)", cursor: "pointer", fontFamily: "inherit", color: C.text, fontSize: 13 }}>
            {c.name}<span style={{ color: C.textFaint }}>{c.ci ? ` · CI ${c.ci}` : ""}{c.phone ? ` · ${c.phone}` : ""}</span></button>)}
        </div>}
      </div>}

      <label style={lbl}>Plan *</label>
      {planes.length === 0 ? <div style={{ fontSize: 13, color: C.red, marginBottom: 10 }}>No hay planes: créalos en la pestaña Planes.</div>
        : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 8, marginBottom: 10 }}>
          {planes.map(p => (
            <button key={p.id} onClick={() => { setPlanId(p.id); setPrecio(""); }} style={{ padding: "8px 10px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", textAlign: "left", color: C.text,
              border: `2px solid ${p.id === planId ? "#111E7B" : C.border}`, background: p.id === planId ? "rgba(17,30,123,0.06)" : "var(--color-bg-surface)" }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{p.name}</div>
              <div style={{ fontSize: 12, color: "#111E7B", fontWeight: 700 }}>{Bs(p.price)}</div>
              <div style={{ fontSize: 11, color: C.textFaint }}>{duracionTxt(p.duracionValor, p.duracionUnidad)}{p.sesiones ? ` · ${p.sesiones} ses.` : ""}</div>
            </button>
          ))}
        </div>}

      {plan && <>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10 }}>
          <div><label style={lbl}>Desde</label><input type="date" style={inp} value={inicioReal} onChange={e => setInicio(e.target.value)} /></div>
          <div><label style={lbl}>Hasta</label><div style={{ ...inp, background: "var(--color-bg-primary)" }}>{fechaCorta(finMembresia(inicioReal, plan.duracionValor, plan.duracionUnidad))}</div></div>
          <div><label style={lbl}>Precio</label><input type="number" min="0" style={inp} value={precio} onChange={e => setPrecio(e.target.value)} placeholder={String(plan.price)} /></div>
          <div><label style={lbl}>Descuento</label><input type="number" min="0" style={inp} value={descuento} onChange={e => setDescuento(e.target.value)} placeholder="0" /></div>
        </div>
        {hasta && !inicio && <div style={{ fontSize: 12, color: C.textMid, marginTop: 6 }}>Renovación: empieza al día siguiente de que vence la actual.</div>}
        {total > 0 && <div style={{ ...row(), marginTop: 10 }}>
          <div style={{ flex: 1 }}><label style={lbl}>Método</label><select style={inp} value={metodo} onChange={e => setMetodo(e.target.value)}>{METODOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></div>
          <div style={{ flex: 1 }}><label style={lbl}>Paga ahora</label><input type="number" min="0" style={inp} value={monto} onChange={e => setMonto(e.target.value)} placeholder={total.toFixed(2)} /></div>
        </div>}
        <input style={inp} value={notas} onChange={e => setNotas(e.target.value)} placeholder="Notas (opcional)" />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
          <div style={{ fontSize: 14 }}>Total: <strong style={{ fontSize: 18 }}>{Bs(total)}</strong>{pago < total - 0.005 && <span style={{ color: C.red, marginLeft: 8 }}>queda debiendo {Bs(total - pago)}</span>}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} style={mkBtn("ghost")}>Cancelar</button>
            <button onClick={confirmar} disabled={ocupado || !clienteId} style={mkBtn("primary")}>{ocupado ? "Guardando…" : "Confirmar"}</button>
          </div>
        </div>
      </>}
    </Modal>
  );
}

// ── Ficha del socio: historial, asistencias, congelar, cancelar, ajustar ──
function DetalleSocio({ clienteId, cliente, lista, hoy, A, admin, config, onClose, onVender }) {
  const [historial, setHistorial] = useState(lista);
  const [asist, setAsist] = useState([]);
  const [ajuste, setAjuste] = useState(null);
  const [ejecutar, ocupado] = useAccion();
  const actual = membresiaActual(historial, hoy);
  const est = actual ? estadoMembresia(actual, hoy) : null;
  // El historial completo (incluye membresías antiguas que no se cargan al inicio)
  useEffect(() => { A.membresiasDelCliente(clienteId).then(setHistorial).catch(() => {}); }, [A, clienteId, lista]);
  useEffect(() => { if (actual?.id) A.asistenciasDeMembresia(actual.id).then(setAsist).catch(() => {}); }, [A, actual?.id, actual?.sesionesUsadas]);
  const nombre = cliente?.name || actual?.customerName || "Socio";

  const recordar = () => {
    const num = waNumero(cliente?.phone); if (!num) { toast.error("El cliente no tiene celular"); return; }
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(textoRenovacion({ ...actual, fin: cubiertoHasta(historial, hoy) || actual.fin, customerName: nombre }, config.businessName || "nuestro negocio", hoy))}`, "_blank", "noopener");
  };
  const ingresar = async (forzar = false) => {
    try { const r = await A.registrarAsistencia(actual.id, forzar); toast.success(`Ingreso registrado · quedan ${r.diasRestantes} días`); }
    catch (e) { const m = String(e.message || e); if (m.startsWith("REPETIDO:")) { if (window.confirm(`${m.slice(9).trim()}. ¿Registrar otro ingreso?`)) ingresar(true); } else toast.error(m); }
  };

  return (
    <Modal title={nombre} onClose={onClose} width={680}>
      <div style={{ fontSize: 13, color: C.textMid, marginBottom: 10 }}>{[cliente?.ci && `CI ${cliente.ci}`, cliente?.phone].filter(Boolean).join(" · ") || "Sin datos de contacto"}</div>
      {actual ? <div style={{ ...card({ padding: 14 }), borderLeft: `5px solid ${COLOR[est]}`, marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>{actual.planNombre}</div>
            <div style={{ fontSize: 13 }}>{fechaCorta(actual.inicio)} al {fechaCorta(actual.fin)}{est !== "VENCIDA" && actual.fin >= hoy ? ` · ${diasEntre(hoy, actual.fin)} días restantes` : ""}</div>
            {actual.sesionesTotal && <div style={{ fontSize: 13 }}>Sesiones: {actual.sesionesUsadas} de {actual.sesionesTotal}</div>}
            {actual.estado === "CONGELADA" && <div style={{ fontSize: 12, color: "#0EA5E9" }}>Congelada desde el {fechaCorta(actual.congeladaDesde)}</div>}
            {actual.diasCongelados > 0 && <div style={{ fontSize: 12, color: C.textFaint }}>{actual.diasCongelados} días congelados en total</div>}
            {actual.notas && <div style={{ fontSize: 12, color: C.textFaint }}>Notas: {actual.notas}</div>}
          </div>
          <span style={mkBadge(BADGE[est])}>{ESTADOS_MEMBRESIA[est]}</span>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
          {puedeIngresar(est) && <button onClick={() => ejecutar(() => ingresar())} disabled={ocupado} style={{ ...mkBtn("primary"), background: C.green }}><Check size={14} /> Registrar ingreso</button>}
          <button onClick={() => onVender(actual.planId || "")} style={mkBtn("primary")}>Renovar</button>
          {actual.estado === "ACTIVA" && actual.fin >= hoy && <button onClick={() => window.confirm("¿Congelar la membresía? Al reactivarla se suman los días que estuvo congelada.") && ejecutar(() => A.congelarMembresia(actual.id), { exito: "Membresía congelada" })} disabled={ocupado} style={mkBtn("ghost")}><Snowflake size={14} /> Congelar</button>}
          {actual.estado === "CONGELADA" && <button onClick={async () => { const r = await ejecutar(() => A.reactivarMembresia(actual.id)); if (r) toast.success(`Reactivada: se sumaron ${r.dias} días`); }} disabled={ocupado} style={mkBtn("ghost")}>Reactivar</button>}
          {cliente?.phone && <button onClick={recordar} style={{ ...mkBtn("ghost"), color: "#25D366" }}><MessageCircle size={14} /> WhatsApp</button>}
          {admin && actual.estado !== "CANCELADA" && <button onClick={() => setAjuste({ fin: actual.fin, sesionesUsadas: actual.sesionesUsadas, notas: actual.notas })} style={mkBtn("ghost")}><Settings2 size={14} /> Ajustar</button>}
          {actual.estado !== "CANCELADA" && <button onClick={() => { const motivo = window.prompt("Motivo de la cancelación (el dinero no se devuelve automáticamente):"); if (motivo !== null) ejecutar(() => A.cancelarMembresia(actual.id, motivo), { exito: "Membresía cancelada" }); }} disabled={ocupado} style={mkBtn("danger")}>Cancelar</button>}
        </div>
        {ajuste && <div style={{ marginTop: 12, padding: 10, borderRadius: 10, background: "var(--color-bg-primary)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 8 }}>
            <div><label style={lbl}>Vence</label><input type="date" style={inp} value={ajuste.fin} onChange={e => setAjuste({ ...ajuste, fin: e.target.value })} /></div>
            {actual.sesionesTotal && <div><label style={lbl}>Sesiones usadas</label><input type="number" min="0" style={inp} value={ajuste.sesionesUsadas} onChange={e => setAjuste({ ...ajuste, sesionesUsadas: e.target.value })} /></div>}
            <div style={{ gridColumn: "span 2" }}><label style={lbl}>Notas</label><input style={inp} value={ajuste.notas} onChange={e => setAjuste({ ...ajuste, notas: e.target.value })} /></div>
          </div>
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 8 }}>
            <button onClick={() => setAjuste(null)} style={mkBtn("ghost")}>Volver</button>
            <button onClick={async () => { if (await ejecutar(() => A.ajustarMembresia(actual.id, { fin: ajuste.fin, sesiones_usadas: ajuste.sesionesUsadas, notas: ajuste.notas }), { exito: "Ajustada" })) setAjuste(null); }} disabled={ocupado} style={mkBtn("primary")}>Guardar ajuste</button>
          </div>
        </div>}
      </div> : <Empty icon="🏷️" title="Sin membresías" />}

      {historial.length > 1 && <>
        <label style={lbl}>Historial</label>
        <div style={{ display: "grid", gap: 4, marginBottom: 12 }}>
          {historial.map(m => { const e = estadoMembresia(m, hoy); return (
            <div key={m.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12, padding: "4px 0", borderBottom: `1px solid ${C.border}` }}>
              <span>{m.planNombre} · {fechaCorta(m.inicio)} al {fechaCorta(m.fin)}{m.precio ? ` · ${Bs(m.precio)}` : ""}</span>
              <span style={mkBadge(BADGE[e])}>{ESTADOS_MEMBRESIA[e]}</span>
            </div>); })}
        </div>
      </>}
      {asist.length > 0 && <>
        <label style={lbl}>Últimos ingresos ({asist.length})</label>
        <div style={{ fontSize: 12, color: C.textMid, display: "flex", flexWrap: "wrap", gap: 6 }}>
          {asist.slice(0, 30).map(a => <span key={a.id} style={{ padding: "2px 8px", borderRadius: 12, background: "var(--color-bg-primary)" }}>{fDateTime(a.fecha)}</span>)}
        </div>
      </>}
    </Modal>
  );
}
