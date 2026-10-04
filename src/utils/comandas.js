// Reglas puras de mesas y comandas (totales, tiempos, tickets) para poder probarlas.
import { esc, dinero } from "./ticketTermico.js";

export const ESTADOS_ITEM = { PENDIENTE: "Por enviar", ENVIADO: "En cocina", LISTO: "Listo", ENTREGADO: "Entregado", ANULADO: "Anulado" };
export const TIPOS_COMANDA = { MESA: "Mesa", LLEVAR: "Para llevar", DELIVERY: "Delivery" };

/** Totales de una comanda (sin líneas anuladas). */
export function resumenComanda(c) {
  const r = { total: 0, porCobrar: 0, cobrado: 0, pendientes: 0, enCocina: 0, listos: 0, lineas: 0 };
  for (const i of c?.items || []) {
    if (i.estado === "ANULADO") continue;
    const sub = i.qty * i.price;
    r.total += sub; r.lineas++;
    if (i.ventaId) r.cobrado += sub; else r.porCobrar += sub;
    if (i.estado === "PENDIENTE") r.pendientes++;
    else if (i.estado === "ENVIADO") r.enCocina++;
    else if (i.estado === "LISTO") r.listos++;
  }
  r.total = Math.round(r.total * 100) / 100; r.porCobrar = Math.round(r.porCobrar * 100) / 100; r.cobrado = Math.round(r.cobrado * 100) / 100;
  return r;
}

/** Minutos transcurridos desde una fecha (para "hace 12 min" y alertas de cocina). */
export const minutosDesde = (iso, ahora = Date.now()) => Math.max(0, Math.floor((ahora - new Date(iso).getTime()) / 60000));
export const tiempoTxt = min => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`);

/** Título corto de la comanda: "Mesa 4", "Para llevar · Juan", "#12". */
export const tituloComanda = c => (c.tipo === "MESA" && c.mesaNombre ? c.mesaNombre
  : `${TIPOS_COMANDA[c.tipo] || "Comanda"}${c.customerName ? ` · ${c.customerName}` : ` #${c.numero}`}`);

/** Estado visual de una mesa según su comanda abierta. */
export function estadoMesa(comanda) {
  if (!comanda) return "libre";
  const r = resumenComanda(comanda);
  if (r.lineas > 0 && r.porCobrar === 0) return "pagada";
  if (r.listos > 0) return "listo";
  return "ocupada";
}

/** Pedidos para cocina: comandas abiertas con líneas enviadas/listas, la más antigua primero. */
export function colaCocina(comandas) {
  return comandas
    .filter(c => c.estado === "ABIERTA")
    .map(c => ({ comanda: c, items: (c.items || []).filter(i => i.estado === "ENVIADO" || i.estado === "LISTO") }))
    .filter(x => x.items.length)
    .map(x => ({ ...x, desde: x.items.reduce((m, i) => (i.enviado && i.enviado < m ? i.enviado : m), x.items[0].enviado || x.comanda.abierta) }))
    .sort((a, b) => new Date(a.desde) - new Date(b.desde));
}

const estilos = (ancho, grande) => `
  @page { size: ${ancho}mm auto; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; width: ${ancho}mm; font-family: "Courier New", ui-monospace, monospace; font-size: ${grande ? (ancho === 58 ? 13 : 15) : (ancho === 58 ? 11 : 12)}px; color: #000; }
  .t { width: ${ancho === 58 ? 48 : 72}mm; margin: 0 auto; padding: 3mm 0 6mm; }
  .c { text-align: center; } .b { font-weight: 700; } .g { font-size: 1.3em; }
  .sep { overflow: hidden; white-space: nowrap; margin: 4px 0; }
  .fila { display: flex; justify-content: space-between; gap: 6px; } .it { margin-bottom: 4px; } .nota { padding-left: 10px; font-style: italic; }
  .peq { font-size: 0.85em; }`;
const hora = d => new Date(d || Date.now()).toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit" });

/** Ticket para la cocina: solo lo que se acaba de enviar, letra grande y sin precios. */
export function htmlTicketCocina({ envio, ancho = 80, fecha = new Date() }) {
  const linea = "-".repeat(ancho === 58 ? 26 : 34);
  const destino = envio.tipo === "MESA" && envio.mesa ? esc(envio.mesa) : esc(TIPOS_COMANDA[envio.tipo] || "Comanda");
  const items = (envio.items || []).map(i => `<div class="it"><span class="b">${Number(i.cantidad)} ×</span> ${esc(i.nombre)}${i.nota ? `<div class="nota">» ${esc(i.nota)}</div>` : ""}</div>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Cocina ${envio.numero}</title><style>${estilos(ancho, true)}</style></head><body><div class="t">
    <div class="c b g">${destino}</div>
    <div class="c">Comanda #${envio.numero} · ${hora(fecha)}</div>
    ${envio.mesero ? `<div class="c peq">${esc(envio.mesero)}</div>` : ""}
    <div class="sep">${linea}</div>${items}<div class="sep">${linea}</div>
  </div></body></html>`;
}

/** Precuenta para el cliente (no es comprobante de venta). */
export function htmlPrecuenta({ comanda: c, config = {}, ancho = 80, simbolo = "Bs.", propinaPct = 0 }) {
  const linea = "-".repeat(ancho === 58 ? 32 : 42);
  const vivos = (c.items || []).filter(i => i.estado !== "ANULADO");
  // Agrupa líneas iguales (mismo nombre y precio) para que la cuenta sea corta
  const grupos = new Map();
  vivos.forEach(i => { const k = `${i.name}|${i.price}`; const g = grupos.get(k); if (g) g.qty += i.qty; else grupos.set(k, { name: i.name, price: i.price, qty: i.qty }); });
  const items = [...grupos.values()].map(i => `<div class="it"><div>${esc(i.name)}</div><div class="fila"><span>${Number(i.qty)} x ${dinero(i.price, "")}</span><span>${dinero(i.qty * i.price, "")}</span></div></div>`).join("");
  const r = resumenComanda(c);
  const propina = Math.round(r.total * (Number(propinaPct) || 0)) / 100;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Cuenta ${c.numero}</title><style>${estilos(ancho, false)}</style></head><body><div class="t">
    <div class="c b g">${esc(config.businessName || "Mi negocio")}</div>
    <div class="c b">PRECUENTA · ${esc(tituloComanda(c))}</div>
    <div class="c">Comanda #${c.numero} · ${hora()}${c.personas ? ` · ${c.personas} pers.` : ""}</div>
    <div class="sep">${linea}</div>${items}<div class="sep">${linea}</div>
    <div class="fila b g"><span>TOTAL</span><span>${dinero(r.total, simbolo)}</span></div>
    ${r.cobrado > 0 ? `<div class="fila"><span>Ya pagado</span><span>${dinero(r.cobrado, simbolo)}</span></div><div class="fila b"><span>Por pagar</span><span>${dinero(r.porCobrar, simbolo)}</span></div>` : ""}
    ${propina > 0 ? `<div class="fila peq"><span>Propina sugerida (${propinaPct}%)</span><span>${dinero(propina, simbolo)}</span></div>` : ""}
    ${c.personas > 1 ? `<div class="fila peq"><span>Entre ${c.personas} personas</span><span>${dinero(r.porCobrar / c.personas, simbolo)} c/u</span></div>` : ""}
    <div class="sep">${linea}</div>
    <div class="c peq">Este documento no es un comprobante de pago</div>
  </div></body></html>`;
}
