import { Home, Users, ShoppingCart, Archive, MoreHorizontal } from "lucide-react";
import { FONT } from "../theme.jsx";
import { ROLES } from "../navConfig.js";

// ── Bottom Navigation (mobile only) ──────────────────────────────────────
const BOTTOM_NAV = [
  { id: "dashboard",  label: "Inicio",     Icon: Home },
  { id: "clientes",   label: "Clientes",   Icon: Users },
  { id: "ventas",     label: "Ventas",     Icon: ShoppingCart },
  { id: "inventario", label: "Inventario", Icon: Archive },
  { id: "caja",       label: "Más",        Icon: MoreHorizontal },
];
export function BottomNav({ tab, setTab, user }) {
  const allowed = ROLES[user?.role] || [];
  const items = BOTTOM_NAV.filter(n => allowed.includes(n.id));
  return (
    <div style={{
      display:"flex",position:"fixed",bottom:0,left:0,right:0,
      background:"var(--color-bg-surface)",borderTop:"1px solid var(--color-border)",
      zIndex:200,paddingBottom:"env(safe-area-inset-bottom,0px)",
    }}>
      {items.map(({ id, label, Icon }) => {
        const active = tab === id;
        return (
          <button key={id} onClick={() => setTab(id)}
            style={{
              flex:1,display:"flex",flexDirection:"column",alignItems:"center",
              justifyContent:"center",padding:"10px 0 8px",border:"none",
              background:"transparent",cursor:"pointer",fontFamily:FONT,
              color: active ? "var(--color-brand)" : "var(--color-text-faint)",
              transition:"color 0.15s",
            }}
          >
            <Icon size={20} strokeWidth={active ? 2.2 : 1.7} />
            <span style={{fontSize:10,marginTop:2,fontWeight:active?700:400}}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
