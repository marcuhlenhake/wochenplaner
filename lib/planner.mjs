import { buildShopping, buildShareText, buildPlanShareText, buildOffersShareText, groupOffers, packagesFor } from "../public/shopping.js";

export { buildShopping, buildShareText, buildPlanShareText, buildOffersShareText, groupOffers, packagesFor };

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
const MAX_OFFERS = 400;

const DAY_SCHEMA = {
  type: "object",
  required: ["day", "title", "minutes", "ingredients", "steps"],
  properties: {
    day: { type: "string", description: "Montag … Sonntag" },
    title: { type: "string" },
    minutes: { type: "integer", description: "Zubereitungszeit in Minuten" },
    ingredients: {
      type: "array",
      items: {
        type: "object",
        required: ["name", "amount"],
        properties: {
          name: { type: "string" },
          amount: { type: "string", description: "Menge für alle Personen, z. B. 400 g" },
          offerId: {
            type: "string",
            description: "ID des Angebots aus der Liste. Weglassen bei Vorratszutaten (Salz, Öl, Gewürze …).",
          },
        },
      },
    },
    steps: { type: "array", items: { type: "string" } },
    nutrition: {
      type: "object",
      description: "Geschätzter Nährwert pro Portion (eine Person), gerundet.",
      required: ["kcal", "protein_g", "carbs_g", "fat_g"],
      properties: {
        kcal: { type: "integer" },
        protein_g: { type: "integer" },
        carbs_g: { type: "integer" },
        fat_g: { type: "integer" },
      },
    },
  },
};

const PLAN_TOOL = {
  name: "wochenplan",
  description: "Gibt den Wochenplan mit 7 Gerichten zurück.",
  input_schema: {
    type: "object",
    required: ["days"],
    properties: { days: { type: "array", minItems: 7, maxItems: 7, items: DAY_SCHEMA } },
  },
};

const SWAP_TOOL = {
  name: "gericht",
  description: "Gibt genau ein neues Gericht zurück.",
  input_schema: { type: "object", required: ["dish"], properties: { dish: DAY_SCHEMA } },
};

const RULES = [
  "Regeln:",
  "- Baue die Gerichte möglichst um die unten aufgeführten aktuellen Angebote auf und nutze pro Gericht mindestens eine Angebotszutat.",
  "- Verweise bei jeder Zutat, die im Angebot ist, mit offerId auf genau ein Angebot aus der Liste. Erfinde keine IDs.",
  "- Frische Hauptzutaten (Fleisch, Fisch, Gemüse, Milchprodukte) sollen aus den Angeboten stammen. Vorratszutaten wie Salz, Pfeffer, Öl, Mehl, Gewürze und Brühe darfst du ohne offerId voraussetzen.",
  "- Halte die Zubereitung alltagstauglich (meist unter 45 Minuten) und die Schritte kurz.",
  "- Schätze zu jedem Gericht den Nährwert pro Portion (eine Person) anhand der Zutatenmengen: Kalorien, Eiweiß, Kohlenhydrate, Fett in Gramm. Eine grobe, plausible Schätzung reicht, keine Küchenwaage nötig.",
];

function offerLines(offers) {
  return offers.map(
    (o) => `${o.id} | ${o.retailer} | ${o.product}${o.description ? ` (${o.description})` : ""} | ${o.price != null ? `${o.price.toFixed(2)} €` : "Preis unbekannt"}`,
  );
}

const dislikeLine = (dislikes) =>
  dislikes.length ? `Diese Zutaten dürfen NIEMALS vorkommen (auch nicht als Nebenzutat): ${dislikes.join(", ")}.` : "";

export function buildPrompt({ offers, dislikes, persons, diet }) {
  return [
    `Erstelle einen Wochenplan mit 7 Abendessen (Montag bis Sonntag) für ${persons} Person(en).`,
    `Ernährungsform: ${diet}.`,
    dislikeLine(dislikes),
    "",
    ...RULES,
    "- Bevorzuge wenige Märkte pro Woche und nutze Zutaten mehrfach, damit wenig übrig bleibt. Wechsle Fleisch, Fisch und vegetarische Gerichte ab.",
    "",
    "Aktuelle Angebote (ID | Markt | Produkt | Preis):",
    ...offerLines(offers),
  ]
    .filter((l, i, a) => l !== "" || a[i - 1] !== "")
    .join("\n");
}

export function buildSwapPrompt({ offers, dislikes, persons, diet, day, avoid, keepOfferIds }) {
  return [
    `Ersetze das Abendessen für ${day} durch ein anderes Gericht für ${persons} Person(en).`,
    `Ernährungsform: ${diet}.`,
    dislikeLine(dislikes),
    avoid.length
      ? `Diese Gerichte sind für die Woche bereits verplant – das neue Gericht darf keines davon wiederholen, auch nicht unter anderem Namen (andere Hauptzutat UND andere Küche/Zubereitungsart nötig): ${avoid.join("; ")}.`
      : "",
    keepOfferIds.length
      ? `Diese Angebote werden für andere Tage ohnehin gekauft. Nutze davon möglichst viele, damit wenig zusätzlich anfällt (IDs): ${keepOfferIds.join(", ")}.`
      : "",
    "",
    ...RULES,
    "",
    "Aktuelle Angebote (ID | Markt | Produkt | Preis):",
    ...offerLines(offers),
  ]
    .filter((l, i, a) => l !== "" || a[i - 1] !== "")
    .join("\n");
}

// Verteilt die Angebote reihum auf die Märkte, damit bei der Kürzung kein Markt untergeht, und entfernt Doppelte.
export function selectOffers(offers, max = MAX_OFFERS) {
  const seen = new Set();
  const byRetailer = new Map();
  for (const o of offers) {
    const key = `${o.retailerId}|${o.product}|${o.price}`;
    if (seen.has(key)) continue;
    seen.add(key);
    (byRetailer.get(o.retailerId) ?? byRetailer.set(o.retailerId, []).get(o.retailerId)).push(o);
  }
  const lists = [...byRetailer.values()];
  const out = [];
  for (let i = 0; out.length < max && lists.some((l) => i < l.length); i++) {
    for (const l of lists) if (i < l.length && out.length < max) out.push(l[i]);
  }
  return out;
}

async function callClaude(tool, prompt, fetchImpl) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new HttpError(500, "ANTHROPIC_API_KEY ist nicht gesetzt.");
  const base = process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com";
  const res = await fetchImpl(`${base}/v1/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8000,
      tools: [tool],
      tool_choice: { type: "tool", name: tool.name },
      messages: [{ role: "user", content: prompt }],
    }),
  }).catch((e) => {
    throw new HttpError(502, `Claude-API nicht erreichbar: ${e.cause?.code ?? e.message}`);
  });
  if (!res.ok) throw new HttpError(502, `Claude-API: ${res.status} ${(await res.text()).slice(0, 300)}`);
  const input = (await res.json()).content?.find((b) => b.type === "tool_use")?.input;
  if (!input) throw new HttpError(502, "Claude lieferte keine verwertbare Antwort.");
  return input;
}

export async function requestPlan({ offers, dislikes, persons, diet }, { fetchImpl = fetch } = {}) {
  const limited = selectOffers(offers);
  const input = await callClaude(PLAN_TOOL, buildPrompt({ offers: limited, dislikes, persons, diet }), fetchImpl);
  if (!Array.isArray(input.days)) throw new HttpError(502, "Claude lieferte keinen Wochenplan.");
  return enrichPlan(input, limited, dislikes);
}

// Grobe Ähnlichkeitsprüfung für Titel: exakte Übereinstimmung oder mind. zwei geteilte, aussagekräftige Wörter
// ("Spaghetti mit Tomatensoße" vs. "Spaghetti Bolognese" gilt als ähnlich, "Linsen-Curry" vs. "Lachs mit Reis" nicht).
const STOPWORDS = new Set(["mit", "und", "auf", "vom", "aus", "der", "die", "das", "im", "in", "an"]);
function titleWords(title) {
  const norm = title.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
  return new Set(norm.split(/[^a-zäöüß]+/).filter((w) => w.length > 2 && !STOPWORDS.has(w)));
}
export function isSimilarTitle(a, b) {
  if (a.trim().toLowerCase() === b.trim().toLowerCase()) return true;
  const wa = titleWords(a), wb = titleWords(b);
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  return shared / Math.min(wa.size || 1, wb.size || 1) >= 0.5;
}

const SWAP_ATTEMPTS = 3;

export async function requestSwap({ offers, dislikes, persons, diet, day, avoid = [], keepOfferIds = [] }, { fetchImpl = fetch } = {}) {
  const limited = selectOffers(offers);
  const known = new Set(limited.map((o) => o.id));
  const keep = keepOfferIds.filter((id) => known.has(id));
  const tried = [];
  for (let attempt = 1; attempt <= SWAP_ATTEMPTS; attempt++) {
    const input = await callClaude(
      SWAP_TOOL,
      buildSwapPrompt({ offers: limited, dislikes, persons, diet, day, avoid: [...avoid, ...tried], keepOfferIds: keep }),
      fetchImpl,
    );
    if (!input.dish?.ingredients) throw new HttpError(502, "Claude lieferte kein Gericht.");
    const duplicate = avoid.some((t) => isSimilarTitle(t, input.dish.title));
    if (!duplicate || attempt === SWAP_ATTEMPTS) {
      const warnings = [];
      const dish = enrichDay({ ...input.dish, day }, new Map(limited.map((o) => [o.id, o])), normalize(dislikes), warnings);
      if (duplicate) warnings.push(`${day}: Kein ausreichend anderes Gericht gefunden – bitte bei Bedarf erneut versuchen.`);
      return { dish, warnings };
    }
    tried.push(input.dish.title);
  }
}

const normalize = (dislikes) => dislikes.map((d) => d.trim().toLowerCase()).filter(Boolean);

// Reine Schätzung von Claude, keine Nährwertberechnung; ungültige/fehlende Werte werden zu null statt 0,
// damit die Oberfläche "–" statt einer falschen Zahl anzeigt.
function sanitizeNutrition(n) {
  if (!n || typeof n !== "object") return null;
  const num = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : null);
  const out = { kcal: num(n.kcal), protein_g: num(n.protein_g), carbs_g: num(n.carbs_g), fat_g: num(n.fat_g) };
  return Object.values(out).some((v) => v != null) ? out : null;
}

function enrichDay(day, byId, bad, warnings) {
  return {
    ...day,
    nutrition: sanitizeNutrition(day.nutrition),
    ingredients: day.ingredients.map((ing) => {
      const offer = ing.offerId ? byId.get(String(ing.offerId)) : null;
      const hit = bad.find((d) => `${ing.name} ${day.title}`.toLowerCase().includes(d));
      if (hit) warnings.push(`${day.day}: enthält „${hit}“ (${ing.name})`);
      return {
        name: ing.name,
        amount: ing.amount,
        offer: offer
          ? {
              id: offer.id,
              retailer: offer.retailer,
              retailerId: offer.retailerId,
              product: offer.product,
              description: offer.description,
              price: offer.price,
              validTo: offer.validTo,
            }
          : null,
      };
    }),
  };
}

// Ersetzt offerId durch echte Angebotsdaten, entfernt erfundene IDs und markiert Verstöße gegen die Abneigungen.
export function enrichPlan(plan, offers, dislikes = []) {
  const byId = new Map(offers.map((o) => [o.id, o]));
  const bad = normalize(dislikes);
  const warnings = [];
  const days = plan.days.map((day) => enrichDay(day, byId, bad, warnings));
  return { days, warnings };
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
