// Estado de datos de la app: una sola fuente de verdad (Supabase) con caché local para
// mostrar la última información al instante mientras se actualiza en segundo plano.
//
// - cargar(): trae todo en paralelo; si una parte falla, se conserva la caché de esa parte
//   y se informa en `errores` (nunca se muestran listas vacías falsas).
// - acciones: cada operación espera la confirmación del servidor y actualiza el estado con
//   la respuesta real (sin sincronizaciones paralelas que dupliquen escrituras).
// - tiempo real: los cambios hechos en otros dispositivos se reflejan solos.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import * as api from "./api.js";
import { PRODUCTO_COLS, toProduct, toCustomer, toExpense, toSale } from "./mappers.js";
import { recordLocalChange, reconcileWithServer, resetLocalChanges } from "../utils/localChanges.js";
import { DEFAULT_CATEGORY_ID } from "../categories.js";

const CACHE_VERSION = "v2";
const cacheKey = eid => `moxi_${CACHE_VERSION}_${eid}`;
export const VACIO = {
  config: { businessName: "", currency: "BOB", logo_url: null, qr_url: null }, products: [], categories: [], customers: [], sales: [], expenses: [], movements: [],
  pedidos: [], suppliers: [], purchases: [], formulas: [], orders: [], users: [], activityLogs: [], caja: null,
};
const leerCache = eid => { try { const v = JSON.parse(localStorage.getItem(cacheKey(eid))); return v && typeof v === "object" ? { ...VACIO, ...v } : null; } catch { return null; } };
const escribirCache = (eid, data) => { try { localStorage.setItem(cacheKey(eid), JSON.stringify(data)); } catch { /* cuota llena: la app sigue funcionando sin caché */ } };
const porId = (arr, item) => { const i = arr.findIndex(x => x.id === item.id); if (i < 0) return [item, ...arr]; const c = arr.slice(); c[i] = item; return c; };
const sinId = (arr, id) => arr.filter(x => x.id !== id);

export function useMoxiData(user) {
  const eid = user?.empresa_id || null;
  const [data, setData] = useState(() => (eid && leerCache(eid)) || VACIO);
  const [estado, setEstado] = useState({ cargando: false, cargadoUnaVez: false, errores: {}, actualizado: null });
  const dataRef = useRef(data);
  const eidRef = useRef(eid);
  useEffect(() => { dataRef.current = data; }, [data]);

  // Persistir en caché (agrupado para no escribir en cada tecla)
  const cacheTimer = useRef(null);
  useEffect(() => {
    if (!eid) return;
    clearTimeout(cacheTimer.current);
    cacheTimer.current = setTimeout(() => escribirCache(eid, dataRef.current), 400);
    return () => clearTimeout(cacheTimer.current);
  }, [data, eid]);

  // Modifica una colección y registra el cambio para que una carga en curso no lo pise
  const mutar = useCallback((key, fn) => {
    setData(d => {
      const prev = d[key];
      const next = fn(prev);
      recordLocalChange(key, prev, next);
      const nd = { ...d, [key]: next };
      dataRef.current = nd;
      return nd;
    });
  }, []);

  const cargar = useCallback(async () => {
    const empresaId = eidRef.current;
    if (!empresaId) return;
    const requestedAt = Date.now();
    setEstado(s => ({ ...s, cargando: true }));
    const { data: srv, errores } = await api.cargarTodo(empresaId);
    if (eidRef.current !== empresaId) return; // cambió la empresa mientras cargaba
    setData(d => {
      const nd = { ...d };
      for (const [k, v] of Object.entries(srv)) {
        nd[k] = Array.isArray(v) ? reconcileWithServer(k, v, d[k], requestedAt) : v;
      }
      dataRef.current = nd;
      return nd;
    });
    setEstado({ cargando: false, cargadoUnaVez: true, errores, actualizado: new Date() });
  }, []);

  // Cambio de empresa (login / logout / otro usuario en el mismo navegador)
  useEffect(() => {
    eidRef.current = eid;
    resetLocalChanges();
    const cache = eid ? leerCache(eid) : null;
    setData(cache || VACIO);
    dataRef.current = cache || VACIO;
    setEstado({ cargando: !!eid, cargadoUnaVez: !!cache, errores: {}, actualizado: null });
    if (eid) cargar();
  }, [eid, cargar]);

  // Refrescar al volver a la pestaña tras un rato (otro dispositivo pudo cambiar datos)
  useEffect(() => {
    if (!eid) return;
    let last = Date.now();
    const onVis = () => { if (document.visibilityState === "visible" && Date.now() - last > 60000) { last = Date.now(); cargar(); } };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [eid, cargar]);

  // ── Helpers de refresco puntual ────────────────────────────────────────────
  const refrescarProductos = useCallback(async ids => {
    const unicos = [...new Set((ids || []).filter(Boolean))];
    if (!unicos.length) return;
    const { data: rows } = await supabase.from("productos").select(PRODUCTO_COLS).in("id", unicos);
    if (rows) mutar("products", ps => rows.reduce((acc, r) => (r.activo === false ? sinId(acc, r.id) : porId(acc, toProduct(r))), ps));
  }, [mutar]);
  const refrescarCaja = useCallback(async () => {
    try { const c = await api.caja.resumen(); setData(d => ({ ...d, caja: c })); } catch { /* se reintenta en la próxima carga */ }
  }, []);
  const refrescarKardex = useCallback(async () => {
    try { const m = await api.inventario.kardex(); setData(d => ({ ...d, movements: m })); } catch { /* idem */ }
  }, []);

  // ── Tiempo real: refleja cambios de otros dispositivos ─────────────────────
  useEffect(() => {
    if (!eid) return;
    const f = `empresa_id=eq.${eid}`;
    const ch = supabase.channel(`moxi_v2_${eid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "productos", filter: f }, p => {
        if (p.eventType === "DELETE" || p.new?.activo === false) mutar("products", ps => sinId(ps, p.old?.id || p.new?.id));
        else if (p.new?.id) mutar("products", ps => porId(ps, toProduct(p.new)));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "clientes", filter: f }, p => {
        if (p.eventType === "DELETE" || p.new?.activo === false) mutar("customers", cs => sinId(cs, p.old?.id || p.new?.id));
        else if (p.new?.id) mutar("customers", cs => porId(cs, toCustomer(p.new)));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "gastos", filter: f }, p => {
        if (p.eventType === "DELETE") mutar("expenses", es => sinId(es, p.old?.id));
        else if (p.new?.id) mutar("expenses", es => porId(es, toExpense(p.new)));
        refrescarCaja();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "ventas", filter: f }, async p => {
        if (p.eventType === "DELETE") { mutar("sales", ss => sinId(ss, p.old?.id)); return; }
        try { const v = await api.ventas.obtener(p.new.id); if (v?.id) mutar("sales", ss => porId(ss, v)); } catch { /* sin red */ }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "pedidos", filter: f }, p => {
        if (p.eventType === "DELETE") mutar("pedidos", ps => sinId(ps, p.old?.id));
        else if (p.new?.id) mutar("pedidos", ps => porId(ps, p.new));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "caja_turnos", filter: f }, () => refrescarCaja())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [eid, mutar, refrescarCaja]);

  // ── Acciones ───────────────────────────────────────────────────────────────
  const acciones = useMemo(() => {
    const E = () => eidRef.current;
    return {
      recargar: cargar,
      log: async accion => {
        try { await supabase.from("activity_logs").insert({ empresa_id: E(), usuario_id: user?.id, usuario_nombre: user?.name, accion }); } catch { /* no crítico */ }
      },

      // Clientes
      crearCliente: async c => { const r = await api.clientes.crear(c, E()); mutar("customers", cs => [...cs, r].sort((a, b) => a.name.localeCompare(b.name))); return r; },
      actualizarCliente: async (id, c) => { const r = await api.clientes.actualizar(id, c); mutar("customers", cs => porId(cs, r)); return r; },
      eliminarCliente: async id => { await api.clientes.eliminar(id); mutar("customers", cs => sinId(cs, id)); },

      // Productos y categorías
      crearProducto: async p => { const r = await api.productos.crear(p, E()); mutar("products", ps => [...ps, r].sort((a, b) => a.name.localeCompare(b.name))); return r; },
      actualizarProducto: async (id, p) => { const r = await api.productos.actualizar(id, p); mutar("products", ps => porId(ps, r)); return r; },
      eliminarProducto: async id => { await api.productos.eliminar(id); mutar("products", ps => sinId(ps, id)); },
      subirImagenProducto: (file, productoId) => api.productos.subirImagen(file, E(), productoId),
      crearCategoria: async nombre => { const r = await api.categorias.crear(nombre, E()); setData(d => ({ ...d, categories: [...d.categories, r].sort((a, b) => a.name.localeCompare(b.name)) })); return r; },
      eliminarCategoria: async id => {
        await api.categorias.eliminar(id);
        setData(d => ({ ...d, categories: d.categories.filter(c => c.id !== id) }));
        mutar("products", ps => ps.map(p => (p.cat === id ? { ...p, cat: DEFAULT_CATEGORY_ID } : p)));
      },

      // Inventario
      movimientoStock: async (productoId, tipo, cantidad, costo, notas) => {
        const r = await api.inventario.movimiento(productoId, tipo, cantidad, costo, notas);
        mutar("products", ps => porId(ps, r));
        refrescarKardex();
        return r;
      },

      // Ventas
      registrarVenta: async v => {
        const r = await api.ventas.registrar({ ...v, id: v.id || crypto.randomUUID() });
        mutar("sales", ss => porId(ss, r));
        refrescarProductos(r.items.map(i => i.productId));
        refrescarCaja(); refrescarKardex();
        if (v.pedidoId) mutar("pedidos", ps => ps.map(p => (p.id === v.pedidoId ? { ...p, estado: "entregado", convertedToSaleId: r.id } : p)));
        return r;
      },
      cobrarVenta: async (ventaId, monto, metodo, referencia) => {
        const r = await api.ventas.cobrar(ventaId, monto, metodo, referencia);
        mutar("sales", ss => porId(ss, r)); refrescarCaja(); return r;
      },
      anularVenta: async (ventaId, motivo) => {
        const r = await api.ventas.anular(ventaId, motivo);
        mutar("sales", ss => porId(ss, r));
        refrescarProductos(r.items.map(i => i.productId)); refrescarCaja(); refrescarKardex();
        return r;
      },

      // Caja y gastos
      abrirCaja: async (fondo, notas) => { const c = await api.caja.abrir(fondo, notas); setData(d => ({ ...d, caja: c })); return c; },
      cerrarCaja: async (arqueo, notas) => { const c = await api.caja.cerrar(arqueo, notas); setData(d => ({ ...d, caja: null })); return c; },
      historialCaja: () => api.caja.historial(),
      resumenTurno: turnoId => api.caja.resumen(turnoId),
      registrarGasto: async e => { const r = await api.gastos.crear(e, E()); mutar("expenses", es => porId(es, r)); refrescarCaja(); return r; },
      eliminarGasto: async id => { await api.gastos.eliminar(id); mutar("expenses", es => sinId(es, id)); refrescarCaja(); },

      // Proveedores y compras
      crearProveedor: async s => { const r = await api.proveedores.crear(s, E()); setData(d => ({ ...d, suppliers: [...d.suppliers, r] })); return r; },
      actualizarProveedor: async (id, s) => { const r = await api.proveedores.actualizar(id, s); setData(d => ({ ...d, suppliers: porId(d.suppliers, r) })); return r; },
      eliminarProveedor: async id => { await api.proveedores.eliminar(id); setData(d => ({ ...d, suppliers: sinId(d.suppliers, id) })); },
      registrarCompra: async c => {
        const r = await api.compras.registrar(c);
        setData(d => ({ ...d, purchases: [r, ...d.purchases] }));
        refrescarProductos((r.items || []).map(i => i.producto_id)); refrescarKardex();
        return r;
      },
      pagarCompra: async (id, montoPagado) => { const r = await api.compras.pagar(id, montoPagado); setData(d => ({ ...d, purchases: porId(d.purchases, r) })); return r; },

      // Producción
      crearFormula: async f => { const r = await api.produccion.crearFormula(f, E()); setData(d => ({ ...d, formulas: [...d.formulas, r] })); return r; },
      actualizarFormula: async (id, f) => { const r = await api.produccion.actualizarFormula(id, f); setData(d => ({ ...d, formulas: porId(d.formulas, r) })); return r; },
      eliminarFormula: async id => { await api.produccion.eliminarFormula(id); setData(d => ({ ...d, formulas: sinId(d.formulas, id) })); },
      ejecutarProduccion: async (formulaId, lotes, costoExtra, fecha, notas) => {
        const r = await api.produccion.ejecutar(formulaId, lotes, costoExtra, fecha, notas);
        setData(d => ({ ...d, orders: [r, ...d.orders] }));
        refrescarProductos([r.inputId, r.outputId]); refrescarKardex();
        return r;
      },
      anularProduccion: async ordenId => {
        const r = await api.produccion.anular(ordenId);
        setData(d => ({ ...d, orders: porId(d.orders, r) }));
        refrescarProductos([r.inputId, r.outputId]); refrescarKardex();
        return r;
      },

      // Pedidos y cotizaciones
      guardarPedido: async doc => { const r = await api.pedidos.guardar(doc, E(), user?.id); mutar("pedidos", ps => porId(ps, r)); return r; },
      actualizarPedido: async (id, cambios) => { const r = await api.pedidos.actualizar(id, cambios); mutar("pedidos", ps => porId(ps, r)); return r; },
      eliminarPedido: async id => { await api.pedidos.eliminar(id); mutar("pedidos", ps => sinId(ps, id)); },

      // Empresa
      actualizarConfig: async cambios => { const r = await api.empresa.actualizar(E(), cambios); setData(d => ({ ...d, config: r })); return r; },
      subirArchivoEmpresa: (file, nombre) => api.empresa.subirArchivo(file, E(), nombre),
      setUsuarios: users => setData(d => ({ ...d, users })),
    };
  }, [cargar, mutar, refrescarProductos, refrescarCaja, refrescarKardex, user?.id, user?.name]);

  // Vista derivada para pantallas que esperan "inventory" separado
  const inventory = useMemo(() => data.products.map(p => ({ productId: p.id, stock: p.stock })), [data.products]);

  const D = useMemo(() => ({ ...data, config: data.config || VACIO.config, inventory }), [data, inventory]);
  return { data: D, estado, acciones };
}
