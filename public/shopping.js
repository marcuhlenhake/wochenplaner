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
