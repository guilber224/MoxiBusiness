// ╔══════════════════════════════════════════════════════════════════════╗
// ║  CATEGORÍAS DE PRODUCTOS                                            ║
// ╚══════════════════════════════════════════════════════════════════════╝
export const DEFAULT_CATEGORY_ID = "sin_categoria";
export const CATEGORY_NAME_FALLBACKS = {
  vaina: "Ají en Vaina",
  rojo_dulce: "Polvo Rojo Dulce",
  rojo_picante: "Polvo Rojo Picante",
  amarillo: "Polvo Amarillo",
  granel: "Granel",
};
export const DEFAULT_CATEGORIES = [
  { id: DEFAULT_CATEGORY_ID, name: "Sin categoría", locked: true },
  ...Object.entries(CATEGORY_NAME_FALLBACKS).map(([id, name]) => ({ id, name, locked: false })),
];
export const slugifyId = value =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
export const prettifyCategoryId = value =>
  String(value || DEFAULT_CATEGORY_ID)
    .replace(/_/g, " ")
    .replace(/\b\w/g, letter => letter.toUpperCase());
export const buildCategoryMap = categories =>
  Object.fromEntries((categories || []).map(category => [category.id, category.name]));
export const getCategoryName = (categories, id) =>
  buildCategoryMap(categories)[id] || CATEGORY_NAME_FALLBACKS[id] || prettifyCategoryId(id);
export const ensureCategories = (categories, products = []) => {
  const base = Array.isArray(categories) && categories.length ? categories : DEFAULT_CATEGORIES;
  const map = new Map();
  base.forEach(category => {
    if (!category?.id || !category?.name) return;
    map.set(category.id, {
      id: category.id,
      name: category.name,
      locked: category.id === DEFAULT_CATEGORY_ID ? true : !!category.locked,
    });
  });
  if (!map.has(DEFAULT_CATEGORY_ID)) {
    map.set(DEFAULT_CATEGORY_ID, { id: DEFAULT_CATEGORY_ID, name: "Sin categoría", locked: true });
  }
  products.forEach(product => {
    if (!product?.cat || map.has(product.cat)) return;
    map.set(product.cat, {
      id: product.cat,
      name: CATEGORY_NAME_FALLBACKS[product.cat] || prettifyCategoryId(product.cat),
      locked: false,
    });
  });
  return Array.from(map.values());
};
export const sanitizeProducts = (products, categories) =>
  (products || []).map(product => ({
    ...product,
    // Normaliza 'nombre' (columna legacy) → 'name' (campo que usa la app)
    name: product.name || product.nombre || "",
    cat: categories.some(category => category.id === product.cat) ? product.cat : DEFAULT_CATEGORY_ID,
  }));
