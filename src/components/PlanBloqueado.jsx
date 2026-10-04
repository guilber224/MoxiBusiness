import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { cobrosService, MODULOS_PLAN } from "../services/cobrosService.js";
import { bob } from "./PagarSuscripcion.jsx";
import { C } from "../theme.jsx";
import { card, mkBtn } from "../styles.js";

const NOMBRE = Object.fromEntries(MODULOS_PLAN);

/** Se muestra en lugar de una sección que el plan actual no incluye. */
export function PlanBloqueado({ modulo, plan, user, onMejorar }) {
  const [sugerido, setSugerido] = useState(null);
  useEffect(() => {
    let vivo = true;
    cobrosService.planes()
      .then(ps => {
        const ok = ps.filter(p => p.activo && (!Array.isArray(p.modulos) || p.modulos.includes(modulo)))
          .sort((a, b) => a.precio_mensual - b.precio_mensual);
        if (vivo) setSugerido(ok[0] || null);
      })
      .catch(() => {});
    return () => { vivo = false; };
  }, [modulo]);
  const admin = user?.role === "admin";

  return (
    <div style={{ ...card(), maxWidth: 560, margin: "40px auto", textAlign: "center", padding: "36px 28px" }}>
      <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(17,30,123,0.08)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
        <Lock size={24} color="#111E7B" />
      </div>
      <div style={{ fontWeight: 800, fontSize: 19, marginBottom: 6 }}>{NOMBRE[modulo] || "Esta sección"} no está incluida en tu plan</div>
      <div style={{ fontSize: 14, color: C.textMid, marginBottom: 18 }}>
        Tu plan actual es <strong>{plan?.plan_nombre || "—"}</strong>.
        {sugerido ? <> Está disponible desde el plan <strong>{sugerido.nombre}</strong> ({bob(sugerido.precio_mensual)}/mes).</> : " Está disponible en un plan superior."}
      </div>
      {admin
        ? <button onClick={onMejorar} style={{ ...mkBtn("primary"), padding: "10px 20px", fontSize: 14 }}>Mejorar mi plan</button>
        : <div style={{ fontSize: 13, color: C.textFaint }}>Pídele al administrador de tu empresa que mejore el plan.</div>}
    </div>
  );
}
