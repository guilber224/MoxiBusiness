import { useRef, useState } from "react";
import { Download, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle } from "lucide-react";
import { PLANTILLAS, mapearEncabezados, prepararFilas } from "../utils/importar.js";
import { xlsx } from "../utils/xlsxExport.js";
import { C } from "../theme.jsx";
import { card, mkBtn, mkBadge } from "../styles.js";
import { Modal } from "./ui/Modal.jsx";

/**
 * Importar productos o clientes desde Excel/CSV:
 * plantilla → elegir archivo → vista previa con errores → importar (todo o nada en el servidor).
 * Se usa como modal (onClose) o incrustado en el asistente de inicio (incrustado).
 */
export function ImportarExcel({ tipo, A, onClose, onListo, incrustado = false }) {
  const P = PLANTILLAS[tipo];
  const fileRef = useRef(null);
  const [archivo, setArchivo] = useState(null);
  const [filas, setFilas] = useState(null);       // [{ fila, datos, errores }]
  const [faltan, setFaltan] = useState([]);
  const [actualizar, setActualizar] = useState(false);
  const [leyendo, setLeyendo] = useState(false);
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [err, setErr] = useState("");

  const validas = (filas || []).filter(f => f.errores.length === 0);
  const conError = (filas || []).filter(f => f.errores.length > 0);

  const descargarPlantilla = async () => {
    const instrucciones = P.columnas.map(c => ({ Columna: c.encabezado, Obligatoria: c.requerido ? "Sí" : "No", "Qué poner": c.numero ? "Solo números (ej: 12.50)" : "Texto" }));
    await xlsx([{ name: P.titulo, data: P.ejemplo }, { name: "Instrucciones", data: instrucciones }], `plantilla_${P.titulo}_moxi.xlsx`);
  };

  const leer = async file => {
    if (!file) return;
    setErr(""); setResultado(null); setFilas(null); setArchivo(file); setLeyendo(true);
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error("El archivo es muy pesado (máximo 10 MB)");
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const hoja = wb.Sheets[wb.SheetNames[0]];
      const tabla = XLSX.utils.sheet_to_json(hoja, { header: 1, raw: true, defval: "" });
      // El encabezado es la primera fila con al menos 2 celdas con texto (algunos archivos traen un título arriba)
      const iEnc = tabla.findIndex(r => r.filter(c => String(c).trim() !== "").length >= 2);
      if (iEnc < 0) throw new Error("No encontramos datos en la primera hoja del archivo");
      const { mapa, faltan: f } = mapearEncabezados(tabla[iEnc], tipo);
      setFaltan(f);
      if (f.length) { setFilas([]); return; }
      const datos = prepararFilas(tabla.slice(iEnc + 1), mapa, tipo).map(x => ({ ...x, fila: x.fila + iEnc }));
      if (datos.length > P.limite) throw new Error(`El archivo tiene ${datos.length} filas. Máximo ${P.limite} por importación: divídelo en partes.`);
      setFilas(datos);
    } catch (e) {
      setErr(e.message || "No se pudo leer el archivo. Usa .xlsx, .xls o .csv");
    } finally { setLeyendo(false); }
  };

  const importar = async () => {
    if (!validas.length) return;
    setImportando(true); setErr("");
    try {
      const datos = validas.map(f => f.datos);
      const r = tipo === "productos" ? await A.importarProductos(datos, actualizar) : await A.importarClientes(datos, actualizar);
      // Los errores del servidor vienen por posición dentro de las filas enviadas: se traducen a la fila del Excel
      const errores = (r.errores || []).map(e => ({ ...e, fila: validas[e.fila - 1]?.fila ?? e.fila }));
      setResultado({ ...r, errores });
      onListo?.(r);
    } catch (e) { setErr(e.message); } finally { setImportando(false); }
  };

  const contenido = (
    <div>
      {!resultado && <>
        <div style={{ display: "grid", gap: 10, marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: 12, background: "var(--color-bg-primary)", borderRadius: 10 }}>
            <span style={{ fontWeight: 800, color: "#111E7B" }}>1</span>
            <div style={{ flex: 1, fontSize: 13 }}>
              Descarga la plantilla y llénala (o usa tu propio Excel: reconocemos columnas como <em>Producto, Precio, Stock, Código</em>).
              {tipo === "productos" && <div style={{ fontSize: 12, color: C.textFaint, marginTop: 4 }}>Opcional: columnas <strong>Talla / Color / Sabor</strong> (cada fila es una variante del mismo producto) y <strong>Lote / Vencimiento</strong> (cada fila es un lote).</div>}
              <div style={{ marginTop: 8 }}><button onClick={descargarPlantilla} style={mkBtn("ghost")}><Download size={14} /> Descargar plantilla</button></div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: 12, background: "var(--color-bg-primary)", borderRadius: 10 }}>
            <span style={{ fontWeight: 800, color: "#111E7B" }}>2</span>
            <div style={{ flex: 1, fontSize: 13 }}>
              Sube tu archivo (.xlsx, .xls o .csv). Revisaremos cada fila antes de guardar.
              <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <button onClick={() => fileRef.current?.click()} disabled={leyendo} style={mkBtn("primary")}><Upload size={14} /> {archivo ? "Elegir otro archivo" : "Elegir archivo"}</button>
                {archivo && <span style={{ fontSize: 12, color: C.textFaint }}><FileSpreadsheet size={12} /> {archivo.name}</span>}
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={e => { leer(e.target.files?.[0]); e.target.value = ""; }} />
              </div>
            </div>
          </div>
        </div>

        {leyendo && <div style={{ fontSize: 13, color: C.textFaint }}>Leyendo archivo…</div>}

        {faltan.length > 0 && <div style={{ color: C.red, fontSize: 13, marginBottom: 10 }}>
          No encontramos la(s) columna(s) obligatoria(s): <strong>{faltan.join(", ")}</strong>. Revisa que la primera fila tenga los encabezados, o usa la plantilla.
        </div>}

        {filas && filas.length > 0 && <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <span style={mkBadge("green")}>{validas.length} listas para importar</span>
            {conError.length > 0 && <span style={mkBadge("red")}>{conError.length} con errores (se omiten)</span>}
          </div>
          <div style={{ maxHeight: 260, overflow: "auto", border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead style={{ position: "sticky", top: 0, background: "var(--color-bg-surface)" }}>
                <tr>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Fila</th>
                  {filas.some(f => f.datos.variante) && <th style={{ textAlign: "left", padding: "6px 8px" }}>Variante</th>}
                  {P.columnas.filter(c => filas.some(f => f.datos[c.campo])).map(c => <th key={c.campo} style={{ textAlign: "left", padding: "6px 8px", whiteSpace: "nowrap" }}>{c.encabezado}</th>)}
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {[...conError, ...validas].slice(0, 200).map(f => (
                  <tr key={f.fila} style={{ borderTop: `1px solid ${C.border}`, background: f.errores.length ? "rgba(239,68,68,0.06)" : undefined }}>
                    <td style={{ padding: "5px 8px", color: C.textFaint }}>{f.fila}</td>
                    {filas.some(x => x.datos.variante) && <td style={{ padding: "5px 8px", whiteSpace: "nowrap", fontWeight: 600 }}>{(f.datos.variante || []).map(v => v.valor).join(" / ")}</td>}
                    {P.columnas.filter(c => filas.some(x => x.datos[c.campo])).map(c => <td key={c.campo} style={{ padding: "5px 8px", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.datos[c.campo]}</td>)}
                    <td style={{ padding: "5px 8px", color: f.errores.length ? C.red : C.green, whiteSpace: "nowrap" }}>{f.errores.length ? f.errores.join(" · ") : "OK"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filas.length > 200 && <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 8 }}>Mostrando las primeras 200 filas (primero las que tienen errores).</div>}
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, cursor: "pointer", marginBottom: 12 }}>
            <input type="checkbox" checked={actualizar} onChange={e => setActualizar(e.target.checked)} />
            Si {tipo === "productos" ? "un producto" : "un cliente"} ya existe (mismo {tipo === "productos" ? "código o nombre" : "NIT o nombre"}), actualizar sus datos{tipo === "productos" ? " y su stock" : ""}
          </label>
        </>}
        {filas && filas.length === 0 && !faltan.length && <div style={{ fontSize: 13, color: C.textFaint }}>El archivo no tiene filas con datos.</div>}
        {err && <div style={{ color: C.red, fontSize: 13, marginBottom: 10 }}>{err}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          {!incrustado && <button onClick={onClose} style={mkBtn("ghost")}>Cancelar</button>}
          <button onClick={importar} disabled={importando || !validas.length} style={{ ...mkBtn("primary"), opacity: importando || !validas.length ? 0.6 : 1 }}>
            {importando ? "Importando…" : `Importar ${validas.length || ""} ${P.titulo}`}
          </button>
        </div>
      </>}

      {resultado && <div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
          <CheckCircle2 size={26} color={C.green} />
          <div style={{ fontWeight: 800, fontSize: 16 }}>Importación terminada</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 8, marginBottom: 12 }}>
          {[["Nuevos", resultado.creados, C.green], ["Actualizados", resultado.actualizados, "#111E7B"], ...(resultado.variantes ? [["Variantes nuevas", resultado.variantes, C.green]] : []), ...(resultado.lotes ? [["Lotes ingresados", resultado.lotes, C.green]] : []), ["Ya existían (omitidos)", resultado.omitidos, C.textMid], ...(resultado.categorias_nuevas ? [["Categorías nuevas", resultado.categorias_nuevas, C.textMid]] : [])].map(([t, v, col]) => (
            <div key={t} style={{ ...card(), padding: 12 }}><div style={{ fontSize: 22, fontWeight: 800, color: col }}>{v || 0}</div><div style={{ fontSize: 12, color: C.textFaint }}>{t}</div></div>
          ))}
        </div>
        {resultado.errores?.length > 0 && <div style={{ fontSize: 12, color: C.red, marginBottom: 12 }}>
          <AlertTriangle size={13} /> {resultado.errores.length} fila(s) no se importaron: {resultado.errores.slice(0, 8).map(e => `fila ${e.fila} (${e.error})`).join(", ")}{resultado.errores.length > 8 ? "…" : ""}
        </div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={() => { setResultado(null); setFilas(null); setArchivo(null); }} style={mkBtn("ghost")}>Importar otro archivo</button>
          {!incrustado && <button onClick={onClose} style={mkBtn("primary")}>Listo</button>}
        </div>
      </div>}
    </div>
  );

  return incrustado ? contenido : <Modal title={`Importar ${P.titulo} desde Excel`} onClose={onClose} width={760}>{contenido}</Modal>;
}
