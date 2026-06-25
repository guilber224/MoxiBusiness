import { useState } from "react";
import toast from "react-hot-toast";
import { inventarioService } from "../services/inventarioService.js";
import { movimientosService } from "../services/movimientosService.js";
import { isSupabaseUUID } from "../utils/storageScope.js";
import { n, today, fDate } from "../utils/businessLogic.js";
import { generateId } from "../empresaScope.js";
import { Bs } from "../currency.js";
import { C } from "../theme.jsx";
import { card, mkBtn, mkBadge, lbl, inp, row } from "../styles.js";
import { DEFAULT_CATEGORIES, getCategoryName } from "../categories.js";
import { Header } from "./ui/Header.jsx";
import { Modal } from "./ui/Modal.jsx";
import { SearchInput } from "./ui/SearchInput.jsx";
import { KPI } from "./ui/KPI.jsx";
import { Table } from "./ui/Table.jsx";
import { Chip } from "./ui/Chip.jsx";

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  INVENTARIO                                                         ║
// ╚══════════════════════════════════════════════════════════════════════╝
export function Inventario({ D, save, user }) {
  const { products, inventory, movements, categories } = D;
  const [modal,setModal]=useState(false); const [filter,setFilter]=useState("all"); const [q,setQ]=useState("");
  const [form,setForm]=useState({productId:"",type:"entrada",qty:"",cost:"",notes:"",date:today()});
  const categoryOptions = categories.length ? categories : DEFAULT_CATEGORIES;
  const getStock=id=>(inventory.find(i=>i.productId===id)||{}).stock||0;
  const level=(stock,min)=>{ if(min<=0)return"ok"; if(stock===0)return"empty"; if(stock<=min)return"low"; return"ok"; };
  const allRows=products.map(p=>({...p,stock:getStock(p.id),level:level(getStock(p.id),p.minStock)}));
  const rows=allRows.filter(p=>(filter==="all"||p.level===filter)&&(!q||p.name.toLowerCase().includes(q.toLowerCase())));
  const totalVal=products.reduce((a,p)=>a+getStock(p.id)*p.price,0);
  const lowC=allRows.filter(p=>p.level==="low").length;
  const emptyC=allRows.filter(p=>p.level==="empty").length;
  const alertProds=allRows.filter(p=>p.level!=="ok");

  const doMove=async()=>{
    if(!form.productId||!form.qty)return;
    const qty=n(form.qty);
    let newInv=[...inventory];
    const idx=newInv.findIndex(i=>i.productId===form.productId);
    if(form.type==="ajuste"){
      if(idx>=0)newInv[idx]={...newInv[idx],stock:qty};
      else newInv.push({id:generateId(),productId:form.productId,stock:qty});
    } else if(form.type==="entrada"){
      if(idx>=0)newInv[idx]={...newInv[idx],stock:newInv[idx].stock+qty};
      else newInv.push({id:generateId(),productId:form.productId,stock:qty});
    } else {
      if(idx>=0)newInv[idx]={...newInv[idx],stock:Math.max(0,newInv[idx].stock-qty)};
    }
    // Sync each changed inventory item to Supabase directly, esperando confirmación antes de aplicar localmente
    const changedItems = newInv.filter(item => {
      const prev = inventory.find(i => i.productId === item.productId);
      return !prev || prev.stock !== item.stock;
    });
    const upsertResults = await Promise.all(
      changedItems.map(item => inventarioService.upsertStock(item, user?.empresa_id).catch(e => { console.error("[Inventario] upsertStock:", e.message); return { _localOnly: true }; }))
    );
    if (upsertResults.some(r => r?._localOnly) && isSupabaseUUID(user?.empresa_id)) {
      toast.error("⚠ Error Supabase al ajustar el stock. No se guardó — revisa tu conexión e intenta de nuevo.");
      return;
    }
    const movimiento = {id:generateId(),...form,qty,cost:n(form.cost)||0,createdAt:new Date().toISOString(),usuario_id:user?.id};
    const movRes = await movimientosService.createMovimiento(movimiento, user?.empresa_id).catch(e => { console.error("[Inventario] createMovimiento:", e.message); return { _localOnly: true }; });
    if (movRes?._localOnly && isSupabaseUUID(user?.empresa_id)) {
      toast.error("⚠ El stock se guardó, pero no se pudo registrar el movimiento en Supabase. Revisa tu conexión.");
    }
    save("inventory",newInv);
    save("movements",[movimiento,...movements]);
    setModal(false); setForm({productId:"",type:"entrada",qty:"",cost:"",notes:"",date:today()});
  };

  const levelBadge={ok:"green",low:"amber",empty:"red"};
  const levelLabel={ok:"Disponible",low:"Stock bajo",empty:"Agotado"};
  const mvColor={entrada:C.green,salida:C.red,ajuste:C.blue};
  const mvLabel={entrada:"↑ Entrada",salida:"↓ Salida",ajuste:"✏ Ajuste"};

  return (
    <div>
      <Header title="Inventario" sub="Control de stock en tiempo real" action={<button onClick={()=>setModal(true)} style={mkBtn("primary")}>↕ Registrar movimiento</button>}/>

      {/* Alertas de stock */}
      {alertProds.length>0&&(
        <div style={{...card({marginBottom:14,borderLeft:`3px solid ${emptyC>0?C.red:C.amber}`}),background:emptyC>0?C.redBg:C.amberBg}}>
          <div style={{fontWeight:600,fontSize:13,marginBottom:6,color:emptyC>0?C.red:C.amber}}>
            {emptyC>0?`⚠ ${emptyC} producto${emptyC!==1?"s":""} agotado${emptyC!==1?"s":""}`:`⚠ ${lowC} producto${lowC!==1?"s":""} con stock bajo`}
          </div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {alertProds.map(p=>(
              <span key={p.id} style={{padding:"2px 8px",borderRadius:4,background:"rgba(0,0,0,0.07)",fontSize:11,color:p.level==="empty"?C.red:C.amber,fontWeight:500}}>
                {p.name}: {getStock(p.id)} {p.unit}
              </span>
            ))}
          </div>
        </div>
      )}

      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:14}}>
        <KPI label="Valor total en stock" value={Bs(totalVal)} Icon="🗃️" color={C.blue}/>
        <KPI label="Stock bajo" value={lowC} Icon="⚠️" color={C.amber}/>
        <KPI label="Agotados" value={emptyC} Icon="🚫" color={C.red}/>
      </div>
      <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
        <SearchInput value={q} onChange={setQ} placeholder="Buscar producto..."/>
        <Chip value={filter} onChange={setFilter} options={[["all","Todos"],["ok","Disponible"],["low","Stock bajo"],["empty","Agotados"]]}/>
      </div>
      <div style={card()}>
        <Table cols={[
          {key:"name",label:"Producto",style:{fontWeight:500}},
          {key:"cat",label:"Categoría",render:value=>getCategoryName(categoryOptions,value)},
          {key:"stock",label:"Stock",render:(v,row)=><strong style={{color:v===0?C.red:v<=row.minStock&&row.minStock>0?C.amber:C.green}}>{v} <span style={{fontWeight:400,fontSize:11,color:C.textFaint}}>{row.unit}</span></strong>},
          {key:"price",label:"Precio unit.",render:value=>Bs(value)},
          {key:"stock",label:"Valor",render:(v,row)=><span style={{fontWeight:700,color:C.blue}}>{Bs(v*row.price)}</span>},
          {key:"minStock",label:"Mínimo",render:(v,row)=>`${v} ${row.unit}`},
          {key:"level",label:"Estado",render:v=><span style={mkBadge(levelBadge[v])}>{levelLabel[v]}</span>},
        ]} rows={rows}/>
      </div>
      {movements.length>0&&<div style={{...card(),marginTop:14}}>
        <div style={{fontWeight:700,fontSize:13,marginBottom:10}}>Kardex — Últimos 30 movimientos</div>
        <Table cols={[
          {key:"date",label:"Fecha",render:v=>fDate(v)},
          {key:"type",label:"Tipo",render:v=><span style={{...mkBadge("default"),color:mvColor[v]||C.text,background:mvColor[v]+"18"}}>{mvLabel[v]||v}</span>},
          {key:"productId",label:"Producto",render:v=>products.find(p=>p.id===v)?.name||"—"},
          {key:"qty",label:"Cantidad",render:(v,row)=>{ const p=products.find(x=>x.id===row.productId); const sign=row.type==="salida"?"-":row.type==="ajuste"?"=":"+"; return <span style={{fontWeight:600,color:mvColor[row.type]||C.text}}>{sign}{v} {p?.unit}</span>; }},
          {key:"cost",label:"Costo unit.",render:v=>v>0?Bs(v):"—"},
          {key:"notes",label:"Notas",render:v=>v||"—"},
        ]} rows={movements.slice(0,30)}/>
      </div>}

      {modal&&<Modal title="Registrar movimiento de inventario" onClose={()=>setModal(false)}>
        <div style={{marginBottom:12}}>
          <label style={lbl}>Tipo de movimiento</label>
          <div style={{display:"flex",gap:6}}>
            {[["entrada","↑ Entrada","success"],["salida","↓ Salida","danger"],["ajuste","✏ Ajuste","ghost"]].map(([v,l,c])=>(
              <button key={v} onClick={()=>setForm({...form,type:v})} style={{...mkBtn(form.type===v?(v==="entrada"?"success":v==="salida"?"danger":"primary"):"ghost"),flex:1,justifyContent:"center",fontSize:12}}>{l}</button>
            ))}
          </div>
          {form.type==="ajuste"&&<div style={{fontSize:11,color:C.textFaint,marginTop:5}}>Ajuste: establece el stock exacto (corrección tras conteo físico).</div>}
        </div>
        <div style={{marginBottom:10}}><label style={lbl}>Producto *</label>
          <select style={inp} value={form.productId} onChange={e=>setForm({...form,productId:e.target.value})}>
            <option value="">Seleccionar producto...</option>
            {categoryOptions.map(cat=>(
              <optgroup key={cat.id} label={cat.name}>{products.filter(p=>p.cat===cat.id).map(p=><option key={p.id} value={p.id}>{p.name} — Stock: {getStock(p.id)} {p.unit}</option>)}</optgroup>
            ))}
          </select>
        </div>
        <div style={row()}>
          <div style={{flex:1}}><label style={lbl}>{form.type==="ajuste"?"Stock final *":"Cantidad *"}</label><input type="number" min="0" step="0.1" style={inp} value={form.qty} onChange={e=>setForm({...form,qty:e.target.value})} placeholder="0" autoFocus/></div>
          <div style={{flex:1}}><label style={lbl}>Costo unit. (Bs.)</label><input type="number" min="0" step="0.5" style={inp} value={form.cost} onChange={e=>setForm({...form,cost:e.target.value})} placeholder="0.00"/></div>
        </div>
        <div style={row()}>
          <div style={{flex:1}}><label style={lbl}>Fecha</label><input type="date" style={inp} value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></div>
          <div style={{flex:2}}><label style={lbl}>Notas</label><input style={inp} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Razón del movimiento..."/></div>
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:4}}>
          <button onClick={()=>setModal(false)} style={mkBtn("ghost")}>Cancelar</button>
          <button onClick={doMove} style={mkBtn("primary")}>Registrar movimiento</button>
        </div>
      </Modal>}
    </div>
  );
}
