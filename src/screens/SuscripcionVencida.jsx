import { MessageCircle, LogOut, Clock } from "lucide-react";
import { BRAND_NAME, FONT } from "../theme.jsx";
import { BrandLogo } from "../components/ui/BrandLogo.jsx";

export function SuscripcionVencida({ suscripcion, whatsapp, onLogout }) {
  const vencida = new Date(suscripcion?.vence_el + "T23:59:59") < new Date();
  const diasVencida = suscripcion?.vence_el
    ? Math.abs(Math.ceil((new Date(suscripcion.vence_el + "T23:59:59") - new Date()) / (1000 * 60 * 60 * 24)))
    : 0;

  const numero = (whatsapp || "+59163506018").replace(/\D/g, "");
  const mensaje = encodeURIComponent(
    `Hola, quiero renovar mi suscripción de ${BRAND_NAME}.\nEmpresa ID: ${suscripcion?.empresa_id || ""}`
  );
  const waUrl = `https://wa.me/${numero}?text=${mensaje}`;

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: FONT, padding: 24,
      background: "radial-gradient(circle at 30% 20%, rgba(134,59,255,0.15), transparent 50%), radial-gradient(circle at 70% 80%, rgba(34,197,254,0.08), transparent 50%), #0D1117",
    }}>
      <div style={{
        maxWidth: 440, width: "100%", textAlign: "center",
        background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 24, padding: "48px 40px", backdropFilter: "blur(20px)",
      }}>
        <BrandLogo size={52} style={{ margin: "0 auto 16px" }} />
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, marginBottom: 8 }}>
          {BRAND_NAME}
        </div>

        <div style={{
          width: 64, height: 64, borderRadius: "50%",
          background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)",
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 20px",
        }}>
          <Clock size={28} color="#ef4444" strokeWidth={1.8} />
        </div>

        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#fff", margin: "0 0 8px" }}>
          {suscripcion?.activa === false ? "Suscripción desactivada" : "Suscripción vencida"}
        </h2>

        {vencida && suscripcion?.activa !== false && (
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", margin: "0 0 28px", lineHeight: 1.6 }}>
            Tu periodo de acceso venció hace{" "}
            <span style={{ color: "#ef4444", fontWeight: 600 }}>
              {diasVencida} {diasVencida === 1 ? "día" : "días"}
            </span>
            . Contáctanos para renovar y seguir usando {BRAND_NAME}.
          </p>
        )}

        {suscripcion?.activa === false && (
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", margin: "0 0 28px", lineHeight: 1.6 }}>
            Tu suscripción fue desactivada. Contáctanos por WhatsApp para reactivarla.
          </p>
        )}

        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            background: "#25D366", color: "#fff", textDecoration: "none",
            padding: "14px 24px", borderRadius: 12, fontWeight: 700, fontSize: 15,
            marginBottom: 12, transition: "opacity 0.15s",
          }}
          onMouseEnter={e => e.currentTarget.style.opacity = "0.88"}
          onMouseLeave={e => e.currentTarget.style.opacity = "1"}
        >
          <MessageCircle size={20} strokeWidth={2} />
          Renovar por WhatsApp
        </a>

        <button
          onClick={onLogout}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            width: "100%", background: "transparent",
            color: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.08)",
            padding: "11px 24px", borderRadius: 12, fontWeight: 500, fontSize: 13,
            cursor: "pointer", fontFamily: FONT, transition: "color 0.15s",
          }}
          onMouseEnter={e => e.currentTarget.style.color = "rgba(255,255,255,0.7)"}
          onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.35)"}
        >
          <LogOut size={15} strokeWidth={1.8} />
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
