import { useState } from "react";
import toast from "react-hot-toast";
import { ventasService } from "../services/ventasService.js";
import { isSupabaseUUID } from "../utils/storageScope.js";
import { n, fDate } from "../utils/businessLogic.js";
import { Bs } from "../currency.js";
import { xlsx } from "../utils/xlsxExport.js";
import { C, R } from "../theme.jsx";
import { card, inp, mkBtn, mkBadge } from "../styles.js";
import { KPI } from "./ui/KPI.jsx";
import { Header } from "./ui/Header.jsx";
import { SearchInput } from "./ui/SearchInput.jsx";
import { Empty } from "./ui/Empty.jsx";

export function Deudas({ D, save, user, logAction }) {
  const { sales, customers } = D;
  const [q, setQ] = useState(""); const [pays, setPays] = useState({});
  const debtClients = customers.map(c => ({ ...c, cSales: sales.filter(s => s.customerId === c.id && s.debt > 0), debt: sales.filter(s => s.customerId === c.id).reduce((a, s) => a + s.debt, 0) })).filter(c => c.debt > 0).sort((a, b) => b.debt - a.debt).filter(c => c.name.toLowerCase().includes(q.toLowerCase()));
  const totalDebt = debtClients.reduce((a, c) => a + c.debt, 0);

  const doPayment = async (saleId, amt) => {
    const a = Math.min(n(amt), sales.find(s => s.id === saleId)?.debt || 0); if (a <= 0) return;
    const updated = sales.map(s => s.id === saleId ? { ...s, paid: s.paid + a, debt: Math.max(0, s.debt - a), payments: [...(s.payments || []), { amount: a, date: new Date().toISOString() }] } : s);
    const ventaActualizada = updated.find(s => s.id === saleId);
    let result;
    try { result = await ventasService.updateVenta(saleId, ventaActualizada, user?.empresa_id); }
    catch (e) { console.warn("Cobro deuda Supabase error:", e.message); }
    if (result?._localOnly && isSupabaseUUID(user?.empresa_id)) {
      toast.error("⚠ Error Supabase al registrar el cobro. El pago no se guardó — revisa tu conexión e intenta de nuevo.");
      return;
    }
    save("sales", updated);
    setPays(p => ({ ...p, [saleId]: "" }));
    logAction?.(`${user.name} registró un cobro de deuda por ${Bs(a)} en la venta ${saleId}`);
  };

  const exportXLS = async () => {
    await xlsx([{ name: "Deudas", data: debtClients.flatMap(c => c.cSales.map(s => ({ Cliente: c.name, Teléfono: c.phone, Mercado: c.market, Fecha: fDate(s.date), "Total Venta(Bs)": s.total.toFixed(2), "Pagado(Bs)": s.paid.toFixed(2), "Deuda(Bs)": s.debt.toFixed(2) }))) }], "deudas_moxi_business.xlsx");
  };

  return (
    <div>
      <Header title="Gestión de Deudas" sub="Control de saldos pendientes" action={<>
        <button onClick={exportXLS} style={mkBtn("ghost")}>⬇️ Exportar Excel</button>
      </>} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
        <KPI label="Total por cobrar" value={Bs(totalDebt)} Icon="💳" color={C.red} />
        <KPI label="Clientes con deuda" value={debtClients.length} Icon="👥" color={C.amber} />
        <KPI label="Deuda promedio" value={Bs(debtClients.length > 0 ? totalDebt / debtClients.length : 0)} Icon="📊" color={C.textMid} />
      </div>
      <SearchInput value={q} onChange={setQ} placeholder="Buscar cliente..." />
      <div style={{ marginTop: 12 }}>
        {debtClients.length === 0 ? <Empty icon="✅" title="Sin deudas" sub="Todos los clientes están al día" /> :
          debtClients.map(c => (
            <div key={c.id} style={{ ...card(), marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <div style={{ width: 40, height: 40, background: `linear-gradient(135deg,${C.red},#7F1D1D)`, borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 700 }}>{c.name[0]}</div>
                  <div><div style={{ fontWeight: 700, fontSize: 14 }}>{c.name}</div><div style={{ fontSize: 12, color: C.textMid }}>{c.market}{c.phone ? ` · ${c.phone}` : ""}</div></div>
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: C.red, letterSpacing: "-0.04em" }}>{Bs(c.debt)}</div>
              </div>
              {c.cSales.map(sale => (
                <div key={sale.id} style={{ padding: "9px 12px", background: C.bg, borderRadius: R.md, marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>Venta del {fDate(sale.date)}</div>
                    <div style={{ fontSize: 12, color: C.textMid }}>Total: {Bs(sale.total)} · Pagado: {Bs(sale.paid)}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={mkBadge("red")}>{Bs(sale.debt)}</span>
                    <input type="number" min="0" step="0.5" style={{ ...inp, width: 95, fontSize: 12 }} value={pays[sale.id] || ""} onChange={e => setPays(p => ({ ...p, [sale.id]: e.target.value }))} placeholder="Bs." />
                    <button onClick={() => doPayment(sale.id, pays[sale.id])} style={{ ...mkBtn("success"), padding: "6px 10px", fontSize: 12 }}>✓ Cobrar</button>
                    <button onClick={() => { setPays(p => ({ ...p, [sale.id]: sale.debt.toFixed(2) })); setTimeout(() => doPayment(sale.id, sale.debt.toFixed(2)), 50); }} style={{ ...mkBtn("ghost"), padding: "6px 10px", fontSize: 12 }}>Todo</button>
                  </div>
                </div>
              ))}
            </div>
          ))}
      </div>
    </div>
  );
}
