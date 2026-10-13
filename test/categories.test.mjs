import { test } from "node:test";
import assert from "node:assert/strict";
import { categorizeOffer, groupOffersByCategory, CATEGORIES } from "../public/categories.js";

const cat = (product, description = "") => categorizeOffer({ product, description });

test("typische Produkte landen in der richtigen Warengruppe", () => {
  const cases = {
    obst: ["Äpfel", "Bio Bananen", "Erdbeeren", "Weintrauben kernlos", "Zitronen", "Mango", "Heidelbeeren"],
    gemuese: ["Zucchini", "Paprika rot", "Cherrytomaten", "Kartoffeln festkochend", "Champignons", "Gemüsezwiebeln", "Brokkoli", "Eisbergsalat", "Grüne Bohnen"],
    fleisch: ["Hähnchenbrustfilet", "Rinderhack", "Hackfleisch gemischt", "Schweinegeschnetzeltes", "Putenschnitzel", "Lammkeule"],
    wurst: ["Salami", "Lachsschinken", "Frühstücksspeck", "Bratwurst", "Leberwurst", "Bierschinken"],
    fisch: ["Lachsfilet", "Seelachs", "Thunfisch in Öl", "Garnelen", "Kabeljau"],
    kaese: ["Gouda jung", "Hirtenkäse", "Mozzarella", "Frischkäse natur", "Feta", "Parmesan"],
    milch: ["Vollmilch 3,5%", "Fruchtjoghurt Erdbeere", "Naturjoghurt", "Eier Freiland 10er", "Butter", "Schlagsahne", "Haferdrink", "Quark"],
    brot: ["Vollkornbrot", "Brötchen", "Toast", "Croissants", "Pfannkuchen", "Blätterteig"],
    vorrat: ["Spaghetti", "Basmati Reis", "Passierte Tomaten", "Kokosmilch", "Gewürzgurken", "Kichererbsen Dose", "Olivenöl", "Tortellini", "Weizenmehl", "Haferflocken", "Gemüsebrühe", "Tomatensuppe", "Milchreis"],
    tiefkuehl: ["Tiefkühlpizza", "Pommes Frites", "Vanilleeis", "Fischstäbchen", "Hähnchen-Nuggets", "Tiefkühlgemüse"],
    suesses: ["Gummibärchen", "Vollmilchschokolade", "Kartoffelchips", "Studentenfutter", "Müsliriegel", "Salzstangen", "Butterkekse"],
    getraenke: ["Orangensaft", "Cola Zero", "Mineralwasser", "Apfelschorle", "Kaffeebohnen", "Bier alkoholfrei", "Eistee"],
    alkohol: ["Pils", "Rotwein", "Prosecco", "Wodka", "Weizenbier"],
    nonfood: ["Spülmittel", "Toilettenpapier", "Katzenfutter Lachs", "Zahnpasta", "Waschmittel", "Müllbeutel", "Batterien", "Duschgel Mango"],
    sonstiges: ["Mystery Item XYZ"],
  };
  const wrong = [];
  for (const [expected, products] of Object.entries(cases)) {
    for (const p of products) if (cat(p) !== expected) wrong.push(`${p}: erwartet ${expected}, bekommen ${cat(p)}`);
  }
  assert.deepEqual(wrong, []);
});

test("Wortteile verwechseln nichts: Reis/Eis, Schwein/Wein, Kabeljau/Kabel, Kirschtomaten/Kirschen, Mangold/Mango", () => {
  assert.equal(cat("Jasmin Reis"), "vorrat");
  assert.equal(cat("Schweinefilet"), "fleisch");
  assert.equal(cat("Wildschwein Gulasch"), "fleisch");
  assert.equal(cat("Kabeljau"), "fisch");
  assert.equal(cat("Kirschtomaten"), "gemuese");
  assert.equal(cat("Mangold"), "gemuese");
  assert.equal(cat("Blumenkohl"), "gemuese");
  assert.equal(cat("Tortellini"), "vorrat");
  assert.equal(cat("Honigmelone"), "obst");
  assert.equal(cat("Cocktailtomaten"), "gemuese");
  assert.equal(cat("Gemüse-Pfanne"), "gemuese");
  assert.equal(cat("Eintopf"), "vorrat");
  assert.equal(cat("Nektarinen"), "obst");
  assert.equal(cat("Double Chocolate Cookies"), "suesses");
  assert.equal(cat("Granatapfel"), "obst");
  assert.equal(cat("Hühnereier"), "milch");
  assert.equal(cat("Spezial-Mix"), "sonstiges");
  assert.equal(cat("Fantasie Mix"), "sonstiges");
  assert.equal(cat("Thunfisch in Olivenöl"), "fisch");
  assert.equal(cat("Crostini"), "sonstiges");
  assert.equal(cat("Kokosnuss"), "obst");
  assert.equal(cat("Muskatnuss"), "vorrat");
  assert.equal(cat("Müsliriegel"), "suesses");
});

test("ohne Treffer im Produktnamen hilft die Beschreibung, sonst Sonstiges", () => {
  assert.equal(cat("Spezial-Mix", "mit Salami"), "wurst");
  assert.equal(cat("Spezial-Mix", "versch. Sorten"), "sonstiges");
  assert.equal(cat("", ""), "sonstiges");
});

test("groupOffersByCategory: feste Reihenfolge, leere Gruppen entfallen, Sortierung nach Produkt und Markt", () => {
  const o = (product, retailer, retailerId = retailer.toLowerCase()) => ({ product, retailer, retailerId, description: "" });
  const groups = groupOffersByCategory([
    o("Cola Zero", "LIDL"),
    o("Zucchini", "REWE"),
    o("Äpfel", "REWE"),
    o("Äpfel", "EDEKA"),
    o("Unbekannt", "LIDL", null),
  ]);
  assert.deepEqual(groups.map((g) => g.id), ["obst", "gemuese", "getraenke"]);
  assert.deepEqual(groups[0].items.map((i) => i.retailer), ["EDEKA", "REWE"]);
  assert.equal(groups[0].label, "Obst");
  // Jede ID, die categorizeOffer liefern kann, hat auch eine Anzeigegruppe
  assert.ok(CATEGORIES.some(([id]) => id === "sonstiges"));
});
