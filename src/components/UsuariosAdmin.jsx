import { useState, useEffect } from "react";
import { createClient, SUPABASE_URL, SUPABASE_ANON_KEY } from "../lib/supabaseClient";
import { userService } from "../services/userService.js";
import { uid, isSupabaseUser, fDate, fDateTime } from "../utils/businessLogic.js";
import { CURRENCIES, formatCurrency } from "../currency.js";
import { C } from "../theme.jsx";
import { card, mkBtn, mkBadge, inp, lbl, row } from "../styles.js";
import { Header } from "./ui/Header.jsx";
import { Empty } from "./ui/Empty.jsx";
import { Modal } from "./ui/Modal.jsx";
import { Table } from "./ui/Table.jsx";
import { ROLE_LABELS, ROLE_OPTIONS } from "../navConfig.js";
import { LogoUploader } from "./LogoUploader.jsx";
import { QrUploader } from "./QrUploader.jsx";

export function UsuariosAdmin({ D, save, user, logAction, onProfileUpdate }) {
  const { users, config, activityLogs } = D;
  const [modal, setModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [err, setErr] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", username: "", password: "", confirm: "", role: "usuario" });
  const isSupabaseMode = isSupabaseUser(user);
  const [businessName, setBusinessName] = useState(config?.businessName || "");
  const [currencyCode, setCurrencyCode] = useState(config?.currency || "BOB");
  const [displayName, setDisplayName] = useState(user?.name || "");
  const [profileSaved, setProfileSaved] = useState(false);
  const adminCount = users.filter(user => user.role === "admin").length;

  useEffect(() => { setCurrencyCode(config?.currency || "BOB"); }, [config?.currency]);

  const resetForm = () => {
    setForm({ name: "", email: "", username: "", password: "", confirm: "", role: "usuario" });
    setErr("");
  };

  useEffect(() => {
    setBusinessName(config?.businessName || "");
  }, [config?.businessName]);

  const openModal = () => {
    resetForm();
    setModal(true);
  };

  const saveUser = async () => {
    const name = form.name.trim();
    setErr("");

    // ── Modo Supabase: crear usuario real con email + Supabase Auth ──────────
    if (isSupabaseMode) {
      const email = form.email?.trim();
      if (!name) { setErr("Escribe el nombre completo"); return; }
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setErr("Ingresa un email válido"); return; }
      if (!form.password || form.password.length < 6) { setErr("La contraseña debe tener al menos 6 caracteres"); return; }
      if (form.password !== form.confirm) { setErr("Las contraseñas no coinciden"); return; }
      setIsSaving(true);
      try {
        // Paso 1: crear usuario en Supabase Auth (cliente temporal, no afecta sesión del admin)
        const tempClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          auth: { storageKey: "moxi_temp_signup", persistSession: false },
        });
        let newId;
        const { data: authData, error: signupErr } = await tempClient.auth.signUp({
          email, password: form.password,
          options: { data: { nombre: name } },
        });
        if (signupErr) {
          const isAlreadyRegistered = signupErr.status === 422 || signupErr.message?.toLowerCase().includes("already registered");
          if (isAlreadyRegistered) {
            // Auth user ya existe — intentar signIn con la contraseña proporcionada para obtener su UUID
            const { data: signInData, error: signInErr } = await tempClient.auth.signInWithPassword({ email, password: form.password });
            if (signInErr) throw new Error("Ese email ya tiene cuenta Supabase. Usa otro email, o pide al trabajador que inicie sesión directamente.");
            newId = signInData.user?.id;
          } else {
            throw signupErr;
          }
        } else {
          newId = authData.user?.id;
        }
        if (!newId) throw new Error("No se pudo obtener el ID del usuario de Supabase");

        // Paso 2: crear perfil via RPC SECURITY DEFINER (bypasea RLS de INSERT)
        const profile = await userService.createWorkerProfile({
          id: newId, email, nombre: name, role: form.role, empresa_id: user.empresa_id,
        });
        if (!profile) throw new Error("Auth creado pero perfil falló — ejecuta el SQL de create_worker_profile en Supabase");

        // Paso 3: actualizar lista local para que el admin vea al nuevo usuario de inmediato
        save("users", [...users, { id: newId, name, email, role: form.role, empresa_id: user.empresa_id }]);
        setModal(false);
        resetForm();
        logAction?.(`${user.name} creó cuenta para ${name} (${email}) — rol ${ROLE_LABELS[form.role]?.toLowerCase()}`);
      } catch (e) {
        console.warn("[UsuariosAdmin] saveUser error:", e.message);
        setErr(e.message || "Error al crear usuario, inténtalo de nuevo");
      } finally {
        setIsSaving(false);
      }
      return;
    }

    // ── Modo local: sistema de usuarios por username+password ────────────────
    const username = form.username.trim();
    if (!name || !username || !form.password) { setErr("Completa todos los campos del usuario"); return; }
    if (form.password.length < 4) { setErr("La contraseña debe tener al menos 4 caracteres"); return; }
    if (form.password !== form.confirm) { setErr("Las contraseñas no coinciden"); return; }
    if (users.some(u => u.username?.toLowerCase() === username.toLowerCase())) { setErr("Ese usuario ya existe"); return; }
    save("users", [
      ...users,
      { id: "u" + uid(), name, username, password: form.password, role: form.role, createdAt: new Date().toISOString() },
    ]);
    logAction?.(`${user.name} creó la cuenta de ${name} con rol ${ROLE_LABELS[form.role]?.toLowerCase()}`);
    setModal(false);
    resetForm();
  };

  const removeUser = () => {
    if (!deleteTarget) return;
    if (deleteTarget.id === user.id) {
      setErr("No puedes eliminar tu propia cuenta mientras está iniciada");
      setDeleteTarget(null);
      return;
    }
    if (deleteTarget.role === "admin" && adminCount <= 1) {
      setErr("Debe existir al menos un administrador");
      setDeleteTarget(null);
      return;
    }
    save("users", users.filter(user => user.id !== deleteTarget.id));
    logAction?.(`${user.name} eliminó la cuenta de ${deleteTarget.name}`);
    setDeleteTarget(null);
  };

  const saveBusinessConfig = () => {
    const nextName = businessName.trim();
    if (!nextName) { setErr("El nombre del negocio no puede quedar vacío"); return; }
    save("config", {
      ...config,
      businessName: nextName,
      currency: currencyCode,
      createdAt: config?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    logAction?.(`${user.name} actualizó la configuración del negocio`);
    setErr("");
  };

  const saveDisplayName = async () => {
    const next = displayName.trim();
    if (!next) return;
    await userService.updateProfileName(user.id, next).catch(() => {});
    onProfileUpdate?.(next);
    logAction?.(`${user.name} actualizó su nombre de perfil a ${next}`);
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 3000);
  };

  return (
    <div>
      <Header
        title="Ajustes"
        sub="Configuración de empresa, usuarios y preferencias del sistema"
        action={<button onClick={openModal} style={mkBtn("primary")}>+ Nuevo usuario</button>}
      />
      {err && <div style={{ ...card({ marginBottom: 12, borderLeft: `3px solid ${C.red}` }), color: C.red }}>{err}</div>}
      {/* Mi Perfil */}
      <div style={{ ...card(), marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>Mi perfil</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input style={{ ...inp, flex: "1 1 220px" }} value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Nombre de display" />
          <button onClick={saveDisplayName} style={mkBtn("primary")}>Guardar nombre</button>
          {profileSaved && <span style={{ fontSize: 12, color: C.green, fontWeight: 600 }}>✓ Guardado</span>}
        </div>
        <div style={{ fontSize: 12, color: C.textFaint, marginTop: 8 }}>
          Este nombre se mostrará en el sidebar, comprobantes y registros de actividad. ID: <code style={{ fontSize: 11 }}>{user?.id}</code>
        </div>
      </div>
      <div style={{ ...card(), marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>Configuración del negocio</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <input style={{ ...inp, flex: "1 1 200px", margin: 0 }} value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder="Nombre del negocio" />
          <select style={{ ...inp, margin: 0, flex: "0 0 auto" }} value={currencyCode} onChange={e => setCurrencyCode(e.target.value)}>
            {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.symbol} — {c.name}</option>)}
          </select>
          <button onClick={saveBusinessConfig} style={mkBtn("primary")}>Guardar</button>
        </div>
        <div style={{ fontSize: 12, color: C.textFaint }}>
          Moneda activa: <strong style={{ color: C.text }}>{formatCurrency(1234.5)}</strong> · Aplica en ventas, POS, reportes, PDF y comprobantes.
        </div>
      </div>
      <LogoUploader config={config} save={save} user={user} />
      <QrUploader config={config} save={save} user={user} />
      <div style={card()}>
        {users.length === 0 ? (
          <Empty icon="🛡️" title="Sin usuarios" sub="Crea la primera cuenta desde este módulo" />
        ) : (
          <Table
            cols={[
              { key: "name", label: "Nombre", style: { fontWeight: 600 } },
              { key: "role", label: "Rol", render: value => <span style={mkBadge(value === "admin" ? "red" : "blue")}>{ROLE_LABELS[value] || value}</span> },
              { key: "username", label: "Usuario" },
              { key: "createdAt", label: "Creado", render: value => value ? fDate(value) : "—" },
              {
                key: "id",
                label: "Acciones",
                render: (_, row) => (
                  <button
                    onClick={event => {
                      event.stopPropagation();
                      setDeleteTarget(row);
                      setErr("");
                    }}
                    style={{ ...mkBtn("danger"), padding: "6px 10px" }}
                    disabled={row.id === user.id}
                  >
                    Eliminar
                  </button>
                ),
              },
            ]}
            rows={users}
          />
        )}
      </div>
      <div style={{ ...card(), marginTop: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>Log de actividad</div>
        {(activityLogs || []).length === 0 ? (
          <Empty icon="🧾" title="Sin actividad registrada" sub="Las acciones relevantes del sistema aparecerán aquí." />
        ) : (
          <Table
            cols={[
              { key: "userName", label: "Usuario", style: { fontWeight: 600 } },
              { key: "action", label: "Acción" },
              { key: "date", label: "Fecha", render: value => fDateTime(value) },
            ]}
            rows={(activityLogs || []).slice(0, 50)}
          />
        )}
      </div>

      {modal && (
        <Modal title="Crear usuario" onClose={() => { setModal(false); resetForm(); }}>
          <div style={row()}>
            <div style={{ flex: 1 }}>
              <label style={lbl}>Nombre completo *</label>
              <input style={inp} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Nombre del usuario" autoFocus />
            </div>
            <div style={{ flex: 1 }}>
              <label style={lbl}>Rol *</label>
              <select style={inp} value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                {ROLE_OPTIONS.map(role => <option key={role.id} value={role.id}>{role.label}</option>)}
              </select>
            </div>
          </div>
          {isSupabaseMode ? (
            <div style={{ marginBottom: 10 }}>
              <label style={lbl}>Email *</label>
              <input type="email" style={inp} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="email@ejemplo.com" />
            </div>
          ) : (
            <div style={{ marginBottom: 10 }}>
              <label style={lbl}>Usuario *</label>
              <input style={inp} value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} placeholder="Usuario de acceso" />
            </div>
          )}
          <div style={row()}>
            <div style={{ flex: 1 }}>
              <label style={lbl}>Contraseña *</label>
              <input type="password" style={inp} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder={isSupabaseMode ? "Mínimo 6 caracteres" : "Mínimo 4 caracteres"} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={lbl}>Confirmar *</label>
              <input type="password" style={inp} value={form.confirm} onChange={e => setForm({ ...form, confirm: e.target.value })} placeholder="Repite la contraseña" />
            </div>
          </div>
          {isSupabaseMode && (
            <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 10, lineHeight: 1.5 }}>
              El usuario recibirá un email de confirmación. Una vez confirmado, podrá iniciar sesión con sus credenciales y verá los datos de tu empresa automáticamente.
            </div>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={() => { setModal(false); resetForm(); }} style={mkBtn("ghost")}>Cancelar</button>
            <button onClick={saveUser} disabled={isSaving} style={{...mkBtn("primary"),opacity:isSaving?0.6:1}}>{isSaving ? "Creando…" : "Guardar usuario"}</button>
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <Modal title="Eliminar usuario" onClose={() => setDeleteTarget(null)} width={420}>
          <div style={{ fontSize: 13, color: C.textMid, marginBottom: 16 }}>
            Vas a eliminar a <strong style={{ color: C.text }}>{deleteTarget.name}</strong>. Esta acción quitará su acceso al sistema.
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={() => setDeleteTarget(null)} style={mkBtn("ghost")}>Cancelar</button>
            <button onClick={removeUser} style={mkBtn("danger")}>Eliminar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
