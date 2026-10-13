// Warengruppen für den Angebote-Reiter. Die Angebotsquelle liefert keine verlässliche Kategorie,
// deshalb wird anhand von Stichwörtern im Produktnamen (ersatzweise in der Beschreibung) zugeordnet.
//
// Regeln werden der Reihe nach geprüft, die erste passende gewinnt: Spezielles steht vor Allgemeinem
// ("Passierte Tomaten" vor "Tomaten", "Fruchtjoghurt" vor "Frucht", "Reis" vor "Eis").
// Nicht erkannte Produkte landen in "Sonstiges".
//
// Schreibweise der Stichwörter (Umlaute und Groß-/Kleinschreibung spielen keine Rolle):
//   "wurst"     steckt irgendwo in einem Wort        "=eis"   ist genau dieses Wort
//   "^lamm"     Wort beginnt damit                   "$wein"  Wort endet darauf
//   "rote bete" Wortfolge im ganzen Text
// Zusammensetzungen werden an Bindestrichen getrennt ("Hähnchen-Pfanne" → "hahnchen", "pfanne").

export const CATEGORIES = [
  ["obst", "Obst"],
  ["gemuese", "Gemüse"],
  ["fleisch", "Fleisch & Geflügel"],
  ["wurst", "Schinken & Wurstwaren"],
  ["fisch", "Fisch & Meeresfrüchte"],
  ["kaese", "Käse"],
  ["milch", "Milch, Joghurt & Eier"],
  ["brot", "Brot & Backwaren"],
  ["vorrat", "Vorrat & Konserven"],
  ["tiefkuehl", "Tiefkühlkost"],
  ["suesses", "Süßigkeiten & Snacks"],
  ["getraenke", "Getränke"],
  ["alkohol", "Alkohol"],
  ["nonfood", "Non-Food"],
  ["sonstiges", "Sonstiges"],
];

const norm = (s) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss");

function prepare(text) {
  const flat = norm(text).replace(/[^a-z0-9]+/g, " ").trim();
  return { flat: ` ${flat} `, words: flat ? flat.split(" ") : [] };
}

function compile(keywords) {
  const exact = new Set();
  const starts = [];
  const ends = [];
  const contains = [];
  const phrases = [];
  for (const raw of keywords) {
    const k = norm(raw);
    if (k.startsWith("=")) exact.add(k.slice(1));
    else if (k.startsWith("^")) starts.push(k.slice(1));
    else if (k.startsWith("$")) ends.push(k.slice(1));
    else if (k.includes(" ")) phrases.push(` ${k} `);
    else contains.push(k);
  }
  return ({ words, flat }) =>
    words.some((w) => exact.has(w) || starts.some((s) => w.startsWith(s)) || ends.some((e) => w.endsWith(e)) || contains.some((c) => w.includes(c))) ||
    phrases.some((p) => flat.includes(p));
}

const RULES = [
  // Haushalt, Drogerie, Tier, Elektro, Textil … steht ganz vorn, damit "Katzenfutter mit Lachs" nicht als Fisch endet.
  ["nonfood", [
    "^wasch", "weichspuler", "^spul", "geschirrspul", "reiniger", "entkalker", "=tabs", "$papier", "klopapier",
    "kuchenrolle", "taschentuch", "$tuch", "$tucher", "serviette", "windel",
    "shampoo", "duschgel", "duschbad", "seife", "^zahn", "mundspul", "^deo", "^haar", "^rasier",
    "handcreme", "hautcreme", "korperlotion", "bodylotion", "lotion", "gesichtscreme", "sonnencreme", "sonnenmilch",
    "sonnenbrille", "sonnenschutz", "lippenpflege", "nagellack", "tampon", "damenbinde", "slipeinlage", "pflaster", "kondom",
    "tierfutter", "katzenfutter", "hundefutter", "vogelfutter", "nagerfutter", "fischfutter", "=futter", "katzenstreu",
    "leckerli", "hundekeks", "hundesnack", "katzensnack",
    "batterie", "akku", "gluhbirne", "leuchtmittel", "=lampe", "$lampe", "kerze", "teelicht",
    "mullbeutel", "mullsack", "gefrierbeutel", "frischhaltefolie", "alufolie", "$folie", "backpapier",
    "holzkohle", "grillkohle", "=kohle", "brikett", "anzunder", "streichholz", "feuerzeug",
    "blumenerde", "pflanzerde", "dunger", "=blumen", "blumenstrauss", "blumentopf", "=strauss", "=pflanze", "=pflanzen",
    "$pflanze", "orchidee", "=topf", "kochtopf", "bratpfanne", "grillpfanne", "geschirr", "besteck", "trinkflasche",
    "socken", "strumpfhose", "unterwasche", "=shirt", "=hose", "=jacke", "pullover", "schuhe", "handschuh", "=mutze", "=schal",
    "bohrer", "schrauben", "werkzeug", "=kabel", "$kabel", "ladegerat", "kopfhorer", "lautsprecher", "smartphone", "=tablet",
    "maschine", "=toaster", "wasserkocher", "staubsauger", "bugeleisen", "=mixer", "fernseher",
    "spielzeug", "puzzle", "=lego", "=buch", "$buch", "zeitschrift", "geschenk", "=deko", "dekoration", "kissen", "=decke",
    "bettwasche", "handtuch", "matratze", "schulranzen", "$stift", "farbstift", "notizbuch",
  ]],

  // Alkoholfreies zuerst, sonst würde "Bier alkoholfrei" bei Alkohol landen.
  ["getraenke", ["alkoholfrei"]],
  ["alkohol", [
    "rotwein", "weisswein", "rosewein", "gluhwein", "schaumwein", "dessertwein", "apfelwein", "reiswein", "kochwein",
    "tafelwein", "landwein", "qualitatswein", "=wein", "weinbrand",
    "$bier", "=bier", "^pils", "pilsner", "hefeweizen", "radler", "shandy",
    "sekt", "prosecco", "champagner", "secco", "wodka", "vodka", "whisky", "whiskey", "=gin", "=rum", "likor", "schnaps",
    "=korn", "brandy", "cognac", "aperol", "=spritz", "cider", "cidre", "jagermeister", "amaretto", "tequila", "absinth",
    "grappa", "ouzo", "obstler", "aquavit",
  ]],
  ["tiefkuehl", [
    "tiefkuhl", "tiefgekuhlt", "=tk", "^tk", "pommes", "kroketten", "=rosti", "^rosti", "fischstabchen", "backfisch", "nuggets",
    "eiscreme", "speiseeis", "=eis", "vanilleeis", "schokoeis", "fruchteis", "eis am stiel", "magnum", "cornetto", "=pizza", "$pizza",
  ]],

  // Pflanzliche Milchersatzgetränke gehören zu Milch, nicht zu den Getränken.
  ["milch", [
    "haferdrink", "sojadrink", "mandeldrink", "reisdrink", "kokosdrink", "pflanzendrink", "hafermilch", "sojamilch",
    "mandelmilch", "reismilch", "haferbarista", "oatly", "alpro",
  ]],
  ["getraenke", [
    "saft", "schorle", "limonade", "=limo", "=cola", "$cola", "=fanta", "=sprite", "pepsi", "=spezi", "^mezzo", "energy", "red bull", "=monster",
    "$drink", "=drink", "$wasser", "=wasser", "sprudel", "=still", "=tee", "$tee", "teebeutel", "kaffee", "espresso", "cappuccino",
    "kakao", "smoothie", "=nektar", "$nektar", "multivitamin", "eistee", "durstloscher", "getrank", "tonic", "bitter lemon", "ginger ale",
    "club mate", "kombucha",
  ]],

  // Eindeutiger Vorrat, der sonst als Gemüse/Obst/Milch durchgehen würde.
  ["vorrat", [
    "passierte", "gehackte tomaten", "stuckige tomaten", "tomatenmark", "tomatensosse", "tomatensauce", "tomatenpuree", "pelati",
    "ketchup", "pesto", "sosse", "sauce", "dressing", "mayonnaise", "=mayo", "senf", "essig",
    "gewurz", "paprikapulver", "muskat", "zimt", "$pfeffer", "=pfeffer", "pfefferkorn", "=salz", "$salz",
    "=zucker", "$zucker", "vanillezucker", "mehl", "backmischung", "backpulver", "=hefe", "trockenhefe", "gelatine", "$starke",
    "konserve", "eingelegt", "=oliven", "$oliven", "gewurzgurke", "essiggurke", "sauerkraut", "rostzwiebel", "kapern",
    "kokosmilch", "kokoscreme", "erdnussbutter", "marmelade", "konfiture", "=honig", "$honig", "aufstrich", "sirup",
    "apfelmus", "$mus", "=mus", "puree", "knodel", "klose", "instant", "=suppe", "$suppe", "=suppen", "eintopf", "bruhe", "=fond", "fertiggericht",
    "cornflakes", "=musli", "$musli", "haferflocken", "granola", "porridge", "cerealien", "rosinen",
    "milchreis", "=reis", "basmati", "jasmin", "langkorn", "parboiled", "risotto", "naturreis", "wildreis", "rundkorn", "vollkornreis",
  ]],

  ["suesses", [
    "schoko", "praline", "bonbon", "gummi", "lakritz", "keks", "cookie", "riegel", "=chips", "$chips", "flips", "=snack", "=snacks",
    "$snack", "$snacks", "salzstange", "salzgeback", "cracker", "popcorn", "waffel", "lebkuchen", "spekulatius", "stollen",
    "marzipan", "nougat", "nutella", "kaugummi", "=drops", "pastille", "traubenzucker", "fruchtschnitte", "milchschnitte",
    "haribo", "milka", "ritter sport", "toffifee", "raffaello", "lindt", "ferrero", "duplo", "hanuta", "snickers", "twix",
    "bounty", "mentos", "marshmallow", "susswaren", "lutscher", "dragee", "zartbitter",
    "nusse", "mandeln", "erdnuss", "walnuss", "haselnuss", "cashew", "pistazie", "paranuss", "pekannuss", "macadamia", "studentenfutter", "trockenfruchte",
  ]],

  ["wurst", [
    "wurst", "schinken", "salami", "=speck", "$speck", "^speck", "bacon", "mortadella", "leberkas", "aufschnitt", "kassler",
    "kasseler", "corned beef", "pastrami", "chorizo", "kabanos", "cabanossi", "landjager", "lyoner", "krakauer", "fleischsalat",
    "fleischkase", "hackepeter", "=mett", "=pate", "pastete", "sulze", "krainer", "prosciutto", "=parma", "serrano", "coppa", "pancetta",
  ]],
  ["fisch", [
    "fisch", "lachs", "forelle", "thunfisch", "hering", "matjes", "rollmops", "garnele", "shrimp", "scampi", "krabbe", "hummer",
    "muschel", "austern", "tintenfisch", "calamari", "kabeljau", "seelachs", "pangasius", "dorade", "zander", "makrele", "sardine",
    "sardelle", "anchovis", "scholle", "seezunge", "heilbutt", "wolfsbarsch", "saibling", "karpfen", "=aal", "raucheraal", "surimi",
    "meeresfruchte", "sushi", "rotbarsch", "tilapia", "kaviar",
  ]],
  ["fleisch", [
    "fleisch", "hahnchen", "=huhn", "$huhn", "huhnchen", "huhnerbrust", "huhnerkeule", "huhnerschenkel", "huhnerfleisch", "suppenhuhn", "hendl", "poularde", "=pute", "^puten", "=ente", "^enten", "=gans", "ganse", "geflugel",
    "=rind", "^rinder", "^rinds", "rindfleisch", "schwein", "wildschwein", "steak", "schnitzel", "kotelett", "^hack", "gulasch",
    "geschnetzel", "roulade", "$braten", "=braten", "$filet", "=filet", "$brust", "=brust", "schenkel", "keule", "flugel", "nacken",
    "$bauch", "rippchen", "spareribs", "=ribs", "=burger", "$burger", "frikadelle", "bulette", "^kalb", "^lamm", "=wild",
    "hirsch", "=reh", "kaninchen", "gyros", "doner", "kebab", "schaschlik", "=leber", "haxe", "eisbein", "chicken",
  ]],
  ["kaese", [
    "kase", "gouda", "edamer", "emmental", "parmesan", "=grana", "grana padano", "pecorino", "mozzarella", "burrata", "camembert", "=brie", "gorgonzola",
    "roquefort", "=feta", "halloumi", "raclette", "tilsiter", "cheddar", "maasdamer", "leerdammer", "appenzeller", "manchego",
    "ricotta", "mascarpone", "philadelphia", "babybel", "gruyere", "munster", "limburger", "harzer", "edelpilz", "cambozola",
    "boursin", "gervais", "rougette", "bavaria blu",
  ]],
  ["milch", [
    "milch", "joghurt", "jogurt", "yoghurt", "quark", "skyr", "kefir", "sahne", "=butter", "$butter", "butterschmalz", "margarine",
    "schmand", "creme fraiche", "=eier", "$eier", "=ei", "eigelb", "pudding", "dessert", "mousse", "griessbrei", "panna cotta",
    "fruchtzwerge", "actimel", "danone", "molke",
  ]],
  ["brot", [
    "$brot", "=brot", "brotchen", "semmel", "=toast", "$toast", "baguette", "ciabatta", "croissant", "brezel", "laugen", "kuchen",
    "=torte", "$torte", "^torten", "geback", "muffin", "donut", "berliner", "zopf", "wecken", "=wrap", "=wraps", "$wrap", "$wraps",
    "=tortilla", "=pita", "=pitas", "=naan", "zwieback", "pumpernickel", "sandwich", "flammkuchen", "aufback", "$teig", "=teig",
  ]],

  ["obst", [
    "apfel", "banane", "birne", "traube", "orange", "mandarine", "clementine", "zitrone", "limette", "grapefruit", "ananas",
    "=mango", "=mangos", "melone", "kiwi", "erdbeer", "himbeer", "heidelbeer", "blaubeer", "brombeer", "johannisbeer",
    "stachelbeer", "cranberr", "$beeren", "$beere", "=kirschen", "=kirsche", "sauerkirsch", "susskirsch", "pflaume", "zwetschge",
    "pfirsich", "nektarine", "aprikose", "papaya", "avocado", "feige", "granatapfel", "=kaki", "litschi", "physalis", "maracuja",
    "passionsfrucht", "obst", "sudfrucht", "dattel", "kokosnuss",
  ]],
  ["gemuese", [
    "prinzessbohnen", "buschbohnen", "stangenbohnen", "brechbohnen", "gartenbohnen", "grune bohnen", "dicke bohnen", "zuckerschote",
    "tomate", "gurke", "paprika", "zucchini", "aubergine", "brokkoli", "broccoli", "blumenkohl", "karotte", "mohre", "zwiebel",
    "knoblauch", "lauch", "porree", "sellerie", "spinat", "salat", "rucola", "radieschen", "rettich", "kohl", "kartoffel", "kurbis",
    "rote bete", "=bete", "spargel", "fenchel", "pilz", "champignon", "pfifferling", "kraut", "krauter", "petersilie", "schnittlauch",
    "basilikum", "=dill", "koriander", "ingwer", "maiskolben", "mangold", "chicoree", "endivie", "pak choi", "kresse", "sprossen",
    "peperoni", "=chili", "jalapeno", "suppengrun", "rhabarber", "artischocke", "topinambur", "pastinake", "meerrettich", "gemuse",
  ]],

  // Allgemeiner Vorrat zuletzt, damit z. B. "grüne Bohnen" (frisch) vor "Bohnen" (Konserve) greift.
  ["vorrat", [
    "nudel", "spaghetti", "penne", "fusilli", "tortellini", "tortelloni", "makkaroni", "maccaroni", "tagliatelle", "lasagne",
    "gnocchi", "=pasta", "$pasta", "spatzle", "couscous", "bulgur", "quinoa", "linsen", "kichererbsen", "bohnen", "erbsen",
    "=mais", "$mais", "=dose", "=dosen", "tofu", "seitan", "hulsenfruchte", "teigwaren",
    "olivenol", "rapsol", "sonnenblumenol", "speiseol", "kokosol", "sesamol", "=ol",
  ]],
];

const COMPILED = RULES.map(([id, keywords]) => ({ id, match: compile(keywords) }));

// Gibt die ID der Warengruppe zurück ("obst", "fleisch", …). Zuerst zählt der Produktname,
// nur wenn der nichts hergibt, wird die Beschreibung herangezogen.
export function categorizeOffer(offer) {
  for (const text of [offer.product, offer.description]) {
    if (!text) continue;
    const prepared = prepare(text);
    const hit = COMPILED.find((r) => r.match(prepared));
    if (hit) return hit.id;
  }
  return "sonstiges";
}

// Gruppiert Angebote nach Warengruppe in fester Reihenfolge (leere Gruppen entfallen). Innerhalb einer
// Gruppe alphabetisch nach Produkt, bei gleichem Produkt nach Markt, damit sich Preise gut vergleichen lassen.
export function groupOffersByCategory(offers) {
  const byId = new Map(CATEGORIES.map(([id, label]) => [id, { id, label, items: [] }]));
  for (const o of offers) {
    if (!o.retailerId) continue;
    byId.get(categorizeOffer(o)).items.push(o);
  }
  const cmp = (a, b) => a.product.localeCompare(b.product, "de") || a.retailer.localeCompare(b.retailer, "de");
  return [...byId.values()].filter((g) => g.items.length).map((g) => ({ ...g, items: g.items.slice().sort(cmp) }));
}
