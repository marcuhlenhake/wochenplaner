// Auswahlbare Ketten. `match` wird gegen den Händlernamen der Angebotsquelle geprüft.
export const RETAILERS = [
  { id: "rewe", label: "REWE", match: /^rewe/i },
  { id: "edeka", label: "EDEKA", match: /^edeka/i },
  { id: "lidl", label: "Lidl", match: /^lidl/i },
  { id: "aldi-nord", label: "ALDI Nord", match: /aldi\s*nord/i },
  { id: "aldi-sued", label: "ALDI SÜD", match: /aldi\s*s(ü|ue|u)d/i },
  { id: "kaufland", label: "Kaufland", match: /^kaufland/i },
  { id: "netto", label: "Netto Marken-Discount", match: /^netto/i },
  { id: "penny", label: "PENNY", match: /^penny/i },
  { id: "norma", label: "NORMA", match: /^norma/i },
  { id: "globus", label: "Globus", match: /^globus/i },
];

export function retailerIdFor(name) {
  return RETAILERS.find((r) => r.match.test(name || ""))?.id ?? null;
}
