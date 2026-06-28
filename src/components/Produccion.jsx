import { useState } from "react";
import { n, uid, today, fDate, reverseProductionInventory } from "../utils/businessLogic.js";
import { Bs } from "../currency.js";
import { C, R } from "../theme.jsx";
import { card, lbl, inp, row, mkBtn, mkBadge } from "../styles.js";
import { Header } from "./ui/Header.jsx";
import { Chip } from "./ui/Chip.jsx";
import { Empty } from "./ui/Empty.jsx";
import { Modal } from "./ui/Modal.jsx";
import { Table } from "./ui/Table.jsx";

export function Produccion({ D, save, user, logAction }) {
  const { products, inventory, formulas, orders } = D;
  const [tab, setTab] = useState("orders"); const [modal, setModal] = useState(null); const [deleteOrder, setDeleteOrder] = useState(null);
  const [fForm, setFForm] = useState({ name: "", inputId: "", inputQty: 11.5, inputUnit: "arroba (11.5kg)", outputId: "", outputQty: 5, outputUnit: "kg", laborCost: 0, energyCost: 0, desc: "" });
  const [oForm, setOForm] = useState({ formulaId: "", batches: 1, date: today(), extraCost: 0, notes: "" });
  const getStock = id => (inventory.find(i => i.productId === id) || {}).stock || 0;

  const saveFormula = () => {
    if (!fForm.name || !fForm.inputId || !fForm.outputId) return;
    save("formulas", modal === "new_f" ? [...formulas, { ...fForm, id: "f" + uid() }] : formulas.map(f => f.id === modal.id ? { ...f, ...fForm } : f));
    setModal(null);
  };

  const execOrder = () => {
    if (!oForm.formulaId || !oForm.batches) return;
    const formula = formulas.find(f => f.id === oForm.formulaId); if (!formula) return;
    const batches = n(oForm.batches);
    const inputUsed = formula.inputQty * batches; const outputProduced = formula.outputQty * batches;
    const baseCost = (formula.laborCost + formula.energyCost) * batches; const totalCost = baseCost + n(oForm.extraCost);
    const costPerUnit = outputProduced > 0 ? totalCost / outputProduced : 0;
    const outProd = products.find(p => p.id === formula.outputId);
    const revenue = outputProduced * ((outProd?.price || 0)); const margin = revenue > 0 ? ((revenue - totalCost) / revenue * 100) : 0;
    const newInv = inventory.map(i => {
      if (i.productId === formula.inputId) return { ...i, stock: Math.max(0, i.stock - inputUsed) };
      if (i.productId === formula.outputId) return { ...i, stock: i.stock + outputProduced };
      return i;
    });
    save("inventory", newInv);
    save("orders", [{ id: "or" + uid(), formulaId: oForm.formulaId, formulaName: formula.name, inputId: formula.inputId, outputId: formula.outputId, batches, inputUsed, outputProduced, totalCost, costPerUnit, revenue, margin: Math.round(margin), date: oForm.date, notes: oForm.notes, createdAt: new Date().toISOString() }, ...orders]);
    logAction?.(`${user.name} registró una orden de producción por ${previewOutput.toFixed(1)} ${previewProd?.unit || "unid."}`);
    setModal(null); setOForm({ formulaId: "", batches: 1, date: today(), extraCost: 0, notes: "" });
  };

  const previewFormula = oForm.formulaId ? formulas.find(f => f.id === oForm.formulaId) : null;
  const previewBatches = n(oForm.batches) || 1;
  const previewOutput = previewFormula ? (previewFormula.outputQty * previewBatches) : 0;
  const previewInput = previewFormula ? (previewFormula.inputQty * previewBatches) : 0;
  const previewCost = previewFormula ? ((previewFormula.laborCost + previewFormula.energyCost) * previewBatches + n(oForm.extraCost)) : 0;
  const previewProd = previewFormula ? products.find(p => p.id === previewFormula.outputId) : null;
  const previewRevenue = previewOutput * (previewProd?.price || 0);
  const previewMargin = previewRevenue > 0 ? Math.round((previewRevenue - previewCost) / previewRevenue * 100) : 0;

  const removeOrder = () => {
    if (!deleteOrder) return;
    save("orders", orders.filter(order => order.id !== deleteOrder.id));
    save("inventory", reverseProductionInventory(inventory, deleteOrder));
    logAction?.(`${user.name} eliminó el historial de producción ${deleteOrder.formulaName}`);
    setDeleteOrder(null);
  };

  return (
    <div>
      <Header title="Producción" sub="Órdenes de producción y fórmulas de transformación" action={<>
        <button onClick={() => { setFForm({ name: "", inputId: "", inputQty: 11.5, inputUnit: "arroba (11.5kg)", outputId: "", outputQty: 5, outputUnit: "kg", laborCost: 0, energyCost: 0, desc: "" }); setModal("new_f"); }} style={mkBtn("ghost")}>+ Nueva fórmula</button>
        <button onClick={() => setModal("new_o")} style={mkBtn("primary")}>▶️ Nueva orden</button>
      </>} />
      <Chip value={tab} onChange={setTab} options={[["orders", "Órdenes de Producción"], ["formulas", "Fórmulas de Transformación"]]} />
      <div style={{ marginTop: 14 }}>
        {tab === "formulas" && (
          formulas.length === 0 ? <Empty icon="⚗️" title="Sin fórmulas" sub="Define cómo se transforma el ají (ej: vaina → polvo)" action={<button onClick={() => { setFForm({ name: "", inputId: "", inputQty: 11.5, inputUnit: "arroba (11.5kg)", outputId: "", outputQty: 5, outputUnit: "kg", laborCost: 0, energyCost: 0, desc: "" }); setModal("new_f"); }} style={mkBtn("primary")}>+ Crear fórmula</button>} /> :
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
                      <button onClick={() => save("formulas", formulas.filter(x => x.id !== f.id))} style={{ ...mkBtn("danger"), padding: "5px 9px" }}>🗑️</button>
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
                { key: "inputUsed", label: "Mat. Prima", render: (v) => <span style={{ color: C.red }}>{v} unid.</span> },
                { key: "outputProduced", label: "Producido", render: (v) => <span style={{ color: C.green, fontWeight: 600 }}>{v} unid.</span> },
                { key: "totalCost", label: "Costo", render: v => Bs(v) },
                { key: "costPerUnit", label: "Costo/Unid.", render: v => Bs(v) },
                { key: "margin", label: "Margen", render: v => <span style={mkBadge(v >= 30 ? "green" : v >= 10 ? "amber" : "red")}>{v}%</span> },
                { key: "id", label: "Acciones", render: (_, row) => <button onClick={event => { event.stopPropagation(); setDeleteOrder(row); }} style={{ ...mkBtn("danger"), padding: "5px 9px" }}>Eliminar</button> },
              ]} rows={orders} />
            </div>
        )}
      </div>

      {deleteOrder && <Modal title="Eliminar historial de producción" onClose={() => setDeleteOrder(null)} width={420}>
        <div style={{ fontSize: 13, color: C.textMid, marginBottom: 16 }}>
          Esta acción revertirá el stock consumido y retirará el stock producido de la orden seleccionada.
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={() => setDeleteOrder(null)} style={mkBtn("ghost")}>Cancelar</button>
          <button onClick={removeOrder} style={mkBtn("danger")}>Eliminar</button>
        </div>
      </Modal>}

      {(modal === "new_f" || (modal && modal.id && modal.id.startsWith("f"))) && <Modal title={typeof modal === "string" ? "Nueva fórmula de producción" : "Editar fórmula"} onClose={() => setModal(null)} width={600}>
        <div style={{ marginBottom: 10 }}><label style={lbl}>Nombre de la fórmula *</label><input style={inp} value={fForm.name} onChange={e => setFForm({ ...fForm, name: e.target.value })} placeholder="Ej: Arroba de vaina → Polvo Rojo" autoFocus /></div>
        <div style={{ background: C.bg, borderRadius: R.md, padding: "12px", marginBottom: 10 }}>
          <div style={{ ...lbl, color: C.red, marginBottom: 8 }}>📥 Materia prima (entrada)</div>
          <div style={row()}>
            <div style={{ flex: 2 }}><label style={lbl}>Producto *</label>
              <select style={inp} value={fForm.inputId} onChange={e => setFForm({ ...fForm, inputId: e.target.value })}>
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
              <select style={inp} value={fForm.outputId} onChange={e => setFForm({ ...fForm, outputId: e.target.value })}>
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
          <button onClick={saveFormula} style={mkBtn("primary")}>Guardar fórmula</button>
        </div>
      </Modal>}

      {modal === "new_o" && <Modal title="Nueva orden de producción" onClose={() => setModal(null)}>
        {formulas.length === 0 ? <div style={{ background: C.amberBg, border: `1px solid ${C.amberMid}`, borderRadius: R.md, padding: "12px", color: C.amber, fontSize: 13 }}>Debes crear al menos una fórmula primero.</div> : (
          <>
            <div style={{ marginBottom: 10 }}><label style={lbl}>Fórmula *</label>
              <select style={inp} value={oForm.formulaId} onChange={e => setOForm({ ...oForm, formulaId: e.target.value })}>
                <option value="">Seleccionar fórmula...</option>
                {formulas.map(f => { const inP = products.find(p => p.id === f.inputId); const outP = products.find(p => p.id === f.outputId); return <option key={f.id} value={f.id}>{f.name} ({f.inputQty}{f.inputUnit} → {f.outputQty} {outP?.unit || "u"} de {outP?.name})</option>; })}
              </select>
            </div>
            {previewFormula && <div style={{ background: C.bg, borderRadius: R.md, padding: "12px", marginBottom: 10, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <div><div style={lbl}>Materia prima a usar</div><div style={{ fontWeight: 700, color: C.red }}>{previewInput.toFixed(1)} unid.</div><div style={{ fontSize: 11, color: C.textFaint }}>Stock: {getStock(previewFormula.inputId)}</div></div>
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
              <button onClick={execOrder} style={mkBtn("primary")}>▶️ Ejecutar orden</button>
            </div>
          </>
        )}
      </Modal>}
    </div>
  );
}
