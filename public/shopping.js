// Mengeneinheiten, die sich sauber umrechnen lassen. Alles andere (Stück, Dose, Scheibe, Bund, Zehe,
// Wörter ohne erkannte Einheit …) wird als Stückzahl gezählt.
const UNIT_FACTORS = {
  mass: { g: 1, gramm: 1, kg: 1000, kilogramm: 1000 },
  volume: { ml: 1, milliliter: 1, l: 1000, liter: 1000 },
};

function parseQuantity(text) {
  const m = /(\d+(?:[.,]\d+)?)\s*([a-zäöüß]+)?/i.exec(String(text ?? "").trim());
  if (!m) return null;
  const value = parseFloat(m[1].replace(",", "."));
  if (!Number.isFinite(value) || value <= 0) return null;
  const unit = (m[2] ?? "").toLowerCase();
  for (const [group, units] of Object.entries(UNIT_FACTORS)) {
    if (unit in units) return { group, base: value * units[unit] };
  }
  return { group: "count", base: value };
}

// Rechnet die über die Woche benötigten Mengen (z. B. "400 g", "2 Stück") in die Anzahl zu kaufender
// Gebinde der Packungsgröße des Angebots (z. B. "500 g") um, aufgerundet. Passen die Einheiten nicht
// zusammen oder lässt sich etwas nicht auswerten (unbekannte Einheit, fehlende Packungsgröße), wird
// die Anzahl der Verwendungen als vorsichtige Mindestmenge genommen statt zu raten.
export function packagesFor(needs, packageSize) {
  const pkg = parseQuantity(packageSize);
  const parsed = needs.map(parseQuantity);
  if (pkg && parsed.every((n) => n && n.group === pkg.group)) {
    const total = parsed.reduce((sum, n) => sum + n.base, 0);
    return Math.max(1, Math.ceil(total / pkg.base));
  }
  return Math.max(1, needs.length);
}

// Wird vom Browser und vom Server gemeinsam genutzt.
export function buildShopping(days) {
  const groups = new Map();
  for (const day of days) {
    for (const ing of day.ingredients) {
      if (!ing.offer) continue;
      const g = groups.get(ing.offer.retailer) ?? { retailer: ing.offer.retailer, items: new Map() };
      const it = g.items.get(ing.offer.product) ?? { product: ing.offer.product, price: ing.offer.price, description: ing.offer.description, needs: [] };
      it.needs.push(ing.amount);
      g.items.set(ing.offer.product, it);
      groups.set(ing.offer.retailer, g);
    }
  }
  return [...groups.values()].map((g) => {
    const items = [...g.items.values()].map(({ needs, description, ...it }) => ({ ...it, count: packagesFor(needs, description) }));
    return { retailer: g.retailer, total: items.reduce((s, i) => s + (i.price ?? 0), 0), items };
  });
}

// Gruppiert rohe Angebote nach Markt für den "Angebote"-Reiter (unabhängig vom Wochenplan).
// Innerhalb eines Markts alphabetisch sortiert, die Märkte selbst ebenfalls.
export function groupOffers(offers) {
  const groups = new Map();
  for (const o of offers) {
    if (!o.retailerId) continue;
    const g = groups.get(o.retailer) ?? { retailer: o.retailer, items: [] };
    g.items.push(o);
    groups.set(o.retailer, g);
  }
  return [...groups.values()]
    .map((g) => ({ retailer: g.retailer, items: g.items.slice().sort((a, b) => a.product.localeCompare(b.product, "de")) }))
    .sort((a, b) => a.retailer.localeCompare(b.retailer, "de"));
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
    for (const it of g.items) lines.push(`- ${it.product}${money(it.price)} – ${it.count}× Packung`);
  }
  return lines.join("\n");
}
