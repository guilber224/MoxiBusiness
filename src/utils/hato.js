// Reglas puras del hato ganadero (categorías, edades, ganancia de peso, resúmenes) para poder probarlas.
// Fechas "YYYY-MM-DD".

export const ESPECIES = { BOVINO: "Bovino", OVINO: "Ovino", CAPRINO: "Caprino", PORCINO: "Porcino", EQUINO: "Equino", BUFALINO: "Bufalino", OTRO: "Otro" };
export const TIPOS_EVENTO = {
  PESAJE: ["⚖️", "Pesaje"], VACUNA: ["💉", "Vacuna"], DESPARASITACION: ["🪱", "Desparasitación"], TRATAMIENTO: ["🩺", "Tratamiento"],
  SERVICIO: ["🐂", "Servicio / inseminación"], PALPACION: ["🤚", "Palpación"], PARTO: ["🐄", "Parto"], DESTETE: ["🍼", "Destete"],
  TRASLADO: ["🚚", "Traslado de potrero"], NOTA: ["📝", "Nota"],
};
export const ESTADOS_ANIMAL = { ACTIVO: "En el hato", VENDIDO: "Vendido", MUERTO: "Muerto", CONSUMO: "Consumo propio", PERDIDO: "Perdido / robado" };

const aFecha = s => { const [y, m, d] = String(s).slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
export const hoyStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
export const diasEntre = (a, b) => Math.round((aFecha(b) - aFecha(a)) / 86400000);

/** Edad en meses completos. */
export function edadMeses(nacimiento, hoy = hoyStr()) {
  if (!nacimiento) return null;
  const a = aFecha(nacimiento), b = aFecha(hoy);
  let m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) m--;
  return Math.max(0, m);
}
export function edadTxt(nacimiento, hoy = hoyStr()) {
  const m = edadMeses(nacimiento, hoy);
  if (m === null) return "—";
  if (m < 1) return `${Math.max(0, diasEntre(nacimiento, hoy))} días`;
  if (m < 24) return `${m} ${m === 1 ? "mes" : "meses"}`;
  const anios = Math.floor(m / 12), resto = m % 12;
  return `${anios} años${resto ? ` ${resto} m` : ""}`;
}

// Nombres por especie: [cría macho, cría hembra, joven macho, joven hembra, adulto macho, adulto macho castrado, adulta hembra] y meses de cada etapa
const NOMBRES = {
  BOVINO:   { n: ["Ternero", "Ternera", "Torillo", "Vaquilla", "Toro", "Novillo", "Vaca"], cria: 8, joven: 24 },
  BUFALINO: { n: ["Bucerro", "Bucerra", "Torete", "Vaquilla", "Búfalo", "Búfalo castrado", "Búfala"], cria: 8, joven: 24 },
  OVINO:    { n: ["Cordero", "Cordera", "Borrego", "Borrega", "Carnero", "Capón", "Oveja"], cria: 4, joven: 12 },
  CAPRINO:  { n: ["Cabrito", "Cabrita", "Chivato", "Chiva", "Chivo", "Capón", "Cabra"], cria: 4, joven: 12 },
  PORCINO:  { n: ["Lechón", "Lechona", "Cerdo de engorde", "Cachorra", "Verraco", "Capón", "Cerda"], cria: 2, joven: 8 },
  EQUINO:   { n: ["Potrillo", "Potranca", "Potro", "Potranca", "Padrillo", "Caballo", "Yegua"], cria: 12, joven: 36 },
};

/** Categoría del animal: la manual si la tiene; si no, por especie, sexo, edad, castración y partos. */
export function categoriaAnimal(a, hoy = hoyStr()) {
  if (a.categoria) return a.categoria;
  const t = NOMBRES[a.especie] || NOMBRES.BOVINO;
  const [crM, crH, jM, jH, adM, adC, adH] = t.n;
  const m = edadMeses(a.fechaNacimiento, hoy);
  const macho = a.sexo === "M";
  if (m === null) {   // sin fecha de nacimiento: por partos o adulto
    if (macho) return a.castrado ? adC : adM;
    return adH;
  }
  if (m < t.cria) return macho ? crM : crH;
  if (macho) return m < t.joven ? (a.castrado && a.especie === "BOVINO" ? "Novillito" : jM) : (a.castrado ? adC : adM);
  return a.partos > 0 || m >= t.joven + 12 ? adH : jH;
}

/** Ganancia diaria de peso entre los dos últimos pesajes (kg/día), o null. */
export function gananciaDiaria(a) {
  if (!(a.peso > 0) || !(a.pesoAnterior > 0) || !a.fechaPeso || !a.fechaPesoAnterior) return null;
  const d = diasEntre(a.fechaPesoAnterior, a.fechaPeso);
  return d > 0 ? Math.round(((a.peso - a.pesoAnterior) / d) * 1000) / 1000 : null;
}

/** Próxima caravana sugerida: el número más alto + 1, conservando el prefijo más usado (p. ej. "V-102"). */
export function siguienteCodigo(animales) {
  let max = 0, prefijo = "", ancho = 0;
  const usos = new Map();
  for (const a of animales || []) {
    const m = /^(.*?)(\d+)$/.exec(String(a.codigo || "").trim());
    if (!m) continue;
    usos.set(m[1], (usos.get(m[1]) || 0) + 1);
    const n = Number(m[2]);
    if (n > max) { max = n; ancho = m[2].length; }
  }
  if (usos.size) prefijo = [...usos].sort((a, b) => b[1] - a[1])[0][0];
  return `${prefijo}${String(max + 1).padStart(ancho, "0")}`;
}

/** Resumen del hato activo: totales, por categoría, por potrero, preñadas, partos próximos y peso promedio. */
export function resumenHato(animales, hoy = hoyStr(), diasParto = 30) {
  const activos = (animales || []).filter(a => a.estado === "ACTIVO");
  const porCategoria = {}, porPotrero = {}, matriz = {};
  let pesos = 0, conPeso = 0, prenadas = 0, partosProximos = 0;
  for (const a of activos) {
    const cat = categoriaAnimal(a, hoy), pot = a.potrero || "Sin potrero";
    porCategoria[cat] = (porCategoria[cat] || 0) + 1;
    porPotrero[pot] = (porPotrero[pot] || 0) + 1;
    matriz[pot] = matriz[pot] || {}; matriz[pot][cat] = (matriz[pot][cat] || 0) + 1;
    if (a.peso > 0) { pesos += a.peso; conPeso++; }
    if (a.prenada) prenadas++;
    if (a.fechaPartoEst && diasEntre(hoy, a.fechaPartoEst) <= diasParto) partosProximos++;
  }
  return { total: activos.length, porCategoria, porPotrero, matriz, prenadas, partosProximos, pesoPromedio: conPeso ? Math.round(pesos / conPeso) : null,
    machos: activos.filter(a => a.sexo === "M").length, hembras: activos.filter(a => a.sexo === "H").length };
}

/** Indicadores del año: nacimientos, muertes (mortalidad %), ventas. */
export function indicadoresAnio(animales, anio = hoyStr().slice(0, 4)) {
  const nac = (animales || []).filter(a => a.origen === "NACIDO" && String(a.fechaNacimiento || "").startsWith(anio)).length;
  const bajasAnio = (animales || []).filter(a => String(a.fechaBaja || "").startsWith(anio));
  const muertes = bajasAnio.filter(a => a.estado === "MUERTO").length;
  const vendidos = bajasAnio.filter(a => a.estado === "VENDIDO");
  const activos = (animales || []).filter(a => a.estado === "ACTIVO").length;
  const base = activos + bajasAnio.length;
  return { nacimientos: nac, muertes, mortalidad: base ? Math.round((muertes / base) * 1000) / 10 : 0, vendidos: vendidos.length,
    ingresoVentas: vendidos.reduce((s, a) => s + (a.precioVenta || 0), 0) };
}
