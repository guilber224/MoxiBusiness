import { C } from "../../theme.jsx";

export function Table({ cols, rows, onRowClick }) {
  if(!rows.length) return null;
  return (
    <div style={{overflowX:"auto"}}>
      <table style={{width:"100%",borderCollapse:"collapse",minWidth:400}}>
        <thead><tr>{cols.map(c=><th key={c.key} style={{textAlign:"left",fontSize:11,color:C.textMid,fontWeight:600,padding:"7px 12px",borderBottom:`1px solid ${C.border}`,textTransform:"uppercase",letterSpacing:"0.05em",whiteSpace:"nowrap"}}>{c.label}</th>)}</tr></thead>
        <tbody>{rows.map((row,i)=>(
          <tr key={row.id||i} onClick={()=>onRowClick&&onRowClick(row)} style={{cursor:onRowClick?"pointer":"default",transition:"background 0.1s"}} onMouseEnter={e=>{if(onRowClick)e.currentTarget.style.background=C.bg}} onMouseLeave={e=>{e.currentTarget.style.background=""}}>
            {cols.map(c=><td key={c.key} style={{padding:"9px 12px",fontSize:13,borderBottom:`1px solid ${C.border}`,color:C.text,...(c.style||{})}}>{c.render?c.render(row[c.key],row):row[c.key]}</td>)}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
