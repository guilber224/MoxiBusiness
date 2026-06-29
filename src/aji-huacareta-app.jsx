import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { supabase } from './lib/supabaseClient';
import { ventasService } from "./services/ventasService.js";
import { userService } from "./services/userService.js";
import { productosService } from "./services/productosService.js";
import { clientesService } from "./services/clientesService.js";
import { inventarioService } from "./services/inventarioService.js";
import { gastosService } from "./services/gastosService.js";
import { movimientosService } from "./services/movimientosService.js";
import { pedidosService } from "./services/pedidosService.js";
import { saveLastEmpresaId, migrateLegacyStorageIfNeeded } from "./utils/storageScope.js";
import { isSupabaseUser, normalizeSales, normalizeCustomers, normalizeUsers, mergeById } from "./utils/businessLogic.js";
import { Toaster } from "react-hot-toast";
import { applyCurrencyCode, resetCurrency } from "./currency.js";
import { getCurrentEmpresaId, setCurrentEmpresaId } from "./empresaScope.js";
import { DEFAULT_CATEGORY_ID, DEFAULT_CATEGORIES, ensureCategories, sanitizeProducts } from "./categories.js";
import { BRAND_NAME, ThemeProvider, FONT, safeBusinessName } from "./theme.jsx";
import { useIsMobile } from "./hooks/useIsMobile.js";
import { BrandLogo } from "./components/ui/BrandLogo.jsx";
import { BottomNav } from "./components/BottomNav.jsx";
import { NAV_GROUPS, ROLES } from "./navConfig.js";
import { Clientes } from "./components/Clientes.jsx";
import { Productos } from "./components/Productos.jsx";
import { Inventario } from "./components/Inventario.jsx";
import { DashboardPremium } from "./components/DashboardPremium.jsx";
import { Ventas } from "./components/Ventas.jsx";
import { Pedidos } from "./components/Pedidos.jsx";
import { Deudas } from "./components/Deudas.jsx";
import { Produccion } from "./components/Produccion.jsx";
import { Proveedores } from "./components/Proveedores.jsx";
import { GastosPage } from "./components/GastosPage.jsx";
import { Caja } from "./components/Caja.jsx";
import { Analisis } from "./components/Analisis.jsx";
import { Exportar } from "./components/Exportar.jsx";
import { AuthScreen } from "./screens/AuthScreen.jsx";
import { ResetPasswordScreen } from "./screens/ResetPasswordScreen.jsx";
import { OnboardingIncompleteScreen } from "./screens/OnboardingIncompleteScreen.jsx";
import { Sidebar } from "./components/Sidebar.jsx";
import { UsuariosAdmin } from "./components/UsuariosAdmin.jsx";
import { SuperAdminPanel } from "./components/SuperAdminPanel.jsx";
import { Topbar } from "./components/Topbar.jsx";
import { SuscripcionVencida } from "./screens/SuscripcionVencida.jsx";
import { suscripcionService } from "./services/suscripcionService.js";
import { loadStoredValue, persistValue, cacheSupabaseData, buildActivityEntry, DEFAULT_CONFIG, DEFAULT_ACTIVITY_LOGS } from "./utils/appStorage.js";
import { syncDiff, SYNC_KEYS, createEmptyAppState } from "./utils/syncDiff.js";
import { invalidateAnalyticsCache } from "./services/analyticsService.js";
import { PRODUCTS0, FORMULAS0, CUSTOMERS0, DEFAULT_USERS } from "./seedData.js";

// Lee datos de claves globales moxi_* o claves legacy ah_* cuando las claves scoped están vacías.
const getLocalFallbackData = (primaryKey, legacyKey = null) => {
  for (const k of [primaryKey, legacyKey].filter(Boolean)) {
    try {
      const raw = localStorage.getItem(k);
      const data = raw ? JSON.parse(raw) : null;
      if (Array.isArray(data) && data.length > 0) return data;
    } catch {}
  }
  return [];
};

// Sube datos locales a Supabase cuando las tablas están vacías al iniciar sesión.
// ignoreDuplicates: true → nunca sobreescribe filas existentes en Supabase.
const uploadLocalToSupabase = async (empresaId, entities) => {
  const upsert = async (table, rows, conflict = "id") => {
    if (!rows.length) return;
    for (let i = 0; i < rows.length; i += 150) {
      const { error } = await supabase.from(table).upsert(rows.slice(i, i + 150), { onConflict: conflict, ignoreDuplicates: true });
      if (error) console.warn(`[migrate] ${table}:`, error.message);
    }
  };
  const strip = ({ _localOnly, ...r }) => r;
  const result = {};

  if (entities.customers) {
    const data = getLocalFallbackData("moxi_customers", "ah_customers");
    if (data.length) {
      await upsert("clientes", data.filter(c => c?.id).map(c => ({ ...strip(c), empresa_id: empresaId, nombre: c.name || c.nombre || "" })));
      result.customers = data;
    }
  }
  if (entities.products) {
    const data = getLocalFallbackData("moxi_products", "ah_products3");
    if (data.length) {
      await upsert("productos", data.filter(p => p?.id).map(p => ({ ...strip(p), empresa_id: empresaId, nombre: p.name || p.nombre || "" })));
      result.products = data;
    }
  }
  if (entities.expenses) {
    const data = getLocalFallbackData("moxi_expenses", "ah_expenses");
    if (data.length) {
      await upsert("gastos", data.filter(g => g?.id).map(g => ({ ...strip(g), empresa_id: empresaId, descripcion: g.description || g.descripcion || "", monto: g.amount ?? g.monto ?? 0 })));
      result.expenses = data;
    }
  }
  if (entities.movements) {
    const data = getLocalFallbackData("moxi_movements", "ah_movements");
    if (data.length) {
      await upsert("movimientos", data.filter(m => m?.id).map(m => ({ ...strip(m), empresa_id: empresaId })));
      result.movements = data;
    }
  }
  if (entities.inventory) {
    const data = getLocalFallbackData("moxi_inventory", "ah_inventory3");
    if (data.length) {
      await upsert("inventario", data.filter(i => i?.productId).map(i => ({ ...strip(i), empresa_id: empresaId })), "productId");
      result.inventory = data;
    }
  }
  if (entities.pedidos) {
    const data = getLocalFallbackData("moxi_pedidos");
    if (data.length) {
      await upsert("pedidos", data.filter(p => p?.id).map(p => ({ ...strip(p), empresa_id: empresaId })));
      result.pedidos = data;
    }
  }

  const count = Object.values(result).reduce((s, a) => s + a.length, 0);
  if (count) console.log(`[migrate] ${count} registros subidos a Supabase`);
  return result;
};

export default function App() {
  const [user,setUser]=useState(null);
  const [tab,setTab]=useState("dashboard");
  const [data,setData]=useState(null);
  const [sidebarOpen,setSidebarOpen]=useState(false);
  const [sidebarCollapsed,setSidebarCollapsed]=useState(false);
  const [recoveryMode,setRecoveryMode]=useState(false);
  const [sessionChecked,setSessionChecked]=useState(false);
  const [isRestoringSession,setIsRestoringSession]=useState(false);
  const [rtRefreshTrigger,setRtRefreshTrigger]=useState(0);
  const [suscripcion,setSuscripcion]=useState(null);
  const [waConfig,setWaConfig]=useState("+59163506018");
  const [salesLoading,setSalesLoading]=useState(false);
  const [salesError,setSalesError]=useState(false);
  // mountedTabs: una vez visitado un tab, se queda montado (display:none cuando inactivo).
  // Evita desmontar/remontar componentes al navegar — no hay re-fetch, no hay re-cómputo.
  const [mountedTabs,setMountedTabs]=useState(()=>new Set(["dashboard"]));
  const isMobile=useIsMobile();

  // Refs para acceder a user/data actuales dentro de callbacks sin stale closures
  const userRef = useRef(null);
  const dataRef = useRef(null);
  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { if (data) dataRef.current = data; }, [data]);
  useEffect(() => { setMountedTabs(prev => { if (prev.has(tab)) return prev; const next = new Set(prev); next.add(tab); return next; }); }, [tab]);

  const loginUser = useCallback((newUser) => {
    userRef.current = newUser;
    if (newUser?.empresa_id) {
      setCurrentEmpresaId(newUser.empresa_id);
      saveLastEmpresaId(newUser.empresa_id);
    }
    setUser(newUser);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Actualizar empresa scope cuando el usuario se autentica
  useEffect(() => {
    if (user?.empresa_id) {
      setCurrentEmpresaId(user.empresa_id);
      saveLastEmpresaId(user.empresa_id);
      migrateLegacyStorageIfNeeded(user.empresa_id);
    }
  }, [user?.empresa_id]);

  const handleLogout = async () => {
    // Hard reset: limpiar TODO síncronamente antes de signOut.
    // Orden crítico: refs primero (para SIGNED_OUT handler), luego React state.
    setCurrentEmpresaId(null);
    userRef.current   = null;
    dataRef.current   = null;
    setUser(null);
    setData(createEmptyAppState());
    setSuscripcion(null);
    setTab("dashboard");
    setSidebarOpen(false);
    try { await supabase.removeAllChannels(); } catch {}
    try { await supabase.auth.signOut(); } catch {}
  };

  useEffect(() => {
    if (!user?.empresa_id || user?.role === "superadmin") return;
    suscripcionService.getOCrearTrial(user.empresa_id, dataRef.current?.config?.businessName || "")
      .then(sus => setSuscripcion(sus))
      .catch(() => {});
    suscripcionService.getConfig()
      .then(cfg => setWaConfig(cfg.whatsapp_soporte || "+59163506018"))
      .catch(() => {});
  }, [user?.empresa_id, user?.role]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reintentar onboarding: recarga perfil desde Supabase.
  // Si sigue sin empresa_id, cierra sesión para que el usuario re-registre su empresa.
  const handleRetryOnboarding = useCallback(async () => {
    if (!user?.id) return;
    // Reintentar hasta 3 veces con espera creciente (tolera cold start de Supabase)
    let profile = null;
    for (let i = 0; i < 3 && !profile?.empresa_id; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, 1000 * i));
      try { profile = await userService.getProfile(user.id); } catch {}
    }
    if (profile?.empresa_id) {
      const updated = {
        ...user,
        empresa_id: profile.empresa_id,
        name: profile.nombre || user.name,
        role: profile.role?.toLowerCase() || user.role,
      };
      setCurrentEmpresaId(updated.empresa_id);
      saveLastEmpresaId(updated.empresa_id);
      userRef.current = updated;
      setUser(updated);
    } else {
      await handleLogout();
    }
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

const init = async () => {
  // Fallback de seguridad: si onAuthStateChange no dispara INITIAL_SESSION en 500ms,
  // desbloqueamos la app manualmente para no quedar en loading infinito.
  await new Promise(resolve => setTimeout(resolve, 500));
  setSessionChecked(true);
};

// Carga inicial desde localStorage — corre una vez al montar, sin depender de user
  useEffect(()=>{
    (async()=>{
      // Migrar datos globales → scope ANTES de leerlos (orden crítico).
      // Sin esto, la primera carga tras login Supabase veía claves vacías.
      if (getCurrentEmpresaId()) migrateLegacyStorageIfNeeded(getCurrentEmpresaId());

      const hasScope = Boolean(getCurrentEmpresaId());
      // Categorías vacías para cuentas Supabase — el usuario define las suyas propias.
      const catFallback = hasScope
        ? [{ id: DEFAULT_CATEGORY_ID, name: "Sin categoría", locked: true }]
        : DEFAULT_CATEGORIES;

      const [
        rawCustomers,
        rawProducts,
        inventory,
        rawSales,
        suppliers,
        purchases,
        formulas,
        orders,
        pedidos,
        expenses,
        movements,
        storedCategories,
        rawUsers,
        config,
        activityLogs
      ] = await Promise.all([
        loadStoredValue("customers", hasScope ? [] : CUSTOMERS0),
        loadStoredValue("products",  hasScope ? [] : PRODUCTS0),
        loadStoredValue("inventory", hasScope ? [] : PRODUCTS0.map(p=>({productId:p.id,stock:0}))),
        loadStoredValue("sales",     []),
        loadStoredValue("suppliers", []),
        loadStoredValue("purchases", []),
        loadStoredValue("formulas",  hasScope ? [] : FORMULAS0),
        loadStoredValue("orders",    []),
        loadStoredValue("pedidos",   []),
        loadStoredValue("expenses",  []),
        loadStoredValue("movements", []),
        loadStoredValue("categories", catFallback),
        loadStoredValue("users",     DEFAULT_USERS),
        loadStoredValue("config",    DEFAULT_CONFIG),
        loadStoredValue("activityLogs", DEFAULT_ACTIVITY_LOGS),
      ]);

      const cats = ensureCategories(storedCategories, rawProducts);
      // Aplicar moneda guardada antes del primer render
      if (config?.currency) applyCurrencyCode(config.currency);
      setData({
        customers:    normalizeCustomers(rawCustomers),
        products:     sanitizeProducts(rawProducts, cats),
        inventory,
        sales:        normalizeSales(rawSales),
        suppliers,
        purchases,
        formulas,
        orders,
        pedidos,
        expenses,
        movements,
        categories:   cats,
        users:        normalizeUsers(rawUsers),
        config,
        activityLogs,
      });
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Restaurar sesión Supabase en paralelo — si hay sesión activa, setea user sin bloquear UI
  useEffect(()=>{ init(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Listener reactivo: maneja cambios de sesión Supabase (page reload, token refresh, cross-tab)
  useEffect(()=>{
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED" || event === "SIGNED_IN") && session?.user) {
        // Skip si ya tenemos exactamente este usuario
        if (userRef.current?.id === session.user.id) { setSessionChecked(true); return; }
        // Desbloquear UI inmediatamente — cargar perfil en background sin bloquear
        if (event === "INITIAL_SESSION") {
          setIsRestoringSession(true);
          setSessionChecked(true);
        }
        // Timeout de 6s: si Supabase no responde, desbloquear pantalla sin perfil
        const profileRace = Promise.race([
          userService.getProfile(session.user.id),
          new Promise(r => setTimeout(() => r(null), 6000)),
        ]);
        profileRace.then(profile => {
          if (profile) {
            const newUser = {
              id: session.user.id,
              name: profile.nombre,
              role: profile.role?.toLowerCase() || "usuario",
              empresa_id: profile.empresa_id,
            };
            if (newUser.empresa_id) {
              setCurrentEmpresaId(newUser.empresa_id);
              saveLastEmpresaId(newUser.empresa_id);
            }
            userRef.current = newUser;
            setUser(newUser);
          } else {
            console.warn("[AUTH] getProfile timeout o sin datos — pantalla desbloqueada");
          }
        }).catch((e) => {
          console.warn("[AUTH] getProfile exception:", e?.message);
        }).finally(()=>{
          setSessionChecked(true);
          setIsRestoringSession(false);
        });
      } else if (event === "INITIAL_SESSION" && !session?.user) {
        // Sin sesión activa — desbloquear la app inmediatamente
        setSessionChecked(true);
        setIsRestoringSession(false);
      } else if (event === "PASSWORD_RECOVERY") {
        setRecoveryMode(true);
      } else if (event === "SIGNED_OUT") {
        // CRÍTICO: verificar userRef.current antes de limpiar.
        // Si un nuevo usuario ya se logueó (loginUser actualizó userRef síncronamente)
        // no limpiar — evita race condition logout-rápido → nuevo-login.
        if (userRef.current) return;
        setCurrentEmpresaId(null);
        resetCurrency();
        dataRef.current   = null;
        setUser(null);
        setData(createEmptyAppState());
        setRecoveryMode(false);
      }
    });
    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(()=>{
    if (!user?.empresa_id) return;
    setSalesLoading(true);
    setSalesError(false);
    const eid = user.empresa_id;
    let cancelled = false;
    let retryTimer = null;

    const applyData = (supaClientes, supaProductos, supaInventario, supaGastos, supaMovimientos, scopedConfig, supaPedidos) => {
      if (cancelled) return;
      setData(d => {
        if (!d) return d;
        const cats = d.categories || DEFAULT_CATEGORIES;
        const next = { ...d };
        // null  = Supabase falló o timeout → conservar caché local
        // []    = Supabase respondió vacío → NO sobreescribir si tenemos datos en caché
        //         (evita borrar datos salvados localmente cuando RLS o columnas fallan)
        // [...]  = Supabase tiene datos → actualizar y cachear
        if (Array.isArray(supaClientes)    && supaClientes.length    > 0) { next.customers  = normalizeCustomers(supaClientes);      cacheSupabaseData("customers",  supaClientes,    eid); }
        if (Array.isArray(supaProductos)   && supaProductos.length   > 0) { next.products   = sanitizeProducts(supaProductos, cats); cacheSupabaseData("products",   supaProductos,   eid); }
        if (Array.isArray(supaInventario)  && supaInventario.length  > 0) { next.inventory  = supaInventario;                        cacheSupabaseData("inventory",  supaInventario,  eid); }
        if (Array.isArray(supaGastos)      && supaGastos.length      > 0) { next.expenses   = supaGastos;                            cacheSupabaseData("expenses",   supaGastos,      eid); }
        if (Array.isArray(supaMovimientos) && supaMovimientos.length > 0) { next.movements  = supaMovimientos;                       cacheSupabaseData("movements",  supaMovimientos, eid); }
        if (Array.isArray(supaPedidos)     && supaPedidos.length     > 0) { next.pedidos    = supaPedidos;                           cacheSupabaseData("pedidos",    supaPedidos,     eid); }
        if (scopedConfig)                                                   next.config      = scopedConfig;
        return next;
      });
      if (scopedConfig?.currency) applyCurrencyCode(scopedConfig.currency);
    };

    const doFetch = (isRetry) => {
      const T = (p) => Promise.race([p, new Promise(r => setTimeout(() => r(null), isRetry ? 8000 : 5000))]);

      const ventasRace = isRetry ? null : Promise.race([
        ventasService.getVentas(eid),
        new Promise(r => setTimeout(() => r(null), 6000)),
      ]);

      Promise.all([
        T(clientesService.getClientes(eid)),
        T(productosService.getProductos(eid)),
        T(inventarioService.getInventario(eid)),
        T(gastosService.getGastos(eid)),
        T(movimientosService.getMovimientos(eid)),
        T(loadStoredValue("config", null)),
        T(pedidosService.getPedidos(eid)),
        isRetry ? T(ventasService.getVentas(eid)) : Promise.resolve(null),
      ]).then(([supaClientes, supaProductos, supaInventario, supaGastos, supaMovimientos, scopedConfig, supaPedidos, retryVentas]) => {
        applyData(supaClientes, supaProductos, supaInventario, supaGastos, supaMovimientos, scopedConfig, supaPedidos);

        // Ventas del retry aplicadas directamente
        if (isRetry) {
          if (Array.isArray(retryVentas) && retryVentas.length > 0) {
            setData(d => d ? { ...d, sales: normalizeSales(retryVentas) } : d);
            cacheSupabaseData("sales", retryVentas, eid);
          }
          if (!cancelled) setSalesLoading(false);
        }

        // Si Supabase devolvió tablas vacías, intentar migrar datos locales a Supabase
        const emptyEntities = {
          customers: Array.isArray(supaClientes)    && supaClientes.length    === 0,
          products:  Array.isArray(supaProductos)   && supaProductos.length   === 0,
          expenses:  Array.isArray(supaGastos)      && supaGastos.length      === 0,
          movements: Array.isArray(supaMovimientos) && supaMovimientos.length  === 0,
          inventory: Array.isArray(supaInventario)  && supaInventario.length   === 0,
          pedidos:   Array.isArray(supaPedidos)     && supaPedidos.length      === 0,
        };
        if (Object.values(emptyEntities).some(Boolean)) {
          uploadLocalToSupabase(eid, emptyEntities).then(migrated => {
            if (cancelled || !Object.keys(migrated).length) return;
            setData(d => {
              if (!d) return d;
              const cats = d.categories || DEFAULT_CATEGORIES;
              const next = { ...d };
              if (migrated.customers?.length) { next.customers = normalizeCustomers(migrated.customers); cacheSupabaseData("customers", migrated.customers, eid); }
              if (migrated.products?.length)  { next.products  = sanitizeProducts(migrated.products, cats); cacheSupabaseData("products", migrated.products, eid); }
              if (migrated.expenses?.length)  { next.expenses  = migrated.expenses;  cacheSupabaseData("expenses",  migrated.expenses,  eid); }
              if (migrated.movements?.length) { next.movements = migrated.movements; cacheSupabaseData("movements", migrated.movements, eid); }
              if (migrated.inventory?.length) { next.inventory = migrated.inventory; cacheSupabaseData("inventory", migrated.inventory, eid); }
              if (migrated.pedidos?.length)   { next.pedidos   = migrated.pedidos;   cacheSupabaseData("pedidos",   migrated.pedidos,   eid); }
              return next;
            });
          }).catch(e => console.warn("[migrate] error:", e.message));
        }

        // Retry único si todo Supabase vino vacío — tolera cold start / RLS transitoria
        const allSupabaseEmpty =
          (Array.isArray(supaClientes) ? supaClientes.length === 0 : true) &&
          (Array.isArray(supaProductos) ? supaProductos.length === 0 : true) &&
          (Array.isArray(supaGastos) ? supaGastos.length === 0 : true);
        if (!isRetry && allSupabaseEmpty && !cancelled) {
          console.warn("[App] Supabase devolvió todo vacío — reintentando en 5s...");
          retryTimer = setTimeout(() => doFetch(true), 5000);
        }
      }).catch(err => { if (!cancelled) console.warn("[App] hydration failed:", err?.message ?? err); })
      .finally(() => {
        if (isRetry || cancelled) return;
        ventasRace
          .then(supaVentas => {
            if (cancelled) return;
            if (Array.isArray(supaVentas) && supaVentas.length > 0) {
              // Supabase tiene ventas — actualizar estado y cachear
              setData(d => d ? { ...d, sales: normalizeSales(supaVentas) } : d);
              cacheSupabaseData("sales", supaVentas, eid);
            } else if (Array.isArray(supaVentas) && supaVentas.length === 0) {
              // Supabase vacío — intentar migrar ventas locales si hay
              const localSales = getLocalFallbackData("moxi_sales", "ah_sales");
              if (localSales.length > 0) {
                const rows = localSales.filter(v => v?.id).map(({ _localOnly, ...v }) => ({
                  ...v, empresa_id: eid, createdAt: v.createdAt || v.date || new Date().toISOString()
                }));
                supabase.from("ventas").upsert(rows.slice(0, 150), { onConflict: "id", ignoreDuplicates: true }).then(({ error }) => {
                  if (error) console.warn("[migrate] ventas:", error.message);
                  if (!cancelled) {
                    setData(d => d ? { ...d, sales: normalizeSales(localSales) } : d);
                    cacheSupabaseData("sales", localSales, eid);
                  }
                });
              }
              // Si no hay datos locales ni en Supabase, no tocar el estado
              // (la caché del localStorage se preserva)
            } else {
              setSalesError(true);
            }
          })
          .catch(e => { if (!cancelled) { console.warn("[App] getVentas failed:", e?.message); setSalesError(true); } })
          .finally(() => { if (!cancelled) setSalesLoading(false); });
      });
    };

    doFetch(false);
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [user?.empresa_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime: sincroniza ventas, productos, inventario, clientes y gastos entre pestañas/dispositivos.
  // Usa actualizaciones quirúrgicas (payload-based) en lugar de refetch completo:
  //   DELETE → filter out by id
  //   INSERT/UPDATE → mergeById para deduplicar sin reemplazar arrays completos
  useEffect(() => {
    if (!user?.empresa_id) return;
    const eid = user.empresa_id;
    const ch = supabase
      .channel(`moxi_rt_${eid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "ventas", filter: `empresa_id=eq.${eid}` }, (payload) => {
        setData(s => {
          if (!s) return s;
          if (payload.eventType === "DELETE") {
            return { ...s, sales: (s.sales || []).filter(x => x.id !== payload.old?.id) };
          }
          if (payload.new?.id) {
            return { ...s, sales: mergeById(s.sales, normalizeSales([payload.new])) };
          }
          return s;
        });
        setRtRefreshTrigger(t => t + 1);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "productos", filter: `empresa_id=eq.${eid}` }, (payload) => {
        setData(s => {
          if (!s) return s;
          if (payload.eventType === "DELETE") {
            return { ...s, products: (s.products || []).filter(x => x.id !== payload.old?.id) };
          }
          if (payload.new?.id) {
            const cats = s.categories || DEFAULT_CATEGORIES;
            return { ...s, products: mergeById(s.products, sanitizeProducts([payload.new], cats)) };
          }
          return s;
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "inventario", filter: `empresa_id=eq.${eid}` }, (payload) => {
        setData(s => {
          if (!s) return s;
          if (payload.eventType === "DELETE") {
            return { ...s, inventory: (s.inventory || []).filter(x => x.id !== payload.old?.id) };
          }
          if (payload.new?.id) {
            return { ...s, inventory: mergeById(s.inventory, [payload.new]) };
          }
          return s;
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "clientes", filter: `empresa_id=eq.${eid}` }, (payload) => {
        setData(s => {
          if (!s) return s;
          if (payload.eventType === "DELETE") {
            return { ...s, customers: (s.customers || []).filter(x => x.id !== payload.old?.id) };
          }
          if (payload.new?.id) {
            return { ...s, customers: mergeById(s.customers, normalizeCustomers([payload.new])) };
          }
          return s;
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "gastos", filter: `empresa_id=eq.${eid}` }, (payload) => {
        setData(s => {
          if (!s) return s;
          if (payload.eventType === "DELETE") {
            return { ...s, expenses: (s.expenses || []).filter(x => x.id !== payload.old?.id) };
          }
          if (payload.new?.id) {
            return { ...s, expenses: mergeById(s.expenses, [payload.new]) };
          }
          return s;
        });
        setRtRefreshTrigger(t => t + 1);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.empresa_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const save=useCallback((key,value)=>{
    // Sincronizar a Supabase si aplica (fire-and-forget, nunca bloquea UI)
    if (SYNC_KEYS.has(key)) syncDiff(key, dataRef.current?.[key], value, userRef.current);
    // Actualizar moneda global al instante cuando se guarda config
    if (key === "config" && value?.currency) applyCurrencyCode(value.currency);
    setData(d=>({...d,[key]:value}));
    persistValue(key, value);
  },[]);

  const logAction=useCallback(action=>{
    if(!user)return;
    setData(current=>{
      const nextLogs=[buildActivityEntry(user, action), ...(current?.activityLogs||[])].slice(0, 200);
      persistValue("activityLogs", nextLogs);
      return {...current, activityLogs: nextLogs};
    });
  },[user]);

  const reloadSales = useCallback(async () => {
    if (!user?.empresa_id) return;
    setSalesLoading(true);
    setSalesError(false);
    try {
      const supaVentas = await ventasService.getVentas(user.empresa_id);
      if (Array.isArray(supaVentas)) {
        setData(d => ({ ...d, sales: normalizeSales(supaVentas) }));
        cacheSupabaseData("sales", supaVentas, user.empresa_id);
      } else {
        setSalesError(true);
      }
    } catch (e) { console.warn("[reloadSales]", e.message); setSalesError(true); }
    finally { setSalesLoading(false); }
  }, [user?.empresa_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const allowedTabs = useMemo(() => ROLES[user?.role] || [], [user?.role]);

  useEffect(() => {
    if (user && allowedTabs.length && !allowedTabs.includes(tab)) {
      setTab(allowedTabs[0]);
    }
  }, [user, tab, allowedTabs]);

  // MUST be before any conditional return — hooks cannot follow early returns
  const appDebtClients = useMemo(() =>
    (data?.customers || []).filter(c =>
      (data?.sales || []).filter(s => s.customerId === c.id).reduce((a, s) => a + s.debt, 0) > 0
    ),
  [data?.customers, data?.sales]);
  const appLowStock = useMemo(() => {
    const getStock = id => (data?.inventory?.find(i => i.productId === id) || {}).stock || 0;
    return (data?.products || []).filter(p => p.minStock > 0 && getStock(p.id) <= p.minStock);
  }, [data?.products, data?.inventory]);

  const loadingScreen = (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"100vh",fontFamily:FONT,background:"radial-gradient(circle at 30% 20%, rgba(34,197,254,0.10), transparent 50%), #0D1117",gap:18}}>
      <BrandLogo size={76}/>
      <div style={{fontSize:14,color:"rgba(255,255,255,0.38)",letterSpacing:"0.04em",fontWeight:500}}>Cargando sistema…</div>
      <div style={{width:140,height:2,background:"rgba(255,255,255,0.08)",borderRadius:2,overflow:"hidden"}}>
        <div style={{height:"100%",width:"40%",background:"linear-gradient(90deg,#111E7B,#22C5FE)",borderRadius:2,animation:"moxiLoad 1.2s ease-in-out infinite alternate"}}/>
      </div>
      <div style={{fontSize:11,color:"rgba(255,255,255,0.22)",marginTop:4}}>Conectando…</div>
    </div>
  );
  if(!data || !sessionChecked) return loadingScreen;
  if(recoveryMode) return <ResetPasswordScreen onDone={() => setRecoveryMode(false)} />;
  // isRestoringSession: hay sesión activa pero el perfil aún se está cargando — no mostrar AuthScreen
  if(!user && isRestoringSession) return loadingScreen;
  if(!user) return <AuthScreen config={data.config} onLogin={loginUser} saveConfig={value=>save("config", value)}/>;
  // Usuario Supabase sin empresa_id: bloquear acceso total al ERP.
  // No renderizar dashboard, ventas, clientes ni ningún módulo.
  if(isSupabaseUser(user) && !user.empresa_id) return <OnboardingIncompleteScreen onRetry={handleRetryOnboarding} onLogout={handleLogout}/>;
  // Suscripción vencida: bloquear acceso al ERP (excepto superadmin)
  if(user?.role !== "superadmin" && suscripcion && suscripcionService.estaVencida(suscripcion)) {
    return <SuscripcionVencida suscripcion={suscripcion} whatsapp={waConfig} onLogout={handleLogout} />;
  }

  const navLabel=NAV_GROUPS.flatMap(g=>g.items).find(i=>i.id===tab)?.label||BRAND_NAME;
  const businessName=safeBusinessName(data.config);

  return (
    <ThemeProvider>
      <Toaster position="top-right" toastOptions={{ style: { fontFamily: FONT, fontSize: 13, borderRadius: 10, border: "1px solid var(--color-border)", background: "var(--color-bg-surface)", color: "var(--color-text)" } }} />
      <div style={{ display: "flex", height: "100vh", fontFamily: FONT, background: "var(--color-bg-primary)", fontSize: 14, color: "var(--color-text)", overflow: "hidden" }}>
        {!isMobile && (
          <Sidebar
            tab={tab} setTab={setTab} user={user} config={data.config}
            onLogout={handleLogout} open={sidebarOpen} onClose={() => setSidebarOpen(false)}
            collapsed={sidebarCollapsed} onToggleCollapse={() => setSidebarCollapsed(v => !v)}
          />
        )}
        {isMobile && sidebarOpen && (
          <Sidebar
            tab={tab} setTab={setTab} user={user} config={data.config}
            onLogout={handleLogout} open={sidebarOpen} onClose={() => setSidebarOpen(false)}
            collapsed={false} onToggleCollapse={() => {}}
          />
        )}

        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, overflow: "hidden" }}>

          <Topbar isMobile={isMobile} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} sidebarCollapsed={sidebarCollapsed} setSidebarCollapsed={setSidebarCollapsed} setTab={setTab} user={user} data={data} appDebtClients={appDebtClients} appLowStock={appLowStock} />

          {/* ── AVISO DE VENCIMIENTO PRÓXIMO ── */}
          {user?.role !== "superadmin" && suscripcion && !suscripcionService.estaVencida(suscripcion) && suscripcionService.diasRestantes(suscripcion) <= 7 && (
            <div style={{ background: "#92400e", borderBottom: "1px solid #b45309", padding: "8px 18px", display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#fef3c7", flexShrink: 0 }}>
              <span>⚠️</span>
              <span>
                {suscripcionService.diasRestantes(suscripcion) === 0
                  ? "Tu suscripción vence hoy."
                  : `Tu suscripción vence en ${suscripcionService.diasRestantes(suscripcion)} día${suscripcionService.diasRestantes(suscripcion) !== 1 ? "s" : ""}.`}
                {" "}Contáctanos para renovarla.
              </span>
              <a
                href={`https://wa.me/${waConfig.replace(/\D/g, "")}?text=${encodeURIComponent("Hola, quiero renovar mi suscripción de Moxi Business.")}`}
                target="_blank"
                rel="noreferrer"
                style={{ marginLeft: "auto", background: "#15803d", color: "white", borderRadius: 6, padding: "4px 12px", fontSize: 12, fontWeight: 600, textDecoration: "none", fontFamily: FONT, whiteSpace: "nowrap" }}
              >
                Renovar por WhatsApp
              </a>
            </div>
          )}

          {/* ── MAIN CONTENT ──
               Lazy-mount + display:none: cada tab se monta la primera vez que se visita
               y permanece en memoria. Navegar de vuelta es INSTANTÁNEO — sin re-fetch,
               sin re-cómputo de useMemo, sin llamadas al servidor. */}
          <main style={{ flex: 1, overflowY: "auto", padding: isMobile ? "14px 14px 80px" : "28px 32px", minWidth: 0 }}>
            <div style={{ maxWidth: 1400, margin: "0 auto" }}>
              {mountedTabs.has("dashboard")   && <div style={{ display: tab === "dashboard"   ? "" : "none" }}><DashboardPremium D={data} setTab={setTab} user={user} refreshTrigger={rtRefreshTrigger} /></div>}
              {mountedTabs.has("clientes")    && <div style={{ display: tab === "clientes"    ? "" : "none" }}><Clientes D={data} save={save} user={user} /></div>}
              {mountedTabs.has("ventas")      && <div style={{ display: tab === "ventas"      ? "" : "none" }}><Ventas D={data} save={save} user={user} config={data.config} logAction={logAction} onRefreshDashboard={()=>{ invalidateAnalyticsCache(); setRtRefreshTrigger(t=>t+1); }} onReloadSales={reloadSales} salesLoading={salesLoading} salesError={salesError} /></div>}
              {mountedTabs.has("pedidos")     && <div style={{ display: tab === "pedidos"     ? "" : "none" }}><Pedidos D={data} save={save} user={user} config={data.config} logAction={logAction} onRefreshDashboard={()=>setRtRefreshTrigger(t=>t+1)} /></div>}
              {mountedTabs.has("deudas")      && <div style={{ display: tab === "deudas"      ? "" : "none" }}><Deudas D={data} save={save} user={user} logAction={logAction} /></div>}
              {mountedTabs.has("productos")   && <div style={{ display: tab === "productos"   ? "" : "none" }}><Productos D={data} save={save} user={user} /></div>}
              {mountedTabs.has("inventario")  && <div style={{ display: tab === "inventario"  ? "" : "none" }}><Inventario D={data} save={save} user={user} /></div>}
              {mountedTabs.has("produccion")  && <div style={{ display: tab === "produccion"  ? "" : "none" }}><Produccion D={data} save={save} user={user} logAction={logAction} /></div>}
              {mountedTabs.has("proveedores") && <div style={{ display: tab === "proveedores" ? "" : "none" }}><Proveedores D={data} save={save} /></div>}
              {mountedTabs.has("caja")        && <div style={{ display: tab === "caja"        ? "" : "none" }}><Caja D={data} save={save} user={user} logAction={logAction} onRefreshDashboard={()=>setRtRefreshTrigger(t=>t+1)} /></div>}
              {mountedTabs.has("gastos")      && <div style={{ display: tab === "gastos"      ? "" : "none" }}><GastosPage D={data} save={save} user={user} logAction={logAction} onRefreshDashboard={()=>setRtRefreshTrigger(t=>t+1)} /></div>}
              {mountedTabs.has("analisis")    && <div style={{ display: tab === "analisis"    ? "" : "none" }}><Analisis D={data} /></div>}
              {mountedTabs.has("exportar")    && <div style={{ display: tab === "exportar"    ? "" : "none" }}><Exportar D={data} /></div>}
              {mountedTabs.has("usuarios")    && <div style={{ display: tab === "usuarios"    ? "" : "none" }}><UsuariosAdmin D={data} save={save} user={user} logAction={logAction} onProfileUpdate={newName=>setUser(u=>({...u,name:newName}))} /></div>}
              {mountedTabs.has("superadmin")  && <div style={{ display: tab === "superadmin"  ? "" : "none" }}><SuperAdminPanel /></div>}
            </div>
          </main>

          {/* ── BOTTOM NAV (mobile) ── */}
          {isMobile && <BottomNav tab={tab} setTab={setTab} user={user} />}
        </div>
      </div>
    </ThemeProvider>
  );
}
