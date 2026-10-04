// Comprobante de una orden de servicio en papel térmico (recepción o entrega).
import { esc, dinero } from "./ticketTermico.js";
import { fDateTime } from "./businessLogic.js";

export const ESTADOS_ORDEN = {
  RECIBIDO: "Recibido", DIAGNOSTICO: "En diagnóstico", ESPERA_APROBACION: "Esperando aprobación",
  EN_REPARACION: "En reparación", LISTO: "Listo para entregar", ENTREGADO: "Entregado", CANCELADO: "Cancelado",
};

const fechaCorta = d => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");

export function htmlTicketOrden({ orden: o, config = {}, ancho = 80, simbolo = "Bs." }) {
  const cols = ancho === 58 ? 32 : 42;
  const anchoUtil = ancho === 58 ? 48 : 72;
  const linea = "-".repeat(cols);
  const fila = (a, b) => `<div class="fila"><span>${a}</span><span>${b}</span></div>`;
  const items = (o.items || []).map(i => `<div class="it"><div>${esc(i.name)}</div>${fila(`${Number(i.qty)} x ${dinero(i.price, "")}`, dinero(i.qty * i.price, ""))}</div>`).join("");
  const saldo = Math.max(0, (o.total || 0) - (o.anticipo || 0));
  const equipo = [o.equipo, o.marca, o.modelo].filter(Boolean).join(" · ");

  return `<!doctype html><html><head><meta charset="utf-8"><title>Orden ${o.numero}</title><style>
    @page { size: ${ancho}mm auto; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; width: ${ancho}mm; font-family: "Courier New", ui-monospace, monospace; font-size: ${ancho === 58 ? 11 : 12}px; color: #000; }
    .t { width: ${anchoUtil}mm; margin: 0 auto; padding: 3mm 0 6mm; }
    .c { text-align: center; } .b { font-weight: 700; } .g { font-size: 1.2em; }
    .sep { overflow: hidden; white-space: nowrap; margin: 4px 0; }
    .fila { display: flex; justify-content: space-between; gap: 6px; } .it { margin-bottom: 3px; }
    .caja { border: 1px solid #000; padding: 4px; margin: 4px 0; } .peq { font-size: 0.85em; }
  </style></head><body><div class="t">
    <div class="c b g">${esc(config.businessName || "Servicio técnico")}</div>
    ${config.telefono ? `<div class="c">Tel: ${esc(config.telefono)}</div>` : ""}
    ${config.direccion ? `<div class="c">${esc(config.direccion)}</div>` : ""}
    <div class="sep">${linea}</div>
    <div class="c b g">ORDEN DE SERVICIO N° ${String(o.numero).padStart(5, "0")}</div>
    <div class="c">${esc(ESTADOS_ORDEN[o.estado] || o.estado)}</div>
    <div class="sep">${linea}</div>
    <div>Recibido: ${esc(fDateTime(o.recibido))}</div>
    ${o.prometido ? `<div class="b">Entrega estimada: ${fechaCorta(o.prometido)}</div>` : ""}
    <div>Cliente: ${esc(o.customerName)}</div>
    ${o.phone ? `<div>Teléfono: ${esc(o.phone)}</div>` : ""}
    <div class="sep">${linea}</div>
    <div class="b">Equipo: ${esc(equipo)}</div>
    ${o.serie ? `<div>Serie / IMEI: ${esc(o.serie)}</div>` : ""}
    ${o.accesorios ? `<div>Accesorios: ${esc(o.accesorios)}</div>` : ""}
    <div class="caja"><span class="b">Falla reportada:</span> ${esc(o.falla)}</div>
    ${o.diagnostico ? `<div class="caja"><span class="b">Diagnóstico:</span> ${esc(o.diagnostico)}</div>` : ""}
    ${items ? `<div class="sep">${linea}</div>${items}` : ""}
    <div class="sep">${linea}</div>
    ${o.total > 0 ? fila("<b>TOTAL</b>", `<b>${dinero(o.total, simbolo)}</b>`) : o.presupuesto > 0 ? fila("Presupuesto", dinero(o.presupuesto, simbolo)) : ""}
    ${o.anticipo > 0 ? fila("Anticipo pagado", dinero(o.anticipo, simbolo)) : ""}
    ${o.total > 0 && o.estado !== "ENTREGADO" ? fila("<b>Saldo</b>", `<b>${dinero(saldo, simbolo)}</b>`) : ""}
    ${o.garantiaDias ? `<div class="c" style="margin-top:4px">Garantía: ${o.garantiaDias} días</div>` : ""}
    <div class="sep">${linea}</div>
    <div class="peq">Presente este comprobante para retirar su equipo.</div>
    <br><br><div class="c">______________________</div><div class="c peq">Firma del cliente</div>
  </div></body></html>`;
}
