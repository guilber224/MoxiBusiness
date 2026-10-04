import "./landing.css";

// Lee los planes publicados y los días de prueba directamente de Supabase (solo lectura pública).
const URL_SB = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const bob = v => `Bs ${Number(v || 0).toLocaleString("es-BO", { maximumFractionDigits: 0 })}`;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let planes = [];
let anual = false;
let wa = "59163506018";

function pintar() {
  const cont = document.getElementById("planes");
  if (!planes.length) {
    cont.innerHTML = `<div class="plan" style="grid-column:1/-1;text-align:center">
      <h3>Planes a la medida de tu negocio</h3>
      <p class="desc">Escríbenos y te ayudamos a elegir el plan adecuado.</p>
      <a class="btn btn-primary" href="https://wa.me/${wa}?text=${encodeURIComponent("Hola, quiero conocer los planes de Moxi Business")}" target="_blank" rel="noopener">Consultar por WhatsApp</a></div>`;
    return;
  }
  cont.innerHTML = planes.map(p => {
    const tieneAnual = p.precio_anual != null;
    const mensualEquiv = anual ? (tieneAnual ? p.precio_anual / 12 : p.precio_mensual) : p.precio_mensual;
    const ahorro = anual && tieneAnual ? p.precio_mensual * 12 - p.precio_anual : 0;
    return `<div class="plan${p.destacado ? " star" : ""}">
      ${p.destacado ? '<span class="tag">Más elegido</span>' : ""}
      <h3>${esc(p.nombre)}</h3>
      <div class="desc">${esc(p.descripcion || "")}</div>
      <div class="price">${bob(mensualEquiv)}<small> /mes</small></div>
      <div class="save">${anual ? (tieneAnual ? `${bob(p.precio_anual)} al año · ahorras ${bob(ahorro)}` : "Pago anual: 12 × mensual") : "&nbsp;"}</div>
      <ul>${(p.caracteristicas || []).map(c => `<li>${esc(c)}</li>`).join("")}</ul>
      <a class="btn ${p.destacado ? "btn-primary" : "btn-ghost"}" href="/?registro=1">Empezar prueba gratis</a>
    </div>`;
  }).join("");
}

async function cargar() {
  try {
    const [rp, rc] = await Promise.all([
      fetch(`${URL_SB}/rest/v1/planes?select=nombre,descripcion,precio_mensual,precio_anual,caracteristicas,destacado&activo=eq.true&order=orden.asc,precio_mensual.asc`, { headers: H }),
      fetch(`${URL_SB}/rest/v1/sistema_config?select=whatsapp_soporte,trial_dias&id=eq.1`, { headers: H }),
    ]);
    planes = rp.ok ? await rp.json() : [];
    const cfg = rc.ok ? (await rc.json())[0] : null;
    if (cfg?.whatsapp_soporte) wa = cfg.whatsapp_soporte.replace(/\D/g, "");
    const dias = Number(cfg?.trial_dias);
    document.querySelectorAll("[data-prueba]").forEach(el => {
      el.textContent = dias > 0 && dias < 365 ? `${dias} días de prueba gratis` : "Prueba gratis";
    });
    document.querySelectorAll("[data-wa]").forEach(a => {
      a.href = `https://wa.me/${wa}?text=${encodeURIComponent(a.dataset.wa)}`;
    });
  } catch { planes = []; }
  pintar();
}

document.querySelectorAll(".toggle button").forEach(b => b.addEventListener("click", () => {
  anual = b.dataset.p === "anual";
  document.querySelectorAll(".toggle button").forEach(x => x.classList.toggle("on", x === b));
  pintar();
}));
document.getElementById("anio").textContent = new Date().getFullYear();
cargar();
