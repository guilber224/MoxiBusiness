// Reglas puras de precios, presentaciones y balanza (sin React) para poder probarlas.

/**
 * Precio que corresponde a una línea del carrito:
 *  · presentación (Caja x12) → su propio precio
 *  · precio por mayor → desde la cantidad mínima configurada
 *  · si no, el precio normal del producto
 */
export function precioSugerido(producto, cantidad, presentacion = null) {
  if (presentacion) return Number(presentacion.price) || 0;
  const qMin = Number(producto?.wholesaleQty) || 0;
  if (qMin > 0 && producto?.wholesalePrice != null && Number(cantidad) >= qMin) return Number(producto.wholesalePrice);
  return Number(producto?.price) || 0;
}

/** Cantidad a partir de un monto: "dame Bs 10 de queso" a Bs 40/kg → 0,25 kg (3 decimales) */
export const cantidadPorMonto = (monto, precio) => (Number(precio) > 0 ? Math.round((Number(monto) / Number(precio)) * 1000) / 1000 : 0);

// ── Balanza ─────────────────────────────────────────────────────────────────
// Las balanzas imprimen etiquetas EAN-13: [prefijo][código del producto][peso o precio][dígito de control].
// Ejemplo con prefijo "20", 5 dígitos de producto y peso en gramos: 20 00123 01250 X → producto 123, 1,250 kg.
export const BALANZA_DEFECTO = { activa: false, prefijos: "20,21,22,23,24,25,26,27,28,29", digitosProducto: 5, valor: "peso" };

// La configuración se guarda en la empresa (todas las cajas usan el mismo formato de etiqueta)
export const leerBalanza = config => ({ ...BALANZA_DEFECTO, ...(config?.balanza || {}) });

/** Lee una etiqueta de balanza. Devuelve { plu, peso } o { plu, monto }, o null si no es de balanza. */
export function leerEtiquetaBalanza(codigo, cfg = BALANZA_DEFECTO) {
  const c = String(codigo || "").trim();
  if (!cfg?.activa || !/^\d{13}$/.test(c)) return null;
  const prefijo = String(cfg.prefijos || "").split(",").map(x => x.trim()).filter(Boolean).find(p => c.startsWith(p));
  if (!prefijo) return null;
  const dp = Math.min(Math.max(Number(cfg.digitosProducto) || 5, 3), 6);
  const plu = c.slice(prefijo.length, prefijo.length + dp);
  const valor = Number(c.slice(prefijo.length + dp, 12));
  if (!plu || !Number.isFinite(valor)) return null;
  return cfg.valor === "precio" ? { plu, monto: valor / 100 } : { plu, peso: valor / 1000 };
}

/** ¿El código del producto corresponde al PLU de la etiqueta? ("00123" = "123" = "PLU-123" no) */
export const coincidePLU = (codigoProducto, plu) => {
  const a = String(codigoProducto || "").trim();
  return /^\d+$/.test(a) && Number(a) === Number(plu);
};
