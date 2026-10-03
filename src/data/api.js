// Acceso a Supabase. Lecturas por tabla (RLS filtra por empresa) y escrituras de negocio
// mediante funciones del servidor (una transacción cada una). Todos los errores salen con un
// mensaje en español listo para mostrar al usuario.
import { supabase } from "../lib/supabaseClient";
import {
  PRODUCTO_COLS, CLIENTE_COLS, VENTA_SELECT, GASTO_COLS, MOV_COLS, COMPRA_SELECT, EMPRESA_COLS,
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

const desdeMeses = (m) => { const d = new Date(); d.setMonth(d.getMonth() - m); return d.toISOString(); };

// ── Carga completa (en paralelo; cada parte falla de forma independiente) ────
export async function cargarTodo(empresaId) {
  const q = {
    config:     supabase.from("empresas").select(EMPRESA_COLS).eq("id", empresaId).maybeSingle(),
    products:   supabase.from("productos").select(PRODUCTO_COLS).eq("activo", true).order("nombre"),
    categories: supabase.from("categorias").select("id,nombre").eq("tipo", "PRODUCTO").order("nombre"),
    customers:  supabase.from("clientes").select(CLIENTE_COLS).eq("activo", true).order("nombre"),
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
  };
  const mapeo = {
    config: r => (r ? toConfig(r) : null), products: rs => rs.map(toProduct), categories: rs => rs.map(toCategory),
    customers: rs => rs.map(toCustomer), sales: rs => rs.map(toSale), expenses: rs => rs.map(toExpense),
    movements: rs => rs.map(toMovement), pedidos: rs => rs, suppliers: rs => rs.map(toSupplier),
    purchases: rs => rs.map(toPurchase), formulas: rs => rs.map(toFormula), orders: rs => rs.map(toOrder),
    users: rs => rs.map(toUser), activityLogs: rs => rs.map(toActivity), caja: r => r || null,
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
      items: v.items.map(i => ({ producto_id: i.productId || null, nombre: i.name, unidad: i.unit, cantidad: Number(i.qty), precio_unitario: Number(i.unitPrice) })),
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
export const empresa = {
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
