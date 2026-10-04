import { useEffect, useState, useCallback } from "react";
import { cobrosService, montoPlan, MESES_OPCIONES } from "../services/cobrosService.js";
import { fDate } from "../utils/businessLogic.js";
import { C } from "../theme.jsx";
import { card, lbl, inp, mkBtn, mkBadge } from "../styles.js";

// Las suscripciones se cobran siempre en bolivianos, sin importar la moneda de la empresa.
export const bob = v => `Bs. ${Number(v || 0).toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ESTADO = { PENDIENTE: ["amber", "En revisión"], APROBADO: ["green", "Aprobado"], RECHAZADO: ["red", "Rechazado"] };
const MESES_TXT = m => (m === 12 ? "1 año" : `${m} ${m === 1 ? "mes" : "meses"}`);

/** Elegir plan, ver el QR de cobro, subir el comprobante y seguir el estado del pago. */
export function PagarSuscripcion({ user, suscripcion, onActualizado }) {
  const admin = user?.role === "admin" || user?.role === "superadmin";
  const [planes, setPlanes] = useState([]);
  const [cobro, setCobro] = useState({});
  const [historial, setHistorial] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [planId, setPlanId] = useState("");
  const [meses, setMeses] = useState(1);
  const [archivo, setArchivo] = useState(null);
  const [referencia, setReferencia] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [err, setErr] = useState("");
  const [qrGrande, setQrGrande] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const [p, c, h] = await Promise.all([cobrosService.planes(), cobrosService.datosCobro(), cobrosService.misSolicitudes(user.empresa_id)]);
      const activos = p.filter(x => x.activo);
      setPlanes(activos); setCobro(c || {}); setHistorial(h || []);
      setPlanId(id => id || activos.find(x => x.codigo === suscripcion?.plan)?.id || activos.find(x => x.destacado)?.id || activos[0]?.id || "");
    } catch (e) { setErr(e.message); } finally { setCargando(false); }
  }, [user.empresa_id, suscripcion?.plan]);
  useEffect(() => { cargar(); }, [cargar]);

  const pendiente = historial.find(s => s.estado === "PENDIENTE");
  const ultimoRechazo = !pendiente && historial[0]?.estado === "RECHAZADO" ? historial[0] : null;
  const plan = planes.find(p => p.id === planId);
  const total = plan ? montoPlan(plan, meses) : 0;
  const ahorroAnual = plan && meses === 12 && plan.precio_anual != null ? Number(plan.precio_mensual) * 12 - Number(plan.precio_anual) : 0;
  const planActual = planes.find(p => p.codigo === suscripcion?.plan);
  const dias = suscripcion?.vence_el ? Math.ceil((new Date(suscripcion.vence_el + "T23:59:59") - new Date()) / 86400000) : null;

  const enviar = async () => {
    if (!plan) { setErr("Elige un plan"); return; }
    if (!archivo) { setErr("Adjunta la captura o PDF del comprobante de pago"); return; }
    setErr(""); setEnviando(true);
    try {
      await cobrosService.solicitarPago({ empresaId: user.empresa_id, planId: plan.id, meses, archivo, referencia });
      setArchivo(null); setReferencia("");
      await cargar();
      onActualizado?.();
    } catch (e) { setErr(e.message); } finally { setEnviando(false); }
  };

  if (cargando) return <div style={{ ...card(), color: C.textFaint, fontSize: 13 }}>Cargando suscripción…</div>;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {/* Estado actual */}
      <div style={card()}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 12, color: C.textFaint }}>Plan actual</div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>{planActual?.nombre || (suscripcion?.plan === "trial" ? "Prueba gratuita" : suscripcion?.plan || "—")}</div>
          </div>
          {suscripcion?.vence_el && <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12, color: C.textFaint }}>{dias != null && dias < 0 ? "Venció el" : "Vigente hasta"}</div>
            <div style={{ fontWeight: 700, color: dias != null && dias <= 7 ? C.red : C.text }}>{fDate(suscripcion.vence_el)}{dias != null && dias >= 0 && dias < 3650 ? ` · ${dias} día${dias === 1 ? "" : "s"}` : ""}</div>
          </div>}
        </div>
      </div>

      {pendiente && <div style={{ ...card(), borderColor: C.amber, background: "rgba(245,158,11,0.10)" }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>⏳ Tu pago está en revisión</div>
        <div style={{ fontSize: 13, color: C.textMid }}>
          {pendiente.plan_nombre} · {MESES_TXT(pendiente.meses)} · {bob(pendiente.monto)} — enviado el {fDate(pendiente.created_at)}.
          Lo verificamos en horario de atención y tu suscripción se extiende automáticamente al aprobarlo.
        </div>
      </div>}

      {ultimoRechazo && <div style={{ ...card(), borderColor: C.red, background: "rgba(239,68,68,0.08)" }}>
        <div style={{ fontWeight: 700, marginBottom: 4, color: C.red }}>Tu último pago fue rechazado</div>
        <div style={{ fontSize: 13 }}>Motivo: {ultimoRechazo.motivo_rechazo}. Puedes enviar un nuevo comprobante abajo.</div>
      </div>}

      {!admin && <div style={{ ...card(), fontSize: 13, color: C.textMid }}>Solo el administrador de la empresa puede renovar la suscripción. Pídele que ingrese a <strong>Ajustes → Suscripción</strong>.</div>}

      {admin && !pendiente && (planes.length === 0 ? (
        <div style={{ ...card(), fontSize: 13, color: C.textMid }}>Aún no hay planes publicados. Escríbenos por WhatsApp para renovar{cobro.whatsapp_soporte ? ` al ${cobro.whatsapp_soporte}` : ""}.</div>
      ) : <>
        {/* 1. Plan */}
        <div style={card()}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>1. Elige tu plan</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
            {planes.map(p => {
              const sel = p.id === planId;
              return (
                <button key={p.id} onClick={() => setPlanId(p.id)} style={{ textAlign: "left", cursor: "pointer", padding: 14, borderRadius: 12, fontFamily: "inherit", color: "var(--color-text)",
                  background: sel ? "rgba(17,30,123,0.06)" : "var(--color-bg-surface)", border: `2px solid ${sel ? "#111E7B" : "var(--color-border)"}`, position: "relative" }}>
                  {p.destacado && <span style={{ ...mkBadge("blue"), position: "absolute", top: 10, right: 10, fontSize: 10 }}>Recomendado</span>}
                  <div style={{ fontWeight: 800, fontSize: 15 }}>{p.nombre}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#111E7B", margin: "4px 0" }}>{bob(p.precio_mensual)}<span style={{ fontSize: 12, fontWeight: 500, color: C.textFaint }}> /mes</span></div>
                  {p.descripcion && <div style={{ fontSize: 12, color: C.textMid, marginBottom: 6 }}>{p.descripcion}</div>}
                  <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: C.textMid, lineHeight: 1.6 }}>
                    {(p.caracteristicas || []).slice(0, 6).map(c => <li key={c}>{c}</li>)}
                  </ul>
                </button>
              );
            })}
          </div>
          <div style={{ marginTop: 14 }}>
            <label style={lbl}>Periodo</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {MESES_OPCIONES.map(m => <button key={m} onClick={() => setMeses(m)} style={{ ...mkBtn(meses === m ? "primary" : "ghost") }}>{MESES_TXT(m)}</button>)}
            </div>
          </div>
          {plan && <div style={{ marginTop: 14, padding: "12px 14px", background: "var(--color-bg-primary)", borderRadius: 10, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <span style={{ fontSize: 13 }}>{plan.nombre} · {MESES_TXT(meses)}{ahorroAnual > 0 && <span style={{ ...mkBadge("green"), marginLeft: 8 }}>Ahorras {bob(ahorroAnual)}</span>}</span>
            <span style={{ fontSize: 22, fontWeight: 800 }}>{bob(total)}</span>
          </div>}
        </div>

        {/* 2. Pago */}
        <div style={card()}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>2. Paga {plan ? bob(total) : ""} por QR o transferencia</div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
            {cobro.pago_qr_url ? (
              <button onClick={() => setQrGrande(true)} title="Ver QR en grande" style={{ border: "1px solid var(--color-border)", borderRadius: 12, padding: 8, background: "white", cursor: "zoom-in" }}>
                <img src={cobro.pago_qr_url} alt="QR de pago" style={{ width: 180, height: 180, objectFit: "contain", display: "block" }} />
              </button>
            ) : <div style={{ width: 180, height: 180, border: "1px dashed var(--color-border)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontSize: 12, color: C.textFaint, padding: 12 }}>QR no disponible: usa los datos bancarios</div>}
            <div style={{ flex: "1 1 220px", fontSize: 13, lineHeight: 1.8 }}>
              {cobro.pago_banco && <div><span style={{ color: C.textFaint }}>Banco:</span> <strong>{cobro.pago_banco}</strong></div>}
              {cobro.pago_titular && <div><span style={{ color: C.textFaint }}>Titular:</span> <strong>{cobro.pago_titular}</strong></div>}
              {cobro.pago_cuenta && <div><span style={{ color: C.textFaint }}>Cuenta:</span> <strong>{cobro.pago_cuenta}</strong></div>}
              {cobro.pago_instrucciones && <div style={{ marginTop: 6, color: C.textMid, whiteSpace: "pre-line" }}>{cobro.pago_instrucciones}</div>}
              <div style={{ marginTop: 6, color: C.textMid }}>En la glosa o referencia escribe el nombre de tu empresa.</div>
            </div>
          </div>
        </div>

        {/* 3. Comprobante */}
        <div style={card()}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>3. Envía tu comprobante</div>
          <label style={lbl}>Captura o PDF del comprobante *</label>
          <input type="file" accept="image/*,application/pdf" onChange={e => setArchivo(e.target.files?.[0] || null)} style={{ ...inp, padding: 8 }} />
          {archivo && <div style={{ fontSize: 12, color: C.textFaint, marginTop: 4 }}>{archivo.name} · {(archivo.size / 1024).toFixed(0)} KB</div>}
          <label style={{ ...lbl, marginTop: 10 }}>N° de transacción (opcional)</label>
          <input style={inp} value={referencia} maxLength={120} onChange={e => setReferencia(e.target.value)} placeholder="Ej: 123456789" />
          {err && <div style={{ color: C.red, fontSize: 13, marginTop: 10 }}>{err}</div>}
          <button onClick={enviar} disabled={enviando || !plan} style={{ ...mkBtn("primary"), marginTop: 14, width: "100%", justifyContent: "center", padding: "11px 14px", fontSize: 14, opacity: enviando ? 0.7 : 1 }}>
            {enviando ? "Enviando comprobante…" : `Enviar comprobante de ${bob(total)}`}
          </button>
          <div style={{ fontSize: 12, color: C.textFaint, marginTop: 8, textAlign: "center" }}>Revisamos tu pago y activamos los meses pagados. Si aún te quedaban días, se suman al final.</div>
        </div>
      </>)}

      {historial.length > 0 && <div style={card()}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Historial de pagos</div>
        {historial.map(s => (
          <div key={s.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "8px 0", borderTop: `1px solid ${C.border}`, fontSize: 13, flexWrap: "wrap" }}>
            <span>{fDate(s.created_at)} · {s.plan_nombre} · {MESES_TXT(s.meses)}{s.estado === "APROBADO" && s.vence_nuevo ? ` · hasta ${fDate(s.vence_nuevo)}` : ""}</span>
            <span style={{ display: "flex", gap: 8, alignItems: "center" }}><strong>{bob(s.monto)}</strong><span style={mkBadge(ESTADO[s.estado][0])}>{ESTADO[s.estado][1]}</span></span>
          </div>
        ))}
      </div>}

      {qrGrande && <div onClick={() => setQrGrande(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, cursor: "zoom-out" }}>
        <img src={cobro.pago_qr_url} alt="QR de pago" style={{ maxWidth: "min(92vw, 520px)", maxHeight: "86vh", background: "white", borderRadius: 16, padding: 12 }} />
      </div>}
    </div>
  );
}
