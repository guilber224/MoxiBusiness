import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Plus, Trash2, ClipboardList } from "lucide-react";
import { n } from "../utils/businessLogic.js";
import { Bs, getCurrencySymbol } from "../currency.js";
import { C } from "../theme.jsx";
import { card, inp, lbl, mkBtn, mkBadge, row } from "../styles.js";
import { useAccion } from "../hooks/useAccion.js";
import { useMostrarMas } from "../hooks/useMostrarMas.js";
import { Header } from "./ui/Header.jsx";
import { Modal } from "./ui/Modal.jsx";
import { Empty } from "./ui/Empty.jsx";
import { KPI } from "./ui/KPI.jsx";
import { SearchInput } from "./ui/SearchInput.jsx";
import { BotonMostrarMas } from "./ui/BotonMostrarMas.jsx";
import {
  ESPECIES, TIPOS_EVENTO, ESTADOS_ANIMAL, edadTxt, categoriaAnimal, gananciaDiaria, siguienteCodigo, resumenHato, indicadoresAnio, diasEntre, hoyStr,
} from "../utils/hato.js";
import { imprimirTicket, leerAnchoTicket } from "../utils/ticketTermico.js";

const METODOS = [["efectivo", "Efectivo"], ["qr", "QR"], ["banco", "Transferencia"], ["tarjeta", "Tarjeta"]];
const esAdmin = u => ["admin", "superadmin"].includes(String(u?.role || "").toLowerCase());
const fc = f => (f ? String(f).slice(0, 10).split("-").reverse().join("/") : "—");
const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const kg = v => (v == null ? "—" : `${Math.round(v * 10) / 10} kg`);
const MASIVOS = ["VACUNA", "DESPARASITACION", "TRATAMIENTO", "PESAJE", "TRASLADO", "DESTETE", "NOTA"];

export function Hato({ D, A, user }) {
  const animales = D.animales || [];
  const pendientes = D.pendientesHato || [];
  const config = D.config || {};
  const hoy = hoyStr();
  const [vista, setVista] = useState("animales");
  const [form, setForm] = useState(null);
  const [fichaId, setFichaId] = useState(null);
  const [jornada, setJornada] = useState(null);      // {ids, tipo?, detalle?}
  const [venta, setVenta] = useState(null);          // ids
  const [baja, setBaja] = useState(null);            // ids
  const [sel, setSel] = useState(() => new Set());

  const activos = useMemo(() => animales.filter(a => a.estado === "ACTIVO"), [animales]);
  const porId = useMemo(() => new Map(animales.map(a => [a.id, a])), [animales]);
  const resumen = useMemo(() => resumenHato(animales, hoy), [animales, hoy]);
  const ind = useMemo(() => indicadoresAnio(animales, hoy.slice(0, 4)), [animales, hoy]);
  const potreros = useMemo(() => [...new Set(activos.map(a => a.potrero).filter(Boolean))].sort(), [activos]);
  const razas = useMemo(() => [...new Set(animales.map(a => a.raza).filter(Boolean))].sort(), [animales]);

  const nuevo = (extra = {}) => setForm({ id: null, codigo: siguienteCodigo(animales), nombre: "", especie: activos[0]?.especie || "BOVINO", sexo: "H", castrado: false,
    raza: "", color: "", marca: "", categoria: "", fechaNacimiento: "", origen: "NACIDO", fechaIngreso: hoy, precioCompra: "", registrarGasto: false, metodoPago: "efectivo",
    madreId: "", padreId: "", padreTexto: "", potrero: potreros[0] || "", peso: "", notas: "", ...extra });
  const ficha = fichaId ? porId.get(fichaId) : null;
  const limpiarSel = () => setSel(new Set());

  return (
    <div>
      <Header title="Hato ganadero" sub="Animales, potreros, sanidad, reproducción y ventas"
        action={<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => setJornada({ ids: [], tipo: "VACUNA" })} disabled={!activos.length} style={mkBtn("ghost")}><ClipboardList size={14} /> Jornada</button>
          <button onClick={() => nuevo()} style={mkBtn("primary")}>+ Animal</button>
        </div>} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 14 }}>
        <KPI label="Cabezas" value={resumen.total} sub={`${resumen.hembras} hembras · ${resumen.machos} machos`} Icon="🐄" color={C.blue} />
        <KPI label="Preñadas" value={resumen.prenadas} sub={resumen.partosProximos ? `${resumen.partosProximos} paren en 30 días` : undefined} Icon="🤰" color={C.green} />
        <KPI label={`Nacimientos ${hoy.slice(0, 4)}`} value={ind.nacimientos} sub={`Mortalidad ${ind.mortalidad}%`} Icon="🐮" color={ind.mortalidad > 5 ? C.red : C.green} />
        <KPI label="Peso promedio" value={resumen.pesoPromedio ? `${resumen.pesoPromedio} kg` : "—"} sub={ind.vendidos ? `${ind.vendidos} vendidos · ${Bs(ind.ingresoVentas)}` : undefined} Icon="⚖️" color={C.amber} />
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {[["animales", "Animales"], ["resumen", "Inventario"], ["reproduccion", "Reproducción"], ["sanidad", `Sanidad${pendientes.length ? ` (${pendientes.filter(p => porId.get(p.animalId)?.estado === "ACTIVO" && p.proximaFecha <= hoy).length || pendientes.length})` : ""}`], ["bajas", "Ventas y bajas"]].map(([id, t]) => (
          <button key={id} onClick={() => setVista(id)} style={{ ...mkBtn(vista === id ? "primary" : "ghost"), padding: "6px 12px", fontSize: 13 }}>{t}</button>
        ))}
      </div>

      {vista === "animales" && <ListaAnimales activos={activos} potreros={potreros} hoy={hoy} sel={sel} setSel={setSel} onAbrir={setFichaId} onNuevo={() => nuevo()}
        onJornada={ids => setJornada({ ids, tipo: "VACUNA" })} onVender={ids => setVenta(ids)} onBaja={ids => setBaja(ids)} />}
      {vista === "resumen" && <Inventario resumen={resumen} ind={ind} />}
      {vista === "reproduccion" && <Reproduccion activos={activos} hoy={hoy} onAbrir={setFichaId} />}
      {vista === "sanidad" && <Sanidad pendientes={pendientes} porId={porId} hoy={hoy} onJornada={(ids, tipo, detalle) => setJornada({ ids, tipo, detalle })} onAbrir={setFichaId} />}
      {vista === "bajas" && <Bajas animales={animales} onAbrir={setFichaId} />}

      {form && <FormAnimal inicial={form} animales={animales} potreros={potreros} razas={razas} A={A} onClose={() => setForm(null)} onGuardado={a => { setForm(null); setFichaId(a.id); }} />}
      {ficha && !form && !jornada && !venta && !baja && <FichaAnimal animal={ficha} porId={porId} animales={animales} potreros={potreros} hoy={hoy} A={A} admin={esAdmin(user)}
        onClose={() => setFichaId(null)} onAbrir={setFichaId} onEditar={() => setForm({ ...ficha, precioCompra: ficha.precioCompra ?? "", madreId: ficha.madreId || "", padreId: ficha.padreId || "", fechaNacimiento: ficha.fechaNacimiento || "", categoria: ficha.categoria || "", peso: "" })}
        onVender={() => setVenta([ficha.id])} onBaja={() => setBaja([ficha.id])} />}
      {jornada && <Jornada inicial={jornada} activos={activos} potreros={potreros} A={A} onClose={() => setJornada(null)} onHecho={() => { setJornada(null); limpiarSel(); }} />}
      {venta && <VentaAnimales ids={venta} porId={porId} D={D} A={A} config={config} onClose={() => setVenta(null)} onHecho={() => { setVenta(null); limpiarSel(); setFichaId(null); }} />}
      {baja && <BajaAnimales ids={baja} porId={porId} A={A} onClose={() => setBaja(null)} onHecho={() => { setBaja(null); limpiarSel(); setFichaId(null); }} />}
    </div>
  );
}

// ── Lista de animales con selección para acciones en grupo ────────────────
function ListaAnimales({ activos, potreros, hoy, sel, setSel, onAbrir, onNuevo, onJornada, onVender, onBaja }) {
  const [q, setQ] = useState("");
  const [potrero, setPotrero] = useState("");
  const [categoria, setCategoria] = useState("");
  const [especie, setEspecie] = useState("");
  const especies = useMemo(() => [...new Set(activos.map(a => a.especie))], [activos]);
  const categorias = useMemo(() => [...new Set(activos.map(a => categoriaAnimal(a, hoy)))].sort(), [activos, hoy]);
  const lista = useMemo(() => {
    const t = norm(q.trim());
    return activos.filter(a => (!potrero || (a.potrero || "Sin potrero") === potrero) && (!especie || a.especie === especie) && (!categoria || categoriaAnimal(a, hoy) === categoria)
      && (!t || norm(`${a.codigo} ${a.nombre} ${a.raza} ${a.color} ${a.marca}`).includes(t)))
      .sort((a, b) => String(a.codigo).localeCompare(String(b.codigo), "es", { numeric: true }));
  }, [activos, q, potrero, categoria, especie, hoy]);
  const pag = useMostrarMas(lista, 100, `${q}|${potrero}|${categoria}|${especie}`);
  const todos = lista.length > 0 && lista.every(a => sel.has(a.id));
  const alternar = id => setSel(s => { const x = new Set(s); if (x.has(id)) x.delete(id); else x.add(id); return x; });
  const ids = [...sel];

  if (!activos.length) return <Empty icon="🐄" title="Aún no registraste animales" sub="Agrega cada animal con su caravana, o empieza por las vacas y registra los partos." action={<button onClick={onNuevo} style={mkBtn("primary")}>+ Primer animal</button>} />;
  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <SearchInput value={q} onChange={setQ} placeholder="Caravana, nombre, raza, color o marca…" />
        {especies.length > 1 && <select value={especie} onChange={e => setEspecie(e.target.value)} style={{ ...inp, width: "auto" }} aria-label="Especie"><option value="">Todas las especies</option>{especies.map(x => <option key={x} value={x}>{ESPECIES[x]}</option>)}</select>}
        <select value={potrero} onChange={e => setPotrero(e.target.value)} style={{ ...inp, width: "auto" }} aria-label="Potrero"><option value="">Todos los potreros</option>{[...potreros, "Sin potrero"].map(p => <option key={p} value={p}>{p}</option>)}</select>
        <select value={categoria} onChange={e => setCategoria(e.target.value)} style={{ ...inp, width: "auto" }} aria-label="Categoría"><option value="">Todas las categorías</option>{categorias.map(c => <option key={c} value={c}>{c}</option>)}</select>
      </div>
      {sel.size > 0 && <div style={{ ...card({ padding: "8px 12px" }), display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10, borderColor: "#22C5FE", position: "sticky", top: 64, zIndex: 5 }}>
        <strong style={{ fontSize: 13 }}>{sel.size} seleccionado{sel.size === 1 ? "" : "s"}</strong>
        <button onClick={() => onJornada(ids)} style={{ ...mkBtn("primary"), padding: "5px 10px", fontSize: 12 }}>💉 Vacuna / pesaje / traslado…</button>
        <button onClick={() => onVender(ids)} style={{ ...mkBtn("ghost"), padding: "5px 10px", fontSize: 12 }}>💵 Vender</button>
        <button onClick={() => onBaja(ids)} style={{ ...mkBtn("ghost"), padding: "5px 10px", fontSize: 12 }}>Dar de baja</button>
        <button onClick={() => setSel(new Set())} style={{ ...mkBtn("ghost"), padding: "5px 10px", fontSize: 12, marginLeft: "auto" }}>Quitar selección</button>
      </div>}
      <div style={{ ...card({ padding: 0 }), overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 720 }}>
          <thead><tr style={{ textAlign: "left", color: C.textMid, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            <th style={{ padding: "8px 10px", width: 30 }}><input type="checkbox" checked={todos} onChange={() => setSel(todos ? new Set() : new Set(lista.map(a => a.id)))} aria-label="Seleccionar todos" /></th>
            <th style={{ padding: 8 }}>Caravana</th><th style={{ padding: 8 }}>Categoría</th><th style={{ padding: 8 }}>Edad</th><th style={{ padding: 8 }}>Raza</th>
            <th style={{ padding: 8 }}>Potrero</th><th style={{ padding: 8, textAlign: "right" }}>Peso</th><th style={{ padding: 8 }}></th>
          </tr></thead>
          <tbody>
            {pag.visibles.map(a => {
              const gdp = gananciaDiaria(a);
              return (
                <tr key={a.id} style={{ borderTop: `1px solid ${C.border}`, background: sel.has(a.id) ? "rgba(34,197,254,0.07)" : undefined }}>
                  <td style={{ padding: "8px 10px" }}><input type="checkbox" checked={sel.has(a.id)} onChange={() => alternar(a.id)} aria-label={`Seleccionar ${a.codigo}`} /></td>
                  <td style={{ padding: 8 }}><button onClick={() => onAbrir(a.id)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", color: "#111E7B", fontWeight: 800, fontSize: 13 }}>{a.codigo}</button>
                    {a.nombre && <span style={{ color: C.textMid }}> · {a.nombre}</span>}</td>
                  <td style={{ padding: 8 }}>{a.sexo === "M" ? "♂" : "♀"} {categoriaAnimal(a, hoy)}</td>
                  <td style={{ padding: 8, color: C.textMid }}>{edadTxt(a.fechaNacimiento, hoy)}</td>
                  <td style={{ padding: 8, color: C.textMid }}>{a.raza || "—"}</td>
                  <td style={{ padding: 8 }}>{a.potrero || "—"}</td>
                  <td style={{ padding: 8, textAlign: "right" }}>{kg(a.peso)}{gdp != null && <div style={{ fontSize: 11, color: gdp >= 0 ? C.green : C.red }}>{gdp >= 0 ? "+" : ""}{gdp} kg/día</div>}</td>
                  <td style={{ padding: 8 }}>{a.prenada && <span style={mkBadge("green")}>Preñada{a.fechaPartoEst ? ` · ${fc(a.fechaPartoEst)}` : ""}</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 12, color: C.textFaint, marginTop: 6 }}>{lista.length} animal{lista.length === 1 ? "" : "es"}</div>
      <BotonMostrarMas restantes={pag.restantes} onClick={pag.mostrarMas} paso={100} />
    </div>
  );
}

// ── Inventario: planilla potreros × categorías ─────────────────────────────
function Inventario({ resumen, ind }) {
  const cats = Object.keys(resumen.porCategoria).sort((a, b) => resumen.porCategoria[b] - resumen.porCategoria[a]);
  const pots = Object.keys(resumen.porPotrero).sort();
  if (!resumen.total) return <Empty icon="📋" title="Sin animales activos" />;
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ ...card({ padding: 0 }), overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr style={{ color: C.textMid, fontSize: 11, textTransform: "uppercase" }}>
            <th style={{ padding: 8, textAlign: "left" }}>Potrero</th>{cats.map(c => <th key={c} style={{ padding: 8, textAlign: "right" }}>{c}</th>)}<th style={{ padding: 8, textAlign: "right" }}>Total</th>
          </tr></thead>
          <tbody>
            {pots.map(p => <tr key={p} style={{ borderTop: `1px solid ${C.border}` }}>
              <td style={{ padding: 8, fontWeight: 700 }}>{p}</td>
              {cats.map(c => <td key={c} style={{ padding: 8, textAlign: "right" }}>{resumen.matriz[p]?.[c] || ""}</td>)}
              <td style={{ padding: 8, textAlign: "right", fontWeight: 800 }}>{resumen.porPotrero[p]}</td>
            </tr>)}
            <tr style={{ borderTop: `2px solid ${C.border}`, fontWeight: 800 }}>
              <td style={{ padding: 8 }}>Total</td>{cats.map(c => <td key={c} style={{ padding: 8, textAlign: "right" }}>{resumen.porCategoria[c]}</td>)}<td style={{ padding: 8, textAlign: "right" }}>{resumen.total}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10 }}>
        {[["Nacimientos del año", ind.nacimientos], ["Muertes del año", `${ind.muertes} (${ind.mortalidad}%)`], ["Vendidos del año", ind.vendidos], ["Ingresos por ventas", Bs(ind.ingresoVentas)]].map(([t, v]) => (
          <div key={t} style={card({ padding: 12 })}><div style={{ fontSize: 11, color: C.textMid, textTransform: "uppercase" }}>{t}</div><div style={{ fontSize: 20, fontWeight: 800 }}>{v}</div></div>
        ))}
      </div>
    </div>
  );
}

// ── Reproducción: partos próximos, preñadas, vacías ────────────────────────
function Reproduccion({ activos, hoy, onAbrir }) {
  const hembras = activos.filter(a => a.sexo === "H");
  const prenadas = hembras.filter(a => a.prenada || a.fechaPartoEst).sort((a, b) => String(a.fechaPartoEst || "9").localeCompare(String(b.fechaPartoEst || "9")));
  const vacias = hembras.filter(a => !a.prenada && !a.fechaPartoEst && ["Vaca", "Vaquilla", "Búfala", "Oveja", "Cabra", "Cerda", "Yegua", "Borrega", "Chiva", "Cachorra", "Potranca"].includes(categoriaAnimal(a, hoy)) && (a.partos > 0 || categoriaAnimal(a, hoy) !== "Ternera"));
  const recientes = activos.filter(a => a.origen === "NACIDO" && a.fechaNacimiento && diasEntre(a.fechaNacimiento, hoy) <= 120).sort((a, b) => (a.fechaNacimiento < b.fechaNacimiento ? 1 : -1));
  const Fila = ({ a, der }) => (
    <button onClick={() => onAbrir(a.id)} style={{ display: "flex", justifyContent: "space-between", gap: 8, width: "100%", padding: "7px 10px", border: "none", borderTop: `1px solid ${C.border}`, background: "none", cursor: "pointer", fontFamily: "inherit", color: C.text, fontSize: 13, textAlign: "left" }}>
      <span><strong>{a.codigo}</strong>{a.nombre ? ` · ${a.nombre}` : ""} <span style={{ color: C.textFaint }}>{categoriaAnimal(a, hoy)}{a.potrero ? ` · ${a.potrero}` : ""}</span></span>{der}
    </button>
  );
  const Caja = ({ titulo, children, vacio }) => <div style={{ ...card({ padding: 0 }), overflow: "hidden" }}><div style={{ padding: "10px 12px", fontWeight: 800 }}>{titulo}</div>{children}{vacio && <div style={{ padding: "8px 12px 12px", fontSize: 12, color: C.textFaint }}>{vacio}</div>}</div>;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 12, alignItems: "start" }}>
      <Caja titulo={`🤰 Preñadas (${prenadas.length})`} vacio={!prenadas.length && "Registra palpaciones o servicios para ver los partos esperados."}>
        {prenadas.map(a => { const d = a.fechaPartoEst ? diasEntre(hoy, a.fechaPartoEst) : null; return <Fila key={a.id} a={a} der={<span style={{ fontSize: 12, color: d != null && d <= 15 ? C.red : C.textMid, whiteSpace: "nowrap" }}>{a.fechaPartoEst ? `${fc(a.fechaPartoEst)} (${d < 0 ? `hace ${-d} d` : `en ${d} d`})` : "sin fecha"}</span>} />; })}
      </Caja>
      <Caja titulo={`🔁 Vientres vacíos (${vacias.length})`} vacio={!vacias.length && "No hay hembras vacías registradas."}>
        {vacias.slice(0, 200).map(a => <Fila key={a.id} a={a} der={<span style={{ fontSize: 12, color: C.textMid }}>{a.ultimoParto ? `últ. parto ${fc(a.ultimoParto)}` : `${a.partos} partos`}</span>} />)}
      </Caja>
      <Caja titulo={`🐮 Nacimientos recientes (${recientes.length})`} vacio={!recientes.length && "Sin nacimientos en los últimos 4 meses."}>
        {recientes.slice(0, 200).map(a => <Fila key={a.id} a={a} der={<span style={{ fontSize: 12, color: C.textMid }}>{fc(a.fechaNacimiento)} · {a.sexo === "M" ? "♂" : "♀"}</span>} />)}
      </Caja>
    </div>
  );
}

// ── Sanidad: próximas dosis agrupadas por producto y fecha ─────────────────
function Sanidad({ pendientes, porId, hoy, onJornada, onAbrir }) {
  const grupos = useMemo(() => {
    const m = new Map();
    pendientes.forEach(e => {
      const a = porId.get(e.animalId); if (!a || a.estado !== "ACTIVO") return;
      const k = `${e.tipo}|${e.detalle}|${e.proximaFecha}`;
      if (!m.has(k)) m.set(k, { tipo: e.tipo, detalle: e.detalle, fecha: e.proximaFecha, animales: [] });
      m.get(k).animales.push(a);
    });
    return [...m.values()].sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  }, [pendientes, porId]);
  if (!grupos.length) return <Empty icon="💉" title="Sin dosis programadas" sub="Al registrar una vacuna o desparasitación indica la “próxima fecha” y aparecerá aquí cuando se acerque." />;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {grupos.map(g => {
        const d = diasEntre(hoy, g.fecha);
        return (
          <div key={`${g.tipo}${g.detalle}${g.fecha}`} style={{ ...card({ padding: "10px 12px" }), borderLeft: `4px solid ${d < 0 ? C.red : d <= 7 ? C.amber : C.green}`, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontWeight: 700 }}>{TIPOS_EVENTO[g.tipo]?.[0]} {TIPOS_EVENTO[g.tipo]?.[1]}{g.detalle ? `: ${g.detalle}` : ""}</div>
              <div style={{ fontSize: 12, color: d < 0 ? C.red : C.textMid }}>{fc(g.fecha)} · {d < 0 ? `atrasada ${-d} días` : d === 0 ? "hoy" : `en ${d} días`} · {g.animales.length} animal{g.animales.length === 1 ? "" : "es"}</div>
              <div style={{ fontSize: 11, color: C.textFaint, marginTop: 2 }}>{g.animales.slice(0, 12).map(a => <button key={a.id} onClick={() => onAbrir(a.id)} style={{ background: "none", border: "none", padding: "0 4px 0 0", cursor: "pointer", color: "#111E7B", fontSize: 11, fontFamily: "inherit" }}>{a.codigo}</button>)}{g.animales.length > 12 ? `… +${g.animales.length - 12}` : ""}</div>
            </div>
            <button onClick={() => onJornada(g.animales.map(a => a.id), g.tipo, g.detalle)} style={{ ...mkBtn("primary"), padding: "6px 12px", fontSize: 12 }}>Registrar jornada</button>
          </div>
        );
      })}
    </div>
  );
}

// ── Ventas y bajas ─────────────────────────────────────────────────────────
function Bajas({ animales, onAbrir }) {
  const bajas = animales.filter(a => a.estado !== "ACTIVO").sort((a, b) => (String(a.fechaBaja) < String(b.fechaBaja) ? 1 : -1));
  const pag = useMostrarMas(bajas, 100, "");
  if (!bajas.length) return <Empty icon="📤" title="Sin ventas ni bajas en el último año" />;
  return (
    <div style={{ display: "grid", gap: 6 }}>
      {pag.visibles.map(a => (
        <button key={a.id} onClick={() => onAbrir(a.id)} style={{ ...card({ padding: "8px 12px" }), cursor: "pointer", fontFamily: "inherit", color: C.text, textAlign: "left", display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <span><strong>{a.codigo}</strong> · {a.raza || ESPECIES[a.especie]} <span style={{ color: C.textFaint }}>{fc(a.fechaBaja)}{a.motivoBaja ? ` · ${a.motivoBaja}` : ""}</span></span>
          <span style={{ display: "flex", gap: 8, alignItems: "center" }}>{a.precioVenta != null && <strong>{Bs(a.precioVenta)}</strong>}<span style={mkBadge(a.estado === "VENDIDO" ? "green" : a.estado === "MUERTO" ? "red" : "gray")}>{ESTADOS_ANIMAL[a.estado]}</span></span>
        </button>
      ))}
      <BotonMostrarMas restantes={pag.restantes} onClick={pag.mostrarMas} paso={100} />
    </div>
  );
}

// ── Alta / edición ─────────────────────────────────────────────────────────
function FormAnimal({ inicial, animales, potreros, razas, A, onClose, onGuardado }) {
  const [f, setF] = useState(inicial);
  const [ejecutar, ocupado] = useAccion();
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const editando = !!f.id;
  const hembras = useMemo(() => animales.filter(a => a.sexo === "H" && a.id !== f.id && a.especie === f.especie).sort((a, b) => String(a.codigo).localeCompare(String(b.codigo), "es", { numeric: true })), [animales, f.id, f.especie]);
  const machos = useMemo(() => animales.filter(a => a.sexo === "M" && a.id !== f.id && a.especie === f.especie).sort((a, b) => String(a.codigo).localeCompare(String(b.codigo), "es", { numeric: true })), [animales, f.id, f.especie]);
  const auto = categoriaAnimal({ ...f, categoria: null, partos: f.partos || 0 });
  const guardar = async () => {
    if (!f.codigo.trim()) { toast.error("Indica la caravana o número"); return; }
    const r = await ejecutar(() => A.guardarAnimal(f), { exito: editando ? "Animal actualizado" : "Animal registrado" });
    if (r) onGuardado(r);
  };
  return (
    <Modal title={editando ? `Editar ${inicial.codigo}` : "Nuevo animal"} onClose={() => !ocupado && onClose()} width={680}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10 }}>
        <div><label style={lbl}>Caravana / N° *</label><input style={inp} value={f.codigo} onChange={e => set("codigo", e.target.value)} autoFocus /></div>
        <div><label style={lbl}>Nombre</label><input style={inp} value={f.nombre} onChange={e => set("nombre", e.target.value)} placeholder="Opcional" /></div>
        <div><label style={lbl}>Especie</label><select style={inp} value={f.especie} onChange={e => set("especie", e.target.value)}>{Object.entries(ESPECIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div><label style={lbl}>Sexo *</label>
          <div style={{ display: "flex", gap: 4 }}>{[["H", "♀ Hembra"], ["M", "♂ Macho"]].map(([v, t]) => <button key={v} onClick={() => set("sexo", v)} style={{ ...mkBtn(f.sexo === v ? "primary" : "ghost"), flex: 1, justifyContent: "center", padding: "7px 6px" }}>{t}</button>)}</div>
        </div>
        <div><label style={lbl}>Nacimiento</label><input type="date" style={inp} value={f.fechaNacimiento} max={hoyStr()} onChange={e => set("fechaNacimiento", e.target.value)} /></div>
        <div><label style={lbl}>Raza</label><input style={inp} value={f.raza} onChange={e => set("raza", e.target.value)} list="hato-razas" placeholder="Nelore, Brahman, Criollo…" /><datalist id="hato-razas">{razas.map(r => <option key={r} value={r} />)}</datalist></div>
        <div><label style={lbl}>Color / señas</label><input style={inp} value={f.color} onChange={e => set("color", e.target.value)} /></div>
        <div><label style={lbl}>Marca (hierro)</label><input style={inp} value={f.marca} onChange={e => set("marca", e.target.value)} /></div>
        <div><label style={lbl}>Potrero</label><input style={inp} value={f.potrero} onChange={e => set("potrero", e.target.value)} list="hato-potreros" /><datalist id="hato-potreros">{potreros.map(p => <option key={p} value={p} />)}</datalist></div>
        <div><label style={lbl}>Categoría</label><select style={inp} value={f.categoria} onChange={e => set("categoria", e.target.value)}>
          <option value="">Automática ({auto})</option>{["Ternero", "Ternera", "Torillo", "Vaquilla", "Novillito", "Novillo", "Toro", "Vaca", "Vaca de descarte", "Buey"].map(c => <option key={c} value={c}>{c}</option>)}
        </select></div>
        {f.sexo === "M" && <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, alignSelf: "end", paddingBottom: 8 }}><input type="checkbox" checked={f.castrado} onChange={e => set("castrado", e.target.checked)} /> Castrado</label>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, marginTop: 10 }}>
        <div><label style={lbl}>Madre</label><select style={inp} value={f.madreId} onChange={e => set("madreId", e.target.value)}><option value="">—</option>{hembras.map(a => <option key={a.id} value={a.id}>{a.codigo}{a.nombre ? ` · ${a.nombre}` : ""}</option>)}</select></div>
        <div><label style={lbl}>Padre</label><select style={inp} value={f.padreId} onChange={e => set("padreId", e.target.value)}><option value="">— (otro / pajuela)</option>{machos.map(a => <option key={a.id} value={a.id}>{a.codigo}{a.nombre ? ` · ${a.nombre}` : ""}</option>)}</select></div>
        {!f.padreId && <div><label style={lbl}>Padre (texto)</label><input style={inp} value={f.padreTexto} onChange={e => set("padreTexto", e.target.value)} placeholder="Toro del vecino, pajuela…" /></div>}
      </div>
      {!editando && <>
        <div style={{ display: "flex", gap: 6, marginTop: 12 }}>{[["NACIDO", "🐮 Nació en la estancia"], ["COMPRADO", "🛒 Comprado"]].map(([v, t]) => <button key={v} onClick={() => set("origen", v)} style={{ ...mkBtn(f.origen === v ? "primary" : "ghost"), flex: 1, justifyContent: "center" }}>{t}</button>)}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10, marginTop: 10 }}>
          <div><label style={lbl}>{f.origen === "COMPRADO" ? "Fecha de compra" : "Fecha de registro"}</label><input type="date" style={inp} value={f.fechaIngreso} max={hoyStr()} onChange={e => set("fechaIngreso", e.target.value)} /></div>
          <div><label style={lbl}>Peso actual (kg)</label><input type="number" min="0" style={inp} value={f.peso} onChange={e => set("peso", e.target.value)} placeholder="Opcional" /></div>
          {f.origen === "COMPRADO" && <div><label style={lbl}>Precio de compra</label><input type="number" min="0" style={inp} value={f.precioCompra} onChange={e => set("precioCompra", e.target.value)} /></div>}
          {f.origen === "COMPRADO" && n(f.precioCompra) > 0 && <div><label style={lbl}>Pagado con</label><select style={inp} value={f.metodoPago} onChange={e => set("metodoPago", e.target.value)}>{METODOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></div>}
        </div>
        {f.origen === "COMPRADO" && n(f.precioCompra) > 0 && <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, marginTop: 8 }}><input type="checkbox" checked={f.registrarGasto} onChange={e => set("registrarGasto", e.target.checked)} /> Registrar el pago como egreso de caja (Compra de ganado)</label>}
      </>}
      <label style={{ ...lbl, marginTop: 10 }}>Notas</label>
      <input style={inp} value={f.notas} onChange={e => set("notas", e.target.value)} />
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
        <button onClick={onClose} style={mkBtn("ghost")}>Cancelar</button>
        <button onClick={guardar} disabled={ocupado} style={mkBtn("primary")}>{ocupado ? "Guardando…" : "Guardar"}</button>
      </div>
    </Modal>
  );
}

// ── Ficha: datos, genealogía, historial y registrar evento ────────────────
const EV_VACIO = tipo => ({ tipo, fecha: hoyStr(), valor: "", detalle: "", resultado: tipo === "PALPACION" ? "PRENADA" : tipo === "PARTO" ? "VIVO" : "", proximaFecha: "" });

function FichaAnimal({ animal: a, porId, animales, potreros, hoy, A, admin, onClose, onAbrir, onEditar, onVender, onBaja }) {
  const [eventos, setEventos] = useState([]);
  const [crias, setCrias] = useState([]);
  const [ev, setEv] = useState(null);
  const [ejecutar, ocupado] = useAccion();
  const activo = a.estado === "ACTIVO";
  useEffect(() => { A.eventosDeAnimal(a.id).then(setEventos).catch(() => {}); if (a.sexo === "H") A.criasDeAnimal(a.id).then(setCrias).catch(() => {}); }, [A, a.id, a.sexo, a.peso, a.partos, a.potrero, a.prenada]);
  const madre = a.madreId ? porId.get(a.madreId) : null;
  const padre = a.padreId ? porId.get(a.padreId) : null;
  const gdp = gananciaDiaria(a);
  const tipos = Object.keys(TIPOS_EVENTO).filter(t => a.sexo === "H" || !["SERVICIO", "PALPACION", "PARTO"].includes(t));

  const registrar = async () => {
    if (ev.tipo === "PARTO" && ev.resultado === "VIVO" && ev.cria && !ev.cria.codigo.trim()) { toast.error("Indica la caravana de la cría (o quita la cría)"); return; }
    const r = await ejecutar(() => A.eventoAnimal(a.id, ev), { exito: `${TIPOS_EVENTO[ev.tipo][1]} registrado` });
    if (r) { setEv(null); A.eventosDeAnimal(a.id).then(setEventos).catch(() => {}); }
  };
  const eliminar = async e => {
    if (!window.confirm(`¿Borrar el evento ${TIPOS_EVENTO[e.tipo][1]} del ${fc(e.fecha)}?`)) return;
    if (await ejecutar(() => A.eliminarEventoAnimal(a.id, e.id).then(() => true), { exito: "Evento borrado" })) setEventos(es => es.filter(x => x.id !== e.id));
  };
  const elegirTipo = t => setEv({ ...EV_VACIO(t), ...(t === "PARTO" ? { cria: { codigo: siguienteCodigo(animales), sexo: "H", peso: "", nombre: "", color: "", padreId: "", padreTexto: "" } } : {}) });

  return (
    <Modal title={`${a.codigo}${a.nombre ? ` · ${a.nombre}` : ""}`} onClose={onClose} width={760}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ fontSize: 13, lineHeight: 1.7 }}>
          <div><strong>{a.sexo === "M" ? "♂" : "♀"} {categoriaAnimal(a, hoy)}</strong> · {ESPECIES[a.especie]}{a.raza ? ` ${a.raza}` : ""}{a.color ? ` · ${a.color}` : ""}{a.castrado ? " · castrado" : ""}</div>
          <div>Edad: {edadTxt(a.fechaNacimiento, hoy)}{a.fechaNacimiento ? ` (nació ${fc(a.fechaNacimiento)})` : ""} · {a.origen === "COMPRADO" ? `Comprado ${fc(a.fechaIngreso)}${a.precioCompra ? ` en ${Bs(a.precioCompra)}` : ""}` : "Nacido en la estancia"}</div>
          <div>Potrero: <strong>{a.potrero || "—"}</strong>{a.marca ? ` · Marca: ${a.marca}` : ""}</div>
          <div>Peso: <strong>{kg(a.peso)}</strong>{a.fechaPeso ? ` (${fc(a.fechaPeso)})` : ""}{gdp != null && <span style={{ color: gdp >= 0 ? C.green : C.red }}> · {gdp >= 0 ? "+" : ""}{gdp} kg/día</span>}</div>
          {a.sexo === "H" && <div>{a.prenada ? <span style={{ color: C.green, fontWeight: 700 }}>Preñada{a.fechaPartoEst ? ` · parto estimado ${fc(a.fechaPartoEst)}` : ""}</span> : a.fechaPartoEst ? `Servida · parto posible ${fc(a.fechaPartoEst)}` : "Vacía"} · {a.partos} parto{a.partos === 1 ? "" : "s"}{a.ultimoParto ? ` (último ${fc(a.ultimoParto)})` : ""}</div>}
          {!activo && <div style={{ color: C.red }}>{ESTADOS_ANIMAL[a.estado]} el {fc(a.fechaBaja)}{a.motivoBaja ? ` · ${a.motivoBaja}` : ""}{a.precioVenta != null ? ` · ${Bs(a.precioVenta)}` : ""}</div>}
          {a.notas && <div style={{ color: C.textFaint }}>Notas: {a.notas}</div>}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "flex-start", flexWrap: "wrap" }}>
          {activo && <button onClick={onEditar} style={{ ...mkBtn("ghost"), padding: "5px 10px", fontSize: 12 }}>Editar</button>}
          {activo && <button onClick={onVender} style={{ ...mkBtn("ghost"), padding: "5px 10px", fontSize: 12 }}>💵 Vender</button>}
          {activo && <button onClick={onBaja} style={{ ...mkBtn("danger"), padding: "5px 10px", fontSize: 12 }}>Baja</button>}
          {!activo && admin && <button onClick={() => window.confirm(`¿Reactivar ${a.codigo}? (si fue vendido, primero anula la venta)`) && ejecutar(() => A.reactivarAnimal(a.id), { exito: "Animal reactivado" })} disabled={ocupado} style={{ ...mkBtn("ghost"), padding: "5px 10px", fontSize: 12 }}>Reactivar</button>}
        </div>
      </div>

      {(madre || padre || a.padreTexto || crias.length > 0) && <div style={{ padding: 10, borderRadius: 10, background: "var(--color-bg-primary)", fontSize: 13, marginBottom: 12 }}>
        {madre && <span>Madre: <button onClick={() => onAbrir(madre.id)} style={{ background: "none", border: "none", padding: 0, color: "#111E7B", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{madre.codigo}</button> · </span>}
        {(padre || a.padreTexto) && <span>Padre: {padre ? <button onClick={() => onAbrir(padre.id)} style={{ background: "none", border: "none", padding: 0, color: "#111E7B", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{padre.codigo}</button> : a.padreTexto} · </span>}
        {crias.length > 0 && <span>Crías ({crias.length}): {crias.map(c => <button key={c.id} onClick={() => porId.has(c.id) && onAbrir(c.id)} style={{ background: "none", border: "none", padding: "0 4px", color: c.estado === "ACTIVO" ? "#111E7B" : C.textFaint, cursor: "pointer", fontFamily: "inherit" }}>{c.codigo}{c.estado !== "ACTIVO" ? ` (${ESTADOS_ANIMAL[c.estado].toLowerCase()})` : ""}</button>)}</span>}
      </div>}

      {activo && !ev && <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {tipos.map(t => <button key={t} onClick={() => elegirTipo(t)} style={{ ...mkBtn("ghost"), padding: "5px 10px", fontSize: 12 }}>{TIPOS_EVENTO[t][0]} {TIPOS_EVENTO[t][1]}</button>)}
      </div>}
      {ev && <div style={{ padding: 12, borderRadius: 10, border: "1.5px solid #22C5FE", marginBottom: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>{TIPOS_EVENTO[ev.tipo][0]} {TIPOS_EVENTO[ev.tipo][1]}</div>
        <CamposEvento ev={ev} setEv={setEv} potreros={potreros} animales={animales} especie={a.especie} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
          <button onClick={() => setEv(null)} style={mkBtn("ghost")}>Cancelar</button>
          <button onClick={registrar} disabled={ocupado} style={mkBtn("primary")}>{ocupado ? "Guardando…" : "Registrar"}</button>
        </div>
      </div>}

      <label style={lbl}>Historial ({eventos.length})</label>
      {eventos.length === 0 ? <div style={{ fontSize: 12, color: C.textFaint }}>Sin eventos todavía.</div>
        : <div style={{ display: "grid", gap: 2, maxHeight: 320, overflowY: "auto" }}>
          {eventos.map(e => (
            <div key={e.id} style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 13, padding: "5px 0", borderBottom: `1px solid ${C.border}` }}>
              <span style={{ color: C.textFaint, minWidth: 78 }}>{fc(e.fecha)}</span>
              <span style={{ flex: 1 }}>{TIPOS_EVENTO[e.tipo]?.[0]} <strong>{TIPOS_EVENTO[e.tipo]?.[1]}</strong>
                {e.tipo === "PESAJE" || e.tipo === "DESTETE" ? (e.valor ? ` · ${kg(e.valor)}` : "") : e.tipo === "PALPACION" ? ` · ${e.resultado === "PRENADA" ? `preñada${e.valor ? ` (${e.valor} meses)` : ""}` : "vacía"}` : ""}
                {e.tipo === "PARTO" ? ` · ${e.resultado === "MUERTO" ? "cría muerta" : "cría viva"}` : ""}
                {e.detalle ? ` · ${e.detalle}` : ""}
                {e.proximaFecha && <span style={{ color: e.proximaCumplida ? C.textFaint : C.amber }}> · próxima {fc(e.proximaFecha)}{e.proximaCumplida ? " ✓" : ""}</span>}
              </span>
              {admin && <button onClick={() => eliminar(e)} aria-label="Borrar evento" style={{ background: "none", border: "none", color: C.red, cursor: "pointer", opacity: 0.6 }}><Trash2 size={13} /></button>}
            </div>
          ))}
        </div>}
    </Modal>
  );
}

function CamposEvento({ ev, setEv, potreros, animales, especie, masivo = false }) {
  const set = (k, v) => setEv(x => ({ ...x, [k]: v }));
  const sanitario = ["VACUNA", "DESPARASITACION", "TRATAMIENTO"].includes(ev.tipo);
  const machos = useMemo(() => (animales || []).filter(a => a.sexo === "M" && a.estado === "ACTIVO" && a.especie === especie), [animales, especie]);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
      <div><label style={lbl}>Fecha</label><input type="date" style={inp} value={ev.fecha} max={hoyStr()} onChange={e => set("fecha", e.target.value)} /></div>
      {(ev.tipo === "PESAJE" || ev.tipo === "DESTETE") && !masivo && <div><label style={lbl}>Peso (kg){ev.tipo === "PESAJE" ? " *" : ""}</label><input type="number" min="0" style={inp} value={ev.valor} onChange={e => set("valor", e.target.value)} autoFocus /></div>}
      {sanitario && <div style={{ gridColumn: "span 2" }}><label style={lbl}>Producto y dosis</label><input style={inp} value={ev.detalle} onChange={e => set("detalle", e.target.value)} placeholder={ev.tipo === "VACUNA" ? "Aftosa, Rabia, Carbunclo…" : ev.tipo === "DESPARASITACION" ? "Ivermectina 1%, 5 ml…" : "Diagnóstico y medicamento"} /></div>}
      {sanitario && <div><label style={lbl}>Próxima dosis</label><input type="date" style={inp} value={ev.proximaFecha} min={hoyStr()} onChange={e => set("proximaFecha", e.target.value)} /></div>}
      {ev.tipo === "TRASLADO" && <div style={{ gridColumn: "span 2" }}><label style={lbl}>Potrero destino *</label><input style={inp} value={ev.detalle} onChange={e => set("detalle", e.target.value)} list="hato-potreros-ev" /><datalist id="hato-potreros-ev">{potreros.map(p => <option key={p} value={p} />)}</datalist></div>}
      {ev.tipo === "SERVICIO" && <div style={{ gridColumn: "span 2" }}><label style={lbl}>Toro / pajuela</label><input style={inp} value={ev.detalle} onChange={e => set("detalle", e.target.value)} list="hato-toros" placeholder="Monta natural con…, inseminación con…" /><datalist id="hato-toros">{machos.map(m => <option key={m.id} value={`Toro ${m.codigo}`} />)}</datalist></div>}
      {ev.tipo === "PALPACION" && <>
        <div><label style={lbl}>Resultado</label><select style={inp} value={ev.resultado} onChange={e => set("resultado", e.target.value)}><option value="PRENADA">Preñada</option><option value="VACIA">Vacía</option></select></div>
        {ev.resultado === "PRENADA" && <div><label style={lbl}>Meses de preñez</label><input type="number" min="1" max="10" step="0.5" style={inp} value={ev.valor} onChange={e => set("valor", e.target.value)} placeholder="Ej: 3" /></div>}
      </>}
      {ev.tipo === "PARTO" && <div><label style={lbl}>Cría</label><select style={inp} value={ev.resultado} onChange={e => set("resultado", e.target.value)}><option value="VIVO">Nació viva</option><option value="MUERTO">Nació muerta / aborto</option></select></div>}
      {(ev.tipo === "NOTA" || ev.tipo === "DESTETE" || ev.tipo === "PARTO") && <div style={{ gridColumn: "span 2" }}><label style={lbl}>{ev.tipo === "NOTA" ? "Nota *" : "Observaciones"}</label><input style={inp} value={ev.detalle} onChange={e => set("detalle", e.target.value)} /></div>}
      {ev.tipo === "PARTO" && ev.resultado === "VIVO" && ev.cria && <div style={{ gridColumn: "1 / -1", padding: 10, borderRadius: 10, background: "var(--color-bg-primary)" }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Registrar la cría en el hato</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 8 }}>
          <input style={inp} value={ev.cria.codigo} onChange={e => set("cria", { ...ev.cria, codigo: e.target.value })} placeholder="Caravana" aria-label="Caravana de la cría" />
          <select style={inp} value={ev.cria.sexo} onChange={e => set("cria", { ...ev.cria, sexo: e.target.value })} aria-label="Sexo de la cría"><option value="H">♀ Hembra</option><option value="M">♂ Macho</option></select>
          <input type="number" min="0" style={inp} value={ev.cria.peso} onChange={e => set("cria", { ...ev.cria, peso: e.target.value })} placeholder="Peso kg" aria-label="Peso de la cría" />
          <select style={inp} value={ev.cria.padreId} onChange={e => set("cria", { ...ev.cria, padreId: e.target.value })} aria-label="Padre"><option value="">Padre: —</option>{machos.map(m => <option key={m.id} value={m.id}>{m.codigo}</option>)}</select>
        </div>
        <button onClick={() => set("cria", null)} style={{ ...mkBtn("ghost"), padding: "3px 8px", fontSize: 11, marginTop: 6 }}>No registrar la cría ahora</button>
      </div>}
    </div>
  );
}

// ── Jornada: el mismo evento a varios animales ─────────────────────────────
function Jornada({ inicial, activos, potreros, A, onClose, onHecho }) {
  const [ev, setEv] = useState(() => ({ ...EV_VACIO(inicial.tipo || "VACUNA"), detalle: inicial.detalle || "" }));
  const [sel, setSel] = useState(() => new Set(inicial.ids || []));
  const [pesos, setPesos] = useState({});
  const [q, setQ] = useState("");
  const [ejecutar, ocupado] = useAccion();
  const conPeso = ev.tipo === "PESAJE" || ev.tipo === "DESTETE";
  const visibles = useMemo(() => { const t = norm(q.trim()); return activos.filter(a => !t || norm(`${a.codigo} ${a.nombre} ${a.potrero}`).includes(t)).sort((a, b) => String(a.codigo).localeCompare(String(b.codigo), "es", { numeric: true })); }, [activos, q]);
  const alternar = id => setSel(s => { const x = new Set(s); if (x.has(id)) x.delete(id); else x.add(id); return x; });
  const elegidos = activos.filter(a => sel.has(a.id));
  const guardar = async () => {
    if (!elegidos.length) { toast.error("Elige al menos un animal"); return; }
    if (ev.tipo === "TRASLADO" && !ev.detalle.trim()) { toast.error("Indica el potrero de destino"); return; }
    if (ev.tipo === "NOTA" && !ev.detalle.trim()) { toast.error("Escribe la nota"); return; }
    let items = elegidos.map(a => ({ id: a.id, valor: conPeso ? pesos[a.id] ?? "" : "" }));
    if (conPeso) {
      items = items.filter(i => n(i.valor) > 0);
      if (!items.length) { toast.error("Anota el peso de al menos un animal"); return; }
      if (items.length < elegidos.length && !window.confirm(`${elegidos.length - items.length} animal(es) sin peso no se registrarán. ¿Continuar?`)) return;
    }
    const r = await ejecutar(() => A.eventoMasivo(items, ev));
    if (r) { toast.success(`${TIPOS_EVENTO[ev.tipo][1]}: ${r.registrados} animal${r.registrados === 1 ? "" : "es"}`); onHecho(); }
  };
  return (
    <Modal title="Jornada: registrar a varios animales" onClose={() => !ocupado && onClose()} width={760}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {MASIVOS.map(t => <button key={t} onClick={() => setEv(x => ({ ...EV_VACIO(t), fecha: x.fecha }))} style={{ ...mkBtn(ev.tipo === t ? "primary" : "ghost"), padding: "5px 10px", fontSize: 12 }}>{TIPOS_EVENTO[t][0]} {TIPOS_EVENTO[t][1]}</button>)}
      </div>
      <CamposEvento ev={ev} setEv={setEv} potreros={potreros} masivo />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", margin: "12px 0 8px" }}>
        <strong style={{ fontSize: 13 }}>{sel.size} animal{sel.size === 1 ? "" : "es"}</strong>
        {potreros.map(p => <button key={p} onClick={() => setSel(s => new Set([...s, ...activos.filter(a => a.potrero === p).map(a => a.id)]))} style={{ ...mkBtn("ghost"), padding: "3px 8px", fontSize: 11 }}>+ {p}</button>)}
        <button onClick={() => setSel(new Set(activos.map(a => a.id)))} style={{ ...mkBtn("ghost"), padding: "3px 8px", fontSize: 11 }}>+ Todo el hato</button>
        <button onClick={() => setSel(new Set())} style={{ ...mkBtn("ghost"), padding: "3px 8px", fontSize: 11 }}>Ninguno</button>
      </div>
      <input style={{ ...inp, marginBottom: 6 }} value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar caravana…" aria-label="Buscar animal" />
      <div style={{ maxHeight: 300, overflowY: "auto", border: `1px solid ${C.border}`, borderRadius: 10 }}>
        {(conPeso ? [...elegidos, ...visibles.filter(a => !sel.has(a.id))] : visibles).slice(0, 400).map(a => (
          <div key={a.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "5px 10px", borderTop: `1px solid ${C.border}`, fontSize: 13 }}>
            <input type="checkbox" checked={sel.has(a.id)} onChange={() => alternar(a.id)} aria-label={`Incluir ${a.codigo}`} />
            <span style={{ flex: 1 }}><strong>{a.codigo}</strong> <span style={{ color: C.textFaint }}>{a.potrero || ""}{a.peso ? ` · últ. ${kg(a.peso)}` : ""}</span></span>
            {conPeso && sel.has(a.id) && <input type="number" min="0" style={{ ...inp, width: 90, padding: "4px 6px" }} value={pesos[a.id] ?? ""} onChange={e => setPesos(p => ({ ...p, [a.id]: e.target.value }))} placeholder="kg" aria-label={`Peso de ${a.codigo}`} />}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
        <button onClick={onClose} style={mkBtn("ghost")}>Cancelar</button>
        <button onClick={guardar} disabled={ocupado || !sel.size} style={mkBtn("primary")}>{ocupado ? "Registrando…" : `Registrar a ${sel.size}`}</button>
      </div>
    </Modal>
  );
}

// ── Venta (por cabeza o por kg) ────────────────────────────────────────────
function VentaAnimales({ ids, porId, D, A, config, onClose, onHecho }) {
  const lista = ids.map(id => porId.get(id)).filter(a => a && a.estado === "ACTIVO");
  const [modo, setModo] = useState("cabeza");
  const [unitario, setUnitario] = useState("");
  const [precios, setPrecios] = useState({});
  const [clienteId, setClienteId] = useState("");
  const [comprador, setComprador] = useState("");
  const [metodo, setMetodo] = useState("efectivo");
  const [monto, setMonto] = useState("");
  const [ejecutar, ocupado] = useAccion();
  const precioDe = a => (precios[a.id] !== undefined && precios[a.id] !== "" ? n(precios[a.id]) : modo === "kg" ? (a.peso ? Math.round(a.peso * n(unitario) * 100) / 100 : 0) : n(unitario));
  const total = lista.reduce((s, a) => s + precioDe(a), 0);
  const pago = monto === "" ? total : Math.min(n(monto), total);
  const kilos = lista.reduce((s, a) => s + (a.peso || 0), 0);
  const confirmar = async () => {
    if (lista.some(a => precioDe(a) <= 0) && !window.confirm("Hay animales con precio 0. ¿Continuar?")) return;
    if (pago < total - 0.005 && !clienteId) { toast.error("Para dejar saldo pendiente elige un cliente registrado"); return; }
    const cli = D.customers.find(c => c.id === clienteId);
    const r = await ejecutar(() => A.venderAnimales({ items: lista.map(a => ({ id: a.id, precio: precioDe(a) })), customerId: clienteId || null, customerName: cli?.name || comprador || null,
      notas: `Venta de ${lista.length} animal${lista.length === 1 ? "" : "es"}${modo === "kg" ? ` · ${Math.round(kilos)} kg a ${Bs(n(unitario))}/kg` : ""}`, pagos: [{ amount: pago, method: metodo }] }), { exito: "Venta registrada" });
    if (!r) return;
    if (r.sale && window.confirm(`Venta N° ${r.sale.numero || r.venta?.numero} registrada. ¿Imprimir comprobante?`)) imprimirTicket({ sale: r.sale, config, ancho: leerAnchoTicket(), simbolo: getCurrencySymbol() });
    onHecho();
  };
  return (
    <Modal title={`Vender ${lista.length} animal${lista.length === 1 ? "" : "es"}`} onClose={() => !ocupado && onClose()} width={640}>
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {[["cabeza", "Por cabeza"], ["kg", "Por kilo (peso vivo)"]].map(([v, t]) => <button key={v} onClick={() => setModo(v)} style={{ ...mkBtn(modo === v ? "primary" : "ghost"), flex: 1, justifyContent: "center" }}>{t}</button>)}
      </div>
      <div style={row()}>
        <div style={{ flex: 1 }}><label style={lbl}>{modo === "kg" ? "Precio por kg" : "Precio por cabeza"}</label><input type="number" min="0" style={inp} value={unitario} onChange={e => { setUnitario(e.target.value); setPrecios({}); }} autoFocus /></div>
        {modo === "kg" && <div style={{ flex: 1, fontSize: 12, color: C.textMid, alignSelf: "end", paddingBottom: 8 }}>{Math.round(kilos)} kg en total (último pesaje)</div>}
      </div>
      <div style={{ maxHeight: 240, overflowY: "auto", border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 10 }}>
        {lista.map(a => (
          <div key={a.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "5px 10px", borderTop: `1px solid ${C.border}`, fontSize: 13 }}>
            <span style={{ flex: 1 }}><strong>{a.codigo}</strong> <span style={{ color: C.textFaint }}>{categoriaAnimal(a)}{a.peso ? ` · ${kg(a.peso)}` : modo === "kg" ? " · sin peso" : ""}</span></span>
            <input type="number" min="0" style={{ ...inp, width: 110, padding: "4px 6px" }} value={precios[a.id] ?? ""} onChange={e => setPrecios(p => ({ ...p, [a.id]: e.target.value }))} placeholder={precioDe(a).toFixed(2)} aria-label={`Precio de ${a.codigo}`} />
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
        <div><label style={lbl}>Cliente</label><select style={inp} value={clienteId} onChange={e => setClienteId(e.target.value)}><option value="">— (comprador ocasional)</option>{D.customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        {!clienteId && <div><label style={lbl}>Comprador</label><input style={inp} value={comprador} onChange={e => setComprador(e.target.value)} placeholder="Nombre" /></div>}
        <div><label style={lbl}>Método</label><select style={inp} value={metodo} onChange={e => setMetodo(e.target.value)}>{METODOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></div>
        <div><label style={lbl}>Paga ahora</label><input type="number" min="0" style={inp} value={monto} onChange={e => setMonto(e.target.value)} placeholder={total.toFixed(2)} /></div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
        <div style={{ fontSize: 14 }}>Total: <strong style={{ fontSize: 18 }}>{Bs(total)}</strong>{pago < total - 0.005 && <span style={{ color: C.red, marginLeft: 8 }}>saldo {Bs(total - pago)}</span>}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={mkBtn("ghost")}>Cancelar</button>
          <button onClick={confirmar} disabled={ocupado || !lista.length} style={mkBtn("primary")}>{ocupado ? "Guardando…" : "Confirmar venta"}</button>
        </div>
      </div>
    </Modal>
  );
}

// ── Baja: muerte, consumo propio, pérdida/robo ─────────────────────────────
function BajaAnimales({ ids, porId, A, onClose, onHecho }) {
  const lista = ids.map(id => porId.get(id)).filter(a => a && a.estado === "ACTIVO");
  const [tipo, setTipo] = useState("MUERTO");
  const [fecha, setFecha] = useState(hoyStr());
  const [motivo, setMotivo] = useState("");
  const [ejecutar, ocupado] = useAccion();
  const confirmar = async () => {
    if (!window.confirm(`¿Dar de baja ${lista.length} animal${lista.length === 1 ? "" : "es"} como "${ESTADOS_ANIMAL[tipo].toLowerCase()}"?`)) return;
    const r = await ejecutar(() => A.bajaAnimales(lista.map(a => a.id), tipo, fecha, motivo), { exito: "Baja registrada" });
    if (r) onHecho();
  };
  return (
    <Modal title={`Dar de baja: ${lista.map(a => a.codigo).slice(0, 6).join(", ")}${lista.length > 6 ? "…" : ""}`} onClose={() => !ocupado && onClose()} width={480}>
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        {["MUERTO", "CONSUMO", "PERDIDO"].map(t => <button key={t} onClick={() => setTipo(t)} style={{ ...mkBtn(tipo === t ? "primary" : "ghost"), flex: 1, justifyContent: "center" }}>{ESTADOS_ANIMAL[t]}</button>)}
      </div>
      <div style={row()}>
        <div style={{ flex: 1 }}><label style={lbl}>Fecha</label><input type="date" style={inp} value={fecha} max={hoyStr()} onChange={e => setFecha(e.target.value)} /></div>
      </div>
      <label style={lbl}>Motivo</label>
      <input style={inp} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder={tipo === "MUERTO" ? "Causa: rayo, enfermedad, parto…" : tipo === "CONSUMO" ? "Carneada para la estancia…" : "Abigeato, extraviado…"} />
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
        <button onClick={onClose} style={mkBtn("ghost")}>Cancelar</button>
        <button onClick={confirmar} disabled={ocupado || !lista.length} style={mkBtn("danger")}>Dar de baja</button>
      </div>
    </Modal>
  );
}
