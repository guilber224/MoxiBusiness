import { describe, it, expect } from "vitest";
import {
  n, pct, mergeById,
  normalizeSaleItem, normalizeSales, normalizeUsers, normalizeCustomers,
  getSalePayments, buildCashChart, restoreInventoryFromSale, reverseProductionInventory,
  getPeriodStart, isWithinPeriod,
} from "./businessLogic";

describe("n", () => {
  it("parses numeric strings", () => {
    expect(n("12.5")).toBe(12.5);
  });
  it("falls back to 0 for invalid input", () => {
    expect(n("abc")).toBe(0);
    expect(n(undefined)).toBe(0);
    expect(n(null)).toBe(0);
  });
});

describe("pct", () => {
  it("computes a rounded percentage", () => {
    expect(pct(50, 200)).toBe(25);
  });
  it("returns 0 when dividing by zero instead of NaN/Infinity", () => {
    expect(pct(10, 0)).toBe(0);
  });
});

describe("normalizeSaleItem / normalizeSales — venta money fields", () => {
  it("recomputes sub/subtotal from qty * unitPrice when missing", () => {
    const item = normalizeSaleItem({ productId: "p1", qty: "3", unitPrice: "10" });
    expect(item.sub).toBe(30);
    expect(item.subtotal).toBe(30);
    expect(item.qty).toBe(3);
  });

  it("coerces money fields on a sale so dirty string data never reaches the UI as NaN", () => {
    const [sale] = normalizeSales([{
      id: "s1",
      total: "150.5",
      paid: "100",
      debt: "50.5",
      items: [{ productId: "p1", qty: "2", unitPrice: "75" }],
      payments: [{ amount: "100" }],
    }]);
    expect(sale.total).toBe(150.5);
    expect(sale.paid).toBe(100);
    expect(sale.debt).toBe(50.5);
    expect(sale.payments[0].amount).toBe(100);
  });

  it("defaults missing money fields to 0 rather than throwing", () => {
    const [sale] = normalizeSales([{ id: "s1" }]);
    expect(sale.total).toBe(0);
    expect(sale.paid).toBe(0);
    expect(sale.debt).toBe(0);
    expect(sale.items).toEqual([]);
  });
});

describe("getSalePayments — cobros derivados de una venta", () => {
  it("uses the explicit payments array when present", () => {
    const payments = getSalePayments([
      { id: "s1", customerName: "Ana", paid: 999, payments: [{ amount: 30, date: "2026-01-01" }] },
    ]);
    expect(payments).toEqual([{ saleId: "s1", customerName: "Ana", amount: 30, date: "2026-01-01" }]);
  });

  it("falls back to sale.paid when no payments array exists (legacy sales)", () => {
    const payments = getSalePayments([{ id: "s1", customerName: "Ana", paid: 40, date: "2026-01-02" }]);
    expect(payments).toEqual([{ saleId: "s1", customerName: "Ana", amount: 40, date: "2026-01-02" }]);
  });

  it("ignores zero/negative payment amounts", () => {
    const payments = getSalePayments([{ id: "s1", paid: 0, payments: [{ amount: 0 }, { amount: -5 }] }]);
    expect(payments).toEqual([]);
  });
});

describe("buildCashChart — cierre de caja", () => {
  it("sums today's payments and expenses into the correct hour bucket", () => {
    const now = new Date();
    const sale = { id: "s1", paid: 100, payments: [{ amount: 100, date: now.toISOString() }] };
    const expense = { type: "gasto", amount: 40, date: now.toISOString() };
    const chart = buildCashChart([sale], [expense], "today");
    const bucket = chart[now.getHours()];
    expect(bucket.ingresos).toBe(100);
    expect(bucket.gastos).toBe(40);
  });

  it("excludes apertura_caja/cierre_caja events from the income/expense totals", () => {
    const now = new Date();
    const aperturaCaja = { type: "apertura_caja", amount: 500, date: now.toISOString() };
    const chart = buildCashChart([], [aperturaCaja], "today");
    const totalIngresos = chart.reduce((a, p) => a + p.ingresos, 0);
    const totalGastos = chart.reduce((a, p) => a + p.gastos, 0);
    expect(totalIngresos).toBe(0);
    expect(totalGastos).toBe(0);
  });
});

describe("restoreInventoryFromSale — eliminar venta repone stock", () => {
  it("adds back the sold quantity to matching inventory rows", () => {
    const inventory = [{ productId: "p1", stock: 10 }, { productId: "p2", stock: 5 }];
    const sale = { items: [{ productId: "p1", qty: 3 }] };
    const result = restoreInventoryFromSale(inventory, sale);
    expect(result.find(i => i.productId === "p1").stock).toBe(13);
    expect(result.find(i => i.productId === "p2").stock).toBe(5);
  });
});

describe("reverseProductionInventory — reversa de orden de producción", () => {
  it("returns the input stock and removes the produced output stock", () => {
    const inventory = [{ productId: "raw", stock: 10 }, { productId: "out", stock: 20 }];
    const order = { inputId: "raw", inputUsed: 4, outputId: "out", outputProduced: 8 };
    const result = reverseProductionInventory(inventory, order);
    expect(result.find(i => i.productId === "raw").stock).toBe(14);
    expect(result.find(i => i.productId === "out").stock).toBe(12);
  });

  it("never drives output stock negative", () => {
    const inventory = [{ productId: "out", stock: 3 }];
    const order = { outputId: "out", outputProduced: 8 };
    const result = reverseProductionInventory(inventory, order);
    expect(result.find(i => i.productId === "out").stock).toBe(0);
  });
});

describe("mergeById — aplicar updates realtime sin duplicar filas", () => {
  it("updates an existing row in place", () => {
    const merged = mergeById([{ id: "1", v: "a" }], [{ id: "1", v: "b" }]);
    expect(merged).toEqual([{ id: "1", v: "b" }]);
  });
  it("appends new rows without dropping existing ones", () => {
    const merged = mergeById([{ id: "1", v: "a" }], [{ id: "2", v: "b" }]);
    expect(merged).toEqual([{ id: "1", v: "a" }, { id: "2", v: "b" }]);
  });
});

describe("normalizeCustomers", () => {
  it("strips the seed demo customer ('c1' / Ají Charcas) so it never appears for real accounts", () => {
    expect(normalizeCustomers([{ id: "c1", name: "Ají Charcas" }])).toEqual([]);
  });
  it("falls back to legacy 'nombre' column when 'name' is missing", () => {
    expect(normalizeCustomers([{ id: "c2", nombre: "Don Pedro" }])).toEqual([{ id: "c2", nombre: "Don Pedro", name: "Don Pedro" }]);
  });
});

describe("normalizeUsers", () => {
  it("falls back invalid roles to 'usuario'", () => {
    expect(normalizeUsers([{ id: "u1", role: "superadmin" }])[0].role).toBe("usuario");
  });
  it("keeps valid roles unchanged", () => {
    expect(normalizeUsers([{ id: "u1", role: "admin" }])[0].role).toBe("admin");
  });
});

describe("isWithinPeriod / getPeriodStart", () => {
  it("treats a date from earlier today as within the 'today' period", () => {
    const earlierToday = new Date();
    earlierToday.setHours(0, 30, 0, 0);
    expect(isWithinPeriod(earlierToday.toISOString(), "today")).toBe(true);
  });
  it("treats yesterday as outside the 'today' period", () => {
    const yesterday = new Date(Date.now() - 86400000);
    expect(isWithinPeriod(yesterday.toISOString(), "today")).toBe(false);
  });
  it("returns false for missing/invalid dates instead of throwing", () => {
    expect(isWithinPeriod(null, "today")).toBe(false);
    expect(isWithinPeriod("not-a-date", "today")).toBe(false);
  });
});
