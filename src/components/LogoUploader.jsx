import { useState, useEffect, useRef } from "react";
import toast from "react-hot-toast";
import { Upload, ImageIcon } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { C } from "../theme.jsx";
import { card, mkBtn } from "../styles.js";

// ── Logo uploader (Supabase Storage) ─────────────────────────────────────
export function LogoUploader({ config, save, user }) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(config?.logo_url || null);
  const fileRef = useRef(null);

  useEffect(() => { setPreview(config?.logo_url || null); }, [config?.logo_url]);

  const handleFile = (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Solo se permiten imágenes"); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error("La imagen no puede superar 2 MB"); return; }
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target.result;
      setPreview(dataUrl);
      setUploading(true);
      try {
        const ext = file.name.split(".").pop() || "png";
        const path = `${user?.empresa_id || "local"}/logo.${ext}`;
        const { error: upErr } = await supabase.storage.from("empresa-assets").upload(path, file, { upsert: true });
        if (upErr) {
          save("config", { ...config, logo_url: dataUrl });
          toast.success("Logo guardado localmente");
          return;
        }
        const { data: urlData } = supabase.storage.from("empresa-assets").getPublicUrl(path);
        save("config", { ...config, logo_url: urlData.publicUrl });
        toast.success("Logo actualizado en servidor");
      } catch {
        save("config", { ...config, logo_url: dataUrl });
        toast.success("Logo guardado localmente");
      } finally { setUploading(false); }
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); };

  return (
    <div style={{ ...card(), marginBottom: 14 }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>Logo del negocio</div>
      <div style={{ display:"flex",gap:16,alignItems:"center",flexWrap:"wrap" }}>
        <div
          onClick={() => !uploading && fileRef.current?.click()}
          onDrop={handleDrop} onDragOver={e => e.preventDefault()}
          style={{ width:96,height:96,border:`2px dashed var(--color-border)`,borderRadius:14,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",cursor:uploading?"not-allowed":"pointer",overflow:"hidden",background:"var(--color-bg-primary)",flexShrink:0,transition:"border-color 0.15s" }}
          onMouseEnter={e=>{ if(!uploading) e.currentTarget.style.borderColor=C.brand; }}
          onMouseLeave={e=>e.currentTarget.style.borderColor="var(--color-border)"}
        >
          {preview
            ? <img src={preview} alt="logo" style={{ width:"100%",height:"100%",objectFit:"contain" }} />
            : <><ImageIcon size={24} color="var(--color-text-faint)" /><div style={{ fontSize:9,color:"var(--color-text-faint)",marginTop:6,textAlign:"center",padding:"0 6px" }}>{uploading?"Subiendo…":"Click / arrastra"}</div></>
          }
        </div>
        <div style={{ flex:1,minWidth:160 }}>
          <div style={{ fontSize:12,color:"var(--color-text-mid)",marginBottom:10 }}>
            Aparece en el login y comprobantes PDF.<br/>Formatos: JPG, PNG, SVG · Máx. 2 MB.
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display:"none" }} onChange={e=>handleFile(e.target.files[0])} />
          <div style={{ display:"flex",gap:8 }}>
            <button onClick={()=>fileRef.current?.click()} style={{ ...mkBtn("ghost"),fontSize:12,display:"flex",alignItems:"center",gap:6 }} disabled={uploading}>
              <Upload size={13} />{uploading?"Subiendo…":"Subir imagen"}
            </button>
            {preview && <button onClick={()=>{ setPreview(null); save("config",{...config,logo_url:null}); }} style={{ ...mkBtn("danger"),fontSize:12,padding:"6px 10px" }}>Quitar</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
