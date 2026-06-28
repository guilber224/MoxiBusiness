import { useState } from "react";
import toast from "react-hot-toast";
import { Search, TrendingDown } from "lucide-react";
import { gastosService } from "../services/gastosService.js";
import { isSupabaseUUID } from "../utils/storageScope.js";
import { n, today, fDate, isAdmin } from "../utils/businessLogic.js";
import { Bs } from "../currency.js";
import { generateId } from "../empresaScope.js";
import { C, R } from "../theme.jsx";
import { card, inp, mkBtn, mkBadge } from "../styles.js";
import { useIsMobile } from "../hooks/useIsMobile.js";
import { Header } from "./ui/Header.jsx";
import { Modal } from "./ui/Modal.jsx";

const GASTO_CATS = ["Servicios", "Alquiler", "Sueldos", "Transporte", "Insumos", "Marketing", "Impuestos", "Mantenimiento", "Otros"];

export function GastosPage({ D, save, user, logAction, onRefreshDashboard }) {
  const { expenses } = D;
  const isMobile = useIsMobile();
  const [modal, setModal] = useState(false);
  const [q, setQ] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [form, setForm] = useState({ description: "", amount: "", category: "Otros", date: today(), notes: "" });
  const FORM_RESET = () => ({ description: "", amount: "", category: "Otros", date: today(), notes: "" });

  const gastos = (expenses || []).filter(e => e.type === "gasto");
  const filtered = gastos.filter(g => {
    const mq = `${g.description} ${g.category || ""}`.toLowerCase().includes(q.toLowerCase());
    const mc = filterCat === "all" || g.category === filterCat;
    return mq && mc;
  }).sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt));

  const totalMes = gastos.filter(g => {
    const d = new Date(g.date || g.createdAt); const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).reduce((s, g) => s + n(g.amount), 0);

  const doSave = async () => {
    if (!form.description.trim() || !form.amount || n(form.amount) <= 0) return;
    const gasto = {
      id: generateId(), description: form.description.trim(), amount: n(form.amount),
      category: form.category, date: new Date(form.date + "T12:00:00").toISOString(),
      notes: form.notes, type: "gasto", createdAt: new Date().toISOString(), empresa_id: user.empresa_id, usuario_id: user.id
    };
    const saved = await gastosService.createGasto(gasto, user.empresa_id);
    if (saved?._localOnly && isSupabaseUUID(user?.empresa_id)) {
      toast.error("Error al guardar el gasto. Revisa tu conexión e intenta de nuevo.");
      return;
    }
    save("expenses", [gasto, ...(expenses || [])]);
    logAction?.(`${user.name} registró gasto: ${form.description} ${Bs(n(form.amount))}`);
    setModal(false); setForm(FORM_RESET());
  };

  const doDelete = async () => {
    if (!deleteTarget) return;
    const res = await gastosService.deleteGasto(deleteTarget.id, user.empresa_id).catch(e => ({ ok: false, error: e.message }));
    if (res?.ok === false) {
      toast.error("No se pudo eliminar el gasto. Revisa tu conexión e intenta de nuevo.");
      setDeleteTarget(null);
      return;
    }
    save("expenses", (expenses || []).filter(e => e.id !== deleteTarget.id));
    logAction?.(`${user.name} eliminó gasto: ${deleteTarget.description}`);
    onRefreshDashboard?.();
    setDeleteTarget(null);
  };

  return (
    <div>
      <Header title="Gastos" sub="Registro y control de egresos del negocio"
        action={<button onClick={() => { setForm(FORM_RESET()); setModal(true); }} style={mkBtn("primary")}>+ Nuevo gasto</button>}
      />

      <div style={{ ...card(), padding: "14px 18px", marginBottom: 18, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 11, color: C.textFaint, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 4 }}>Gastos este mes</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: C.red, letterSpacing: "-0.04em" }}>{Bs(totalMes)}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 2 }}>{gastos.length} egreso{gastos.length !== 1 ? "s" : ""} total</div>
          <div style={{ fontSize: 11, color: C.textFaint }}>{filtered.length} mostrado{filtered.length !== 1 ? "s" : ""}</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 160 }}>
          <Search size={13} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: C.textFaint, pointerEvents: "none" }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar gastos…" style={{ ...inp, paddingLeft: 28, margin: 0 }} />
        </div>
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ ...inp, margin: 0, flex: "0 0 auto" }}>
          <option value="all">Todas las categorías</option>
          {GASTO_CATS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div style={{ ...card(), padding: 40, textAlign: "center", color: C.textFaint }}>
          <TrendingDown size={32} style={{ margin: "0 auto 12px", opacity: 0.3 }} />
          <div style={{ fontSize: 14 }}>Sin gastos registrados</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {filtered.map(g => (
            <div key={g.id} style={{ ...card(), padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: isMobile ? "wrap" : "nowrap" }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: C.redBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <TrendingDown size={16} color={C.red} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.description}</div>
                <div style={{ fontSize: 11, color: C.textFaint, marginTop: 2 }}>
                  {g.category && <span style={{ ...mkBadge("gray"), marginRight: 6 }}>{g.category}</span>}
                  {fDate(g.date || g.createdAt)}
                  {g.notes && <span style={{ marginLeft: 8, fontStyle: "italic", opacity: 0.7 }}>{g.notes}</span>}
                </div>
              </div>
              <div style={{ fontWeight: 800, fontSize: 15, color: C.red, flexShrink: 0 }}>{Bs(n(g.amount))}</div>
              {isAdmin(user) && <button onClick={() => setDeleteTarget(g)} style={{ ...mkBtn("ghost"), padding: "4px 8px", fontSize: 11, flexShrink: 0, color: C.red }}>×</button>}
            </div>
          ))}
        </div>
      )}

      {modal && (
        <Modal title="Nuevo Gasto" onClose={() => setModal(false)} width={440}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, color: C.textMid, display: "block", marginBottom: 4 }}>Descripción *</label>
              <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Ej: Pago de alquiler" style={{ ...inp, margin: 0 }} autoFocus />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, color: C.textMid, display: "block", marginBottom: 4 }}>Monto (Bs.) *</label>
                <input type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" style={{ ...inp, margin: 0 }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, color: C.textMid, display: "block", marginBottom: 4 }}>Fecha</label>
                <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={{ ...inp, margin: 0 }} />
              </div>
            </div>
            <div>
              <label style={{ fontSize: 12, color: C.textMid, display: "block", marginBottom: 4 }}>Categoría</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={{ ...inp, margin: 0 }}>
                {GASTO_CATS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: C.textMid, display: "block", marginBottom: 4 }}>Notas</label>
              <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Descripción adicional (opcional)" style={{ ...inp, margin: 0 }} />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 }}>
              <button onClick={() => setModal(false)} style={mkBtn("ghost")}>Cancelar</button>
              <button onClick={doSave} disabled={!form.description.trim() || n(form.amount) <= 0} style={{ ...mkBtn("danger"), opacity: (!form.description.trim() || n(form.amount) <= 0) ? 0.5 : 1 }}>Registrar gasto</button>
            </div>
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <Modal title="Eliminar gasto" onClose={() => setDeleteTarget(null)} width={400}>
          <div style={{ fontSize: 13, color: C.textMid, marginBottom: 16 }}>¿Eliminar el gasto <strong>{deleteTarget.description}</strong> por <strong>{Bs(n(deleteTarget.amount))}</strong>?</div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={() => setDeleteTarget(null)} style={mkBtn("ghost")}>Cancelar</button>
            <button onClick={doDelete} style={mkBtn("danger")}>Eliminar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
