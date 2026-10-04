// Reglas puras de planes (sin Supabase) para poder probarlas.
// Secciones que se pueden incluir o no en un plan (Panel y Ajustes van siempre)
export const MODULOS_PLAN = [
  ["clientes", "Clientes"], ["ventas", "Ventas"], ["deudas", "Deudas"], ["productos", "Productos"],
  ["inventario", "Inventario"], ["caja", "Flujo de caja"], ["gastos", "Gastos"], ["pedidos", "Pedidos y cotizaciones"], ["servicios", "Órdenes de servicio"],
  ["proveedores", "Proveedores y compras"], ["produccion", "Producción"], ["analisis", "Análisis"],
  ["exportar", "Exportar a Excel"], ["actividad", "Registro de actividad"],
];
export const SIEMPRE_INCLUIDOS = ["dashboard", "usuarios", "superadmin"];
// ¿El plan (resultado de mi_plan) incluye este módulo?
export const planIncluye = (plan, modulo) =>
  SIEMPRE_INCLUIDOS.includes(modulo) || !Array.isArray(plan?.modulos) || plan.modulos.includes(modulo);
