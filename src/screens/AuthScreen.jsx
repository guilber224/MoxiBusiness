import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";
import { authService } from "../services/authService.js";
import { userService } from "../services/userService.js";
import { BRAND_NAME, BRAND_SUBTITLE, C, R, FONT, safeBusinessName } from "../theme.jsx";
import { inp, lbl, row, mkBtn } from "../styles.js";
import { BrandLogo } from "../components/ui/BrandLogo.jsx";

export function AuthScreen({ config, onLogin, saveConfig }) {
  const [mode, setMode] = useState("login"); // "login" | "register" | "forgot"
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [registerForm, setRegisterForm] = useState({ empresaName: "", adminName: "", email: "", password: "", confirm: "" });
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { setErr(""); }, [mode]);

  const switchMode = m => { setErr(""); setMode(m); };

  const doLogin = async () => {
    setLoading(true);
    setErr("");
    try {
      const wt = (p, ms) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error("timeout")), ms))]);

      // Intento 1 con 20s — cold start de Supabase free tier puede tardar 15s
      let authUser = null;
      try {
        authUser = await wt(authService.login(loginForm.username, loginForm.password), 20000);
      } catch (e1) {
        if (e1.message?.includes("timeout")) {
          // Intento 2: segundo intento mientras Supabase despierta
          setErr("Supabase tardó en responder, reintentando…");
          try {
            authUser = await wt(authService.login(loginForm.username, loginForm.password), 20000);
          } catch {
            setErr("No se pudo conectar con Supabase. Si el problema persiste, ve a supabase.com/dashboard y verifica que tu proyecto esté activo (no pausado).");
            return;
          }
        } else {
          throw e1;
        }
      }
      if (!authUser) { setErr("Credenciales incorrectas"); return; }

      let profile = null;
      for (let attempt = 0; attempt < 3 && !profile; attempt++) {
        if (attempt > 0) await new Promise(r => setTimeout(r, 800 * attempt));
        profile = await wt(userService.getProfile(authUser.id), 10000).catch(() => null);
      }
      if (profile && !profile.empresa_id) {
        setErr("Tu cuenta existe pero no tiene empresa asignada. Contacta al administrador.");
        await supabase.auth.signOut().catch(() => {});
        return;
      }
      if (!profile) {
        setErr("No se pudo cargar tu perfil. Verifica tu conexión e intenta de nuevo.");
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
    } catch (e) {
      const isTimeout = e.message?.includes("timeout");
      setErr(isTimeout
        ? "Supabase no respondió. Ve a supabase.com/dashboard y verifica que tu proyecto no esté pausado."
        : (e.message?.includes("Invalid") || e.message?.includes("credentials") ? "Credenciales incorrectas" : (e.message || "Error al iniciar sesión"))
      );
    } finally {
      setLoading(false);
    }
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
      const { data: authData, error: signupErr } = await supabase.auth.signUp({ email: emailClean, password });
      if (signupErr) throw new Error("Error al crear cuenta: " + signupErr.message);
      const authUser = authData.user;
      if (!authUser) throw new Error("No se pudo crear el usuario");

      const confirmedEmail = authUser.email || emailClean;
      if (!authData.session) {
        const { error: preLoginErr } = await supabase.auth.signInWithPassword({ email: emailClean, password });
        if (preLoginErr) throw new Error("Cuenta creada. Por favor confirma tu email e inicia sesión.");
      }

      const { data: rpcData, error: rpcErr } = await supabase.rpc("registrar_empresa", {
        p_empresa_nombre: empresaName.trim(),
        p_admin_nombre:   adminName.trim(),
        p_email:          confirmedEmail,
      });
      if (rpcErr) throw new Error("Error al registrar empresa: " + rpcErr.message);
      const empresa_id = rpcData.empresa_id;

      const now = new Date().toISOString();
      saveConfig({ businessName: empresaName.trim(), createdAt: now, updatedAt: now });
      onLogin({ id: authUser.id, name: adminName.trim(), role: "admin", empresa_id, username: emailClean });
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
  const noteStyle = { marginTop: 16, padding: "12px", background: "rgba(255,255,255,0.03)", borderRadius: R.md, fontSize: 12, color: "rgba(255,255,255,0.42)", lineHeight: 1.6 };
  const linkStyle = { background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "rgba(255,255,255,0.45)", textDecoration: "underline", padding: 0, fontFamily: FONT };
  const businessName = safeBusinessName(config);

  return (
    <div style={{ minHeight: "100vh", display: "flex", fontFamily: FONT, background: "radial-gradient(circle at 20% 20%, rgba(34,197,254,0.14), transparent 40%), radial-gradient(circle at 80% 80%, rgba(17,30,123,0.28), transparent 40%), #0D1117" }}>
      <div style={{ width: "100%", maxWidth: 440, margin: "auto", padding: 20 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ width: 92, height: 72, margin: "0 auto 18px", display: "flex", alignItems: "center", justifyContent: "center" }}><BrandLogo size={92} /></div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "white", letterSpacing: "-0.04em" }}>{BRAND_NAME}</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.38)", marginTop: 6 }}>{BRAND_SUBTITLE}</div>
          {mode === "login" && config?.businessName && (
            <div style={{ marginTop: 12, display: "inline-flex", padding: "6px 12px", borderRadius: 999, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.72)", fontSize: 12 }}>
              Negocio activo: {businessName}
            </div>
          )}
        </div>

        <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: R.xl, padding: "24px 24px 20px" }}>
          <div style={{ color: "white", fontWeight: 700, fontSize: 16, marginBottom: 6 }}>
            {mode === "login" && "Iniciar sesión"}
            {mode === "register" && "Crear cuenta"}
            {mode === "forgot" && "Recuperar contraseña"}
          </div>
          <div style={{ color: "rgba(255,255,255,0.38)", fontSize: 13, marginBottom: 18 }}>
            {mode === "login" && "Ingresa con tu email y contraseña."}
            {mode === "register" && "Crea tu empresa en la nube con sincronización automática y acceso multi-usuario."}
            {mode === "forgot" && "Recibirás un enlace en tu email para crear una nueva contraseña."}
          </div>

          {err && (
            <div style={{ background: "rgba(185,28,28,0.15)", border: "1px solid rgba(185,28,28,0.3)", color: "#FCA5A5", padding: "9px 12px", borderRadius: R.md, fontSize: 13, marginBottom: 14 }}>
              {err}
            </div>
          )}

          {/* ── LOGIN ── */}
          {mode === "login" && (
            <>
              <div style={{ marginBottom: 12 }}>
                <label style={darkLabel}>Email</label>
                <input style={darkField} value={loginForm.username} onChange={e => setLoginForm({ ...loginForm, username: e.target.value })} placeholder="tu@email.com" onKeyDown={e => e.key === "Enter" && doLogin()} autoFocus />
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
              <div style={noteStyle}>Solo un administrador puede crear o eliminar usuarios desde el panel de administración.</div>
            </>
          )}

          {/* ── REGISTRO SaaS ── */}
          {mode === "register" && (
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
          {mode === "forgot" && (
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
