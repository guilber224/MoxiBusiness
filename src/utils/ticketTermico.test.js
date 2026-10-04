import { describe, it, expect } from "vitest";
import { htmlTicket } from "./ticketTermico.js";

const venta = {
  numero: 21, date: "2026-10-04T15:30:00", customerName: "María <Quispe>", paymentMethod: "efectivo",
  items: [{ name: "Arroz 1 kg", unit: "bolsa", qty: 2, unitPrice: 12.5, sub: 25 }, { name: "Aceite", qty: 1, unitPrice: 18, sub: 18 }],
  discount: 10, discountType: "pct", total: 38.7, recibido: 50, vuelto: 11.3, debt: 0,
};

describe("htmlTicket", () => {
  it("usa el ancho del papel elegido", () => {
    expect(htmlTicket({ sale: venta, ancho: 58 })).toContain("size: 58mm auto");
    expect(htmlTicket({ sale: venta, ancho: 80 })).toContain("size: 80mm auto");
  });
  it("incluye número, productos, descuento, total y cambio", () => {
    const h = htmlTicket({ sale: venta, config: { businessName: "Tienda Sol", nit: "123" }, ancho: 80, simbolo: "Bs." });
    expect(h).toContain("NOTA DE VENTA N° 000021");
    expect(h).toContain("Tienda Sol");
    expect(h).toContain("NIT: 123");
    expect(h).toContain("Arroz 1 kg");
    expect(h).toContain("Descuento");
    expect(h).toContain("38,70");
    expect(h).toContain("Cambio");
    expect(h).toContain("no válido como factura fiscal");
  });
  it("escapa el texto para que un nombre no rompa el ticket", () => {
    const h = htmlTicket({ sale: venta });
    expect(h).toContain("María &lt;Quispe&gt;");
    expect(h).not.toContain("<Quispe>");
  });
  it("muestra el saldo pendiente en ventas a crédito", () => {
    expect(htmlTicket({ sale: { ...venta, debt: 15, vuelto: 0, recibido: 0 } })).toContain("Saldo pendiente");
  });
});
