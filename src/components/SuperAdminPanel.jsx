import { useState, useEffect, useCallback } from "react";
import { Shield, RefreshCw, MessageCircle, Check, X, Edit2, Users, Trash2, AlertTriangle, CreditCard } from "lucide-react";
import { suscripcionService } from "../services/suscripcionService.js";
import { FONT } from "../theme.jsx";
import toast from "react-hot-toast";

const PLAN_LABELS = { trial: "Trial", activo: "Activo", anual: "Anual", enterprise: "Enterprise" };
const PLAN_COLORS = { trial: "#f59e0b", activo: "#22c55e", anual: "#22C5FE", enterprise: "#863bff" };

function DiasChip({ sus }) {
  const dias = suscripcionService.diasRestantes(sus);
  const vencida = suscripcionService.estaVencida(sus);
  const color = vencida ? "#ef4444" : dias <= 7 ? "#f59e0b" : "#22c55e";
  const label = vencida ? `Vencida hace ${Math.abs(dias)}d` : `${dias}d restantes`;
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color, background: color + "18", padding: "3px 8px", borderRadius: 6 }}>
      {label}
    </span>
  );
}

export function SuperAdminPanel() {
  const [suscripciones, setSuscripciones] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [whatsapp, setWhatsapp] = useState("");
  const [editingWa, setEditingWa] = useState(false);
  const [waInput, setWaInput] = useState("");
  const [extending, setExtending] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [pagos, setPagos] = useState([]);
  const [pagoForm, setPagoForm] = useState(null); // { empresa_id, nombre_empresa, monto, notas }
  const [savingPago, setSavingPago] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [sus, cfg, usrs, pgs] = await Promise.all([
        suscripcionService.getTodasLasSuscripciones(),
        suscripcionService.getConfig(),
        suscripcionService.getUsuariosSistema(),
        suscripcionService.getTodasPagos(),
      ]);
      setSuscripciones(sus);
      setWhatsapp(cfg.whatsapp_soporte || "");
      setWaInput(cfg.whatsapp_soporte || "");
      setUsuarios(usrs);
      setPagos(pgs);
    } catch (e) {
      toast.error("Error al cargar: " + (e.message || e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const guardarWhatsapp = async () => {
    try {
      await suscripcionService.updateWhatsapp(waInput.trim());
      setWhatsapp(waInput.trim());
      setEditingWa(false);
      toast.success("WhatsApp actualizado");
    } catch (e) {
      toast.error("Error: " + (e.message || e));
    }
  };

  const extender = async (empresa_id, dias, plan) => {
    setExtending(empresa_id + dias);
    try {
      await suscripcionService.extenderSuscripcion(empresa_id, dias, plan);
      await cargar();
      toast.success(`Extendido ${dias} días`);
    } catch (e) {
      toast.error("Error: " + (e.message || e));
    } finally {
      setExtending(null);
    }
  };

  const toggleActiva = async (empresa_id, activa) => {
    try {
      await suscripcionService.toggleActiva(empresa_id, activa);
      await cargar();
      toast.success(activa ? "Suscripción activada" : "Suscripción desactivada");
    } catch (e) {
      toast.error("Error: " + (e.message || e));
    }
  };

  const card = {
    background: "var(--color-bg-surface)", border: "1px solid var(--color-border)",
    borderRadius: 16, padding: "20px 24px", marginBottom: 16,
  };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(134,59,255,0.15)", border: "1px solid rgba(134,59,255,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Shield size={20} color="#863bff" strokeWidth={1.8} />
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Super Admin</h1>
          <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-faint)" }}>Gestión de suscripciones y configuración del sistema</p>
        </div>
        <button onClick={cargar} disabled={loading} style={{ marginLeft: "auto", background: "var(--color-bg-primary)", border: "1px solid var(--color-border)", borderRadius: 10, padding: "8px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--color-text-mid)", fontFamily: FONT }}>
          <RefreshCw size={13} strokeWidth={2} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
          Actualizar
        </button>
      </div>

      {/* WhatsApp config */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <MessageCircle size={16} color="#25D366" strokeWidth={2} />
          <span style={{ fontWeight: 600, fontSize: 13 }}>WhatsApp de soporte</span>
        </div>
        {editingWa ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              value={waInput}
              onChange={e => setWaInput(e.target.value)}
              placeholder="+591 63506018"
              style={{ flex: 1, background: "var(--color-bg-primary)", border: "1px solid var(--color-brand)", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "var(--color-text)", fontFamily: FONT, outline: "none" }}
              autoFocus
            />
            <button onClick={guardarWhatsapp} style={{ background: "#22c55e", border: "none", borderRadius: 8, padding: "8px 14px", cursor: "pointer", color: "#fff", display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontFamily: FONT, fontWeight: 600 }}>
              <Check size={13} /> Guardar
            </button>
            <button onClick={() => { setEditingWa(false); setWaInput(whatsapp); }} style={{ background: "var(--color-bg-primary)", border: "1px solid var(--color-border)", borderRadius: 8, padding: "8px 10px", cursor: "pointer", color: "var(--color-text-faint)", display: "flex", fontFamily: FONT }}>
              <X size={13} />
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: "#25D366" }}>{whatsapp || "—"}</span>
            <button onClick={() => setEditingWa(true)} style={{ background: "none", border: "1px solid var(--color-border)", borderRadius: 8, padding: "5px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--color-text-mid)", fontFamily: FONT }}>
              <Edit2 size={11} /> Editar
            </button>
          </div>
        )}
        <p style={{ margin: "10px 0 0", fontSize: 11, color: "var(--color-text-faint)" }}>
          Este número aparece en la pantalla de suscripción vencida de todos los clientes.
        </p>
      </div>

      {/* Subscriptions list */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>Suscripciones ({suscripciones.length})</span>
          <span style={{ fontSize: 11, color: "var(--color-text-faint)" }}>
            {suscripciones.filter(s => !suscripcionService.estaVencida(s)).length} activas ·{" "}
            {suscripciones.filter(s => suscripcionService.estaVencida(s)).length} vencidas
          </span>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "32px 0", color: "var(--color-text-faint)", fontSize: 13 }}>Cargando…</div>
        ) : suscripciones.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 0", color: "var(--color-text-faint)", fontSize: 13 }}>No hay suscripciones registradas aún</div>
        ) : suscripciones.map(sus => (
          <div key={sus.id} style={{
            borderRadius: 12, border: "1px solid var(--color-border)",
            padding: "14px 16px", marginBottom: 10,
            background: suscripcionService.estaVencida(sus) ? "rgba(239,68,68,0.04)" : "transparent",
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: "var(--color-text)" }}>
                    {sus.nombre_empresa || "Sin nombre"}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: PLAN_COLORS[sus.plan] || "#863bff", background: (PLAN_COLORS[sus.plan] || "#863bff") + "18", padding: "2px 7px", borderRadius: 5, textTransform: "uppercase" }}>
                    {PLAN_LABELS[sus.plan] || sus.plan}
                  </span>
                  {!sus.activa && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#ef4444", background: "#ef444418", padding: "2px 7px", borderRadius: 5 }}>INACTIVA</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: "var(--color-text-faint)", marginBottom: 6 }}>
                  Vence: {sus.vence_el} · ID: <span style={{ fontFamily: "monospace", fontSize: 10 }}>{sus.empresa_id.slice(0, 8)}…</span>
                </div>
                <DiasChip sus={sus} />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                <div style={{ display: "flex", gap: 5 }}>
                  {[
                    { dias: 30,  label: "+30d" },
                    { dias: 90,  label: "+90d" },
                    { dias: 365, label: "+1 año" },
                  ].map(({ dias, label }) => (
                    <button
                      key={dias}
                      onClick={() => extender(sus.empresa_id, dias, "activo")}
                      disabled={extending === sus.empresa_id + dias}
                      style={{ background: "rgba(134,59,255,0.12)", border: "1px solid rgba(134,59,255,0.25)", borderRadius: 7, padding: "5px 10px", cursor: "pointer", fontSize: 11, fontWeight: 600, color: "#863bff", fontFamily: FONT, opacity: extending === sus.empresa_id + dias ? 0.5 : 1 }}
                    >
                      {extending === sus.empresa_id + dias ? "…" : label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => toggleActiva(sus.empresa_id, !sus.activa)}
                  style={{ background: sus.activa ? "rgba(239,68,68,0.08)" : "rgba(34,197,94,0.08)", border: `1px solid ${sus.activa ? "rgba(239,68,68,0.2)" : "rgba(34,197,94,0.2)"}`, borderRadius: 7, padding: "5px 10px", cursor: "pointer", fontSize: 11, fontWeight: 600, color: sus.activa ? "#ef4444" : "#22c55e", fontFamily: FONT }}
                >
                  {sus.activa ? "Desactivar" : "Activar"}
                </button>
              </div>
            </div>

            {sus.notas && (
              <div style={{ marginTop: 8, fontSize: 11, color: "var(--color-text-faint)", background: "var(--color-bg-primary)", borderRadius: 6, padding: "5px 8px" }}>
                {sus.notas}
              </div>
            )}

            {/* Registro de pago inline */}
            {pagoForm?.empresa_id === sus.empresa_id ? (
              <div style={{ marginTop: 10, borderTop: "1px solid var(--color-border)", paddingTop: 10, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <input
                  type="number"
                  placeholder="Monto Bs."
                  value={pagoForm.monto}
                  onChange={e => setPagoForm(f => ({ ...f, monto: e.target.value }))}
                  style={{ width: 110, background: "var(--color-bg-primary)", border: "1px solid var(--color-border)", borderRadius: 7, padding: "6px 10px", fontSize: 13, color: "var(--color-text)", fontFamily: FONT, outline: "none" }}
                  autoFocus
                />
                <input
                  placeholder="Notas (ej: QR, efectivo…)"
                  value={pagoForm.notas}
                  onChange={e => setPagoForm(f => ({ ...f, notas: e.target.value }))}
                  style={{ flex: 1, minWidth: 140, background: "var(--color-bg-primary)", border: "1px solid var(--color-border)", borderRadius: 7, padding: "6px 10px", fontSize: 13, color: "var(--color-text)", fontFamily: FONT, outline: "none" }}
                />
                <button
                  disabled={savingPago}
                  onClick={async () => {
                    setSavingPago(true);
                    try {
                      await suscripcionService.registrarPago(pagoForm.empresa_id, pagoForm.nombre_empresa, { monto: pagoForm.monto, notas: pagoForm.notas });
                      toast.success("Pago registrado");
                      setPagoForm(null);
                      await cargar();
                    } catch (e) {
                      toast.error("Error: " + (e.message || e));
                    } finally { setSavingPago(false); }
                  }}
                  style={{ background: "#22c55e", border: "none", borderRadius: 7, padding: "6px 12px", cursor: "pointer", fontSize: 11, fontWeight: 700, color: "#fff", fontFamily: FONT, opacity: savingPago ? 0.5 : 1 }}
                >
                  {savingPago ? "…" : "Guardar"}
                </button>
                <button onClick={() => setPagoForm(null)} style={{ background: "var(--color-bg-primary)", border: "1px solid var(--color-border)", borderRadius: 7, padding: "6px 8px", cursor: "pointer", display: "flex", fontFamily: FONT }}>
                  <X size={12} color="var(--color-text-faint)" />
                </button>
              </div>
            ) : (
              <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  onClick={() => setPagoForm({ empresa_id: sus.empresa_id, nombre_empresa: sus.nombre_empresa, monto: "", notas: "" })}
                  style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 7, padding: "4px 10px", cursor: "pointer", fontSize: 11, fontWeight: 600, color: "#22c55e", fontFamily: FONT, display: "flex", alignItems: "center", gap: 5 }}
                >
                  <CreditCard size={11} /> Registrar pago
                </button>
                {(() => {
                  const total = pagos.filter(p => p.empresa_id === sus.empresa_id && p.monto).reduce((s, p) => s + Number(p.monto), 0);
                  return total > 0 ? <span style={{ fontSize: 11, color: "var(--color-text-faint)" }}>Total cobrado: <strong style={{ color: "#22c55e" }}>Bs. {total.toFixed(2)}</strong></span> : null;
                })()}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Users list */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <Users size={16} color="#863bff" strokeWidth={2} />
          <span style={{ fontWeight: 600, fontSize: 13 }}>Usuarios del sistema ({usuarios.length})</span>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "24px 0", color: "var(--color-text-faint)", fontSize: 13 }}>Cargando…</div>
        ) : usuarios.length === 0 ? (
          <div style={{ textAlign: "center", padding: "24px 0", color: "var(--color-text-faint)", fontSize: 13 }}>No hay usuarios registrados</div>
        ) : usuarios.map(u => (
          <div key={u.id} style={{ borderRadius: 12, border: "1px solid var(--color-border)", padding: "12px 16px", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 2 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{u.nombre || "Sin nombre"}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: u.role === "superadmin" ? "#863bff" : u.role === "admin" ? "#22C5FE" : "#64748b", background: (u.role === "superadmin" ? "#863bff" : u.role === "admin" ? "#22C5FE" : "#64748b") + "18", padding: "2px 7px", borderRadius: 5, textTransform: "uppercase" }}>
                  {u.role}
                </span>
              </div>
              <div style={{ fontSize: 11, color: "var(--color-text-faint)" }}>{u.email || "—"}</div>
            </div>

            {confirmDelete === u.id ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                <AlertTriangle size={13} color="#f59e0b" />
                <span style={{ fontSize: 11, color: "#f59e0b", fontWeight: 600 }}>¿Eliminar?</span>
                <button
                  disabled={deleting}
                  onClick={async () => {
                    setDeleting(true);
                    try {
                      await suscripcionService.eliminarUsuario(u.id, u.empresa_id);
                      toast.success("Usuario eliminado");
                      setConfirmDelete(null);
                      await cargar();
                    } catch (e) {
                      toast.error("Error: " + (e.message || e));
                    } finally { setDeleting(false); }
                  }}
                  style={{ background: "#ef4444", border: "none", borderRadius: 7, padding: "5px 10px", cursor: "pointer", fontSize: 11, fontWeight: 700, color: "#fff", fontFamily: FONT, opacity: deleting ? 0.5 : 1 }}
                >
                  {deleting ? "…" : "Sí, eliminar"}
                </button>
                <button onClick={() => setConfirmDelete(null)} style={{ background: "var(--color-bg-primary)", border: "1px solid var(--color-border)", borderRadius: 7, padding: "5px 8px", cursor: "pointer", display: "flex", fontFamily: FONT }}>
                  <X size={12} color="var(--color-text-faint)" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(u.id)}
                disabled={u.role === "superadmin"}
                title={u.role === "superadmin" ? "No se puede eliminar al superadmin" : "Eliminar usuario"}
                style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, padding: "6px 10px", cursor: u.role === "superadmin" ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: u.role === "superadmin" ? "var(--color-text-faint)" : "#ef4444", fontFamily: FONT, opacity: u.role === "superadmin" ? 0.3 : 1 }}
              >
                <Trash2 size={12} strokeWidth={2} /> Eliminar
              </button>
            )}
          </div>
        ))}
        <p style={{ margin: "10px 0 0", fontSize: 11, color: "var(--color-text-faint)" }}>
          Al eliminar un usuario se borra su perfil y suscripción. Para borrar su cuenta de Supabase Auth ve a Dashboard → Authentication → Users.
        </p>
      </div>

      {/* Payment history */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <CreditCard size={16} color="#22C5FE" strokeWidth={2} />
          <span style={{ fontWeight: 600, fontSize: 13 }}>Historial de pagos ({pagos.length})</span>
          {pagos.length > 0 && (
            <span style={{ fontSize: 11, color: "#22c55e", fontWeight: 600, marginLeft: "auto" }}>
              Total: Bs. {pagos.filter(p => p.monto).reduce((s, p) => s + Number(p.monto), 0).toFixed(2)}
            </span>
          )}
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "24px 0", color: "var(--color-text-faint)", fontSize: 13 }}>Cargando…</div>
        ) : pagos.length === 0 ? (
          <div style={{ textAlign: "center", padding: "24px 0", color: "var(--color-text-faint)", fontSize: 13 }}>No hay pagos registrados aún</div>
        ) : pagos.map(p => (
          <div key={p.id} style={{ borderRadius: 10, border: "1px solid var(--color-border)", padding: "10px 14px", marginBottom: 6, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{p.nombre_empresa}</div>
              <div style={{ fontSize: 11, color: "var(--color-text-faint)", marginTop: 2 }}>
                {p.notas || "Sin notas"} · {new Date(p.created_at).toLocaleDateString("es-BO", { day: "2-digit", month: "short", year: "numeric" })}
              </div>
            </div>
            <div style={{ fontWeight: 700, fontSize: 16, color: p.monto ? "#22c55e" : "var(--color-text-faint)" }}>
              {p.monto ? `Bs. ${Number(p.monto).toFixed(2)}` : "—"}
            </div>
          </div>
        ))}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
