// Registro en memoria de los cambios locales recientes (altas, ediciones, bajas).
//
// Problema que resuelve: la carga desde Supabase se pide al iniciar sesión y puede tardar
// varios segundos (arranque en frío). Si mientras tanto el usuario agrega un producto, la
// respuesta llega SIN ese producto y reemplazaba la lista → "aparece y al rato desaparece".
// reconcileWithServer() conserva los cambios locales hechos después (o poco antes) de pedir
// los datos, en lugar de pisarlos con una foto vieja del servidor.

export const TRACKED_KEYS = new Set(["customers", "products", "inventory", "sales", "expenses", "movements", "pedidos"]);

// Margen para escrituras que ya estaban en vuelo cuando empezó la carga
const IN_FLIGHT_GRACE_MS = 20000;

const touched = new Map(); // key → Map(id → timestamp)
const deleted = new Map(); // key → Map(id → timestamp)

const idOf = (key, item) => (key === "inventory" ? item?.productId : item?.id);
const bucket = (store, key) => {
  if (!store.has(key)) store.set(key, new Map());
  return store.get(key);
};

// Llamar en cada save(): compara la lista anterior con la nueva y anota qué cambió.
// Los elementos sin cambios conservan la misma referencia, así que la comparación es O(n).
export function recordLocalChange(key, prev, next) {
  if (!TRACKED_KEYS.has(key) || !Array.isArray(next)) return;
  const now = Date.now();
  const t = bucket(touched, key);
  const d = bucket(deleted, key);
  const prevMap = new Map((Array.isArray(prev) ? prev : []).map(item => [idOf(key, item), item]));
  const nextIds = new Set();
  for (const item of next) {
    const id = idOf(key, item);
    if (id == null) continue;
    nextIds.add(id);
    if (prevMap.get(id) !== item) { t.set(id, now); d.delete(id); }
  }
  for (const id of prevMap.keys()) {
    if (id != null && !nextIds.has(id)) { d.set(id, now); t.delete(id); }
  }
}

// Combina la respuesta del servidor con los cambios locales hechos desde `requestedAt`.
export function reconcileWithServer(key, server, local, requestedAt) {
  const t = touched.get(key);
  const d = deleted.get(key);
  if (!t?.size && !d?.size) return server;
  const since = requestedAt - IN_FLIGHT_GRACE_MS;
  const isRecent = (store, id) => (store?.get(id) ?? -Infinity) >= since;
  const localMap = new Map((local || []).map(item => [idOf(key, item), item]));
  const seen = new Set();
  const out = [];
  for (const item of server || []) {
    const id = idOf(key, item);
    seen.add(id);
    if (isRecent(d, id)) continue;                                   // borrado aquí hace poco
    out.push(isRecent(t, id) && localMap.has(id) ? localMap.get(id) : item); // editado aquí hace poco
  }
  for (const [id, item] of localMap) {
    if (!seen.has(id) && isRecent(t, id)) out.push(item);            // creado aquí y aún no está en la respuesta
  }
  return out;
}

export function resetLocalChanges() {
  touched.clear();
  deleted.clear();
}
