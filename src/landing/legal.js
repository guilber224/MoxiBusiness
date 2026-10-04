import "./landing.css";

// Páginas legales: solo estilos y el enlace de soporte por WhatsApp.
const URL_SB = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

fetch(`${URL_SB}/rest/v1/sistema_config?select=whatsapp_soporte&id=eq.1`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } })
  .then(r => (r.ok ? r.json() : []))
  .then(([c]) => {
    const wa = (c?.whatsapp_soporte || "+59163506018").replace(/\D/g, "");
    document.querySelectorAll("[data-wa]").forEach(a => { a.href = `https://wa.me/${wa}`; if (!a.textContent) a.textContent = `+${wa}`; });
  })
  .catch(() => {});
