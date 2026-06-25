import { Sun, Moon } from "lucide-react";
import { useTheme } from "../theme.jsx";

export function ThemeToggle() {
  const { isDark, toggle } = useTheme();
  return (
    <button onClick={toggle} title={isDark ? "Modo claro" : "Modo oscuro"}
      style={{
        width:36,height:36,borderRadius:10,border:"1px solid var(--color-border)",
        background:"var(--color-bg-primary)",cursor:"pointer",
        display:"flex",alignItems:"center",justifyContent:"center",
        transition:"background 0.15s,border-color 0.15s",flexShrink:0,
      }}
      onMouseEnter={e=>e.currentTarget.style.background="var(--color-border)"}
      onMouseLeave={e=>e.currentTarget.style.background="var(--color-bg-primary)"}
    >
      {isDark
        ? <Sun size={16} strokeWidth={1.8} color="var(--color-text-mid)" />
        : <Moon size={16} strokeWidth={1.8} color="var(--color-text-mid)" />}
    </button>
  );
}
