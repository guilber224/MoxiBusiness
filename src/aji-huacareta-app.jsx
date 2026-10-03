import { useState, useEffect, useRef, useMemo, useCallback, lazy, Suspense } from "react";
import { supabase } from "./lib/supabaseClient";
import { userService } from "./services/userService.js";
import { Toaster } from "react-hot-toast";
import { applyCurrencyCode, resetCurrency } from "./currency.js";
import { BRAND_NAME, ThemeProvider, FONT } from "./theme.jsx";
import { useIsMobile } from "./hooks/useIsMobile.js";
import { BrandLogo } from "./components/ui/BrandLogo.jsx";
import { BottomNav } from "./components/BottomNav.jsx";
import { ROLES } from "./navConfig.js";
import { AuthScreen } from "./screens/AuthScreen.jsx";
import { OnboardingIncompleteScreen } from "./screens/OnboardingIncompleteScreen.jsx";
import { Sidebar } from "./components/Sidebar.jsx";
import { Topbar } from "./components/Topbar.jsx";
import { SuscripcionVencida } from "./screens/SuscripcionVencida.jsx";
import { suscripcionService } from "./services/suscripcionService.js";
import { useMoxiData } from "./data/useMoxiData.js";
import { EstadoDatos } from "./components/ui/EstadoDatos.jsx";

// Tras publicar una versión nueva, una pestaña abierta con la versión vieja pide archivos
// que ya no existen → recargar la página una vez para obtener la versión actual.
const lazyWithReload = (factory) => lazy(() => factory().then(mod => {
  try { sessionStorage.removeItem("moxi_chunk_reload"); } catch {}
  return mod;
}, err => {
  const flag = "moxi_chunk_reload";
  let reloaded = false;
  try { reloaded = sessionStorage.getItem(flag) === "1"; sessionStorage.setItem(flag, "1"); } catch {}
  if (!reloaded) { window.location.reload(); return new Promise(() => {}); }
  throw err;
}));

// Secciones cargadas bajo demanda: el código de cada una se descarga la primera vez que se abre.
const DashboardPremium = lazyWithReload(() => import("./components/DashboardPremium.jsx").then(m => ({ default: m.DashboardPremium })));
const Clientes = lazyWithReload(() => import("./components/Clientes.jsx").then(m => ({ default: m.Clientes })));
const Productos = lazyWithReload(() => import("./components/Productos.jsx").then(m => ({ default: m.Productos })));
const Inventario = lazyWithReload(() => import("./components/Inventario.jsx").then(m => ({ default: m.Inventario })));
const Ventas = lazyWithReload(() => import("./components/Ventas.jsx").then(m => ({ default: m.Ventas })));
const Pedidos = lazyWithReload(() => import("./components/Pedidos.jsx").then(m => ({ default: m.Pedidos })));
const Deudas = lazyWithReload(() => import("./components/Deudas.jsx").then(m => ({ default: m.Deudas })));
const Produccion = lazyWithReload(() => import("./components/Produccion.jsx").then(m => ({ default: m.Produccion })));
const Proveedores = lazyWithReload(() => import("./components/Proveedores.jsx").then(m => ({ default: m.Proveedores })));
const GastosPage = lazyWithReload(() => import("./components/GastosPage.jsx").then(m => ({ default: m.GastosPage })));
const Caja = lazyWithReload(() => import("./components/Caja.jsx").then(m => ({ default: m.Caja })));
const Analisis = lazyWithReload(() => import("./components/Analisis.jsx").then(m => ({ default: m.Analisis })));
const Exportar = lazyWithReload(() => import("./components/Exportar.jsx").then(m => ({ default: m.Exportar })));
const UsuariosAdmin = lazyWithReload(() => import("./components/UsuariosAdmin.jsx").then(m => ({ default: m.UsuariosAdmin })));
const SuperAdminPanel = lazyWithReload(() => import("./components/SuperAdminPanel.jsx").then(m => ({ default: m.SuperAdminPanel })));
const ResetPasswordScreen = lazyWithReload(() => import("./screens/ResetPasswordScreen.jsx").then(m => ({ default: m.ResetPasswordScreen })));

const perfilAUsuario = (authId, profile) => ({
  id: authId,
  name: profile.nombre,
  email: profile.email,
  role: String(profile.role || "usuario").toLowerCase(),
  empresa_id: profile.empresa_id,
  activo: profile.activo !== false,
});

export default function App() {
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [isRestoringSession, setIsRestoringSession] = useState(false);
  const [suscripcion, setSuscripcion] = useState(null);
  const [waConfig, setWaConfig] = useState("+59163506018");
  // Una vez visitada, cada sección queda montada (oculta): volver a ella es instantáneo.
  const [mountedTabs, setMountedTabs] = useState(() => new Set(["dashboard"]));
  const isMobile = useIsMobile();
  const userRef = useRef(null);
  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { setMountedTabs(prev => (prev.has(tab) ? prev : new Set(prev).add(tab))); }, [tab]);

  const { data, estado, acciones } = useMoxiData(user);

  // Moneda de la empresa
  useEffect(() => { if (data.config?.currency) applyCurrencyCode(data.config.currency); }, [data.config?.currency]);

  const loginUser = useCallback(newUser => { userRef.current = newUser; setUser(newUser); }, []);

  const handleLogout = useCallback(async () => {
    userRef.current = null;
    setUser(null);
    setSuscripcion(null);
    setTab("dashboard");
    setMountedTabs(new Set(["dashboard"]));
    setSidebarOpen(false);
    resetCurrency();
    try { await supabase.removeAllChannels(); } catch {}
    try { await supabase.auth.signOut(); } catch {}
  }, []);

  // Suscripción (el servidor crea el periodo de prueba si no existe)
  useEffect(() => {
    if (!user?.empresa_id || user?.role === "superadmin") return;
    suscripcionService.getOCrearTrial().then(setSuscripcion).catch(() => {});
    suscripcionService.getConfig().then(cfg => setWaConfig(cfg.whatsapp_soporte || "+59163506018")).catch(() => {});
  }, [user?.empresa_id, user?.role]);

  const handleRetryOnboarding = useCallback(async () => {
    if (!user?.id) return;
    let profile = null;
    for (let i = 0; i < 3 && !profile?.empresa_id; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, 1000 * i));
      try { profile = await userService.getProfile(user.id); } catch {}
    }
    if (profile?.empresa_id) loginUser(perfilAUsuario(user.id, profile));
    else await handleLogout();
  }, [user?.id, loginUser, handleLogout]);

  // Sesión de Supabase (recarga de página, renovación de token, otras pestañas)
  useEffect(() => {
    const fallback = setTimeout(() => setSessionChecked(true), 1500);
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED" || event === "SIGNED_IN") && session?.user) {
        if (userRef.current?.id === session.user.id) { setSessionChecked(true); return; }
        if (event === "INITIAL_SESSION") { setIsRestoringSession(true); setSessionChecked(true); }
        Promise.race([userService.getProfile(session.user.id), new Promise(r => setTimeout(() => r(null), 8000))])
          .then(profile => { if (profile) loginUser(perfilAUsuario(session.user.id, profile)); })
          .catch(e => console.warn("[AUTH] getProfile:", e?.message))
          .finally(() => { setSessionChecked(true); setIsRestoringSession(false); });
      } else if (event === "INITIAL_SESSION") {
        setSessionChecked(true); setIsRestoringSession(false);
      } else if (event === "PASSWORD_RECOVERY") {
        setRecoveryMode(true);
      } else if (event === "SIGNED_OUT") {
        if (userRef.current) return;
        setUser(null); setRecoveryMode(false); resetCurrency();
      }
    });
    return () => { clearTimeout(fallback); subscription.unsubscribe(); };
  }, [loginUser]);

  const allowedTabs = useMemo(() => ROLES[user?.role] || [], [user?.role]);
  useEffect(() => {
    if (user && allowedTabs.length && !allowedTabs.includes(tab)) setTab(allowedTabs[0]);
  }, [user, tab, allowedTabs]);

  // Alertas para la barra superior
  const appDebtClients = useMemo(() => {
    const deuda = new Map();
    data.sales.forEach(s => { if (s.debt > 0) deuda.set(s.customerId, (deuda.get(s.customerId) || 0) + s.debt); });
    return data.customers.filter(c => (deuda.get(c.id) || 0) > 0);
  }, [data.customers, data.sales]);
  const appLowStock = useMemo(() => data.products.filter(p => p.minStock > 0 && p.stock <= p.minStock), [data.products]);

  const loadingScreen = (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontFamily: FONT, background: "radial-gradient(circle at 30% 20%, rgba(34,197,254,0.10), transparent 50%), #0D1117", gap: 18 }}>
      <BrandLogo size={76} />
      <div style={{ fontSize: 14, color: "rgba(255,255,255,0.38)", letterSpacing: "0.04em", fontWeight: 500 }}>Cargando sistema…</div>
      <div style={{ width: 140, height: 2, background: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: "40%", background: "linear-gradient(90deg,#111E7B,#22C5FE)", borderRadius: 2, animation: "moxiLoad 1.2s ease-in-out infinite alternate" }} />
      </div>
    </div>
  );

  if (!sessionChecked) return loadingScreen;
  if (recoveryMode) return <Suspense fallback={loadingScreen}><ResetPasswordScreen onDone={() => setRecoveryMode(false)} /></Suspense>;
  if (!user && isRestoringSession) return loadingScreen;
  if (!user) return <AuthScreen config={{ businessName: BRAND_NAME }} onLogin={loginUser} saveConfig={() => {}} />;
  if (!user.empresa_id) return <OnboardingIncompleteScreen onRetry={handleRetryOnboarding} onLogout={handleLogout} />;
  if (!user.activo) return <OnboardingIncompleteScreen onRetry={handleRetryOnboarding} onLogout={handleLogout} desactivado />;
  if (user.role !== "superadmin" && suscripcion && suscripcionService.estaVencida(suscripcion)) {
    return <SuscripcionVencida suscripcion={suscripcion} whatsapp={waConfig} onLogout={handleLogout} />;
  }
  // Primera vez en este navegador: aún no hay caché que mostrar
  if (!estado.cargadoUnaVez) return loadingScreen;

  const dias = suscripcion ? suscripcionService.diasRestantes(suscripcion) : null;
  const props = { D: data, A: acciones, user, estado, setTab };
  const seccion = (id, el) => mountedTabs.has(id) && allowedTabs.includes(id) && (
    <div style={{ display: tab === id ? "" : "none" }}>{el}</div>
  );

  return (
    <ThemeProvider>
      <Toaster position="top-right" toastOptions={{ style: { fontFamily: FONT, fontSize: 13, borderRadius: 10, border: "1px solid var(--color-border)", background: "var(--color-bg-surface)", color: "var(--color-text)" } }} />
      <div style={{ display: "flex", height: "100vh", fontFamily: FONT, background: "var(--color-bg-primary)", fontSize: 14, color: "var(--color-text)", overflow: "hidden" }}>
        {(!isMobile || sidebarOpen) && (
          <Sidebar
            tab={tab} setTab={setTab} user={user} config={data.config}
            onLogout={handleLogout} open={sidebarOpen} onClose={() => setSidebarOpen(false)}
            collapsed={isMobile ? false : sidebarCollapsed} onToggleCollapse={() => setSidebarCollapsed(v => !v)}
          />
        )}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, overflow: "hidden" }}>
          <Topbar isMobile={isMobile} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} sidebarCollapsed={sidebarCollapsed} setSidebarCollapsed={setSidebarCollapsed} setTab={setTab} user={user} data={data} appDebtClients={appDebtClients} appLowStock={appLowStock} />

          {user.role !== "superadmin" && suscripcion && !suscripcionService.estaVencida(suscripcion) && dias <= 7 && (
            <div style={{ background: "#92400e", borderBottom: "1px solid #b45309", padding: "8px 18px", display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#fef3c7", flexShrink: 0, flexWrap: "wrap" }}>
              <span>⚠️ {dias === 0 ? "Tu suscripción vence hoy." : `Tu suscripción vence en ${dias} día${dias !== 1 ? "s" : ""}.`} Renuévala para no perder el acceso.</span>
              <a href={`https://wa.me/${waConfig.replace(/\D/g, "")}?text=${encodeURIComponent("Hola, quiero renovar mi suscripción de Moxi Business.")}`} target="_blank" rel="noreferrer"
                style={{ marginLeft: "auto", background: "#15803d", color: "white", borderRadius: 6, padding: "4px 12px", fontSize: 12, fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap" }}>
                Renovar por WhatsApp
              </a>
            </div>
          )}

          <EstadoDatos estado={estado} onReintentar={acciones.recargar} />

          <main style={{ flex: 1, overflowY: "auto", padding: isMobile ? "14px 14px 80px" : "28px 32px", minWidth: 0 }}>
            <div style={{ maxWidth: 1400, margin: "0 auto" }}>
              <Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "var(--color-text-faint)", fontSize: 13 }}>Cargando…</div>}>
                {seccion("dashboard", <DashboardPremium {...props} />)}
                {seccion("clientes", <Clientes {...props} />)}
                {seccion("ventas", <Ventas {...props} />)}
                {seccion("pedidos", <Pedidos {...props} />)}
                {seccion("deudas", <Deudas {...props} />)}
                {seccion("productos", <Productos {...props} />)}
                {seccion("inventario", <Inventario {...props} />)}
                {seccion("produccion", <Produccion {...props} />)}
                {seccion("proveedores", <Proveedores {...props} />)}
                {seccion("caja", <Caja {...props} />)}
                {seccion("gastos", <GastosPage {...props} />)}
                {seccion("analisis", <Analisis {...props} />)}
                {seccion("exportar", <Exportar {...props} />)}
                {seccion("usuarios", <UsuariosAdmin {...props} onProfileUpdate={name => setUser(u => ({ ...u, name }))} />)}
                {seccion("superadmin", <SuperAdminPanel {...props} />)}
              </Suspense>
            </div>
          </main>

          {isMobile && <BottomNav tab={tab} setTab={setTab} user={user} />}
        </div>
      </div>
    </ThemeProvider>
  );
}
