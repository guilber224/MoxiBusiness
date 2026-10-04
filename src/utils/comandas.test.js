import { describe, it, expect } from "vitest";
import { resumenComanda, minutosDesde, tituloComanda, estadoMesa, colaCocina, htmlTicketCocina, htmlPrecuenta } from "./comandas.js";

const it_ = (id, estado, qty, price, extra = {}) => ({ id, name: `P${id}`, estado, qty, price, ventaId: null, enviado: null, ...extra });
const comanda = (items, extra = {}) => ({ id: "c", numero: 7, tipo: "MESA", mesaNombre: "Mesa 4", estado: "ABIERTA", abierta: "2026-10-06T12:00:00Z", items, ...extra });

describe("resumen de la comanda", () => {
  it("ignora anuladas y separa cobrado / por cobrar", () => {
    const r = resumenComanda(comanda([it_(1, "PENDIENTE", 2, 10), it_(2, "ENVIADO", 1, 25.5), it_(3, "ANULADO", 5, 100), it_(4, "LISTO", 1, 4.5, { ventaId: "v" })]));
    expect(r).toMatchObject({ total: 50, porCobrar: 45.5, cobrado: 4.5, pendientes: 1, enCocina: 1, listos: 1, lineas: 3 });
  });
  it("estado de la mesa", () => {
    expect(estadoMesa(null)).toBe("libre");
    expect(estadoMesa(comanda([]))).toBe("ocupada");
    expect(estadoMesa(comanda([it_(1, "LISTO", 1, 10)]))).toBe("listo");
    expect(estadoMesa(comanda([it_(1, "ENVIADO", 1, 10, { ventaId: "v" })]))).toBe("pagada");
  });
});

describe("tiempos y títulos", () => {
  it("minutos transcurridos", () => {
    expect(minutosDesde("2026-10-06T12:00:00Z", Date.parse("2026-10-06T12:17:40Z"))).toBe(17);
  });
  it("título según el tipo", () => {
    expect(tituloComanda(comanda([]))).toBe("Mesa 4");
    expect(tituloComanda(comanda([], { tipo: "LLEVAR", mesaNombre: null, customerName: "Juan" }))).toBe("Para llevar · Juan");
    expect(tituloComanda(comanda([], { tipo: "DELIVERY", mesaNombre: null, customerName: "" }))).toBe("Delivery #7");
  });
});

describe("cola de cocina", () => {
  it("solo comandas abiertas con platos en cocina, la más antigua primero", () => {
    const a = comanda([it_(1, "ENVIADO", 1, 1, { enviado: "2026-10-06T12:10:00Z" }), it_(2, "PENDIENTE", 1, 1)], { id: "a" });
    const b = comanda([it_(3, "LISTO", 1, 1, { enviado: "2026-10-06T12:05:00Z" })], { id: "b" });
    const c = comanda([it_(4, "ENTREGADO", 1, 1)], { id: "c" });
    const d = comanda([it_(5, "ENVIADO", 1, 1, { enviado: "2026-10-06T11:00:00Z" })], { id: "d", estado: "CERRADA" });
    const cola = colaCocina([a, b, c, d]);
    expect(cola.map(x => x.comanda.id)).toEqual(["b", "a"]);
    expect(cola[1].items.map(i => i.id)).toEqual([1]);
  });
});

describe("tickets", () => {
  it("cocina: mesa, cantidades y notas, sin precios", () => {
    const h = htmlTicketCocina({ envio: { numero: 12, tipo: "MESA", mesa: "Mesa <4>", mesero: "Ana", items: [{ nombre: "Pique", cantidad: 2, nota: "sin locoto" }] } });
    expect(h).toContain("Mesa &lt;4&gt;");
    expect(h).toContain("2 ×");
    expect(h).toContain("» sin locoto");
    expect(h).not.toContain("Bs.");
  });
  it("precuenta agrupa líneas iguales y divide entre personas", () => {
    const c = comanda([it_(1, "ENVIADO", 1, 20, { name: "Coca" }), it_(2, "ENVIADO", 2, 20, { name: "Coca" }), it_(3, "ANULADO", 1, 99, { name: "Error" })], { personas: 2 });
    const h = htmlPrecuenta({ comanda: c, config: { businessName: "Pollos Ana" }, propinaPct: 10 });
    expect(h).toContain("3 x");
    expect(h).toContain("60,00");
    expect(h).not.toContain("Error");
    expect(h).toContain("30,00 c/u");
    expect(h).toContain("Propina sugerida (10%)");
    expect(h).toContain("6,00");
  });
});
