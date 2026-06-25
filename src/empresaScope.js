import { getLastEmpresaId } from "./utils/storageScope.js";
import { uid } from "./utils/businessLogic.js";

// Empresa-scoped storage: empresa_id activo en este proceso.
// Se actualiza en cuanto el usuario se autentica (ver setCurrentEmpresaId).
let _currentEmpresaId = getLastEmpresaId();

export const getCurrentEmpresaId = () => _currentEmpresaId;
export const setCurrentEmpresaId = (id) => { _currentEmpresaId = id; };

// Detecta si el scope activo es una cuenta Supabase (UUID) vs legacy local.
export const isSupabaseScope = () =>
  Boolean(_currentEmpresaId) &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(_currentEmpresaId);

// Genera id compatible con Supabase: UUID para cuentas Supabase, string corto para modo local.
// IDs no-UUID son rechazados silenciosamente por Supabase (columna tipo uuid) → datos no persisten.
export const generateId = () => isSupabaseScope() ? crypto.randomUUID() : uid();
