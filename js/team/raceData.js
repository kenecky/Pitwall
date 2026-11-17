// Pit Wall – Renndaten für alle Autos: letzte Sektorzeiten (S1–S3, violett/grün/gelb) und Reifen-Stints.
// Wird nach jedem Simulationsschritt im Rennen aufgerufen (nur Anzeige, beeinflusst die Simulation nicht).
import { DT } from '../sim/race.js';

export function updateRaceData(race) {
  if (race.isSession || race.preStart) return;
  const L = race.track.L;
  if (!race.rBest) race.rBest = [Infinity, Infinity, Infinity];
  for (const c of race.cars) {
    // Stints: Mischung und Runden je Stint (für die Strategie-Übersicht)
    const st = c.stints || (c.stints = [{ c: c.compound, from: 0, to: 0 }]);
    const last = st[st.length - 1];
    if (c.compound !== last.c || c.tyreAge < (last.age ?? 0)) { last.to = c.lap; st.push({ c: c.compound, from: c.lap, to: c.lap, age: c.tyreAge }); }
    else { last.to = c.finished || c.retired ? last.to : c.lap; last.age = c.tyreAge; }
    if (c.finished && !last.done) { last.to = race.laps; last.done = true; }
    if (c.retired && !last.done) { last.to = c.lap; last.done = true; }
    // Sektoren
    if (c.retired || c.finished) continue;
    const idx = Math.min(2, Math.floor((((c.d % L) + L) % L) / (L / 3)));
    if (c.rIdx === undefined || c.d < 0) { c.rIdx = idx; c.rStart = race.time; c.rPit = c.inPit; continue; }
    if (c.inPit) c.rPit = true;
    if (idx === c.rIdx) continue;
    // genauer Überfahrzeitpunkt der Sektorgrenze (innerhalb des Simulationsschritts interpoliert)
    const over = (((c.d % L) + L) % L) - idx * (L / 3);
    const tx = race.time - (c.move > 0 ? Math.min(DT, DT * over / c.move) : 0);
    const done = c.rIdx, t = tx - c.rStart;
    c.rIdx = idx; c.rStart = tx;
    const sec = c.rSec || (c.rSec = [null, null, null]);
    if (c.rPit || race.neutral) { sec[done] = { t, st: 'n' }; c.rPit = c.inPit; continue; }   // Box/Neutralisierung: neutral
    c.rPit = c.inPit;
    const pb = c.rPb || (c.rPb = [Infinity, Infinity, Infinity]);
    let s = 'y';
    if (t < race.rBest[done]) {
      s = 'p'; race.rBest[done] = t;
      // Nur einer kann violett haben: bisheriger Bestzeit-Halter in diesem Sektor wird grün
      for (const o of race.cars) if (o !== c && o.rSec && o.rSec[done] && o.rSec[done].st === 'p') o.rSec[done].st = 'g';
    } else if (t < pb[done]) s = 'g';
    if (t < pb[done]) pb[done] = t;
    sec[done] = { t, st: s };
  }
}
