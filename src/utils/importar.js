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
    ],
    ejemplo: [
      { "Nombre": "Arroz grano de oro 1 kg", "Precio de venta": 12.5, "Costo": 9, "Stock inicial": 40, "Stock mínimo": 5, "Unidad": "bolsa", "Categoría": "Abarrotes", "Código de barras": "7771234500011", "Descripción": "" },
      { "Nombre": "Aceite 900 ml", "Precio de venta": 18, "Costo": 14.5, "Stock inicial": 24, "Stock mínimo": 6, "Unidad": "botella", "Categoría": "Abarrotes", "Código de barras": "", "Descripción": "" },
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
        } else datos[campo] = String(v ?? "").trim();
      });
      if (!datos.nombre) errores.push("Falta el nombre");
      if (tipo === "productos" && (datos.precio === "" || datos.precio == null) && !errores.some(e => e.startsWith("Precio"))) errores.push("Falta el precio de venta");
      // Repetidos dentro del mismo archivo
      const clave = tipo === "productos" && datos.codigo ? `c:${datos.codigo}` : `n:${normalizar(datos.nombre)}`;
      if (datos.nombre) {
        if (vistos.has(clave)) errores.push(`Repetido (igual a la fila ${vistos.get(clave)})`);
        else vistos.set(clave, fila);
      }
      return { fila, datos, errores };
    });
}
