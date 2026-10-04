import { useEffect, useState } from "react";

/**
 * Dibuja una lista larga por partes (60, 120, 180…) para que miles de productos o clientes
 * no vuelvan lenta la pantalla. Al cambiar la búsqueda o el filtro (clave) vuelve al inicio.
 */
export function useMostrarMas(lista, paso = 60, clave = "") {
  const [cantidad, setCantidad] = useState(paso);
  useEffect(() => { setCantidad(paso); }, [clave, paso]);
  return {
    visibles: lista.length > cantidad ? lista.slice(0, cantidad) : lista,
    restantes: Math.max(0, lista.length - cantidad),
    mostrarMas: () => setCantidad(c => c + paso),
  };
}
