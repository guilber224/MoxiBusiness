import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { ChefHat, Minus, Plus, Printer, Settings2, Trash2, ArrowRightLeft, Check, Bell } from "lucide-react";
import { n } from "../utils/businessLogic.js";
import { Bs, getCurrencySymbol } from "../currency.js";
import { C } from "../theme.jsx";
import { card, inp, lbl, mkBtn, mkBadge, row } from "../styles.js";
import { useAccion } from "../hooks/useAccion.js";
import { Header } from "./ui/Header.jsx";
import { Modal } from "./ui/Modal.jsx";
import { Empty } from "./ui/Empty.jsx";
import { KPI } from "./ui/KPI.jsx";
import { SelectorVariante } from "./ui/SelectorVariante.jsx";
import { getCategoryName } from "../categories.js";
import {
  ESTADOS_ITEM, TIPOS_COMANDA, resumenComanda, minutosDesde, tiempoTxt, tituloComanda, estadoMesa, colaCocina,
  htmlTicketCocina, htmlPrecuenta,
} from "../utils/comandas.js";
import { imprimirHtml, imprimirTicket, leerAnchoTicket } from "../utils/ticketTermico.js";

const METODOS = [["efectivo", "Efectivo"], ["qr", "QR"], ["banco", "Transferencia"], ["tarjeta", "Tarjeta"]];
const COLOR_MESA = { libre: C.green, ocupada: "#111E7B", listo: C.amber, pagada: "#9CA3AF" };
const TXT_MESA = { libre: "Libre", ocupada: "Ocupada", listo: "¡Plato listo!", pagada: "Pagada" };
const BADGE_ITEM = { PENDIENTE: "gray", ENVIADO: "blue", LISTO: "amber", ENTREGADO: "green", ANULADO: "red" };
const esAdmin = u => ["admin", "superadmin"].includes(String(u?.role || "").toLowerCase());
const leerPref = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } };
const guardarPref = (k, v) => { try { localStorage.setItem(k, String(v)); } catch { /* sin almacenamiento */ } };
const hoyIso = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };

// Sonido corto para avisar a la cocina de un pedido nuevo
function pitido() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination); o.frequency.value = 880; g.gain.value = 0.08;
    o.start(); o.stop(ctx.currentTime + 0.25); o.onended = () => ctx.close();
  } catch { /* sin audio */ }
}

// Reloj compartido: los minutos se actualizan cada 30 s
function useAhora(ms = 30000) {
  const [t, setT] = useState(() => Date.now());
  useEffect(() => { const i = setInterval(() => setT(Date.now()), ms); return () => clearInterval(i); }, [ms]);
  return t;
}

export function Mesas({ D, A, user }) {
  const mesas = D.mesas || [];
  const comandas = D.comandas || [];
  const config = D.config || {};
  const [vista, setVista] = useState("salon");
  const [abiertaId, setAbiertaId] = useState(null);
  const [nuevoLlevar, setNuevoLlevar] = useState(null);
  const [configAbierta, setConfigAbierta] = useState(false);
  const [ejecutar, ocupado] = useAccion();
  const ahora = useAhora();

  const abiertas = useMemo(() => comandas.filter(c => c.estado === "ABIERTA"), [comandas]);
  const porMesa = useMemo(() => new Map(abiertas.filter(c => c.mesaId).map(c => [c.mesaId, c])), [abiertas]);
  const llevar = abiertas.filter(c => !c.mesaId);
  const cola = useMemo(() => colaCocina(comandas).filter(x => x.items.some(i => i.estado === "ENVIADO")), [comandas]);
  const deHoy = useMemo(() => comandas.filter(c => c.estado !== "ABIERTA" && new Date(c.cerrada || c.abierta).getTime() >= hoyIso()), [comandas]);
  const kpi = useMemo(() => ({
    ocupadas: mesas.filter(m => porMesa.has(m.id)).length,
    enMesa: abiertas.reduce((a, c) => a + resumenComanda(c).porCobrar, 0),
    enCocina: cola.reduce((a, x) => a + x.items.filter(i => i.estado === "ENVIADO").length, 0),
    vendidoHoy: comandas.filter(c => c.estado !== "ANULADA").reduce((a, c) => a + c.items.filter(i => i.ventaId && i.estado !== "ANULADO" && new Date(c.updatedAt).getTime() >= hoyIso()).reduce((s, i) => s + i.qty * i.price, 0), 0),
  }), [mesas, porMesa, abiertas, cola, comandas]);

  // Pitido en la vista Cocina cuando llega un plato nuevo
  const previo = useRef(kpi.enCocina);
  useEffect(() => { if (vista === "cocina" && kpi.enCocina > previo.current) pitido(); previo.current = kpi.enCocina; }, [kpi.enCocina, vista]);

  const abrirMesa = async m => {
    const c = porMesa.get(m.id);
    if (c) { setAbiertaId(c.id); return; }
    const r = await ejecutar(() => A.abrirComanda({ tipo: "MESA", mesaId: m.id }));
    if (r) setAbiertaId(r.id);
  };
  const crearLlevar = async () => {
    const f = nuevoLlevar;
    if (!f.customerName.trim()) { toast.error("Indica el nombre del cliente"); return; }
    const r = await ejecutar(() => A.abrirComanda(f));
    if (r) { setNuevoLlevar(null); setAbiertaId(r.id); }
  };

  const zonas = useMemo(() => {
    const m = new Map();
    mesas.forEach(x => { const z = x.zona || "Salón"; if (!m.has(z)) m.set(z, []); m.get(z).push(x); });
    return [...m];
  }, [mesas]);
  const abierta = comandas.find(c => c.id === abiertaId) || null;

  return (
    <div>
      <Header title="Mesas y comandas" sub="Atención en mesa, para llevar y cocina"
        action={<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {esAdmin(user) && <button onClick={() => setConfigAbierta(true)} style={mkBtn("ghost")}><Settings2 size={14} /> Mesas</button>}
          <button onClick={() => setNuevoLlevar({ tipo: "LLEVAR", customerName: "", phone: "", direccion: "" })} style={mkBtn("primary")}>+ Para llevar</button>
        </div>} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 14 }}>
        <KPI label="Mesas ocupadas" value={`${kpi.ocupadas}/${mesas.length}`} Icon="🍽️" color={C.blue} />
        <KPI label="Por cobrar" value={Bs(kpi.enMesa)} sub={`${abiertas.length} comanda${abiertas.length === 1 ? "" : "s"} abierta${abiertas.length === 1 ? "" : "s"}`} Icon="🧾" color={C.amber} />
        <KPI label="En cocina" value={kpi.enCocina} sub="platos por preparar" Icon="👨‍🍳" color={kpi.enCocina ? C.red : C.green} />
        <KPI label="Cobrado hoy" value={Bs(kpi.vendidoHoy)} Icon="💵" color={C.green} />
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {[["salon", "Salón"], ["llevar", `Para llevar${llevar.length ? ` (${llevar.length})` : ""}`], ["cocina", `Cocina${kpi.enCocina ? ` (${kpi.enCocina})` : ""}`], ["hoy", "Cerradas hoy"]].map(([id, t]) => (
          <button key={id} onClick={() => setVista(id)} style={{ ...mkBtn(vista === id ? "primary" : "ghost"), padding: "6px 12px", fontSize: 13 }}>{id === "cocina" && <ChefHat size={14} />}{t}</button>
        ))}
      </div>

      {vista === "salon" && (mesas.length === 0
        ? <Empty icon="🍽️" title="Aún no configuraste tus mesas" sub={esAdmin(user) ? "Créalas con el botón “Mesas” (puedes agregar varias de una vez)." : "Pide al administrador que configure las mesas."} />
        : zonas.map(([zona, ms]) => (
          <div key={zona} style={{ marginBottom: 16 }}>
            {zonas.length > 1 && <div style={{ fontSize: 12, fontWeight: 700, color: C.textMid, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>{zona}</div>}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(118px,1fr))", gap: 10 }}>
              {ms.map(m => {
                const c = porMesa.get(m.id);
                const est = estadoMesa(c);
                const r = c ? resumenComanda(c) : null;
                return (
                  <button key={m.id} onClick={() => abrirMesa(m)} disabled={ocupado} aria-label={`${m.name} · ${TXT_MESA[est]}`}
                    style={{ ...card({ padding: "12px 10px" }), cursor: "pointer", fontFamily: "inherit", color: C.text, textAlign: "center", minHeight: 104,
                      border: `2px solid ${COLOR_MESA[est]}`, background: est === "libre" ? "var(--color-bg-surface)" : `color-mix(in srgb, ${COLOR_MESA[est]} 9%, var(--color-bg-surface))` }}>
                    <div style={{ fontWeight: 800, fontSize: 16 }}>{m.name}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: COLOR_MESA[est], marginTop: 2 }}>{est === "listo" && <Bell size={11} style={{ verticalAlign: -1 }} />} {TXT_MESA[est]}</div>
                    {c ? <>
                      <div style={{ fontSize: 15, fontWeight: 800, marginTop: 6 }}>{Bs(r.porCobrar || r.total)}</div>
                      <div style={{ fontSize: 11, color: C.textFaint }}>{tiempoTxt(minutosDesde(c.abierta, ahora))}{c.personas ? ` · ${c.personas} 👤` : ""}</div>
                    </> : <div style={{ fontSize: 11, color: C.textFaint, marginTop: 8 }}>{m.capacidad ? `${m.capacidad} personas` : "Toca para abrir"}</div>}
                  </button>
                );
              })}
            </div>
          </div>
        )))}

      {vista === "llevar" && (llevar.length === 0
        ? <Empty icon="🥡" title="No hay pedidos para llevar abiertos" sub="Créalos con “+ Para llevar”." />
        : <div style={{ display: "grid", gap: 8 }}>
          {llevar.map(c => {
            const r = resumenComanda(c);
            return (
              <button key={c.id} onClick={() => setAbiertaId(c.id)} style={{ ...card({ padding: "12px 14px" }), cursor: "pointer", fontFamily: "inherit", color: C.text, textAlign: "left", display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 700 }}>#{c.numero} · {tituloComanda(c)}</div>
                  <div style={{ fontSize: 12, color: C.textMid }}>{[c.phone, c.direccion].filter(Boolean).join(" · ") || TIPOS_COMANDA[c.tipo]} · hace {tiempoTxt(minutosDesde(c.abierta, ahora))}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <strong>{Bs(r.total)}</strong>
                  <div style={{ fontSize: 11, color: r.porCobrar ? C.red : C.green }}>{r.porCobrar ? `Por cobrar ${Bs(r.porCobrar)}` : "Pagado"}</div>
                </div>
              </button>
            );
          })}
        </div>)}

      {vista === "cocina" && <VistaCocina cola={cola} ahora={ahora} A={A} />}

      {vista === "hoy" && (deHoy.length === 0 ? <Empty icon="🧾" title="Aún no se cerraron comandas hoy" />
        : <div style={{ display: "grid", gap: 6 }}>
          {deHoy.map(c => (
            <button key={c.id} onClick={() => setAbiertaId(c.id)} style={{ ...card({ padding: "10px 14px" }), cursor: "pointer", fontFamily: "inherit", color: C.text, textAlign: "left", display: "flex", justifyContent: "space-between", gap: 10 }}>
              <span>#{c.numero} · {tituloComanda(c)} <span style={{ color: C.textFaint, fontSize: 12 }}>· {c.mesero}</span></span>
              <span>{c.estado === "ANULADA" ? <span style={mkBadge("red")}>Anulada</span> : <strong>{Bs(resumenComanda(c).total)}</strong>}</span>
            </button>
          ))}
        </div>)}

      {nuevoLlevar && <Modal title="Nuevo pedido" onClose={() => !ocupado && setNuevoLlevar(null)} width={460}>
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {[["LLEVAR", "🥡 Para llevar"], ["DELIVERY", "🛵 Delivery"]].map(([t, txt]) => (
            <button key={t} onClick={() => setNuevoLlevar({ ...nuevoLlevar, tipo: t })} style={{ ...mkBtn(nuevoLlevar.tipo === t ? "primary" : "ghost"), flex: 1, justifyContent: "center" }}>{txt}</button>
          ))}
        </div>
        <label style={lbl}>Cliente *</label>
        <input style={{ ...inp, marginBottom: 10 }} value={nuevoLlevar.customerName} onChange={e => setNuevoLlevar({ ...nuevoLlevar, customerName: e.target.value })} placeholder="Nombre" autoFocus />
        <label style={lbl}>Celular</label>
        <input style={{ ...inp, marginBottom: 10 }} value={nuevoLlevar.phone} onChange={e => setNuevoLlevar({ ...nuevoLlevar, phone: e.target.value })} inputMode="tel" />
        {nuevoLlevar.tipo === "DELIVERY" && <><label style={lbl}>Dirección</label>
          <input style={inp} value={nuevoLlevar.direccion} onChange={e => setNuevoLlevar({ ...nuevoLlevar, direccion: e.target.value })} placeholder="Calle, número, referencia" /></>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
          <button onClick={() => setNuevoLlevar(null)} style={mkBtn("ghost")}>Cancelar</button>
          <button onClick={crearLlevar} disabled={ocupado} style={mkBtn("primary")}>Crear pedido</button>
        </div>
      </Modal>}

      {abierta && <PanelComanda key={abierta.id} comanda={abierta} D={D} A={A} config={config} mesasLibres={mesas.filter(m => !porMesa.has(m.id))} ahora={ahora} onClose={() => setAbiertaId(null)} />}
      {configAbierta && <ConfigMesas mesas={mesas} ocupadas={porMesa} A={A} onClose={() => setConfigAbierta(false)} />}
    </div>
  );
}

// ── Pantalla de cocina ─────────────────────────────────────────────────────
function VistaCocina({ cola, ahora, A }) {
  const [ejecutar, ocupado] = useAccion();
  if (cola.length === 0) return <Empty icon="👨‍🍳" title="Cocina al día" sub="Aquí aparecen los platos que los meseros envían. Suena un aviso cuando llega uno nuevo." />;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 10 }}>
      {cola.map(({ comanda: c, items, desde }) => {
        const min = minutosDesde(desde, ahora);
        const color = min >= 25 ? C.red : min >= 15 ? C.amber : C.green;
        return (
          <div key={c.id} style={{ ...card({ padding: 12 }), borderTop: `4px solid ${color}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
              <strong style={{ fontSize: 16 }}>{tituloComanda(c)}</strong>
              <span style={{ fontSize: 12, fontWeight: 700, color }}>{tiempoTxt(min)}</span>
            </div>
            <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 6 }}>#{c.numero}{c.mesero ? ` · ${c.mesero}` : ""}</div>
            <div style={{ display: "grid", gap: 4 }}>
              {items.map(i => (
                <button key={i.id} onClick={() => i.estado === "ENVIADO" && ejecutar(() => A.estadoItemsComanda(c.id, "LISTO", [i.id]))} disabled={ocupado || i.estado !== "ENVIADO"}
                  style={{ textAlign: "left", border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 8px", cursor: i.estado === "ENVIADO" ? "pointer" : "default", fontFamily: "inherit",
                    background: i.estado === "LISTO" ? "rgba(16,185,129,0.10)" : "var(--color-bg-surface)", color: C.text, opacity: i.estado === "LISTO" ? 0.65 : 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, textDecoration: i.estado === "LISTO" ? "line-through" : "none" }}>{i.qty} × {i.name}</div>
                  {i.nota && <div style={{ fontSize: 12, color: C.red, fontWeight: 600 }}>» {i.nota}</div>}
                </button>
              ))}
            </div>
            <button onClick={() => ejecutar(() => A.estadoItemsComanda(c.id, "LISTO"), { exito: `${tituloComanda(c)}: listo` })} disabled={ocupado}
              style={{ ...mkBtn("primary"), width: "100%", justifyContent: "center", marginTop: 10 }}><Check size={14} /> Todo listo</button>
          </div>
        );
      })}
    </div>
  );
}

// ── Comanda: agregar platos, enviar a cocina, precuenta y cobro ──────────────
function PanelComanda({ comanda: c, D, A, config, mesasLibres, ahora, onClose }) {
  const [ejecutar, ocupado] = useAccion();
  const [borrador, setBorrador] = useState([]);   // líneas nuevas aún no guardadas
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [grupo, setGrupo] = useState(null);
  const [cobro, setCobro] = useState(null);
  const [mover, setMover] = useState(false);
  const [imprimirCocina, setImprimirCocina] = useState(() => leerPref("moxi_cocina_imprimir", "0") === "1");
  const abierta = c.estado === "ABIERTA";
  const r = resumenComanda(c);
  const catalogo = useMemo(() => (D.catalogo || D.products).filter(p => p.price > 0 || p.isGroup), [D.catalogo, D.products]);
  const categorias = useMemo(() => [...new Set(catalogo.map(p => p.cat))].map(id => ({ id, name: getCategoryName(D.categories, id) })), [catalogo, D.categories]);
  const lista = useMemo(() => {
    const t = q.trim().toLowerCase();
    return catalogo.filter(p => (cat === "all" || p.cat === cat) && (!t || `${p.name} ${p.barcode || ""}`.toLowerCase().includes(t))).slice(0, 120);
  }, [catalogo, cat, q]);
  const totalBorrador = borrador.reduce((a, i) => a + n(i.qty) * n(i.price), 0);

  const sumar = p => {
    if (p.isGroup) { setGrupo(p); return; }
    setBorrador(b => {
      const k = b.findIndex(x => x.productId === p.id && !x.nota);
      if (k >= 0) return b.map((x, j) => (j === k ? { ...x, qty: x.qty + 1 } : x));
      return [...b, { productId: p.id, name: p.name, price: p.price, qty: 1, nota: "" }];
    });
  };
  const guardarBorrador = async () => {
    if (!borrador.length) return true;
    const ok = await ejecutar(() => A.agregarComanda(c.id, borrador));
    if (ok) setBorrador([]);
    return !!ok;
  };
  const enviar = async () => {
    if (!(await guardarBorrador())) return;
    const envio = await ejecutar(() => A.enviarComanda(c.id), { exito: "Enviado a cocina" });
    if (envio && imprimirCocina) imprimirHtml(htmlTicketCocina({ envio, ancho: leerAnchoTicket() }));
  };
  const cerrar = async () => {
    if (borrador.length && !window.confirm("Hay platos sin guardar. ¿Salir sin agregarlos?")) return;
    // Mesa abierta por error y sin nada: se libera sola
    if (abierta && c.items.length === 0 && c.tipo === "MESA") await ejecutar(() => A.anularComanda(c.id, null));
    onClose();
  };
  const anular = async () => {
    const enviado = c.items.some(i => i.estado !== "PENDIENTE" && i.estado !== "ANULADO");
    const motivo = enviado ? window.prompt("Motivo de la anulación (ya se envió a cocina):") : (window.confirm("¿Anular esta comanda?") ? "" : null);
    if (motivo === null || (enviado && !motivo.trim())) return;
    const ok = await ejecutar(() => A.anularComanda(c.id, motivo), { exito: "Comanda anulada" });
    if (ok) onClose();
  };
  const quitarItem = async i => {
    if (i.estado === "PENDIENTE") { await ejecutar(() => A.quitarItemComanda(c.id, i.id)); return; }
    const motivo = window.prompt(`Anular ${i.qty} × ${i.name}. Motivo:`);
    if (motivo && motivo.trim()) await ejecutar(() => A.quitarItemComanda(c.id, i.id, motivo), { exito: "Línea anulada" });
  };

  return (
    <Modal title={`${tituloComanda(c)} · #${c.numero}`} onClose={cerrar} width={1000}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 12, fontSize: 12, color: C.textMid }}>
        <span>{c.mesero ? `Atiende ${c.mesero} · ` : ""}hace {tiempoTxt(minutosDesde(c.abierta, ahora))}{c.phone ? ` · ${c.phone}` : ""}{c.direccion ? ` · ${c.direccion}` : ""}</span>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {abierta && c.tipo === "MESA" && <label style={{ display: "flex", alignItems: "center", gap: 4 }}>👤
            <select value={c.personas || ""} onChange={e => ejecutar(() => A.actualizarComanda(c.id, { personas: e.target.value || null }))} style={{ ...inp, width: "auto", padding: "3px 6px" }} aria-label="Personas">
              <option value="">—</option>{Array.from({ length: 20 }, (_, k) => <option key={k + 1} value={k + 1}>{k + 1}</option>)}
            </select></label>}
          {r.lineas > 0 && <button onClick={() => imprimirHtml(htmlPrecuenta({ comanda: c, config, ancho: leerAnchoTicket(), simbolo: getCurrencySymbol(), propinaPct: Number(leerPref("moxi_propina_pct", "0")) || 0 }))} style={{ ...mkBtn("ghost"), padding: "4px 10px", fontSize: 12 }}><Printer size={13} /> Precuenta</button>}
          {abierta && mesasLibres.length > 0 && <button onClick={() => setMover(m => !m)} style={{ ...mkBtn("ghost"), padding: "4px 10px", fontSize: 12 }}><ArrowRightLeft size={13} /> {c.tipo === "MESA" ? "Cambiar mesa" : "Pasar a mesa"}</button>}
          {abierta && !c.items.some(i => i.ventaId) && <button onClick={anular} style={{ ...mkBtn("danger"), padding: "4px 10px", fontSize: 12 }}>Anular</button>}
        </div>
      </div>
      {mover && <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12, padding: 10, borderRadius: 10, background: "var(--color-bg-primary)" }}>
        <span style={{ fontSize: 12, color: C.textMid, alignSelf: "center" }}>Mover a:</span>
        {mesasLibres.map(m => <button key={m.id} onClick={async () => { if (await ejecutar(() => A.moverComanda(c.id, m.id), { exito: `Movida a ${m.name}` })) setMover(false); }} style={{ ...mkBtn("ghost"), padding: "4px 10px", fontSize: 12 }}>{m.name}</button>)}
      </div>}

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
        {abierta && <div style={{ flex: "1 1 360px", minWidth: 0 }}>
          <input style={{ ...inp, marginBottom: 8 }} value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar plato o bebida…" aria-label="Buscar producto" />
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 6, marginBottom: 6 }}>
            {[{ id: "all", name: "Todo" }, ...categorias].map(k => <button key={k.id} onClick={() => setCat(k.id)} style={{ ...mkBtn(cat === k.id ? "primary" : "ghost"), padding: "4px 10px", fontSize: 12, flexShrink: 0 }}>{k.name}</button>)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(112px,1fr))", gap: 8, maxHeight: 420, overflowY: "auto", paddingRight: 2 }}>
            {lista.map(p => (
              <button key={p.id} onClick={() => sumar(p)} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 8, cursor: "pointer", fontFamily: "inherit", color: C.text, background: "var(--color-bg-surface)", textAlign: "left", display: "flex", flexDirection: "column", gap: 4 }}>
                {p.img && <img src={p.img} alt="" loading="lazy" style={{ width: "100%", height: 54, objectFit: "cover", borderRadius: 6 }} />}
                <span style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.2 }}>{p.name}</span>
                <span style={{ fontSize: 12, color: "#111E7B", fontWeight: 700 }}>{p.isGroup ? "Elegir ▸" : Bs(p.price)}</span>
              </button>
            ))}
            {lista.length === 0 && <div style={{ fontSize: 12, color: C.textFaint }}>Sin resultados</div>}
          </div>
        </div>}

        <div style={{ flex: "1 1 340px", minWidth: 0 }}>
          {borrador.length > 0 && <div style={{ border: "1.5px dashed #22C5FE", borderRadius: 10, padding: 8, marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.textMid, marginBottom: 6 }}>NUEVO (sin guardar)</div>
            {borrador.map((i, k) => (
              <div key={k} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: 6, alignItems: "center", marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                  <button onClick={() => setBorrador(b => b.map((x, j) => (j === k ? { ...x, qty: Math.max(1, x.qty - 1) } : x)))} aria-label="Menos" style={{ ...mkBtn("ghost"), padding: "2px 5px" }}><Minus size={12} /></button>
                  <strong style={{ minWidth: 18, textAlign: "center", fontSize: 13 }}>{i.qty}</strong>
                  <button onClick={() => setBorrador(b => b.map((x, j) => (j === k ? { ...x, qty: x.qty + 1 } : x)))} aria-label="Más" style={{ ...mkBtn("ghost"), padding: "2px 5px" }}><Plus size={12} /></button>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{i.name}</div>
                  <input value={i.nota} onChange={e => setBorrador(b => b.map((x, j) => (j === k ? { ...x, nota: e.target.value } : x)))} placeholder="Nota: sin cebolla, término…" style={{ ...inp, padding: "3px 6px", fontSize: 11 }} />
                </div>
                <strong style={{ fontSize: 13 }}>{Bs(i.qty * i.price)}</strong>
                <button onClick={() => setBorrador(b => b.filter((_, j) => j !== k))} aria-label="Quitar" style={{ background: "none", border: "none", color: C.red, cursor: "pointer" }}><Trash2 size={14} /></button>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12 }}>Subtotal nuevo: <strong>{Bs(totalBorrador)}</strong></span>
              <button onClick={guardarBorrador} disabled={ocupado} style={{ ...mkBtn("ghost"), padding: "4px 10px", fontSize: 12 }}>Guardar sin enviar</button>
            </div>
          </div>}

          {c.items.length === 0 && !borrador.length && <div style={{ fontSize: 13, color: C.textFaint, padding: "20px 0", textAlign: "center" }}>{abierta ? "Toca los productos para agregarlos." : "Sin consumo."}</div>}
          <div style={{ display: "grid", gap: 4 }}>
            {c.items.map(i => (
              <div key={i.id} style={{ display: "flex", gap: 6, alignItems: "center", padding: "6px 8px", borderRadius: 8, border: `1px solid ${C.border}`, opacity: i.estado === "ANULADO" ? 0.5 : 1 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, textDecoration: i.estado === "ANULADO" ? "line-through" : "none" }}>{i.qty} × {i.name}</div>
                  {(i.nota || i.motivo) && <div style={{ fontSize: 11, color: i.motivo ? C.red : C.textMid }}>{i.motivo ? `Anulado: ${i.motivo}` : `» ${i.nota}`}</div>}
                </div>
                <span style={mkBadge(BADGE_ITEM[i.estado])}>{ESTADOS_ITEM[i.estado]}</span>
                {i.ventaId && i.estado !== "ANULADO" && <span style={mkBadge("green")}>Pagado</span>}
                <strong style={{ fontSize: 13, minWidth: 64, textAlign: "right" }}>{Bs(i.qty * i.price)}</strong>
                {abierta && (i.estado === "ENVIADO" || i.estado === "LISTO") && <button onClick={() => ejecutar(() => A.estadoItemsComanda(c.id, "ENTREGADO", [i.id]))} title="Marcar entregado" aria-label="Entregado" style={{ ...mkBtn("ghost"), padding: "2px 6px" }}><Check size={13} /></button>}
                {abierta && i.estado !== "ANULADO" && !i.ventaId && <button onClick={() => quitarItem(i)} aria-label={i.estado === "PENDIENTE" ? "Quitar" : "Anular"} title={i.estado === "PENDIENTE" ? "Quitar" : "Anular"} style={{ background: "none", border: "none", color: C.red, cursor: "pointer" }}><Trash2 size={14} /></button>}
              </div>
            ))}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 14, fontSize: 14, margin: "12px 0", flexWrap: "wrap" }}>
            <span>Total: <strong>{Bs(r.total + totalBorrador)}</strong></span>
            {r.cobrado > 0 && <span>Pagado: <strong style={{ color: C.green }}>{Bs(r.cobrado)}</strong></span>}
            <span>Por cobrar: <strong style={{ color: r.porCobrar + totalBorrador > 0 ? C.red : C.green }}>{Bs(r.porCobrar + totalBorrador)}</strong></span>
          </div>

          {abierta && !cobro && <div style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={enviar} disabled={ocupado || (!borrador.length && !r.pendientes)} style={{ ...mkBtn("primary"), flex: 1, justifyContent: "center", background: "#0EA5E9" }}>
                <ChefHat size={15} /> Enviar a cocina{borrador.length + r.pendientes ? ` (${borrador.length + r.pendientes})` : ""}
              </button>
              {r.porCobrar > 0 && <button onClick={async () => { if (await guardarBorrador()) setCobro(true); }} disabled={ocupado} style={{ ...mkBtn("primary"), flex: 1, justifyContent: "center" }}>💵 Cobrar</button>}
              {r.lineas > 0 && r.porCobrar === 0 && !borrador.length && <button onClick={async () => { if (await ejecutar(() => A.liberarComanda(c.id), { exito: "Mesa liberada" })) onClose(); }} disabled={ocupado} style={{ ...mkBtn("success"), flex: 1, justifyContent: "center" }}>✓ {c.tipo === "MESA" ? "Liberar mesa" : "Cerrar pedido"}</button>}
            </div>
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, color: C.textMid, cursor: "pointer" }}>
              <input type="checkbox" checked={imprimirCocina} onChange={e => { setImprimirCocina(e.target.checked); guardarPref("moxi_cocina_imprimir", e.target.checked ? "1" : "0"); }} /> Imprimir la comanda al enviar a cocina (este dispositivo)
            </label>
          </div>}
          {abierta && cobro && <PanelCobro comanda={c} D={D} A={A} config={config} onVolver={() => setCobro(false)} onCobrado={cerrada => { setCobro(false); if (cerrada) onClose(); }} />}
          {!abierta && <div style={{ fontSize: 12, color: c.estado === "ANULADA" ? C.red : C.green }}>{c.estado === "ANULADA" ? `Anulada${c.motivo ? `: ${c.motivo}` : ""}` : "Comanda cerrada: las ventas están en el módulo Ventas."}</div>}
        </div>
      </div>
      {grupo && <SelectorVariante grupo={grupo} variantes={D.variantesDe?.get(grupo.id) || []} onClose={() => setGrupo(null)} onElegir={v => { setGrupo(null); sumar(v); }} />}
    </Modal>
  );
}

// ── Cobro (total o cuenta dividida) ───────────────────────────────────────
function PanelCobro({ comanda: c, D, A, config, onVolver, onCobrado }) {
  const [ejecutar, ocupado] = useAccion();
  const sinCobrar = c.items.filter(i => i.estado !== "ANULADO" && !i.ventaId);
  const [sel, setSel] = useState(() => new Set(sinCobrar.map(i => i.id)));
  const [descuento, setDescuento] = useState("");
  const [metodo, setMetodo] = useState("efectivo");
  const [recibido, setRecibido] = useState("");
  const [clienteId, setClienteId] = useState(c.customerId || "");
  const [err, setErr] = useState("");
  const subtotal = sinCobrar.filter(i => sel.has(i.id)).reduce((a, i) => a + i.qty * i.price, 0);
  const total = Math.max(0, Math.round((subtotal - n(descuento)) * 100) / 100);
  const pago = recibido === "" ? total : Math.min(n(recibido), total);
  const vuelto = recibido !== "" && metodo === "efectivo" ? Math.max(0, n(recibido) - total) : 0;
  const todas = sel.size === sinCobrar.length;
  const alternar = id => setSel(s => { const x = new Set(s); if (x.has(id)) x.delete(id); else x.add(id); return x; });

  const cobrar = async () => {
    setErr("");
    if (!sel.size) { setErr("Elige qué se cobra"); return; }
    if (n(descuento) > subtotal) { setErr("El descuento no puede ser mayor que el subtotal"); return; }
    if (pago < total - 0.005 && !clienteId) { setErr("Para dejar saldo pendiente elige un cliente registrado, o cobra el total."); return; }
    const r = await ejecutar(() => A.cobrarComanda(c.id, {
      items: todas ? null : [...sel], customerId: clienteId || null, discount: n(descuento),
      pagos: [{ amount: pago, method: metodo }],
    }), { exito: "Cobrado" });
    if (!r) return;
    if (vuelto > 0) toast(`Vuelto: ${Bs(vuelto)}`, { icon: "💵", duration: 6000 });
    if (r.sale && window.confirm(`Venta N° ${r.sale.numero || r.venta?.numero} registrada. ¿Imprimir ticket?`)) imprimirTicket({ sale: r.sale, config, ancho: leerAnchoTicket(), simbolo: getCurrencySymbol() });
    onCobrado(r.comanda.estado !== "ABIERTA");
  };

  return (
    <div style={{ padding: 12, borderRadius: 10, border: `1px solid ${C.border}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
        <strong>Cobrar{todas ? "" : " (cuenta dividida)"}</strong>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => setSel(new Set(sinCobrar.map(i => i.id)))} style={{ ...mkBtn("ghost"), padding: "3px 8px", fontSize: 11 }}>Todo</button>
          <button onClick={() => setSel(new Set())} style={{ ...mkBtn("ghost"), padding: "3px 8px", fontSize: 11 }}>Nada</button>
        </div>
      </div>
      <div style={{ display: "grid", gap: 2, maxHeight: 180, overflowY: "auto", marginBottom: 10 }}>
        {sinCobrar.map(i => (
          <label key={i.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, cursor: "pointer", padding: "3px 0" }}>
            <input type="checkbox" checked={sel.has(i.id)} onChange={() => alternar(i.id)} />
            <span style={{ flex: 1 }}>{i.qty} × {i.name}</span><span>{Bs(i.qty * i.price)}</span>
          </label>
        ))}
      </div>
      {c.personas > 1 && todas && <div style={{ fontSize: 12, color: C.textMid, marginBottom: 8 }}>Entre {c.personas} personas: {Bs(total / c.personas)} c/u. Para cobrar por separado, marca solo lo de cada persona.</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 8 }}>
        <div><label style={lbl}>Descuento (Bs)</label><input type="number" min="0" style={inp} value={descuento} onChange={e => setDescuento(e.target.value)} placeholder="0" /></div>
        <div><label style={lbl}>Método</label><select style={inp} value={metodo} onChange={e => setMetodo(e.target.value)}>{METODOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></div>
        <div><label style={lbl}>{metodo === "efectivo" ? "Recibido" : "Monto"}</label><input type="number" min="0" style={inp} value={recibido} onChange={e => setRecibido(e.target.value)} placeholder={total.toFixed(2)} /></div>
      </div>
      <div style={row()}>
        <select style={{ ...inp, marginTop: 8 }} value={clienteId} onChange={e => setClienteId(e.target.value)} aria-label="Cliente">
          <option value="">Sin cliente registrado</option>
          {D.customers.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 14 }}>A cobrar: <strong style={{ fontSize: 18 }}>{Bs(total)}</strong>{vuelto > 0 && <span style={{ color: C.green, marginLeft: 10 }}>Vuelto {Bs(vuelto)}</span>}{pago < total - 0.005 && <span style={{ color: C.red, marginLeft: 10 }}>Saldo {Bs(total - pago)}</span>}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onVolver} style={mkBtn("ghost")}>Volver</button>
          <button onClick={cobrar} disabled={ocupado || !sel.size} style={mkBtn("primary")}>{ocupado ? "Cobrando…" : "Confirmar cobro"}</button>
        </div>
      </div>
      {err && <div style={{ color: C.red, fontSize: 13, marginTop: 8 }}>{err}</div>}
    </div>
  );
}

// ── Configurar mesas (solo administrador) ─────────────────────────────────
function ConfigMesas({ mesas, ocupadas, A, onClose }) {
  const [ejecutar, ocupado] = useAccion();
  const [filas, setFilas] = useState(() => mesas.map(m => ({ ...m })));
  const [lote, setLote] = useState({ cantidad: 10, prefijo: "Mesa", zona: "" });
  const [propina, setPropina] = useState(() => leerPref("moxi_propina_pct", "0"));
  const cambio = (k, campo, v) => setFilas(fs => fs.map((x, j) => (j === k ? { ...x, [campo]: v } : x)));

  const guardarFila = async f => {
    const r = await ejecutar(() => A.guardarMesa({ ...f, capacidad: f.capacidad ? Number(f.capacidad) : null }));
    if (r) setFilas(fs => fs.map(x => (x === f ? { ...r } : x)));
  };
  const agregarVarias = async () => {
    const cant = Math.min(50, Math.max(1, Number(lote.cantidad) || 0));
    const usados = new Set(filas.map(f => f.name.trim().toLowerCase()));
    let k = 1, creadas = 0;
    for (let i = 0; i < cant; i++) {
      while (usados.has(`${lote.prefijo} ${k}`.toLowerCase())) k++;
      const nombre = `${lote.prefijo.trim() || "Mesa"} ${k}`; usados.add(nombre.toLowerCase());
      const r = await ejecutar(() => A.guardarMesa({ name: nombre, zona: lote.zona }));
      if (!r) break;
      setFilas(fs => [...fs, { ...r }]); creadas++;
    }
    if (creadas) toast.success(`${creadas} mesa${creadas === 1 ? "" : "s"} creada${creadas === 1 ? "" : "s"}`);
  };
  const eliminar = async f => {
    if (!f.id) { setFilas(fs => fs.filter(x => x !== f)); return; }
    if (!window.confirm(`¿Quitar ${f.name}?`)) return;
    if (await ejecutar(() => A.eliminarMesa(f.id).then(() => true))) setFilas(fs => fs.filter(x => x !== f));
  };

  return (
    <Modal title="Mesas" onClose={() => !ocupado && onClose()} width={640}>
      <div style={{ padding: 10, borderRadius: 10, background: "var(--color-bg-primary)", marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Agregar varias</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <input type="number" min="1" max="50" style={{ ...inp, width: 70 }} value={lote.cantidad} onChange={e => setLote({ ...lote, cantidad: e.target.value })} aria-label="Cantidad" />
          <input style={{ ...inp, flex: "1 1 100px" }} value={lote.prefijo} onChange={e => setLote({ ...lote, prefijo: e.target.value })} placeholder="Mesa" aria-label="Nombre base" />
          <input style={{ ...inp, flex: "1 1 100px" }} value={lote.zona} onChange={e => setLote({ ...lote, zona: e.target.value })} placeholder="Zona (Salón, Terraza…)" aria-label="Zona" />
          <button onClick={agregarVarias} disabled={ocupado} style={mkBtn("primary")}>Crear</button>
        </div>
      </div>
      <div style={{ display: "grid", gap: 6, maxHeight: 360, overflowY: "auto" }}>
        {filas.map((f, k) => (
          <div key={f.id || `n${k}`} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <input style={{ ...inp, flex: "2 1 110px" }} value={f.name} onChange={e => cambio(k, "name", e.target.value)} aria-label="Nombre" />
            <input style={{ ...inp, flex: "2 1 100px" }} value={f.zona} onChange={e => cambio(k, "zona", e.target.value)} placeholder="Zona" aria-label="Zona" />
            <input type="number" min="1" style={{ ...inp, width: 70 }} value={f.capacidad || ""} onChange={e => cambio(k, "capacidad", e.target.value)} placeholder="Pers." aria-label="Capacidad" />
            <button onClick={() => guardarFila(f)} disabled={ocupado || !f.name.trim()} style={{ ...mkBtn("ghost"), padding: "5px 10px", fontSize: 12 }}>Guardar</button>
            <button onClick={() => eliminar(f)} disabled={ocupado || ocupadas.has(f.id)} title={ocupadas.has(f.id) ? "Tiene una comanda abierta" : "Quitar"} aria-label="Quitar" style={{ background: "none", border: "none", color: C.red, cursor: "pointer", opacity: ocupadas.has(f.id) ? 0.3 : 1 }}><Trash2 size={15} /></button>
          </div>
        ))}
        <button onClick={() => setFilas(fs => [...fs, { id: null, name: "", zona: "", capacidad: "" }])} style={{ ...mkBtn("ghost"), justifySelf: "start" }}><Plus size={13} /> Una mesa</button>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
        <label style={{ ...lbl, margin: 0 }}>Propina sugerida en la precuenta (%)</label>
        <input type="number" min="0" max="30" style={{ ...inp, width: 70 }} value={propina} onChange={e => { setPropina(e.target.value); guardarPref("moxi_propina_pct", e.target.value || "0"); }} />
        <span style={{ fontSize: 11, color: C.textFaint }}>0 = no se muestra</span>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}><button onClick={onClose} style={mkBtn("primary")}>Listo</button></div>
    </Modal>
  );
}
