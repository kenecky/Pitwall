// Pit Wall – Fahrzeug-Setup im Training: Flügel, Balance, Federung.
// Jede Strecke hat ein (verstecktes) Optimum. Abweichungen kosten Rundenzeit und Reifen.
// Die Fahrer geben nach jeder Ausfahrt Rückmeldung – mehr oder weniger genau.
import { isStraight } from '../sim/energy.js';

export const SETUP_KEYS = {
  wing:  { name: 'Flügel',  min: 1, max: 11, lo: 'wenig Abtrieb', hi: 'viel Abtrieb' },
  bal:   { name: 'Balance', min: -5, max: 5, lo: 'Untersteuern', hi: 'Übersteuern' },
  stiff: { name: 'Federung', min: 1, max: 9, lo: 'weich', hi: 'hart' },
};
export const BASE_SETUP = { wing: 6, bal: 0, stiff: 5 };

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}

// Optimum je Strecke: Flügel aus dem Anteil schneller Geraden, Balance/Federung je Strecke fest (aus der ID)
export function optimum(track) {
  if (track._pwOpt) return track._pwOpt;
  let fast = 0;
  for (let i = 0; i < track.N; i += 4) if (isStraight(track, i * track.ds)) fast++;
  const share = fast / Math.ceil(track.N / 4);            // ~0,3 (Monaco) … ~0,75 (Monza)
  const wing = Math.max(1, Math.min(11, Math.round(10 - (share - 0.2) / 0.4 * 8)));   // Monaco ~10, Monza ~2
  const id = track.def.id;
  const bal = Math.round(hash(id + 'b') * 4 - 2);         // −2 … +2
  const stiff = Math.round(2 + hash(id + 's') * 6);         // 2 … 8
  track._pwOpt = { wing, bal, stiff };
  return track._pwOpt;
}

// Wirkung: Rundenzeit (s) und Reifenverschleiß-Faktor
export function setupEffect(track, s, wet = 0) {
  const o = optimum(track);
  const ow = Math.min(11, o.wing + Math.round(wet * 3));  // im Nassen hilft mehr Flügel
  const dw = s.wing - ow, db = s.bal - o.bal, ds = s.stiff - o.stiff;
  const dt = Math.min(1.4, 0.03 * dw * dw + 0.025 * db * db + 0.014 * ds * ds);
  const wear = 1 + 0.035 * Math.abs(db) + 0.02 * Math.abs(ds) + (dw < 0 ? 0.015 * -dw : 0);
  return { dt, wear, dw, db, ds };
}

// Note 0–100 % fürs Setup (100 = perfekt)
export function setupScore(track, s) {
  return Math.round(100 * Math.max(0, 1 - setupEffect(track, s).dt / 0.9));
}

// Rückmeldung des Fahrers nach einer Ausfahrt. accuracy 0…1 (erfahren/konstant = genauer), r = Zufall 0…1
export function feedback(track, s, driver, r) {
  const e = setupEffect(track, s);
  const acc = Math.min(1, Math.max(0.3, (driver.consistency - 55) / 40));
  // Wahrnehmung mit Rauschen: ungenaue Fahrer verwechseln Ursachen öfter
  const noise = k => (hash(`${r}${k}`) - 0.5) * 2 * (1 - acc) * 2.2;
  const items = [
    { k: 'wing', v: e.dw + noise('w'), w: 0.03 },
    { k: 'bal', v: e.db + noise('b'), w: 0.025 },
    { k: 'stiff', v: e.ds + noise('s'), w: 0.014 },
  ].map(x => ({ ...x, cost: x.w * x.v * x.v })).sort((a, b) => b.cost - a.cost);
  const top = items[0];
  if (top.cost < 0.03) return { text: 'Das Auto fühlt sich richtig gut an. Daran würde ich nichts mehr ändern.', key: null };
  const strong = Math.abs(top.v) > 2.5;
  const T = {
    wing: top.v > 0
      ? [`Auf den Geraden fehlt Topspeed${strong ? ', viel zu viel Flügel' : ''}.`, 'Wir sind auf den Geraden zu langsam, weniger Flügel?']
      : [`In den schnellen Kurven fehlt Abtrieb${strong ? ', das Heck ist sehr nervös' : ''}.`, 'Mehr Flügel bitte, ich habe kein Vertrauen in schnellen Kurven.'],
    bal: top.v > 0
      ? [`Das Auto übersteuert am Kurvenausgang${strong ? ', das Heck kommt ständig' : ''}.`, 'Hinten zu wenig Grip, es übersteuert.']
      : [`Untersteuern beim Einlenken${strong ? ', die Front schiebt nur' : ''}.`, 'Die Vorderachse greift nicht, es untersteuert.'],
    stiff: top.v > 0
      ? ['Zu hart – über die Randsteine springt das Auto.', 'Die Federung ist zu hart, es ist sehr unruhig über Bodenwellen.']
      : ['Zu weich – das Auto wankt in den Richtungswechseln.', 'Zu viel Bewegung im Auto, etwas härter wäre besser.'],
  };
  const list = T[top.k];
  return { text: list[Math.floor(hash(`${r}t`) * list.length)], key: top.k, dir: Math.sign(top.v) };
}

// KI-Teams: Setup-Verlust je Team (fest für das Wochenende, aus Seed und Team)
export function aiSetupDt(seed, teamId) {
  return 0.08 + hash(`${seed}${teamId}`) * 0.3;
}
