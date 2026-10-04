import { describe, it, expect } from "vitest";
import { edadMeses, edadTxt, categoriaAnimal, gananciaDiaria, siguienteCodigo, resumenHato, indicadoresAnio } from "./hato.js";

const hoy = "2026-10-06";
const an = (extra = {}) => ({ id: Math.random().toString(36), codigo: "X", especie: "BOVINO", sexo: "H", castrado: false, partos: 0, estado: "ACTIVO", categoria: null, fechaNacimiento: null, ...extra });

describe("edad", () => {
  it("meses completos y texto", () => {
    expect(edadMeses("2026-01-10", hoy)).toBe(8);
    expect(edadMeses("2026-01-06", hoy)).toBe(9);
    expect(edadTxt("2026-09-20", hoy)).toBe("16 días");
    expect(edadTxt("2024-03-01", hoy)).toBe("2 años 7 m");
    expect(edadTxt(null, hoy)).toBe("—");
  });
});

describe("categoría bovina", () => {
  it("por edad, sexo, castración y partos", () => {
    expect(categoriaAnimal(an({ sexo: "M", fechaNacimiento: "2026-05-01" }), hoy)).toBe("Ternero");
    expect(categoriaAnimal(an({ fechaNacimiento: "2026-05-01" }), hoy)).toBe("Ternera");
    expect(categoriaAnimal(an({ fechaNacimiento: "2025-06-01" }), hoy)).toBe("Vaquilla");
    expect(categoriaAnimal(an({ sexo: "M", fechaNacimiento: "2025-06-01" }), hoy)).toBe("Torillo");
    expect(categoriaAnimal(an({ sexo: "M", castrado: true, fechaNacimiento: "2025-06-01" }), hoy)).toBe("Novillito");
    expect(categoriaAnimal(an({ sexo: "M", castrado: true, fechaNacimiento: "2023-06-01" }), hoy)).toBe("Novillo");
    expect(categoriaAnimal(an({ sexo: "M", fechaNacimiento: "2023-06-01" }), hoy)).toBe("Toro");
    expect(categoriaAnimal(an({ fechaNacimiento: "2024-06-01", partos: 1 }), hoy)).toBe("Vaca");
    expect(categoriaAnimal(an({ fechaNacimiento: "2024-06-01" }), hoy)).toBe("Vaquilla");
    expect(categoriaAnimal(an({ fechaNacimiento: "2023-06-01" }), hoy)).toBe("Vaca");
    expect(categoriaAnimal(an({ categoria: "Vaca de descarte" }), hoy)).toBe("Vaca de descarte");
  });
  it("otras especies", () => {
    expect(categoriaAnimal(an({ especie: "OVINO", fechaNacimiento: "2026-08-01" }), hoy)).toBe("Cordera");
    expect(categoriaAnimal(an({ especie: "PORCINO", sexo: "M", fechaNacimiento: "2024-01-01" }), hoy)).toBe("Verraco");
  });
});

describe("pesos y códigos", () => {
  it("ganancia diaria", () => {
    expect(gananciaDiaria({ peso: 450, pesoAnterior: 420, fechaPeso: "2026-10-01", fechaPesoAnterior: "2026-08-02" })).toBe(0.5);
    expect(gananciaDiaria({ peso: 450, pesoAnterior: null })).toBeNull();
  });
  it("siguiente caravana", () => {
    expect(siguienteCodigo([{ codigo: "V-009" }, { codigo: "V-010" }, { codigo: "T-3" }])).toBe("V-011");
    expect(siguienteCodigo([{ codigo: "15" }, { codigo: "7" }])).toBe("16");
    expect(siguienteCodigo([])).toBe("1");
  });
});

describe("resúmenes", () => {
  it("inventario por categoría y potrero", () => {
    const r = resumenHato([
      an({ potrero: "Norte", fechaNacimiento: "2020-01-01", partos: 3, prenada: true, fechaPartoEst: "2026-10-20", peso: 400 }),
      an({ potrero: "Norte", sexo: "M", fechaNacimiento: "2026-06-01", peso: 100 }),
      an({ potrero: "Sur", sexo: "M", fechaNacimiento: "2020-01-01" }),
      an({ potrero: "Sur", estado: "VENDIDO" }),
    ], hoy);
    expect(r.total).toBe(3);
    expect(r.porCategoria).toEqual({ Vaca: 1, Ternero: 1, Toro: 1 });
    expect(r.matriz.Norte).toEqual({ Vaca: 1, Ternero: 1 });
    expect(r).toMatchObject({ prenadas: 1, partosProximos: 1, pesoPromedio: 250, machos: 2, hembras: 1 });
  });
  it("indicadores del año", () => {
    const r = indicadoresAnio([
      an({ origen: "NACIDO", fechaNacimiento: "2026-03-01" }),
      an({ estado: "MUERTO", fechaBaja: "2026-05-01" }),
      an({ estado: "VENDIDO", fechaBaja: "2026-07-01", precioVenta: 5000 }),
      an({}),
    ], "2026");
    expect(r).toMatchObject({ nacimientos: 1, muertes: 1, vendidos: 1, ingresoVentas: 5000, mortalidad: 25 });
  });
});
