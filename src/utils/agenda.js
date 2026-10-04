// Reglas puras de la agenda (horas, semanas, cruces, recordatorios) para poder probarlas.

export const ESTADOS_CITA = {
  PENDIENTE: "Por confirmar", CONFIRMADA: "Confirmada", ATENDIDA: "Atendida", NO_ASISTIO: "No asistió", CANCELADA: "Cancelada",
};
export const CITA_ABIERTA = e => e === "PENDIENTE" || e === "CONFIRMADA";
export const CONFIG_AGENDA = { inicio: "08:00", fin: "20:00", intervalo: 30, profesionales: [] };

const pad = v => String(v).padStart(2, "0");

/** "08:30" → 510 minutos desde medianoche. */
export const aMinutos = hhmm => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || "").trim());
  return m ? Math.min(24 * 60, Number(m[1]) * 60 + Number(m[2])) : 0;
};
/** 510 → "08:30" */
export const aHora = min => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;

/** Configuración válida a partir de lo guardado en la empresa (con valores por defecto). */
export function configAgenda(c) {
  const x = { ...CONFIG_AGENDA, ...(c || {}) };
  let ini = aMinutos(x.inicio), fin = aMinutos(x.fin);
  if (!(fin > ini)) { ini = aMinutos(CONFIG_AGENDA.inicio); fin = aMinutos(CONFIG_AGENDA.fin); }
  const intervalo = [10, 15, 20, 30, 60].includes(Number(x.intervalo)) ? Number(x.intervalo) : 30;
  const profesionales = [...new Set((Array.isArray(x.profesionales) ? x.profesionales : []).map(p => String(p || "").trim()).filter(Boolean))].slice(0, 30);
  return { inicio: aHora(ini), fin: aHora(fin), intervalo, profesionales };
}

/** Horarios disponibles para elegir: ["08:00","08:30",…] (sin incluir la hora de cierre). */
export function horarios(cfg) {
  const c = configAgenda(cfg);
  const out = [];
  for (let m = aMinutos(c.inicio); m < aMinutos(c.fin); m += c.intervalo) out.push(aHora(m));
  return out;
}

/** Fecha local "YYYY-MM-DD" de un Date o ISO. */
export const fechaLocal = d => { const x = d instanceof Date ? d : new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
/** Hora local "HH:MM" de un Date o ISO. */
export const horaLocal = d => { const x = d instanceof Date ? d : new Date(d); return `${pad(x.getHours())}:${pad(x.getMinutes())}`; };
/** "2026-10-06" + "09:30" → Date en la hora local del dispositivo. */
export const unirFechaHora = (fecha, hora) => { const [y, m, d] = fecha.split("-").map(Number); const mins = aMinutos(hora); return new Date(y, m - 1, d, Math.floor(mins / 60), mins % 60); };

/** Suma días a "YYYY-MM-DD". */
export const sumarDias = (fecha, dias) => { const [y, m, d] = fecha.split("-").map(Number); return fechaLocal(new Date(y, m - 1, d + dias)); };
/** Los 7 días (lunes a domingo) de la semana que contiene la fecha. */
export function semanaDe(fecha) {
  const [y, m, d] = fecha.split("-").map(Number);
  const dow = (new Date(y, m - 1, d).getDay() + 6) % 7;  // 0 = lunes
  return Array.from({ length: 7 }, (_, i) => sumarDias(fecha, i - dow));
}
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
/** "martes 6 de octubre" */
export const fechaLarga = fecha => { const [y, m, d] = fecha.split("-").map(Number); return `${DIAS[new Date(y, m - 1, d).getDay()]} ${d} de ${MESES[m - 1]}`; };
export const diaCorto = fecha => { const [y, m, d] = fecha.split("-").map(Number); return `${DIAS[new Date(y, m - 1, d).getDay()].slice(0, 3)} ${d}`; };

/** ¿Dos rangos [inicio, fin) se superponen? */
export const seCruzan = (a, b) => new Date(a.inicio) < new Date(b.fin) && new Date(b.inicio) < new Date(a.fin);

/** Citas del mismo profesional que chocan con la propuesta (ignora la propia y las cerradas sin atender). */
export function cruces(citas, propuesta) {
  const prof = String(propuesta.profesional || "").trim().toLowerCase();
  if (!prof) return [];
  return citas.filter(c => c.id !== propuesta.id && ["PENDIENTE", "CONFIRMADA", "ATENDIDA"].includes(c.estado)
    && String(c.profesional || "").trim().toLowerCase() === prof && seCruzan(c, propuesta));
}

/**
 * Columnas para la vista de un día: dentro de cada profesional, las citas que se superponen
 * se reparten en carriles para que no se tapen. Devuelve [{cita, carril, carriles}].
 */
export function carriles(citas) {
  const orden = [...citas].sort((a, b) => new Date(a.inicio) - new Date(b.inicio) || new Date(b.fin) - new Date(a.fin));
  const out = [];
  let grupo = [], finGrupo = 0;
  const cerrarGrupo = () => {
    const fines = [];
    const asignados = grupo.map(c => {
      let k = fines.findIndex(f => f <= new Date(c.inicio).getTime());
      if (k < 0) { k = fines.length; fines.push(0); }
      fines[k] = new Date(c.fin).getTime();
      return { cita: c, carril: k };
    });
    asignados.forEach(a => out.push({ ...a, carriles: fines.length }));
    grupo = []; finGrupo = 0;
  };
  for (const c of orden) {
    const ini = new Date(c.inicio).getTime();
    if (grupo.length && ini >= finGrupo) cerrarGrupo();
    grupo.push(c); finGrupo = Math.max(finGrupo, new Date(c.fin).getTime());
  }
  if (grupo.length) cerrarGrupo();
  return out;
}

/** Posición vertical de una cita en la grilla del día (en minutos desde la apertura, recortada al horario). */
export function posicion(cita, cfg) {
  const c = configAgenda(cfg);
  const abre = aMinutos(c.inicio), cierra = aMinutos(c.fin);
  const ini = new Date(cita.inicio), fin = new Date(cita.fin);
  let a = ini.getHours() * 60 + ini.getMinutes();
  let b = fechaLocal(fin) !== fechaLocal(ini) ? 24 * 60 : fin.getHours() * 60 + fin.getMinutes();
  a = Math.max(abre, Math.min(cierra, a)); b = Math.max(abre, Math.min(cierra, b));
  return { desde: a - abre, minutos: Math.max(b - a, 0) };
}

/** Número para wa.me (Bolivia: 8 dígitos → 591XXXXXXXX). */
export const waNumero = tel => { const d = String(tel || "").replace(/\D/g, ""); if (!d) return null; return d.length === 8 ? `591${d}` : d; };

/** Texto del recordatorio por WhatsApp. */
export function textoRecordatorio(cita, negocio = "nuestro negocio", hoy = fechaLocal(new Date())) {
  const f = fechaLocal(cita.inicio);
  const cuando = f === hoy ? "hoy" : f === sumarDias(hoy, 1) ? "mañana" : `el ${fechaLarga(f)}`;
  return `Hola ${cita.customerName}, le saluda ${negocio}. Le recordamos su cita ${cuando} a las ${horaLocal(cita.inicio)}`
    + `${cita.servicio ? ` para ${cita.servicio}` : ""}${cita.profesional ? ` con ${cita.profesional}` : ""}. `
    + "Por favor confírmenos su asistencia respondiendo este mensaje. ¡Lo esperamos!";
}
