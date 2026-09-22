// Offline-Beispieldaten, um App und Rezeptplanung ohne Live-Quelle zu testen.
const today = new Date();
const iso = (d) => d.toISOString().slice(0, 10);
const from = iso(today);
const to = iso(new Date(today.getTime() + 5 * 864e5));

const raw = [
  ["rewe", "Hähnchenbrustfilet", 6.99, "1 kg", 6.99],
  ["rewe", "Zucchini", 1.29, "500 g", 2.58],
  ["rewe", "Cherrytomaten", 1.79, "250 g", 7.16],
  ["rewe", "Spaghetti", 0.99, "500 g", 1.98],
  ["rewe", "Sahne 30 %", 0.89, "200 g", 4.45],
  ["edeka", "Lachsfilet", 9.99, "400 g", 24.98],
  ["edeka", "Brokkoli", 1.49, "500 g", 2.98],
  ["edeka", "Basmati Reis", 1.99, "1 kg", 1.99],
  ["edeka", "Kartoffeln festkochend", 2.49, "2,5 kg", 1.0],
  ["lidl", "Hackfleisch gemischt", 4.99, "500 g", 9.98],
  ["lidl", "Paprika rot", 1.99, "500 g", 3.98],
  ["lidl", "Feta", 1.29, "200 g", 6.45],
  ["lidl", "Kichererbsen Dose", 0.79, "400 g", 1.98],
  ["lidl", "Champignons", 1.49, "400 g", 3.73],
  ["aldi-sued", "Eier Freiland 10er", 2.79, "10 Stück", 0.28],
  ["aldi-sued", "Rinderhack", 5.49, "500 g", 10.98],
  ["aldi-sued", "Gemüsezwiebeln", 1.19, "1 kg", 1.19],
  ["aldi-sued", "Passierte Tomaten", 0.69, "500 g", 1.38],
  ["kaufland", "Schweinegeschnetzeltes", 5.99, "500 g", 11.98],
  ["kaufland", "Karotten", 0.99, "1 kg", 0.99],
  ["kaufland", "Naturjoghurt", 0.59, "500 g", 1.18],
  ["kaufland", "Vollkornbrot", 1.79, "500 g", 3.58],
];

export const SAMPLE_OFFERS = raw.map(([retailerId, product, price, description, referencePrice], i) => ({
  id: `s${i + 1}`,
  retailerId,
  retailer: retailerId.toUpperCase(),
  product,
  description,
  price,
  referencePrice,
  validFrom: from,
  validTo: to,
}));
