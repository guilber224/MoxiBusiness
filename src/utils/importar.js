// Lectura de planillas para importar productos y clientes (lógica pura, sin React).
// Reconoce los encabezados aunque vengan con otras palabras, mayúsculas o tildes.

const normalizar = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export const PLANTILLAS = {
  productos: {
    titulo: "productos",
    columnas: [
      { campo: "nombre", encabezado: "Nombre", requerido: true, alias: ["nombre", "producto", "articulo", "item", "nombre del producto", "descripcion del producto"] },
      { campo: "precio", encabezado: "Precio de venta", requerido: true, numero: true, alias: ["precio de venta", "precio venta", "precio", "pvp", "p v p", "precio unitario", "precio publico", "venta"] },
      { campo: "costo", encabezado: "Costo", numero: true, alias: ["costo", "precio de costo", "costo unitario", "precio compra", "precio de compra", "compra"] },
      { campo: "stock", encabezado: "Stock inicial", numero: true, alias: ["stock inicial", "stock", "cantidad", "existencia", "existencias", "inventario", "saldo"] },
      { campo: "stock_minimo", encabezado: "Stock mínimo", numero: true, alias: ["stock minimo", "minimo", "stock min", "alerta"] },
      { campo: "unidad", encabezado: "Unidad", alias: ["unidad", "unidad de medida", "medida", "um", "u m"] },
      { campo: "categoria", encabezado: "Categoría", alias: ["categoria", "rubro", "familia", "grupo", "linea", "tipo"] },
      { campo: "codigo", encabezado: "Código de barras", alias: ["codigo de barras", "codigo", "cod", "barcode", "sku", "ean", "referencia"] },
      { campo: "descripcion", encabezado: "Descripción", alias: ["descripcion", "detalle", "observaciones"] },
      // Variantes: si un producto tiene talla/color/sabor, cada fila es una variante del mismo producto
      { campo: "talla", encabezado: "Talla", atributo: "Talla", alias: ["talla", "talle", "numero de calzado", "medida de prenda"] },
      { campo: "color", encabezado: "Color", atributo: "Color", alias: ["color", "colour"] },
      { campo: "sabor", encabezado: "Sabor", atributo: "Sabor", alias: ["sabor", "aroma", "tamano", "presentacion", "modelo"] },
      // Lotes: cada fila es un lote (un medicamento con 2 lotes va en 2 filas)
      { campo: "lote", encabezado: "Lote", alias: ["lote", "n lote", "nro lote", "numero de lote", "batch"] },
      { campo: "vencimiento", encabezado: "Vencimiento", fecha: true, alias: ["vencimiento", "fecha de vencimiento", "vence", "caducidad", "fecha vencimiento", "f venc", "expira"] },
    ],
    ejemplo: [
      { "Nombre": "Arroz grano de oro 1 kg", "Precio de venta": 12.5, "Costo": 9, "Stock inicial": 40, "Stock mínimo": 5, "Unidad": "bolsa", "Categoría": "Abarrotes", "Código de barras": "7771234500011", "Descripción": "" },
      { "Nombre": "Aceite 900 ml", "Precio de venta": 18, "Costo": 14.5, "Stock inicial": 24, "Stock mínimo": 6, "Unidad": "botella", "Categoría": "Abarrotes", "Código de barras": "", "Descripción": "" },
      { "Nombre": "Polera básica", "Precio de venta": 80, "Costo": 45, "Stock inicial": 5, "Unidad": "unidad", "Categoría": "Ropa", "Talla": "S", "Color": "Rojo" },
      { "Nombre": "Polera básica", "Precio de venta": 80, "Costo": 45, "Stock inicial": 3, "Unidad": "unidad", "Categoría": "Ropa", "Talla": "M", "Color": "Rojo" },
      { "Nombre": "Paracetamol 500 mg", "Precio de venta": 1, "Costo": 0.4, "Stock inicial": 100, "Unidad": "tableta", "Categoría": "Farmacia", "Lote": "L2405", "Vencimiento": "30/11/2026" },
      { "Nombre": "Paracetamol 500 mg", "Precio de venta": 1, "Costo": 0.4, "Stock inicial": 200, "Unidad": "tableta", "Categoría": "Farmacia", "Lote": "L2511", "Vencimiento": "31/05/2027" },
    ],
    limite: 3000,
  },
  clientes: {
    titulo: "clientes",
    columnas: [
      { campo: "nombre", encabezado: "Nombre", requerido: true, alias: ["nombre", "cliente", "razon social", "nombre completo", "nombre del cliente"] },
      { campo: "telefono", encabezado: "Teléfono", alias: ["telefono", "celular", "cel", "whatsapp", "movil", "tel"] },
      { campo: "nit", encabezado: "CI / NIT", alias: ["ci nit", "nit", "ci", "carnet", "documento", "nit ci"] },
      { campo: "direccion", encabezado: "Dirección", alias: ["direccion", "domicilio", "ubicacion"] },
      { campo: "mercado", encabezado: "Mercado / zona", alias: ["mercado zona", "mercado", "zona", "barrio", "ciudad", "sector"] },
      { campo: "notas", encabezado: "Notas", alias: ["notas", "observaciones", "comentarios", "nota"] },
    ],
    ejemplo: [
      { "Nombre": "María Quispe", "Teléfono": "70012345", "CI / NIT": "4567890", "Dirección": "Av. Blanco Galindo km 2", "Mercado / zona": "La Cancha", "Notas": "" },
    ],
    limite: 5000,
  },
};

/** Asocia cada columna de la planilla con un campo. Devuelve { mapa: {indice: campo}, faltan: [encabezados requeridos] } */
export function mapearEncabezados(encabezados, tipo) {
  const cols = PLANTILLAS[tipo].columnas;
  const mapa = {};
  const usados = new Set();
  // Primero coincidencias exactas, luego parciales (para que "Precio de venta" no caiga en "Costo")
  for (const exacto of [true, false]) {
    encabezados.forEach((h, i) => {
      if (mapa[i]) return;
      const n = normalizar(h);
      if (!n) return;
      const col = cols.find(c => !usados.has(c.campo) && c.alias.some(a => (exacto ? n === a : n.includes(a) || a.includes(n) && n.length > 3)));
      if (col) { mapa[i] = col.campo; usados.add(col.campo); }
    });
  }
  const faltan = cols.filter(c => c.requerido && !usados.has(c.campo)).map(c => c.encabezado);
  return { mapa, faltan };
}

// Fecha de Excel (número de serie), "30/11/2026", "2026-11-30" o "11/2026" (fin de mes) → "2026-11-30" (null si vacío, NaN si inválida)
export function aFecha(v) {
  if (v == null || v === "") return null;
  const dos = n => String(n).padStart(2, "0");
  const armar = (y, m, d) => { const f = new Date(y, m - 1, d); return f.getFullYear() === y && f.getMonth() === m - 1 && f.getDate() === d ? `${y}-${dos(m)}-${dos(d)}` : NaN; };
  if (typeof v === "number") { const f = new Date(Math.round((v - 25569) * 86400000)); return Number.isFinite(f.getTime()) && v > 20000 ? armar(f.getUTCFullYear(), f.getUTCMonth() + 1, f.getUTCDate()) : NaN; }
  if (v instanceof Date) return armar(v.getFullYear(), v.getMonth() + 1, v.getDate());
  const t = String(v).trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return armar(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/); if (m) return armar(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  m = t.match(/^(\d{1,2})[/.-](\d{4})$/); if (m) return armar(+m[2], +m[1], new Date(+m[2], +m[1], 0).getDate());
  return NaN;
}

// "1.250,50" · "1,250.50" · "Bs 12" · 12 → número (o null si no hay valor)
export function aNumero(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  let s = String(v).replace(/[^\d,.-]/g, "");
  if (!s) return NaN;
  const coma = s.lastIndexOf(","), punto = s.lastIndexOf(".");
  if (coma > punto) s = s.replace(/\./g, "").replace(",", ".");      // 1.250,50
  else s = s.replace(/,/g, "");                                          // 1,250.50
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/** Convierte las filas (arreglos) en objetos validados: [{ fila, datos, errores: [] }] */
export function prepararFilas(filas, mapa, tipo) {
  const cols = PLANTILLAS[tipo].columnas;
  const porCampo = Object.fromEntries(cols.map(c => [c.campo, c]));
  const vistos = new Map();
  return filas
    .map((celdas, k) => ({ celdas, fila: k + 2 })) // fila 1 = encabezados
    .filter(({ celdas }) => celdas.some(c => String(c ?? "").trim() !== ""))
    .map(({ celdas, fila }) => {
      const datos = {}; const errores = [];
      Object.entries(mapa).forEach(([i, campo]) => {
        const col = porCampo[campo]; const v = celdas[i];
        if (col.numero) {
          const n = aNumero(v);
          if (Number.isNaN(n)) errores.push(`${col.encabezado}: "${v}" no es un número`);
          else if (n != null && n < 0) errores.push(`${col.encabezado} no puede ser negativo`);
          else datos[campo] = n == null ? "" : String(n);
        } else if (col.fecha) {
          const fch = aFecha(v);
          if (Number.isNaN(fch)) errores.push(`${col.encabezado}: "${v}" no es una fecha válida (usa 30/11/2026)`);
          else datos[campo] = fch || "";
        } else datos[campo] = String(v ?? "").trim();
      });
      // Talla/Color/Sabor → variante del producto, en el orden de las columnas
      const variante = cols.filter(c => c.atributo && datos[c.campo]).map(c => ({ nombre: c.atributo, valor: datos[c.campo] }));
      cols.filter(c => c.atributo).forEach(c => delete datos[c.campo]);
      if (variante.length) datos.variante = variante;
      if (!datos.nombre) errores.push("Falta el nombre");
      if (tipo === "productos" && (datos.precio === "" || datos.precio == null) && !errores.some(e => e.startsWith("Precio"))) errores.push("Falta el precio de venta");
      // Repetidos dentro del mismo archivo
      const clave = tipo === "productos" && datos.codigo ? `c:${datos.codigo}`
        : `n:${normalizar(datos.nombre)}|${(datos.variante || []).map(x => normalizar(x.valor)).join("/")}|${normalizar(datos.lote)}|${datos.vencimiento || ""}`;
      if (datos.nombre) {
        if (vistos.has(clave)) errores.push(`Repetido (igual a la fila ${vistos.get(clave)})`);
        else vistos.set(clave, fila);
      }
      return { fila, datos, errores };
    });
}
