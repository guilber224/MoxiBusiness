import { BrandLogo } from "../components/ui/BrandLogo.jsx";
import { BRAND_NAME, FONT, C, R } from "../theme.jsx";

const FEATURES = [
  { icon: "🛒", title: "Ventas POS", desc: "Registra ventas con escáner de código de barras o búsqueda rápida. Genera comprobantes en PDF." },
  { icon: "📦", title: "Inventario", desc: "Stock en tiempo real con alertas automáticas de stock mínimo por producto." },
  { icon: "👥", title: "Clientes y Deudas", desc: "Cartera de clientes, registro de deudas pendientes y seguimiento de cobros." },
  { icon: "📊", title: "Análisis", desc: "Gráficos de ventas, gastos y rentabilidad. Filtra por día, semana o mes." },
  { icon: "💰", title: "Caja Diaria", desc: "Control de flujo: apertura, cierre y arqueo de caja con diferencias automáticas." },
  { icon: "🏭", title: "Producción", desc: "Fórmulas de producción, costos de insumos y control de lotes fabricados." },
  { icon: "📋", title: "Pedidos", desc: "Crea pedidos a proveedores, realiza seguimiento y recibe el inventario al cerrarlos." },
  { icon: "📤", title: "Exportar Excel", desc: "Exporta ventas, inventario, clientes y reportes a Excel con un solo clic." },
];

const bg = "radial-gradient(circle at 20% 20%, rgba(34,197,254,0.10), transparent 40%), radial-gradient(circle at 80% 80%, rgba(17,30,123,0.22), transparent 40%), #0D1117";

export function LandingPage({ onLogin, onRegister, whatsapp = "+59163506018" }) {
  const waNum = (whatsapp || "+59163506018").replace(/\D/g, "");
  const waMsg = encodeURIComponent("Hola, me interesa Moxi Business. ¿Puedes darme información sobre los planes?");

  return (
    <div style={{ minHeight: "100vh", fontFamily: FONT, background: bg, color: "white" }}>

      {/* NAV */}
      <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 32px", borderBottom: "1px solid rgba(255,255,255,0.06)", position: "sticky", top: 0, zIndex: 100, background: "rgba(13,17,23,0.85)", backdropFilter: "blur(12px)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <BrandLogo size={36} />
          <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.03em" }}>{BRAND_NAME}</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onLogin}
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: R.md, padding: "8px 16px", cursor: "pointer", color: "rgba(255,255,255,0.8)", fontSize: 13, fontWeight: 500, fontFamily: FONT }}
          >
            Iniciar sesión
          </button>
          <button
            onClick={onRegister}
            style={{ background: "#111E7B", border: "none", borderRadius: R.md, padding: "8px 18px", cursor: "pointer", color: "white", fontSize: 13, fontWeight: 600, fontFamily: FONT }}
          >
            Prueba gratis →
          </button>
        </div>
      </nav>

      {/* HERO */}
      <section style={{ textAlign: "center", padding: "80px 24px 64px", maxWidth: 700, margin: "0 auto" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(34,197,254,0.1)", border: "1px solid rgba(34,197,254,0.2)", borderRadius: 999, padding: "5px 14px", fontSize: 12, color: "#22C5FE", fontWeight: 600, marginBottom: 28, letterSpacing: "0.02em" }}>
          30 días de prueba gratis · Sin tarjeta de crédito
        </div>

        <h1 style={{ fontSize: "clamp(28px, 5vw, 48px)", fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1.15, margin: "0 0 20px" }}>
          El ERP + POS para{" "}
          <span style={{ background: "linear-gradient(135deg, #22C5FE, #863bff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            negocios bolivianos
          </span>
        </h1>

        <p style={{ fontSize: "clamp(14px, 2vw, 18px)", color: "rgba(255,255,255,0.55)", lineHeight: 1.7, margin: "0 0 40px", maxWidth: 520, marginLeft: "auto", marginRight: "auto" }}>
          Controla ventas, inventario, clientes y caja desde cualquier celular o computadora. Sin instalación, en la nube.
        </p>

        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button
            onClick={onRegister}
            style={{ background: "#111E7B", border: "none", borderRadius: 12, padding: "14px 32px", cursor: "pointer", color: "white", fontSize: 15, fontWeight: 700, fontFamily: FONT, boxShadow: "0 0 30px rgba(17,30,123,0.6)" }}
          >
            🚀 Crear cuenta gratis — 30 días
          </button>
          <button
            onClick={onLogin}
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: "14px 24px", cursor: "pointer", color: "rgba(255,255,255,0.75)", fontSize: 15, fontFamily: FONT }}
          >
            Ya tengo cuenta
          </button>
        </div>
      </section>

      {/* FEATURES */}
      <section style={{ maxWidth: 960, margin: "0 auto", padding: "0 24px 80px" }}>
        <h2 style={{ textAlign: "center", fontSize: 22, fontWeight: 700, color: "rgba(255,255,255,0.9)", marginBottom: 8 }}>Todo lo que tu negocio necesita</h2>
        <p style={{ textAlign: "center", fontSize: 13, color: "rgba(255,255,255,0.38)", marginBottom: 40 }}>Desde la primera venta hasta el análisis mensual, en un solo lugar.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 14 }}>
          {FEATURES.map(f => (
            <div key={f.title} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "20px 18px" }}>
              <div style={{ fontSize: 26, marginBottom: 10 }}>{f.icon}</div>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6, color: "rgba(255,255,255,0.9)" }}>{f.title}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.44)", lineHeight: 1.6 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ADDITIONAL FEATURES ROW */}
      <section style={{ maxWidth: 960, margin: "0 auto 80px", padding: "0 24px" }}>
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: "28px 32px", display: "flex", flexWrap: "wrap", gap: 24, justifyContent: "center" }}>
          {[
            ["👤 Multi-usuario", "Crea usuarios con roles (admin, vendedor, operario)"],
            ["🔒 Datos aislados", "Cada empresa tiene sus propios datos. 100% privado."],
            ["📱 Funciona en celular", "Diseño responsive. Instálalo como app en tu celular."],
            ["☁️ En la nube", "Accede desde cualquier lugar y dispositivo."],
          ].map(([title, desc]) => (
            <div key={title} style={{ minWidth: 180, flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{title}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", lineHeight: 1.5 }}>{desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CONTACT CTA */}
      <section style={{ textAlign: "center", padding: "60px 24px 80px", maxWidth: 560, margin: "0 auto" }}>
        <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.03em", marginBottom: 12 }}>¿Listo para empezar?</h2>
        <p style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", lineHeight: 1.7, marginBottom: 32 }}>
          Crea tu cuenta y empieza tu prueba gratuita de 30 días ahora mismo.<br />
          ¿Tienes preguntas? Escríbenos directamente por WhatsApp.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button
            onClick={onRegister}
            style={{ background: "#111E7B", border: "none", borderRadius: 12, padding: "13px 28px", cursor: "pointer", color: "white", fontSize: 14, fontWeight: 700, fontFamily: FONT }}
          >
            Crear cuenta gratis
          </button>
          <a
            href={`https://wa.me/${waNum}?text=${waMsg}`}
            target="_blank"
            rel="noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "#25D366", border: "none", borderRadius: 12, padding: "13px 24px", cursor: "pointer", color: "white", fontSize: 14, fontWeight: 700, textDecoration: "none", fontFamily: FONT }}
          >
            <span style={{ fontSize: 16 }}>💬</span> Consultar por WhatsApp
          </a>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "24px 32px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
        <span>© {new Date().getFullYear()} {BRAND_NAME} · Hecho en Bolivia 🇧🇴</span>
        <div style={{ display: "flex", gap: 16 }}>
          <button onClick={onLogin} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.3)", fontSize: 12, fontFamily: FONT, padding: 0 }}>Iniciar sesión</button>
          <button onClick={onRegister} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.3)", fontSize: 12, fontFamily: FONT, padding: 0 }}>Registrarse</button>
          <a href={`https://wa.me/${waNum}`} target="_blank" rel="noreferrer" style={{ color: "rgba(255,255,255,0.3)", textDecoration: "none" }}>WhatsApp</a>
        </div>
      </footer>
    </div>
  );
}
