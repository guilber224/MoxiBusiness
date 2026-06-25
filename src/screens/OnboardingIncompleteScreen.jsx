import { useState } from "react";
import { BRAND_NAME, R, FONT } from "../theme.jsx";
import { mkBtn } from "../styles.js";
import { BrandLogo } from "../components/ui/BrandLogo.jsx";

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  ONBOARDING INCOMPLETE                                              ║
// ╚══════════════════════════════════════════════════════════════════════╝
export function OnboardingIncompleteScreen({ onRetry, onLogout }) {
  const [loading, setLoading] = useState(false);
  const handleRetry = async () => {
    setLoading(true);
    await onRetry();
    setLoading(false);
  };
  return (
    <div style={{ minHeight: "100vh", display: "flex", fontFamily: FONT, background: "radial-gradient(circle at top, rgba(37,99,235,0.18), transparent 34%), #0F0F0F" }}>
      <div style={{ width: "100%", maxWidth: 440, margin: "auto", padding: 20 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ width: 92, height: 72, margin: "0 auto 18px", display: "flex", alignItems: "center", justifyContent: "center" }}><BrandLogo size={92} /></div>
          <div style={{ fontSize: 26, fontWeight: 800, color: "white", letterSpacing: "-0.04em" }}>{BRAND_NAME}</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", marginTop: 6 }}>Configuración de empresa</div>
        </div>
        <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: R.xl, padding: "24px 24px 24px" }}>
          <div style={{ fontSize: 32, textAlign: "center", marginBottom: 16 }}>⚠️</div>
          <div style={{ color: "white", fontWeight: 700, fontSize: 16, marginBottom: 8, textAlign: "center" }}>
            Tu empresa aún no terminó de configurarse
          </div>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, marginBottom: 24, lineHeight: 1.7, textAlign: "center" }}>
            El registro de empresa está incompleto y no se puede acceder al sistema sin un identificador de empresa válido.
            Puede ser un problema temporal. Reintenta o cierra sesión y vuelve a registrarte.
          </div>
          <button
            onClick={handleRetry}
            disabled={loading}
            style={{ ...mkBtn("primary"), width: "100%", justifyContent: "center", padding: "10px", fontSize: 14, marginBottom: 10, background: loading ? "#7F1D1D" : "#B91C1C" }}
          >
            {loading ? "Verificando..." : "Reintentar onboarding"}
          </button>
          <button
            onClick={onLogout}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", padding: "10px", borderRadius: R.md, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: "rgba(255,255,255,0.45)", fontSize: 14, cursor: "pointer", fontFamily: FONT }}
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}
