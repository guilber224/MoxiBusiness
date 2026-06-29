import { useState, useEffect, useRef } from "react";
import {
  X, Download, Printer, Camera, Search, ScanLine, MessageCircle,
  Banknote, Building2, QrCode, CreditCard, ChevronLeft, ChevronRight,
} from "lucide-react";
import { ventasService } from "../services/ventasService.js";
import { isSupabaseUUID } from "../utils/storageScope.js";
import { n, uid, today, fDate, isAdmin, restoreInventoryFromSale } from "../utils/businessLogic.js";
import { formatCurrency, Bs, getCurrencySymbol } from "../currency.js";
import { generateId } from "../empresaScope.js";
import { DEFAULT_CATEGORIES, getCategoryName } from "../categories.js";
import { safeBusinessName, C, R, FONT } from "../theme.jsx";
import { card, lbl, inp, mkBtn, mkBadge } from "../styles.js";
import { useIsMobile } from "../hooks/useIsMobile.js";
import { BrandLogo } from "./ui/BrandLogo.jsx";
import { Modal } from "./ui/Modal.jsx";
import { Empty } from "./ui/Empty.jsx";
import { Header } from "./ui/Header.jsx";
import { Table } from "./ui/Table.jsx";
import { SearchInput } from "./ui/SearchInput.jsx";
import { Chip } from "./ui/Chip.jsx";

const PM_LABELS = { efectivo: "💵 Efectivo", transferencia: "🏦 Transf.", qr: "📱 QR", mixto: "🔀 Mixto" };
const PM_COLORS = { efectivo: "green", transferencia: "blue", qr: "amber", mixto: "default" };

const SALE_BASE_ITEM = () => ({ id: uid(), productId: "", qty: 1, unitPrice: 0, sub: 0, subtotal: 0 });

// ── Receipt helpers ───────────────────────────────────────────────────────────
const buildReceiptFilename = sale => {
  const stamp = String(sale?.date || new Date().toISOString()).slice(0, 10);
  return `comprobante_moxi_${stamp}_${sale?.id || uid()}.pdf`;
};

const downloadSaleReceipt = async ({ sale, config, user }) => {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = 595.28;
  const ml = 40, mr = 40;
  const re = W - mr;
  const cw = W - ml - mr;
  const businessName = safeBusinessName(config);
  const invoiceNum = `#${String(sale.id || "").slice(-8).toUpperCase()}`;
  const subtotal = (sale.items || []).reduce((s, i) => s + n(i.sub ?? i.subtotal), 0);
  const discountAmt = n(sale.discount || sale.descuento || 0);
  const total = n(sale.total);
  const pm = { efectivo: "Efectivo", transferencia: "Transferencia bancaria", qr: "Pago QR", mixto: "Pago mixto" }[sale.paymentMethod] || sale.paymentMethod || "—";

  doc.setFillColor(17, 30, 123);
  doc.rect(0, 0, W, 72, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.setTextColor(255, 255, 255);
  doc.text(businessName, ml, 28);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(170, 185, 220);
  doc.text("Sistema ERP · Moxi Business", ml, 42);
  doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.setTextColor(255, 255, 255);
  doc.text("FACTURA", re, 28, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(170, 185, 220);
  doc.text(invoiceNum, re, 42, { align: "right" });

  doc.setFillColor(249, 250, 251);
  doc.rect(0, 72, W, 52, "F");
  const metaItems = [
    ["N° DE FACTURA", invoiceNum],
    ["FECHA", fDate(sale.date || sale.createdAt)],
    ["CLIENTE", (sale.customerName || "Público general").slice(0, 28)],
  ];
  metaItems.forEach(([label, val], i) => {
    const x = ml + i * (cw / 3);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(156, 163, 175);
    doc.text(label, x, 88);
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(17, 24, 39);
    doc.text(val, x, 101);
    if (i === 2 && sale.customerMarket) {
      doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(107, 114, 128);
      doc.text(sale.customerMarket, x, 112);
    }
  });

  let y = 140;
  doc.setDrawColor(229, 231, 235); doc.line(ml, y, re, y); y += 14;
  doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(156, 163, 175);
  doc.text("TOTAL A PAGAR", ml, y); y += 14;
  doc.setFont("helvetica", "bold"); doc.setFontSize(24); doc.setTextColor(17, 24, 39);
  doc.text(formatCurrency(total), ml, y); y += 18;
  doc.setDrawColor(229, 231, 235); doc.line(ml, y, re, y); y += 16;

  const c0 = ml, c1 = ml + cw * 0.48, c2 = ml + cw * 0.68, c3 = re;
  const rowH = 20;
  doc.setFillColor(17, 30, 123);
  doc.rect(ml, y, cw, rowH, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(255, 255, 255);
  doc.text("DESCRIPCIÓN", c0 + 5, y + 13);
  doc.text("PRECIO", c1, y + 13);
  doc.text("CANT.", c2 + 18, y + 13, { align: "center" });
  doc.text("TOTAL", c3, y + 13, { align: "right" });
  y += rowH;

  (sale.items || []).forEach((item, idx) => {
    if (y > 760) { doc.addPage(); y = 40; }
    if (idx % 2 === 1) { doc.setFillColor(249, 250, 251); doc.rect(ml, y, cw, rowH, "F"); }
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(17, 24, 39);
    doc.text(String(item.name || "Producto").slice(0, 40), c0 + 5, y + 13);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(55, 65, 81);
    doc.text(formatCurrency(item.unitPrice), c1, y + 13);
    doc.text(String(n(item.qty)), c2 + 18, y + 13, { align: "center" });
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(17, 24, 39);
    doc.text(formatCurrency(n(item.sub ?? item.subtotal)), c3, y + 13, { align: "right" });
    y += rowH;
  });
  doc.setDrawColor(229, 231, 235); doc.line(ml, y, re, y); y += 14;

  const tx = re - 200;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(107, 114, 128);
  doc.text("Subtotal", tx, y);
  doc.setFont("helvetica", "bold"); doc.setTextColor(17, 24, 39);
  doc.text(formatCurrency(subtotal), re, y, { align: "right" }); y += 14;
  if (discountAmt > 0) {
    doc.setFont("helvetica", "normal"); doc.setTextColor(107, 114, 128);
    doc.text("Descuento", tx, y);
    doc.setFont("helvetica", "bold"); doc.setTextColor(220, 38, 38);
    doc.text(`-${formatCurrency(discountAmt)}`, re, y, { align: "right" }); y += 14;
  }
  doc.setFillColor(17, 30, 123);
  doc.rect(tx - 6, y - 11, 206 + mr, 22, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(255, 255, 255);
  doc.text("TOTAL", tx, y + 4);
  doc.text(formatCurrency(total), re, y + 4, { align: "right" });
  y += 28;

  doc.setDrawColor(229, 231, 235); doc.line(ml, y, re, y); y += 14;
  doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(156, 163, 175);
  doc.text("FORMA DE PAGO", ml, y); y += 11;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(55, 65, 81);
  doc.text(pm, ml, y);
  if (n(sale.paid) > 0) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(107, 114, 128);
    doc.text(`Recibido: ${formatCurrency(sale.paid)}`, ml, y + 11);
    if (sale.debt > 0) doc.text(`Pendiente: ${formatCurrency(sale.debt)}`, ml, y + 21);
  }
  const vendX = re, vendY = y - 11;
  doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(156, 163, 175);
  doc.text("ATENDIDO POR", vendX, vendY, { align: "right" });
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(55, 65, 81);
  doc.text(user?.name || "Vendedor", vendX, vendY + 11, { align: "right" });

  if (sale.notes) {
    y += (n(sale.paid) > 0 && sale.debt > 0) ? 36 : n(sale.paid) > 0 ? 26 : 14;
    doc.setFont("helvetica", "italic"); doc.setFontSize(8); doc.setTextColor(107, 114, 128);
    doc.text(`Notas: ${String(sale.notes).slice(0, 90)}`, ml, y);
  }

  y += 22;
  doc.setFillColor(249, 250, 251);
  doc.rect(0, y, W, 38, "F");
  doc.setDrawColor(229, 231, 235); doc.line(0, y, W, y); y += 13;
  doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(55, 65, 81);
  doc.text(businessName, ml, y);
  const contact = [config?.direccion, config?.telefono ? `Tel: ${config.telefono}` : null].filter(Boolean).join(" · ");
  if (contact) { doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(107, 114, 128); doc.text(contact, ml, y + 10); }
  doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(156, 163, 175);
  doc.text("Comprobante generado por Moxi Business ERP", re, y, { align: "right" });
  doc.text(`Impreso el ${fDate(new Date())}`, re, y + 10, { align: "right" });

  doc.save(buildReceiptFilename(sale));
};

// ── ComprobanteModal ──────────────────────────────────────────────────────────
function buildWhatsAppUrl({ sale, config, products }) {
  const biz = safeBusinessName(config);
  const fecha = fDate(sale.date || sale.createdAt);
  const lines = (sale.items || []).map(item => {
    const prod = (products || []).find(p => p.id === item.productId);
    const name = prod?.name || item.productName || "Producto";
    const sub = n(item.sub ?? item.subtotal);
    return `• ${name} x${item.qty} — Bs. ${sub.toFixed(2)}`;
  });
  const total = n(sale.total);
  const debt = n(sale.debt || 0);
  const msg = [
    `🧾 *Comprobante de Venta*`,
    `📍 ${biz}`,
    `📅 ${fecha}`,
    ``,
    ...lines,
    ``,
    `💰 *Total: Bs. ${total.toFixed(2)}*`,
    debt > 0 ? `⏳ Saldo pendiente: Bs. ${debt.toFixed(2)}` : null,
    ``,
    `¡Gracias por su compra! 🙏`,
    `_Moxi Business_`,
  ].filter(x => x !== null).join("\n");
  return `https://wa.me/?text=${encodeURIComponent(msg)}`;
}

function ComprobanteModal({ sale, config, user, products, onClose }) {
  const invoiceRef = useRef(null);
  const businessName = safeBusinessName(config);

  const handlePDF = () => downloadSaleReceipt({ sale, config, user });

  const handlePrint = () => {
    const el = invoiceRef.current;
    if (!el) return;
    const win = window.open("", "_blank", "width=750,height=1000");
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{margin:0;font-family:sans-serif;font-size:13px}*{box-sizing:border-box}table{border-collapse:collapse;width:100%}</style></head><body>${el.innerHTML}</body></html>`);
    win.document.close();
    win.focus();
    win.print();
    win.close();
  };

  const subtotal = (sale.items || []).reduce((s, i) => s + n(i.sub ?? i.subtotal), 0);
  const descuento = n(sale.discount || sale.descuento || 0);
  const total = n(sale.total);
  const pmLabel = { efectivo: "💵 Efectivo", transferencia: "🏦 Transferencia bancaria", qr: "📱 Pago QR", mixto: "🔀 Pago mixto" }[sale.paymentMethod] || sale.paymentMethod || "—";

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.62)", zIndex: 260, display: "flex", alignItems: "center", justifyContent: "center", padding: "12px", overflowY: "auto", backdropFilter: "blur(4px)" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--color-bg-surface)", borderRadius: 18, width: "100%", maxWidth: 680, maxHeight: "95vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 32px 80px rgba(0,0,0,0.28)" }}>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid var(--color-border)", flexShrink: 0 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: "var(--color-text)" }}>Comprobante de venta</div>
            <div style={{ fontSize: 12, color: C.green, fontWeight: 600, marginTop: 2 }}>✓ Venta registrada exitosamente</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-mid)", display: "flex", alignItems: "center", padding: 4 }}>
            <X size={18} strokeWidth={1.8} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", background: "var(--color-bg-primary)", padding: "16px" }}>
          <div ref={invoiceRef} style={{ background: "#ffffff", color: "#111827", maxWidth: 640, margin: "0 auto", borderRadius: 8, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.08)" }}>

            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "28px 28px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {config?.logo_url
                  ? <img src={config.logo_url} alt="logo" style={{ width: 48, height: 48, objectFit: "contain", borderRadius: 8 }} crossOrigin="anonymous" />
                  : <div style={{ width: 48, height: 48, background: C.brand, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 800, fontSize: 20 }}>{businessName[0] || "M"}</div>
                }
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15, color: "#111827", lineHeight: 1.2 }}>{businessName}</div>
                  <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.06em" }}>Sistema ERP · Moxi Business</div>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: C.brand, letterSpacing: "0.05em" }}>FACTURA</div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0, padding: "0 28px 20px", borderBottom: "1px solid #E5E7EB" }}>
              {[
                ["N° de factura", `#${String(sale.id).slice(-8).toUpperCase()}`],
                ["Fecha", fDate(sale.date || sale.createdAt)],
                ["Facturar a", sale.customerName || "Público general"],
              ].map(([lbl2, val]) => (
                <div key={lbl2} style={{ paddingRight: 16 }}>
                  <div style={{ fontSize: 10, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700, marginBottom: 4 }}>{lbl2}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{val}</div>
                  {lbl2 === "Facturar a" && sale.customerMarket && <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>{sale.customerMarket}</div>}
                </div>
              ))}
            </div>

            <div style={{ padding: "18px 28px", borderBottom: "1px solid #E5E7EB" }}>
              <div style={{ fontSize: 10, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700, marginBottom: 6 }}>Total a pagar</div>
              <div style={{ fontSize: 34, fontWeight: 800, color: "#111827", letterSpacing: "-0.02em" }}>{Bs(total)}</div>
            </div>

            <div style={{ padding: "0 28px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 20 }}>
                <thead>
                  <tr style={{ background: C.brand, color: "white" }}>
                    {[["Descripción", "left", "auto"], ["Precio unit.", "right", "110px"], ["Cant.", "center", "70px"], ["Total", "right", "100px"]].map(([h, a, w]) => (
                      <th key={h} style={{ textAlign: a, fontSize: 10, fontWeight: 700, padding: "10px 12px", textTransform: "uppercase", letterSpacing: "0.07em", width: w }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(sale.items || []).map((item, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? "#ffffff" : "#F9FAFB" }}>
                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: "#111827" }}>{item.name}</div>
                        {item.unit && <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>{item.unit}</div>}
                      </td>
                      <td style={{ textAlign: "right", fontSize: 12, color: "#374151", padding: "10px 12px" }}>{Bs(item.unitPrice)}</td>
                      <td style={{ textAlign: "center", fontSize: 12, color: "#374151", padding: "10px 12px" }}>{item.qty}</td>
                      <td style={{ textAlign: "right", fontSize: 13, fontWeight: 700, color: "#111827", padding: "10px 12px" }}>{Bs(item.sub ?? item.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ padding: "16px 28px 20px", display: "flex", justifyContent: "flex-end" }}>
              <div style={{ width: 260 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0", borderBottom: "1px solid #E5E7EB", marginBottom: 4 }}>
                  <span style={{ color: "#6B7280" }}>Subtotal</span>
                  <span style={{ fontWeight: 600, color: "#111827" }}>{Bs(subtotal)}</span>
                </div>
                {descuento > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0", borderBottom: "1px solid #E5E7EB", marginBottom: 4 }}>
                    <span style={{ color: "#6B7280" }}>Descuento</span>
                    <span style={{ fontWeight: 600, color: C.red }}>-{Bs(descuento)}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", background: C.brand, color: "white", padding: "10px 14px", borderRadius: 8, marginTop: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.04em" }}>Total</span>
                  <span style={{ fontWeight: 800, fontSize: 16 }}>{Bs(total)}</span>
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, padding: "16px 28px 20px", borderTop: "1px solid #E5E7EB" }}>
              <div>
                <div style={{ fontSize: 10, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700, marginBottom: 8 }}>Forma de pago</div>
                <div style={{ fontSize: 13, color: "#374151", fontWeight: 600 }}>{pmLabel}</div>
                {n(sale.paid) > 0 && (
                  <div style={{ marginTop: 8, fontSize: 12, color: "#6B7280" }}>
                    <div>Recibido: <strong style={{ color: "#111827" }}>{Bs(sale.paid)}</strong></div>
                    {sale.debt > 0 && <div style={{ marginTop: 2 }}>Pendiente: <strong style={{ color: C.amber }}>{Bs(sale.debt)}</strong></div>}
                  </div>
                )}
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ display: "inline-block" }}>
                  <div style={{ fontStyle: "italic", fontSize: 20, color: "#374151", borderBottom: "1px solid #D1D5DB", paddingBottom: 6, marginBottom: 4, fontFamily: "Georgia,serif" }}>{businessName}</div>
                  <div style={{ fontSize: 10, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.07em" }}>Responsable de cuenta</div>
                </div>
              </div>
            </div>

            <div style={{ background: "#F9FAFB", padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid #E5E7EB" }}>
              <div style={{ fontSize: 11, color: "#6B7280" }}>
                <div style={{ fontWeight: 700, color: "#374151", marginBottom: 2 }}>{businessName}</div>
                {config?.direccion && <div>{config.direccion}</div>}
                {config?.telefono && <div>Tel: {config.telefono}</div>}
                <div style={{ marginTop: 4, fontSize: 10, color: "#9CA3AF" }}>Comprobante generado por Moxi Business ERP</div>
              </div>
              {sale.notes && (
                <div style={{ fontSize: 11, color: "#6B7280", fontStyle: "italic", maxWidth: 200, textAlign: "right" }}>{sale.notes}</div>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, padding: "14px 16px", borderTop: "1px solid var(--color-border)", background: "var(--color-bg-surface)", flexShrink: 0 }}>
          <button onClick={onClose} style={{ ...mkBtn("ghost") }}>Cerrar</button>
          <div style={{ flex: 1 }} />
          <a
            href={buildWhatsAppUrl({ sale, config, products })}
            target="_blank"
            rel="noreferrer"
            style={{ ...mkBtn("ghost"), display: "flex", alignItems: "center", gap: 6, textDecoration: "none", color: "#25D366", borderColor: "rgba(37,211,102,0.3)", background: "rgba(37,211,102,0.08)" }}
          >
            <MessageCircle size={14} /> WhatsApp
          </a>
          <button onClick={handlePrint} style={{ ...mkBtn("ghost"), display: "flex", alignItems: "center", gap: 6 }}>
            <Printer size={14} /> Imprimir
          </button>
          <button onClick={handlePDF} style={{ ...mkBtn("primary"), display: "flex", alignItems: "center", gap: 6 }}>
            <Download size={14} /> Descargar PDF
          </button>
        </div>
      </div>
    </div>
  );
}

// ── BarcodeScannerButton ──────────────────────────────────────────────────────
function BarcodeScannerButton({ onScan }) {
  const [open, setOpen] = useState(false);
  const [scanErr, setScanErr] = useState("");
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef(null);
  const readerRef = useRef(null);

  const stopScan = () => {
    try { readerRef.current?.reset(); } catch {}
    readerRef.current = null;
    setScanning(false);
  };

  const startScan = async () => {
    setScanErr(""); setScanning(true);
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      readerRef.current = new BrowserMultiFormatReader();
      const devices = await BrowserMultiFormatReader.listVideoInputDevices();
      if (!devices.length) { setScanErr("No se encontró cámara"); setScanning(false); return; }
      const deviceId = devices[devices.length - 1].deviceId;
      readerRef.current.decodeFromVideoDevice(deviceId, videoRef.current, (result) => {
        if (result) { onScan(result.getText()); stopScan(); setOpen(false); }
      });
    } catch (e) {
      setScanErr("Sin acceso a cámara: " + (e.message || "Permiso denegado"));
      setScanning(false);
    }
  };

  useEffect(() => {
    if (open) startScan();
    return () => stopScan();
  }, [open]); // eslint-disable-line

  return (
    <>
      <button onClick={() => setOpen(true)} title="Escanear con cámara"
        style={{ ...mkBtn("subtle"), padding: "7px 10px", display: "flex", alignItems: "center", gap: 5, fontSize: 12, flexShrink: 0 }}>
        <Camera size={13} strokeWidth={1.8} /> Cámara
      </button>
      {open && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 9999, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}>
          <div style={{ color: "white", fontWeight: 700, fontSize: 15 }}>Apunta al código de barras</div>
          <div style={{ position: "relative", width: 300, height: 220, borderRadius: 14, overflow: "hidden", border: "2px solid #22C5FE", boxShadow: "0 0 0 4px rgba(34,197,254,0.18)" }}>
            <video ref={videoRef} style={{ width: "100%", height: "100%", objectFit: "cover" }} muted playsInline autoPlay />
            {scanning && <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 2, background: "linear-gradient(90deg,transparent,#22C5FE,transparent)", animation: "moxiLoad 1.2s ease-in-out infinite" }} />}
          </div>
          {scanErr && <div style={{ color: "#F87171", fontSize: 12, maxWidth: 280, textAlign: "center" }}>{scanErr}</div>}
          {scanning && !scanErr && <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 12 }}>Escaneando…</div>}
          <button onClick={() => { stopScan(); setOpen(false); }} style={{ ...mkBtn("ghost"), color: "white", border: "1px solid rgba(255,255,255,0.25)", display: "flex", alignItems: "center", gap: 6 }}>
            <X size={14} /> Cancelar
          </button>
        </div>
      )}
    </>
  );
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  VENTAS                                                             ║
// ╚══════════════════════════════════════════════════════════════════════╝
export function Ventas({ D, save, user, config, logAction, onRefreshDashboard, onReloadSales, salesLoading, salesError }) {
  const { sales, customers, products, inventory, categories } = D;
  const isMobile = useIsMobile();
  const [filter, setFilter] = useState("all"); const [q, setQ] = useState(""); const [modal, setModal] = useState(null); const [detail, setDetail] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null); const [payAmt, setPayAmt] = useState(""); const [err, setErr] = useState(""); const [feedback, setFeedback] = useState(""); const [deleting, setDeleting] = useState(false);
  const [posCategory, setPosCategory] = useState("all"); const [posSearch, setPosSearch] = useState(""); const [barcodeInput, setBarcodeInput] = useState("");
  const [showNewCust, setShowNewCust] = useState(false); const [newCustName, setNewCustName] = useState(""); const [newCustPhone, setNewCustPhone] = useState("");
  const [comprobanteVenta, setComprobanteVenta] = useState(null);
  const [paso, setPaso] = useState(1);
  const barcodeRef = useRef(null);
  const [form, setForm] = useState({ customerId: "__guest__", date: today(), items: [], paid: "", notes: "", paymentMethod: "efectivo", discount: "", discountType: "pct" });
  const FORM_RESET = () => ({ customerId: "__guest__", date: today(), items: [], paid: "", notes: "", paymentMethod: "efectivo", discount: "", discountType: "pct" });
  const categoryOptions = categories.length ? categories : DEFAULT_CATEGORIES;
  const posCategories = [["all", "Todos"], ...categoryOptions.map(c => [c.id, c.name])];
  const canDeleteSales = isAdmin(user);
  const GUEST = { id: "__guest__", name: "Público general", market: "", phone: "" };

  const getStock = id => (inventory.find(i => i.productId === id) || {}).stock || 0;
  const updateItem = (id, field, val) => setForm(f => ({ ...f, items: f.items.map(it => { if (it.id !== id) return it; const u = { ...it, [field]: val }; if (field === "productId") { const p = products.find(p => p.id === val); if (p) { u.unitPrice = p.price; u.original_price = p.price; } } if (field === "unitPrice" && !u.original_price) u.original_price = it.unitPrice || it.original_price; const sub = n(u.qty) * n(u.unitPrice); return { ...u, sub, subtotal: sub }; }) }));
  const addItem = () => setForm(f => ({ ...f, items: [...f.items, SALE_BASE_ITEM()] }));
  const addProductToCart = productId => setForm(f => {
    const product = products.find(item => item.id === productId); if (!product) return f;
    const existing = f.items.find(item => item.productId === productId);
    if (existing) {
      return { ...f, items: f.items.map(item => { if (item.id !== existing.id) return item; const qty = n(item.qty) + 1; const sub = qty * n(item.unitPrice || product.price); return { ...item, qty, unitPrice: n(item.unitPrice || product.price), sub, subtotal: sub }; }) };
    }
    const sub = n(product.price);
    return { ...f, items: [...f.items, { id: uid(), productId, qty: 1, unitPrice: sub, original_price: sub, sub, subtotal: sub }] };
  });
  const removeItem = id => setForm(f => ({ ...f, items: f.items.filter(i => i.id !== id) }));
  const subtotalItems = form.items.reduce((a, i) => a + n(i.sub ?? i.subtotal), 0);
  const discountAmt = form.discountType === "pct" ? subtotalItems * Math.min(n(form.discount), 100) / 100 : Math.min(n(form.discount), subtotalItems);
  const total = Math.max(0, subtotalItems - discountAmt);
  const paidN = n(form.paid);
  const debtN = Math.max(0, total - paidN);

  const closeModal = () => { setModal(null); setErr(""); setPosCategory("all"); setPosSearch(""); setBarcodeInput(""); setShowNewCust(false); setNewCustName(""); setNewCustPhone(""); setForm(FORM_RESET()); setPaso(1); };

  const handleBarcode = e => {
    if (e.key !== "Enter" || !barcodeInput.trim()) return;
    const q2 = barcodeInput.trim().toLowerCase();
    const p = products.find(x => (x.barcode && x.barcode === barcodeInput.trim()) || x.name.toLowerCase() === q2);
    if (p) { addProductToCart(p.id); setBarcodeInput(""); }
    else { setErr(`Producto "${barcodeInput.trim()}" no encontrado`); setBarcodeInput(""); }
  };

  const doCreateCustomer = () => {
    if (!newCustName.trim()) return;
    const nc = { id: generateId(), name: newCustName.trim(), phone: newCustPhone.trim(), market: "", createdAt: new Date().toISOString() };
    save("customers", [nc, ...(D.customers || [])]);
    setForm(f => ({ ...f, customerId: nc.id }));
    setShowNewCust(false); setNewCustName(""); setNewCustPhone("");
  };

  const doSave = async () => {
    setErr("");
    const valid = form.items.filter(i => i.productId && n(i.qty) > 0);
    if (!valid.length) { setErr("Agrega al menos un producto"); return; }
    const cust = form.customerId === "__guest__" ? GUEST : customers.find(c => c.id === form.customerId);
    if (!cust) { setErr("Cliente no encontrado"); return; }
    const prod_map = {};
    valid.forEach(it => { prod_map[it.productId] = (prod_map[it.productId] || 0) + n(it.qty); });
    const lowStockItems = Object.entries(prod_map).filter(([id, qty]) => qty > getStock(id));
    if (lowStockItems.length > 0 && !window._stockWarningConfirmed) {
      window._stockWarningConfirmed = true;
      setErr("⚠️ Stock insuficiente en algunos productos. Pulsa 'Finalizar venta' de nuevo para continuar de todos modos.");
      return;
    }
    window._stockWarningConfirmed = false;
    const newInv = inventory.map(i => { const qty = prod_map[i.productId]; return qty ? { ...i, stock: Math.max(0, i.stock - qty) } : i; });
    const sale = {
      id: generateId(),
      numero: Date.now(), customerId: form.customerId, customerName: cust.name, customerMarket: cust.market,
      date: new Date(form.date + "T12:00:00").toISOString(),
      items: valid.map(it => { const product = products.find(p => p.id === it.productId); const sub = n(it.sub ?? it.subtotal); return { ...it, name: product?.name || "", unit: product?.unit || "", image: product?.img || null, sub, subtotal: sub, original_price: it.original_price || it.unitPrice, sale_price: it.unitPrice }; }),
      subtotal: subtotalItems, discount: discountAmt, discountType: form.discountType,
      total, paid: paidN, debt: debtN, notes: form.notes, paymentMethod: form.paymentMethod,
      payments: paidN > 0 ? [{ amount: paidN, method: form.paymentMethod, date: new Date().toISOString() }] : [],
      createdAt: new Date().toISOString(), empresa_id: user.empresa_id,
    };
    let ventaFinal = { ...sale };
    try {
      const nueva = await ventasService.createVenta(sale, user);
      if (nueva?.id) ventaFinal = { ...sale, id: nueva.id };
      if (nueva?._localOnly && isSupabaseUUID(user?.empresa_id)) {
        setErr("⚠ Error Supabase al guardar venta. Revisa la consola (F12) para ver el detalle.");
        return;
      }
    } catch (e) { console.warn("Venta Supabase error:", e.message); }
    save("sales", [ventaFinal, ...(sales || [])]); save("inventory", newInv);
    logAction?.(`${user.name} realizó una venta de ${Bs(total)} a ${cust.name}`);
    setFeedback("✓ Venta registrada"); setTimeout(() => setFeedback(""), 4000);
    closeModal();
    setComprobanteVenta(ventaFinal);
  };

  const doPayment = async () => {
    if (!detail) return; const amt = Math.min(n(payAmt), detail.debt); if (amt <= 0) return;
    const updated = sales.map(s => s.id === detail.id ? { ...s, paid: s.paid + amt, debt: Math.max(0, s.debt - amt), payments: [...(s.payments || []), { amount: amt, date: new Date().toISOString() }] } : s);
    const ventaActualizada = updated.find(s => s.id === detail.id);
    setErr("");
    let result;
    try { result = await ventasService.updateVenta(detail.id, ventaActualizada, user?.empresa_id); }
    catch (e) { console.warn("Cobro Supabase error:", e.message); }
    if (result?._localOnly && isSupabaseUUID(user?.empresa_id)) {
      setErr("⚠ Error Supabase al registrar el cobro. El pago no se guardó — revisa tu conexión e intenta de nuevo.");
      return;
    }
    save("sales", updated); setDetail(ventaActualizada); setPayAmt("");
    logAction?.(`${user.name} registró un cobro de ${Bs(amt)} para la venta ${detail.id}`);
  };

  const doDeleteSale = async () => {
    if (!deleteTarget || deleting) return;
    const target = deleteTarget;
    const prevSales = sales;
    const prevInventory = inventory;
    setDeleting(true); setErr("");
    save("sales", sales.filter(s => s.id !== target.id));
    save("inventory", restoreInventoryFromSale(inventory, target));
    if (detail?.id === target.id) setDetail(null);
    setDeleteTarget(null);
    logAction?.(`${user.name} eliminó la venta ${target.id} por ${Bs(target.total)}`);
    setFeedback("Venta eliminada y stock restaurado."); setTimeout(() => setFeedback(""), 4000);
    try {
      const res = await ventasService.deleteVenta(target.id, user?.empresa_id);
      if (res && res.ok === false) {
        save("sales", prevSales);
        save("inventory", prevInventory);
        setFeedback(""); setErr("⚠ No se pudo eliminar la venta en Supabase. Se restauró. Revisa tu conexión (F12).");
      } else {
        onRefreshDashboard?.();
      }
    } catch (e) {
      console.error("[Ventas] doDeleteSale:", e?.message);
      save("sales", prevSales);
      save("inventory", prevInventory);
      setFeedback(""); setErr("⚠ Error al eliminar la venta. Se restauró el estado anterior.");
    } finally {
      setDeleting(false);
    }
  };

  const filtered = sales.filter(s => { const mq = `${s.customerName} ${s.customerMarket}`.toLowerCase().includes(q.toLowerCase()); const mf = filter === "all" || (filter === "pending" && s.debt > 0) || (filter === "paid" && s.debt === 0); return mq && mf; }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const posProducts = products.filter(product => (posCategory === "all" || product.cat === posCategory) && `${product.name} ${getCategoryName(categoryOptions, product.cat)}`.toLowerCase().includes(posSearch.toLowerCase()));

  const calcSaleProfit = (sale) =>
    (sale.items || []).reduce((acc, item) => {
      const product = products.find(p => p.id === item.productId);
      return acc + (n(item.unitPrice) - n(product?.cost || 0)) * n(item.qty);
    }, 0);
  const hasCostData = products.some(p => n(p.cost) > 0);
  const totalRevenue = sales.reduce((s, v) => s + v.total, 0);
  const totalProfit = hasCostData ? sales.reduce((s, v) => s + calcSaleProfit(v), 0) : 0;
  const avgMargin = totalRevenue > 0 && hasCostData ? Math.round(totalProfit / totalRevenue * 100) : null;

  // ── Detalle de venta ──────────────────────────────────────────────────────
  if (detail) {
    const sale = sales.find(s => s.id === detail.id) || detail;
    const pmLabel = { efectivo: "Efectivo", transferencia: "Transferencia", qr: "QR", mixto: "Mixto" }[sale.paymentMethod] || "—";
    return (
      <div>
        <button onClick={() => setDetail(null)} style={{ ...mkBtn("ghost"), marginBottom: 16 }}>← Volver</button>
        <div style={card()}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
            <div>
              <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-0.03em" }}>{sale.customerName}</div>
              <div style={{ fontSize: 13, color: C.textMid }}>{sale.customerMarket && `${sale.customerMarket} · `}{fDate(sale.date)}</div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {sale.paymentMethod && <span style={mkBadge(PM_COLORS[sale.paymentMethod] || "default")}>{PM_LABELS[sale.paymentMethod] || sale.paymentMethod}</span>}
              <span style={mkBadge(sale.debt > 0 ? "amber" : "green")}>{sale.debt > 0 ? "Pendiente" : "Saldado"}</span>
              <button onClick={() => downloadSaleReceipt({ sale, config, user })} style={mkBtn("ghost")}>PDF</button>
              {canDeleteSales && <button onClick={() => setDeleteTarget(sale)} style={mkBtn("danger")}>Eliminar</button>}
            </div>
          </div>
          <Table cols={[{ key: "name", label: "Producto" }, { key: "qty", label: "Cant.", render: (v, row) => `${v} ${row.unit}` }, { key: "unitPrice", label: "Precio unit.", render: v => Bs(v) }, { key: "sub", label: "Subtotal", render: v => <strong>{Bs(v)}</strong> }]} rows={sale.items} />
          {(() => {
            const profit = calcSaleProfit(sale);
            const margin = sale.total > 0 && hasCostData ? Math.round(profit / sale.total * 100) : null;
            const cols = margin !== null ? [["Total", Bs(sale.total), C.red], ["Pagado", Bs(sale.paid), C.green], ["Deuda", Bs(sale.debt), sale.debt > 0 ? C.amber : C.green], ["Ganancia", Bs(profit) + (margin !== null ? ` (${margin}%)` : ""), C.green]] : [["Total", Bs(sale.total), C.red], ["Pagado", Bs(sale.paid), C.green], ["Deuda", Bs(sale.debt), sale.debt > 0 ? C.amber : C.green]];
            return (
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols.length},1fr)`, gap: 8, padding: "12px", background: C.bg, borderRadius: R.md, marginTop: 12, marginBottom: 12 }}>
                {cols.map(([l, v, c]) => (
                  <div key={l}><div style={{ ...lbl }}>{l}</div><div style={{ fontWeight: 700, color: c, fontSize: 14 }}>{v}</div></div>
                ))}
              </div>
            );
          })()}
          {sale.notes && <div style={{ fontSize: 13, color: C.textMid, marginBottom: 12 }}>Notas: {sale.notes}</div>}
          {sale.debt > 0 && <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Registrar cobro</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input type="number" min="0" step="0.5" style={{ ...inp, width: 140 }} value={payAmt} onChange={e => setPayAmt(e.target.value)} placeholder="Monto en Bs." />
              <button onClick={doPayment} style={mkBtn("primary")}>Registrar cobro</button>
              <button onClick={() => setPayAmt(sale.debt.toFixed(2))} style={mkBtn("ghost")}>Cobrar todo ({Bs(sale.debt)})</button>
            </div>
          </div>}
          {(sale.payments || []).length > 0 && <div style={{ marginTop: 12 }}>
            <div style={{ ...lbl, marginBottom: 6 }}>Historial de pagos</div>
            {sale.payments.map((p, i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "5px 0", borderBottom: `1px solid ${C.border}` }}>
              <span style={{ color: C.textMid }}>{fDate(p.date)}{p.method && ` · ${pmLabel}`}</span><span style={{ color: C.green, fontWeight: 600 }}>{Bs(p.amount)}</span>
            </div>)}
          </div>}
        </div>
        {deleteTarget && <Modal title="Eliminar venta" onClose={() => setDeleteTarget(null)} width={420}>
          <div style={{ fontSize: 13, color: C.textMid, marginBottom: 16 }}>Esta acción eliminará la venta y restaurará el stock al inventario.</div>
          {err && <div style={{ fontSize: 12.5, color: C.red, marginBottom: 12 }}>{err}</div>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={() => setDeleteTarget(null)} disabled={deleting} style={mkBtn("ghost")}>Cancelar</button>
            <button onClick={doDeleteSale} disabled={deleting} style={{ ...mkBtn("danger"), opacity: deleting ? 0.6 : 1 }}>{deleting ? "Eliminando…" : "Eliminar"}</button>
          </div>
        </Modal>}
      </div>
    );
  }

  // ── Lista de ventas ───────────────────────────────────────────────────────
  return (
    <div>
      <Header title="Ventas" sub={`${sales.length} ventas registradas`} action={<button onClick={() => setModal("new")} style={{ ...mkBtn("primary"), fontSize: 14, padding: "9px 18px" }}>+ Nueva venta</button>} />
      {feedback && <div style={{ ...card({ marginBottom: 12, borderLeft: `3px solid ${C.green}` }), color: C.green, fontWeight: 600 }}>{feedback}</div>}
      {err && <div style={{ ...card({ marginBottom: 12, borderLeft: `3px solid ${C.red}` }), color: C.red, fontWeight: 600 }}>{err}</div>}
      {avgMargin !== null && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10, marginBottom: 12 }}>
          <div style={{ ...card(), textAlign: "center" }}>
            <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 4 }}>Ingresos totales</div>
            <div style={{ fontSize: "clamp(14px,4vw,20px)", fontWeight: 800, color: C.red, letterSpacing: "-0.03em" }}>{Bs(totalRevenue)}</div>
          </div>
          <div style={{ ...card(), textAlign: "center" }}>
            <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 4 }}>Ganancia total</div>
            <div style={{ fontSize: "clamp(14px,4vw,20px)", fontWeight: 800, color: C.green, letterSpacing: "-0.03em" }}>{Bs(totalProfit)}</div>
          </div>
          <div style={{ ...card(), textAlign: "center" }}>
            <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 4 }}>Margen promedio</div>
            <div style={{ fontSize: "clamp(14px,4vw,20px)", fontWeight: 800, color: C.green, letterSpacing: "-0.03em" }}>{avgMargin}%</div>
          </div>
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <SearchInput value={q} onChange={setQ} placeholder="Buscar cliente..." />
        <Chip value={filter} onChange={setFilter} options={[["all", "Todas"], ["pending", "Pendientes"], ["paid", "Saldadas"]]} />
        {onReloadSales && <button onClick={onReloadSales} style={{ ...mkBtn("ghost"), fontSize: 12, padding: "7px 12px" }}>↺ Recargar</button>}
      </div>
      {salesLoading ? (
        <div style={{ textAlign: "center", padding: "40px 16px", color: C.textFaint }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>⏳</div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>Sincronizando ventas…</div>
          <div style={{ fontSize: 11, marginTop: 4 }}>Conectando con Supabase, espera unos segundos</div>
        </div>
      ) : salesError && sales.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 16px" }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🔌</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Sin conexión a Supabase</div>
          <div style={{ fontSize: 12, color: C.textFaint, marginBottom: 4 }}>El proyecto puede estar <strong>pausado</strong> (plan gratuito pausa cada 7 días sin uso).</div>
          <div style={{ fontSize: 12, color: C.textFaint, marginBottom: 16 }}>Ve a <strong>supabase.com/dashboard</strong> → tu proyecto → <strong>Resume project</strong>, luego reintenta.</div>
          {onReloadSales && <button onClick={onReloadSales} style={mkBtn("primary")}>↺ Reintentar conexión</button>}
        </div>
      ) : filtered.length === 0 ? <Empty icon="🛒" title="Sin ventas" sub={sales.length === 0 ? "Registra tu primera venta" : "Sin resultados"} action={<div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>{sales.length === 0 && onReloadSales && <button onClick={onReloadSales} style={mkBtn("ghost")}>↺ Reintentar carga</button>}<button onClick={() => setModal("new")} style={mkBtn("primary")}>+ Registrar venta</button></div>} /> :
        filtered.map(s => (
          <div key={s.id || s.numero} onClick={() => setDetail(s)} style={{ ...card(), cursor: "pointer", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }} onMouseEnter={e => e.currentTarget.style.borderColor = C.borderMid} onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{s.customerName}</div>
              <div style={{ fontSize: 12, color: C.textMid, display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span>{fDate(s.date)}</span>
                <span>·</span><span>{s.items.length} producto{s.items.length !== 1 ? "s" : ""}</span>
                {s.paymentMethod && <><span>·</span><span>{PM_LABELS[s.paymentMethod] || s.paymentMethod}</span></>}
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.red, letterSpacing: "-0.03em" }}>{Bs(s.total)}</div>
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center", marginTop: 4 }}>
                {s.debt > 0 ? <span style={mkBadge("amber")}>Debe {Bs(s.debt)}</span> : <span style={mkBadge("green")}>Saldado</span>}
                {canDeleteSales && <button onClick={ev => { ev.stopPropagation(); setDeleteTarget(s); }} style={{ ...mkBtn("danger"), padding: "4px 8px", fontSize: 11 }}>×</button>}
              </div>
            </div>
          </div>
        ))}

      {/* ── POS PREMIUM ─────────────────────────────────────────────────────── */}
      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 250, display: "flex", alignItems: "center", justifyContent: "center", padding: isMobile ? "0" : "16px", backdropFilter: "blur(4px)" }}>
          <div style={{ display: "flex", flexDirection: "column", width: "100%", maxWidth: 1060, maxHeight: isMobile ? "100vh" : "96vh", background: C.surface, borderRadius: isMobile ? 0 : R.xl, overflow: "hidden", boxShadow: "0 32px 80px rgba(0,0,0,0.22)" }}>

            {isMobile ? (
              paso === 1 ? (
                <>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: C.sidebar, color: "white", flexShrink: 0 }}>
                    <button onClick={closeModal} style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)", color: "white", borderRadius: R.md, padding: "5px 10px", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 4, fontFamily: FONT }}>
                      <X size={12} /> Cancelar
                    </button>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>Nueva Venta — POS</span>
                    <span style={{ fontSize: 11, opacity: 0.5 }}>{fDate(form.date)}</span>
                  </div>
                  <div style={{ display: "flex", gap: 4, padding: "7px 14px", background: "var(--color-bg-primary)", flexShrink: 0 }}>
                    <div style={{ flex: 1, height: 3, borderRadius: 3, background: C.brand }} />
                    <div style={{ flex: 1, height: 3, borderRadius: 3, background: "var(--color-border)" }} />
                  </div>
                  {err && <div style={{ background: C.redBg, borderBottom: `1px solid ${C.redMid}`, color: C.red, padding: "6px 16px", fontSize: 12, flexShrink: 0 }}>{err}</div>}
                  <div style={{ padding: "8px 12px", borderBottom: `1px solid ${C.border}`, flexShrink: 0, display: "flex", gap: 6 }}>
                    <div style={{ position: "relative", flex: 1 }}>
                      <Search size={13} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: C.textFaint, pointerEvents: "none" }} />
                      <input value={posSearch} onChange={e => setPosSearch(e.target.value)} placeholder="Buscar producto..." style={{ ...inp, paddingLeft: 28, margin: 0, fontSize: 13 }} />
                    </div>
                    <BarcodeScannerButton onScan={code => { const p = products.find(x => x.barcode === code || x.name.toLowerCase() === code.toLowerCase()); if (p) addProductToCart(p.id); else setErr(`Código "${code}" no encontrado`); }} />
                  </div>
                  <div style={{ padding: "6px 12px", borderBottom: `1px solid ${C.border}`, flexShrink: 0, display: "flex", gap: 6, overflowX: "auto" }}>
                    {posCategories.map(([v, l]) => (
                      <button key={v} onClick={() => setPosCategory(v)} style={{ ...mkBtn(posCategory === v ? "primary" : "subtle"), padding: "4px 10px", fontSize: 11, flexShrink: 0 }}>{l}</button>
                    ))}
                  </div>
                  <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10 }}>
                      {posProducts.length === 0 ? (
                        <div style={{ gridColumn: "1/-1", textAlign: "center", padding: 24, color: C.textFaint, fontSize: 12 }}>Sin productos</div>
                      ) : posProducts.map(product => {
                        const stock = getStock(product.id);
                        const inCart = form.items.find(i => i.productId === product.id);
                        return (
                          <button key={product.id} onClick={() => addProductToCart(product.id)}
                            style={{ ...card({ padding: 0, overflow: "hidden", cursor: "pointer", border: `1.5px solid ${inCart ? C.brand : C.border}`, transition: "all 0.12s" }), textAlign: "left", outline: "none" }}
                            onMouseEnter={e => e.currentTarget.style.borderColor = C.brand}
                            onMouseLeave={e => e.currentTarget.style.borderColor = inCart ? C.brand : C.border}>
                            <div style={{ height: 80, background: `linear-gradient(135deg,${C.blueBg},${C.bg})`, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", position: "relative" }}>
                              {product.img ? <img src={product.img} alt={product.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <BrandLogo size={32} />}
                              {inCart && <div style={{ position: "absolute", top: 4, right: 4, background: C.brand, color: "white", borderRadius: "50%", width: 20, height: 20, fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{inCart.qty}</div>}
                              {stock === 0 && <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.52)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "white", fontWeight: 700, letterSpacing: "0.03em" }}>AGOTADO</div>}
                            </div>
                            <div style={{ padding: "7px 8px" }}>
                              <div style={{ fontWeight: 600, fontSize: 12, lineHeight: 1.3, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{product.name}</div>
                              <div style={{ fontSize: 14, fontWeight: 800, color: C.red }}>{Bs(product.price)}</div>
                              {product.minStock > 0 && stock <= product.minStock && stock > 0 && <div style={{ fontSize: 9, color: C.amber }}>⚠ {stock} {product.unit}</div>}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div style={{ background: "var(--color-bg-surface)", borderTop: `1px solid ${C.border}`, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                    <div>
                      <div style={{ fontSize: 11, color: C.textFaint }}>{form.items.length} {form.items.length === 1 ? "producto" : "productos"} · {form.items.reduce((a, i) => a + n(i.qty), 0)} uds.</div>
                      <div style={{ fontSize: 19, fontWeight: 800, color: C.brand, letterSpacing: "-0.03em" }}>{Bs(total)}</div>
                    </div>
                    <button onClick={() => { if (form.items.length > 0) setPaso(2); }}
                      disabled={form.items.length === 0}
                      style={{ display: "flex", alignItems: "center", gap: 6, padding: "11px 20px", background: form.items.length > 0 ? C.brand : "#ccc", color: "white", border: "none", borderRadius: R.md, cursor: form.items.length > 0 ? "pointer" : "not-allowed", fontWeight: 700, fontSize: 14, fontFamily: FONT, transition: "background 0.15s" }}>
                      Continuar <ChevronRight size={16} />
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: C.sidebar, color: "white", flexShrink: 0 }}>
                    <button onClick={() => setPaso(1)} style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "white", borderRadius: 8, padding: "6px 8px", cursor: "pointer", display: "flex", alignItems: "center" }}>
                      <ChevronLeft size={16} />
                    </button>
                    <div style={{ flex: 1, fontWeight: 700, fontSize: 14, textAlign: "center" }}>Detalles de venta</div>
                    <span style={{ fontSize: 11, opacity: 0.5 }}>{fDate(form.date)}</span>
                  </div>
                  <div style={{ display: "flex", gap: 4, padding: "7px 14px", background: "var(--color-bg-primary)", flexShrink: 0 }}>
                    <div style={{ flex: 1, height: 3, borderRadius: 3, background: C.brand }} />
                    <div style={{ flex: 1, height: 3, borderRadius: 3, background: C.brand }} />
                  </div>
                  {err && <div style={{ background: C.redBg, borderBottom: `1px solid ${C.redMid}`, color: C.red, padding: "6px 16px", fontSize: 12, flexShrink: 0 }}>{err}</div>}
                  <div style={{ flex: 1, overflowY: "auto", padding: "12px", display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ ...card(), padding: "14px" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: C.textFaint, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>Cliente y fecha</div>
                      {showNewCust ? (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <input value={newCustName} onChange={e => setNewCustName(e.target.value)} placeholder="Nombre cliente *" style={{ ...inp, margin: 0, flex: 1, minWidth: 100, fontSize: 13 }} autoFocus />
                          <input value={newCustPhone} onChange={e => setNewCustPhone(e.target.value)} placeholder="Teléfono" style={{ ...inp, margin: 0, width: 120, fontSize: 13 }} />
                          <div style={{ display: "flex", gap: 6 }}>
                            <button onClick={doCreateCustomer} style={{ ...mkBtn("primary"), fontSize: 13 }}>Crear</button>
                            <button onClick={() => setShowNewCust(false)} style={{ ...mkBtn("ghost"), fontSize: 13 }}>✕</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
                          <select style={{ ...inp, margin: 0, flex: 1, fontSize: 13 }} value={form.customerId} onChange={e => setForm(f => ({ ...f, customerId: e.target.value }))}>
                            <option value="__guest__">👤 Público general</option>
                            {customers.map(c => <option key={c.id} value={c.id}>{c.name}{c.market ? ` · ${c.market}` : ""}</option>)}
                          </select>
                          <button onClick={() => setShowNewCust(true)} style={{ ...mkBtn("ghost"), fontSize: 12, padding: "6px 9px", flexShrink: 0 }}>+ Cliente</button>
                        </div>
                      )}
                      <input type="date" style={{ ...inp, margin: 0, fontSize: 13 }} value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
                    </div>
                    <div style={{ ...card(), padding: "14px" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: C.textFaint, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>Productos seleccionados</div>
                      {form.items.map(it => {
                        const product = products.find(p => p.id === it.productId);
                        if (!product) return null;
                        const stock = getStock(it.productId);
                        const overStock = n(it.qty) > stock && stock > 0;
                        return (
                          <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{product.name}</div>
                              <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                                <input type="number" min="0" step="0.01" value={it.unitPrice} onChange={e => updateItem(it.id, "unitPrice", e.target.value)}
                                  style={{ width: 62, fontSize: 11, border: `1px solid ${C.border}`, borderRadius: 4, padding: "2px 4px", background: C.surface, color: overStock ? C.amber : C.textMid, outline: "none", fontFamily: FONT }} />
                                <span style={{ fontSize: 10, color: overStock ? C.amber : C.textFaint }}>c/u{overStock ? " ⚠" : ""}</span>
                              </div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                              <button onClick={() => updateItem(it.id, "qty", Math.max(0.1, n(it.qty) - 1))} style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, cursor: "pointer", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", color: C.textMid }}>−</button>
                              <span style={{ fontSize: 13, fontWeight: 700, minWidth: 22, textAlign: "center", color: C.brand }}>{n(it.qty)}</span>
                              <button onClick={() => updateItem(it.id, "qty", n(it.qty) + 1)} style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, cursor: "pointer", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", color: C.textMid }}>+</button>
                            </div>
                            <span style={{ fontSize: 13, fontWeight: 800, color: C.red, minWidth: 58, textAlign: "right" }}>{Bs(it.sub ?? it.subtotal)}</span>
                            <button onClick={() => removeItem(it.id)} style={{ background: "none", border: "none", color: C.textFaint, cursor: "pointer", padding: 2 }}><X size={14} /></button>
                          </div>
                        );
                      })}
                      <button onClick={() => setPaso(1)} style={{ ...mkBtn("ghost"), width: "100%", justifyContent: "center", marginTop: 8, fontSize: 12 }}>+ Añadir más productos</button>
                    </div>
                    <div style={{ ...card(), padding: "14px" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: C.textFaint, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>Forma de pago</div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginBottom: 10 }}>
                        {[
                          { v: "efectivo", l: "Efectivo", Icon: Banknote, color: "#10B981" },
                          { v: "transferencia", l: "Banco", Icon: Building2, color: "#22C5FE" },
                          { v: "qr", l: "QR", Icon: QrCode, color: "#F59E0B" },
                          { v: "mixto", l: "Mixto", Icon: CreditCard, color: "#111E7B" },
                        ].map(({ v, l, Icon, color }) => {
                          const active = form.paymentMethod === v;
                          return (
                            <button key={v} onClick={() => setForm(f => ({ ...f, paymentMethod: v }))}
                              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "9px 4px", border: `1.5px solid ${active ? color : C.border}`, borderRadius: 8, cursor: "pointer", background: active ? color + "18" : C.bg, transition: "all 0.13s", fontFamily: FONT }}>
                              <Icon size={16} strokeWidth={active ? 2.2 : 1.8} color={active ? color : C.textFaint} />
                              <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, color: active ? color : C.textMid }}>{l}</span>
                            </button>
                          );
                        })}
                      </div>
                      {form.paymentMethod === "qr" && (
                        config?.qr_url
                          ? <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "10px 0", gap: 6 }}>
                            <img src={config.qr_url} alt="QR de pago" style={{ width: 150, height: 150, objectFit: "contain", borderRadius: 12, border: `1px solid ${C.border}` }} />
                            <div style={{ fontSize: 11, color: C.textFaint }}>Escanea para realizar el pago</div>
                          </div>
                          : <div style={{ padding: "10px 12px", textAlign: "center", fontSize: 11, color: C.textFaint, background: C.bg, borderRadius: 8, border: `1px dashed ${C.border}`, marginTop: 4 }}>
                            Sin imagen QR configurada. Ve a <strong>Ajustes → Configuración del negocio</strong> para subir tu QR.
                          </div>
                      )}
                      <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
                        <span style={{ fontSize: 11, color: C.textMid, fontWeight: 600, flexShrink: 0 }}>Descuento</span>
                        <button onClick={() => setForm(f => ({ ...f, discountType: f.discountType === "pct" ? "fixed" : "pct" }))}
                          style={{ ...mkBtn("ghost"), fontSize: 11, padding: "4px 8px", flexShrink: 0, minWidth: 34 }}>
                          {form.discountType === "pct" ? "%" : getCurrencySymbol()}
                        </button>
                        <input type="number" min="0" step="0.01" value={form.discount} onChange={e => setForm(f => ({ ...f, discount: e.target.value }))}
                          placeholder={form.discountType === "pct" ? `0 %` : `0 ${getCurrencySymbol()}`} style={{ ...inp, margin: 0, flex: 1, fontSize: 12 }} />
                        {discountAmt > 0 && <span style={{ fontSize: 11, color: C.green, fontWeight: 700, flexShrink: 0 }}>−{Bs(discountAmt)}</span>}
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                        <input type="number" min="0" step="0.5" value={form.paid} onChange={e => setForm(f => ({ ...f, paid: e.target.value }))} placeholder={`Monto recibido ${getCurrencySymbol()}`} style={{ ...inp, margin: 0, flex: 1, fontSize: 13, fontWeight: 600 }} />
                        <button onClick={() => setForm(f => ({ ...f, paid: total.toFixed(2) }))} style={{ ...mkBtn("ghost"), fontSize: 12, padding: "8px 12px", flexShrink: 0 }}>Todo</button>
                      </div>
                      {debtN > 0 && <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 10px", background: C.amberBg, borderRadius: R.sm, marginBottom: 8, border: `1px solid ${C.amberMid}` }}>
                        <span style={{ fontSize: 12, color: C.amber, fontWeight: 600 }}>Pendiente:</span>
                        <span style={{ fontSize: 14, fontWeight: 800, color: C.amber }}>{Bs(debtN)}</span>
                      </div>}
                      <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Notas (opcional)…" style={{ ...inp, margin: 0, fontSize: 13 }} />
                    </div>
                  </div>
                  <div style={{ background: "var(--color-bg-surface)", borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
                    <div style={{ padding: "8px 16px 4px" }}>
                      {discountAmt > 0 && (
                        <>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 }}>
                            <span style={{ fontSize: 11, color: C.textFaint }}>Subtotal</span>
                            <span style={{ fontSize: 13, color: C.textMid }}>{Bs(subtotalItems)}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 }}>
                            <span style={{ fontSize: 11, color: C.green }}>Descuento</span>
                            <span style={{ fontSize: 13, color: C.green }}>−{Bs(discountAmt)}</span>
                          </div>
                        </>
                      )}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                        <span style={{ fontSize: 12, color: C.textMid, fontWeight: 500 }}>Total</span>
                        <span style={{ fontSize: 22, fontWeight: 800, color: C.red, letterSpacing: "-0.03em" }}>{Bs(total)}</span>
                      </div>
                    </div>
                    <div style={{ padding: "0 12px 14px" }}>
                      <button onClick={doSave} style={{ width: "100%", padding: "14px", fontSize: 15, fontWeight: 700, background: total > 0 ? C.red : "#ccc", color: "white", border: "none", borderRadius: R.md, cursor: total > 0 ? "pointer" : "not-allowed", letterSpacing: "-0.01em", transition: "background 0.15s" }}
                        onMouseEnter={e => { if (total > 0) e.currentTarget.style.background = C.redHover; }}
                        onMouseLeave={e => { if (total > 0) e.currentTarget.style.background = C.red; }}>
                        {total > 0 ? "✓ Finalizar venta" : "Agrega productos al carrito"}
                      </button>
                    </div>
                  </div>
                </>
              )
            ) : (
              /* ── DESKTOP: Split layout ─────────────────────────────────────── */
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", background: C.sidebar, color: "white", flexShrink: 0 }}>
                  <button onClick={closeModal} style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)", color: "white", borderRadius: R.md, padding: "6px 12px", cursor: "pointer", fontSize: 12, flexShrink: 0 }}>✕ Cancelar</button>
                  <div style={{ flex: 1, fontWeight: 700, fontSize: 15, letterSpacing: "-0.02em" }}>Nueva Venta — POS</div>
                  <div style={{ fontSize: 12, opacity: 0.45 }}>{fDate(form.date)}</div>
                </div>
                {err && <div style={{ background: C.redBg, borderBottom: `1px solid ${C.redMid}`, color: C.red, padding: "7px 18px", fontSize: 13, flexShrink: 0 }}>{err}</div>}
                <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
                  {/* LEFT — Catalog */}
                  <div style={{ flex: "0 0 58%", display: "flex", flexDirection: "column", borderRight: `1px solid ${C.border}`, overflow: "hidden" }}>
                    <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, flexShrink: 0, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <div style={{ position: "relative", flex: 1, minWidth: 120 }}>
                        <Search size={12} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: C.textFaint, pointerEvents: "none" }} />
                        <input value={posSearch} onChange={e => setPosSearch(e.target.value)} placeholder="Buscar producto..." style={{ ...inp, paddingLeft: 28, margin: 0, fontSize: 12 }} />
                      </div>
                      <div style={{ position: "relative", flex: "0 0 140px" }}>
                        <ScanLine size={12} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: C.textFaint, pointerEvents: "none" }} />
                        <input ref={barcodeRef} value={barcodeInput} onChange={e => setBarcodeInput(e.target.value)} onKeyDown={handleBarcode} placeholder="Código barras…" style={{ ...inp, paddingLeft: 28, margin: 0, fontSize: 12 }} />
                      </div>
                      <BarcodeScannerButton onScan={code => { const p = products.find(x => x.barcode === code || x.name.toLowerCase() === code.toLowerCase()); if (p) addProductToCart(p.id); else setErr(`Código "${code}" no encontrado`); }} />
                    </div>
                    <div style={{ padding: "6px 14px", borderBottom: `1px solid ${C.border}`, flexShrink: 0, display: "flex", gap: 4, overflowX: "auto" }}>
                      {posCategories.map(([v, l]) => (
                        <button key={v} onClick={() => setPosCategory(v)} style={{ ...mkBtn(posCategory === v ? "primary" : "subtle"), padding: "3px 9px", fontSize: 11, flexShrink: 0 }}>{l}</button>
                      ))}
                    </div>
                    <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))", gap: 8 }}>
                        {posProducts.length === 0 ? (
                          <div style={{ gridColumn: "1/-1", textAlign: "center", padding: 24, color: C.textFaint, fontSize: 12 }}>Sin productos</div>
                        ) : posProducts.map(product => {
                          const stock = getStock(product.id);
                          const inCart = form.items.find(i => i.productId === product.id);
                          return (
                            <button key={product.id} onClick={() => addProductToCart(product.id)}
                              style={{ ...card({ padding: 0, overflow: "hidden", cursor: "pointer", border: `1.5px solid ${inCart ? C.red : C.border}`, transition: "all 0.12s" }), textAlign: "left", outline: "none" }}
                              onMouseEnter={e => e.currentTarget.style.borderColor = C.red}
                              onMouseLeave={e => e.currentTarget.style.borderColor = inCart ? C.red : C.border}>
                              <div style={{ height: 78, background: `linear-gradient(135deg,${C.blueBg},${C.bg})`, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", position: "relative" }}>
                                {product.img ? <img src={product.img} alt={product.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <BrandLogo size={36} />}
                                {inCart && <div style={{ position: "absolute", top: 4, right: 4, background: C.red, color: "white", borderRadius: "50%", width: 18, height: 18, fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{inCart.qty}</div>}
                                {stock === 0 && <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.52)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "white", fontWeight: 700, letterSpacing: "0.03em" }}>AGOTADO</div>}
                              </div>
                              <div style={{ padding: "5px 7px" }}>
                                <div style={{ fontWeight: 700, fontSize: 10, lineHeight: 1.3, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{product.name}</div>
                                <div style={{ fontSize: 13, fontWeight: 800, color: C.red }}>{Bs(product.price)}</div>
                                {product.minStock > 0 && stock <= product.minStock && stock > 0 && <div style={{ fontSize: 8, color: C.amber }}>⚠ {stock} {product.unit}</div>}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  {/* RIGHT — Cart + payment */}
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
                    <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
                      {showNewCust ? (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <input value={newCustName} onChange={e => setNewCustName(e.target.value)} placeholder="Nombre cliente *" style={{ ...inp, margin: 0, flex: 1, minWidth: 100, fontSize: 12 }} autoFocus />
                          <input value={newCustPhone} onChange={e => setNewCustPhone(e.target.value)} placeholder="Teléfono (opcional)" style={{ ...inp, margin: 0, width: 130, fontSize: 12 }} />
                          <button onClick={doCreateCustomer} style={{ ...mkBtn("primary"), fontSize: 12, padding: "6px 10px" }}>Crear</button>
                          <button onClick={() => setShowNewCust(false)} style={{ ...mkBtn("ghost"), fontSize: 12, padding: "6px 10px" }}>×</button>
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <select style={{ ...inp, margin: 0, flex: 1, fontSize: 12 }} value={form.customerId} onChange={e => setForm(f => ({ ...f, customerId: e.target.value }))}>
                            <option value="__guest__">👤 Público general</option>
                            {customers.map(c => <option key={c.id} value={c.id}>{c.name}{c.market ? ` · ${c.market}` : ""}</option>)}
                          </select>
                          <button onClick={() => setShowNewCust(true)} style={{ ...mkBtn("ghost"), fontSize: 11, padding: "6px 9px", flexShrink: 0 }}>+ Cliente</button>
                          <input type="date" style={{ ...inp, margin: 0, width: 120, fontSize: 11 }} value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
                        </div>
                      )}
                    </div>
                    <div style={{ flex: 1, overflowY: "auto", padding: "8px 14px" }}>
                      {form.items.length === 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: C.textFaint, gap: 8, padding: 24 }}>
                          <span style={{ fontSize: 32 }}>🛒</span>
                          <div style={{ fontSize: 13 }}>Toca un producto para agregar al carrito</div>
                        </div>
                      ) : form.items.map(it => {
                        const product = products.find(p => p.id === it.productId);
                        if (!product) return null;
                        const stock = getStock(it.productId);
                        const overStock = n(it.qty) > stock && stock > 0;
                        return (
                          <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 9px", marginBottom: 5, background: C.bg, borderRadius: R.md, border: `1px solid ${overStock ? C.amber : C.border}` }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{product.name}</div>
                              <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                                <input type="number" min="0" step="0.01" value={it.unitPrice} onChange={e => updateItem(it.id, "unitPrice", e.target.value)}
                                  style={{ width: 58, fontSize: 10, border: `1px solid ${C.border}`, borderRadius: 4, padding: "1px 4px", background: C.surface, color: overStock ? C.amber : C.textMid, outline: "none", fontFamily: FONT }} />
                                <span style={{ fontSize: 10, color: overStock ? C.amber : C.textFaint }}>c/u{overStock ? " ⚠" : ""}</span>
                              </div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
                              <button onClick={() => updateItem(it.id, "qty", Math.max(0.1, n(it.qty) - 1))} style={{ width: 24, height: 24, borderRadius: 5, border: `1px solid ${C.border}`, background: C.surface, cursor: "pointer", fontSize: 14, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", color: C.textMid, flexShrink: 0 }}>−</button>
                              <input type="number" min="0.1" step="0.1" value={it.qty} onChange={e => updateItem(it.id, "qty", e.target.value)} style={{ width: 40, textAlign: "center", border: `1px solid ${C.border}`, borderRadius: 5, padding: "3px 2px", fontSize: 12, fontWeight: 700, background: C.surface, color: C.brand, outline: "none", minHeight: "unset" }} />
                              <button onClick={() => updateItem(it.id, "qty", n(it.qty) + 1)} style={{ width: 24, height: 24, borderRadius: 5, border: `1px solid ${C.border}`, background: C.surface, cursor: "pointer", fontSize: 14, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", color: C.textMid, flexShrink: 0 }}>+</button>
                            </div>
                            <div style={{ fontWeight: 800, fontSize: 13, color: C.red, textAlign: "right", minWidth: 56, flexShrink: 0 }}>{Bs(it.sub ?? it.subtotal)}</div>
                            <button onClick={() => removeItem(it.id)} style={{ background: "none", border: "none", color: C.textFaint, cursor: "pointer", fontSize: 16, padding: 0, lineHeight: 1, flexShrink: 0 }}>×</button>
                          </div>
                        );
                      })}
                      {form.items.length > 0 && <button onClick={addItem} style={{ ...mkBtn("ghost"), width: "100%", justifyContent: "center", marginTop: 4, fontSize: 11 }}>+ Agregar producto manual</button>}
                    </div>
                    <div style={{ padding: "10px 14px", borderTop: `1px solid ${C.border}`, flexShrink: 0, background: C.bg }}>
                      <div style={{ marginBottom: 10 }}>
                        {discountAmt > 0 && (
                          <>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 }}>
                              <span style={{ fontSize: 11, color: C.textFaint }}>Subtotal</span>
                              <span style={{ fontSize: 13, color: C.textMid }}>{Bs(subtotalItems)}</span>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 }}>
                              <span style={{ fontSize: 11, color: C.green }}>Descuento</span>
                              <span style={{ fontSize: 13, color: C.green }}>−{Bs(discountAmt)}</span>
                            </div>
                          </>
                        )}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                          <span style={{ fontSize: 12, color: C.textMid, fontWeight: 500 }}>Total</span>
                          <span style={{ fontSize: 24, fontWeight: 800, color: C.red, letterSpacing: "-0.04em" }}>{Bs(total)}</span>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
                        {[
                          { v: "efectivo", l: "Efectivo", Icon: Banknote, color: "#10B981" },
                          { v: "transferencia", l: "Banco", Icon: Building2, color: "#22C5FE" },
                          { v: "qr", l: "QR", Icon: QrCode, color: "#F59E0B" },
                          { v: "mixto", l: "Mixto", Icon: CreditCard, color: "#111E7B" },
                        ].map(({ v, l, Icon, color }) => {
                          const active = form.paymentMethod === v;
                          return (
                            <button key={v} onClick={() => setForm(f => ({ ...f, paymentMethod: v }))}
                              style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, padding: "6px 4px", border: `1.5px solid ${active ? color : C.border}`, borderRadius: 8, cursor: "pointer", background: active ? color + "18" : C.bg, transition: "all 0.13s", fontFamily: FONT }}>
                              <Icon size={14} strokeWidth={active ? 2.2 : 1.8} color={active ? color : C.textFaint} />
                              <span style={{ fontSize: 9.5, fontWeight: active ? 700 : 500, color: active ? color : C.textMid, lineHeight: 1 }}>{l}</span>
                            </button>
                          );
                        })}
                      </div>
                      {form.paymentMethod === "qr" && (
                        config?.qr_url
                          ? <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "6px 0 8px", gap: 4 }}>
                            <img src={config.qr_url} alt="QR de pago" style={{ width: 120, height: 120, objectFit: "contain", borderRadius: 10, border: `1px solid ${C.border}` }} />
                            <div style={{ fontSize: 10, color: C.textFaint }}>Escanea para pagar</div>
                          </div>
                          : <div style={{ padding: "8px 10px", textAlign: "center", fontSize: 10, color: C.textFaint, background: C.bg, borderRadius: 8, border: `1px dashed ${C.border}`, marginBottom: 4 }}>
                            Sin QR configurado. Ve a Ajustes → Configuración del negocio.
                          </div>
                      )}
                      <div style={{ display: "flex", gap: 5, alignItems: "center", marginBottom: 6 }}>
                        <span style={{ fontSize: 11, color: C.textMid, fontWeight: 600, flexShrink: 0 }}>Descuento</span>
                        <button onClick={() => setForm(f => ({ ...f, discountType: f.discountType === "pct" ? "fixed" : "pct" }))}
                          style={{ ...mkBtn("ghost"), fontSize: 10, padding: "3px 6px", flexShrink: 0, minWidth: 28 }}>
                          {form.discountType === "pct" ? "%" : getCurrencySymbol()}
                        </button>
                        <input type="number" min="0" step="0.01" value={form.discount} onChange={e => setForm(f => ({ ...f, discount: e.target.value }))}
                          placeholder="0" style={{ ...inp, margin: 0, flex: 1, fontSize: 12 }} />
                        {discountAmt > 0 && <span style={{ fontSize: 11, color: C.green, fontWeight: 700, flexShrink: 0 }}>−{Bs(discountAmt)}</span>}
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                        <input type="number" min="0" step="0.5" value={form.paid} onChange={e => setForm(f => ({ ...f, paid: e.target.value }))} placeholder={`Monto recibido ${getCurrencySymbol()}`} style={{ ...inp, margin: 0, flex: 1, fontSize: 13, fontWeight: 600 }} />
                        <button onClick={() => setForm(f => ({ ...f, paid: total.toFixed(2) }))} style={{ ...mkBtn("ghost"), fontSize: 11, padding: "7px 10px", flexShrink: 0 }}>Todo</button>
                      </div>
                      {debtN > 0 && <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 8px", background: C.amberBg, borderRadius: R.sm, marginBottom: 6, border: `1px solid ${C.amberMid}` }}>
                        <span style={{ fontSize: 11, color: C.amber, fontWeight: 500 }}>Pendiente:</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.amber }}>{Bs(debtN)}</span>
                      </div>}
                      <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Notas (opcional)…" style={{ ...inp, margin: "0 0 8px", fontSize: 12 }} />
                      <button onClick={doSave} style={{ width: "100%", padding: "13px", fontSize: 14, fontWeight: 700, background: total > 0 ? C.red : "#ccc", color: "white", border: "none", borderRadius: R.md, cursor: total > 0 ? "pointer" : "not-allowed", letterSpacing: "-0.01em", transition: "background 0.15s" }}
                        onMouseEnter={e => { if (total > 0) e.currentTarget.style.background = C.redHover; }}
                        onMouseLeave={e => { if (total > 0) e.currentTarget.style.background = C.red; }}>
                        {total > 0 ? "✓ Finalizar venta" : "Agrega productos al carrito"}
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {deleteTarget && <Modal title="Eliminar venta" onClose={() => setDeleteTarget(null)} width={420}>
        <div style={{ fontSize: 13, color: C.textMid, marginBottom: 16 }}>Esta acción eliminará la venta y restaurará el stock al inventario.</div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={() => setDeleteTarget(null)} style={mkBtn("ghost")}>Cancelar</button>
          <button onClick={doDeleteSale} style={mkBtn("danger")}>Eliminar</button>
        </div>
      </Modal>}
      {comprobanteVenta && <ComprobanteModal sale={comprobanteVenta} config={config} user={user} products={D.products} onClose={() => setComprobanteVenta(null)} />}
    </div>
  );
}
