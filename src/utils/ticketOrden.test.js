import { describe, it, expect } from "vitest";
import { htmlTicketOrden } from "./ticketOrden.js";

const orden = {
  numero: 7, estado: "LISTO", recibido: "2026-10-05T10:00:00", prometido: "2026-10-08",
  customerName: "Juan <Pérez>", phone: "70011122", equipo: "Celular", marca: "Samsung", modelo: "A12", serie: "IMEI123",
  falla: "Pantalla rota", diagnostico: "Cambio de pantalla",
  items: [{ name: "Pantalla A12", qty: 1, price: 200 }, { name: "Mano de obra", qty: 1, price: 100 }],
  total: 300, anticipo: 50, presupuesto: 300, garantiaDias: 30,
};

describe("ticket de orden de servicio", () => {
  it("incluye número, cliente, equipo, falla, total, anticipo y saldo", () => {
    const h = htmlTicketOrden({ orden, config: { businessName: "TecnoFix" } });
    expect(h).toContain("ORDEN DE SERVICIO N° 00007");
    expect(h).toContain("Listo para entregar");
    expect(h).toContain("Samsung · A12");
    expect(h).toContain("08/10/2026");
    expect(h).toContain("Pantalla rota");
    expect(h).toContain("300,00");
    expect(h).toContain("250,00"); // saldo
    expect(h).toContain("Garantía: 30 días");
  });
  it("escapa los textos", () => {
    expect(htmlTicketOrden({ orden })).toContain("Juan &lt;Pérez&gt;");
  });
  it("una orden entregada no muestra saldo", () => {
    expect(htmlTicketOrden({ orden: { ...orden, estado: "ENTREGADO" } })).not.toContain("Saldo");
  });
});
