// Reglas puras de membresías (estado, vencimientos, fechas) para poder probarlas.
// Las fechas son "YYYY-MM-DD" (día local); la regla de fin es la misma que la del servidor (membresia_fin).

export const ESTADOS_MEMBRESIA = {
  ACTIVA: "Activa", PROGRAMADA: "Programada", POR_VENCER: "Por vencer", VENCIDA: "Vencida",
  AGOTADA: "Sin sesiones", CONGELADA: "Congelada", CANCELADA: "Cancelada",
};
export const UNIDADES = { DIA: ["día", "días"], SEMANA: ["semana", "semanas"], MES: ["mes", "meses"], ANIO: ["año", "años"] };

const aFecha = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const aTexto = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const hoyLocal = () => aTexto(new Date());
export const sumarDiasF = (f, n) => { const d = aFecha(f); d.setDate(d.getDate() + n); return aTexto(d); };
/** Días entre dos fechas (b − a). */
export const diasEntre = (a, b) => Math.round((aFecha(b) - aFecha(a)) / 86400000);

/** Fin del período: inicio + duración − 1 día; en meses cortos vence el último día (31 ene → 28 feb). */
export function finMembresia(inicio, valor, unidad) {
  const v = Number(valor) || 1;
  if (unidad === "DIA" || unidad === "SEMANA") return sumarDiasF(inicio, v * (unidad === "SEMANA" ? 7 : 1) - 1);
  const [y, m, d] = inicio.split("-").map(Number);
  const meses = unidad === "ANIO" ? v * 12 : v;
  const ultimo = new Date(y, m - 1 + meses + 1, 0).getDate();     // días del mes destino
  const destino = new Date(y, m - 1 + meses, Math.min(d, ultimo));
  return d > ultimo ? aTexto(destino) : sumarDiasF(aTexto(destino), -1);
}

/** Estado efectivo de una membresía en una fecha. */
export function estadoMembresia(m, hoy = hoyLocal(), avisoDias = 7) {
  if (m.estado === "CANCELADA") return "CANCELADA";
  if (m.estado === "CONGELADA") return "CONGELADA";
  if (m.inicio > hoy) return "PROGRAMADA";
  if (m.fin < hoy) return "VENCIDA";
  if (m.sesionesTotal && m.sesionesUsadas >= m.sesionesTotal) return "AGOTADA";
  if (diasEntre(hoy, m.fin) < avisoDias) return "POR_VENCER";
  return "ACTIVA";
}
export const puedeIngresar = e => e === "ACTIVA" || e === "POR_VENCER";

/**
 * La membresía que representa al cliente hoy: la vigente (o congelada); si no hay, la próxima programada;
 * si no, la última que tuvo. Las canceladas solo si no hay otra.
 */
export function membresiaActual(lista, hoy = hoyLocal()) {
  if (!lista?.length) return null;
  const vivas = lista.filter(m => m.estado !== "CANCELADA");
  const pool = vivas.length ? vivas : lista;
  const vigentes = pool.filter(m => m.inicio <= hoy && m.fin >= hoy).sort((a, b) => (a.fin < b.fin ? -1 : 1));
  const usable = vigentes.find(m => puedeIngresar(estadoMembresia(m, hoy)));
  if (usable) return usable;
  if (vigentes.length) return vigentes[0];
  const futuras = pool.filter(m => m.inicio > hoy).sort((a, b) => (a.inicio < b.inicio ? -1 : 1));
  if (futuras.length) return futuras[0];
  return [...pool].sort((a, b) => (a.fin < b.fin ? 1 : -1))[0];
}

/** Hasta cuándo tiene cubierto el cliente (fin de la última membresía encadenada). */
export function cubiertoHasta(lista, hoy = hoyLocal()) {
  const f = (lista || []).filter(m => m.estado !== "CANCELADA" && m.fin >= hoy).map(m => m.fin).sort();
  return f.length ? f[f.length - 1] : null;
}

export const duracionTxt = (valor, unidad) => `${valor} ${(UNIDADES[unidad] || ["", ""])[Number(valor) === 1 ? 0 : 1]}`;
export const fechaCorta = f => (f ? f.split("-").reverse().join("/") : "");

/** Mensaje de WhatsApp para recordar la renovación. */
export function textoRenovacion(m, negocio = "nuestro negocio", hoy = hoyLocal()) {
  const dias = diasEntre(hoy, m.fin);
  const cuando = dias < 0 ? `venció el ${fechaCorta(m.fin)}` : dias === 0 ? "vence hoy" : dias === 1 ? "vence mañana" : `vence el ${fechaCorta(m.fin)}`;
  return `Hola ${m.customerName}, le saluda ${negocio}. Su membresía ${m.planNombre} ${cuando}. `
    + "Puede renovarla en recepción o respondiendo este mensaje. ¡Lo esperamos!";
}
