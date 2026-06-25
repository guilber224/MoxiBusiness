import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";
import { authService } from "../services/authService.js";
import { userService } from "../services/userService.js";
import { uid } from "../utils/businessLogic.js";
import { BRAND_NAME, BRAND_SUBTITLE, C, R, FONT, safeBusinessName } from "../theme.jsx";
import { inp, lbl, row, mkBtn } from "../styles.js";
import { BrandLogo } from "../components/ui/BrandLogo.jsx";

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  LOGIN                                                              ║
// ╚══════════════════════════════════════════════════════════════════════╝
export function AuthScreen({ users, config, onLogin, saveUsers, saveConfig }) {
  const hasUsers = users.length > 0;
  const [mode, setMode] = useState("login"); // "login" | "setup" | "register" | "forgot"
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [setupForm, setSetupForm] = useState({ businessName: config?.businessName || "", name: "", username: "", password: "", confirm: "" });
  const [registerForm, setRegisterForm] = useState({ empresaName: "", adminName: "", email: "", password: "", confirm: "" });
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setErr("");
    if (!hasUsers && config?.businessName && !setupForm.businessName) {
      setSetupForm(current => ({ ...current, businessName: config.businessName }));
    }
  }, [hasUsers, config?.businessName, setupForm.businessName]);

  const switchMode = m => { setErr(""); setMode(m); };

  const doLogin = async () => {
    setLoading(true);
    setErr("");
    let supabaseOk = false;
    try {
      const withTimeout = (p, ms) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error("timeout")), ms))]);
      const authUser = await withTimeout(authService.login(loginForm.username, loginForm.password), 10000);
      if (authUser) {
        supabaseOk = true;
        // Reintentar getProfile hasta 3 veces para tolerar lentitud de cold start
        let profile = null;
        for (let attempt = 0; attempt < 3 && !profile; attempt++) {
          if (attempt > 0) await new Promise(r => setTimeout(r, 800 * attempt));
          profile = await withTimeout(userService.getProfile(authUser.id), 8000).catch(() => null);
        }
        if (profile && !profile.empresa_id) {
          // El perfil existe pero no tiene empresa_id — cuenta incompleta
          setErr("Tu cuenta existe pero no tiene empresa asignada. Contacta al administrador de tu empresa o regístrate con una empresa nueva.");
          setLoading(false);
          await supabase.auth.signOut().catch(() => {});
          return;
        }
        if (!profile) {
          const hint = userService._lastError ? ` — ${userService._lastError}` : "";
          console.warn("[AUTH] getProfile falló después de 3 intentos. authId:", authUser.id, "| error:", userService._lastError);
          setErr(`No se pudo cargar tu perfil${hint}. Verifica tu conexión e intenta de nuevo.`);
          setLoading(false);
          await supabase.auth.signOut().catch(() => {});
          return;
        }
        onLogin({
          id: authUser.id,
          name: profile.nombre,
          role: profile.role?.toLowerCase() || "usuario",
          empresa_id: profile.empresa_id,
          username: loginForm.username,
        });
      }
    } catch (supaErr) {
      console.warn("Supabase Auth falló, usando fallback local:", supaErr.message);
    } finally {
      setLoading(false);
    }
    if (supabaseOk) return;
    // Fallback: usuarios locales (modo sin internet)
    await new Promise(resolve => setTimeout(resolve, 150));
    const found = users.find(item => item.username === loginForm.username && item.password === loginForm.password);
    if (found) {
      onLogin(found);
    } else {
      setErr("Credenciales incorrectas");
    }
  };

  const doSetup = async () => {
    const businessName = setupForm.businessName.trim();
    const name = setupForm.name.trim();
    const username = setupForm.username.trim();
    const password = setupForm.password;
    const confirm = setupForm.confirm;
    if (!businessName) { setErr("Registra el nombre del negocio"); return; }
    if (!name || !username || !password) { setErr("Completa todos los campos para crear al administrador"); return; }
    if (password.length < 4) { setErr("La contraseña debe tener al menos 4 caracteres"); return; }
    if (password !== confirm) { setErr("Las contraseñas no coinciden"); return; }
    setLoading(true);
    setErr("");
    const now = new Date().toISOString();
    const newAdmin = { id: "u" + uid(), name, username, password, role: "admin", createdAt: now };
    saveConfig({ ...config, businessName, createdAt: config?.createdAt || now, updatedAt: now });
    saveUsers([newAdmin]);
    onLogin(newAdmin);
    setLoading(false);
  };

  const doRegisterSaaS = async () => {
    const { empresaName, adminName, email, password, confirm } = registerForm;
    const emailClean = email.trim();
    if (!empresaName.trim()) { setErr("Nombre de empresa requerido"); return; }
    if (!adminName.trim() || !emailClean || !password) { setErr("Completa todos los campos"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailClean)) { setErr("Email inválido"); return; }
    if (password.length < 6) { setErr("La contraseña debe tener al menos 6 caracteres"); return; }
    if (password !== confirm) { setErr("Las contraseñas no coinciden"); return; }
    setLoading(true);
    setErr("");
    try {
      // ORDEN CORRECTO para bypassar RLS:
      // 1. Primero crear el usuario en Auth → obtenemos auth.uid() válido
      // 2. Luego llamar la función SECURITY DEFINER que inserta empresa+perfil
      //    sin restricciones RLS, verificando auth.uid() internamente.

      // 1. Crear usuario en Supabase Auth
      const { data: authData, error: signupErr } = await supabase.auth.signUp({ email: emailClean, password });
      if (signupErr) throw new Error("Error al crear cuenta: " + signupErr.message);
      const authUser = authData.user;
      if (!authUser) throw new Error("No se pudo crear el usuario en Auth");

      // Garantizar email: usar el del objeto Auth (fuente de verdad)
      const confirmedEmail = authUser.email || emailClean;

      // 2. Si signUp no devolvió sesión activa (confirmación email habilitada),
      //    iniciar sesión para obtener token y poder llamar la función.
      if (!authData.session) {
        const { error: preLoginErr } = await supabase.auth.signInWithPassword({ email: emailClean, password });
        if (preLoginErr) throw new Error("Cuenta creada. Por favor confirma tu email y vuelve a iniciar sesión.");
      }

      // 3. Crear empresa + perfil via función SECURITY DEFINER (bypassa RLS, atómica)
      //    Pasa p_email para que usuarios.email nunca sea null.
      const { data: rpcData, error: rpcErr } = await supabase.rpc("registrar_empresa", {
        p_empresa_nombre: empresaName.trim(),
        p_admin_nombre:   adminName.trim(),
        p_email:          confirmedEmail,
      });
      if (rpcErr) throw new Error("Error al registrar empresa: " + rpcErr.message);
      const empresa_id = rpcData.empresa_id;

      // 4. Persistir nombre de empresa en config local (para el sidebar)
      const now = new Date().toISOString();
      saveConfig({ businessName: empresaName.trim(), createdAt: now, updatedAt: now });

      // 5. Login en estado local — sistema arranca vacío (Supabase devuelve [] para empresa nueva)
      onLogin({ id: authUser.id, name: adminName.trim(), role: "admin", empresa_id, username: email.trim() });
    } catch (e) {
      setErr(e.message || "Error al registrar la empresa");
    } finally {
      setLoading(false);
    }
  };

  const doForgotPassword = async () => {
    if (!forgotEmail.trim()) { setErr("Ingresa tu email"); return; }
    setLoading(true);
    setErr("");
    try {
      await authService.resetPasswordForEmail(forgotEmail.trim());
      setForgotSent(true);
    } catch (e) {
      setErr(e.message || "Error al enviar el email de recuperación");
    } finally {
      setLoading(false);
    }
  };

  const darkField = { ...inp, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "white" };
  const darkLabel = { ...lbl, color: "rgba(255,255,255,0.4)" };
  const noteStyle = {
    marginTop: 16, padding: "12px", background: "rgba(255,255,255,0.03)",
    borderRadius: R.md, fontSize: 12, color: "rgba(255,255,255,0.42)", lineHeight: 1.6,
  };
  const linkStyle = {
    background: "none", border: "none", cursor: "pointer", fontSize: 13,
    color: "rgba(255,255,255,0.45)", textDecoration: "underline", padding: 0,
  };
  const businessName = safeBusinessName(config);
  const activeMode = mode;

  return (
    <div style={{ minHeight: "100vh", display: "flex", fontFamily: FONT, background: "radial-gradient(circle at 20% 20%, rgba(34,197,254,0.14), transparent 40%), radial-gradient(circle at 80% 80%, rgba(17,30,123,0.28), transparent 40%), #0D1117" }}>
      <div style={{ width: "100%", maxWidth: 440, margin: "auto", padding: 20 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ width: 92, height: 72, margin: "0 auto 18px", display: "flex", alignItems: "center", justifyContent: "center" }}><BrandLogo size={92} /></div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "white", letterSpacing: "-0.04em" }}>{BRAND_NAME}</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.38)", marginTop: 6 }}>{BRAND_SUBTITLE}</div>
          {activeMode === "login" && config?.businessName && <div style={{ marginTop: 12, display: "inline-flex", padding: "6px 12px", borderRadius: 999, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.72)", fontSize: 12 }}>Negocio activo: {businessName}</div>}
        </div>
        <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: R.xl, padding: "24px 24px 20px" }}>

          {/* ── ENCABEZADO ── */}
          <div style={{ color: "white", fontWeight: 700, fontSize: 16, marginBottom: 6 }}>
            {activeMode === "login" && "Iniciar sesión"}
            {activeMode === "setup" && "Configuración inicial"}
            {activeMode === "register" && "Crear cuenta"}
            {activeMode === "forgot" && "Recuperar contraseña"}
          </div>
          <div style={{ color: "rgba(255,255,255,0.38)", fontSize: 13, marginBottom: 18 }}>
            {activeMode === "login" && "Ingresa con tu email y contraseña."}
            {activeMode === "setup" && "Crea el primer administrador local. Luego podrás crear usuarios desde el panel de administración."}
            {activeMode === "register" && "Crea tu empresa en la nube. Datos aislados, sincronización automática y acceso multi-usuario."}
            {activeMode === "forgot" && "Recibirás un enlace en tu email para crear una nueva contraseña."}
          </div>

          {err && <div style={{ background: "rgba(185,28,28,0.15)", border: "1px solid rgba(185,28,28,0.3)", color: "#FCA5A5", padding: "9px 12px", borderRadius: R.md, fontSize: 13, marginBottom: 14 }}>{err}</div>}

          {/* ── LOGIN ── */}
          {activeMode === "login" && (
            <>
              <div style={{ marginBottom: 12 }}>
                <label style={darkLabel}>Usuario / Email</label>
                <input style={darkField} value={loginForm.username} onChange={e => setLoginForm({ ...loginForm, username: e.target.value })} placeholder="Ingresa tu usuario o email" onKeyDown={e => e.key === "Enter" && doLogin()} autoFocus />
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={darkLabel}>Contraseña</label>
                <input type="password" style={darkField} value={loginForm.password} onChange={e => setLoginForm({ ...loginForm, password: e.target.value })} placeholder="••••••" onKeyDown={e => e.key === "Enter" && doLogin()} />
              </div>
              <button onClick={doLogin} disabled={loading} style={{ ...mkBtn("primary"), width: "100%", justifyContent: "center", padding: "10px", fontSize: 14, background: loading ? "#1e3a8a" : "#111E7B" }}>
                {loading ? "Verificando..." : "Ingresar al sistema"}
              </button>
              <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <button style={linkStyle} onClick={() => switchMode("forgot")}>¿Olvidaste tu contraseña?</button>
                <button style={linkStyle} onClick={() => switchMode("register")}>Crear cuenta</button>
              </div>
              {!hasUsers && (
                <div style={{ marginTop: 10, textAlign: "center" }}>
                  <button style={{ ...linkStyle, fontSize: 11, color: "rgba(255,255,255,0.28)" }} onClick={() => switchMode("setup")}>Configuración local (sin nube)</button>
                </div>
              )}
              <div style={noteStyle}>Solo un administrador puede crear o eliminar usuarios desde el panel de administración.</div>
            </>
          )}

          {/* ── SETUP LOCAL ── */}
          {activeMode === "setup" && (
            <>
              <div style={{ marginBottom: 12 }}>
                <label style={darkLabel}>Nombre del negocio</label>
                <input style={darkField} value={setupForm.businessName} onChange={e => setSetupForm({ ...setupForm, businessName: e.target.value })} placeholder="Ej: Tienda Central Moxi" autoFocus />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={darkLabel}>Nombre del administrador</label>
                <input style={darkField} value={setupForm.name} onChange={e => setSetupForm({ ...setupForm, name: e.target.value })} placeholder="Nombre completo" />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={darkLabel}>Usuario</label>
                <input style={darkField} value={setupForm.username} onChange={e => setSetupForm({ ...setupForm, username: e.target.value })} placeholder="Usuario de acceso" />
              </div>
              <div style={row()}>
                <div style={{ flex: 1 }}>
                  <label style={darkLabel}>Contraseña</label>
                  <input type="password" style={darkField} value={setupForm.password} onChange={e => setSetupForm({ ...setupForm, password: e.target.value })} placeholder="Mínimo 4 caracteres" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={darkLabel}>Confirmar</label>
                  <input type="password" style={darkField} value={setupForm.confirm} onChange={e => setSetupForm({ ...setupForm, confirm: e.target.value })} placeholder="Repite la contraseña" onKeyDown={e => e.key === "Enter" && doSetup()} />
                </div>
              </div>
              <button onClick={doSetup} disabled={loading} style={{ ...mkBtn("primary"), width: "100%", justifyContent: "center", padding: "10px", fontSize: 14, background: loading ? "#7F1D1D" : C.red }}>
                {loading ? "Creando administrador..." : "Crear administrador"}
              </button>
              <div style={{ marginTop: 14, textAlign: "center" }}>
                <button style={linkStyle} onClick={() => switchMode("register")}>Registrar empresa en la nube (SaaS)</button>
              </div>
              <div style={noteStyle}>Este primer usuario tendrá acceso completo y será quien gestione nuevas credenciales desde el módulo de administración.</div>
            </>
          )}

          {/* ── REGISTRO SaaS ── */}
          {activeMode === "register" && (
            <>
              <div style={{ marginBottom: 12 }}>
                <label style={darkLabel}>Nombre de la empresa</label>
                <input style={darkField} value={registerForm.empresaName} onChange={e => setRegisterForm({ ...registerForm, empresaName: e.target.value })} placeholder="Ej: Distribuidora Central S.R.L." autoFocus />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={darkLabel}>Nombre del administrador</label>
                <input style={darkField} value={registerForm.adminName} onChange={e => setRegisterForm({ ...registerForm, adminName: e.target.value })} placeholder="Nombre completo" />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={darkLabel}>Email de acceso</label>
                <input type="email" style={darkField} value={registerForm.email} onChange={e => setRegisterForm({ ...registerForm, email: e.target.value })} placeholder="admin@miempresa.com" />
              </div>
              <div style={row()}>
                <div style={{ flex: 1 }}>
                  <label style={darkLabel}>Contraseña</label>
                  <input type="password" style={darkField} value={registerForm.password} onChange={e => setRegisterForm({ ...registerForm, password: e.target.value })} placeholder="Mín. 6 caracteres" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={darkLabel}>Confirmar</label>
                  <input type="password" style={darkField} value={registerForm.confirm} onChange={e => setRegisterForm({ ...registerForm, confirm: e.target.value })} placeholder="Repite" onKeyDown={e => e.key === "Enter" && doRegisterSaaS()} />
                </div>
              </div>
              <button onClick={doRegisterSaaS} disabled={loading} style={{ ...mkBtn("primary"), width: "100%", justifyContent: "center", padding: "10px", fontSize: 14, background: loading ? "#7F1D1D" : C.red }}>
                {loading ? "Registrando empresa..." : "Crear empresa y acceder"}
              </button>
              <div style={{ marginTop: 14, textAlign: "center" }}>
                <button style={linkStyle} onClick={() => switchMode("login")}>Ya tengo cuenta — Iniciar sesión</button>
              </div>
              <div style={noteStyle}>Tu empresa tendrá datos completamente aislados. Puedes agregar más usuarios desde el panel de administración.</div>
            </>
          )}

          {/* ── RECUPERAR CONTRASEÑA ── */}
          {activeMode === "forgot" && (
            <>
              {forgotSent ? (
                <div style={{ background: "rgba(21,128,61,0.15)", border: "1px solid rgba(21,128,61,0.3)", color: "#86EFAC", padding: "14px", borderRadius: R.md, fontSize: 14, lineHeight: 1.6 }}>
                  Email enviado a <strong>{forgotEmail}</strong>. Revisa tu bandeja de entrada y sigue el enlace para crear una nueva contraseña.
                </div>
              ) : (
                <>
                  <div style={{ marginBottom: 20 }}>
                    <label style={darkLabel}>Email de tu cuenta</label>
                    <input type="email" style={darkField} value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} placeholder="tu@email.com" onKeyDown={e => e.key === "Enter" && doForgotPassword()} autoFocus />
                  </div>
                  <button onClick={doForgotPassword} disabled={loading} style={{ ...mkBtn("primary"), width: "100%", justifyContent: "center", padding: "10px", fontSize: 14, background: loading ? "#7F1D1D" : C.red }}>
                    {loading ? "Enviando..." : "Enviar enlace de recuperación"}
                  </button>
                </>
              )}
              <div style={{ marginTop: 14, textAlign: "center" }}>
                <button style={linkStyle} onClick={() => switchMode("login")}>Volver al inicio de sesión</button>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
