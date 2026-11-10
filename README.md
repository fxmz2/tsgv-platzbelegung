# Platzbelegung – Einrichtung

Die App ist eine einzige Datei (`index.html`). Ohne Firebase-Daten läuft sie im **Demo-Modus** (oben rechts kannst du zwischen Admin, Trainern, Mitglied und neuer Person wechseln). Für den echten Betrieb mit Google-Login brauchst du ein kostenloses Firebase-Projekt – ca. 15 Minuten.

## Rollen

| Rolle | Darf |
|---|---|
| **Wartet auf Freigabe** | nichts – jede neue Google-Anmeldung landet hier |
| **Mitglied** | Plan ansehen |
| **Trainer** | Plan ansehen + für zugeordnete Mannschaft(en) buchen. Aktive: sofort bestätigt. Jugend/AH/Frauen: Anfrage an Admin |
| **Admin** | alles: Rollen & Mannschaften vergeben, Anfragen bestätigen/ablehnen, Platz sperren, jede Buchung löschen, Überschneidungen überschreiben |

Ein Trainer kann mehreren Mannschaften zugeordnet sein. Die Regeln werden serverseitig in Firestore geprüft, nicht nur in der App.

## 1. Firebase-Projekt anlegen

1. <https://console.firebase.google.com> → **Projekt hinzufügen** → Name z. B. `tsgv-platz` → Google Analytics kannst du abschalten.
2. Links **Build → Authentication → Jetzt starten** → Anbieter **Google** aktivieren → Support-E-Mail wählen → Speichern.
3. Links **Build → Firestore Database → Datenbank erstellen** → Standort `eur3 (Europe)` → **Produktionsmodus**.
4. In Firestore auf den Tab **Regeln** → Inhalt von `firestore.rules` komplett einfügen → in Zeile `bootstrapAdmins()` die Admin-Adresse prüfen (ist schon eingetragen) → **Veröffentlichen**.
5. Zahnrad oben links → **Projekteinstellungen** → unten **Web-App hinzufügen** (`</>`) → Name egal, Hosting nicht anhaken → du bekommst ein `firebaseConfig` mit `apiKey`, `authDomain`, `projectId`, `appId`.

## 2. App konfigurieren

In `index.html` ganz oben im Block `CONFIG`:

- `adminEmails`: ist schon eingetragen
- `firebase`: die vier Werte aus Schritt 5 einfügen
- optional: `halves` (z. B. `{ A: 'Vereinsheim', B: 'Straße' }`), `dayStart`/`dayEnd`, Teamfarben

Der `apiKey` ist kein Geheimnis – er darf öffentlich in der Datei stehen. Geschützt wird alles über die Regeln.

## 3. Online stellen

Am einfachsten **Netlify Drop**: <https://app.netlify.com/drop> → Ordner mit `index.html` reinziehen → du bekommst eine Adresse wie `xyz.netlify.app` (lässt sich umbenennen).
Alternativ GitHub Pages oder Firebase Hosting.

Danach in Firebase: **Authentication → Einstellungen → Autorisierte Domains → Domain hinzufügen** → z. B. `tsgv-platz.netlify.app`. Ohne diesen Schritt schlägt der Login fehl.

## 4. Loslegen

1. Selbst mit Google anmelden → du bist automatisch Admin.
2. Link an Trainer & Betreuer schicken. Sie melden sich an und erscheinen unter **Verwaltung** als „neu“.
3. Rolle wählen, bei Trainern die Mannschaft(en) antippen – fertig, deren Ansicht aktualisiert sich sofort.
4. Tipp: Auf dem Handy über „Zum Home-Bildschirm“ wie eine App speichern.

## Gut zu wissen

- **Serien**: „Wöchentlich wiederholen“ legt bis zu 60 Termine an. Belegte Termine werden übersprungen. Anfragen einer Serie bestätigst du gesammelt.
- **Platzsperre** (Admin): ganzer Platz oder Hälfte, ganztägig oder Uhrzeit, mehrere Tage. Liegen schon Buchungen darin, kannst du sie direkt absagen – die Trainer sehen sie dann unter „Meine“ als abgelehnt mit Grund.
- **Zugang entfernen** löscht das Profil; meldet sich die Person erneut an, landet sie wieder bei „Wartet auf Freigabe“.
- **Kosten**: Für einen Verein bleibt man im kostenlosen Spark-Tarif.
- **Mannschaften ändern/ergänzen**: in `CONFIG.teams` – und falls eine weitere Mannschaft direkt buchen soll, auch in `directBookTeams` **und** `directTeams()` in den Regeln.
- Doppelbuchungen werden in der App geprüft; ein Trainer, der die App umgeht, könnte technisch trotzdem eine überlappende Buchung für sein Team anlegen. Für einen Vereinsplatz ist das in der Praxis kein Thema – Admins sehen und löschen alles.
