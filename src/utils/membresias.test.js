import { describe, it, expect } from "vitest";
import { finMembresia, estadoMembresia, membresiaActual, cubiertoHasta, diasEntre, duracionTxt, textoRenovacion, puedeIngresar } from "./membresias.js";

const m = (id, inicio, fin, extra = {}) => ({ id, inicio, fin, estado: "ACTIVA", sesionesTotal: null, sesionesUsadas: 0, customerName: "Ana", planNombre: "Mensual", ...extra });

describe("fecha de fin (igual que el servidor)", () => {
  it("meses: mismo día − 1, y último día en meses cortos", () => {
    expect(finMembresia("2026-10-05", 1, "MES")).toBe("2026-11-04");
    expect(finMembresia("2026-01-31", 1, "MES")).toBe("2026-02-28");
    expect(finMembresia("2026-03-31", 1, "MES")).toBe("2026-04-30");
    expect(finMembresia("2026-03-01", 1, "MES")).toBe("2026-03-31");
    expect(finMembresia("2026-11-15", 3, "MES")).toBe("2027-02-14");
  });
  it("días, semanas y años", () => {
    expect(finMembresia("2026-10-05", 1, "DIA")).toBe("2026-10-05");
    expect(finMembresia("2026-10-05", 2, "SEMANA")).toBe("2026-10-18");
    expect(finMembresia("2028-02-29", 1, "ANIO")).toBe("2029-02-28");
    expect(finMembresia("2026-10-05", 1, "ANIO")).toBe("2027-10-04");
  });
});

describe("estado", () => {
  const hoy = "2026-10-10";
  it("según fechas y sesiones", () => {
    expect(estadoMembresia(m("a", "2026-10-01", "2026-10-31"), hoy)).toBe("ACTIVA");
    expect(estadoMembresia(m("a", "2026-10-01", "2026-10-15"), hoy)).toBe("POR_VENCER");
    expect(estadoMembresia(m("a", "2026-09-01", "2026-10-09"), hoy)).toBe("VENCIDA");
    expect(estadoMembresia(m("a", "2026-10-11", "2026-11-10"), hoy)).toBe("PROGRAMADA");
    expect(estadoMembresia(m("a", "2026-10-01", "2026-10-31", { sesionesTotal: 8, sesionesUsadas: 8 }), hoy)).toBe("AGOTADA");
    expect(estadoMembresia(m("a", "2026-10-01", "2026-10-31", { estado: "CONGELADA" }), hoy)).toBe("CONGELADA");
    expect(puedeIngresar("POR_VENCER")).toBe(true);
    expect(puedeIngresar("AGOTADA")).toBe(false);
  });
});

describe("membresía actual del cliente", () => {
  const hoy = "2026-10-10";
  it("prefiere la vigente; si no, la próxima; si no, la última", () => {
    const vencida = m("v", "2026-08-01", "2026-08-31");
    const vigente = m("g", "2026-10-01", "2026-10-31");
    const futura = m("f", "2026-11-01", "2026-11-30");
    expect(membresiaActual([vencida, futura, vigente], hoy).id).toBe("g");
    expect(membresiaActual([vencida, futura], hoy).id).toBe("f");
    expect(membresiaActual([vencida, m("w", "2026-09-01", "2026-09-30")], hoy).id).toBe("w");
    expect(membresiaActual([m("c", "2026-10-01", "2026-10-31", { estado: "CANCELADA" }), vencida], hoy).id).toBe("v");
    expect(membresiaActual([], hoy)).toBeNull();
  });
  it("si una vigente se agotó, usa otra vigente con sesiones", () => {
    const agotada = m("x", "2026-10-01", "2026-10-20", { sesionesTotal: 4, sesionesUsadas: 4 });
    const otra = m("y", "2026-10-05", "2026-11-04");
    expect(membresiaActual([agotada, otra], hoy).id).toBe("y");
  });
  it("cubierto hasta: la última renovación", () => {
    expect(cubiertoHasta([m("a", "2026-10-01", "2026-10-31"), m("b", "2026-11-01", "2026-11-30"), m("c", "2026-12-01", "2026-12-31", { estado: "CANCELADA" })], hoy)).toBe("2026-11-30");
  });
});

describe("textos", () => {
  it("duración y días", () => {
    expect(duracionTxt(1, "MES")).toBe("1 mes");
    expect(duracionTxt(3, "MES")).toBe("3 meses");
    expect(diasEntre("2026-10-30", "2026-11-02")).toBe(3);
  });
  it("recordatorio de renovación", () => {
    expect(textoRenovacion(m("a", "2026-10-01", "2026-10-11"), "Gym Power", "2026-10-10")).toContain("vence mañana");
    expect(textoRenovacion(m("a", "2026-09-01", "2026-09-30"), "Gym Power", "2026-10-10")).toContain("venció el 30/09/2026");
  });
});
