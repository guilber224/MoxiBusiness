import { useState } from "react";
import toast from "react-hot-toast";
import { Building2, Package, QrCode, Rocket, Check } from "lucide-react";
import { CURRENCIES } from "../currency.js";
import { n } from "../utils/businessLogic.js";
import { BRAND_NAME, C, FONT } from "../theme.jsx";
import { lbl, inp, mkBtn } from "../styles.js";
import { ImportarExcel } from "./ImportarExcel.jsx";
import { ImagenEmpresa } from "./UsuariosAdmin.jsx";

const RUBROS = ["Tienda / minimarket", "Distribuidora / mayorista", "Ferretería", "Ropa y calzado", "Librería / papelería",
  "Celulares y accesorios", "Agropecuaria / veterinaria", "Alimentos / producción", "Cosméticos / belleza", "Farmacia", "Restaurante / cafetería", "Otro"];

const PASOS = [
  { id: "negocio", titulo: "Tu negocio", Icon: Building2 },
  { id: "productos", titulo: "Tus productos", Icon: Package },
  { id: "cobros", titulo: "Cobros por QR", Icon: QrCode },
  { id: "listo", titulo: "¡Listo!", Icon: Rocket },
];

/** Asistente de 4 pasos que ve el administrador la primera vez que entra a una empresa nueva. */
export function AsistenteInicio({ D, A, user, setTab, onCerrar }) {
  const [paso, setPaso] = useState(0);
  const [guardando, setGuardando] = useState(false);
  const cfg = D.config || {};
  const [neg, setNeg] = useState({ businessName: cfg.businessName || "", rubro: cfg.rubro || "", telefono: cfg.telefono || "", nit: cfg.nit || "", direccion: cfg.direccion || "", currency: cfg.currency || "BOB" });
  const [modoProd, setModoProd] = useState(null); // "excel" | "manual"
  const [prod, setProd] = useState({ name: "", price: "", cost: "", stock: "", unit: "unidad" });
  const [creados, setCreados] = useState([]);

  const terminar = async (destino) => {
    try { await A.completarOnboarding(true); } catch { /* si falla, se vuelve a mostrar la próxima vez */ }
    onCerrar?.();
    if (destino) setTab(destino);
  };

  const guardarNegocio = async () => {
    if (!neg.businessName.trim()) { toast.error("Escribe el nombre de tu negocio"); return; }
    setGuardando(true);
    try { await A.actualizarConfig(neg); setPaso(1); }
    catch (e) { toast.error(e.message); } finally { setGuardando(false); }
  };

  const crearProducto = async () => {
    if (!prod.name.trim()) { toast.error("Escribe el nombre del producto"); return; }
    if (!(n(prod.price) >= 0) || prod.price === "") { toast.error("Escribe el precio de venta"); return; }
    setGuardando(true);
    try {
      const p = await A.crearProducto({ name: prod.name, price: n(prod.price), cost: n(prod.cost), unit: prod.unit, minStock: 0 });
      if (n(prod.stock) > 0) await A.movimientoStock(p.id, "entrada", n(prod.stock), n(prod.cost) || null, "Inventario inicial");
      setCreados(c => [...c, p.name]);
      setProd({ name: "", price: "", cost: "", stock: "", unit: prod.unit });
      toast.success(`"${p.name}" agregado`);
    } catch (e) { toast.error(e.message); } finally { setGuardando(false); }
  };

  const totalProductos = D.products.length;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 250, background: "rgba(13,17,23,0.72)", backdropFilter: "blur(6px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "32px 12px", overflowY: "auto", fontFamily: FONT }}>
      <div style={{ background: "var(--color-bg-surface)", color: "var(--color-text)", borderRadius: 20, width: "100%", maxWidth: 760, boxShadow: "0 30px 80px rgba(0,0,0,0.35)", overflow: "hidden" }}>
        {/* Encabezado con pasos */}
        <div style={{ padding: "20px 24px 0", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div>
            <div style={{ fontSize: 12, color: C.textFaint }}>Bienvenido a {BRAND_NAME}</div>
            <div style={{ fontWeight: 800, fontSize: 19 }}>Dejemos tu negocio listo en 3 minutos</div>
          </div>
          <button onClick={() => terminar(null)} style={{ ...mkBtn("ghost"), fontSize: 12 }}>Omitir</button>
        </div>
        <div style={{ display: "flex", gap: 6, padding: "16px 24px", borderBottom: `1px solid ${C.border}`, overflowX: "auto" }}>
          {PASOS.map((p, i) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 999, fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap",
              background: i === paso ? "#111E7B" : i < paso ? "rgba(16,185,129,0.12)" : "var(--color-bg-primary)", color: i === paso ? "#fff" : i < paso ? C.green : C.textMid }}>
              {i < paso ? <Check size={14} /> : <p.Icon size={14} />} {p.titulo}
            </div>
          ))}
        </div>

        <div style={{ padding: 24 }}>
          {/* 1 · Negocio */}
          {paso === 0 && <div>
            <p style={{ marginTop: 0, color: C.textMid, fontSize: 14 }}>Estos datos aparecen en tus notas de venta y cotizaciones.</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
              <div><label style={lbl}>Nombre del negocio *</label><input style={inp} value={neg.businessName} onChange={e => setNeg({ ...neg, businessName: e.target.value })} autoFocus /></div>
              <div><label style={lbl}>Rubro</label>
                <select style={inp} value={neg.rubro} onChange={e => setNeg({ ...neg, rubro: e.target.value })}>
                  <option value="">Elegir…</option>{RUBROS.map(r => <option key={r}>{r}</option>)}
                </select></div>
              <div><label style={lbl}>Teléfono / WhatsApp</label><input style={inp} value={neg.telefono} onChange={e => setNeg({ ...neg, telefono: e.target.value })} placeholder="Ej: 70012345" /></div>
              <div><label style={lbl}>NIT (opcional)</label><input style={inp} value={neg.nit} onChange={e => setNeg({ ...neg, nit: e.target.value })} /></div>
              <div><label style={lbl}>Dirección</label><input style={inp} value={neg.direccion} onChange={e => setNeg({ ...neg, direccion: e.target.value })} /></div>
              <div><label style={lbl}>Moneda</label>
                <select style={inp} value={neg.currency} onChange={e => setNeg({ ...neg, currency: e.target.value })}>
                  {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.symbol} — {c.name}</option>)}
                </select></div>
            </div>
            <div style={{ marginTop: 14 }}>
              <ImagenEmpresa titulo="Logo (opcional)" nombre="logo" campo="logo_url" url={cfg.logo_url} A={A} puedeEditar ayuda="Se muestra en el menú y en tus notas de venta." />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button onClick={guardarNegocio} disabled={guardando} style={{ ...mkBtn("primary"), padding: "10px 20px" }}>{guardando ? "Guardando…" : "Guardar y continuar"}</button>
            </div>
          </div>}

          {/* 2 · Productos */}
          {paso === 1 && <div>
            <p style={{ marginTop: 0, color: C.textMid, fontSize: 14 }}>
              Tienes <strong>{totalProductos}</strong> producto{totalProductos === 1 ? "" : "s"}. ¿Cómo quieres cargarlos?
            </p>
            {!modoProd && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12, marginBottom: 16 }}>
              {[["excel", "📥", "Importar desde Excel", "Ideal si tienes muchos productos o ya los manejas en una planilla."],
                ["manual", "✍️", "Agregar uno por uno", "Para empezar rápido con tus productos principales."]].map(([id, ic, t, d]) => (
                <button key={id} onClick={() => setModoProd(id)} style={{ textAlign: "left", padding: 16, borderRadius: 14, border: `1px solid ${C.border}`, background: "var(--color-bg-primary)", cursor: "pointer", fontFamily: FONT, color: "var(--color-text)" }}>
                  <div style={{ fontSize: 24 }}>{ic}</div><div style={{ fontWeight: 700, margin: "6px 0 4px" }}>{t}</div><div style={{ fontSize: 13, color: C.textMid }}>{d}</div>
                </button>
              ))}
            </div>}
            {modoProd === "excel" && <ImportarExcel tipo="productos" A={A} incrustado />}
            {modoProd === "manual" && <div>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 8 }} className="grid-producto-rapido">
                <div><label style={lbl}>Producto *</label><input style={inp} value={prod.name} onChange={e => setProd({ ...prod, name: e.target.value })} placeholder="Ej: Arroz 1 kg" onKeyDown={e => e.key === "Enter" && crearProducto()} /></div>
                <div><label style={lbl}>Precio *</label><input type="number" min="0" style={inp} value={prod.price} onChange={e => setProd({ ...prod, price: e.target.value })} /></div>
                <div><label style={lbl}>Costo</label><input type="number" min="0" style={inp} value={prod.cost} onChange={e => setProd({ ...prod, cost: e.target.value })} /></div>
                <div><label style={lbl}>Stock</label><input type="number" min="0" style={inp} value={prod.stock} onChange={e => setProd({ ...prod, stock: e.target.value })} /></div>
                <div><label style={lbl}>Unidad</label><input style={inp} value={prod.unit} onChange={e => setProd({ ...prod, unit: e.target.value })} /></div>
              </div>
              <style>{`@media (max-width: 640px) { .grid-producto-rapido { grid-template-columns: 1fr 1fr !important; } .grid-producto-rapido > div:first-child { grid-column: 1 / -1; } }`}</style>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, color: C.textFaint }}>{creados.length ? `Agregados: ${creados.slice(-4).join(", ")}${creados.length > 4 ? "…" : ""}` : "Puedes agregar fotos y más datos después en Productos."}</span>
                <button onClick={crearProducto} disabled={guardando} style={mkBtn("primary")}>{guardando ? "Guardando…" : "+ Agregar producto"}</button>
              </div>
            </div>}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 18, gap: 8 }}>
              <button onClick={() => (modoProd ? setModoProd(null) : setPaso(0))} style={mkBtn("ghost")}>← Atrás</button>
              <button onClick={() => setPaso(2)} style={{ ...mkBtn(totalProductos ? "primary" : "ghost"), padding: "10px 20px" }}>{totalProductos ? "Continuar" : "Lo haré después"}</button>
            </div>
          </div>}

          {/* 3 · Cobros */}
          {paso === 2 && <div>
            <p style={{ marginTop: 0, color: C.textMid, fontSize: 14 }}>Si tus clientes te pagan por QR, sube la imagen de tu QR bancario: aparecerá en el punto de venta al cobrar.</p>
            <ImagenEmpresa titulo="QR de cobro (opcional)" nombre="qr" campo="qr_url" url={cfg.qr_url} A={A} puedeEditar ayuda="Una captura del QR que te da tu banco." />
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <button onClick={() => setPaso(1)} style={mkBtn("ghost")}>← Atrás</button>
              <button onClick={() => setPaso(3)} style={{ ...mkBtn("primary"), padding: "10px 20px" }}>Continuar</button>
            </div>
          </div>}

          {/* 4 · Listo */}
          {paso === 3 && <div>
            <div style={{ textAlign: "center", marginBottom: 18 }}>
              <div style={{ fontSize: 40 }}>🎉</div>
              <div style={{ fontWeight: 800, fontSize: 20 }}>¡{neg.businessName || "Tu negocio"} está listo para vender!</div>
              <div style={{ color: C.textMid, fontSize: 14 }}>Te recomendamos estos primeros pasos:</div>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {[
                ["💵", "Abre la caja", "Indica con cuánto efectivo empiezas el día.", "caja"],
                ["🛒", "Haz tu primera venta", "Elige productos, cobra y envía la nota por WhatsApp.", "ventas"],
                ...(user?.role === "admin" ? [["👥", "Invita a tu equipo", "Crea cuentas para tus vendedores en Ajustes.", "usuarios"]] : []),
              ].map(([ic, t, d, tab]) => (
                <button key={tab} onClick={() => terminar(tab)} style={{ display: "flex", gap: 12, alignItems: "center", textAlign: "left", padding: 14, borderRadius: 14, border: `1px solid ${C.border}`, background: "var(--color-bg-primary)", cursor: "pointer", fontFamily: FONT, color: "var(--color-text)" }}>
                  <span style={{ fontSize: 24 }}>{ic}</span>
                  <span style={{ flex: 1 }}><strong>{t}</strong><br /><span style={{ fontSize: 13, color: C.textMid }}>{d}</span></span>
                  <span style={{ color: "#111E7B", fontWeight: 700 }}>Ir →</span>
                </button>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 18, gap: 8 }}>
              <button onClick={() => setPaso(2)} style={mkBtn("ghost")}>← Atrás</button>
              <button onClick={() => terminar("dashboard")} style={{ ...mkBtn("primary"), padding: "10px 20px" }}>Ir al panel</button>
            </div>
          </div>}
        </div>
      </div>
    </div>
  );
}
