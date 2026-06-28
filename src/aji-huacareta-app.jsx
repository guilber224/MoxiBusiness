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
import { Pedidos } from "./components/Pedidos.jsx";
import { Deudas } from "./components/Deudas.jsx";
import { Produccion } from "./components/Produccion.jsx";
import { Proveedores } from "./components/Proveedores.jsx";
import { GastosPage } from "./components/GastosPage.jsx";
import { Caja } from "./components/Caja.jsx";
import { Analisis } from "./components/Analisis.jsx";
import { Exportar } from "./components/Exportar.jsx";
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
