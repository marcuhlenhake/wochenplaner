import { buildShopping, buildShareText } from "./shopping.js";

const $ = (id) => document.getElementById(id);
const SETTINGS_KEY = "wochenplaner.settings.v1";
const PLAN_KEY = "wochenplaner.plan.v1";
const TOKEN_KEY = "wochenplaner.token.v1";
const eur = (n) => (n == null ? "–" : n.toLocaleString("de-DE", { style: "currency", currency: "EUR" }));

const state = { retailers: new Set(), dislikes: [], plan: null };

function readStore(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}
function writeStore(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Speicher nicht verfügbar – App funktioniert weiter */
  }
}

function saveSettings() {
  writeStore(SETTINGS_KEY, {
    zip: $("zip").value,
    retailers: [...state.retailers],
    dislikes: state.dislikes,
    persons: $("persons").value,
    diet: $("diet").value,
  });
}
const savePlan = () => writeStore(PLAN_KEY, state.plan);

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  for (const c of children) node.append(c);
  return node;
}

function renderRetailers(list) {
  $("retailers").replaceChildren(
    ...list.map((r) => {
      const input = el("input", { type: "checkbox", value: r.id, checked: state.retailers.has(r.id) });
      input.addEventListener("change", () => {
        input.checked ? state.retailers.add(r.id) : state.retailers.delete(r.id);
        saveSettings();
      });
      return el("label", {}, input, r.label);
    }),
  );
}

function renderDislikes() {
  $("dislikes").replaceChildren(
    ...state.dislikes.map((d) => {
      const remove = el("button", { type: "button", ariaLabel: `${d} entfernen`, textContent: "×" });
      remove.addEventListener("click", () => {
        state.dislikes = state.dislikes.filter((x) => x !== d);
        renderDislikes();
        saveSettings();
      });
      return el("span", { className: "tag" }, d, remove);
    }),
  );
}

function addDislike() {
  const input = $("dislike-input");
  for (const part of input.value.split(",")) {
    const v = part.trim();
    if (v && !state.dislikes.some((d) => d.toLowerCase() === v.toLowerCase())) state.dislikes.push(v);
  }
  input.value = "";
  renderDislikes();
  saveSettings();
}

function showNotice(text, kind = "") {
  const n = $("notice");
  n.textContent = text;
  n.className = `notice ${kind}`;
  n.hidden = !text;
}

let pendingToken = null;
function askToken(message) {
  pendingToken ??= new Promise((resolve) => {
    const dialog = $("token-dialog");
    $("token-msg").textContent = message;
    $("token-input").value = "";
    dialog.addEventListener(
      "close",
      () => {
        pendingToken = null;
        resolve(dialog.returnValue === "ok" ? $("token-input").value.trim() : null);
      },
      { once: true },
    );
    dialog.showModal();
    $("token-input").focus();
  });
  return pendingToken;
}

// Fragt bei 401 einmal nach dem Zugangscode, speichert ihn und wiederholt die Anfrage.
async function api(url, body, retry = true) {
  const token = readStore(TOKEN_KEY);
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json", ...(token ? { "x-access-token": token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    writeStore(TOKEN_KEY, null);
    const entered = retry ? await askToken(data.error || "Zugangscode erforderlich.") : null;
    if (entered) {
      writeStore(TOKEN_KEY, entered);
      return api(url, body, false);
    }
  }
  if (!res.ok) throw new Error(data.error || `Fehler ${res.status}`);
  return data;
}
const postJson = (url, body) => api(url, body);

async function swapDay(index, button, message) {
  const plan = state.plan;
  const day = plan.days[index];
  const keep = plan.days.flatMap((d, i) => (i === index ? [] : d.ingredients.map((ing) => ing.offer?.id))).filter(Boolean);
  button.disabled = true;
  button.textContent = "Suche neues Gericht …";
  message.textContent = "";
  try {
    const data = await postJson("/api/swap", {
      ...plan.request,
      day: day.day,
      avoid: plan.days.map((d) => d.title),
      keepOfferIds: [...new Set(keep)],
    });
    plan.days[index] = data.dish;
    plan.warnings = plan.warnings.filter((w) => !w.startsWith(`${day.day}:`)).concat(data.warnings);
    savePlan();
    renderPlan(day.day);
  } catch (err) {
    message.textContent = err.message;
    button.disabled = false;
    button.textContent = "Anderes Gericht";
  }
}

function renderPlan(openDay) {
  const plan = state.plan;
  const today = new Date().toISOString().slice(0, 10);
  const expired = plan.days.some((d) => d.ingredients.some((i) => i.offer?.validTo && i.offer.validTo < today));
  const created = new Date(plan.createdAt).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
  $("meta").textContent =
    `${plan.offerCount} passende Angebote${plan.provider === "sample" ? " (Demodaten)" : ""} · erstellt ${created}` +
    (expired ? " · Einige Angebote sind abgelaufen, erstelle bei Bedarf einen neuen Plan." : "");

  const warn = $("warnings");
  warn.hidden = !plan.warnings.length;
  warn.textContent = plan.warnings.length ? `Prüfe bitte: ${plan.warnings.join("; ")}` : "";

  $("plan").replaceChildren(
    ...plan.days.map((d, i) => {
      const details = el("details", { className: "day", open: openDay ? d.day === openDay : i === 0 });
      const dname = el("span", { className: "dname", textContent: `${d.day} · ${d.minutes} Min.` });
      if (d.nutrition?.kcal != null) dname.append(el("span", { className: "kcal", textContent: ` · ${d.nutrition.kcal} kcal/Portion` }));
      details.append(el("summary", {}, dname, el("span", { className: "dtitle", textContent: d.title })));
      const ings = el("ul");
      for (const ing of d.ingredients) {
        const li = el("li", { textContent: `${ing.amount} ${ing.name}` });
        if (ing.offer) li.append(" ", el("span", { className: "badge", textContent: `Angebot bei ${ing.offer.retailer}${ing.offer.price != null ? ` · ${eur(ing.offer.price)}` : ""}` }));
        ings.append(li);
      }
      const steps = el("ol", {}, ...d.steps.map((s) => el("li", { textContent: s })));
      const swap = el("button", { type: "button", className: "swap", textContent: "Anderes Gericht" });
      const message = el("p", { className: "swap-error", role: "alert" });
      swap.addEventListener("click", () => swapDay(i, swap, message));
      const body = [el("strong", { textContent: "Zutaten" }), ings];
      if (d.nutrition) {
        const n = d.nutrition;
        const parts = [
          n.kcal != null && `${n.kcal} kcal`,
          n.protein_g != null && `${n.protein_g} g Eiweiß`,
          n.carbs_g != null && `${n.carbs_g} g Kohlenhydrate`,
          n.fat_g != null && `${n.fat_g} g Fett`,
        ].filter(Boolean);
        if (parts.length) {
          body.push(
            el("strong", { textContent: "Nährwert pro Portion (geschätzt)" }),
            el("p", { className: "nutrition", textContent: parts.join(" · ") }),
          );
        }
      }
      body.push(el("strong", { textContent: "Zubereitung" }), steps, swap, message);
      details.append(el("div", { className: "body" }, ...body));
      return details;
    }),
  );

  const checked = new Set(plan.checked);
  $("shop-groups").replaceChildren(
    ...buildShopping(plan.days).map((g) => {
      const box = el("div", { className: "shopgroup" }, el("h3", {}, el("span", { textContent: g.retailer }), el("span", { textContent: eur(g.total) })));
      for (const it of g.items) {
        const key = `${g.retailer}|${it.product}`;
        const cb = el("input", { type: "checkbox", checked: checked.has(key) });
        cb.addEventListener("change", () => {
          cb.checked ? checked.add(key) : checked.delete(key);
          plan.checked = [...checked];
          savePlan();
        });
        box.append(el("label", {}, cb, el("span", {}, `${it.product} · ${eur(it.price)}`, ...it.needs.map((n) => el("span", { className: "need", textContent: n })))));
      }
      return box;
    }),
    el("p", { className: "meta", textContent: "Preise laut Angebotsquelle (Angebotspreis der Packung); Vorratszutaten wie Öl oder Gewürze sind nicht enthalten." }),
  );
  $("result").hidden = false;
}

async function shareShoppingList() {
  const text = buildShareText(state.plan.days, state.plan.checked);
  if (!text) return showNotice("Alles schon abgehakt – nichts mehr zu teilen.", "info");
  if (navigator.share) {
    try {
      await navigator.share({ title: "Einkaufsliste", text });
    } catch (err) {
      if (err.name !== "AbortError") showShareFallback(text);
    }
    return;
  }
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return showNotice("Einkaufsliste in die Zwischenablage kopiert.", "info");
    } catch {
      /* Rückfall unten */
    }
  }
  showShareFallback(text);
}

function showShareFallback(text) {
  $("share-text").value = text;
  $("share-dialog").showModal();
}

function selectTab(name) {
  const plan = name === "plan";
  $("tab-plan").ariaSelected = String(plan);
  $("tab-shop").ariaSelected = String(!plan);
  $("plan").hidden = !plan;
  $("shop").hidden = plan;
}

function deletePlan() {
  if (!confirm("Gespeicherten Wochenplan löschen?")) return;
  state.plan = null;
  savePlan();
  $("result").hidden = true;
}

async function submit(e) {
  e.preventDefault();
  showNotice("");
  if ($("dislike-input").value.trim()) addDislike();
  if (!state.retailers.size) return showNotice("Bitte wähle mindestens einen Supermarkt aus.");
  saveSettings();
  const request = {
    zip: $("zip").value.trim(),
    retailers: [...state.retailers],
    dislikes: [...state.dislikes],
    persons: Number($("persons").value),
    diet: $("diet").value,
  };
  $("go").disabled = true;
  $("loading").hidden = false;
  $("result").hidden = true;
  try {
    const data = await postJson("/api/plan", request);
    state.plan = { createdAt: Date.now(), request, days: data.days, warnings: data.warnings, offerCount: data.offerCount, provider: data.provider, checked: [] };
    savePlan();
    renderPlan();
    selectTab("plan");
    $("result").scrollIntoView({ behavior: "smooth" });
  } catch (err) {
    showNotice(err.message);
    if (state.plan) $("result").hidden = false;
  } finally {
    $("go").disabled = false;
    $("loading").hidden = true;
  }
}

async function init() {
  const persons = $("persons");
  for (let i = 1; i <= 8; i++) persons.append(el("option", { value: i, textContent: i }));

  const saved = readStore(SETTINGS_KEY) ?? {};
  $("zip").value = saved.zip ?? "";
  persons.value = saved.persons ?? "2";
  $("diet").value = saved.diet ?? "alles";
  state.retailers = new Set(saved.retailers ?? []);
  state.dislikes = saved.dislikes ?? [];
  renderDislikes();

  $("form").addEventListener("submit", submit);
  $("dislike-add").addEventListener("click", addDislike);
  $("dislike-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addDislike();
    }
  });
  $("tab-plan").addEventListener("click", () => selectTab("plan"));
  $("tab-shop").addEventListener("click", () => selectTab("shop"));
  $("delete-plan").addEventListener("click", deletePlan);
  $("token-cancel").addEventListener("click", () => $("token-dialog").close("cancel"));
  $("share-shop").addEventListener("click", shareShoppingList);
  $("share-close").addEventListener("click", () => $("share-dialog").close());
  $("share-copy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText($("share-text").value);
      $("share-dialog").close();
      showNotice("Einkaufsliste in die Zwischenablage kopiert.", "info");
    } catch {
      $("share-text").select();
    }
  });
  for (const id of ["zip", "persons", "diet"]) $(id).addEventListener("change", saveSettings);

  const stored = readStore(PLAN_KEY);
  if (stored?.days?.length && stored.request) {
    state.plan = { warnings: [], checked: [], ...stored };
    renderPlan();
    selectTab("plan");
  }

  try {
    const cfg = await (await fetch("/api/config")).json();
    renderRetailers(cfg.retailers);
    if (!cfg.hasKey) showNotice("Auf dem Server ist noch kein ANTHROPIC_API_KEY gesetzt – Rezepte können erst danach erstellt werden.");
    else if (cfg.provider === "sample") showNotice("Demo-Modus: Es werden Beispielangebote verwendet, keine echten Daten.", "info");
    if (cfg.locked) await api("/api/check").catch((err) => showNotice(err.message));
  } catch {
    showNotice("Server nicht erreichbar.");
  }

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
}

init();
