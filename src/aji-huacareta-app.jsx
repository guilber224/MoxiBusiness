import { useState, useEffect, useRef, useMemo, useCallback, createContext, useContext } from "react";
import { AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { supabase, createClient as _createSupabaseClient, SUPABASE_URL as _SUPABASE_URL, SUPABASE_ANON_KEY as _SUPABASE_ANON_KEY } from './lib/supabaseClient';
import { ventasService } from "./services/ventasService.js";
import { authService } from "./services/authService.js";
import { userService } from "./services/userService.js";
import { productosService } from "./services/productosService.js";
import { clientesService } from "./services/clientesService.js";
import { inventarioService } from "./services/inventarioService.js";
import { gastosService } from "./services/gastosService.js";
import { movimientosService } from "./services/movimientosService.js";
import { pedidosService } from "./services/pedidosService.js";
import { analyticsService } from "./services/analyticsService.js";
import { getScopedStorageKey, getLastEmpresaId, saveLastEmpresaId, migrateLegacyStorageIfNeeded, isSupabaseUUID } from "./utils/storageScope.js";
import {
  n, uid, pct, today, fDate, fShort, fDateTime, isAdmin, isSupabaseUser,
  VALID_ROLES, normalizeRole, normalizeSaleItem, normalizeSales, normalizeUsers, normalizeCustomers,
  mergeById, getPeriodStart, isWithinPeriod, filterByPeriod, getSalePayments, buildCashChart,
  restoreInventoryFromSale, reverseProductionInventory, buildChart,
} from "./utils/businessLogic.js";
import {
  LayoutDashboard, Users, ShoppingCart, CreditCard, Package, Archive,
  Factory, Truck, Wallet, BarChart2, Download, Shield, LogOut, Menu,
  ChevronLeft, ChevronRight, Bell, Settings, Search, Sun, Moon, X,
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Home, MoreHorizontal,
  Banknote, Building2, QrCode, Printer, ScanLine, Upload, ImageIcon, Camera,
  ClipboardList, FileText, Plus, Trash2, Copy, ArrowRight,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import toast, { Toaster } from "react-hot-toast";
import { CURRENCIES, getCurrencySymbol, applyCurrencyCode, resetCurrency, formatCurrency, Bs } from "./currency.js";
import { getCurrentEmpresaId, setCurrentEmpresaId, isSupabaseScope, generateId } from "./empresaScope.js";
import { xlsx } from "./utils/xlsxExport.js";
import {
  DEFAULT_CATEGORY_ID, CATEGORY_NAME_FALLBACKS, DEFAULT_CATEGORIES,
  slugifyId, prettifyCategoryId, buildCategoryMap, getCategoryName, ensureCategories, sanitizeProducts,
} from "./categories.js";
import { Clientes } from "./components/Clientes.jsx";
import { Productos } from "./components/Productos.jsx";
import { Inventario } from "./components/Inventario.jsx";
import { DashboardPremium } from "./components/DashboardPremium.jsx";
import { BRAND_NAME, BRAND_SUBTITLE, C, R, FONT, SECTORS_COLORS, ThemeProvider, useTheme, safeBusinessName } from "./theme.jsx";
import { card, lbl, inp, row, mkBtn, mkBadge } from "./styles.js";
import { useIsMobile } from "./hooks/useIsMobile.js";
import { Modal } from "./components/ui/Modal.jsx";
import { Empty } from "./components/ui/Empty.jsx";
import { Header } from "./components/ui/Header.jsx";
import { Chip } from "./components/ui/Chip.jsx";
import { KPI } from "./components/ui/KPI.jsx";
import { Table } from "./components/ui/Table.jsx";
import { SearchInput } from "./components/ui/SearchInput.jsx";
import { BrandLogo } from "./components/ui/BrandLogo.jsx";
import { ThemeToggle } from "./components/ThemeToggle.jsx";
import { NotificacionesDropdown } from "./components/NotificacionesDropdown.jsx";
import { BottomNav } from "./components/BottomNav.jsx";
import { NAV_GROUPS, ROLE_OPTIONS, ROLE_LABELS, ROLES, NAV_ICONS } from "./navConfig.js";
import { AuthScreen } from "./screens/AuthScreen.jsx";
import { ResetPasswordScreen } from "./screens/ResetPasswordScreen.jsx";
import { OnboardingIncompleteScreen } from "./screens/OnboardingIncompleteScreen.jsx";
import { Sidebar } from "./components/Sidebar.jsx";
import { LogoUploader } from "./components/LogoUploader.jsx";
import { QrUploader } from "./components/QrUploader.jsx";
import { UsuariosAdmin } from "./components/UsuariosAdmin.jsx";
// ╔══════════════════════════════════════════════════════════════════════╗
// ║  STORAGE                                                           ║
// ╚══════════════════════════════════════════════════════════════════════╝
const storageApi = {
  async get(key) {
    const value = window.localStorage.getItem(key);
    return value == null ? null : { value };
  },
  async set(key, value) {
    window.localStorage.setItem(key, value);
  },
};
const DB = {
  async get(k, fb) { try { const r = await storageApi.get(k); return r ? JSON.parse(r.value) : fb; } catch { return fb; } },
  async set(k, v) { try { await storageApi.set(k, JSON.stringify(v)); } catch {} },
};

// Persistencia Moxi: migra a nuevas claves sin perder datos históricos guardados localmente.
const STORAGE_KEYS = {
  customers: "moxi_customers",
  products: "moxi_products",
  inventory: "moxi_inventory",
  sales: "moxi_sales",
  suppliers: "moxi_suppliers",
  purchases: "moxi_purchases",
  formulas: "moxi_formulas",
  orders: "moxi_orders",
  pedidos: "moxi_pedidos",
  expenses: "moxi_expenses",
  movements: "moxi_movements",
  categories: "moxi_categories",
  users: "moxi_users",
  config: "moxi_config",
  activityLogs: "moxi_activity_logs",
};
const LEGACY_STORAGE_KEYS = {
  customers: "ah_customers",
  products: "ah_products3",
  inventory: "ah_inventory3",
  sales: "ah_sales",
  suppliers: "ah_suppliers",
  purchases: "ah_purchases",
  formulas: "ah_formulas",
  orders: "ah_orders",
  expenses: "ah_expenses",
  movements: "ah_movements",
  categories: "ah_categories",
  users: "ah_users",
};
const DEFAULT_CONFIG = { businessName: "", currency: "BOB", createdAt: null, updatedAt: null };
const DEFAULT_ACTIVITY_LOGS = [];
const PERIOD_OPTIONS = [
  ["today", "Hoy"],
  ["week", "Semana"],
  ["month", "Mes"],
  ["3m", "3 Meses"],
  ["6m", "6 Meses"],
  ["year", "Año"],
  ["5y", "5 Años"],
];
const SALE_BASE_ITEM = () => ({ id: uid(), productId: "", qty: 1, unitPrice: 0, sub: 0, subtotal: 0 });
// Claves de datos de negocio con backing en Supabase — NUNCA persistir en localStorage para cuentas Supabase.
// Supabase es la única fuente de verdad para estas entidades.
const SUPABASE_DATA_KEYS = new Set(["customers","products","inventory","sales","expenses","movements"]);

const loadStoredValue = async (key, fallback) => {
  if (getCurrentEmpresaId()) {
    // Supabase UUID: business data proviene de Supabase, no localStorage.
    // Leer localStorage aquí causaría datos fantasma y contaminación cruzada.
    if (isSupabaseScope() && SUPABASE_DATA_KEYS.has(key)) return fallback;
    // Supabase/multiempresa: SOLO clave scoped — nunca caer a global ni legacy.
    const scoped = await DB.get(getScopedStorageKey(key, getCurrentEmpresaId()), undefined);
    return scoped !== undefined ? scoped : fallback;
  }
  // Modo local/legacy: global moxi_* → ah_* → fallback
  const primary = await DB.get(STORAGE_KEYS[key], undefined);
  if (primary !== undefined) return primary;
  const legacyKey = LEGACY_STORAGE_KEYS[key];
  if (legacyKey) {
    const legacy = await DB.get(legacyKey, undefined);
    if (legacy !== undefined) return legacy;
  }
  return fallback;
};
const persistValue = (key, value) => {
  if (getCurrentEmpresaId()) {
    // Supabase UUID: business data se persiste en Supabase (vía syncDiff/services).
    // Escribir en localStorage generaría datos rancios y contaminación entre dispositivos.
    if (isSupabaseScope() && SUPABASE_DATA_KEYS.has(key)) return;
    // Supabase mode: SOLO clave scoped — nunca escribir en global.
    DB.set(getScopedStorageKey(key, getCurrentEmpresaId()), value);
    return;
  }
  // Modo local: clave global moxi_*
  DB.set(STORAGE_KEYS[key] || key, value);
};
const buildActivityEntry = (user, action, meta = {}) => ({
  id: "log" + uid(),
  userId: user?.id || "system",
  userName: user?.name || "Sistema",
  role: user?.role || "system",
  action,
  date: new Date().toISOString(),
  meta,
});
const buildReceiptFilename = sale => {
  const stamp = String(sale?.date || new Date().toISOString()).slice(0, 10);
  return `comprobante_moxi_${stamp}_${sale?.id || uid()}.pdf`;
};
const downloadSaleReceipt = async ({ sale, config, user }) => {
  // jsPDF se carga solo cuando se genera un comprobante — evita inflar el bundle inicial.
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = 595.28;
  const ml = 40, mr = 40;
  const re = W - mr; // right edge
  const cw = W - ml - mr; // content width
  const businessName = safeBusinessName(config);
  const invoiceNum = `#${String(sale.id || "").slice(-8).toUpperCase()}`;
  const subtotal = (sale.items || []).reduce((s, i) => s + n(i.sub ?? i.subtotal), 0);
  const discountAmt = n(sale.discount || sale.descuento || 0);
  const total = n(sale.total);
  const pm = { efectivo:"Efectivo", transferencia:"Transferencia bancaria", qr:"Pago QR", mixto:"Pago mixto" }[sale.paymentMethod] || sale.paymentMethod || "—";

  // ── HEADER AZUL ───────────────────────────────────────
  doc.setFillColor(17, 30, 123);
  doc.rect(0, 0, W, 72, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.setTextColor(255,255,255);
  doc.text(businessName, ml, 28);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(170,185,220);
  doc.text("Sistema ERP · Moxi Business", ml, 42);
  doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.setTextColor(255,255,255);
  doc.text("FACTURA", re, 28, { align:"right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(170,185,220);
  doc.text(invoiceNum, re, 42, { align:"right" });

  // ── META BAR ──────────────────────────────────────────
  doc.setFillColor(249, 250, 251);
  doc.rect(0, 72, W, 52, "F");
  const metaItems = [
    ["N° DE FACTURA", invoiceNum],
    ["FECHA", fDate(sale.date || sale.createdAt)],
    ["CLIENTE", (sale.customerName || "Público general").slice(0, 28)],
  ];
  metaItems.forEach(([lbl, val], i) => {
    const x = ml + i * (cw / 3);
    doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.setTextColor(156,163,175);
    doc.text(lbl, x, 88);
    doc.setFont("helvetica","bold"); doc.setFontSize(10); doc.setTextColor(17,24,39);
    doc.text(val, x, 101);
    if (i===2 && sale.customerMarket) {
      doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(107,114,128);
      doc.text(sale.customerMarket, x, 112);
    }
  });

  // ── TOTAL HIGHLIGHT ───────────────────────────────────
  let y = 140;
  doc.setDrawColor(229,231,235); doc.line(ml, y, re, y); y += 14;
  doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.setTextColor(156,163,175);
  doc.text("TOTAL A PAGAR", ml, y); y += 14;
  doc.setFont("helvetica","bold"); doc.setFontSize(24); doc.setTextColor(17,24,39);
  doc.text(formatCurrency(total), ml, y); y += 18;
  doc.setDrawColor(229,231,235); doc.line(ml, y, re, y); y += 16;

  // ── TABLA ITEMS ───────────────────────────────────────
  const c0=ml, c1=ml+cw*0.48, c2=ml+cw*0.68, c3=re;
  const rowH = 20;
  doc.setFillColor(17,30,123);
  doc.rect(ml, y, cw, rowH, "F");
  doc.setFont("helvetica","bold"); doc.setFontSize(8); doc.setTextColor(255,255,255);
  doc.text("DESCRIPCIÓN", c0+5, y+13);
  doc.text("PRECIO", c1, y+13);
  doc.text("CANT.", c2+18, y+13, { align:"center" });
  doc.text("TOTAL", c3, y+13, { align:"right" });
  y += rowH;

  (sale.items || []).forEach((item, idx) => {
    if (y > 760) { doc.addPage(); y = 40; }
    if (idx % 2 === 1) { doc.setFillColor(249,250,251); doc.rect(ml, y, cw, rowH, "F"); }
    doc.setFont("helvetica","bold"); doc.setFontSize(9); doc.setTextColor(17,24,39);
    doc.text(String(item.name || "Producto").slice(0,40), c0+5, y+13);
    doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(55,65,81);
    doc.text(formatCurrency(item.unitPrice), c1, y+13);
    doc.text(String(n(item.qty)), c2+18, y+13, { align:"center" });
    doc.setFont("helvetica","bold"); doc.setFontSize(9); doc.setTextColor(17,24,39);
    doc.text(formatCurrency(n(item.sub??item.subtotal)), c3, y+13, { align:"right" });
    y += rowH;
  });
  doc.setDrawColor(229,231,235); doc.line(ml, y, re, y); y += 14;

  // ── TOTALS ────────────────────────────────────────────
  const tx = re - 200;
  doc.setFont("helvetica","normal"); doc.setFontSize(9); doc.setTextColor(107,114,128);
  doc.text("Subtotal", tx, y);
  doc.setFont("helvetica","bold"); doc.setTextColor(17,24,39);
  doc.text(formatCurrency(subtotal), re, y, { align:"right" }); y += 14;
  if (discountAmt > 0) {
    doc.setFont("helvetica","normal"); doc.setTextColor(107,114,128);
    doc.text("Descuento", tx, y);
    doc.setFont("helvetica","bold"); doc.setTextColor(220,38,38);
    doc.text(`-${formatCurrency(discountAmt)}`, re, y, { align:"right" }); y += 14;
  }
  doc.setFillColor(17,30,123);
  doc.rect(tx-6, y-11, 206+mr, 22, "F");
  doc.setFont("helvetica","bold"); doc.setFontSize(10); doc.setTextColor(255,255,255);
  doc.text("TOTAL", tx, y+4);
  doc.text(formatCurrency(total), re, y+4, { align:"right" });
  y += 28;

  // ── PAGO + VENDEDOR ───────────────────────────────────
  doc.setDrawColor(229,231,235); doc.line(ml, y, re, y); y += 14;
  doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.setTextColor(156,163,175);
  doc.text("FORMA DE PAGO", ml, y); y += 11;
  doc.setFont("helvetica","bold"); doc.setFontSize(9); doc.setTextColor(55,65,81);
  doc.text(pm, ml, y);
  if (n(sale.paid) > 0) {
    doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(107,114,128);
    doc.text(`Recibido: ${formatCurrency(sale.paid)}`, ml, y+11);
    if (sale.debt > 0) doc.text(`Pendiente: ${formatCurrency(sale.debt)}`, ml, y+21);
  }
  const vendX = re, vendY = y - 11;
  doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.setTextColor(156,163,175);
  doc.text("ATENDIDO POR", vendX, vendY, { align:"right" });
  doc.setFont("helvetica","bold"); doc.setFontSize(9); doc.setTextColor(55,65,81);
  doc.text(user?.name || "Vendedor", vendX, vendY+11, { align:"right" });

  if (sale.notes) {
    y += (n(sale.paid)>0 && sale.debt>0) ? 36 : n(sale.paid)>0 ? 26 : 14;
    doc.setFont("helvetica","italic"); doc.setFontSize(8); doc.setTextColor(107,114,128);
    doc.text(`Notas: ${String(sale.notes).slice(0,90)}`, ml, y);
  }

  // ── FOOTER ────────────────────────────────────────────
  y += 22;
  doc.setFillColor(249,250,251);
  doc.rect(0, y, W, 38, "F");
  doc.setDrawColor(229,231,235); doc.line(0, y, W, y); y += 13;
  doc.setFont("helvetica","bold"); doc.setFontSize(8); doc.setTextColor(55,65,81);
  doc.text(businessName, ml, y);
  const contact = [config?.direccion, config?.telefono ? `Tel: ${config.telefono}` : null].filter(Boolean).join(" · ");
  if (contact) { doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.setTextColor(107,114,128); doc.text(contact, ml, y+10); }
  doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.setTextColor(156,163,175);
  doc.text("Comprobante generado por Moxi Business ERP", re, y, { align:"right" });
  doc.text(`Impreso el ${fDate(new Date())}`, re, y+10, { align:"right" });

  doc.save(buildReceiptFilename(sale));
};

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  SEED DATA                                                         ║
// ╚══════════════════════════════════════════════════════════════════════╝
const DEFAULT_USERS = [];
const PRODUCTS0 = [
  { id:"p1",  name:"Ají en Vaina",            cat:"vaina",       unit:"kg",    price:15,  minStock:50, desc:"", img:null },
  { id:"p2",  name:"Polvo Rojo Dulce 50g",    cat:"rojo_dulce",  unit:"bolsa", price:8,   minStock:30, desc:"", img:null },
  { id:"p3",  name:"Polvo Rojo Dulce 200g",   cat:"rojo_dulce",  unit:"bolsa", price:22,  minStock:20, desc:"", img:null },
  { id:"p4",  name:"Polvo Rojo Dulce 500g",   cat:"rojo_dulce",  unit:"bolsa", price:45,  minStock:15, desc:"", img:null },
  { id:"p5",  name:"Polvo Rojo Dulce 1kg",    cat:"rojo_dulce",  unit:"bolsa", price:80,  minStock:10, desc:"", img:null },
  { id:"p6",  name:"Polvo Rojo Picante 50g",  cat:"rojo_picante",unit:"bolsa", price:9,   minStock:30, desc:"", img:null },
  { id:"p7",  name:"Polvo Rojo Picante 200g", cat:"rojo_picante",unit:"bolsa", price:25,  minStock:20, desc:"", img:null },
  { id:"p8",  name:"Polvo Rojo Picante 500g", cat:"rojo_picante",unit:"bolsa", price:50,  minStock:15, desc:"", img:null },
  { id:"p9",  name:"Polvo Rojo Picante 1kg",  cat:"rojo_picante",unit:"bolsa", price:90,  minStock:10, desc:"", img:null },
  { id:"p10", name:"Polvo Amarillo 50g",      cat:"amarillo",    unit:"bolsa", price:10,  minStock:25, desc:"", img:null },
  { id:"p11", name:"Polvo Amarillo 200g",     cat:"amarillo",    unit:"bolsa", price:28,  minStock:15, desc:"", img:null },
  { id:"p12", name:"Polvo Amarillo 500g",     cat:"amarillo",    unit:"bolsa", price:55,  minStock:10, desc:"", img:null },
  { id:"p13", name:"Polvo Amarillo 1kg",      cat:"amarillo",    unit:"bolsa", price:95,  minStock:8,  desc:"", img:null },
  { id:"p14", name:"Polvo Rojo Dulce Granel", cat:"granel",      unit:"kg",    price:70,  minStock:5,  desc:"", img:null },
  { id:"p15", name:"Polvo Rojo Picante Granel",cat:"granel",     unit:"kg",    price:80,  minStock:5,  desc:"", img:null },
  { id:"p16", name:"Polvo Amarillo Granel",   cat:"granel",      unit:"kg",    price:85,  minStock:5,  desc:"", img:null },
];
const FORMULAS0 = [
  { id:"f1", name:"Vaina → Polvo Rojo", inputId:"p1", inputQty:11.5, inputUnit:"arroba (11.5kg)", outputId:"p14", outputQty:5, outputUnit:"kg", laborCost:20, energyCost:10, desc:"1 arroba (~11.5 kg) de ají en vaina produce ~5 kg de polvo." },
];
const CUSTOMERS0 = [];





// ╔══════════════════════════════════════════════════════════════════════╗
// ║  DASHBOARD                                                          ║
// ╚══════════════════════════════════════════════════════════════════════╝
const PERIODS=[["today","Hoy"],["week","Semana"],["month","Mes"],["3m","3 Meses"],["6m","6 Meses"],["year","Año"],["5y","5 Años"]];

function Dashboard({ D, setTab }) {
  const [period,setPeriod]=useState("month");
  const isMobile=useIsMobile();
  const {
    sales=[],
    customers=[],
    products=[],
    inventory=[],
    expenses=[],
    categories=[]
  } = D || {};
  const totalSales=sales.reduce((a,s)=>a+s.total,0);
  const totalPaid=sales.reduce((a,s)=>a+s.paid,0);
  const totalDebt=sales.reduce((a,s)=>a+s.debt,0);
  const totalExpenses=expenses.filter(e=>e.type==="gasto").reduce((a,e)=>a+e.amount,0);
  const chartData = useMemo(()=>buildChart(sales,period),[sales,period]);
  const getStock=id=>(inventory.find(i=>i.productId===id)||{}).stock||0;
  const lowStock=products.filter(p=>p.minStock>0&&getStock(p.id)<=p.minStock);
  const debtClients=customers.map(c=>({...c,debt:sales.filter(s=>s.customerId===c.id).reduce((a,s)=>a+s.debt,0)})).filter(c=>c.debt>0).sort((a,b)=>b.debt-a.debt);
  const recent=[...sales].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,6);

  // Top productos
  const prodMap={};
  sales.forEach(s=>s.items.forEach(it=>{ prodMap[it.productId]=(prodMap[it.productId]||0)+it.subtotal; }));
  const topProds=Object.entries(prodMap).map(([id,total])=>({name:products.find(p=>p.id===id)?.name||id,total})).sort((a,b)=>b.total-a.total).slice(0,5);

  // Category pie
  const catMap={};
  sales.forEach(s=>s.items.forEach(it=>{ const p=products.find(x=>x.id===it.productId); const cat=(p?.cat)||"otro"; catMap[cat]=(catMap[cat]||0)+it.subtotal; }));
  const pieSales=Object.entries(catMap).map(([cat,v])=>({name:getCategoryName(categories, cat),value:Math.round(v)}));

  return (
    <div>
      <Header title="Panel Principal" sub={new Date().toLocaleDateString("es-BO",{weekday:"long",year:"numeric",month:"long",day:"numeric"})} />
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10,marginBottom:18}}>
        <KPI label="Total Clientes" value={customers.length} Icon="👥" color={C.blue} />
        <KPI label="Total Ventas" value={Bs(totalSales)} sub={`${sales.length} transacciones`} Icon="🛒" color={C.red} />
        <KPI label="Total Cobrado" value={Bs(totalPaid)} sub={`${pct(totalPaid,totalSales)}% cobrado`} Icon="✅" color={C.green} />
        <KPI label="Deuda Pendiente" value={Bs(totalDebt)} sub={`${debtClients.length} clientes`} Icon="⚠️" color={totalDebt>0?C.amber:C.green} />
      </div>

      {/* Main chart */}
      <div style={{...card(),marginBottom:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
          <div style={{fontWeight:700,fontSize:14,letterSpacing:"-0.02em"}}>Actividad comercial</div>
          <Chip value={period} onChange={setPeriod} options={PERIODS} />
        </div>
        <ResponsiveContainer width="100%" height={210}>
          <AreaChart data={chartData} margin={{top:4,right:4,left:0,bottom:0}}>
            <defs>
              {[["gV",C.red],["gC",C.green],["gD",C.red]].map(([id,clr])=>(
                <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={clr} stopOpacity={0.18}/>
                  <stop offset="95%" stopColor={clr} stopOpacity={0}/>
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
            <XAxis dataKey="date" tick={{fontSize:11,fill:C.textFaint}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fontSize:11,fill:C.textFaint}} axisLine={false} tickLine={false} width={62} tickFormatter={v=>`Bs.${v}`}/>
            <Tooltip formatter={(v,nm)=>[Bs(v),nm]} contentStyle={{borderRadius:10,border:`1px solid ${C.border}`,fontSize:12,boxShadow:"0 4px 16px rgba(0,0,0,0.08)"}}/>
            <Legend iconSize={9} wrapperStyle={{fontSize:12}}/>
            <Area type="monotone" dataKey="ventas" name="Ventas" stroke={C.red} fill="url(#gV)" strokeWidth={2} dot={false}/>
            <Area type="monotone" dataKey="cobrado" name="Cobrado" stroke={C.green} fill="url(#gC)" strokeWidth={2} dot={false}/>
            <Area type="monotone" dataKey="deuda" name="Deuda" stroke={C.red} fill="url(#gD)" strokeWidth={2} dot={false} strokeDasharray="4 2"/>
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:12,marginBottom:14}}>
        {/* Recent sales */}
        <div style={card()}>
          <div style={{fontWeight:700,fontSize:13,marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            Ventas recientes
            <button onClick={()=>setTab("ventas")} style={{...mkBtn("ghost"),padding:"3px 8px",fontSize:11}}>Ver todas →</button>
          </div>
          {recent.length===0?<Empty icon="🛒" title="Sin ventas" sub="Registra tu primera venta"/>:
            recent.map(s=>(
              <div key={s.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
                <div>
                  <div style={{fontSize:13,fontWeight:500}}>{s.customerName}</div>
                  <div style={{fontSize:11,color:C.textFaint}}>{fDate(s.date)}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:13,fontWeight:700,color:C.red}}>{Bs(s.total)}</div>
                  <span style={mkBadge(s.debt>0?"amber":"green")}>{s.debt>0?`Debe ${Bs(s.debt)}`:"Saldado"}</span>
                </div>
              </div>
            ))}
        </div>

        {/* Pie chart + top products */}
        <div style={card()}>
          <div style={{fontWeight:700,fontSize:13,marginBottom:12}}>Ventas por categoría</div>
          {pieSales.length>0?(
            <ResponsiveContainer width="100%" height={150}>
              <PieChart>
                <Pie data={pieSales} cx="50%" cy="50%" outerRadius={60} dataKey="value" nameKey="name" label={({name,percent})=>`${Math.round(percent*100)}%`} labelLine={false}>
                  {pieSales.map((_,i)=><Cell key={i} fill={SECTORS_COLORS[i%SECTORS_COLORS.length]}/>)}
                </Pie>
                <Tooltip formatter={(v)=>[Bs(v)]} contentStyle={{borderRadius:8,fontSize:12}}/>
                <Legend iconSize={9} wrapperStyle={{fontSize:11}}/>
              </PieChart>
            </ResponsiveContainer>
          ):<Empty icon="📊" title="Sin datos" sub="Registra ventas para ver la distribución"/>}
        </div>
      </div>

      {/* Alerts row */}
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:12}}>
        {lowStock.length>0&&(
          <div style={{...card(),borderLeft:`3px solid ${C.amber}`}}>
            <div style={{fontWeight:700,fontSize:12,color:C.amber,marginBottom:8}}>⚠️ Stock bajo ({lowStock.length})</div>
            {lowStock.slice(0,5).map(p=>(
              <div key={p.id} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"4px 0",borderBottom:`1px solid ${C.border}`}}>
                <span>{p.name}</span><span style={{color:C.amber,fontWeight:600}}>{getStock(p.id)}/{p.minStock} {p.unit}</span>
              </div>
            ))}
          </div>
        )}
        {debtClients.length>0&&(
          <div style={{...card(),borderLeft:`3px solid ${C.red}`}}>
            <div style={{fontWeight:700,fontSize:12,color:C.red,marginBottom:8}}>💳 Deudas pendientes ({debtClients.length})</div>
            {debtClients.slice(0,5).map(c=>(
              <div key={c.id} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"4px 0",borderBottom:`1px solid ${C.border}`}}>
                <span>{c.name}</span><span style={{color:C.red,fontWeight:700}}>{Bs(c.debt)}</span>
              </div>
            ))}
          </div>
        )}
        {lowStock.length===0&&debtClients.length===0&&(
          <div style={{...card(),borderLeft:`3px solid ${C.green}`,gridColumn:"1/-1",display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:24}}>✅</span>
            <div><div style={{fontWeight:600,color:C.green}}>Todo en orden</div><div style={{fontSize:12,color:C.textMid}}>Sin alertas activas</div></div>
          </div>
        )}
      </div>
    </div>
  );
}


// ╔══════════════════════════════════════════════════════════════════════╗
// ║  VENTAS                                                             ║
// ╚══════════════════════════════════════════════════════════════════════╝
const PM_LABELS = {efectivo:"💵 Efectivo",transferencia:"🏦 Transf.",qr:"📱 QR",mixto:"🔀 Mixto"};
const PM_COLORS = {efectivo:"green",transferencia:"blue",qr:"amber",mixto:"default"};

// ── Comprobante modal (invoice profesional post-venta) ────────────────────
function ComprobanteModal({ sale, config, user, onClose }) {
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

  const subtotal = (sale.items||[]).reduce((s,i)=>s+n(i.sub??i.subtotal),0);
  const descuento = n(sale.discount||sale.descuento||0);
  const total = n(sale.total);
  const pmLabel = {efectivo:"💵 Efectivo",transferencia:"🏦 Transferencia bancaria",qr:"📱 Pago QR",mixto:"🔀 Pago mixto"}[sale.paymentMethod]||sale.paymentMethod||"—";

  return (
    <div onClick={e=>e.target===e.currentTarget&&onClose()} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.62)",zIndex:260,display:"flex",alignItems:"center",justifyContent:"center",padding:"12px",overflowY:"auto",backdropFilter:"blur(4px)"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"var(--color-bg-surface)",borderRadius:18,width:"100%",maxWidth:680,maxHeight:"95vh",display:"flex",flexDirection:"column",overflow:"hidden",boxShadow:"0 32px 80px rgba(0,0,0,0.28)"}}>

        {/* Modal header */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 20px",borderBottom:"1px solid var(--color-border)",flexShrink:0}}>
          <div>
            <div style={{fontWeight:700,fontSize:15,color:"var(--color-text)"}}>Comprobante de venta</div>
            <div style={{fontSize:12,color:C.green,fontWeight:600,marginTop:2}}>✓ Venta registrada exitosamente</div>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",color:"var(--color-text-mid)",display:"flex",alignItems:"center",padding:4}}>
            <X size={18} strokeWidth={1.8}/>
          </button>
        </div>

        {/* Invoice content */}
        <div style={{flex:1,overflowY:"auto",background:"var(--color-bg-primary)",padding:"16px"}}>
          <div ref={invoiceRef} style={{background:"#ffffff",color:"#111827",maxWidth:640,margin:"0 auto",borderRadius:8,overflow:"hidden",boxShadow:"0 2px 12px rgba(0,0,0,0.08)"}}>

            {/* Invoice header */}
            <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",padding:"28px 28px 20px"}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                {config?.logo_url
                  ? <img src={config.logo_url} alt="logo" style={{width:48,height:48,objectFit:"contain",borderRadius:8}} crossOrigin="anonymous"/>
                  : <div style={{width:48,height:48,background:C.brand,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontWeight:800,fontSize:20}}>{businessName[0]||"M"}</div>
                }
                <div>
                  <div style={{fontWeight:800,fontSize:15,color:"#111827",lineHeight:1.2}}>{businessName}</div>
                  <div style={{fontSize:11,color:"#6B7280",marginTop:2,textTransform:"uppercase",letterSpacing:"0.06em"}}>Sistema ERP · Moxi Business</div>
                </div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:28,fontWeight:800,color:C.brand,letterSpacing:"0.05em"}}>FACTURA</div>
              </div>
            </div>

            {/* Invoice meta */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:0,padding:"0 28px 20px",borderBottom:"1px solid #E5E7EB"}}>
              {[
                ["N° de factura", `#${String(sale.id).slice(-8).toUpperCase()}`],
                ["Fecha", fDate(sale.date||sale.createdAt)],
                ["Facturar a", sale.customerName||"Público general"],
              ].map(([lbl,val])=>(
                <div key={lbl} style={{paddingRight:16}}>
                  <div style={{fontSize:10,color:"#9CA3AF",textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:700,marginBottom:4}}>{lbl}</div>
                  <div style={{fontSize:13,fontWeight:700,color:"#111827"}}>{val}</div>
                  {lbl==="Facturar a"&&sale.customerMarket&&<div style={{fontSize:11,color:"#6B7280",marginTop:2}}>{sale.customerMarket}</div>}
                </div>
              ))}
            </div>

            {/* Total due highlight */}
            <div style={{padding:"18px 28px",borderBottom:"1px solid #E5E7EB"}}>
              <div style={{fontSize:10,color:"#9CA3AF",textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:700,marginBottom:6}}>Total a pagar</div>
              <div style={{fontSize:34,fontWeight:800,color:"#111827",letterSpacing:"-0.02em"}}>{Bs(total)}</div>
            </div>

            {/* Items table */}
            <div style={{padding:"0 28px"}}>
              <table style={{width:"100%",borderCollapse:"collapse",marginTop:20}}>
                <thead>
                  <tr style={{background:C.brand,color:"white"}}>
                    {[["Descripción","left","auto"],["Precio unit.","right","110px"],["Cant.","center","70px"],["Total","right","100px"]].map(([h,a,w])=>(
                      <th key={h} style={{textAlign:a,fontSize:10,fontWeight:700,padding:"10px 12px",textTransform:"uppercase",letterSpacing:"0.07em",width:w}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(sale.items||[]).map((item,i)=>(
                    <tr key={i} style={{background:i%2===0?"#ffffff":"#F9FAFB"}}>
                      <td style={{padding:"10px 12px"}}>
                        <div style={{fontWeight:600,fontSize:13,color:"#111827"}}>{item.name}</div>
                        {item.unit&&<div style={{fontSize:11,color:"#6B7280",marginTop:2}}>{item.unit}</div>}
                      </td>
                      <td style={{textAlign:"right",fontSize:12,color:"#374151",padding:"10px 12px"}}>{Bs(item.unitPrice)}</td>
                      <td style={{textAlign:"center",fontSize:12,color:"#374151",padding:"10px 12px"}}>{item.qty}</td>
                      <td style={{textAlign:"right",fontSize:13,fontWeight:700,color:"#111827",padding:"10px 12px"}}>{Bs(item.sub??item.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div style={{padding:"16px 28px 20px",display:"flex",justifyContent:"flex-end"}}>
              <div style={{width:260}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"4px 0",borderBottom:"1px solid #E5E7EB",marginBottom:4}}>
                  <span style={{color:"#6B7280"}}>Subtotal</span>
                  <span style={{fontWeight:600,color:"#111827"}}>{Bs(subtotal)}</span>
                </div>
                {descuento>0&&(
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"4px 0",borderBottom:"1px solid #E5E7EB",marginBottom:4}}>
                    <span style={{color:"#6B7280"}}>Descuento</span>
                    <span style={{fontWeight:600,color:C.red}}>-{Bs(descuento)}</span>
                  </div>
                )}
                <div style={{display:"flex",justifyContent:"space-between",background:C.brand,color:"white",padding:"10px 14px",borderRadius:8,marginTop:8}}>
                  <span style={{fontWeight:700,fontSize:13,textTransform:"uppercase",letterSpacing:"0.04em"}}>Total</span>
                  <span style={{fontWeight:800,fontSize:16}}>{Bs(total)}</span>
                </div>
              </div>
            </div>

            {/* Payment + signature */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,padding:"16px 28px 20px",borderTop:"1px solid #E5E7EB"}}>
              <div>
                <div style={{fontSize:10,color:"#9CA3AF",textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:700,marginBottom:8}}>Forma de pago</div>
                <div style={{fontSize:13,color:"#374151",fontWeight:600}}>{pmLabel}</div>
                {n(sale.paid)>0&&(
                  <div style={{marginTop:8,fontSize:12,color:"#6B7280"}}>
                    <div>Recibido: <strong style={{color:"#111827"}}>{Bs(sale.paid)}</strong></div>
                    {sale.debt>0&&<div style={{marginTop:2}}>Pendiente: <strong style={{color:C.amber}}>{Bs(sale.debt)}</strong></div>}
                  </div>
                )}
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{display:"inline-block"}}>
                  <div style={{fontStyle:"italic",fontSize:20,color:"#374151",borderBottom:"1px solid #D1D5DB",paddingBottom:6,marginBottom:4,fontFamily:"Georgia,serif"}}>{businessName}</div>
                  <div style={{fontSize:10,color:"#9CA3AF",textTransform:"uppercase",letterSpacing:"0.07em"}}>Responsable de cuenta</div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{background:"#F9FAFB",padding:"14px 28px",display:"flex",alignItems:"center",justifyContent:"space-between",borderTop:"1px solid #E5E7EB"}}>
              <div style={{fontSize:11,color:"#6B7280"}}>
                <div style={{fontWeight:700,color:"#374151",marginBottom:2}}>{businessName}</div>
                {config?.direccion&&<div>{config.direccion}</div>}
                {config?.telefono&&<div>Tel: {config.telefono}</div>}
                <div style={{marginTop:4,fontSize:10,color:"#9CA3AF"}}>Comprobante generado por Moxi Business ERP</div>
              </div>
              {sale.notes&&(
                <div style={{fontSize:11,color:"#6B7280",fontStyle:"italic",maxWidth:200,textAlign:"right"}}>{sale.notes}</div>
              )}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{display:"flex",gap:8,padding:"14px 16px",borderTop:"1px solid var(--color-border)",background:"var(--color-bg-surface)",flexShrink:0}}>
          <button onClick={onClose} style={{...mkBtn("ghost")}}>Cerrar</button>
          <div style={{flex:1}}/>
          <button onClick={handlePrint} style={{...mkBtn("ghost"),display:"flex",alignItems:"center",gap:6}}>
            <Printer size={14}/> Imprimir
          </button>
          <button onClick={handlePDF} style={{...mkBtn("primary"),display:"flex",alignItems:"center",gap:6}}>
            <Download size={14}/> Descargar PDF
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Barcode camera scanner ────────────────────────────────────────────────
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
      readerRef.current.decodeFromVideoDevice(deviceId, videoRef.current, (result, err) => {
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
        style={{ ...mkBtn("subtle"),padding:"7px 10px",display:"flex",alignItems:"center",gap:5,fontSize:12,flexShrink:0 }}>
        <Camera size={13} strokeWidth={1.8}/> Cámara
      </button>
      {open && (
        <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:9999,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:14 }}>
          <div style={{ color:"white",fontWeight:700,fontSize:15 }}>Apunta al código de barras</div>
          <div style={{ position:"relative",width:300,height:220,borderRadius:14,overflow:"hidden",border:"2px solid #22C5FE",boxShadow:"0 0 0 4px rgba(34,197,254,0.18)" }}>
            <video ref={videoRef} style={{ width:"100%",height:"100%",objectFit:"cover" }} muted playsInline autoPlay />
            {scanning && <div style={{ position:"absolute",top:"50%",left:0,right:0,height:2,background:"linear-gradient(90deg,transparent,#22C5FE,transparent)",animation:"moxiLoad 1.2s ease-in-out infinite" }} />}
          </div>
          {scanErr && <div style={{ color:"#F87171",fontSize:12,maxWidth:280,textAlign:"center" }}>{scanErr}</div>}
          {scanning && !scanErr && <div style={{ color:"rgba(255,255,255,0.55)",fontSize:12 }}>Escaneando…</div>}
          <button onClick={()=>{ stopScan(); setOpen(false); }} style={{ ...mkBtn("ghost"),color:"white",border:"1px solid rgba(255,255,255,0.25)",display:"flex",alignItems:"center",gap:6 }}>
            <X size={14}/> Cancelar
          </button>
        </div>
      )}
    </>
  );
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  PEDIDOS Y COTIZACIONES                                             ║
// ╚══════════════════════════════════════════════════════════════════════╝
const ESTADOS_COTIZACION = [
  { id:"borrador",  label:"Borrador",  badge:"gray"  },
  { id:"enviada",   label:"Enviada",   badge:"blue"  },
  { id:"aceptada",  label:"Aceptada",  badge:"green" },
  { id:"rechazada", label:"Rechazada", badge:"red"   },
  { id:"vencida",   label:"Vencida",   badge:"amber" },
];
const ESTADOS_PEDIDO = [
  { id:"pendiente",  label:"Pendiente",          badge:"amber" },
  { id:"confirmado", label:"Confirmado",         badge:"blue"  },
  { id:"en_proceso", label:"En proceso",         badge:"blue"  },
  { id:"listo",      label:"Listo para entrega", badge:"green" },
  { id:"entregado",  label:"Entregado",          badge:"green" },
  { id:"cancelado",  label:"Cancelado",          badge:"red"   },
];
const estadosDe = tipo => tipo === "cotizacion" ? ESTADOS_COTIZACION : ESTADOS_PEDIDO;
const estadoMeta = (tipo, id) => estadosDe(tipo).find(e => e.id === id) || { label:id, badge:"gray" };
const codigoDoc = (tipo, numero) => `${tipo === "cotizacion" ? "COT" : "PED"}-${String(numero).padStart(4,"0")}`;

// Documento imprimible (cotización o nota de pedido)
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
    <div onClick={e=>e.target===e.currentTarget&&onClose()} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.62)",zIndex:260,display:"flex",alignItems:"center",justifyContent:"center",padding:"12px",overflowY:"auto",backdropFilter:"blur(4px)"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"var(--color-bg-surface)",borderRadius:18,width:"100%",maxWidth:680,maxHeight:"95vh",display:"flex",flexDirection:"column",overflow:"hidden",boxShadow:"0 32px 80px rgba(0,0,0,0.28)"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 20px",borderBottom:"1px solid var(--color-border)",flexShrink:0}}>
          <div style={{fontWeight:700,fontSize:15,color:"var(--color-text)"}}>{esCot?"Cotización":"Pedido"} {doc.codigo}</div>
          <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",color:"var(--color-text-mid)",display:"flex",padding:4}}><X size={18} strokeWidth={1.8}/></button>
        </div>
        <div style={{flex:1,overflowY:"auto",background:"var(--color-bg-primary)",padding:"16px"}}>
          <div ref={ref} style={{background:"#ffffff",color:"#111827",maxWidth:640,margin:"0 auto",borderRadius:8,overflow:"hidden",boxShadow:"0 2px 12px rgba(0,0,0,0.08)"}}>
            <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",padding:"28px 28px 20px"}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                {config?.logo_url
                  ? <img src={config.logo_url} alt="logo" style={{width:48,height:48,objectFit:"contain",borderRadius:8}} crossOrigin="anonymous"/>
                  : <div style={{width:48,height:48,background:"#111E7B",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontWeight:800,fontSize:20}}>{businessName[0]||"M"}</div>}
                <div>
                  <div style={{fontWeight:800,fontSize:15,lineHeight:1.2}}>{businessName}</div>
                  <div style={{fontSize:11,color:"#6B7280",marginTop:2,textTransform:"uppercase",letterSpacing:"0.06em"}}>Sistema ERP · Moxi Business</div>
                </div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:24,fontWeight:800,color:"#111E7B",letterSpacing:"0.04em"}}>{titulo}</div>
                <div style={{fontSize:12,color:"#6B7280",marginTop:2}}>{doc.codigo}</div>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",padding:"0 28px 20px",borderBottom:"1px solid #E5E7EB"}}>
              {[
                ["Cliente", doc.customerName||"Público general"],
                ["Fecha de emisión", fDate(doc.date)],
                [esCot ? "Válida hasta" : "Fecha de entrega", (esCot?doc.validUntil:doc.deliveryDate) ? fDate(esCot?doc.validUntil:doc.deliveryDate) : "—"],
              ].map(([lbl,val])=>(
                <div key={lbl} style={{paddingRight:16}}>
                  <div style={{fontSize:10,color:"#9CA3AF",textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:700,marginBottom:4}}>{lbl}</div>
                  <div style={{fontSize:13,fontWeight:700}}>{val}</div>
                </div>
              ))}
            </div>
            <div style={{padding:"0 28px"}}>
              <table style={{width:"100%",borderCollapse:"collapse",marginTop:20}}>
                <thead>
                  <tr style={{background:"#111E7B",color:"white"}}>
                    {[["Descripción","left"],["Precio unit.","right"],["Cant.","center"],["Total","right"]].map(([h,a])=>(
                      <th key={h} style={{textAlign:a,fontSize:10,fontWeight:700,padding:"10px 12px",textTransform:"uppercase",letterSpacing:"0.07em"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(doc.items||[]).map((it,i)=>(
                    <tr key={i} style={{background:i%2===0?"#ffffff":"#F9FAFB"}}>
                      <td style={{padding:"10px 12px"}}>
                        <div style={{fontWeight:600,fontSize:13}}>{it.name}</div>
                        {it.unit&&<div style={{fontSize:11,color:"#6B7280",marginTop:2}}>{it.unit}</div>}
                      </td>
                      <td style={{textAlign:"right",fontSize:12,color:"#374151",padding:"10px 12px"}}>{Bs(it.unitPrice)}</td>
                      <td style={{textAlign:"center",fontSize:12,color:"#374151",padding:"10px 12px"}}>{it.qty}</td>
                      <td style={{textAlign:"right",fontSize:13,fontWeight:700,padding:"10px 12px"}}>{Bs(it.sub??it.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{padding:"16px 28px 20px",display:"flex",justifyContent:"flex-end"}}>
              <div style={{width:280}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"4px 0"}}>
                  <span style={{color:"#6B7280"}}>Subtotal</span><span style={{fontWeight:600}}>{Bs(doc.subtotal)}</span>
                </div>
                {n(doc.discount)>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"4px 0"}}>
                  <span style={{color:"#6B7280"}}>Descuento</span><span style={{fontWeight:600,color:"#EF4444"}}>-{Bs(doc.discount)}</span>
                </div>}
                {n(doc.taxAmount)>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"4px 0"}}>
                  <span style={{color:"#6B7280"}}>Impuesto ({n(doc.tax)}%)</span><span style={{fontWeight:600}}>{Bs(doc.taxAmount)}</span>
                </div>}
                <div style={{display:"flex",justifyContent:"space-between",background:"#111E7B",color:"white",padding:"10px 14px",borderRadius:8,marginTop:8}}>
                  <span style={{fontWeight:700,fontSize:13,textTransform:"uppercase",letterSpacing:"0.04em"}}>Total</span>
                  <span style={{fontWeight:800,fontSize:16}}>{Bs(doc.total)}</span>
                </div>
              </div>
            </div>
            {(doc.paymentTerms||doc.notes)&&<div style={{padding:"0 28px 20px",borderTop:"1px solid #E5E7EB",paddingTop:14}}>
              {doc.paymentTerms&&<div style={{fontSize:12,color:"#374151",marginBottom:6}}><strong>Condiciones de pago:</strong> {doc.paymentTerms}</div>}
              {doc.notes&&<div style={{fontSize:12,color:"#6B7280",fontStyle:"italic"}}>{doc.notes}</div>}
            </div>}
            <div style={{background:"#F9FAFB",padding:"14px 28px",fontSize:11,color:"#6B7280",borderTop:"1px solid #E5E7EB"}}>
              <div style={{fontWeight:700,color:"#374151"}}>{businessName}</div>
              {config?.telefono&&<div>Tel: {config.telefono}</div>}
              <div style={{marginTop:4,fontSize:10,color:"#9CA3AF"}}>
                {esCot?"Este documento es una cotización y no constituye una factura.":"Documento de pedido generado por Moxi Business ERP."}
              </div>
            </div>
          </div>
        </div>
        <div style={{display:"flex",gap:8,padding:"14px 16px",borderTop:"1px solid var(--color-border)",flexShrink:0}}>
          <button onClick={onClose} style={mkBtn("ghost")}>Cerrar</button>
          <div style={{flex:1}}/>
          <button onClick={handlePrint} style={{...mkBtn("primary"),display:"flex",alignItems:"center",gap:6}}><Printer size={14}/> Imprimir / PDF</button>
        </div>
      </div>
    </div>
  );
}

function Pedidos({ D, save, user, config, logAction, onRefreshDashboard }) {
  const { pedidos = [], customers = [], products = [], inventory = [], categories = [] } = D;
  const isMobile = useIsMobile();
  const GUEST = { id:"__guest__", name:"Público general", market:"", phone:"" };
  const categoryOptions = categories.length ? categories : DEFAULT_CATEGORIES;

  const [vista, setVista] = useState("cotizacion");   // subtab: cotizacion | pedido
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

  const FORM_RESET = (tipo="cotizacion") => ({
    tipo, estado: tipo==="cotizacion"?"borrador":"pendiente",
    customerId:"__guest__", date: today(), validUntil:"", deliveryDate:"",
    items:[],
    discount:"", discountType:"pct", tax:"", notes:"", paymentTerms:"",
  });
  const [form, setForm] = useState(FORM_RESET());

  const flash = msg => { setFeedback(msg); setTimeout(()=>setFeedback(""), 4000); };
  const nextNumero = tipo => pedidos.filter(p=>p.tipo===tipo).reduce((m,p)=>Math.max(m,n(p.numero)),0)+1;

  // ── Item helpers ──
  const updateItem = (id,field,val) => setForm(f=>({...f,items:f.items.map(it=>{
    if(it.id!==id) return it;
    const u = {...it,[field]:val};
    if(field==="productId"){ const p=products.find(x=>x.id===val); if(p) u.unitPrice=p.price; }
    return u;
  })}));
  const removeItem = id => setForm(f=>({...f,items:f.items.filter(i=>i.id!==id)}));
  // Clic en una tarjeta de producto → añade automáticamente (o incrementa cantidad)
  const addProductToCart = productId => setForm(f=>{
    const product = products.find(p=>p.id===productId); if(!product) return f;
    const existing = f.items.find(i=>i.productId===productId);
    if(existing) return {...f, items:f.items.map(i=> i.id===existing.id ? {...i, qty:n(i.qty)+1} : i)};
    return {...f, items:[...f.items, { id:uid(), productId, qty:1, unitPrice:product.price }]};
  });
  const posCategories = [["all","Todos"], ...categoryOptions.map(c=>[c.id, c.name])];
  const posProducts = products.filter(p=>(posCategory==="all"||p.cat===posCategory) && `${p.name} ${getCategoryName(categoryOptions,p.cat)}`.toLowerCase().includes(posSearch.toLowerCase()));

  const subtotal = form.items.reduce((a,i)=>a+n(i.qty)*n(i.unitPrice),0);
  const discountAmt = form.discountType==="pct" ? subtotal*Math.min(n(form.discount),100)/100 : Math.min(n(form.discount),subtotal);
  const taxAmount = Math.max(0,subtotal-discountAmt)*Math.max(0,n(form.tax))/100;
  const total = Math.max(0,subtotal-discountAmt+taxAmount);

  const openNew = tipo => { setEditing(null); setForm(FORM_RESET(tipo)); setErr(""); setPosSearch(""); setPosCategory("all"); setModal(true); };
  const openEdit = doc => {
    setEditing(doc);
    setForm({
      tipo:doc.tipo, estado:doc.estado, customerId:doc.customerId||"__guest__",
      date:(doc.date||today()).slice(0,10), validUntil:(doc.validUntil||"").slice(0,10), deliveryDate:(doc.deliveryDate||"").slice(0,10),
      items:(doc.items||[]).map(it=>({id:it.id||uid(),productId:it.productId,qty:it.qty,unitPrice:it.unitPrice})),
      discount:doc.discountType==="pct"?(doc.discount&&subtotalOf(doc)?Math.round(doc.discount/subtotalOf(doc)*100):doc.discount):doc.discount,
      discountType:doc.discountType||"pct", tax:doc.tax||"", notes:doc.notes||"", paymentTerms:doc.paymentTerms||"",
    });
    setErr(""); setModal(true);
  };
  const closeForm = () => { setModal(false); setEditing(null); setForm(FORM_RESET(vista)); setErr(""); setPosSearch(""); setPosCategory("all"); };

  function subtotalOf(doc){ return (doc.items||[]).reduce((a,i)=>a+n(i.sub??i.subtotal??(n(i.qty)*n(i.unitPrice))),0); }

  // ── Guardar (crear / editar) ──
  const doSave = async () => {
    setErr("");
    const valid = form.items.filter(i=>i.productId && n(i.qty)>0);
    if(!valid.length){ setErr("Agrega al menos un producto con cantidad."); return; }
    const cust = form.customerId==="__guest__" ? GUEST : customers.find(c=>c.id===form.customerId);
    if(!cust){ setErr("Selecciona un cliente válido."); return; }
    const items = valid.map(it=>{ const p=products.find(x=>x.id===it.productId); const sub=n(it.qty)*n(it.unitPrice); return { id:it.id, productId:it.productId, name:p?.name||"", unit:p?.unit||"", qty:n(it.qty), unitPrice:n(it.unitPrice), sub, subtotal:sub }; });
    const isEdit = Boolean(editing);
    const numero = isEdit ? editing.numero : nextNumero(form.tipo);
    const doc = {
      id: isEdit ? editing.id : generateId(),
      numero, codigo: codigoDoc(form.tipo, numero),
      tipo: form.tipo, estado: form.estado,
      customerId: form.customerId, customerName: cust.name, customerMarket: cust.market||"", customerPhone: cust.phone||"",
      date: form.date, validUntil: form.tipo==="cotizacion" ? (form.validUntil||null) : null,
      deliveryDate: form.tipo==="pedido" ? (form.deliveryDate||null) : null,
      items, subtotal, discount: discountAmt, discountType: form.discountType,
      tax: n(form.tax), taxAmount, total,
      notes: form.notes, paymentTerms: form.paymentTerms,
      convertedToSaleId: editing?.convertedToSaleId||null,
      convertedFromQuoteId: editing?.convertedFromQuoteId||null,
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
    save("pedidos", isEdit ? pedidos.map(p=>p.id===doc.id?doc:p) : [doc, ...pedidos]);
    logAction?.(`${user.name} ${isEdit?"actualizó":"creó"} ${form.tipo==="cotizacion"?"la cotización":"el pedido"} ${doc.codigo}`);
    setVista(form.tipo);
    closeForm();
    flash(`${form.tipo==="cotizacion"?"Cotización":"Pedido"} ${doc.codigo} guardado correctamente.`);
  };

  // ── Cambiar estado ──
  const changeEstado = async (doc, estado) => {
    const prev = pedidos;
    const updated = { ...doc, estado, updatedAt:new Date().toISOString() };
    save("pedidos", pedidos.map(p=>p.id===doc.id?updated:p));
    let result;
    try { result = await pedidosService.updatePedido(doc.id, { estado, updatedAt:updated.updatedAt }, user?.empresa_id); }
    catch (e) { console.warn("Pedido estado Supabase error:", e.message); }
    if (result?._localOnly && isSupabaseUUID(user?.empresa_id)) {
      save("pedidos", prev);
      setErr("⚠ Error Supabase al cambiar el estado. Se revirtió — revisa tu conexión e intenta de nuevo.");
      return;
    }
    logAction?.(`${user.name} cambió ${doc.codigo} a "${estadoMeta(doc.tipo,estado).label}"`);
  };

  // ── Convertir cotización → pedido ──
  const convertToPedido = async doc => {
    const numero = nextNumero("pedido");
    const nuevo = { ...doc, id:generateId(), numero, codigo:codigoDoc("pedido",numero), tipo:"pedido", estado:"pendiente", validUntil:null, deliveryDate:today(), convertedFromQuoteId:doc.id, convertedToSaleId:null, createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() };
    const quoteUpd = { ...doc, estado:"aceptada", updatedAt:new Date().toISOString() };
    let created;
    try { created = await pedidosService.createPedido(nuevo, user); }
    catch (e) { console.warn("convertToPedido Supabase error:", e.message); }
    if (created?._localOnly && isSupabaseUUID(user?.empresa_id)) {
      setErr("⚠ Error Supabase al crear el pedido. No se guardó — revisa tu conexión e intenta de nuevo.");
      return;
    }
    save("pedidos", [nuevo, ...pedidos.map(p=>p.id===doc.id?quoteUpd:p)]);
    const estadoRes = await pedidosService.updatePedido(doc.id, { estado:"aceptada" }, user?.empresa_id).catch(e => { console.warn("convertToPedido estado Supabase error:", e.message); return null; });
    if (estadoRes?._localOnly && isSupabaseUUID(user?.empresa_id)) {
      flash(`Pedido ${nuevo.codigo} creado, pero no se pudo marcar la cotización como aceptada en Supabase (revisa tu conexión).`);
    } else {
      flash(`Cotización convertida en el pedido ${nuevo.codigo}.`);
    }
    logAction?.(`${user.name} convirtió la cotización ${doc.codigo} en el pedido ${nuevo.codigo}`);
    setVista("pedido");
  };

  // ── Convertir pedido → venta (registra y descuenta stock) ──
  const convertToVenta = async doc => {
    if(doc.convertedToSaleId){ setErr("Este pedido ya fue registrado como venta."); return; }
    const prodMap = {};
    doc.items.forEach(it=>{ prodMap[it.productId]=(prodMap[it.productId]||0)+n(it.qty); });
    const newInv = inventory.map(i=>{ const qty=prodMap[i.productId]; return qty?{...i,stock:Math.max(0,i.stock-qty)}:i; });
    const sale = {
      id: generateId(), numero: Date.now(),
      customerId: doc.customerId, customerName: doc.customerName, customerMarket: doc.customerMarket||"",
      date: new Date().toISOString(),
      items: doc.items.map(it=>({ ...it, image:null, original_price:it.unitPrice, sale_price:it.unitPrice, sub:it.sub??it.subtotal, subtotal:it.sub??it.subtotal })),
      subtotal: doc.subtotal, discount: doc.discount, discountType: doc.discountType,
      total: doc.total, paid: 0, debt: doc.total, notes: doc.notes||`Pedido ${doc.codigo}`, paymentMethod:"efectivo", payments:[],
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
    save("sales", [ventaFinal, ...(D.sales||[])]);
    save("inventory", newInv);
    const updated = { ...doc, estado:"entregado", convertedToSaleId:ventaFinal.id, updatedAt:new Date().toISOString() };
    save("pedidos", pedidos.map(p=>p.id===doc.id?updated:p));
    const pedidoRes = await pedidosService.updatePedido(doc.id, { estado:"entregado", convertedToSaleId:ventaFinal.id }, user?.empresa_id)
      .catch(e => { console.warn("convertToVenta pedido estado Supabase error:", e.message); return null; });
    logAction?.(`${user.name} registró la venta del pedido ${doc.codigo} por ${Bs(doc.total)}`);
    onRefreshDashboard?.();
    if (pedidoRes?._localOnly && isSupabaseUUID(user?.empresa_id)) {
      // La venta ya quedó registrada en Supabase; solo no se pudo marcar el pedido como convertido.
      // Avisamos para evitar que alguien lo intente convertir de nuevo y duplique la venta.
      flash(`Venta del pedido ${doc.codigo} registrada, pero no se pudo marcar el pedido como convertido en Supabase. No lo conviertas de nuevo — revisa tu conexión y recarga.`);
    } else {
      flash(`Pedido ${doc.codigo} registrado como venta. Stock descontado.`);
    }
  };

  // ── Duplicar ──
  const duplicate = async doc => {
    const numero = nextNumero(doc.tipo);
    const nuevo = { ...doc, id:generateId(), numero, codigo:codigoDoc(doc.tipo,numero), estado:doc.tipo==="cotizacion"?"borrador":"pendiente", convertedToSaleId:null, convertedFromQuoteId:null, date:today(), createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() };
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

  // ── Eliminar (optimista + reversión si Supabase falla) ──
  const doDelete = async () => {
    if(!deleteTarget) return;
    const target = deleteTarget; const prev = pedidos;
    save("pedidos", pedidos.filter(p=>p.id!==target.id));
    setDeleteTarget(null);
    const res = await pedidosService.deletePedido(target.id, user?.empresa_id);
    if(res && res.ok===false){ save("pedidos", prev); setErr("No se pudo eliminar en Supabase. Se restauró el documento."); return; }
    logAction?.(`${user.name} eliminó ${target.tipo==="cotizacion"?"la cotización":"el pedido"} ${target.codigo}`);
    flash("Documento eliminado.");
  };

  // ── Listado / stats ──
  const stats = useMemo(()=>{
    const cots = pedidos.filter(p=>p.tipo==="cotizacion");
    const peds = pedidos.filter(p=>p.tipo==="pedido");
    const pend = peds.filter(p=>!["entregado","cancelado"].includes(p.estado));
    const aceptadas = cots.filter(p=>p.estado==="aceptada").length;
    return { nCots:cots.length, nPedPend:pend.length, valorPend:pend.reduce((a,p)=>a+n(p.total),0), tasaConv:cots.length?Math.round(aceptadas/cots.length*100):0 };
  },[pedidos]);

  const lista = useMemo(()=> pedidos
    .filter(p=>p.tipo===vista)
    .filter(p=> estadoFilter==="all" || p.estado===estadoFilter)
    .filter(p=> `${p.codigo} ${p.customerName}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a,b)=> new Date(b.createdAt||0) - new Date(a.createdAt||0))
  ,[pedidos, vista, estadoFilter, q]);

  const inp = { width:"100%", padding:"8px 10px", borderRadius:R.md, border:`1px solid ${C.border}`, background:"var(--color-bg-primary)", color:C.text, fontSize:13, fontFamily:FONT, outline:"none" };
  const lbl = { fontSize:11, fontWeight:600, color:C.textMid, marginBottom:4, display:"block", textTransform:"uppercase", letterSpacing:"0.04em" };

  const StatCard = ({ label, value, sub, color }) => (
    <div style={card({ flex:1, minWidth:140 })}>
      <div style={{fontSize:11,color:C.textMid,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.04em"}}>{label}</div>
      <div style={{fontSize:22,fontWeight:800,color:color||C.text,marginTop:4,letterSpacing:"-0.02em"}}>{value}</div>
      {sub&&<div style={{fontSize:11,color:C.textFaint,marginTop:2}}>{sub}</div>}
    </div>
  );

  return (
    <div>
      <Header
        title="Pedidos y Cotizaciones"
        sub={`${stats.nCots} cotizaciones · ${stats.nPedPend} pedidos en curso`}
        action={<>
          <button onClick={()=>openNew("cotizacion")} style={{...mkBtn("ghost"),fontSize:13}}><FileText size={14}/> Nueva cotización</button>
          <button onClick={()=>openNew("pedido")} style={{...mkBtn("primary"),fontSize:13}}><Plus size={14}/> Nuevo pedido</button>
        </>}
      />

      {feedback&&<div style={{...card({marginBottom:12,borderLeft:`3px solid ${C.green}`}),color:C.green,fontWeight:600}}>{feedback}</div>}
      {err&&!modal&&<div style={{...card({marginBottom:12,borderLeft:`3px solid ${C.red}`}),color:C.red,fontWeight:600}}>{err}</div>}

      <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
        <StatCard label="Cotizaciones" value={stats.nCots} color={C.brand}/>
        <StatCard label="Pedidos en curso" value={stats.nPedPend} color={C.amber}/>
        <StatCard label="Valor pedidos activos" value={Bs(stats.valorPend)} color={C.green}/>
        <StatCard label="Tasa de conversión" value={`${stats.tasaConv}%`} sub="cotizaciones aceptadas" color={C.blue}/>
      </div>

      {/* Subtabs */}
      <div style={{display:"flex",gap:6,marginBottom:14,borderBottom:`1px solid ${C.border}`}}>
        {[["cotizacion","Cotizaciones"],["pedido","Pedidos"]].map(([id,label])=>(
          <button key={id} onClick={()=>{ setVista(id); setEstadoFilter("all"); }}
            style={{background:"none",border:"none",cursor:"pointer",padding:"8px 14px",fontSize:13,fontWeight:600,fontFamily:FONT,
              color: vista===id?C.brand:C.textMid, borderBottom: vista===id?`2px solid ${C.brand}`:"2px solid transparent", marginBottom:-1}}>
            {label}
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
        <div style={{flex:1,minWidth:180}}><SearchInput value={q} onChange={setQ} placeholder="Buscar por código o cliente..."/></div>
        <select value={estadoFilter} onChange={e=>setEstadoFilter(e.target.value)} style={{...inp,width:"auto",cursor:"pointer"}}>
          <option value="all">Todos los estados</option>
          {estadosDe(vista).map(e=><option key={e.id} value={e.id}>{e.label}</option>)}
        </select>
      </div>

      {/* Lista */}
      {lista.length===0 ? (
        <Empty icon={vista==="cotizacion"?"📄":"📦"} title={`Sin ${vista==="cotizacion"?"cotizaciones":"pedidos"}`} sub="Crea uno con los botones de arriba." />
      ) : (
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {lista.map(doc=>{
            const em = estadoMeta(doc.tipo, doc.estado);
            return (
              <div key={doc.id} style={card({ padding:"14px 16px" })}>
                <div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap",alignItems:"flex-start"}}>
                  <div style={{minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                      <span style={{fontWeight:700,fontSize:14,color:C.text}}>{doc.codigo}</span>
                      <span style={mkBadge(em.badge)}>{em.label}</span>
                      {doc.convertedToSaleId&&<span style={mkBadge("green")}>Venta registrada</span>}
                    </div>
                    <div style={{fontSize:13,color:C.textMid,marginTop:3}}>{doc.customerName||"Público general"}</div>
                    <div style={{fontSize:11,color:C.textFaint,marginTop:2}}>
                      Emitido {fDate(doc.date)}{doc.tipo==="cotizacion"&&doc.validUntil?` · vence ${fDate(doc.validUntil)}`:""}{doc.tipo==="pedido"&&doc.deliveryDate?` · entrega ${fDate(doc.deliveryDate)}`:""} · {(doc.items||[]).length} ítems
                    </div>
                  </div>
                  <div style={{textAlign:"right",flexShrink:0}}>
                    <div style={{fontSize:18,fontWeight:800,color:C.text,letterSpacing:"-0.02em"}}>{Bs(doc.total)}</div>
                  </div>
                </div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:12,alignItems:"center"}}>
                  <select value={doc.estado} onChange={e=>changeEstado(doc, e.target.value)} title="Cambiar estado"
                    style={{...inp,width:"auto",padding:"5px 8px",fontSize:12,cursor:"pointer"}}>
                    {estadosDe(doc.tipo).map(e=><option key={e.id} value={e.id}>{e.label}</option>)}
                  </select>
                  <button onClick={()=>setPrintDoc(doc)} style={{...mkBtn("subtle"),padding:"5px 10px",fontSize:12}}><Printer size={13}/> Imprimir</button>
                  <button onClick={()=>openEdit(doc)} style={{...mkBtn("subtle"),padding:"5px 10px",fontSize:12}}>Editar</button>
                  <button onClick={()=>duplicate(doc)} style={{...mkBtn("subtle"),padding:"5px 10px",fontSize:12}}><Copy size={13}/> Duplicar</button>
                  {doc.tipo==="cotizacion"
                    ? <button onClick={()=>convertToPedido(doc)} style={{...mkBtn("primary"),padding:"5px 10px",fontSize:12}}><ArrowRight size={13}/> Convertir a pedido</button>
                    : !doc.convertedToSaleId && <button onClick={()=>convertToVenta(doc)} style={{...mkBtn("success"),padding:"5px 10px",fontSize:12}}><ShoppingCart size={13}/> Registrar venta</button>}
                  <button onClick={()=>setDeleteTarget(doc)} style={{...mkBtn("danger"),padding:"5px 10px",fontSize:12}}><Trash2 size={13}/></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal formulario */}
      {modal&&<Modal title={`${editing?"Editar":"Nueva"} ${form.tipo==="cotizacion"?"cotización":"pedido"}`} onClose={closeForm} width={640}>
        {err&&<div style={{fontSize:12.5,color:C.red,marginBottom:12,padding:"8px 10px",background:C.redBg,borderRadius:R.md}}>{err}</div>}

        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:12,marginBottom:12}}>
          <div>
            <label style={lbl}>Tipo de documento</label>
            <select value={form.tipo} onChange={e=>setForm(f=>({...f,tipo:e.target.value,estado:e.target.value==="cotizacion"?"borrador":"pendiente"}))} style={{...inp,cursor:"pointer"}} disabled={Boolean(editing)}>
              <option value="cotizacion">Cotización</option>
              <option value="pedido">Pedido</option>
            </select>
          </div>
          <div>
            <label style={lbl}>Estado</label>
            <select value={form.estado} onChange={e=>setForm(f=>({...f,estado:e.target.value}))} style={{...inp,cursor:"pointer"}}>
              {estadosDe(form.tipo).map(e=><option key={e.id} value={e.id}>{e.label}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Cliente</label>
            <select value={form.customerId} onChange={e=>setForm(f=>({...f,customerId:e.target.value}))} style={{...inp,cursor:"pointer"}}>
              <option value="__guest__">Público general</option>
              {customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Fecha de emisión</label>
            <input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} style={inp}/>
          </div>
          {form.tipo==="cotizacion"
            ? <div><label style={lbl}>Válida hasta</label><input type="date" value={form.validUntil} onChange={e=>setForm(f=>({...f,validUntil:e.target.value}))} style={inp}/></div>
            : <div><label style={lbl}>Fecha de entrega</label><input type="date" value={form.deliveryDate} onChange={e=>setForm(f=>({...f,deliveryDate:e.target.value}))} style={inp}/></div>}
        </div>

        {/* Selector de productos tipo POS — con imagen, clic para añadir */}
        <label style={lbl}>Productos {form.items.length>0&&<span style={{color:C.brand}}>· {form.items.length} en el carrito</span>}</label>
        <div style={{border:`1px solid ${C.border}`,borderRadius:R.lg,padding:10,marginBottom:10,background:"var(--color-bg-primary)"}}>
          <div style={{position:"relative",marginBottom:8}}>
            <Search size={14} style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)",color:C.textFaint}}/>
            <input value={posSearch} onChange={e=>setPosSearch(e.target.value)} placeholder="Buscar producto..." style={{...inp,paddingLeft:28}}/>
          </div>
          <div style={{display:"flex",gap:5,overflowX:"auto",marginBottom:8,paddingBottom:2}}>
            {posCategories.map(([v,l])=>(
              <button key={v} type="button" onClick={()=>setPosCategory(v)} style={{...mkBtn(posCategory===v?"primary":"subtle"),padding:"4px 10px",fontSize:11,flexShrink:0}}>{l}</button>
            ))}
          </div>
          <div style={{maxHeight:240,overflowY:"auto"}}>
            <div style={{display:"grid",gridTemplateColumns:isMobile?"repeat(2,1fr)":"repeat(3,1fr)",gap:8}}>
              {posProducts.length===0?(
                <div style={{gridColumn:"1/-1",textAlign:"center",padding:20,color:C.textFaint,fontSize:12}}>Sin productos</div>
              ):posProducts.map(product=>{
                const inCart=form.items.find(i=>i.productId===product.id);
                return(
                  <button key={product.id} type="button" onClick={()=>addProductToCart(product.id)}
                    style={{...card({padding:0,overflow:"hidden",cursor:"pointer"}),border:`1.5px solid ${inCart?C.brand:C.border}`,textAlign:"left",outline:"none",transition:"border-color 0.12s"}}
                    onMouseEnter={e=>e.currentTarget.style.borderColor=C.brand}
                    onMouseLeave={e=>e.currentTarget.style.borderColor=inCart?C.brand:C.border}>
                    <div style={{height:70,background:`linear-gradient(135deg,${C.blueBg},${C.bg})`,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",position:"relative"}}>
                      {product.img?<img src={product.img} alt={product.name} style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<BrandLogo size={28}/>}
                      {inCart&&<div style={{position:"absolute",top:4,right:4,background:C.brand,color:"white",borderRadius:"50%",width:20,height:20,fontSize:10,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>{inCart.qty}</div>}
                    </div>
                    <div style={{padding:"6px 8px"}}>
                      <div style={{fontWeight:600,fontSize:12,lineHeight:1.3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{product.name}</div>
                      <div style={{fontSize:13,fontWeight:800,color:C.brand,marginTop:2}}>{Bs(product.price)}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Carrito: ítems seleccionados (editar cantidad/precio) */}
        {form.items.length>0
          ? <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:14}}>
              {form.items.map(it=>{
                const p=products.find(x=>x.id===it.productId);
                return(
                  <div key={it.id} style={{display:"flex",gap:8,alignItems:"center",padding:"6px 8px",borderRadius:R.md,background:"var(--color-bg-primary)"}}>
                    <div style={{width:34,height:34,borderRadius:6,overflow:"hidden",flexShrink:0,background:C.blueBg,display:"flex",alignItems:"center",justifyContent:"center"}}>
                      {p?.img?<img src={p.img} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<BrandLogo size={18}/>}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12.5,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p?.name||"Producto"}</div>
                      <div style={{fontSize:11,color:C.textFaint}}>{Bs(n(it.qty)*n(it.unitPrice))}</div>
                    </div>
                    <input type="number" min="0" value={it.qty} onChange={e=>updateItem(it.id,"qty",e.target.value)} title="Cantidad" style={{...inp,width:58,padding:"5px 6px"}}/>
                    <input type="number" min="0" step="0.01" value={it.unitPrice} onChange={e=>updateItem(it.id,"unitPrice",e.target.value)} title="Precio unitario" style={{...inp,width:84,padding:"5px 6px"}}/>
                    <button onClick={()=>removeItem(it.id)} style={{background:"none",border:"none",cursor:"pointer",color:C.red,display:"flex",padding:4}}><Trash2 size={15}/></button>
                  </div>
                );
              })}
            </div>
          : <div style={{fontSize:12,color:C.textFaint,marginBottom:14,textAlign:"center",padding:"8px"}}>Toca un producto para agregarlo al {form.tipo==="cotizacion"?"presupuesto":"pedido"}.</div>}

        {/* Descuento / impuesto */}
        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"1fr 1fr 1fr",gap:12,marginBottom:12}}>
          <div>
            <label style={lbl}>Descuento</label>
            <div style={{display:"flex",gap:4}}>
              <input type="number" min="0" value={form.discount} onChange={e=>setForm(f=>({...f,discount:e.target.value}))} placeholder="0" style={{...inp,flex:1}}/>
              <select value={form.discountType} onChange={e=>setForm(f=>({...f,discountType:e.target.value}))} style={{...inp,width:64,cursor:"pointer",padding:"8px 4px"}}>
                <option value="pct">%</option>
                <option value="amount">{getCurrencySymbol()}</option>
              </select>
            </div>
          </div>
          <div>
            <label style={lbl}>Impuesto (%)</label>
            <input type="number" min="0" value={form.tax} onChange={e=>setForm(f=>({...f,tax:e.target.value}))} placeholder="0" style={inp}/>
          </div>
          <div>
            <label style={lbl}>Condiciones de pago</label>
            <input value={form.paymentTerms} onChange={e=>setForm(f=>({...f,paymentTerms:e.target.value}))} placeholder="Ej: 50% anticipo" style={inp}/>
          </div>
        </div>

        <div style={{marginBottom:12}}>
          <label style={lbl}>Notas / observaciones</label>
          <textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={2} placeholder="Detalles adicionales…" style={{...inp,resize:"vertical"}}/>
        </div>

        {/* Totales */}
        <div style={{background:"var(--color-bg-primary)",borderRadius:R.lg,padding:"12px 14px",marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"3px 0"}}><span style={{color:C.textMid}}>Subtotal</span><span style={{fontWeight:600}}>{Bs(subtotal)}</span></div>
          {discountAmt>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"3px 0"}}><span style={{color:C.textMid}}>Descuento</span><span style={{fontWeight:600,color:C.red}}>-{Bs(discountAmt)}</span></div>}
          {taxAmount>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"3px 0"}}><span style={{color:C.textMid}}>Impuesto ({n(form.tax)}%)</span><span style={{fontWeight:600}}>{Bs(taxAmount)}</span></div>}
          <div style={{display:"flex",justifyContent:"space-between",fontSize:16,fontWeight:800,marginTop:6,paddingTop:8,borderTop:`1px solid ${C.border}`}}><span>Total</span><span style={{color:C.brand}}>{Bs(total)}</span></div>
        </div>

        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <button onClick={closeForm} style={mkBtn("ghost")}>Cancelar</button>
          <button onClick={doSave} style={mkBtn("primary")}>{editing?"Guardar cambios":`Crear ${form.tipo==="cotizacion"?"cotización":"pedido"}`}</button>
        </div>
      </Modal>}

      {/* Eliminar */}
      {deleteTarget&&<Modal title="Eliminar documento" onClose={()=>setDeleteTarget(null)} width={420}>
        <div style={{fontSize:13,color:C.textMid,marginBottom:16}}>Se eliminará <strong style={{color:C.text}}>{deleteTarget.codigo}</strong> de {deleteTarget.customerName||"Público general"}. Esta acción no se puede deshacer.</div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <button onClick={()=>setDeleteTarget(null)} style={mkBtn("ghost")}>Cancelar</button>
          <button onClick={doDelete} style={mkBtn("danger")}>Eliminar</button>
        </div>
      </Modal>}

      {/* Imprimir */}
      {printDoc&&<DocumentoModal doc={printDoc} config={config} onClose={()=>setPrintDoc(null)}/>}
    </div>
  );
}

function Ventas({ D, save, user, config, logAction, onRefreshDashboard }) {
  const { sales, customers, products, inventory, categories } = D;
  const isMobile=useIsMobile();
  const [filter,setFilter]=useState("all"); const [q,setQ]=useState(""); const [modal,setModal]=useState(null); const [detail,setDetail]=useState(null);
  const [deleteTarget,setDeleteTarget]=useState(null); const [payAmt,setPayAmt]=useState(""); const [err,setErr]=useState(""); const [feedback,setFeedback]=useState(""); const [deleting,setDeleting]=useState(false);
  const [posCategory,setPosCategory]=useState("all"); const [posSearch,setPosSearch]=useState(""); const [barcodeInput,setBarcodeInput]=useState("");
  const [showNewCust,setShowNewCust]=useState(false); const [newCustName,setNewCustName]=useState(""); const [newCustPhone,setNewCustPhone]=useState("");
  const [comprobanteVenta,setComprobanteVenta]=useState(null);
  const [paso,setPaso]=useState(1);
  const barcodeRef=useRef(null);
  const [form,setForm]=useState({customerId:"__guest__",date:today(),items:[],paid:"",notes:"",paymentMethod:"efectivo",discount:"",discountType:"pct"});
  const FORM_RESET=()=>({customerId:"__guest__",date:today(),items:[],paid:"",notes:"",paymentMethod:"efectivo",discount:"",discountType:"pct"});
  const categoryOptions = categories.length ? categories : DEFAULT_CATEGORIES;
  const posCategories = [["all","Todos"], ...categoryOptions.map(c => [c.id, c.name])];
  const canDeleteSales = isAdmin(user);
  const GUEST = { id:"__guest__", name:"Público general", market:"", phone:"" };

  const getStock=id=>(inventory.find(i=>i.productId===id)||{}).stock||0;
  const updateItem=(id,field,val)=>setForm(f=>({...f,items:f.items.map(it=>{ if(it.id!==id)return it; const u={...it,[field]:val}; if(field==="productId"){const p=products.find(p=>p.id===val);if(p){u.unitPrice=p.price;u.original_price=p.price;}} if(field==="unitPrice"&&!u.original_price)u.original_price=it.unitPrice||it.original_price; const sub=n(u.qty)*n(u.unitPrice); return {...u,sub,subtotal:sub}; })}));
  const addItem=()=>setForm(f=>({...f,items:[...f.items,SALE_BASE_ITEM()]}));
  const addProductToCart=productId=>setForm(f=>{
    const product=products.find(item=>item.id===productId); if(!product)return f;
    const existing=f.items.find(item=>item.productId===productId);
    if(existing){
      return {...f,items:f.items.map(item=>{ if(item.id!==existing.id)return item; const qty=n(item.qty)+1; const sub=qty*n(item.unitPrice||product.price); return {...item,qty,unitPrice:n(item.unitPrice||product.price),sub,subtotal:sub}; })};
    }
    const sub=n(product.price);
    return {...f,items:[...f.items,{id:uid(),productId,qty:1,unitPrice:sub,original_price:sub,sub,subtotal:sub}]};
  });
  const removeItem=id=>setForm(f=>({...f,items:f.items.filter(i=>i.id!==id)}));
  const subtotalItems=form.items.reduce((a,i)=>a+n(i.sub??i.subtotal),0);
  const discountAmt=form.discountType==="pct"?subtotalItems*Math.min(n(form.discount),100)/100:Math.min(n(form.discount),subtotalItems);
  const total=Math.max(0,subtotalItems-discountAmt);
  const paidN=n(form.paid);
  const debtN=Math.max(0,total-paidN);

  const closeModal=()=>{ setModal(null); setErr(""); setPosCategory("all"); setPosSearch(""); setBarcodeInput(""); setShowNewCust(false); setNewCustName(""); setNewCustPhone(""); setForm(FORM_RESET()); setPaso(1); };

  const handleBarcode=e=>{
    if(e.key!=="Enter"||!barcodeInput.trim())return;
    const q2=barcodeInput.trim().toLowerCase();
    const p=products.find(x=>(x.barcode&&x.barcode===barcodeInput.trim())||x.name.toLowerCase()===q2);
    if(p){addProductToCart(p.id);setBarcodeInput("");}
    else{setErr(`Producto "${barcodeInput.trim()}" no encontrado`);setBarcodeInput("");}
  };

  const doCreateCustomer=()=>{
    if(!newCustName.trim())return;
    const nc={id:generateId(),name:newCustName.trim(),phone:newCustPhone.trim(),market:"",createdAt:new Date().toISOString()};
    save("customers",[nc,...(D.customers||[])]);
    setForm(f=>({...f,customerId:nc.id}));
    setShowNewCust(false); setNewCustName(""); setNewCustPhone("");
  };

  const doSave = async () => {
    setErr("");
    const valid = form.items.filter(i=>i.productId && n(i.qty)>0);
    if(!valid.length){setErr("Agrega al menos un producto");return;}
    const cust = form.customerId==="__guest__" ? GUEST : customers.find(c=>c.id===form.customerId);
    if(!cust){setErr("Cliente no encontrado");return;}
    const prod_map = {};
    valid.forEach(it=>{ prod_map[it.productId]=(prod_map[it.productId]||0)+n(it.qty); });
    const lowStockItems = Object.entries(prod_map).filter(([id,qty])=>qty>getStock(id));
    if(lowStockItems.length>0 && !window._stockWarningConfirmed){
      window._stockWarningConfirmed=true;
      setErr("⚠️ Stock insuficiente en algunos productos. Pulsa 'Finalizar venta' de nuevo para continuar de todos modos.");
      return;
    }
    window._stockWarningConfirmed=false;
    const newInv = inventory.map(i=>{ const qty=prod_map[i.productId]; return qty?{...i,stock:Math.max(0,i.stock-qty)}:i; });
    const sale = {
      id: generateId(),
      numero:Date.now(), customerId:form.customerId, customerName:cust.name, customerMarket:cust.market,
      date:new Date(form.date+"T12:00:00").toISOString(),
      items:valid.map(it=>{ const product=products.find(p=>p.id===it.productId); const sub=n(it.sub??it.subtotal); return {...it,name:product?.name||"",unit:product?.unit||"",image:product?.img||null,sub,subtotal:sub,original_price:it.original_price||it.unitPrice,sale_price:it.unitPrice}; }),
      subtotal:subtotalItems, discount:discountAmt, discountType:form.discountType,
      total, paid:paidN, debt:debtN, notes:form.notes, paymentMethod:form.paymentMethod,
      payments:paidN>0?[{amount:paidN,method:form.paymentMethod,date:new Date().toISOString()}]:[],
      createdAt:new Date().toISOString(), empresa_id:user.empresa_id
    };
    let ventaFinal = { ...sale };
    try {
      const nueva = await ventasService.createVenta(sale, user);
      if (nueva?.id) ventaFinal = { ...sale, id: nueva.id };
      if (nueva?._localOnly && isSupabaseUUID(user?.empresa_id)) {
        setErr("⚠ Error Supabase al guardar venta. Revisa la consola (F12) para ver el detalle.");
        return;
      }
    } catch(e) { console.warn("Venta Supabase error:", e.message); }
    save("sales",[ventaFinal,...(sales||[])]); save("inventory",newInv);
    logAction?.(`${user.name} realizó una venta de ${Bs(total)} a ${cust.name}`);
    setFeedback("✓ Venta registrada"); setTimeout(()=>setFeedback(""),4000);
    closeModal();
    setComprobanteVenta(ventaFinal);
  };

  const doPayment=async()=>{
    if(!detail)return; const amt=Math.min(n(payAmt),detail.debt); if(amt<=0)return;
    const updated=sales.map(s=>s.id===detail.id?{...s,paid:s.paid+amt,debt:Math.max(0,s.debt-amt),payments:[...(s.payments||[]),{amount:amt,date:new Date().toISOString()}]}:s);
    const ventaActualizada=updated.find(s=>s.id===detail.id);
    setErr("");
    let result;
    try { result = await ventasService.updateVenta(detail.id,ventaActualizada,user?.empresa_id); }
    catch(e) { console.warn("Cobro Supabase error:", e.message); }
    if (result?._localOnly && isSupabaseUUID(user?.empresa_id)) {
      setErr("⚠ Error Supabase al registrar el cobro. El pago no se guardó — revisa tu conexión e intenta de nuevo.");
      return;
    }
    save("sales",updated); setDetail(ventaActualizada); setPayAmt("");
    logAction?.(`${user.name} registró un cobro de ${Bs(amt)} para la venta ${detail.id}`);
  };

  const doDeleteSale=async()=>{
    if(!deleteTarget||deleting)return;
    const target=deleteTarget;
    // Guardamos el estado previo por si hay que revertir
    const prevSales=sales;
    const prevInventory=inventory;
    setDeleting(true); setErr("");
    // 1) Actualización OPTIMISTA: la UI reacciona al instante
    save("sales",sales.filter(s=>s.id!==target.id));
    save("inventory",restoreInventoryFromSale(inventory,target));
    if(detail?.id===target.id)setDetail(null);
    setDeleteTarget(null);
    logAction?.(`${user.name} eliminó la venta ${target.id} por ${Bs(target.total)}`);
    setFeedback("Venta eliminada y stock restaurado."); setTimeout(()=>setFeedback(""),4000);
    // 2) Confirmar con Supabase en segundo plano (no bloquea la UI)
    try{
      const res=await ventasService.deleteVenta(target.id,user?.empresa_id);
      if(res&&res.ok===false){
        // Revertir: el borrado no se aplicó en la nube
        save("sales",prevSales);
        save("inventory",prevInventory);
        setFeedback(""); setErr("⚠ No se pudo eliminar la venta en Supabase. Se restauró. Revisa tu conexión (F12).");
      }else{
        // 3) Refrescar dashboard con el estado ya confirmado en la nube
        onRefreshDashboard?.();
      }
    }catch(e){
      console.error("[Ventas] doDeleteSale:",e?.message);
      save("sales",prevSales);
      save("inventory",prevInventory);
      setFeedback(""); setErr("⚠ Error al eliminar la venta. Se restauró el estado anterior.");
    }finally{
      setDeleting(false);
    }
  };

  const filtered=sales.filter(s=>{ const mq=`${s.customerName} ${s.customerMarket}`.toLowerCase().includes(q.toLowerCase()); const mf=filter==="all"||(filter==="pending"&&s.debt>0)||(filter==="paid"&&s.debt===0); return mq&&mf; }).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  const posProducts=products.filter(product=>(posCategory==="all"||product.cat===posCategory)&&`${product.name} ${getCategoryName(categoryOptions,product.cat)}`.toLowerCase().includes(posSearch.toLowerCase()));

  // ── Detalle de venta ──────────────────────────────────────────
  if(detail){
    const sale=sales.find(s=>s.id===detail.id)||detail;
    const pmLabel={efectivo:"Efectivo",transferencia:"Transferencia",qr:"QR",mixto:"Mixto"}[sale.paymentMethod]||"—";
    return (
      <div>
        <button onClick={()=>setDetail(null)} style={{...mkBtn("ghost"),marginBottom:16}}>← Volver</button>
        <div style={card()}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14,flexWrap:"wrap",gap:10}}>
            <div>
              <div style={{fontSize:19,fontWeight:700,letterSpacing:"-0.03em"}}>{sale.customerName}</div>
              <div style={{fontSize:13,color:C.textMid}}>{sale.customerMarket&&`${sale.customerMarket} · `}{fDate(sale.date)}</div>
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
              {sale.paymentMethod&&<span style={mkBadge(PM_COLORS[sale.paymentMethod]||"default")}>{PM_LABELS[sale.paymentMethod]||sale.paymentMethod}</span>}
              <span style={mkBadge(sale.debt>0?"amber":"green")}>{sale.debt>0?"Pendiente":"Saldado"}</span>
              <button onClick={()=>downloadSaleReceipt({sale,config,user})} style={mkBtn("ghost")}>PDF</button>
              {canDeleteSales&&<button onClick={()=>setDeleteTarget(sale)} style={mkBtn("danger")}>Eliminar</button>}
            </div>
          </div>
          <Table cols={[{key:"name",label:"Producto"},{key:"qty",label:"Cant.",render:(v,row)=>`${v} ${row.unit}`},{key:"unitPrice",label:"Precio unit.",render:v=>Bs(v)},{key:"sub",label:"Subtotal",render:v=><strong>{Bs(v)}</strong>}]} rows={sale.items}/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,padding:"12px",background:C.bg,borderRadius:R.md,marginTop:12,marginBottom:12}}>
            {[["Total",Bs(sale.total),C.red],["Pagado",Bs(sale.paid),C.green],["Deuda",Bs(sale.debt),sale.debt>0?C.amber:C.green]].map(([l,v,c])=>(
              <div key={l}><div style={{...lbl}}>{l}</div><div style={{fontWeight:700,color:c,fontSize:15}}>{v}</div></div>
            ))}
          </div>
          {sale.notes&&<div style={{fontSize:13,color:C.textMid,marginBottom:12}}>Notas: {sale.notes}</div>}
          {sale.debt>0&&<div style={{borderTop:`1px solid ${C.border}`,paddingTop:14}}>
            <div style={{fontWeight:700,fontSize:13,marginBottom:8}}>Registrar cobro</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <input type="number" min="0" step="0.5" style={{...inp,width:140}} value={payAmt} onChange={e=>setPayAmt(e.target.value)} placeholder="Monto en Bs."/>
              <button onClick={doPayment} style={mkBtn("primary")}>Registrar cobro</button>
              <button onClick={()=>setPayAmt(sale.debt.toFixed(2))} style={mkBtn("ghost")}>Cobrar todo ({Bs(sale.debt)})</button>
            </div>
          </div>}
          {(sale.payments||[]).length>0&&<div style={{marginTop:12}}>
            <div style={{...lbl,marginBottom:6}}>Historial de pagos</div>
            {sale.payments.map((p,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"5px 0",borderBottom:`1px solid ${C.border}`}}>
              <span style={{color:C.textMid}}>{fDate(p.date)}{p.method&&` · ${pmLabel}`}</span><span style={{color:C.green,fontWeight:600}}>{Bs(p.amount)}</span>
            </div>)}
          </div>}
        </div>
        {deleteTarget&&<Modal title="Eliminar venta" onClose={()=>setDeleteTarget(null)} width={420}>
          <div style={{fontSize:13,color:C.textMid,marginBottom:16}}>Esta acción eliminará la venta y restaurará el stock al inventario.</div>
          {err&&<div style={{fontSize:12.5,color:C.red,marginBottom:12}}>{err}</div>}
          <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
            <button onClick={()=>setDeleteTarget(null)} disabled={deleting} style={mkBtn("ghost")}>Cancelar</button>
            <button onClick={doDeleteSale} disabled={deleting} style={{...mkBtn("danger"),opacity:deleting?0.6:1}}>{deleting?"Eliminando…":"Eliminar"}</button>
          </div>
        </Modal>}
      </div>
    );
  }

  // ── Lista de ventas ───────────────────────────────────────────
  return (
    <div>
      <Header title="Ventas" sub={`${sales.length} ventas registradas`} action={<button onClick={()=>setModal("new")} style={{...mkBtn("primary"),fontSize:14,padding:"9px 18px"}}>+ Nueva venta</button>}/>
      {feedback&&<div style={{...card({marginBottom:12,borderLeft:`3px solid ${C.green}`}),color:C.green,fontWeight:600}}>{feedback}</div>}
      {err&&<div style={{...card({marginBottom:12,borderLeft:`3px solid ${C.red}`}),color:C.red,fontWeight:600}}>{err}</div>}
      <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
        <SearchInput value={q} onChange={setQ} placeholder="Buscar cliente..."/>
        <Chip value={filter} onChange={setFilter} options={[["all","Todas"],["pending","Pendientes"],["paid","Saldadas"]]}/>
      </div>
      {filtered.length===0?<Empty icon="🛒" title="Sin ventas" sub={sales.length===0?"Registra tu primera venta":"Sin resultados"} action={sales.length===0&&<button onClick={()=>setModal("new")} style={mkBtn("primary")}>+ Registrar venta</button>}/>:
        filtered.map(s=>(
          <div key={s.id||s.numero} onClick={()=>setDetail(s)} style={{...card(),cursor:"pointer",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}} onMouseEnter={e=>e.currentTarget.style.borderColor=C.borderMid} onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
            <div style={{minWidth:0}}>
              <div style={{fontWeight:600,fontSize:14}}>{s.customerName}</div>
              <div style={{fontSize:12,color:C.textMid,display:"flex",gap:6,flexWrap:"wrap"}}>
                <span>{fDate(s.date)}</span>
                <span>·</span><span>{s.items.length} producto{s.items.length!==1?"s":""}</span>
                {s.paymentMethod&&<><span>·</span><span>{PM_LABELS[s.paymentMethod]||s.paymentMethod}</span></>}
              </div>
            </div>
            <div style={{textAlign:"right",flexShrink:0}}>
              <div style={{fontSize:16,fontWeight:800,color:C.red,letterSpacing:"-0.03em"}}>{Bs(s.total)}</div>
              <div style={{display:"flex",gap:6,justifyContent:"flex-end",alignItems:"center",marginTop:4}}>
                {s.debt>0?<span style={mkBadge("amber")}>Debe {Bs(s.debt)}</span>:<span style={mkBadge("green")}>Saldado</span>}
                {canDeleteSales&&<button onClick={ev=>{ev.stopPropagation();setDeleteTarget(s);}} style={{...mkBtn("danger"),padding:"4px 8px",fontSize:11}}>×</button>}
              </div>
            </div>
          </div>
        ))}

      {/* ── POS PREMIUM ─────────────────────────────────────────── */}
      {modal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",zIndex:250,display:"flex",alignItems:"center",justifyContent:"center",padding:isMobile?"0":"16px",backdropFilter:"blur(4px)"}}>
          <div style={{display:"flex",flexDirection:"column",width:"100%",maxWidth:1060,maxHeight:isMobile?"100vh":"96vh",background:C.surface,borderRadius:isMobile?0:R.xl,overflow:"hidden",boxShadow:"0 32px 80px rgba(0,0,0,0.22)"}}>

            {isMobile ? (
              /* ── MOBILE: 2-step flow ── */
              paso===1 ? (
                <>
                  {/* Step 1 header */}
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",background:C.sidebar,color:"white",flexShrink:0}}>
                    <button onClick={closeModal} style={{background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.15)",color:"white",borderRadius:R.md,padding:"5px 10px",cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",gap:4,fontFamily:FONT}}>
                      <X size={12}/> Cancelar
                    </button>
                    <span style={{fontWeight:700,fontSize:14}}>Nueva Venta — POS</span>
                    <span style={{fontSize:11,opacity:0.5}}>{fDate(form.date)}</span>
                  </div>
                  {/* Step indicator */}
                  <div style={{display:"flex",gap:4,padding:"7px 14px",background:"var(--color-bg-primary)",flexShrink:0}}>
                    <div style={{flex:1,height:3,borderRadius:3,background:C.brand}}/>
                    <div style={{flex:1,height:3,borderRadius:3,background:"var(--color-border)"}}/>
                  </div>
                  {err&&<div style={{background:C.redBg,borderBottom:`1px solid ${C.redMid}`,color:C.red,padding:"6px 16px",fontSize:12,flexShrink:0}}>{err}</div>}
                  {/* Search + camera */}
                  <div style={{padding:"8px 12px",borderBottom:`1px solid ${C.border}`,flexShrink:0,display:"flex",gap:6}}>
                    <div style={{position:"relative",flex:1}}>
                      <Search size={13} style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)",color:C.textFaint,pointerEvents:"none"}}/>
                      <input value={posSearch} onChange={e=>setPosSearch(e.target.value)} placeholder="Buscar producto..." style={{...inp,paddingLeft:28,margin:0,fontSize:13}}/>
                    </div>
                    <BarcodeScannerButton onScan={code=>{ const p=products.find(x=>x.barcode===code||x.name.toLowerCase()===code.toLowerCase()); if(p)addProductToCart(p.id); else setErr(`Código "${code}" no encontrado`); }}/>
                  </div>
                  {/* Category chips */}
                  <div style={{padding:"6px 12px",borderBottom:`1px solid ${C.border}`,flexShrink:0,display:"flex",gap:6,overflowX:"auto"}}>
                    {posCategories.map(([v,l])=>(
                      <button key={v} onClick={()=>setPosCategory(v)} style={{...mkBtn(posCategory===v?"primary":"subtle"),padding:"4px 10px",fontSize:11,flexShrink:0}}>{l}</button>
                    ))}
                  </div>
                  {/* Product grid — fills height */}
                  <div style={{flex:1,overflowY:"auto",padding:"10px 12px"}}>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10}}>
                      {posProducts.length===0?(
                        <div style={{gridColumn:"1/-1",textAlign:"center",padding:24,color:C.textFaint,fontSize:12}}>Sin productos</div>
                      ):posProducts.map(product=>{
                        const stock=getStock(product.id);
                        const inCart=form.items.find(i=>i.productId===product.id);
                        return(
                          <button key={product.id} onClick={()=>addProductToCart(product.id)}
                            style={{...card({padding:0,overflow:"hidden",cursor:"pointer",border:`1.5px solid ${inCart?C.brand:C.border}`,transition:"all 0.12s"}),textAlign:"left",outline:"none"}}
                            onMouseEnter={e=>e.currentTarget.style.borderColor=C.brand}
                            onMouseLeave={e=>e.currentTarget.style.borderColor=inCart?C.brand:C.border}>
                            <div style={{height:80,background:`linear-gradient(135deg,${C.blueBg},${C.bg})`,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",position:"relative"}}>
                              {product.img?<img src={product.img} alt={product.name} style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<BrandLogo size={32}/>}
                              {inCart&&<div style={{position:"absolute",top:4,right:4,background:C.brand,color:"white",borderRadius:"50%",width:20,height:20,fontSize:10,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>{inCart.qty}</div>}
                              {stock===0&&<div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.52)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:"white",fontWeight:700,letterSpacing:"0.03em"}}>AGOTADO</div>}
                            </div>
                            <div style={{padding:"7px 8px"}}>
                              <div style={{fontWeight:600,fontSize:12,lineHeight:1.3,marginBottom:4,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{product.name}</div>
                              <div style={{fontSize:14,fontWeight:800,color:C.red}}>{Bs(product.price)}</div>
                              {product.minStock>0&&stock<=product.minStock&&stock>0&&<div style={{fontSize:9,color:C.amber}}>⚠ {stock} {product.unit}</div>}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {/* Bottom bar: summary + Continuar */}
                  <div style={{background:"var(--color-bg-surface)",borderTop:`1px solid ${C.border}`,padding:"10px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
                    <div>
                      <div style={{fontSize:11,color:C.textFaint}}>{form.items.length} {form.items.length===1?"producto":"productos"} · {form.items.reduce((a,i)=>a+n(i.qty),0)} uds.</div>
                      <div style={{fontSize:19,fontWeight:800,color:C.brand,letterSpacing:"-0.03em"}}>{Bs(total)}</div>
                    </div>
                    <button onClick={()=>{if(form.items.length>0)setPaso(2);}}
                      disabled={form.items.length===0}
                      style={{display:"flex",alignItems:"center",gap:6,padding:"11px 20px",background:form.items.length>0?C.brand:"#ccc",color:"white",border:"none",borderRadius:R.md,cursor:form.items.length>0?"pointer":"not-allowed",fontWeight:700,fontSize:14,fontFamily:FONT,transition:"background 0.15s"}}>
                      Continuar <ChevronRight size={16}/>
                    </button>
                  </div>
                </>
              ) : (
                /* Step 2: Details + payment */
                <>
                  {/* Step 2 header */}
                  <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 16px",background:C.sidebar,color:"white",flexShrink:0}}>
                    <button onClick={()=>setPaso(1)} style={{background:"rgba(255,255,255,0.1)",border:"none",color:"white",borderRadius:8,padding:"6px 8px",cursor:"pointer",display:"flex",alignItems:"center"}}>
                      <ChevronLeft size={16}/>
                    </button>
                    <div style={{flex:1,fontWeight:700,fontSize:14,textAlign:"center"}}>Detalles de venta</div>
                    <span style={{fontSize:11,opacity:0.5}}>{fDate(form.date)}</span>
                  </div>
                  {/* Step indicator */}
                  <div style={{display:"flex",gap:4,padding:"7px 14px",background:"var(--color-bg-primary)",flexShrink:0}}>
                    <div style={{flex:1,height:3,borderRadius:3,background:C.brand}}/>
                    <div style={{flex:1,height:3,borderRadius:3,background:C.brand}}/>
                  </div>
                  {err&&<div style={{background:C.redBg,borderBottom:`1px solid ${C.redMid}`,color:C.red,padding:"6px 16px",fontSize:12,flexShrink:0}}>{err}</div>}
                  {/* Scrollable content */}
                  <div style={{flex:1,overflowY:"auto",padding:"12px",display:"flex",flexDirection:"column",gap:10}}>
                    {/* Customer + date */}
                    <div style={{...card(),padding:"14px"}}>
                      <div style={{fontSize:10,fontWeight:700,color:C.textFaint,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:10}}>Cliente y fecha</div>
                      {showNewCust?(
                        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                          <input value={newCustName} onChange={e=>setNewCustName(e.target.value)} placeholder="Nombre cliente *" style={{...inp,margin:0,flex:1,minWidth:100,fontSize:13}} autoFocus/>
                          <input value={newCustPhone} onChange={e=>setNewCustPhone(e.target.value)} placeholder="Teléfono" style={{...inp,margin:0,width:120,fontSize:13}}/>
                          <div style={{display:"flex",gap:6}}>
                            <button onClick={doCreateCustomer} style={{...mkBtn("primary"),fontSize:13}}>Crear</button>
                            <button onClick={()=>setShowNewCust(false)} style={{...mkBtn("ghost"),fontSize:13}}>✕</button>
                          </div>
                        </div>
                      ):(
                        <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:8}}>
                          <select style={{...inp,margin:0,flex:1,fontSize:13}} value={form.customerId} onChange={e=>setForm(f=>({...f,customerId:e.target.value}))}>
                            <option value="__guest__">👤 Público general</option>
                            {customers.map(c=><option key={c.id} value={c.id}>{c.name}{c.market?` · ${c.market}`:""}</option>)}
                          </select>
                          <button onClick={()=>setShowNewCust(true)} style={{...mkBtn("ghost"),fontSize:12,padding:"6px 9px",flexShrink:0}}>+ Cliente</button>
                        </div>
                      )}
                      <input type="date" style={{...inp,margin:0,fontSize:13}} value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/>
                    </div>
                    {/* Cart items */}
                    <div style={{...card(),padding:"14px"}}>
                      <div style={{fontSize:10,fontWeight:700,color:C.textFaint,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:10}}>Productos seleccionados</div>
                      {form.items.map(it=>{
                        const product=products.find(p=>p.id===it.productId);
                        if(!product)return null;
                        const stock=getStock(it.productId);
                        const overStock=n(it.qty)>stock&&stock>0;
                        return(
                          <div key={it.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{fontWeight:600,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{product.name}</div>
                              <div style={{display:"flex",alignItems:"center",gap:3}}>
                                <input type="number" min="0" step="0.01" value={it.unitPrice} onChange={e=>updateItem(it.id,"unitPrice",e.target.value)}
                                  style={{width:62,fontSize:11,border:`1px solid ${C.border}`,borderRadius:4,padding:"2px 4px",background:C.surface,color:overStock?C.amber:C.textMid,outline:"none",fontFamily:FONT}}/>
                                <span style={{fontSize:10,color:overStock?C.amber:C.textFaint}}>c/u{overStock?" ⚠":""}</span>
                              </div>
                            </div>
                            <div style={{display:"flex",alignItems:"center",gap:4,flexShrink:0}}>
                              <button onClick={()=>updateItem(it.id,"qty",Math.max(0.1,n(it.qty)-1))} style={{width:26,height:26,borderRadius:6,border:`1px solid ${C.border}`,background:C.bg,cursor:"pointer",fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",color:C.textMid}}>−</button>
                              <span style={{fontSize:13,fontWeight:700,minWidth:22,textAlign:"center",color:C.brand}}>{n(it.qty)}</span>
                              <button onClick={()=>updateItem(it.id,"qty",n(it.qty)+1)} style={{width:26,height:26,borderRadius:6,border:`1px solid ${C.border}`,background:C.bg,cursor:"pointer",fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",color:C.textMid}}>+</button>
                            </div>
                            <span style={{fontSize:13,fontWeight:800,color:C.red,minWidth:58,textAlign:"right"}}>{Bs(it.sub??it.subtotal)}</span>
                            <button onClick={()=>removeItem(it.id)} style={{background:"none",border:"none",color:C.textFaint,cursor:"pointer",padding:2}}><X size={14}/></button>
                          </div>
                        );
                      })}
                      <button onClick={()=>setPaso(1)} style={{...mkBtn("ghost"),width:"100%",justifyContent:"center",marginTop:8,fontSize:12}}>+ Añadir más productos</button>
                    </div>
                    {/* Payment */}
                    <div style={{...card(),padding:"14px"}}>
                      <div style={{fontSize:10,fontWeight:700,color:C.textFaint,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:10}}>Forma de pago</div>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginBottom:10}}>
                        {[
                          {v:"efectivo",    l:"Efectivo",  Icon:Banknote,   color:"#10B981"},
                          {v:"transferencia",l:"Banco",    Icon:Building2,  color:"#22C5FE"},
                          {v:"qr",          l:"QR",        Icon:QrCode,     color:"#F59E0B"},
                          {v:"mixto",       l:"Mixto",     Icon:CreditCard, color:"#111E7B"},
                        ].map(({v,l,Icon,color})=>{
                          const active=form.paymentMethod===v;
                          return(
                            <button key={v} onClick={()=>setForm(f=>({...f,paymentMethod:v}))}
                              style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,padding:"9px 4px",border:`1.5px solid ${active?color:C.border}`,borderRadius:8,cursor:"pointer",background:active?color+"18":C.bg,transition:"all 0.13s",fontFamily:FONT}}>
                              <Icon size={16} strokeWidth={active?2.2:1.8} color={active?color:C.textFaint}/>
                              <span style={{fontSize:10,fontWeight:active?700:500,color:active?color:C.textMid}}>{l}</span>
                            </button>
                          );
                        })}
                      </div>
                      {form.paymentMethod==="qr"&&(
                        config?.qr_url
                          ? <div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"10px 0",gap:6}}>
                              <img src={config.qr_url} alt="QR de pago" style={{width:150,height:150,objectFit:"contain",borderRadius:12,border:`1px solid ${C.border}`}}/>
                              <div style={{fontSize:11,color:C.textFaint}}>Escanea para realizar el pago</div>
                            </div>
                          : <div style={{padding:"10px 12px",textAlign:"center",fontSize:11,color:C.textFaint,background:C.bg,borderRadius:8,border:`1px dashed ${C.border}`,marginTop:4}}>
                              Sin imagen QR configurada. Ve a <strong>Ajustes → Configuración del negocio</strong> para subir tu QR.
                            </div>
                      )}
                      {/* Discount */}
                      <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:8}}>
                        <span style={{fontSize:11,color:C.textMid,fontWeight:600,flexShrink:0}}>Descuento</span>
                        <button onClick={()=>setForm(f=>({...f,discountType:f.discountType==="pct"?"fixed":"pct"}))}
                          style={{...mkBtn("ghost"),fontSize:11,padding:"4px 8px",flexShrink:0,minWidth:34}}>
                          {form.discountType==="pct"?"%":getCurrencySymbol()}
                        </button>
                        <input type="number" min="0" step="0.01" value={form.discount} onChange={e=>setForm(f=>({...f,discount:e.target.value}))}
                          placeholder={form.discountType==="pct"?`0 %`:`0 ${getCurrencySymbol()}`} style={{...inp,margin:0,flex:1,fontSize:12}}/>
                        {discountAmt>0&&<span style={{fontSize:11,color:C.green,fontWeight:700,flexShrink:0}}>−{Bs(discountAmt)}</span>}
                      </div>
                      <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8}}>
                        <input type="number" min="0" step="0.5" value={form.paid} onChange={e=>setForm(f=>({...f,paid:e.target.value}))} placeholder={`Monto recibido ${getCurrencySymbol()}`} style={{...inp,margin:0,flex:1,fontSize:13,fontWeight:600}}/>
                        <button onClick={()=>setForm(f=>({...f,paid:total.toFixed(2)}))} style={{...mkBtn("ghost"),fontSize:12,padding:"8px 12px",flexShrink:0}}>Todo</button>
                      </div>
                      {debtN>0&&<div style={{display:"flex",justifyContent:"space-between",padding:"7px 10px",background:C.amberBg,borderRadius:R.sm,marginBottom:8,border:`1px solid ${C.amberMid}`}}>
                        <span style={{fontSize:12,color:C.amber,fontWeight:600}}>Pendiente:</span>
                        <span style={{fontSize:14,fontWeight:800,color:C.amber}}>{Bs(debtN)}</span>
                      </div>}
                      <input value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Notas (opcional)…" style={{...inp,margin:0,fontSize:13}}/>
                    </div>
                  </div>
                  {/* Bottom: total + finalize */}
                  <div style={{background:"var(--color-bg-surface)",borderTop:`1px solid ${C.border}`,flexShrink:0}}>
                    <div style={{padding:"8px 16px 4px"}}>
                      {discountAmt>0&&(
                        <>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:2}}>
                            <span style={{fontSize:11,color:C.textFaint}}>Subtotal</span>
                            <span style={{fontSize:13,color:C.textMid}}>{Bs(subtotalItems)}</span>
                          </div>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:2}}>
                            <span style={{fontSize:11,color:C.green}}>Descuento</span>
                            <span style={{fontSize:13,color:C.green}}>−{Bs(discountAmt)}</span>
                          </div>
                        </>
                      )}
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
                        <span style={{fontSize:12,color:C.textMid,fontWeight:500}}>Total</span>
                        <span style={{fontSize:22,fontWeight:800,color:C.red,letterSpacing:"-0.03em"}}>{Bs(total)}</span>
                      </div>
                    </div>
                    <div style={{padding:"0 12px 14px"}}>
                      <button onClick={doSave} style={{width:"100%",padding:"14px",fontSize:15,fontWeight:700,background:total>0?C.red:"#ccc",color:"white",border:"none",borderRadius:R.md,cursor:total>0?"pointer":"not-allowed",letterSpacing:"-0.01em",transition:"background 0.15s"}}
                        onMouseEnter={e=>{if(total>0)e.currentTarget.style.background=C.redHover;}}
                        onMouseLeave={e=>{if(total>0)e.currentTarget.style.background=C.red;}}>
                        {total>0?"✓ Finalizar venta":"Agrega productos al carrito"}
                      </button>
                    </div>
                  </div>
                </>
              )
            ) : (
              /* ── DESKTOP: Split layout ── */
              <>
                {/* POS header */}
                <div style={{display:"flex",alignItems:"center",gap:12,padding:"12px 18px",background:C.sidebar,color:"white",flexShrink:0}}>
                  <button onClick={closeModal} style={{background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.15)",color:"white",borderRadius:R.md,padding:"6px 12px",cursor:"pointer",fontSize:12,flexShrink:0}}>✕ Cancelar</button>
                  <div style={{flex:1,fontWeight:700,fontSize:15,letterSpacing:"-0.02em"}}>Nueva Venta — POS</div>
                  <div style={{fontSize:12,opacity:0.45}}>{fDate(form.date)}</div>
                </div>
                {err&&<div style={{background:C.redBg,borderBottom:`1px solid ${C.redMid}`,color:C.red,padding:"7px 18px",fontSize:13,flexShrink:0}}>{err}</div>}
                {/* Main: catalog + cart */}
                <div style={{display:"flex",flex:1,overflow:"hidden"}}>
                  {/* LEFT — Catalog */}
                  <div style={{flex:"0 0 58%",display:"flex",flexDirection:"column",borderRight:`1px solid ${C.border}`,overflow:"hidden"}}>
                    {/* Search + barcode */}
                    <div style={{padding:"10px 14px",borderBottom:`1px solid ${C.border}`,flexShrink:0,display:"flex",gap:8,flexWrap:"wrap"}}>
                      <div style={{position:"relative",flex:1,minWidth:120}}>
                        <Search size={12} style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)",color:C.textFaint,pointerEvents:"none"}}/>
                        <input value={posSearch} onChange={e=>setPosSearch(e.target.value)} placeholder="Buscar producto..." style={{...inp,paddingLeft:28,margin:0,fontSize:12}}/>
                      </div>
                      <div style={{position:"relative",flex:"0 0 140px"}}>
                        <ScanLine size={12} style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)",color:C.textFaint,pointerEvents:"none"}}/>
                        <input ref={barcodeRef} value={barcodeInput} onChange={e=>setBarcodeInput(e.target.value)} onKeyDown={handleBarcode} placeholder="Código barras…" style={{...inp,paddingLeft:28,margin:0,fontSize:12}}/>
                      </div>
                      <BarcodeScannerButton onScan={code=>{ const p=products.find(x=>x.barcode===code||x.name.toLowerCase()===code.toLowerCase()); if(p)addProductToCart(p.id); else setErr(`Código "${code}" no encontrado`); }}/>
                    </div>
                    {/* Category chips */}
                    <div style={{padding:"6px 14px",borderBottom:`1px solid ${C.border}`,flexShrink:0,display:"flex",gap:4,overflowX:"auto"}}>
                      {posCategories.map(([v,l])=>(
                        <button key={v} onClick={()=>setPosCategory(v)} style={{...mkBtn(posCategory===v?"primary":"subtle"),padding:"3px 9px",fontSize:11,flexShrink:0}}>{l}</button>
                      ))}
                    </div>
                    {/* Product grid */}
                    <div style={{flex:1,overflowY:"auto",padding:"10px 14px"}}>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))",gap:8}}>
                        {posProducts.length===0?(
                          <div style={{gridColumn:"1/-1",textAlign:"center",padding:24,color:C.textFaint,fontSize:12}}>Sin productos</div>
                        ):posProducts.map(product=>{
                          const stock=getStock(product.id);
                          const inCart=form.items.find(i=>i.productId===product.id);
                          return(
                            <button key={product.id} onClick={()=>addProductToCart(product.id)}
                              style={{...card({padding:0,overflow:"hidden",cursor:"pointer",border:`1.5px solid ${inCart?C.red:C.border}`,transition:"all 0.12s"}),textAlign:"left",outline:"none"}}
                              onMouseEnter={e=>e.currentTarget.style.borderColor=C.red}
                              onMouseLeave={e=>e.currentTarget.style.borderColor=inCart?C.red:C.border}>
                              <div style={{height:78,background:`linear-gradient(135deg,${C.blueBg},${C.bg})`,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",position:"relative"}}>
                                {product.img?<img src={product.img} alt={product.name} style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<BrandLogo size={36}/>}
                                {inCart&&<div style={{position:"absolute",top:4,right:4,background:C.red,color:"white",borderRadius:"50%",width:18,height:18,fontSize:10,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>{inCart.qty}</div>}
                                {stock===0&&<div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.52)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:"white",fontWeight:700,letterSpacing:"0.03em"}}>AGOTADO</div>}
                              </div>
                              <div style={{padding:"5px 7px"}}>
                                <div style={{fontWeight:700,fontSize:10,lineHeight:1.3,marginBottom:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{product.name}</div>
                                <div style={{fontSize:13,fontWeight:800,color:C.red}}>{Bs(product.price)}</div>
                                {product.minStock>0&&stock<=product.minStock&&stock>0&&<div style={{fontSize:8,color:C.amber}}>⚠ {stock} {product.unit}</div>}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  {/* RIGHT — Cart + payment */}
                  <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minWidth:0}}>
                    {/* Customer */}
                    <div style={{padding:"10px 14px",borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
                      {showNewCust?(
                        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                          <input value={newCustName} onChange={e=>setNewCustName(e.target.value)} placeholder="Nombre cliente *" style={{...inp,margin:0,flex:1,minWidth:100,fontSize:12}} autoFocus/>
                          <input value={newCustPhone} onChange={e=>setNewCustPhone(e.target.value)} placeholder="Teléfono (opcional)" style={{...inp,margin:0,width:130,fontSize:12}}/>
                          <button onClick={doCreateCustomer} style={{...mkBtn("primary"),fontSize:12,padding:"6px 10px"}}>Crear</button>
                          <button onClick={()=>setShowNewCust(false)} style={{...mkBtn("ghost"),fontSize:12,padding:"6px 10px"}}>×</button>
                        </div>
                      ):(
                        <div style={{display:"flex",gap:6,alignItems:"center"}}>
                          <select style={{...inp,margin:0,flex:1,fontSize:12}} value={form.customerId} onChange={e=>setForm(f=>({...f,customerId:e.target.value}))}>
                            <option value="__guest__">👤 Público general</option>
                            {customers.map(c=><option key={c.id} value={c.id}>{c.name}{c.market?` · ${c.market}`:""}</option>)}
                          </select>
                          <button onClick={()=>setShowNewCust(true)} style={{...mkBtn("ghost"),fontSize:11,padding:"6px 9px",flexShrink:0}}>+ Cliente</button>
                          <input type="date" style={{...inp,margin:0,width:120,fontSize:11}} value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/>
                        </div>
                      )}
                    </div>
                    {/* Cart items */}
                    <div style={{flex:1,overflowY:"auto",padding:"8px 14px"}}>
                      {form.items.length===0?(
                        <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",color:C.textFaint,gap:8,padding:24}}>
                          <span style={{fontSize:32}}>🛒</span>
                          <div style={{fontSize:13}}>Toca un producto para agregar al carrito</div>
                        </div>
                      ):form.items.map(it=>{
                        const product=products.find(p=>p.id===it.productId);
                        if(!product)return null;
                        const stock=getStock(it.productId);
                        const overStock=n(it.qty)>stock&&stock>0;
                        return(
                          <div key={it.id} style={{display:"flex",alignItems:"center",gap:7,padding:"7px 9px",marginBottom:5,background:C.bg,borderRadius:R.md,border:`1px solid ${overStock?C.amber:C.border}`}}>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{fontWeight:600,fontSize:12,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{product.name}</div>
                              <div style={{display:"flex",alignItems:"center",gap:3}}>
                                <input type="number" min="0" step="0.01" value={it.unitPrice} onChange={e=>updateItem(it.id,"unitPrice",e.target.value)}
                                  style={{width:58,fontSize:10,border:`1px solid ${C.border}`,borderRadius:4,padding:"1px 4px",background:C.surface,color:overStock?C.amber:C.textMid,outline:"none",fontFamily:FONT}}/>
                                <span style={{fontSize:10,color:overStock?C.amber:C.textFaint}}>c/u{overStock?" ⚠":""}</span>
                              </div>
                            </div>
                            <div style={{display:"flex",alignItems:"center",gap:3,flexShrink:0}}>
                              <button onClick={()=>updateItem(it.id,"qty",Math.max(0.1,n(it.qty)-1))} style={{width:24,height:24,borderRadius:5,border:`1px solid ${C.border}`,background:C.surface,cursor:"pointer",fontSize:14,lineHeight:1,display:"flex",alignItems:"center",justifyContent:"center",color:C.textMid,flexShrink:0}}>−</button>
                              <input type="number" min="0.1" step="0.1" value={it.qty} onChange={e=>updateItem(it.id,"qty",e.target.value)} style={{width:40,textAlign:"center",border:`1px solid ${C.border}`,borderRadius:5,padding:"3px 2px",fontSize:12,fontWeight:700,background:C.surface,color:C.brand,outline:"none",minHeight:"unset"}}/>
                              <button onClick={()=>updateItem(it.id,"qty",n(it.qty)+1)} style={{width:24,height:24,borderRadius:5,border:`1px solid ${C.border}`,background:C.surface,cursor:"pointer",fontSize:14,lineHeight:1,display:"flex",alignItems:"center",justifyContent:"center",color:C.textMid,flexShrink:0}}>+</button>
                            </div>
                            <div style={{fontWeight:800,fontSize:13,color:C.red,textAlign:"right",minWidth:56,flexShrink:0}}>{Bs(it.sub??it.subtotal)}</div>
                            <button onClick={()=>removeItem(it.id)} style={{background:"none",border:"none",color:C.textFaint,cursor:"pointer",fontSize:16,padding:0,lineHeight:1,flexShrink:0}}>×</button>
                          </div>
                        );
                      })}
                      {form.items.length>0&&<button onClick={addItem} style={{...mkBtn("ghost"),width:"100%",justifyContent:"center",marginTop:4,fontSize:11}}>+ Agregar producto manual</button>}
                    </div>
                    {/* Payment + finalize */}
                    <div style={{padding:"10px 14px",borderTop:`1px solid ${C.border}`,flexShrink:0,background:C.bg}}>
                      <div style={{marginBottom:10}}>
                        {discountAmt>0&&(
                          <>
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:2}}>
                              <span style={{fontSize:11,color:C.textFaint}}>Subtotal</span>
                              <span style={{fontSize:13,color:C.textMid}}>{Bs(subtotalItems)}</span>
                            </div>
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:2}}>
                              <span style={{fontSize:11,color:C.green}}>Descuento</span>
                              <span style={{fontSize:13,color:C.green}}>−{Bs(discountAmt)}</span>
                            </div>
                          </>
                        )}
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
                          <span style={{fontSize:12,color:C.textMid,fontWeight:500}}>Total</span>
                          <span style={{fontSize:24,fontWeight:800,color:C.red,letterSpacing:"-0.04em"}}>{Bs(total)}</span>
                        </div>
                      </div>
                      {/* Payment method */}
                      <div style={{display:"flex",gap:4,marginBottom:8}}>
                        {[
                          {v:"efectivo",    l:"Efectivo",  Icon:Banknote,   color:"#10B981"},
                          {v:"transferencia",l:"Banco",    Icon:Building2,  color:"#22C5FE"},
                          {v:"qr",          l:"QR",        Icon:QrCode,     color:"#F59E0B"},
                          {v:"mixto",       l:"Mixto",     Icon:CreditCard, color:"#111E7B"},
                        ].map(({v,l,Icon,color})=>{
                          const active=form.paymentMethod===v;
                          return(
                            <button key={v} onClick={()=>setForm(f=>({...f,paymentMethod:v}))}
                              style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,padding:"6px 4px",border:`1.5px solid ${active?color:C.border}`,borderRadius:8,cursor:"pointer",background:active?color+"18":C.bg,transition:"all 0.13s",fontFamily:FONT}}>
                              <Icon size={14} strokeWidth={active?2.2:1.8} color={active?color:C.textFaint}/>
                              <span style={{fontSize:9.5,fontWeight:active?700:500,color:active?color:C.textMid,lineHeight:1}}>{l}</span>
                            </button>
                          );
                        })}
                      </div>
                      {/* QR payment image */}
                      {form.paymentMethod==="qr"&&(
                        config?.qr_url
                          ? <div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"6px 0 8px",gap:4}}>
                              <img src={config.qr_url} alt="QR de pago" style={{width:120,height:120,objectFit:"contain",borderRadius:10,border:`1px solid ${C.border}`}}/>
                              <div style={{fontSize:10,color:C.textFaint}}>Escanea para pagar</div>
                            </div>
                          : <div style={{padding:"8px 10px",textAlign:"center",fontSize:10,color:C.textFaint,background:C.bg,borderRadius:8,border:`1px dashed ${C.border}`,marginBottom:4}}>
                              Sin QR configurado. Ve a Ajustes → Configuración del negocio.
                            </div>
                      )}
                      {/* Discount */}
                      <div style={{display:"flex",gap:5,alignItems:"center",marginBottom:6}}>
                        <span style={{fontSize:11,color:C.textMid,fontWeight:600,flexShrink:0}}>Descuento</span>
                        <button onClick={()=>setForm(f=>({...f,discountType:f.discountType==="pct"?"fixed":"pct"}))}
                          style={{...mkBtn("ghost"),fontSize:10,padding:"3px 6px",flexShrink:0,minWidth:28}}>
                          {form.discountType==="pct"?"%":getCurrencySymbol()}
                        </button>
                        <input type="number" min="0" step="0.01" value={form.discount} onChange={e=>setForm(f=>({...f,discount:e.target.value}))}
                          placeholder="0" style={{...inp,margin:0,flex:1,fontSize:12}}/>
                        {discountAmt>0&&<span style={{fontSize:11,color:C.green,fontWeight:700,flexShrink:0}}>−{Bs(discountAmt)}</span>}
                      </div>
                      {/* Paid + debt */}
                      <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:6}}>
                        <input type="number" min="0" step="0.5" value={form.paid} onChange={e=>setForm(f=>({...f,paid:e.target.value}))} placeholder={`Monto recibido ${getCurrencySymbol()}`} style={{...inp,margin:0,flex:1,fontSize:13,fontWeight:600}}/>
                        <button onClick={()=>setForm(f=>({...f,paid:total.toFixed(2)}))} style={{...mkBtn("ghost"),fontSize:11,padding:"7px 10px",flexShrink:0}}>Todo</button>
                      </div>
                      {debtN>0&&<div style={{display:"flex",justifyContent:"space-between",padding:"5px 8px",background:C.amberBg,borderRadius:R.sm,marginBottom:6,border:`1px solid ${C.amberMid}`}}>
                        <span style={{fontSize:11,color:C.amber,fontWeight:500}}>Pendiente:</span>
                        <span style={{fontSize:13,fontWeight:700,color:C.amber}}>{Bs(debtN)}</span>
                      </div>}
                      <input value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Notas (opcional)…" style={{...inp,margin:"0 0 8px",fontSize:12}}/>
                      <button onClick={doSave} style={{width:"100%",padding:"13px",fontSize:14,fontWeight:700,background:total>0?C.red:"#ccc",color:"white",border:"none",borderRadius:R.md,cursor:total>0?"pointer":"not-allowed",letterSpacing:"-0.01em",transition:"background 0.15s"}}
                        onMouseEnter={e=>{if(total>0)e.currentTarget.style.background=C.redHover;}}
                        onMouseLeave={e=>{if(total>0)e.currentTarget.style.background=C.red;}}>
                        {total>0?"✓ Finalizar venta":"Agrega productos al carrito"}
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {deleteTarget&&<Modal title="Eliminar venta" onClose={()=>setDeleteTarget(null)} width={420}>
        <div style={{fontSize:13,color:C.textMid,marginBottom:16}}>Esta acción eliminará la venta y restaurará el stock al inventario.</div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <button onClick={()=>setDeleteTarget(null)} style={mkBtn("ghost")}>Cancelar</button>
          <button onClick={doDeleteSale} style={mkBtn("danger")}>Eliminar</button>
        </div>
      </Modal>}
      {comprobanteVenta&&<ComprobanteModal sale={comprobanteVenta} config={config} user={user} onClose={()=>setComprobanteVenta(null)}/>}
    </div>
  );
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  DEUDAS                                                             ║
// ╚══════════════════════════════════════════════════════════════════════╝
function Deudas({ D, save, user, logAction }) {
  const { sales, customers } = D;
  const [q,setQ]=useState(""); const [pays,setPays]=useState({});
  const debtClients=customers.map(c=>({ ...c, cSales:sales.filter(s=>s.customerId===c.id&&s.debt>0), debt:sales.filter(s=>s.customerId===c.id).reduce((a,s)=>a+s.debt,0) })).filter(c=>c.debt>0).sort((a,b)=>b.debt-a.debt).filter(c=>c.name.toLowerCase().includes(q.toLowerCase()));
  const totalDebt=debtClients.reduce((a,c)=>a+c.debt,0);

  const doPayment=async(saleId,amt)=>{
    const a=Math.min(n(amt),sales.find(s=>s.id===saleId)?.debt||0); if(a<=0)return;
    const updated=sales.map(s=>s.id===saleId?{...s,paid:s.paid+a,debt:Math.max(0,s.debt-a),payments:[...(s.payments||[]),{amount:a,date:new Date().toISOString()}]}:s);
    const ventaActualizada=updated.find(s=>s.id===saleId);
    let result;
    try { result = await ventasService.updateVenta(saleId,ventaActualizada,user?.empresa_id); }
    catch(e) { console.warn("Cobro deuda Supabase error:", e.message); }
    if (result?._localOnly && isSupabaseUUID(user?.empresa_id)) {
      toast.error("⚠ Error Supabase al registrar el cobro. El pago no se guardó — revisa tu conexión e intenta de nuevo.");
      return;
    }
    save("sales",updated);
    setPays(p=>({...p,[saleId]:""}));
    logAction?.(`${user.name} registró un cobro de deuda por ${Bs(a)} en la venta ${saleId}`);
  };

  const exportXLS=async()=>{
    await xlsx([{name:"Deudas",data:debtClients.flatMap(c=>c.cSales.map(s=>({Cliente:c.name,Teléfono:c.phone,Mercado:c.market,Fecha:fDate(s.date),"Total Venta(Bs)":s.total.toFixed(2),"Pagado(Bs)":s.paid.toFixed(2),"Deuda(Bs)":s.debt.toFixed(2)})))}],"deudas_moxi_business.xlsx");
  };

  return (
    <div>
      <Header title="Gestión de Deudas" sub="Control de saldos pendientes" action={<>
        <button onClick={exportXLS} style={mkBtn("ghost")}>⬇️ Exportar Excel</button>
      </>}/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:16}}>
        <KPI label="Total por cobrar" value={Bs(totalDebt)} Icon="💳" color={C.red}/>
        <KPI label="Clientes con deuda" value={debtClients.length} Icon="👥" color={C.amber}/>
        <KPI label="Deuda promedio" value={Bs(debtClients.length>0?totalDebt/debtClients.length:0)} Icon="📊" color={C.textMid}/>
      </div>
      <SearchInput value={q} onChange={setQ} placeholder="Buscar cliente..."/>
      <div style={{marginTop:12}}>
        {debtClients.length===0?<Empty icon="✅" title="Sin deudas" sub="Todos los clientes están al día"/>:
          debtClients.map(c=>(
            <div key={c.id} style={{...card(),marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div style={{display:"flex",gap:10,alignItems:"center"}}>
                  <div style={{width:40,height:40,background:`linear-gradient(135deg,${C.red},#7F1D1D)`,borderRadius:11,display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontWeight:700}}>{c.name[0]}</div>
                  <div><div style={{fontWeight:700,fontSize:14}}>{c.name}</div><div style={{fontSize:12,color:C.textMid}}>{c.market}{c.phone?` · ${c.phone}`:""}</div></div>
                </div>
                <div style={{fontSize:22,fontWeight:800,color:C.red,letterSpacing:"-0.04em"}}>{Bs(c.debt)}</div>
              </div>
              {c.cSales.map(sale=>(
                <div key={sale.id} style={{padding:"9px 12px",background:C.bg,borderRadius:R.md,marginBottom:6,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:500}}>Venta del {fDate(sale.date)}</div>
                    <div style={{fontSize:12,color:C.textMid}}>Total: {Bs(sale.total)} · Pagado: {Bs(sale.paid)}</div>
                  </div>
                  <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                    <span style={mkBadge("red")}>{Bs(sale.debt)}</span>
                    <input type="number" min="0" step="0.5" style={{...inp,width:95,fontSize:12}} value={pays[sale.id]||""} onChange={e=>setPays(p=>({...p,[sale.id]:e.target.value}))} placeholder="Bs."/>
                    <button onClick={()=>doPayment(sale.id,pays[sale.id])} style={{...mkBtn("success"),padding:"6px 10px",fontSize:12}}>✓ Cobrar</button>
                    <button onClick={()=>{ setPays(p=>({...p,[sale.id]:sale.debt.toFixed(2)})); setTimeout(()=>doPayment(sale.id,sale.debt.toFixed(2)),50); }} style={{...mkBtn("ghost"),padding:"6px 10px",fontSize:12}}>Todo</button>
                  </div>
                </div>
              ))}
            </div>
          ))}
      </div>
    </div>
  );
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  PRODUCCIÓN                                                         ║
// ╚══════════════════════════════════════════════════════════════════════╝
function Produccion({ D, save, user, logAction }) {
  const { products, inventory, formulas, orders } = D;
  const [tab,setTab]=useState("orders"); const [modal,setModal]=useState(null); const [deleteOrder,setDeleteOrder]=useState(null);
  const [fForm,setFForm]=useState({name:"",inputId:"",inputQty:11.5,inputUnit:"arroba (11.5kg)",outputId:"",outputQty:5,outputUnit:"kg",laborCost:0,energyCost:0,desc:""});
  const [oForm,setOForm]=useState({formulaId:"",batches:1,date:today(),extraCost:0,notes:""});
  const getStock=id=>(inventory.find(i=>i.productId===id)||{}).stock||0;

  const saveFormula=()=>{
    if(!fForm.name||!fForm.inputId||!fForm.outputId)return;
    save("formulas",modal==="new_f"?[...formulas,{...fForm,id:"f"+uid()}]:formulas.map(f=>f.id===modal.id?{...f,...fForm}:f));
    setModal(null);
  };

  const execOrder=()=>{
    if(!oForm.formulaId||!oForm.batches)return;
    const formula=formulas.find(f=>f.id===oForm.formulaId); if(!formula)return;
    const batches=n(oForm.batches);
    const inputUsed=formula.inputQty*batches; const outputProduced=formula.outputQty*batches;
    const baseCost=(formula.laborCost+formula.energyCost)*batches; const totalCost=baseCost+n(oForm.extraCost);
    const costPerUnit=outputProduced>0?totalCost/outputProduced:0;
    const outProd=products.find(p=>p.id===formula.outputId);
    const revenue=outputProduced*((outProd?.price||0)); const margin=revenue>0?((revenue-totalCost)/revenue*100):0;
    const newInv=inventory.map(i=>{
      if(i.productId===formula.inputId)return{...i,stock:Math.max(0,i.stock-inputUsed)};
      if(i.productId===formula.outputId)return{...i,stock:i.stock+outputProduced};
      return i;
    });
    save("inventory",newInv);
    save("orders",[{id:"or"+uid(),formulaId:oForm.formulaId,formulaName:formula.name,inputId:formula.inputId,outputId:formula.outputId,batches,inputUsed,outputProduced,totalCost,costPerUnit,revenue,margin:Math.round(margin),date:oForm.date,notes:oForm.notes,createdAt:new Date().toISOString()},...orders]);
    logAction?.(`${user.name} registró una orden de producción por ${previewOutput.toFixed(1)} ${previewProd?.unit||"unid."}`);
    setModal(null); setOForm({formulaId:"",batches:1,date:today(),extraCost:0,notes:""});
  };

  // Preview calculation
  const previewFormula=oForm.formulaId?formulas.find(f=>f.id===oForm.formulaId):null;
  const previewBatches=n(oForm.batches)||1;
  const previewOutput=previewFormula?(previewFormula.outputQty*previewBatches):0;
  const previewInput=previewFormula?(previewFormula.inputQty*previewBatches):0;
  const previewCost=previewFormula?((previewFormula.laborCost+previewFormula.energyCost)*previewBatches+n(oForm.extraCost)):0;
  const previewProd=previewFormula?products.find(p=>p.id===previewFormula.outputId):null;
  const previewRevenue=previewOutput*(previewProd?.price||0);
  const previewMargin=previewRevenue>0?Math.round((previewRevenue-previewCost)/previewRevenue*100):0;
  const removeOrder=()=>{
    if(!deleteOrder)return;
    save("orders",orders.filter(order=>order.id!==deleteOrder.id));
    save("inventory",reverseProductionInventory(inventory, deleteOrder));
    logAction?.(`${user.name} eliminó el historial de producción ${deleteOrder.formulaName}`);
    setDeleteOrder(null);
  };

  return (
    <div>
      <Header title="Producción" sub="Órdenes de producción y fórmulas de transformación" action={<>
        <button onClick={()=>{setFForm({name:"",inputId:"",inputQty:11.5,inputUnit:"arroba (11.5kg)",outputId:"",outputQty:5,outputUnit:"kg",laborCost:0,energyCost:0,desc:""});setModal("new_f");}} style={mkBtn("ghost")}>+ Nueva fórmula</button>
        <button onClick={()=>setModal("new_o")} style={mkBtn("primary")}>▶️ Nueva orden</button>
      </>}/>
      <Chip value={tab} onChange={setTab} options={[["orders","Órdenes de Producción"],["formulas","Fórmulas de Transformación"]]}/>
      <div style={{marginTop:14}}>
        {tab==="formulas"&&(
          formulas.length===0?<Empty icon="⚗️" title="Sin fórmulas" sub="Define cómo se transforma el ají (ej: vaina → polvo)" action={<button onClick={()=>{setFForm({name:"",inputId:"",inputQty:11.5,inputUnit:"arroba (11.5kg)",outputId:"",outputQty:5,outputUnit:"kg",laborCost:0,energyCost:0,desc:""});setModal("new_f");}} style={mkBtn("primary")}>+ Crear fórmula</button>}/>:
          formulas.map(f=>{
            const inP=products.find(p=>p.id===f.inputId); const outP=products.find(p=>p.id===f.outputId);
            const baseCostPU=f.outputQty>0?(f.laborCost+f.energyCost)/f.outputQty:0;
            const margin=outP?.price>0?((outP.price-baseCostPU)/outP.price*100):0;
            return (
              <div key={f.id} style={{...card(),marginBottom:8}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:15,letterSpacing:"-0.02em",marginBottom:6}}>{f.name}</div>
                    <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:6}}>
                      <span style={mkBadge("red")}>📥 {f.inputQty} {f.inputUnit} de {inP?.name||"?"}</span>
                      <span style={{color:C.textFaint,fontSize:16}}>→</span>
                      <span style={mkBadge("green")}>📤 {f.outputQty} {f.outputUnit} de {outP?.name||"?"}</span>
                    </div>
                    <div style={{display:"flex",gap:12,fontSize:12,color:C.textMid}}>
                      <span>👷 Mano de obra: <strong>{Bs(f.laborCost)}</strong></span>
                      <span>⚡ Energía: <strong>{Bs(f.energyCost)}</strong></span>
                      {outP&&<span>📊 Margen est.: <strong style={{color:margin>0?C.green:C.red}}>{Math.round(margin)}%</strong></span>}
                    </div>
                    {f.desc&&<div style={{fontSize:12,color:C.textFaint,marginTop:4}}>{f.desc}</div>}
                  </div>
                  <div style={{display:"flex",gap:4}}>
                    <button onClick={()=>{setFForm({...f});setModal(f);}} style={{...mkBtn("ghost"),padding:"5px 9px"}}>✏️</button>
                    <button onClick={()=>save("formulas",formulas.filter(x=>x.id!==f.id))} style={{...mkBtn("danger"),padding:"5px 9px"}}>🗑️</button>
                  </div>
                </div>
              </div>
            );
          })
        )}
        {tab==="orders"&&(
          orders.length===0?<Empty icon="🏭" title="Sin órdenes" sub="Ejecuta órdenes de producción para transformar materia prima" action={<button onClick={()=>setModal("new_o")} style={mkBtn("primary")}>▶️ Nueva orden</button>}/>:
          <div style={card()}>
            <Table cols={[
              {key:"formulaName",label:"Fórmula",style:{fontWeight:500}},
              {key:"date",label:"Fecha",render:v=>fDate(v)},
              {key:"batches",label:"Lotes"},
              {key:"inputUsed",label:"Mat. Prima",render:(v,row)=><span style={{color:C.red}}>{v} unid.</span>},
              {key:"outputProduced",label:"Producido",render:(v,row)=><span style={{color:C.green,fontWeight:600}}>{v} unid.</span>},
              {key:"totalCost",label:"Costo",render:v=>Bs(v)},
              {key:"costPerUnit",label:"Costo/Unid.",render:v=>Bs(v)},
              {key:"margin",label:"Margen",render:v=><span style={mkBadge(v>=30?"green":v>=10?"amber":"red")}>{v}%</span>},
              {key:"id",label:"Acciones",render:(_,row)=><button onClick={event=>{event.stopPropagation();setDeleteOrder(row);}} style={{...mkBtn("danger"),padding:"5px 9px"}}>Eliminar</button>},
            ]} rows={orders}/>
          </div>
        )}
      </div>
      {deleteOrder&&<Modal title="Eliminar historial de producción" onClose={()=>setDeleteOrder(null)} width={420}>
        <div style={{fontSize:13,color:C.textMid,marginBottom:16}}>
          Esta acción revertirá el stock consumido y retirará el stock producido de la orden seleccionada.
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <button onClick={()=>setDeleteOrder(null)} style={mkBtn("ghost")}>Cancelar</button>
          <button onClick={removeOrder} style={mkBtn("danger")}>Eliminar</button>
        </div>
      </Modal>}

      {/* Formula modal */}
      {(modal==="new_f"||(modal&&modal.id&&modal.id.startsWith("f")))&&<Modal title={typeof modal==="string"?"Nueva fórmula de producción":"Editar fórmula"} onClose={()=>setModal(null)} width={600}>
        <div style={{marginBottom:10}}><label style={lbl}>Nombre de la fórmula *</label><input style={inp} value={fForm.name} onChange={e=>setFForm({...fForm,name:e.target.value})} placeholder="Ej: Arroba de vaina → Polvo Rojo" autoFocus/></div>
        <div style={{background:C.bg,borderRadius:R.md,padding:"12px",marginBottom:10}}>
          <div style={{...lbl,color:C.red,marginBottom:8}}>📥 Materia prima (entrada)</div>
          <div style={row()}>
            <div style={{flex:2}}><label style={lbl}>Producto *</label>
              <select style={inp} value={fForm.inputId} onChange={e=>setFForm({...fForm,inputId:e.target.value})}>
                <option value="">Seleccionar...</option>
                {products.map(p=><option key={p.id} value={p.id}>{p.name} (Stock: {getStock(p.id)} {p.unit})</option>)}
              </select>
            </div>
            <div style={{flex:1}}><label style={lbl}>Cantidad por lote</label><input type="number" style={inp} value={fForm.inputQty} onChange={e=>setFForm({...fForm,inputQty:e.target.value})}/></div>
            <div style={{flex:1}}><label style={lbl}>Unidad</label><input style={inp} value={fForm.inputUnit} onChange={e=>setFForm({...fForm,inputUnit:e.target.value})}/></div>
          </div>
        </div>
        <div style={{background:C.greenBg,borderRadius:R.md,padding:"12px",marginBottom:10}}>
          <div style={{...lbl,color:C.green,marginBottom:8}}>📤 Producto terminado (salida)</div>
          <div style={row()}>
            <div style={{flex:2}}><label style={lbl}>Producto *</label>
              <select style={inp} value={fForm.outputId} onChange={e=>setFForm({...fForm,outputId:e.target.value})}>
                <option value="">Seleccionar...</option>
                {products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div style={{flex:1}}><label style={lbl}>Cantidad producida</label><input type="number" style={inp} value={fForm.outputQty} onChange={e=>setFForm({...fForm,outputQty:e.target.value})}/></div>
            <div style={{flex:1}}><label style={lbl}>Unidad</label><input style={inp} value={fForm.outputUnit} onChange={e=>setFForm({...fForm,outputUnit:e.target.value})}/></div>
          </div>
        </div>
        <div style={row()}>
          <div style={{flex:1}}><label style={lbl}>Costo mano de obra (Bs.)</label><input type="number" style={inp} value={fForm.laborCost} onChange={e=>setFForm({...fForm,laborCost:e.target.value})}/></div>
          <div style={{flex:1}}><label style={lbl}>Costo energía/gas (Bs.)</label><input type="number" style={inp} value={fForm.energyCost} onChange={e=>setFForm({...fForm,energyCost:e.target.value})}/></div>
        </div>
        <div style={{marginBottom:18}}><label style={lbl}>Descripción</label><input style={inp} value={fForm.desc} onChange={e=>setFForm({...fForm,desc:e.target.value})} placeholder="Descripción del proceso..."/></div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <button onClick={()=>setModal(null)} style={mkBtn("ghost")}>Cancelar</button>
          <button onClick={saveFormula} style={mkBtn("primary")}>Guardar fórmula</button>
        </div>
      </Modal>}

      {/* Order modal */}
      {modal==="new_o"&&<Modal title="Nueva orden de producción" onClose={()=>setModal(null)}>
        {formulas.length===0?<div style={{background:C.amberBg,border:`1px solid ${C.amberMid}`,borderRadius:R.md,padding:"12px",color:C.amber,fontSize:13}}>Debes crear al menos una fórmula primero.</div>:(
          <>
            <div style={{marginBottom:10}}><label style={lbl}>Fórmula *</label>
              <select style={inp} value={oForm.formulaId} onChange={e=>setOForm({...oForm,formulaId:e.target.value})}>
                <option value="">Seleccionar fórmula...</option>
                {formulas.map(f=>{ const inP=products.find(p=>p.id===f.inputId); const outP=products.find(p=>p.id===f.outputId); return <option key={f.id} value={f.id}>{f.name} ({f.inputQty}{f.inputUnit} → {f.outputQty} {outP?.unit||"u"} de {outP?.name})</option>; })}
              </select>
            </div>
            {previewFormula&&<div style={{background:C.bg,borderRadius:R.md,padding:"12px",marginBottom:10,display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
              <div><div style={lbl}>Materia prima a usar</div><div style={{fontWeight:700,color:C.red}}>{previewInput.toFixed(1)} unid.</div><div style={{fontSize:11,color:C.textFaint}}>Stock: {getStock(previewFormula.inputId)}</div></div>
              <div><div style={lbl}>Producción estimada</div><div style={{fontWeight:700,color:C.green}}>{previewOutput.toFixed(1)} {previewProd?.unit||"unid."}</div></div>
              <div><div style={lbl}>Margen estimado</div><div style={{fontWeight:700,color:previewMargin>=30?C.green:previewMargin>=10?C.amber:C.red}}>{previewMargin}%</div></div>
            </div>}
            <div style={row()}>
              <div style={{flex:1}}><label style={lbl}>Número de lotes *</label><input type="number" min="1" step="1" style={inp} value={oForm.batches} onChange={e=>setOForm({...oForm,batches:e.target.value})} autoFocus/></div>
              <div style={{flex:1}}><label style={lbl}>Fecha</label><input type="date" style={inp} value={oForm.date} onChange={e=>setOForm({...oForm,date:e.target.value})}/></div>
              <div style={{flex:1}}><label style={lbl}>Costos extras (Bs.)</label><input type="number" style={inp} value={oForm.extraCost} onChange={e=>setOForm({...oForm,extraCost:e.target.value})} placeholder="Transporte, etc."/></div>
            </div>
            <div style={{marginBottom:18}}><label style={lbl}>Notas</label><input style={inp} value={oForm.notes} onChange={e=>setOForm({...oForm,notes:e.target.value})} placeholder="Observaciones del proceso..."/></div>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
              <button onClick={()=>setModal(null)} style={mkBtn("ghost")}>Cancelar</button>
              <button onClick={execOrder} style={mkBtn("primary")}>▶️ Ejecutar orden</button>
            </div>
          </>
        )}
      </Modal>}
    </div>
  );
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  PROVEEDORES                                                        ║
// ╚══════════════════════════════════════════════════════════════════════╝
function Proveedores({ D, save }) {
  const { suppliers, purchases } = D;
  const [q,setQ]=useState(""); const [modal,setModal]=useState(null);
  const [form,setForm]=useState({name:"",phone:"",address:"",product:"",notes:""});
  const [pForm,setPForm]=useState({supplierId:"",product:"",qty:"",price:"",paid:"",date:today(),notes:""});

  const saveSupplier=()=>{ if(!form.name.trim())return; save("suppliers",modal==="new"?[...suppliers,{...form,id:"sp"+uid(),createdAt:new Date().toISOString()}]:suppliers.map(s=>s.id===modal.id?{...s,...form}:s)); setModal(null); };
  const savePurchase=()=>{
    if(!pForm.supplierId||!pForm.product)return;
    const sp=suppliers.find(s=>s.id===pForm.supplierId);
    const total=n(pForm.qty)*n(pForm.price);
    save("purchases",[{id:"pc"+uid(),...pForm,qty:n(pForm.qty),price:n(pForm.price),paid:n(pForm.paid),total,debt:Math.max(0,total-n(pForm.paid)),supplierName:sp?.name,createdAt:new Date().toISOString()},...purchases]);
    setModal(null); setPForm({supplierId:"",product:"",qty:"",price:"",paid:"",date:today(),notes:""});
  };

  const getSpTotal=id=>purchases.filter(p=>p.supplierId===id).reduce((a,p)=>a+p.total,0);
  const getSpDebt=id=>purchases.filter(p=>p.supplierId===id).reduce((a,p)=>a+p.debt,0);
  const filtered=suppliers.filter(s=>`${s.name} ${s.address}`.toLowerCase().includes(q.toLowerCase()));

  // Supplier comparison chart
  const compData=suppliers.map(s=>({name:s.name,compras:getSpTotal(s.id),deuda:getSpDebt(s.id)})).filter(s=>s.compras>0).sort((a,b)=>b.compras-a.compras);

  return (
    <div>
      <Header title="Proveedores" sub="Gestión de compras y proveedores de materia prima" action={<>
        <button onClick={()=>setModal("purchase")} style={mkBtn("ghost")}>+ Registrar compra</button>
        <button onClick={()=>{setForm({name:"",phone:"",address:"",product:"",notes:""});setModal("new");}} style={mkBtn("primary")}>+ Nuevo proveedor</button>
      </>}/>
      {compData.length>0&&<div style={{...card(),marginBottom:14}}>
        <div style={{fontWeight:700,fontSize:13,marginBottom:10}}>Comparativa de proveedores</div>
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={compData} margin={{top:4,right:4,left:0,bottom:0}}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
            <XAxis dataKey="name" tick={{fontSize:11}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fontSize:11}} axisLine={false} tickLine={false} tickFormatter={v=>`Bs.${v}`}/>
            <Tooltip formatter={v=>[Bs(v)]} contentStyle={{borderRadius:8,fontSize:12}}/>
            <Bar dataKey="compras" name="Total compras" fill={C.blue} radius={[4,4,0,0]}/>
            <Bar dataKey="deuda" name="Deuda" fill={C.red} radius={[4,4,0,0]}/>
          </BarChart>
        </ResponsiveContainer>
      </div>}
      <SearchInput value={q} onChange={setQ} placeholder="Buscar proveedor..."/>
      <div style={{marginTop:12}}>
        {filtered.length===0?<Empty icon="🚛" title="Sin proveedores" sub="Registra tus proveedores de ají" action={<button onClick={()=>{setForm({name:"",phone:"",address:"",product:"",notes:""});setModal("new");}} style={mkBtn("primary")}>+ Agregar proveedor</button>}/>:
          filtered.map(sp=>{
            const total=getSpTotal(sp.id); const debt=getSpDebt(sp.id); const cnt=purchases.filter(p=>p.supplierId===sp.id).length;
            return (
              <div key={sp.id} style={{...card(),marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{display:"flex",gap:10,alignItems:"center"}}>
                  <div style={{width:40,height:40,background:`linear-gradient(135deg,${C.blue},#1E40AF)`,borderRadius:11,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>🚛</div>
                  <div>
                    <div style={{fontWeight:700,fontSize:14}}>{sp.name}</div>
                    <div style={{fontSize:12,color:C.textMid}}>{sp.address}{sp.phone?` · ${sp.phone}`:""}</div>
                    {sp.product&&<div style={{fontSize:12,color:C.textFaint}}>Producto: {sp.product}</div>}
                  </div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:12,color:C.textFaint}}>{cnt} compra{cnt!==1?"s":""} · {Bs(total)}</div>
                  {debt>0&&<span style={mkBadge("red")}>Deuda {Bs(debt)}</span>}
                  <div style={{display:"flex",gap:4,marginTop:6,justifyContent:"flex-end"}}>
                    <button onClick={()=>{setForm({...sp});setModal(sp);}} style={{...mkBtn("ghost"),padding:"4px 8px",fontSize:11}}>✏️</button>
                    <button onClick={()=>save("suppliers",suppliers.filter(x=>x.id!==sp.id))} style={{...mkBtn("danger"),padding:"4px 8px",fontSize:11}}>🗑️</button>
                  </div>
                </div>
              </div>
            );
          })}
      </div>
      {purchases.length>0&&<div style={{...card(),marginTop:14}}>
        <div style={{fontWeight:700,fontSize:13,marginBottom:10}}>Historial de compras</div>
        <Table cols={[{key:"supplierName",label:"Proveedor"},{key:"product",label:"Producto"},{key:"qty",label:"Cant."},{key:"total",label:"Total",render:v=><strong>{Bs(v)}</strong>},{key:"paid",label:"Pagado",render:v=><span style={{color:C.green}}>{Bs(v)}</span>},{key:"debt",label:"Deuda",render:v=>v>0?<span style={mkBadge("red")}>{Bs(v)}</span>:<span style={mkBadge("green")}>Saldado</span>},{key:"date",label:"Fecha",render:v=>fDate(v)}]} rows={purchases.slice(0,20)}/>
      </div>}
      {(modal==="new"||(modal&&modal.id&&modal.id.startsWith("sp")))&&<Modal title={typeof modal==="string"?"Nuevo proveedor":"Editar proveedor"} onClose={()=>setModal(null)}>
        <div style={{marginBottom:10}}><label style={lbl}>Nombre *</label><input style={inp} value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Nombre del proveedor" autoFocus/></div>
        <div style={row()}>
          <div style={{flex:1}}><label style={lbl}>Teléfono</label><input style={inp} value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></div>
          <div style={{flex:1}}><label style={lbl}>Ubicación</label><input style={inp} value={form.address} onChange={e=>setForm({...form,address:e.target.value})} placeholder="Ciudad / región"/></div>
        </div>
        <div style={{marginBottom:10}}><label style={lbl}>Producto principal</label><input style={inp} value={form.product} onChange={e=>setForm({...form,product:e.target.value})} placeholder="Ej: Ají colorado en vaina"/></div>
        <div style={{marginBottom:18}}><label style={lbl}>Notas</label><input style={inp} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><button onClick={()=>setModal(null)} style={mkBtn("ghost")}>Cancelar</button><button onClick={saveSupplier} style={mkBtn("primary")}>Guardar</button></div>
      </Modal>}
      {modal==="purchase"&&<Modal title="Registrar compra a proveedor" onClose={()=>setModal(null)}>
        <div style={{marginBottom:10}}><label style={lbl}>Proveedor *</label>
          <select style={inp} value={pForm.supplierId} onChange={e=>setPForm({...pForm,supplierId:e.target.value})}>
            <option value="">Seleccionar proveedor...</option>
            {suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div style={row()}>
          <div style={{flex:1}}><label style={lbl}>Producto</label><input style={inp} value={pForm.product} onChange={e=>setPForm({...pForm,product:e.target.value})} placeholder="Ají en vaina..."/></div>
          <div style={{flex:1}}><label style={lbl}>Fecha</label><input type="date" style={inp} value={pForm.date} onChange={e=>setPForm({...pForm,date:e.target.value})}/></div>
        </div>
        <div style={row()}>
          <div style={{flex:1}}><label style={lbl}>Cantidad</label><input type="number" style={inp} value={pForm.qty} onChange={e=>setPForm({...pForm,qty:e.target.value})}/></div>
          <div style={{flex:1}}><label style={lbl}>Precio unit. (Bs.)</label><input type="number" style={inp} value={pForm.price} onChange={e=>setPForm({...pForm,price:e.target.value})}/></div>
          <div style={{flex:1}}><label style={lbl}>Pagado (Bs.)</label><input type="number" style={inp} value={pForm.paid} onChange={e=>setPForm({...pForm,paid:e.target.value})}/></div>
        </div>
        <div style={{padding:"10px 12px",background:C.bg,borderRadius:R.md,marginBottom:10,fontSize:13}}>Total: <strong style={{color:C.red}}>{Bs(n(pForm.qty)*n(pForm.price))}</strong> · Deuda: <strong style={{color:C.amber}}>{Bs(Math.max(0,n(pForm.qty)*n(pForm.price)-n(pForm.paid)))}</strong></div>
        <div style={{marginBottom:18}}><label style={lbl}>Notas</label><input style={inp} value={pForm.notes} onChange={e=>setPForm({...pForm,notes:e.target.value})}/></div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><button onClick={()=>setModal(null)} style={mkBtn("ghost")}>Cancelar</button><button onClick={savePurchase} style={mkBtn("primary")}>Registrar compra</button></div>
      </Modal>}
    </div>
  );
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  GASTOS                                                             ║
// ╚══════════════════════════════════════════════════════════════════════╝
const GASTO_CATS = ["Servicios","Alquiler","Sueldos","Transporte","Insumos","Marketing","Impuestos","Mantenimiento","Otros"];

function GastosPage({ D, save, user, logAction, onRefreshDashboard }) {
  const { expenses } = D;
  const isMobile = useIsMobile();
  const [modal, setModal] = useState(false);
  const [q, setQ] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [form, setForm] = useState({ description:"", amount:"", category:"Otros", date:today(), notes:"" });
  const FORM_RESET = () => ({ description:"", amount:"", category:"Otros", date:today(), notes:"" });

  const gastos = (expenses||[]).filter(e => e.type === "gasto");
  const filtered = gastos.filter(g => {
    const mq = `${g.description} ${g.category||""}`.toLowerCase().includes(q.toLowerCase());
    const mc = filterCat === "all" || g.category === filterCat;
    return mq && mc;
  }).sort((a,b) => new Date(b.date||b.createdAt) - new Date(a.date||a.createdAt));

  const totalMes = gastos.filter(g => {
    const d = new Date(g.date||g.createdAt); const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).reduce((s,g) => s + n(g.amount), 0);

  const doSave = async () => {
    if (!form.description.trim() || !form.amount || n(form.amount) <= 0) return;
    const gasto = {
      id: generateId(), description: form.description.trim(), amount: n(form.amount),
      category: form.category, date: new Date(form.date+"T12:00:00").toISOString(),
      notes: form.notes, type: "gasto", createdAt: new Date().toISOString(), empresa_id: user.empresa_id, usuario_id: user.id
    };
    const saved = await gastosService.createGasto(gasto, user.empresa_id);
    if (saved?._localOnly && isSupabaseUUID(user?.empresa_id)) {
      alert("⚠ Error al guardar gasto en Supabase. Revisa la consola (F12).");
      return;
    }
    save("expenses", [gasto, ...(expenses||[])]);
    logAction?.(`${user.name} registró gasto: ${form.description} ${Bs(n(form.amount))}`);
    setModal(false); setForm(FORM_RESET());
  };

  const doDelete = async () => {
    if (!deleteTarget) return;
    const res = await gastosService.deleteGasto(deleteTarget.id, user.empresa_id).catch(e => ({ ok: false, error: e.message }));
    if (res?.ok === false) {
      alert("⚠ No se pudo eliminar el gasto en Supabase. Revisa tu conexión e intenta de nuevo.");
      setDeleteTarget(null);
      return;
    }
    save("expenses", (expenses||[]).filter(e => e.id !== deleteTarget.id));
    logAction?.(`${user.name} eliminó gasto: ${deleteTarget.description}`);
    onRefreshDashboard?.();
    setDeleteTarget(null);
  };

  return (
    <div>
      <Header title="Gastos" sub="Registro y control de egresos del negocio"
        action={<button onClick={()=>{ setForm(FORM_RESET()); setModal(true); }} style={mkBtn("primary")}>+ Nuevo gasto</button>}
      />

      {/* Summary card */}
      <div style={{...card(),padding:"14px 18px",marginBottom:18,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10}}>
        <div>
          <div style={{fontSize:11,color:C.textFaint,fontWeight:600,letterSpacing:"0.07em",textTransform:"uppercase",marginBottom:4}}>Gastos este mes</div>
          <div style={{fontSize:28,fontWeight:800,color:C.red,letterSpacing:"-0.04em"}}>{Bs(totalMes)}</div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:11,color:C.textFaint,marginBottom:2}}>{gastos.length} egreso{gastos.length!==1?"s":""} total</div>
          <div style={{fontSize:11,color:C.textFaint}}>{filtered.length} mostrado{filtered.length!==1?"s":""}</div>
        </div>
      </div>

      {/* Filters */}
      <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
        <div style={{position:"relative",flex:1,minWidth:160}}>
          <Search size={13} style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)",color:C.textFaint,pointerEvents:"none"}}/>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar gastos…" style={{...inp,paddingLeft:28,margin:0}}/>
        </div>
        <select value={filterCat} onChange={e=>setFilterCat(e.target.value)} style={{...inp,margin:0,flex:"0 0 auto"}}>
          <option value="all">Todas las categorías</option>
          {GASTO_CATS.map(c=><option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div style={{...card(),padding:40,textAlign:"center",color:C.textFaint}}>
          <TrendingDown size={32} style={{margin:"0 auto 12px",opacity:0.3}}/>
          <div style={{fontSize:14}}>Sin gastos registrados</div>
        </div>
      ) : (
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {filtered.map(g => (
            <div key={g.id} style={{...card(),padding:"12px 16px",display:"flex",alignItems:"center",gap:12,flexWrap:isMobile?"wrap":"nowrap"}}>
              <div style={{width:36,height:36,borderRadius:10,background:C.redBg,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <TrendingDown size={16} color={C.red}/>
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:600,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{g.description}</div>
                <div style={{fontSize:11,color:C.textFaint,marginTop:2}}>
                  {g.category&&<span style={{...mkBadge("gray"),marginRight:6}}>{g.category}</span>}
                  {fDate(g.date||g.createdAt)}
                  {g.notes&&<span style={{marginLeft:8,fontStyle:"italic",opacity:0.7}}>{g.notes}</span>}
                </div>
              </div>
              <div style={{fontWeight:800,fontSize:15,color:C.red,flexShrink:0}}>{Bs(n(g.amount))}</div>
              {isAdmin(user)&&<button onClick={()=>setDeleteTarget(g)} style={{...mkBtn("ghost"),padding:"4px 8px",fontSize:11,flexShrink:0,color:C.red}}>×</button>}
            </div>
          ))}
        </div>
      )}

      {/* New expense modal */}
      {modal && (
        <Modal title="Nuevo Gasto" onClose={()=>setModal(false)} width={440}>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <div>
              <label style={{fontSize:12,color:C.textMid,display:"block",marginBottom:4}}>Descripción *</label>
              <input value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="Ej: Pago de alquiler" style={{...inp,margin:0}} autoFocus/>
            </div>
            <div style={{display:"flex",gap:8}}>
              <div style={{flex:1}}>
                <label style={{fontSize:12,color:C.textMid,display:"block",marginBottom:4}}>Monto (Bs.) *</label>
                <input type="number" min="0" step="0.01" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} placeholder="0.00" style={{...inp,margin:0}}/>
              </div>
              <div style={{flex:1}}>
                <label style={{fontSize:12,color:C.textMid,display:"block",marginBottom:4}}>Fecha</label>
                <input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} style={{...inp,margin:0}}/>
              </div>
            </div>
            <div>
              <label style={{fontSize:12,color:C.textMid,display:"block",marginBottom:4}}>Categoría</label>
              <select value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))} style={{...inp,margin:0}}>
                {GASTO_CATS.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={{fontSize:12,color:C.textMid,display:"block",marginBottom:4}}>Notas</label>
              <input value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Descripción adicional (opcional)" style={{...inp,margin:0}}/>
            </div>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:6}}>
              <button onClick={()=>setModal(false)} style={mkBtn("ghost")}>Cancelar</button>
              <button onClick={doSave} disabled={!form.description.trim()||n(form.amount)<=0} style={{...mkBtn("danger"),opacity:(!form.description.trim()||n(form.amount)<=0)?0.5:1}}>Registrar gasto</button>
            </div>
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <Modal title="Eliminar gasto" onClose={()=>setDeleteTarget(null)} width={400}>
          <div style={{fontSize:13,color:C.textMid,marginBottom:16}}>¿Eliminar el gasto <strong>{deleteTarget.description}</strong> por <strong>{Bs(n(deleteTarget.amount))}</strong>?</div>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
            <button onClick={()=>setDeleteTarget(null)} style={mkBtn("ghost")}>Cancelar</button>
            <button onClick={doDelete} style={mkBtn("danger")}>Eliminar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  CAJA                                                               ║
// ╚══════════════════════════════════════════════════════════════════════╝
function Caja({ D, save, user, logAction, onRefreshDashboard }) {
  const { expenses, sales } = D;
  const [modal,setModal]=useState(false); const [cajaModal,setCajaModal]=useState(null);
  const [filter,setFilter]=useState("all"); const [q,setQ]=useState(""); const [period,setPeriod]=useState("month"); const [deleteTarget,setDeleteTarget]=useState(null);
  const [form,setForm]=useState({type:"gasto",category:"",description:"",amount:"",date:today(),notes:""});
  const [cajaForm,setCajaForm]=useState({amount:"",notes:""});
  const CATS2 = { ingreso:["Cobro de deuda","Venta directa","Otro ingreso"], gasto:["Compras / mercadería","Transporte","Sueldos","Alquiler","Energía","Servicios","Mantenimiento","Otro gasto"] };
  const canDeleteCash = isAdmin(user);

  // Determinar si la caja está abierta (último evento de caja)
  const cajaSorted=[...expenses].filter(e=>e.type==="apertura_caja"||e.type==="cierre_caja").sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  const lastCajaEvt=cajaSorted[0];
  const cajaAbierta=lastCajaEvt?.type==="apertura_caja";
  const montoApertura=lastCajaEvt?.amount||0;

  const filteredExpensesByPeriod=filterByPeriod(expenses, period, item => item.date);
  const salesIncome=getSalePayments(sales).filter(payment=>isWithinPeriod(payment.date, period)).reduce((a,payment)=>a+payment.amount,0);
  const regIncome=filteredExpensesByPeriod.filter(e=>e.type==="ingreso").reduce((a,e)=>a+e.amount,0);
  const totalExpense=filteredExpensesByPeriod.filter(e=>e.type==="gasto").reduce((a,e)=>a+e.amount,0);
  const balance=salesIncome+regIncome-totalExpense;
  const fondoEsperado=montoApertura+salesIncome+regIncome-totalExpense;

  const doSave=async()=>{
    if(!form.description||!form.amount)return;
    const entry={...form,id:generateId(),amount:n(form.amount),responsable:user.name,createdAt:new Date().toISOString(),usuario_id:user.id};
    const saved=await gastosService.createGasto(entry, user.empresa_id).catch(e=>({_localOnly:true, error:e.message}));
    if(saved?._localOnly && isSupabaseUUID(user?.empresa_id)){
      alert("⚠ Error Supabase al guardar el movimiento de caja. No se guardó — revisa tu conexión e intenta de nuevo.");
      return;
    }
    save("expenses",[entry,...expenses]);
    logAction?.(`${user.name} registró un ${form.type==="ingreso"?"ingreso":"egreso"} de ${Bs(form.amount)} en caja`);
    setModal(false); setForm({type:"gasto",category:"",description:"",amount:"",date:today(),notes:""});
  };

  const doAbrirCaja=async()=>{
    if(!cajaForm.amount&&cajaForm.amount!=="0")return;
    const entry={id:generateId(),type:"apertura_caja",category:"Apertura de caja",description:`Apertura de caja — fondo inicial: ${Bs(n(cajaForm.amount))}`,amount:n(cajaForm.amount),responsable:user.name,notes:cajaForm.notes,date:today(),createdAt:new Date().toISOString(),usuario_id:user.id};
    const saved=await gastosService.createGasto(entry, user.empresa_id).catch(e=>({_localOnly:true, error:e.message}));
    if(saved?._localOnly && isSupabaseUUID(user?.empresa_id)){
      alert("⚠ Error Supabase al abrir la caja. No se guardó — revisa tu conexión e intenta de nuevo.");
      return;
    }
    save("expenses",[entry,...expenses]);
    logAction?.(`${user.name} abrió la caja con fondo de ${Bs(n(cajaForm.amount))}`);
    setCajaModal(null); setCajaForm({amount:"",notes:""});
  };

  const doCerrarCaja=async()=>{
    const arqueo=n(cajaForm.amount);
    const diferencia=arqueo-fondoEsperado;
    const entry={id:generateId(),type:"cierre_caja",category:"Cierre de caja",description:`Cierre de caja — arqueo: ${Bs(arqueo)} | esperado: ${Bs(fondoEsperado)} | diferencia: ${Bs(diferencia)}`,amount:arqueo,responsable:user.name,notes:cajaForm.notes,date:today(),createdAt:new Date().toISOString(),usuario_id:user.id};
    const saved=await gastosService.createGasto(entry, user.empresa_id).catch(e=>({_localOnly:true, error:e.message}));
    if(saved?._localOnly && isSupabaseUUID(user?.empresa_id)){
      alert("⚠ Error Supabase al cerrar la caja. No se guardó — revisa tu conexión e intenta de nuevo.");
      return;
    }
    save("expenses",[entry,...expenses]);
    logAction?.(`${user.name} cerró la caja. Arqueo: ${Bs(arqueo)}, diferencia: ${Bs(diferencia)}`);
    setCajaModal(null); setCajaForm({amount:"",notes:""});
  };

  const filtered=filteredExpensesByPeriod.filter(e=>{ const mf=filter==="all"||e.type===filter||((e.type==="apertura_caja"||e.type==="cierre_caja")&&filter==="all"); const ms=`${e.description} ${e.category}`.toLowerCase().includes(q.toLowerCase()); return mf&&ms&&e.type!=="apertura_caja"&&e.type!=="cierre_caja"; }).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));

  const cashChart=buildCashChart(sales, expenses, period);
  const removeExpense=async()=>{
    if(!deleteTarget)return;
    const res=await gastosService.deleteGasto(deleteTarget.id,user.empresa_id).catch(e=>({ok:false,error:e.message}));
    if(res?.ok===false){
      alert("⚠ No se pudo eliminar el movimiento de caja en Supabase. Revisa tu conexión e intenta de nuevo.");
      setDeleteTarget(null);
      return;
    }
    save("expenses",expenses.filter(item=>item.id!==deleteTarget.id));
    logAction?.(`${user.name} eliminó un movimiento de caja por ${Bs(deleteTarget.amount)}`);
    onRefreshDashboard?.();
    setDeleteTarget(null);
  };

  return (
    <div>
      <Header title="Caja Empresarial" sub="Control de flujo, apertura y cierre de caja" action={<>
        <button onClick={async()=>{await xlsx([{name:"Caja",data:expenses.filter(e=>e.type!=="apertura_caja"&&e.type!=="cierre_caja").map(e=>({Fecha:fDate(e.date),Tipo:e.type==="ingreso"?"Ingreso":"Gasto",Categoría:e.category,Descripción:e.description,Responsable:e.responsable||"—","Monto(Bs)":e.amount.toFixed(2)}))}],"caja_moxi_business.xlsx");}} style={mkBtn("ghost")}>⬇️ Exportar</button>
        {cajaAbierta
          ?<button onClick={()=>{setCajaForm({amount:"",notes:""});setCajaModal("cierre");}} style={{...mkBtn("danger")}}>⏹ Cerrar caja</button>
          :<button onClick={()=>{setCajaForm({amount:"",notes:""});setCajaModal("apertura");}} style={{...mkBtn("success")}}>▶ Abrir caja</button>
        }
        <button onClick={()=>setModal(true)} style={mkBtn("primary")}>+ Movimiento</button>
      </>}/>

      {/* Estado de caja */}
      <div style={{...card({marginBottom:14,borderLeft:`3px solid ${cajaAbierta?C.green:C.borderMid}`}),background:cajaAbierta?C.greenBg:C.bg}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
          <div>
            <div style={{fontWeight:700,fontSize:13,color:cajaAbierta?C.green:C.textMid}}>{cajaAbierta?"● Caja abierta":"○ Caja cerrada"}</div>
            {cajaAbierta&&<div style={{fontSize:12,color:C.textMid,marginTop:2}}>Fondo inicial: {Bs(montoApertura)} · Responsable: {lastCajaEvt?.responsable||"—"} · {fDate(lastCajaEvt?.createdAt)}</div>}
          </div>
          {cajaAbierta&&<div style={{textAlign:"right"}}>
            <div style={{fontSize:11,color:C.textFaint}}>Fondo esperado en caja</div>
            <div style={{fontSize:20,fontWeight:800,color:fondoEsperado>=0?C.green:C.red,letterSpacing:"-0.03em"}}>{Bs(fondoEsperado)}</div>
          </div>}
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10,marginBottom:14}}>
        <KPI label="Cobrado en ventas" value={Bs(salesIncome)} Icon="🛒" color={C.green}/>
        <KPI label="Otros ingresos" value={Bs(regIncome)} Icon="💵" color={C.blue}/>
        <KPI label="Total egresos" value={Bs(totalExpense)} Icon="📤" color={C.red}/>
        <KPI label="Balance neto" value={Bs(balance)} Icon="💰" color={balance>=0?C.green:C.red}/>
      </div>
      <div style={{...card(),marginBottom:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,gap:8,flexWrap:"wrap"}}>
          <div style={{fontWeight:700,fontSize:13}}>Flujo por periodo</div>
          <Chip value={period} onChange={setPeriod} options={PERIOD_OPTIONS}/>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={cashChart} margin={{top:4,right:4,left:0,bottom:0}}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
            <XAxis dataKey="date" tick={{fontSize:11}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fontSize:11}} axisLine={false} tickLine={false} tickFormatter={v=>`Bs.${v}`}/>
            <Tooltip formatter={(v,nm)=>[Bs(v),nm]} contentStyle={{borderRadius:8,fontSize:12}}/>
            <Legend iconSize={9} wrapperStyle={{fontSize:12}}/>
            <Bar dataKey="ingresos" name="Ingresos" fill={C.green} radius={[4,4,0,0]}/>
            <Bar dataKey="gastos" name="Gastos" fill={C.red} radius={[4,4,0,0]}/>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
        <SearchInput value={q} onChange={setQ} placeholder="Buscar movimiento..."/>
        <Chip value={filter} onChange={setFilter} options={[["all","Todos"],["ingreso","Ingresos"],["gasto","Gastos"]]}/>
      </div>
      <div style={card()}>
        {filtered.length===0?<Empty icon="💰" title="Sin movimientos" sub="Registra ingresos y gastos del negocio"/>:
          <Table cols={[
            {key:"date",label:"Fecha",render:v=>fDate(v)},
            {key:"type",label:"Tipo",render:v=><span style={mkBadge(v==="ingreso"?"green":"red")}>{v==="ingreso"?"↑ Ingreso":"↓ Gasto"}</span>},
            {key:"category",label:"Categoría"},
            {key:"description",label:"Descripción"},
            {key:"responsable",label:"Responsable",render:v=>v||"—"},
            {key:"amount",label:"Monto",render:(v,row)=><strong style={{color:row.type==="ingreso"?C.green:C.red}}>{row.type==="ingreso"?"+":"-"}{Bs(v)}</strong>},
            {key:"id",label:"",render:(_,row)=>canDeleteCash?<button onClick={ev=>{ev.stopPropagation();setDeleteTarget(row);}} style={{...mkBtn("danger"),padding:"4px 8px",fontSize:11}}>×</button>:null}
          ]} rows={filtered}/>}
      </div>

      {/* Modal apertura */}
      {cajaModal==="apertura"&&<Modal title="▶ Abrir caja" onClose={()=>setCajaModal(null)} width={420}>
        <div style={{fontSize:13,color:C.textMid,marginBottom:14}}>Registra el fondo inicial de caja antes de iniciar operaciones.</div>
        <div style={{marginBottom:10}}><label style={lbl}>Fondo inicial (Bs.) *</label><input type="number" min="0" step="0.5" style={inp} value={cajaForm.amount} onChange={e=>setCajaForm(f=>({...f,amount:e.target.value}))} placeholder="0.00" autoFocus/></div>
        <div style={{marginBottom:18}}><label style={lbl}>Observaciones</label><input style={inp} value={cajaForm.notes} onChange={e=>setCajaForm(f=>({...f,notes:e.target.value}))} placeholder="Turno, responsable, etc."/></div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <button onClick={()=>setCajaModal(null)} style={mkBtn("ghost")}>Cancelar</button>
          <button onClick={doAbrirCaja} style={mkBtn("success")}>▶ Abrir caja</button>
        </div>
      </Modal>}

      {/* Modal cierre */}
      {cajaModal==="cierre"&&<Modal title="⏹ Cerrar caja — Arqueo" onClose={()=>setCajaModal(null)} width={460}>
        <div style={{...card({marginBottom:14,background:C.bg})}}>
          <div style={{fontWeight:700,fontSize:13,marginBottom:10}}>Resumen del turno</div>
          {[["Fondo apertura",Bs(montoApertura),C.textMid],["Cobrado en ventas",Bs(salesIncome),C.green],["Otros ingresos",Bs(regIncome),C.green],["Egresos",`-${Bs(totalExpense)}`,C.red],["Fondo esperado",Bs(fondoEsperado),fondoEsperado>=0?C.green:C.red]].map(([l,v,c])=>(
            <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:`1px solid ${C.border}`,fontSize:13}}>
              <span style={{color:C.textMid}}>{l}</span><span style={{fontWeight:700,color:c}}>{v}</span>
            </div>
          ))}
        </div>
        <div style={{marginBottom:10}}><label style={lbl}>Arqueo — efectivo contado (Bs.) *</label><input type="number" min="0" step="0.5" style={inp} value={cajaForm.amount} onChange={e=>setCajaForm(f=>({...f,amount:e.target.value}))} placeholder="0.00" autoFocus/></div>
        {cajaForm.amount&&<div style={{...card({marginBottom:10,background:n(cajaForm.amount)>=fondoEsperado?C.greenBg:C.redBg,border:`1px solid ${n(cajaForm.amount)>=fondoEsperado?C.greenMid:C.redMid}`})}}>
          <div style={{fontSize:12,fontWeight:600,color:n(cajaForm.amount)>=fondoEsperado?C.green:C.red}}>
            Diferencia: {Bs(n(cajaForm.amount)-fondoEsperado)} {n(cajaForm.amount)>=fondoEsperado?"(sobrante)":"(faltante)"}
          </div>
        </div>}
        <div style={{marginBottom:18}}><label style={lbl}>Observaciones</label><input style={inp} value={cajaForm.notes} onChange={e=>setCajaForm(f=>({...f,notes:e.target.value}))} placeholder="Notas del cierre..."/></div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <button onClick={()=>setCajaModal(null)} style={mkBtn("ghost")}>Cancelar</button>
          <button onClick={doCerrarCaja} style={mkBtn("danger")}>⏹ Cerrar caja</button>
        </div>
      </Modal>}

      {deleteTarget&&<Modal title="Eliminar movimiento" onClose={()=>setDeleteTarget(null)} width={420}>
        <div style={{fontSize:13,color:C.textMid,marginBottom:16}}>Solo administradores pueden eliminar movimientos del historial. Esta acción no se puede deshacer.</div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <button onClick={()=>setDeleteTarget(null)} style={mkBtn("ghost")}>Cancelar</button>
          <button onClick={removeExpense} style={mkBtn("danger")}>Eliminar</button>
        </div>
      </Modal>}
      {modal&&<Modal title="Registrar movimiento de caja" onClose={()=>setModal(false)}>
        <div style={{marginBottom:12}}>
          <label style={lbl}>Tipo</label>
          <div style={{display:"flex",gap:6}}>
            {[["ingreso","↑ Ingreso","success"],["gasto","↓ Gasto","danger"]].map(([v,l,c])=><button key={v} onClick={()=>setForm({...form,type:v,category:""})} style={{...mkBtn(form.type===v?c:"ghost"),flex:1,justifyContent:"center"}}>{l}</button>)}
          </div>
        </div>
        <div style={row()}>
          <div style={{flex:1}}><label style={lbl}>Categoría</label>
            <select style={inp} value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>
              <option value="">Seleccionar...</option>
              {CATS2[form.type].map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={{flex:1}}><label style={lbl}>Fecha</label><input type="date" style={inp} value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></div>
        </div>
        <div style={{marginBottom:10}}><label style={lbl}>Descripción *</label><input style={inp} value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Descripción del movimiento" autoFocus/></div>
        <div style={row()}>
          <div style={{flex:1}}><label style={lbl}>Monto (Bs.) *</label><input type="number" min="0" step="0.5" style={inp} value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} placeholder="0.00"/></div>
          <div style={{flex:1}}><label style={lbl}>Notas</label><input style={inp} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></div>
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:6}}><button onClick={()=>setModal(false)} style={mkBtn("ghost")}>Cancelar</button><button onClick={doSave} style={mkBtn("primary")}>Guardar</button></div>
      </Modal>}
    </div>
  );
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  ANÁLISIS                                                           ║
// ╚══════════════════════════════════════════════════════════════════════╝
function Analisis({ D }) {
  const { sales, customers, products, expenses, orders, categories } = D;
  const totalSales=sales.reduce((a,s)=>a+s.total,0);
  const totalPaid=sales.reduce((a,s)=>a+s.paid,0);
  const totalExpenses=expenses.filter(e=>e.type==="gasto").reduce((a,e)=>a+e.amount,0);
  const grossMargin=totalSales>0?((totalSales-totalExpenses)/totalSales*100):0;
  const purchaseCost=expenses.filter(e=>e.category==="Compra de ají").reduce((a,e)=>a+e.amount,0);
  const breakEven=totalSales>0&&totalSales!==totalExpenses?(totalExpenses/(1-purchaseCost/totalSales)).toFixed(0):0;

  // Top products by revenue
  const prodRev={};
  sales.forEach(s=>s.items.forEach(it=>{ prodRev[it.productId]=(prodRev[it.productId]||0)+n(it.subtotal??it.sub); }));
  const topProds=Object.entries(prodRev).map(([id,rev])=>{ const p=products.find(x=>x.id===id); return{name:p?.name||"?",rev,units:sales.flatMap(s=>s.items.filter(i=>i.productId===id)).reduce((a,i)=>a+n(i.qty),0)}; }).sort((a,b)=>b.rev-a.rev).slice(0,8);
  const topSoldProducts=topProds.slice().sort((a,b)=>b.units-a.units).slice(0,3);

  // Top clients
  const topClients=customers.map(c=>({ name:c.name, total:sales.filter(s=>s.customerId===c.id).reduce((a,s)=>a+s.total,0), purchases:sales.filter(s=>s.customerId===c.id).length })).sort((a,b)=>b.total-a.total).slice(0,6);

  // Category breakdown
  const catRev={};
  sales.forEach(s=>s.items.forEach(it=>{ const p=products.find(x=>x.id===it.productId); if(p){ catRev[p.cat]=(catRev[p.cat]||0)+n(it.subtotal??it.sub); } }));
  const catData=Object.entries(catRev).map(([cat,rev])=>({name:getCategoryName(categories, cat),value:Math.round(rev)})).sort((a,b)=>b.value-a.value);

  // Production analysis
  const prodAnalysis=orders.map(o=>({name:o.formulaName,margin:o.margin,cost:o.totalCost,revenue:o.revenue,costPerUnit:o.costPerUnit}));

  return (
    <div>
      <Header title="Análisis y Rentabilidad" sub="Indicadores clave del negocio"/>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(155px,1fr))",gap:10,marginBottom:18}}>
        <KPI label="Margen bruto estimado" value={`${Math.round(grossMargin)}%`} sub="(ventas - gastos)" color={grossMargin>30?C.green:grossMargin>10?C.amber:C.red} Icon="📊"/>
        <KPI label="Total facturado" value={Bs(totalSales)} color={C.red} Icon="🛒"/>
        <KPI label="Total cobrado" value={Bs(totalPaid)} sub={`${pct(totalPaid,totalSales)}% de lo facturado`} color={C.green} Icon="✅"/>
        <KPI label="Total gastos" value={Bs(totalExpenses)} color={C.amber} Icon="📤"/>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
        {/* Top products chart */}
        <div style={card()}>
          <div style={{fontWeight:700,fontSize:13,marginBottom:12}}>📦 Top 3 productos más vendidos</div>
          {topSoldProducts.length===0?<Empty icon="📦" title="Sin datos" sub="Registra ventas para ver el análisis"/>:
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={topSoldProducts} layout="vertical" margin={{top:0,right:8,left:0,bottom:0}}>
                <XAxis type="number" tick={{fontSize:10}} axisLine={false} tickLine={false}/>
                <YAxis type="category" dataKey="name" tick={{fontSize:10}} axisLine={false} tickLine={false} width={120}/>
                <Tooltip formatter={(v, name, entry)=>name==="Unidades"?[`${v} unidades`,"Vendidos"]:[Bs(entry?.payload?.rev||0),"Ingresos"]} contentStyle={{borderRadius:8,fontSize:12}}/>
                <Bar dataKey="units" name="Unidades" fill={C.red} radius={[0,4,4,0]}/>
              </BarChart>
            </ResponsiveContainer>}
        </div>

        {/* Top clients */}
        <div style={card()}>
          <div style={{fontWeight:700,fontSize:13,marginBottom:12}}>👥 Mejores clientes</div>
          {topClients.length===0?<Empty icon="👥" title="Sin datos" sub="Registra clientes y ventas"/>:
            topClients.map((c,i)=>(
              <div key={c.name} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:`1px solid ${C.border}`}}>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <div style={{width:22,height:22,background:i===0?"#F59E0B":i===1?"#9CA3AF":i===2?"#CD7F32":C.bg,borderRadius:50,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:i<3?"white":C.textFaint}}>{i+1}</div>
                  <div>
                    <div style={{fontSize:13,fontWeight:500}}>{c.name}</div>
                    <div style={{fontSize:11,color:C.textFaint}}>{c.purchases} compra{c.purchases!==1?"s":""}</div>
                  </div>
                </div>
                <div style={{fontSize:14,fontWeight:700,color:C.red}}>{Bs(c.total)}</div>
              </div>
            ))}
        </div>
      </div>

      {catData.length>0&&<div style={{...card(),marginBottom:14}}>
        <div style={{fontWeight:700,fontSize:13,marginBottom:12}}>🥧 Ingresos por categoría de producto</div>
        <div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"center"}}>
          <ResponsiveContainer width="50%" height={160}>
            <PieChart>
              <Pie data={catData} cx="50%" cy="50%" outerRadius={65} dataKey="value" nameKey="name" label={({percent})=>`${Math.round(percent*100)}%`} labelLine={false}>
                {catData.map((_,i)=><Cell key={i} fill={SECTORS_COLORS[i%SECTORS_COLORS.length]}/>)}
              </Pie>
              <Tooltip formatter={v=>[Bs(v)]} contentStyle={{borderRadius:8,fontSize:12}}/>
            </PieChart>
          </ResponsiveContainer>
          <div style={{flex:1}}>
            {catData.map((c,i)=>(
              <div key={c.name} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{width:10,height:10,borderRadius:2,background:SECTORS_COLORS[i%SECTORS_COLORS.length]}}/>
                  <span style={{fontSize:13}}>{c.name}</span>
                </div>
                <span style={{fontWeight:600,fontSize:13}}>{Bs(c.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>}

      {prodAnalysis.length>0&&<div style={card()}>
        <div style={{fontWeight:700,fontSize:13,marginBottom:12}}>🏭 Análisis de órdenes de producción</div>
        <Table cols={[
          {key:"name",label:"Fórmula",style:{fontWeight:500}},
          {key:"cost",label:"Costo total",render:v=>Bs(v)},
          {key:"revenue",label:"Valor producido",render:v=><span style={{color:C.green,fontWeight:600}}>{Bs(v)}</span>},
          {key:"costPerUnit",label:"Costo/unidad",render:v=>Bs(v)},
          {key:"margin",label:"Margen",render:v=><span style={mkBadge(v>=40?"green":v>=20?"amber":"red")}>{v}%</span>},
        ]} rows={prodAnalysis}/>
      </div>}
    </div>
  );
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  EXPORTAR                                                           ║
// ╚══════════════════════════════════════════════════════════════════════╝
function Exportar({ D }) {
  const { customers, products, sales, inventory, expenses, suppliers, purchases, categories } = D;
  const [loading,setLoading]=useState({});
  const run=async(k,fn)=>{ setLoading(l=>({...l,[k]:true})); try{await fn();}finally{setLoading(l=>({...l,[k]:false})); }};

  const EXPORTS=[
    {k:"clients",icon:"👥",title:"Cartera de Clientes",desc:"Nombre, teléfono, mercado, deudas e historial",fn:async()=>{ await xlsx([{name:"Clientes",data:customers.map(c=>{const debt=sales.filter(s=>s.customerId===c.id).reduce((a,s)=>a+s.debt,0);const total=sales.filter(s=>s.customerId===c.id).reduce((a,s)=>a+s.total,0);return{Nombre:c.name,Teléfono:c.phone,Dirección:c.address,Mercado:c.market,"CI/NIT":c.ci,"Total Comprado(Bs)":total.toFixed(2),"Deuda(Bs)":debt.toFixed(2),Notas:c.notes};})}],"clientes_moxi_business.xlsx"); }},
    {k:"sales",icon:"🛒",title:"Historial de Ventas",desc:"Todas las ventas con estado de pago",fn:async()=>{ await xlsx([{name:"Ventas",data:sales.map(s=>({Fecha:fDate(s.date),Cliente:s.customerName,Mercado:s.customerMarket,Total:s.total.toFixed(2),Pagado:s.paid.toFixed(2),Deuda:s.debt.toFixed(2),Estado:s.debt>0?"Pendiente":"Saldado",Notas:s.notes}))}],"ventas_moxi_business.xlsx"); }},
    {k:"debts",icon:"💳",title:"Reporte de Deudas",desc:"Clientes con saldo pendiente por cobrar",fn:async()=>{ await xlsx([{name:"Deudas",data:customers.flatMap(c=>sales.filter(s=>s.customerId===c.id&&s.debt>0).map(s=>({Cliente:c.name,Teléfono:c.phone,Mercado:c.market,"Fecha Venta":fDate(s.date),"Total Venta(Bs)":s.total.toFixed(2),"Pagado(Bs)":s.paid.toFixed(2),"Deuda(Bs)":s.debt.toFixed(2)})))}],"deudas_moxi_business.xlsx"); }},
    {k:"inventory",icon:"🗃️",title:"Inventario Actual",desc:"Stock por producto con valorización",fn:async()=>{ await xlsx([{name:"Inventario",data:products.map(p=>{const inv=inventory.find(i=>i.productId===p.id);const stock=inv?.stock||0;return{Producto:p.name,Categoría:getCategoryName(categories, p.cat),Stock:stock,Unidad:p.unit,"Stock mínimo":p.minStock,"Precio(Bs)":p.price.toFixed(2),"Valor(Bs)":(stock*p.price).toFixed(2)};})},{name:"Movimientos",data:[]}],"inventario_moxi_business.xlsx"); }},
    {k:"cash",icon:"💰",title:"Flujo de Caja",desc:"Ingresos y gastos registrados",fn:async()=>{ await xlsx([{name:"Flujo de Caja",data:expenses.map(e=>({Fecha:fDate(e.date),Tipo:e.type==="ingreso"?"Ingreso":"Gasto",Categoría:e.category,Descripción:e.description,"Monto(Bs)":e.amount.toFixed(2)}))}],"caja_moxi_business.xlsx"); }},
    {k:"suppliers",icon:"🚛",title:"Proveedores y Compras",desc:"Lista de proveedores e historial de compras",fn:async()=>{ await xlsx([{name:"Proveedores",data:suppliers.map(s=>({Nombre:s.name,Teléfono:s.phone,Ubicación:s.address,Producto:s.product,Notas:s.notes}))},{name:"Compras",data:purchases.map(p=>({Proveedor:p.supplierName,Producto:p.product,Cantidad:p.qty,"Precio unit.":p.price?.toFixed(2)||"0.00","Total(Bs)":p.total.toFixed(2),"Pagado(Bs)":p.paid.toFixed(2),"Deuda(Bs)":p.debt.toFixed(2),Fecha:fDate(p.date)}))}],"proveedores_moxi_business.xlsx"); }},
    {k:"full",icon:"📋",title:"Reporte Completo",desc:"Todo el negocio en un solo archivo Excel",fn:async()=>{
      const cData=customers.map(c=>{const debt=sales.filter(s=>s.customerId===c.id).reduce((a,s)=>a+s.debt,0);return{Nombre:c.name,Mercado:c.market,"Deuda(Bs)":debt.toFixed(2)};});
      const sData=sales.map(s=>({Fecha:fDate(s.date),Cliente:s.customerName,Total:s.total.toFixed(2),Pagado:s.paid.toFixed(2),Deuda:s.debt.toFixed(2)}));
      const iData=products.map(p=>{const inv=inventory.find(i=>i.productId===p.id);const stock=inv?.stock||0;return{Producto:p.name,Stock:stock,Unidad:p.unit,"Precio unit.":p.price.toFixed(2),"Total(Bs)":(stock*p.price).toFixed(2)};});
      await xlsx([{name:"Clientes",data:cData},{name:"Ventas",data:sData},{name:"Inventario",data:iData},{name:"Gastos",data:expenses.map(e=>({Fecha:fDate(e.date),Descripción:e.description,"Monto(Bs)":e.amount.toFixed(2)}))}],"reporte_completo_moxi_business.xlsx");
    }},
  ];

  return (
    <div>
      <Header title="Exportar Datos" sub="Descarga reportes en formato Excel (.xlsx) para compartir o analizar"/>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(270px,1fr))",gap:12}}>
        {EXPORTS.map(ex=>(
          <div key={ex.k} style={card()}>
            <div style={{display:"flex",gap:12,marginBottom:14}}>
              <div style={{width:44,height:44,background:C.bg,borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,border:`1px solid ${C.border}`,flexShrink:0}}>{ex.icon}</div>
              <div><div style={{fontWeight:700,fontSize:14,letterSpacing:"-0.02em"}}>{ex.title}</div><div style={{fontSize:12,color:C.textMid,marginTop:2}}>{ex.desc}</div></div>
            </div>
            <button onClick={()=>run(ex.k,ex.fn)} disabled={loading[ex.k]} style={{...mkBtn("primary"),width:"100%",justifyContent:"center",opacity:loading[ex.k]?0.7:1}}>
              ⬇️ {loading[ex.k]?"Generando archivo...":"Descargar Excel"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  ROOT APP                                                           ║
// ╚══════════════════════════════════════════════════════════════════════╝
// Para productos, excluye img del diff (base64 puede ser enorme — evita stringify lento)
function itemKey(key, item) {
  if (key === "products") { const { img, ...rest } = item; return JSON.stringify(rest); }
  return JSON.stringify(item);
}

// Sincroniza a Supabase el diff entre el array anterior y el nuevo (fire-and-forget)
async function syncDiff(key, prev, next, user) {
  if (!user?.empresa_id) return;
  const { empresa_id } = user;
  const prevArr = Array.isArray(prev) ? prev : [];
  const nextArr = Array.isArray(next) ? next : [];
  const prevMap = new Map(prevArr.map(item => [item.id, itemKey(key, item)]));
  const nextMap = new Map(nextArr.map(item => [item.id, item]));

  const _logSyncErr = (op, entity, e) => {
    const msg = e?.message ?? String(e);
    if (msg.includes("duplicate key") || msg.includes("already exists") || msg.includes("PGRST204")) return;
    console.error(`[syncDiff] ${op} ${entity} FAILED:`, msg);
  };

  for (const [id, item] of nextMap) {
    const prevJson = prevMap.get(id);
    if (!prevJson) {
      // Insert
      if (key === "customers")  clientesService.createCliente(item, empresa_id).catch(e => _logSyncErr("INSERT", "customers", e));
      if (key === "products")   productosService.upsertProducto({ ...item, empresa_id }).catch(e => _logSyncErr("INSERT", "products", e));
      if (key === "inventory")  inventarioService.upsertStock(item, empresa_id).catch(e => _logSyncErr("INSERT", "inventory", e));
      if (key === "expenses")   gastosService.createGasto(item, empresa_id).catch(e => _logSyncErr("INSERT", "expenses", e));
      if (key === "movements")  movimientosService.createMovimiento(item, empresa_id).catch(e => _logSyncErr("INSERT", "movements", e));
    } else if (prevJson !== itemKey(key, item)) {
      // Update (gastos y movimientos son inmutables — solo clientes/productos/inventario)
      if (key === "customers") clientesService.updateCliente(item, empresa_id).catch(e => _logSyncErr("UPDATE", "customers", e));
      if (key === "products")  productosService.upsertProducto({ ...item, empresa_id }).catch(e => _logSyncErr("UPDATE", "products", e));
      if (key === "inventory") inventarioService.upsertStock(item, empresa_id).catch(e => _logSyncErr("UPDATE", "inventory", e));
    }
  }

  for (const id of prevMap.keys()) {
    if (!nextMap.has(id)) {
      // Delete
      if (key === "customers") clientesService.deleteCliente(id, empresa_id).catch(e => _logSyncErr("DELETE", "customers", e));
      if (key === "products")  productosService.deleteProducto(id, empresa_id).catch(e => _logSyncErr("DELETE", "products", e));
      if (key === "expenses")  gastosService.deleteGasto(id, empresa_id).catch(e => _logSyncErr("DELETE", "expenses", e));
      // inventory y movements: no se eliminan
    }
  }
}

const SYNC_KEYS = new Set(["customers", "products", "inventory", "expenses", "movements"]);

// Estado de aplicación completamente vacío — sin demo data, sin datos de empresa anterior.
// Usar en: logout, cambio de usuario, onboarding incompleto.
function createEmptyAppState() {
  return {
    customers:    [],
    products:     [],
    inventory:    [],
    sales:        [],
    suppliers:    [],
    purchases:    [],
    formulas:     [],
    orders:       [],
    pedidos:      [],
    expenses:     [],
    movements:    [],
    categories:   DEFAULT_CATEGORIES,
    users:        DEFAULT_USERS,
    config:       DEFAULT_CONFIG,
    activityLogs: DEFAULT_ACTIVITY_LOGS,
  };
}

export default function App() {
  const [user,setUser]=useState(null);
  const [tab,setTab]=useState("dashboard");
  const [data,setData]=useState(null);
  const [sidebarOpen,setSidebarOpen]=useState(false);
  const [sidebarCollapsed,setSidebarCollapsed]=useState(false);
  const [recoveryMode,setRecoveryMode]=useState(false);
  const [sessionChecked,setSessionChecked]=useState(false);
  const [isRestoringSession,setIsRestoringSession]=useState(false);
  const [isLoadingScope,setIsLoadingScope]=useState(false);
  const [globalSearch,setGlobalSearch]=useState("");
  const [showGlobalResults,setShowGlobalResults]=useState(false);
  const [rtRefreshTrigger,setRtRefreshTrigger]=useState(0);
  const globalSearchRef=useRef(null);
  const isMobile=useIsMobile();

  // Refs para acceder a user/data actuales dentro de callbacks sin stale closures
  const userRef = useRef(null);
  const dataRef = useRef(null);
  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { if (data) dataRef.current = data; }, [data]);

  // loginUser: actualiza userRef Y empresa scope SÍNCRONAMENTE antes del render.
  // También bloquea el ERP (isLoadingScope) ANTES del render para evitar el frame vacío
  // entre "user seteado" y "efecto de hidratación ejecutado".
  const loginUser = useCallback((newUser) => {
    userRef.current = newUser;
    if (newUser?.empresa_id) {
      setCurrentEmpresaId(newUser.empresa_id);
      saveLastEmpresaId(newUser.empresa_id);
      setIsLoadingScope(true);
    }
    setUser(newUser);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Actualizar empresa scope cuando el usuario se autentica
  useEffect(() => {
    if (user?.empresa_id) {
      setCurrentEmpresaId(user.empresa_id);
      saveLastEmpresaId(user.empresa_id);
      migrateLegacyStorageIfNeeded(user.empresa_id);
    }
  }, [user?.empresa_id]);

  const handleLogout = async () => {
    // Hard reset: limpiar TODO síncronamente antes de signOut.
    // Orden crítico: refs primero (para SIGNED_OUT handler), luego React state.
    setCurrentEmpresaId(null);
    userRef.current   = null;
    dataRef.current   = null;
    setUser(null);
    setData(createEmptyAppState());
    setTab("dashboard");
    setIsLoadingScope(false);
    setSidebarOpen(false);
    try { await supabase.removeAllChannels(); } catch {}
    try { await supabase.auth.signOut(); } catch {}
  };

  // Reintentar onboarding: recarga perfil desde Supabase.
  // Si sigue sin empresa_id, cierra sesión para que el usuario re-registre su empresa.
  const handleRetryOnboarding = useCallback(async () => {
    if (!user?.id) return;
    // Reintentar hasta 3 veces con espera creciente (tolera cold start de Supabase)
    let profile = null;
    for (let i = 0; i < 3 && !profile?.empresa_id; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, 1000 * i));
      try { profile = await userService.getProfile(user.id); } catch {}
    }
    if (profile?.empresa_id) {
      const updated = {
        ...user,
        empresa_id: profile.empresa_id,
        name: profile.nombre || user.name,
        role: profile.role?.toLowerCase() || user.role,
      };
      setCurrentEmpresaId(updated.empresa_id);
      saveLastEmpresaId(updated.empresa_id);
      userRef.current = updated;
      setUser(updated);
    } else {
      await handleLogout();
    }
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

const init = async () => {
  // Fallback de seguridad: si onAuthStateChange no dispara INITIAL_SESSION en 4s,
  // desbloqueamos la app manualmente para no quedar en loading infinito.
  await new Promise(resolve => setTimeout(resolve, 4000));
  setSessionChecked(true);
};

// Carga inicial desde localStorage — corre una vez al montar, sin depender de user
  useEffect(()=>{
    (async()=>{
      // Migrar datos globales → scope ANTES de leerlos (orden crítico).
      // Sin esto, la primera carga tras login Supabase veía claves vacías.
      if (getCurrentEmpresaId()) migrateLegacyStorageIfNeeded(getCurrentEmpresaId());

      const hasScope = Boolean(getCurrentEmpresaId());
      // Categorías vacías para cuentas Supabase — el usuario define las suyas propias.
      const catFallback = hasScope
        ? [{ id: DEFAULT_CATEGORY_ID, name: "Sin categoría", locked: true }]
        : DEFAULT_CATEGORIES;

      const [
        rawCustomers,
        rawProducts,
        inventory,
        rawSales,
        suppliers,
        purchases,
        formulas,
        orders,
        pedidos,
        expenses,
        movements,
        storedCategories,
        rawUsers,
        config,
        activityLogs
      ] = await Promise.all([
        loadStoredValue("customers", hasScope ? [] : CUSTOMERS0),
        loadStoredValue("products",  hasScope ? [] : PRODUCTS0),
        loadStoredValue("inventory", hasScope ? [] : PRODUCTS0.map(p=>({productId:p.id,stock:0}))),
        loadStoredValue("sales",     []),
        loadStoredValue("suppliers", []),
        loadStoredValue("purchases", []),
        loadStoredValue("formulas",  hasScope ? [] : FORMULAS0),
        loadStoredValue("orders",    []),
        loadStoredValue("pedidos",   []),
        loadStoredValue("expenses",  []),
        loadStoredValue("movements", []),
        loadStoredValue("categories", catFallback),
        loadStoredValue("users",     DEFAULT_USERS),
        loadStoredValue("config",    DEFAULT_CONFIG),
        loadStoredValue("activityLogs", DEFAULT_ACTIVITY_LOGS),
      ]);

      const cats = ensureCategories(storedCategories, rawProducts);
      // Aplicar moneda guardada antes del primer render
      if (config?.currency) applyCurrencyCode(config.currency);
      setData({
        customers:    normalizeCustomers(rawCustomers),
        products:     sanitizeProducts(rawProducts, cats),
        inventory,
        sales:        normalizeSales(rawSales),
        suppliers,
        purchases,
        formulas,
        orders,
        pedidos,
        expenses,
        movements,
        categories:   cats,
        users:        normalizeUsers(rawUsers),
        config,
        activityLogs,
      });
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Restaurar sesión Supabase en paralelo — si hay sesión activa, setea user sin bloquear UI
  useEffect(()=>{ init(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Listener reactivo: maneja cambios de sesión Supabase (page reload, token refresh, cross-tab)
  useEffect(()=>{
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED" || event === "SIGNED_IN") && session?.user) {
        // Skip si ya tenemos exactamente este usuario
        if (userRef.current?.id === session.user.id) { setSessionChecked(true); return; }
        // Desbloquear UI inmediatamente — cargar perfil en background sin bloquear
        if (event === "INITIAL_SESSION") {
          setIsRestoringSession(true);
          setSessionChecked(true);
        }
        userService.getProfile(session.user.id).then(profile => {
          if (profile) {
            const newUser = {
              id: session.user.id,
              name: profile.nombre,
              role: profile.role?.toLowerCase() || "usuario",
              empresa_id: profile.empresa_id,
            };
            // Actualizar scope síncronamente para que persistValue use el empresa_id correcto
            // desde el primer tick. isLoadingScope bloquea el ERP antes del render.
            if (newUser.empresa_id) {
              setCurrentEmpresaId(newUser.empresa_id);
              saveLastEmpresaId(newUser.empresa_id);
              setIsLoadingScope(true);
            }
            userRef.current = newUser;
            setUser(newUser);
          }
        }).catch((e) => {
          console.warn("[AUTH] INITIAL_SESSION getProfile exception:", e?.message);
        }).finally(()=>{
          setSessionChecked(true);
          setIsRestoringSession(false);
        });
      } else if (event === "INITIAL_SESSION" && !session?.user) {
        // Sin sesión activa — desbloquear la app inmediatamente
        setSessionChecked(true);
        setIsRestoringSession(false);
      } else if (event === "PASSWORD_RECOVERY") {
        setRecoveryMode(true);
      } else if (event === "SIGNED_OUT") {
        // CRÍTICO: verificar userRef.current antes de limpiar.
        // Si un nuevo usuario ya se logueó (loginUser actualizó userRef síncronamente)
        // no limpiar — evita race condition logout-rápido → nuevo-login.
        if (userRef.current) return;
        setCurrentEmpresaId(null);
        resetCurrency();
        dataRef.current   = null;
        setUser(null);
        setData(createEmptyAppState());
        setIsLoadingScope(false);
        setRecoveryMode(false);
      }
    });
    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Después de login, cargar todas las entidades principales desde Supabase en paralelo.
  // isLoadingScope = true bloquea el render del ERP mientras llegan los datos del nuevo scope.
  // Garantiza cero frames con datos de empresa anterior visibles al usuario.
  useEffect(()=>{
    if (!user?.empresa_id) return;
    setIsLoadingScope(true);
    // Limpiar arrays de negocio síncronamente — ningún frame con datos anteriores
    setData(d => d ? {
      ...d,
      sales: [], customers: [], products: [],
      inventory: [], expenses: [], movements: [],
    } : d);
    const eid = user.empresa_id;
    Promise.all([
      ventasService.getVentas(eid),
      clientesService.getClientes(eid),
      productosService.getProductos(eid),
      inventarioService.getInventario(eid),
      gastosService.getGastos(eid),
      movimientosService.getMovimientos(eid),
      // Config viene de localStorage scoped — cargamos aquí para que re-login sin
      // refresh de página no pierda el businessName y currency de la empresa.
      loadStoredValue("config", null),
      // Usuarios de la empresa — para que admin vea todos los miembros del equipo
      userService.getEmpresaUsuarios(eid),
      // Cotizaciones y pedidos (devuelve null si la tabla aún no existe → no pisa local)
      pedidosService.getPedidos(eid),
    ]).then(([supaVentas, supaClientes, supaProductos, supaInventario, supaGastos, supaMovimientos, scopedConfig, supaUsuarios, supaPedidos]) => {
      setData(d => {
        if (!d) return d;
        const cats = d.categories || DEFAULT_CATEGORIES;
        const next = { ...d };
        if (Array.isArray(supaVentas))      next.sales      = normalizeSales(supaVentas);
        if (Array.isArray(supaClientes))    next.customers  = normalizeCustomers(supaClientes);
        if (Array.isArray(supaProductos))   next.products   = sanitizeProducts(supaProductos, cats);
        if (Array.isArray(supaInventario))  next.inventory  = supaInventario;
        if (Array.isArray(supaGastos))      next.expenses   = supaGastos;
        if (Array.isArray(supaMovimientos)) next.movements  = supaMovimientos;
        // Pedidos: solo sobrescribir si Supabase devolvió un array (null = tabla inexistente → conservar local)
        if (Array.isArray(supaPedidos))     next.pedidos    = supaPedidos;
        // Solo sobrescribir config si el scope tiene una guardada (no remplazar con null)
        if (scopedConfig)                   next.config     = scopedConfig;
        // Usuarios empresa — sobrescribir solo si Supabase devuelve datos
        if (Array.isArray(supaUsuarios) && supaUsuarios.length > 0) next.users = supaUsuarios;
        return next;
      });
      // Sincronizar símbolo de moneda con la config del scope recién cargado
      if (scopedConfig?.currency) applyCurrencyCode(scopedConfig.currency);
    }).catch((err) => { console.warn("[App] hydration failed:", err?.message ?? err); }).finally(() => setIsLoadingScope(false));
  }, [user?.empresa_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime: sincroniza ventas, productos, inventario, clientes y gastos entre pestañas/dispositivos.
  // Usa actualizaciones quirúrgicas (payload-based) en lugar de refetch completo:
  //   DELETE → filter out by id
  //   INSERT/UPDATE → mergeById para deduplicar sin reemplazar arrays completos
  useEffect(() => {
    if (!user?.empresa_id) return;
    const eid = user.empresa_id;
    const ch = supabase
      .channel(`moxi_rt_${eid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "ventas", filter: `empresa_id=eq.${eid}` }, (payload) => {
        setData(s => {
          if (!s) return s;
          if (payload.eventType === "DELETE") {
            return { ...s, sales: (s.sales || []).filter(x => x.id !== payload.old?.id) };
          }
          if (payload.new?.id) {
            return { ...s, sales: mergeById(s.sales, normalizeSales([payload.new])) };
          }
          return s;
        });
        setRtRefreshTrigger(t => t + 1);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "productos", filter: `empresa_id=eq.${eid}` }, (payload) => {
        setData(s => {
          if (!s) return s;
          if (payload.eventType === "DELETE") {
            return { ...s, products: (s.products || []).filter(x => x.id !== payload.old?.id) };
          }
          if (payload.new?.id) {
            const cats = s.categories || DEFAULT_CATEGORIES;
            return { ...s, products: mergeById(s.products, sanitizeProducts([payload.new], cats)) };
          }
          return s;
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "inventario", filter: `empresa_id=eq.${eid}` }, (payload) => {
        setData(s => {
          if (!s) return s;
          if (payload.eventType === "DELETE") {
            return { ...s, inventory: (s.inventory || []).filter(x => x.id !== payload.old?.id) };
          }
          if (payload.new?.id) {
            return { ...s, inventory: mergeById(s.inventory, [payload.new]) };
          }
          return s;
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "clientes", filter: `empresa_id=eq.${eid}` }, (payload) => {
        setData(s => {
          if (!s) return s;
          if (payload.eventType === "DELETE") {
            return { ...s, customers: (s.customers || []).filter(x => x.id !== payload.old?.id) };
          }
          if (payload.new?.id) {
            return { ...s, customers: mergeById(s.customers, normalizeCustomers([payload.new])) };
          }
          return s;
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "gastos", filter: `empresa_id=eq.${eid}` }, (payload) => {
        setData(s => {
          if (!s) return s;
          if (payload.eventType === "DELETE") {
            return { ...s, expenses: (s.expenses || []).filter(x => x.id !== payload.old?.id) };
          }
          if (payload.new?.id) {
            return { ...s, expenses: mergeById(s.expenses, [payload.new]) };
          }
          return s;
        });
        setRtRefreshTrigger(t => t + 1);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.empresa_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const save=useCallback((key,value)=>{
    // Sincronizar a Supabase si aplica (fire-and-forget, nunca bloquea UI)
    if (SYNC_KEYS.has(key)) syncDiff(key, dataRef.current?.[key], value, userRef.current);
    // Actualizar moneda global al instante cuando se guarda config
    if (key === "config" && value?.currency) applyCurrencyCode(value.currency);
    setData(d=>({...d,[key]:value}));
    persistValue(key, value);
  },[]);

  const logAction=useCallback(action=>{
    if(!user)return;
    setData(current=>{
      const nextLogs=[buildActivityEntry(user, action), ...(current?.activityLogs||[])].slice(0, 200);
      persistValue("activityLogs", nextLogs);
      return {...current, activityLogs: nextLogs};
    });
  },[user]);

  const allowedTabs = useMemo(() => ROLES[user?.role] || [], [user?.role]);

  useEffect(() => {
    if (user && allowedTabs.length && !allowedTabs.includes(tab)) {
      setTab(allowedTabs[0]);
    }
  }, [user, tab, allowedTabs]);

  // MUST be before any conditional return — hooks cannot follow early returns
  const appDebtClients = useMemo(() =>
    (data?.customers || []).filter(c =>
      (data?.sales || []).filter(s => s.customerId === c.id).reduce((a, s) => a + s.debt, 0) > 0
    ),
  [data?.customers, data?.sales]);
  const appLowStock = useMemo(() => {
    const getStock = id => (data?.inventory?.find(i => i.productId === id) || {}).stock || 0;
    return (data?.products || []).filter(p => p.minStock > 0 && getStock(p.id) <= p.minStock);
  }, [data?.products, data?.inventory]);

  const loadingScreen = (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"100vh",fontFamily:FONT,background:"radial-gradient(circle at 30% 20%, rgba(34,197,254,0.10), transparent 50%), #0D1117",gap:18}}>
      <BrandLogo size={76}/>
      <div style={{fontSize:14,color:"rgba(255,255,255,0.38)",letterSpacing:"0.04em",fontWeight:500}}>Cargando sistema…</div>
      <div style={{width:140,height:2,background:"rgba(255,255,255,0.08)",borderRadius:2,overflow:"hidden"}}>
        <div style={{height:"100%",width:"40%",background:"linear-gradient(90deg,#111E7B,#22C5FE)",borderRadius:2,animation:"moxiLoad 1.2s ease-in-out infinite alternate"}}/>
      </div>
    </div>
  );
  if(!data || !sessionChecked) return loadingScreen;
  if(recoveryMode) return <ResetPasswordScreen onDone={() => setRecoveryMode(false)} />;
  // isRestoringSession: hay sesión activa pero el perfil aún se está cargando — no mostrar AuthScreen
  if(!user && isRestoringSession) return loadingScreen;
  if(!user) return <AuthScreen users={data.users} config={data.config} onLogin={loginUser} saveUsers={value=>save("users", value)} saveConfig={value=>save("config", value)}/>;
  // Usuario Supabase sin empresa_id: bloquear acceso total al ERP.
  // No renderizar dashboard, ventas, clientes ni ningún módulo.
  if(isSupabaseUser(user) && !user.empresa_id) return <OnboardingIncompleteScreen onRetry={handleRetryOnboarding} onLogout={handleLogout}/>;
  // Bloquear render del ERP hasta que Supabase haya hidratado los datos del scope actual.
  // Sin esto, el dashboard muestra KPIs vacíos ($0, 0 clientes) durante 1-3 segundos.
  if(isLoadingScope) return loadingScreen;

  const navLabel=NAV_GROUPS.flatMap(g=>g.items).find(i=>i.id===tab)?.label||BRAND_NAME;
  const businessName=safeBusinessName(data.config);

  return (
    <ThemeProvider>
      <Toaster position="top-right" toastOptions={{ style: { fontFamily: FONT, fontSize: 13, borderRadius: 10, border: "1px solid var(--color-border)", background: "var(--color-bg-surface)", color: "var(--color-text)" } }} />
      <div style={{ display: "flex", height: "100vh", fontFamily: FONT, background: "var(--color-bg-primary)", fontSize: 14, color: "var(--color-text)", overflow: "hidden" }}>
        {!isMobile && (
          <Sidebar
            tab={tab} setTab={setTab} user={user} config={data.config}
            onLogout={handleLogout} open={sidebarOpen} onClose={() => setSidebarOpen(false)}
            collapsed={sidebarCollapsed} onToggleCollapse={() => setSidebarCollapsed(v => !v)}
          />
        )}
        {isMobile && sidebarOpen && (
          <Sidebar
            tab={tab} setTab={setTab} user={user} config={data.config}
            onLogout={handleLogout} open={sidebarOpen} onClose={() => setSidebarOpen(false)}
            collapsed={false} onToggleCollapse={() => {}}
          />
        )}

        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, overflow: "hidden" }}>

          {/* ── TOPBAR PREMIUM ── */}
          <header style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: isMobile ? "0 14px" : "0 28px",
            height: 64,
            background: "var(--color-bg-surface)",
            borderBottom: "1px solid var(--color-border)",
            flexShrink: 0, zIndex: 10,
          }}>
            {/* Hamburger (mobile) / Collapse toggle (desktop) */}
            <button
              onClick={() => isMobile ? setSidebarOpen(v => !v) : setSidebarCollapsed(v => !v)}
              style={{ width: 36, height: 36, borderRadius: 10, border: "1px solid var(--color-border)", background: "var(--color-bg-primary)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 0.15s" }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--color-border)"}
              onMouseLeave={e => e.currentTarget.style.background = "var(--color-bg-primary)"}
              title={isMobile ? "Menú" : "Colapsar sidebar"}
            >
              <Menu size={17} strokeWidth={1.8} color="var(--color-text-mid)" />
            </button>

            {/* Logo on mobile */}
            {isMobile && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <BrandLogo size={28} />
                <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: "-0.02em" }}>{BRAND_NAME}</span>
              </div>
            )}

            {/* Global search (desktop) */}
            {!isMobile && (
              <div ref={globalSearchRef} style={{ position: "relative", flex: 1, maxWidth: 380 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--color-bg-primary)", border: `1px solid ${showGlobalResults && globalSearch ? "var(--color-brand)" : "var(--color-border)"}`, borderRadius: 10, padding: "7px 12px", transition: "border-color 0.15s" }}>
                  <Search size={15} strokeWidth={1.8} color="var(--color-text-faint)" style={{ flexShrink: 0 }} />
                  <input
                    value={globalSearch}
                    onChange={e => { setGlobalSearch(e.target.value); setShowGlobalResults(true); }}
                    onFocus={() => setShowGlobalResults(true)}
                    onBlur={e => { if (!globalSearchRef.current?.contains(e.relatedTarget)) setTimeout(() => setShowGlobalResults(false), 150); }}
                    placeholder="Buscar clientes, productos, ventas…"
                    style={{ background: "transparent", border: "none", outline: "none", fontSize: 13, color: "var(--color-text)", width: "100%", minHeight: "unset", padding: 0, fontFamily: FONT }}
                  />
                  {!globalSearch && <span style={{ fontSize: 10, color: "var(--color-text-faint)", background: "var(--color-border)", padding: "2px 6px", borderRadius: 5, whiteSpace: "nowrap" }}>⌘K</span>}
                  {globalSearch && <button onClick={() => { setGlobalSearch(""); setShowGlobalResults(false); }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-faint)", display: "flex", padding: 0 }}><X size={14} /></button>}
                </div>
                {showGlobalResults && globalSearch.trim() && (() => {
                  const q = globalSearch.trim().toLowerCase();
                  const hits = (data?.customers || []).filter(c => `${c.name || ""} ${c.market || ""} ${c.phone || ""}`.toLowerCase().includes(q)).slice(0, 7);
                  if (!hits.length) return (
                    <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "var(--color-bg-surface)", border: "1px solid var(--color-border)", borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.14)", zIndex: 200, padding: "10px 12px", fontSize: 12, color: "var(--color-text-faint)" }}>Sin resultados</div>
                  );
                  return (
                    <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "var(--color-bg-surface)", border: "1px solid var(--color-border)", borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.14)", zIndex: 200, overflow: "hidden" }}>
                      <div style={{ padding: "8px 12px", fontSize: 10, color: "var(--color-text-faint)", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", borderBottom: "1px solid var(--color-border)" }}>Clientes encontrados</div>
                      {hits.map(c => (
                        <button key={c.id} onMouseDown={() => { setTab("clientes"); setGlobalSearch(""); setShowGlobalResults(false); }}
                          style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: "none", border: "none", padding: "9px 14px", cursor: "pointer", textAlign: "left", transition: "background 0.1s", fontFamily: FONT }}
                          onMouseEnter={e => e.currentTarget.style.background = "var(--color-bg-primary)"}
                          onMouseLeave={e => e.currentTarget.style.background = "none"}
                        >
                          <div style={{ width: 30, height: 30, borderRadius: "50%", background: "linear-gradient(135deg,#22C5FE,#111E7B)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "white", fontWeight: 700, flexShrink: 0 }}>{(c.name || "?")[0].toUpperCase()}</div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
                            {c.market && <div style={{ fontSize: 11, color: "var(--color-text-faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.market}</div>}
                          </div>
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}

            <div style={{ flex: isMobile ? 1 : 0 }} />

            {/* Right actions */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              <ThemeToggle />
              <NotificacionesDropdown debtClients={appDebtClients} lowStock={appLowStock} setTab={setTab} />
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 10, background: "var(--color-bg-primary)", border: "1px solid var(--color-border)", flexShrink: 0 }}>
                <div style={{ width: 28, height: 28, background: data.config?.logo_url ? "transparent" : "linear-gradient(135deg,#22C5FE,#111E7B)", borderRadius: data.config?.logo_url ? 6 : "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "white", fontWeight: 700, flexShrink: 0, overflow: "hidden", border: data.config?.logo_url ? "1px solid var(--color-border)" : "none" }}>
                  {data.config?.logo_url
                    ? <img src={data.config.logo_url} alt="logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                    : (user.name || "U")[0].toUpperCase()
                  }
                </div>
                {!isMobile && (
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--color-text)", lineHeight: 1.3 }}>{user.name}</div>
                    <div style={{ fontSize: 10.5, color: "var(--color-text-faint)" }}>{ROLE_LABELS[user.role] || user.role}</div>
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* ── MAIN CONTENT ── */}
          <main style={{ flex: 1, overflowY: "auto", padding: isMobile ? "14px 14px 80px" : "28px 32px", minWidth: 0 }}>
            <div style={{ maxWidth: 1400, margin: "0 auto" }}>
              {tab === "dashboard"   && <DashboardPremium D={data} setTab={setTab} user={user} refreshTrigger={rtRefreshTrigger} />}
              {tab === "clientes"    && <Clientes D={data} save={save} user={user} />}
              {tab === "ventas"      && <Ventas D={data} save={save} user={user} config={data.config} logAction={logAction} onRefreshDashboard={()=>setRtRefreshTrigger(t=>t+1)} />}
              {tab === "pedidos"     && <Pedidos D={data} save={save} user={user} config={data.config} logAction={logAction} onRefreshDashboard={()=>setRtRefreshTrigger(t=>t+1)} />}
              {tab === "deudas"      && <Deudas D={data} save={save} user={user} logAction={logAction} />}
              {tab === "productos"   && <Productos D={data} save={save} user={user} />}
              {tab === "inventario"  && <Inventario D={data} save={save} user={user} />}
              {tab === "produccion"  && <Produccion D={data} save={save} user={user} logAction={logAction} />}
              {tab === "proveedores" && <Proveedores D={data} save={save} />}
              {tab === "caja"        && <Caja D={data} save={save} user={user} logAction={logAction} onRefreshDashboard={()=>setRtRefreshTrigger(t=>t+1)} />}
              {tab === "gastos"      && <GastosPage D={data} save={save} user={user} logAction={logAction} onRefreshDashboard={()=>setRtRefreshTrigger(t=>t+1)} />}
              {tab === "analisis"    && <Analisis D={data} />}
              {tab === "exportar"    && <Exportar D={data} />}
              {tab === "usuarios"    && <UsuariosAdmin D={data} save={save} user={user} logAction={logAction} onProfileUpdate={newName=>setUser(u=>({...u,name:newName}))} />}
            </div>
          </main>

          {/* ── BOTTOM NAV (mobile) ── */}
          {isMobile && <BottomNav tab={tab} setTab={setTab} user={user} />}
        </div>
      </div>
    </ThemeProvider>
  );
}
