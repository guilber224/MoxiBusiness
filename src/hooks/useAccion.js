import { useCallback, useRef, useState } from "react";
import toast from "react-hot-toast";

// Ejecuta una acción contra el servidor mostrando estado "ocupado", evitando el doble clic
// y avisando el error real si falla. Devuelve el resultado o undefined si hubo error.
export function useAccion() {
  const [ocupado, setOcupado] = useState(false);
  const enCurso = useRef(false);
  const ejecutar = useCallback(async (fn, { exito } = {}) => {
    if (enCurso.current) return undefined;
    enCurso.current = true;
    setOcupado(true);
    try {
      const r = await fn();
      if (exito) toast.success(exito);
      return r === undefined ? true : r;
    } catch (e) {
      toast.error(e?.message || "No se pudo completar la operación", { duration: 6000 });
      return undefined;
    } finally {
      enCurso.current = false;
      setOcupado(false);
    }
  }, []);
  return [ejecutar, ocupado];
}
