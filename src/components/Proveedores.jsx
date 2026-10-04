import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { n, today, fDate, isAdmin } from "../utils/businessLogic.js";
import { useAccion } from "../hooks/useAccion.js";
import { Bs } from "../currency.js";
import { C, R } from "../theme.jsx";
import { card, lbl, inp, row, mkBtn, mkBadge } from "../styles.js";
import { Header } from "./ui/Header.jsx";
import { SearchInput } from "./ui/SearchInput.jsx";
import { Empty } from "./ui/Empty.jsx";
import { Modal } from "./ui/Modal.jsx";
import { Table } from "./ui/Table.jsx";

export function Proveedores({ D, A, user }) {
  const { suppliers, purchases } = D;
  const products = D.vendibles || D.products; // las compras entran a productos simples o a variantes
  const [ejecutar, guardando] = useAccion();
  const [err, setErr] = useState("");
  const admin = isAdmin(user) || user?.role === "superadmin";
  const [q, setQ] = useState(""); const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ name: "", phone: "", address: "", product: "", notes: "" });
  const PFORM_VACIO = () => ({ supplierId: "", productId: "", product: "", qty: "", price: "", paid: "", date: today(), notes: "", addStock: true, lote: "", vence: "" });
  const [pForm, setPForm] = useState(PFORM_VACIO());

  const saveSupplier = async () => {
    if (!form.name.trim()) { setErr("El nombre es obligatorio"); return; }
    setErr("");
    const ok = await ejecutar(() => (modal === "new" ? A.crearProveedor(form) : A.actualizarProveedor(modal.id, form)), { exito: "Proveedor guardado" });
    if (ok) setModal(null);
  };
  const eliminarProveedor = async sp => {
    if (!window.confirm(`¿Eliminar al proveedor "${sp.name}"? Su historial de compras se conserva.`)) return;
    await ejecutar(() => A.eliminarProveedor(sp.id), { exito: "Proveedor eliminado" });
  };
  const savePurchase = async () => {
    const nombre = pForm.productId ? products.find(p => p.id === pForm.productId)?.name : pForm.product.trim();
    if (!nombre) { setErr("Elige un producto del catálogo o escribe qué compraste"); return; }
    if (n(pForm.qty) <= 0) { setErr("La cantidad debe ser mayor a 0"); return; }
    const conLote = pForm.addStock && products.find(p => p.id === pForm.productId)?.lotControl;
    if (conLote && !pForm.vence) { setErr("Indica la fecha de vencimiento del lote"); return; }
    setErr("");
    const ok = await ejecutar(() => A.registrarCompra({
      supplierId: pForm.supplierId || null, date: pForm.date, notes: pForm.notes, paid: n(pForm.paid), addStock: pForm.addStock,
      ...(conLote ? { lote: pForm.lote, expires: pForm.vence } : {}),
      items: [{ productId: pForm.productId || null, name: nombre, qty: n(pForm.qty), price: n(pForm.price) }],
    }), { exito: pForm.productId && pForm.addStock ? "Compra registrada y stock actualizado" : "Compra registrada" });
    if (ok) { setModal(null); setPForm(PFORM_VACIO()); }
  };
  const [pago, setPago] = useState(null); // { compra, monto }
  const pagarCompra = async () => {
    const monto = n(pago?.monto);
    if (!(monto > 0)) { setErr("Ingresa un monto mayor a 0"); return; }
    setErr("");
    const p = pago.compra;
    const ok = await ejecutar(() => A.pagarCompra(p.id, Math.min(p.total, p.paid + monto)), { exito: "Pago al proveedor registrado" });
    if (ok) setPago(null);
  };

  const getSpTotal = id => purchases.filter(p => p.supplierId === id).reduce((a, p) => a + p.total, 0);
  const getSpDebt = id => purchases.filter(p => p.supplierId === id).reduce((a, p) => a + p.debt, 0);
  const filtered = suppliers.filter(s => `${s.name} ${s.address}`.toLowerCase().includes(q.toLowerCase()));
  const compData = suppliers.map(s => ({ name: s.name, compras: getSpTotal(s.id), deuda: getSpDebt(s.id) })).filter(s => s.compras > 0).sort((a, b) => b.compras - a.compras);

  return (
    <div>
      <Header title="Proveedores" sub="Gestión de compras y proveedores de materia prima" action={<>
        <button onClick={() => setModal("purchase")} style={mkBtn("ghost")}>+ Registrar compra</button>
        <button onClick={() => { setForm({ name: "", phone: "", address: "", product: "", notes: "" }); setModal("new"); }} style={mkBtn("primary")}>+ Nuevo proveedor</button>
      </>} />

      {compData.length > 0 && <div style={{ ...card(), marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>Comparativa de proveedores</div>
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={compData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `Bs.${v}`} />
            <Tooltip formatter={v => [Bs(v)]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
            <Bar dataKey="compras" name="Total compras" fill={C.blue} radius={[4, 4, 0, 0]} />
            <Bar dataKey="deuda" name="Deuda" fill={C.red} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>}

      <SearchInput value={q} onChange={setQ} placeholder="Buscar proveedor..." />
      <div style={{ marginTop: 12 }}>
        {filtered.length === 0 ? <Empty icon="🚛" title="Sin proveedores" sub="Registra a quién le compras y lleva el control de lo que les debes" action={<button onClick={() => { setForm({ name: "", phone: "", address: "", product: "", notes: "" }); setModal("new"); }} style={mkBtn("primary")}>+ Agregar proveedor</button>} /> :
          filtered.map(sp => {
            const total = getSpTotal(sp.id); const debt = getSpDebt(sp.id); const cnt = purchases.filter(p => p.supplierId === sp.id).length;
            return (
              <div key={sp.id} style={{ ...card(), marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <div style={{ width: 40, height: 40, background: `linear-gradient(135deg,${C.blue},#1E40AF)`, borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🚛</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{sp.name}</div>
                    <div style={{ fontSize: 12, color: C.textMid }}>{sp.address}{sp.phone ? ` · ${sp.phone}` : ""}</div>
                    {sp.product && <div style={{ fontSize: 12, color: C.textFaint }}>Producto: {sp.product}</div>}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 12, color: C.textFaint }}>{cnt} compra{cnt !== 1 ? "s" : ""} · {Bs(total)}</div>
                  {debt > 0 && <span style={mkBadge("red")}>Deuda {Bs(debt)}</span>}
                  <div style={{ display: "flex", gap: 4, marginTop: 6, justifyContent: "flex-end" }}>
                    <button onClick={() => { setForm({ ...sp }); setModal(sp); }} style={{ ...mkBtn("ghost"), padding: "4px 8px", fontSize: 11 }}>✏️</button>
                    {admin && <button onClick={() => eliminarProveedor(sp)} aria-label="Eliminar proveedor" style={{ ...mkBtn("danger"), padding: "4px 8px", fontSize: 11 }}>🗑️</button>}
                  </div>
                </div>
              </div>
            );
          })}
      </div>

      {purchases.length > 0 && <div style={{ ...card(), marginTop: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>Historial de compras</div>
        <Table cols={[{ key: "supplierName", label: "Proveedor" }, { key: "product", label: "Producto" }, { key: "qty", label: "Cant." }, { key: "total", label: "Total", render: v => <strong>{Bs(v)}</strong> }, { key: "paid", label: "Pagado", render: v => <span style={{ color: C.green }}>{Bs(v)}</span> }, { key: "debt", label: "Deuda", render: (v, row) => v > 0 ? <button onClick={() => { setErr(""); setPago({ compra: row, monto: row.debt.toFixed(2) }); }} style={{ ...mkBadge("red"), border: "none", cursor: "pointer" }}>{Bs(v)} · Pagar</button> : <span style={mkBadge("green")}>Saldado</span> }, { key: "date", label: "Fecha", render: v => fDate(v) }]} rows={purchases.slice(0, 50)} />
      </div>}

      {(modal === "new" || (modal && typeof modal === "object" && suppliers.some(x => x.id === modal.id))) && <Modal title={typeof modal === "string" ? "Nuevo proveedor" : "Editar proveedor"} onClose={() => setModal(null)}>
        <div style={{ marginBottom: 10 }}><label style={lbl}>Nombre *</label><input style={inp} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Nombre del proveedor" autoFocus /></div>
        <div style={row()}>
          <div style={{ flex: 1 }}><label style={lbl}>Teléfono</label><input style={inp} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
          <div style={{ flex: 1 }}><label style={lbl}>Ubicación</label><input style={inp} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Ciudad / región" /></div>
        </div>
        <div style={{ marginBottom: 10 }}><label style={lbl}>Producto principal</label><input style={inp} value={form.product} onChange={e => setForm({ ...form, product: e.target.value })} placeholder="Ej: Harina, envases, materia prima…" /></div>
        <div style={{ marginBottom: 18 }}><label style={lbl}>Notas</label><input style={inp} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}><button onClick={() => setModal(null)} style={mkBtn("ghost")}>Cancelar</button>{err && <span style={{ color: C.red, fontSize: 13, alignSelf: "center" }}>{err}</span>}<button onClick={saveSupplier} disabled={guardando} style={mkBtn("primary")}>{guardando ? "Guardando…" : "Guardar"}</button></div>
      </Modal>}

      {modal === "purchase" && <Modal title="Registrar compra a proveedor" onClose={() => setModal(null)}>
        <div style={{ marginBottom: 10 }}><label style={lbl}>Proveedor *</label>
          <select style={inp} value={pForm.supplierId} onChange={e => setPForm({ ...pForm, supplierId: e.target.value })}>
            <option value="">Seleccionar proveedor...</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div style={row()}>
          <div style={{ flex: 2 }}><label style={lbl}>Producto</label>
            <select style={inp} value={pForm.productId} onChange={e => { const p = products.find(x => x.id === e.target.value); setPForm({ ...pForm, productId: e.target.value, price: p && !pForm.price ? (p.cost || "") : pForm.price }); }}>
              <option value="">Otro (escribir abajo, no suma stock)</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name} — stock {p.stock} {p.unit}</option>)}
            </select>
            {!pForm.productId && <input style={inp} value={pForm.product} onChange={e => setPForm({ ...pForm, product: e.target.value })} placeholder="Qué compraste (ej: bolsas, transporte)" />}
          </div>
          <div style={{ flex: 1 }}><label style={lbl}>Fecha</label><input type="date" style={inp} value={pForm.date} onChange={e => setPForm({ ...pForm, date: e.target.value })} /></div>
        </div>
        <div style={row()}>
          <div style={{ flex: 1 }}><label style={lbl}>Cantidad</label><input type="number" style={inp} value={pForm.qty} onChange={e => setPForm({ ...pForm, qty: e.target.value })} /></div>
          <div style={{ flex: 1 }}><label style={lbl}>Precio unit. (Bs.)</label><input type="number" style={inp} value={pForm.price} onChange={e => setPForm({ ...pForm, price: e.target.value })} /></div>
          <div style={{ flex: 1 }}><label style={lbl}>Pagado (Bs.)</label><input type="number" style={inp} value={pForm.paid} onChange={e => setPForm({ ...pForm, paid: e.target.value })} /></div>
        </div>
        <div style={{ padding: "10px 12px", background: C.bg, borderRadius: R.md, marginBottom: 10, fontSize: 13 }}>Total: <strong style={{ color: C.red }}>{Bs(n(pForm.qty) * n(pForm.price))}</strong> · Deuda: <strong style={{ color: C.amber }}>{Bs(Math.max(0, n(pForm.qty) * n(pForm.price) - n(pForm.paid)))}</strong></div>
        <div style={{ marginBottom: 10 }}><label style={lbl}>Notas</label><input style={inp} value={pForm.notes} onChange={e => setPForm({ ...pForm, notes: e.target.value })} /></div>
        {pForm.productId && pForm.addStock && products.find(p => p.id === pForm.productId)?.lotControl && <div style={row()}>
          <div style={{ flex: 1 }}><label style={lbl}>N° de lote</label><input style={inp} value={pForm.lote} onChange={e => setPForm({ ...pForm, lote: e.target.value })} placeholder="Ej: L2405A" /></div>
          <div style={{ flex: 1 }}><label style={lbl}>Vencimiento *</label><input type="date" style={inp} value={pForm.vence} onChange={e => setPForm({ ...pForm, vence: e.target.value })} /></div>
        </div>}
        {pForm.productId && <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, marginBottom: 14, cursor: "pointer" }}>
          <input type="checkbox" checked={pForm.addStock} onChange={e => setPForm({ ...pForm, addStock: e.target.checked })} />
          Sumar al stock y actualizar el costo promedio del producto
        </label>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}><button onClick={() => setModal(null)} style={mkBtn("ghost")}>Cancelar</button>{err && <span style={{ color: C.red, fontSize: 13, alignSelf: "center" }}>{err}</span>}<button onClick={savePurchase} disabled={guardando} style={mkBtn("primary")}>{guardando ? "Guardando…" : "Registrar compra"}</button></div>
      </Modal>}
      {pago && <Modal title="Pagar al proveedor" onClose={() => setPago(null)}>
        <div style={{ fontSize: 13, color: C.textMid, marginBottom: 12 }}>
          {pago.compra.supplierName || "Proveedor"} · {pago.compra.product} · Deuda actual: <strong style={{ color: C.red }}>{Bs(pago.compra.debt)}</strong>
        </div>
        <label style={lbl}>Monto a pagar (Bs.)</label>
        <input type="number" min="0" step="any" inputMode="decimal" style={inp} value={pago.monto} onChange={e => setPago({ ...pago, monto: e.target.value })} autoFocus />
        {n(pago.monto) > pago.compra.debt && <div style={{ fontSize: 12, color: C.amber, marginTop: 6 }}>Se registrará solo la deuda pendiente ({Bs(pago.compra.debt)}).</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          {err && <span style={{ color: C.red, fontSize: 13, alignSelf: "center" }}>{err}</span>}
          <button onClick={() => setPago(null)} style={mkBtn("ghost")}>Cancelar</button>
          <button onClick={pagarCompra} disabled={guardando} style={mkBtn("primary")}>{guardando ? "Guardando…" : "Registrar pago"}</button>
        </div>
      </Modal>}
    </div>
  );
}
