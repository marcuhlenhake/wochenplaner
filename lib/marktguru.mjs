// Angebotsquelle über die inoffizielle Marktguru-Web-API.
// Die Schlüssel stehen im HTML von marktguru.de und werden von dort gelesen.
// Es gibt keine Garantie auf Stabilität; Nutzung nur für den privaten Prototyp.
import { retailerIdFor } from "./retailers.mjs";

const UA = "Mozilla/5.0";
const SEARCH_URL = "https://api.marktguru.de/api/v1/offers/search";

// Die Suche verlangt einen Suchbegriff, deshalb werden typische Lebensmittel abgefragt.
// Weitere Begriffe lassen sich ohne Codeänderung über OFFER_QUERIES_EXTRA (kommagetrennt) ergänzen.
export const FOOD_QUERIES = [
  // Fleisch, Wurst
  "hähnchen", "hähnchenbrust", "hähnchenschenkel", "pute", "putenbrust", "hackfleisch", "rind", "rindfleisch", "steak",
  "schwein", "schweinefilet", "schnitzel", "geschnetzeltes", "gulasch", "bratwurst", "wurst", "schinken", "speck",
  "salami", "kasseler", "lamm", "ente", "leberkäse", "würstchen",
  // Fisch, Meeresfrüchte
  "lachs", "fisch", "seelachs", "forelle", "thunfisch", "kabeljau", "pangasius", "fischstäbchen", "garnelen", "shrimps",
  // Eier, Milchprodukte
  "eier", "milch", "joghurt", "quark", "skyr", "käse", "feta", "mozzarella", "gouda", "parmesan", "frischkäse",
  "schmand", "crème fraîche", "sahne", "butter", "kochsahne",
  // Beilagen, Teigwaren, Brot
  "kartoffeln", "reis", "basmati", "nudeln", "spaghetti", "penne", "tortellini", "lasagne", "gnocchi", "couscous",
  "bulgur", "quinoa", "spätzle", "pommes", "kartoffelpüree", "klöße", "brot", "brötchen", "wraps", "tortilla", "pizza",
  "flammkuchen",
  // Gemüse
  "tomaten", "cherrytomaten", "paprika", "zucchini", "brokkoli", "blumenkohl", "karotten", "zwiebeln", "knoblauch",
  "champignons", "pilze", "spinat", "salat", "gurke", "lauch", "aubergine", "kürbis", "süßkartoffel", "kohl", "rotkohl",
  "weißkohl", "kohlrabi", "spargel", "erbsen", "fenchel", "sellerie", "rote bete", "mangold", "rosenkohl", "mais",
  "avocado", "ingwer", "frühlingszwiebeln", "radieschen", "kräuter", "petersilie", "basilikum", "tiefkühlgemüse",
  // Hülsenfrüchte, Konserven, Vorrat
  "linsen", "kichererbsen", "bohnen", "tofu", "passierte tomaten", "gehackte tomaten", "tomatenmark", "kokosmilch",
  "pesto", "brühe", "olivenöl", "mehl", "haferflocken", "nüsse", "sojasauce",
  // Obst
  "äpfel", "bananen", "birnen", "trauben", "orangen", "zitrone", "beeren", "erdbeeren", "mango", "ananas",
];

const PAGE_SIZE = 100;
const MAX_PAGES = 2;

function queries() {
  const extra = (process.env.OFFER_QUERIES_EXTRA || "").split(",").map((q) => q.trim()).filter(Boolean);
  return [...new Set([...FOOD_QUERIES, ...extra])];
}

let keyCache = null;

async function getKeys() {
  if (keyCache && Date.now() - keyCache.at < 6 * 36e5) return keyCache;
  const res = await fetch("https://www.marktguru.de/", { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`marktguru.de antwortet mit ${res.status}`);
  const keys = parseKeys(await res.text());
  if (!keys) throw new Error("Marktguru-Schlüssel nicht gefunden (Seitenaufbau geändert?)");
  keyCache = { ...keys, at: Date.now() };
  return keyCache;
}

// Der Konfigurationsblock der Startseite enthält "apiHostAddress":"api.marktguru.de","apiKey":"…","clientKey":"…".
// Ältere Seitenstände nutzten "x_apikey"/"x_clientkey".
export function parseKeys(html) {
  const unescape = (s) => s?.replace(/\\\//g, "/");
  const block = /"apiHostAddress":"api\.marktguru\.de","apiKey":"([^"]+)","clientKey":"([^"]+)"/.exec(html);
  if (block) return { apiKey: unescape(block[1]), clientKey: unescape(block[2]) };
  const apiKey = unescape(/"(?:x_apikey|apiKey)":"([^"]+)"/.exec(html)?.[1]);
  const clientKey = unescape(/"(?:x_clientkey|clientKey)":"([^"]+)"/.exec(html)?.[1]);
  return apiKey && clientKey ? { apiKey, clientKey } : null;
}

async function search(query, zip, keys, offset = 0) {
  const url = new URL(SEARCH_URL);
  url.search = new URLSearchParams({ q: query, zipCode: zip, limit: String(PAGE_SIZE), offset: String(offset), as: "web" });
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json", "x-apikey": keys.apiKey, "x-clientkey": keys.clientKey },
  });
  if (!res.ok) throw new Error(`Marktguru-Suche "${query}" fehlgeschlagen (${res.status})`);
  const json = await res.json();
  return json.results ?? [];
}

async function searchAll(query, zip, keys) {
  const all = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const batch = await search(query, zip, keys, page * PAGE_SIZE);
    all.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return all;
}

export function normalizeOffer(o) {
  const retailer = o.advertisers?.[0]?.name ?? "";
  const validity = o.validityDates?.[0] ?? {};
  const day = (s) => (s ? String(s).slice(0, 10) : null);
  return {
    id: String(o.id),
    retailerId: retailerIdFor(retailer),
    retailer,
    product: o.product?.name ?? "",
    description: o.description ?? "",
    price: typeof o.price === "number" ? o.price : null,
    referencePrice: typeof o.referencePrice === "number" ? o.referencePrice : null,
    validFrom: day(validity.from),
    validTo: day(validity.to),
  };
}

export async function fetchMarktguruOffers({ zip }) {
  const keys = await getKeys();
  const byId = new Map();
  const queue = queries();
  const errors = [];
  const worker = async () => {
    while (queue.length) {
      const q = queue.shift();
      try {
        for (const o of await searchAll(q, zip, keys)) byId.set(String(o.id), normalizeOffer(o));
      } catch (e) {
        errors.push(e.message);
      }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  if (byId.size === 0) throw new Error(errors[0] ?? "Keine Angebote gefunden");
  return [...byId.values()];
}
