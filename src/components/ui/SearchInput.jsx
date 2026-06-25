import { Search } from "lucide-react";
import { inp } from "../../styles.js";

export function SearchInput({ value, onChange, placeholder="Buscar..." }) {
  return (
    <div style={{position:"relative",flex:1}}>
      <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",display:"flex",alignItems:"center"}}>
        <Search size={14} strokeWidth={1.8} color="var(--color-text-faint)" />
      </span>
      <input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={{...inp,paddingLeft:32}} />
    </div>
  );
}
