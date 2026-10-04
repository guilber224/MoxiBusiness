import { describe, it, expect } from "vitest";
import { combinaciones, nombreVariante, armarFilas, variantesQuitadas, claveCombinacion } from "./variantes.js";

const ATR = [{ nombre: "Talla", valores: ["S", "M"] }, { nombre: "Color", valores: ["Rojo", "Azul"] }];

describe("variantes", () => {
  it("genera todas las combinaciones en orden", () => {
    const c = combinaciones(ATR);
    expect(c).toHaveLength(4);
    expect(c[0]).toEqual({ Talla: "S", Color: "Rojo" });
    expect(c.map(x => nombreVariante(x, ATR))).toEqual(["S / Rojo", "S / Azul", "M / Rojo", "M / Azul"]);
  });
  it("ignora valores vacíos, repetidos y atributos sin valores", () => {
    expect(combinaciones([{ nombre: "Talla", valores: ["S", " S ", ""] }, { nombre: "Color", valores: [] }])).toEqual([{ Talla: "S" }]);
    expect(combinaciones([])).toEqual([]);
  });
  it("la clave no depende del orden de las propiedades", () => {
    expect(claveCombinacion({ Talla: "S", Color: "Rojo" })).toBe(claveCombinacion({ Color: "Rojo", Talla: "S" }));
  });
  it("conserva las variantes existentes y agrega las nuevas con el precio base", () => {
    const existentes = [{ id: "v1", attrs: { Color: "Rojo", Talla: "S" }, price: 55, cost: 30, barcode: "C1", stock: 4 }];
    const filas = armarFilas(ATR, existentes, { price: 50, cost: 28 });
    expect(filas).toHaveLength(4);
    expect(filas[0]).toMatchObject({ id: "v1", precio: 55, codigo: "C1", existente: true });
    expect(filas[1]).toMatchObject({ id: null, nombre: "S / Azul", precio: 50, costo: 28, existente: false });
  });
  it("detecta las variantes que se quitarán", () => {
    const existentes = [{ id: "v1", attrs: { Talla: "L", Color: "Rojo" } }, { id: "v2", attrs: { Talla: "S", Color: "Rojo" } }];
    expect(variantesQuitadas(ATR, existentes).map(v => v.id)).toEqual(["v1"]);
  });
});
