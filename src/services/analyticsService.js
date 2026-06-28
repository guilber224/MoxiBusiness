import { supabase } from "../lib/supabaseClient";

// Cache en memoria con TTL de 3 minutos — evita re-consultar Supabase cada vez que
// el usuario navega al Dashboard (el componente se desmonta/monta en cada cambio de tab)
const _cache = {};
const TTL = 3 * 60 * 1000;
function _get(key) { const e = _cache[key]; return e && Date.now() - e.ts < TTL ? e.data : null; }
function _set(key, data) { _cache[key] = { data, ts: Date.now() }; }
export function invalidateAnalyticsCache() { Object.keys(_cache).forEach(k => delete _cache[k]); }

// Retorna { from, to } en ISO para un periodo dado
function periodoRango(periodo) {
  const to = new Date();
  const from = new Date(to);
  switch (periodo) {
    case "today": from.setHours(0, 0, 0, 0); break;
    case "week":  from.setDate(from.getDate() - 7); break;
    case "month": from.setMonth(from.getMonth() - 1); break;
    case "3m":    from.setMonth(from.getMonth() - 3); break;
    case "6m":    from.setMonth(from.getMonth() - 6); break;
    case "year":  from.setFullYear(from.getFullYear() - 1); break;
    default:      from.setMonth(from.getMonth() - 1);
  }
  return { from: from.toISOString(), to: to.toISOString() };
}

export const analyticsService = {

  // KPIs principales del periodo: ventas, cobros, deudas, gastos, balance, ticket promedio
  async getKPIs(empresaId, periodo = "month") {
    const ck = `kpis_${empresaId}_${periodo}`;
    const cached = _get(ck);
    if (cached) return cached;
    try {
      const { from, to } = periodoRango(periodo);
      const [
        { data: ventas, error: ve },
        { data: gastos, error: ge },
      ] = await Promise.all([
        supabase.from("ventas").select("total,paid,debt").eq("empresa_id", empresaId).gte("createdAt", from).lte("createdAt", to),
        supabase.from("gastos").select("amount,type").eq("empresa_id", empresaId).gte("createdAt", from).lte("createdAt", to),
      ]);
      if (ve) console.warn("[Analytics] ventas query error:", ve.message, "| code:", ve.code);
      if (ge) console.warn("[Analytics] gastos query error:", ge.message, "| code:", ge.code);
      // Retornar null activa el fallback local en DashboardPremium (?? operator)
      if (ve || ge) return null;
      const vArr = ventas || [];
      const gArr = gastos || [];
      const totalVentas  = vArr.reduce((a, v) => a + (v.total || 0), 0);
      const totalCobrado = vArr.reduce((a, v) => a + (v.paid  || 0), 0);
      const totalDeuda   = vArr.reduce((a, v) => a + (v.debt  || 0), 0);
      const totalGastos  = gArr.filter(g => g.type === "gasto").reduce((a, g) => a + (g.amount || 0), 0);
      const totalIngresos= gArr.filter(g => g.type === "ingreso").reduce((a, g) => a + (g.amount || 0), 0);
      const result = {
        totalVentas,
        totalCobrado,
        totalDeuda,
        totalGastos,
        totalIngresos,
        balance: totalCobrado + totalIngresos - totalGastos,
        numTransacciones: vArr.length,
        ticketPromedio: vArr.length > 0 ? totalVentas / vArr.length : 0,
        tasaCobro: totalVentas > 0 ? (totalCobrado / totalVentas) * 100 : 0,
      };
      _set(ck, result);
      return result;
    } catch (e) {
      console.warn("[Analytics] getKPIs exception:", e.message);
      return null;
    }
  },

  // Comparativo vs periodo anterior: variación % de ventas
  async getComparativo(empresaId, periodo = "month") {
    const ck = `comp_${empresaId}_${periodo}`;
    const cached = _get(ck);
    if (cached) return cached;
    try {
      const { from: f1, to: t1 } = periodoRango(periodo);
      const duracion = new Date(t1) - new Date(f1);
      const f0 = new Date(new Date(f1) - duracion).toISOString();
      const [
        { data: cur, error: ce },
        { data: prev, error: pe },
      ] = await Promise.all([
        supabase.from("ventas").select("total,paid").eq("empresa_id", empresaId).gte("createdAt", f1).lte("createdAt", t1),
        supabase.from("ventas").select("total,paid").eq("empresa_id", empresaId).gte("createdAt", f0).lt("createdAt", f1),
      ]);
      if (ce) console.warn("[Analytics] comparativo actual error:", ce.message, "| code:", ce.code);
      if (pe) console.warn("[Analytics] comparativo previo error:", pe.message, "| code:", pe.code);
      if (ce || pe) return null;
      const sum = arr => (arr || []).reduce((a, v) => a + (v.total || 0), 0);
      const actual = sum(cur);
      const anterior = sum(prev);
      const result = {
        actual,
        anterior,
        cambio: anterior > 0 ? ((actual - anterior) / anterior) * 100 : 0,
        trend: actual >= anterior ? "up" : "down",
      };
      _set(ck, result);
      return result;
    } catch (e) {
      console.warn("[Analytics] getComparativo exception:", e.message);
      return null;
    }
  },

  // Tendencia de ventas para graficar — agrupado por día/semana según periodo
  async getVentasTrend(empresaId, periodo = "month") {
    try {
      const { from, to } = periodoRango(periodo);
      const { data, error } = await supabase
        .from("ventas")
        .select("total,paid,debt,createdAt,date")
        .eq("empresa_id", empresaId)
        .gte("createdAt", from)
        .lte("createdAt", to)
        .order("createdAt", { ascending: true });
      if (error) {
        console.warn("[Analytics] getVentasTrend error:", error.message, "| code:", error.code);
        return [];
      }
      return data || [];
    } catch (e) {
      console.warn("[Analytics] getVentasTrend exception:", e.message);
      return [];
    }
  },

  // Top productos por ingreso — calcula desde items de ventas
  async getTopProductos(empresaId, periodo = "month", limit = 10) {
    const ck = `top_prod_${empresaId}_${periodo}_${limit}`;
    const cached = _get(ck);
    if (cached) return cached;
    try {
      const { from, to } = periodoRango(periodo);
      const { data, error } = await supabase
        .from("ventas")
        .select("items")
        .eq("empresa_id", empresaId)
        .gte("createdAt", from)
        .lte("createdAt", to);
      if (error) {
        console.warn("[Analytics] getTopProductos error:", error.message, "| code:", error.code);
        return [];
      }
      const mapa = {};
      (data || []).forEach(v => {
        (v.items || []).forEach(it => {
          if (!mapa[it.productId]) mapa[it.productId] = { name: it.name || it.productId, ingreso: 0, unidades: 0 };
          mapa[it.productId].ingreso   += Number(it.subtotal ?? it.sub ?? 0);
          mapa[it.productId].unidades  += Number(it.qty ?? 0);
        });
      });
      const result = Object.values(mapa).sort((a, b) => b.ingreso - a.ingreso).slice(0, limit);
      _set(ck, result);
      return result;
    } catch (e) {
      console.warn("[Analytics] getTopProductos exception:", e.message);
      return [];
    }
  },

  // Top clientes por volumen de compras
  async getTopClientes(empresaId, periodo = "month", limit = 10) {
    const ck = `top_clts_${empresaId}_${periodo}_${limit}`;
    const cached = _get(ck);
    if (cached) return cached;
    try {
      const { from, to } = periodoRango(periodo);
      const { data, error } = await supabase
        .from("ventas")
        .select("customerId,customerName,total,paid,debt")
        .eq("empresa_id", empresaId)
        .gte("createdAt", from)
        .lte("createdAt", to);
      if (error) {
        console.warn("[Analytics] getTopClientes error:", error.message, "| code:", error.code);
        return [];
      }
      const mapa = {};
      (data || []).forEach(v => {
        const id = v.customerId || "__guest__";
        if (!mapa[id]) mapa[id] = { name: v.customerName || "Público general", total: 0, compras: 0, deuda: 0 };
        mapa[id].total   += Number(v.total ?? 0);
        mapa[id].compras += 1;
        mapa[id].deuda   += Number(v.debt  ?? 0);
      });
      const result = Object.values(mapa).sort((a, b) => b.total - a.total).slice(0, limit);
      _set(ck, result);
      return result;
    } catch (e) {
      console.warn("[Analytics] getTopClientes exception:", e.message);
      return [];
    }
  },

  // Gastos por categoría para gráfico de torta
  async getGastosPorCategoria(empresaId, periodo = "month") {
    try {
      const { from, to } = periodoRango(periodo);
      const { data, error } = await supabase
        .from("gastos")
        .select("category,amount,type")
        .eq("empresa_id", empresaId)
        .gte("createdAt", from)
        .lte("createdAt", to);
      if (error) {
        console.warn("[Analytics] getGastosPorCategoria error:", error.message, "| code:", error.code);
        return [];
      }
      const mapa = {};
      (data || []).filter(g => g.type === "gasto").forEach(g => {
        mapa[g.category] = (mapa[g.category] || 0) + (g.amount || 0);
      });
      return Object.entries(mapa)
        .map(([category, amount]) => ({ category, amount }))
        .sort((a, b) => b.amount - a.amount);
    } catch (e) {
      console.warn("[Analytics] getGastosPorCategoria exception:", e.message);
      return [];
    }
  },

  // Estado de inventario con valorización — recibe arrays ya cargados (sin query extra)
  computeInventarioStatus(products, inventory) {
    const getStock = id => (inventory.find(i => i.productId === id) || {}).stock || 0;
    const items = products.map(p => ({
      id: p.id,
      name: p.name,
      cat: p.cat,
      unit: p.unit,
      stock: getStock(p.id),
      minStock: p.minStock || 0,
      price: p.price || 0,
      valor: getStock(p.id) * (p.price || 0),
      estado: getStock(p.id) === 0 ? "agotado" : getStock(p.id) <= (p.minStock || 0) ? "bajo" : "ok",
    }));
    return {
      items,
      totalValor: items.reduce((a, i) => a + i.valor, 0),
      agotados: items.filter(i => i.estado === "agotado").length,
      bajos: items.filter(i => i.estado === "bajo").length,
      ok: items.filter(i => i.estado === "ok").length,
    };
  },
};
