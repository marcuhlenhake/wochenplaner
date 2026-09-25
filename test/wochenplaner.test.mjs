import { test } from "node:test";
import assert from "node:assert/strict";
import { filterOffers } from "../lib/offers.mjs";
import { normalizeOffer, parseKeys } from "../lib/marktguru.mjs";
import { SAMPLE_OFFERS } from "../lib/sample-offers.mjs";
import { enrichPlan, buildPrompt, buildSwapPrompt, buildShopping, buildShareText, groupOffers, requestPlan, requestSwap, selectOffers, isSimilarTitle } from "../lib/planner.mjs";
import { retailerIdFor } from "../lib/retailers.mjs";
import { validateRequest, validateSwap, checkAccess, createServer } from "../server.mjs";

const future = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
const past = "2020-01-01";

test("retailerIdFor erkennt Ketten", () => {
  assert.equal(retailerIdFor("REWE"), "rewe");
  assert.equal(retailerIdFor("ALDI SÜD"), "aldi-sued");
  assert.equal(retailerIdFor("ALDI Nord"), "aldi-nord");
  assert.equal(retailerIdFor("Netto Marken-Discount"), "netto");
  assert.equal(retailerIdFor("Zoo Zajac"), null);
});

test("parseKeys liest neuen und alten Seitenaufbau", () => {
  const neu = '{"config":{"apiHostAddress":"api.marktguru.de","apiKey":"AAA+bbb=","clientKey":"CC\\/dd"},"x":1}';
  assert.deepEqual(parseKeys(neu), { apiKey: "AAA+bbb=", clientKey: "CC/dd" });
  const alt = '..."x_apikey":"KEY1","x_clientkey":"KEY2"...';
  assert.deepEqual(parseKeys(alt), { apiKey: "KEY1", clientKey: "KEY2" });
  assert.equal(parseKeys("<html>nichts</html>"), null);
});

test("normalizeOffer liest Marktguru-Felder", () => {
  const o = normalizeOffer({
    id: 42,
    price: 1.99,
    referencePrice: 3.98,
    description: "500 g",
    advertisers: [{ name: "REWE" }],
    product: { name: "Zucchini" },
    validityDates: [{ from: "2026-09-21T00:00:00Z", to: "2026-09-26T00:00:00Z" }],
  });
  assert.deepEqual(o, {
    id: "42", retailerId: "rewe", retailer: "REWE", product: "Zucchini", description: "500 g",
    price: 1.99, referencePrice: 3.98, validFrom: "2026-09-21", validTo: "2026-09-26",
  });
});

test("filterOffers berücksichtigt Märkte, Ablaufdatum und Abneigungen", () => {
  const offers = [
    { id: "1", retailerId: "rewe", product: "Champignons", description: "", validTo: future },
    { id: "2", retailerId: "rewe", product: "Zucchini", description: "", validTo: future },
    { id: "3", retailerId: "lidl", product: "Feta", description: "", validTo: future },
    { id: "4", retailerId: "rewe", product: "Alter Käse", description: "", validTo: past },
    { id: "5", retailerId: null, product: "Irgendwas", description: "", validTo: future },
  ];
  const ids = filterOffers(offers, { retailers: ["rewe"], dislikes: [" pilz", "champignon"] }).map((o) => o.id);
  assert.deepEqual(ids, ["2"]);
});

test("enrichPlan ersetzt IDs, ignoriert erfundene und meldet Abneigungen", () => {
  const offers = SAMPLE_OFFERS;
  const plan = {
    days: [
      { day: "Montag", title: "Pilzpfanne", minutes: 20, steps: ["kochen"], nutrition: { kcal: 512.7, protein_g: "18", carbs_g: -3, fat_g: "viel" }, ingredients: [
        { name: "Champignons", amount: "400 g", offerId: "s14" },
        { name: "Salz", amount: "1 TL" },
        { name: "Trüffel", amount: "10 g", offerId: "erfunden" },
      ] },
    ],
  };
  const out = enrichPlan(plan, offers, ["champignon"]);
  const [champ, salz, truffle] = out.days[0].ingredients;
  assert.equal(champ.offer.retailer, "LIDL");
  // Nährwerte sind nur eine Schätzung: gerundet, keine negativen Zahlen, unbrauchbare Werte werden zu null statt 0.
  assert.deepEqual(out.days[0].nutrition, { kcal: 513, protein_g: 18, carbs_g: 0, fat_g: null });
  assert.equal(salz.offer, null);
  assert.equal(truffle.offer, null);
  assert.equal(out.warnings.length, 1);
  const shopping = buildShopping(out.days);
  assert.equal(shopping.length, 1);
  assert.equal(shopping[0].total, 1.49);
});

test("buildShareText lässt abgehakte Artikel weg und gruppiert nach Markt", () => {
  const plan = { days: [
    { day: "Montag", title: "X", minutes: 10, steps: [], ingredients: [
      { name: "Reis", amount: "200 g", offer: { retailer: "REWE", product: "Reis", price: 1.99 } },
      { name: "Feta", amount: "200 g", offer: { retailer: "LIDL", product: "Feta", price: 1.29 } },
    ] },
    { day: "Dienstag", title: "Y", minutes: 10, steps: [], ingredients: [
      { name: "Reis", amount: "100 g", offer: { retailer: "REWE", product: "Reis", price: 1.99 } },
    ] },
  ] };
  const full = buildShareText(plan.days, []);
  assert.match(full, /REWE:/);
  assert.match(full, /- Reis \(1,99 €\) – 200 g, 100 g/);
  assert.match(full, /LIDL:/);

  const partial = buildShareText(plan.days, ["LIDL|Feta"]);
  assert.doesNotMatch(partial, /LIDL/);
  assert.match(partial, /REWE/);

  assert.equal(buildShareText(plan.days, ["REWE|Reis", "LIDL|Feta"]), null);
});

test("groupOffers gruppiert nach Markt, sortiert alphabetisch und ignoriert unbekannte Ketten", () => {
  const offers = [
    { retailerId: "lidl", retailer: "LIDL", product: "Zucchini" },
    { retailerId: "lidl", retailer: "LIDL", product: "Äpfel" },
    { retailerId: "rewe", retailer: "REWE", product: "Milch" },
    { retailerId: null, retailer: "Sonstiges", product: "X" },
  ];
  const groups = groupOffers(offers);
  assert.deepEqual(groups.map((g) => g.retailer), ["LIDL", "REWE"]);
  assert.deepEqual(groups[0].items.map((i) => i.product), ["Äpfel", "Zucchini"]);
});

test("enrichPlan setzt fehlenden Nährwert auf null statt 0", () => {
  const plan = { days: [{ day: "Montag", title: "X", minutes: 5, steps: [], ingredients: [] }] };
  assert.equal(enrichPlan(plan, [], []).days[0].nutrition, null);
});

test("selectOffers verteilt reihum auf Märkte und entfernt Doppelte", () => {
  const mk = (id, retailerId, product) => ({ id, retailerId, retailer: retailerId, product, price: 1 });
  const offers = [
    mk("1", "rewe", "A"), mk("2", "rewe", "B"), mk("3", "rewe", "C"), mk("4", "rewe", "A"),
    mk("5", "lidl", "D"), mk("6", "lidl", "E"),
  ];
  assert.deepEqual(selectOffers(offers, 4).map((o) => o.id), ["1", "5", "2", "6"]);
  assert.equal(selectOffers(offers, 99).length, 5);
});

test("buildSwapPrompt nennt Tag, Vermeidungsliste und behaltene Angebote", () => {
  const p = buildSwapPrompt({
    offers: SAMPLE_OFFERS.slice(0, 2), dislikes: ["Pilze"], persons: 2, diet: "alles",
    day: "Mittwoch", avoid: ["Pfannengericht", "Salat"], keepOfferIds: ["s1"],
  });
  assert.match(p, /Ersetze das Abendessen für Mittwoch/);
  assert.match(p, /Pfannengericht; Salat/);
  assert.match(p, /\(IDs\): s1/);
  assert.match(p, /NIEMALS.*Pilze/);
});

test("requestSwap liefert ein angereichertes Gericht für den gewünschten Tag", async () => {
  process.env.ANTHROPIC_API_KEY = "test";
  let sent;
  const fetchImpl = async (url, init) => {
    sent = JSON.parse(init.body);
    return {
      ok: true,
      json: async () => ({
        content: [{ type: "tool_use", input: { dish: { day: "egal", title: "Reispfanne", minutes: 15, steps: ["kochen"], ingredients: [
          { name: "Reis", amount: "200 g", offerId: "s8" },
          { name: "Champignons", amount: "200 g", offerId: "s14" },
          { name: "Erfunden", amount: "1", offerId: "xx" },
        ] } } }],
      }),
    };
  };
  const { dish, warnings } = await requestSwap(
    { offers: SAMPLE_OFFERS, dislikes: ["champignon"], persons: 2, diet: "alles", day: "Mittwoch", avoid: ["Alt"], keepOfferIds: ["s8", "gibtsnicht"] },
    { fetchImpl },
  );
  assert.equal(sent.tool_choice.name, "gericht");
  assert.doesNotMatch(sent.messages[0].content, /gibtsnicht/);
  assert.equal(dish.day, "Mittwoch");
  assert.equal(dish.ingredients[0].offer.id, "s8");
  assert.equal(dish.ingredients[2].offer, null);
  assert.equal(warnings.length, 1);
});

test("isSimilarTitle erkennt Wiederholungen, auch unter anderem Namen", () => {
  assert.equal(isSimilarTitle("Spaghetti mit Tomatensoße", "spaghetti MIT tomatensoße"), true);
  assert.equal(isSimilarTitle("Spaghetti mit Tomatensoße", "Spaghetti Bolognese"), true);
  assert.equal(isSimilarTitle("Hähnchen-Pfanne mit Zucchini", "Lachs mit Brokkoli und Reis"), false);
  assert.equal(isSimilarTitle("Linsen-Curry", "Kichererbsen-Curry"), true);
});

test("requestSwap fragt bei einer Wiederholung automatisch erneut nach", async () => {
  process.env.ANTHROPIC_API_KEY = "test";
  const prompts = [];
  const dish = (title) => ({ day: "egal", title, minutes: 10, steps: [], ingredients: [{ name: "Reis", amount: "200 g" }] });
  let call = 0;
  const fetchImpl = async (url, init) => {
    prompts.push(JSON.parse(init.body).messages[0].content);
    call++;
    const title = call === 1 ? "Spaghetti mit Tomatensoße" : "Linsen-Curry";
    return { ok: true, json: async () => ({ content: [{ type: "tool_use", input: { dish: dish(title) } }] }) };
  };
  const { dish: result, warnings } = await requestSwap(
    { offers: SAMPLE_OFFERS, dislikes: [], persons: 2, diet: "alles", day: "Montag", avoid: ["Spaghetti mit Tomatensoße"] },
    { fetchImpl },
  );
  assert.equal(call, 2);
  assert.equal(result.title, "Linsen-Curry");
  assert.equal(warnings.length, 0);
  assert.match(prompts[1], /Spaghetti mit Tomatensoße/); // zweiter Versuch nennt den abgelehnten Vorschlag zusätzlich
});

test("requestSwap gibt nach mehreren Wiederholungen trotzdem ein Ergebnis mit Warnung zurück", async () => {
  process.env.ANTHROPIC_API_KEY = "test";
  const dish = { day: "egal", title: "Spaghetti mit Tomatensoße", minutes: 10, steps: [], ingredients: [] };
  const fetchImpl = async () => ({ ok: true, json: async () => ({ content: [{ type: "tool_use", input: { dish } }] }) });
  const { dish: result, warnings } = await requestSwap(
    { offers: SAMPLE_OFFERS, dislikes: [], persons: 2, diet: "alles", day: "Montag", avoid: ["Spaghetti mit Tomatensoße"] },
    { fetchImpl },
  );
  assert.equal(result.title, "Spaghetti mit Tomatensoße");
  assert.match(warnings[0], /Kein ausreichend anderes Gericht/);
});

test("buildPrompt nennt Abneigungen und Angebote", () => {
  const p = buildPrompt({ offers: SAMPLE_OFFERS.slice(0, 2), dislikes: ["Pilze"], persons: 3, diet: "vegetarisch" });
  assert.match(p, /3 Person/);
  assert.match(p, /NIEMALS.*Pilze/);
  assert.match(p, /s1 \| REWE \| Hähnchenbrustfilet/);
});

test("requestPlan schickt Tool-Aufruf und wertet Antwort aus", async () => {
  process.env.ANTHROPIC_API_KEY = "test";
  let sent;
  const fetchImpl = async (url, init) => {
    sent = JSON.parse(init.body);
    return {
      ok: true,
      json: async () => ({
        content: [{ type: "tool_use", input: { days: [{ day: "Montag", title: "Reis", minutes: 10, steps: [], ingredients: [{ name: "Reis", amount: "200 g", offerId: "s8" }] }] } }],
      }),
    };
  };
  const plan = await requestPlan({ offers: SAMPLE_OFFERS, dislikes: [], persons: 2, diet: "alles" }, { fetchImpl });
  assert.equal(sent.tool_choice.name, "wochenplan");
  assert.equal(plan.days[0].ingredients[0].offer.retailer, "EDEKA");
});

test("validateRequest prüft Eingaben", () => {
  assert.throws(() => validateRequest({ zip: "12", retailers: ["rewe"] }), /Postleitzahl/);
  assert.throws(() => validateRequest({ zip: "45127", retailers: ["unbekannt"] }), /Supermarkt/);
  const ok = validateRequest({ zip: "45127", retailers: ["rewe", "x"], dislikes: [" Pilze ", ""], persons: "99", diet: "komisch" });
  assert.deepEqual(ok, { zip: "45127", retailers: ["rewe"], dislikes: ["Pilze"], persons: 10, diet: "alles" });
});

test("validateSwap verlangt gültigen Wochentag und begrenzt Listen", () => {
  const base = { zip: "45127", retailers: ["rewe"] };
  assert.throws(() => validateSwap({ ...base, day: "Someday" }), /Wochentag/);
  const ok = validateSwap({ ...base, day: "Freitag", avoid: Array(20).fill("x"), keepOfferIds: ["a", "", "b"] });
  assert.equal(ok.day, "Freitag");
  assert.equal(ok.avoid.length, 8);
  assert.deepEqual(ok.keepOfferIds, ["a", "b"]);
});

test("Zugangscode: offen ohne Code, sonst Prüfung und Sperre nach Fehlversuchen", async () => {
  delete process.env.ACCESS_TOKEN;
  assert.doesNotThrow(() => checkAccess({ headers: {} }));

  process.env.ACCESS_TOKEN = "geheim-123";
  try {
    const req = (t) => ({ headers: t ? { "x-access-token": t } : {} });
    assert.doesNotThrow(() => checkAccess(req("geheim-123")));
    assert.throws(() => checkAccess(req()), (e) => e.status === 401 && /erforderlich/.test(e.message));
    assert.throws(() => checkAccess(req("falsch")), (e) => e.status === 401 && /falsch/.test(e.message));

    const t0 = Date.now() + 10 * 60_000;
    for (let i = 0; i < 25; i++) try { checkAccess(req("falsch"), t0); } catch {}
    assert.throws(() => checkAccess(req("geheim-123"), t0), (e) => e.status === 429);
    assert.doesNotThrow(() => checkAccess(req("geheim-123"), t0 + 61_000));

    // HTTP: Seite und Konfiguration bleiben offen, Schnittstellen sind gesperrt
    const server = createServer();
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      assert.equal((await (await fetch(`${base}/api/config`)).json()).locked, true);
      assert.equal((await fetch(`${base}/`)).status, 200);
      assert.equal((await fetch(`${base}/manifest.webmanifest`)).status, 200);
      assert.equal((await fetch(`${base}/api/check`)).status, 401);
      assert.equal((await fetch(`${base}/api/plan`, { method: "POST", body: "{}" })).status, 401);
      assert.equal((await fetch(`${base}/api/check`, { headers: { "x-access-token": "geheim-123" } })).status, 200);
    } finally {
      server.close();
    }
  } finally {
    delete process.env.ACCESS_TOKEN;
  }
});

test("HTTP: Config, Validierungsfehler und statische Dateien", async () => {
  process.env.OFFERS_PROVIDER = "sample";
  const server = createServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const cfg = await (await fetch(`${base}/api/config`)).json();
    assert.equal(cfg.provider, "sample");
    assert.ok(cfg.retailers.some((r) => r.id === "rewe"));

    const bad = await fetch(`${base}/api/plan`, { method: "POST", body: JSON.stringify({ zip: "x" }) });
    assert.equal(bad.status, 400);
    const badSwap = await fetch(`${base}/api/swap`, { method: "POST", body: JSON.stringify({ zip: "45127", retailers: ["rewe"], day: "x" }) });
    assert.equal(badSwap.status, 400);
    const offersRes = await fetch(`${base}/api/offers`, { method: "POST", body: JSON.stringify({ zip: "45127", retailers: ["rewe"] }) });
    assert.equal(offersRes.status, 200);
    const offersBody = await offersRes.json();
    assert.ok(offersBody.offers.every((o) => o.retailerId === "rewe"));
    assert.equal(offersBody.provider, "sample");
    assert.equal((await fetch(`${base}/shopping.js`)).status, 200);
    assert.equal((await fetch(`${base}/icon-192.png`)).headers.get("content-type"), "image/png");

    const html = await fetch(`${base}/`);
    assert.equal(html.status, 200);
    assert.match(await html.text(), /Wochenplaner/);

    assert.equal((await fetch(`${base}/..%2Fserver.mjs`)).status, 404);
    assert.equal((await fetch(`${base}/api/gibtsnicht`)).status, 404);
  } finally {
    server.close();
  }
});
