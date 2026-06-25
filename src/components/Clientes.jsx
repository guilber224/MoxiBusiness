import { useState } from "react";
import toast from "react-hot-toast";
import { clientesService } from "../services/clientesService.js";
import { isSupabaseUUID } from "../utils/storageScope.js";
import { fDate } from "../utils/businessLogic.js";
import { xlsx } from "../utils/xlsxExport.js";
import { generateId } from "../empresaScope.js";
import { Bs } from "../currency.js";
import { C, R } from "../theme.jsx";
import { card, mkBtn, mkBadge, lbl, inp, row } from "../styles.js";
import { Header } from "./ui/Header.jsx";
import { Empty } from "./ui/Empty.jsx";
import { Modal } from "./ui/Modal.jsx";
import { Table } from "./ui/Table.jsx";
import { SearchInput } from "./ui/SearchInput.jsx";
import { KPI } from "./ui/KPI.jsx";

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  CLIENTES                                                           ║
// ╚══════════════════════════════════════════════════════════════════════╝
export function Clientes({ D, save, user }) {
  const { customers, sales } = D;
  const [q,setQ]=useState(""); const [modal,setModal]=useState(null); const [detail,setDetail]=useState(null);
  const [form,setForm]=useState({name:"",phone:"",address:"",market:"",ci:"",notes:""});
  const [confirmDel,setConfirmDel]=useState(null);
  const [err,setErr]=useState("");

  const filtered=customers.filter(c=>`${c.name} ${c.market}`.toLowerCase().includes(q.toLowerCase()));
  const openForm=(c=null)=>{ setErr(""); setForm(c?{...c}:{name:"",phone:"",address:"",market:"",ci:"",notes:""}); setModal(c||"new"); };
  const doSave = async () => {
    if (!form.name.trim()) return;
    setErr("");
    if (modal === "new") {
      const cliente = { ...form, id: generateId(), createdAt: new Date().toISOString() };
      const saved = await clientesService.createCliente(cliente, user?.empresa_id);
      if (saved?._localOnly && isSupabaseUUID(user?.empresa_id)) {
        setErr("⚠ Error al guardar en Supabase. Revisa la consola (F12).");
        return;
      }
      save("customers", [...customers, cliente]);
    } else {
      const updated = { ...modal, ...form };
      const saved = await clientesService.updateCliente(updated, user?.empresa_id).catch(e => { console.error("[Clientes] update:", e.message); return null; });
      if (saved?._localOnly && isSupabaseUUID(user?.empresa_id)) {
        setErr("⚠ Error al actualizar en Supabase. No se guardó — revisa tu conexión e intenta de nuevo.");
        return;
      }
      save("customers", customers.map(c => c.id === modal.id ? { ...c, ...form } : c));
    }
    setModal(null);
  };
  const doDelete = async (id) => {
    const res = await clientesService.deleteCliente(id, user?.empresa_id).catch(e => { console.error("[Clientes] delete:", e.message); return { ok: false, error: e.message }; });
    if (res?.ok === false) {
      toast.error("⚠ No se pudo eliminar en Supabase. Revisa tu conexión e intenta de nuevo.");
      setConfirmDel(null);
      return;
    }
    save("customers", customers.filter(c => c.id !== id));
    setConfirmDel(null); setDetail(null);
  };

  const exportXLS=async()=>{
    await xlsx([{name:"Clientes",data:customers.map(c=>{
      const debt=sales.filter(s=>s.customerId===c.id).reduce((a,s)=>a+s.debt,0);
      const total=sales.filter(s=>s.customerId===c.id).reduce((a,s)=>a+s.total,0);
      return{Nombre:c.name,Teléfono:c.phone,Dirección:c.address,Mercado:c.market,"CI/NIT":c.ci,"Total Comprado(Bs)":total.toFixed(2),"Deuda(Bs)":debt.toFixed(2),Notas:c.notes};
    })}],"clientes_moxi_business.xlsx");
  };

  if(detail){
    const c=customers.find(x=>x.id===detail)||{};
    const cSales=sales.filter(s=>s.customerId===c.id).sort((a,b)=>new Date(b.date)-new Date(a.date));
    const debt=cSales.reduce((a,s)=>a+s.debt,0);
    const total=cSales.reduce((a,s)=>a+s.total,0);
    return (
      <div>
        <button onClick={()=>setDetail(null)} style={{...mkBtn("ghost"),marginBottom:16}}>← Volver</button>
        <div style={{...card(),marginBottom:12}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14,gap:12,flexWrap:"wrap"}}>
            <div style={{display:"flex",gap:12,alignItems:"center"}}>
              <div style={{width:50,height:50,background:`linear-gradient(135deg,${C.red},#7F1D1D)`,borderRadius:14,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,color:"white",fontWeight:700}}>{c.name?.[0]}</div>
              <div><div style={{fontSize:19,fontWeight:700,letterSpacing:"-0.03em"}}>{c.name}</div><div style={{fontSize:13,color:C.textMid}}>{c.market}</div></div>
            </div>
            <div style={{display:"flex",gap:6}}>
              <button onClick={()=>{openForm(c);setDetail(null);}} style={mkBtn("ghost")}>✏️ Editar</button>
              <button onClick={()=>setConfirmDel(c.id)} style={mkBtn("danger")}>🗑️ Eliminar</button>
            </div>
          </div>
          {confirmDel===c.id&&<div style={{background:C.redBg,border:`1px solid ${C.redMid}`,borderRadius:R.md,padding:"10px 14px",display:"flex",gap:10,alignItems:"center",marginBottom:12}}>
            <span style={{fontSize:13,color:C.red,flex:1}}>¿Eliminar a <strong>{c.name}</strong>? Esta acción no se puede deshacer.</span>
            <button onClick={()=>doDelete(c.id)} style={mkBtn("danger")}>Confirmar</button>
            <button onClick={()=>setConfirmDel(null)} style={mkBtn("ghost")}>Cancelar</button>
          </div>}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
            {[["Teléfono",c.phone||"—"],["CI / NIT",c.ci||"—"],["Dirección",c.address||"—"]].map(([k,v])=>(
              <div key={k}><div style={lbl}>{k}</div><div style={{fontSize:13}}>{v}</div></div>
            ))}
          </div>
          {c.notes&&<div style={{marginTop:10,fontSize:13,color:C.textMid,fontStyle:"italic"}}>{c.notes}</div>}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:12}}>
          <KPI label="Compras" value={cSales.length} color={C.blue}/>
          <KPI label="Total comprado" value={Bs(total)} color={C.red}/>
          <KPI label="Deuda actual" value={Bs(debt)} color={debt>0?C.amber:C.green}/>
        </div>
        <div style={card()}>
          <div style={{fontWeight:700,fontSize:13,marginBottom:12}}>Historial de compras</div>
          {cSales.length===0?<Empty icon="🛒" title="Sin compras" sub="Este cliente no tiene compras registradas"/>:
            <Table cols={[
              {key:"date",label:"Fecha",render:v=>fDate(v)},
              {key:"total",label:"Total",render:v=><strong style={{color:C.red}}>{Bs(v)}</strong>},
              {key:"paid",label:"Pagado",render:v=><span style={{color:C.green}}>{Bs(v)}</span>},
              {key:"debt",label:"Deuda",render:v=><span style={{color:v>0?C.amber:C.green}}>{Bs(v)}</span>},
              {key:"debt",label:"Estado",render:v=><span style={mkBadge(v>0?"amber":"green")}>{v>0?"Pendiente":"Saldado"}</span>},
            ]} rows={cSales}/>}
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header title="Clientes" sub={`${customers.length} clientes registrados`} action={<>
        <button onClick={exportXLS} style={mkBtn("ghost")}>⬇️ Exportar Excel</button>
        <button onClick={()=>openForm()} style={mkBtn("primary")}>+ Nuevo cliente</button>
      </>}/>
      <div style={{display:"flex",gap:8,marginBottom:14}}>
        <SearchInput value={q} onChange={setQ} placeholder="Buscar por nombre o mercado..."/>
      </div>
      {filtered.length===0?<Empty icon="👥" title="Sin clientes" sub={q?"Sin resultados":"Agrega tu primer cliente"} action={!q&&<button onClick={()=>openForm()} style={mkBtn("primary")}>+ Agregar cliente</button>}/>:
        filtered.map(c=>{
          const debt=sales.filter(s=>s.customerId===c.id).reduce((a,s)=>a+s.debt,0);
          const cnt=sales.filter(s=>s.customerId===c.id).length;
          return (
            <div key={c.id} onClick={()=>setDetail(c.id)} style={{...card(),cursor:"pointer",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}} onMouseEnter={e=>e.currentTarget.style.borderColor=C.borderMid} onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
              <div style={{display:"flex",gap:10,alignItems:"center"}}>
                <div style={{width:40,height:40,background:`linear-gradient(135deg,${C.red},#7F1D1D)`,borderRadius:11,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,color:"white",fontWeight:700}}>{c.name[0]}</div>
                <div><div style={{fontWeight:600,fontSize:14}}>{c.name}</div><div style={{fontSize:12,color:C.textMid}}>{c.market}{c.phone?` · ${c.phone}`:""}</div></div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:12,color:C.textFaint,marginBottom:4}}>{cnt} compra{cnt!==1?"s":""}</div>
                {debt>0?<span style={mkBadge("red")}>{Bs(debt)}</span>:cnt>0?<span style={mkBadge("green")}>Al día</span>:null}
              </div>
            </div>
          );
        })}
      {modal&&<Modal title={modal==="new"?"Nuevo cliente":"Editar cliente"} onClose={()=>setModal(null)}>
        <div style={row()}>
          <div style={{flex:1}}><label style={lbl}>Nombre *</label><input style={inp} value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Nombre completo" autoFocus/></div>
          <div style={{flex:1}}><label style={lbl}>CI / NIT</label><input style={inp} value={form.ci} onChange={e=>setForm({...form,ci:e.target.value})} placeholder="Número"/></div>
        </div>
        <div style={row()}>
          <div style={{flex:1}}><label style={lbl}>Teléfono</label><input style={inp} value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="70000000"/></div>
          <div style={{flex:1}}><label style={lbl}>Mercado / Empresa</label><input style={inp} value={form.market} onChange={e=>setForm({...form,market:e.target.value})} placeholder="Mercado Los Pozos"/></div>
        </div>
        <div style={{marginBottom:10}}><label style={lbl}>Dirección</label><input style={inp} value={form.address} onChange={e=>setForm({...form,address:e.target.value})} placeholder="Dirección del cliente"/></div>
        <div style={{marginBottom:18}}><label style={lbl}>Notas</label><input style={inp} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Observaciones adicionales"/></div>
        {err&&<div style={{color:"#F87171",fontSize:13,marginBottom:10}}>{err}</div>}
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <button onClick={()=>setModal(null)} style={mkBtn("ghost")}>Cancelar</button>
          <button onClick={doSave} style={mkBtn("primary")}>Guardar cliente</button>
        </div>
      </Modal>}
    </div>
  );
}
