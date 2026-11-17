# Pit Wall – Planungsdokument

> Lebendes Dokument. Wird bei jeder Veröffentlichung aktualisiert.

## 0. Zusammenarbeit
- Kommunikation komplett auf Deutsch, Antworten kurz und auf das Wesentliche.
- Mobile-first: Bedienung am Handy hat Vorrang (Tablet/Desktop als Spalten).
- Keine offiziellen F1-/FIA-Logos, kein Branding. Musik nur eigene Kompositionen.
- Sparsam testen: Simulation per Node-Skript (`tests/sim.mjs`), nur wenige Screenshots.
- Bei jeder Veröffentlichung:
  1. Versionsnummer erhöhen in `sw.js` (CACHE `pw-vN`), `index.html` („Version N“) und `js/main.js` (`VERSION`)
  2. neue JS-Dateien in die ASSETS-Liste von `sw.js`
  3. Änderungen hier festhalten
  4. `node tests/check_sw.mjs` muss OK melden
- **Speicher**: alle Schlüssel/Caches mit Präfix `pw-` (localStorage `pw-settings-v1`, Cache `pw-vN`).
  Auf kenecky.github.io laufen auch Race Control (`f1rc`) und der Urlaubsausgaben-Tracker.
  Nie raten, Website-Daten von kenecky.github.io zu löschen, ohne vorher auf eine Sicherung hinzuweisen.

## 1. Vision
Wir sind **Teamchef** eines der 11 Teams der Saison 2026 (zwei Fahrer). Die Rennleitung arbeitet als KI
im Hintergrund. Wir treffen die Entscheidungen an der Boxenmauer – und später zwischen den Rennen.

## 2. Technik
- Vanilla JS (ES-Module), Canvas 2D, Web Audio, PWA mit Service Worker, kein Build-Schritt
- Hosting: GitHub Pages, Repo `kenecky/Pitwall` → https://kenecky.github.io/Pitwall/
- Übernommen aus Race Control (Branch `ccr-e10b620f-6bbr3e`, v79): `js/sim/`, `js/control/`, `js/data/`,
  `js/ui/` (Karte, Tower, Zeiten, Log, Wetter, Intro, Intro-Musik, Ton), CSS, Schrift, Werkzeuge
- Neu:
  - `js/team/pitwall.js` – Befehle des Teamchefs (Tempo, Box ansagen/abbrechen, Reifenzustand, Strategie-Vorschlag)
  - `js/control/autoDirector.js` – KI-Rennleitung (Start, Flaggen, VSC/SC/Rot, Einsatzfahrzeuge, Neustart, Kommissare)
  - `js/main.js` – neu geschrieben (Startseite mit Teamwahl, Pit-Wall-Konsole, Ergebnis)
  - `tests/sim.mjs`, `tests/check_sw.mjs`
- Eingriffe in `js/sim/race.js` (markiert mit „Pit Wall“):
  - `playerTeam` im Konstruktor, `car.player`, `car.paceMode`, `car.tyreWear`, `car.boxCall`, `car.advice`
  - Eigene Autos: kein automatischer Stopp (Plan der Strategen nur als Vorschlag), kein Auto-Undercut,
    keine automatische Wetter-Reifenwahl, kein automatisches Verschieben bei Doppelstopp
  - Tempo-Anweisung wirkt auf Rundenzeit, Reifenverschleiß und Fehler-/Aggressionsrisiko

## 3. Meilensteine
- [x] **M1 – Grundgerüst und Einzelrennen** (v1)
- [x] **M2 – Renn-Strategie komplett** (v2): Strategiewahl A/B vor dem Start, Energie-/Overtake-Modus, Teamorder,
      Circle of Doom mit Rejoin-Vorhersage, Undercut/Overcut-Hinweise mit Boxenverlust, SC/VSC-Fenster, Doppelstopp-Warnung
- [x] **M3 – Teamfunk** (v3): Fahrer melden sich (Reifen, Wetter, Schäden, Verkehr, Beschwerden), Antwort per Schnellauswahl, Stimmung
- [x] **M4 – Rennwochenende** (v5): Setup im Training (Flügel, Balance, Federung, Rückmeldung), Quali-Runs timen (Verkehr),
      Reifen-Kontingent, Sprint
- [x] **M5 – Saison** (v6): Kalender, Speichern/Fortsetzen, Team- und Fahrerwertung
- [x] **M6 – Management** (v7): Budget mit Obergrenze, Entwicklung Aero/Motor/Zuverlässigkeit, Ersatzteile und Schäden,
      Personal (Boxencrew, Ingenieure), Fahrerverträge und Stimmung, Sponsorenziele, Vorstandsziele, Ruf
- [x] **M7 – Karriere** (v8): Teamwechsel, Angebote anderer Teams (wie im Fußballmanager)

## 4. Spielregeln an der Boxenmauer (M1)
- **Tempo**: Schonen (+0,45 s/Runde, Verschleiß ×0,72, Risiko ×0,8) · Normal · Push (−0,28 s, ×1,3, ×1,15) ·
  Attacke (−0,55 s, ×1,75, ×1,4)
- **Box**: Mischung wählen (S/M/H/I/W), BOX drücken → Fahrer kommt beim nächsten Überfahren der Boxeneinfahrt.
  Weniger als 150 m vor der Einfahrt: erst in der nächsten Runde. Abbrechen bis kurz vor der Einfahrt möglich.
  Kommen beide gleichzeitig, wartet der Zweite (Doppelstopp kostet Zeit).
- **Reifenzustand** in % (100 = neu, ~15 % an der „Klippe“), abhängig von Mischung, Runden und Tempo
- **Pflicht**: im trockenen Rennen zwei Mischungen, sonst Disqualifikation durch die Kommissare
- Schäden und Strafen (Durchfahrt, Stop & Go) erledigt der Fahrer selbst; unter Rot wechselt das Team automatisch
- **Hinweise** der Strategen: Stopp-Vorschlag, Undercut-Chance, SC/VSC-Fenster, Nässe/Abtrocknen, Reifen am Ende
- Bei SC/VSC und Schäden/Strafen am eigenen Auto bremst das Spiel auf 2× ab

## 5. KI-Rennleitung (M1)
- Start: Inspektionsrunde, Formationsrunde, Ampel; abgestorbener Motor → Extra-Formationsrunde; Regen in der
  Startaufstellung → Start hinter dem SC; verschobener Start wird fortgesetzt
- Gefahren: nach 2–6 s Gelb/Doppelt Gelb im Sektor; VSC/SC/Rot je nach benötigter Stufe; Medical Car und
  Kehrmaschine unter SC; Kran bei Bedarf; Boxengasse sperren; Flaggen 3 s nach Räumung zurück
- VSC endet 3 s nach Räumung; SC: Zurückrunden, dann „SC in dieser Runde“ (frühestens nach 50 s);
  Rot: Neustart 25 s nach Räumung (stehend, bei viel Nässe hinter dem SC)
- Schwarz-Orange bei losem Frontflügel/Schaden
- Kommissare: Urteil nach 20–90 s, meist angemessen, ~7 % ohne Strafe; Schwierigkeit „Mittel“ (weniger Fallarten)

## 6. Änderungen
### v1 – M1 Grundgerüst
- Repo, Startseite (Teamwahl mit Teamwerten, Strecke, Wetter, Dauer, Rennen-Nr.), Ladeseite, PWA mit eigenem Icon
- Simulation, alle 24 Strecken, Intros mit Umgebung und Musik aus Race Control übernommen
- Pit-Wall-Konsole für beide Fahrer: Position, Abstände, Reifen mit Zustand, Tempo, Mischung, BOX/ABBRECHEN, Hinweise
- Tabs Pit Wall / Zeiten / Log; Tower mit eigenen Autos markiert; Wetter-Radar; Ergebnis mit Punkten des Teams
- Tablet quer/Desktop: Karte links, Pit Wall rechts
- Test: 14 Rennen headless ohne Fehler, keine offenen Fälle; rote Flaggen fast nur bei Regen/Monaco

### v2 – M2 Renn-Strategie
- **Tempo-Knopf**: kurz tippen = nächste Stufe; gedrückt halten öffnet die Auswahl 1×–32×, nach unten wischen, loslassen = wählen
- **Rennstrategie nach dem Intro**: Rennstratege des Teams (fiktive Namen, `STRATEGISTS`) rechnet mit dem Reifenmodell der
  Simulation alle 1- und 2-Stopp-Kombinationen (Stintlängen optimiert, Klippe wird gemieden, Boxenverlust der Strecke)
  und schlägt je Fahrer **A** (schnellste) und **B** (andere Stoppzahl oder andere Startmischung) vor. Bei nassem Start:
  Inter/Regenreifen mit Wechsel nach Wetter. Gewählte Strategie wird **automatisch gefahren**.
- **Plan an der Boxenmauer**: nächster Stopp mit −1/+1/✕ oder „+ Stopp“; Mischung tippen ändert den nächsten Stopp;
  BOX ersetzt einen Stopp, der ohnehin in ≤ 8 Runden käme, sonst zusätzlicher Stopp; ABBRECHEN schiebt einen fälligen Stopp
  um eine Runde. Günstige Stopps unter SC/VSC entscheidet nur der Teamchef.
- **Reifenverschleiß live**: wächst je gefahrenem Meter (Tempo-Faktor; unter SC/VSC 0,35, in der Box 0,1) – die Prozentanzeige
  sinkt laufend, die Rundenzeit folgt direkt.
- **Reifen-Runden**: unter jedem Tempo-Knopf, wie viele Runden die Reifen bis zur Klippe halten; Zeile „bis Ziel“.
- **Energie-Modus**: Laden (wenig Einsatz, +30 % Rückgewinnung) · Normal · Overtake (voller Einsatz bis Akku leer);
  Akku-Anzeige je Fahrer.
- **Teamorder**: Frei fahren · Position halten (keine Angriffe untereinander) · Tauschen (vorderes Auto geht vom Gas und
  lässt vorbei, nur bis 3 s Abstand).
- **Circle of Doom** (Tab CIRCLE, ◎ am Fahrer): Kreis = eine Runde in Zeit (bei Renntempo), alle Autos nach ihrer
  Zeitposition, gestrichelter Geist = Rauskommen nach einem Stopp jetzt (Position, Fahrer davor/dahinter, ±1,5-s-Fenster
  grün/orange); Geist auch auf der Karte. Boxenverlust = Boxengasse statt Strecke + Standzeit (Crew) + 1,5 s Bremsen/
  Beschleunigen, unter SC/VSC kleiner (Feld fährt ~60 %). Mit der Simulation abgeglichen (Monza, Monaco, Silverstone ±2 s).
- **Hinweise**: Rejoin-Zeile je Fahrer, Undercut (Zeitgewinn frischer Reifen pro Runde, Verkehr), Overcut (Gegner vor uns
  in der Box), SC/VSC-Verlust, Reifen halten nicht bis zum geplanten Stopp, Doppelstopp
- Recherche „Circle of Doom“: kaum öffentliche Quellen; Prinzip laut Teams: Boxenverlust nutzen, um die Position relativ
  zum Feld beim Rauskommen zu berechnen und freie Luft zu finden (Aston-Martin-Strategieinterview, Motorsport.com)

### v3 – Zweikampf-Taktiken, M3 Teamfunk
- **Zweikampf je Fahrer** (`TACTIC` in `js/team/pitwall.js`):
  Normal · **Überholen** (Überholchance ×1,4, Aggressivität ×1,25 → mehr Kollisionsrisiko, Reifen ×1,08) ·
  **Halten** (keine Angriffe, Hintermann überholt ×0,65 seltener) ·
  **Aufhalten** (keine Angriffe, +0,8 s/Runde, Hintermann ×0,5, Reifen ×0,85 – damit der Teamkollege davor wegfahren kann)
- **Teamfunk** (`js/team/radio.js`), Zufall nur über `race.chatRand()`:
  - Fahrer melden sich bei: Reifen am Ende, Regen auf Slicks, Abtrocknen auf Inters, Frontflügel-Schaden, leerer Batterie
    (Overtake), festhängen hinter Gegner/Teamkollege, blauen Flaggen, Hintermann kommt näher beim Schonen, Strafe,
    langsamem Stopp, Tausch-Anweisung, gutem Rennen
  - Höchstens eine offene Meldung je Fahrer, Mindestabstände je Art; ~10–15 Meldungen pro Rennen
  - Antwort per Schnellauswahl (2–3 Knöpfe) mit Wirkung (Box, Tempo, Energie, Taktik, Teamorder) und Stimmung;
    Zeitbalken – unbeantwortet nach 20–30 s: Stimmung −3
  - Eigene Funksprüche: Lob, Konzentrieren (vorsichtiger), Reifenstatus? (Fahrer beschreibt den Grip), Motivieren;
    zu oft dasselbe nervt (Stimmung −4)
  - Neue Meldung: Funkton, Vibration, Tempo auf 2×, Hinweis, wenn ein anderer Tab offen ist
- **Stimmung** 0–100 (Start 70): unter 50 langsamer (bis +0,4 s/Runde), unter 40 mehr Fehler, über 50 leicht schneller
- Hinweis: Funkmeldungen enthalten Funktionen (Antwort-Wirkung) – beim Speichern (M5) über die Meldungsart neu aufbauen

### v4 – Korrekturen
- Strategie vor dem Rennen: jeder Fahrer in eigener Karte (Teamfarbe, Nummer, Kopfzeile)
- Ton: Motoren deutlich lauter (Verhältnis zur Ampel); Safety Car hat eigenen Motorsound, solange es auf der Strecke ist
  (auch Inspektionsrunde)
- Circle of Doom: Größe passt sich dem Bereich an (kein Scrollen), Erklärtext darunter entfernt
- Pit Wall: Fahrer in zwei Reitern (Position, 📻 bei offener Funkmeldung, „REIFEN?“ unter Rot); Teamorder darunter;
  Funkmeldung des anderen Fahrers erscheint als Hinweis
- Log: Funk nur vom eigenen Team
- Rote Flagge: eigene Autos bekommen in der Boxengasse **keine** automatischen Reifen mehr. Steht das Auto, erscheint auf der
  Karte die Reifenwahl (S/M/H/I/W oder behalten), änderbar bis zum Neustart; ohne Wahl bleiben die Reifen drauf. Ein
  geplanter Stopp auf dieselbe Mischung entfällt.
- Rote Flagge: Rennleitung kündigt an, wann und wie neu gestartet wird („Neustart in 4 Minuten – stehender Start …“ bzw.
  „hinter dem Safety Car“) – im Log und als Popup; Zeit = geschätzte Bergung + Puffer, mindestens 4 Minuten Rennzeit;
  ist die Strecke dann nicht frei, wird um 2 Minuten verschoben (neues Popup)

### v5 – Reifen-Historie, M4 Rennwochenende
- **Reifen-Historie** je Fahrer im Rennen (Zeile „REIFEN BISHER“: Mischung, Runden, gebrauchter Satz) und im Ergebnis
- **Wochenende** (`js/team/weekend.js`): Auswahl auf der Startseite (Training, Qualifying, Sprint mit Sprint-Qualifying, Rennen
  immer). Ablauf FP → SQ → Sprint → Quali → Rennen; nach jeder Session Ergebnis mit „Weiter: …“ oder „Wochenende beenden“.
  Intro einmal vor der ersten Session. Startaufstellung aus Quali bzw. SQ; Startplatzstrafen aus Sessions gelten im nächsten Rennen.
- **Training/Qualifying für eigene Autos** (Session-Konsole je Fahrer-Reiter): Mischung, neuer/gebrauchter Satz, Anzahl
  schneller Runden (FP 1/3/5/8, Quali 1–3), Sprit (FP), RAUSFAHREN / REINHOLEN, Auto-Programm des Ingenieurs;
  Status (Garage, Aufwärm-, schnelle, Auslaufrunde, „im Verkehr“), Grenze P16/P10 im Qualifying, Rundenliste mit Verkehr.
  Ohne Ausfahrt keine Zeit. Runde muss vor der Zielflagge begonnen sein.
- **Verkehr** (`Session.trafficCheck`): Auto auf schneller Runde dicht hinter einem anderen (< ~1,2 s) verliert Zeit
  (+0,4 s/Runde-Rate, solange es dicht dran ist); Runde wird als „Verkehr“ markiert. Prognose vor dem Rausfahren:
  Autos auf der Strecke, auf der Aufwärmrunde, gleich aus der Garage → niedrig/mittel/hoch.
- **Setup** (`js/team/setup.js`): Flügel 1–11, Balance −5…+5, Federung 1–9; Optimum je Strecke (Flügel aus dem Anteil
  schneller Geraden: Monaco ~9, Monza ~2; Balance/Federung fest aus der Strecken-ID). Verlust bis 1,4 s/Runde und mehr
  Reifenverschleiß. Nach jeder Trainings-Ausfahrt Rückmeldung des Fahrers (Topspeed/Abtrieb, Unter-/Übersteuern,
  zu hart/weich) – konstante Fahrer genauer. Änderbar nur in der Garage, ab dem ersten Qualifying Parc fermé.
  KI-Teams: fester Setup-Verlust 0,08–0,38 s je Team und Wochenende.
- **Reifen-Kontingent** je Fahrer: 8 S / 3 M / 2 H (Sprint-Wochenende 6 / 4 / 2), dazu 4 I / 3 W. Jede Ausfahrt und jeder
  Rennstint nimmt einen Satz (neu oder am wenigsten gefahren); gebrauchte Sätze starten mit ihrem Verschleiß.
  Strategen rechnen mit den verfügbaren Sätzen (Hinweis „Gebrauchte Sätze“). Unter Rot ebenfalls aus dem Kontingent.
- **Sprint**: eigene Strategie (Soft/Medium/Hard ohne Stopp), Punkte im Ergebnis wie Rennen (Wertung kommt mit M5)
- KI-Rennleitung in Sessions: Flaggen, rote Flagge bei schweren Unfällen, Fortsetzung oder Abbruch, Kommissare
- Tests: `node tests/weekend.mjs [strecke] [sprint]`

### v6 – M5 Saison, Speichern und Fortsetzen
- **Saison 2026** (`js/team/season.js`): Startseite Einzelrennen | Saison 2026. Team wird beim Saisonstart gewählt und
  bleibt fest. 24 Rennen in Kalender-Reihenfolge; Format je Strecke: Sprint-Wochenenden (Shanghai, Miami, Montreal,
  Silverstone, Zandvoort, Singapur) mit FP → SQ → Sprint → Quali → Rennen, sonst FP → Quali → Rennen. Wetter zufällig
  (Regenwahrscheinlichkeit der Strecke). Wochenenden müssen zu Ende gefahren werden.
- **Punkte**: Rennen 25-18-15-12-10-8-6-4-2-1, Sprint 8-7-6-5-4-3-2-1 (keine Punkte bei DNF/DSQ). Startplatzstrafen aus dem
  Rennen gelten beim nächsten Wochenende.
- **Saison-Übersicht** (🏆): Fahrer- und Teamwertung (eigenes Team markiert, Siege), Kalender mit Ergebnissen der eigenen
  Fahrer (Rennen und Sprint) und Sieger. Nach jedem Wochenende: Punkte des Teams und Veränderung in der Teamwertung.
  „Saison neu starten“ mit Rückfrage.
- **Speichern**: ganzes Wochenende (Setup, Rückmeldungen, Reifensätze, Startaufstellungen, Ergebnisse) und die laufende
  Session/das laufende Rennen – alle 10 s, bei Pause, beim Verlassen der App, nach jeder Session und über
  ☰ „Speichern · zur Startseite“. IndexedDB `pw-db` (Store `saves`), Fallback localStorage `pw-save-v1`;
  Saison in localStorage `pw-season-v1`. Nichts außerhalb des `pw-`-Präfixes.
- **Fortsetzen** auf der Startseite (Strecke, Session, Team, wann gespeichert) oder Verwerfen (mit Rückfrage). Ein neues
  Wochenende fragt vor dem Überschreiben. Beim Laden werden Reifensätze wieder verknüpft; offene Funkmeldungen verfallen.
- Test: `node tests/season.mjs` (zwei Wochenenden inkl. Sprint, Speichern/Laden mitten im Rennen, Wertung)

### v7 – M6 Management (Saison)
- **Teamzentrale** 🏢 (Startseite in der Saison, automatisch nach jedem Wochenende mit Bericht). Reiter: Bericht, Finanzen,
  Entwicklung, Team, Fahrer, Partner. Logik in `js/team/management.js`, Zustand in `season.mgmt` (gespeichert mit der Saison).
- **Finanzen** (Mio. $): Startkapital nach Teamstärke (Top 70 / Mitte 55 / hinten 45). Einnahmen pro Rennen: Preisgeld
  1,2 + 0,12 je WM-Punkt, Titelsponsor (7,0 / 6,2 / 5,6), Sponsorenziele. Ausgaben: Grundbetrieb 5,6 + Personal, Fahrergehälter
  (Jahresgehalt / 24), Reparaturen und Teile, Entwicklung.
- **Budgetobergrenze** 215 Mio. $/Saison: zählt Betrieb, Personal, Entwicklung, Teile, Reparaturen (nicht Fahrergehälter).
  Ausgaben in der Teamzentrale werden über der Grenze verweigert; Reparaturen können sie überschreiten → am Saisonende
  5 Teampunkte Abzug je angefangenem Prozent.
- **Entwicklung**: Aerodynamik (wirkt stärker auf kurvigen Strecken), Motor (stärker auf schnellen Strecken), Zuverlässigkeit
  (weniger Defekte). Kleines Update 4 Mio./2 Rennen/+0,6, großes Paket 11 Mio./4 Rennen/+1,7 (Teamtempo-Punkte, 1 Punkt
  ≈ 0,08 s/Runde); max. 2 Projekte; Ingenieure ändern Ertrag (±12 % je Stufe) und Dauer (Stufe 5: −1 Rennen).
  KI-Teams entwickeln jedes Rennen zufällig mit (Top-Teams etwas schneller).
- **Team**: Boxencrew und Ingenieure Stufe 1–5 (Verstärken kostet einmalig, laufende Kosten je Stufe). Crew ±3 Boxencrew-Wert
  je Stufe. Ingenieure ab Stufe 3: Setup-Einschätzung im Training („Ingenieure: Setup ~xx %“, genauer mit höherer Stufe).
- **Ersatzteile**: Frontflügel und Chassis auf Lager; Reparaturstopp mit neuer Nase verbraucht einen Flügel, Unfall-Ausfall
  ein Chassis (alle Sessions). Ohne Lager: Eilfertigung zum doppelten Preis.
- **Antriebseinheit**: 4 pro Saison; Alter in Wochenenden, ab 6 sinkt die Zuverlässigkeit (−3 je Wochenende). Neue Einheit
  jederzeit, ab der 5. gibt es 10 Startplätze Strafe für beide Fahrer.
- **Fahrer**: Stimmung (Start der Funk-Stimmung im Rennen), Vertrag bis, Gehalt. Nach dem Rennen: Mischung aus alter
  Stimmung, Funk-Stimmung am Rennende, Punkte, Ausfall, vor dem Teamkollegen. Gespräch einmal je Wochenende: Loben,
  Bessere Zeiten versprechen (in 3 Rennen keine Punkte → −15), Druck machen. Vertrag +1 Jahr (Prämie 25 %, Gehalt +8 %,
  nur bei Stimmung ≥ 35).
- **Partner**: Titelsponsor mit Saisonziel (Bonus), 3 Sponsoren mit Rennzielen passend zur Teamstärke (Punkte, Top 5,
  Podium, beide im Ziel, beide in den Punkten, Plätze gutmachen). Fiktive Namen.
- **Vorstand und Ruf**: Saisonziel = Platz nach Grundtempo; Ruf 0–100 ändert sich je Rennen nach Teampunkten gegenüber
  der Erwartung (max. ±6), minus bei Kontostand im Minus; Urteil am Saisonende. (Entlassung/Angebote: M7)
- Test: `node tests/season.mjs` jetzt mit Management (Projekt, Bericht, Buchungen)

### v8 – M7 Karriere
- `js/team/career.js`, Zustand `season.career` (wird in jede neue Saison übernommen): Ruf als Teamchef 0–100, Verlauf,
  Angebote, Status entlassen.
- **Ruf als Teamchef**: je Wochenende ±3 nach Teampunkten gegenüber der Erwartung; Saisonende: Ziel erreicht +8 und +4 je
  Platz besser, verfehlt −4 je Platz, Teamtitel +10; Entlassung −15.
- **Angebote** nach dem 8. und 16. Rennen (Wechsel ab dem nächsten Wochenende, gültig 2 Rennen) und zum Saisonende (für
  die nächste Saison). Nötiger Ruf je Team nach Grundtempo (Mercedes ~85 … Cadillac ~30); stärkere Teams melden sich
  eher (Aufstieg), höchstens 2 Angebote.
- **Entlassung**: Ruf beim Vorstand unter 15 ab dem 5. Rennen → ohne Team; 1–2 Angebote schwächerer Teams; Startseite
  führt dann in die Teamzentrale (Karriere). Ein Wochenende muss vorher fertig sein.
- **Teamwechsel**: neues Team übernimmt die laufende Saison (Punkte bleiben bei den Teams), Teamzentrale startet neu mit
  Budget, Personal und Zielen des neuen Teams.
- **Neue Saison** (Jahr +1) mit dem alten Team oder per Angebot mit einem neuen; Kalender gleich, Datum mit neuem Jahr.
  Fahrerbesetzungen bleiben vorerst gleich.
- Teamzentrale: Reiter „Karriere“ (Ruf, Angebote mit Annehmen, nächste Saison, Verlauf).
- Test: `node tests/career.mjs`

### v9 – Icon, Reifenkontingent nach Reglement, Korrekturen
- **Fehler behoben**: Nach „Weiter: Rennen“ blieb das Ergebnisfenster offen und lag über der Strategiewahl; ein zweites
  „Weiter“ beendete das Wochenende und führte in ein neues Q1. Jetzt: Ergebnis wird sofort geschlossen, „Weiter“ wirkt
  nur einmal je Session. Außerdem lädt ein Update die Seite nur noch neu, wenn die Startseite sichtbar ist (nicht während
  Intro/Strategiewahl).
- **Neues Icon A** (Teamfunk-Headset auf Rot-Orange) für App, Ladeseite und Startseite
- **Reifenkontingent nach Reglement** (Quellen: formula1.com, f1chronicle): je Fahrer 13 Slick-Sätze (2 H / 3 M / 8 S),
  Sprint-Wochenende 12 (2 H / 4 M / 6 S), 5 Intermediates, 2 Regenreifen. Nach dem Training Rückgabe von 6 Sätzen
  (Sprint-Wochenende 2) – die meistgefahrenen, je ein Medium/Hard bleibt. Ohne Training: Trainings-Nutzung und Rückgabe
  werden simuliert (7 Sätze für Quali + Rennen); ohne Qualifying zusätzlich gebrauchte Quali-Softs (~3 Runden).
- **Satzwahl**: Training/Qualifying zeigen alle Sätze des Fahrers (neu / x Runden) zum Auswählen; im Rennen Satzwahl für den
  nächsten Stopp unter den Mischungen. Jeder Fahrer hat eigene Sätze.
- **Qualifying in Originallänge**: Q1 18 / Q2 15 / Q3 12 Min., Sprint-Qualifying 12 / 10 / 8 Min. (alle Dauer-Stufen)
- **Vorspulen**: Qualifying – sind beide eigenen Fahrer ausgeschieden, wird der Rest simuliert (direkt zum Ergebnis).
  Rennen – fallen beide aus, Rückfrage „Weiter ansehen“ oder „Simulieren“.
- Eigene Fahrer auf der Karte mit gelbem Ring und Kürzel, in der Zeitentabelle deutlich markiert
- CIRCLE-Reiter nur im Rennen (nicht in Training/Qualifying)
- Fensterwechsel pausiert nicht mehr (Spiel läuft mit gleichem Tempo weiter, nur Speichern)
- Startseite: Strecke über der Teamwahl (Intro startet an dieser Stelle; Bild wird vorher in den sichtbaren Bereich
  gerollt), Fahrer je Zeile, Ziehen zum Neuladen im oberen Viertel (auch im Browser)

### v10 – Teamzentrale als Manager-Menü, neuer Look
- **Saisonstart führt in die Teamzentrale** (Vorsaison), nicht ins erste Rennen. Pflichtaufgaben: Titelsponsor unter Vertrag,
  alle Schlüsselposten besetzt (Chef-Renningenieur und Strategiechef sind zu Beginn frei), Auto-Konzept festgelegt;
  optional Partner-Sponsoren. Erst dann „Saison starten“. Auch nach Teamwechsel/neuer Saison wieder Vorsaison.
- **Teamzentrale als Vollbild-Menü** mit Kacheln und Status: Sponsoren, Personal, Fahrer, Entwicklung, Auto & Teile, Finanzen,
  Vorstand & Karriere, Wertung; unten „Weiter zum GP …“ bzw. „Wochenende fortsetzen“. Startseite (Saison) öffnet die
  Teamzentrale; nach jedem Wochenende öffnet sie sich mit Bericht und Buchungen.
- **Sponsoren** (Markt, erneuert nach jedem Wochenende): Titelsponsor-Angebote (Sicher / Ausgewogen / Leistung: Grundbetrag
  pro Rennen vs. Saisonbonus mit Platzziel), bis zu 3 Partner mit Grundbetrag pro Rennen + Prämie fürs Rennziel; Vertrag
  beenden kostet etwas Vertrauen. Höhe nach Teamstärke und Vertrauen des Vorstands. Fiktive Namen.
- **Personal / Schlüsselposten** (fiktive Bewerber mit Bewertung, Gehalt, Ablöse; 3 je Posten, neu nach jedem Wochenende):
  Technischer Direktor (Ertrag aller Entwicklungen, ab 85 Projekte schneller), Chefdesigner Chassis (Chassis/Aero),
  Motorenchef (Motor, Zuverlässigkeit), Chef-Renningenieur (Setup-Einschätzung im Training, genauer mit Bewertung),
  Strategiechef (macht die Strategie-Vorschläge vor dem Rennen), Boxencrew-Chef (Boxenstopp-Zeiten). Gehälter zählen
  zur Budgetobergrenze. Ersetzt die bisherigen Stufen für Crew/Ingenieure.
- **Auto-Konzept** (einmal pro Saison, 16 Mio. $): Abtrieb, Topspeed, Ausgewogen, Zuverlässigkeit – Startwerte der Entwicklung,
  Ertrag abhängig vom Personal. Upgrades heißen jetzt Chassis & Aero, Motor, Zuverlässigkeit; Ertragsfaktor wird angezeigt.
- Fahrer-Karten mit Tempo/Konstanz/Regen/Stimmung, Finanzen mit Saldo pro Rennen.
- Alte Saisonstände werden ergänzt (alle Posten besetzt, Konzept „Ausgewogen“).
- **Neuer Look** im Stil des Icons: Ladeseite und Startseite dunkel mit rot-orangem Verlauf, runde Karten, Verlaufs-Knöpfe;
  gelb-schwarze Streifen überall durch eine rot-orange Verlaufslinie ersetzt.

### v11 – Verhandlung, Gebäude, Navigation
- Startseite (Saison): „Saison starten“ bzw. „Saison fortsetzen“; die Saison wird laufend gespeichert.
- Teamzentrale: ✕ in einem Bereich führt zurück zur Teamzentrale (erst auf der Hauptseite zur Startseite); der große
  Weiter-Knopf erscheint nur auf der Hauptseite.
- **Eigenes Bestätigungsfenster** (statt Browser-Dialog) für Upgrades, Bau, Teile, Personal, Konzept, Verträge, Antriebseinheit,
  Teamwechsel, Spielstand verwerfen/überschreiben, Saison neu starten.
- **Sponsoren-Verhandlung**: „Verhandeln“ statt Annehmen. Versteckte Schmerzgrenze je Sponsor (+5 … +27 % über dem Angebot,
  mehr mit Vertrauen und Marketing-Gebäude), sichtbares Interesse (70–95 zu Beginn). Forderung +5/+10/+20 %: unter
  der Grenze → Zusage (Interesse −4), knapp an der Grenze → Gegenangebot in der Mitte (−10), darüber → Absage (−18);
  jede Runde kostet zusätzlich Geduld. Interesse 0 → Angebot zurückgezogen. „Mehr Erfolgsprämie“: 20 % Fixum gegen +60 %
  Bonus/Prämie (einmal). Anzeige: aktuelle Bedingungen, geschätzter Saisonwert, Verlauf der Gespräche.
- **Gebäude** (Stufe 1–5, Start nach Teamstärke 1/2/3; Bau 8/14/22/32 Mio. $, 2–5 Rennen, immer nur eine Baustelle;
  Investitionen nicht in der Budgetobergrenze, Unterhalt 0,08 Mio. $ je Stufe und Rennen schon):
  Entwicklungszentrum (1/2/2/3/3 Projekte gleichzeitig, ab Stufe 3 Projekte 1 Rennen schneller), Windkanal (Chassis & Aero
  +6 % Ertrag je Stufe), Motorenprüfstand (Motor & Zuverlässigkeit +6 %), Simulator (Setup-Einschätzung 15 % genauer je
  Stufe), Boxencrew-Trainingszentrum (Boxencrew +1,5), Marketing & Hospitality (Sponsorangebote +7 %, mehr
  Verhandlungsspielraum), Fahrerzentrum (Fahrerstimmung +1 je Stufe und Wochenende).

### v12 – Spieldatum und Kalender
- **Spieldatum** (`season.date`): Vorsaison beginnt am 19. Januar; nach jedem Rennen steht das Datum auf dem Renntag.
  Anzeige in der Kopfzeile der Teamzentrale.
- **Dauer in Wochen**: Kleines Update 3 Wochen, großes Paket 7 Wochen (Technischer Direktor ≥ 85 und Entwicklungszentrum ab
  Stufe 3 je −1 Woche); Gebäude Stufe 2–5: 4 / 6 / 9 / 12 Wochen. Jeweils mit Fertigstellungsdatum.
- **Kalender** (Kachel 📅): alle kommenden Termine nach Monaten – Rennen (mit Sprint-Kennzeichen), Fertigstellung von
  Entwicklungen und Gebäuden; dazu die letzten Ergebnisse der eigenen Fahrer. Hauptseite zeigt den nächsten Termin.
- **„Weiter“ springt zum nächsten Termin**: Fertigstellung → Datum vorstellen, Upgrade/Gebäude übernehmen, Meldung auf der
  Hauptseite; Rennen → Datum auf den Freitag, Rennwochenende startet (Fertiges bis dahin wird übernommen). Laufendes
  Wochenende: „Wochenende fortsetzen“. Bei gleichem Datum kommen Fertigstellungen vor dem Rennen.
- Vorsaison-Checkliste verschwindet, sobald alle Pflichtaufgaben erledigt sind.
- Alte Spielstände: Datum wird aus dem nächsten Rennen geschätzt, laufende Projekte/Bauten bekommen ein Fertigstellungsdatum.

### v13 – Sektoren, Ausscheidungszone, Reinholen abbrechen, Sponsor-Termine
- Training/Qualifying: keine Überholmanöver im Log.
- **Sektoren in ZEITEN** (Training/Qualifying): drei Zeitsektoren (je ⅓ Runde) als Quadrate in der Statusspalte –
  violett = absolute Bestzeit, grün = persönliche Bestzeit, gelb = keine Verbesserung; erscheinen nacheinander während der
  schnellen Runde. Aufwärmrunde „OUT“; nach der schnellen Runde bleiben die Quadrate bis Ende Sektor 1 stehen, dann „IN“
  bzw. neue Quadrate bei der nächsten schnellen Runde. (`Session.sectorCheck`, `sectorStatus` in timing.js)
- ZEITEN: Ausscheidungszone im Qualifying rot markiert (wie im Tower).
- Qualifying/Training: „Reinholen“ lässt sich zurücknehmen („REINHOLEN ABBRECHEN“), solange das Auto noch nicht in der
  Boxengasse ist.
- **Sponsor-Termine** im Kalender: Titelsponsor 4, Partner 2 pro Saison (nicht an Rennwochenenden): Fahrer-Termin, Showrun
  (Fahrer nötig, kostet 3 bzw. 5 Stimmung) oder Werksführung. Beim Termin Auswahl: Fahrer schicken / Gäste empfangen /
  absagen. Hingehen: 0,3–0,8 Mio. $ (nach Teamstärke) und Zufriedenheit +10; Absagen: −22, Partner unter 10 kündigt.
  Zufriedenheit wird bei den Sponsoren angezeigt.
- Eigener Auswahldialog `pwChoose` (mehrere Knöpfe); `pwConfirm` baut darauf auf.

### v14 – Neue Termine, Kalender-Animation, Monatsansicht, Wetterübersicht, Training 30 Min.
- **Neue Termine** im Kalender (Auswahl im Spiel-Dialog):
  - Präsentation des neuen Autos (16. Februar): große Show (2,5 Mio., Ruf +5, Sponsoren zufriedener, Angebote +8 %),
    schlicht (0,5 Mio.) oder nur online (Ruf −2).
  - Medientag (Donnerstag vor jedem Rennen): Pressefrage mit drei Antworten – wirken auf Ruf, Fahrerstimmung, Sponsoren.
  - Vorstandssitzung (nach Rennen 6, 12, 18): Zusatzbudget beantragen (nur bei Vertrauen ≥ 55 und Ziel in Reichweite,
    sonst −4), Ziel bestätigen (+4 auf Kurs / −2), Ziel senken (−6).
  - Vertragsende (7. September, wenn ein Fahrervertrag im laufenden Jahr endet): +1 Jahr, +2 Jahre oder später (Erinnerung
    4 Wochen; zu spät → Gehalt +30 %, Stimmung −10).
- **Kalender-Animation** beim Weiter-Knopf: Kalenderblatt blättert Tag für Tag (max. ~1,5 s) bis zum nächsten Termin und
  hält dort mit dem Termin an.
- **Kalender umschaltbar**: Liste oder Monatsansicht (Raster Mo–So, Symbole je Tag, heute markiert, Monate blättern).
- **Wetterübersicht** (Wettersymbol in der Kopfleiste) statt Radar: aktuelle Bedingungen und Vorhersage je Session des
  Wochenendes (trocken / Regen von Beginn an / Schauer ab Minute x bis y, Stärke). Aus denselben Wetterdaten wie die Simulation.
- **Freies Training 30 Minuten** (alle Dauer-Stufen) für mehr Zeit bei der Setup-Suche.

### v15 – Qualifying-Taktik der KI, Streckenentwicklung, Ausfälle in Sessions
- **KI im Qualifying**: Vor dem letzten Run in Q1/Q2 schätzt jedes KI-Team sein Polster zur Ausscheidungsgrenze (abzüglich
  ~0,35 s erwarteter Verbesserung der anderen). Großes Polster → meist in der Box bleiben (Top-Teams noch öfter); manchmal
  ist ein Team zu sicher und fliegt doch raus. Meldung im Log („… bleibt in der Box“). In Q3 fahren alle.
- **Streckenentwicklung**: Gummi baut sich über die ganze Session auf (mehr Autos auf der Strecke = schneller), Qualifying bis
  ~0,9 s, Training bis ~0,6 s schneller; Regen/Nässe baut ihn wieder ab. Ersetzt die bisherige feste Zeitkurve.
- **Ausfall in Training/Qualifying**: Fahrer-Reiter zeigt „AUSFALL“ mit Grund, alle Knöpfe gesperrt.
- **Karte**: Im Qualifying ausgeschiedene Autos werden nicht mehr gezeichnet (weder Strecke noch Box).

### v16 – Starts, Begründung für Neutralisierungen, Reifen hinter dem SC
- **Starts**: ~11 % besonders gute Starts (Antrieb 1,14–1,24, Reaktion 0,13–0,2 s), ~11 % schlechte (Antrieb 0,72–0,84,
  teils lange Reaktion). In den ersten ~1200 m zieht ein Auto mit deutlich besserem Start (Differenz > 0,12) mit 70 %
  am Vordermann vorbei – mehrere Plätze möglich. Nach Runde 1 Meldung „Toller/Schlechter Start“ ab ±3 Plätzen.
  Test: Ø 1,2 Plätze Änderung in Runde 1, ~3 Fahrer pro Rennen mit ≥ 3 Plätzen.
- **Begründung im Log** bei Safety Car, VSC und roter Flagge („Grund für das Safety Car: … (T8, Sektor 6)“), auch bei
  Reinigungsarbeiten mit Kehrmaschine.
- **Reifenverschleiß unter Neutralisierung** (jetzt für alle Autos, live je Meter): hinter dem Safety Car 30 % einer
  Rennrunde (−70 %), unter VSC 40 % (−60 %), unter Rot 30 %, in der Boxengasse 10 %. Begründung: rund 40 % langsamer,
  kaum Last beim Bremsen und in Kurven. KI-Autos nutzen jetzt ebenfalls den Live-Verschleiß.

### v17 – Reiter, Abrechnung, Journal, Presse, Tempo, Wetter
- Fahrer-Reiter zeigen Position und aktuellen Reifen mit Runden (Rennen und Sessions); Reiter bleiben beim Scrollen oben fest.
- **Abrechnung** nach jedem Saison-Wochenende als eigenes Fenster vor der Teamzentrale: Kontostand vorher, alle Buchungen
  des Wochenendes, Kontostand nachher mit Differenz.
- Ergebnis nach dem letzten Teil eines Saison-Wochenendes: Knopf „Weiter“ (statt „Zur Startseite“).
- **Finanzen → Buchungen**: Journal aller Buchungen der Saison (`m.ledger` mit Datum und Rennen), aufklappbar gruppiert
  nach Monaten oder nach Rennen (Vorsaison / nach Rennen x), je Gruppe mit Summe.
- **Pressestimmen** im Rennergebnis (Rennen und Sprint, `js/team/press.js`, fiktive Medien): Gesamturteil am Maßstab
  der Teamstärke (erwarteter Platz nach Grundtempo), Strategie (Stopp unter SC/VSC, Undercut gelungen/misslungen,
  langsamer Stopp, mehr/weniger Stopps als der Sieger), Fahrer (Ausfall, Aufholjagd, Rückfall, Teamduell).
- Jede Session (Training, Qualifying, Sprint, Rennen) startet mit Tempo 1×.
- **Wetter**: in der laufenden Session wieder das Regenradar (mit Vorhersage +5…+60 Min. und Zeitregler), darunter die
  Vorhersage für alle weiteren Sessions des Wochenendes.

### v18 – Reiter mit Sektoren, Sektor-Reset, Renningenieur im Qualifying, Sprint-Punkte
- Fahrer-Reiter in Sessions: Platz, Reifen und Runden in einer Zeile bündig, dahinter die drei Sektor-Quadrate.
- Sektorzeiten (violett/grün/gelb) werden zu Beginn jeder Session und jedes Abschnitts (Q1/Q2/Q3, SQ1–SQ3) zurückgesetzt:
  erste schnelle Runde ist mindestens grün, der erste Fahrer mit Zeit hat alle Sektoren violett.
- **Renningenieur im Qualifying** (Q1/Q2, SQ1/SQ2): Einschätzung auf der Fahrerkarte und per Funk, sobald sie sich ändert –
  sicher (Polster zum ersten Auto unter dem Strich abzüglich erwarteter Verbesserung > 0,35 s), knapp, reicht
  wahrscheinlich nicht, raus. Erwartete Verbesserung: 0,15 s Streckenentwicklung + 0,03 s je Auto, das noch fährt (max. 0,5 s).
  Bei „raus“/„reicht nicht“ zusätzlich Funkton und Hinweis.
- **Fehler behoben**: Sprint-Ergebnis zeigte Rennpunkte (25-18-15 …). Jetzt 8-7-6-5-4-3-2-1 für die ersten 8 (Einzelrennen
  und Saison; die Saisonwertung rechnete schon richtig, nur die Anzeige im Ergebnis war falsch).

### v19 – Zeiten-Reset in der Pause, Reifenrunden gesamt, Fahrer verfolgen
- Qualifying/Sprint-Qualifying: Sobald die Pause nach einem Abschnitt beginnt, werden Zeiten und Abstände (Konsole, ZEITEN,
  Tower) sowie die Sektor-Quadrate zurückgesetzt; Reihenfolge bleibt bis zum nächsten Abschnitt.
- Reifenrunden im Fahrer-Reiter und auf der Karte des Fahrers = Runden auf dem Reifensatz insgesamt (über alle Sessions des
  Wochenendes, `set.lapCount`), nicht nur im aktuellen Stint. Simulierte Sätze starten mit ihren simulierten Runden.
- Fahrer-Reiter antippen: Karte folgt dem Fahrer durchgehend und hält ihn mittig; „⤢ Gesamt“ beendet das Verfolgen und zeigt
  wieder die ganze Strecke.

### v20 – Timing-Tabelle, Strategie-Übersicht, Verfolgen per ZEITEN, Doppeltipp
- Karte: Doppelklick bzw. Doppeltipp (auch am Handy) beendet das Verfolgen eines Fahrers und zeigt die ganze Strecke.
- ZEITEN: Fahrer antippen (jeder Fahrer) → Details klappen auf und die Karte folgt ihm; erneut antippen → Details zu,
  Verfolgen beendet.
- **Timing-Tabelle im Rennen** (Reiter ZEITEN, `js/ui/raceTable.js`): Position, Teamfarbe, Fahrer, Abstand zum Vordermann,
  letzte Sektorzeiten S1–S3 (violett = schnellste im Rennen, grün = persönliche Bestzeit, gelb = langsamer, grau =
  Box/Neutralisierung), Reifen mit Runden, Stopps. Eigene Fahrer markiert. Sektorzeiten werden innerhalb des
  Simulationsschritts interpoliert (Summe ≈ Rundenzeit). Training/Qualifying behalten die bisherige Ansicht.
- **Strategie-Übersicht** nach Rennen und Sprint (Knopf im Ergebnis): je Fahrer (nach Ergebnis sortiert) Balken in Reifenfarbe,
  Länge = Runden des Stints, Stopp-Runde an den Übergängen, rechts Gesamtrunden bzw. DNF. Daten: `js/team/raceData.js`
  (Stints und Sektoren aller Autos, nur Anzeige).

### v21 – Aufräumen Teamzentrale, OUT/IN im Reiter
- Buchungsliste unter der Teamzentrale entfernt (steht in Finanzen und in der Abrechnung nach dem Rennen).
- Fahrer-Reiter in Training/Qualifying: in der Out-Lap „OUT“, in der In-Lap „IN“ statt der Sektor-Quadrate.

### v22 – Setup ohne Training, Q-Fix, Wetter-Kopf, Aufwärmen in der Out-Lap
- Ohne Training: Setup der eigenen Autos auf KI-Niveau (wk.autoSetup).
- Qualifying: KI bleibt nie in der Box, wenn sie unter dem Strich steht (vorher seltener Zufall möglich).
- Fenster mit X-Kopfzeile (Wetter u. a.): Kopf bleibt beim Scrollen stehen.
- Qualifying-Out-Lap: Autos fahren Schlangenlinien zum Reifenaufwärmen (seltener als in der Formationsrunde).

### v23 – Violett nur einmal je Sektor, Tempo-Knopf robuster
- Neue Sektor-Bestzeit: beim bisherigen Halter wird der Sektor grün (Training/Qualifying und Rennen).
- Tempo-Knopf: Finger wird an den Knopf gebunden (Pointer-Capture), abgebrochene Gesten räumen den Timer auf,
  hängender Menü-Zustand wird repariert. (Meldung: in Q3 Suzuka ~30 s keine Reaktion.)

### v24 – Renningenieur sagt die Out-Lap-Dauer an
- Session misst die Dauer Garage → Start der schnellen Runde (Mittelwert, ohne Neutralisierung); Startwert 1,5 × Basisrunde.
- Qualifying/Sprint-Quali, Auto in der Garage: Hinweis „Out-Lap ca. m:ss · spätestens bei m:ss Restzeit rausfahren (noch m:ss)“
  (8 s Reserve), 30 s vorher Funk + Toast, danach „Jetzt sofort raus!“ bzw. „Zu spät“.

### v25 – Sektoren nach dem Start, Proteste nach dem Rennen
- ZEITEN im Rennen: Sektorzeiten erst ab der ersten Überfahrt der Ziellinie (vorher kein falsches S3 mit 0,0xx).
- Neu js/team/protest.js: nach Rennen/Sprint im Ergebnis „⚖️ Entscheidungen der Rennleitung“ – alle Fälle mit eigenen Fahrern
  (ohne Reifenregel/Technik/Funk). Einspruch (eigener Fahrer bestraft) oder Protest (Gegner zu mild/nicht bestraft),
  max. 2 pro Rennen. Ansicht mit Rennszene (ScenePlayer aus Race Control) und Beweisen, bis zu 2 Argumente wählen.
  Erfolg nach Wahrheit des Falls + Argumenten (begründet & passendes Hauptargument ~85 %, nur Nebenargument ~55 %,
  unpassend ~15 %, unbegründet ~3 %; falsche Argumente −12 % je Stück). Neues Urteil wirkt sofort auf die Wertung.

### v26 – Training: 1× bei Rückkehr in die Box, Rote-Flagge-Banner
- Training: kommt ein eigener Fahrer in die Garage, schaltet das Tempo auf 1×.
- Banner bei roter Flagge in Training/Qualifying/Sprint-Quali: „ROTE FLAGGE – Session unterbrochen“ (Reifenhinweis nur Rennen/Sprint).

### v27 – Rote Flagge im Training, Setup gesperrt, Windschatten und freie Fahrt im Qualifying
- Rote Flagge in Sessions: laufende Ausfahrt wird abgebrochen (pushLeft 0); nach der Freigabe bekommen nur KI-Autos bzw.
  eigene mit Auto-Programm einen Ersatz-Run (vorher fuhren eigene Fahrer ungefragt wieder raus).
- Training: nach Abbruch durch Rot gibt der Fahrer trotzdem Setup-Rückmeldung („Abgebrochen wegen Roter Flagge. …“).
- Training: Setup-Bereich ausgegraut, solange das Auto draußen ist.
- Qualifying/Sprint-Quali, Bereich AUFWÄRMRUNDE:
  - FREIE FAHRT: Fahrer lässt auf der Aufwärmrunde ~5 s Lücke zum Vordermann (Monza-Test, 12 Läufe: Ø −0,26 s,
    Verkehr auf der schnellen Runde 29 s → 6 s; Out-Lap etwas länger, etwas höheres Risiko „zu langsam“).
  - WINDSCHATTEN VON <Teamkollege>: Teamkollege fährt zuerst raus (1 schnelle Runde), eigener Fahrer folgt mit ~1 s Abstand.
    Gewinn je Strecke aus dem Geradenanteil (session.towGain: Monza ~0,3 s, Monaco 0). Klappt nicht immer
    (Autos dazwischen, zu dicht = verwirbelte Luft). Monza-Test: Ø −0,14 s, gelungene Tows bis −1 s.

### v28 – Session-Sound nach Verkehr, Windschatten neu (Geber in Out-/In-Lap, auch KI)
- Training/Qualifying: Motorsound nach Zahl der fahrenden Autos (leer = still, wenige = leise, viele = laut),
  Drehzahl höher, je mehr Autos auf schneller Runde sind.
- Windschatten neu: Schalter „WINDSCHATTEN FÜR <Teamkollege>“ am Geber. Er gibt ihn nur auf seiner Aufwärm- oder
  Auslaufrunde: wartet (langsamer), bis der Teamkollege auf der schnellen Runde ~1,5 s dahinter ist, fährt dann voll
  vorneweg, lässt ihn nicht vorbei. Teamchef muss das Rausfahren abpassen: Renningenieur nennt den Zeitpunkt
  („in 12 s rausfahren“ / „JETZT“ / „zu spät“), wenn der Teamkollege auf der Aufwärmrunde ist. Auf der Strecke:
  „wartet auf …“, „gibt … Windschatten“.
- Wert je Strecke (session.towGain) aus Vollgas-Geraden > 350 m und der längsten Geraden: Monza 0,34 · Las Vegas 0,33 ·
  Baku 0,22 · Jeddah 0,19 · Miami 0,18 · Shanghai/Spa 0,17 · Mexiko 0,16 · … · Monaco 0.
- KI: auf Strecken ab 0,15 s plant ein Team mit Chance 0,2 + Wert pro Abschnitt einen Tow (langsamerer Fahrer gibt).
- Monza-Test (12× Q1): Ø 84,90 → 84,28 s, Windschatten im Schnitt 33 von 84 s der Runde (klappt nicht immer).

### v29 – Debriefing nach dem Training, Windschatten nur auf der längsten Geraden
- Ergebnis des Trainings mit DEBRIEFING: je Fahrer alle Rückmeldungen nach Stints (Setup, Runden, Bestzeit), Setup mit
  +/− für Qualifying und Rennen anpassbar (Ingenieur-Einschätzung in der Saison). Eine bei Session-Ende noch nicht
  ausgewertete Ausfahrt (Auto noch draußen, Rote Flagge) wird nachgeholt.
- Windschatten nur auf der längsten Geraden, die ganz in einer Runde liegt (session.towStraight). Wert aus ihrer Länge:
  Las Vegas 0,35 · Baku 0,24 · Shanghai 0,22 · Mexiko 0,20 · Miami/Spa 0,17 · COTA/Abu Dhabi 0,14 · Monza 0,14 · … · Monaco 0.
- Ablauf: Geber fährt zuerst raus, Teamkollege 3–10 s danach. Geber bleibt vorne (andere auf Aufwärm-/Auslaufrunde lassen
  ihn vorbei), wartet und hält vor der Geraden ~1–1,8 s Vorsprung, auf der Geraden saugt sich der Teamkollege heran
  (mehr Topspeed). ~170 m vor dem Bremspunkt geht der Geber zur Seite (Karte), bremst früher, der Teamkollege fährt in der
  Bremszone vorbei; danach ist der Windschatten erledigt. Falls nötig, fährt der Geber eine zweite Aufwärmrunde.
  Hängt der Teamkollege vor der Geraden >4 s dicht dahinter, lässt der Geber ihn vorbei (Windschatten abgebrochen).
- Test je 12× Q1: Las Vegas 12/12 gelungen (Ø −0,45 s), Monza 9/12 (Ø −0,42 s), Mexiko 5/12 (Ø −0,07 s; Gerade direkt
  nach der Ziellinie ist schwer zu treffen). KI auf Strecken ab 0,12 s.

### v30 – Teamkollegen nie Verkehr, Reifenwahl nur in der Box, Wetter in der Strategiebesprechung
- Grundregel (alle Teams): Teamkollege auf Aufwärm-/Auslaufrunde zählt für eine schnelle Runde nie als Verkehr und macht
  immer Platz (kein Behinderungsrisiko). Ausnahme: Windschatten-Geber.
- Training/Qualifying/Sprint-Quali: Mischung und Reifensatz nur wählbar, wenn das Auto in der Box steht (sonst ausgegraut).
- Strategiebesprechung vor Sprint/Rennen: Wetterzeile (Vorhersage für die Renndauer), Antippen öffnet Wetter mit Regenradar
  und Vorhersage der weiteren Sessions.

### v31 – Fix: Strategie-Übersicht und Rennleitung öffnen sich sichtbar
- #stratView und #protestView lagen im DOM vor dem Ergebnisfenster (gleicher z-index) und öffneten sich dahinter –
  sichtbar erst, wenn das Ergebnis geschlossen wurde. Jetzt z-index 20.
