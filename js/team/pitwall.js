// Pit Wall: Befehle des Teamchefs an seine beiden Fahrer, Rennstrategen, Boxenverlust und Rejoin-Vorhersage.
// Die Simulation (race.js) liest car.paceMode, car.ersMode, car.tyreWear, car.plan, car.letBy und race.teamOrder.
import { COMPOUNDS } from '../sim/tyres.js';
import { setupLive } from './weekend.js';

// Tempo-Anweisung: dt = Rundenzeit (s), wear = Reifenverschleiß je Runde, risk = Fehler/Aggressivität
export const PACE = {
  save:   { id: 'save',   name: 'Reifen schonen', short: 'SCHONEN', dt: 0.45,  wear: 0.72, risk: 0.8 },
  normal: { id: 'normal', name: 'Normal',         short: 'NORMAL',  dt: 0,     wear: 1.0,  risk: 1.0 },
  push:   { id: 'push',   name: 'Pushen',         short: 'PUSH',    dt: -0.28, wear: 1.3,  risk: 1.15 },
  attack: { id: 'attack', name: 'Attacke',        short: 'ATTACKE', dt: -0.55, wear: 1.75, risk: 1.4 },
};
export const PACE_ORDER = ['save', 'normal', 'push', 'attack'];
export const paceOf = car => (car && PACE[car.player ? car.paceMode : car.aiPace]) || PACE.normal;   // KI: car.aiPace (race.aiPaceStep)

// Zweikampf-Taktik: pass = Faktor eigener Angriffe (0 = keine), def = Faktor der Überholchance des Hintermanns,
// agg = Aggressivität (Kollisionsrisiko), dt = Rundenzeit, wear = Reifenverschleiß
export const TACTIC = {
  normal:   { id: 'normal',   short: 'NORMAL',    name: 'Normal fahren',        pass: 1,    def: 1,    agg: 1,    dt: 0,   wear: 1 },
  overtake: { id: 'overtake', short: 'ÜBERHOLEN', name: 'Überholen versuchen',  pass: 1.4,  def: 1,    agg: 1.25, dt: 0,   wear: 1.08 },
  defend:   { id: 'defend',   short: 'HALTEN',    name: 'Position halten',      pass: 0,    def: 0.65, agg: 1.1,  dt: 0,   wear: 1 },
  block:    { id: 'block',    short: 'AUFHALTEN', name: 'Hintermänner aufhalten', pass: 0,  def: 0.5,  agg: 1.2,  dt: 0.8, wear: 0.85 },
};
export const TACTIC_ORDER = ['normal', 'overtake', 'defend', 'block'];
export const tacticOf = car => (car && car.player && TACTIC[car.tactic]) || TACTIC.normal;

// Stimmung des Fahrers (0–100): gute Laune = etwas schneller und konzentrierter
export function moodOf(car) {
  if (!car || !car.player) return { dt: 0, err: 1 };
  const m = car.mood ?? 70;
  return { dt: m < 50 ? (50 - m) * 0.008 : -(m - 50) * 0.002, err: m < 40 ? 1 + (40 - m) * 0.015 : 1 };
}

export function setTactic(race, car, t) {
  if (!TACTIC[t] || car.tactic === t || car.retired || car.finished) return false;
  car.tactic = t;
  const ahead = race.standings()[race.standings().indexOf(car) - 1];
  const T = {
    normal: 'Normal weiterfahren, keine besonderen Anweisungen.',
    overtake: `Du musst ${ahead ? `an ${ahead.id} ` : ''}vorbei, versuch es!`,
    defend: 'Position halten, keine unnötigen Risiken.',
    block: 'Halt die Autos hinter dir auf, so lange es geht.',
  };
  radio(race, car, T[t]);
  return true;
}

// Energie-Modus (Hybrid): Laden – Normal – Overtake
export const ERS = {
  harvest:  { id: 'harvest',  short: 'LADEN' },
  normal:   { id: 'normal',   short: 'NORMAL' },
  overtake: { id: 'overtake', short: 'OVERTAKE' },
};
export const ERS_ORDER = ['harvest', 'normal', 'overtake'];

// Rennstrategen der Teams (fiktive Personen)
export const STRATEGISTS = {
  mercedes: 'Jana Wolff', ferrari: 'Marco Bellini', mclaren: 'Tom Ashby', redbull: 'Lukas Brandt',
  alpine: 'Claire Dumas', haas: 'Ryan Keller', racingbulls: 'Sofia Conti', williams: 'James Harlow',
  audi: 'Felix Hartmann', astonmartin: 'Emma Clarke', cadillac: 'Nate Morrison',
};

// Eigene Autos des Teamchefs am Gerät (Mehrspieler: mehrere menschliche Teams, race.playerTeam = mein Team)
export function playerCars(race) {
  return race.cars.filter(c => c.player && (!race.playerTeam || c.team.id === race.playerTeam));
}
// Alle von Menschen gesteuerten Autos (Mehrspieler: beide Teams)
export function humanCars(race) {
  return race.cars.filter(c => c.player);
}
// Teamorder des eigenen Teams
export const teamOrderOf = race => (race.teamOrders && race.playerTeam && race.teamOrders[race.playerTeam]) || race.teamOrder || 'free';

const radio = (race, car, text) => race.emit('radio', `Teamfunk ${car.team.name} an ${car.id}: „${text}“`, { cars: [car.id], own: true });
const fmt = (x, d = 1) => x.toFixed(d).replace('.', ',');

// ---------- Tempo und Energie ----------
export function setPace(race, car, mode) {
  if (!PACE[mode] || car.paceMode === mode || car.retired || car.finished) return false;
  car.paceMode = mode;
  const T = {
    save: 'Reifen schonen, wir müssen ans Ende kommen.',
    normal: 'Normales Tempo, gleichmäßig weiterfahren.',
    push: 'Push jetzt, wir brauchen die Rundenzeiten!',
    attack: 'Volle Attacke! Alles geben!',
  };
  radio(race, car, T[mode]);
  return true;
}

export function setErs(race, car, mode) {
  if (!ERS[mode] || (car.ersMode || 'normal') === mode || car.retired || car.finished) return false;
  car.ersMode = mode;
  const T = { harvest: 'Energie laden, wir brauchen die Batterie später.', normal: 'Energie-Modus normal.', overtake: 'Overtake-Modus, jetzt angreifen!' };
  radio(race, car, T[mode]);
  return true;
}

// ---------- Teamorder ----------
export function setTeamOrder(race, order) {
  if (teamOrderOf(race) === order) return false;
  race.teamOrders = race.teamOrders || {};
  if (race.playerTeam) race.teamOrders[race.playerTeam] = order; else race.teamOrder = order;
  for (const c of playerCars(race)) {
    if (c.retired || c.finished) continue;
    radio(race, c, order === 'hold' ? 'Positionen halten, keine Angriffe auf den Teamkollegen.' : 'Ihr dürft frei fahren.');
  }
  return true;
}

// Plätze tauschen: das vordere Auto lässt den Teamkollegen vorbei
export function swapCars(race) {
  const [a, b] = activePair(race);
  if (!a || !b) return { ok: false, why: 'Beide Fahrer müssen im Rennen sein.' };
  const g = race.gap(b, a);
  if (!g || g.laps || g.time > 3) return { ok: false, why: 'Zu weit auseinander (mehr als 3 s).' };
  if (a.letBy) return { ok: false, why: 'Tausch läuft bereits.' };
  a.letBy = b.id;
  a.letBySince = race.time;
  radio(race, a, `Lass ${b.driver.last} vorbei, wir tauschen die Positionen.`);
  return { ok: true };
}

// Die beiden eigenen Autos im Rennen, vorderes zuerst
function activePair(race) {
  const st = race.standings().filter(c => c.player && (!race.playerTeam || c.team.id === race.playerTeam) && !c.retired && !c.finished);
  return [st[0], st[1]];
}

// Nach jedem Simulationsschritt: Teamorder abschließen
export function teamStep(race) {
  // Reifen-Historie je Auto: Mischung und gefahrene Runden pro Stint
  if (!race.isSession && race.phase !== 'pre') for (const c of race.cars) {
    if (!c.player) continue;
    const log = c.stintLog || (c.stintLog = []);
    const last = log[log.length - 1];
    if (!last || last.c !== c.compound || c.tyreAge < last.laps || (last.stops !== c.stops)) log.push({ c: c.compound, laps: c.tyreAge, stops: c.stops, used: c.curSet ? Math.round(c.curSet.base || 0) : 0 });
    else last.laps = c.tyreAge;
  }
  if (race.trackSets) race.trackSets();
  // Setup-Wirkung folgt der Nässe der Strecke (alle 2 s Simulationszeit)
  if (race.time - (race.suT ?? -9) >= 2) { race.suT = race.time; setupLive(race); }
  // Saison: Verschleiß der Antriebseinheit (pro gefahrenem Meter, Pushen/Attacke und schnelle Runden mehr)
  if (race.puRate && race.phase === 'running') for (const c of race.cars) {
    if (!c.player || c.inGarage || c.retired || c.finished || !(c.move > 0)) continue;
    const f = race.isSession ? (c.prog && c.prog.phase === 'push' ? 1.3 : 0.75)
      : ({ save: 0.75, normal: 1, push: 1.35, attack: 1.7 }[c.paceMode] || 1) * (c.ersMode === 'overtake' ? 1.1 : 1) * (race.neutral ? 0.5 : 1);
    c.puWear = Math.min(100, (c.puWear || 0) + c.move * race.puRate * f);
  }
  for (const a of race.cars) {
    if (!a.letBy) continue;
    const b = race.carById[a.letBy];
    const done = !b || b.retired || b.finished || a.retired || a.finished || race.raceDist(b) > race.raceDist(a) + 5;
    if (done || a.inPit || b.inPit || race.time - a.letBySince > 120) {
      if (done && b && !b.retired) race.emit('info', `Teamorder: ${a.id} hat ${b.id} vorbeigelassen.`, { cars: [a.id, b.id] });
      a.letBy = null;
    }
  }
}

// ---------- Boxenstopp ----------
export function nextStop(car) {
  return car.plan[car.planIdx] || null;
}

// Liegt die Boxeneinfahrt so knapp vor dem Auto, dass der Fahrer nicht mehr reagieren kann?
export function tooLateForBox(race, car) {
  const tr = race.track;
  const toEntry = ((tr.pit.entry - (car.d % tr.L)) % tr.L + tr.L) % tr.L;
  return toEntry < 150;
}

// Kommt das Auto beim nächsten Überfahren der Boxeneinfahrt rein (Ansage oder Plan)?
export function stopDue(car) {
  const n = nextStop(car);
  return Boolean(n && car.lap + 1 >= n.lap);
}

// Box ansagen: ersetzt den nächsten geplanten Stopp, wenn er ohnehin bald käme
export function callBox(race, car, compound) {
  if (!COMPOUNDS[compound] || car.retired || car.finished || car.boxCall) return false;
  const lap = tooLateForBox(race, car) ? car.lap + 2 : 0;
  const next = nextStop(car);
  let replaced = null;
  if (next && next.lap - car.lap <= 8) { replaced = { ...next }; car.plan[car.planIdx] = { lap, compound }; }
  else car.plan.splice(car.planIdx, 0, { lap, compound });
  car.boxCall = { compound, at: race.time, lap, replaced };
  radio(race, car, `Box, box! Wir gehen auf ${COMPOUNDS[compound].name}.`);
  return true;
}

// Ansage oder fälligen Stopp abbrechen
export function cancelBox(race, car) {
  if (car.inPit) return false;
  if (car.boxCall) {
    const r = car.boxCall.replaced;
    if (r) car.plan[car.planIdx] = r; else car.plan.splice(car.planIdx, 1);
    car.boxCall = null;
  } else if (stopDue(car)) {
    nextStop(car).lap = car.lap + 2;   // geplanten Stopp eine Runde später
  } else return false;
  radio(race, car, 'Bleib draußen, bleib draußen!');
  return true;
}

// Geplanten Stopp verschieben / streichen / Mischung ändern
export function shiftStop(race, car, delta) {
  const n = nextStop(car);
  if (!n || car.boxCall) return false;
  n.lap = Math.max(car.lap + 1, Math.min(race.laps - 1, n.lap + delta));
  return true;
}
export function dropStop(race, car) {
  if (!nextStop(car) || car.boxCall) return false;
  car.plan.splice(car.planIdx, 1);
  return true;
}
export function setStopCompound(car, compound) {
  const n = nextStop(car);
  if (!n || !COMPOUNDS[compound]) return false;
  n.compound = compound;
  if (car.boxCall) car.boxCall.compound = compound;
  return true;
}
// Einen Stopp einplanen (wenn keiner geplant ist)
export function addStop(race, car, compound, inLaps = 5) {
  if (nextStop(car)) return false;
  car.plan.splice(car.planIdx, 0, { lap: Math.min(race.laps - 1, car.lap + inLaps), compound });
  return true;
}

// ---------- Reifen ----------
const wearOf = (race, car) => (car.tyreWear ?? car.tyreAge) * (race.wear || 1);

// Reifenzustand 0–100 % (100 = neu); an der „Klippe“ 15 %
export function tyreLife(race, car) {
  const C = COMPOUNDS[car.compound];
  return Math.max(0, Math.min(100, Math.floor(100 * (1 - 0.85 * wearOf(race, car) / C.cliff))));
}

// Wie viele Runden halten die Reifen noch (bis zur Klippe) bei einer Tempo-Anweisung?
export function lapsLeftOnTyres(race, car, mode = car.paceMode) {
  const C = COMPOUNDS[car.compound];
  const w = race.wear || 1;
  return Math.max(0, (C.cliff - wearOf(race, car)) / (w * PACE[mode].wear));
}

// Zeitverlust einer Mischung gegenüber neuen Softs bei Verschleiß „age“ (wie race.lapTarget)
function tyreLoss(id, age) {
  const C = COMPOUNDS[id];
  let deg = age * C.deg;
  if (age > C.cliff) deg += (age - C.cliff) * 0.22;
  return (C.wet ? 0 : C.offset) + deg;
}

// ---------- Zeit-Kreis („Circle of Doom“) und Boxenverlust ----------
// Kumulierte Zeit entlang der Runde bei Renntempo (Index wie track.v)
function lapProfile(track) {
  if (track._pwT) return track._pwT;
  const T = new Float64Array(track.N + 1);
  for (let i = 0; i < track.N; i++) T[i + 1] = T[i] + track.ds / Math.max(5, track.v[i]);
  track._pwT = T;
  return T;
}
function timeAtD(track, d) {
  const T = lapProfile(track);
  const x = ((d % track.L) + track.L) % track.L;
  const i = Math.min(track.N - 1, Math.floor(x / track.ds));
  return T[i] + (x - i * track.ds) / Math.max(5, track.v[i]);
}
function dAtTime(track, t) {
  const T = lapProfile(track);
  const Tl = T[track.N];
  const x = ((t % Tl) + Tl) % Tl;
  let lo = 0, hi = track.N;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] <= x) lo = m; else hi = m; }
  return lo * track.ds + (x - T[lo]) * Math.max(5, track.v[lo]);
}
export function lapTime(track) { return lapProfile(track)[track.N]; }

// Position eines Autos auf der Zeitachse des Rennens (s seit dem Start, bei Renntempo)
export function timeOf(race, car) {
  const d = race.raceDist(car);
  return Math.floor(d / race.track.L) * lapTime(race.track) + timeAtD(race.track, d);
}

// Boxenverlust: Fahrt durch die Boxengasse + Standzeit – gegenüber der Fahrt auf der Strecke
export function pitLoss(race, car) {
  const tr = race.track;
  const n = race.neutral;
  const slow = n && (n.type === 'vsc' || n.type === 'sc') ? 0.6 : 1;
  let lane = 0;
  const from = tr.pit.entry, len = ((tr.pit.exit - tr.pit.entry) % tr.L + tr.L) % tr.L;
  for (let s = 0; s < len; s += tr.ds) {
    const v = Math.max(5, tr.v[Math.floor((((from + s) % tr.L) + tr.L) % tr.L / tr.ds) % tr.N]);
    lane += tr.ds / tr.pitLaneSpeed - tr.ds / (v * slow);
  }
  const crew = car ? car.team.pitCrew : 85;
  return Math.max(4, lane + 3.7 + (100 - crew) * 0.03);   // inkl. Bremsen/Beschleunigen ~1,5 s
}

// Wo kommt das Auto nach einem Stopp jetzt wieder heraus?
export function rejoin(race, car) {
  const loss = pitLoss(race, car);
  const Tl = lapTime(race.track);
  const ghost = timeOf(race, car) - loss;
  const others = race.cars.filter(o => o !== car && !o.retired && !o.finished);
  let pos = 1;
  let ahead = null, behind = null;
  for (const o of others) {
    const t = timeOf(race, o);
    if (t > ghost) pos++;
    let diff = (t - ghost) % Tl;
    if (diff > Tl / 2) diff -= Tl;
    if (diff < -Tl / 2) diff += Tl;
    if (diff >= 0 && (!ahead || diff < ahead.gap)) ahead = { car: o, gap: diff };
    if (diff < 0 && (!behind || -diff < behind.gap)) behind = { car: o, gap: -diff };
  }
  return { loss, pos, ahead, behind, ghostT: ghost, ghostD: dAtTime(race.track, ghost), free: (!ahead || ahead.gap > 1.5) };
}

// Winkel (0 … 2π) auf dem Zeit-Kreis
export function circleAngle(race, t) {
  const Tl = lapTime(race.track);
  return (((t % Tl) + Tl) % Tl) / Tl * Math.PI * 2;
}

// ---------- Rennstrategen ----------
// Bewertet Stopp-Kombinationen mit dem Reifenmodell der Simulation und schlägt zwei Varianten vor (A und B).
// wk (optional): Rennwochenende mit Reifenkontingent – gebrauchte Sätze starten mit ihrem Verschleiß
export function strategyOptions(race, car, wk = null) {
  const laps = race.laps;
  const w = race.wear || 1;
  const loss = pitLoss(race, car);
  const who = (wk && wk.strategist) || STRATEGISTS[car.team.id] || 'Strategie';   // Saison: eingestellter Strategiechef
  const wx = race.weather;
  if (wx.wetness > 0.2) {
    const wet = wx.wetness > 0.65 ? 'W' : 'I';
    const alt = wet === 'W' ? 'I' : 'W';
    return [
      { key: 'A', start: wet, stops: [], name: `${COMPOUNDS[wet].name}, Wechsel nach Wetter`, note: `${who}: Wir starten auf ${COMPOUNDS[wet].name} und reagieren auf die Strecke. Auf Slicks erst, wenn die Ideallinie trocknet.` },
      { key: 'B', start: alt, stops: [], name: `${COMPOUNDS[alt].name}, Wechsel nach Wetter`, note: `${who}: Riskanter – ${alt === 'I' ? 'Intermediates bringen mehr Tempo, falls der Regen nachlässt' : 'Regenreifen sind sicherer, falls es noch mehr regnet'}.` },
    ];
  }
  const stint = (id, n, age0 = 0) => {
    let t = 0;
    for (let a = 0; a < n; a++) { const age = age0 + a * w; t += tyreLoss(id, age) + (age > COMPOUNDS[id].cliff * 0.95 ? 0.8 : 0); }   // Klippe meiden (Risiko)
    return t + (age0 > 0.5 ? 0 : COMPOUNDS[id].warm || 0);
  };
  // Verschleiß der Sätze, die für ein Muster genommen würden (bester zuerst, jeder Satz nur einmal)
  const ages = pat => {
    if (!wk || !wk.sets[car.id]) return pat.map(() => 0);
    const taken = new Set();
    return pat.map(c => {
      const st = wk.sets[car.id].filter(x => x.c === c && !taken.has(x)).sort((a, b) => a.laps - b.laps)[0];
      if (!st) return 99;
      taken.add(st);
      return st.laps;
    });
  };
  if (race.kind === 'sprint') {
    // Sprint: ohne Pflichtstopp – Soft oder Medium durchfahren
    const opts = ['M', 'S', 'H'].map(c => ({ c, t: stint(c, laps, ages([c])[0]) })).sort((a, b) => a.t - b.t);
    const mkS = (o, key) => ({ key, start: o.c, stops: [], delta: o.t - opts[0].t, name: `Ohne Stopp: ${COMPOUNDS[o.c].name}${ages([o.c])[0] > 0.5 ? ' (gebraucht)' : ''}`,
      note: key === 'A' ? `${who}: ${COMPOUNDS[o.c].name} hält die ${laps} Runden am besten.` : `${who}: ${COMPOUNDS[o.c].name} – rund ${fmt(o.t - opts[0].t)} s langsamer gerechnet${o.c === 'S' ? ', aber mehr Grip in den ersten Runden' : ''}.` });
    return [mkS(opts[0], 'A'), mkS(opts[1], 'B')];
  }
  const cands = [];
  const PAT = [['M', 'H'], ['H', 'M'], ['S', 'H'], ['S', 'M'], ['M', 'S'], ['H', 'S'],
    ['S', 'M', 'H'], ['S', 'H', 'M'], ['M', 'H', 'S'], ['S', 'H', 'S'], ['M', 'M', 'S'], ['H', 'M', 'S'], ['S', 'M', 'S']];
  for (const p of PAT) {
    let best = null;
    const g = ages(p);
    if (g.includes(99)) continue;   // nicht genug Sätze dieser Mischung
    if (p.length === 2) {
      for (let a = 3; a <= laps - 3; a++) {
        const t = stint(p[0], a, g[0]) + stint(p[1], laps - a, g[1]) + loss;
        if (!best || t < best.t) best = { t, laps: [a] };
      }
    } else {
      for (let a = 3; a <= laps - 6; a++) for (let b = a + 3; b <= laps - 3; b++) {
        const t = stint(p[0], a, g[0]) + stint(p[1], b - a, g[1]) + stint(p[2], laps - b, g[2]) + 2 * loss;
        if (!best || t < best.t) best = { t, laps: [a, b] };
      }
    }
    if (best) cands.push({ pat: p, ...best, ages: g });
  }
  cands.sort((x, y) => x.t - y.t);
  const A = cands[0];
  // B: andere Stoppzahl, wenn nicht viel langsamer – sonst andere Reihenfolge der Mischungen
  const B = cands.find(c => c.pat.length !== A.pat.length && c.t - A.t < 20) || cands.find(c => c.pat[0] !== A.pat[0]) || cands[1];
  const mk = (c, key) => {
    const stops = c.laps.map((lap, i) => ({ lap, compound: c.pat[i + 1] }));
    const n = stops.length;
    const desc = [COMPOUNDS[c.pat[0]].name, ...stops.map(s => `${COMPOUNDS[s.compound].name} (R${s.lap})`)].join(' → ');
    const d = c.t - A.t;
    let note;
    if (key === 'A') note = `${who}: Auf dem Papier die schnellste Variante.${n === 1 ? ' Ein Stopp hält die Track Position.' : ' Zwei Stopps, dafür immer gute Reifen.'}`;
    else note = `${who}: Rund ${fmt(d)} s langsamer gerechnet${n > A.laps.length ? ', aber flexibel bei Safety Car und gut für den Undercut' : n < A.laps.length ? ', dafür ein Stopp weniger und weniger Verkehrsrisiko' : ', andere Startmischung als Alternative'}.`;
    if (c.pat[0] === 'S' && car.gridPos > 10) note += ' Softs helfen beim Start aus dem Mittelfeld.';
    if (c.ages && c.ages.some(x => x > 0.5)) note += ` Gebrauchte Sätze: ${c.pat.map((k, i) => (c.ages[i] > 0.5 ? `${k} (${Math.round(c.ages[i])} Rd)` : null)).filter(Boolean).join(', ')}.`;
    if (wx.showers.length) note += ' Achtung: Regen ist möglich – Plan kann sich ändern.';
    return { key, start: c.pat[0], stops, name: `${n} Stopp${n > 1 ? 's' : ''}: ${desc}`, note, delta: d };
  };
  return [mk(A, 'A'), mk(B, 'B')];
}

// Eigene/angepasste Strategie bewerten: gerechnete Zeit (wie bei den Vorschlägen) und Warnungen
export function planTime(race, car, wk, s) {
  const laps = race.laps, w = race.wear || 1, loss = pitLoss(race, car);
  const stops = [...s.stops].sort((a, b) => a.lap - b.lap);
  const pat = [s.start, ...stops.map(x => x.compound)];
  const ends = [...stops.map(x => x.lap), laps];
  const warn = [];
  const taken = new Set();
  const stints = [];   // je Stint: Mischung, Runden, Satz (neu / gebrauchte Runden), Reifenzustand am Ende in %
  let t = 0, from = 0;
  pat.forEach((c, i) => {
    const n = ends[i] - from;
    let age0 = 0, setLaps = 0;
    if (wk && wk.sets[car.id]) {
      // immer der frischeste Satz: neu, sonst der mit den wenigsten Runden
      const st = wk.sets[car.id].filter(x => x.c === c && !taken.has(x)).sort((a, b) => a.laps - b.laps)[0];
      if (st) { taken.add(st); age0 = st.laps; setLaps = st.lapCount ?? Math.round(st.laps); } else warn.push(`Kein Satz ${COMPOUNDS[c].name} mehr im Kontingent.`);
    }
    stints.push({ c, n, used: age0 > 0.05, setLaps, life: Math.max(0, Math.round(100 - (age0 + n * w) / COMPOUNDS[c].cliff * 100)) });
    if (n < 1) warn.push(`Stint ${i + 1} ist zu kurz.`);
    for (let a = 0; a < n; a++) { const age = age0 + a * w; t += tyreLoss(c, age) + (age > COMPOUNDS[c].cliff * 0.95 ? 0.8 : 0); }
    if (!COMPOUNDS[c].wet && age0 + n * w > COMPOUNDS[c].cliff) warn.push(`${COMPOUNDS[c].name} in Stint ${i + 1}: ${n} Runden – über der Verschleißgrenze (~${Math.round(Math.max(1, COMPOUNDS[c].cliff - age0) / w)} Rd).`);
    if (age0 < 0.5) t += COMPOUNDS[c].warm || 0;
    from = ends[i];
  });
  t += stops.length * loss;
  const dry = pat.filter(c => !COMPOUNDS[c].wet);
  if (race.kind !== 'sprint' && race.weather.wetness < 0.2 && pat.every(c => !COMPOUNDS[c].wet) && new Set(dry).size < 2) warn.push('Regel: Im Rennen müssen zwei verschiedene Trockenmischungen gefahren werden.');
  return { t, warn, stints };
}

export function applyStrategy(race, car, s) {
  car.compound = s.start;
  car.usedCompounds = new Set([s.start]);
  car.stintLog = [];
  if (race.onPlayerTyres) { car.curSet = null; race.onPlayerTyres(car); }   // Startsatz aus dem Kontingent
  car.plan = s.stops.map(x => ({ ...x }));
  car.planIdx = 0;
  car.advice = s.stops.map(x => ({ ...x }));
  car.strategy = s.key;
}

// Ratschlag der Strategen für den nächsten Stopp (aus der gewählten Strategie)
export function adviceFor(race, car) {
  return (car.advice || []).find(p => p.lap > car.lap) || null;
}

// Zeitgewinn pro Runde durch frische Reifen (für Undercut-Hinweise)
export function freshGain(race, car, compound) {
  const w = race.wear || 1;
  return tyreLoss(car.compound, wearOf(race, car)) - tyreLoss(compound, 1.5 * w);
}

export { fmt };

// Rote Flagge: Auto steht in der Boxengasse – Reifen frei wechseln (oder behalten)
export function redTyres(race, car, compound) {
  if (!car.redQueued || !race.neutral || race.neutral.type !== 'red') return false;
  if (compound === 'keep') { car.redTyre = 'keep'; return true; }
  if (!COMPOUNDS[compound]) return false;
  const from = car.redTyre && car.redTyre !== 'keep' ? car.redFrom : car.compound;
  car.redFrom = from;
  car.redTyre = compound;
  car.compound = compound;
  car.tyreAge = 0; car.tyreWear = 0;
  if (race.onPlayerTyres) race.onPlayerTyres(car);
  car.usedCompounds.add(compound);
  // Geplanten Stopp auf genau diese Mischung streichen – er ist damit erledigt
  const n = nextStop(car);
  if (n && n.compound === compound) car.plan.splice(car.planIdx, 1);
  car.boxCall = null;
  race.emit('pit', `${car.id} wechselt unter Rot auf ${COMPOUNDS[compound].name}.`, { cars: [car.id] });
  return true;
}
