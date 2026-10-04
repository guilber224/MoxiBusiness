import { describe, it, expect } from "vitest";
import { diasParaVencer, estadoVencimiento, ordenarLotes } from "./lotes.js";

const HOY = new Date(2026, 9, 5, 22, 30); // 5 oct 2026, de noche (no debe cambiar el día)

describe("lotes", () => {
  it("cuenta los días en fecha local", () => {
    expect(diasParaVencer("2026-10-05", HOY)).toBe(0);
    expect(diasParaVencer("2026-10-06", HOY)).toBe(1);
    expect(diasParaVencer("2026-10-01", HOY)).toBe(-4);
    expect(diasParaVencer(null, HOY)).toBe(null);
  });
  it("semáforo de vencimiento", () => {
    expect(estadoVencimiento(-4).nivel).toBe("vencido");
    expect(estadoVencimiento(0).texto).toBe("Vence hoy");
    expect(estadoVencimiento(20).nivel).toBe("critico");
    expect(estadoVencimiento(60).nivel).toBe("proximo");
    expect(estadoVencimiento(200).nivel).toBe("ok");
    expect(estadoVencimiento(null).nivel).toBe("sin");
  });
  it("ordena del que vence primero; sin fecha al final; omite los vacíos", () => {
    const r = ordenarLotes([
      { id: "a", expires: "2026-12-01", qty: 3 }, { id: "sin", expires: null, qty: 2 },
      { id: "b", expires: "2026-11-01", qty: 1 }, { id: "vacio", expires: "2026-10-10", qty: 0 },
    ]);
    expect(r.map(l => l.id)).toEqual(["b", "a", "sin"]);
  });
});
