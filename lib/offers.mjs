import { fetchMarktguruOffers } from "./marktguru.mjs";
import { SAMPLE_OFFERS } from "./sample-offers.mjs";

const TTL_MS = 6 * 36e5;
const cache = new Map();

export const provider = () => (process.env.OFFERS_PROVIDER || "marktguru").toLowerCase();

export async function getOffers({ zip, retailers, dislikes = [] }) {
  const mode = provider();
  let all;
  if (mode === "sample") {
    all = SAMPLE_OFFERS;
  } else {
    const hit = cache.get(zip);
    if (hit && Date.now() - hit.at < TTL_MS) {
      all = hit.offers;
    } else {
      all = await fetchMarktguruOffers({ zip });
      cache.set(zip, { at: Date.now(), offers: all });
    }
  }
  return filterOffers(all, { retailers, dislikes });
}

export function filterOffers(offers, { retailers, dislikes = [] }) {
  const wanted = new Set(retailers);
  const bad = dislikes.map((d) => d.trim().toLowerCase()).filter(Boolean);
  const today = new Date().toISOString().slice(0, 10);
  return offers.filter((o) => {
    if (!o.retailerId || !wanted.has(o.retailerId)) return false;
    if (o.validTo && o.validTo < today) return false;
    const text = `${o.product} ${o.description}`.toLowerCase();
    return !bad.some((d) => text.includes(d));
  });
}
