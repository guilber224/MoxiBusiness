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
import { Ventas } from "./components/Ventas.jsx";
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
