import { describe, it, expect } from "vitest";
import { mapearEncabezados, aNumero, prepararFilas } from "./importar.js";

describe("mapearEncabezados", () => {
  it("reconoce la plantilla oficial", () => {
    const { mapa, faltan } = mapearEncabezados(["Nombre", "Precio de venta", "Costo", "Stock inicial", "Stock mínimo", "Unidad", "Categoría", "Código de barras"], "productos");
    expect(faltan).toEqual([]);
    expect(Object.values(mapa)).toEqual(["nombre", "precio", "costo", "stock", "stock_minimo", "unidad", "categoria", "codigo"]);
  });
  it("entiende encabezados con otras palabras, tildes y mayúsculas", () => {
    const { mapa, faltan } = mapearEncabezados(["PRODUCTO", "P.V.P", "Precio de compra", "Existencias", "SKU"], "productos");
    expect(faltan).toEqual([]);
    expect(mapa).toEqual({ 0: "nombre", 1: "precio", 2: "costo", 3: "stock", 4: "codigo" });
  });
  it("avisa si falta una columna obligatoria", () => {
    expect(mapearEncabezados(["Nombre", "Stock"], "productos").faltan).toEqual(["Precio de venta"]);
  });
  it("clientes: celular y NIT", () => {
    const { mapa } = mapearEncabezados(["Cliente", "Celular", "NIT"], "clientes");
    expect(mapa).toEqual({ 0: "nombre", 1: "telefono", 2: "nit" });
  });
});

describe("aNumero", () => {
  it("formatos bolivianos e internacionales", () => {
    expect(aNumero("1.250,50")).toBe(1250.5);
    expect(aNumero("1,250.50")).toBe(1250.5);
    expect(aNumero("Bs 12")).toBe(12);
    expect(aNumero("12,5")).toBe(12.5);
    expect(aNumero(8)).toBe(8);
    expect(aNumero("")).toBe(null);
    expect(Number.isNaN(aNumero("abc"))).toBe(true);
  });
});

describe("prepararFilas", () => {
  const mapa = { 0: "nombre", 1: "precio", 2: "stock", 3: "codigo" };
  it("valida y detecta repetidos dentro del archivo", () => {
    const r = prepararFilas([
      ["Arroz", "12,5", "40", "A1"],
      ["", "", "", ""],
      ["Azúcar", "", "3", ""],
      ["Fideo", "abc", "", ""],
      ["Otro arroz", "10", "", "A1"],
      ["Sal", "3", "-1", ""],
    ], mapa, "productos");
    expect(r.map(x => x.fila)).toEqual([2, 4, 5, 6, 7]); // la fila vacía se ignora
    expect(r[0].errores).toEqual([]);
    expect(r[0].datos).toMatchObject({ nombre: "Arroz", precio: "12.5", stock: "40", codigo: "A1" });
    expect(r[1].errores).toContain("Falta el precio de venta");
    expect(r[2].errores[0]).toMatch(/no es un número/);
    expect(r[3].errores[0]).toMatch(/Repetido/);
    expect(r[4].errores[0]).toMatch(/negativo/);
  });
});

describe("fechas, variantes y lotes", async () => {
  const { aFecha } = await import("./importar.js");
  it("lee fechas de Excel y escritas a mano", () => {
    expect(aFecha(46356)).toBe("2026-11-30");          // número de serie de Excel
    expect(aFecha("30/11/2026")).toBe("2026-11-30");
    expect(aFecha("30-11-26")).toBe("2026-11-30");
    expect(aFecha("2026-11-30")).toBe("2026-11-30");
    expect(aFecha("11/2026")).toBe("2026-11-30");      // mes/año: fin de mes
    expect(aFecha("")).toBe(null);
    expect(Number.isNaN(aFecha("31/02/2026"))).toBe(true);
    expect(Number.isNaN(aFecha("pronto"))).toBe(true);
  });
  it("talla y color forman la variante; lotes distintos del mismo producto no son repetidos", () => {
    const { mapa } = mapearEncabezados(["Producto", "Precio", "Stock", "Talla", "Color", "Lote", "Vencimiento"], "productos");
    const r = prepararFilas([
      ["Polera", "80", "5", "S", "Rojo", "", ""],
      ["Polera", "80", "3", "M", "Rojo", "", ""],
      ["Polera", "80", "1", "S", "Rojo", "", ""],
      ["Paracetamol", "1", "100", "", "", "L1", "30/11/2026"],
      ["Paracetamol", "1", "200", "", "", "L2", "31/05/2027"],
      ["Paracetamol", "1", "5", "", "", "L3", "31/13/2027"],
    ], mapa, "productos");
    expect(r[0].datos.variante).toEqual([{ nombre: "Talla", valor: "S" }, { nombre: "Color", valor: "Rojo" }]);
    expect(r[0].datos.talla).toBeUndefined();
    expect(r[1].errores).toEqual([]);
    expect(r[2].errores[0]).toMatch(/Repetido/);
    expect(r[3].datos).toMatchObject({ lote: "L1", vencimiento: "2026-11-30" });
    expect(r[4].errores).toEqual([]);
    expect(r[5].errores[0]).toMatch(/fecha válida/);
  });
});
