import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {
  Users, ShoppingCart, Wallet, CreditCard, TrendingUp, BarChart2, CheckCircle, AlertTriangle, ChevronRight,
} from "lucide-react";
import { analyticsService } from "../services/analyticsService.js";
import { useIsMobile } from "../hooks/useIsMobile.js";
import { n, fDate, buildChart, PERIOD_OPTIONS } from "../utils/businessLogic.js";
import { Bs } from "../currency.js";
import { C, FONT, SECTORS_COLORS } from "../theme.jsx";
import { card, mkBtn, mkBadge } from "../styles.js";
import { Empty } from "./ui/Empty.jsx";
import { Chip } from "./ui/Chip.jsx";
import { KpiPremium } from "./KpiPremium.jsx";

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  DASHBOARD PREMIUM                                                  ║
// ╚══════════════════════════════════════════════════════════════════════╝
export function DashboardPremium({ D, setTab, user, refreshTrigger = 0 }) {
  const [periodo, setPeriodo] = useState("month");
  const [kpis, setKpis] = useState(null);
  const [comparativo, setComparativo] = useState(null);
  const [topProds, setTopProds] = useState([]);
  const [topClts, setTopClts] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [salesPeriod, setSalesPeriod] = useState("week");
  const isMobile = useIsMobile();

  const { sales = [], customers = [], products = [], inventory = [], expenses = [], categories = [] } = D || {};

  // Carga analytics desde Supabase para el periodo seleccionado
  useEffect(() => {
    if (!user?.empresa_id) return;
    setSyncing(true);
    const eid = user.empresa_id;
    Promise.all([
      analyticsService.getKPIs(eid, periodo),
      analyticsService.getComparativo(eid, periodo),
      analyticsService.getTopProductos(eid, periodo, 5),
      analyticsService.getTopClientes(eid, periodo, 5),
    ]).then(([k, c, tp, tc]) => {
      if (k === null) console.warn("[DashboardPremium] getKPIs null — revisar RLS o empresa_id:", eid);
      setKpis(k);
      setComparativo(c);
      setTopProds(Array.isArray(tp) ? tp : []);
      setTopClts(Array.isArray(tc) ? tc : []);
    }).catch((err) => { console.warn("[DashboardPremium] analytics error:", err?.message ?? err); }).finally(() => setSyncing(false));
  }, [user?.empresa_id, periodo, refreshTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  // Computaciones locales como fallback
  const getStock = id => (inventory.find(i => i.productId === id) || {}).stock || 0;
  const lowStock = useMemo(() => products.filter(p => p.minStock > 0 && getStock(p.id) <= p.minStock), [products, inventory]); // eslint-disable-line react-hooks/exhaustive-deps
  const debtClients = useMemo(() =>
    customers.map(c => ({ ...c, debt: sales.filter(s => s.customerId === c.id).reduce((a, s) => a + s.debt, 0) }))
      .filter(c => c.debt > 0).sort((a, b) => b.debt - a.debt),
    [customers, sales]);
  const recent = useMemo(() => [...sales].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5), [sales]);

  // Métricas: Supabase si disponible, fallback local
  const totalVentas    = kpis?.totalVentas    ?? sales.reduce((a, s) => a + s.total, 0);
  const totalCobrado   = kpis?.totalCobrado   ?? sales.reduce((a, s) => a + s.paid, 0);
  const totalDeuda     = kpis?.totalDeuda     ?? sales.reduce((a, s) => a + s.debt, 0);
  const totalGastos    = kpis?.totalGastos    ?? expenses.filter(e => e.type === "gasto").reduce((a, e) => a + e.amount, 0);
  const ticketPromedio = kpis?.ticketPromedio ?? 0;
  const tasaCobro      = kpis?.tasaCobro      ?? (totalVentas > 0 ? (totalCobrado / totalVentas) * 100 : 0);
  const balance        = kpis?.balance        ?? (totalCobrado - totalGastos);
  const numTx          = kpis?.numTransacciones ?? sales.length;
  const cambio         = comparativo?.cambio  ?? null;

  // Top productos locales (siempre calculados — se usan solo si analytics no responde)
  const localTopProds = useMemo(() => {
    const m = {};
    sales.forEach(s => s.items.forEach(it => {
      if (!m[it.productId]) m[it.productId] = { name: products.find(p => p.id === it.productId)?.name || it.name || it.productId, ingreso: 0, unidades: 0 };
      m[it.productId].ingreso  += n(it.subtotal ?? it.sub ?? 0);
      m[it.productId].unidades += n(it.qty ?? 0);
    }));
    return Object.values(m).sort((a, b) => b.ingreso - a.ingreso).slice(0, 5);
  }, [sales, products]);
  const displayTopProds = topProds.length > 0 ? topProds : localTopProds;

  // Top clientes locales (siempre calculados — se usan solo si analytics no responde)
  const localTopClts = useMemo(() =>
    customers.map(c => ({
      name: c.name,
      total: sales.filter(s => s.customerId === c.id).reduce((a, s) => a + s.total, 0),
      compras: sales.filter(s => s.customerId === c.id).length,
      deuda: sales.filter(s => s.customerId === c.id).reduce((a, s) => a + s.debt, 0),
    })).filter(c => c.total > 0).sort((a, b) => b.total - a.total).slice(0, 5),
    [customers, sales]);
  const displayTopClts = topClts.length > 0 ? topClts : localTopClts;

  const periodos = PERIOD_OPTIONS.filter(([p]) => p !== "5y");
  const modeColor = user?.empresa_id ? (syncing ? C.amber : C.green) : C.textFaint;
  const modeLabel = user?.empresa_id ? (syncing ? "Actualizando..." : "● Supabase") : "● Local";

  // Chart data for the sales panel (uses salesPeriod, not periodo)
  const salesChartData = useMemo(() => buildChart(sales, salesPeriod), [sales, salesPeriod]);
  const avgSale = sales.length > 0 ? totalVentas / sales.length : 0;

  // Donut data
  const donutData = [
    { name: "Ingresos", value: Math.max(totalCobrado, 0) },
    { name: "Gastos",   value: Math.max(totalGastos, 0) },
  ];
  const DONUT_COLORS = [C.green, C.danger];

  return (
    <div>
      {/* ── Page header ── */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: isMobile ? 18 : 22, letterSpacing: "-0.03em", color: "var(--color-text)" }}>
            Panel Principal 👋
          </div>
          <div style={{ fontSize: 13, color: "var(--color-text-mid)", marginTop: 4, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span>¡Bienvenido de nuevo! Resumen de tu negocio.</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: modeColor, background: modeColor + "18", padding: "2px 8px", borderRadius: 20 }}>{modeLabel}</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 13, color: "var(--color-text-mid)", padding: "6px 14px", background: "var(--color-bg-surface)", border: "1px solid var(--color-border)", borderRadius: 10, fontWeight: 500, whiteSpace: "nowrap" }}>
            {new Date().toLocaleDateString("es-BO", { day: "numeric", month: "long", year: "numeric" })}
          </div>
          <Chip value={periodo} onChange={setPeriodo} options={periodos} />
        </div>
      </motion.div>

      {/* ── KPI Cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 20 }}>
        <KpiPremium index={0} label="Clientes" value={customers.length} sub={`${products.length} productos`} color={C.brandLight} icon={Users} loading={false} />
        <KpiPremium index={1} label="Ventas del periodo" value={Bs(totalVentas)} sub={`${numTx} transacciones`} color={C.green} icon={ShoppingCart} trend={cambio} loading={syncing && !kpis} />
        <KpiPremium index={2} label="Total cobrado" value={Bs(totalCobrado)} sub={`${Math.round(tasaCobro)}% tasa cobro`} color={C.warning} icon={Wallet} loading={syncing && !kpis} />
        <KpiPremium index={3} label="Deuda pendiente" value={Bs(totalDeuda)} sub={`${debtClients.length} pendientes`} color={totalDeuda > 0 ? C.danger : C.green} icon={CreditCard} loading={syncing && !kpis} />
        <KpiPremium index={4} label="Balance neto" value={Bs(balance)} sub={`Gastos: ${Bs(totalGastos)}`} color={balance >= 0 ? C.green : C.danger} icon={TrendingUp} loading={syncing && !kpis} />
        <KpiPremium index={5} label="Ticket promedio" value={Bs(ticketPromedio || avgSale)} sub="por transacción" color={C.brand} icon={BarChart2} loading={syncing && !kpis} />
      </div>

      {/* ── 3-panel row: Chart / Top Productos / Donut ── */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr 1fr", gap: 14, marginBottom: 14 }}>

        {/* Panel A: Ventas chart */}
        <div style={{ ...card(), padding: "18px 18px 12px", borderRadius: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Ventas recientes</div>
            <div style={{ display: "flex", gap: 6 }}>
              {[["week","7 días"],["month","Mes"],["year","Año"]].map(([v,l]) => (
                <button key={v} onClick={() => setSalesPeriod(v)}
                  style={{ padding: "4px 12px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 500, fontFamily: FONT,
                    background: salesPeriod === v ? C.brand : "var(--color-bg-primary)",
                    color: salesPeriod === v ? "white" : "var(--color-text-mid)",
                    transition: "background 0.15s, color 0.15s",
                  }}>{l}</button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={190}>
            <AreaChart data={salesChartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gVP" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={C.green} stopOpacity={0.22} />
                  <stop offset="95%" stopColor={C.green} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gCP" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={C.brandLight} stopOpacity={0.18} />
                  <stop offset="95%" stopColor={C.brandLight} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gDP" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={C.red} stopOpacity={0.20} />
                  <stop offset="95%" stopColor={C.red} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--color-text-faint)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "var(--color-text-faint)" }} axisLine={false} tickLine={false} width={58} tickFormatter={v => `Bs.${v}`} />
              <Tooltip formatter={(v, nm) => [Bs(v), nm]} contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.12)", fontSize: 12, background: "var(--color-bg-surface)" }} />
              <Area type="monotone" dataKey="ventas" name="Ventas" stroke={C.green} fill="url(#gVP)" strokeWidth={2.5} dot={false} />
              <Area type="monotone" dataKey="cobrado" name="Cobrado" stroke={C.brandLight} fill="url(#gCP)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="deuda" name="Deuda" stroke={C.red} fill="url(#gDP)" strokeWidth={1.8} dot={false} strokeDasharray="4 2" />
            </AreaChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", gap: 20, marginTop: 10, borderTop: "1px solid var(--color-border)", paddingTop: 10 }}>
            <div>
              <div style={{ fontSize: 10, color: "var(--color-text-faint)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 2 }}>Venta promedio</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.green }}>{Bs(avgSale)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "var(--color-text-faint)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 2 }}>Transacciones</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.brand }}>{numTx}</div>
            </div>
          </div>
        </div>

        {/* Panel B: Top productos */}
        <div style={{ ...card(), padding: "18px", borderRadius: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Top Productos</div>
            <button onClick={() => setTab("productos")} style={{ ...mkBtn("ghost"), padding: "3px 8px", fontSize: 11 }}>Ver →</button>
          </div>
          {displayTopProds.length === 0
            ? <Empty icon="📦" title="Sin datos" sub="Registra ventas" />
            : displayTopProds.map((p, i) => (
              <div key={p.name + i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid var(--color-border)` }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: SECTORS_COLORS[i % SECTORS_COLORS.length] + "20", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: SECTORS_COLORS[i % SECTORS_COLORS.length], flexShrink: 0 }}>{i + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: "var(--color-text-faint)" }}>{n(p.unidades).toFixed(0)} uds.</div>
                </div>
                <span style={{ ...mkBadge("blue"), fontSize: 11 }}>{Bs(p.ingreso)}</span>
              </div>
            ))}
        </div>

        {/* Panel C: Flujo de caja donut */}
        <div style={{ ...card(), padding: "18px", borderRadius: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Flujo de Caja</div>
          {(totalCobrado > 0 || totalGastos > 0) ? (
            <>
              <ResponsiveContainer width="100%" height={130}>
                <PieChart>
                  <Pie data={donutData} cx="50%" cy="50%" innerRadius={38} outerRadius={60} dataKey="value" paddingAngle={3}>
                    {donutData.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i]} strokeWidth={0} />)}
                  </Pie>
                  <Tooltip formatter={v => [Bs(v)]} contentStyle={{ borderRadius: 10, fontSize: 12, background: "var(--color-bg-surface)", border: "none", boxShadow: "0 4px 16px rgba(0,0,0,0.10)" }} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ marginTop: 8, borderTop: "1px solid var(--color-border)", paddingTop: 10 }}>
                {donutData.map((d, i) => (
                  <div key={d.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: DONUT_COLORS[i], flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: "var(--color-text-mid)" }}>{d.name}</span>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: DONUT_COLORS[i] }}>{Bs(d.value)}</span>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 6, borderTop: "1px solid var(--color-border)", marginTop: 2 }}>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>Flujo neto</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: balance >= 0 ? C.green : C.danger }}>{Bs(balance)}</span>
                </div>
              </div>
            </>
          ) : (
            <Empty icon="💰" title="Sin datos" sub="Registra ventas para ver el flujo" />
          )}
        </div>
      </div>

      {/* ── Alertas + Actividad reciente ── */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14 }}>

        {/* Alertas */}
        <div style={{ ...card(), padding: "18px", borderRadius: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Alertas y pendientes</div>
            <button onClick={() => setTab("deudas")} style={{ ...mkBtn("ghost"), padding: "3px 8px", fontSize: 11 }}>Ver todas →</button>
          </div>
          {debtClients.length === 0 && lowStock.length === 0 ? (
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0" }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: C.green + "18", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <CheckCircle size={18} color={C.green} strokeWidth={2} />
              </div>
              <div>
                <div style={{ fontWeight: 600, color: C.green, fontSize: 13 }}>Todo en orden</div>
                <div style={{ fontSize: 12, color: "var(--color-text-faint)" }}>Sin alertas activas</div>
              </div>
            </div>
          ) : (
            <>
              {debtClients.length > 0 && (
                <button onClick={() => setTab("deudas")} style={{ display: "flex", alignItems: "center", width: "100%", background: "none", border: "none", cursor: "pointer", padding: "12px 0", borderBottom: "1px solid var(--color-border)", gap: 12, textAlign: "left", fontFamily: FONT }}
                  onMouseEnter={e => e.currentTarget.style.opacity = "0.8"}
                  onMouseLeave={e => e.currentTarget.style.opacity = "1"}
                >
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: C.danger + "15", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <CreditCard size={16} color={C.danger} strokeWidth={2} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)" }}>{debtClients.length} facturas pendientes de cobro</div>
                    <div style={{ fontSize: 12, color: "var(--color-text-faint)" }}>Total pendiente: {Bs(totalDeuda)}</div>
                  </div>
                  <ChevronRight size={16} color="var(--color-text-faint)" />
                </button>
              )}
              {lowStock.length > 0 && (
                <button onClick={() => setTab("inventario")} style={{ display: "flex", alignItems: "center", width: "100%", background: "none", border: "none", cursor: "pointer", padding: "12px 0", gap: 12, textAlign: "left", fontFamily: FONT }}
                  onMouseEnter={e => e.currentTarget.style.opacity = "0.8"}
                  onMouseLeave={e => e.currentTarget.style.opacity = "1"}
                >
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: C.warning + "15", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <AlertTriangle size={16} color={C.warning} strokeWidth={2} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)" }}>Stock bajo en {lowStock.length} productos</div>
                    <div style={{ fontSize: 12, color: "var(--color-text-faint)" }}>Revisa tu inventario</div>
                  </div>
                  <ChevronRight size={16} color="var(--color-text-faint)" />
                </button>
              )}
            </>
          )}
        </div>

        {/* Actividad reciente */}
        <div style={{ ...card(), padding: "18px", borderRadius: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Actividad reciente</div>
            <button onClick={() => setTab("ventas")} style={{ ...mkBtn("ghost"), padding: "3px 8px", fontSize: 11 }}>Ver todas →</button>
          </div>
          {recent.length === 0
            ? <Empty icon="🛒" title="Sin ventas" sub="Registra tu primera venta" />
            : recent.slice(0, 5).map((s, i) => (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: i < recent.length - 1 ? "1px solid var(--color-border)" : "none" }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: C.green + "15", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <ShoppingCart size={16} color={C.green} strokeWidth={2} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.customerName || "Cliente"}</div>
                  <div style={{ fontSize: 11.5, color: C.green, fontWeight: 700 }}>{Bs(s.total)}</div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 11, color: "var(--color-text-faint)" }}>{fDate(s.date)}</div>
                  <span style={{ ...mkBadge(s.debt > 0 ? "amber" : "green"), fontSize: 10 }}>{s.debt > 0 ? "Pendiente" : "Saldado"}</span>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
