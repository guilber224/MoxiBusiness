import { describe, it, expect } from "vitest";
import {
  aMinutos, aHora, configAgenda, horarios, semanaDe, sumarDias, fechaLarga, unirFechaHora, fechaLocal, horaLocal,
  seCruzan, cruces, carriles, posicion, waNumero, textoRecordatorio,
} from "./agenda.js";

const iso = (f, h) => unirFechaHora(f, h).toISOString();
const cita = (id, h1, h2, extra = {}) => ({ id, inicio: iso("2026-10-06", h1), fin: iso("2026-10-06", h2), estado: "PENDIENTE", ...extra });

describe("horas y configuración", () => {
  it("convierte horas y minutos", () => {
    expect(aMinutos("08:30")).toBe(510);
    expect(aHora(510)).toBe("08:30");
    expect(aMinutos("basura")).toBe(0);
  });
  it("corrige configuraciones inválidas", () => {
    expect(configAgenda(null)).toEqual({ inicio: "08:00", fin: "20:00", intervalo: 30, profesionales: [] });
    expect(configAgenda({ inicio: "18:00", fin: "09:00", intervalo: 7, profesionales: [" Ana ", "Ana", "", "Luis"] }))
      .toEqual({ inicio: "08:00", fin: "20:00", intervalo: 30, profesionales: ["Ana", "Luis"] });
  });
  it("genera los horarios sin la hora de cierre", () => {
    expect(horarios({ inicio: "09:00", fin: "11:00", intervalo: 30 })).toEqual(["09:00", "09:30", "10:00", "10:30"]);
  });
});

describe("fechas", () => {
  it("la semana va de lunes a domingo", () => {
    const s = semanaDe("2026-10-08"); // jueves
    expect(s[0]).toBe("2026-10-05");
    expect(s[6]).toBe("2026-10-11");
    expect(semanaDe("2026-10-11")[0]).toBe("2026-10-05"); // domingo pertenece a la misma semana
  });
  it("suma días cruzando meses", () => {
    expect(sumarDias("2026-10-31", 1)).toBe("2026-11-01");
    expect(sumarDias("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("fecha larga en español", () => {
    expect(fechaLarga("2026-10-06")).toBe("martes 6 de octubre");
  });
  it("une fecha y hora en hora local", () => {
    const d = unirFechaHora("2026-10-06", "09:45");
    expect(fechaLocal(d)).toBe("2026-10-06");
    expect(horaLocal(d)).toBe("09:45");
  });
});

describe("cruces de horario", () => {
  it("rangos contiguos no se cruzan", () => {
    expect(seCruzan(cita("a", "09:00", "09:30"), cita("b", "09:30", "10:00"))).toBe(false);
    expect(seCruzan(cita("a", "09:00", "10:00"), cita("b", "09:30", "10:30"))).toBe(true);
  });
  it("solo cuenta el mismo profesional y citas activas", () => {
    const citas = [
      cita("1", "09:00", "10:00", { profesional: "Ana" }),
      cita("2", "09:00", "10:00", { profesional: "Luis" }),
      cita("3", "09:00", "10:00", { profesional: "ana", estado: "CANCELADA" }),
    ];
    expect(cruces(citas, cita("n", "09:30", "10:30", { profesional: " ANA " })).map(c => c.id)).toEqual(["1"]);
    expect(cruces(citas, cita("1", "09:30", "10:30", { profesional: "Ana" }))).toEqual([]); // ella misma
    expect(cruces(citas, cita("n", "09:30", "10:30"))).toEqual([]); // sin profesional
  });
});

describe("vista del día", () => {
  it("reparte en carriles las citas superpuestas", () => {
    const r = carriles([cita("a", "09:00", "10:00"), cita("b", "09:30", "10:30"), cita("c", "10:00", "11:00"), cita("d", "12:00", "12:30")]);
    const por = Object.fromEntries(r.map(x => [x.cita.id, x]));
    expect(por.a.carril).toBe(0);
    expect(por.b.carril).toBe(1);
    expect(por.c.carril).toBe(0);           // reutiliza el carril de "a"
    expect(por.a.carriles).toBe(2);
    expect(por.d).toMatchObject({ carril: 0, carriles: 1 });
  });
  it("posición recortada al horario de atención", () => {
    expect(posicion(cita("a", "09:00", "10:30"), { inicio: "08:00", fin: "20:00" })).toEqual({ desde: 60, minutos: 90 });
    expect(posicion(cita("a", "07:00", "08:30"), { inicio: "08:00", fin: "20:00" })).toEqual({ desde: 0, minutos: 30 });
  });
});

describe("recordatorio", () => {
  it("número de WhatsApp boliviano", () => {
    expect(waNumero("7001-1122")).toBe("59170011122");
    expect(waNumero("")).toBeNull();
  });
  it("texto con hoy / mañana / fecha", () => {
    const c = { customerName: "Ana", inicio: iso("2026-10-07", "15:00"), servicio: "Corte", profesional: "Luis" };
    expect(textoRecordatorio(c, "Barbería X", "2026-10-06")).toContain("mañana a las 15:00 para Corte con Luis");
    expect(textoRecordatorio(c, "Barbería X", "2026-10-07")).toContain("hoy a las 15:00");
    expect(textoRecordatorio(c, "Barbería X", "2026-10-01")).toContain("el miércoles 7 de octubre");
  });
});
