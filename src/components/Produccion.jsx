import { useState } from "react";
import { n, today, fDate, isAdmin } from "../utils/businessLogic.js";
import { useAccion } from "../hooks/useAccion.js";
import { Bs } from "../currency.js";
import { C, R } from "../theme.jsx";
import { card, lbl, inp, row, mkBtn, mkBadge } from "../styles.js";
import { Header } from "./ui/Header.jsx";
import { Chip } from "./ui/Chip.jsx";
import { Empty } from "./ui/Empty.jsx";
import { Modal } from "./ui/Modal.jsx";
import { Table } from "./ui/Table.jsx";

const FORMULA_VACIA = { name: "", inputId: "", inputQty: "", inputUnit: "", outputId: "", outputQty: "", outputUnit: "", laborCost: 0, energyCost: 0, desc: "" };

export function Produccion({ D, A, user }) {
  const { products, formulas, orders } = D;
  const [ejecutar, guardando] = useAccion();
  const [err, setErr] = useState("");
  const admin = isAdmin(user) || user?.role === "superadmin";
  const [tab, setTab] = useState("orders"); const [modal, setModal] = useState(null); const [deleteOrder, setDeleteOrder] = useState(null);
  const [fForm, setFForm] = useState(FORMULA_VACIA);
  const [oForm, setOForm] = useState({ formulaId: "", batches: 1, date: today(), extraCost: 0, notes: "" });
  const getStock = id => products.find(p => p.id === id)?.stock ?? 0;

  const saveFormula = async () => {
    if (!fForm.name.trim() || !fForm.inputId || !fForm.outputId) { setErr("Completa el nombre, el insumo y el producto resultante"); return; }
    if (n(fForm.inputQty) <= 0 || n(fForm.outputQty) <= 0) { setErr("Las cantidades deben ser mayores a 0"); return; }
    setErr("");
    const datos = { ...fForm, inputQty: n(fForm.inputQty), outputQty: n(fForm.outputQty), laborCost: n(fForm.laborCost), energyCost: n(fForm.energyCost) };
    const ok = await ejecutar(() => (modal === "new_f" ? A.crearFormula(datos) : A.actualizarFormula(modal.id, datos)), { exito: "Fórmula guardada" });
    if (ok) setModal(null);
  };

  const execOrder = async () => {
    if (!oForm.formulaId || !(n(oForm.batches) > 0)) { setErr("Elige una fórmula y la cantidad de lotes"); return; }
    setErr("");
    const ok = await ejecutar(() => A.ejecutarProduccion(oForm.formulaId, n(oForm.batches), n(oForm.extraCost), oForm.date, oForm.notes), { exito: "Producción registrada. Stock actualizado." });
    if (ok) { setModal(null); setOForm({ formulaId: "", batches: 1, date: today(), extraCost: 0, notes: "" }); }
  };

  const previewFormula = oForm.formulaId ? formulas.find(f => f.id === oForm.formulaId) : null;
  const previewBatches = n(oForm.batches) || 1;
  const previewOutput = previewFormula ? (previewFormula.outputQty * previewBatches) : 0;
  const previewInput = previewFormula ? (previewFormula.inputQty * previewBatches) : 0;
  const previewIn = previewFormula ? products.find(p => p.id === previewFormula.inputId) : null;
  // Igual que en el servidor: insumo a costo promedio + mano de obra + energía + extras
  const previewCost = previewFormula ? (previewInput * n(previewIn?.cost) + (previewFormula.laborCost + previewFormula.energyCost) * previewBatches + n(oForm.extraCost)) : 0;
  const previewProd = previewFormula ? products.find(p => p.id === previewFormula.outputId) : null;
  const previewRevenue = previewOutput * (previewProd?.price || 0);
  const previewMargin = previewRevenue > 0 ? Math.round((previewRevenue - previewCost) / previewRevenue * 100) : 0;

  const removeOrder = async () => {
    if (!deleteOrder) return;
    const ok = await ejecutar(() => A.anularProduccion(deleteOrder.id), { exito: "Producción anulada. Stock revertido." });
    if (ok) setDeleteOrder(null);
  };
  const eliminarFormula = async f => {
    if (!window.confirm(`¿Eliminar la fórmula "${f.name}"? El historial de producción se conserva.`)) return;
    await ejecutar(() => A.eliminarFormula(f.id), { exito: "Fórmula eliminada" });
  };

  return (
    <div>
      <Header title="Producción" sub="Órdenes de producción y fórmulas de transformación" action={<>
        <button onClick={() => { setFForm(FORMULA_VACIA); setModal("new_f"); }} style={mkBtn("ghost")}>+ Nueva fórmula</button>
        <button onClick={() => setModal("new_o")} style={mkBtn("primary")}>▶️ Nueva orden</button>
      </>} />
      <Chip value={tab} onChange={setTab} options={[["orders", "Órdenes de Producción"], ["formulas", "Fórmulas de Transformación"]]} />
      <div style={{ marginTop: 14 }}>
        {tab === "formulas" && (
          formulas.length === 0 ? <Empty icon="⚗️" title="Sin fórmulas" sub="Define cómo una materia prima se transforma en un producto (ej: harina → pan)" action={<button onClick={() => { setFForm(FORMULA_VACIA); setModal("new_f"); }} style={mkBtn("primary")}>+ Crear fórmula</button>} /> :
            formulas.map(f => {
              const inP = products.find(p => p.id === f.inputId); const outP = products.find(p => p.id === f.outputId);
              const baseCostPU = f.outputQty > 0 ? (f.laborCost + f.energyCost) / f.outputQty : 0;
              const margin = outP?.price > 0 ? ((outP.price - baseCostPU) / outP.price * 100) : 0;
              return (
                <div key={f.id} style={{ ...card(), marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-0.02em", marginBottom: 6 }}>{f.name}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
                        <span style={mkBadge("red")}>📥 {f.inputQty} {f.inputUnit} de {inP?.name || "?"}</span>
                        <span style={{ color: C.textFaint, fontSize: 16 }}>→</span>
                        <span style={mkBadge("green")}>📤 {f.outputQty} {f.outputUnit} de {outP?.name || "?"}</span>
                      </div>
                      <div style={{ display: "flex", gap: 12, fontSize: 12, color: C.textMid }}>
                        <span>👷 Mano de obra: <strong>{Bs(f.laborCost)}</strong></span>
                        <span>⚡ Energía: <strong>{Bs(f.energyCost)}</strong></span>
                        {outP && <span>📊 Margen est.: <strong style={{ color: margin > 0 ? C.green : C.red }}>{Math.round(margin)}%</strong></span>}
                      </div>
                      {f.desc && <div style={{ fontSize: 12, color: C.textFaint, marginTop: 4 }}>{f.desc}</div>}
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button onClick={() => { setFForm({ ...f }); setModal(f); }} style={{ ...mkBtn("ghost"), padding: "5px 9px" }}>✏️</button>
                      {admin && <button onClick={() => eliminarFormula(f)} aria-label="Eliminar fórmula" style={{ ...mkBtn("danger"), padding: "5px 9px" }}>🗑️</button>}
                    </div>
                  </div>
                </div>
              );
            })
        )}
        {tab === "orders" && (
          orders.length === 0 ? <Empty icon="🏭" title="Sin órdenes" sub="Ejecuta órdenes de producción para transformar materia prima" action={<button onClick={() => setModal("new_o")} style={mkBtn("primary")}>▶️ Nueva orden</button>} /> :
            <div style={card()}>
              <Table cols={[
                { key: "formulaName", label: "Fórmula", style: { fontWeight: 500 } },
                { key: "date", label: "Fecha", render: v => fDate(v) },
                { key: "batches", label: "Lotes" },
                { key: "inputUsed", label: "Mat. Prima", render: (v, r) => <span style={{ color: C.red }}>{v} {products.find(p => p.id === r.inputId)?.unit || "unid."}</span> },
                { key: "outputProduced", label: "Producido", render: (v, r) => <span style={{ color: C.green, fontWeight: 600 }}>{v} {products.find(p => p.id === r.outputId)?.unit || "unid."}</span> },
                { key: "totalCost", label: "Costo", render: v => Bs(v) },
                { key: "costPerUnit", label: "Costo/Unid.", render: v => Bs(v) },
                { key: "margin", label: "Margen", render: v => <span style={mkBadge(v >= 30 ? "green" : v >= 10 ? "amber" : "red")}>{v}%</span> },
                { key: "id", label: "Estado", render: (_, row) => row.anulada ? <span style={mkBadge("red")}>Anulada</span> : admin ? <button onClick={event => { event.stopPropagation(); setDeleteOrder(row); }} style={{ ...mkBtn("danger"), padding: "5px 9px" }}>Anular</button> : <span style={mkBadge("green")}>OK</span> },
              ]} rows={orders} />
            </div>
        )}
      </div>

      {deleteOrder && <Modal title="Anular producción" onClose={() => setDeleteOrder(null)} width={420}>
        <div style={{ fontSize: 13, color: C.textMid, marginBottom: 16 }}>
          Se devolverá el insumo consumido y se retirará lo producido. La orden queda en el historial como anulada.
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={() => setDeleteOrder(null)} style={mkBtn("ghost")}>Cancelar</button>
          <button onClick={removeOrder} disabled={guardando} style={mkBtn("danger")}>{guardando ? "Anulando…" : "Anular"}</button>
        </div>
      </Modal>}

      {(modal === "new_f" || (modal && typeof modal === "object" && formulas.some(x => x.id === modal.id))) && <Modal title={typeof modal === "string" ? "Nueva fórmula de producción" : "Editar fórmula"} onClose={() => setModal(null)} width={600}>
        <div style={{ marginBottom: 10 }}><label style={lbl}>Nombre de la fórmula *</label><input style={inp} value={fForm.name} onChange={e => setFForm({ ...fForm, name: e.target.value })} placeholder="Ej: Harina → Pan, Vaina → Polvo" autoFocus /></div>
        <div style={{ background: C.bg, borderRadius: R.md, padding: "12px", marginBottom: 10 }}>
          <div style={{ ...lbl, color: C.red, marginBottom: 8 }}>📥 Materia prima (entrada)</div>
          <div style={row()}>
            <div style={{ flex: 2 }}><label style={lbl}>Producto *</label>
              <select style={inp} value={fForm.inputId} onChange={e => setFForm({ ...fForm, inputId: e.target.value, inputUnit: products.find(p => p.id === e.target.value)?.unit || fForm.inputUnit })}>
                <option value="">Seleccionar...</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name} (Stock: {getStock(p.id)} {p.unit})</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}><label style={lbl}>Cantidad por lote</label><input type="number" style={inp} value={fForm.inputQty} onChange={e => setFForm({ ...fForm, inputQty: e.target.value })} /></div>
            <div style={{ flex: 1 }}><label style={lbl}>Unidad</label><input style={inp} value={fForm.inputUnit} onChange={e => setFForm({ ...fForm, inputUnit: e.target.value })} /></div>
          </div>
        </div>
        <div style={{ background: C.greenBg, borderRadius: R.md, padding: "12px", marginBottom: 10 }}>
          <div style={{ ...lbl, color: C.green, marginBottom: 8 }}>📤 Producto terminado (salida)</div>
          <div style={row()}>
            <div style={{ flex: 2 }}><label style={lbl}>Producto *</label>
              <select style={inp} value={fForm.outputId} onChange={e => setFForm({ ...fForm, outputId: e.target.value, outputUnit: products.find(p => p.id === e.target.value)?.unit || fForm.outputUnit })}>
                <option value="">Seleccionar...</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}><label style={lbl}>Cantidad producida</label><input type="number" style={inp} value={fForm.outputQty} onChange={e => setFForm({ ...fForm, outputQty: e.target.value })} /></div>
            <div style={{ flex: 1 }}><label style={lbl}>Unidad</label><input style={inp} value={fForm.outputUnit} onChange={e => setFForm({ ...fForm, outputUnit: e.target.value })} /></div>
          </div>
        </div>
        <div style={row()}>
          <div style={{ flex: 1 }}><label style={lbl}>Costo mano de obra (Bs.)</label><input type="number" style={inp} value={fForm.laborCost} onChange={e => setFForm({ ...fForm, laborCost: e.target.value })} /></div>
          <div style={{ flex: 1 }}><label style={lbl}>Costo energía/gas (Bs.)</label><input type="number" style={inp} value={fForm.energyCost} onChange={e => setFForm({ ...fForm, energyCost: e.target.value })} /></div>
        </div>
        <div style={{ marginBottom: 18 }}><label style={lbl}>Descripción</label><input style={inp} value={fForm.desc} onChange={e => setFForm({ ...fForm, desc: e.target.value })} placeholder="Descripción del proceso..." /></div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={() => setModal(null)} style={mkBtn("ghost")}>Cancelar</button>
          {err && <span style={{ color: C.red, fontSize: 13, alignSelf: "center" }}>{err}</span>}<button onClick={saveFormula} disabled={guardando} style={mkBtn("primary")}>{guardando ? "Guardando…" : "Guardar fórmula"}</button>
        </div>
      </Modal>}

      {modal === "new_o" && <Modal title="Nueva orden de producción" onClose={() => setModal(null)}>
        {formulas.length === 0 ? <div style={{ background: C.amberBg, border: `1px solid ${C.amberMid}`, borderRadius: R.md, padding: "12px", color: C.amber, fontSize: 13 }}>Debes crear al menos una fórmula primero.</div> : (
          <>
            <div style={{ marginBottom: 10 }}><label style={lbl}>Fórmula *</label>
              <select style={inp} value={oForm.formulaId} onChange={e => setOForm({ ...oForm, formulaId: e.target.value })}>
                <option value="">Seleccionar fórmula...</option>
                {formulas.map(f => { const inP = products.find(p => p.id === f.inputId); const outP = products.find(p => p.id === f.outputId); return <option key={f.id} value={f.id}>{f.name} ({f.inputQty} {f.inputUnit || inP?.unit || ""} → {f.outputQty} {outP?.unit || "u"} de {outP?.name})</option>; })}
              </select>
            </div>
            {previewFormula && <div style={{ background: C.bg, borderRadius: R.md, padding: "12px", marginBottom: 10, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <div><div style={lbl}>Materia prima a usar</div><div style={{ fontWeight: 700, color: C.red }}>{previewInput.toFixed(1)} {previewIn?.unit || previewFormula.inputUnit || "unid."}</div><div style={{ fontSize: 11, color: C.textFaint }}>Stock: {getStock(previewFormula.inputId)}</div></div>
              <div><div style={lbl}>Producción estimada</div><div style={{ fontWeight: 700, color: C.green }}>{previewOutput.toFixed(1)} {previewProd?.unit || "unid."}</div></div>
              <div><div style={lbl}>Margen estimado</div><div style={{ fontWeight: 700, color: previewMargin >= 30 ? C.green : previewMargin >= 10 ? C.amber : C.red }}>{previewMargin}%</div></div>
            </div>}
            <div style={row()}>
              <div style={{ flex: 1 }}><label style={lbl}>Número de lotes *</label><input type="number" min="1" step="1" style={inp} value={oForm.batches} onChange={e => setOForm({ ...oForm, batches: e.target.value })} autoFocus /></div>
              <div style={{ flex: 1 }}><label style={lbl}>Fecha</label><input type="date" style={inp} value={oForm.date} onChange={e => setOForm({ ...oForm, date: e.target.value })} /></div>
              <div style={{ flex: 1 }}><label style={lbl}>Costos extras (Bs.)</label><input type="number" style={inp} value={oForm.extraCost} onChange={e => setOForm({ ...oForm, extraCost: e.target.value })} placeholder="Transporte, etc." /></div>
            </div>
            <div style={{ marginBottom: 18 }}><label style={lbl}>Notas</label><input style={inp} value={oForm.notes} onChange={e => setOForm({ ...oForm, notes: e.target.value })} placeholder="Observaciones del proceso..." /></div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setModal(null)} style={mkBtn("ghost")}>Cancelar</button>
              {err && <span style={{ color: C.red, fontSize: 13, alignSelf: "center" }}>{err}</span>}<button onClick={execOrder} disabled={guardando} style={mkBtn("primary")}>{guardando ? "Procesando…" : "▶️ Ejecutar orden"}</button>
            </div>
          </>
        )}
      </Modal>}
    </div>
  );
}
