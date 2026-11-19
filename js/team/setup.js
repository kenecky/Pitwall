// Pit Wall – Fahrzeug-Setup im Training: sechs Einstellungen, getrennte Optima für trockene und nasse Strecke.
// Jede Strecke hat ein (verstecktes) Optimum. Abweichungen kosten Rundenzeit und Reifen.
// Bei Nässe zählt das Regen-Optimum: Ein Regen-Setup ist im Nassen schnell, im Trockenen langsam – und umgekehrt.
// Die Fahrer geben nach jeder Ausfahrt Rückmeldung zu den aktuellen Bedingungen – mehr oder weniger genau,
// und sie beschreiben Symptome, nicht die Ursache (Untersteuern kann z. B. vom Frontflügel, der Bremsbalance
// oder dem Differenzial kommen).
import { isStraight } from '../sim/energy.js';

export const SETUP_KEYS = {
  fwing:  { name: 'Frontflügel', short: 'FF', min: 1, max: 11, lo: 'wenig', hi: 'viel', w: 0.02 },
  rwing:  { name: 'Heckflügel',  short: 'HF', min: 1, max: 11, lo: 'wenig', hi: 'viel', w: 0.022 },
  height: { name: 'Bodenfreiheit', short: 'BF', min: 1, max: 9, lo: 'tief', hi: 'hoch', w: 0.02 },
  stiff:  { name: 'Federung',    short: 'FE', min: 1, max: 9, lo: 'weich', hi: 'hart', w: 0.013 },
  diff:   { name: 'Differenzial', short: 'DI', min: 1, max: 9, lo: 'offen', hi: 'gesperrt', w: 0.011 },
  brake:  { name: 'Bremsbalance', short: 'BB', min: 1, max: 9, lo: 'hinten', hi: 'vorne', w: 0.012 },
};
export const BASE_SETUP = { fwing: 6, rwing: 6, height: 5, stiff: 5, diff: 5, brake: 5 };
// Erfahrungswerte der Ingenieure: so verschiebt sich das Optimum bei Regen (ungefähr)
export const WET_SHIFT = { fwing: 3, rwing: 3, height: 2, stiff: -3, diff: -2, brake: -1 };

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}
const clampK = (k, v) => Math.max(SETUP_KEYS[k].min, Math.min(SETUP_KEYS[k].max, v));

// Alte Spielstände (Flügel/Balance/Federung) auf die neuen Einstellungen umstellen
export function migrateSetup(s) {
  if (!s) return { ...BASE_SETUP };
  if (s.wing !== undefined && s.rwing === undefined) {
    const out = { ...BASE_SETUP, rwing: s.wing, fwing: clampK('fwing', s.wing - Math.round((s.bal || 0) / 2)), stiff: s.stiff ?? 5 };
    return out;
  }
  for (const k of Object.keys(BASE_SETUP)) if (s[k] === undefined) s[k] = BASE_SETUP[k];
  for (const k of Object.keys(s)) if (!SETUP_KEYS[k]) delete s[k];
  return s;
}

// Start-Setup aus dem Simulator der Ingenieure: nahe am Trocken-Optimum, je Einstellung bis ±3 daneben
export function startSetup(track, seed, carId) {
  const o = optimum(track), out = {};
  for (const k of Object.keys(SETUP_KEYS)) out[k] = clampK(k, o[k] + Math.round(hash(`${seed}${carId}${k}st`) * 6 - 3));
  return out;
}

// Optimum je Strecke: Heckflügel aus dem Anteil schneller Geraden, die anderen Werte je Strecke fest (aus der ID).
// wet: Optimum bei nasser Strecke (verschoben, mit kleinen Abweichungen je Strecke)
export function optimum(track, wet = false) {
  const key = wet ? '_pwOptW' : '_pwOpt';
  if (track[key]) return track[key];
  let fast = 0;
  for (let i = 0; i < track.N; i += 4) if (isStraight(track, i * track.ds)) fast++;
  const share = fast / Math.ceil(track.N / 4);            // ~0,3 (Monaco) … ~0,75 (Monza)
  const id = track.def.id;
  const rwing = Math.max(1, Math.min(11, Math.round(10 - (share - 0.2) / 0.4 * 8)));   // Monaco ~10, Monza ~2
  const dry = {
    rwing,
    fwing: clampK('fwing', rwing + Math.round(hash(id + 'fb') * 4 - 2)),
    height: Math.round(3 + hash(id + 'h') * 4),
    stiff: Math.round(2 + hash(id + 's') * 6),
    diff: Math.round(3 + hash(id + 'd') * 4),
    brake: Math.round(3 + hash(id + 'bb') * 4),
  };
  track._pwOpt = dry;
  const w = {};
  for (const k of Object.keys(dry)) w[k] = clampK(k, dry[k] + WET_SHIFT[k] + Math.round(hash(id + k + 'w') * 2 - 1));
  track._pwOptW = w;
  return wet ? w : dry;
}

// Fahrstil: Jeder Fahrer mag sein Auto etwas anders – das verschiebt sein persönliches Optimum.
// u < 0: mag Untersteuern (stabiles Heck), u > 0: mag Übersteuern (spitze Front)
export function driverPref(id) {
  if (!id) return { u: 0, st: 0, off: {} };
  const u = hash(id + 'style') * 2 - 1, st = Math.round((hash(id + 'stiffpref') - 0.5) * 2.4);
  const off = { fwing: Math.round(u * 1.6), brake: -Math.round(u * 1.4), diff: -Math.round(u * 1.2), stiff: st };
  return { u, st, off };
}
export function driverStyleText(id) {
  const p = driverPref(id);
  const a = p.u < -0.33 ? 'mag ein stabiles Heck und leichtes Untersteuern' : p.u > 0.33 ? 'mag eine spitze Front und leichtes Übersteuern' : 'fährt am liebsten neutral';
  const b = p.st > 0 ? ', eher hart abgestimmt' : p.st < 0 ? ', eher weich abgestimmt' : '';
  return a + b;
}
function optFor(track, wet, driverId) {
  const o = optimum(track, wet);
  if (!driverId) return o;
  const off = driverPref(driverId).off, out = {};
  for (const k of Object.keys(o)) out[k] = clampK(k, o[k] + (off[k] || 0));
  return out;
}

// Zeitverlust einer Einstellung gegenüber einem Optimum
function lossVs(o, s) {
  let dt = 0;
  const d = {};
  for (const [k, def] of Object.entries(SETUP_KEYS)) { d[k] = (s[k] ?? BASE_SETUP[k]) - o[k]; dt += def.w * d[k] * d[k]; }
  // Aero-Balance: Front- gegen Heckflügel falsch verteilt kostet zusätzlich
  const bal = d.fwing - d.rwing;
  dt += 0.008 * bal * bal;
  return { dt: Math.min(1.6, dt), d, bal };
}

// Wirkung: Rundenzeit (s) und Reifenverschleiß-Faktor bei Nässe wet (0 = trocken … 1 = nass)
export function setupEffect(track, s, wet = 0, driverId = null) {
  const w = Math.max(0, Math.min(1, wet));
  const dry = lossVs(optFor(track, false, driverId), s), rain = lossVs(optFor(track, true, driverId), s);
  const dt = (1 - w) * dry.dt + w * rain.dt;
  const x = w > 0.5 ? rain : dry;
  const wear = 1 + 0.03 * Math.abs(x.bal) + 0.02 * Math.abs(x.d.stiff) + 0.015 * Math.abs(x.d.diff) + (x.d.rwing < 0 ? 0.012 * -x.d.rwing : 0);
  return { dt, wear, dryDt: dry.dt, wetDt: rain.dt, d: x.d, bal: x.bal };
}

// Note 0–100 % fürs Setup (100 = perfekt) – trocken bzw. nass
export function setupScore(track, s, wet = 0, driverId = null) {
  return Math.round(100 * Math.max(0, 1 - setupEffect(track, s, wet, driverId).dt / 1.1));
}

// Rückmeldung des Fahrers nach einer Ausfahrt bei Nässe wet. r = Zufall
export function feedback(track, s, driver, r, wet = 0) {
  const e = setupEffect(track, s, wet, driver.id);
  const acc = Math.min(1, Math.max(0.25, (driver.consistency - 55) / 40));
  // Wahrnehmung mit Rauschen: ungenaue Fahrer verwechseln Ursachen öfter
  const noise = k => (hash(`${r}${k}`) - 0.5) * 2 * (1 - acc) * 2.6;
  const items = Object.entries(SETUP_KEYS).map(([k, def]) => {
    const v = e.d[k] + noise(k);
    return { k, v, cost: def.w * v * v };
  }).sort((a, b) => b.cost - a.cost);
  const top = items[0];
  const cond = wet > 0.5 ? 'Im Nassen: ' : '';
  if (top.cost < 0.02 && Math.abs(e.bal) < 2) return { text: `${cond}Das Auto fühlt sich richtig gut an. Daran würde ich nichts mehr ändern.`, key: null };
  const strong = Math.abs(top.v) > 2.5;
  const pick = list => list[Math.floor(hash(`${r}t`) * list.length)];
  // Symptome statt Ursachen – mehrere Einstellungen erzeugen ähnliche Symptome
  const T = {
    fwing: top.v > 0
      ? ['Die Front ist sehr spitz, das Heck wird beim Einlenken leicht.', `Übersteuern am Kurveneingang${strong ? ', deutlich' : ''}.`]
      : [`Untersteuern in schnellen Kurven${strong ? ', die Front schiebt stark' : ''}.`, 'Vorne fehlt Grip, das Auto will nicht einlenken.'],
    rwing: top.v > 0
      ? [`Auf den Geraden fehlt Topspeed${strong ? ', viel zu viel Abtrieb' : ''}.`, 'Wir verlieren auf den Geraden.']
      : [`Das Heck ist nervös in schnellen Kurven${strong ? ', kaum Vertrauen' : ''}.`, 'Hinten fehlt Abtrieb bei hohem Tempo.'],
    height: top.v > 0
      ? ['Das Auto fühlt sich träge an, es liegt nicht satt auf der Straße.', 'Zu wenig Grip in den schnellen Passagen, als ob der Unterboden nicht arbeitet.']
      : [`Das Auto setzt auf${strong ? ', über die Bodenwellen ganz übel' : ''}.`, 'Über die Randsteine schlägt der Unterboden auf.'],
    stiff: top.v > 0
      ? ['Über die Randsteine springt das Auto.', 'Sehr unruhig über Bodenwellen, die Reifen verlieren Kontakt.']
      : ['Das Auto wankt in den Richtungswechseln.', 'Zu viel Bewegung im Auto, es reagiert träge.'],
    diff: top.v > 0
      ? ['Untersteuern am Kurvenausgang, wenn ich aufs Gas gehe.', 'Das Auto schiebt beim Rausbeschleunigen über die Vorderräder.']
      : [`Beim Rausbeschleunigen dreht das innere Rad durch${strong ? ', das Heck kommt' : ''}.`, 'Wenig Traktion am Kurvenausgang.'],
    brake: top.v > 0
      ? ['Beim Anbremsen blockiert vorne, dann untersteuert es.', 'Die Vorderräder blockieren in den Bremszonen.']
      : [`Das Heck wird beim Bremsen instabil${strong ? ', fast ein Dreher' : ''}.`, 'Die Hinterräder blockieren beim Anbremsen.'],
  };
  return { text: cond + pick(T[top.k]), key: top.k, dir: Math.sign(top.v) };
}

// KI-Teams: Setup-Verlust je Team (fest für das Wochenende, aus Seed und Team); Top-Teams treffen es besser,
// bei Nässe meist etwas mehr Verlust
export function aiSetupDt(seed, teamId, wet = 0, teamPace = 85) {
  const skill = Math.max(0.55, Math.min(1.1, 1 - (teamPace - 85) / 30));   // Pace 96 → 0,63 · 66 → 1,1
  return (0.03 + hash(`${seed}${teamId}`) * 0.2) * skill + Math.max(0, Math.min(1, wet)) * (0.04 + hash(`${seed}${teamId}w`) * 0.3) * skill;
}
