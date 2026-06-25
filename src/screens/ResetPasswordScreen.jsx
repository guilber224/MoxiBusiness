import { useState } from "react";
import { authService } from "../services/authService.js";
import { BRAND_NAME, C, R, FONT } from "../theme.jsx";
import { inp, lbl, mkBtn } from "../styles.js";
import { BrandLogo } from "../components/ui/BrandLogo.jsx";

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  RESET PASSWORD SCREEN (PASSWORD_RECOVERY event)                    ║
// ╚══════════════════════════════════════════════════════════════════════╝
export function ResetPasswordScreen({ onDone }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  const doReset = async () => {
    if (!password) { setErr("Ingresa una nueva contraseña"); return; }
    if (password.length < 6) { setErr("Mínimo 6 caracteres"); return; }
    if (password !== confirm) { setErr("Las contraseñas no coinciden"); return; }
    setLoading(true);
    setErr("");
    try {
      await authService.updatePassword(password);
      setDone(true);
      setTimeout(onDone, 2500);
    } catch (e) {
      setErr(e.message || "Error al actualizar la contraseña");
    } finally {
      setLoading(false);
    }
  };

  const darkField = { ...inp, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "white" };
  const darkLabel = { ...lbl, color: "rgba(255,255,255,0.4)" };

  return (
    <div style={{ minHeight: "100vh", display: "flex", fontFamily: FONT, background: "radial-gradient(circle at top, rgba(37,99,235,0.18), transparent 34%), #0F0F0F" }}>
      <div style={{ width: "100%", maxWidth: 440, margin: "auto", padding: 20 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ width: 92, height: 72, margin: "0 auto 18px", display: "flex", alignItems: "center", justifyContent: "center" }}><BrandLogo size={92} /></div>
          <div style={{ fontSize: 26, fontWeight: 800, color: "white", letterSpacing: "-0.04em" }}>{BRAND_NAME}</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", marginTop: 6 }}>Restablecer contraseña</div>
        </div>
        <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: R.xl, padding: "24px 24px 20px" }}>
          <div style={{ color: "white", fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Nueva contraseña</div>
          <div style={{ color: "rgba(255,255,255,0.38)", fontSize: 13, marginBottom: 18 }}>Elige una contraseña segura para tu cuenta.</div>
          {err && <div style={{ background: "rgba(185,28,28,0.15)", border: "1px solid rgba(185,28,28,0.3)", color: "#FCA5A5", padding: "9px 12px", borderRadius: R.md, fontSize: 13, marginBottom: 14 }}>{err}</div>}
          {done ? (
            <div style={{ background: "rgba(21,128,61,0.15)", border: "1px solid rgba(21,128,61,0.3)", color: "#86EFAC", padding: "14px", borderRadius: R.md, fontSize: 14, lineHeight: 1.6 }}>
              Contraseña actualizada correctamente. Redirigiendo al sistema...
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 12 }}>
                <label style={darkLabel}>Nueva contraseña</label>
                <input type="password" style={darkField} value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" autoFocus />
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={darkLabel}>Confirmar contraseña</label>
                <input type="password" style={darkField} value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repite la contraseña" onKeyDown={e => e.key === "Enter" && doReset()} />
              </div>
              <button onClick={doReset} disabled={loading} style={{ ...mkBtn("primary"), width: "100%", justifyContent: "center", padding: "10px", fontSize: 14, background: loading ? "#7F1D1D" : C.red }}>
                {loading ? "Actualizando..." : "Guardar nueva contraseña"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
