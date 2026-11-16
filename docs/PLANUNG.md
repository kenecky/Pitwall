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
- [ ] **M2 – Renn-Strategie komplett**: Energie-/Overtake-Modus, Teamorder (halten/tauschen), Undercut/Overcut-Hinweise
      mit Boxenstopp-Verlust, SC/VSC-Fenster, Wetter, Doppelstopp-Warnung
- [ ] **M3 – Teamfunk**: Fahrer melden sich (Reifen, Wetter, Schäden, Beschwerden), Antwort per Schnellauswahl, Stimmung
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
