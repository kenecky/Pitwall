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
- [ ] **M4 – Rennwochenende**: Setup im Training (Flügel, Abstimmung, Rückmeldung), Quali-Runs timen (Verkehr, freie Runde),
      Reifen-Kontingent, Sprint
- [ ] **M5 – Saison**: Kalender, Speichern/Fortsetzen, Team- und Fahrerwertung
- [ ] **M6 – Management**: Budget mit Obergrenze, Entwicklung Aero/Motor/Zuverlässigkeit, Ersatzteile und Schäden,
      Personal (Boxencrew, Ingenieure), Fahrerverträge und Stimmung, Sponsorenziele, Vorstandsziele, Ruf
- [ ] **M7 – Karriere**: Teamwechsel, Angebote anderer Teams (wie im Fußballmanager)

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
