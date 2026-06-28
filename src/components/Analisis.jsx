import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { n, pct } from "../utils/businessLogic.js";
import { Bs } from "../currency.js";
import { getCategoryName } from "../categories.js";
import { C, SECTORS_COLORS } from "../theme.jsx";
import { card, mkBadge } from "../styles.js";
import { KPI } from "./ui/KPI.jsx";
import { Header } from "./ui/Header.jsx";
import { Empty } from "./ui/Empty.jsx";
import { Table } from "./ui/Table.jsx";

export function Analisis({ D }) {
  const { sales, customers, products, expenses, orders, categories } = D;
  const totalSales = sales.reduce((a, s) => a + s.total, 0);
  const totalPaid = sales.reduce((a, s) => a + s.paid, 0);
  const totalExpenses = expenses.filter(e => e.type === "gasto").reduce((a, e) => a + e.amount, 0);
  const grossMargin = totalSales > 0 ? ((totalSales - totalExpenses) / totalSales * 100) : 0;
  const purchaseCost = expenses.filter(e => e.category === "Compra de ají").reduce((a, e) => a + e.amount, 0);
  const breakEven = totalSales > 0 && totalSales !== totalExpenses ? (totalExpenses / (1 - purchaseCost / totalSales)).toFixed(0) : 0;

  const prodRev = {};
  sales.forEach(s => s.items.forEach(it => { prodRev[it.productId] = (prodRev[it.productId] || 0) + n(it.subtotal ?? it.sub); }));
  const topProds = Object.entries(prodRev).map(([id, rev]) => { const p = products.find(x => x.id === id); return { name: p?.name || "?", rev, units: sales.flatMap(s => s.items.filter(i => i.productId === id)).reduce((a, i) => a + n(i.qty), 0) }; }).sort((a, b) => b.rev - a.rev).slice(0, 8);
  const topSoldProducts = topProds.slice().sort((a, b) => b.units - a.units).slice(0, 3);

  const topClients = customers.map(c => ({ name: c.name, total: sales.filter(s => s.customerId === c.id).reduce((a, s) => a + s.total, 0), purchases: sales.filter(s => s.customerId === c.id).length })).sort((a, b) => b.total - a.total).slice(0, 6);

  const catRev = {};
  sales.forEach(s => s.items.forEach(it => { const p = products.find(x => x.id === it.productId); if (p) { catRev[p.cat] = (catRev[p.cat] || 0) + n(it.subtotal ?? it.sub); } }));
  const catData = Object.entries(catRev).map(([cat, rev]) => ({ name: getCategoryName(categories, cat), value: Math.round(rev) })).sort((a, b) => b.value - a.value);

  const prodAnalysis = orders.map(o => ({ name: o.formulaName, margin: o.margin, cost: o.totalCost, revenue: o.revenue, costPerUnit: o.costPerUnit }));

  return (
    <div>
      <Header title="Análisis y Rentabilidad" sub="Indicadores clave del negocio" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(155px,1fr))", gap: 10, marginBottom: 18 }}>
        <KPI label="Margen bruto estimado" value={`${Math.round(grossMargin)}%`} sub="(ventas - gastos)" color={grossMargin > 30 ? C.green : grossMargin > 10 ? C.amber : C.red} Icon="📊" />
        <KPI label="Total facturado" value={Bs(totalSales)} color={C.red} Icon="🛒" />
        <KPI label="Total cobrado" value={Bs(totalPaid)} sub={`${pct(totalPaid, totalSales)}% de lo facturado`} color={C.green} Icon="✅" />
        <KPI label="Total gastos" value={Bs(totalExpenses)} color={C.amber} Icon="📤" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
        <div style={card()}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>📦 Top 3 productos más vendidos</div>
          {topSoldProducts.length === 0 ? <Empty icon="📦" title="Sin datos" sub="Registra ventas para ver el análisis" /> :
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={topSoldProducts} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                <XAxis type="number" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={120} />
                <Tooltip formatter={(v, name, entry) => name === "Unidades" ? [`${v} unidades`, "Vendidos"] : [Bs(entry?.payload?.rev || 0), "Ingresos"]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="units" name="Unidades" fill={C.red} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>}
        </div>

        <div style={card()}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>👥 Mejores clientes</div>
          {topClients.length === 0 ? <Empty icon="👥" title="Sin datos" sub="Registra clientes y ventas" /> :
            topClients.map((c, i) => (
              <div key={c.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: `1px solid ${C.border}` }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <div style={{ width: 22, height: 22, background: i === 0 ? "#F59E0B" : i === 1 ? "#9CA3AF" : i === 2 ? "#CD7F32" : C.bg, borderRadius: 50, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: i < 3 ? "white" : C.textFaint }}>{i + 1}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: C.textFaint }}>{c.purchases} compra{c.purchases !== 1 ? "s" : ""}</div>
                  </div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.red }}>{Bs(c.total)}</div>
              </div>
            ))}
        </div>
      </div>

      {catData.length > 0 && <div style={{ ...card(), marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>🥧 Ingresos por categoría de producto</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <ResponsiveContainer width="50%" height={160}>
            <PieChart>
              <Pie data={catData} cx="50%" cy="50%" outerRadius={65} dataKey="value" nameKey="name" label={({ percent }) => `${Math.round(percent * 100)}%`} labelLine={false}>
                {catData.map((_, i) => <Cell key={i} fill={SECTORS_COLORS[i % SECTORS_COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={v => [Bs(v)]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ flex: 1 }}>
            {catData.map((c, i) => (
              <div key={c.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: SECTORS_COLORS[i % SECTORS_COLORS.length] }} />
                  <span style={{ fontSize: 13 }}>{c.name}</span>
                </div>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{Bs(c.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>}

      {prodAnalysis.length > 0 && <div style={card()}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>🏭 Análisis de órdenes de producción</div>
        <Table cols={[
          { key: "name", label: "Fórmula", style: { fontWeight: 500 } },
          { key: "cost", label: "Costo total", render: v => Bs(v) },
          { key: "revenue", label: "Valor producido", render: v => <span style={{ color: C.green, fontWeight: 600 }}>{Bs(v)}</span> },
          { key: "costPerUnit", label: "Costo/unidad", render: v => Bs(v) },
          { key: "margin", label: "Margen", render: v => <span style={mkBadge(v >= 40 ? "green" : v >= 20 ? "amber" : "red")}>{v}%</span> },
        ]} rows={prodAnalysis} />
      </div>}
    </div>
  );
}
