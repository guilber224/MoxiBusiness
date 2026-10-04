// Reglas puras de variantes (sin React) para poder probarlas.

/** Todas las combinaciones de los valores: [{nombre:"Talla",valores:["S","M"]},{nombre:"Color",valores:["Rojo"]}] → [{Talla:"S",Color:"Rojo"}, …] */
export function combinaciones(atributos) {
  const usados = (atributos || []).map(a => ({ nombre: a.nombre.trim(), valores: [...new Set(a.valores.map(v => v.trim()).filter(Boolean))] }))
    .filter(a => a.nombre && a.valores.length);
  if (!usados.length) return [];
  return usados.reduce((acc, a) => acc.flatMap(c => a.valores.map(v => ({ ...c, [a.nombre]: v }))), [{}]);
}

/** "M / Rojo" según el orden de los atributos */
export const nombreVariante = (attrs, atributos) =>
  (atributos || []).map(a => attrs?.[a.nombre]).filter(Boolean).join(" / ");

/** Clave estable para comparar combinaciones sin depender del orden de las claves */
export const claveCombinacion = attrs => JSON.stringify(Object.keys(attrs || {}).sort().map(k => [k, attrs[k]]));

/**
 * Une las combinaciones nuevas con las variantes que ya existen.
 * Las existentes conservan su id, precio, costo y código; las nuevas toman el precio del producto.
 */
export function armarFilas(atributos, existentes, base) {
  const porClave = new Map((existentes || []).map(v => [claveCombinacion(v.attrs), v]));
  return combinaciones(atributos).map(attrs => {
    const ex = porClave.get(claveCombinacion(attrs));
    return ex
      ? { id: ex.id, attrs, nombre: nombreVariante(attrs, atributos), precio: ex.price, costo: ex.cost, codigo: ex.barcode || "", stock: ex.stock, existente: true }
      : { id: null, attrs, nombre: nombreVariante(attrs, atributos), precio: base?.price ?? "", costo: base?.cost ?? "", codigo: "", stock: "", existente: false };
  });
}

/** Variantes que existen pero ya no están en las combinaciones (se darán de baja) */
export function variantesQuitadas(atributos, existentes) {
  const claves = new Set(combinaciones(atributos).map(claveCombinacion));
  return (existentes || []).filter(v => !claves.has(claveCombinacion(v.attrs)));
}

/** Lee el formato guardado en el producto padre (lista ordenada) */
export const atributosDe = grupo => (Array.isArray(grupo?.attrs) ? grupo.attrs.map(a => ({ nombre: a.nombre, valores: [...(a.valores || [])] })) : []);
