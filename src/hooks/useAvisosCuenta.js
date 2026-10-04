import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { supabase } from "../lib/supabaseClient.js";
import { cobrosService } from "../services/cobrosService.js";
import { fDate } from "../utils/businessLogic.js";

// Avisos de la cuenta para la campanita:
//  · administrador: pago aprobado/rechazado y suscripción por vencer (en vivo)
//  · superadmin: pagos de clientes por revisar (en vivo)
// Los avisos descartados se recuerdan en este dispositivo.
const CLAVE = "moxi_avisos_vistos";
const leerVistos = () => { try { return new Set(JSON.parse(localStorage.getItem(CLAVE) || "[]")); } catch { return new Set(); } };
const guardarVistos = s => { try { localStorage.setItem(CLAVE, JSON.stringify([...s].slice(-100))); } catch { /* sin almacenamiento */ } };
const MES = m => (m === 12 ? "1 año" : `${m} ${m === 1 ? "mes" : "meses"}`);

export function useAvisosCuenta({ user, suscripcion, onSuscripcionCambio }) {
  const [solicitudes, setSolicitudes] = useState([]);
  const [vistos, setVistos] = useState(leerVistos);
  const esSuper = user?.role === "superadmin";
  const esAdmin = user?.role === "admin";
  const eid = user?.empresa_id;

  const cargar = useCallback(async () => {
    try {
      if (esSuper) setSolicitudes(await cobrosService.solicitudes());
      else if (esAdmin && eid) setSolicitudes(await cobrosService.misSolicitudes(eid));
    } catch { /* la campanita no es crítica */ }
  }, [esSuper, esAdmin, eid]);
  useEffect(() => { cargar(); }, [cargar]);

  // En vivo: el cliente se entera al instante de la revisión; el superadmin, de cada pago nuevo
  useEffect(() => {
    if (!esSuper && !(esAdmin && eid)) return;
    const filtro = esSuper ? {} : { filter: `empresa_id=eq.${eid}` };
    const ch = supabase.channel(`moxi_avisos_${esSuper ? "super" : eid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "solicitudes_pago", ...filtro }, p => {
        const s = p.new || {};
        if (esSuper && p.eventType === "INSERT") toast(`💳 Nuevo pago por revisar: ${s.nombre_empresa || "empresa"}`, { duration: 8000 });
        if (!esSuper && p.eventType === "UPDATE" && s.estado === "APROBADO") {
          toast.success(`¡Pago aprobado! Tu suscripción está vigente hasta ${fDate(s.vence_nuevo)}`, { duration: 9000 });
          onSuscripcionCambio?.();
        }
        if (!esSuper && p.eventType === "UPDATE" && s.estado === "RECHAZADO") toast.error(`Tu pago fue rechazado: ${s.motivo_rechazo || ""}`, { duration: 9000 });
        cargar();
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [esSuper, esAdmin, eid, cargar, onSuscripcionCambio]);

  const avisos = useMemo(() => {
    const lista = [];
    if (esSuper) {
      const pend = solicitudes.filter(s => s.estado === "PENDIENTE");
      if (pend.length) lista.push({ id: `pend-${pend.map(s => s.id).join()}`, tipo: "warn", titulo: `${pend.length} pago${pend.length === 1 ? "" : "s"} por revisar`, texto: pend.slice(0, 3).map(s => s.nombre_empresa).join(", "), tab: "superadmin", fijo: true });
      return lista;
    }
    const hace7 = Date.now() - 7 * 86400000;
    solicitudes.filter(s => s.revisado_at && new Date(s.revisado_at).getTime() > hace7).forEach(s => {
      lista.push(s.estado === "APROBADO"
        ? { id: `sol-${s.id}`, tipo: "ok", titulo: "Pago aprobado", texto: `${s.plan_nombre} · ${MES(s.meses)} · vigente hasta ${fDate(s.vence_nuevo)}`, tab: "usuarios" }
        : { id: `sol-${s.id}`, tipo: "error", titulo: "Pago rechazado", texto: s.motivo_rechazo || "Revisa el comprobante y vuelve a enviarlo", tab: "usuarios" });
    });
    const pend = solicitudes.find(s => s.estado === "PENDIENTE");
    if (pend) lista.push({ id: `pend-${pend.id}`, tipo: "info", titulo: "Pago en revisión", texto: `${pend.plan_nombre} · enviado el ${fDate(pend.created_at)}`, tab: "usuarios", fijo: true });
    if (suscripcion?.vence_el && suscripcion.activa !== false) {
      const dias = Math.ceil((new Date(suscripcion.vence_el + "T23:59:59") - new Date()) / 86400000);
      if (dias >= 0 && dias <= 7 && !pend) {
        lista.push({ id: `vence-${suscripcion.vence_el}-${dias <= 1 ? "1" : dias <= 3 ? "3" : "7"}`, tipo: "warn",
          titulo: dias === 0 ? "Tu suscripción vence hoy" : `Tu suscripción vence en ${dias} día${dias === 1 ? "" : "s"}`,
          texto: esAdmin ? "Renuévala en Ajustes → Suscripción" : "Avísale al administrador", tab: esAdmin ? "usuarios" : null, fijo: dias <= 1 });
      }
    }
    return lista;
  }, [solicitudes, suscripcion, esSuper, esAdmin]);

  const visibles = avisos.filter(a => a.fijo || !vistos.has(a.id));
  const descartar = id => setVistos(v => { const n = new Set(v); n.add(id); guardarVistos(n); return n; });
  return { avisos: visibles, descartar };
}
