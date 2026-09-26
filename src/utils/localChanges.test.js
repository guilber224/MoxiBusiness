import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { recordLocalChange, reconcileWithServer, resetLocalChanges } from "./localChanges.js";

describe("reconcileWithServer", () => {
  beforeEach(() => { resetLocalChanges(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-26T12:00:00Z")); });
  afterEach(() => vi.useRealTimers());

  it("devuelve la respuesta del servidor tal cual si no hubo cambios locales", () => {
    const server = [{ id: "a" }];
    expect(reconcileWithServer("products", server, [], Date.now())).toBe(server);
  });

  it("conserva un producto creado mientras la carga estaba en curso", () => {
    const requestedAt = Date.now();
    const a = { id: "a", name: "A" };
    const nuevo = { id: "b", name: "Nuevo" };
    vi.advanceTimersByTime(3000);
    recordLocalChange("products", [a], [a, nuevo]);
    const result = reconcileWithServer("products", [{ id: "a", name: "A" }], [a, nuevo], requestedAt);
    expect(result.map(p => p.id)).toEqual(["a", "b"]);
  });

  it("conserva una edición local reciente frente a la versión vieja del servidor", () => {
    const requestedAt = Date.now();
    const viejo = { id: "a", price: 10 };
    const editado = { id: "a", price: 15 };
    recordLocalChange("products", [viejo], [editado]);
    const result = reconcileWithServer("products", [viejo], [editado], requestedAt);
    expect(result).toEqual([editado]);
  });

  it("no revive un elemento borrado localmente durante la carga", () => {
    const requestedAt = Date.now();
    const a = { id: "a" }, b = { id: "b" };
    recordLocalChange("customers", [a, b], [a]);
    const result = reconcileWithServer("customers", [a, b], [a], requestedAt);
    expect(result.map(c => c.id)).toEqual(["a"]);
  });

  it("ignora cambios locales muy anteriores a la carga (ya están en el servidor)", () => {
    const a = { id: "a" };
    recordLocalChange("products", [], [a]);
    vi.advanceTimersByTime(60000);
    const requestedAt = Date.now();
    const result = reconcileWithServer("products", [{ id: "x" }], [a], requestedAt);
    expect(result.map(p => p.id)).toEqual(["x"]);
  });

  it("usa productId como clave en inventario", () => {
    const requestedAt = Date.now();
    const prev = { productId: "p1", stock: 5 };
    const next = { productId: "p1", stock: 2 };
    recordLocalChange("inventory", [prev], [next]);
    const result = reconcileWithServer("inventory", [{ productId: "p1", stock: 5 }, { productId: "p2", stock: 1 }], [next], requestedAt);
    expect(result).toEqual([next, { productId: "p2", stock: 1 }]);
  });
});
