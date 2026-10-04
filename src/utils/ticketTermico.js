// Ticket para impresoras térmicas de 58 mm y 80 mm (rollo).
// La impresora y su ancho son de cada dispositivo, por eso la preferencia se guarda en este navegador.
import { fDateTime } from "./businessLogic.js";

const CLAVE_ANCHO = "moxi_ticket_ancho";
const CLAVE_AUTO = "moxi_ticket_auto";

export const leerAnchoTicket = () => { try { return localStorage.getItem(CLAVE_ANCHO) === "58" ? 58 : 80; } catch { return 80; } };
export const guardarAnchoTicket = a => { try { localStorage.setItem(CLAVE_ANCHO, String(a)); } catch { /* sin almacenamiento */ } };
export const leerAutoTicket = () => { try { return localStorage.getItem(CLAVE_AUTO) === "1"; } catch { return false; } };
export const guardarAutoTicket = v => { try { localStorage.setItem(CLAVE_AUTO, v ? "1" : "0"); } catch { /* sin almacenamiento */ } };

export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const dinero = (v, simbolo) => `${simbolo} ${Number(v || 0).toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const METODO = { efectivo: "Efectivo", qr: "QR", transferencia: "Transferencia", banco: "Transferencia", tarjeta: "Tarjeta", mixto: "Mixto", credito: "Crédito" };

/** HTML del ticket (se exporta para poder probarlo). */
export function htmlTicket({ sale, config = {}, ancho = 80, simbolo = "Bs.", vendedor = "" }) {
  const cols = ancho === 58 ? 32 : 42;                 // caracteres por línea aprox.
  const anchoUtil = ancho === 58 ? 48 : 72;            // área imprimible real en mm
  const linea = "-".repeat(cols);
  const items = (sale.items || []).map(i => {
    const sub = Number(i.sub ?? i.subtotal ?? i.qty * i.unitPrice) || 0;
    return `<div class="it"><div class="nom">${esc(i.name || i.productName || "Producto")}</div>
      <div class="fila"><span>${Number(i.qty)} ${esc(i.unit || "")} x ${dinero(i.unitPrice, "")}</span><span>${dinero(sub, "")}</span></div></div>`;
  }).join("");
  const subtotal = (sale.items || []).reduce((a, i) => a + (Number(i.sub ?? i.subtotal) || 0), 0);
  const descuento = Number(sale.discount || 0) > 0 ? subtotal - Number(sale.total || 0) : 0;
  const numero = `N° ${String(sale.numero || 0).padStart(6, "0")}`;

  return `<!doctype html><html><head><meta charset="utf-8"><title>Ticket ${numero}</title><style>
    @page { size: ${ancho}mm auto; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; width: ${ancho}mm; font-family: "Courier New", ui-monospace, monospace; font-size: ${ancho === 58 ? 11 : 12}px; color: #000; -webkit-print-color-adjust: exact; }
    .t { width: ${anchoUtil}mm; margin: 0 auto; padding: 3mm 0 6mm; }
    .c { text-align: center; } .b { font-weight: 700; } .g { font-size: 1.25em; }
    .sep { overflow: hidden; white-space: nowrap; margin: 4px 0; }
    .fila { display: flex; justify-content: space-between; gap: 6px; }
    .it { margin-bottom: 3px; } .nom { word-break: break-word; }
    img.logo { max-width: 60%; max-height: 22mm; display: block; margin: 0 auto 4px; filter: grayscale(1) contrast(1.2); }
    .peq { font-size: 0.85em; }
  </style></head><body><div class="t">
    ${config.logo_url ? `<img class="logo" src="${esc(config.logo_url)}" alt="">` : ""}
    <div class="c b g">${esc(config.businessName || "Mi negocio")}</div>
    ${config.nit ? `<div class="c">NIT: ${esc(config.nit)}</div>` : ""}
    ${config.direccion ? `<div class="c">${esc(config.direccion)}</div>` : ""}
    ${config.telefono ? `<div class="c">Tel: ${esc(config.telefono)}</div>` : ""}
    <div class="sep">${linea}</div>
    <div class="c b">NOTA DE VENTA ${numero}</div>
    <div>Fecha: ${esc(fDateTime(sale.date || sale.createdAt || new Date()))}</div>
    <div>Cliente: ${esc(sale.customerName || "Público general")}</div>
    ${vendedor ? `<div>Atendió: ${esc(vendedor)}</div>` : ""}
    <div class="sep">${linea}</div>
    ${items}
    <div class="sep">${linea}</div>
    ${descuento > 0.004 ? `<div class="fila"><span>Subtotal</span><span>${dinero(subtotal, simbolo)}</span></div>
      <div class="fila"><span>Descuento</span><span>-${dinero(descuento, simbolo)}</span></div>` : ""}
    <div class="fila b g"><span>TOTAL</span><span>${dinero(sale.total, simbolo)}</span></div>
    <div class="fila"><span>Pago</span><span>${esc(METODO[sale.paymentMethod] || sale.paymentMethod || "-")}</span></div>
    ${sale.recibido > 0 ? `<div class="fila"><span>Recibido</span><span>${dinero(sale.recibido, simbolo)}</span></div>` : ""}
    ${sale.vuelto > 0 ? `<div class="fila b"><span>Cambio</span><span>${dinero(sale.vuelto, simbolo)}</span></div>` : ""}
    ${Number(sale.debt) > 0 ? `<div class="fila b"><span>Saldo pendiente</span><span>${dinero(sale.debt, simbolo)}</span></div>` : ""}
    <div class="sep">${linea}</div>
    <div class="c b">¡Gracias por su compra!</div>
    <div class="c peq">Documento no válido como factura fiscal</div>
  </div></body></html>`;
}

/** Imprime el ticket con un marco oculto (no lo bloquean las ventanas emergentes). */
export function imprimirTicket(opciones) { imprimirHtml(htmlTicket(opciones)); }

/** Imprime cualquier HTML de ticket con un marco oculto. */
export function imprimirHtml(html) {
  const marco = document.createElement("iframe");
  marco.setAttribute("aria-hidden", "true");
  Object.assign(marco.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0", visibility: "hidden" });
  document.body.appendChild(marco);
  const doc = marco.contentDocument;
  doc.open(); doc.write(html); doc.close();
  const imprimir = () => {
    try { marco.contentWindow.focus(); marco.contentWindow.print(); } finally { setTimeout(() => marco.remove(), 1500); }
  };
  // Espera a que cargue el logo (máximo 1,5 s) para que salga en el papel
  const imgs = [...doc.images];
  if (!imgs.length) { setTimeout(imprimir, 50); return; }
  let listo = false;
  const una = () => { if (!listo) { listo = true; imprimir(); } };
  Promise.all(imgs.map(i => (i.complete ? null : new Promise(r => { i.onload = i.onerror = r; })))).then(una);
  setTimeout(una, 1500);
}
