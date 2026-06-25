import { useState, useRef } from "react";
import toast from "react-hot-toast";
import { productosService } from "../services/productosService.js";
import { isSupabaseUUID } from "../utils/storageScope.js";
import { n, uid } from "../utils/businessLogic.js";
import { generateId } from "../empresaScope.js";
import { Bs } from "../currency.js";
import { BRAND_NAME, C } from "../theme.jsx";
import { card, mkBtn, lbl, inp, row } from "../styles.js";
import { DEFAULT_CATEGORIES, DEFAULT_CATEGORY_ID, getCategoryName, slugifyId } from "../categories.js";
import { Header } from "./ui/Header.jsx";
import { Empty } from "./ui/Empty.jsx";
import { Modal } from "./ui/Modal.jsx";
import { SearchInput } from "./ui/SearchInput.jsx";

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  PRODUCTOS                                                          ║
// ╚══════════════════════════════════════════════════════════════════════╝
export function Productos({ D, save, user }) {
  const { products, categories } = D;
  const categoryOptions = categories.length ? categories : DEFAULT_CATEGORIES;
  const firstCategoryId = categoryOptions.find(category => category.id !== DEFAULT_CATEGORY_ID)?.id || DEFAULT_CATEGORY_ID;
  const emptyForm = { name: "", cat: firstCategoryId, unit: "bolsa", price: "", minStock: "", desc: "", img: null };
  const [q,setQ]=useState("");
  const [cat,setCat]=useState("all");
  const [modal,setModal]=useState(null);
  const [categoryName,setCategoryName]=useState("");
  const [categoryErr,setCategoryErr]=useState("");
  const [deleteCategoryTarget,setDeleteCategoryTarget]=useState(null);
  const [form,setForm]=useState(emptyForm);
  const [prodErr,setProdErr]=useState("");
  const imgRef=useRef();
  const cats=["all",...categoryOptions.map(category => category.id)];
  const filtered=products.filter(p=>(cat==="all"||p.cat===cat)&&p.name.toLowerCase().includes(q.toLowerCase()));
  const openForm=(product=null)=>{
    setProdErr("");
    setForm(product ? { ...product } : { ...emptyForm, cat: firstCategoryId });
    setModal(product||"new");
  };
  // POS rapido: agrega tarjetas e imagenes sin alterar la logica base del carrito y la venta.
  const doSave = async () => {
    if (!form.name.trim()) return;
    setProdErr("");
    const nextProduct = { ...form, price:n(form.price), minStock:n(form.minStock), cat:form.cat||DEFAULT_CATEGORY_ID };
    if (modal === "new") {
      const producto = { ...nextProduct, id: generateId(), empresa_id: user?.empresa_id };
      const saved = await productosService.upsertProducto(producto);
      if (saved?._localOnly && isSupabaseUUID(user?.empresa_id)) {
        setProdErr("⚠ Error al guardar en Supabase. Revisa la consola (F12).");
        return;
      }
      save("products", [...products, { ...nextProduct, id: producto.id }]);
    } else {
      const producto = { ...products.find(p => p.id === modal.id), ...nextProduct, empresa_id: user?.empresa_id };
      const saved = await productosService.upsertProducto(producto).catch(e => { console.error("[Productos] update:", e.message); return null; });
      if (saved?._localOnly && isSupabaseUUID(user?.empresa_id)) {
        setProdErr("⚠ Error al actualizar en Supabase. No se guardó — revisa tu conexión e intenta de nuevo.");
        return;
      }
      save("products", products.map(p => p.id === modal.id ? { ...p, ...nextProduct } : p));
    }
    setModal(null);
  };
  const doDeleteProduct = async (id) => {
    const res = await productosService.deleteProducto(id, user?.empresa_id).catch(e => { console.error("[Productos] delete:", e.message); return { ok: false, error: e.message }; });
    if (res?.ok === false) {
      toast.error("⚠ No se pudo eliminar en Supabase. Revisa tu conexión e intenta de nuevo.");
      return;
    }
    save("products", products.filter(item => item.id !== id));
  };
  const handleImg=e=>{ const file=e.target.files[0]; if(!file)return; const reader=new FileReader(); reader.onload=event=>setForm(current=>({...current,img:event.target.result})); reader.readAsDataURL(file); };
  const addCategory = () => {
    const name = categoryName.trim();
    if (!name) {
      setCategoryErr("Escribe un nombre para la categoría");
      return;
    }
    if (categoryOptions.some(category => category.name.toLowerCase() === name.toLowerCase())) {
      setCategoryErr("Esa categoría ya existe");
      return;
    }
    let id = slugifyId(name) || `categoria_${uid()}`;
    while (categoryOptions.some(category => category.id === id)) {
      id = `${id}_${uid().slice(0, 3)}`;
    }
    save("categories", [...categoryOptions, { id, name, locked: false }]);
    setCategoryName("");
    setCategoryErr("");
  };
  const deleteCategory = () => {
    if (!deleteCategoryTarget) return;
    const nextProducts = products.map(product => product.cat === deleteCategoryTarget.id ? { ...product, cat: DEFAULT_CATEGORY_ID } : product);
    save("products", nextProducts);
    save("categories", categoryOptions.filter(category => category.id !== deleteCategoryTarget.id));
    if (cat === deleteCategoryTarget.id) setCat("all");
    if (form.cat === deleteCategoryTarget.id) setForm(current => ({ ...current, cat: DEFAULT_CATEGORY_ID }));
    setDeleteCategoryTarget(null);
  };

  return (
    <div>
      <Header title="Productos" sub={`Catálogo profesional de ${BRAND_NAME}`} action={<button onClick={()=>openForm()} style={mkBtn("primary")}>+ Nuevo producto</button>}/>
      <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
        <SearchInput value={q} onChange={setQ} placeholder="Buscar producto..."/>
        <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
          {cats.map(categoryId => (
            <button key={categoryId} onClick={()=>setCat(categoryId)} style={{...mkBtn(cat===categoryId?"primary":"subtle"),fontSize:12,padding:"6px 11px"}}>
              {categoryId==="all" ? "Todos" : getCategoryName(categoryOptions, categoryId)}
            </button>
          ))}
        </div>
      </div>

      <div style={{...card(),marginBottom:14}}>
        <div style={{fontWeight:700,fontSize:13,marginBottom:10}}>Categorías editables</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>
          <input style={{...inp,flex:"1 1 240px"}} value={categoryName} onChange={e=>setCategoryName(e.target.value)} placeholder="Nueva categoría" />
          <button onClick={addCategory} style={mkBtn("primary")}>+ Agregar categoría</button>
        </div>
        {categoryErr && <div style={{fontSize:12,color:C.red,marginBottom:10}}>{categoryErr}</div>}
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {categoryOptions.map(category => (
            <div key={category.id} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 10px",borderRadius:20,background:C.bg,border:`1px solid ${C.border}`}}>
              <span style={{fontSize:12,fontWeight:600}}>{category.name}</span>
              {!category.locked && (
                <button onClick={()=>setDeleteCategoryTarget(category)} style={{background:"none",border:"none",cursor:"pointer",color:C.red,padding:0,fontSize:14,lineHeight:1}}>×</button>
              )}
            </div>
          ))}
        </div>
        <div style={{fontSize:12,color:C.textFaint,marginTop:10}}>
          Si eliminas una categoría, sus productos pasarán automáticamente a "Sin categoría".
        </div>
      </div>

      {filtered.length===0?<Empty icon="📦" title="Sin productos" sub="No hay productos con estos filtros"/>:
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))",gap:10}}>
          {filtered.map(product=>(
            <div key={product.id} style={{...card({padding:0,overflow:"hidden"})}}>
              <div style={{height:100,background:product.img?"none":`linear-gradient(135deg,${C.redBg},${C.amberBg})`,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",borderBottom:`1px solid ${C.border}`}}>
                {product.img?<img src={product.img} alt={product.name} style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<span style={{fontSize:38}}>🌶️</span>}
              </div>
              <div style={{padding:"10px 12px"}}>
                <div style={{fontSize:11,color:C.textFaint,marginBottom:2}}>{getCategoryName(categoryOptions, product.cat)}</div>
                <div style={{fontWeight:700,fontSize:13,marginBottom:6,lineHeight:1.3}}>{product.name}</div>
                <div style={{fontSize:16,fontWeight:800,color:C.red,letterSpacing:"-0.03em"}}>{Bs(product.price)}<span style={{fontSize:10,fontWeight:400,color:C.textFaint}}>/{product.unit}</span></div>
                {product.minStock>0&&<div style={{fontSize:11,color:C.textFaint,marginTop:2}}>Mín: {product.minStock} {product.unit}</div>}
                <div style={{display:"flex",gap:4,marginTop:8}}>
                  <button onClick={()=>openForm(product)} style={{...mkBtn("ghost"),padding:"4px 8px",flex:1,justifyContent:"center",fontSize:11}}>✏️</button>
                  <button onClick={()=>doDeleteProduct(product.id)} style={{...mkBtn("danger"),padding:"4px 8px",flex:1,justifyContent:"center",fontSize:11}}>🗑️</button>
                </div>
              </div>
            </div>
          ))}
        </div>}
      {modal&&<Modal title={modal==="new"?"Nuevo producto":"Editar producto"} onClose={()=>setModal(null)}>
        <div style={row()}>
          <div style={{flex:2}}><label style={lbl}>Nombre *</label><input style={inp} value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Nombre del producto" autoFocus/></div>
          <div style={{flex:1}}><label style={lbl}>Categoría</label>
            <select style={inp} value={form.cat} onChange={e=>setForm({...form,cat:e.target.value})}>
              {categoryOptions.map(category=><option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </div>
        </div>
        <div style={row()}>
          <div style={{flex:1}}><label style={lbl}>Precio (Bs.)</label><input type="number" style={inp} value={form.price} onChange={e=>setForm({...form,price:e.target.value})} placeholder="0.00"/></div>
          <div style={{flex:1}}><label style={lbl}>Unidad</label><input style={inp} value={form.unit} onChange={e=>setForm({...form,unit:e.target.value})} placeholder="bolsa, kg..."/></div>
          <div style={{flex:1}}><label style={lbl}>Stock mínimo</label><input type="number" style={inp} value={form.minStock} onChange={e=>setForm({...form,minStock:e.target.value})} placeholder="0"/></div>
        </div>
        <div style={{marginBottom:10}}><label style={lbl}>Descripción</label><input style={inp} value={form.desc} onChange={e=>setForm({...form,desc:e.target.value})} placeholder="Descripción opcional"/></div>
        <div style={{marginBottom:18}}>
          <label style={lbl}>Imagen del producto</label>
          <div style={{display:"flex",gap:10,alignItems:"center"}}>
            {form.img&&<img src={form.img} alt="" style={{width:56,height:56,objectFit:"cover",borderRadius:8,border:`1px solid ${C.border}`}}/>}
            <button onClick={()=>imgRef.current?.click()} style={mkBtn("ghost")}>📁 {form.img?"Cambiar imagen":"Subir imagen"}</button>
            <input ref={imgRef} type="file" accept="image/*" style={{display:"none"}} onChange={handleImg}/>
            {form.img&&<button onClick={()=>setForm({...form,img:null})} style={{...mkBtn("danger"),padding:"7px 10px"}}>✕</button>}
          </div>
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <button onClick={()=>setModal(null)} style={mkBtn("ghost")}>Cancelar</button>
          {prodErr&&<div style={{color:"#F87171",fontSize:13,marginBottom:10}}>{prodErr}</div>}
          <button onClick={doSave} style={mkBtn("primary")}>Guardar producto</button>
        </div>
      </Modal>}
      {deleteCategoryTarget&&<Modal title="Eliminar categoría" onClose={()=>setDeleteCategoryTarget(null)} width={420}>
        <div style={{fontSize:13,color:C.textMid,marginBottom:16}}>
          La categoría <strong style={{color:C.text}}>{deleteCategoryTarget.name}</strong> se eliminará y sus productos pasarán a "Sin categoría".
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <button onClick={()=>setDeleteCategoryTarget(null)} style={mkBtn("ghost")}>Cancelar</button>
          <button onClick={deleteCategory} style={mkBtn("danger")}>Eliminar categoría</button>
        </div>
      </Modal>}
    </div>
  );
}
