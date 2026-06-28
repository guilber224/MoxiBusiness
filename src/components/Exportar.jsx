import { useState } from "react";
import { fDate } from "../utils/businessLogic.js";
import { getCategoryName } from "../categories.js";
import { xlsx } from "../utils/xlsxExport.js";
import { C } from "../theme.jsx";
import { card, mkBtn } from "../styles.js";
import { Header } from "./ui/Header.jsx";

export function Exportar({ D }) {
  const { sales, customers, products, expenses, inventory, suppliers, purchases, orders, categories } = D;
  const [exporting, setExporting] = useState(false);

  const doExport = async () => {
    setExporting(true);
    try {
      await xlsx([
        {
          name: "Ventas",
          data: sales.map(s => ({
            ID: s.id,
            Fecha: fDate(s.date || s.createdAt),
            Cliente: s.customerName || "—",
            Items: s.items?.length || 0,
            Total: s.total?.toFixed(2) || "0.00",
            Pagado: s.paid?.toFixed(2) || "0.00",
            Deuda: ((s.total || 0) - (s.paid || 0)).toFixed(2),
            "Método de pago": s.paymentMethod || "—",
            Estado: s.status || "—",
          })),
        },
        {
          name: "Clientes",
          data: customers.map(c => ({
            ID: c.id,
            Nombre: c.name,
            Teléfono: c.phone || "—",
            Dirección: c.address || "—",
            Ciudad: c.city || "—",
            Zona: c.zone || "—",
            "Deuda total": (sales.filter(s => s.customerId === c.id).reduce((a, s) => a + ((s.total || 0) - (s.paid || 0)), 0)).toFixed(2),
          })),
        },
        {
          name: "Productos",
          data: products.map(p => ({
            ID: p.id,
            Nombre: p.name,
            Categoría: getCategoryName(categories, p.cat),
            "Precio venta": p.price?.toFixed(2) || "0.00",
            "Precio mayorista": p.wholesalePrice?.toFixed(2) || "0.00",
            "Precio costo": p.costPrice?.toFixed(2) || "0.00",
            Unidad: p.unit || "—",
            Stock: inventory.filter(i => i.productId === p.id).reduce((a, i) => a + (i.qty || 0), 0),
          })),
        },
        {
          name: "Inventario",
          data: inventory.map(i => {
            const p = products.find(x => x.id === i.productId);
            return {
              Producto: p?.name || i.productId,
              Categoría: p ? getCategoryName(categories, p.cat) : "—",
              Lote: i.lote || "—",
              Cantidad: i.qty,
              "Fecha venc.": i.expiry ? fDate(i.expiry) : "—",
              Ubicación: i.location || "—",
              Notas: i.notes || "—",
            };
          }),
        },
        {
          name: "Gastos",
          data: expenses.filter(e => e.type === "gasto").map(e => ({
            Fecha: fDate(e.date || e.createdAt),
            Categoría: e.category || "—",
            Descripción: e.description,
            Responsable: e.responsable || "—",
            "Monto(Bs)": (e.amount || 0).toFixed(2),
            Notas: e.notes || "—",
          })),
        },
        {
          name: "Proveedores",
          data: suppliers.map(s => ({
            ID: s.id,
            Nombre: s.name,
            Teléfono: s.phone || "—",
            Dirección: s.address || "—",
            Producto: s.product || "—",
            "Total compras": purchases.filter(p => p.supplierId === s.id).reduce((a, p) => a + p.total, 0).toFixed(2),
            "Deuda total": purchases.filter(p => p.supplierId === s.id).reduce((a, p) => a + p.debt, 0).toFixed(2),
          })),
        },
        {
          name: "Compras_Proveedores",
          data: purchases.map(p => ({
            Proveedor: p.supplierName || "—",
            Producto: p.product,
            Fecha: fDate(p.date),
            Cantidad: p.qty,
            "Precio unitario": p.price?.toFixed(2) || "0.00",
            Total: p.total?.toFixed(2) || "0.00",
            Pagado: p.paid?.toFixed(2) || "0.00",
            Deuda: p.debt?.toFixed(2) || "0.00",
          })),
        },
        {
          name: "Produccion",
          data: orders.map(o => ({
            Fecha: fDate(o.date || o.createdAt),
            Fórmula: o.formulaName || "—",
            Cantidad: o.qty,
            "Costo total": o.totalCost?.toFixed(2) || "0.00",
            "Costo/unidad": o.costPerUnit?.toFixed(2) || "0.00",
            "Valor producido": o.revenue?.toFixed(2) || "0.00",
            "Margen(%)": o.margin || 0,
          })),
        },
      ], "moxi_business_export.xlsx");
    } finally {
      setExporting(false);
    }
  };

  const stats = [
    ["Ventas registradas", sales.length, "🛒"],
    ["Clientes", customers.length, "👥"],
    ["Productos", products.length, "📦"],
    ["Registros de inventario", inventory.length, "🏷️"],
    ["Gastos registrados", expenses.filter(e => e.type === "gasto").length, "📤"],
    ["Proveedores", suppliers.length, "🚛"],
    ["Compras a proveedores", purchases.length, "🧾"],
    ["Órdenes de producción", orders.length, "🏭"],
  ];

  return (
    <div>
      <Header title="Exportar datos" sub="Descarga toda la información del negocio en Excel" />

      <div style={{ ...card(), marginBottom: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>Resumen del contenido a exportar</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 8 }}>
          {stats.map(([label, count, icon]) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: C.bg, borderRadius: 10, border: `1px solid ${C.border}` }}>
              <span style={{ fontSize: 22 }}>{icon}</span>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: C.red, lineHeight: 1 }}>{count}</div>
                <div style={{ fontSize: 11, color: C.textFaint, marginTop: 2 }}>{label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ ...card(), textAlign: "center", padding: 40 }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Exportar todo a Excel</div>
        <div style={{ fontSize: 13, color: C.textMid, marginBottom: 24 }}>Se generará un archivo .xlsx con 8 hojas: Ventas, Clientes, Productos, Inventario, Gastos, Proveedores, Compras y Producción.</div>
        <button onClick={doExport} disabled={exporting} style={{ ...mkBtn("primary"), padding: "12px 32px", fontSize: 15, opacity: exporting ? 0.7 : 1 }}>
          {exporting ? "Generando archivo..." : "⬇️ Descargar Excel completo"}
        </button>
      </div>
    </div>
  );
}
