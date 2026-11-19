// Pit Wall – Fahrermarkt der Saison: Kader, Verträge mit Laufzeit, Alter und Entwicklung, Nachwuchs, ehemalige Fahrer.
// Am Saisonende: Verträge laufen aus, KI-Teams verlängern oder holen neue Fahrer, junge Fahrer werden besser,
// ältere langsamer, manche hören auf. Der Teamchef verlängert eigene Verträge oder verpflichtet Fahrer für die
// nächste Saison (nur Fahrer ohne Vertrag ab dann: Nachwuchs, ehemalige, auslaufende Verträge anderer Teams).
// Die Fahrerliste (DRIVERS) wird für die Saison angepasst (applyRoster) und im Einzelrennen zurückgesetzt.
import { DRIVERS } from '../data/drivers.js';

const DEFAULT = DRIVERS.map(d => ({ ...d }));
const DEFAULT_IDS = new Set(DEFAULT.map(d => d.id));
const STAT_KEYS = ['pace', 'consistency', 'aggression', 'wet', 'errors'];
export const AGE_2026 = { NOR: 26, PIA: 25, LEC: 28, HAM: 41, VER: 28, HAD: 21, RUS: 28, ANT: 19, ALO: 44, STR: 27, GAS: 30, COL: 22,
  ALB: 29, SAI: 31, LAW: 24, LIN: 18, OCO: 29, BEA: 20, HUL: 38, BOR: 21, PER: 36, BOT: 36 };
// Ehemalige Fahrer ohne Cockpit (Werte geschätzt)
const FORMER = [
  { id: 'TSU', number: 22, first: 'Yuki', last: 'Tsunoda', age: 26, pace: 85, consistency: 80, aggression: 74, wet: 80, errors: 30 },
  { id: 'ZHO', number: 24, first: 'Guanyu', last: 'Zhou', age: 27, pace: 80, consistency: 84, aggression: 58, wet: 78, errors: 26 },
  { id: 'MAG', number: 20, first: 'Kevin', last: 'Magnussen', age: 34, pace: 81, consistency: 80, aggression: 84, wet: 82, errors: 34 },
  { id: 'DOO', number: 7, first: 'Jack', last: 'Doohan', age: 23, pace: 78, consistency: 74, aggression: 70, wet: 74, errors: 42 },
  { id: 'RIC', number: 9, first: 'Daniel', last: 'Ricciardo', age: 37, pace: 81, consistency: 82, aggression: 70, wet: 82, errors: 26 },
  { id: 'DRU', number: 34, first: 'Felipe', last: 'Drugovich', age: 26, pace: 80, consistency: 80, aggression: 66, wet: 78, errors: 30 },
];
// Fiktive Namen für den Nachwuchs
const JFIRST = ['Mateo', 'Luca', 'Noah', 'Elias', 'Theo', 'Rafael', 'Kai', 'Milo', 'Jonas', 'Leon', 'Tiago', 'Aron', 'Sami', 'Nils', 'Oskar', 'Ruben', 'Emil', 'Davi'];
const JLAST = ['Ferrand', 'Okoro', 'Lindgren', 'Castellano', 'Brandt', 'Mäkelä', 'Duval', 'Hoshino', 'Varela', 'Sørensen', 'Kowalski', 'Ricci', 'Moreau', 'Achterberg', 'Novak', 'Pereira', 'Haas', 'Iwata'];

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const ageOf = (season, d) => (d.age0 ?? AGE_2026[d.id] ?? 25) + (season.year - (d.ageYear ?? 2026));
// Gehaltsforderung (Mio. $/Jahr) nach Tempo und Alter
export function salaryDemand(d) { return Math.round((1 + Math.max(0, d.pace - 70) * 0.75 + (d.pace >= 92 ? (d.pace - 91) * 3 : 0)) * 10) / 10; }

// ---------- Zustand anlegen (auch für alte Spielstände) ----------
export function initDrivers(season) {
  if (season.drv) return season.drv;
  const roster = {}, contracts = {};
  for (const d of DEFAULT) {
    roster[d.id] = d.team;
    const until = season.year + Math.round(hash(`${d.id}contract`) * 2);   // 2026–2028
    contracts[d.id] = { until, salary: salaryDemand(d) };
  }
  const extra = FORMER.map(f => ({ ...f, age0: f.age, ageYear: 2026, team: null }));
  for (const f of FORMER) roster[f.id] = null;
  season.drv = { roster, contracts, extra, stats: {}, retired: [], signings: {}, academy: [], log: [] };
  addJuniors(season, 4);
  return season.drv;
}

// Nachwuchs: junge Fahrer mit Potenzial (Akademie des Teamchefs: bessere und nur für ihn)
export function addJuniors(season, n, academyLvl = 0) {
  const D = season.drv;
  const used = new Set([...DEFAULT.map(d => d.number), ...D.extra.map(d => d.number)]);
  const names = new Set([...DEFAULT, ...D.extra].map(d => `${d.first} ${d.last}`));
  for (let i = 0; i < n; i++) {
    const seed = `${season.year}j${i}${D.extra.length}`;
    const academy = i < academyLvl;   // je Akademie-Stufe ein eigener Junior
    let number = 2 + Math.floor(hash(seed + 'n') * 97);
    while (used.has(number)) number = (number % 98) + 2;
    used.add(number);
    const pace = Math.round(72 + hash(seed + 'p') * 10 + (academy ? 2 + academyLvl * 1.5 : 0));
    let fi = Math.floor(hash(seed + 'f') * JFIRST.length), li = Math.floor(hash(seed + 'l') * JLAST.length);
    for (let k = 0; k < 40 && names.has(`${JFIRST[fi]} ${JLAST[li]}`); k++) { li = (li + 1) % JLAST.length; if (k % JLAST.length === JLAST.length - 1) fi = (fi + 1) % JFIRST.length; }
    names.add(`${JFIRST[fi]} ${JLAST[li]}`);
    const d = {
      id: `J${season.year % 100}${String.fromCharCode(65 + (D.extra.length % 26))}${i}`, number,
      first: JFIRST[fi], last: JLAST[li],
      age0: 18 + Math.floor(hash(seed + 'a') * 3), ageYear: season.year, team: null, junior: true, academy,
      pace, consistency: Math.round(68 + hash(seed + 'c') * 14), aggression: Math.round(60 + hash(seed + 'g') * 25),
      wet: Math.round(68 + hash(seed + 'w') * 16), errors: Math.round(32 + hash(seed + 'e') * 16),
      potential: Math.round(pace + 6 + hash(seed + 'pot') * 10),
    };
    D.extra.push(d);
    D.roster[d.id] = null;
    if (academy) D.academy.push(d.id);
  }
}

// Fahrerliste für die Saison herstellen (Teams, Werte, zusätzliche Fahrer); Einzelrennen: Standard
export function applyRoster(season) {
  resetRoster();
  if (!season) return;
  const D = initDrivers(season);
  for (const x of D.extra) DRIVERS.push({ ...x });
  for (const d of DRIVERS) {
    if (D.roster[d.id] !== undefined) d.team = D.roster[d.id];
    const st = D.stats[d.id];
    if (st) for (const k of STAT_KEYS) if (st[k] !== undefined) d[k] = st[k];
  }
}
export function resetRoster() {
  DRIVERS.length = 0;
  for (const d of DEFAULT) DRIVERS.push({ ...d });
}
export const driverById = id => DRIVERS.find(d => d.id === id);

// ---------- Fahrermarkt für die nächste Saison ----------
// Kandidaten: ohne Team, Nachwuchs (Akademie nur für den Teamchef) und Fahrer, deren Vertrag in diesem Jahr endet
export function marketFor(season, teamId) {
  const D = initDrivers(season);
  const out = [];
  for (const d of DRIVERS) {
    if (D.retired.includes(d.id) || D.signings[d.id]) continue;
    if (d.team === teamId) continue;
    const c = D.contracts[d.id];
    const free = !d.team;
    const expiring = d.team && c && c.until <= season.year;
    if (!free && !expiring) continue;
    if (d.academy && !D.academy.includes(d.id)) continue;
    out.push({ d, age: ageOf(season, d), salary: Math.round(salaryDemand(d) * (d.academy ? 0.6 : 1) * 10) / 10, free, expiring, from: d.team });
  }
  return out.sort((a, b) => b.d.pace - a.d.pace);
}
// Freie Plätze im eigenen Team für die nächste Saison
export function freeSeats(season, teamId, mgmtDrivers) {
  const D = initDrivers(season);
  const staying = Object.entries(mgmtDrivers).filter(([, x]) => x.contractEnd > season.year).length;
  const signed = Object.values(D.signings).filter(x => x.team === teamId).length;
  return Math.max(0, 2 - staying - signed);
}
// Angebot an einen Fahrer: Gute Fahrer gehen nicht zu schwachen Teams (außer gegen mehr Geld)
export function signDriver(season, teamId, id, years, teamPace, rep) {
  const D = initDrivers(season);
  const c = marketFor(season, teamId).find(x => x.d.id === id);
  if (!c) return { err: 'Dieser Fahrer ist nicht (mehr) verfügbar.' };
  const appeal = teamPace + rep / 10;
  if (c.d.pace >= 88 && appeal + 6 < c.d.pace && !c.d.academy) return { err: `${c.d.first} ${c.d.last} sieht bei euch keine Perspektive und lehnt ab.` };
  D.signings[id] = { team: teamId, until: season.year + years, salary: c.salary };
  return { ok: `${c.d.first} ${c.d.last} unterschreibt für ${season.year + 1}–${season.year + years} (${c.salary.toFixed(1).replace('.', ',')} Mio. $/Jahr).` };
}
export function cancelSigning(season, id) { const D = initDrivers(season); delete D.signings[id]; }

// ---------- Saisonwechsel: Verträge, Entwicklung, Rücktritte, KI-Transfers, Nachwuchs ----------
// old: alte Saison (mit mgmt), year: neues Jahr, teams: Teams mit Pace. Gibt den neuen Fahrer-Zustand und Meldungen zurück.
export function nextDriverSeason(old, year, teams, academyLvl = 0) {
  applyRoster(old);
  const D = JSON.parse(JSON.stringify(initDrivers(old)));
  const notes = [];
  const playerTeam = old.teamId;
  const all = () => [...DEFAULT.map(d => ({ ...d })), ...D.extra];
  const byId = id => all().find(d => d.id === id);
  const name = id => { const d = byId(id); return d ? `${d.first} ${d.last}` : id; };
  const stat = (id, k) => (D.stats[id] && D.stats[id][k] !== undefined ? D.stats[id][k] : (byId(id) || {})[k]);
  const age = id => { const d = byId(id); return ageOf({ year }, d); };
  // Eigene Verträge aus der Teamzentrale übernehmen
  if (old.mgmt) for (const [id, x] of Object.entries(old.mgmt.drivers)) D.contracts[id] = { until: x.contractEnd, salary: x.salary };
  // Entwicklung: jung → besser (bis zum Potenzial), alt → langsamer
  for (const id of Object.keys(D.roster)) {
    if (D.retired.includes(id)) continue;
    const a = age(id), r = hash(`${year}${id}dev`);
    let dp = a <= 22 ? 1 + r * 2.5 : a <= 27 ? r * 1.5 : a <= 32 ? r - 0.5 : a <= 35 ? -0.5 - r : -1.2 - r * 1.5;
    const pot = (byId(id) || {}).potential;
    const p0 = stat(id, 'pace');
    if (pot && p0 + dp > pot) dp = Math.max(0, pot - p0);
    D.stats[id] = D.stats[id] || {};
    D.stats[id].pace = clamp(Math.round((p0 + dp) * 10) / 10, 60, 99);
    if (a <= 25) D.stats[id].consistency = clamp(Math.round(stat(id, 'consistency') + 1 + r), 50, 97);
    if (a <= 25) D.stats[id].errors = clamp(Math.round(stat(id, 'errors') - 1 - r * 2), 10, 60);
  }
  // Rücktritte
  for (const id of Object.keys(D.roster)) {
    if (D.retired.includes(id)) continue;
    const a = age(id), p = stat(id, 'pace');
    const chance = a >= 42 ? 0.7 : a >= 38 ? 0.3 + (a - 38) * 0.08 : a >= 34 && p < 80 ? 0.25 : !D.roster[id] && a >= 32 ? 0.35 : 0;
    if (chance && hash(`${year}${id}ret`) < chance) {
      D.retired.push(id);
      if (D.roster[id]) notes.push(`👋 ${name(id)} beendet seine Karriere.`);
      D.roster[id] = null;
      delete D.contracts[id];
    }
  }
  // Vereinbarte Wechsel (Teamchef) zuerst
  for (const [id, s] of Object.entries(D.signings)) {
    if (D.retired.includes(id)) continue;
    const from = D.roster[id];
    D.roster[id] = s.team;
    D.contracts[id] = { until: s.until, salary: s.salary };
    notes.push(`✍️ ${name(id)} fährt ${year} für ${teamName(teams, s.team)}${from && from !== s.team ? ` (kommt von ${teamName(teams, from)})` : ''}.`);
  }
  const signedIds = new Set(Object.keys(D.signings));
  D.signings = {};
  const releasedFrom = {};
  // Auslaufende Verträge: eigenes Team → Fahrer geht; KI → verlängern oder freigeben
  for (const [id, team] of Object.entries(D.roster)) {
    if (!team || signedIds.has(id)) continue;
    const c = D.contracts[id];
    if (c && c.until >= year) continue;
    if (team === playerTeam) { D.roster[id] = null; delete D.contracts[id]; notes.push(`🚪 ${name(id)} verlässt dein Team (Vertrag ausgelaufen).`); continue; }
    const t = teams.find(x => x.id === team), p = stat(id, 'pace'), a = age(id);
    const tp = t ? t.pace : 85;
    const keep = p >= tp - 8 && a < 37 && hash(`${year}${id}keep`) < (p >= tp ? 0.92 : 0.65);   // Spitzenfahrer bleiben fast immer
    if (keep) { D.contracts[id] = { until: year + 1 + Math.floor(hash(`${year}${id}len`) * 2), salary: salaryDemand({ pace: p }) }; }
    else { releasedFrom[id] = team; D.roster[id] = null; delete D.contracts[id]; }
  }
  // Freie Plätze füllen: stärkere Teams zuerst, sie bekommen die besten freien Fahrer
  const freeAgents = () => Object.keys(D.roster).filter(id => !D.roster[id] && !D.retired.includes(id) && !D.academy.includes(id))
    .sort((a, b) => stat(b, 'pace') - stat(a, 'pace'));
  for (const t of [...teams].sort((a, b) => b.pace - a.pace)) {
    let seats = 2 - Object.values(D.roster).filter(x => x === t.id).length;
    while (seats > 0) {
      const pool = freeAgents();
      if (!pool.length) break;
      // etwas Zufall: nicht immer exakt der Beste
      const x = hash(`${year}${t.id}${seats}pick`);
      const pick = pool[Math.min(pool.length - 1, x < 0.7 ? 0 : x < 0.9 ? 1 : 2)];   // meist der Beste, manchmal der Zweit-/Drittbeste
      const wasMine = t.id === playerTeam && old.mgmt && old.mgmt.drivers[pick];
      const wasHere = releasedFrom[pick] === t.id;
      D.roster[pick] = t.id;
      D.contracts[pick] = { until: year + Math.floor(hash(`${year}${pick}len`) * 3), salary: salaryDemand({ pace: stat(pick, 'pace') }) };
      if (wasMine) { const k = notes.findIndex(n => n.startsWith(`🚪 ${name(pick)}`)); if (k >= 0) notes.splice(k, 1); }
      if (t.id === playerTeam) notes.push(wasMine ? `📋 Kein neuer Fahrer verpflichtet – ${name(pick)} bleibt mit neuem Vertrag.` : `📋 Kein Fahrer verpflichtet – die Ingenieure holen ${name(pick)} ins Team.`);
      else if (!wasHere) notes.push(`🔁 ${t.name} holt ${name(pick)}.`);
      seats--;
    }
  }
  // Akademie-Fahrer ohne Platz bleiben in der Akademie; neuer Nachwuchs
  D.log = notes.slice(0, 40);
  const fake = { year, drv: D };
  addJuniors(fake, 4 + academyLvl, academyLvl);
  return { drv: D, notes };
}
function teamName(teams, id) { const t = teams.find(x => x.id === id); return t ? t.name : id; }
