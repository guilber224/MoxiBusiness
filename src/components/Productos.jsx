import { useState, useRef } from "react";
import toast from "react-hot-toast";
import { n } from "../utils/businessLogic.js";
import { Bs } from "../currency.js";
import { C } from "../theme.jsx";
import { card, mkBtn, lbl, inp, row, mkBadge } from "../styles.js";
import { DEFAULT_CATEGORY_ID, getCategoryName } from "../categories.js";
import { useAccion } from "../hooks/useAccion.js";
import { isAdmin } from "../utils/businessLogic.js";
import { Header } from "./ui/Header.jsx";
import { Empty } from "./ui/Empty.jsx";
import { Modal } from "./ui/Modal.jsx";
import { SearchInput } from "./ui/SearchInput.jsx";
import { ImportarExcel } from "./ImportarExcel.jsx";

const SIN_CATEGORIA = { id: DEFAULT_CATEGORY_ID, name: "Sin categoría", locked: true };
const FORM_VACIO = { name: "", cat: DEFAULT_CATEGORY_ID, unit: "", price: "", cost: "", minStock: "", desc: "", img: null, barcode: "" };

export function Productos({ D, A, user }) {
  const { products } = D;
  const categoryOptions = [SIN_CATEGORIA, ...D.categories];
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [archivo, setArchivo] = useState(null); // foto nueva pendiente de subir
  const [categoryName, setCategoryName] = useState("");
  const [deleteCategoryTarget, setDeleteCategoryTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [err, setErr] = useState("");
  const [ejecutar, guardando] = useAccion();
  const imgRef = useRef();

  const filtered = products.filter(p => (cat === "all" || p.cat === cat)
    && `${p.name} ${p.barcode}`.toLowerCase().includes(q.toLowerCase()));

  const openForm = (product = null) => {
    setErr(""); setArchivo(null);
    setForm(product ? { ...FORM_VACIO, ...product, price: product.price || "", cost: product.cost || "", minStock: product.minStock || "" } : { ...FORM_VACIO, cat: cat !== "all" ? cat : DEFAULT_CATEGORY_ID });
    setModal(product || "new");
  };

  const doSave = async () => {
    if (!form.name.trim()) { setErr("El nombre es obligatorio"); return; }
    if (n(form.price) < 0 || n(form.cost) < 0) { setErr("El precio y el costo no pueden ser negativos"); return; }
    setErr("");
    const ok = await ejecutar(async () => {
      const datos = { ...form, price: n(form.price), cost: n(form.cost), minStock: n(form.minStock) };
      if (modal === "new") {
        const creado = await A.crearProducto({ ...datos, img: null });
        if (archivo) {
          const url = await A.subirImagenProducto(archivo, creado.id);
          await A.actualizarProducto(creado.id, { ...datos, img: url });
        }
      } else {
        const img = archivo ? await A.subirImagenProducto(archivo, modal.id) : datos.img;
        await A.actualizarProducto(modal.id, { ...datos, img });
      }
    }, { exito: modal === "new" ? "Producto creado" : "Producto actualizado" });
    if (ok) setModal(null);
  };

  const doDelete = async () => {
    const ok = await ejecutar(() => A.eliminarProducto(deleteTarget.id), { exito: "Producto eliminado" });
    if (ok) setDeleteTarget(null);
  };

  const onFoto = e => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("El archivo no es una imagen"); return; }
    setArchivo(file);
    setForm(f => ({ ...f, img: URL.createObjectURL(file) }));
  };

  const addCategory = async () => {
    const name = categoryName.trim();
    if (!name) return;
    if (categoryOptions.some(c => c.name.toLowerCase() === name.toLowerCase())) { toast.error("Esa categoría ya existe"); return; }
    const ok = await ejecutar(() => A.crearCategoria(name), { exito: "Categoría creada" });
    if (ok) setCategoryName("");
  };
  const deleteCategory = async () => {
    const ok = await ejecutar(() => A.eliminarCategoria(deleteCategoryTarget.id), { exito: "Categoría eliminada" });
    if (ok) { if (cat === deleteCategoryTarget.id) setCat("all"); setDeleteCategoryTarget(null); }
  };

  const margen = n(form.price) > 0 && n(form.cost) > 0 ? Math.round((n(form.price) - n(form.cost)) / n(form.price) * 100) : null;
  const admin = isAdmin(user) || user?.role === "superadmin";
  const [importando, setImportando] = useState(false);

  return (
    <div>
      <Header title="Productos" sub={`${products.length} producto${products.length !== 1 ? "s" : ""} en el catálogo`} action={<>
        {admin && <button onClick={() => setImportando(true)} style={mkBtn("ghost")}>📥 Importar Excel</button>}
        <button onClick={() => openForm()} style={mkBtn("primary")}>+ Nuevo producto</button>
      </>} />
      {importando && <ImportarExcel tipo="productos" A={A} onClose={() => setImportando(false)} />}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <SearchInput value={q} onChange={setQ} placeholder="Buscar por nombre o código..." />
        <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
          {["all", ...categoryOptions.map(c => c.id)].map(id => (
            <button key={id} onClick={() => setCat(id)} style={{ ...mkBtn(cat === id ? "primary" : "subtle"), fontSize: 12, padding: "6px 11px" }}>
              {id === "all" ? "Todos" : getCategoryName(categoryOptions, id)}
            </button>
          ))}
        </div>
      </div>

      {admin && (
        <div style={{ ...card(), marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>Categorías</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <input style={{ ...inp, flex: "1 1 240px", margin: 0 }} value={categoryName} onChange={e => setCategoryName(e.target.value)} onKeyDown={e => e.key === "Enter" && addCategory()} placeholder="Nueva categoría" />
            <button onClick={addCategory} disabled={guardando || !categoryName.trim()} style={mkBtn("primary")}>+ Agregar</button>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {categoryOptions.map(c => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 20, background: C.bg, border: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{c.name}</span>
                <span style={{ fontSize: 11, color: C.textFaint }}>{products.filter(p => p.cat === c.id).length}</span>
                {!c.locked && <button onClick={() => setDeleteCategoryTarget(c)} aria-label={`Eliminar ${c.name}`} style={{ background: "none", border: "none", cursor: "pointer", color: C.red, padding: 0, fontSize: 14, lineHeight: 1 }}>×</button>}
              </div>
            ))}
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <Empty icon="📦" title={products.length ? "Sin resultados" : "Aún no tienes productos"} sub={products.length ? "Prueba con otra búsqueda o categoría" : "Crea tu primer producto para empezar a vender"}
          action={!products.length && <button onClick={() => openForm()} style={mkBtn("primary")}>+ Crear producto</button>} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(190px,1fr))", gap: 10 }}>
          {filtered.map(p => {
            const agotado = p.stock <= 0;
            const bajo = !agotado && p.minStock > 0 && p.stock <= p.minStock;
            return (
              <div key={p.id} style={{ ...card({ padding: 0, overflow: "hidden" }) }}>
                <div style={{ height: 110, background: p.img ? C.bg : `linear-gradient(135deg,${C.bg},${C.border})`, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", borderBottom: `1px solid ${C.border}` }}>
                  {p.img ? <img src={p.img} alt={p.name} loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 34, opacity: 0.5 }}>📦</span>}
                </div>
                <div style={{ padding: "10px 12px" }}>
                  <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 2 }}>{getCategoryName(categoryOptions, p.cat)}</div>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6, lineHeight: 1.3 }}>{p.name}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: C.red, letterSpacing: "-0.03em" }}>{Bs(p.price)}<span style={{ fontSize: 10, fontWeight: 400, color: C.textFaint }}>/{p.unit || "u"}</span></div>
                  {p.cost > 0 && p.price > 0 && <div style={{ fontSize: 11, color: C.green, marginTop: 1, fontWeight: 600 }}>Margen: {Math.round((p.price - p.cost) / p.price * 100)}%</div>}
                  <div style={{ marginTop: 6 }}>
                    <span style={mkBadge(agotado ? "red" : bajo ? "amber" : "green")}>{agotado ? "Agotado" : `Stock: ${p.stock} ${p.unit || ""}`}</span>
                  </div>
                  <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
                    <button onClick={() => openForm(p)} aria-label={`Editar ${p.name}`} style={{ ...mkBtn("ghost"), padding: "4px 8px", flex: 1, justifyContent: "center", fontSize: 11 }}>✏️ Editar</button>
                    {admin && <button onClick={() => setDeleteTarget(p)} aria-label={`Eliminar ${p.name}`} style={{ ...mkBtn("danger"), padding: "4px 8px", justifyContent: "center", fontSize: 11 }}>🗑️</button>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <Modal title={modal === "new" ? "Nuevo producto" : "Editar producto"} onClose={() => !guardando && setModal(null)}>
          <div style={row()}>
            <div style={{ flex: 2 }}><label style={lbl}>Nombre *</label><input style={inp} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Nombre del producto" autoFocus /></div>
            <div style={{ flex: 1 }}><label style={lbl}>Categoría</label>
              <select style={inp} value={form.cat} onChange={e => setForm({ ...form, cat: e.target.value })}>
                {categoryOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div style={row()}>
            <div style={{ flex: 1 }}><label style={lbl}>Precio de venta</label><input type="number" min="0" step="0.01" inputMode="decimal" style={inp} value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} placeholder="0.00" /></div>
            <div style={{ flex: 1 }}><label style={lbl}>Costo</label><input type="number" min="0" step="0.01" inputMode="decimal" style={inp} value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })} placeholder="0.00" /></div>
            <div style={{ flex: 1 }}><label style={lbl}>Unidad</label><input style={inp} value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} placeholder="bolsa, kg, unidad…" /></div>
            <div style={{ flex: 1 }}><label style={lbl}>Stock mínimo</label><input type="number" min="0" inputMode="decimal" style={inp} value={form.minStock} onChange={e => setForm({ ...form, minStock: e.target.value })} placeholder="0" /></div>
          </div>
          {margen !== null && <div style={{ fontSize: 12, color: margen >= 0 ? C.green : C.red, fontWeight: 600, marginTop: -6, marginBottom: 8 }}>Margen: {margen}% · Ganancia: {Bs(n(form.price) - n(form.cost))} por unidad</div>}
          <div style={row()}>
            <div style={{ flex: 1 }}><label style={lbl}>Código de barras</label><input style={inp} value={form.barcode} onChange={e => setForm({ ...form, barcode: e.target.value })} placeholder="Opcional" /></div>
            <div style={{ flex: 2 }}><label style={lbl}>Descripción</label><input style={inp} value={form.desc} onChange={e => setForm({ ...form, desc: e.target.value })} placeholder="Opcional" /></div>
          </div>
          {modal === "new" && <div style={{ fontSize: 12, color: C.textFaint, marginBottom: 10 }}>El stock inicial se carga desde <strong>Inventario → Registrar movimiento</strong>, para que quede en el kardex.</div>}
          <div style={{ marginBottom: 18 }}>
            <label style={lbl}>Foto</label>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              {form.img && <img src={form.img} alt="" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, border: `1px solid ${C.border}` }} />}
              <button onClick={() => imgRef.current?.click()} style={mkBtn("ghost")}>📁 {form.img ? "Cambiar foto" : "Subir foto"}</button>
              <input ref={imgRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onFoto} />
              {form.img && <button onClick={() => { setArchivo(null); setForm({ ...form, img: null }); }} aria-label="Quitar foto" style={{ ...mkBtn("danger"), padding: "7px 10px" }}>✕</button>}
            </div>
          </div>
          {err && <div style={{ color: C.red, fontSize: 13, marginBottom: 10 }}>{err}</div>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={() => setModal(null)} disabled={guardando} style={mkBtn("ghost")}>Cancelar</button>
            <button onClick={doSave} disabled={guardando} style={{ ...mkBtn("primary"), opacity: guardando ? 0.6 : 1 }}>{guardando ? "Guardando…" : "Guardar producto"}</button>
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <Modal title="Eliminar producto" onClose={() => setDeleteTarget(null)} width={420}>
          <div style={{ fontSize: 13, color: C.textMid, marginBottom: 16 }}>
            ¿Eliminar <strong style={{ color: C.text }}>{deleteTarget.name}</strong>? Dejará de aparecer en el catálogo y el punto de venta. Su historial de ventas y movimientos se conserva.
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={() => setDeleteTarget(null)} style={mkBtn("ghost")}>Cancelar</button>
            <button onClick={doDelete} disabled={guardando} style={mkBtn("danger")}>{guardando ? "Eliminando…" : "Eliminar"}</button>
          </div>
        </Modal>
      )}

      {deleteCategoryTarget && (
        <Modal title="Eliminar categoría" onClose={() => setDeleteCategoryTarget(null)} width={420}>
          <div style={{ fontSize: 13, color: C.textMid, marginBottom: 16 }}>
            La categoría <strong style={{ color: C.text }}>{deleteCategoryTarget.name}</strong> se eliminará y sus productos pasarán a "Sin categoría".
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={() => setDeleteCategoryTarget(null)} style={mkBtn("ghost")}>Cancelar</button>
            <button onClick={deleteCategory} disabled={guardando} style={mkBtn("danger")}>Eliminar categoría</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
