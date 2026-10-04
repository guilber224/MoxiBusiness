import { MessageCircle, LogOut, Clock } from "lucide-react";
import { BRAND_NAME, FONT } from "../theme.jsx";
import { BrandLogo } from "../components/ui/BrandLogo.jsx";
import { PagarSuscripcion } from "../components/PagarSuscripcion.jsx";

// Pantalla cuando la suscripción venció o fue desactivada: el administrador puede
// pagar aquí mismo (QR + comprobante) sin tener que escribir por WhatsApp.
export function SuscripcionVencida({ suscripcion, whatsapp, user, onLogout, onActualizado }) {
  const desactivada = suscripcion?.activa === false;
  const diasVencida = suscripcion?.vence_el
    ? Math.max(0, Math.floor((new Date() - new Date(suscripcion.vence_el + "T23:59:59")) / 86400000) + 1)
    : 0;
  const numero = (whatsapp || "+59163506018").replace(/\D/g, "");
  const waUrl = `https://wa.me/${numero}?text=${encodeURIComponent(`Hola, necesito ayuda con mi suscripción de ${BRAND_NAME}.\nEmpresa: ${suscripcion?.nombre_empresa || ""}`)}`;

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg-primary)", color: "var(--color-text)", fontFamily: FONT, padding: "24px 16px 48px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <BrandLogo size={34} />
          <span style={{ fontWeight: 800, fontSize: 16 }}>{BRAND_NAME}</span>
          <button onClick={onLogout} style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "1px solid var(--color-border)", color: "var(--color-text-mid)", borderRadius: 10, padding: "7px 12px", cursor: "pointer", fontFamily: FONT, fontSize: 13 }}>
            <LogOut size={15} /> Cerrar sesión
          </button>
        </div>

        <div style={{ display: "flex", gap: 14, alignItems: "center", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 14, padding: "16px 18px", marginBottom: 16 }}>
          <Clock size={28} color="#ef4444" strokeWidth={1.8} style={{ flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 800, fontSize: 17 }}>{desactivada ? "Suscripción desactivada" : "Tu suscripción venció"}</div>
            <div style={{ fontSize: 13, color: "var(--color-text-mid)", marginTop: 2 }}>
              {desactivada
                ? "Tu acceso fue desactivado. Escríbenos por WhatsApp para resolverlo."
                : `Venció hace ${diasVencida} día${diasVencida === 1 ? "" : "s"}. Tus datos están guardados y seguros: renueva para seguir usándolos.`}
            </div>
          </div>
        </div>

        {!desactivada && user && <PagarSuscripcion user={user} suscripcion={suscripcion} onActualizado={onActualizado} />}

        <a href={waUrl} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 16, background: "#25D366", color: "#fff", textDecoration: "none", padding: "12px 20px", borderRadius: 12, fontWeight: 700, fontSize: 14 }}>
          <MessageCircle size={18} /> ¿Dudas? Escríbenos por WhatsApp
        </a>
      </div>
    </div>
  );
}
