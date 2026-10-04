// Acceso a Supabase. Lecturas por tabla (RLS filtra por empresa) y escrituras de negocio
// mediante funciones del servidor (una transacción cada una). Todos los errores salen con un
// mensaje en español listo para mostrar al usuario.
import { supabase } from "../lib/supabaseClient";
import {
  PRODUCTO_COLS, LOTE_COLS, toLote, toOrdenServicio, toCita, toMesa, toComanda, COMANDA_SELECT, toMembresiaPlan, toMembresia, toAsistencia, PRESENTACION_COLS, toPresentacion, CLIENTE_COLS, VENTA_SELECT, GASTO_COLS, MOV_COLS, COMPRA_SELECT, EMPRESA_COLS,
  toProduct, toCategory, toCustomer, toSale, toExpense, toMovement, toSupplier, toPurchase,
  toFormula, toOrder, toConfig, toUser, toActivity,
  fromProduct, fromCustomer, fromExpense, fromSupplier, fromFormula, fromConfig,
} from "./mappers.js";

export class ApiError extends Error {}

export const mensajeError = (e) => {
  const msg = String(e?.message || e || "");
  if (/failed to fetch|network|load failed|timeout|ERR_INTERNET/i.test(msg)) return "Sin conexión con el servidor. Revisa tu internet e intenta de nuevo.";
  if (/JWT|not authenticated|401/i.test(msg)) return "Tu sesión expiró. Vuelve a iniciar sesión.";
  if (/duplicate key.*codigo/i.test(msg)) return "Ya existe un producto con ese código de barras.";
  if (/duplicate key.*categorias/i.test(msg)) return "Ya existe una categoría con ese nombre.";
  if (/violates row-level security|permission denied|42501/i.test(msg)) return "No tienes permiso para hacer esta operación.";
  if (/violates foreign key/i.test(msg)) return "No se puede completar: el registro está siendo usado en otro lugar.";
  if (/check constraint/i.test(msg)) return "Algún dato no es válido. Revisa los montos y cantidades.";
  return msg.replace(/^.*?ERROR:\s*/, "") || "Ocurrió un error inesperado.";
};

const ok = ({ data, error }) => { if (error) throw new ApiError(mensajeError(error)); return data; };
const rpc = async (fn, args) => ok(await supabase.rpc(fn, args));

const inicioDeHoy = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); };
const desdeMeses = (m) => { const d = new Date(); d.setMonth(d.getMonth() - m); return d.toISOString(); };

// ── Carga completa (en paralelo; cada parte falla de forma independiente) ────
// Supabase devuelve como máximo 1000 filas por consulta: los catálogos grandes se traen por páginas.
// (orden estable por nombre + id para no saltar ni repetir filas entre páginas)
async function todasLasFilas(crear, tam = 1000, max = 20000) {
  // Primera página + total; si hay más, el resto se pide en paralelo (no una tras otra)
  const primera = await crear(true).range(0, tam - 1);
  if (primera.error) return { data: null, error: primera.error };
  const total = Math.min(primera.count ?? (primera.data || []).length, max);
  if (total <= tam) return { data: primera.data || [], error: null };
  const resto = await Promise.all(Array.from({ length: Math.ceil(total / tam) - 1 }, (_, k) => crear(false).range((k + 1) * tam, (k + 2) * tam - 1)));
  const err = resto.find(r => r.error);
  if (err) return { data: null, error: err.error };
  return { data: [...(primera.data || []), ...resto.flatMap(r => r.data || [])], error: null };
}

export async function cargarTodo(empresaId) {
  const q = {
    config:     supabase.from("empresas").select(EMPRESA_COLS).eq("id", empresaId).maybeSingle(),
    products:   todasLasFilas(t => supabase.from("productos").select(PRODUCTO_COLS, t ? { count: "exact" } : undefined).eq("activo", true).order("nombre").order("id")),
    categories: supabase.from("categorias").select("id,nombre").eq("tipo", "PRODUCTO").order("nombre"),
    customers:  todasLasFilas(t => supabase.from("clientes").select(CLIENTE_COLS, t ? { count: "exact" } : undefined).eq("activo", true).order("nombre").order("id")),
    sales:      supabase.from("ventas").select(VENTA_SELECT).gte("fecha", desdeMeses(12)).order("fecha", { ascending: false }).limit(2000),
    expenses:   supabase.from("gastos").select(GASTO_COLS).gte("fecha", desdeMeses(12).slice(0, 10)).order("fecha", { ascending: false }).limit(2000),
    movements:  supabase.from("movimientos_inventario").select(MOV_COLS).order("created_at", { ascending: false }).limit(300),
    pedidos:    supabase.from("pedidos").select("*").order("createdAt", { ascending: false }).limit(1000),
    suppliers:  supabase.from("proveedores").select("*").eq("activo", true).order("nombre"),
    purchases:  supabase.from("compras").select(COMPRA_SELECT).order("created_at", { ascending: false }).limit(500),
    formulas:   supabase.from("formulas_produccion").select("*").eq("activo", true).order("nombre"),
    orders:     supabase.from("ordenes_produccion").select("*").order("created_at", { ascending: false }).limit(500),
    users:      supabase.from("usuarios").select("id,nombre,email,role,activo,created_at").order("nombre"),
    activityLogs: supabase.from("activity_logs").select("id,usuario_id,usuario_nombre,accion,detalle,created_at").order("created_at", { ascending: false }).limit(200),
    caja:       supabase.rpc("caja_resumen"),
    presentaciones: todasLasFilas(t => supabase.from("producto_presentaciones").select(PRESENTACION_COLS, t ? { count: "exact" } : undefined).eq("activo", true).order("orden").order("id")),
    // Órdenes abiertas + las cerradas del último año
    servicios:  supabase.from("ordenes_servicio").select("*").or(`estado.not.in.(ENTREGADO,CANCELADO),created_at.gte."${desdeMeses(12)}"`).order("created_at", { ascending: false }).limit(1000),
    // Citas de los últimos 2 meses y todas las futuras (las más antiguas se piden al navegar)
    citas:      todasLasFilas(t => supabase.from("citas").select("*", t ? { count: "exact" } : undefined).gte("inicio", desdeMeses(2)).order("inicio").order("id")),
    membresiaPlanes: supabase.from("membresia_planes").select("*").eq("activo", true).order("orden").limit(200),
    // Membresías vigentes, futuras, congeladas y las vencidas de los últimos 3 meses (para renovar)
    membresias: todasLasFilas(t => supabase.from("membresias").select("*", t ? { count: "exact" } : undefined).or(`fin.gte.${desdeMeses(3).slice(0, 10)},estado.eq.CONGELADA`).order("fin", { ascending: false }).order("id")),
    asistencias: supabase.from("membresia_asistencias").select("*").gte("fecha", inicioDeHoy()).order("fecha", { ascending: false }).limit(1000),
    mesas:      supabase.from("mesas").select("*").eq("activo", true).order("orden").order("nombre").limit(500),
    // Comandas abiertas y las de hoy (las cerradas antiguas ya están en Ventas)
    comandas:   supabase.from("comandas").select(COMANDA_SELECT).or(`estado.eq.ABIERTA,abierta_at.gte."${inicioDeHoy()}"`).order("abierta_at", { ascending: false }).limit(500),
    lotes:      todasLasFilas(t => supabase.from("lotes").select(LOTE_COLS, t ? { count: "exact" } : undefined).gt("cantidad", 0).order("vencimiento", { ascending: true, nullsFirst: false }).order("id")),
  };
  const mapeo = {
    config: r => (r ? toConfig(r) : null), products: rs => rs.map(toProduct), categories: rs => rs.map(toCategory),
    customers: rs => rs.map(toCustomer), sales: rs => rs.map(toSale), expenses: rs => rs.map(toExpense),
    movements: rs => rs.map(toMovement), pedidos: rs => rs, suppliers: rs => rs.map(toSupplier),
    purchases: rs => rs.map(toPurchase), formulas: rs => rs.map(toFormula), orders: rs => rs.map(toOrder),
    users: rs => rs.map(toUser), activityLogs: rs => rs.map(toActivity), caja: r => r || null, lotes: rs => rs.map(toLote), servicios: rs => rs.map(toOrdenServicio), citas: rs => rs.map(toCita), mesas: rs => rs.map(toMesa), membresiaPlanes: rs => rs.map(toMembresiaPlan), membresias: rs => rs.map(toMembresia), asistencias: rs => rs.map(toAsistencia), comandas: rs => rs.map(toComanda), presentaciones: rs => rs.map(toPresentacion),
  };
  const keys = Object.keys(q);
  const results = await Promise.allSettled(keys.map(k => q[k]));
  const data = {}; const errores = {};
  results.forEach((res, i) => {
    const k = keys[i];
    if (res.status === "fulfilled" && !res.value.error) {
      const v = mapeo[k](res.value.data ?? (k === "config" || k === "caja" ? null : []));
      if (!(k === "config" && v === null)) data[k] = v;
    }
    else errores[k] = mensajeError(res.status === "rejected" ? res.reason : res.value.error);
  });
  return { data, errores };
}

// ── Productos y categorías ─────────────────────────────────────────────────
export const productos = {
  // Variantes (talla, color…): atributos = [{ nombre, valores: [] }], variantes = [{ id?, atributos: {}, precio, costo, codigo, stock }]
  async guardarVariantes(padreId, atributos, variantes) {
    return rpc("producto_variantes_guardar", { p_padre: padreId, p_atributos: atributos, p_variantes: variantes });
  },
  async crear(p, empresaId) {
    return toProduct(ok(await supabase.from("productos").insert({ ...fromProduct(p), empresa_id: empresaId }).select(PRODUCTO_COLS).single()));
  },
  async actualizar(id, p) {
    return toProduct(ok(await supabase.from("productos").update(fromProduct(p)).eq("id", id).select(PRODUCTO_COLS).single()));
  },
  // Baja lógica: el producto conserva su historial de ventas y kardex
  async eliminar(id) { ok(await supabase.from("productos").update({ activo: false }).eq("id", id)); },
  async subirImagen(file, empresaId, productoId) {
    const blob = await comprimirImagen(file, 800);
    const path = `${empresaId}/${productoId || crypto.randomUUID()}.jpg`;
    ok(await supabase.storage.from("productos").upload(path, blob, { upsert: true, contentType: "image/jpeg", cacheControl: "31536000" }));
    return `${supabase.storage.from("productos").getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
  },
};
export const categorias = {
  async crear(nombre, empresaId) {
    return toCategory(ok(await supabase.from("categorias").insert({ nombre: nombre.trim(), tipo: "PRODUCTO", empresa_id: empresaId }).select("id,nombre").single()));
  },
  async eliminar(id) { ok(await supabase.from("categorias").delete().eq("id", id)); },
};

// ── Clientes ───────────────────────────────────────────────────────────────
export const clientes = {
  async crear(c, empresaId) {
    return toCustomer(ok(await supabase.from("clientes").insert({ ...fromCustomer(c), empresa_id: empresaId }).select(CLIENTE_COLS).single()));
  },
  async actualizar(id, c) {
    return toCustomer(ok(await supabase.from("clientes").update(fromCustomer(c)).eq("id", id).select(CLIENTE_COLS).single()));
  },
  async eliminar(id) { ok(await supabase.from("clientes").update({ activo: false }).eq("id", id)); },
};

// ── Ventas ─────────────────────────────────────────────────────────────────
// venta: { id?, customerId, items:[{productId,name,unit,qty,unitPrice}], discount, discountType,
//          payments:[{amount, method, reference?}], notes, date?, pedidoId? }
export const ventas = {
  async registrar(v) {
    const p = {
      id: v.id,
      cliente_id: v.customerId && v.customerId !== "__guest__" ? v.customerId : null,
      cliente_nombre: v.customerName || null,
      fecha: v.date || null,
      notas: v.notes || null,
      pedido_id: v.pedidoId || null,
      descuento: Number(v.discount) || 0,
      descuento_tipo: v.discountType === "pct" ? "pct" : "monto",
      items: v.items.map(i => ({ producto_id: i.productId || null, nombre: i.name, unidad: i.unit, cantidad: Number(i.qty), precio_unitario: Number(i.unitPrice),
        ...(i.factor && Number(i.factor) !== 1 ? { factor: Number(i.factor), presentacion: i.presentation || null } : {}) })),
      pagos: (v.payments || []).filter(x => Number(x.amount) > 0).map(x => ({ monto: Number(x.amount), metodo: x.method, referencia: x.reference || null })),
    };
    return toSale(await rpc("venta_registrar", { p }));
  },
  async cobrar(ventaId, monto, metodo = "efectivo", referencia = null) {
    return toSale(await rpc("venta_cobrar", { p_venta_id: ventaId, p_monto: Number(monto), p_metodo: metodo, p_referencia: referencia }));
  },
  async anular(ventaId, motivo) { return toSale(await rpc("venta_anular", { p_venta_id: ventaId, p_motivo: motivo || null })); },
  async obtener(ventaId) { return toSale(await rpc("venta_obtener", { p_id: ventaId })); },
};

// ── Inventario ─────────────────────────────────────────────────────────────
export const presentaciones = {
  async guardar(p, empresaId) {
    const fila = { producto_id: p.productId, nombre: p.name.trim(), factor: Number(p.factor), precio: Number(p.price) || 0, codigo: (p.barcode || "").trim() || null, orden: p.order || 0 };
    const q = p.id ? supabase.from("producto_presentaciones").update(fila).eq("id", p.id) : supabase.from("producto_presentaciones").insert({ ...fila, empresa_id: empresaId });
    return toPresentacion(ok(await q.select(PRESENTACION_COLS).single()));
  },
  async eliminar(id) { ok(await supabase.from("producto_presentaciones").update({ activo: false }).eq("id", id)); },
};

// Órdenes de servicio: todas las escrituras pasan por funciones del servidor
const itemsOrden = items => (items || []).map(i => ({ producto_id: i.productId || null, nombre: i.name, cantidad: Number(i.qty), precio: Number(i.price) }));
export const servicios = {
  async obtener(id) { return toOrdenServicio(ok(await supabase.from("ordenes_servicio").select("*").eq("id", id).single())); },
  async eventos(id) { return ok(await supabase.from("ordenes_servicio_eventos").select("estado,nota,usuario_nombre,created_at").eq("orden_id", id).order("created_at")); },
  async crear(o) {
    return toOrdenServicio(await rpc("servicio_crear", { p: {
      cliente_id: o.customerId || null, cliente_nombre: o.customerName, cliente_telefono: o.phone, equipo: o.equipo, marca: o.marca, modelo: o.modelo,
      serie: o.serie, accesorios: o.accesorios, falla: o.falla, presupuesto: Number(o.presupuesto) || 0, anticipo: Number(o.anticipo) || 0,
      anticipo_metodo: o.anticipoMetodo, tecnico: o.tecnico, fecha_prometida: o.prometido || null, garantia_dias: o.garantiaDias === "" ? null : o.garantiaDias,
      notas: o.notas, items: itemsOrden(o.items),
    } }));
  },
  async actualizar(id, o) {
    const p = {};
    ["equipo", "marca", "modelo", "serie", "accesorios", "falla", "diagnostico", "tecnico", "notas"].forEach(k => { if (k in o) p[k] = o[k]; });
    if ("phone" in o) p.cliente_telefono = o.phone;
    if ("presupuesto" in o) p.presupuesto = Number(o.presupuesto) || 0;
    if ("prometido" in o) p.fecha_prometida = o.prometido || null;
    if ("garantiaDias" in o) p.garantia_dias = o.garantiaDias === "" ? null : o.garantiaDias;
    if ("items" in o) p.items = itemsOrden(o.items);
    return toOrdenServicio(await rpc("servicio_actualizar", { p_id: id, p }));
  },
  async estado(id, estado, nota) { return toOrdenServicio(await rpc("servicio_estado", { p_id: id, p_estado: estado, p_nota: nota || null })); },
  async entregar(id, pagos) { const r = await rpc("servicio_entregar", { p_id: id, p_pagos: (pagos || []).map(x => ({ monto: Number(x.amount), metodo: x.method })) }); return { orden: toOrdenServicio(r), venta: r.venta || null }; },
  async cancelar(id, motivo, devolver) { return toOrdenServicio(await rpc("servicio_cancelar", { p_id: id, p_motivo: motivo, p_devolver_anticipo: !!devolver })); },
};

// Membresías: todas las escrituras pasan por funciones del servidor
export const membresias = {
  async guardarPlan(p) {
    return toMembresiaPlan(await rpc("membresia_plan_guardar", { p: { id: p.id || null, nombre: p.name, precio: Number(p.price), duracion_valor: Number(p.duracionValor),
      duracion_unidad: p.duracionUnidad, sesiones: p.sesiones ? Number(p.sesiones) : null, ingresos_por_dia: Number(p.ingresosPorDia) || 1, descripcion: p.descripcion } }));
  },
  async eliminarPlan(id) { await rpc("membresia_plan_eliminar", { p_id: id }); },
  async vender(v) {
    const r = await rpc("membresia_vender", { p: { cliente_id: v.customerId, plan_id: v.planId, inicio: v.inicio || null, precio: v.precio === "" || v.precio == null ? null : Number(v.precio),
      descuento: Number(v.descuento) || 0, notas: v.notas, pagos: (v.pagos || []).filter(x => Number(x.amount) > 0).map(x => ({ monto: Number(x.amount), metodo: x.method })) } });
    return { membresia: toMembresia(r), venta: r.venta || null };
  },
  async asistencia(id, forzar = false) { const r = await rpc("membresia_asistencia", { p_id: id, p_forzar: forzar }); return { membresia: toMembresia(r), diasRestantes: r.dias_restantes }; },
  async congelar(id) { return toMembresia(await rpc("membresia_congelar", { p_id: id })); },
  async reactivar(id) { const r = await rpc("membresia_reactivar", { p_id: id }); return { membresia: toMembresia(r), dias: r.dias_extendidos || 0 }; },
  async cancelar(id, motivo) { return toMembresia(await rpc("membresia_cancelar", { p_id: id, p_motivo: motivo || null })); },
  async ajustar(id, p) { return toMembresia(await rpc("membresia_ajustar", { p_id: id, p })); },
  async delCliente(clienteId) { return ok(await supabase.from("membresias").select("*").eq("cliente_id", clienteId).order("inicio", { ascending: false }).limit(200)).map(toMembresia); },
  async asistenciasDe(membresiaId) { return ok(await supabase.from("membresia_asistencias").select("*").eq("membresia_id", membresiaId).order("fecha", { ascending: false }).limit(200)).map(toAsistencia); },
};

// Mesas y comandas: todas las escrituras pasan por funciones del servidor
export const mesas = {
  async guardar(m) { return toMesa(await rpc("mesa_guardar", { p: { id: m.id || null, nombre: m.name, zona: m.zona, capacidad: m.capacidad || null, orden: m.orden ?? null } })); },
  async eliminar(id) { await rpc("mesa_eliminar", { p_id: id }); },
};
export const comandas = {
  async obtener(id) { return toComanda(ok(await supabase.from("comandas").select(COMANDA_SELECT).eq("id", id).single())); },
  async abrir(c) {
    return rpc("comanda_abrir", { p: { tipo: c.tipo, mesa_id: c.mesaId || null, personas: c.personas || null, cliente_id: c.customerId || null,
      cliente_nombre: c.customerName, cliente_telefono: c.phone, direccion: c.direccion, notas: c.notas } });
  },
  actualizar: (id, c) => rpc("comanda_actualizar", { p_id: id, p: c }),
  agregar: (id, items) => rpc("comanda_agregar", { p_id: id, p_items: items.map(i => ({ producto_id: i.productId || null, nombre: i.name, cantidad: Number(i.qty), precio: i.price === undefined || i.price === null || i.price === "" ? null : Number(i.price), nota: i.nota || null })) }),
  editarItem: (itemId, qty, nota) => rpc("comanda_item_editar", { p_item: itemId, p_cantidad: Number(qty), p_nota: nota || null }),
  quitarItem: (itemId, motivo) => rpc("comanda_item_quitar", { p_item: itemId, p_motivo: motivo || null }),
  enviar: id => rpc("comanda_enviar", { p_id: id }),
  estadoItems: (id, estado, items) => rpc("comanda_items_estado", { p_id: id, p_estado: estado, p_items: items?.length ? items : null }),
  mover: (id, mesaId) => rpc("comanda_mover", { p_id: id, p_mesa: mesaId }),
  cobrar: (id, p) => rpc("comanda_cobrar", { p_id: id, p: {
    items: p.items?.length ? p.items : null, cliente_id: p.customerId || null, cliente_nombre: p.customerName || null,
    descuento: Number(p.discount) || 0, descuento_tipo: p.discountType === "pct" ? "pct" : "monto",
    pagos: (p.pagos || []).filter(x => Number(x.amount) > 0).map(x => ({ monto: Number(x.amount), metodo: x.method })),
  } }),
  liberar: id => rpc("comanda_liberar", { p_id: id }),
  anular: (id, motivo) => rpc("comanda_anular", { p_id: id, p_motivo: motivo || null }),
};

// Agenda: todas las escrituras pasan por funciones del servidor
export const citas = {
  async rango(desde, hasta) {
    return ok(await todasLasFilas(t => supabase.from("citas").select("*", t ? { count: "exact" } : undefined).gte("inicio", desde).lt("inicio", hasta).order("inicio").order("id"))).map(toCita);
  },
  async guardar(c, forzar = false) {
    return toCita(await rpc("cita_guardar", { p: {
      id: c.id || null, cliente_id: c.customerId || null, cliente_nombre: c.customerName, cliente_telefono: c.phone,
      inicio: c.inicio, fin: c.fin, profesional: c.profesional, servicio: c.servicio, notas: c.notas, estado: c.estado,
      anticipo: Number(c.anticipo) || 0, anticipo_metodo: c.anticipoMetodo, forzar,
      items: (c.items || []).map(i => ({ producto_id: i.productId || null, nombre: i.name, cantidad: Number(i.qty), precio: Number(i.price) })),
    } }));
  },
  async estado(id, estado) { return toCita(await rpc("cita_estado", { p_id: id, p_estado: estado })); },
  async recordada(id) { return toCita(await rpc("cita_recordada", { p_id: id })); },
  async atender(id, pagos) { const r = await rpc("cita_atender", { p_id: id, p_pagos: (pagos || []).map(x => ({ monto: Number(x.amount), metodo: x.method })) }); return { cita: toCita(r), venta: r.venta || null }; },
  async cancelar(id, motivo, devolver) { return toCita(await rpc("cita_cancelar", { p_id: id, p_motivo: motivo, p_devolver_anticipo: !!devolver })); },
};

export const lotes = {
  async listar() { return ok(await todasLasFilas(t => supabase.from("lotes").select(LOTE_COLS, t ? { count: "exact" } : undefined).gt("cantidad", 0).order("vencimiento", { ascending: true, nullsFirst: false }).order("id"))).map(toLote); },
  // Entrada con número de lote y vencimiento (usa el mismo stock_movimiento del servidor)
  async ingresar(productoId, cantidad, lote, vencimiento, costo, notas) {
    return toProduct(await rpc("lote_ingresar", { p_producto: productoId, p_cantidad: Number(cantidad), p_lote: lote || null, p_vencimiento: vencimiento || null, p_costo: costo ? Number(costo) : null, p_notas: notas || null }));
  },
};

export const inventario = {
  async movimiento(productoId, tipo, cantidad, costo, notas) {
    return toProduct(await rpc("stock_movimiento", { p_producto_id: productoId, p_tipo: tipo, p_cantidad: Number(cantidad), p_costo: costo ? Number(costo) : null, p_notas: notas || null }));
  },
  async kardex(limit = 300) {
    return ok(await supabase.from("movimientos_inventario").select(MOV_COLS).order("created_at", { ascending: false }).limit(limit)).map(toMovement);
  },
};

// ── Caja y gastos ──────────────────────────────────────────────────────────
export const caja = {
  async resumen(turnoId = null) { return await rpc("caja_resumen", { p_turno_id: turnoId }); },
  async abrir(fondo, notas) { return await rpc("caja_abrir", { p_fondo: Number(fondo) || 0, p_notas: notas || null }); },
  async cerrar(arqueo, notas) { return await rpc("caja_cerrar", { p_arqueo: Number(arqueo), p_notas: notas || null }); },
  async historial(limit = 30) {
    return ok(await supabase.from("caja_turnos").select("*").order("abierto_at", { ascending: false }).limit(limit));
  },
};
export const gastos = {
  async crear(e, empresaId) {
    return toExpense(ok(await supabase.from("gastos").insert({ ...fromExpense(e), empresa_id: empresaId }).select(GASTO_COLS).single()));
  },
  async eliminar(id) { ok(await supabase.from("gastos").delete().eq("id", id)); },
};

// ── Proveedores y compras ──────────────────────────────────────────────────
export const proveedores = {
  async crear(s, empresaId) { return toSupplier(ok(await supabase.from("proveedores").insert({ ...fromSupplier(s), empresa_id: empresaId }).select("*").single())); },
  async actualizar(id, s) { return toSupplier(ok(await supabase.from("proveedores").update(fromSupplier(s)).eq("id", id).select("*").single())); },
  async eliminar(id) { ok(await supabase.from("proveedores").update({ activo: false }).eq("id", id)); },
};
export const compras = {
  async registrar(c) {
    const p = {
      proveedor_id: c.supplierId || null, fecha: c.date || null, notas: c.notes || null,
      monto_pagado: Number(c.paid) || 0, ingresar_stock: c.addStock !== false,
      items: (c.items || [{ productId: c.productId, name: c.product, qty: c.qty, price: c.price }])
        .map(i => ({ producto_id: i.productId || null, nombre: i.name, cantidad: Number(i.qty), precio_unitario: Number(i.price) })),
    };
    // Con lote: misma compra, pero la entrada de stock va al lote indicado
    if (c.lote || c.expires) return toPurchase(await rpc("compra_registrar_lote", { p, p_lote: c.lote || null, p_vencimiento: c.expires || null }));
    return toPurchase(await rpc("compra_registrar", { p }));
  },
  async pagar(id, montoPagado) {
    return toPurchase(ok(await supabase.from("compras").update({ monto_pagado: Number(montoPagado) }).eq("id", id).select(COMPRA_SELECT).single()));
  },
};

// ── Producción ─────────────────────────────────────────────────────────────
export const produccion = {
  async crearFormula(f, empresaId) { return toFormula(ok(await supabase.from("formulas_produccion").insert({ ...fromFormula(f), empresa_id: empresaId }).select("*").single())); },
  async actualizarFormula(id, f) { return toFormula(ok(await supabase.from("formulas_produccion").update(fromFormula(f)).eq("id", id).select("*").single())); },
  async eliminarFormula(id) { ok(await supabase.from("formulas_produccion").update({ activo: false }).eq("id", id)); },
  async ejecutar(formulaId, lotes, costoExtra, fecha, notas) {
    return toOrder(await rpc("produccion_ejecutar", { p_formula_id: formulaId, p_lotes: Number(lotes), p_costo_extra: Number(costoExtra) || 0, p_fecha: fecha || null, p_notas: notas || null }));
  },
  async anular(ordenId) { return toOrder(await rpc("produccion_anular", { p_orden_id: ordenId })); },
};

// ── Pedidos / cotizaciones (documento JSON, sin efecto en stock hasta convertirse en venta) ──
export const pedidos = {
  async guardar(doc, empresaId, usuarioId) {
    const { _localOnly, ...row } = { ...doc, empresa_id: empresaId, usuario_id: doc.usuario_id || usuarioId };
    return ok(await supabase.from("pedidos").upsert(row, { onConflict: "id" }).select("*").single());
  },
  async actualizar(id, cambios) {
    const { id: _i, empresa_id: _e, usuario_id: _u, _localOnly, ...safe } = cambios;
    return ok(await supabase.from("pedidos").update({ ...safe, updatedAt: new Date().toISOString() }).eq("id", id).select("*").single());
  },
  async eliminar(id) { ok(await supabase.from("pedidos").delete().eq("id", id)); },
};

// ── Empresa ────────────────────────────────────────────────────────────────
// Importación masiva desde Excel (todo o nada, con errores por fila)
export const importar = {
  async productos(filas, actualizar = false) { return ok(await supabase.rpc("productos_importar", { p_filas: filas, p_actualizar: actualizar })); },
  async clientes(filas, actualizar = false) { return ok(await supabase.rpc("clientes_importar", { p_filas: filas, p_actualizar: actualizar })); },
};

export const empresa = {
  // Empezar de cero: borra los módulos elegidos (confirmación = nombre de la empresa)
  async reiniciar(modulos, confirmacion) { return rpc("empresa_reiniciar", { p_modulos: modulos, p_confirmacion: confirmacion }); },
  async onboarding(completado = true) { ok(await supabase.rpc("empresa_onboarding", { p_completado: completado })); },
  async actualizar(empresaId, config) {
    const cambios = Object.fromEntries(Object.entries(fromConfig(config)).filter(([, v]) => v !== undefined));
    return toConfig(ok(await supabase.from("empresas").update(cambios).eq("id", empresaId).select(EMPRESA_COLS).single()));
  },
  async subirArchivo(file, empresaId, nombre) {
    const esSvg = file.type === "image/svg+xml";
    const blob = esSvg ? file : await comprimirImagen(file, 600, "image/png");
    const ext = esSvg ? "svg" : "png";
    const path = `${empresaId}/${nombre}.${ext}`;
    ok(await supabase.storage.from("empresa").upload(path, blob, { upsert: true, contentType: esSvg ? "image/svg+xml" : "image/png", cacheControl: "3600" }));
    return `${supabase.storage.from("empresa").getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
  },
};

// ── Utilidad: comprime una imagen en el navegador antes de subirla ─────────
export function comprimirImagen(file, max = 800, tipo = "image/jpeg", calidad = 0.82) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      const ctx = c.getContext("2d");
      if (tipo === "image/jpeg") { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); }
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(b => (b ? resolve(b) : reject(new ApiError("No se pudo procesar la imagen"))), tipo, calidad);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new ApiError("El archivo no es una imagen válida")); };
    img.src = url;
  });
}
