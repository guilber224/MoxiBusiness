import { useState, useMemo } from "react";
import { AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { n, pct, fDate, buildChart } from "../utils/businessLogic.js";
import { Bs } from "../currency.js";
import { getCategoryName } from "../categories.js";
import { C, SECTORS_COLORS } from "../theme.jsx";
import { card, mkBtn, mkBadge } from "../styles.js";
import { useIsMobile } from "../hooks/useIsMobile.js";
import { KPI } from "./ui/KPI.jsx";
import { Header } from "./ui/Header.jsx";
import { Empty } from "./ui/Empty.jsx";
import { Chip } from "./ui/Chip.jsx";

const PERIODS = [["today","Hoy"],["week","Semana"],["month","Mes"],["3m","3 Meses"],["6m","6 Meses"],["year","Año"],["5y","5 Años"]];

export function Dashboard({ D, setTab }) {
  const [period, setPeriod] = useState("month");
  const isMobile = useIsMobile();
  const { sales = [], customers = [], products = [], inventory = [], expenses = [], categories = [] } = D || {};

  const totalSales = sales.reduce((a, s) => a + s.total, 0);
  const totalPaid = sales.reduce((a, s) => a + s.paid, 0);
  const totalDebt = sales.reduce((a, s) => a + s.debt, 0);
  const totalExpenses = expenses.filter(e => e.type === "gasto").reduce((a, e) => a + e.amount, 0);
  const chartData = useMemo(() => buildChart(sales, period), [sales, period]);
  const getStock = id => (inventory.find(i => i.productId === id) || {}).stock || 0;
  const lowStock = products.filter(p => p.minStock > 0 && getStock(p.id) <= p.minStock);
  const debtClients = customers.map(c => ({ ...c, debt: sales.filter(s => s.customerId === c.id).reduce((a, s) => a + s.debt, 0) })).filter(c => c.debt > 0).sort((a, b) => b.debt - a.debt);
  const recent = [...sales].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 6);

  const prodMap = {};
  sales.forEach(s => s.items.forEach(it => { prodMap[it.productId] = (prodMap[it.productId] || 0) + it.subtotal; }));
  const topProds = Object.entries(prodMap).map(([id, total]) => ({ name: products.find(p => p.id === id)?.name || id, total })).sort((a, b) => b.total - a.total).slice(0, 5);

  const catMap = {};
  sales.forEach(s => s.items.forEach(it => { const p = products.find(x => x.id === it.productId); const cat = (p?.cat) || "otro"; catMap[cat] = (catMap[cat] || 0) + it.subtotal; }));
  const pieSales = Object.entries(catMap).map(([cat, v]) => ({ name: getCategoryName(categories, cat), value: Math.round(v) }));

  return (
    <div>
      <Header title="Panel Principal" sub={new Date().toLocaleDateString("es-BO", { weekday: "long", year: "numeric", month: "long", day: "numeric" })} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10, marginBottom: 18 }}>
        <KPI label="Total Clientes" value={customers.length} Icon="👥" color={C.blue} />
        <KPI label="Total Ventas" value={Bs(totalSales)} sub={`${sales.length} transacciones`} Icon="🛒" color={C.red} />
        <KPI label="Total Cobrado" value={Bs(totalPaid)} sub={`${pct(totalPaid, totalSales)}% cobrado`} Icon="✅" color={C.green} />
        <KPI label="Deuda Pendiente" value={Bs(totalDebt)} sub={`${debtClients.length} clientes`} Icon="⚠️" color={totalDebt > 0 ? C.amber : C.green} />
      </div>

      <div style={{ ...card(), marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: "-0.02em" }}>Actividad comercial</div>
          <Chip value={period} onChange={setPeriod} options={PERIODS} />
        </div>
        <ResponsiveContainer width="100%" height={210}>
          <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              {[["gV", C.red], ["gC", C.green], ["gD", C.red]].map(([id, clr]) => (
                <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={clr} stopOpacity={0.18} />
                  <stop offset="95%" stopColor={clr} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: C.textFaint }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: C.textFaint }} axisLine={false} tickLine={false} width={62} tickFormatter={v => `Bs.${v}`} />
            <Tooltip formatter={(v, nm) => [Bs(v), nm]} contentStyle={{ borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 12, boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }} />
            <Legend iconSize={9} wrapperStyle={{ fontSize: 12 }} />
            <Area type="monotone" dataKey="ventas" name="Ventas" stroke={C.red} fill="url(#gV)" strokeWidth={2} dot={false} />
            <Area type="monotone" dataKey="cobrado" name="Cobrado" stroke={C.green} fill="url(#gC)" strokeWidth={2} dot={false} />
            <Area type="monotone" dataKey="deuda" name="Deuda" stroke={C.red} fill="url(#gD)" strokeWidth={2} dot={false} strokeDasharray="4 2" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12, marginBottom: 14 }}>
        <div style={card()}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            Ventas recientes
            <button onClick={() => setTab("ventas")} style={{ ...mkBtn("ghost"), padding: "3px 8px", fontSize: 11 }}>Ver todas →</button>
          </div>
          {recent.length === 0 ? <Empty icon="🛒" title="Sin ventas" sub="Registra tu primera venta" /> :
            recent.map(s => (
              <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{s.customerName}</div>
                  <div style={{ fontSize: 11, color: C.textFaint }}>{fDate(s.date)}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.red }}>{Bs(s.total)}</div>
                  <span style={mkBadge(s.debt > 0 ? "amber" : "green")}>{s.debt > 0 ? `Debe ${Bs(s.debt)}` : "Saldado"}</span>
                </div>
              </div>
            ))}
        </div>

        <div style={card()}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>Ventas por categoría</div>
          {pieSales.length > 0 ? (
            <ResponsiveContainer width="100%" height={150}>
              <PieChart>
                <Pie data={pieSales} cx="50%" cy="50%" outerRadius={60} dataKey="value" nameKey="name" label={({ name, percent }) => `${Math.round(percent * 100)}%`} labelLine={false}>
                  {pieSales.map((_, i) => <Cell key={i} fill={SECTORS_COLORS[i % SECTORS_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => [Bs(v)]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <Legend iconSize={9} wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <Empty icon="📊" title="Sin datos" sub="Registra ventas para ver la distribución" />}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
        {lowStock.length > 0 && (
          <div style={{ ...card(), borderLeft: `3px solid ${C.amber}` }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: C.amber, marginBottom: 8 }}>⚠️ Stock bajo ({lowStock.length})</div>
            {lowStock.slice(0, 5).map(p => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "4px 0", borderBottom: `1px solid ${C.border}` }}>
                <span>{p.name}</span><span style={{ color: C.amber, fontWeight: 600 }}>{getStock(p.id)}/{p.minStock} {p.unit}</span>
              </div>
            ))}
          </div>
        )}
        {debtClients.length > 0 && (
          <div style={{ ...card(), borderLeft: `3px solid ${C.red}` }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: C.red, marginBottom: 8 }}>💳 Deudas pendientes ({debtClients.length})</div>
            {debtClients.slice(0, 5).map(c => (
              <div key={c.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "4px 0", borderBottom: `1px solid ${C.border}` }}>
                <span>{c.name}</span><span style={{ color: C.red, fontWeight: 700 }}>{Bs(c.debt)}</span>
              </div>
            ))}
          </div>
        )}
        {lowStock.length === 0 && debtClients.length === 0 && (
          <div style={{ ...card(), borderLeft: `3px solid ${C.green}`, gridColumn: "1/-1", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 24 }}>✅</span>
            <div><div style={{ fontWeight: 600, color: C.green }}>Todo en orden</div><div style={{ fontSize: 12, color: C.textMid }}>Sin alertas activas</div></div>
          </div>
        )}
      </div>
    </div>
  );
}
