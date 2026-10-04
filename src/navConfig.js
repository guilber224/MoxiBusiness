import {
  LayoutDashboard, Users, ShoppingCart, ClipboardList, CreditCard, Package,
  Archive, Factory, Truck, Wallet, TrendingDown, BarChart2, Download, Settings, Shield, Wrench, CalendarDays, UtensilsCrossed, IdCard, Beef,
} from "lucide-react";

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  NAVIGATION / ROLES                                                 ║
// ╚══════════════════════════════════════════════════════════════════════╝
export const NAV_GROUPS = [
  { label:"General",   items:[{id:"dashboard",label:"Panel Principal"}] },
  { label:"Comercial", items:[{id:"clientes",label:"Clientes"},{id:"ventas",label:"Ventas"},{id:"pedidos",label:"Pedidos"},{id:"mesas",label:"Mesas y comandas"},{id:"agenda",label:"Agenda"},{id:"membresias",label:"Membresías"},{id:"servicios",label:"Servicio técnico"},{id:"gastos",label:"Gastos"},{id:"deudas",label:"Deudas"}] },
  { label:"Operaciones",items:[{id:"productos",label:"Productos"},{id:"inventario",label:"Inventario"},{id:"produccion",label:"Producción"},{id:"hato",label:"Hato ganadero"},{id:"proveedores",label:"Proveedores"}] },
  { label:"Finanzas",  items:[{id:"caja",label:"Flujo de Caja"},{id:"analisis",label:"Análisis"},{id:"exportar",label:"Exportar Datos"}] },
  { label:"Administración", items:[{id:"usuarios",label:"Ajustes"}] },
  { label:"Sistema",        items:[{id:"superadmin",label:"Super Admin"}] },
];
export const ROLE_OPTIONS = [
  { id:"admin",      label:"Administrador" },
  { id:"vendedor",   label:"Vendedor" },
  { id:"operador",   label:"Operador" },
  { id:"usuario",    label:"Usuario" },
  { id:"superadmin", label:"Super Admin" },
];
export const ROLE_LABELS = Object.fromEntries(ROLE_OPTIONS.map(role => [role.id, role.label]));
export const ROLES = {
  admin:      ["dashboard","clientes","ventas","pedidos","mesas","agenda","membresias","servicios","deudas","productos","inventario","produccion","hato","proveedores","caja","gastos","analisis","exportar","usuarios"],
  vendedor:   ["dashboard","clientes","ventas","pedidos","mesas","agenda","membresias","servicios","deudas","caja","gastos"],
  operador:   ["dashboard","productos","inventario","produccion","hato","mesas","agenda","membresias","servicios"],
  usuario:    ["ventas"],
  superadmin: ["dashboard","clientes","ventas","pedidos","mesas","agenda","membresias","servicios","deudas","productos","inventario","produccion","hato","proveedores","caja","gastos","analisis","exportar","usuarios","superadmin"],
};

// Lucide icon components mapped by nav id
export const NAV_ICONS = {
  dashboard:   LayoutDashboard,
  servicios:   Wrench,
  agenda:      CalendarDays,
  mesas:       UtensilsCrossed,
  membresias:  IdCard,
  hato:        Beef,
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
  superadmin:  Shield,
};
