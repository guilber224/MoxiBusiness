import { useMemo, useState } from "react";
import { n, fDate } from "../utils/businessLogic.js";
import { Bs } from "../currency.js";
import { xlsx } from "../utils/xlsxExport.js";
import { C, R } from "../theme.jsx";
import { card, inp, mkBtn, mkBadge } from "../styles.js";
import { useAccion } from "../hooks/useAccion.js";
import { KPI } from "./ui/KPI.jsx";
import { Header } from "./ui/Header.jsx";
import { SearchInput } from "./ui/SearchInput.jsx";
import { Empty } from "./ui/Empty.jsx";

const GUEST = "__guest__";
// Teléfono boliviano a formato internacional para WhatsApp
const waNumero = tel => { const d = String(tel || "").replace(/\D/g, ""); if (!d) return null; return d.length === 8 ? `591${d}` : d; };

export function Deudas({ D, A }) {
  const { customers } = D;
  const [q, setQ] = useState("");
  const [pays, setPays] = useState({});
  const [metodos, setMetodos] = useState({});
  const [ejecutar, guardando] = useAccion();
  const negocio = D.config?.businessName || "nuestro negocio";

  // Agrupa por cliente todas las ventas con saldo (incluye ventas antiguas a "Público general")
  const grupos = useMemo(() => {
    const porCliente = new Map();
    D.sales.filter(s => !s.anulada && s.debt > 0.005).forEach(s => {
      const key = s.customerId || GUEST;
      if (!porCliente.has(key)) porCliente.set(key, []);
      porCliente.get(key).push(s);
    });
    return [...porCliente.entries()].map(([id, ventas]) => {
      const c = customers.find(x => x.id === id);
      return {
        id, ventas: ventas.sort((a, b) => new Date(a.date) - new Date(b.date)),
        name: c?.name || (id === GUEST ? "Público general (ventas sin cliente)" : ventas[0].customerName || "Cliente eliminado"),
        phone: c?.phone || "", market: c?.market || "",
        debt: ventas.reduce((a, s) => a + s.debt, 0),
        masAntigua: ventas.reduce((m, s) => Math.min(m, new Date(s.date).getTime()), Infinity),
      };
    }).sort((a, b) => b.debt - a.debt);
  }, [D.sales, customers]);

  const visibles = grupos.filter(g => `${g.name} ${g.market} ${g.phone}`.toLowerCase().includes(q.toLowerCase()));
  const totalDebt = grupos.reduce((a, g) => a + g.debt, 0);
  const diasMasAntigua = grupos.length ? Math.floor((Date.now() - Math.min(...grupos.map(g => g.masAntigua))) / 86400000) : 0;

  const cobrar = async (sale, monto) => {
    const a = Math.min(n(monto), sale.debt);
    if (a <= 0) return;
    const ok = await ejecutar(() => A.cobrarVenta(sale.id, a, metodos[sale.id] || "efectivo"), { exito: `Cobro de ${Bs(a)} registrado` });
    if (ok) setPays(p => ({ ...p, [sale.id]: "" }));
  };

  const recordatorio = g => {
    const detalle = g.ventas.map(s => `• Venta #${s.numero || ""} del ${fDate(s.date)}: ${Bs(s.debt)}`).join("\n");
    const texto = `Hola ${g.name}, le saluda ${negocio}. Le recordamos su saldo pendiente de ${Bs(g.debt)}:\n${detalle}\n\nGracias por su preferencia.`;
    window.open(`https://wa.me/${waNumero(g.phone)}?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
  };

  const exportXLS = () => xlsx([{ name: "Deudas", data: grupos.flatMap(g => g.ventas.map(s => ({ Cliente: g.name, Teléfono: g.phone, Mercado: g.market, Venta: s.numero, Fecha: fDate(s.date), Total: s.total, Pagado: s.paid, Deuda: s.debt }))) }], "deudas.xlsx");

  return (
    <div>
      <Header title="Deudas" sub="Saldos pendientes de cobro" action={<button onClick={exportXLS} style={mkBtn("ghost")}>⬇️ Exportar Excel</button>} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10, marginBottom: 16 }}>
        <KPI label="Total por cobrar" value={Bs(totalDebt)} Icon="💳" color={C.red} />
        <KPI label="Clientes con deuda" value={grupos.length} Icon="👥" color={C.amber} />
        <KPI label="Deuda más antigua" value={grupos.length ? `${diasMasAntigua} días` : "—"} Icon="⏳" color={diasMasAntigua > 30 ? C.red : C.textMid} />
      </div>
      <SearchInput value={q} onChange={setQ} placeholder="Buscar cliente..." />
      <div style={{ marginTop: 12 }}>
        {visibles.length === 0 ? <Empty icon="✅" title={grupos.length ? "Sin resultados" : "Sin deudas"} sub={grupos.length ? "Prueba con otra búsqueda" : "Todos los clientes están al día"} /> :
          visibles.map(g => (
            <div key={g.id} style={{ ...card(), marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 10, flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <div style={{ width: 40, height: 40, background: `linear-gradient(135deg,${C.red},#7F1D1D)`, borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 700 }}>{g.name[0]}</div>
                  <div><div style={{ fontWeight: 700, fontSize: 14 }}>{g.name}</div><div style={{ fontSize: 12, color: C.textMid }}>{g.market}{g.phone ? ` · ${g.phone}` : ""}</div></div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {waNumero(g.phone) && <button onClick={() => recordatorio(g)} style={{ ...mkBtn("success"), padding: "6px 10px", fontSize: 12 }}>💬 Recordar por WhatsApp</button>}
                  <div style={{ fontSize: 22, fontWeight: 800, color: C.red, letterSpacing: "-0.04em" }}>{Bs(g.debt)}</div>
                </div>
              </div>
              {g.ventas.map(sale => (
                <div key={sale.id} style={{ padding: "9px 12px", background: C.bg, borderRadius: R.md, marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>Venta #{sale.numero} · {fDate(sale.date)}{g.id === GUEST && sale.customerName ? ` · ${sale.customerName}` : ""}</div>
                    <div style={{ fontSize: 12, color: C.textMid }}>Total: {Bs(sale.total)} · Pagado: {Bs(sale.paid)}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={mkBadge("red")}>{Bs(sale.debt)}</span>
                    <input type="number" min="0" step="0.01" inputMode="decimal" aria-label="Monto a cobrar" style={{ ...inp, width: 95, fontSize: 12, margin: 0 }} value={pays[sale.id] || ""} onChange={e => setPays(p => ({ ...p, [sale.id]: e.target.value }))} placeholder="Monto" />
                    <select aria-label="Método de pago" value={metodos[sale.id] || "efectivo"} onChange={e => setMetodos(m => ({ ...m, [sale.id]: e.target.value }))} style={{ ...inp, width: "auto", fontSize: 12, margin: 0 }}>
                      <option value="efectivo">Efectivo</option><option value="qr">QR</option><option value="banco">Transferencia</option><option value="tarjeta">Tarjeta</option>
                    </select>
                    <button onClick={() => cobrar(sale, pays[sale.id])} disabled={guardando || !(n(pays[sale.id]) > 0)} style={{ ...mkBtn("success"), padding: "6px 10px", fontSize: 12, opacity: n(pays[sale.id]) > 0 ? 1 : 0.5 }}>✓ Cobrar</button>
                    <button onClick={() => cobrar(sale, sale.debt)} disabled={guardando} style={{ ...mkBtn("ghost"), padding: "6px 10px", fontSize: 12 }}>Cobrar todo</button>
                  </div>
                </div>
              ))}
            </div>
          ))}
      </div>
    </div>
  );
}
