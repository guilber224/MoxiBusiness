import { useState } from "react";
import toast from "react-hot-toast";
import { fDate, fDateTime } from "../utils/businessLogic.js";
import { DEFAULT_CATEGORY_ID, getCategoryName } from "../categories.js";
import { xlsx } from "../utils/xlsxExport.js";
import { C } from "../theme.jsx";
import { card, mkBtn } from "../styles.js";
import { Header } from "./ui/Header.jsx";

const r2 = v => Math.round((Number(v) || 0) * 100) / 100;

export function Exportar({ D }) {
  const { sales, customers, products, expenses, suppliers, purchases, orders, movements } = D;
  const categories = [{ id: DEFAULT_CATEGORY_ID, name: "Sin categoría" }, ...D.categories];
  const [exporting, setExporting] = useState(false);
  const vigentes = sales.filter(s => !s.anulada);

  const doExport = async () => {
    setExporting(true);
    try {
      await xlsx([
        { name: "Ventas", data: sales.map(s => ({
          "N°": s.numero, Fecha: fDateTime(s.date), Cliente: s.customerName, Estado: s.anulada ? "ANULADA" : s.debt > 0 ? "Pendiente" : "Pagada",
          Subtotal: r2(s.subtotal), Descuento: r2(s.discount), Total: r2(s.total), Pagado: r2(s.paid), Deuda: r2(s.debt),
          "Método de pago": s.paymentMethod, Notas: s.notes || "",
        })) },
        { name: "Detalle_ventas", data: sales.flatMap(s => s.items.map(i => ({
          "N° venta": s.numero, Fecha: fDate(s.date), Cliente: s.customerName, Anulada: s.anulada ? "Sí" : "No",
          Producto: i.name, Cantidad: i.qty, Unidad: i.unit, "Precio unitario": r2(i.unitPrice), Subtotal: r2(i.sub), "Costo unitario": r2(i.cost),
        }))) },
        { name: "Cobros", data: vigentes.flatMap(s => s.payments.map(p => ({ "N° venta": s.numero, Cliente: s.customerName, Fecha: fDateTime(p.date), Método: p.method, Monto: r2(p.amount) }))) },
        { name: "Clientes", data: customers.map(c => ({
          Nombre: c.name, "CI/NIT": c.ci, Teléfono: c.phone, Mercado: c.market, Dirección: c.address,
          "Total comprado": r2(vigentes.filter(s => s.customerId === c.id).reduce((a, s) => a + s.total, 0)),
          Deuda: r2(vigentes.filter(s => s.customerId === c.id).reduce((a, s) => a + s.debt, 0)),
          Notas: c.notes,
        })) },
        { name: "Productos", data: products.map(p => ({
          Nombre: p.name, Categoría: getCategoryName(categories, p.cat), Código: p.barcode, Unidad: p.unit,
          "Precio venta": r2(p.price), Costo: r2(p.cost), Stock: p.stock, "Stock mínimo": p.minStock,
          "Valor a costo": r2(Math.max(0, p.stock) * p.cost), "Valor a precio": r2(Math.max(0, p.stock) * p.price),
        })) },
        { name: "Kardex", data: movements.map(m => ({ Fecha: fDateTime(m.date), Tipo: m.type, Producto: m.productName, Cantidad: m.qty, "Stock antes": m.stockBefore, "Stock después": m.stockAfter, Costo: r2(m.cost), Usuario: m.user, Notas: m.notes })) },
        { name: "Gastos_e_ingresos", data: expenses.map(e => ({ Fecha: fDate(e.date), Tipo: e.type === "ingreso" ? "Ingreso" : "Gasto", Categoría: e.category, Descripción: e.description, Monto: r2(e.amount), Registró: e.responsable, Notas: e.notes })) },
        { name: "Proveedores", data: suppliers.map(s => ({
          Nombre: s.name, Teléfono: s.phone, Ubicación: s.address, Rubro: s.product,
          "Total compras": r2(purchases.filter(p => p.supplierId === s.id).reduce((a, p) => a + p.total, 0)),
          "Deuda pendiente": r2(purchases.filter(p => p.supplierId === s.id).reduce((a, p) => a + p.debt, 0)),
        })) },
        { name: "Compras", data: purchases.map(p => ({ "N°": p.numero, Fecha: fDate(p.date), Proveedor: p.supplierName, Productos: p.product, Total: r2(p.total), Pagado: r2(p.paid), Deuda: r2(p.debt), Notas: p.notes })) },
        { name: "Produccion", data: orders.map(o => ({ Fecha: fDate(o.date), Fórmula: o.formulaName, Lotes: o.batches, "Insumo usado": o.inputUsed, Producido: o.outputProduced, "Costo total": r2(o.totalCost), "Costo/unidad": r2(o.costPerUnit), "Margen %": o.margin, Estado: o.anulada ? "Anulada" : "OK" })) },
      ], `moxi_${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success("Archivo descargado");
    } catch (e) {
      toast.error("No se pudo generar el archivo: " + e.message);
    } finally {
      setExporting(false);
    }
  };

  const stats = [
    ["Ventas", vigentes.length, "🛒"], ["Clientes", customers.length, "👥"], ["Productos", products.length, "📦"],
    ["Movimientos de kardex", movements.length, "🏷️"], ["Gastos e ingresos", expenses.length, "📤"],
    ["Proveedores", suppliers.length, "🚛"], ["Compras", purchases.length, "🧾"], ["Producción", orders.length, "🏭"],
  ];

  return (
    <div>
      <Header title="Exportar datos" sub="Descarga la información del negocio en Excel" />
      <div style={{ ...card(), marginBottom: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>Contenido (últimos 12 meses de ventas y gastos)</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 8 }}>
          {stats.map(([label, count, icon]) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: C.bg, borderRadius: 10, border: `1px solid ${C.border}` }}>
              <span style={{ fontSize: 22 }}>{icon}</span>
              <div><div style={{ fontSize: 18, fontWeight: 800, color: C.red, lineHeight: 1 }}>{count}</div><div style={{ fontSize: 11, color: C.textFaint, marginTop: 2 }}>{label}</div></div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ ...card(), textAlign: "center", padding: 40 }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Exportar todo a Excel</div>
        <div style={{ fontSize: 13, color: C.textMid, marginBottom: 24 }}>Un archivo .xlsx con 10 hojas: ventas, detalle de ventas, cobros, clientes, productos, kardex, gastos e ingresos, proveedores, compras y producción.</div>
        <button onClick={doExport} disabled={exporting} style={{ ...mkBtn("primary"), padding: "12px 32px", fontSize: 15, opacity: exporting ? 0.7 : 1 }}>
          {exporting ? "Generando archivo..." : "⬇️ Descargar Excel completo"}
        </button>
      </div>
    </div>
  );
}
