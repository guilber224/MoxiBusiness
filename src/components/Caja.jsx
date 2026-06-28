import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { gastosService } from "../services/gastosService.js";
import { isSupabaseUUID } from "../utils/storageScope.js";
import { n, today, fDate, isAdmin, filterByPeriod, isWithinPeriod, getSalePayments, buildCashChart, PERIOD_OPTIONS } from "../utils/businessLogic.js";
import { Bs } from "../currency.js";
import { generateId } from "../empresaScope.js";
import { xlsx } from "../utils/xlsxExport.js";
import { C, R } from "../theme.jsx";
import { card, lbl, inp, row, mkBtn, mkBadge } from "../styles.js";
import { KPI } from "./ui/KPI.jsx";
import { Header } from "./ui/Header.jsx";
import { Chip } from "./ui/Chip.jsx";
import { SearchInput } from "./ui/SearchInput.jsx";
import { Empty } from "./ui/Empty.jsx";
import { Modal } from "./ui/Modal.jsx";
import { Table } from "./ui/Table.jsx";

export function Caja({ D, save, user, logAction, onRefreshDashboard }) {
  const { expenses, sales } = D;
  const [modal, setModal] = useState(false); const [cajaModal, setCajaModal] = useState(null);
  const [filter, setFilter] = useState("all"); const [q, setQ] = useState(""); const [period, setPeriod] = useState("month"); const [deleteTarget, setDeleteTarget] = useState(null);
  const [form, setForm] = useState({ type: "gasto", category: "", description: "", amount: "", date: today(), notes: "" });
  const [cajaForm, setCajaForm] = useState({ amount: "", notes: "" });
  const CATS2 = { ingreso: ["Cobro de deuda", "Venta directa", "Otro ingreso"], gasto: ["Compras / mercadería", "Transporte", "Sueldos", "Alquiler", "Energía", "Servicios", "Mantenimiento", "Otro gasto"] };
  const canDeleteCash = isAdmin(user);

  const cajaSorted = [...expenses].filter(e => e.type === "apertura_caja" || e.type === "cierre_caja").sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const lastCajaEvt = cajaSorted[0];
  const cajaAbierta = lastCajaEvt?.type === "apertura_caja";
  const montoApertura = lastCajaEvt?.amount || 0;

  const filteredExpensesByPeriod = filterByPeriod(expenses, period, item => item.date);
  const salesIncome = getSalePayments(sales).filter(payment => isWithinPeriod(payment.date, period)).reduce((a, payment) => a + payment.amount, 0);
  const regIncome = filteredExpensesByPeriod.filter(e => e.type === "ingreso").reduce((a, e) => a + e.amount, 0);
  const totalExpense = filteredExpensesByPeriod.filter(e => e.type === "gasto").reduce((a, e) => a + e.amount, 0);
  const balance = salesIncome + regIncome - totalExpense;
  const fondoEsperado = montoApertura + salesIncome + regIncome - totalExpense;

  const doSave = async () => {
    if (!form.description || !form.amount) return;
    const entry = { ...form, id: generateId(), amount: n(form.amount), responsable: user.name, createdAt: new Date().toISOString(), usuario_id: user.id };
    const saved = await gastosService.createGasto(entry, user.empresa_id).catch(e => ({ _localOnly: true, error: e.message }));
    if (saved?._localOnly && isSupabaseUUID(user?.empresa_id)) {
      alert("⚠ Error Supabase al guardar el movimiento de caja. No se guardó — revisa tu conexión e intenta de nuevo.");
      return;
    }
    save("expenses", [entry, ...expenses]);
    logAction?.(`${user.name} registró un ${form.type === "ingreso" ? "ingreso" : "egreso"} de ${Bs(form.amount)} en caja`);
    setModal(false); setForm({ type: "gasto", category: "", description: "", amount: "", date: today(), notes: "" });
  };

  const doAbrirCaja = async () => {
    if (!cajaForm.amount && cajaForm.amount !== "0") return;
    const entry = { id: generateId(), type: "apertura_caja", category: "Apertura de caja", description: `Apertura de caja — fondo inicial: ${Bs(n(cajaForm.amount))}`, amount: n(cajaForm.amount), responsable: user.name, notes: cajaForm.notes, date: today(), createdAt: new Date().toISOString(), usuario_id: user.id };
    const saved = await gastosService.createGasto(entry, user.empresa_id).catch(e => ({ _localOnly: true, error: e.message }));
    if (saved?._localOnly && isSupabaseUUID(user?.empresa_id)) {
      alert("⚠ Error Supabase al abrir la caja. No se guardó — revisa tu conexión e intenta de nuevo.");
      return;
    }
    save("expenses", [entry, ...expenses]);
    logAction?.(`${user.name} abrió la caja con fondo de ${Bs(n(cajaForm.amount))}`);
    setCajaModal(null); setCajaForm({ amount: "", notes: "" });
  };

  const doCerrarCaja = async () => {
    const arqueo = n(cajaForm.amount);
    const diferencia = arqueo - fondoEsperado;
    const entry = { id: generateId(), type: "cierre_caja", category: "Cierre de caja", description: `Cierre de caja — arqueo: ${Bs(arqueo)} | esperado: ${Bs(fondoEsperado)} | diferencia: ${Bs(diferencia)}`, amount: arqueo, responsable: user.name, notes: cajaForm.notes, date: today(), createdAt: new Date().toISOString(), usuario_id: user.id };
    const saved = await gastosService.createGasto(entry, user.empresa_id).catch(e => ({ _localOnly: true, error: e.message }));
    if (saved?._localOnly && isSupabaseUUID(user?.empresa_id)) {
      alert("⚠ Error Supabase al cerrar la caja. No se guardó — revisa tu conexión e intenta de nuevo.");
      return;
    }
    save("expenses", [entry, ...expenses]);
    logAction?.(`${user.name} cerró la caja. Arqueo: ${Bs(arqueo)}, diferencia: ${Bs(diferencia)}`);
    setCajaModal(null); setCajaForm({ amount: "", notes: "" });
  };

  const filtered = filteredExpensesByPeriod.filter(e => { const mf = filter === "all" || e.type === filter || ((e.type === "apertura_caja" || e.type === "cierre_caja") && filter === "all"); const ms = `${e.description} ${e.category}`.toLowerCase().includes(q.toLowerCase()); return mf && ms && e.type !== "apertura_caja" && e.type !== "cierre_caja"; }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const cashChart = buildCashChart(sales, expenses, period);

  const removeExpense = async () => {
    if (!deleteTarget) return;
    const res = await gastosService.deleteGasto(deleteTarget.id, user.empresa_id).catch(e => ({ ok: false, error: e.message }));
    if (res?.ok === false) {
      alert("⚠ No se pudo eliminar el movimiento de caja en Supabase. Revisa tu conexión e intenta de nuevo.");
      setDeleteTarget(null);
      return;
    }
    save("expenses", expenses.filter(item => item.id !== deleteTarget.id));
    logAction?.(`${user.name} eliminó un movimiento de caja por ${Bs(deleteTarget.amount)}`);
    onRefreshDashboard?.();
    setDeleteTarget(null);
  };

  return (
    <div>
      <Header title="Caja Empresarial" sub="Control de flujo, apertura y cierre de caja" action={<>
        <button onClick={async () => { await xlsx([{ name: "Caja", data: expenses.filter(e => e.type !== "apertura_caja" && e.type !== "cierre_caja").map(e => ({ Fecha: fDate(e.date), Tipo: e.type === "ingreso" ? "Ingreso" : "Gasto", Categoría: e.category, Descripción: e.description, Responsable: e.responsable || "—", "Monto(Bs)": e.amount.toFixed(2) })) }], "caja_moxi_business.xlsx"); }} style={mkBtn("ghost")}>⬇️ Exportar</button>
        {cajaAbierta
          ? <button onClick={() => { setCajaForm({ amount: "", notes: "" }); setCajaModal("cierre"); }} style={{ ...mkBtn("danger") }}>⏹ Cerrar caja</button>
          : <button onClick={() => { setCajaForm({ amount: "", notes: "" }); setCajaModal("apertura"); }} style={{ ...mkBtn("success") }}>▶ Abrir caja</button>
        }
        <button onClick={() => setModal(true)} style={mkBtn("primary")}>+ Movimiento</button>
      </>} />

      <div style={{ ...card({ marginBottom: 14, borderLeft: `3px solid ${cajaAbierta ? C.green : C.borderMid}` }), background: cajaAbierta ? C.greenBg : C.bg }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: cajaAbierta ? C.green : C.textMid }}>{cajaAbierta ? "● Caja abierta" : "○ Caja cerrada"}</div>
            {cajaAbierta && <div style={{ fontSize: 12, color: C.textMid, marginTop: 2 }}>Fondo inicial: {Bs(montoApertura)} · Responsable: {lastCajaEvt?.responsable || "—"} · {fDate(lastCajaEvt?.createdAt)}</div>}
          </div>
          {cajaAbierta && <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: C.textFaint }}>Fondo esperado en caja</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: fondoEsperado >= 0 ? C.green : C.red, letterSpacing: "-0.03em" }}>{Bs(fondoEsperado)}</div>
          </div>}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10, marginBottom: 14 }}>
        <KPI label="Cobrado en ventas" value={Bs(salesIncome)} Icon="🛒" color={C.green} />
        <KPI label="Otros ingresos" value={Bs(regIncome)} Icon="💵" color={C.blue} />
        <KPI label="Total egresos" value={Bs(totalExpense)} Icon="📤" color={C.red} />
        <KPI label="Balance neto" value={Bs(balance)} Icon="💰" color={balance >= 0 ? C.green : C.red} />
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
            <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `Bs.${v}`} />
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
        {filtered.length === 0 ? <Empty icon="💰" title="Sin movimientos" sub="Registra ingresos y gastos del negocio" /> :
          <Table cols={[
            { key: "date", label: "Fecha", render: v => fDate(v) },
            { key: "type", label: "Tipo", render: v => <span style={mkBadge(v === "ingreso" ? "green" : "red")}>{v === "ingreso" ? "↑ Ingreso" : "↓ Gasto"}</span> },
            { key: "category", label: "Categoría" },
            { key: "description", label: "Descripción" },
            { key: "responsable", label: "Responsable", render: v => v || "—" },
            { key: "amount", label: "Monto", render: (v, row) => <strong style={{ color: row.type === "ingreso" ? C.green : C.red }}>{row.type === "ingreso" ? "+" : "-"}{Bs(v)}</strong> },
            { key: "id", label: "", render: (_, row) => canDeleteCash ? <button onClick={ev => { ev.stopPropagation(); setDeleteTarget(row); }} style={{ ...mkBtn("danger"), padding: "4px 8px", fontSize: 11 }}>×</button> : null }
          ]} rows={filtered} />}
      </div>

      {cajaModal === "apertura" && <Modal title="▶ Abrir caja" onClose={() => setCajaModal(null)} width={420}>
        <div style={{ fontSize: 13, color: C.textMid, marginBottom: 14 }}>Registra el fondo inicial de caja antes de iniciar operaciones.</div>
        <div style={{ marginBottom: 10 }}><label style={lbl}>Fondo inicial (Bs.) *</label><input type="number" min="0" step="0.5" style={inp} value={cajaForm.amount} onChange={e => setCajaForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" autoFocus /></div>
        <div style={{ marginBottom: 18 }}><label style={lbl}>Observaciones</label><input style={inp} value={cajaForm.notes} onChange={e => setCajaForm(f => ({ ...f, notes: e.target.value }))} placeholder="Turno, responsable, etc." /></div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={() => setCajaModal(null)} style={mkBtn("ghost")}>Cancelar</button>
          <button onClick={doAbrirCaja} style={mkBtn("success")}>▶ Abrir caja</button>
        </div>
      </Modal>}

      {cajaModal === "cierre" && <Modal title="⏹ Cerrar caja — Arqueo" onClose={() => setCajaModal(null)} width={460}>
        <div style={{ ...card({ marginBottom: 14, background: C.bg }) }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>Resumen del turno</div>
          {[["Fondo apertura", Bs(montoApertura), C.textMid], ["Cobrado en ventas", Bs(salesIncome), C.green], ["Otros ingresos", Bs(regIncome), C.green], ["Egresos", `-${Bs(totalExpense)}`, C.red], ["Fondo esperado", Bs(fondoEsperado), fondoEsperado >= 0 ? C.green : C.red]].map(([l, v, c]) => (
            <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${C.border}`, fontSize: 13 }}>
              <span style={{ color: C.textMid }}>{l}</span><span style={{ fontWeight: 700, color: c }}>{v}</span>
            </div>
          ))}
        </div>
        <div style={{ marginBottom: 10 }}><label style={lbl}>Arqueo — efectivo contado (Bs.) *</label><input type="number" min="0" step="0.5" style={inp} value={cajaForm.amount} onChange={e => setCajaForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" autoFocus /></div>
        {cajaForm.amount && <div style={{ ...card({ marginBottom: 10, background: n(cajaForm.amount) >= fondoEsperado ? C.greenBg : C.redBg, border: `1px solid ${n(cajaForm.amount) >= fondoEsperado ? C.greenMid : C.redMid}` }) }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: n(cajaForm.amount) >= fondoEsperado ? C.green : C.red }}>
            Diferencia: {Bs(n(cajaForm.amount) - fondoEsperado)} {n(cajaForm.amount) >= fondoEsperado ? "(sobrante)" : "(faltante)"}
          </div>
        </div>}
        <div style={{ marginBottom: 18 }}><label style={lbl}>Observaciones</label><input style={inp} value={cajaForm.notes} onChange={e => setCajaForm(f => ({ ...f, notes: e.target.value }))} placeholder="Notas del cierre..." /></div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={() => setCajaModal(null)} style={mkBtn("ghost")}>Cancelar</button>
          <button onClick={doCerrarCaja} style={mkBtn("danger")}>⏹ Cerrar caja</button>
        </div>
      </Modal>}

      {deleteTarget && <Modal title="Eliminar movimiento" onClose={() => setDeleteTarget(null)} width={420}>
        <div style={{ fontSize: 13, color: C.textMid, marginBottom: 16 }}>Solo administradores pueden eliminar movimientos del historial. Esta acción no se puede deshacer.</div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={() => setDeleteTarget(null)} style={mkBtn("ghost")}>Cancelar</button>
          <button onClick={removeExpense} style={mkBtn("danger")}>Eliminar</button>
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
              {CATS2[form.type].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}><label style={lbl}>Fecha</label><input type="date" style={inp} value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
        </div>
        <div style={{ marginBottom: 10 }}><label style={lbl}>Descripción *</label><input style={inp} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Descripción del movimiento" autoFocus /></div>
        <div style={row()}>
          <div style={{ flex: 1 }}><label style={lbl}>Monto (Bs.) *</label><input type="number" min="0" step="0.5" style={inp} value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="0.00" /></div>
          <div style={{ flex: 1 }}><label style={lbl}>Notas</label><input style={inp} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 }}><button onClick={() => setModal(false)} style={mkBtn("ghost")}>Cancelar</button><button onClick={doSave} style={mkBtn("primary")}>Guardar</button></div>
      </Modal>}
    </div>
  );
}
