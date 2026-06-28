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
import { loadStoredValue, persistValue, buildActivityEntry, DEFAULT_CONFIG, DEFAULT_ACTIVITY_LOGS } from "./utils/appStorage.js";
import { syncDiff, SYNC_KEYS, createEmptyAppState } from "./utils/syncDiff.js";
import { PRODUCTS0, FORMULAS0, CUSTOMERS0, DEFAULT_USERS } from "./seedData.js";

export default function App() {
  const [user,setUser]=useState(null);
  const [tab,setTab]=useState("dashboard");
  const [data,setData]=useState(null);
  const [sidebarOpen,setSidebarOpen]=useState(false);
  const [sidebarCollapsed,setSidebarCollapsed]=useState(false);
  const [recoveryMode,setRecoveryMode]=useState(false);
  const [sessionChecked,setSessionChecked]=useState(false);
  const [isRestoringSession,setIsRestoringSession]=useState(false);
  const [isLoadingScope,setIsLoadingScope]=useState(false);
  const [rtRefreshTrigger,setRtRefreshTrigger]=useState(0);
  const [suscripcion,setSuscripcion]=useState(null);
  const [waConfig,setWaConfig]=useState("+59163506018");
  const isMobile=useIsMobile();

  // Refs para acceder a user/data actuales dentro de callbacks sin stale closures
  const userRef = useRef(null);
  const dataRef = useRef(null);
  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { if (data) dataRef.current = data; }, [data]);

  // loginUser: actualiza userRef Y empresa scope SÍNCRONAMENTE antes del render.
  // También bloquea el ERP (isLoadingScope) ANTES del render para evitar el frame vacío
  // entre "user seteado" y "efecto de hidratación ejecutado".
  const loginUser = useCallback((newUser) => {
    userRef.current = newUser;
    if (newUser?.empresa_id) {
      setCurrentEmpresaId(newUser.empresa_id);
      saveLastEmpresaId(newUser.empresa_id);
      setIsLoadingScope(true);
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
    setIsLoadingScope(false);
    setSidebarOpen(false);
    try { await supabase.removeAllChannels(); } catch {}
    try { await supabase.auth.signOut(); } catch {}
  };

  // Verificar suscripción después de que el scope se haya hidratado
  useEffect(() => {
    if (!user?.empresa_id || isLoadingScope || user?.role === "superadmin") return;
    suscripcionService.getOCrearTrial(user.empresa_id, dataRef.current?.config?.businessName || "")
      .then(sus => setSuscripcion(sus))
      .catch(() => {});
    suscripcionService.getConfig()
      .then(cfg => setWaConfig(cfg.whatsapp_soporte || "+59163506018"))
      .catch(() => {});
  }, [user?.empresa_id, isLoadingScope, user?.role]); // eslint-disable-line react-hooks/exhaustive-deps

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
  // Fallback de seguridad: si onAuthStateChange no dispara INITIAL_SESSION en 4s,
  // desbloqueamos la app manualmente para no quedar en loading infinito.
  await new Promise(resolve => setTimeout(resolve, 4000));
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
        userService.getProfile(session.user.id).then(profile => {
          if (profile) {
            const newUser = {
              id: session.user.id,
              name: profile.nombre,
              role: profile.role?.toLowerCase() || "usuario",
              empresa_id: profile.empresa_id,
            };
            // Actualizar scope síncronamente para que persistValue use el empresa_id correcto
            // desde el primer tick. isLoadingScope bloquea el ERP antes del render.
            if (newUser.empresa_id) {
              setCurrentEmpresaId(newUser.empresa_id);
              saveLastEmpresaId(newUser.empresa_id);
              setIsLoadingScope(true);
            }
            userRef.current = newUser;
            setUser(newUser);
          }
        }).catch((e) => {
          console.warn("[AUTH] INITIAL_SESSION getProfile exception:", e?.message);
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
        setIsLoadingScope(false);
        setRecoveryMode(false);
      }
    });
    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Después de login, cargar todas las entidades principales desde Supabase en paralelo.
  // isLoadingScope = true bloquea el render del ERP mientras llegan los datos del nuevo scope.
  // Garantiza cero frames con datos de empresa anterior visibles al usuario.
  useEffect(()=>{
    if (!user?.empresa_id) return;
    setIsLoadingScope(true);
    // Limpiar arrays de negocio síncronamente — ningún frame con datos anteriores
    setData(d => d ? {
      ...d,
      sales: [], customers: [], products: [],
      inventory: [], expenses: [], movements: [],
    } : d);
    const eid = user.empresa_id;
    Promise.all([
      ventasService.getVentas(eid),
      clientesService.getClientes(eid),
      productosService.getProductos(eid),
      inventarioService.getInventario(eid),
      gastosService.getGastos(eid),
      movimientosService.getMovimientos(eid),
      // Config viene de localStorage scoped — cargamos aquí para que re-login sin
      // refresh de página no pierda el businessName y currency de la empresa.
      loadStoredValue("config", null),
      // Usuarios de la empresa — para que admin vea todos los miembros del equipo
      userService.getEmpresaUsuarios(eid),
      // Cotizaciones y pedidos (devuelve null si la tabla aún no existe → no pisa local)
      pedidosService.getPedidos(eid),
    ]).then(([supaVentas, supaClientes, supaProductos, supaInventario, supaGastos, supaMovimientos, scopedConfig, supaUsuarios, supaPedidos]) => {
      setData(d => {
        if (!d) return d;
        const cats = d.categories || DEFAULT_CATEGORIES;
        const next = { ...d };
        if (Array.isArray(supaVentas))      next.sales      = normalizeSales(supaVentas);
        if (Array.isArray(supaClientes))    next.customers  = normalizeCustomers(supaClientes);
        if (Array.isArray(supaProductos))   next.products   = sanitizeProducts(supaProductos, cats);
        if (Array.isArray(supaInventario))  next.inventory  = supaInventario;
        if (Array.isArray(supaGastos))      next.expenses   = supaGastos;
        if (Array.isArray(supaMovimientos)) next.movements  = supaMovimientos;
        // Pedidos: solo sobrescribir si Supabase devolvió un array (null = tabla inexistente → conservar local)
        if (Array.isArray(supaPedidos))     next.pedidos    = supaPedidos;
        // Solo sobrescribir config si el scope tiene una guardada (no remplazar con null)
        if (scopedConfig)                   next.config     = scopedConfig;
        // Usuarios empresa — sobrescribir solo si Supabase devuelve datos
        if (Array.isArray(supaUsuarios) && supaUsuarios.length > 0) next.users = supaUsuarios;
        return next;
      });
      // Sincronizar símbolo de moneda con la config del scope recién cargado
      if (scopedConfig?.currency) applyCurrencyCode(scopedConfig.currency);
    }).catch((err) => { console.warn("[App] hydration failed:", err?.message ?? err); }).finally(() => setIsLoadingScope(false));
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
    </div>
  );
  if(!data || !sessionChecked) return loadingScreen;
  if(recoveryMode) return <ResetPasswordScreen onDone={() => setRecoveryMode(false)} />;
  // isRestoringSession: hay sesión activa pero el perfil aún se está cargando — no mostrar AuthScreen
  if(!user && isRestoringSession) return loadingScreen;
  if(!user) return <AuthScreen users={data.users} config={data.config} onLogin={loginUser} saveUsers={value=>save("users", value)} saveConfig={value=>save("config", value)}/>;
  // Usuario Supabase sin empresa_id: bloquear acceso total al ERP.
  // No renderizar dashboard, ventas, clientes ni ningún módulo.
  if(isSupabaseUser(user) && !user.empresa_id) return <OnboardingIncompleteScreen onRetry={handleRetryOnboarding} onLogout={handleLogout}/>;
  // Bloquear render del ERP hasta que Supabase haya hidratado los datos del scope actual.
  // Sin esto, el dashboard muestra KPIs vacíos ($0, 0 clientes) durante 1-3 segundos.
  if(isLoadingScope) return loadingScreen;
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

          {/* ── MAIN CONTENT ── */}
          <main style={{ flex: 1, overflowY: "auto", padding: isMobile ? "14px 14px 80px" : "28px 32px", minWidth: 0 }}>
            <div style={{ maxWidth: 1400, margin: "0 auto" }}>
              {tab === "dashboard"   && <DashboardPremium D={data} setTab={setTab} user={user} refreshTrigger={rtRefreshTrigger} />}
              {tab === "clientes"    && <Clientes D={data} save={save} user={user} />}
              {tab === "ventas"      && <Ventas D={data} save={save} user={user} config={data.config} logAction={logAction} onRefreshDashboard={()=>setRtRefreshTrigger(t=>t+1)} />}
              {tab === "pedidos"     && <Pedidos D={data} save={save} user={user} config={data.config} logAction={logAction} onRefreshDashboard={()=>setRtRefreshTrigger(t=>t+1)} />}
              {tab === "deudas"      && <Deudas D={data} save={save} user={user} logAction={logAction} />}
              {tab === "productos"   && <Productos D={data} save={save} user={user} />}
              {tab === "inventario"  && <Inventario D={data} save={save} user={user} />}
              {tab === "produccion"  && <Produccion D={data} save={save} user={user} logAction={logAction} />}
              {tab === "proveedores" && <Proveedores D={data} save={save} />}
              {tab === "caja"        && <Caja D={data} save={save} user={user} logAction={logAction} onRefreshDashboard={()=>setRtRefreshTrigger(t=>t+1)} />}
              {tab === "gastos"      && <GastosPage D={data} save={save} user={user} logAction={logAction} onRefreshDashboard={()=>setRtRefreshTrigger(t=>t+1)} />}
              {tab === "analisis"    && <Analisis D={data} />}
              {tab === "exportar"    && <Exportar D={data} />}
              {tab === "usuarios"    && <UsuariosAdmin D={data} save={save} user={user} logAction={logAction} onProfileUpdate={newName=>setUser(u=>({...u,name:newName}))} />}
              {tab === "superadmin" && <SuperAdminPanel />}
            </div>
          </main>

          {/* ── BOTTOM NAV (mobile) ── */}
          {isMobile && <BottomNav tab={tab} setTab={setTab} user={user} />}
        </div>
      </div>
    </ThemeProvider>
  );
}
