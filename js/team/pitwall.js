// Pit Wall: Befehle des Teamchefs an seine beiden Fahrer.
// Die Simulation (race.js) liest nur car.paceMode, car.boxCall und car.plan – alles andere passiert hier.
import { COMPOUNDS } from '../sim/tyres.js';

// Tempo-Anweisung: dt = Rundenzeit (s), wear = Reifenverschleiß je Runde, risk = Fehler/Aggressivität
export const PACE = {
  save:   { id: 'save',   name: 'Reifen schonen', short: 'SCHONEN', dt: 0.45,  wear: 0.72, risk: 0.8 },
  normal: { id: 'normal', name: 'Normal',         short: 'NORMAL',  dt: 0,     wear: 1.0,  risk: 1.0 },
  push:   { id: 'push',   name: 'Pushen',         short: 'PUSH',    dt: -0.28, wear: 1.3,  risk: 1.15 },
  attack: { id: 'attack', name: 'Attacke',        short: 'ATTACKE', dt: -0.55, wear: 1.75, risk: 1.4 },
};
export const PACE_ORDER = ['save', 'normal', 'push', 'attack'];
export const paceOf = car => (car && car.player && PACE[car.paceMode]) || PACE.normal;

export function playerCars(race) {
  return race.cars.filter(c => c.player);
}

const name = c => `${c.driver.first} ${c.driver.last}`;
const radio = (race, car, text) => race.emit('radio', `Teamfunk ${car.team.name} an ${car.id}: „${text}“`, { cars: [car.id], own: true });

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

// Box ansagen: der Fahrer kommt beim nächsten Überfahren der Boxeneinfahrt rein
export function callBox(race, car, compound) {
  if (!COMPOUNDS[compound] || car.retired || car.finished) return false;
  // Boxeneinfahrt schon zu nah: der Fahrer schafft es erst in der nächsten Runde
  const lap = tooLateForBox(race, car) ? car.lap + 2 : 0;
  car.boxCall = { compound, at: race.time, lap };
  car.plan = [{ lap, compound }];
  car.planIdx = 0;
  radio(race, car, `Box, box! Wir gehen auf ${COMPOUNDS[compound].name}.`);
  return true;
}

export function cancelBox(race, car) {
  if (!car.boxCall || car.inPit) return false;
  car.boxCall = null;
  car.plan = [];
  car.planIdx = 0;
  radio(race, car, 'Bleib draußen, bleib draußen!');
  return true;
}

// Liegt die Boxeneinfahrt so knapp vor dem Auto, dass der Fahrer nicht mehr reagieren kann?
export function tooLateForBox(race, car) {
  const tr = race.track;
  const toEntry = ((tr.pit.entry - (car.d % tr.L)) % tr.L + tr.L) % tr.L;
  return toEntry < 150;
}

// Reifenzustand 0–100 % (100 = neu); an der „Klippe“ etwa 15 %
export function tyreLife(race, car) {
  const C = COMPOUNDS[car.compound];
  const age = (car.tyreAge > 0 ? car.tyreWear : 0) * (race.wear || 1);
  return Math.max(0, Math.round(100 * (1 - 0.85 * age / C.cliff)));
}

// Hinweis der Strategen für den nächsten Stopp (Runde, Mischung)
export function adviceFor(race, car) {
  const a = (car.advice || []).find(p => p.lap > car.lap);
  return a || null;
}

export { name as driverName };
