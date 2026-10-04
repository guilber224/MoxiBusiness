import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { C } from "../../theme.jsx";
import { inp, mkBtn } from "../../styles.js";

const MAX_VISIBLES = 60; // con catálogos grandes se pide afinar la búsqueda en vez de dibujar miles de tarjetas

const nivelColor = p => (p.stock <= 0 ? C.red : p.minStock > 0 && p.stock <= p.minStock ? C.amber : C.green);

function Miniatura({ p, size }) {
  return p.img
    ? <img src={p.img} alt="" loading="lazy" decoding="async" style={{ width: size, height: size, objectFit: "cover", borderRadius: 10, background: "var(--color-bg-primary)", flexShrink: 0 }} />
    : <div style={{ width: size, height: size, borderRadius: 10, background: "var(--color-bg-primary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.45, flexShrink: 0 }}>📦</div>;
}

/**
 * Elegir un producto viendo su foto y su stock. Busca por nombre o código;
 * con un lector de código de barras (escribe el código y Enter) lo selecciona directo.
 */
export function SelectorProducto({ products, categories = [], value, onChange, autoFocus = false }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const sel = products.find(p => p.id === value);

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    return products.filter(p => (cat === "all" || p.cat === cat) &&
      (!t || p.name.toLowerCase().includes(t) || String(p.barcode || "").toLowerCase().includes(t)));
  }, [products, q, cat]);
  const catsConProductos = categories.filter(c => products.some(p => p.cat === c.id));

  const alPresionar = e => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const t = q.trim();
    const exacto = products.find(p => p.barcode && String(p.barcode) === t);
    const elegido = exacto || (filtrados.length === 1 ? filtrados[0] : null);
    if (elegido) { onChange(elegido.id); setQ(""); }
  };

  if (sel) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 10, border: `2px solid #111E7B`, borderRadius: 12, background: "rgba(17,30,123,0.04)" }}>
        <Miniatura p={sel} size={56} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sel.name}</div>
          <div style={{ fontSize: 12, color: C.textMid }}>
            Stock actual: <strong style={{ color: nivelColor(sel) }}>{sel.stock} {sel.unit}</strong>{sel.barcode ? ` · Cód. ${sel.barcode}` : ""}
          </div>
        </div>
        <button onClick={() => onChange("")} style={{ ...mkBtn("ghost"), padding: "6px 10px", fontSize: 12 }}><X size={13} /> Cambiar</button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ position: "relative", marginBottom: 8 }}>
        <Search size={15} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.textFaint }} />
        <input style={{ ...inp, paddingLeft: 32 }} value={q} onChange={e => setQ(e.target.value)} onKeyDown={alPresionar}
          placeholder="Buscar por nombre o escanear código…" autoFocus={autoFocus} aria-label="Buscar producto" />
      </div>
      {catsConProductos.length > 0 && <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 6, marginBottom: 6 }}>
        {[{ id: "all", name: "Todos" }, ...catsConProductos].map(c => (
          <button key={c.id} onClick={() => setCat(c.id)} style={{ ...mkBtn(cat === c.id ? "primary" : "ghost"), padding: "4px 10px", fontSize: 12, flexShrink: 0 }}>{c.name}</button>
        ))}
      </div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(118px,1fr))", gap: 8, maxHeight: 300, overflowY: "auto", padding: 2 }}>
        {filtrados.slice(0, MAX_VISIBLES).map(p => (
          <button key={p.id} onClick={() => { onChange(p.id); setQ(""); }} title={p.name}
            style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: 6, padding: 6, borderRadius: 12, border: `1px solid ${C.border}`, background: "var(--color-bg-surface)", cursor: "pointer", textAlign: "left", fontFamily: "inherit", color: "var(--color-text)" }}>
            {p.img ? <img src={p.img} alt="" loading="lazy" decoding="async" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 8, background: "var(--color-bg-primary)" }} />
              : <div style={{ width: "100%", aspectRatio: "1", borderRadius: 8, background: "var(--color-bg-primary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30 }}>📦</div>}
            <span style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.25, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.name}</span>
            <span style={{ fontSize: 11, color: nivelColor(p), fontWeight: 600 }}>{p.stock} {p.unit}</span>
          </button>
        ))}
      </div>
      {filtrados.length === 0 && <div style={{ fontSize: 13, color: C.textFaint, padding: "12px 0" }}>No hay productos que coincidan.</div>}
      {filtrados.length > MAX_VISIBLES && <div style={{ fontSize: 11, color: C.textFaint, marginTop: 6 }}>Mostrando {MAX_VISIBLES} de {filtrados.length}. Escribe para afinar la búsqueda.</div>}
    </div>
  );
}
