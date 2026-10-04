import { describe, it, expect } from "vitest";
import { planIncluye } from "./planes.js";

describe("planIncluye", () => {
  const basico = { plan: "basico", modulos: ["clientes", "ventas", "caja"] };
  it("permite los módulos del plan", () => expect(planIncluye(basico, "ventas")).toBe(true));
  it("bloquea los módulos que el plan no tiene", () => {
    expect(planIncluye(basico, "produccion")).toBe(false);
    expect(planIncluye(basico, "proveedores")).toBe(false);
  });
  it("Panel, Ajustes y Super Admin siempre están disponibles", () => {
    ["dashboard", "usuarios", "superadmin"].forEach(m => expect(planIncluye(basico, m)).toBe(true));
  });
  it("sin lista de módulos (Pro, prueba gratis o plan antiguo) no hay límites", () => {
    expect(planIncluye({ plan: "pro", modulos: null }, "produccion")).toBe(true);
    expect(planIncluye({ plan: "trial" }, "produccion")).toBe(true);
    expect(planIncluye(null, "produccion")).toBe(true);
  });
});
