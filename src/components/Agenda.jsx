import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { ChevronLeft, ChevronRight, MessageCircle, Plus, Settings2, Trash2, Check } from "lucide-react";
import { n, today } from "../utils/businessLogic.js";
import { Bs } from "../currency.js";
import { C } from "../theme.jsx";
import { card, inp, lbl, mkBtn, mkBadge, row } from "../styles.js";
import { useAccion } from "../hooks/useAccion.js";
import { Header } from "./ui/Header.jsx";
import { Modal } from "./ui/Modal.jsx";
import { Empty } from "./ui/Empty.jsx";
import { KPI } from "./ui/KPI.jsx";
import { SearchInput } from "./ui/SearchInput.jsx";
import { SelectorProducto } from "./ui/SelectorProducto.jsx";
import {
  ESTADOS_CITA, CITA_ABIERTA, configAgenda, aMinutos, aHora, fechaLocal, horaLocal, unirFechaHora, sumarDias, semanaDe,
  fechaLarga, diaCorto, cruces, carriles, posicion, waNumero, textoRecordatorio,
} from "../utils/agenda.js";

const BADGE = { PENDIENTE: "amber", CONFIRMADA: "blue", ATENDIDA: "green", NO_ASISTIO: "red", CANCELADA: "gray" };
const COLOR = { PENDIENTE: C.amber, CONFIRMADA: "#111E7B", ATENDIDA: C.green, NO_ASISTIO: C.red, CANCELADA: "#9CA3AF" };
const METODOS = [["efectivo", "Efectivo"], ["qr", "QR"], ["banco", "Transferencia"], ["tarjeta", "Tarjeta"]];
const DURACIONES = [15, 20, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300, 360, 480];
const SIN_ASIGNAR = "Sin asignar";
const PX = 1.4; // píxeles por minuto en la vista del día
const durTxt = m => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`);
const esAdmin = u => ["admin", "superadmin"].includes(String(u?.role || "").toLowerCase());
const LIMITE_CARGADO = () => { const d = new Date(); d.setMonth(d.getMonth() - 2); return fechaLocal(d); };

export function Agenda({ D, A, user }) {
  const citas = D.citas || [];
  const config = D.config || {};
  const cfg = useMemo(() => configAgenda(config.agenda), [config.agenda]);
  const [fecha, setFecha] = useState(today());
  const [vista, setVista] = useState(() => (typeof window !== "undefined" && window.innerWidth < 640 ? "proximas" : "dia"));
  const [prof, setProf] = useState("");
  const [form, setForm] = useState(null);
  const [detalleId, setDetalleId] = useState(null);
  const [configAbierta, setConfigAbierta] = useState(false);

  // Si navega a semanas anteriores a lo cargado al inicio, las trae del servidor
  const semanasCargadas = useRef(new Set());
  useEffect(() => {
    const lunes = semanaDe(fecha)[0];
    if (lunes >= LIMITE_CARGADO() || semanasCargadas.current.has(lunes)) return;
    semanasCargadas.current.add(lunes);
    A.cargarCitas(unirFechaHora(lunes, "00:00").toISOString(), unirFechaHora(sumarDias(lunes, 7), "00:00").toISOString())
      .catch(() => semanasCargadas.current.delete(lunes));
  }, [fecha, A]);

  // Citas agrupadas por día local (con el filtro de profesional)
  const porDia = useMemo(() => {
    const m = new Map();
    citas.forEach(c => {
      if (prof && (c.profesional || SIN_ASIGNAR) !== prof) return;
      const f = fechaLocal(c.inicio);
      if (!m.has(f)) m.set(f, []);
      m.get(f).push(c);
    });
    m.forEach(l => l.sort((a, b) => new Date(a.inicio) - new Date(b.inicio)));
    return m;
  }, [citas, prof]);

  const hoy = today();
  const kpi = useMemo(() => {
    const deHoy = citas.filter(c => fechaLocal(c.inicio) === hoy);
    const mes = hoy.slice(0, 7);
    const atendidasHoy = deHoy.filter(c => c.estado === "ATENDIDA");
    return {
      hoy: deHoy.filter(c => c.estado !== "CANCELADA").length,
      porConfirmar: citas.filter(c => c.estado === "PENDIENTE" && new Date(c.fin) >= new Date()).length,
      atendidas: atendidasHoy.length, ingresos: atendidasHoy.reduce((a, c) => a + c.total, 0),
      faltas: citas.filter(c => c.estado === "NO_ASISTIO" && fechaLocal(c.inicio).slice(0, 7) === mes).length,
    };
  }, [citas, hoy]);

  const profesionales = useMemo(() => {
    const s = new Set(cfg.profesionales);
    citas.forEach(c => c.profesional && s.add(c.profesional));
    return [...s];
  }, [cfg.profesionales, citas]);

  const detalle = citas.find(c => c.id === detalleId) || null;
  const nueva = (f = fecha, hora = null, profesional = "") => {
    const ahora = new Date();
    const h = hora || (f === hoy ? aHora(Math.ceil((ahora.getHours() * 60 + ahora.getMinutes()) / cfg.intervalo) * cfg.intervalo) : cfg.inicio);
    setForm({ id: null, customerId: "", customerName: "", phone: "", fecha: f, hora: h, duracion: 30, profesional: profesional === SIN_ASIGNAR ? "" : profesional,
      items: [], servicio: "", notas: "", anticipo: "", anticipoMetodo: "efectivo", confirmada: false });
  };
  const mover = d => setFecha(f => sumarDias(f, vista === "semana" ? 7 * d : d));

  return (
    <div>
      <Header title="Agenda" sub="Citas, reservas y turnos de tus clientes"
        action={<div style={{ display: "flex", gap: 8 }}>
          {esAdmin(user) && <button onClick={() => setConfigAbierta(true)} style={mkBtn("ghost")} title="Horario y profesionales"><Settings2 size={14} /> Horario</button>}
          <button onClick={() => nueva()} style={mkBtn("primary")}>+ Nueva cita</button>
        </div>} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 14 }}>
        <KPI label="Citas hoy" value={kpi.hoy} Icon="📅" color={C.blue} />
        <KPI label="Por confirmar" value={kpi.porConfirmar} Icon="⏳" color={kpi.porConfirmar ? C.amber : C.green} />
        <KPI label="Atendidas hoy" value={kpi.atendidas} sub={Bs(kpi.ingresos)} Icon="✅" color={C.green} />
        <KPI label="No asistieron (mes)" value={kpi.faltas} Icon="🚫" color={kpi.faltas ? C.red : C.green} />
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ display: "flex", border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
          {[["dia", "Día"], ["semana", "Semana"], ["proximas", "Próximas"]].map(([id, t]) => (
            <button key={id} onClick={() => setVista(id)} style={{ ...mkBtn(vista === id ? "primary" : "ghost"), border: "none", borderRadius: 0, padding: "6px 12px", fontSize: 12 }}>{t}</button>
          ))}
        </div>
        {vista !== "proximas" && <>
          <button onClick={() => mover(-1)} aria-label="Anterior" style={{ ...mkBtn("ghost"), padding: "6px 8px" }}><ChevronLeft size={15} /></button>
          <button onClick={() => setFecha(hoy)} style={{ ...mkBtn("ghost"), padding: "6px 10px", fontSize: 12 }}>Hoy</button>
          <button onClick={() => mover(1)} aria-label="Siguiente" style={{ ...mkBtn("ghost"), padding: "6px 8px" }}><ChevronRight size={15} /></button>
          <input type="date" value={fecha} onChange={e => e.target.value && setFecha(e.target.value)} style={{ ...inp, width: "auto", padding: "5px 8px" }} aria-label="Ir a fecha" />
          <strong style={{ fontSize: 14, textTransform: "capitalize" }}>
            {vista === "dia" ? fechaLarga(fecha) : (() => { const s = semanaDe(fecha); return `${diaCorto(s[0])} – ${fechaLarga(s[6])}`; })()}
          </strong>
        </>}
        {profesionales.length > 0 && <select value={prof} onChange={e => setProf(e.target.value)} style={{ ...inp, width: "auto", marginLeft: "auto" }} aria-label="Profesional">
          <option value="">Todos los profesionales</option>
          {profesionales.map(p => <option key={p} value={p}>{p}</option>)}
          <option value={SIN_ASIGNAR}>{SIN_ASIGNAR}</option>
        </select>}
      </div>

      {vista === "dia" && <VistaDia fecha={fecha} citas={porDia.get(fecha) || []} cfg={cfg} prof={prof} profesionales={cfg.profesionales} onNueva={nueva} onAbrir={setDetalleId} />}
      {vista === "semana" && <VistaSemana fecha={fecha} porDia={porDia} onDia={f => { setFecha(f); setVista("dia"); }} onNueva={f => nueva(f)} onAbrir={setDetalleId} />}
      {vista === "proximas" && <VistaProximas citas={citas} prof={prof} onAbrir={setDetalleId} A={A} config={config} />}

      {form && <FormCita inicial={form} citas={citas} customers={D.customers} productos={D.vendibles || D.products} cfg={cfg} profesionales={profesionales} A={A}
        onClose={() => setForm(null)} onGuardada={c => { setForm(null); setFecha(fechaLocal(c.inicio)); setDetalleId(c.id); }} />}
      {detalle && !form && <DetalleCita key={detalle.id} cita={detalle} customers={D.customers} A={A} config={config}
        onClose={() => setDetalleId(null)}
        onEditar={() => setForm(aForm(detalle))}
        onRepetir={() => setForm({ ...aForm(detalle), id: null, fecha: sumarDias(fechaLocal(detalle.inicio), 7), anticipo: "", confirmada: false })} />}
      {configAbierta && <ConfigAgenda cfg={cfg} A={A} onClose={() => setConfigAbierta(false)} />}
    </div>
  );
}

const aForm = c => ({
  id: c.id, customerId: c.customerId || "", customerName: c.customerName, phone: c.phone, fecha: fechaLocal(c.inicio), hora: horaLocal(c.inicio),
  duracion: Math.max(5, Math.round((new Date(c.fin) - new Date(c.inicio)) / 60000)), profesional: c.profesional, items: c.items,
  servicio: c.servicio, notas: c.notas, anticipo: c.anticipo || "", anticipoMetodo: c.anticipoMetodo || "efectivo", confirmada: c.estado === "CONFIRMADA",
});

// ── Vista del día: una columna por profesional, bloques posicionados por hora ──
function VistaDia({ fecha, citas, cfg, prof, profesionales, onNueva, onAbrir }) {
  const abre = aMinutos(cfg.inicio), cierra = aMinutos(cfg.fin);
  const alto = (cierra - abre) * PX;
  const columnas = useMemo(() => {
    if (prof) return [prof];
    const s = [...profesionales];
    citas.forEach(c => c.profesional && !s.includes(c.profesional) && s.push(c.profesional));
    if (!s.length || citas.some(c => !c.profesional)) s.push(SIN_ASIGNAR);
    return s;
  }, [prof, profesionales, citas]);
  const visibles = citas.filter(c => c.estado !== "CANCELADA");
  const fuera = visibles.filter(c => { const p = posicion(c, cfg); return p.minutos === 0; }).length;
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setAhora(new Date()), 60000); return () => clearInterval(t); }, []);
  const minAhora = ahora.getHours() * 60 + ahora.getMinutes();
  const marcas = [];
  for (let m = Math.ceil(abre / 60) * 60; m < cierra; m += 60) marcas.push(m);
  const slots = [];
  for (let m = abre; m < cierra; m += cfg.intervalo) slots.push(m);
  const canceladas = citas.length - visibles.length;

  return (
    <div style={{ ...card({ padding: 0 }), overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <div style={{ display: "flex", minWidth: 52 + columnas.length * 150 }}>
          <div style={{ width: 52, flexShrink: 0, borderRight: `1px solid ${C.border}` }}>
            <div style={{ height: 34, borderBottom: `1px solid ${C.border}` }} />
            <div style={{ position: "relative", height: alto }}>
              {marcas.map(m => <div key={m} style={{ position: "absolute", top: (m - abre) * PX - 7, right: 6, fontSize: 11, color: C.textFaint }}>{aHora(m)}</div>)}
            </div>
          </div>
          {columnas.map(col => {
            const deCol = visibles.filter(c => (c.profesional || SIN_ASIGNAR) === col);
            return (
              <div key={col} style={{ flex: 1, minWidth: 150, borderRight: `1px solid ${C.border}` }}>
                <div style={{ height: 34, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, borderBottom: `1px solid ${C.border}`, color: col === SIN_ASIGNAR ? C.textFaint : C.text }}>
                  {col}{deCol.length ? <span style={{ color: C.textFaint, fontWeight: 500, marginLeft: 4 }}>({deCol.length})</span> : null}
                </div>
                <div style={{ position: "relative", height: alto }}>
                  {slots.map(m => (
                    <button key={m} onClick={() => onNueva(fecha, aHora(m), col)} aria-label={`Nueva cita ${aHora(m)} ${col}`} title={`Agendar a las ${aHora(m)}`}
                      style={{ position: "absolute", left: 0, right: 0, top: (m - abre) * PX, height: cfg.intervalo * PX, background: "transparent", border: "none",
                        borderTop: `1px ${m % 60 === 0 ? "solid" : "dashed"} ${C.border}`, cursor: "pointer", padding: 0 }}
                      onMouseEnter={e => { e.currentTarget.style.background = "rgba(34,197,254,0.07)"; }} onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }} />
                  ))}
                  {fecha === today() && minAhora >= abre && minAhora <= cierra && <div style={{ position: "absolute", left: 0, right: 0, top: (minAhora - abre) * PX, borderTop: `2px solid ${C.red}`, zIndex: 2, pointerEvents: "none" }} />}
                  {carriles(deCol).map(({ cita: c, carril, carriles: total }) => {
                    const p = posicion(c, cfg);
                    const h = Math.max(p.minutos * PX, 24);
                    return (
                      <button key={c.id} onClick={() => onAbrir(c.id)} title={`${horaLocal(c.inicio)}–${horaLocal(c.fin)} · ${c.customerName}${c.servicio ? ` · ${c.servicio}` : ""}`}
                        style={{ position: "absolute", zIndex: 3, top: Math.min(p.desde * PX, alto - h), height: h, left: `calc(${(carril / total) * 100}% + 3px)`, width: `calc(${100 / total}% - 6px)`,
                          background: `color-mix(in srgb, ${COLOR[c.estado]} 14%, var(--color-bg-surface))`, border: "none", borderLeft: `3px solid ${COLOR[c.estado]}`,
                          borderRadius: 6, padding: "2px 6px", textAlign: "left", cursor: "pointer", overflow: "hidden", fontFamily: "inherit", color: C.text,
                          opacity: c.estado === "NO_ASISTIO" ? 0.6 : 1, boxShadow: "0 1px 2px rgba(0,0,0,0.08)" }}>
                        <div style={{ fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {horaLocal(c.inicio)} {c.customerName}{c.estado === "ATENDIDA" ? " ✓" : ""}
                        </div>
                        {h > 34 && <div style={{ fontSize: 11, color: C.textMid, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.servicio || ESTADOS_CITA[c.estado]}</div>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {(fuera > 0 || canceladas > 0) && <div style={{ fontSize: 12, color: C.textFaint, padding: "8px 12px", borderTop: `1px solid ${C.border}` }}>
        {fuera > 0 && `${fuera} cita${fuera === 1 ? "" : "s"} fuera del horario de atención (se muestran en el borde). `}
        {canceladas > 0 && `${canceladas} cancelada${canceladas === 1 ? "" : "s"} oculta${canceladas === 1 ? "" : "s"}.`}
      </div>}
    </div>
  );
}

// ── Vista semanal: tarjetas por día ──
function VistaSemana({ fecha, porDia, onDia, onNueva, onAbrir }) {
  const dias = semanaDe(fecha);
  const hoy = today();
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8 }}>
      {dias.map(d => {
        const lista = (porDia.get(d) || []).filter(c => c.estado !== "CANCELADA");
        return (
          <div key={d} style={{ ...card({ padding: 10 }), borderColor: d === hoy ? "#22C5FE" : undefined, minHeight: 120 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <button onClick={() => onDia(d)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 13, color: d === hoy ? "#111E7B" : C.text, textTransform: "capitalize" }}>{diaCorto(d)}</button>
              <button onClick={() => onNueva(d)} aria-label={`Nueva cita ${d}`} style={{ background: "none", border: "none", cursor: "pointer", color: C.textMid, padding: 2 }}><Plus size={14} /></button>
            </div>
            {lista.length === 0 && <div style={{ fontSize: 11, color: C.textFaint }}>Sin citas</div>}
            <div style={{ display: "grid", gap: 4 }}>
              {lista.map(c => (
                <button key={c.id} onClick={() => onAbrir(c.id)} style={{ textAlign: "left", border: "none", borderLeft: `3px solid ${COLOR[c.estado]}`, borderRadius: 6, padding: "4px 6px", cursor: "pointer", fontFamily: "inherit", color: C.text, background: `color-mix(in srgb, ${COLOR[c.estado]} 10%, var(--color-bg-surface))` }}>
                  <div style={{ fontSize: 11, fontWeight: 700 }}>{horaLocal(c.inicio)} · {c.customerName}</div>
                  <div style={{ fontSize: 10, color: C.textMid, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{[c.servicio, c.profesional].filter(Boolean).join(" · ") || ESTADOS_CITA[c.estado]}</div>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Próximas: lista para confirmar y recordar ──
function VistaProximas({ citas, prof, onAbrir, A, config }) {
  const [filtro, setFiltro] = useState("todas");
  const [q, setQ] = useState("");
  const [enviando, setEnviando] = useState(null);
  const ahora = new Date();
  const lista = useMemo(() => {
    const t = q.trim().toLowerCase();
    return citas.filter(c => CITA_ABIERTA(c.estado) && new Date(c.fin) >= ahora
      && (!prof || (c.profesional || SIN_ASIGNAR) === prof)
      && (filtro === "todas" || (filtro === "sinRecordar" ? !c.recordada : c.estado === "PENDIENTE"))
      && (!t || `${c.customerName} ${c.phone} ${c.servicio} ${c.profesional}`.toLowerCase().includes(t)))
      .sort((a, b) => new Date(a.inicio) - new Date(b.inicio)).slice(0, 300);
  }, [citas, prof, filtro, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const grupos = useMemo(() => { const m = new Map(); lista.forEach(c => { const f = fechaLocal(c.inicio); if (!m.has(f)) m.set(f, []); m.get(f).push(c); }); return [...m]; }, [lista]);
  const hoy = today();

  const recordar = async c => {
    const num = waNumero(c.phone); if (!num) { toast.error("La cita no tiene teléfono"); return; }
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(textoRecordatorio(c, config.businessName || "nuestro negocio"))}`, "_blank", "noopener");
    setEnviando(c.id);
    try { await A.citaRecordada(c.id); } catch { /* el mensaje ya se abrió */ } finally { setEnviando(null); }
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <SearchInput value={q} onChange={setQ} placeholder="Buscar cliente, teléfono o servicio…" />
        {[["todas", "Todas"], ["PENDIENTE", "Por confirmar"], ["sinRecordar", "Sin recordatorio"]].map(([id, t]) => (
          <button key={id} onClick={() => setFiltro(id)} style={{ ...mkBtn(filtro === id ? "primary" : "ghost"), padding: "5px 10px", fontSize: 12 }}>{t}</button>
        ))}
      </div>
      {grupos.length === 0 ? <Empty icon="📅" title="No hay citas próximas" sub="Agenda una con “Nueva cita”." /> : grupos.map(([f, cs]) => (
        <div key={f} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.textMid, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
            {f === hoy ? "Hoy · " : f === sumarDias(hoy, 1) ? "Mañana · " : ""}{fechaLarga(f)}
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            {cs.map(c => (
              <div key={c.id} style={{ ...card({ padding: "10px 12px" }), display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <button onClick={() => onAbrir(c.id)} style={{ flex: 1, minWidth: 180, textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", color: C.text }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{horaLocal(c.inicio)} · {c.customerName}</div>
                  <div style={{ fontSize: 12, color: C.textMid }}>{[c.servicio, c.profesional, c.phone].filter(Boolean).join(" · ") || "—"}</div>
                </button>
                <span style={mkBadge(BADGE[c.estado])}>{ESTADOS_CITA[c.estado]}</span>
                {c.phone && <button onClick={() => recordar(c)} disabled={enviando === c.id} style={{ ...mkBtn("ghost"), padding: "5px 10px", fontSize: 12, color: c.recordada ? C.textFaint : "#25D366" }}>
                  <MessageCircle size={13} /> {c.recordada ? "Recordada" : "Recordar"}
                </button>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Formulario de cita (nueva, editar o repetir) ──
function FormCita({ inicial, citas, customers, productos, cfg, profesionales, A, onClose, onGuardada }) {
  const [f, setF] = useState(inicial);
  const [agregando, setAgregando] = useState(false);
  const [productoId, setProductoId] = useState("");
  const [libre, setLibre] = useState({ name: "", price: "" });
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState("");
  const [cruceServidor, setCruceServidor] = useState("");
  const set = (k, v) => { setF(x => ({ ...x, [k]: v })); setCruceServidor(""); };
  const editando = !!f.id;

  const inicio = f.fecha && /^\d{2}:\d{2}$/.test(f.hora || "") ? unirFechaHora(f.fecha, f.hora) : null;
  const fin = inicio ? new Date(inicio.getTime() + n(f.duracion) * 60000) : null;
  const choques = inicio && f.profesional.trim() ? cruces(citas, { id: f.id, profesional: f.profesional, inicio, fin }) : [];
  const total = f.items.reduce((a, i) => a + n(i.qty) * n(i.price), 0);
  const fueraHorario = inicio && (aMinutos(f.hora) < aMinutos(cfg.inicio) || aMinutos(horaLocal(fin)) > aMinutos(cfg.fin) || fechaLocal(fin) !== f.fecha);

  const agregarProducto = () => {
    const p = productos.find(x => x.id === productoId); if (!p) return;
    setF(x => ({ ...x, items: [...x.items, { productId: p.id, name: p.name, qty: 1, price: p.price }] })); setProductoId(""); setAgregando(false);
  };
  const agregarLibre = () => {
    if (!libre.name.trim()) { toast.error("Escribe el servicio"); return; }
    setF(x => ({ ...x, items: [...x.items, { productId: null, name: libre.name.trim(), qty: 1, price: n(libre.price) }] })); setLibre({ name: "", price: "" });
  };

  const guardar = async (forzar = false) => {
    setErr("");
    if (!f.customerId && !f.customerName.trim()) { setErr("Indica el cliente"); return; }
    if (!inicio) { setErr("Indica la fecha y la hora"); return; }
    if (!(n(f.duracion) > 0)) { setErr("Indica la duración"); return; }
    if (!editando && n(f.anticipo) > 0 && total > 0 && n(f.anticipo) > total) { setErr("El anticipo no puede ser mayor que el total de los servicios"); return; }
    setGuardando(true);
    try {
      const cli = f.customerId ? customers.find(c => c.id === f.customerId) : null;
      const r = await A.guardarCita({
        id: f.id, customerId: f.customerId || null, customerName: cli ? cli.name : f.customerName.trim(), phone: f.phone,
        inicio: inicio.toISOString(), fin: fin.toISOString(), profesional: f.profesional.trim(), servicio: f.servicio,
        items: f.items, notas: f.notas, estado: f.confirmada ? "CONFIRMADA" : "PENDIENTE",
        anticipo: editando ? 0 : n(f.anticipo), anticipoMetodo: f.anticipoMetodo,
      }, forzar);
      toast.success(editando ? "Cita actualizada" : "Cita agendada");
      onGuardada(r);
    } catch (e) {
      const m = String(e.message || e);
      if (m.startsWith("CRUCE:")) setCruceServidor(m.slice(6).trim()); else setErr(m);
    } finally { setGuardando(false); }
  };

  return (
    <Modal title={editando ? "Editar cita" : "Nueva cita"} onClose={() => !guardando && onClose()} width={680}>
      <label style={lbl}>Cliente *</label>
      <select style={{ ...inp, marginBottom: 8 }} value={f.customerId} onChange={e => { const c = customers.find(x => x.id === e.target.value); setF(x => ({ ...x, customerId: e.target.value, phone: c?.phone || x.phone })); }}>
        <option value="">Cliente nuevo / ocasional</option>
        {customers.map(c => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</option>)}
      </select>
      <div style={row()}>
        {!f.customerId && <input style={{ ...inp, flex: 2 }} value={f.customerName} onChange={e => set("customerName", e.target.value)} placeholder="Nombre del cliente" />}
        <input style={{ ...inp, flex: 1 }} value={f.phone} onChange={e => set("phone", e.target.value)} placeholder="Celular (para recordarle)" inputMode="tel" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10 }}>
        <div><label style={lbl}>Fecha *</label><input type="date" style={inp} value={f.fecha} onChange={e => set("fecha", e.target.value)} /></div>
        <div><label style={lbl}>Hora *</label><input type="time" style={inp} value={f.hora} step={cfg.intervalo * 60} onChange={e => set("hora", e.target.value)} /></div>
        <div><label style={lbl}>Duración</label>
          <select style={inp} value={f.duracion} onChange={e => set("duracion", Number(e.target.value))}>
            {[...new Set([...DURACIONES, Number(f.duracion)])].sort((a, b) => a - b).map(d => <option key={d} value={d}>{durTxt(d)}</option>)}
          </select>
        </div>
        <div><label style={lbl}>Profesional</label>
          <input style={inp} value={f.profesional} onChange={e => set("profesional", e.target.value)} list="agenda-profesionales" placeholder="Opcional" />
          <datalist id="agenda-profesionales">{profesionales.map(p => <option key={p} value={p} />)}</datalist>
        </div>
      </div>
      {inicio && <div style={{ fontSize: 12, color: C.textMid, marginTop: 6 }}>{fechaLarga(f.fecha)}, de {f.hora} a {horaLocal(fin)}{fueraHorario ? <span style={{ color: C.amber }}> · fuera del horario de atención ({cfg.inicio}–{cfg.fin})</span> : null}</div>}
      {(choques.length > 0 || cruceServidor) && <div style={{ marginTop: 8, padding: 10, borderRadius: 10, background: "rgba(245,158,11,0.10)", fontSize: 12, color: C.text }}>
        ⚠️ {cruceServidor || `${f.profesional} ya tiene ${choques.map(c => `${horaLocal(c.inicio)}–${horaLocal(c.fin)} con ${c.customerName}`).join(", ")}.`}
        {cruceServidor && <div style={{ marginTop: 6 }}><button onClick={() => guardar(true)} disabled={guardando} style={{ ...mkBtn("ghost"), padding: "4px 10px", fontSize: 12 }}>Agendar igual (sobrecupo)</button></div>}
      </div>}

      <label style={{ ...lbl, marginTop: 12 }}>Servicios</label>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 8 }}>
        {f.items.length === 0 && <div style={{ padding: 10, fontSize: 12, color: C.textFaint }}>Opcional: agrega los servicios para cobrarlos al atender.</div>}
        {f.items.map((i, k) => (
          <div key={k} style={{ display: "flex", gap: 6, alignItems: "center", padding: "6px 8px", borderTop: k ? `1px solid ${C.border}` : "none", fontSize: 13 }}>
            <span style={{ flex: 1, minWidth: 0 }}>{i.productId ? "📦 " : "✂️ "}{i.name}</span>
            <input type="number" min="0" step="any" value={i.qty} onChange={e => setF(x => ({ ...x, items: x.items.map((y, j) => (j === k ? { ...y, qty: e.target.value } : y)) }))} style={{ ...inp, width: 56, padding: "4px 6px" }} aria-label="Cantidad" />
            <input type="number" min="0" step="0.01" value={i.price} onChange={e => setF(x => ({ ...x, items: x.items.map((y, j) => (j === k ? { ...y, price: e.target.value } : y)) }))} style={{ ...inp, width: 84, padding: "4px 6px" }} aria-label="Precio" />
            <button onClick={() => setF(x => ({ ...x, items: x.items.filter((_, j) => j !== k) }))} aria-label="Quitar" style={{ background: "none", border: "none", color: C.red, cursor: "pointer" }}><Trash2 size={14} /></button>
          </div>
        ))}
        {f.items.length > 0 && <div style={{ padding: "6px 8px", borderTop: `1px solid ${C.border}`, textAlign: "right", fontSize: 13 }}>Total: <strong>{Bs(total)}</strong></div>}
      </div>
      {agregando ? <div style={{ padding: 10, borderRadius: 10, background: "var(--color-bg-primary)", marginBottom: 8 }}>
        <SelectorProducto products={productos} value={productoId} onChange={setProductoId} autoFocus />
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 8 }}>
          <button onClick={() => setAgregando(false)} style={mkBtn("ghost")}>Cancelar</button>
          <button onClick={agregarProducto} disabled={!productoId} style={mkBtn("primary")}>Agregar</button>
        </div>
      </div> : <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        <input style={{ ...inp, flex: "2 1 150px" }} value={libre.name} onChange={e => setLibre({ ...libre, name: e.target.value })} placeholder="Servicio (ej: Corte de cabello)" />
        <input type="number" min="0" style={{ ...inp, flex: "1 1 80px" }} value={libre.price} onChange={e => setLibre({ ...libre, price: e.target.value })} placeholder="Precio" onKeyDown={e => e.key === "Enter" && agregarLibre()} />
        <button onClick={agregarLibre} style={mkBtn("ghost")}><Plus size={13} /> Agregar</button>
        <button onClick={() => setAgregando(true)} style={mkBtn("ghost")}>📦 Del catálogo</button>
      </div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10 }}>
        {!editando && <div><label style={lbl}>Anticipo / reserva</label><input type="number" min="0" style={inp} value={f.anticipo} onChange={e => set("anticipo", e.target.value)} placeholder="0" /></div>}
        {!editando && n(f.anticipo) > 0 && <div><label style={lbl}>Pagó con</label><select style={inp} value={f.anticipoMetodo} onChange={e => set("anticipoMetodo", e.target.value)}>{METODOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></div>}
        {editando && f.anticipo > 0 && <div style={{ fontSize: 12, color: C.textMid, alignSelf: "end" }}>Anticipo pagado: <strong>{Bs(f.anticipo)}</strong></div>}
      </div>
      <label style={{ ...lbl, marginTop: 10 }}>Notas</label>
      <input style={inp} value={f.notas} onChange={e => set("notas", e.target.value)} placeholder="Preferencias, alergias, indicaciones…" />
      {!editando && <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, marginTop: 10, cursor: "pointer" }}>
        <input type="checkbox" checked={f.confirmada} onChange={e => set("confirmada", e.target.checked)} /> El cliente ya confirmó
      </label>}
      {!editando && n(f.anticipo) > 0 && <div style={{ fontSize: 12, color: C.textMid, marginTop: 8 }}>El anticipo entra hoy a la caja y se descontará al cobrar la cita.</div>}
      {err && <div style={{ color: C.red, fontSize: 13, marginTop: 10 }}>{err}</div>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
        <button onClick={onClose} disabled={guardando} style={mkBtn("ghost")}>Cancelar</button>
        <button onClick={() => guardar(false)} disabled={guardando} style={mkBtn("primary")}>{guardando ? "Guardando…" : editando ? "Guardar cambios" : "Agendar cita"}</button>
      </div>
    </Modal>
  );
}

// ── Detalle de la cita: confirmar, recordar, atender y cobrar, cancelar ──
function DetalleCita({ cita: c, customers, A, config, onClose, onEditar, onRepetir }) {
  const [ejecutar, guardando] = useAccion();
  const [cobro, setCobro] = useState(null);     // { method, amount }
  const [cancelar, setCancelar] = useState(null); // { motivo, devolver }
  const [err, setErr] = useState("");
  const abierta = CITA_ABIERTA(c.estado);
  const saldo = Math.max(0, c.total - c.anticipo);
  const registrado = !!c.customerId && customers.some(x => x.id === c.customerId);
  const dur = Math.round((new Date(c.fin) - new Date(c.inicio)) / 60000);

  const recordar = async () => {
    const num = waNumero(c.phone); if (!num) { toast.error("La cita no tiene teléfono"); return; }
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(textoRecordatorio(c, config.businessName || "nuestro negocio"))}`, "_blank", "noopener");
    if (abierta) await ejecutar(() => A.citaRecordada(c.id));
  };
  const atender = async () => {
    setErr("");
    const pagos = n(cobro.amount) > 0 ? [{ amount: Math.min(n(cobro.amount), saldo), method: cobro.method }] : [];
    if (saldo - (pagos[0]?.amount || 0) > 0.005 && !registrado) { setErr("Queda saldo pendiente: registra al cliente en Clientes o cobra el total."); return; }
    const r = await ejecutar(() => A.atenderCita(c.id, pagos), { exito: "Cita atendida" });
    if (r) { setCobro(null); if (r.venta) toast.success(`Venta N° ${r.venta.numero} registrada`); }
  };
  const confirmarCancelar = async () => {
    const r = await ejecutar(() => A.cancelarCita(c.id, cancelar.motivo, cancelar.devolver), { exito: "Cita cancelada" });
    if (r) setCancelar(null);
  };

  return (
    <Modal title={`Cita · ${c.customerName}`} onClose={onClose} width={620}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ fontSize: 13, lineHeight: 1.6 }}>
          <div style={{ fontSize: 15, fontWeight: 700, textTransform: "capitalize" }}>{fechaLarga(fechaLocal(c.inicio))}</div>
          <div>{horaLocal(c.inicio)} – {horaLocal(c.fin)} <span style={{ color: C.textFaint }}>({durTxt(dur)})</span>{c.profesional ? <> · con <strong>{c.profesional}</strong></> : null}</div>
          <div style={{ color: C.textMid }}>{c.phone || "Sin teléfono"}{c.recordada ? " · recordatorio enviado ✓" : ""}</div>
          {c.usuario && <div style={{ color: C.textFaint, fontSize: 12 }}>Agendada por {c.usuario}</div>}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "flex-start", flexWrap: "wrap" }}>
          <span style={mkBadge(BADGE[c.estado])}>{ESTADOS_CITA[c.estado]}</span>
          {c.phone && <button onClick={recordar} style={{ ...mkBtn("ghost"), padding: "5px 10px", fontSize: 12, color: "#25D366" }}><MessageCircle size={13} /> WhatsApp</button>}
        </div>
      </div>

      <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 10 }}>
        {c.items.length === 0 && <div style={{ padding: 10, fontSize: 12, color: C.textFaint }}>{c.servicio || "Sin servicios cargados."}{abierta ? " Agrégalos con “Editar” para cobrarlos." : ""}</div>}
        {c.items.map((i, k) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", borderTop: k ? `1px solid ${C.border}` : "none", fontSize: 13 }}>
            <span>{i.qty !== 1 ? `${i.qty} × ` : ""}{i.name}</span><strong>{Bs(i.qty * i.price)}</strong>
          </div>
        ))}
        {(c.total > 0 || c.anticipo > 0) && <div style={{ display: "flex", justifyContent: "flex-end", gap: 14, padding: "6px 10px", borderTop: `1px solid ${C.border}`, fontSize: 13, flexWrap: "wrap" }}>
          <span>Total: <strong>{Bs(c.total)}</strong></span>
          {c.anticipo > 0 && <span>Anticipo: <strong style={{ color: C.green }}>{Bs(c.anticipo)}</strong></span>}
          {abierta && <span>Saldo: <strong style={{ color: saldo > 0 ? C.red : C.green }}>{Bs(saldo)}</strong></span>}
        </div>}
      </div>
      {c.notas && <div style={{ fontSize: 12, color: C.textMid, marginBottom: 10 }}>Notas: {c.notas}</div>}
      {c.estado === "CANCELADA" && c.motivo && <div style={{ fontSize: 12, color: C.red, marginBottom: 10 }}>Motivo: {c.motivo}</div>}
      {c.estado === "ATENDIDA" && <div style={{ fontSize: 12, color: C.green, marginBottom: 10 }}>{c.ventaId ? "Cobrada: la venta está en el módulo Ventas." : "Atendida sin cobro."}</div>}

      {err && <div style={{ color: C.red, fontSize: 13, marginBottom: 10 }}>{err}</div>}

      {!cobro && !cancelar && <div style={{ display: "flex", gap: 8, justifyContent: "space-between", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(abierta || c.estado === "NO_ASISTIO") && <button onClick={() => { setErr(""); setCancelar({ motivo: "", devolver: false }); }} style={mkBtn("danger")}>Cancelar cita</button>}
          {abierta && <button onClick={() => ejecutar(() => A.estadoCita(c.id, "NO_ASISTIO"), { exito: "Marcada como no asistió" })} disabled={guardando} style={mkBtn("ghost")}>No asistió</button>}
          {!abierta && <button onClick={onRepetir} style={mkBtn("ghost")}>Agendar otra</button>}
        </div>
        {abierta && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={onEditar} style={mkBtn("ghost")}>Editar / reprogramar</button>
          {c.estado === "PENDIENTE" && <button onClick={() => ejecutar(() => A.estadoCita(c.id, "CONFIRMADA"), { exito: "Cita confirmada" })} disabled={guardando} style={mkBtn("ghost")}><Check size={13} /> Confirmar</button>}
          <button onClick={() => { setErr(""); setCobro({ method: "efectivo", amount: saldo.toFixed(2) }); }} style={mkBtn("primary")}>✓ Atender y cobrar</button>
        </div>}
      </div>}

      {cobro && <div style={{ padding: 12, borderRadius: 10, border: `1px solid ${C.border}` }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Atender y cobrar · saldo {Bs(saldo)}</div>
        {c.total === 0 && <div style={{ fontSize: 12, color: C.textMid, marginBottom: 8 }}>La cita no tiene servicios con precio: se marcará como atendida sin registrar venta.</div>}
        {saldo > 0 && <div style={row()}>
          <div style={{ flex: 1 }}><label style={lbl}>Cobra ahora</label><input type="number" min="0" style={inp} value={cobro.amount} onChange={e => setCobro({ ...cobro, amount: e.target.value })} /></div>
          <div style={{ flex: 1 }}><label style={lbl}>Método</label><select style={inp} value={cobro.method} onChange={e => setCobro({ ...cobro, method: e.target.value })}>{METODOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></div>
        </div>}
        {c.total > 0 && <div style={{ fontSize: 12, color: C.textFaint, marginBottom: 8 }}>Se registra una venta por {Bs(c.total)}{c.anticipo > 0 ? ` (el anticipo de ${Bs(c.anticipo)} ya está en caja)` : ""}; los productos del catálogo descuentan stock.</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={() => setCobro(null)} style={mkBtn("ghost")}>Volver</button>
          <button onClick={atender} disabled={guardando} style={mkBtn("primary")}>{guardando ? "Guardando…" : "Confirmar"}</button>
        </div>
      </div>}

      {cancelar && <div style={{ padding: 12, borderRadius: 10, border: "1px solid rgba(239,68,68,0.4)" }}>
        <label style={lbl}>Motivo (opcional)</label>
        <input style={inp} value={cancelar.motivo} onChange={e => setCancelar({ ...cancelar, motivo: e.target.value })} placeholder="Ej: el cliente avisó que no puede" />
        {c.anticipo > 0 && <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, marginTop: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={cancelar.devolver} onChange={e => setCancelar({ ...cancelar, devolver: e.target.checked })} /> Devolver el anticipo de {Bs(c.anticipo)} (sale de caja)
        </label>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
          <button onClick={() => setCancelar(null)} style={mkBtn("ghost")}>Volver</button>
          <button onClick={confirmarCancelar} disabled={guardando} style={mkBtn("danger")}>Cancelar cita</button>
        </div>
      </div>}
    </Modal>
  );
}

// ── Horario de atención y profesionales (solo administrador) ──
function ConfigAgenda({ cfg, A, onClose }) {
  const [f, setF] = useState({ ...cfg, profesionalesTxt: cfg.profesionales.join("\n") });
  const [guardando, setGuardando] = useState(false);
  const guardar = async () => {
    if (aMinutos(f.fin) <= aMinutos(f.inicio)) { toast.error("La hora de cierre debe ser posterior a la de apertura"); return; }
    setGuardando(true);
    try {
      const agenda = configAgenda({ inicio: f.inicio, fin: f.fin, intervalo: f.intervalo, profesionales: f.profesionalesTxt.split(/[\n,]/) });
      await A.actualizarConfig({ agenda });
      toast.success("Agenda configurada"); onClose();
    } catch (e) { toast.error(e.message); } finally { setGuardando(false); }
  };
  return (
    <Modal title="Horario y profesionales" onClose={() => !guardando && onClose()} width={480}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
        <div><label style={lbl}>Abre</label><input type="time" style={inp} value={f.inicio} onChange={e => setF({ ...f, inicio: e.target.value })} /></div>
        <div><label style={lbl}>Cierra</label><input type="time" style={inp} value={f.fin} onChange={e => setF({ ...f, fin: e.target.value })} /></div>
        <div><label style={lbl}>Intervalo</label>
          <select style={inp} value={f.intervalo} onChange={e => setF({ ...f, intervalo: Number(e.target.value) })}>{[10, 15, 20, 30, 60].map(m => <option key={m} value={m}>{m} min</option>)}</select>
        </div>
      </div>
      <label style={{ ...lbl, marginTop: 12 }}>Profesionales (uno por línea)</label>
      <textarea style={{ ...inp, minHeight: 100, resize: "vertical" }} value={f.profesionalesTxt} onChange={e => setF({ ...f, profesionalesTxt: e.target.value })} placeholder={"Ana\nLuis\nSilla 3"} />
      <div style={{ fontSize: 12, color: C.textFaint, marginTop: 6 }}>Cada profesional (o silla, consultorio, cancha…) tiene su columna en la vista del día y el sistema evita que tenga dos citas a la vez.</div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
        <button onClick={onClose} disabled={guardando} style={mkBtn("ghost")}>Cancelar</button>
        <button onClick={guardar} disabled={guardando} style={mkBtn("primary")}>{guardando ? "Guardando…" : "Guardar"}</button>
      </div>
    </Modal>
  );
}
