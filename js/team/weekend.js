// Pit Wall – Rennwochenende: Ablauf der Sessions, Setup, Reifenkontingent, Startaufstellungen.
import { COMPOUNDS } from '../sim/tyres.js';
import { BASE_SETUP, setupEffect, aiSetupDt } from './setup.js';

export const SESSION_NAME = { fp: 'Freies Training', sq: 'Sprint-Qualifying', sprint: 'Sprint', quali: 'Qualifying', race: 'Rennen' };
export const SESSION_SHORT = { fp: 'FP', sq: 'SQ', sprint: 'Sprint', quali: 'Quali', race: 'Rennen' };
const ORDER = ['fp', 'sq', 'sprint', 'quali', 'race'];

// Reifenkontingent je Fahrer (Sätze) – Sprint-Wochenende mit weniger Softs
const ALLOC = { normal: { S: 8, M: 3, H: 2, I: 4, W: 3 }, sprint: { S: 6, M: 4, H: 2, I: 4, W: 3 } };

// parts: Auswahl auf der Startseite, z. B. ['fp', 'quali', 'sprint', 'race'] (Sprint bringt SQ mit)
export function createWeekend({ parts, seed, trackId, carIds }) {
  const set = new Set(parts);
  if (set.has('sprint')) set.add('sq');
  set.add('race');
  const seq = ORDER.filter(k => set.has(k));
  const alloc = set.has('sprint') ? ALLOC.sprint : ALLOC.normal;
  const wk = {
    seq, idx: 0, seed, trackId,
    setup: {}, notes: {}, runs: {}, sets: {},
    grid: { race: null, sprint: null }, penalties: { race: {}, sprint: {} },
    results: {}, setupLocked: false, alloc,
  };
  let n = 0;
  for (const id of carIds) {
    wk.setup[id] = { ...BASE_SETUP };
    wk.notes[id] = [];
    wk.runs[id] = 0;
    wk.sets[id] = [];
    for (const [c, k] of Object.entries(alloc)) for (let i = 0; i < k; i++) wk.sets[id].push({ id: ++n, c, laps: 0 });
  }
  return wk;
}

export function currentKind(wk) { return wk.seq[wk.idx]; }
export function nextKind(wk) { return wk.seq[wk.idx + 1] || null; }

// ---------- Reifensätze ----------
export function setsOf(wk, carId, c) {
  return wk.sets[carId].filter(s => s.c === c).sort((a, b) => a.laps - b.laps);
}
export function setSummary(wk, carId) {
  const out = {};
  for (const c of Object.keys(COMPOUNDS)) {
    const l = setsOf(wk, carId, c);
    out[c] = { fresh: l.filter(s => s.laps < 0.05).length, used: l.filter(s => s.laps >= 0.05).map(s => s.laps), total: l.length };
  }
  return out;
}
// Bester verfügbarer Satz: neu, sonst der am wenigsten gefahrene (nicht der gerade montierte)
export function bestSet(wk, carId, c, exclude = null) {
  return setsOf(wk, carId, c).find(s => s !== exclude) || null;
}

// Wird von der Simulation nach jedem Reifenwechsel eines eigenen Autos aufgerufen (race.onPlayerTyres)
export function tyreHook(race, wk, car) {
  const w = race.wear || 1;
  const set = car.nextSet && car.nextSet.c === car.compound ? car.nextSet : bestSet(wk, car.id, car.compound, car.curSet);
  car.nextSet = null;
  car.curSet = set;
  if (!set) return;
  set.base = set.laps;
  car.tyreWear = set.laps / w;
}
// Laufend: gefahrene Runden auf dem montierten Satz (in Runden der vollen Distanz)
export function trackSetWear(race, car) {
  if (car.curSet && !car.inGarage) car.curSet.laps = (car.curSet.base || 0) + car.tyreWear * (race.wear || 1);
}

// ---------- Setup ----------
export function setupFor(wk, track, carId, wet = 0) {
  return setupEffect(track, wk.setup[carId], wet);
}

// Setup und Kontingent auf eine Session/ein Rennen anwenden
export function applyWeekend(race, wk) {
  const wet = race.weather ? Math.min(1, race.weather.wetness) : 0;
  for (const c of race.cars) {
    if (c.player && wk.setup[c.id]) {
      const e = setupFor(wk, race.track, c.id, wet);
      c.setupDt = e.dt;
      c.setupWear = e.wear;
    } else {
      c.setupDt = aiSetupDt(wk.seed, c.team.id);
      c.setupWear = 1;
    }
  }
  race.onPlayerTyres = car => tyreHook(race, wk, car);
  if (race.isSession) race.setupLocked = wk.setupLocked || race.kind !== 'fp';
}

// Ergebnis einer Session übernehmen und zur nächsten weitergehen
export function finishSession(wk, race) {
  const kind = currentKind(wk);
  const st = race.standings();
  wk.results[kind] = st.map((c, i) => ({ id: c.id, pos: i + 1, best: race.isSession ? race.rankTime(c) : null, retired: c.retired, dsq: c.dsq }));
  if (kind === 'quali') wk.grid.race = race.resultOrder();
  if (kind === 'sq') wk.grid.sprint = race.resultOrder();
  // Startplatzstrafen aus der Session für das nächste Rennen
  const target = kind === 'sq' ? 'sprint' : kind === 'sprint' || kind === 'quali' || kind === 'fp' ? 'race' : null;
  if (target) for (const p of race.carryOver || []) wk.penalties[target][p.carId] = (wk.penalties[target][p.carId] || 0) + p.places;
  if (kind === 'race') wk.carry = (race.carryOver || []).map(p => ({ carId: p.carId, places: p.places }));   // fürs nächste Wochenende
  if (kind !== 'fp') wk.setupLocked = true;   // Parc fermé ab dem ersten Qualifying
  wk.idx++;
}
