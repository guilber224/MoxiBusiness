// Lógica de negocio pura (sin React, sin estado de módulo) extraída de aji-huacareta-app.jsx
// para poder testearla de forma aislada. Mismo comportamiento, solo movida de lugar.

export const uid = () => Math.random().toString(36).slice(2, 9);
export const n = v => parseFloat(v) || 0;
export const pct = (a, b) => b === 0 ? 0 : Math.round((a / b) * 100);
export const today = () => new Date().toISOString().slice(0, 10);
export const fDate = d => { try { return new Date(d).toLocaleDateString("es-BO", { day: "2-digit", month: "2-digit", year: "numeric" }); } catch { return "—"; } };
export const fShort = d => { try { return new Date(d).toLocaleDateString("es-BO", { day: "2-digit", month: "short" }); } catch { return "—"; } };
export const fDateTime = d => {
  try {
    return new Date(d).toLocaleString("es-BO", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
};

export const isAdmin = user => user?.role === "admin";
// Supabase users always have UUID ids (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx).
// Local/legacy users have ids like "u" + 7 random chars.
export const isSupabaseUser = user => Boolean(user?.id) && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(user.id);
export const VALID_ROLES = ["admin", "vendedor", "operador", "usuario"];
export const normalizeRole = role => VALID_ROLES.includes(role) ? role : "usuario";

export const normalizeSaleItem = item => {
  const sub = n(item?.sub ?? item?.subtotal ?? n(item?.qty) * n(item?.unitPrice));
  return {
    ...item,
    qty: n(item?.qty) || 0,
    unitPrice: n(item?.unitPrice),
    sub,
    subtotal: sub,
  };
};
export const normalizeSales = sales =>
  (sales || []).map(sale => ({
    ...sale,
    total: n(sale?.total),
    paid: n(sale?.paid),
    debt: n(sale?.debt),
    items: (sale?.items || []).map(normalizeSaleItem),
    payments: (sale?.payments || []).map(payment => ({ ...payment, amount: n(payment?.amount) })),
  }));
export const normalizeUsers = users => (users || []).map(user => ({ ...user, role: normalizeRole(user?.role) }));
export const normalizeCustomers = customers => {
  const list = customers?.length === 1 && customers?.[0]?.id === "c1" && customers?.[0]?.name === "Ají Charcas"
    ? []
    : (customers || []);
  // Normaliza 'nombre' (columna legacy en español) → 'name' (campo que usa la app)
  return list.map(c => ({ ...c, name: c.name || c.nombre || "" }));
};

// Merge por id: actualiza items existentes y añade nuevos; no crea duplicados.
export const mergeById = (existing, incoming) => {
  const map = new Map((existing || []).filter(x => x?.id).map(x => [x.id, x]));
  (incoming || []).filter(x => x?.id).forEach(x => map.set(x.id, x));
  return Array.from(map.values());
};

export const getPeriodStart = (period, now = new Date()) => {
  const start = new Date(now);
  if (period === "today") {
    start.setHours(0, 0, 0, 0);
    return start;
  }
  if (period === "week") {
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return start;
  }
  if (period === "month") return new Date(now.getFullYear(), now.getMonth(), 1);
  if (period === "3m") return new Date(now.getFullYear(), now.getMonth() - 2, 1);
  if (period === "6m") return new Date(now.getFullYear(), now.getMonth() - 5, 1);
  if (period === "year") return new Date(now.getFullYear(), 0, 1);
  return new Date(now.getFullYear() - 4, 0, 1);
};
export const isWithinPeriod = (value, period) => {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  if (period === "today") return date.toDateString() === new Date().toDateString();
  return date >= getPeriodStart(period);
};
export const filterByPeriod = (items, period, getDate = item => item?.date) => (items || []).filter(item => isWithinPeriod(getDate(item), period));

export const getSalePayments = sales =>
  (sales || []).flatMap(sale => {
    const payments = sale?.payments?.length
      ? sale.payments
      : sale?.paid > 0
        ? [{ amount: sale.paid, date: sale.date }]
        : [];
    return payments
      .filter(payment => n(payment?.amount) > 0)
      .map(payment => ({
        saleId: sale.id,
        customerName: sale.customerName,
        amount: n(payment.amount),
        date: payment.date || sale.date,
      }));
  });

export const buildCashChart = (sales, expenses, period) => {
  const now = new Date();
  const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
  const payments = getSalePayments(sales);
  // Exclude caja open/close events — only real income and expense transactions
  const cashExpenses = (expenses || []).filter(e => e.type === "ingreso" || e.type === "gasto");
  let pts = [];
  if (period === "today") {
    pts = Array.from({ length: 24 }, (_, i) => ({ date: `${i}h`, ingresos: 0, gastos: 0, _h: i }));
    payments.forEach(payment => {
      const date = new Date(payment.date);
      if (sameDay(date, now) && pts[date.getHours()]) pts[date.getHours()].ingresos += payment.amount;
    });
    cashExpenses.forEach(expense => {
      const date = new Date(expense.date);
      if (!sameDay(date, now) || !pts[date.getHours()]) return;
      pts[date.getHours()][expense.type === "ingreso" ? "ingresos" : "gastos"] += expense.amount;
    });
  } else if (period === "week") {
    pts = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(now - (6 - i) * 86400000);
      return { date: fShort(date), ingresos: 0, gastos: 0, _d: date };
    });
    payments.forEach(payment => {
      const point = pts.find(item => sameDay(item._d, payment.date));
      if (point) point.ingresos += payment.amount;
    });
    cashExpenses.forEach(expense => {
      const point = pts.find(item => sameDay(item._d, expense.date));
      if (point) point[expense.type === "ingreso" ? "ingresos" : "gastos"] += expense.amount;
    });
  } else if (period === "month") {
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    pts = Array.from({ length: daysInMonth }, (_, i) => {
      const date = new Date(now.getFullYear(), now.getMonth(), i + 1);
      return { date: `${i + 1}`, ingresos: 0, gastos: 0, _d: date };
    });
    payments.forEach(payment => {
      const point = pts.find(item => sameDay(item._d, payment.date));
      if (point) point.ingresos += payment.amount;
    });
    cashExpenses.forEach(expense => {
      const point = pts.find(item => sameDay(item._d, expense.date));
      if (point) point[expense.type === "ingreso" ? "ingresos" : "gastos"] += expense.amount;
    });
  } else if (period === "3m") {
    pts = Array.from({ length: 13 }, (_, i) => {
      const end = new Date(now - (12 - i) * 7 * 86400000);
      return { date: fShort(end), ingresos: 0, gastos: 0, _s: new Date(end - 7 * 86400000), _e: end };
    });
    payments.forEach(payment => {
      const date = new Date(payment.date);
      const point = pts.find(item => date >= item._s && date <= item._e);
      if (point) point.ingresos += payment.amount;
    });
    cashExpenses.forEach(expense => {
      const date = new Date(expense.date);
      const point = pts.find(item => date >= item._s && date <= item._e);
      if (point) point[expense.type === "ingreso" ? "ingresos" : "gastos"] += expense.amount;
    });
  } else if (period === "6m") {
    pts = Array.from({ length: 6 }, (_, i) => {
      const month = (now.getMonth() - (5 - i) + 12) % 12;
      const year = now.getFullYear() - (now.getMonth() < (5 - i) ? 1 : 0);
      return { date: new Date(year, month).toLocaleDateString("es-BO", { month: "short" }), ingresos: 0, gastos: 0, _m: month, _y: year };
    });
    payments.forEach(payment => {
      const date = new Date(payment.date);
      const point = pts.find(item => item._m === date.getMonth() && item._y === date.getFullYear());
      if (point) point.ingresos += payment.amount;
    });
    cashExpenses.forEach(expense => {
      const date = new Date(expense.date);
      const point = pts.find(item => item._m === date.getMonth() && item._y === date.getFullYear());
      if (point) point[expense.type === "ingreso" ? "ingresos" : "gastos"] += expense.amount;
    });
  } else if (period === "year") {
    const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    pts = months.map((label, index) => ({ date: label, ingresos: 0, gastos: 0, _m: index }));
    payments.forEach(payment => {
      const date = new Date(payment.date);
      if (date.getFullYear() === now.getFullYear() && pts[date.getMonth()]) pts[date.getMonth()].ingresos += payment.amount;
    });
    cashExpenses.forEach(expense => {
      const date = new Date(expense.date);
      if (date.getFullYear() === now.getFullYear() && pts[date.getMonth()]) pts[date.getMonth()][expense.type === "ingreso" ? "ingresos" : "gastos"] += expense.amount;
    });
  } else {
    pts = Array.from({ length: 5 }, (_, i) => {
      const year = now.getFullYear() - (4 - i);
      return { date: `${year}`, ingresos: 0, gastos: 0, _y: year };
    });
    payments.forEach(payment => {
      const point = pts.find(item => item._y === new Date(payment.date).getFullYear());
      if (point) point.ingresos += payment.amount;
    });
    cashExpenses.forEach(expense => {
      const point = pts.find(item => item._y === new Date(expense.date).getFullYear());
      if (point) point[expense.type === "ingreso" ? "ingresos" : "gastos"] += expense.amount;
    });
  }
  return pts.map(({ date, ingresos, gastos }) => ({
    date,
    ingresos: Math.round(ingresos * 100) / 100,
    gastos: Math.round(gastos * 100) / 100,
  }));
};

export const restoreInventoryFromSale = (inventory, sale) =>
  (inventory || []).map(item => {
    const sold = (sale?.items || []).find(saleItem => saleItem.productId === item.productId);
    return sold ? { ...item, stock: item.stock + n(sold.qty) } : item;
  });
export const reverseProductionInventory = (inventory, order) =>
  (inventory || []).map(item => {
    if (item.productId === order?.inputId) return { ...item, stock: item.stock + n(order.inputUsed) };
    if (item.productId === order?.outputId) return { ...item, stock: Math.max(0, item.stock - n(order.outputProduced)) };
    return item;
  });
