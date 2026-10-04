import { mkBtn } from "../../styles.js";

/** "Mostrar 60 más (quedan 1.240)" debajo de las listas largas. */
export function BotonMostrarMas({ restantes, onClick, paso = 60 }) {
  if (!restantes) return null;
  return (
    <div style={{ display: "flex", justifyContent: "center", margin: "12px 0" }}>
      <button type="button" onClick={onClick} style={{ ...mkBtn("ghost"), fontSize: 12 }}>
        Mostrar {Math.min(paso, restantes)} más · quedan {restantes.toLocaleString("es-BO")} (o usa el buscador)
      </button>
    </div>
  );
}
