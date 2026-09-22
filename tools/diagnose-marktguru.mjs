// Zeigt, wo marktguru.de seine API-Schlüssel ausliefert. Werte werden verdeckt ausgegeben.
const mask = (s) => s.replace(/[A-Za-z0-9+/=_-]{16,}/g, (m) => `${m.slice(0, 4)}…(${m.length} Zeichen)`);

async function scan(name, text) {
  const hits = [...text.matchAll(/api[_-]?key|client[_-]?key/gi)];
  console.log(`\n${name}: ${text.length} Zeichen, ${hits.length} Treffer`);
  for (const h of hits.slice(0, 6)) {
    console.log("  …" + mask(text.slice(Math.max(0, h.index - 40), h.index + 90).replace(/\s+/g, " ")) + "…");
  }
}

const res = await fetch("https://www.marktguru.de/", { headers: { "User-Agent": "Mozilla/5.0" } });
console.log("Status:", res.status, "| Inhaltstyp:", res.headers.get("content-type"));
const html = await res.text();
console.log("Titel:", /<title>(.*?)<\/title>/is.exec(html)?.[1]?.trim());
await scan("Startseite", html);

const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => new URL(m[1], "https://www.marktguru.de/").href);
console.log("\nSkripte:", scripts.length);
for (const src of scripts) {
  try {
    const t = await (await fetch(src, { headers: { "User-Agent": "Mozilla/5.0" } })).text();
    if (/api[_-]?key|client[_-]?key/i.test(t)) await scan(src.replace(/\?.*/, ""), t);
  } catch (e) {
    console.log("  Fehler bei", src, e.message);
  }
}
