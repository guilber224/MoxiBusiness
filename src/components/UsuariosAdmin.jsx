import { useState, useEffect, useRef } from "react";
import toast from "react-hot-toast";
import { Upload, ImageIcon } from "lucide-react";
import { createClient, SUPABASE_URL, SUPABASE_ANON_KEY } from "../lib/supabaseClient";
import { userService } from "../services/userService.js";
import { fDate, fDateTime, isAdmin } from "../utils/businessLogic.js";
import { CURRENCIES, formatCurrency } from "../currency.js";
import { C } from "../theme.jsx";
import { card, mkBtn, mkBadge, inp, lbl, row } from "../styles.js";
import { useAccion } from "../hooks/useAccion.js";
import { Header } from "./ui/Header.jsx";
import { Empty } from "./ui/Empty.jsx";
import { Modal } from "./ui/Modal.jsx";
import { Table } from "./ui/Table.jsx";
import { PagarSuscripcion } from "./PagarSuscripcion.jsx";

const ROLES = [
  { id: "admin", label: "Administrador", desc: "Acceso total, incluida la configuración y el equipo" },
  { id: "vendedor", label: "Vendedor", desc: "Ventas, clientes, pedidos, deudas, caja y gastos" },
  { id: "operador", label: "Operador", desc: "Productos, inventario y producción" },
];
const ROL_TXT = Object.fromEntries(ROLES.map(r => [r.id, r.label]));
const FORM_VACIO = { name: "", email: "", password: "", confirm: "", role: "vendedor" };

// Imagen de la empresa (logo o QR de cobro) en Supabase Storage
function ImagenEmpresa({ titulo, ayuda, url, nombre, campo, A, puedeEditar }) {
  const [ejecutar, subiendo] = useAccion();
  const fileRef = useRef(null);
  const subir = async file => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Solo se permiten imágenes"); return; }
    if (file.size > 8 * 1024 * 1024) { toast.error("La imagen no puede superar 8 MB"); return; }
    await ejecutar(async () => {
      const nueva = await A.subirArchivoEmpresa(file, nombre);
      await A.actualizarConfig({ [campo]: nueva });
    }, { exito: `${titulo} actualizado` });
  };
  return (
    <div style={{ ...card(), marginBottom: 14 }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>{titulo}</div>
      <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <div onClick={() => puedeEditar && !subiendo && fileRef.current?.click()}
          onDrop={e => { e.preventDefault(); puedeEditar && subir(e.dataTransfer.files[0]); }} onDragOver={e => e.preventDefault()}
          style={{ width: 96, height: 96, border: "2px dashed var(--color-border)", borderRadius: 14, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: puedeEditar ? "pointer" : "default", overflow: "hidden", background: "var(--color-bg-primary)", flexShrink: 0 }}>
          {url ? <img src={url} alt={titulo} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            : <><ImageIcon size={24} color="var(--color-text-faint)" /><div style={{ fontSize: 9, color: "var(--color-text-faint)", marginTop: 6 }}>{subiendo ? "Subiendo…" : "Sin imagen"}</div></>}
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: 12, color: "var(--color-text-mid)", marginBottom: 10 }}>{ayuda}</div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { subir(e.target.files[0]); e.target.value = ""; }} />
          {puedeEditar && <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => fileRef.current?.click()} disabled={subiendo} style={{ ...mkBtn("ghost"), fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}><Upload size={13} />{subiendo ? "Subiendo…" : url ? "Cambiar" : "Subir imagen"}</button>
            {url && <button onClick={() => ejecutar(() => A.actualizarConfig({ [campo]: null }), { exito: `${titulo} quitado` })} disabled={subiendo} style={{ ...mkBtn("danger"), fontSize: 12, padding: "6px 10px" }}>Quitar</button>}
          </div>}
        </div>
      </div>
    </div>
  );
}

export function UsuariosAdmin({ D, A, user, onProfileUpdate, suscripcion, onSuscripcion }) {
  const [verSuscripcion, setVerSuscripcion] = useState(false);
  const { users, config, activityLogs } = D;
  const admin = isAdmin(user) || user?.role === "superadmin";
  const [ejecutar, guardando] = useAccion();
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [err, setErr] = useState("");
  const [empresa, setEmpresa] = useState(config);
  const [displayName, setDisplayName] = useState(user?.name || "");
  useEffect(() => { setEmpresa(config); }, [config]);

  const recargarEquipo = async () => {
    const lista = await userService.getEmpresaUsuarios(user.empresa_id);
    A.setUsuarios(lista.map(u => ({ ...u, role: String(u.role || "").toLowerCase() })));
  };

  const saveDisplayName = async () => {
    const next = displayName.trim();
    if (!next) return;
    const ok = await ejecutar(async () => { const r = await userService.updateProfileName(user.id, next); if (!r) throw new Error("No se pudo guardar tu nombre"); }, { exito: "Nombre actualizado" });
    if (ok) onProfileUpdate?.(next);
  };

  const saveEmpresa = async () => {
    if (!empresa.businessName?.trim()) { toast.error("El nombre del negocio no puede quedar vacío"); return; }
    await ejecutar(() => A.actualizarConfig(empresa), { exito: "Datos de la empresa guardados" });
  };

  const crearUsuario = async () => {
    const name = form.name.trim(); const email = form.email.trim().toLowerCase();
    if (!name) { setErr("Escribe el nombre completo"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setErr("Ingresa un email válido"); return; }
    if (form.password.length < 8) { setErr("La contraseña debe tener al menos 8 caracteres"); return; }
    if (form.password !== form.confirm) { setErr("Las contraseñas no coinciden"); return; }
    setErr("");
    const ok = await ejecutar(async () => {
      // Cuenta en Supabase Auth con un cliente temporal (no cierra la sesión del administrador)
      const temp = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { storageKey: "moxi_temp_signup", persistSession: false } });
      let newId;
      const { data, error } = await temp.auth.signUp({ email, password: form.password, options: { data: { nombre: name } } });
      if (error) {
        if (error.status === 422 || /already registered/i.test(error.message)) {
          const { data: si, error: e2 } = await temp.auth.signInWithPassword({ email, password: form.password });
          if (e2) throw new Error("Ese email ya tiene una cuenta. Usa otro email o pide a la persona que te dé su contraseña actual.");
          newId = si.user?.id;
        } else throw new Error(error.message);
      } else newId = data.user?.id;
      if (!newId) throw new Error("No se pudo crear la cuenta");
      const perfil = await userService.createWorkerProfile({ id: newId, email, nombre: name, role: form.role });
      if (!perfil) throw new Error(userService._lastError || "La cuenta se creó, pero no se pudo asignar a tu empresa");
      await recargarEquipo();
      A.log(`${user.name} creó la cuenta de ${name} (${email}) como ${ROL_TXT[form.role]}`);
    }, { exito: `Usuario ${name} creado` });
    if (ok) { setModal(false); setForm(FORM_VACIO); }
  };

  const cambiarRol = (u, role) => ejecutar(async () => {
    await userService.cambiarRol(u.id, role);
    await recargarEquipo();
    A.log(`${user.name} cambió el rol de ${u.name} a ${ROL_TXT[role]}`);
  }, { exito: "Rol actualizado" });

  const cambiarActivo = u => ejecutar(async () => {
    await userService.setActivo(u.id, !u.active);
    await recargarEquipo();
    A.log(`${user.name} ${u.active ? "desactivó" : "reactivó"} la cuenta de ${u.name}`);
  }, { exito: u.active ? "Usuario desactivado" : "Usuario reactivado" });

  const equipo = users.map(u => ({ ...u, active: u.active ?? u.activo ?? true }));

  return (
    <div>
      <Header title="Ajustes" sub="Tu perfil, la empresa y el equipo" action={admin && <button onClick={() => { setErr(""); setForm(FORM_VACIO); setModal(true); }} style={mkBtn("primary")}>+ Nuevo usuario</button>} />

      {user.role !== "superadmin" && suscripcion && <div style={{ ...card(), marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>Suscripción</div>
            <div style={{ fontSize: 12, color: C.textFaint, marginTop: 2 }}>{suscripcion.plan === "trial" ? "Prueba gratuita" : "Plan " + suscripcion.plan} · vigente hasta {fDate(suscripcion.vence_el)}</div>
          </div>
          <button onClick={() => setVerSuscripcion(v => !v)} style={mkBtn(verSuscripcion ? "ghost" : "primary")}>{verSuscripcion ? "Ocultar" : admin ? "Renovar o cambiar plan" : "Ver detalle"}</button>
        </div>
        {verSuscripcion && <div style={{ marginTop: 14 }}><PagarSuscripcion user={user} suscripcion={suscripcion} onActualizado={onSuscripcion} /></div>}
      </div>}

      <div style={{ ...card(), marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>Mi perfil</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input style={{ ...inp, flex: "1 1 220px", margin: 0 }} value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Tu nombre" aria-label="Tu nombre" />
          <button onClick={saveDisplayName} disabled={guardando} style={mkBtn("primary")}>Guardar nombre</button>
        </div>
        <div style={{ fontSize: 12, color: C.textFaint, marginTop: 8 }}>Aparece en el menú, los comprobantes y el registro de actividad. Rol: <strong>{ROL_TXT[user.role] || user.role}</strong></div>
      </div>

      <div style={{ ...card(), marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>Datos de la empresa</div>
        <div style={row()}>
          <div style={{ flex: 2 }}><label style={lbl}>Nombre del negocio *</label><input style={inp} disabled={!admin} value={empresa.businessName || ""} onChange={e => setEmpresa({ ...empresa, businessName: e.target.value })} /></div>
          <div style={{ flex: 1 }}><label style={lbl}>NIT</label><input style={inp} disabled={!admin} value={empresa.nit || ""} onChange={e => setEmpresa({ ...empresa, nit: e.target.value })} /></div>
        </div>
        <div style={row()}>
          <div style={{ flex: 1 }}><label style={lbl}>Teléfono / WhatsApp</label><input style={inp} disabled={!admin} value={empresa.telefono || ""} onChange={e => setEmpresa({ ...empresa, telefono: e.target.value })} /></div>
          <div style={{ flex: 2 }}><label style={lbl}>Dirección</label><input style={inp} disabled={!admin} value={empresa.direccion || ""} onChange={e => setEmpresa({ ...empresa, direccion: e.target.value })} /></div>
        </div>
        <div style={row()}>
          <div style={{ flex: 1 }}><label style={lbl}>Email</label><input type="email" style={inp} disabled={!admin} value={empresa.email || ""} onChange={e => setEmpresa({ ...empresa, email: e.target.value })} /></div>
          <div style={{ flex: 1 }}><label style={lbl}>Rubro</label><input style={inp} disabled={!admin} value={empresa.rubro || ""} onChange={e => setEmpresa({ ...empresa, rubro: e.target.value })} placeholder="Ej: Abarrotes, alimentos…" /></div>
          <div style={{ flex: 1 }}><label style={lbl}>Moneda</label>
            <select style={inp} disabled={!admin} value={empresa.currency || "BOB"} onChange={e => setEmpresa({ ...empresa, currency: e.target.value })}>
              {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.symbol} — {c.name}</option>)}
            </select>
          </div>
        </div>
        {admin && <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ fontSize: 12, color: C.textFaint }}>Aparecen en las notas de venta y cotizaciones. Formato de moneda: <strong style={{ color: C.text }}>{formatCurrency(1234.5)}</strong></div>
          <button onClick={saveEmpresa} disabled={guardando} style={mkBtn("primary")}>{guardando ? "Guardando…" : "Guardar empresa"}</button>
        </div>}
      </div>

      <ImagenEmpresa titulo="Logo" nombre="logo" campo="logo_url" url={config.logo_url} A={A} puedeEditar={admin} ayuda="Aparece en el menú, las notas de venta y las cotizaciones. JPG, PNG o SVG." />
      <ImagenEmpresa titulo="QR de cobro" nombre="qr" campo="qr_url" url={config.qr_url} A={A} puedeEditar={admin} ayuda="Se muestra en el punto de venta cuando el cliente paga por QR." />

      <div style={card()}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>Equipo</div>
        {equipo.length === 0 ? <Empty icon="🛡️" title="Sin usuarios" sub="Crea la primera cuenta de tu equipo" /> :
          <Table cols={[
            { key: "name", label: "Nombre", style: { fontWeight: 600 }, render: (v, r) => <>{v}{r.id === user.id && <span style={{ ...mkBadge("blue"), marginLeft: 6 }}>Tú</span>}</> },
            { key: "email", label: "Email", render: v => v || "—" },
            { key: "role", label: "Rol", render: (v, r) => admin && r.id !== user.id && v !== "superadmin"
              ? <select aria-label={`Rol de ${r.name}`} value={v} disabled={guardando} onChange={e => cambiarRol(r, e.target.value)} style={{ ...inp, margin: 0, width: "auto", padding: "4px 8px", fontSize: 12 }}>{ROLES.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
              : <span style={mkBadge(v === "admin" || v === "superadmin" ? "red" : "blue")}>{ROL_TXT[v] || v}</span> },
            { key: "active", label: "Estado", render: v => <span style={mkBadge(v ? "green" : "default")}>{v ? "Activo" : "Desactivado"}</span> },
            { key: "createdAt", label: "Desde", render: v => (v ? fDate(v) : "—") },
            { key: "id", label: "", render: (_, r) => admin && r.id !== user.id && r.role !== "superadmin"
              ? <button onClick={() => cambiarActivo(r)} disabled={guardando} style={{ ...mkBtn(r.active ? "danger" : "success"), padding: "5px 10px", fontSize: 12 }}>{r.active ? "Desactivar" : "Reactivar"}</button> : null },
          ]} rows={equipo} />}
      </div>

      {admin && <div style={{ ...card(), marginTop: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>Registro de actividad</div>
        {(activityLogs || []).length === 0 ? <Empty icon="🧾" title="Sin actividad registrada" sub="Ventas, cobros, anulaciones y cambios importantes aparecerán aquí." /> :
          <Table cols={[
            { key: "date", label: "Fecha", render: v => fDateTime(v) },
            { key: "userName", label: "Usuario", style: { fontWeight: 600 } },
            { key: "action", label: "Acción" },
          ]} rows={(activityLogs || []).slice(0, 100)} />}
      </div>}

      {modal && <Modal title="Nuevo usuario" onClose={() => !guardando && setModal(false)}>
        <div style={row()}>
          <div style={{ flex: 1 }}><label style={lbl}>Nombre completo *</label><input style={inp} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoFocus /></div>
          <div style={{ flex: 1 }}><label style={lbl}>Rol *</label>
            <select style={inp} value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>{ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}</select>
          </div>
        </div>
        <div style={{ fontSize: 11, color: C.textFaint, marginTop: -4, marginBottom: 10 }}>{ROLES.find(r => r.id === form.role)?.desc}</div>
        <div style={{ marginBottom: 10 }}><label style={lbl}>Email *</label><input type="email" autoComplete="off" style={inp} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="email@ejemplo.com" /></div>
        <div style={row()}>
          <div style={{ flex: 1 }}><label style={lbl}>Contraseña *</label><input type="password" autoComplete="new-password" style={inp} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Mínimo 8 caracteres" /></div>
          <div style={{ flex: 1 }}><label style={lbl}>Confirmar *</label><input type="password" autoComplete="new-password" style={inp} value={form.confirm} onChange={e => setForm({ ...form, confirm: e.target.value })} /></div>
        </div>
        <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 10, lineHeight: 1.5 }}>La persona recibirá un email para confirmar su cuenta. Después podrá entrar con este email y contraseña, y verá solo los datos de tu empresa según su rol.</div>
        {err && <div style={{ color: C.red, fontSize: 13, marginBottom: 10 }}>{err}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={() => setModal(false)} disabled={guardando} style={mkBtn("ghost")}>Cancelar</button>
          <button onClick={crearUsuario} disabled={guardando} style={{ ...mkBtn("primary"), opacity: guardando ? 0.6 : 1 }}>{guardando ? "Creando…" : "Crear usuario"}</button>
        </div>
      </Modal>}
    </div>
  );
}
