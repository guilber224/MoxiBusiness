import { motion } from "framer-motion";
import { TrendingUp, TrendingDown } from "lucide-react";
import { C } from "../theme.jsx";
import { card } from "../styles.js";

export function KpiPremium({ label, value, sub, color, icon: Icon, trend, loading, index = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, delay: index * 0.07, ease: "easeOut" }}
      style={{
        ...card(), padding: "16px 18px", position: "relative", overflow: "hidden",
        borderRadius: 16, cursor: "default",
        transition: "box-shadow 0.2s, transform 0.2s",
      }}
      whileHover={{ y: -2, boxShadow: "0 6px 24px rgba(0,0,0,0.10)" }}
    >
      {/* Top row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div style={{ fontSize: 10.5, color: "var(--color-text-faint)", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase" }}>{label}</div>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: color + "18", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {Icon && <Icon size={18} strokeWidth={1.8} color={color} />}
        </div>
      </div>

      {/* Value */}
      {loading
        ? <div style={{ height: 28, background: "var(--color-border)", borderRadius: 6, marginBottom: 8, width: "62%", animation: "pulse 1.4s ease-in-out infinite" }} />
        : <div style={{ fontSize: 24, fontWeight: 800, color, letterSpacing: "-0.04em", marginBottom: 6, lineHeight: 1.1 }}>{value}</div>
      }

      {/* Sub + trend */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11.5, color: "var(--color-text-mid)" }}>{sub}</span>
        {trend != null && !loading && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 11, fontWeight: 700, color: trend >= 0 ? C.green : C.danger }}>
            {trend >= 0
              ? <TrendingUp size={12} strokeWidth={2} />
              : <TrendingDown size={12} strokeWidth={2} />}
            {Math.abs(Math.round(trend))}%
          </span>
        )}
      </div>

      {/* Accent bar */}
      <div style={{ position: "absolute", bottom: 0, left: 0, height: 3, width: "100%", background: color, opacity: 0.18, borderRadius: "0 0 16px 16px" }} />
    </motion.div>
  );
}
