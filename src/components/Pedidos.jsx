import { useState, useMemo, useRef } from "react";
import {
  X, Printer, FileText, Plus, Copy, ArrowRight, ShoppingCart, Trash2, Search,
} from "lucide-react";
import { pedidosService } from "../services/pedidosService.js";
import { ventasService } from "../services/ventasService.js";
import { isSupabaseUUID } from "../utils/storageScope.js";
import { n, uid, today, fDate } from "../utils/businessLogic.js";
import { Bs, getCurrencySymbol } from "../currency.js";
import { generateId } from "../empresaScope.js";
import { DEFAULT_CATEGORIES, getCategoryName } from "../categories.js";
import { safeBusinessName, C, R, FONT } from "../theme.jsx";
import { card, mkBtn, mkBadge } from "../styles.js";
import { useIsMobile } from "../hooks/useIsMobile.js";
import { BrandLogo } from "./ui/BrandLogo.jsx";
import { Modal } from "./ui/Modal.jsx";
import { Empty } from "./ui/Empty.jsx";
import { Header } from "./ui/Header.jsx";
import { SearchInput } from "./ui/SearchInput.jsx";

const ESTADOS_COTIZACION = [
  { id: "borrador",  label: "Borrador",  badge: "gray"  },
  { id: "enviada",   label: "Enviada",   badge: "blue"  },
  { id: "aceptada",  label: "Aceptada",  badge: "green" },
  { id: "rechazada", label: "Rechazada", badge: "red"   },
  { id: "vencida",   label: "Vencida",   badge: "amber" },
];
const ESTADOS_PEDIDO = [
  { id: "pendiente",  label: "Pendiente",          badge: "amber" },
  { id: "confirmado", label: "Confirmado",         badge: "blue"  },
  { id: "en_proceso", label: "En proceso",         badge: "blue"  },
  { id: "listo",      label: "Listo para entrega", badge: "green" },
  { id: "entregado",  label: "Entregado",          badge: "green" },
  { id: "cancelado",  label: "Cancelado",          badge: "red"   },
];
const estadosDe = tipo => tipo === "cotizacion" ? ESTADOS_COTIZACION : ESTADOS_PEDIDO;
const estadoMeta = (tipo, id) => estadosDe(tipo).find(e => e.id === id) || { label: id, badge: "gray" };
const codigoDoc = (tipo, numero) => `${tipo === "cotizacion" ? "COT" : "PED"}-${String(numero).padStart(4, "0")}`;

// ── DocumentoModal ────────────────────────────────────────────────────────────
function DocumentoModal({ doc, config, onClose }) {
  const ref = useRef(null);
  const businessName = safeBusinessName(config);
  const esCot = doc.tipo === "cotizacion";
  const titulo = esCot ? "COTIZACIÓN" : "NOTA DE PEDIDO";

  const handlePrint = () => {
    const el = ref.current; if (!el) return;
    const win = window.open("", "_blank", "width=800,height=1040");
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${doc.codigo}</title><style>body{margin:0;font-family:sans-serif;font-size:13px;color:#111827}*{box-sizing:border-box}table{border-collapse:collapse;width:100%}</style></head><body>${el.innerHTML}</body></html>`);
    win.document.close(); win.focus(); win.print(); win.close();
  };

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.62)", zIndex: 260, display: "flex", alignItems: "center", justifyContent: "center", padding: "12px", overflowY: "auto", backdropFilter: "blur(4px)" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--color-bg-surface)", borderRadius: 18, width: "100%", maxWidth: 680, maxHeight: "95vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 32px 80px rgba(0,0,0,0.28)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid var(--color-border)", flexShrink: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "var(--color-text)" }}>{esCot ? "Cotización" : "Pedido"} {doc.codigo}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-mid)", display: "flex", padding: 4 }}><X size={18} strokeWidth={1.8} /></button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", background: "var(--color-bg-primary)", padding: "16px" }}>
          <div ref={ref} style={{ background: "#ffffff", color: "#111827", maxWidth: 640, margin: "0 auto", borderRadius: 8, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.08)" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "28px 28px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {config?.logo_url
                  ? <img src={config.logo_url} alt="logo" style={{ width: 48, height: 48, objectFit: "contain", borderRadius: 8 }} crossOrigin="anonymous" />
                  : <div style={{ width: 48, height: 48, background: "#111E7B", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 800, fontSize: 20 }}>{businessName[0] || "M"}</div>}
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15, lineHeight: 1.2 }}>{businessName}</div>
                  <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.06em" }}>Sistema ERP · Moxi Business</div>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: "#111E7B", letterSpacing: "0.04em" }}>{titulo}</div>
                <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>{doc.codigo}</div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", padding: "0 28px 20px", borderBottom: "1px solid #E5E7EB" }}>
              {[
                ["Cliente", doc.customerName || "Público general"],
                ["Fecha de emisión", fDate(doc.date)],
                [esCot ? "Válida hasta" : "Fecha de entrega", (esCot ? doc.validUntil : doc.deliveryDate) ? fDate(esCot ? doc.validUntil : doc.deliveryDate) : "—"],
              ].map(([lbl, val]) => (
                <div key={lbl} style={{ paddingRight: 16 }}>
                  <div style={{ fontSize: 10, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700, marginBottom: 4 }}>{lbl}</div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{val}</div>
                </div>
              ))}
            </div>
            <div style={{ padding: "0 28px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 20 }}>
                <thead>
                  <tr style={{ background: "#111E7B", color: "white" }}>
                    {[["Descripción", "left"], ["Precio unit.", "right"], ["Cant.", "center"], ["Total", "right"]].map(([h, a]) => (
                      <th key={h} style={{ textAlign: a, fontSize: 10, fontWeight: 700, padding: "10px 12px", textTransform: "uppercase", letterSpacing: "0.07em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(doc.items || []).map((it, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? "#ffffff" : "#F9FAFB" }}>
                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{it.name}</div>
                        {it.unit && <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>{it.unit}</div>}
                      </td>
                      <td style={{ textAlign: "right", fontSize: 12, color: "#374151", padding: "10px 12px" }}>{Bs(it.unitPrice)}</td>
                      <td style={{ textAlign: "center", fontSize: 12, color: "#374151", padding: "10px 12px" }}>{it.qty}</td>
                      <td style={{ textAlign: "right", fontSize: 13, fontWeight: 700, padding: "10px 12px" }}>{Bs(it.sub ?? it.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: "16px 28px 20px", display: "flex", justifyContent: "flex-end" }}>
              <div style={{ width: 280 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0" }}>
                  <span style={{ color: "#6B7280" }}>Subtotal</span><span style={{ fontWeight: 600 }}>{Bs(doc.subtotal)}</span>
                </div>
                {n(doc.discount) > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0" }}>
                  <span style={{ color: "#6B7280" }}>Descuento</span><span style={{ fontWeight: 600, color: "#EF4444" }}>-{Bs(doc.discount)}</span>
                </div>}
                {n(doc.taxAmount) > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0" }}>
                  <span style={{ color: "#6B7280" }}>Impuesto ({n(doc.tax)}%)</span><span style={{ fontWeight: 600 }}>{Bs(doc.taxAmount)}</span>
                </div>}
                <div style={{ display: "flex", justifyContent: "space-between", background: "#111E7B", color: "white", padding: "10px 14px", borderRadius: 8, marginTop: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.04em" }}>Total</span>
                  <span style={{ fontWeight: 800, fontSize: 16 }}>{Bs(doc.total)}</span>
                </div>
              </div>
            </div>
            {(doc.paymentTerms || doc.notes) && <div style={{ padding: "0 28px 20px", borderTop: "1px solid #E5E7EB", paddingTop: 14 }}>
              {doc.paymentTerms && <div style={{ fontSize: 12, color: "#374151", marginBottom: 6 }}><strong>Condiciones de pago:</strong> {doc.paymentTerms}</div>}
              {doc.notes && <div style={{ fontSize: 12, color: "#6B7280", fontStyle: "italic" }}>{doc.notes}</div>}
            </div>}
            <div style={{ background: "#F9FAFB", padding: "14px 28px", fontSize: 11, color: "#6B7280", borderTop: "1px solid #E5E7EB" }}>
              <div style={{ fontWeight: 700, color: "#374151" }}>{businessName}</div>
              {config?.telefono && <div>Tel: {config.telefono}</div>}
              <div style={{ marginTop: 4, fontSize: 10, color: "#9CA3AF" }}>
                {esCot ? "Este documento es una cotización y no constituye una factura." : "Documento de pedido generado por Moxi Business ERP."}
              </div>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, padding: "14px 16px", borderTop: "1px solid var(--color-border)", flexShrink: 0 }}>
          <button onClick={onClose} style={mkBtn("ghost")}>Cerrar</button>
          <div style={{ flex: 1 }} />
          <button onClick={handlePrint} style={{ ...mkBtn("primary"), display: "flex", alignItems: "center", gap: 6 }}><Printer size={14} /> Imprimir / PDF</button>
        </div>
      </div>
    </div>
  );
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  PEDIDOS Y COTIZACIONES                                             ║
// ╚══════════════════════════════════════════════════════════════════════╝
export function Pedidos({ D, save, user, config, logAction, onRefreshDashboard }) {
  const { pedidos = [], customers = [], products = [], inventory = [], categories = [] } = D;
  const isMobile = useIsMobile();
  const GUEST = { id: "__guest__", name: "Público general", market: "", phone: "" };
  const categoryOptions = categories.length ? categories : DEFAULT_CATEGORIES;

  const [vista, setVista] = useState("cotizacion");
  const [q, setQ] = useState("");
  const [estadoFilter, setEstadoFilter] = useState("all");
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [printDoc, setPrintDoc] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [err, setErr] = useState("");
  const [feedback, setFeedback] = useState("");
  const [posSearch, setPosSearch] = useState("");
  const [posCategory, setPosCategory] = useState("all");

  const inp = { width: "100%", padding: "8px 10px", borderRadius: R.md, border: `1px solid ${C.border}`, background: "var(--color-bg-primary)", color: C.text, fontSize: 13, fontFamily: FONT, outline: "none" };
  const lbl = { fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 4, display: "block", textTransform: "uppercase", letterSpacing: "0.04em" };

  const FORM_RESET = (tipo = "cotizacion") => ({
    tipo, estado: tipo === "cotizacion" ? "borrador" : "pendiente",
    customerId: "__guest__", date: today(), validUntil: "", deliveryDate: "",
    items: [],
    discount: "", discountType: "pct", tax: "", notes: "", paymentTerms: "",
  });
  const [form, setForm] = useState(FORM_RESET());

  const flash = msg => { setFeedback(msg); setTimeout(() => setFeedback(""), 4000); };
  const nextNumero = tipo => pedidos.filter(p => p.tipo === tipo).reduce((m, p) => Math.max(m, n(p.numero)), 0) + 1;

  const updateItem = (id, field, val) => setForm(f => ({
    ...f, items: f.items.map(it => {
      if (it.id !== id) return it;
      const u = { ...it, [field]: val };
      if (field === "productId") { const p = products.find(x => x.id === val); if (p) u.unitPrice = p.price; }
      return u;
    })
  }));
  const removeItem = id => setForm(f => ({ ...f, items: f.items.filter(i => i.id !== id) }));
  const addProductToCart = productId => setForm(f => {
    const product = products.find(p => p.id === productId); if (!product) return f;
    const existing = f.items.find(i => i.productId === productId);
    if (existing) return { ...f, items: f.items.map(i => i.id === existing.id ? { ...i, qty: n(i.qty) + 1 } : i) };
    return { ...f, items: [...f.items, { id: uid(), productId, qty: 1, unitPrice: product.price }] };
  });
  const posCategories = [["all", "Todos"], ...categoryOptions.map(c => [c.id, c.name])];
  const posProducts = products.filter(p => (posCategory === "all" || p.cat === posCategory) && `${p.name} ${getCategoryName(categoryOptions, p.cat)}`.toLowerCase().includes(posSearch.toLowerCase()));

  const subtotal = form.items.reduce((a, i) => a + n(i.qty) * n(i.unitPrice), 0);
  const discountAmt = form.discountType === "pct" ? subtotal * Math.min(n(form.discount), 100) / 100 : Math.min(n(form.discount), subtotal);
  const taxAmount = Math.max(0, subtotal - discountAmt) * Math.max(0, n(form.tax)) / 100;
  const total = Math.max(0, subtotal - discountAmt + taxAmount);

  const openNew = tipo => { setEditing(null); setForm(FORM_RESET(tipo)); setErr(""); setPosSearch(""); setPosCategory("all"); setModal(true); };
  const openEdit = doc => {
    setEditing(doc);
    setForm({
      tipo: doc.tipo, estado: doc.estado, customerId: doc.customerId || "__guest__",
      date: (doc.date || today()).slice(0, 10), validUntil: (doc.validUntil || "").slice(0, 10), deliveryDate: (doc.deliveryDate || "").slice(0, 10),
      items: (doc.items || []).map(it => ({ id: it.id || uid(), productId: it.productId, qty: it.qty, unitPrice: it.unitPrice })),
      discount: doc.discountType === "pct" ? (doc.discount && subtotalOf(doc) ? Math.round(doc.discount / subtotalOf(doc) * 100) : doc.discount) : doc.discount,
      discountType: doc.discountType || "pct", tax: doc.tax || "", notes: doc.notes || "", paymentTerms: doc.paymentTerms || "",
    });
    setErr(""); setModal(true);
  };
  const closeForm = () => { setModal(false); setEditing(null); setForm(FORM_RESET(vista)); setErr(""); setPosSearch(""); setPosCategory("all"); };

  function subtotalOf(doc) { return (doc.items || []).reduce((a, i) => a + n(i.sub ?? i.subtotal ?? (n(i.qty) * n(i.unitPrice))), 0); }

  const doSave = async () => {
    setErr("");
    const valid = form.items.filter(i => i.productId && n(i.qty) > 0);
    if (!valid.length) { setErr("Agrega al menos un producto con cantidad."); return; }
    const cust = form.customerId === "__guest__" ? GUEST : customers.find(c => c.id === form.customerId);
    if (!cust) { setErr("Selecciona un cliente válido."); return; }
    const items = valid.map(it => { const p = products.find(x => x.id === it.productId); const sub = n(it.qty) * n(it.unitPrice); return { id: it.id, productId: it.productId, name: p?.name || "", unit: p?.unit || "", qty: n(it.qty), unitPrice: n(it.unitPrice), sub, subtotal: sub }; });
    const isEdit = Boolean(editing);
    const numero = isEdit ? editing.numero : nextNumero(form.tipo);
    const doc = {
      id: isEdit ? editing.id : generateId(),
      numero, codigo: codigoDoc(form.tipo, numero),
      tipo: form.tipo, estado: form.estado,
      customerId: form.customerId, customerName: cust.name, customerMarket: cust.market || "", customerPhone: cust.phone || "",
      date: form.date, validUntil: form.tipo === "cotizacion" ? (form.validUntil || null) : null,
      deliveryDate: form.tipo === "pedido" ? (form.deliveryDate || null) : null,
      items, subtotal, discount: discountAmt, discountType: form.discountType,
      tax: n(form.tax), taxAmount, total,
      notes: form.notes, paymentTerms: form.paymentTerms,
      convertedToSaleId: editing?.convertedToSaleId || null,
      convertedFromQuoteId: editing?.convertedFromQuoteId || null,
      createdAt: editing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      empresa_id: user.empresa_id,
    };
    let result;
    try {
      result = isEdit
        ? await pedidosService.updatePedido(doc.id, doc, user?.empresa_id)
        : await pedidosService.createPedido(doc, user);
    } catch (e) { console.warn("Pedido Supabase error:", e.message); }
    if (result?._localOnly && isSupabaseUUID(user?.empresa_id)) {
      setErr("⚠ Error Supabase al guardar. No se guardó — revisa tu conexión e intenta de nuevo.");
      return;
    }
    save("pedidos", isEdit ? pedidos.map(p => p.id === doc.id ? doc : p) : [doc, ...pedidos]);
    logAction?.(`${user.name} ${isEdit ? "actualizó" : "creó"} ${form.tipo === "cotizacion" ? "la cotización" : "el pedido"} ${doc.codigo}`);
    setVista(form.tipo);
    closeForm();
    flash(`${form.tipo === "cotizacion" ? "Cotización" : "Pedido"} ${doc.codigo} guardado correctamente.`);
  };

  const changeEstado = async (doc, estado) => {
    const prev = pedidos;
    const updated = { ...doc, estado, updatedAt: new Date().toISOString() };
    save("pedidos", pedidos.map(p => p.id === doc.id ? updated : p));
    let result;
    try { result = await pedidosService.updatePedido(doc.id, { estado, updatedAt: updated.updatedAt }, user?.empresa_id); }
    catch (e) { console.warn("Pedido estado Supabase error:", e.message); }
    if (result?._localOnly && isSupabaseUUID(user?.empresa_id)) {
      save("pedidos", prev);
      setErr("⚠ Error Supabase al cambiar el estado. Se revirtió — revisa tu conexión e intenta de nuevo.");
      return;
    }
    logAction?.(`${user.name} cambió ${doc.codigo} a "${estadoMeta(doc.tipo, estado).label}"`);
  };

  const convertToPedido = async doc => {
    const numero = nextNumero("pedido");
    const nuevo = { ...doc, id: generateId(), numero, codigo: codigoDoc("pedido", numero), tipo: "pedido", estado: "pendiente", validUntil: null, deliveryDate: today(), convertedFromQuoteId: doc.id, convertedToSaleId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const quoteUpd = { ...doc, estado: "aceptada", updatedAt: new Date().toISOString() };
    let created;
    try { created = await pedidosService.createPedido(nuevo, user); }
    catch (e) { console.warn("convertToPedido Supabase error:", e.message); }
    if (created?._localOnly && isSupabaseUUID(user?.empresa_id)) {
      setErr("⚠ Error Supabase al crear el pedido. No se guardó — revisa tu conexión e intenta de nuevo.");
      return;
    }
    save("pedidos", [nuevo, ...pedidos.map(p => p.id === doc.id ? quoteUpd : p)]);
    const estadoRes = await pedidosService.updatePedido(doc.id, { estado: "aceptada" }, user?.empresa_id).catch(e => { console.warn("convertToPedido estado Supabase error:", e.message); return null; });
    if (estadoRes?._localOnly && isSupabaseUUID(user?.empresa_id)) {
      flash(`Pedido ${nuevo.codigo} creado, pero no se pudo marcar la cotización como aceptada en Supabase (revisa tu conexión).`);
    } else {
      flash(`Cotización convertida en el pedido ${nuevo.codigo}.`);
    }
    logAction?.(`${user.name} convirtió la cotización ${doc.codigo} en el pedido ${nuevo.codigo}`);
    setVista("pedido");
  };

  const convertToVenta = async doc => {
    if (doc.convertedToSaleId) { setErr("Este pedido ya fue registrado como venta."); return; }
    const prodMap = {};
    doc.items.forEach(it => { prodMap[it.productId] = (prodMap[it.productId] || 0) + n(it.qty); });
    const newInv = inventory.map(i => { const qty = prodMap[i.productId]; return qty ? { ...i, stock: Math.max(0, i.stock - qty) } : i; });
    const sale = {
      id: generateId(), numero: Date.now(),
      customerId: doc.customerId, customerName: doc.customerName, customerMarket: doc.customerMarket || "",
      date: new Date().toISOString(),
      items: doc.items.map(it => ({ ...it, image: null, original_price: it.unitPrice, sale_price: it.unitPrice, sub: it.sub ?? it.subtotal, subtotal: it.sub ?? it.subtotal })),
      subtotal: doc.subtotal, discount: doc.discount, discountType: doc.discountType,
      total: doc.total, paid: 0, debt: doc.total, notes: doc.notes || `Pedido ${doc.codigo}`, paymentMethod: "efectivo", payments: [],
      createdAt: new Date().toISOString(), empresa_id: user.empresa_id,
    };
    setErr("");
    let nueva;
    try { nueva = await ventasService.createVenta(sale, user); }
    catch (e) { console.warn("convertToVenta Supabase error:", e.message); }
    if (nueva?._localOnly && isSupabaseUUID(user?.empresa_id)) {
      setErr("⚠ Error Supabase al registrar la venta. No se descontó stock ni se marcó el pedido — revisa tu conexión e intenta de nuevo.");
      return;
    }
    const ventaFinal = nueva?.id ? { ...sale, id: nueva.id } : sale;
    save("sales", [ventaFinal, ...(D.sales || [])]);
    save("inventory", newInv);
    const updated = { ...doc, estado: "entregado", convertedToSaleId: ventaFinal.id, updatedAt: new Date().toISOString() };
    save("pedidos", pedidos.map(p => p.id === doc.id ? updated : p));
    const pedidoRes = await pedidosService.updatePedido(doc.id, { estado: "entregado", convertedToSaleId: ventaFinal.id }, user?.empresa_id)
      .catch(e => { console.warn("convertToVenta pedido estado Supabase error:", e.message); return null; });
    logAction?.(`${user.name} registró la venta del pedido ${doc.codigo} por ${Bs(doc.total)}`);
    onRefreshDashboard?.();
    if (pedidoRes?._localOnly && isSupabaseUUID(user?.empresa_id)) {
      flash(`Venta del pedido ${doc.codigo} registrada, pero no se pudo marcar el pedido como convertido en Supabase. No lo conviertas de nuevo — revisa tu conexión y recarga.`);
    } else {
      flash(`Pedido ${doc.codigo} registrado como venta. Stock descontado.`);
    }
  };

  const duplicate = async doc => {
    const numero = nextNumero(doc.tipo);
    const nuevo = { ...doc, id: generateId(), numero, codigo: codigoDoc(doc.tipo, numero), estado: doc.tipo === "cotizacion" ? "borrador" : "pendiente", convertedToSaleId: null, convertedFromQuoteId: null, date: today(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    let created;
    try { created = await pedidosService.createPedido(nuevo, user); }
    catch (e) { console.warn("duplicate pedido Supabase error:", e.message); }
    if (created?._localOnly && isSupabaseUUID(user?.empresa_id)) {
      setErr("⚠ Error Supabase al duplicar. No se guardó — revisa tu conexión e intenta de nuevo.");
      return;
    }
    save("pedidos", [nuevo, ...pedidos]);
    flash(`Documento duplicado como ${nuevo.codigo}.`);
  };

  const doDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget; const prev = pedidos;
    save("pedidos", pedidos.filter(p => p.id !== target.id));
    setDeleteTarget(null);
    const res = await pedidosService.deletePedido(target.id, user?.empresa_id);
    if (res && res.ok === false) { save("pedidos", prev); setErr("No se pudo eliminar en Supabase. Se restauró el documento."); return; }
    logAction?.(`${user.name} eliminó ${target.tipo === "cotizacion" ? "la cotización" : "el pedido"} ${target.codigo}`);
    flash("Documento eliminado.");
  };

  const stats = useMemo(() => {
    const cots = pedidos.filter(p => p.tipo === "cotizacion");
    const peds = pedidos.filter(p => p.tipo === "pedido");
    const pend = peds.filter(p => !["entregado", "cancelado"].includes(p.estado));
    const aceptadas = cots.filter(p => p.estado === "aceptada").length;
    return { nCots: cots.length, nPedPend: pend.length, valorPend: pend.reduce((a, p) => a + n(p.total), 0), tasaConv: cots.length ? Math.round(aceptadas / cots.length * 100) : 0 };
  }, [pedidos]);

  const lista = useMemo(() => pedidos
    .filter(p => p.tipo === vista)
    .filter(p => estadoFilter === "all" || p.estado === estadoFilter)
    .filter(p => `${p.codigo} ${p.customerName}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
  , [pedidos, vista, estadoFilter, q]);

  const StatCard = ({ label, value, sub, color }) => (
    <div style={card({ flex: 1, minWidth: 140 })}>
      <div style={{ fontSize: 11, color: C.textMid, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: color || C.text, marginTop: 4, letterSpacing: "-0.02em" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.textFaint, marginTop: 2 }}>{sub}</div>}
    </div>
  );

  return (
    <div>
      <Header
        title="Pedidos y Cotizaciones"
        sub={`${stats.nCots} cotizaciones · ${stats.nPedPend} pedidos en curso`}
        action={<>
          <button onClick={() => openNew("cotizacion")} style={{ ...mkBtn("ghost"), fontSize: 13 }}><FileText size={14} /> Nueva cotización</button>
          <button onClick={() => openNew("pedido")} style={{ ...mkBtn("primary"), fontSize: 13 }}><Plus size={14} /> Nuevo pedido</button>
        </>}
      />

      {feedback && <div style={{ ...card({ marginBottom: 12, borderLeft: `3px solid ${C.green}` }), color: C.green, fontWeight: 600 }}>{feedback}</div>}
      {err && !modal && <div style={{ ...card({ marginBottom: 12, borderLeft: `3px solid ${C.red}` }), color: C.red, fontWeight: 600 }}>{err}</div>}

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <StatCard label="Cotizaciones" value={stats.nCots} color={C.brand} />
        <StatCard label="Pedidos en curso" value={stats.nPedPend} color={C.amber} />
        <StatCard label="Valor pedidos activos" value={Bs(stats.valorPend)} color={C.green} />
        <StatCard label="Tasa de conversión" value={`${stats.tasaConv}%`} sub="cotizaciones aceptadas" color={C.blue} />
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 14, borderBottom: `1px solid ${C.border}` }}>
        {[["cotizacion", "Cotizaciones"], ["pedido", "Pedidos"]].map(([id, label]) => (
          <button key={id} onClick={() => { setVista(id); setEstadoFilter("all"); }}
            style={{ background: "none", border: "none", cursor: "pointer", padding: "8px 14px", fontSize: 13, fontWeight: 600, fontFamily: FONT, color: vista === id ? C.brand : C.textMid, borderBottom: vista === id ? `2px solid ${C.brand}` : "2px solid transparent", marginBottom: -1 }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ flex: 1, minWidth: 180 }}><SearchInput value={q} onChange={setQ} placeholder="Buscar por código o cliente..." /></div>
        <select value={estadoFilter} onChange={e => setEstadoFilter(e.target.value)} style={{ ...inp, width: "auto", cursor: "pointer" }}>
          <option value="all">Todos los estados</option>
          {estadosDe(vista).map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
        </select>
      </div>

      {lista.length === 0 ? (
        <Empty icon={vista === "cotizacion" ? "📄" : "📦"} title={`Sin ${vista === "cotizacion" ? "cotizaciones" : "pedidos"}`} sub="Crea uno con los botones de arriba." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {lista.map(doc => {
            const em = estadoMeta(doc.tipo, doc.estado);
            return (
              <div key={doc.id} style={card({ padding: "14px 16px" })}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{doc.codigo}</span>
                      <span style={mkBadge(em.badge)}>{em.label}</span>
                      {doc.convertedToSaleId && <span style={mkBadge("green")}>Venta registrada</span>}
                    </div>
                    <div style={{ fontSize: 13, color: C.textMid, marginTop: 3 }}>{doc.customerName || "Público general"}</div>
                    <div style={{ fontSize: 11, color: C.textFaint, marginTop: 2 }}>
                      Emitido {fDate(doc.date)}{doc.tipo === "cotizacion" && doc.validUntil ? ` · vence ${fDate(doc.validUntil)}` : ""}{doc.tipo === "pedido" && doc.deliveryDate ? ` · entrega ${fDate(doc.deliveryDate)}` : ""} · {(doc.items || []).length} ítems
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: C.text, letterSpacing: "-0.02em" }}>{Bs(doc.total)}</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12, alignItems: "center" }}>
                  <select value={doc.estado} onChange={e => changeEstado(doc, e.target.value)} title="Cambiar estado"
                    style={{ ...inp, width: "auto", padding: "5px 8px", fontSize: 12, cursor: "pointer" }}>
                    {estadosDe(doc.tipo).map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
                  </select>
                  <button onClick={() => setPrintDoc(doc)} style={{ ...mkBtn("subtle"), padding: "5px 10px", fontSize: 12 }}><Printer size={13} /> Imprimir</button>
                  <button onClick={() => openEdit(doc)} style={{ ...mkBtn("subtle"), padding: "5px 10px", fontSize: 12 }}>Editar</button>
                  <button onClick={() => duplicate(doc)} style={{ ...mkBtn("subtle"), padding: "5px 10px", fontSize: 12 }}><Copy size={13} /> Duplicar</button>
                  {doc.tipo === "cotizacion"
                    ? <button onClick={() => convertToPedido(doc)} style={{ ...mkBtn("primary"), padding: "5px 10px", fontSize: 12 }}><ArrowRight size={13} /> Convertir a pedido</button>
                    : !doc.convertedToSaleId && <button onClick={() => convertToVenta(doc)} style={{ ...mkBtn("success"), padding: "5px 10px", fontSize: 12 }}><ShoppingCart size={13} /> Registrar venta</button>}
                  <button onClick={() => setDeleteTarget(doc)} style={{ ...mkBtn("danger"), padding: "5px 10px", fontSize: 12 }}><Trash2 size={13} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && <Modal title={`${editing ? "Editar" : "Nueva"} ${form.tipo === "cotizacion" ? "cotización" : "pedido"}`} onClose={closeForm} width={640}>
        {err && <div style={{ fontSize: 12.5, color: C.red, marginBottom: 12, padding: "8px 10px", background: C.redBg, borderRadius: R.md }}>{err}</div>}

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div>
            <label style={lbl}>Tipo de documento</label>
            <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value, estado: e.target.value === "cotizacion" ? "borrador" : "pendiente" }))} style={{ ...inp, cursor: "pointer" }} disabled={Boolean(editing)}>
              <option value="cotizacion">Cotización</option>
              <option value="pedido">Pedido</option>
            </select>
          </div>
          <div>
            <label style={lbl}>Estado</label>
            <select value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value }))} style={{ ...inp, cursor: "pointer" }}>
              {estadosDe(form.tipo).map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Cliente</label>
            <select value={form.customerId} onChange={e => setForm(f => ({ ...f, customerId: e.target.value }))} style={{ ...inp, cursor: "pointer" }}>
              <option value="__guest__">Público general</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Fecha de emisión</label>
            <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={inp} />
          </div>
          {form.tipo === "cotizacion"
            ? <div><label style={lbl}>Válida hasta</label><input type="date" value={form.validUntil} onChange={e => setForm(f => ({ ...f, validUntil: e.target.value }))} style={inp} /></div>
            : <div><label style={lbl}>Fecha de entrega</label><input type="date" value={form.deliveryDate} onChange={e => setForm(f => ({ ...f, deliveryDate: e.target.value }))} style={inp} /></div>}
        </div>

        <label style={lbl}>Productos {form.items.length > 0 && <span style={{ color: C.brand }}>· {form.items.length} en el carrito</span>}</label>
        <div style={{ border: `1px solid ${C.border}`, borderRadius: R.lg, padding: 10, marginBottom: 10, background: "var(--color-bg-primary)" }}>
          <div style={{ position: "relative", marginBottom: 8 }}>
            <Search size={14} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: C.textFaint }} />
            <input value={posSearch} onChange={e => setPosSearch(e.target.value)} placeholder="Buscar producto..." style={{ ...inp, paddingLeft: 28 }} />
          </div>
          <div style={{ display: "flex", gap: 5, overflowX: "auto", marginBottom: 8, paddingBottom: 2 }}>
            {posCategories.map(([v, l]) => (
              <button key={v} type="button" onClick={() => setPosCategory(v)} style={{ ...mkBtn(posCategory === v ? "primary" : "subtle"), padding: "4px 10px", fontSize: 11, flexShrink: 0 }}>{l}</button>
            ))}
          </div>
          <div style={{ maxHeight: 240, overflowY: "auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(3,1fr)", gap: 8 }}>
              {posProducts.length === 0 ? (
                <div style={{ gridColumn: "1/-1", textAlign: "center", padding: 20, color: C.textFaint, fontSize: 12 }}>Sin productos</div>
              ) : posProducts.map(product => {
                const inCart = form.items.find(i => i.productId === product.id);
                return (
                  <button key={product.id} type="button" onClick={() => addProductToCart(product.id)}
                    style={{ ...card({ padding: 0, overflow: "hidden", cursor: "pointer" }), border: `1.5px solid ${inCart ? C.brand : C.border}`, textAlign: "left", outline: "none", transition: "border-color 0.12s" }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = C.brand}
                    onMouseLeave={e => e.currentTarget.style.borderColor = inCart ? C.brand : C.border}>
                    <div style={{ height: 70, background: `linear-gradient(135deg,${C.blueBg},${C.bg})`, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", position: "relative" }}>
                      {product.img ? <img src={product.img} alt={product.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <BrandLogo size={28} />}
                      {inCart && <div style={{ position: "absolute", top: 4, right: 4, background: C.brand, color: "white", borderRadius: "50%", width: 20, height: 20, fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{inCart.qty}</div>}
                    </div>
                    <div style={{ padding: "6px 8px" }}>
                      <div style={{ fontWeight: 600, fontSize: 12, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{product.name}</div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: C.brand, marginTop: 2 }}>{Bs(product.price)}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {form.items.length > 0
          ? <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
            {form.items.map(it => {
              const p = products.find(x => x.id === it.productId);
              return (
                <div key={it.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 8px", borderRadius: R.md, background: "var(--color-bg-primary)" }}>
                  <div style={{ width: 34, height: 34, borderRadius: 6, overflow: "hidden", flexShrink: 0, background: C.blueBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {p?.img ? <img src={p.img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <BrandLogo size={18} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p?.name || "Producto"}</div>
                    <div style={{ fontSize: 11, color: C.textFaint }}>{Bs(n(it.qty) * n(it.unitPrice))}</div>
                  </div>
                  <input type="number" min="0" value={it.qty} onChange={e => updateItem(it.id, "qty", e.target.value)} title="Cantidad" style={{ ...inp, width: 58, padding: "5px 6px" }} />
                  <input type="number" min="0" step="0.01" value={it.unitPrice} onChange={e => updateItem(it.id, "unitPrice", e.target.value)} title="Precio unitario" style={{ ...inp, width: 84, padding: "5px 6px" }} />
                  <button onClick={() => removeItem(it.id)} style={{ background: "none", border: "none", cursor: "pointer", color: C.red, display: "flex", padding: 4 }}><Trash2 size={15} /></button>
                </div>
              );
            })}
          </div>
          : <div style={{ fontSize: 12, color: C.textFaint, marginBottom: 14, textAlign: "center", padding: "8px" }}>Toca un producto para agregarlo al {form.tipo === "cotizacion" ? "presupuesto" : "pedido"}.</div>}

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div>
            <label style={lbl}>Descuento</label>
            <div style={{ display: "flex", gap: 4 }}>
              <input type="number" min="0" value={form.discount} onChange={e => setForm(f => ({ ...f, discount: e.target.value }))} placeholder="0" style={{ ...inp, flex: 1 }} />
              <select value={form.discountType} onChange={e => setForm(f => ({ ...f, discountType: e.target.value }))} style={{ ...inp, width: 64, cursor: "pointer", padding: "8px 4px" }}>
                <option value="pct">%</option>
                <option value="amount">{getCurrencySymbol()}</option>
              </select>
            </div>
          </div>
          <div>
            <label style={lbl}>Impuesto (%)</label>
            <input type="number" min="0" value={form.tax} onChange={e => setForm(f => ({ ...f, tax: e.target.value }))} placeholder="0" style={inp} />
          </div>
          <div>
            <label style={lbl}>Condiciones de pago</label>
            <input value={form.paymentTerms} onChange={e => setForm(f => ({ ...f, paymentTerms: e.target.value }))} placeholder="Ej: 50% anticipo" style={inp} />
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={lbl}>Notas / observaciones</label>
          <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Detalles adicionales…" style={{ ...inp, resize: "vertical" }} />
        </div>

        <div style={{ background: "var(--color-bg-primary)", borderRadius: R.lg, padding: "12px 14px", marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "3px 0" }}><span style={{ color: C.textMid }}>Subtotal</span><span style={{ fontWeight: 600 }}>{Bs(subtotal)}</span></div>
          {discountAmt > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "3px 0" }}><span style={{ color: C.textMid }}>Descuento</span><span style={{ fontWeight: 600, color: C.red }}>-{Bs(discountAmt)}</span></div>}
          {taxAmount > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "3px 0" }}><span style={{ color: C.textMid }}>Impuesto ({n(form.tax)}%)</span><span style={{ fontWeight: 600 }}>{Bs(taxAmount)}</span></div>}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 800, marginTop: 6, paddingTop: 8, borderTop: `1px solid ${C.border}` }}><span>Total</span><span style={{ color: C.brand }}>{Bs(total)}</span></div>
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={closeForm} style={mkBtn("ghost")}>Cancelar</button>
          <button onClick={doSave} style={mkBtn("primary")}>{editing ? "Guardar cambios" : `Crear ${form.tipo === "cotizacion" ? "cotización" : "pedido"}`}</button>
        </div>
      </Modal>}

      {deleteTarget && <Modal title="Eliminar documento" onClose={() => setDeleteTarget(null)} width={420}>
        <div style={{ fontSize: 13, color: C.textMid, marginBottom: 16 }}>Se eliminará <strong style={{ color: C.text }}>{deleteTarget.codigo}</strong> de {deleteTarget.customerName || "Público general"}. Esta acción no se puede deshacer.</div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={() => setDeleteTarget(null)} style={mkBtn("ghost")}>Cancelar</button>
          <button onClick={doDelete} style={mkBtn("danger")}>Eliminar</button>
        </div>
      </Modal>}

      {printDoc && <DocumentoModal doc={printDoc} config={config} onClose={() => setPrintDoc(null)} />}
    </div>
  );
}
