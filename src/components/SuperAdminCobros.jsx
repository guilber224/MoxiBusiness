import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { supabase } from "../lib/supabaseClient.js";
import { cobrosService, MODULOS_PLAN } from "../services/cobrosService.js";
import { bob, PagarSuscripcion } from "./PagarSuscripcion.jsx";
import { fDate, fDateTime } from "../utils/businessLogic.js";
import { C } from "../theme.jsx";
import { card, lbl, inp, mkBtn, mkBadge } from "../styles.js";
import { Modal } from "./ui/Modal.jsx";

const MESES_TXT = m => (m === 12 ? "1 año" : `${m} ${m === 1 ? "mes" : "meses"}`);
const PLAN_VACIO = { codigo: "", nombre: "", descripcion: "", precio_mensual: "", precio_anual: "", max_usuarios: "", caracteristicas: [], modulos: null, destacado: false, activo: true, orden: 0 };

/** Panel del dueño de la plataforma: pagos por revisar, planes y datos de cobro. */
export function SuperAdminCobros({ onCambio, user }) {
  const [vistaCliente, setVistaCliente] = useState(false);
  const [solicitudes, setSolicitudes] = useState([]);
  const [planes, setPlanes] = useState([]);
  const [cobro, setCobro] = useState({});
  const [verTodas, setVerTodas] = useState(false);
  const [revisando, setRevisando] = useState(null); // { sol, url }
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [planForm, setPlanForm] = useState(null);
  const [caracTxt, setCaracTxt] = useState("");
  const [err, setErr] = useState("");

  const cargar = useCallback(async () => {
    try {
      const [s, p, c] = await Promise.all([cobrosService.solicitudes(), cobrosService.planes(), cobrosService.datosCobro()]);
      setSolicitudes(s); setPlanes(p); setCobro(c || {});
    } catch (e) { toast.error(e.message); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);
  // Aviso en vivo cuando un cliente envía un comprobante
  useEffect(() => {
    const ch = supabase.channel("moxi_cobros_superadmin")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "solicitudes_pago" }, p => {
        toast(`💳 Nuevo pago por revisar: ${p.new?.nombre_empresa || "empresa"} · ${bob(p.new?.monto)}`, { duration: 8000 });
        cargar();
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [cargar]);

  const pendientes = solicitudes.filter(s => s.estado === "PENDIENTE");
  const lista = verTodas ? solicitudes : pendientes;

  const abrir = async sol => {
    setMotivo(""); setErr("");
    try { setRevisando({ sol, url: await cobrosService.urlComprobante(sol.comprobante_path) }); }
    catch (e) { toast.error("No se pudo abrir el comprobante: " + e.message); }
  };
  const revisar = async aprobar => {
    if (!aprobar && !motivo.trim()) { setErr("Escribe el motivo: el cliente lo verá"); return; }
    setOcupado(true);
    try {
      const r = await cobrosService.revisarPago(revisando.sol.id, aprobar, motivo);
      toast.success(aprobar ? `Aprobado: vigente hasta ${fDate(r.vence_nuevo)}` : "Pago rechazado");
      setRevisando(null); await cargar(); onCambio?.();
    } catch (e) { setErr(e.message); } finally { setOcupado(false); }
  };

  const guardarPlan = async () => {
    const p = { ...planForm, caracteristicas: caracTxt.split("\n") };
    if (!/^[a-z0-9_-]{2,30}$/.test((p.codigo || "").trim().toLowerCase())) { setErr("Código: solo minúsculas, números o guiones (ej: basico)"); return; }
    if (!p.nombre?.trim() || p.precio_mensual === "") { setErr("Nombre y precio mensual son obligatorios"); return; }
    setOcupado(true); setErr("");
    try { await cobrosService.guardarPlan(p); toast.success("Plan guardado"); setPlanForm(null); await cargar(); }
    catch (e) { setErr(e.message); } finally { setOcupado(false); }
  };
  const alternarPlan = async p => {
    try { await cobrosService.guardarPlan({ ...p, activo: !p.activo }); toast.success(p.activo ? "Plan ocultado" : "Plan publicado"); cargar(); }
    catch (e) { toast.error(e.message); }
  };
  const borrarPlan = async p => {
    if (!window.confirm(`¿Eliminar el plan "${p.nombre}"? Las empresas que ya lo tienen no se ven afectadas.`)) return;
    try { await cobrosService.eliminarPlan(p.id); cargar(); } catch (e) { toast.error(e.message); }
  };

  const guardarCobro = async () => {
    setOcupado(true);
    try { await cobrosService.guardarDatosCobro(cobro); toast.success("Datos de cobro guardados"); }
    catch (e) { toast.error(e.message); } finally { setOcupado(false); }
  };
  const subirQr = async file => {
    if (!file) return;
    setOcupado(true);
    try { const url = await cobrosService.subirQrCobro(file); const nuevo = { ...cobro, pago_qr_url: url }; setCobro(nuevo); await cobrosService.guardarDatosCobro(nuevo); toast.success("QR actualizado"); }
    catch (e) { toast.error(e.message); } finally { setOcupado(false); }
  };

  return (
    <div style={{ display: "grid", gap: 14, marginBottom: 14 }}>
      {/* Pagos */}
      <div style={card()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>💳 Pagos por revisar {pendientes.length > 0 && <span style={{ ...mkBadge("amber"), marginLeft: 6 }}>{pendientes.length}</span>}</div>
          <button onClick={() => setVerTodas(v => !v)} style={mkBtn("ghost")}>{verTodas ? "Solo pendientes" : "Ver historial"}</button>
        </div>
        {lista.length === 0 ? <div style={{ fontSize: 13, color: C.textFaint, padding: "10px 0" }}>{verTodas ? "Aún no hay pagos informados." : "No hay pagos pendientes. 🎉"}</div> :
          lista.map(s => (
            <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "10px 0", borderTop: `1px solid ${C.border}`, flexWrap: "wrap" }}>
              <div style={{ fontSize: 13 }}>
                <div style={{ fontWeight: 700 }}>{s.nombre_empresa || "Empresa"}</div>
                <div style={{ color: C.textFaint, fontSize: 12 }}>{fDateTime(s.created_at)} · {s.solicitado_por_nombre || "—"} · {s.plan_nombre} · {MESES_TXT(s.meses)}{s.referencia ? ` · Ref ${s.referencia}` : ""}</div>
                {s.estado === "RECHAZADO" && <div style={{ color: C.red, fontSize: 12 }}>Rechazado: {s.motivo_rechazo}</div>}
                {s.estado === "APROBADO" && <div style={{ color: C.green, fontSize: 12 }}>Aprobado · vigente hasta {fDate(s.vence_nuevo)}</div>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <strong>{bob(s.monto)}</strong>
                <button onClick={() => abrir(s)} style={mkBtn(s.estado === "PENDIENTE" ? "primary" : "ghost")}>{s.estado === "PENDIENTE" ? "Revisar" : "Ver"}</button>
              </div>
            </div>
          ))}
      </div>

      {/* Planes */}
      <div style={card()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 8, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>📦 Planes</div>
            <div style={{ fontSize: 12, color: C.textFaint }}>Los publicados aparecen en moxi-business.vercel.app/precios y en la pantalla de pago.</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {user?.empresa_id && <button onClick={() => setVistaCliente(true)} style={mkBtn("ghost")}>👁️ Ver como cliente</button>}
            <button onClick={() => { setErr(""); setPlanForm({ ...PLAN_VACIO, orden: planes.length + 1 }); setCaracTxt(""); }} style={mkBtn("primary")}>+ Nuevo plan</button>
          </div>
        </div>
        {planes.map(p => (
          <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "10px 0", borderTop: `1px solid ${C.border}`, flexWrap: "wrap" }}>
            <div style={{ fontSize: 13 }}>
              <strong>{p.nombre}</strong> {p.destacado && <span style={mkBadge("blue")}>Recomendado</span>} <span style={mkBadge(p.activo ? "green" : "gray")}>{p.activo ? "Publicado" : "Oculto"}</span>
              <div style={{ color: C.textFaint, fontSize: 12 }}>{bob(p.precio_mensual)}/mes{p.precio_anual != null ? ` · ${bob(p.precio_anual)}/año` : ""} · {p.max_usuarios ? `${p.max_usuarios} usuario(s)` : "usuarios ilimitados"} · {Array.isArray(p.modulos) ? `${p.modulos.length} secciones` : "todas las secciones"}</div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => alternarPlan(p)} style={mkBtn(p.activo ? "ghost" : "success")}>{p.activo ? "Ocultar" : "Publicar"}</button>
              <button onClick={() => { setErr(""); setPlanForm({ ...p, precio_anual: p.precio_anual ?? "", max_usuarios: p.max_usuarios ?? "" }); setCaracTxt((p.caracteristicas || []).join("\n")); }} style={mkBtn("ghost")}>Editar</button>
              <button onClick={() => borrarPlan(p)} aria-label={`Eliminar plan ${p.nombre}`} style={mkBtn("danger")}>🗑️</button>
            </div>
          </div>
        ))}
      </div>

      {/* Datos de cobro */}
      <div style={card()}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>🏦 Datos de cobro</div>
        <div style={{ fontSize: 12, color: C.textFaint, marginBottom: 12 }}>Lo que ven tus clientes al pagar. Solo usuarios con sesión iniciada pueden verlos.</div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <div>
            <label style={lbl}>QR de cobro</label>
            {cobro.pago_qr_url ? <img src={cobro.pago_qr_url} alt="QR de cobro" style={{ width: 150, height: 150, objectFit: "contain", border: `1px solid ${C.border}`, borderRadius: 10, background: "white", display: "block" }} />
              : <div style={{ width: 150, height: 150, border: `1px dashed ${C.border}`, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: C.textFaint }}>Sin QR</div>}
            <label style={{ ...mkBtn("ghost"), marginTop: 8, cursor: "pointer" }}>
              {cobro.pago_qr_url ? "Cambiar QR" : "Subir QR"}
              <input type="file" accept="image/*" hidden onChange={e => subirQr(e.target.files?.[0])} />
            </label>
          </div>
          <div style={{ flex: "1 1 260px" }}>
            {[["pago_banco", "Banco", "Ej: Banco Unión"], ["pago_titular", "Titular", "Nombre del titular"], ["pago_cuenta", "N° de cuenta", "Ej: 1000-123456"]].map(([k, l, ph]) => (
              <div key={k} style={{ marginBottom: 8 }}><label style={lbl}>{l}</label><input style={inp} value={cobro[k] || ""} placeholder={ph} onChange={e => setCobro({ ...cobro, [k]: e.target.value })} /></div>
            ))}
            <label style={lbl}>Instrucciones</label>
            <textarea style={{ ...inp, minHeight: 60, resize: "vertical" }} value={cobro.pago_instrucciones || ""} placeholder="Ej: El QR acepta cualquier banco. Activamos tu pago en menos de 24 horas hábiles." onChange={e => setCobro({ ...cobro, pago_instrucciones: e.target.value })} />
            <button onClick={guardarCobro} disabled={ocupado} style={{ ...mkBtn("primary"), marginTop: 10 }}>Guardar datos de cobro</button>
          </div>
        </div>
      </div>

      {revisando && <Modal title={`Pago de ${revisando.sol.nombre_empresa || "empresa"}`} onClose={() => setRevisando(null)} width={640}>
        <div style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 12 }}>
          <div><strong>{revisando.sol.plan_nombre}</strong> · {MESES_TXT(revisando.sol.meses)} · <strong>{bob(revisando.sol.monto)}</strong></div>
          <div style={{ color: C.textFaint }}>Enviado {fDateTime(revisando.sol.created_at)} por {revisando.sol.solicitado_por_nombre || "—"}{revisando.sol.referencia ? ` · Ref ${revisando.sol.referencia}` : ""}</div>
          <div style={{ color: C.textFaint }}>Vencía: {revisando.sol.vence_anterior ? fDate(revisando.sol.vence_anterior) : "—"}</div>
        </div>
        {revisando.sol.comprobante_path.endsWith(".pdf")
          ? <a href={revisando.url} target="_blank" rel="noreferrer" style={{ ...mkBtn("ghost"), marginBottom: 12 }}>📄 Abrir comprobante PDF</a>
          : <a href={revisando.url} target="_blank" rel="noreferrer"><img src={revisando.url} alt="Comprobante" style={{ width: "100%", maxHeight: 460, objectFit: "contain", background: "#f4f4f5", borderRadius: 10, marginBottom: 12 }} /></a>}
        {revisando.sol.estado === "PENDIENTE" ? <>
          <div style={{ fontSize: 12, color: C.textMid, marginBottom: 10 }}>Verifica en tu banco que el dinero llegó antes de aprobar. Al aprobar se suman {MESES_TXT(revisando.sol.meses)} a su suscripción.</div>
          <label style={lbl}>Motivo (solo si rechazas)</label>
          <input style={inp} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ej: el monto no coincide, comprobante ilegible…" />
          {err && <div style={{ color: C.red, fontSize: 13, marginTop: 8 }}>{err}</div>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
            <button onClick={() => revisar(false)} disabled={ocupado} style={mkBtn("danger")}>Rechazar</button>
            <button onClick={() => revisar(true)} disabled={ocupado} style={mkBtn("primary")}>{ocupado ? "Guardando…" : "✓ Aprobar y activar"}</button>
          </div>
        </> : <div style={{ fontSize: 13 }}>Estado: <strong>{revisando.sol.estado}</strong>{revisando.sol.revisado_at ? ` · ${fDateTime(revisando.sol.revisado_at)}` : ""}</div>}
      </Modal>}

      {vistaCliente && <Modal title="Vista del cliente: Ajustes → Suscripción" onClose={() => { setVistaCliente(false); cargar(); }} width={760}>
        <div style={{ fontSize: 12, color: C.textFaint, marginBottom: 10 }}>Así lo ve el administrador de una empresa. Si envías un comprobante aquí, se registra para tu propia empresa.</div>
        <PagarSuscripcion user={user} suscripcion={null} onActualizado={cargar} />
      </Modal>}

      {planForm && <Modal title={planForm.id ? "Editar plan" : "Nuevo plan"} onClose={() => setPlanForm(null)}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div><label style={lbl}>Nombre *</label><input style={inp} value={planForm.nombre} onChange={e => setPlanForm({ ...planForm, nombre: e.target.value })} placeholder="Ej: Negocio" /></div>
          <div><label style={lbl}>Código *</label><input style={inp} value={planForm.codigo} disabled={!!planForm.id} onChange={e => setPlanForm({ ...planForm, codigo: e.target.value.toLowerCase() })} placeholder="ej: negocio" /></div>
          <div><label style={lbl}>Precio mensual (Bs.) *</label><input type="number" min="0" style={inp} value={planForm.precio_mensual} onChange={e => setPlanForm({ ...planForm, precio_mensual: e.target.value })} /></div>
          <div><label style={lbl}>Precio anual (Bs.)</label><input type="number" min="0" style={inp} value={planForm.precio_anual} onChange={e => setPlanForm({ ...planForm, precio_anual: e.target.value })} placeholder="Vacío = 12 × mensual" /></div>
          <div><label style={lbl}>Máx. usuarios</label><input type="number" min="1" style={inp} value={planForm.max_usuarios} onChange={e => setPlanForm({ ...planForm, max_usuarios: e.target.value })} placeholder="Vacío = ilimitado" /></div>
          <div><label style={lbl}>Orden</label><input type="number" style={inp} value={planForm.orden} onChange={e => setPlanForm({ ...planForm, orden: e.target.value })} /></div>
        </div>
        <label style={{ ...lbl, marginTop: 10 }}>Descripción corta</label>
        <input style={inp} value={planForm.descripcion || ""} onChange={e => setPlanForm({ ...planForm, descripcion: e.target.value })} placeholder="Ej: Para tiendas con equipo de trabajo" />
        <label style={{ ...lbl, marginTop: 10 }}>Secciones incluidas</label>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer", marginBottom: 6 }}>
          <input type="checkbox" checked={!Array.isArray(planForm.modulos)} onChange={e => setPlanForm({ ...planForm, modulos: e.target.checked ? null : MODULOS_PLAN.map(([id]) => id) })} /> <strong>Todas</strong> (incluye las que agreguemos en el futuro)
        </label>
        {Array.isArray(planForm.modulos) && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(170px,1fr))", gap: 4, padding: 10, background: "var(--color-bg-primary)", borderRadius: 8 }}>
          {MODULOS_PLAN.map(([id, nombre]) => (
            <label key={id} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5, cursor: "pointer" }}>
              <input type="checkbox" checked={planForm.modulos.includes(id)} onChange={e => setPlanForm({ ...planForm, modulos: e.target.checked ? [...planForm.modulos, id] : planForm.modulos.filter(x => x !== id) })} /> {nombre}
            </label>
          ))}
        </div>}
        <div style={{ fontSize: 11, color: C.textFaint, marginTop: 4 }}>Panel principal y Ajustes van siempre. Las secciones no incluidas se ven con candado y el servidor bloquea su uso.</div>
        <label style={{ ...lbl, marginTop: 10 }}>Características (una por línea, se muestran en /precios)</label>
        <textarea style={{ ...inp, minHeight: 110, resize: "vertical" }} value={caracTxt} onChange={e => setCaracTxt(e.target.value)} />
        <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 13 }}>
          <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}><input type="checkbox" checked={!!planForm.activo} onChange={e => setPlanForm({ ...planForm, activo: e.target.checked })} /> Publicado</label>
          <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}><input type="checkbox" checked={!!planForm.destacado} onChange={e => setPlanForm({ ...planForm, destacado: e.target.checked })} /> Recomendado</label>
        </div>
        {err && <div style={{ color: C.red, fontSize: 13, marginTop: 10 }}>{err}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
          <button onClick={() => setPlanForm(null)} style={mkBtn("ghost")}>Cancelar</button>
          <button onClick={guardarPlan} disabled={ocupado} style={mkBtn("primary")}>{ocupado ? "Guardando…" : "Guardar plan"}</button>
        </div>
      </Modal>}
    </div>
  );
}
