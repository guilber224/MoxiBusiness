import { describe, it, expect } from "vitest";
import { precioSugerido, cantidadPorMonto, leerEtiquetaBalanza, coincidePLU } from "./precios.js";

const gaseosa = { price: 5, wholesalePrice: 4.5, wholesaleQty: 12 };

describe("precios", () => {
  it("usa el precio normal por debajo del mínimo por mayor", () => {
    expect(precioSugerido(gaseosa, 11)).toBe(5);
  });
  it("aplica el precio por mayor desde la cantidad mínima", () => {
    expect(precioSugerido(gaseosa, 12)).toBe(4.5);
    expect(precioSugerido(gaseosa, 30)).toBe(4.5);
  });
  it("una presentación usa su propio precio", () => {
    expect(precioSugerido(gaseosa, 2, { name: "Caja x12", factor: 12, price: 55 })).toBe(55);
  });
  it("sin precio por mayor configurado, siempre el normal", () => {
    expect(precioSugerido({ price: 5 }, 100)).toBe(5);
  });
  it("cantidad a partir de un monto", () => {
    expect(cantidadPorMonto(10, 40)).toBe(0.25);
    expect(cantidadPorMonto(15, 0)).toBe(0);
  });
});

describe("balanza", () => {
  const cfg = { activa: true, prefijos: "20,21", digitosProducto: 5, valor: "peso" };
  it("lee producto y peso de una etiqueta EAN-13", () => {
    expect(leerEtiquetaBalanza("2000123012504", cfg)).toEqual({ plu: "00123", peso: 1.25 });
  });
  it("etiquetas por precio", () => {
    expect(leerEtiquetaBalanza("2100045025008", { ...cfg, valor: "precio" })).toEqual({ plu: "00045", monto: 25 });
  });
  it("ignora códigos normales o con la balanza desactivada", () => {
    expect(leerEtiquetaBalanza("7771234500011", cfg)).toBe(null);
    expect(leerEtiquetaBalanza("2000123012504", { ...cfg, activa: false })).toBe(null);
    expect(leerEtiquetaBalanza("200012301250", cfg)).toBe(null);
  });
  it("compara el código del producto con el PLU sin ceros a la izquierda", () => {
    expect(coincidePLU("123", "00123")).toBe(true);
    expect(coincidePLU("00123", "00123")).toBe(true);
    expect(coincidePLU("A123", "00123")).toBe(false);
  });
});
