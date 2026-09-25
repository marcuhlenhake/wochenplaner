# Wochenplaner

Web-App (PWA) für Android: Du wählst Postleitzahl und Supermärkte, trägst ein, was du nicht isst, und bekommst sieben Abendessen, die um die aktuellen Angebote dieser Märkte herum geplant sind, plus Einkaufsliste je Markt.

## Ablauf

1. Das Backend holt die aktuellen Angebote zur Postleitzahl (`lib/marktguru.mjs`, inoffizielle Marktguru-Web-API) und filtert auf die gewählten Märkte, das Ablaufdatum und die Abneigungen.
2. Claude (`lib/planner.mjs`) plant 7 Gerichte und verweist bei jeder Angebotszutat per ID auf ein Angebot. Erfundene IDs werden verworfen, Preise und Märkte stammen immer aus den echten Angebotsdaten.
3. Verstöße gegen die Abneigungen werden in der Oberfläche als Warnung angezeigt.

## Funktionen

- **Gericht tauschen:** Im aufgeklappten Tag ersetzt „Anderes Gericht“ nur diesen einen Tag. Claude vermeidet die übrigen Gerichte der Woche und nutzt bevorzugt Angebote weiter, die für andere Tage ohnehin gekauft werden. Kommt trotzdem ein zu ähnliches Gericht zurück (auch unter anderem Namen), fragt der Server automatisch bis zu zweimal erneut nach, bevor er antwortet.
- **Plan bleibt gespeichert:** Wochenplan, Einkaufsliste und abgehakte Artikel liegen im Browser (localStorage) und überstehen ein Neuladen. „Plan löschen“ entfernt ihn. Sind Angebote abgelaufen, weist die Seite darauf hin.
- **Mehr Angebote:** Die Suche fragt ca. 135 Begriffe mit bis zu zwei Ergebnisseiten ab. Weitere Begriffe ergänzt du ohne Codeänderung in `.env`, z. B. `OFFER_QUERIES_EXTRA=hirse,ziegenkäse,tempeh`. Vor dem Senden an Claude werden Doppelte entfernt und die Angebote reihum auf die Märkte verteilt (max. 400).
- **Symbole:** PNG-Symbole für Android und iOS liegen in `public/`. Neu erzeugen mit `node tools/make-icons.mjs`.
- **Liste teilen:** In der Einkaufsliste teilt „Liste teilen“ die noch offenen Artikel (bereits abgehakte werden weggelassen) über das Teilen-Menü des Handys, z. B. an WhatsApp, Notizen oder E-Mail. Ohne Teilen-Funktion landet der Text in der Zwischenablage, als letzter Rückfall in einem Textfeld zum manuellen Kopieren. Eine direkte Übergabe an die Alexa-Einkaufsliste ist nicht möglich – Amazon hat die dafür nötige Schnittstelle für Drittanbieter am 1. Juli 2024 abgeschaltet.
- **Nährwerte:** Zu jedem Gericht schätzt Claude Kalorien, Eiweiß, Kohlenhydrate und Fett pro Portion anhand der Zutatenmengen. Das ist eine grobe KI-Schätzung, keine Laboranalyse – für eine verlässliche Zählung (z. B. bei einer Diät) taugt sie nicht.

## Starten

```bash
cp .env.example .env      # ANTHROPIC_API_KEY eintragen
npm start                 # http://127.0.0.1:3000
npm test                  # Tests ohne Netzwerk
```

Ohne Netz oder zum Ausprobieren: `OFFERS_PROVIDER=sample` verwendet Beispielangebote (`lib/sample-offers.mjs`).

## Dauerbetrieb ohne eigenen PC (Render.com, kostenlos)

Damit die App erreichbar ist, ohne dass dein PC läuft, liegt sie auf einem kostenlosen Render-Webdienst. Er schläft nach ca. 15 Minuten ohne Aufruf ein; der nächste Aufruf dauert dann 30–60 Sekunden länger, bis er wieder da ist.

1. Code zu GitHub bringen (einmalig):
   ```bash
   git remote add origin https://github.com/<DEIN-BENUTZERNAME>/wochenplaner.git
   git branch -M main
   git push -u origin main
   ```
2. Auf [render.com](https://render.com) mit dem GitHub-Konto anmelden, „New +“ → „Web Service“ → das Repository `wochenplaner` auswählen. Render erkennt `render.yaml` und schlägt Node, Startbefehl `node server.mjs` und den kostenlosen Plan automatisch vor.
3. Unter „Environment“ drei Werte selbst eintragen (stehen nicht in `render.yaml`, damit sie nicht im Code landen):
   - `ANTHROPIC_API_KEY` – dein Schlüssel aus der Claude Console
   - `ACCESS_TOKEN` – derselbe Zugangscode wie lokal, oder ein neuer
   - `HOST` = `0.0.0.0` (Render braucht das, damit der Dienst von außen erreichbar ist)
4. „Deploy“ klicken. Nach ein bis zwei Minuten zeigt Render eine feste Adresse wie `https://wochenplaner-xxxx.onrender.com`. Diese Adresse ändert sich nicht mehr – sie kann als PWA installiert und gespeichert werden.

Bei jedem `git push` auf `main` aktualisiert Render die App automatisch neu.

## Auf dem Handy nutzen (Cloudflare Tunnel)

Für kurze Tests ohne GitHub/Render, solange der PC läuft.

Chrome installiert eine PWA nur über HTTPS. Ein Cloudflare Tunnel macht den Server auf deinem PC unter einer HTTPS-Adresse erreichbar, ohne Portfreigabe im Router.

**Zugangscode:** Sobald die App im Internet erreichbar ist, könnte jeder mit der Adresse dein API-Guthaben verbrauchen. Deshalb sind alle Schnittstellen außer `/api/config` durch `ACCESS_TOKEN` (in `.env`) geschützt. Die Seite selbst bleibt offen, sonst könnte Chrome sie nicht installieren. Beim ersten Öffnen fragt die App nach dem Code und merkt ihn sich auf dem Gerät. Nach 20 Fehlversuchen pro Minute sperrt der Server kurz. `start-mit-tunnel.cmd` startet nicht ohne gesetzten Code.

### Schnellstart (ohne Konto, Adresse ändert sich bei jedem Start)

```bash
winget install --id Cloudflare.cloudflared -e
```

Danach `start-mit-tunnel.cmd` doppelklicken. Im Tunnel-Fenster erscheint eine Adresse `https://<zufallswörter>.trycloudflare.com`. Öffne sie am Handy in Chrome, gib den Zugangscode ein und wähle „Zur Startseite hinzufügen“ bzw. „App installieren“.

Weil sich die Adresse bei jedem Start ändert, geht die installierte App dann ins Leere. Für den Dauerbetrieb brauchst du einen benannten Tunnel.

### Feste Adresse (benannter Tunnel)

Braucht ein kostenloses Cloudflare-Konto und eine Domain, die bei Cloudflare verwaltet wird.

1. Im Cloudflare-Dashboard unter Zero Trust → Networks → Tunnels einen Tunnel anlegen und den Token kopieren.
2. Als öffentlichen Hostnamen z. B. `essen.deine-domain.de` mit dem Dienst `http://127.0.0.1:3000` eintragen.
3. Tunnel starten: `cloudflared tunnel run --token <TOKEN>` (den Token nicht weitergeben).

Der PC und beide Fenster (Server, Tunnel) müssen laufen, damit die App erreichbar ist.

### Weitere Hinweise

- Auf einem Firmenrechner vorher klären, ob Tunnel ins Internet erlaubt sind.
- `HOST=0.0.0.0` ist nicht nötig und sollte nicht gesetzt werden. `cloudflared` verbindet sich lokal mit `127.0.0.1`.
- Alternativ kann der Server auf einem kleinen Hoster laufen (Node ≥ 20, keine Abhängigkeiten).

## Bekannte Grenzen

- Die Marktguru-Schnittstelle ist inoffiziell und verstößt vermutlich gegen deren Nutzungsbedingungen. Sie kann sich jederzeit ändern. Nur für den privaten Prototyp gedacht.
- Die Angebotssuche fragt nur bekannte Lebensmittel-Suchbegriffe ab (`FOOD_QUERIES` in `lib/marktguru.mjs` plus `OFFER_QUERIES_EXTRA`); Angebote außerhalb dieser Begriffe fehlen. Das erste Laden pro Postleitzahl dauert wegen der vielen Abfragen länger; danach sind die Angebote 6 Stunden zwischengespeichert.
- Angebote gelten oft nur für einzelne Tage der Woche. Das Ablaufdatum wird gefiltert, der Beginn nicht.
- Der gespeicherte Plan liegt nur in diesem Browser auf diesem Gerät, nicht auf dem Server.
