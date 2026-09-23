import http from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RETAILERS } from "./lib/retailers.mjs";
import { getOffers, provider } from "./lib/offers.mjs";
import { requestPlan, requestSwap, HttpError } from "./lib/planner.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, "public");

loadDotEnv(path.join(ROOT, ".env"));

const PORT = Number(process.env.PORT || 3000);
// Render (und die meisten anderen Hoster) setzen RENDER bzw. PORT automatisch und erwarten,
// dass der Dienst auf allen Adressen lauscht. Lokal ohne diese Variablen bleibt es beim sicheren 127.0.0.1.
const HOST = process.env.HOST || (process.env.RENDER || process.env.PORT ? "0.0.0.0" : "127.0.0.1");
const DIETS = ["alles", "vegetarisch", "vegan"];
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
};

export function validateRequest(body) {
  const zip = String(body.zip ?? "").trim();
  if (!/^\d{5}$/.test(zip)) throw new HttpError(400, "Bitte eine fünfstellige Postleitzahl angeben.");
  const known = new Set(RETAILERS.map((r) => r.id));
  const retailers = Array.isArray(body.retailers) ? body.retailers.filter((r) => known.has(r)) : [];
  if (!retailers.length) throw new HttpError(400, "Bitte mindestens einen Supermarkt auswählen.");
  const dislikes = (Array.isArray(body.dislikes) ? body.dislikes : [])
    .map((d) => String(d).trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, 30);
  const persons = Math.min(10, Math.max(1, parseInt(body.persons, 10) || 2));
  const diet = DIETS.includes(body.diet) ? body.diet : "alles";
  return { zip, retailers, dislikes, persons, diet };
}

const WEEKDAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
const strings = (v, max, len) => (Array.isArray(v) ? v.map((x) => String(x).trim().slice(0, len)).filter(Boolean).slice(0, max) : []);

export function validateSwap(body) {
  const day = WEEKDAYS.find((d) => d === body.day);
  if (!day) throw new HttpError(400, "Unbekannter Wochentag.");
  return { ...validateRequest(body), day, avoid: strings(body.avoid, 8, 120), keepOfferIds: strings(body.keepOfferIds, 60, 40) };
}

async function loadOffers(input) {
  let offers;
  try {
    offers = await getOffers(input);
  } catch (e) {
    console.error("Angebotsquelle:", e);
    throw new HttpError(502, `Angebotsquelle nicht erreichbar: ${e.cause?.code ?? e.message}`);
  }
  if (!offers.length) throw new HttpError(404, "Für diese Auswahl wurden keine aktuellen Angebote gefunden.");
  return offers;
}

// Zugangscode (ACCESS_TOKEN): schützt alle Schnittstellen außer /api/config, damit niemand über
// einen öffentlichen Tunnel das API-Guthaben verbrauchen kann. Ohne gesetzten Code ist alles offen.
const failures = [];
const sha = (s) => createHash("sha256").update(s).digest();

export function checkAccess(req, now = Date.now()) {
  const token = process.env.ACCESS_TOKEN;
  if (!token) return;
  while (failures.length && now - failures[0] > 60_000) failures.shift();
  if (failures.length >= 20) throw new HttpError(429, "Zu viele Fehlversuche. Bitte in einer Minute erneut versuchen.");
  const given = String(req.headers["x-access-token"] ?? "");
  if (given && timingSafeEqual(sha(given), sha(token))) return;
  if (given) failures.push(now);
  throw new HttpError(401, given ? "Zugangscode falsch." : "Zugangscode erforderlich.");
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/config") {
    return send(res, 200, {
      retailers: RETAILERS.map(({ id, label }) => ({ id, label })),
      provider: provider(),
      hasKey: Boolean(process.env.ANTHROPIC_API_KEY),
      locked: Boolean(process.env.ACCESS_TOKEN),
    });
  }
  checkAccess(req);
  if (req.method === "GET" && url.pathname === "/api/check") return send(res, 200, { ok: true });
  if (req.method === "POST" && url.pathname === "/api/plan") {
    const input = validateRequest(await readJson(req));
    const offers = await loadOffers(input);
    const plan = await requestPlan({ ...input, offers });
    return send(res, 200, { ...plan, offerCount: offers.length, provider: provider() });
  }
  if (req.method === "POST" && url.pathname === "/api/swap") {
    const input = validateSwap(await readJson(req));
    const offers = await loadOffers(input);
    return send(res, 200, await requestSwap({ ...input, offers }));
  }
  throw new HttpError(404, "Unbekannter Endpunkt");
}

async function handleStatic(res, url) {
  const rel = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname).replace(/^\/+/, "");
  const file = path.join(PUBLIC, rel);
  if (!file.startsWith(PUBLIC + path.sep)) throw new HttpError(404, "Nicht gefunden");
  try {
    const data = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
    res.end(data);
  } catch {
    throw new HttpError(404, "Nicht gefunden");
  }
}

export function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      if (url.pathname.startsWith("/api/")) await handleApi(req, res, url);
      else await handleStatic(res, url);
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error(e);
      send(res, status, { error: status === 500 ? "Interner Fehler" : e.message });
    }
  });
}

function send(res, status, obj) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > 64 * 1024) throw new HttpError(413, "Anfrage zu groß");
    chunks.push(c);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw new HttpError(400, "Ungültiges JSON");
  }
}

function loadDotEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createServer().listen(PORT, HOST, () => {
    console.log(`Wochenplaner: http://${HOST}:${PORT}  (Angebotsquelle: ${provider()})`);
  });
}
