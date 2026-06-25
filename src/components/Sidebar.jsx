import { ChevronLeft, LogOut, LayoutDashboard } from "lucide-react";
import { BRAND_NAME, FONT, safeBusinessName } from "../theme.jsx";
import { useIsMobile } from "../hooks/useIsMobile.js";
import { NAV_GROUPS, NAV_ICONS, ROLES, ROLE_LABELS } from "../navConfig.js";
import { BrandLogo } from "./ui/BrandLogo.jsx";

export function Sidebar({ tab, setTab, user, onLogout, config, open, onClose, collapsed, onToggleCollapse }) {
  const isMobile = useIsMobile();
  const allowed = ROLES[user.role] || [];
  const businessName = safeBusinessName(config);
  const isCollapsed = !isMobile && collapsed;

  const handleSetTab = (id) => {
    setTab(id);
    if (isMobile && onClose) onClose();
  };

  if (isMobile && !open) return null;

  const W = isCollapsed ? 72 : 260;

  const sidebarStyle = {
    width: W, minWidth: W,
    height: "100%",
    background: "var(--color-sidebar-bg)",
    display: "flex", flexDirection: "column", flexShrink: 0,
    borderRight: "1px solid var(--color-sidebar-border)",
    transition: "width 0.22s cubic-bezier(.4,0,.2,1), min-width 0.22s cubic-bezier(.4,0,.2,1)",
    overflow: "hidden",
    zIndex: 20,
  };
  if (isMobile) {
    Object.assign(sidebarStyle, {
      position: "fixed", top: 0, left: 0, height: "100vh", zIndex: 300,
      width: 270, minWidth: 270,
      boxShadow: "4px 0 32px rgba(0,0,0,0.5)",
      transition: "transform 0.22s cubic-bezier(.4,0,.2,1)",
    });
  }

  const avatarInitial = (user.name || "U")[0].toUpperCase();

  return (
    <div style={isMobile ? {} : {height:"100%"}}>
      {isMobile && (
        <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:299,backdropFilter:"blur(3px)"}} />
      )}
      <div style={sidebarStyle}>

        {/* ── Logo + collapse toggle ── */}
        <div style={{
          padding: isCollapsed ? "18px 0" : "18px 16px 14px",
          borderBottom: "1px solid var(--color-sidebar-border)",
          display: "flex", alignItems: "center", gap: 10,
          justifyContent: isCollapsed ? "center" : "space-between",
        }}>
          {isCollapsed ? (
            <button onClick={onToggleCollapse} title="Expandir sidebar"
              style={{background:"none",border:"none",cursor:"pointer",padding:4,display:"flex",alignItems:"center",justifyContent:"center"}}>
              <BrandLogo size={34} />
            </button>
          ) : (
            <>
              <div style={{display:"flex",alignItems:"center",gap:10,minWidth:0}}>
                <BrandLogo size={36} />
                <div style={{minWidth:0}}>
                  <div style={{color:"white",fontWeight:700,fontSize:13,letterSpacing:"-0.02em",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{BRAND_NAME}</div>
                  <div style={{color:"rgba(255,255,255,0.32)",fontSize:10,marginTop:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{businessName}</div>
                </div>
              </div>
              {!isMobile && (
                <button onClick={onToggleCollapse} title="Colapsar sidebar"
                  style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.10)",cursor:"pointer",width:26,height:26,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"background 0.15s"}}
                  onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.12)"}
                  onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.06)"}
                >
                  <ChevronLeft size={14} color="rgba(255,255,255,0.6)" />
                </button>
              )}
            </>
          )}
        </div>

        {/* ── Navegación ── */}
        <nav style={{flex:1,padding: isCollapsed ? "12px 0" : "12px 10px",overflowY:"auto",overflowX:"hidden"}}>
          {NAV_GROUPS.map(g => {
            const items = g.items.filter(i => allowed.includes(i.id));
            if (!items.length) return null;
            return (
              <div key={g.label} style={{marginBottom: isCollapsed ? 4 : 18}}>
                {!isCollapsed && (
                  <div style={{fontSize:9,color:"rgba(255,255,255,0.22)",fontWeight:700,letterSpacing:"0.13em",textTransform:"uppercase",padding:"0 8px",marginBottom:4}}>
                    {g.label}
                  </div>
                )}
                {items.map(item => {
                  const active = tab === item.id;
                  const Icon = NAV_ICONS[item.id] || LayoutDashboard;
                  if (isCollapsed) {
                    return (
                      <div key={item.id} className="nav-item-wrap" style={{position:"relative",marginBottom:2}}>
                        <button onClick={() => handleSetTab(item.id)} title={item.label}
                          style={{
                            display:"flex",alignItems:"center",justifyContent:"center",width:"100%",height:40,
                            border:"none",cursor:"pointer",fontFamily:FONT,
                            background: active ? "rgba(255,255,255,0.12)" : "transparent",
                            borderLeft: active ? "3px solid white" : "3px solid transparent",
                            transition:"background 0.15s",
                          }}
                          onMouseEnter={e=>{if(!active)e.currentTarget.style.background="rgba(255,255,255,0.07)"}}
                          onMouseLeave={e=>{if(!active)e.currentTarget.style.background="transparent"}}
                        >
                          <Icon size={18} strokeWidth={1.8} color={active ? "white" : "rgba(255,255,255,0.5)"} />
                        </button>
                        <span className="nav-tooltip">{item.label}</span>
                      </div>
                    );
                  }
                  return (
                    <button key={item.id} onClick={() => handleSetTab(item.id)}
                      style={{
                        display:"flex",alignItems:"center",gap:10,width:"100%",
                        padding:"9px 10px",borderRadius:12,border:"none",
                        cursor:"pointer",fontFamily:FONT,fontSize:13.5,marginBottom:2,
                        textAlign:"left",transition:"background 0.15s",
                        background: active ? "rgba(255,255,255,0.12)" : "transparent",
                        color: active ? "white" : "rgba(255,255,255,0.58)",
                        fontWeight: active ? 600 : 400,
                        borderLeft: active ? "3px solid white" : "3px solid transparent",
                      }}
                      onMouseEnter={e=>{if(!active){e.currentTarget.style.background="rgba(255,255,255,0.07)";e.currentTarget.style.color="rgba(255,255,255,0.85)"}}}
                      onMouseLeave={e=>{if(!active){e.currentTarget.style.background="transparent";e.currentTarget.style.color="rgba(255,255,255,0.58)"}}}
                    >
                      <Icon size={18} strokeWidth={1.8} style={{flexShrink:0,opacity:active?1:0.7}} />
                      <span style={{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* ── User card + logout ── */}
        <div style={{borderTop:"1px solid var(--color-sidebar-border)",padding: isCollapsed ? "10px 0" : "10px 10px 14px"}}>
          {!isCollapsed && (
            <div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",marginBottom:4,background:"rgba(255,255,255,0.05)",borderRadius:12}}>
              <div style={{width:32,height:32,background:"linear-gradient(135deg,#22C5FE,#1E3A8A)",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,color:"white",fontWeight:700,flexShrink:0}}>
                {avatarInitial}
              </div>
              <div style={{minWidth:0,flex:1}}>
                <div style={{color:"rgba(255,255,255,0.90)",fontSize:12.5,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{user.name}</div>
                <div style={{color:"rgba(255,255,255,0.32)",fontSize:10.5}}>{ROLE_LABELS[user.role]||user.role}</div>
              </div>
            </div>
          )}
          <button onClick={onLogout} title="Cerrar sesión"
            style={{
              display:"flex",alignItems:"center",justifyContent: isCollapsed ? "center" : "flex-start",
              gap:8,width:"100%",padding: isCollapsed ? "8px 0" : "8px 10px",
              borderRadius: isCollapsed ? 0 : 10,border:"none",cursor:"pointer",
              background:"transparent",color:"rgba(255,255,255,0.30)",
              fontSize:13,fontFamily:FONT,transition:"color 0.15s, background 0.15s",
            }}
            onMouseEnter={e=>{e.currentTarget.style.background="rgba(239,68,68,0.12)";e.currentTarget.style.color="#FCA5A5"}}
            onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color="rgba(255,255,255,0.30)"}}
          >
            <LogOut size={16} strokeWidth={1.8} />
            {!isCollapsed && <span>Cerrar sesión</span>}
          </button>
        </div>
      </div>
    </div>
  );
}
