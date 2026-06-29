// Analytics: calcula KPIs directamente desde los datos en memoria.
// Sin queries a Supabase — los datos ya están frescos gracias al realtime y la hidratación.

function periodoRango(periodo) {
  const to = Date.now();
  const from = new Date();
  switch (periodo) {
    case "today": from.setHours(0, 0, 0, 0); break;
    case "week":  from.setDate(from.getDate() - 7); break;
    case "month": from.setMonth(from.getMonth() - 1); break;
    case "3m":    from.setMonth(from.getMonth() - 3); break;
    case "6m":    from.setMonth(from.getMonth() - 6); break;
    case "year":  from.setFullYear(from.getFullYear() - 1); break;
    default:      from.setMonth(from.getMonth() - 1);
  }
  return { from: from.getTime(), to };
}

const _tsOf = item => new Date(item.createdAt || item.date || 0).getTime();

function _filterByPeriod(items, periodo) {
  const { from, to } = periodoRango(periodo);
  return items.filter(item => { const t = _tsOf(item); return t >= from && t <= to; });
}

// No-op mantenida para compatibilidad — ya no hay cache que invalidar
export function invalidateAnalyticsCache() {}

export const analyticsService = {
  computeKPIs(sales, expenses, periodo = "month") {
    const vs = _filterByPeriod(sales, periodo);
    const gs = _filterByPeriod(expenses, periodo);
    const totalVentas   = vs.reduce((a, v) => a + (v.total  || 0), 0);
    const totalCobrado  = vs.reduce((a, v) => a + (v.paid   || 0), 0);
    const totalDeuda    = vs.reduce((a, v) => a + (v.debt   || 0), 0);
    const totalGastos   = gs.filter(g => g.type === "gasto").reduce((a, g) => a + (g.amount || 0), 0);
    const totalIngresos = gs.filter(g => g.type === "ingreso").reduce((a, g) => a + (g.amount || 0), 0);
    return {
      totalVentas,
      totalCobrado,
      totalDeuda,
      totalGastos,
      totalIngresos,
      balance: totalCobrado + totalIngresos - totalGastos,
      numTransacciones: vs.length,
      ticketPromedio: vs.length > 0 ? totalVentas / vs.length : 0,
      tasaCobro: totalVentas > 0 ? (totalCobrado / totalVentas) * 100 : 0,
    };
  },

  computeComparativo(sales, periodo = "month") {
    const { from: f1, to: t1 } = periodoRango(periodo);
    const dur = t1 - f1;
    const f0  = f1 - dur;
    const cur  = sales.filter(s => { const t = _tsOf(s); return t >= f1 && t <= t1; });
    const prev = sales.filter(s => { const t = _tsOf(s); return t >= f0 && t < f1; });
    const sum = arr => arr.reduce((a, v) => a + (v.total || 0), 0);
    const actual = sum(cur), anterior = sum(prev);
    return {
      actual,
      anterior,
      cambio: anterior > 0 ? ((actual - anterior) / anterior) * 100 : 0,
      trend: actual >= anterior ? "up" : "down",
    };
  },

  computeTopProductos(sales, periodo = "month", limit = 10) {
    const vs = _filterByPeriod(sales, periodo);
    const mapa = {};
    vs.forEach(v => (v.items || []).forEach(it => {
      if (!mapa[it.productId]) mapa[it.productId] = { name: it.name || it.productId, ingreso: 0, unidades: 0 };
      mapa[it.productId].ingreso  += Number(it.subtotal ?? it.sub ?? 0);
      mapa[it.productId].unidades += Number(it.qty ?? 0);
    }));
    return Object.values(mapa).sort((a, b) => b.ingreso - a.ingreso).slice(0, limit);
  },

  computeTopClientes(sales, periodo = "month", limit = 10) {
    const vs = _filterByPeriod(sales, periodo);
    const mapa = {};
    vs.forEach(v => {
      const id = v.customerId || "__guest__";
      if (!mapa[id]) mapa[id] = { name: v.customerName || "Público general", total: 0, compras: 0, deuda: 0 };
      mapa[id].total   += Number(v.total ?? 0);
      mapa[id].compras += 1;
      mapa[id].deuda   += Number(v.debt  ?? 0);
    });
    return Object.values(mapa).sort((a, b) => b.total - a.total).slice(0, limit);
  },

  computeGastosPorCategoria(expenses, periodo = "month") {
    const gs = _filterByPeriod(expenses, periodo);
    const mapa = {};
    gs.filter(g => g.type === "gasto").forEach(g => {
      mapa[g.category] = (mapa[g.category] || 0) + (g.amount || 0);
    });
    return Object.entries(mapa).map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
  },

  computeInventarioStatus(products, inventory) {
    const stockMap = Object.fromEntries((inventory || []).map(i => [i.productId, i.stock || 0]));
    const items = (products || []).map(p => {
      const stock = stockMap[p.id] || 0;
      return {
        id: p.id, name: p.name, cat: p.cat, unit: p.unit,
        stock, minStock: p.minStock || 0, price: p.price || 0,
        valor: stock * (p.price || 0),
        estado: stock === 0 ? "agotado" : stock <= (p.minStock || 0) ? "bajo" : "ok",
      };
    });
    return {
      items,
      totalValor: items.reduce((a, i) => a + i.valor, 0),
      agotados: items.filter(i => i.estado === "agotado").length,
      bajos: items.filter(i => i.estado === "bajo").length,
      ok: items.filter(i => i.estado === "ok").length,
    };
  },
};
