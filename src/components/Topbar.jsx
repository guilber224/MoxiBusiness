import { useRef, useState } from "react";
import { Menu, Search, X } from "lucide-react";
import { BRAND_NAME, FONT } from "../theme.jsx";
import { ROLE_LABELS } from "../navConfig.js";
import { BrandLogo } from "./ui/BrandLogo.jsx";
import { ThemeToggle } from "./ThemeToggle.jsx";
import { NotificacionesDropdown } from "./NotificacionesDropdown.jsx";

export function Topbar({ isMobile, sidebarOpen, setSidebarOpen, sidebarCollapsed, setSidebarCollapsed, setTab, user, data, appDebtClients, appLowStock }) {
  const [globalSearch, setGlobalSearch] = useState("");
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef(null);

  const hits = showResults && globalSearch.trim()
    ? (data?.customers || []).filter(c => `${c.name || ""} ${c.market || ""} ${c.phone || ""}`.toLowerCase().includes(globalSearch.trim().toLowerCase())).slice(0, 7)
    : [];

  return (
    <header style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: isMobile ? "0 14px" : "0 28px",
      height: 64,
      background: "var(--color-bg-surface)",
      borderBottom: "1px solid var(--color-border)",
      flexShrink: 0, zIndex: 10,
    }}>
      {/* Hamburger (mobile) / Collapse toggle (desktop) */}
      <button
        onClick={() => isMobile ? setSidebarOpen(v => !v) : setSidebarCollapsed(v => !v)}
        style={{ width: 36, height: 36, borderRadius: 10, border: "1px solid var(--color-border)", background: "var(--color-bg-primary)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 0.15s" }}
        onMouseEnter={e => e.currentTarget.style.background = "var(--color-border)"}
        onMouseLeave={e => e.currentTarget.style.background = "var(--color-bg-primary)"}
        title={isMobile ? "Menú" : "Colapsar sidebar"}
      >
        <Menu size={17} strokeWidth={1.8} color="var(--color-text-mid)" />
      </button>

      {/* Logo on mobile */}
      {isMobile && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <BrandLogo size={28} />
          <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: "-0.02em" }}>{BRAND_NAME}</span>
        </div>
      )}

      {/* Global search (desktop) */}
      {!isMobile && (
        <div ref={searchRef} style={{ position: "relative", flex: 1, maxWidth: 380 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--color-bg-primary)", border: `1px solid ${showResults && globalSearch ? "var(--color-brand)" : "var(--color-border)"}`, borderRadius: 10, padding: "7px 12px", transition: "border-color 0.15s" }}>
            <Search size={15} strokeWidth={1.8} color="var(--color-text-faint)" style={{ flexShrink: 0 }} />
            <input
              value={globalSearch}
              onChange={e => { setGlobalSearch(e.target.value); setShowResults(true); }}
              onFocus={() => setShowResults(true)}
              onBlur={e => { if (!searchRef.current?.contains(e.relatedTarget)) setTimeout(() => setShowResults(false), 150); }}
              placeholder="Buscar clientes, productos, ventas…"
              style={{ background: "transparent", border: "none", outline: "none", fontSize: 13, color: "var(--color-text)", width: "100%", minHeight: "unset", padding: 0, fontFamily: FONT }}
            />
            {!globalSearch && <span style={{ fontSize: 10, color: "var(--color-text-faint)", background: "var(--color-border)", padding: "2px 6px", borderRadius: 5, whiteSpace: "nowrap" }}>⌘K</span>}
            {globalSearch && <button onClick={() => { setGlobalSearch(""); setShowResults(false); }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-faint)", display: "flex", padding: 0 }}><X size={14} /></button>}
          </div>
          {showResults && globalSearch.trim() && (
            <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "var(--color-bg-surface)", border: "1px solid var(--color-border)", borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.14)", zIndex: 200, overflow: "hidden" }}>
              {hits.length === 0
                ? <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--color-text-faint)" }}>Sin resultados</div>
                : <>
                  <div style={{ padding: "8px 12px", fontSize: 10, color: "var(--color-text-faint)", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", borderBottom: "1px solid var(--color-border)" }}>Clientes encontrados</div>
                  {hits.map(c => (
                    <button key={c.id} onMouseDown={() => { setTab("clientes"); setGlobalSearch(""); setShowResults(false); }}
                      style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: "none", border: "none", padding: "9px 14px", cursor: "pointer", textAlign: "left", transition: "background 0.1s", fontFamily: FONT }}
                      onMouseEnter={e => e.currentTarget.style.background = "var(--color-bg-primary)"}
                      onMouseLeave={e => e.currentTarget.style.background = "none"}
                    >
                      <div style={{ width: 30, height: 30, borderRadius: "50%", background: "linear-gradient(135deg,#22C5FE,#111E7B)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "white", fontWeight: 700, flexShrink: 0 }}>{(c.name || "?")[0].toUpperCase()}</div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
                        {c.market && <div style={{ fontSize: 11, color: "var(--color-text-faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.market}</div>}
                      </div>
                    </button>
                  ))}
                </>}
            </div>
          )}
        </div>
      )}

      <div style={{ flex: isMobile ? 1 : 0 }} />

      {/* Right actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <ThemeToggle />
        <NotificacionesDropdown debtClients={appDebtClients} lowStock={appLowStock} setTab={setTab} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 10, background: "var(--color-bg-primary)", border: "1px solid var(--color-border)", flexShrink: 0 }}>
          <div style={{ width: 28, height: 28, background: data?.config?.logo_url ? "transparent" : "linear-gradient(135deg,#22C5FE,#111E7B)", borderRadius: data?.config?.logo_url ? 6 : "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "white", fontWeight: 700, flexShrink: 0, overflow: "hidden", border: data?.config?.logo_url ? "1px solid var(--color-border)" : "none" }}>
            {data?.config?.logo_url
              ? <img src={data.config.logo_url} alt="logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
              : (user?.name || "U")[0].toUpperCase()
            }
          </div>
          {!isMobile && (
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--color-text)", lineHeight: 1.3 }}>{user?.name}</div>
              <div style={{ fontSize: 10.5, color: "var(--color-text-faint)" }}>{ROLE_LABELS[user?.role] || user?.role}</div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
