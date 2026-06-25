import { C } from "../../theme.jsx";

export function Empty({ icon, title, sub, action }) {
  return (
    <div style={{textAlign:"center",padding:"3rem 1rem"}}>
      <div style={{fontSize:36,marginBottom:10}}>{icon||"📭"}</div>
      <div style={{fontWeight:600,fontSize:14,marginBottom:4}}>{title}</div>
      <div style={{fontSize:13,color:C.textMid,marginBottom:action?14:0}}>{sub}</div>
      {action}
    </div>
  );
}
