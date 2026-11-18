// Pit Wall – Rennwochenende: Ablauf der Sessions, Setup, Reifenkontingent, Startaufstellungen.
import { COMPOUNDS } from '../sim/tyres.js';
import { setupEffect, aiSetupDt, migrateSetup, startSetup } from './setup.js';

export const SESSION_NAME = { fp: 'Freies Training', sq: 'Sprint-Qualifying', sprint: 'Sprint', quali: 'Qualifying', race: 'Rennen' };
export const SESSION_SHORT = { fp: 'FP', sq: 'SQ', sprint: 'Sprint', quali: 'Quali', race: 'Rennen' };
const ORDER = ['fp', 'sq', 'sprint', 'quali', 'race'];

// Reifenkontingent je Fahrer (Sätze, Sportliches Reglement): 13 Slick-Sätze (2 H / 3 M / 8 S), Sprint-Wochenende 12
// (2 H / 4 M / 6 S), dazu 5 Intermediates und 2 Regenreifen. Nach dem Training werden Sätze zurückgegeben
// (normal 2 je Training × 3 = 6, Sprint-Wochenende nur ein Training = 2) – für Quali und Rennen bleiben 7 bzw. 10.
const ALLOC = { normal: { S: 8, M: 3, H: 2, I: 5, W: 2 }, sprint: { S: 6, M: 4, H: 2, I: 5, W: 2 } };
const RETURN = { normal: 6, sprint: 2 };

// parts: Auswahl auf der Startseite, z. B. ['fp', 'quali', 'sprint', 'race'] (Sprint bringt SQ mit)
export function createWeekend({ parts, seed, trackId, carIds }) {
  const set = new Set(parts);
  if (set.has('sprint')) set.add('sq');
  set.add('race');
  const seq = ORDER.filter(k => set.has(k));
  const sprintWk = set.has('sprint');
  const alloc = sprintWk ? ALLOC.sprint : ALLOC.normal;
  const wk = {
    seq, idx: 0, seed, trackId,
    setup: {}, notes: {}, runs: {}, sets: {},
    grid: { race: null, sprint: null }, penalties: { race: {}, sprint: {} },
    results: {}, setupLocked: false, alloc, sprintWk, returned: {},
    autoSetup: !set.has('fp'),   // ohne Training stellt das Team ein Setup auf KI-Niveau ein
  };
  let n = 0;
  for (const id of carIds) {
    wk.setup[id] = null;   // Start-Setup kommt mit der Strecke (applyWeekend)
    wk.notes[id] = [];
    wk.runs[id] = 0;
    wk.sets[id] = [];
    for (const [c, k] of Object.entries(alloc)) for (let i = 0; i < k; i++) wk.sets[id].push({ id: ++n, c, laps: 0 });
    wk.returned[id] = 0;
    // Nicht gefahrene Sessions simulieren: Sätze aus dem Training sind gefahren/zurückgegeben, Quali-Softs gebraucht
    if (!set.has('fp')) simulateUsage(wk, id, 'fp');
    if (!set.has('quali')) simulateUsage(wk, id, 'quali');
  }
  return wk;
}

// Simulierte Nutzung einer nicht gefahrenen Session
function simulateUsage(wk, carId, kind) {
  const sets = wk.sets[carId];
  const take = (c, laps) => { const st = sets.find(x => x.c === c && x.laps < 0.05); if (st) st.laps = laps; };
  if (kind === 'fp') {
    // Training: Longruns auf Medium/Hard, Quali-Simulation auf Soft – danach Rückgabe
    take('M', 9); take('H', 11); take('S', 4); take('S', 3);
    if (!wk.sprintWk) { take('M', 7); take('S', 5); }
    returnSets(wk, carId);
  } else {
    // Qualifying: Softs mit Aufwärm-, schneller und Auslaufrunde (~3 Runden)
    for (let i = 0; i < (wk.sprintWk ? 2 : 3); i++) take('S', 3);
  }
}

// Rückgabe nach dem Training: die meistgefahrenen Sätze, aber je ein Medium und Hard bleibt fürs Rennen
export function returnSets(wk, carId) {
  const n = wk.sprintWk ? RETURN.sprint : RETURN.normal;
  const sets = wk.sets[carId];
  for (let k = 0; k < n; k++) {
    const dry = sets.filter(x => !['I', 'W'].includes(x.c));
    const keep = c => dry.filter(x => x.c === c).length <= 1;
    const cand = dry.filter(x => !((x.c === 'M' || x.c === 'H') && keep(x.c))).sort((a, b) => b.laps - a.laps || (a.c === 'S' ? 1 : -1));
    if (!cand.length) break;
    sets.splice(sets.indexOf(cand[0]), 1);
    wk.returned[carId] = (wk.returned[carId] || 0) + 1;
  }
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
  if (set.lapCount === undefined) set.lapCount = Math.round(set.laps);   // gefahrene Runden auf diesem Satz (gesamt)
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

// Setup und Kontingent auf eine Session/ein Rennen anwenden.
// Je Auto werden die Werte für trocken und nass gemerkt; setupLive mischt sie laufend nach der Nässe der Strecke.
export function applyWeekend(race, wk) {
  for (const c of race.cars) {
    if (c.player && c.id in wk.setup && !wk.setup[c.id]) wk.setup[c.id] = startSetup(race.track, wk.seed, c.id);
    if (c.player && wk.setup[c.id] && !wk.autoSetup) {
      const s = wk.setup[c.id] = migrateSetup(wk.setup[c.id]);
      const d = setupEffect(race.track, s, 0), w = setupEffect(race.track, s, 1);
      c.su = { dry: d.dt, wet: w.dt, wd: d.wear, ww: w.wear };
    } else {
      // KI (und eigene Autos ohne Training): Setup auf KI-Niveau
      c.su = { dry: aiSetupDt(wk.seed, c.team.id, 0), wet: aiSetupDt(wk.seed, c.team.id, 1), wd: 1, ww: 1 };
    }
  }
  setupLive(race);
  race.onPlayerTyres = car => tyreHook(race, wk, car);
  if (race.isSession) race.setupLocked = wk.setupLocked || race.kind !== 'fp';
}
// Laufend: Setup-Wirkung nach aktueller Nässe (Regen-Setup schnell im Nassen, Trocken-Setup im Trockenen)
// + Leistungsverlust der Antriebseinheit (Saison)
export function setupLive(race) {
  const w = race.weather ? Math.max(0, Math.min(1, race.weather.wetness / 0.7)) : 0;
  for (const c of race.cars) {
    if (!c.su) continue;
    c.setupDt = (1 - w) * c.su.dry + w * c.su.wet + (c.player ? 0.0045 * (c.puWear || 0) : 0);
    c.setupWear = w > 0.5 ? c.su.ww : c.su.wd;
  }
}

// Ergebnis einer Session übernehmen und zur nächsten weitergehen
export function finishSession(wk, race) {
  const kind = currentKind(wk);
  const st = race.standings();
  wk.results[kind] = st.map((c, i) => ({ id: c.id, pos: i + 1, best: race.isSession ? race.rankTime(c) : null, retired: c.retired, dsq: c.dsq }));
  if (kind === 'fp') for (const id of Object.keys(wk.sets)) returnSets(wk, id);
  if (kind === 'quali') wk.grid.race = race.resultOrder();
  if (kind === 'sq') wk.grid.sprint = race.resultOrder();
  // Startplatzstrafen aus der Session für das nächste Rennen
  const target = kind === 'sq' ? 'sprint' : kind === 'sprint' || kind === 'quali' || kind === 'fp' ? 'race' : null;
  if (target) for (const p of race.carryOver || []) wk.penalties[target][p.carId] = (wk.penalties[target][p.carId] || 0) + p.places;
  if (kind === 'race') wk.carry = (race.carryOver || []).map(p => ({ carId: p.carId, places: p.places }));   // fürs nächste Wochenende
  if (kind !== 'fp') wk.setupLocked = true;   // Parc fermé ab dem ersten Qualifying
  wk.idx++;
}
