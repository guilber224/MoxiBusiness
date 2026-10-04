import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { MessageCircle, Printer, Plus, Trash2 } from "lucide-react";
import { n, today, fDate, fDateTime } from "../utils/businessLogic.js";
import { Bs, getCurrencySymbol } from "../currency.js";
import { C } from "../theme.jsx";
import { card, inp, lbl, mkBtn, mkBadge, row } from "../styles.js";
import { useAccion } from "../hooks/useAccion.js";
import { useMostrarMas } from "../hooks/useMostrarMas.js";
import { Header } from "./ui/Header.jsx";
import { Modal } from "./ui/Modal.jsx";
import { Empty } from "./ui/Empty.jsx";
import { SearchInput } from "./ui/SearchInput.jsx";
import { KPI } from "./ui/KPI.jsx";
import { BotonMostrarMas } from "./ui/BotonMostrarMas.jsx";
import { SelectorProducto } from "./ui/SelectorProducto.jsx";
import { ESTADOS_ORDEN, htmlTicketOrden } from "../utils/ticketOrden.js";
import { imprimirHtml, leerAnchoTicket } from "../utils/ticketTermico.js";

const ETAPAS = ["RECIBIDO", "DIAGNOSTICO", "ESPERA_APROBACION", "EN_REPARACION", "LISTO"];
const BADGE = { RECIBIDO: "gray", DIAGNOSTICO: "blue", ESPERA_APROBACION: "amber", EN_REPARACION: "blue", LISTO: "green", ENTREGADO: "green", CANCELADO: "red" };
const METODOS = [["efectivo", "Efectivo"], ["qr", "QR"], ["banco", "Transferencia"], ["tarjeta", "Tarjeta"]];
const NUEVA = () => ({ customerId: "", customerName: "", phone: "", equipo: "", marca: "", modelo: "", serie: "", accesorios: "", falla: "", presupuesto: "", anticipo: "", anticipoMetodo: "efectivo", tecnico: "", prometido: "", garantiaDias: "", notas: "" });
const waNumero = tel => { const d = String(tel || "").replace(/\D/g, ""); if (!d) return null; return d.length === 8 ? `591${d}` : d; };
const atrasada = o => o.prometido && !["ENTREGADO", "CANCELADO", "LISTO"].includes(o.estado) && o.prometido < today();

export function Servicios({ D, A, user }) {
  const ordenes = D.servicios || [];
  const { customers } = D;
  const productos = D.vendibles || D.products;
  const config = D.config || {};
  const [ejecutar, guardando] = useAccion();
  const [filtro, setFiltro] = useState("abiertas");
  const [q, setQ] = useState("");
  const [nueva, setNueva] = useState(null);
  const [detalleId, setDetalleId] = useState(null);
  const [err, setErr] = useState("");

  const conteo = useMemo(() => {
    const c = { abiertas: 0, atrasadas: 0 };
    ordenes.forEach(o => { c[o.estado] = (c[o.estado] || 0) + 1; if (!["ENTREGADO", "CANCELADO"].includes(o.estado)) c.abiertas++; if (atrasada(o)) c.atrasadas++; });
    return c;
  }, [ordenes]);
  const mes = today().slice(0, 7);
  const entregadasMes = ordenes.filter(o => o.estado === "ENTREGADO" && String(o.entregado || "").slice(0, 7) === mes);

  const lista = useMemo(() => {
    const t = q.trim().toLowerCase();
    return ordenes.filter(o => (filtro === "todas" || (filtro === "abiertas" ? !["ENTREGADO", "CANCELADO"].includes(o.estado) : filtro === "atrasadas" ? atrasada(o) : o.estado === filtro))
      && (!t || `${o.numero} ${o.customerName} ${o.phone} ${o.equipo} ${o.marca} ${o.modelo} ${o.serie}`.toLowerCase().includes(t)));
  }, [ordenes, filtro, q]);
  const pag = useMostrarMas(lista, 50, filtro + "|" + q);
  const detalle = ordenes.find(o => o.id === detalleId) || null;

  const imprimir = o => imprimirHtml(htmlTicketOrden({ orden: o, config, ancho: leerAnchoTicket(), simbolo: getCurrencySymbol() }));

  const crear = async () => {
    const f = nueva;
    if (!f.customerId && !f.customerName.trim()) { setErr("Indica el cliente"); return; }
    if (!f.equipo.trim()) { setErr("Indica el equipo (ej: Celular Samsung A12)"); return; }
    if (!f.falla.trim()) { setErr("Describe la falla que reporta el cliente"); return; }
    setErr("");
    const r = await ejecutar(() => A.crearServicio({ ...f, customerName: f.customerId ? customers.find(c => c.id === f.customerId)?.name : f.customerName }), { exito: "Orden registrada" });
    if (r) { setNueva(null); setDetalleId(r.id); if (window.confirm(`Orden N° ${r.numero} registrada. ¿Imprimir el comprobante para el cliente?`)) imprimir(r); }
  };

  const filtros = [["abiertas", "En taller"], ["atrasadas", "Atrasadas"], ...ETAPAS.map(e => [e, ESTADOS_ORDEN[e]]), ["ENTREGADO", "Entregadas"], ["CANCELADO", "Canceladas"], ["todas", "Todas"]];

  return (
    <div>
      <Header title="Servicio técnico" sub="Órdenes de reparación: recepción, diagnóstico, entrega y cobro"
        action={<button onClick={() => { setErr(""); setNueva(NUEVA()); }} style={mkBtn("primary")}>+ Recibir equipo</button>} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 14 }}>
        <KPI label="En taller" value={conteo.abiertas} Icon="🔧" color={C.blue} />
        <KPI label="Listos para entregar" value={conteo.LISTO || 0} Icon="✅" color={C.green} />
        <KPI label="Atrasados" value={conteo.atrasadas} Icon="⏰" color={conteo.atrasadas ? C.red : C.green} />
        <KPI label="Entregados este mes" value={entregadasMes.length} sub={Bs(entregadasMes.reduce((a, o) => a + o.total, 0))} Icon="📦" color={C.amber} />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <SearchInput value={q} onChange={setQ} placeholder="Buscar por N°, cliente, teléfono, equipo o IMEI…" />
      </div>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 6, marginBottom: 10 }}>
        {filtros.map(([id, txt]) => (
          <button key={id} onClick={() => setFiltro(id)} style={{ ...mkBtn(filtro === id ? "primary" : "ghost"), padding: "5px 10px", fontSize: 12, flexShrink: 0 }}>
            {txt}{id === "abiertas" ? ` (${conteo.abiertas})` : id === "atrasadas" ? ` (${conteo.atrasadas})` : conteo[id] ? ` (${conteo[id]})` : ""}
          </button>
        ))}
      </div>

      {lista.length === 0 ? <Empty icon="🔧" title={ordenes.length ? "No hay órdenes en este filtro" : "Aún no hay órdenes de servicio"} sub={ordenes.length ? "Prueba con otro filtro" : "Cuando un cliente deje un equipo, regístralo con “Recibir equipo”."} />
        : <div style={{ display: "grid", gap: 8 }}>
          {pag.visibles.map(o => (
            <button key={o.id} onClick={() => setDetalleId(o.id)} style={{ ...card({ padding: "12px 14px" }), textAlign: "left", cursor: "pointer", fontFamily: "inherit", color: "var(--color-text)", display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", borderColor: atrasada(o) ? "rgba(239,68,68,0.5)" : undefined }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}><span style={{ color: C.textFaint }}>#{o.numero}</span> {o.equipo}{o.marca ? ` · ${o.marca}` : ""}{o.modelo ? ` ${o.modelo}` : ""}</div>
                <div style={{ fontSize: 12, color: C.textMid }}>{o.customerName}{o.phone ? ` · ${o.phone}` : ""} · {o.falla.length > 60 ? o.falla.slice(0, 60) + "…" : o.falla}</div>
                <div style={{ fontSize: 11, color: atrasada(o) ? C.red : C.textFaint, marginTop: 2 }}>
                  Recibido {fDate(o.recibido)}{o.prometido ? ` · entrega ${fDate(o.prometido)}` : ""}{atrasada(o) ? " · ATRASADO" : ""}{o.tecnico ? ` · ${o.tecnico}` : ""}
                </div>
              </div>
              <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                <span style={mkBadge(BADGE[o.estado])}>{ESTADOS_ORDEN[o.estado]}</span>
                {(o.total > 0 || o.presupuesto > 0) && <strong style={{ fontSize: 14 }}>{Bs(o.total || o.presupuesto)}</strong>}
              </div>
            </button>
          ))}
          <BotonMostrarMas restantes={pag.restantes} onClick={pag.mostrarMas} paso={50} />
        </div>}

      {nueva && <Modal title="Recibir equipo" onClose={() => !guardando && setNueva(null)} width={720}>
        <label style={lbl}>Cliente *</label>
        <div style={row()}>
          <select style={{ ...inp, flex: 1 }} value={nueva.customerId} onChange={e => { const c = customers.find(x => x.id === e.target.value); setNueva({ ...nueva, customerId: e.target.value, phone: c?.phone || nueva.phone }); }}>
            <option value="">Cliente nuevo / ocasional</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</option>)}
          </select>
        </div>
        {!nueva.customerId && <div style={row()}>
          <input style={{ ...inp, flex: 2 }} value={nueva.customerName} onChange={e => setNueva({ ...nueva, customerName: e.target.value })} placeholder="Nombre del cliente" />
          <input style={{ ...inp, flex: 1 }} value={nueva.phone} onChange={e => setNueva({ ...nueva, phone: e.target.value })} placeholder="Celular (para avisarle)" inputMode="tel" />
        </div>}
        <div style={{ fontSize: 11, color: C.textFaint, marginTop: -4, marginBottom: 10 }}>Para dejar saldo pendiente al entregar, el cliente debe estar registrado en Clientes.</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
          <div style={{ gridColumn: "span 2" }}><label style={lbl}>Equipo *</label><input style={inp} value={nueva.equipo} onChange={e => setNueva({ ...nueva, equipo: e.target.value })} placeholder="Ej: Celular, Laptop, Motocicleta" /></div>
          <div><label style={lbl}>Marca</label><input style={inp} value={nueva.marca} onChange={e => setNueva({ ...nueva, marca: e.target.value })} /></div>
          <div><label style={lbl}>Modelo</label><input style={inp} value={nueva.modelo} onChange={e => setNueva({ ...nueva, modelo: e.target.value })} /></div>
          <div><label style={lbl}>Serie / IMEI / Placa</label><input style={inp} value={nueva.serie} onChange={e => setNueva({ ...nueva, serie: e.target.value })} /></div>
          <div><label style={lbl}>Accesorios que deja</label><input style={inp} value={nueva.accesorios} onChange={e => setNueva({ ...nueva, accesorios: e.target.value })} placeholder="Cargador, funda…" /></div>
        </div>
        <label style={{ ...lbl, marginTop: 10 }}>Falla que reporta el cliente *</label>
        <textarea style={{ ...inp, minHeight: 60, resize: "vertical" }} value={nueva.falla} onChange={e => setNueva({ ...nueva, falla: e.target.value })} placeholder="Ej: No carga, pantalla rota, se apaga solo…" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10, marginTop: 10 }}>
          <div><label style={lbl}>Presupuesto aprox.</label><input type="number" min="0" style={inp} value={nueva.presupuesto} onChange={e => setNueva({ ...nueva, presupuesto: e.target.value })} placeholder="Opcional" /></div>
          <div><label style={lbl}>Anticipo</label><input type="number" min="0" style={inp} value={nueva.anticipo} onChange={e => setNueva({ ...nueva, anticipo: e.target.value })} placeholder="0" /></div>
          {n(nueva.anticipo) > 0 && <div><label style={lbl}>Pagó con</label><select style={inp} value={nueva.anticipoMetodo} onChange={e => setNueva({ ...nueva, anticipoMetodo: e.target.value })}>{METODOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></div>}
          <div><label style={lbl}>Entrega estimada</label><input type="date" style={inp} value={nueva.prometido} min={today()} onChange={e => setNueva({ ...nueva, prometido: e.target.value })} /></div>
          <div><label style={lbl}>Técnico</label><input style={inp} value={nueva.tecnico} onChange={e => setNueva({ ...nueva, tecnico: e.target.value })} /></div>
          <div><label style={lbl}>Garantía (días)</label><input type="number" min="0" style={inp} value={nueva.garantiaDias} onChange={e => setNueva({ ...nueva, garantiaDias: e.target.value })} placeholder="Ej: 30" /></div>
        </div>
        <label style={{ ...lbl, marginTop: 10 }}>Notas internas</label>
        <input style={inp} value={nueva.notas} onChange={e => setNueva({ ...nueva, notas: e.target.value })} placeholder="Estado físico, rayones, etc." />
        {n(nueva.anticipo) > 0 && <div style={{ fontSize: 12, color: C.textMid, marginTop: 8 }}>El anticipo entra hoy a la caja y se descontará del cobro al entregar.</div>}
        {err && <div style={{ color: C.red, fontSize: 13, marginTop: 10 }}>{err}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
          <button onClick={() => setNueva(null)} disabled={guardando} style={mkBtn("ghost")}>Cancelar</button>
          <button onClick={crear} disabled={guardando} style={mkBtn("primary")}>{guardando ? "Guardando…" : "Registrar orden"}</button>
        </div>
      </Modal>}

      {detalle && <DetalleOrden key={detalle.id} orden={detalle} productos={productos} customers={customers} A={A} config={config} user={user}
        onClose={() => setDetalleId(null)} onImprimir={imprimir} />}
    </div>
  );
}

function DetalleOrden({ orden: o, productos, customers, A, config, onClose, onImprimir }) {
  const [ejecutar, guardando] = useAccion();
  const cerrada = ["ENTREGADO", "CANCELADO"].includes(o.estado);
  const [diag, setDiag] = useState(o.diagnostico);
  const [items, setItems] = useState(o.items);
  const [tecnico, setTecnico] = useState(o.tecnico);
  const [prometido, setPrometido] = useState(o.prometido || "");
  const [agregando, setAgregando] = useState(false);
  const [repuestoId, setRepuestoId] = useState("");
  const [mo, setMo] = useState({ name: "Mano de obra", price: "" });
  const [eventos, setEventos] = useState([]);
  const [entrega, setEntrega] = useState(null); // { method, amount }
  const [cancelar, setCancelar] = useState(null); // { motivo, devolver }
  const [err, setErr] = useState("");
  useEffect(() => { A.eventosServicio(o.id).then(setEventos).catch(() => {}); }, [A, o.id, o.estado]);

  const total = items.reduce((a, i) => a + n(i.qty) * n(i.price), 0);
  const saldo = Math.max(0, total - o.anticipo);
  const cambios = diag !== o.diagnostico || tecnico !== o.tecnico || (prometido || null) !== (o.prometido || null) || JSON.stringify(items) !== JSON.stringify(o.items);
  const registrado = !!o.customerId && customers.some(c => c.id === o.customerId);

  const guardar = async () => {
    const ok = await ejecutar(() => A.actualizarServicio(o.id, { diagnostico: diag, tecnico, prometido, items }), { exito: "Orden actualizada" });
    return !!ok;
  };
  const etapa = async estado => {
    if (cambios && !(await guardar())) return;
    await ejecutar(() => A.estadoServicio(o.id, estado), { exito: `Orden en "${ESTADOS_ORDEN[estado]}"` });
  };
  const agregarRepuesto = () => {
    const p = productos.find(x => x.id === repuestoId); if (!p) return;
    setItems(it => [...it, { productId: p.id, name: p.name, qty: 1, price: p.price }]); setRepuestoId(""); setAgregando(false);
  };
  const agregarMo = () => {
    if (!mo.name.trim() || !(n(mo.price) >= 0) || mo.price === "") { toast.error("Indica la descripción y el precio"); return; }
    setItems(it => [...it, { productId: null, name: mo.name.trim(), qty: 1, price: n(mo.price) }]); setMo({ name: "Mano de obra", price: "" });
  };
  const entregar = async () => {
    setErr("");
    if (cambios && !(await guardar())) return;
    const pagos = n(entrega.amount) > 0 ? [{ amount: Math.min(n(entrega.amount), saldo), method: entrega.method }] : [];
    if (saldo - (pagos[0]?.amount || 0) > 0.005 && !registrado) { setErr("Queda saldo pendiente: registra al cliente en Clientes o cobra el total."); return; }
    const r = await ejecutar(() => A.entregarServicio(o.id, pagos), { exito: "Equipo entregado" });
    if (r) { setEntrega(null); if (window.confirm(`Entregado${r.venta ? ` · venta N° ${r.venta.numero}` : ""}. ¿Imprimir comprobante de entrega?`)) onImprimir(r.orden); }
  };
  const confirmarCancelar = async () => {
    if (!cancelar.motivo.trim()) { setErr("Indica el motivo"); return; }
    const r = await ejecutar(() => A.cancelarServicio(o.id, cancelar.motivo, cancelar.devolver), { exito: "Orden cancelada" });
    if (r) setCancelar(null);
  };
  const avisarWhatsApp = () => {
    const num = waNumero(o.phone); if (!num) { toast.error("La orden no tiene teléfono del cliente"); return; }
    const negocio = config.businessName || "el taller";
    const texto = o.estado === "LISTO"
      ? `Hola ${o.customerName}, le saluda ${negocio}. Su ${o.equipo} (orden N° ${o.numero}) ya está LISTO para recoger.${total > 0 ? ` Total: ${Bs(total)}${o.anticipo > 0 ? `, anticipo: ${Bs(o.anticipo)}, saldo: ${Bs(saldo)}` : ""}.` : ""} ¡Lo esperamos!`
      : o.estado === "ESPERA_APROBACION"
        ? `Hola ${o.customerName}, le saluda ${negocio}. Revisamos su ${o.equipo} (orden N° ${o.numero}).${diag ? ` Diagnóstico: ${diag}.` : ""}${total > 0 ? ` El costo de la reparación es ${Bs(total)}.` : ""} ¿Desea que procedamos?`
        : `Hola ${o.customerName}, le saluda ${negocio}. Su ${o.equipo} (orden N° ${o.numero}) está: ${ESTADOS_ORDEN[o.estado]}.`;
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
  };

  return (
    <Modal title={`Orden N° ${o.numero} · ${o.equipo}`} onClose={onClose} width={760}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ fontSize: 13, lineHeight: 1.6 }}>
          <div><strong>{o.customerName}</strong>{o.phone ? ` · ${o.phone}` : ""}</div>
          <div style={{ color: C.textMid }}>{[o.marca, o.modelo].filter(Boolean).join(" ")}{o.serie ? ` · Serie/IMEI ${o.serie}` : ""}{o.accesorios ? ` · Deja: ${o.accesorios}` : ""}</div>
          <div style={{ color: C.textFaint, fontSize: 12 }}>Recibido {fDateTime(o.recibido)} por {o.usuario || "—"}</div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "flex-start", flexWrap: "wrap" }}>
          <span style={mkBadge(BADGE[o.estado])}>{ESTADOS_ORDEN[o.estado]}</span>
          <button onClick={() => onImprimir({ ...o, items, total, diagnostico: diag })} style={{ ...mkBtn("ghost"), padding: "5px 10px", fontSize: 12 }}><Printer size={13} /> Comprobante</button>
          {o.phone && <button onClick={avisarWhatsApp} style={{ ...mkBtn("ghost"), padding: "5px 10px", fontSize: 12, color: "#25D366" }}><MessageCircle size={13} /> Avisar</button>}
        </div>
      </div>

      <div style={{ padding: 10, borderRadius: 10, background: "var(--color-bg-primary)", fontSize: 13, marginBottom: 12 }}><strong>Falla reportada:</strong> {o.falla}{o.notas ? <div style={{ color: C.textFaint, fontSize: 12, marginTop: 4 }}>Notas: {o.notas}</div> : null}</div>

      {!cerrada && <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {ETAPAS.map(e => <button key={e} onClick={() => e !== o.estado && etapa(e)} disabled={guardando} style={{ ...mkBtn(e === o.estado ? "primary" : "ghost"), padding: "5px 10px", fontSize: 12 }}>{ESTADOS_ORDEN[e]}</button>)}
      </div>}

      <label style={lbl}>Diagnóstico</label>
      <textarea style={{ ...inp, minHeight: 50, resize: "vertical" }} value={diag} disabled={cerrada} onChange={e => setDiag(e.target.value)} placeholder="Qué tiene el equipo y qué se va a hacer" />
      <div style={{ ...row(), marginTop: 8 }}>
        <div style={{ flex: 1 }}><label style={lbl}>Técnico</label><input style={inp} value={tecnico} disabled={cerrada} onChange={e => setTecnico(e.target.value)} /></div>
        <div style={{ flex: 1 }}><label style={lbl}>Entrega estimada</label><input type="date" style={inp} value={prometido} disabled={cerrada} onChange={e => setPrometido(e.target.value)} /></div>
      </div>

      <label style={lbl}>Repuestos y mano de obra</label>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 8 }}>
        {items.length === 0 && <div style={{ padding: 10, fontSize: 12, color: C.textFaint }}>Aún no hay repuestos ni mano de obra.{o.presupuesto > 0 ? ` Presupuesto inicial: ${Bs(o.presupuesto)}.` : ""}</div>}
        {items.map((i, k) => (
          <div key={k} style={{ display: "flex", gap: 6, alignItems: "center", padding: "6px 8px", borderTop: k ? `1px solid ${C.border}` : "none", fontSize: 13 }}>
            <span style={{ flex: 1, minWidth: 0 }}>{i.productId ? "🔩 " : "🛠 "}{i.name}</span>
            <input type="number" min="0" step="any" disabled={cerrada} value={i.qty} onChange={e => setItems(it => it.map((x, j) => (j === k ? { ...x, qty: e.target.value } : x)))} style={{ ...inp, width: 60, padding: "4px 6px" }} aria-label="Cantidad" />
            <input type="number" min="0" step="0.01" disabled={cerrada} value={i.price} onChange={e => setItems(it => it.map((x, j) => (j === k ? { ...x, price: e.target.value } : x)))} style={{ ...inp, width: 86, padding: "4px 6px" }} aria-label="Precio" />
            <strong style={{ width: 80, textAlign: "right" }}>{Bs(n(i.qty) * n(i.price))}</strong>
            {!cerrada && <button onClick={() => setItems(it => it.filter((_, j) => j !== k))} aria-label="Quitar" style={{ background: "none", border: "none", color: C.red, cursor: "pointer" }}><Trash2 size={14} /></button>}
          </div>
        ))}
      </div>
      {!cerrada && <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
        {agregando ? <div style={{ padding: 10, borderRadius: 10, background: "var(--color-bg-primary)" }}>
          <SelectorProducto products={productos} value={repuestoId} onChange={setRepuestoId} autoFocus />
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 8 }}>
            <button onClick={() => setAgregando(false)} style={mkBtn("ghost")}>Cancelar</button>
            <button onClick={agregarRepuesto} disabled={!repuestoId} style={mkBtn("primary")}>Agregar repuesto</button>
          </div>
        </div> : <button onClick={() => setAgregando(true)} style={{ ...mkBtn("ghost"), justifySelf: "start" }}><Plus size={13} /> Repuesto del inventario</button>}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <input style={{ ...inp, flex: "2 1 160px" }} value={mo.name} onChange={e => setMo({ ...mo, name: e.target.value })} placeholder="Mano de obra / servicio" />
          <input type="number" min="0" style={{ ...inp, flex: "1 1 90px" }} value={mo.price} onChange={e => setMo({ ...mo, price: e.target.value })} placeholder="Precio" onKeyDown={e => e.key === "Enter" && agregarMo()} />
          <button onClick={agregarMo} style={mkBtn("ghost")}><Plus size={13} /> Agregar</button>
        </div>
      </div>}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 16, fontSize: 14, marginBottom: 12, flexWrap: "wrap" }}>
        <span>Total: <strong>{Bs(total)}</strong></span>
        {o.anticipo > 0 && <span>Anticipo: <strong style={{ color: C.green }}>{Bs(o.anticipo)}</strong></span>}
        {!cerrada && <span>Saldo: <strong style={{ color: saldo > 0 ? C.red : C.green }}>{Bs(saldo)}</strong></span>}
      </div>

      {err && <div style={{ color: C.red, fontSize: 13, marginBottom: 10 }}>{err}</div>}
      {!cerrada && !entrega && !cancelar && <div style={{ display: "flex", gap: 8, justifyContent: "space-between", flexWrap: "wrap" }}>
        <button onClick={() => { setErr(""); setCancelar({ motivo: "", devolver: o.anticipo > 0 }); }} style={mkBtn("danger")}>Cancelar orden</button>
        <div style={{ display: "flex", gap: 8 }}>
          {cambios && <button onClick={guardar} disabled={guardando} style={mkBtn("ghost")}>{guardando ? "Guardando…" : "Guardar cambios"}</button>}
          <button onClick={() => { setErr(""); setEntrega({ method: "efectivo", amount: saldo.toFixed(2) }); }} style={mkBtn("primary")}>✓ Entregar y cobrar</button>
        </div>
      </div>}

      {entrega && <div style={{ padding: 12, borderRadius: 10, border: `1px solid ${C.border}`, marginTop: 4 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Entregar equipo · saldo {Bs(saldo)}</div>
        {total === 0 && <div style={{ fontSize: 12, color: C.textMid, marginBottom: 8 }}>La orden no tiene costo: se entregará sin registrar venta (por ejemplo, una garantía).</div>}
        {saldo > 0 && <div style={row()}>
          <div style={{ flex: 1 }}><label style={lbl}>Cobra ahora</label><input type="number" min="0" style={inp} value={entrega.amount} onChange={e => setEntrega({ ...entrega, amount: e.target.value })} /></div>
          <div style={{ flex: 1 }}><label style={lbl}>Método</label><select style={inp} value={entrega.method} onChange={e => setEntrega({ ...entrega, method: e.target.value })}>{METODOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></div>
        </div>}
        <div style={{ fontSize: 12, color: C.textFaint, marginBottom: 8 }}>Se registra una venta por {Bs(total)}{o.anticipo > 0 ? ` (el anticipo de ${Bs(o.anticipo)} ya está en caja)` : ""}; los repuestos del inventario descuentan stock.</div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={() => setEntrega(null)} style={mkBtn("ghost")}>Volver</button>
          <button onClick={entregar} disabled={guardando} style={mkBtn("primary")}>{guardando ? "Entregando…" : "Confirmar entrega"}</button>
        </div>
      </div>}

      {cancelar && <div style={{ padding: 12, borderRadius: 10, border: "1px solid rgba(239,68,68,0.4)", marginTop: 4 }}>
        <label style={lbl}>Motivo de la cancelación *</label>
        <input style={inp} value={cancelar.motivo} onChange={e => setCancelar({ ...cancelar, motivo: e.target.value })} placeholder="Ej: el cliente no aceptó el presupuesto" />
        {o.anticipo > 0 && <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, marginTop: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={cancelar.devolver} onChange={e => setCancelar({ ...cancelar, devolver: e.target.checked })} /> Devolver el anticipo de {Bs(o.anticipo)} (sale de caja)
        </label>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
          <button onClick={() => setCancelar(null)} style={mkBtn("ghost")}>Volver</button>
          <button onClick={confirmarCancelar} disabled={guardando} style={mkBtn("danger")}>Cancelar orden</button>
        </div>
      </div>}

      {eventos.length > 0 && <div style={{ marginTop: 14 }}>
        <label style={lbl}>Historial</label>
        <div style={{ display: "grid", gap: 4 }}>
          {eventos.map((ev, k) => <div key={k} style={{ fontSize: 12, color: C.textMid }}>{fDateTime(ev.created_at)} · <strong>{ESTADOS_ORDEN[ev.estado] || ev.estado}</strong>{ev.nota ? ` · ${ev.nota}` : ""}{ev.usuario_nombre ? ` · ${ev.usuario_nombre}` : ""}</div>)}
        </div>
      </div>}
    </Modal>
  );
}
