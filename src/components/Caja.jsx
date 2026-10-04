import { useState } from "react";
import toast from "react-hot-toast";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { n, today, fDate, fDateTime, isAdmin, filterByPeriod, isWithinPeriod, getSalePayments, buildCashChart, PERIOD_OPTIONS } from "../utils/businessLogic.js";
import { Bs } from "../currency.js";
import { xlsx } from "../utils/xlsxExport.js";
import { C } from "../theme.jsx";
import { card, lbl, inp, row, mkBtn, mkBadge } from "../styles.js";
import { useAccion } from "../hooks/useAccion.js";
import { KPI } from "./ui/KPI.jsx";
import { Header } from "./ui/Header.jsx";
import { Chip } from "./ui/Chip.jsx";
import { SearchInput } from "./ui/SearchInput.jsx";
import { Empty } from "./ui/Empty.jsx";
import { Modal } from "./ui/Modal.jsx";
import { Table } from "./ui/Table.jsx";

export const CATEGORIAS_CAJA = {
  ingreso: ["Aporte de capital", "Cambio / sencillo", "Devolución de proveedor", "Otro ingreso"],
  gasto: ["Compras / mercadería", "Transporte", "Sueldos", "Alquiler", "Energía", "Servicios", "Mantenimiento", "Marketing", "Impuestos", "Otro gasto"],
};
const METODO_TXT = { QR: "QR", TRANSFERENCIA: "Transferencia", TARJETA: "Tarjeta", MIXTO: "Mixto", CREDITO: "Crédito" };
const FORM_VACIO = { type: "gasto", category: "", description: "", amount: "", date: "", notes: "" };

export function Caja({ D, A, user }) {
  const { expenses, sales, caja } = D;
  const [modal, setModal] = useState(false); const [cajaModal, setCajaModal] = useState(null);
  const [filter, setFilter] = useState("all"); const [q, setQ] = useState(""); const [period, setPeriod] = useState("month");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [form, setForm] = useState({ ...FORM_VACIO, date: today() });
  const [cajaForm, setCajaForm] = useState({ amount: "", notes: "" });
  const [historial, setHistorial] = useState(null);
  const [err, setErr] = useState("");
  const [ejecutar, guardando] = useAccion();
  const admin = isAdmin(user) || user?.role === "superadmin";

  const turno = caja?.turno || null;
  const abierta = turno?.estado === "ABIERTO";
  const esperado = n(caja?.esperado);

  // Flujo por periodo (todas las formas de pago)
  const gastosPeriodo = filterByPeriod(expenses, period, e => e.date);
  const cobrado = getSalePayments(sales.filter(s => !s.anulada)).filter(p => isWithinPeriod(p.date, period)).reduce((a, p) => a + p.amount, 0);
  const otrosIngresos = gastosPeriodo.filter(e => e.type === "ingreso").reduce((a, e) => a + e.amount, 0);
  const egresos = gastosPeriodo.filter(e => e.type === "gasto").reduce((a, e) => a + e.amount, 0);
  const balance = cobrado + otrosIngresos - egresos;
  const cashChart = buildCashChart(sales.filter(s => !s.anulada), expenses, period);
  const filtered = gastosPeriodo
    .filter(e => (filter === "all" || e.type === filter) && `${e.description} ${e.category}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const doSave = async () => {
    if (!form.description.trim()) { setErr("Escribe una descripción"); return; }
    if (n(form.amount) <= 0) { setErr("El monto debe ser mayor a 0"); return; }
    setErr("");
    const ok = await ejecutar(() => A.registrarGasto({ ...form, amount: n(form.amount), category: form.category || (form.type === "ingreso" ? "Otro ingreso" : "Otro gasto") }),
      { exito: form.type === "ingreso" ? "Ingreso registrado" : "Gasto registrado" });
    if (ok) { setModal(false); setForm({ ...FORM_VACIO, date: today() }); }
  };
  const doAbrir = async () => {
    if (cajaForm.amount === "" || n(cajaForm.amount) < 0) { setErr("Ingresa el fondo inicial (puede ser 0)"); return; }
    setErr("");
    const ok = await ejecutar(() => A.abrirCaja(n(cajaForm.amount), cajaForm.notes), { exito: "Caja abierta" });
    if (ok) { setCajaModal(null); setCajaForm({ amount: "", notes: "" }); }
  };
  const doCerrar = async () => {
    if (cajaForm.amount === "" || n(cajaForm.amount) < 0) { setErr("Ingresa el efectivo contado"); return; }
    setErr("");
    const r = await ejecutar(() => A.cerrarCaja(n(cajaForm.amount), cajaForm.notes));
    if (r) {
      setCajaModal(null); setCajaForm({ amount: "", notes: "" });
      const dif = n(r.turno?.diferencia);
      if (Math.abs(dif) < 0.005) toast.success("Caja cerrada. El efectivo cuadra.");
      else toast(`Caja cerrada con ${dif > 0 ? "sobrante" : "faltante"} de ${Bs(Math.abs(dif))}`, { icon: "⚠️", duration: 7000 });
    }
  };
  const doDelete = async () => {
    const ok = await ejecutar(() => A.eliminarGasto(deleteTarget.id), { exito: "Movimiento eliminado" });
    if (ok) setDeleteTarget(null);
  };
  const verHistorial = async () => {
    const r = await ejecutar(() => A.historialCaja());
    if (r) setHistorial(r);
  };
  const exportar = () => xlsx([{ name: "Caja", data: filtered.map(e => ({ Fecha: fDate(e.date), Tipo: e.type === "ingreso" ? "Ingreso" : "Gasto", Categoría: e.category, Descripción: e.description, Responsable: e.responsable || "—", Monto: e.amount })) }], "caja.xlsx");

  const resumenFilas = caja ? [
    ["Fondo inicial", Bs(n(turno?.fondo_inicial)), C.textMid],
    ["Ventas en efectivo", `+${Bs(n(caja.ventas_efectivo))}`, C.green],
    ["Otros ingresos en efectivo", `+${Bs(n(caja.ingresos_efectivo))}`, C.green],
    ["Gastos en efectivo", `-${Bs(n(caja.egresos_efectivo))}`, C.red],
    ["Efectivo esperado", Bs(esperado), esperado >= 0 ? C.green : C.red],
  ] : [];
  const otrosMetodos = Object.entries(caja?.ventas_otros_metodos || {});

  return (
    <div>
      <Header title="Caja" sub="Turnos, arqueo y flujo de dinero" action={<>
        <button onClick={verHistorial} style={mkBtn("ghost")}>🕘 Turnos</button>
        <button onClick={exportar} style={mkBtn("ghost")}>⬇️ Exportar</button>
        {abierta
          ? <button onClick={() => { setErr(""); setCajaForm({ amount: "", notes: "" }); setCajaModal("cierre"); }} style={mkBtn("danger")}>⏹ Cerrar caja</button>
          : <button onClick={() => { setErr(""); setCajaForm({ amount: "", notes: "" }); setCajaModal("apertura"); }} style={mkBtn("success")}>▶ Abrir caja</button>}
        <button onClick={() => { setErr(""); setModal(true); }} style={mkBtn("primary")}>+ Movimiento</button>
      </>} />

      <div style={{ ...card({ marginBottom: 14, borderLeft: `3px solid ${abierta ? C.green : C.borderMid}` }), background: abierta ? C.greenBg : C.bg }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: abierta ? C.green : C.textMid }}>{abierta ? "● Caja abierta" : "○ Caja cerrada"}</div>
            {abierta
              ? <div style={{ fontSize: 12, color: C.textMid, marginTop: 2 }}>Desde {fDateTime(turno.abierto_at)} · {turno.abierto_por_nombre || "—"} · {caja.num_ventas} venta{caja.num_ventas !== 1 ? "s" : ""} en el turno</div>
              : <div style={{ fontSize: 12, color: C.textMid, marginTop: 2 }}>Abre la caja al iniciar el día para controlar el efectivo de cada turno.</div>}
          </div>
          {abierta && <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: C.textFaint }}>Efectivo esperado en caja</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: esperado >= 0 ? C.green : C.red, letterSpacing: "-0.03em" }}>{Bs(esperado)}</div>
            {otrosMetodos.length > 0 && <div style={{ fontSize: 11, color: C.textFaint }}>Además: {otrosMetodos.map(([m, v]) => `${METODO_TXT[m] || m} ${Bs(v)}`).join(" · ")}</div>}
          </div>}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10, marginBottom: 14 }}>
        <KPI label="Cobrado en ventas" value={Bs(cobrado)} Icon="🛒" color={C.green} />
        <KPI label="Otros ingresos" value={Bs(otrosIngresos)} Icon="💵" color={C.blue} />
        <KPI label="Gastos" value={Bs(egresos)} Icon="📤" color={C.red} />
        <KPI label="Balance" value={Bs(balance)} Icon="💰" color={balance >= 0 ? C.green : C.red} />
      </div>

      <div style={{ ...card(), marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>Flujo por periodo</div>
          <Chip value={period} onChange={setPeriod} options={PERIOD_OPTIONS} />
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={cashChart} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => Bs(v)} width={70} />
            <Tooltip formatter={(v, nm) => [Bs(v), nm]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
            <Legend iconSize={9} wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="ingresos" name="Ingresos" fill={C.green} radius={[4, 4, 0, 0]} />
            <Bar dataKey="gastos" name="Gastos" fill={C.red} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <SearchInput value={q} onChange={setQ} placeholder="Buscar movimiento..." />
        <Chip value={filter} onChange={setFilter} options={[["all", "Todos"], ["ingreso", "Ingresos"], ["gasto", "Gastos"]]} />
      </div>

      <div style={card()}>
        {filtered.length === 0 ? <Empty icon="💰" title="Sin movimientos en este periodo" sub="Registra ingresos y gastos con el botón + Movimiento" /> :
          <Table cols={[
            { key: "date", label: "Fecha", render: v => fDate(v) },
            { key: "type", label: "Tipo", render: v => <span style={mkBadge(v === "ingreso" ? "green" : "red")}>{v === "ingreso" ? "↑ Ingreso" : "↓ Gasto"}</span> },
            { key: "category", label: "Categoría" },
            { key: "description", label: "Descripción" },
            { key: "responsable", label: "Registró", render: v => v || "—" },
            { key: "amount", label: "Monto", render: (v, r) => <strong style={{ color: r.type === "ingreso" ? C.green : C.red }}>{r.type === "ingreso" ? "+" : "-"}{Bs(v)}</strong> },
            { key: "id", label: "", render: (_, r) => admin ? <button onClick={ev => { ev.stopPropagation(); setDeleteTarget(r); }} aria-label="Eliminar" style={{ ...mkBtn("danger"), padding: "4px 8px", fontSize: 11 }}>×</button> : null },
          ]} rows={filtered} />}
      </div>

      {cajaModal === "apertura" && <Modal title="▶ Abrir caja" onClose={() => setCajaModal(null)} width={420}>
        <div style={{ fontSize: 13, color: C.textMid, marginBottom: 14 }}>Cuenta el efectivo con el que empiezas el turno. Puede ser 0.</div>
        <div style={{ marginBottom: 10 }}><label style={lbl}>Fondo inicial *</label><input type="number" min="0" step="0.01" inputMode="decimal" style={inp} value={cajaForm.amount} onChange={e => setCajaForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" autoFocus /></div>
        <div style={{ marginBottom: 14 }}><label style={lbl}>Observaciones</label><input style={inp} value={cajaForm.notes} onChange={e => setCajaForm(f => ({ ...f, notes: e.target.value }))} placeholder="Turno mañana, cajero, etc." /></div>
        {err && <div style={{ color: C.red, fontSize: 13, marginBottom: 10 }}>{err}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={() => setCajaModal(null)} style={mkBtn("ghost")}>Cancelar</button>
          <button onClick={doAbrir} disabled={guardando} style={mkBtn("success")}>{guardando ? "Abriendo…" : "▶ Abrir caja"}</button>
        </div>
      </Modal>}

      {cajaModal === "cierre" && <Modal title="⏹ Cerrar caja — Arqueo" onClose={() => setCajaModal(null)} width={460}>
        <div style={{ ...card({ marginBottom: 14, background: C.bg }) }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Resumen del turno</div>
          <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 8 }}>Solo cuenta lo ocurrido desde que se abrió la caja ({fDateTime(turno?.abierto_at)}).</div>
          {resumenFilas.map(([l, v, c]) => (
            <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${C.border}`, fontSize: 13 }}>
              <span style={{ color: C.textMid }}>{l}</span><span style={{ fontWeight: 700, color: c }}>{v}</span>
            </div>
          ))}
          {otrosMetodos.length > 0 && <div style={{ fontSize: 11, color: C.textFaint, marginTop: 8 }}>No van en el cajón: {otrosMetodos.map(([m, v]) => `${METODO_TXT[m] || m} ${Bs(v)}`).join(" · ")}</div>}
        </div>
        <div style={{ marginBottom: 10 }}><label style={lbl}>Efectivo contado *</label><input type="number" min="0" step="0.01" inputMode="decimal" style={inp} value={cajaForm.amount} onChange={e => setCajaForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" autoFocus /></div>
        {cajaForm.amount !== "" && (() => { const d = n(cajaForm.amount) - esperado; const okd = Math.abs(d) < 0.005; return (
          <div style={{ ...card({ marginBottom: 10, background: okd ? C.greenBg : d > 0 ? C.amberBg : C.redBg }) }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: okd ? C.green : d > 0 ? C.amber : C.red }}>{okd ? "✓ El efectivo cuadra" : `Diferencia: ${Bs(d)} ${d > 0 ? "(sobrante)" : "(faltante)"}`}</div>
          </div>); })()}
        <div style={{ marginBottom: 14 }}><label style={lbl}>Observaciones</label><input style={inp} value={cajaForm.notes} onChange={e => setCajaForm(f => ({ ...f, notes: e.target.value }))} placeholder="Notas del cierre…" /></div>
        {err && <div style={{ color: C.red, fontSize: 13, marginBottom: 10 }}>{err}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={() => setCajaModal(null)} style={mkBtn("ghost")}>Cancelar</button>
          <button onClick={doCerrar} disabled={guardando} style={mkBtn("danger")}>{guardando ? "Cerrando…" : "⏹ Cerrar caja"}</button>
        </div>
      </Modal>}

      {historial && <Modal title="Historial de turnos" onClose={() => setHistorial(null)} width={720}>
        {historial.length === 0 ? <div style={{ fontSize: 13, color: C.textFaint }}>Aún no hay turnos registrados.</div> :
          <Table cols={[
            { key: "abierto_at", label: "Apertura", render: v => fDateTime(v) },
            { key: "abierto_por_nombre", label: "Abrió", render: v => v || "—" },
            { key: "cerrado_at", label: "Cierre", render: v => (v ? fDateTime(v) : <span style={mkBadge("green")}>Abierta</span>) },
            { key: "fondo_inicial", label: "Fondo", render: v => Bs(n(v)) },
            { key: "esperado", label: "Esperado", render: v => (v == null ? "—" : Bs(n(v))) },
            { key: "arqueo", label: "Contado", render: v => (v == null ? "—" : Bs(n(v))) },
            { key: "diferencia", label: "Diferencia", render: v => (v == null ? "—" : <strong style={{ color: Math.abs(n(v)) < 0.005 ? C.green : n(v) > 0 ? C.amber : C.red }}>{Bs(n(v))}</strong>) },
          ]} rows={historial} />}
      </Modal>}

      {deleteTarget && <Modal title="Eliminar movimiento" onClose={() => setDeleteTarget(null)} width={420}>
        <div style={{ fontSize: 13, color: C.textMid, marginBottom: 16 }}>¿Eliminar <strong>{deleteTarget.description}</strong> por {Bs(deleteTarget.amount)}? Esta acción no se puede deshacer.</div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={() => setDeleteTarget(null)} style={mkBtn("ghost")}>Cancelar</button>
          <button onClick={doDelete} disabled={guardando} style={mkBtn("danger")}>{guardando ? "Eliminando…" : "Eliminar"}</button>
        </div>
      </Modal>}

      {modal && <Modal title="Registrar movimiento de caja" onClose={() => setModal(false)}>
        <div style={{ marginBottom: 12 }}>
          <label style={lbl}>Tipo</label>
          <div style={{ display: "flex", gap: 6 }}>
            {[["ingreso", "↑ Ingreso", "success"], ["gasto", "↓ Gasto", "danger"]].map(([v, l, c]) => <button key={v} onClick={() => setForm({ ...form, type: v, category: "" })} style={{ ...mkBtn(form.type === v ? c : "ghost"), flex: 1, justifyContent: "center" }}>{l}</button>)}
          </div>
        </div>
        <div style={row()}>
          <div style={{ flex: 1 }}><label style={lbl}>Categoría</label>
            <select style={inp} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
              <option value="">Seleccionar...</option>
              {CATEGORIAS_CAJA[form.type].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}><label style={lbl}>Fecha</label><input type="date" style={inp} value={form.date} max={today()} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
        </div>
        <div style={{ marginBottom: 10 }}><label style={lbl}>Descripción *</label><input style={inp} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Ej: Pago de luz" autoFocus /></div>
        <div style={row()}>
          <div style={{ flex: 1 }}><label style={lbl}>Monto *</label><input type="number" min="0" step="0.01" inputMode="decimal" style={inp} value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="0.00" /></div>
          <div style={{ flex: 1 }}><label style={lbl}>Notas</label><input style={inp} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        {abierta && <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 8 }}>Se registrará en el turno de caja abierto (en efectivo).</div>}
        {err && <div style={{ color: C.red, fontSize: 13, marginBottom: 10 }}>{err}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 }}>
          <button onClick={() => setModal(false)} style={mkBtn("ghost")}>Cancelar</button>
          <button onClick={doSave} disabled={guardando} style={mkBtn("primary")}>{guardando ? "Guardando…" : "Guardar"}</button>
        </div>
      </Modal>}
    </div>
  );
}
