// Reintenta operaciones de red ante conexiones inestables (común en datos móviles).
// Solo reintenta fallos que parecen transitorios (fetch/timeout); un error de
// Postgrest/Postgres con `code` (RLS, constraint, etc.) no se arregla reintentando.
const isRetryable = (e) => {
  if (!e) return false;
  if (e.code) return false;
  const msg = String(e.message || "").toLowerCase();
  return msg.includes("fetch") || msg.includes("network") || msg.includes("timeout");
};

export async function withRetry(fn, { retries = 2, baseDelayMs = 400 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (attempt === retries || !isRetryable(e)) throw e;
      await new Promise(r => setTimeout(r, baseDelayMs * 2 ** attempt));
    }
  }
  throw lastErr;
}
