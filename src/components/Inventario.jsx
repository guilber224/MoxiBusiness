import { useMemo, useState } from "react";
import { n, fDateTime } from "../utils/businessLogic.js";
import { Bs } from "../currency.js";
import { C } from "../theme.jsx";
import { card, mkBtn, mkBadge, lbl, inp, row } from "../styles.js";
import { DEFAULT_CATEGORY_ID, getCategoryName } from "../categories.js";
import { useAccion } from "../hooks/useAccion.js";
import { Header } from "./ui/Header.jsx";
import { Modal } from "./ui/Modal.jsx";
import { SearchInput } from "./ui/SearchInput.jsx";
import { KPI } from "./ui/KPI.jsx";
import { Table } from "./ui/Table.jsx";
import { Chip } from "./ui/Chip.jsx";
import { SelectorProducto } from "./ui/SelectorProducto.jsx";
import { diasParaVencer, estadoVencimiento, ordenarLotes } from "../utils/lotes.js";
import { fDate } from "../utils/businessLogic.js";

const SIN_CATEGORIA = { id: DEFAULT_CATEGORY_ID, name: "Sin categoría" };
// Agotado = sin stock (siempre). Stock bajo = por debajo del mínimo configurado.
const nivel = p => (p.stock <= 0 ? "empty" : p.minStock > 0 && p.stock <= p.minStock ? "low" : "ok");
const NIVEL_BADGE = { ok: "green", low: "amber", empty: "red" };
const NIVEL_TXT = { ok: "Disponible", low: "Stock bajo", empty: "Agotado" };
const MOV = {
  entrada: ["↑ Entrada", C.green, "+"], compra: ["↑ Compra", C.green, "+"], devolucion: ["↑ Devolución", C.green, "+"],
  anulacion: ["↺ Anulación", C.blue, "±"], salida: ["↓ Salida", C.red, "-"], venta: ["↓ Venta", C.red, "-"],
  produccion: ["⚙ Producción", C.blue, "±"], ajuste: ["✏ Ajuste", C.blue, "="],
};
const FORM_VACIO = { productId: "", type: "entrada", qty: "", cost: "", notes: "", lote: "", vence: "" };

export function Inventario({ D, A }) {
  // Lo que tiene stock propio: productos simples y variantes (los productos con variantes solo agrupan)
  const products = D.vendibles || D.products;
  const { movements } = D;
  const lotes = useMemo(() => ordenarLotes(D.lotes).map(l => ({ ...l, dias: diasParaVencer(l.expires), producto: products.find(p => p.id === l.productId) })).filter(l => l.producto), [D.lotes, products]);
  const porVencer = lotes.filter(l => l.dias != null && l.dias <= 30);
  const [verTodosLotes, setVerTodosLotes] = useState(false);
  const categoryOptions = [SIN_CATEGORIA, ...D.categories];
  const [modal, setModal] = useState(false); const [filter, setFilter] = useState("all"); const [q, setQ] = useState("");
  const [form, setForm] = useState(FORM_VACIO);
  const [err, setErr] = useState("");
  const [ejecutar, guardando] = useAccion();

  const allRows = products.map(p => ({ ...p, level: nivel(p) }));
  const rows = allRows.filter(p => (filter === "all" || p.level === filter) && (!q || p.name.toLowerCase().includes(q.toLowerCase())));
  const valorVenta = products.reduce((a, p) => a + Math.max(0, p.stock) * p.price, 0);
  const valorCosto = products.reduce((a, p) => a + Math.max(0, p.stock) * p.cost, 0);
  const agotados = allRows.filter(p => p.level === "empty");
  const bajos = allRows.filter(p => p.level === "low");
  const prodSel = products.find(p => p.id === form.productId);

  const abrir = (productId = "") => { setErr(""); setForm({ ...FORM_VACIO, productId }); setModal(true); };
  const doMove = async () => {
    if (!form.productId) { setErr("Selecciona un producto"); return; }
    if (form.qty === "" || n(form.qty) < 0 || (form.type !== "ajuste" && n(form.qty) <= 0)) { setErr("Ingresa una cantidad válida"); return; }
    setErr("");
    const tipo = form.type.toUpperCase();
    if (form.type === "entrada" && prodSel?.lotControl) {
      if (!form.vence) { setErr("Indica la fecha de vencimiento del lote"); return; }
      const okLote = await ejecutar(() => A.loteIngresar(form.productId, n(form.qty), form.lote, form.vence, n(form.cost) || null, form.notes), { exito: "Entrada registrada en su lote" });
      if (okLote) { setModal(false); setForm(FORM_VACIO); }
      return;
    }
    const ok = await ejecutar(() => A.movimientoStock(form.productId, tipo, n(form.qty), form.type === "entrada" ? n(form.cost) : null, form.notes),
      { exito: "Movimiento registrado" });
    if (ok) { setModal(false); setForm(FORM_VACIO); }
  };

  const nuevoStock = prodSel && form.qty !== "" ? (form.type === "entrada" ? prodSel.stock + n(form.qty) : form.type === "salida" ? prodSel.stock - n(form.qty) : n(form.qty)) : null;

  return (
    <div>
      <Header title="Inventario" sub="Control de stock y kardex" action={<button onClick={() => abrir()} style={mkBtn("primary")}>↕ Registrar movimiento</button>} />

      {(agotados.length > 0 || bajos.length > 0) && (
        <div style={{ ...card({ marginBottom: 14, borderLeft: `3px solid ${agotados.length ? C.red : C.amber}` }), background: agotados.length ? C.redBg : C.amberBg }}>
          {agotados.length > 0 && <>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6, color: C.red }}>⚠ {agotados.length} producto{agotados.length !== 1 ? "s" : ""} agotado{agotados.length !== 1 ? "s" : ""}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: bajos.length ? 10 : 0 }}>
              {agotados.map(p => <button key={p.id} onClick={() => abrir(p.id)} style={{ padding: "2px 8px", borderRadius: 4, border: "none", cursor: "pointer", background: "rgba(0,0,0,0.07)", fontSize: 11, color: C.red, fontWeight: 500 }}>{p.name}: {p.stock} {p.unit}</button>)}
            </div>
          </>}
          {bajos.length > 0 && <>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6, color: C.amber }}>⚠ {bajos.length} con stock bajo</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {bajos.map(p => <button key={p.id} onClick={() => abrir(p.id)} style={{ padding: "2px 8px", borderRadius: 4, border: "none", cursor: "pointer", background: "rgba(0,0,0,0.07)", fontSize: 11, color: C.amber, fontWeight: 500 }}>{p.name}: {p.stock} / mín. {p.minStock} {p.unit}</button>)}
            </div>
          </>}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 14 }}>
        <KPI label="Valor a precio de venta" value={Bs(valorVenta)} Icon="🗃️" color={C.blue} />
        <KPI label="Valor a costo" value={Bs(valorCosto)} Icon="💰" color={C.green} />
        <KPI label="Stock bajo" value={bajos.length} Icon="⚠️" color={C.amber} />
        <KPI label="Agotados" value={agotados.length} Icon="🚫" color={C.red} />
        {lotes.length > 0 && <KPI label="Vencen en 30 días" value={porVencer.length} Icon="⏳" color={porVencer.length ? C.red : C.green} />}
      </div>

      {lotes.length > 0 && <div style={{ ...card(), marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 8, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>⏳ Lotes y vencimientos</div>
          <span style={{ fontSize: 12, color: C.textFaint }}>Las ventas descuentan primero el lote que vence antes</span>
        </div>
        <Table cols={[
          { key: "producto", label: "Producto", render: (p) => p?.name },
          { key: "code", label: "Lote", render: v => <span style={{ whiteSpace: "nowrap", fontWeight: 600 }}>{v}</span> },
          { key: "qty", label: "Cantidad", render: (v, l) => `${v} ${l.producto?.unit || ""}` },
          { key: "expires", label: "Vence", render: v => (v ? fDate(v) : "—") },
          { key: "dias", label: "Estado", render: d => { const e = estadoVencimiento(d); return <span style={mkBadge(e.badge)}>{e.texto}</span>; } },
        ]} rows={verTodosLotes ? lotes : lotes.slice(0, 8)} />
        {lotes.length > 8 && <button onClick={() => setVerTodosLotes(v => !v)} style={{ ...mkBtn("ghost"), marginTop: 8, fontSize: 12 }}>{verTodosLotes ? "Ver menos" : `Ver los ${lotes.length} lotes`}</button>}
      </div>}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <SearchInput value={q} onChange={setQ} placeholder="Buscar producto..." />
        <Chip value={filter} onChange={setFilter} options={[["all", "Todos"], ["ok", "Disponible"], ["low", "Stock bajo"], ["empty", "Agotados"]]} />
      </div>
      <div style={card()}>
        <Table cols={[
          { key: "name", label: "Producto", style: { fontWeight: 500 }, render: (v, r) => (
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {r.img ? <img src={r.img} alt="" loading="lazy" decoding="async" style={{ width: 32, height: 32, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />
                : <span style={{ width: 32, height: 32, borderRadius: 6, background: "var(--color-bg-primary)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>📦</span>}
              {v}
            </span>) },
          { key: "cat", label: "Categoría", render: v => getCategoryName(categoryOptions, v) },
          { key: "stock", label: "Stock", render: (v, r) => <strong style={{ color: r.level === "empty" ? C.red : r.level === "low" ? C.amber : C.green }}>{v} <span style={{ fontWeight: 400, fontSize: 11, color: C.textFaint }}>{r.unit}</span></strong> },
          { key: "cost", label: "Costo", render: v => (v > 0 ? Bs(v) : "—") },
          { key: "price", label: "Precio", render: v => Bs(v) },
          { key: "stock", label: "Valor", render: (v, r) => <span style={{ fontWeight: 700, color: C.blue }}>{Bs(Math.max(0, v) * r.price)}</span> },
          { key: "minStock", label: "Mínimo", render: (v, r) => (v > 0 ? `${v} ${r.unit}` : "—") },
          { key: "level", label: "Estado", render: v => <span style={mkBadge(NIVEL_BADGE[v])}>{NIVEL_TXT[v]}</span> },
        ]} rows={rows} />
      </div>

      <div style={{ ...card(), marginTop: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>Kardex — últimos movimientos</div>
        {movements.length === 0 ? <div style={{ fontSize: 13, color: C.textFaint }}>Aún no hay movimientos.</div> :
          <Table cols={[
            { key: "date", label: "Fecha", render: v => fDateTime(v) },
            { key: "type", label: "Tipo", render: v => { const m = MOV[v] || [v, C.text]; return <span style={{ ...mkBadge("default"), color: m[1], background: m[1] + "18" }}>{m[0]}</span>; } },
            { key: "productName", label: "Producto", render: (v, r) => v || products.find(p => p.id === r.productId)?.name || "—" },
            { key: "qty", label: "Cantidad", render: (v, r) => { const m = MOV[r.type]; const d = r.stockBefore != null && r.stockAfter != null ? r.stockAfter - r.stockBefore : null; const signo = d != null ? (d < 0 ? "−" : "+") : (m?.[2] === "±" ? "" : m?.[2]); const color = d != null ? (d < 0 ? C.red : C.green) : (m?.[1] || C.text); return <span style={{ fontWeight: 600, color }}>{signo}{Math.abs(n(v))}</span>; } },
            { key: "stockAfter", label: "Stock", render: (v, r) => (v == null ? "—" : `${r.stockBefore ?? "?"} → ${v}`) },
            { key: "cost", label: "Costo unit.", render: v => (v > 0 ? Bs(v) : "—") },
            { key: "user", label: "Usuario", render: v => v || "—" },
            { key: "notes", label: "Notas", render: v => v || "—" },
          ]} rows={movements.slice(0, 50)} />}
      </div>

      {modal && (
        <Modal title="Registrar movimiento de inventario" onClose={() => !guardando && setModal(false)}>
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>Tipo de movimiento</label>
            <div style={{ display: "flex", gap: 6 }}>
              {[["entrada", "↑ Entrada"], ["salida", "↓ Salida"], ["ajuste", "✏ Ajuste"]].map(([v, l]) => (
                <button key={v} onClick={() => setForm({ ...form, type: v })} style={{ ...mkBtn(form.type === v ? (v === "entrada" ? "success" : v === "salida" ? "danger" : "primary") : "ghost"), flex: 1, justifyContent: "center", fontSize: 12 }}>{l}</button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: C.textFaint, marginTop: 5 }}>
              {form.type === "entrada" && "Suma stock (ej. llegó mercadería). Si indicas el costo, se actualiza el costo promedio del producto."}
              {form.type === "salida" && "Resta stock sin venta (ej. merma, consumo interno, producto dañado)."}
              {form.type === "ajuste" && "Fija el stock exacto tras un conteo físico. La diferencia queda registrada en el kardex."}
            </div>
          </div>
          <div style={{ marginBottom: 10 }}><label style={lbl}>Producto *</label>
            <SelectorProducto products={products} categories={categoryOptions} value={form.productId} onChange={id => setForm(f => ({ ...f, productId: id }))} autoFocus={!form.productId} />
          </div>
          <div style={row()}>
            <div style={{ flex: 1 }}><label style={lbl}>{form.type === "ajuste" ? "Stock contado *" : "Cantidad *"}</label><input type="number" min="0" step="any" inputMode="decimal" style={inp} value={form.qty} onChange={e => setForm({ ...form, qty: e.target.value })} placeholder="0" autoFocus={!!form.productId} /></div>
            {form.type === "entrada" && <div style={{ flex: 1 }}><label style={lbl}>Costo unitario</label><input type="number" min="0" step="0.01" inputMode="decimal" style={inp} value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })} placeholder="Opcional" /></div>}
          </div>
          {prodSel?.lotControl && form.type === "entrada" && <div style={row()}>
            <div style={{ flex: 1 }}><label style={lbl}>N° de lote</label><input style={inp} value={form.lote} onChange={e => setForm({ ...form, lote: e.target.value })} placeholder="Ej: L2405A" /></div>
            <div style={{ flex: 1 }}><label style={lbl}>Vencimiento *</label><input type="date" style={inp} value={form.vence} onChange={e => setForm({ ...form, vence: e.target.value })} /></div>
          </div>}
          {prodSel?.lotControl && form.type !== "entrada" && <div style={{ fontSize: 12, color: C.textMid, marginBottom: 10 }}>Se descontará primero del lote que vence antes.</div>}
          <div style={{ marginBottom: 10 }}><label style={lbl}>Notas</label><input style={inp} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Motivo del movimiento" /></div>
          {nuevoStock !== null && <div style={{ fontSize: 12, color: nuevoStock < 0 ? C.red : C.textMid, marginBottom: 10 }}>Stock: {prodSel.stock} → <strong>{nuevoStock}</strong> {prodSel.unit}{nuevoStock < 0 && " (quedará negativo)"}</div>}
          {err && <div style={{ color: C.red, fontSize: 13, marginBottom: 10 }}>{err}</div>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
            <button onClick={() => setModal(false)} disabled={guardando} style={mkBtn("ghost")}>Cancelar</button>
            <button onClick={doMove} disabled={guardando} style={{ ...mkBtn("primary"), opacity: guardando ? 0.6 : 1 }}>{guardando ? "Guardando…" : "Registrar movimiento"}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
