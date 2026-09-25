// Wird vom Browser und vom Server gemeinsam genutzt.
export function buildShopping(days) {
  const groups = new Map();
  for (const day of days) {
    for (const ing of day.ingredients) {
      if (!ing.offer) continue;
      const g = groups.get(ing.offer.retailer) ?? { retailer: ing.offer.retailer, items: new Map() };
      const it = g.items.get(ing.offer.product) ?? { product: ing.offer.product, price: ing.offer.price, needs: [] };
      it.needs.push(`${ing.amount} (${day.day})`);
      g.items.set(ing.offer.product, it);
      groups.set(ing.offer.retailer, g);
    }
  }
  return [...groups.values()].map((g) => {
    const items = [...g.items.values()];
    return { retailer: g.retailer, total: items.reduce((s, i) => s + (i.price ?? 0), 0), items };
  });
}

// Textform der Liste zum Teilen (Web-Share-Menü, Zwischenablage). Bereits abgehakte Artikel werden
// weggelassen, weil "teilen" typischerweise vor dem Einkauf passiert, um zu zeigen, was noch fehlt.
// Gibt null zurück, wenn nichts mehr offen ist.
export function buildShareText(days, checkedKeys = []) {
  const checked = new Set(checkedKeys);
  const groups = buildShopping(days)
    .map((g) => ({ retailer: g.retailer, items: g.items.filter((it) => !checked.has(`${g.retailer}|${it.product}`)) }))
    .filter((g) => g.items.length);
  if (!groups.length) return null;
  const money = (n) => (n == null ? "" : ` (${n.toFixed(2).replace(".", ",")} €)`);
  const lines = ["Einkaufsliste"];
  for (const g of groups) {
    lines.push("", `${g.retailer}:`);
    for (const it of g.items) lines.push(`- ${it.product}${money(it.price)} – ${it.needs.join(", ")}`);
  }
  return lines.join("\n");
}
