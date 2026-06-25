import {
  LayoutDashboard, Users, ShoppingCart, ClipboardList, CreditCard, Package,
  Archive, Factory, Truck, Wallet, TrendingDown, BarChart2, Download, Settings,
} from "lucide-react";

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  NAVIGATION / ROLES                                                 ║
// ╚══════════════════════════════════════════════════════════════════════╝
export const NAV_GROUPS = [
  { label:"General",   items:[{id:"dashboard",label:"Panel Principal"}] },
  { label:"Comercial", items:[{id:"clientes",label:"Clientes"},{id:"ventas",label:"Ventas"},{id:"pedidos",label:"Pedidos"},{id:"gastos",label:"Gastos"},{id:"deudas",label:"Deudas"}] },
  { label:"Operaciones",items:[{id:"productos",label:"Productos"},{id:"inventario",label:"Inventario"},{id:"produccion",label:"Producción"},{id:"proveedores",label:"Proveedores"}] },
  { label:"Finanzas",  items:[{id:"caja",label:"Flujo de Caja"},{id:"analisis",label:"Análisis"},{id:"exportar",label:"Exportar Datos"}] },
  { label:"Administración", items:[{id:"usuarios",label:"Ajustes"}] },
];
export const ROLE_OPTIONS = [
  { id:"admin",    label:"Administrador" },
  { id:"vendedor", label:"Vendedor" },
  { id:"operador", label:"Operador" },
  { id:"usuario",  label:"Usuario" },
];
export const ROLE_LABELS = Object.fromEntries(ROLE_OPTIONS.map(role => [role.id, role.label]));
export const ROLES = {
  admin:    ["dashboard","clientes","ventas","pedidos","deudas","productos","inventario","produccion","proveedores","caja","gastos","analisis","exportar","usuarios"],
  vendedor: ["dashboard","clientes","ventas","pedidos","deudas","caja","gastos"],
  operador: ["dashboard","productos","inventario","produccion"],
  usuario:  ["ventas"],
};

// Lucide icon components mapped by nav id
export const NAV_ICONS = {
  dashboard:   LayoutDashboard,
  clientes:    Users,
  ventas:      ShoppingCart,
  pedidos:     ClipboardList,
  deudas:      CreditCard,
  productos:   Package,
  inventario:  Archive,
  produccion:  Factory,
  proveedores: Truck,
  caja:        Wallet,
  gastos:      TrendingDown,
  analisis:    BarChart2,
  exportar:    Download,
  usuarios:    Settings,
};
