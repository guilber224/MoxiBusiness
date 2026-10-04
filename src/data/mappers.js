// Traducción entre las filas de Supabase (esquema canónico en español) y los objetos que
// usan las pantallas. Las pantallas no conocen nombres de columnas: si el esquema cambia,
// solo se toca este archivo.
import { DEFAULT_CATEGORY_ID } from "../categories.js";

const num = v => (v == null || v === "" ? 0 : Number(v) || 0);
const METODO_A_APP = { EFECTIVO: "efectivo", QR: "qr", TRANSFERENCIA: "banco", TARJETA: "tarjeta", MIXTO: "mixto", CREDITO: "credito", ANTICIPO: "anticipo" };
export const metodoApp = m => METODO_A_APP[m] || "efectivo";

// ── Productos ──────────────────────────────────────────────────────────────
export const PRODUCTO_COLS = "id,nombre,precio_venta,precio_costo,stock,stock_minimo,unidad,descripcion,imagen_url,categoria_id,codigo,activo,created_at,padre_id,es_grupo,variante_nombre,atributos,controla_lotes,venta_fraccionada,precio_mayor,cantidad_mayor";
export const toProduct = r => ({
  id: r.id,
  name: r.nombre || "",
  price: num(r.precio_venta),
  cost: num(r.precio_costo),
  stock: num(r.stock),
  minStock: num(r.stock_minimo),
  unit: r.unidad || "",
  desc: r.descripcion || "",
  img: r.imagen_url || null,
  cat: r.categoria_id || DEFAULT_CATEGORY_ID,
  barcode: r.codigo || "",
  createdAt: r.created_at,
  // Variantes: el grupo agrupa (no se vende); cada variante es un producto con parentId
  parentId: r.padre_id || null,
  isGroup: !!r.es_grupo,
  variantName: r.variante_nombre || "",
  attrs: r.atributos || null,
  lotControl: !!r.controla_lotes,
  // Unidades: se vende con decimales (kg, m, L) y precio por mayor desde cierta cantidad
  fraction: !!r.venta_fraccionada,
  wholesalePrice: r.precio_mayor == null ? null : num(r.precio_mayor),
  wholesaleQty: r.cantidad_mayor == null ? null : num(r.cantidad_mayor),
});
export const fromProduct = p => ({
  nombre: (p.name || "").trim(),
  precio_venta: num(p.price),
  precio_costo: num(p.cost),
  stock_minimo: num(p.minStock),
  unidad: (p.unit || "").trim() || "unidad",
  descripcion: (p.desc || "").trim() || null,
  imagen_url: p.img && !String(p.img).startsWith("data:") ? p.img : null,
  categoria_id: p.cat && p.cat !== DEFAULT_CATEGORY_ID ? p.cat : null,
  codigo: (p.barcode || "").trim() || null,
  ...(typeof p.lotControl === "boolean" ? { controla_lotes: p.lotControl } : {}),
  ...(typeof p.fraction === "boolean" ? { venta_fraccionada: p.fraction } : {}),
  ...("wholesalePrice" in p ? { precio_mayor: p.wholesalePrice === "" || p.wholesalePrice == null ? null : num(p.wholesalePrice) } : {}),
  ...("wholesaleQty" in p ? { cantidad_mayor: p.wholesaleQty === "" || p.wholesaleQty == null || num(p.wholesaleQty) <= 0 ? null : num(p.wholesaleQty) } : {}),
});

// ── Lotes y vencimientos ───────────────────────────────────────────────────
// ── Presentaciones (Caja x12, Paquete x6…) ─────────────────────────────────
export const PRESENTACION_COLS = "id,producto_id,nombre,factor,precio,codigo,activo,orden";
export const toPresentacion = r => ({ id: r.id, productId: r.producto_id, name: r.nombre, factor: num(r.factor), price: num(r.precio), barcode: r.codigo || "", order: r.orden || 0 });

// ── Órdenes de servicio ─────────────────────────────────────────────────────
export const toOrdenServicio = r => ({
  id: r.id, numero: Number(r.numero) || 0, estado: r.estado,
  customerId: r.cliente_id || null, customerName: r.cliente_nombre || "", phone: r.cliente_telefono || "",
  equipo: r.equipo || "", marca: r.marca || "", modelo: r.modelo || "", serie: r.serie || "", accesorios: r.accesorios || "",
  falla: r.falla || "", diagnostico: r.diagnostico || "", presupuesto: num(r.presupuesto), anticipo: num(r.anticipo), anticipoMetodo: r.anticipo_metodo || "",
  items: (r.items || []).map(i => ({ productId: i.producto_id || null, name: i.nombre, qty: num(i.cantidad), price: num(i.precio) })),
  total: (r.items || []).reduce((a, i) => a + num(i.cantidad) * num(i.precio), 0),
  tecnico: r.tecnico || "", recibido: r.fecha_recepcion, prometido: r.fecha_prometida || null, entregado: r.fecha_entrega || null,
  garantiaDias: r.garantia_dias ?? null, notas: r.notas || "", ventaId: r.venta_id || null, usuario: r.usuario_nombre || "",
});

export const LOTE_COLS = "id,producto_id,codigo,vencimiento,cantidad,cantidad_inicial,costo_unitario,created_at";
export const toLote = r => ({ id: r.id, productId: r.producto_id, code: r.codigo, expires: r.vencimiento || null, qty: num(r.cantidad), initialQty: num(r.cantidad_inicial), cost: num(r.costo_unitario), createdAt: r.created_at });

// ── Categorías ─────────────────────────────────────────────────────────────
export const toCategory = r => ({ id: r.id, name: r.nombre, locked: false });

// ── Clientes ───────────────────────────────────────────────────────────────
export const CLIENTE_COLS = "id,nombre,telefono,direccion,nit,mercado,notas,limite_credito,created_at";
export const toCustomer = r => ({
  id: r.id,
  name: r.nombre || "",
  phone: r.telefono || "",
  address: r.direccion || "",
  ci: r.nit || "",
  market: r.mercado || "",
  notes: r.notas || "",
  creditLimit: num(r.limite_credito),
  createdAt: r.created_at,
});
export const fromCustomer = c => ({
  nombre: (c.name || "").trim(),
  telefono: (c.phone || "").trim() || null,
  direccion: (c.address || "").trim() || null,
  nit: (c.ci || "").trim() || null,
  mercado: (c.market || "").trim() || null,
  notas: (c.notes || "").trim() || null,
});

// ── Ventas ─────────────────────────────────────────────────────────────────
export const VENTA_SELECT = "id,numero,estado,metodo_pago,cliente_id,cliente_nombre,cliente_mercado,fecha,created_at,subtotal,descuento,descuento_tipo,total,monto_pagado,deuda,notas,turno_id,pedido_id,anulada_at,usuario_id,venta_detalles(id,producto_id,nombre_producto,unidad,cantidad,precio_unitario,precio_costo,subtotal,presentacion,factor),pagos_venta(id,monto,metodo_pago,fecha,referencia,anulado)";
export const toSale = r => {
  const pagos = (r.pagos || r.pagos_venta || []).filter(p => !p.anulado);
  const detalles = r.detalles || r.venta_detalles || [];
  return {
    id: r.id,
    numero: Number(r.numero) || 0,
    estado: r.estado,
    anulada: r.estado === "ANULADA",
    customerId: r.cliente_id || "__guest__",
    customerName: r.cliente_nombre || "Público general",
    customerMarket: r.cliente_mercado || "",
    date: r.fecha || r.created_at,
    createdAt: r.created_at || r.fecha,
    items: detalles.map(d => ({
      id: d.id,
      productId: d.producto_id || null,
      name: d.nombre_producto,
      unit: d.unidad || "",
      qty: num(d.cantidad),
      unitPrice: num(d.precio_unitario),
      cost: num(d.precio_costo),
      presentation: d.presentacion || null,
      factor: num(d.factor) || 1,
      sub: num(d.subtotal ?? num(d.cantidad) * num(d.precio_unitario)),
      subtotal: num(d.subtotal ?? num(d.cantidad) * num(d.precio_unitario)),
    })),
    subtotal: num(r.subtotal),
    discount: num(r.descuento),
    discountType: r.descuento_tipo === "pct" ? "pct" : "amount",
    total: num(r.total),
    // Una venta anulada no cuenta como cobrada ni como deuda
    paid: r.estado === "ANULADA" ? 0 : num(r.monto_pagado),
    debt: r.estado === "ANULADA" ? 0 : Math.max(0, num(r.deuda ?? num(r.total) - num(r.monto_pagado))),
    payments: pagos
      .slice()
      .sort((a, b) => new Date(a.fecha) - new Date(b.fecha))
      .map(p => ({ id: p.id, amount: num(p.monto), method: metodoApp(p.metodo_pago), date: p.fecha, reference: p.referencia || "" })),
    paymentMethod: metodoApp(r.metodo_pago),
    notes: r.notas || "",
    turnoId: r.turno_id || null,
    pedidoId: r.pedido_id || null,
    usuarioId: r.usuario_id || null,
  };
};

// ── Gastos e ingresos de caja ──────────────────────────────────────────────
export const GASTO_COLS = "id,tipo,descripcion,monto,categoria,fecha,notas,usuario_nombre,metodo_pago,turno_id,created_at";
export const toExpense = r => ({
  id: r.id,
  type: r.tipo === "ingreso" ? "ingreso" : "gasto",
  description: r.descripcion || "",
  amount: num(r.monto),
  category: r.categoria || "Otros",
  // fecha es DATE: se fija a mediodía local para que no se corra de día por zona horaria
  date: r.fecha ? `${r.fecha}T12:00:00` : r.created_at,
  notes: r.notas || "",
  responsable: r.usuario_nombre || "",
  method: metodoApp(r.metodo_pago),
  turnoId: r.turno_id || null,
  createdAt: r.created_at,
});
export const fromExpense = e => ({
  tipo: e.type === "ingreso" ? "ingreso" : "egreso",
  descripcion: (e.description || "").trim(),
  monto: num(e.amount),
  categoria: (e.category || "Otros").trim(),
  fecha: e.date ? String(e.date).slice(0, 10) : undefined,
  notas: (e.notes || "").trim() || null,
});

// ── Kardex ─────────────────────────────────────────────────────────────────
export const MOV_COLS = "id,producto_id,producto_nombre,tipo,cantidad,stock_antes,stock_despues,costo_unitario,notas,referencia_tipo,usuario_nombre,created_at";
export const toMovement = r => ({
  id: r.id,
  productId: r.producto_id,
  productName: r.producto_nombre || "",
  type: String(r.tipo || "").toLowerCase(),
  qty: num(r.cantidad),
  stockBefore: r.stock_antes == null ? null : num(r.stock_antes),
  stockAfter: r.stock_despues == null ? null : num(r.stock_despues),
  cost: num(r.costo_unitario),
  notes: r.notas || "",
  reference: r.referencia_tipo || "",
  user: r.usuario_nombre || "",
  date: r.created_at,
  createdAt: r.created_at,
});

// ── Proveedores y compras ──────────────────────────────────────────────────
export const toSupplier = r => ({
  id: r.id, name: r.nombre || "", phone: r.telefono || "", address: r.direccion || "",
  product: r.rubro || "", notes: r.notas || "", createdAt: r.created_at,
});
export const fromSupplier = s => ({
  nombre: (s.name || "").trim(), telefono: (s.phone || "").trim() || null,
  direccion: (s.address || "").trim() || null, rubro: (s.product || "").trim() || null,
  notas: (s.notes || "").trim() || null,
});
export const COMPRA_SELECT = "id,numero,proveedor_id,proveedor_nombre,fecha,total,monto_pagado,notas,created_at,compra_detalles(producto_id,nombre_producto,cantidad,precio_unitario,subtotal)";
export const toPurchase = r => {
  const d = r.compra_detalles || r.detalles || [];
  const first = d[0] || {};
  return {
    id: r.id,
    numero: Number(r.numero) || 0,
    supplierId: r.proveedor_id,
    supplierName: r.proveedor_nombre || "",
    productId: first.producto_id || null,
    product: d.map(x => x.nombre_producto).join(", "),
    qty: num(first.cantidad),
    price: num(first.precio_unitario),
    items: d,
    total: num(r.total),
    paid: num(r.monto_pagado),
    debt: Math.max(0, num(r.total) - num(r.monto_pagado)),
    date: r.fecha ? `${r.fecha}T12:00:00` : r.created_at,
    notes: r.notas || "",
    createdAt: r.created_at,
  };
};

// ── Producción ─────────────────────────────────────────────────────────────
export const toFormula = r => ({
  id: r.id, name: r.nombre, inputId: r.insumo_id, inputQty: num(r.insumo_cantidad), inputUnit: r.insumo_unidad || "",
  outputId: r.producto_id, outputQty: num(r.producto_cantidad), outputUnit: r.producto_unidad || "",
  laborCost: num(r.costo_mano_obra), energyCost: num(r.costo_energia), desc: r.descripcion || "",
});
export const fromFormula = f => ({
  nombre: (f.name || "").trim(), insumo_id: f.inputId || null, insumo_cantidad: num(f.inputQty),
  insumo_unidad: f.inputUnit || null, producto_id: f.outputId || null, producto_cantidad: num(f.outputQty),
  producto_unidad: f.outputUnit || null, costo_mano_obra: num(f.laborCost), costo_energia: num(f.energyCost),
  descripcion: (f.desc || "").trim() || null,
});
export const toOrder = r => ({
  id: r.id, formulaId: r.formula_id, formulaName: r.formula_nombre || "", inputId: r.insumo_id, outputId: r.producto_id,
  batches: num(r.lotes), inputUsed: num(r.insumo_usado), outputProduced: num(r.producido),
  totalCost: num(r.costo_total), costPerUnit: num(r.costo_unitario), revenue: num(r.ingreso_estimado),
  margin: Math.round(num(r.margen)), date: r.fecha ? `${r.fecha}T12:00:00` : r.created_at, notes: r.notas || "",
  anulada: !!r.anulada, createdAt: r.created_at,
});

// ── Empresa (configuración) ────────────────────────────────────────────────
export const EMPRESA_COLS = "id,nombre,logo_url,qr_url,telefono,direccion,nit,email,rubro,moneda,timezone,plan,onboarding_completado_at,balanza";
export const toConfig = r => ({
  empresaId: r.id,
  businessName: r.nombre || "",
  currency: r.moneda || "BOB",
  logo_url: r.logo_url || null,
  qr_url: r.qr_url || null,
  telefono: r.telefono || "",
  direccion: r.direccion || "",
  nit: r.nit || "",
  email: r.email || "",
  rubro: r.rubro || "",
  timezone: r.timezone || "America/La_Paz",
  plan: r.plan || "FREE",
  onboardingCompletado: !!r.onboarding_completado_at,
  balanza: r.balanza || null,
});
export const fromConfig = c => ({
  nombre: (c.businessName || "").trim() || undefined,
  moneda: c.currency || undefined,
  logo_url: c.logo_url ?? undefined,
  qr_url: c.qr_url ?? undefined,
  telefono: c.telefono ?? undefined,
  direccion: c.direccion ?? undefined,
  nit: c.nit ?? undefined,
  email: c.email ?? undefined,
  rubro: c.rubro ?? undefined,
  balanza: c.balanza ?? undefined,
});

// ── Usuarios y actividad ───────────────────────────────────────────────────
export const toUser = r => ({ id: r.id, name: r.nombre, email: r.email, role: String(r.role || "usuario").toLowerCase(), active: r.activo !== false, createdAt: r.created_at });
export const toActivity = r => ({ id: r.id, userId: r.usuario_id, userName: r.usuario_nombre || "Sistema", action: r.accion, date: r.created_at, meta: r.detalle || {} });
