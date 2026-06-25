import { useState, useRef, useEffect } from "react";
import { Bell, CheckCircle, CreditCard, AlertTriangle } from "lucide-react";
import { C, FONT } from "../theme.jsx";
import { mkBtn, mkBadge } from "../styles.js";

export function NotificacionesDropdown({ debtClients, lowStock, setTab }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const total = (debtClients?.length || 0) + (lowStock?.length || 0);

  useEffect(() => {
    const handle = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(v => !v)} title="Notificaciones"
        style={{ width:36,height:36,borderRadius:10,border:"1px solid var(--color-border)",background:open?"var(--color-border)":"var(--color-bg-primary)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",position:"relative",transition:"background 0.15s" }}
        onMouseEnter={e=>{ if(!open) e.currentTarget.style.background="var(--color-border)"; }}
        onMouseLeave={e=>{ if(!open) e.currentTarget.style.background="var(--color-bg-primary)"; }}
      >
        <Bell size={17} strokeWidth={1.8} color="var(--color-text-mid)" />
        {total > 0 && <span style={{ position:"absolute",top:5,right:5,width:8,height:8,borderRadius:"50%",background:C.danger,border:"1.5px solid var(--color-bg-surface)" }} />}
      </button>
      {open && (
        <div style={{ position:"absolute",top:"calc(100% + 8px)",right:0,width:300,background:"var(--color-bg-surface)",border:"1px solid var(--color-border)",borderRadius:14,boxShadow:"0 8px 32px rgba(0,0,0,0.14)",zIndex:500,overflow:"hidden" }}>
          <div style={{ padding:"14px 16px 10px",fontWeight:700,fontSize:13,borderBottom:"1px solid var(--color-border)",display:"flex",justifyContent:"space-between",alignItems:"center" }}>
            Notificaciones
            {total > 0 && <span style={{ ...mkBadge("red"),fontSize:10 }}>{total}</span>}
          </div>
          <div style={{ maxHeight:320,overflowY:"auto" }}>
            {total === 0 ? (
              <div style={{ padding:"24px 16px",textAlign:"center",fontSize:12,color:"var(--color-text-faint)" }}>
                <CheckCircle size={28} color={C.green} style={{ display:"block",margin:"0 auto 8px" }} />
                Todo en orden
              </div>
            ) : (
              <>
                {(debtClients?.length > 0) && (
                  <div>
                    <div style={{ padding:"8px 16px 4px",fontSize:10,fontWeight:700,color:"var(--color-text-faint)",letterSpacing:"0.08em",textTransform:"uppercase" }}>Deudas pendientes</div>
                    {debtClients.slice(0,5).map(c=>(
                      <button key={c.id} onClick={()=>{ setTab("deudas"); setOpen(false); }}
                        style={{ width:"100%",display:"flex",alignItems:"center",gap:10,padding:"8px 16px",background:"none",border:"none",cursor:"pointer",textAlign:"left",transition:"background 0.12s",fontFamily:FONT }}
                        onMouseEnter={e=>e.currentTarget.style.background="var(--color-bg-primary)"}
                        onMouseLeave={e=>e.currentTarget.style.background="none"}
                      >
                        <div style={{ width:28,height:28,borderRadius:8,background:C.danger+"18",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                          <CreditCard size={13} color={C.danger} />
                        </div>
                        <div>
                          <div style={{ fontSize:12,fontWeight:600,color:"var(--color-text)" }}>{c.name}</div>
                          <div style={{ fontSize:11,color:"var(--color-text-faint)" }}>Deuda pendiente</div>
                        </div>
                      </button>
                    ))}
                    {debtClients.length > 5 && <div style={{ padding:"4px 16px 8px",fontSize:11,color:"var(--color-text-faint)" }}>+{debtClients.length-5} más</div>}
                  </div>
                )}
                {(lowStock?.length > 0) && (
                  <div>
                    <div style={{ padding:"8px 16px 4px",fontSize:10,fontWeight:700,color:"var(--color-text-faint)",letterSpacing:"0.08em",textTransform:"uppercase" }}>Stock bajo</div>
                    {lowStock.slice(0,4).map(p=>(
                      <button key={p.id} onClick={()=>{ setTab("inventario"); setOpen(false); }}
                        style={{ width:"100%",display:"flex",alignItems:"center",gap:10,padding:"8px 16px",background:"none",border:"none",cursor:"pointer",textAlign:"left",transition:"background 0.12s",fontFamily:FONT }}
                        onMouseEnter={e=>e.currentTarget.style.background="var(--color-bg-primary)"}
                        onMouseLeave={e=>e.currentTarget.style.background="none"}
                      >
                        <div style={{ width:28,height:28,borderRadius:8,background:C.amber+"18",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                          <AlertTriangle size={13} color={C.amber} />
                        </div>
                        <div>
                          <div style={{ fontSize:12,fontWeight:600,color:"var(--color-text)" }}>{p.name}</div>
                          <div style={{ fontSize:11,color:"var(--color-text-faint)" }}>Stock bajo</div>
                        </div>
                      </button>
                    ))}
                    {lowStock.length > 4 && <div style={{ padding:"4px 16px 8px",fontSize:11,color:"var(--color-text-faint)" }}>+{lowStock.length-4} más</div>}
                  </div>
                )}
              </>
            )}
          </div>
          {total > 0 && (
            <div style={{ padding:"8px 16px",borderTop:"1px solid var(--color-border)" }}>
              <button onClick={()=>{ setTab("analisis"); setOpen(false); }} style={{ ...mkBtn("ghost"),width:"100%",justifyContent:"center",fontSize:12 }}>Ver resumen completo →</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
