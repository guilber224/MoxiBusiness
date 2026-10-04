// Reglas puras de lotes y vencimientos (sin React) para poder probarlas.
import { parseFecha } from "./businessLogic.js";

/** Días que faltan para el vencimiento (negativo = ya venció). null si no tiene fecha. */
export function diasParaVencer(fecha, hoy = new Date()) {
  if (!fecha) return null;
  const v = parseFecha(fecha); const h = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 12);
  return Math.round((new Date(v.getFullYear(), v.getMonth(), v.getDate(), 12) - h) / 86400000);
}

/** Semáforo del vencimiento: vencido, ≤30 días, ≤90 días, vigente o sin fecha */
export function estadoVencimiento(dias) {
  if (dias == null) return { nivel: "sin", badge: "gray", texto: "Sin fecha" };
  if (dias < 0) return { nivel: "vencido", badge: "red", texto: `Vencido hace ${-dias} día${dias === -1 ? "" : "s"}` };
  if (dias === 0) return { nivel: "critico", badge: "red", texto: "Vence hoy" };
  if (dias <= 30) return { nivel: "critico", badge: "amber", texto: `Vence en ${dias} día${dias === 1 ? "" : "s"}` };
  if (dias <= 90) return { nivel: "proximo", badge: "blue", texto: `Vence en ${dias} días` };
  return { nivel: "ok", badge: "green", texto: `Vence en ${Math.round(dias / 30)} meses` };
}

/** Lotes con stock, del que vence primero al último (los "SIN LOTE" sin fecha al final) */
export const ordenarLotes = lotes => [...(lotes || [])].filter(l => l.qty > 0)
  .sort((a, b) => (a.expires || "9999-12-31").localeCompare(b.expires || "9999-12-31") || String(a.createdAt).localeCompare(String(b.createdAt)));
