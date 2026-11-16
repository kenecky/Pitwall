# Pit Wall

Browser-Spiel (PWA): Du bist Teamchef eines Formel-1-Teams und führst zwei Fahrer durch das Rennen – Boxenstopps, Reifenwahl, Tempo-Anweisungen. Die Rennleitung (Flaggen, Safety Car, Strafen) läuft automatisch im Hintergrund.

Basis: Simulation, Strecken, Intros und Oberfläche aus „F1 Race Control“.

- Vanilla JS (ES-Module), Canvas 2D, Web Audio, kein Build-Schritt
- Lokal starten: `python3 -m http.server` im Projektordner, dann http://localhost:8000
- Tests: `node tests/sim.mjs 6` (ganze Rennen headless), `node tests/check_sw.mjs` (Service Worker, Versionen)

Kein offizielles Produkt; keine offiziellen Logos oder Markenzeichen. Planung: `docs/PLANUNG.md`.
