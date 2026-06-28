import { createContext, useContext, useState, useEffect, useCallback } from "react";

export const BRAND_NAME = "Moxi Business";
export const BRAND_SUBTITLE = "ERP + POS Empresarial";
export const safeBusinessName = config => config?.businessName?.trim() || BRAND_NAME;

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  DESIGN SYSTEM — TOKENS                                            ║
// ╚══════════════════════════════════════════════════════════════════════╝
export const C = {
  // Core palette — brand navy + sky blue
  red: "#EF4444", redHover: "#DC2626", redBg: "#FEF2F2", redMid: "#FCA5A5",
  amber: "#F59E0B", amberBg: "#FFFBEB", amberMid: "#FCD34D",
  green: "#10B981", greenBg: "#ECFDF5", greenMid: "#6EE7B7",
  blue: "#22C5FE", blueBg: "#EFF6FF", blueMid: "#93C5FD",
  // Neutrals — CSS variable–backed for dark/light support
  sidebar: "var(--color-sidebar-bg)",
  sidebarBorder: "var(--color-sidebar-border)",
  sidebarText: "var(--color-sidebar-text)",
  sidebarActive: "var(--color-sidebar-active)",
  bg: "var(--color-bg-primary)",
  surface: "var(--color-bg-surface)",
  border: "var(--color-border)",
  borderMid: "var(--color-border-mid)",
  text: "var(--color-text)",
  textMid: "var(--color-text-mid)",
  textFaint: "var(--color-text-faint)",
  // Semantic
  danger: "#EF4444", warning: "#F59E0B", success: "#10B981", info: "#111E7B",
  // Brand
  brand: "#111E7B", brandLight: "#22C5FE",
};

// Typography
export const FONT = "'Inter', 'SF Pro Display', -apple-system, sans-serif";

// Spacing / radius
export const R = { sm: 6, md: 8, lg: 12, xl: 16 };

// Paleta para gráficos de sectores (pie/donut) — orden fijo de colores por índice.
export const SECTORS_COLORS = [C.brandLight, C.green, C.warning, C.danger, "#7C3AED", "#0891B2"];

// ── Theme context ──────────────────────────────────────────────────────────
const ThemeCtx = createContext({ isDark: false, toggle: () => {} });
export const useTheme = () => useContext(ThemeCtx);
export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(() => {
    try { return localStorage.getItem("moxi_theme") === "dark"; } catch { return false; }
  });
  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    try { localStorage.setItem("moxi_theme", isDark ? "dark" : "light"); } catch {}
  }, [isDark]);
  const toggle = useCallback(() => setIsDark(v => !v), []);
  return <ThemeCtx.Provider value={{ isDark, toggle }}>{children}</ThemeCtx.Provider>;
}
