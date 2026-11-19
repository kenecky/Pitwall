// Pit Wall – Teammanagement in der Saison (zwischen den Rennen):
// Budget mit Budgetobergrenze, Entwicklung (Aero, Motor, Zuverlässigkeit), Ersatzteile und Antriebseinheiten,
// Personal (Boxencrew, Ingenieure), Fahrerverträge und Stimmung, Sponsorenziele, Vorstand und Ruf.
// Alle Beträge in Mio. $. Der Zustand liegt in season.mgmt (reine Daten, speicherbar).
import { optimum } from './setup.js';
import { SEASON_2026 } from '../data/season2026.js';

export const CAP = 215;                 // Budgetobergrenze pro Saison (Mio. $)
export const PU_ALLOWANCE = 4;          // Antriebseinheiten pro Saison ohne Strafe
export const OPS = 5.6;                 // Grundbetrieb pro Rennwochenende (zählt zur Budgetobergrenze)
const POS_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

export const DEV = {
  aero:  { name: 'Chassis & Aero',   short: 'CHASSIS', hint: 'mehr Tempo, vor allem auf kurvigen Strecken' },
  motor: { name: 'Motor',            short: 'MOTOR', hint: 'mehr Tempo, vor allem auf schnellen Strecken' },
  rel:   { name: 'Zuverlässigkeit',  short: 'ZUV.',  hint: 'weniger Defekte' },
};
// Reglement der nächsten Saison: wird ab Saisonmitte festgelegt, danach kann das neue Auto entwickelt werden
export const REG_ROUND = 12;
export const REGS = [
  { id: 'aero', name: 'Neues Aero-Reglement', text: 'weniger Abtrieb am Unterboden, neue Front- und Heckflügel' },
  { id: 'motor', name: 'Neues Motorenreglement', text: 'mehr Elektro-Anteil, neuer nachhaltiger Kraftstoff' },
  { id: 'both', name: 'Großes Gesamtpaket', text: 'neue Aerodynamik und geänderte Antriebseinheit' },
];
export const NEXT_DEV = { name: 'Auto für die neue Saison', short: 'NEUES AUTO', hint: 'wirkt erst ab der nächsten Saison – kostet jetzt Geld und Budget-Cap' };
export const DEV_SIZE = {
  small: { name: 'Kleines Update', cost: 4, weeks: 3, gain: 0.6 },
  big:   { name: 'Großes Paket',   cost: 11, weeks: 7, gain: 1.7 },
};
export const STAFF = {
  crew: { name: 'Boxencrew',   hint: 'kürzere Boxenstopps', pay: 0.3 },
  eng:  { name: 'Ingenieure',  hint: 'schnellere Entwicklung, genauere Setup-Einschätzung', pay: 0.4 },
};
// Schlüsselposten im Team (fiktive Personen vom Bewerbermarkt)
export const POSTS = {
  td:       { name: 'Technischer Direktor', hint: 'Ertrag aller Entwicklungen, ab 85: Projekte 1 Rennen schneller' },
  aero:     { name: 'Chefdesigner Chassis', hint: 'Ertrag der Chassis- und Aero-Upgrades' },
  engine:   { name: 'Motorenchef', hint: 'Ertrag der Motor- und Zuverlässigkeits-Upgrades' },
  raceEng:  { name: 'Chef-Renningenieur', hint: 'Setup-Einschätzung im Training' },
  strategy: { name: 'Strategiechef', hint: 'macht die Strategie-Vorschläge vor dem Rennen' },
  crew:     { name: 'Boxencrew-Chef', hint: 'schnellere Boxenstopps' },
};
const FIRST = ['Anna', 'Ben', 'Clara', 'David', 'Elena', 'Finn', 'Greta', 'Hugo', 'Ines', 'Jonas', 'Karla', 'Leon', 'Mara', 'Nico', 'Olga', 'Paul', 'Rosa', 'Sven', 'Tara', 'Viktor', 'Yara', 'Emil'];
const LAST = ['Achterberg', 'Brenner', 'Castell', 'Dorn', 'Ehrlich', 'Falk', 'Gruber', 'Holm', 'Ivers', 'Janssen', 'Krüger', 'Lindqvist', 'Moretti', 'Nyberg', 'Okafor', 'Petit', 'Quast', 'Rinaldi', 'Sato', 'Tremblay', 'Ueda', 'Varga', 'Weiland', 'Zorn'];
// Auto-Konzept für den Winter (Vorsaison) – Startwerte der Entwicklung
export const CONCEPTS = {
  downforce: { name: 'Abtriebs-Konzept', hint: 'stark auf kurvigen Strecken (Monaco, Ungarn, Singapur)', dev: { aero: 1.8, motor: 0.3, rel: 0.5 } },
  speed:     { name: 'Topspeed-Konzept', hint: 'stark auf schnellen Strecken (Monza, Baku, Las Vegas)', dev: { aero: 0.3, motor: 1.8, rel: 0.5 } },
  balanced:  { name: 'Ausgewogen', hint: 'solide auf allen Strecken', dev: { aero: 1.0, motor: 1.0, rel: 0.6 } },
  reliable:  { name: 'Zuverlässigkeit zuerst', hint: 'kaum Ausfälle, etwas weniger Tempo', dev: { aero: 0.6, motor: 0.6, rel: 3.0 } },
};
export const CONCEPT_COST = 16;

export const PARTS = {
  wing:    { name: 'Frontflügel', price: 0.3 },
  chassis: { name: 'Chassis',     price: 2.5 },
};

// Fiktive Sponsoren (keine echten Marken)
const SPONSORS = ['Nordlicht Energie', 'Velox Uhren', 'Brightwave Telecom', 'Kaltenberg Logistik', 'Solace Airlines',
  'Arcadia Software', 'Bergmann Werkzeuge', 'Lumen Bank', 'Tidewater Getränke', 'Orbis Cloud'];
const GOALS = {
  points:  { text: 'Mindestens ein Auto in den Punkten', ok: r => r.best <= 10 },
  top5:    { text: 'Ein Auto in den Top 5', ok: r => r.best <= 5 },
  podium:  { text: 'Podium', ok: r => r.best <= 3 },
  both:    { text: 'Beide Autos im Ziel', ok: r => r.finished === 2 },
  bothPts: { text: 'Beide Autos in den Punkten', ok: r => r.inPoints === 2 },
  gain:    { text: 'Plätze gutmachen (Start → Ziel)', ok: r => r.gained > 0 },
};

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const money = x => `${x < 0 ? '−' : ''}${Math.abs(x).toFixed(1).replace('.', ',')} Mio. $`;
export { money };

// Rang eines Teams nach Grundtempo (1 = schnellstes)
function paceRank(teams, id) {
  return [...teams].sort((a, b) => b.pace - a.pace).findIndex(t => t.id === id) + 1;
}

export function initManagement(season, teams, drivers) {
  const team = teams.find(t => t.id === season.teamId);
  const rank = paceRank(teams, team.id);
  const tier = rank <= 4 ? 'top' : rank <= 8 ? 'mid' : 'back';
  const own = drivers.filter(d => d.team === team.id);
  const m = {
    money: { top: 70, mid: 55, back: 45 }[tier],
    spent: 0, tier,
    dev: { aero: 0, motor: 0, rel: 0 },
    projects: [],
    staff: { crew: tier === 'top' ? 4 : 3, eng: tier === 'back' ? 2 : 3 },
    parts: { wing: 6, chassis: 2 },
    pu: { used: 1, age: 0 },
    drivers: Object.fromEntries(own.map(d => [d.id, { morale: 70, contractEnd: 2026 + (d.pace >= 90 ? 2 : 1), salary: Math.round(2 + Math.max(0, d.pace - 70) * 0.9) }])),
    sponsors: [],
    titleSponsor: null,
    phase: 'preseason', concept: null,
    posts: {},
    board: { target: clamp(rank, 1, 10), rep: 50, msgs: [] },
    ai: Object.fromEntries(teams.filter(t => t.id !== team.id).map(t => [t.id, { pace: 0, rel: 0 }])),
    report: null,
    talked: {},
  };
  // Bestehendes Personal (je nach Team), zwei Posten sind zu Saisonbeginn frei
  const base = { top: 82, mid: 72, back: 62 }[tier];
  for (const k of ['td', 'aero', 'engine', 'crew']) m.posts[k] = person(`${season.year}${team.id}${k}`, base - 6 + Math.round(hash(team.id + k) * 12));
  m.posts.raceEng = null;
  m.posts.strategy = null;
  m.buildings = initBuildings(tier);
  m.construction = null;
  season.mgmt = m;
  refreshMarket(season, teams);
  return m;
}

// Person für einen Posten: Bewertung 0–100, Gehalt pro Jahr, Ablöse
function person(seed, rating) {
  const r = clamp(Math.round(rating), 35, 98);
  return {
    name: `${FIRST[Math.floor(hash(seed + 'f') * FIRST.length)]} ${LAST[Math.floor(hash(seed + 'l') * LAST.length)]}`,
    rating: r,
    salary: Math.round((0.6 + Math.pow(r / 100, 3) * 6.5) * 10) / 10,
    fee: Math.round((r >= 80 ? 2 + (r - 80) * 0.25 : 0.5 + r / 100) * 10) / 10,
  };
}
const postRating = (m, k) => (m.posts && m.posts[k] ? m.posts[k].rating : 35);

// Märkte: Bewerber je Posten, Titelsponsor- und Partner-Angebote (neu nach jedem Wochenende)
export function refreshMarket(season, teams) {
  const m = season.mgmt;
  const team = teams ? teams.find(t => t.id === season.teamId) : null;
  const rep = m.board.rep;
  const seed = `${season.year}${season.round}${season.teamId}`;
  m.market = m.market || {};
  m.market.staff = {};
  for (const k of Object.keys(POSTS)) {
    m.market.staff[k] = [0, 1, 2].map(i => person(`${seed}${k}${i}`, 50 + hash(`${seed}${k}${i}r`) * 45 + (i === 2 ? 5 : 0)));
  }
  // Sponsoren: je stärker Team und Ruf, desto mehr Geld
  const tierF = { top: 1.25, mid: 1, back: 0.82 }[m.tier] * (0.85 + rep / 330) * (1 + (bLvl(m, 'marketing') - 1) * 0.07) * (m.hype || 1);
  const names = SPONSORS.filter(n => n !== (m.titleSponsor && m.titleSponsor.name) && !m.sponsors.some(x => x.name === n));
  const pickName = i => names[Math.floor(hash(`${seed}n${i}`) * names.length + i * 3) % names.length];
  if (!m.titleSponsor) {
    m.market.title = [
      { name: pickName(0), kind: 'Sicher', perRace: r1(5.8 * tierF), bonus: r1(6 * tierF), target: m.board.target + 1 },
      { name: pickName(1), kind: 'Leistung', perRace: r1(4.6 * tierF), bonus: r1(24 * tierF), target: Math.max(1, m.board.target - 1) },
      { name: pickName(2), kind: 'Ausgewogen', perRace: r1(5.2 * tierF), bonus: r1(14 * tierF), target: m.board.target },
    ];
  } else m.market.title = [];
  const pool = ['points', 'top5', 'podium', 'both', 'bothPts', 'gain'];
  m.market.partners = [3, 4, 5, 6, 7].map(i => {
    const g = pool[Math.floor(hash(`${seed}g${i}`) * pool.length)];
    const hard = { podium: 3, top5: 2, bothPts: 2, points: 1.2, both: 0.8, gain: 0.7 }[g];
    return { name: pickName(i), fee: r1((0.25 + hash(`${seed}fee${i}`) * 0.35) * tierF), goal: g, reward: r1(hard * tierF * (m.tier === 'top' && g === 'points' ? 0.4 : 1)) };
  }).filter((x, i, a) => a.findIndex(y => y.name === x.name) === i);
  void team;
}
const r1 = x => Math.round(x * 10) / 10;

// Alte Spielstände (vor v10) ergänzen
export function migrateManagement(season, teams) {
  const m = season.mgmt;
  if (!m || m.posts) return;
  m.posts = {};
  const base = { top: 82, mid: 72, back: 62 }[m.tier] || 70;
  for (const k of Object.keys(POSTS)) m.posts[k] = person(`${season.year}${season.teamId}${k}`, base);
  m.phase = 'season';
  m.concept = 'balanced';
  refreshMarket(season, teams);
}
// Gebäude in alten Spielständen ergänzen
export function migrateBuildings(season) {
  const m = season.mgmt;
  if (m && !m.buildings) { m.buildings = initBuildings(m.tier); m.construction = null; }
}

// ---------- Gebäude (Investitionen, zählen nicht zur Budgetobergrenze) ----------
export const BUILDINGS = {
  factory:   { name: 'Entwicklungszentrum', icon: '🏭', eff: l => `${maxProjects(l)} Projekte gleichzeitig${l >= 3 ? ', Projekte 1 Rennen schneller' : ''}` },
  wind:      { name: 'Windkanal', icon: '🌬', eff: l => `Chassis & Aero +${(l - 1) * 6} % Ertrag` },
  dyno:      { name: 'Motorenprüfstand', icon: '🔩', eff: l => `Motor & Zuverlässigkeit +${(l - 1) * 6} % Ertrag` },
  sim:       { name: 'Simulator', icon: '🖥', eff: l => `Setup-Einschätzung der Ingenieure ${(l - 1) * 15} % genauer` },
  pit:       { name: 'Boxencrew-Trainingszentrum', icon: '⏱', eff: l => `Boxencrew +${((l - 1) * 1.5).toFixed(1).replace('.', ',')} (schnellere Stopps)` },
  marketing: { name: 'Marketing & Hospitality', icon: '🥂', eff: l => `Sponsorangebote +${(l - 1) * 7} %, mehr Verhandlungsspielraum` },
  drivers:   { name: 'Fahrerzentrum', icon: '💪', eff: l => `Fahrerstimmung +${l - 1} pro Wochenende` },
};
export const BUILD_MAX = 5;
const BUILD_COST = [0, 0, 8, 14, 22, 32];      // Kosten für Stufe 2…5
const BUILD_WEEKS = [0, 0, 4, 6, 9, 12];       // Bauzeit in Wochen
export const buildCost = lvl => BUILD_COST[lvl] || 0;
export const buildWeeks = lvl => BUILD_WEEKS[lvl] || 0;
export function maxProjects(l) { return l >= 4 ? 3 : l >= 2 ? 2 : 1; }
function initBuildings(tier) {
  const l = { top: 3, mid: 2, back: 1 }[tier] || 2;
  return Object.fromEntries(Object.keys(BUILDINGS).map(k => [k, l]));
}
export const bLvl = (m, k) => (m.buildings ? m.buildings[k] : 2);
export function startBuilding(season, key) {
  const m = season.mgmt;
  if (!BUILDINGS[key]) return 'Unbekanntes Gebäude.';
  if (m.construction) return `Es wird schon gebaut (${BUILDINGS[m.construction.key].name}).`;
  const next = bLvl(m, key) + 1;
  if (next > BUILD_MAX) return 'Höchste Ausbaustufe erreicht.';
  const cost = buildCost(next);
  if (m.money < cost) return 'Nicht genug Geld.';
  spend(m, cost, `Bau: ${BUILDINGS[key].name} Stufe ${next}`, false);
  m.construction = { key, lvl: next, start: season.date, done: addDays(season.date, buildWeeks(next) * 7) };
  return null;
}

// ---------- Vorsaison ----------
export function preseasonTasks(season) {
  const m = season.mgmt;
  const vacant = Object.keys(POSTS).filter(k => !m.posts[k]);
  return [
    { key: 'sponsors', done: Boolean(m.titleSponsor), text: 'Titelsponsor unter Vertrag nehmen' },
    { key: 'staff', done: vacant.length === 0, text: vacant.length ? `Freie Posten besetzen: ${vacant.map(k => POSTS[k].name).join(', ')}` : 'Alle Schlüsselposten besetzt' },
    { key: 'dev', done: Boolean(m.concept), text: 'Auto-Konzept für die Saison festlegen' },
    { key: 'partners', done: m.sponsors.length > 0, text: 'Mindestens einen Partner-Sponsor gewinnen', optional: true },
  ];
}
export function readyForRace(season) {
  return preseasonTasks(season).every(t => t.done || t.optional);
}

export function signTitle(season, idx) {
  const m = season.mgmt;
  const o = m.market.title && m.market.title[idx];
  if (!o) return 'Angebot nicht mehr verfügbar.';
  if (m.titleSponsor) return 'Es gibt bereits einen Titelsponsor.';
  m.titleSponsor = { ...o };
  m.market.title = [];
  return null;
}
export function signPartner(season, idx) {
  const m = season.mgmt;
  const o = m.market.partners && m.market.partners[idx];
  if (!o) return 'Angebot nicht mehr verfügbar.';
  if (m.sponsors.length >= 3) return 'Höchstens drei Partner – erst einen Vertrag beenden.';
  m.sponsors.push({ ...o, hits: 0 });
  m.market.partners.splice(idx, 1);
  return null;
}
export function dropPartner(season, idx) {
  const m = season.mgmt;
  if (!m.sponsors[idx]) return 'Unbekannter Partner.';
  const name = m.sponsors[idx].name;
  m.sponsors.splice(idx, 1);
  m.events = (m.events || []).filter(e => e.sponsor !== name || e.done);
  m.board.rep = clamp(m.board.rep - 2, 0, 100);
  return null;
}

export function hire(season, post, idx) {
  const m = season.mgmt;
  const c = m.market.staff[post] && m.market.staff[post][idx];
  if (!c) return 'Bewerber nicht mehr verfügbar.';
  if (m.money < c.fee) return 'Nicht genug Geld für die Ablöse.';
  if (capLeft(m) < c.fee) return 'Das würde die Budgetobergrenze überschreiten.';
  spend(m, c.fee, `${POSTS[post].name}: ${c.name} verpflichtet`);
  m.posts[post] = { name: c.name, rating: c.rating, salary: c.salary };
  m.market.staff[post].splice(idx, 1);
  return null;
}

export function chooseConcept(season, key) {
  const m = season.mgmt, c = CONCEPTS[key];
  if (!c) return 'Unbekanntes Konzept.';
  if (m.concept) return 'Das Konzept steht bereits fest.';
  if (m.money < CONCEPT_COST) return 'Nicht genug Geld.';
  spend(m, CONCEPT_COST, `Winter-Entwicklung: ${c.name}`);
  const f = devFactor(m, 'aero') * 0.5 + devFactor(m, 'motor') * 0.5;
  for (const [k, v] of Object.entries(c.dev)) m.dev[k] = Math.round((m.dev[k] + v * f) * 100) / 100;
  m.concept = key;
  return null;
}

export function startSeason(season) {
  if (!readyForRace(season)) return 'Erst die wichtigsten Aufgaben erledigen.';
  season.mgmt.phase = 'season';
  return null;
}

// Ertragsfaktor der Entwicklung je Bereich aus Technischem Direktor und Fachchef (Bewertung 70 ≈ 1,0)
export function devFactor(m, type) {
  const spec = type === 'aero' ? 'aero' : 'engine';
  const bld = 1 + (bLvl(m, type === 'aero' ? 'wind' : 'dyno') - 1) * 0.06;
  return (0.5 + (postRating(m, 'td') + postRating(m, spec)) / 2 / 140) * bld;
}
export function staffCostPerRace(m) {
  return Object.values(m.posts || {}).reduce((s, p) => s + (p ? p.salary : 0), 0) / 24;
}

// Neue Saison mit neuem Reglement: Kräfteverhältnis neu – Zufall des Reglements + wie gut jedes Team entwickelt hat
export function regShakeUp(old, teams) {
  const m = old.mgmt;
  if (!m || !m.regs) return null;
  const raw = {};
  for (const t of teams) {
    const shake = (hash(`${old.year}${t.id}shake`) - 0.5) * 3;          // wer das Reglement besser trifft
    const work = t.id === old.teamId ? (m.nextDev || 0) : ((m.ai[t.id] || {}).next || 0);
    raw[t.id] = shake + work * 1.1;
  }
  const mean = Object.values(raw).reduce((a, b) => a + b, 0) / teams.length;
  const adj = {};
  for (const t of teams) adj[t.id] = Math.round(clamp(raw[t.id] - mean, -6, 6) * 10) / 10;
  return adj;
}

// ---------- Werte des eigenen Teams und der KI-Teams für ein Wochenende ----------
export function teamsForWeekend(season, teams, track) {
  const m = season.mgmt;
  if (!m) return teams;
  const o = optimum(track);
  const wn = (o.rwing - 1) / 10;                 // 0 = schnelle Strecke, 1 = viel Abtrieb
  return teams.map(t => {
    if (t.id === season.teamId) {
      const pace = t.pace + (season.regAdj ? season.regAdj[t.id] || 0 : 0) + m.dev.aero * (0.5 + wn) + m.dev.motor * (1.5 - wn);
      const maxWear = Math.max(0, ...Object.keys(m.drivers).map(id => puCar(m, id).wear));
      const rel = t.reliability + m.dev.rel * 2 - Math.max(0, maxWear - 60) * 0.3;
      return { ...t, pace: Math.min(100, pace), reliability: clamp(rel, 40, 99), pitCrew: clamp(t.pitCrew + (postRating(m, 'crew') - 70) / 3.5 + (bLvl(m, 'pit') - 1) * 1.5, 60, 99) };
    }
    const a = m.ai[t.id] || { pace: 0, rel: 0 };
    return { ...t, pace: Math.min(100, t.pace + (season.regAdj ? season.regAdj[t.id] || 0 : 0) + a.pace), reliability: clamp(t.reliability + a.rel, 40, 99) };
  });
}

// Ingenieure: Einschätzung der Setup-Qualität (genauer mit besseren Ingenieuren)
export function engineerEstimate(season, score, seed) {
  const m = season.mgmt;
  if (!m || !m.posts || !m.posts.raceEng) return null;
  const err = (100 - m.posts.raceEng.rating) * 0.5 * (1 - (bLvl(m, 'sim') - 1) * 0.15) * (hash(String(seed)) - 0.5) * 2;
  return clamp(Math.round(score + err), 0, 100);
}

// ---------- Aktionen in der Teamzentrale ----------
export function capLeft(m) { return CAP - m.spent; }

// Buchung: im Bericht des aktuellen Wochenendes (m.log) und im Journal der Saison (m.ledger, mit Datum und Rennen)
function book(m, what, amount) {
  (m.log || (m.log = [])).push({ what, amount });
  (m.ledger || (m.ledger = [])).push({ what, amount, date: m.curDate || '', round: m.curRound ?? 0 });
}
// Datum/Rennen für Buchungen merken (vor Aktionen in der Teamzentrale und nach dem Rennen)
export function setBookingContext(season) {
  if (!season.mgmt) return;
  season.mgmt.curDate = season.date;
  season.mgmt.curRound = season.round;
}

function spend(m, amount, what, capRelevant = true) {
  m.money -= amount;
  if (capRelevant) m.spent += amount;
  book(m, what, -amount);
}

export function startProject(season, type, size) {
  const m = season.mgmt, s = DEV_SIZE[size];
  if ((!DEV[type] && type !== 'next') || !s) return 'Unbekanntes Projekt.';
  if (type === 'next' && !m.regs) return `Das Reglement für die nächste Saison steht erst nach Rennen ${REG_ROUND} fest.`;
  const maxP = maxProjects(bLvl(m, 'factory'));
  if (m.projects.length >= maxP) return `Höchstens ${maxP} Projekt${maxP > 1 ? 'e' : ''} gleichzeitig – das Entwicklungszentrum ausbauen.`;
  if (m.money < s.cost) return 'Nicht genug Geld.';
  if (capLeft(m) < s.cost) return 'Das würde die Budgetobergrenze überschreiten.';
  spend(m, s.cost, `${type === 'next' ? NEXT_DEV.name : DEV[type].name}: ${s.name}`);
  const weeks = projectWeeks(m, size);
  const gain = s.gain * devFactor(m, type === 'next' ? (m.regs.type === 'motor' ? 'motor' : 'aero') : type) * (type === 'next' ? 1.2 : 1);
  m.projects.push({ type, size, start: season.date, done: addDays(season.date, weeks * 7), gain: Math.round(gain * 100) / 100 });
  return null;
}

export function setStaff(season, key, delta) {
  const m = season.mgmt;
  const lvl = m.staff[key] + delta;
  if (lvl < 1 || lvl > 5) return 'Stufe 1–5.';
  if (delta > 0) {
    const fee = 1.5 * lvl;   // Anwerbung/Ablöse
    if (m.money < fee) return 'Nicht genug Geld.';
    if (capLeft(m) < fee) return 'Das würde die Budgetobergrenze überschreiten.';
    spend(m, fee, `${STAFF[key].name}: Verstärkung auf Stufe ${lvl}`);
  }
  m.staff[key] = lvl;
  return null;
}

export function buyPart(season, key, n = 1) {
  const m = season.mgmt, p = PARTS[key];
  const cost = p.price * n;
  if (m.money < cost) return 'Nicht genug Geld.';
  if (capLeft(m) < cost) return 'Das würde die Budgetobergrenze überschreiten.';
  spend(m, cost, `${n}× ${p.name}`);
  m.parts[key] += n;
  return null;
}

// ---------- Antriebseinheit je Auto ----------
// Verschleiß in % (0 = neu). Nutzt sich mit jedem gefahrenen Meter ab, mehr beim Pushen. Alter Motor = weniger Leistung.
export const PU_RATE = 12 / 305000;            // % pro Meter bei normalem Tempo (Renndistanz ≈ 12 %)
export function puCar(m, id) {
  if (!m.puCars) m.puCars = {};
  if (!m.puCars[id]) m.puCars[id] = { used: m.pu ? m.pu.used : 1, wear: m.pu ? Math.min(85, (m.pu.age || 0) * 15) : 0 };
  return m.puCars[id];
}
export function puLoss(wear) { return 0.0045 * (wear || 0); }   // s pro Runde (50 % ≈ 0,22 s)
// Neue Antriebseinheit für ein Auto: ab der fünften gibt es 10 Startplätze Strafe für diesen Fahrer
export function newPowerUnit(season, id) {
  const m = season.mgmt, p = puCar(m, id);
  if (p.wear < 3) return 'Die Antriebseinheit ist schon neu.';
  p.used++;
  p.wear = 0;
  if (p.used > PU_ALLOWANCE) {
    season.gridPen = season.gridPen || {};
    season.gridPen[id] = (season.gridPen[id] || 0) + 10;
    return `${id}: Antriebseinheit Nr. ${p.used} – über dem Kontingent: 10 Startplätze Strafe.`;
  }
  return null;
}

export function extendContract(season, id) {
  const m = season.mgmt, d = m.drivers[id];
  if (!d) return 'Unbekannter Fahrer.';
  const bonus = Math.round(d.salary * 0.25 * 10) / 10;
  if (m.money < bonus) return 'Nicht genug Geld für die Unterschriftsprämie.';
  if (d.morale < 35) return 'Der Fahrer will gerade nicht verlängern – erst die Stimmung verbessern.';
  spend(m, bonus, `Vertragsverlängerung ${id}`, false);   // Fahrergehälter zählen nicht zur Budgetobergrenze
  d.contractEnd++;
  d.salary = Math.round(d.salary * 1.08 * 10) / 10;
  d.morale = clamp(d.morale + 10, 0, 100);
  return null;
}

// Gespräch mit dem Fahrer (einmal pro Wochenende)
export function talkTo(season, id, kind) {
  const m = season.mgmt, d = m.drivers[id];
  if (!d) return 'Unbekannter Fahrer.';
  if (m.talked[id] === season.round) return 'Mit ihm hast du an diesem Wochenende schon gesprochen.';
  m.talked[id] = season.round;
  if (kind === 'praise') d.morale = clamp(d.morale + 6, 0, 100);
  else if (kind === 'promise') { d.morale = clamp(d.morale + 10, 0, 100); d.promise = season.round + 3; }
  else if (kind === 'pressure') d.morale = clamp(d.morale - 6, 0, 100);
  return null;
}

// ---------- Nach jedem Wochenende ----------
// res: { race: [{id, retired, dsq}], grid: [...ids], sprint }, used: { wing, chassis } aus allen Sessions, moods: {id: Stimmung am Ende}
export function afterWeekend(season, teams, drivers, res, used, moods) {
  const m = season.mgmt;
  const notes = [];
  m.log = [];
  m.curDate = season.date;
  m.curRound = season.round;
  const own = Object.keys(m.drivers);
  const pos = id => res.race.findIndex(r => r.id === id) + 1;
  const ok = id => { const r = res.race.find(x => x.id === id); return r && !r.retired && !r.dsq; };
  const finished = own.filter(ok).length;
  const places = own.filter(ok).map(pos);
  const best = places.length ? Math.min(...places) : 99;
  const grid = res.grid || [];
  const gained = own.filter(ok).reduce((s, id) => s + Math.max(0, grid.indexOf(id) + 1 - pos(id)), 0);
  const pts = own.reduce((s, id) => s + (ok(id) ? POS_POINTS[pos(id) - 1] || 0 : 0), 0);
  const r = { best, finished, inPoints: places.filter(p => p <= 10).length, gained, pts };

  // Einnahmen: Preisgeld, Titelsponsor, Sponsorenziele
  const prize = 1.2 + pts * 0.12;
  m.money += prize; book(m, 'Preisgeld', prize);
  if (m.titleSponsor) { m.money += m.titleSponsor.perRace; book(m, `Titelsponsor ${m.titleSponsor.name}`, m.titleSponsor.perRace); }
  for (const s of m.sponsors) {
    if (s.fee) { m.money += s.fee; book(m, `Partner ${s.name}`, s.fee); }
    const hit = GOALS[s.goal].ok(r);
    s.last = hit;
    if (hit) { s.hits++; m.money += s.reward; book(m, `${s.name}: ${GOALS[s.goal].text}`, s.reward); }
  }
  // Laufzeiten der Sponsorverträge (alte Verträge ohne Laufzeit: bis Saisonende)
  const runOut = s => { if (s.left === undefined) s.left = Math.max(1, 24 - season.round + 1); s.left--; return s.left <= 0; };
  if (m.titleSponsor && runOut(m.titleSponsor)) { notes.push(`Der Vertrag mit Titelsponsor ${m.titleSponsor.name} ist ausgelaufen – neuen Titelsponsor suchen!`); m.titleSponsor = null; }
  for (const sp of [...m.sponsors]) if (runOut(sp)) { notes.push(`Der Partnervertrag mit ${sp.name} ist ausgelaufen.`); m.sponsors.splice(m.sponsors.indexOf(sp), 1); }
  // Ausgaben: Personal (Budgetobergrenze), Fahrergehälter (nicht), Reparaturen und Ersatzteile
  const staff = staffCostPerRace(m) + OPS;   // Schlüsselposten + Grundbetrieb (Fabrik, Personal, Reisen, Logistik)
  spend(m, staff, 'Personal und Betrieb');
  const sal = own.reduce((s, id) => s + m.drivers[id].salary, 0) / 24;
  spend(m, sal, 'Fahrergehälter', false);
  for (const [k, n] of Object.entries(used)) {
    if (!n) continue;
    const have = Math.min(n, m.parts[k]);
    m.parts[k] -= have;
    const missing = n - have;
    const repair = n * (k === 'chassis' ? 0.8 : 0.1) + missing * PARTS[k].price * 2;   // fehlende Teile: Eilfertigung, doppelter Preis
    spend(m, repair, `${n}× ${PARTS[k].name} ersetzt${missing ? ` (${missing} in Eilfertigung)` : ''}`);
    notes.push(`${n}× ${PARTS[k].name} beschädigt${missing ? ' – kein Ersatz auf Lager, teure Eilfertigung' : ''}.`);
  }
  // Gebäude: Unterhalt (Betrieb), Baufortschritt, Fahrerzentrum
  const upkeep = Object.values(m.buildings || {}).reduce((sum, l) => sum + l * 0.08, 0);
  spend(m, upkeep, 'Unterhalt der Gebäude');
  for (const d of Object.values(m.drivers)) d.morale = clamp(d.morale + (bLvl(m, 'drivers') - 1), 0, 100);
  // Antriebseinheiten: Verschleiß kommt aus dem Fahren (main → m.puCars)
  for (const id of own) { const p = puCar(m, id); if (p.wear >= 70) notes.push(`${id}: Antriebseinheit ${Math.round(p.wear)} % verschlissen – Leistung sinkt, Defektrisiko steigt.`); }

  // Reglement der nächsten Saison: ab Saisonmitte von der Rennleitung festgelegt
  if (!m.regs && season.round >= REG_ROUND) {
    const r = REGS[Math.floor(hash(`${season.year}regs`) * REGS.length)];
    m.regs = { type: r.id, year: season.year + 1, date: season.date };
    notes.push(`📜 Die Rennleitung hat das Reglement für ${season.year + 1} festgelegt: ${r.name} (${r.text}). Ab sofort kann das Auto für die neue Saison entwickelt werden (Entwicklung → Neues Auto). Das kostet Geld und zählt zum Budget-Cap.`);
  }
  // KI-Teams entwickeln auch (reiche Teams etwas schneller); nach dem neuen Reglement teilen sie die Kräfte
  for (const t of teams) {
    if (t.id === season.teamId) continue;
    const a = m.ai[t.id];
    const rich = paceRank(teams, t.id) <= 4 ? 1.15 : 1;
    const split = m.regs ? 0.6 : 1;
    a.pace = Math.round((a.pace + hash(`${season.round}${t.id}p`) * 0.32 * rich * split) * 100) / 100;
    a.rel = Math.round((a.rel + hash(`${season.round}${t.id}r`) * 0.25) * 100) / 100;
    if (m.regs) a.next = Math.round(((a.next || 0) + hash(`${season.round}${t.id}n`) * 0.55 * rich) * 100) / 100;
  }

  // Fahrer: Stimmung aus Funk-Stimmung im Rennen, Ergebnis und Teamkollege
  for (const id of own) {
    const d = m.drivers[id];
    const mate = own.find(x => x !== id);
    let target = moods[id] ?? d.morale;
    if (ok(id) && pos(id) <= 10) target += 6;
    if (!ok(id)) target -= 6;
    if (mate && ok(id) && ok(mate) && pos(id) < pos(mate)) target += 4;
    if (d.promise && season.round >= d.promise && !(ok(id) && pos(id) <= 10)) { target -= 15; notes.push(`${id} ist enttäuscht – das Versprechen wurde nicht gehalten.`); d.promise = null; }
    d.morale = clamp(Math.round(d.morale * 0.65 + target * 0.35), 0, 100);
    if (d.morale < 30) notes.push(`${id} ist unzufrieden (Stimmung ${d.morale}).`);
  }

  // Vorstand: Erwartung aus dem Saisonziel
  const exp = expectedPoints(m.board.target);
  const delta = clamp((pts - exp) / 3, -6, 6);
  m.board.rep = clamp(Math.round(m.board.rep + delta), 0, 100);
  m.board.last = { pts, exp: Math.round(exp * 10) / 10 };
  if (m.spent > CAP) notes.push(`Budgetobergrenze überschritten (${money(m.spent)} von ${money(CAP)})! Am Saisonende drohen Strafen.`);
  if (m.money < 0) { m.board.rep = clamp(m.board.rep - 3, 0, 100); notes.push('Das Konto ist im Minus – der Vorstand ist besorgt.'); }
  if (m.board.rep < 25) notes.push('Der Vorstand ist sehr unzufrieden mit den Ergebnissen.');
  m.report = { round: season.round, notes, log: m.log, r };
  refreshMarket(season, teams);
  return notes;
}

// Erwartete Teampunkte pro Rennen für eine Zielposition in der Teamwertung (grobe Näherung)
export function expectedPoints(target) {
  return [30, 22, 16, 11, 7, 5, 3.5, 2.5, 1.5, 1, 0.5][clamp(target, 1, 11) - 1];
}

// Am Saisonende: Budgetobergrenze, Titelsponsor-Bonus, Vorstandsurteil
export function seasonEnd(season, teamPos) {
  const m = season.mgmt;
  const out = [];
  m.puCars = {}; m.pu = { used: 1, age: 0 };   // neue Saison: neues Kontingent an Antriebseinheiten
  if (m.titleSponsor && teamPos <= m.titleSponsor.target) { m.money += m.titleSponsor.bonus; out.push(`Saisonziel erreicht: Bonus ${money(m.titleSponsor.bonus)} von ${m.titleSponsor.name}.`); }
  if (m.spent > CAP) {
    const over = (m.spent - CAP) / CAP;
    const ded = Math.ceil(over * 100) * 5;
    season.teamPts[season.teamId] = Math.max(0, (season.teamPts[season.teamId] || 0) - ded);
    out.push(`Budgetobergrenze um ${(over * 100).toFixed(1).replace('.', ',')} % überschritten: ${ded} Punkte Abzug in der Teamwertung.`);
  }
  const verdict = teamPos <= m.board.target ? 'Der Vorstand ist zufrieden – Ziel erreicht.' : m.board.rep < 20 ? 'Der Vorstand ist sehr unzufrieden. Dein Job steht auf dem Spiel.' : 'Ziel verfehlt – der Vorstand erwartet nächstes Jahr mehr.';
  out.push(verdict);
  return out;
}

// Beschädigte Teile einer Session/eines Rennens (eigene Autos)
export function damageFrom(race) {
  const used = { wing: 0, chassis: 0 };
  for (const c of race.cars) {
    if (!c.player) continue;
    if (c.retired && c.wreck) used.chassis++;
  }
  for (const e of race.events) if (/^Reparaturstopp \w+: neue Nase/.test(e.text) && (e.cars || []).some(id => race.carById[id] && race.carById[id].player)) used.wing++;
  return used;
}

export function goalText(g) { return GOALS[g].text; }

// ---------- Sponsoren-Verhandlung ----------
// Jeder Sponsor hat eine versteckte Schmerzgrenze (limit, Faktor auf das Angebot) und sichtbares Interesse (0–100).
// Pro Runde: mehr fordern (+5/+10/+20 %), Fixum gegen höheren Bonus tauschen, unterschreiben oder abbrechen.
export function startNego(season, kind, idx) {
  const m = season.mgmt;
  const o = kind === 'title' ? m.market.title[idx] : m.market.partners[idx];
  if (!o) return 'Angebot nicht mehr verfügbar.';
  if (kind === 'title' && m.titleSponsor) return 'Es gibt bereits einen Titelsponsor.';
  if (kind === 'partner' && m.sponsors.length >= 3) return 'Höchstens drei Partner – erst einen Vertrag beenden.';
  const room = 1.05 + hash(`${season.year}${season.round}${o.name}lim`) * 0.22 + (m.board.rep - 50) / 500 + (bLvl(m, 'marketing') - 1) * 0.03;
  // Laufzeit (Rennen): Wunsch des Sponsors und verdeckter Bereich, in dem er zufrieden ist
  const h = k => hash(`${season.year}${season.round}${o.name}${k}`);
  const pref = kind === 'title' ? 12 + Math.round(h('dp') * 8) * 2 : 6 + Math.round(h('dp') * 5) * 2;
  const dur = { pref, min: Math.max(2, pref - 4 - Math.round(h('dmin') * 6)), max: pref + 4 + Math.round(h('dmax') * 8) };
  m.nego = { kind, name: o.name, base: { ...o, races: pref }, cur: { ...o, races: pref }, dur, limit: Math.max(1.02, room), interest: 70 + Math.round(hash(o.name + 'int') * 25), round: 0, swapped: false,
    log: [`${o.name}: „Wir freuen uns auf die Gespräche. Das ist unser Angebot.“`] };
  return null;
}
const QUOTE = {
  ok: ['„Einverstanden, das passt für uns.“', '„Gut, darauf können wir uns einigen.“'],
  counter: ['„Das ist uns zu viel. Wir treffen uns in der Mitte.“', '„So weit können wir nicht gehen – hier unser Gegenangebot.“'],
  no: ['„Nein, das ist deutlich zu hoch.“', '„Darüber müssen wir nicht reden.“'],
  gone: ['„Wir ziehen unser Angebot zurück.“'],
};
function amountKey(n) { return n.kind === 'title' ? 'perRace' : 'fee'; }
export function negoAction(season, action) {
  const m = season.mgmt, n = m.nego;
  if (!n) return 'Keine Verhandlung.';
  const k = amountKey(n);
  const pick = arr => arr[Math.floor(hash(`${n.name}${n.round}${action}`) * arr.length)];
  n.round++;
  if (action === 'swap') {
    // 20 % des Fixums gegen 60 % mehr Prämie/Bonus (Risiko für mehr Geld)
    if (n.swapped) return 'Schon umgestellt.';
    const cut = n.cur[k] * 0.2;
    n.cur[k] = r1(n.cur[k] - cut);
    if (n.kind === 'title') n.cur.bonus = r1(n.cur.bonus * 1.6); else n.cur.reward = r1(n.cur.reward * 1.6);
    n.swapped = true;
    n.interest = clamp(n.interest + 8, 0, 100);
    n.log.push(`${n.name}: „Mehr Prämie für Erfolg? Das gefällt uns.“`);
    return null;
  }
  if (action === 'shorter' || action === 'longer') {
    // Laufzeit verhandeln: im Bereich des Sponsors ok, knapp daneben Gegenangebot, weit daneben Ablehnung
    const d = n.dur, want = Math.max(2, n.cur.races + (action === 'longer' ? 4 : -4));
    const fatigue = n.round * 3;
    if (want >= d.min && want <= d.max) {
      n.cur.races = want;
      n.interest = clamp(n.interest + (want > d.pref ? 3 : -3) - fatigue / 3, 0, 100);
      n.log.push(`Du schlägst ${want} Rennen vor. ${n.name}: ${want > d.pref ? '„Eine längere Partnerschaft – sehr gerne.“' : pick(QUOTE.ok)}`);
    } else if (want >= d.min - 4 && want <= d.max + 4) {
      n.cur.races = want < d.min ? d.min : d.max;
      n.interest = clamp(n.interest - 8 - fatigue / 2, 0, 100);
      n.log.push(`Du schlägst ${want} Rennen vor. ${n.name}: „${want < d.min ? 'So kurz lohnt sich das für uns nicht' : 'So lange können wir uns nicht binden'} – ${n.cur.races} Rennen wären möglich.“`);
    } else {
      n.interest = clamp(n.interest - 15 - fatigue, 0, 100);
      n.log.push(`Du schlägst ${want} Rennen vor. ${n.name}: „${want < d.min ? 'Viel zu kurz.' : 'Viel zu lang.'} Darüber reden wir nicht.“`);
    }
    if (n.interest <= 0) {
      n.log.push(`${n.name}: ${QUOTE.gone[0]}`);
      n.gone = true;
      const list = n.kind === 'title' ? m.market.title : m.market.partners;
      const i = list.findIndex(x => x.name === n.name);
      if (i >= 0) list.splice(i, 1);
    }
    return null;
  }
  const pct = { up5: 0.05, up10: 0.1, up20: 0.2 }[action];
  if (!pct) return 'Unbekannte Aktion.';
  const want = n.cur[k] * (1 + pct);
  const ratio = want / n.base[k];
  const fatigue = n.round * 3;     // jede weitere Runde kostet Geduld
  if (ratio <= n.limit * 0.93) {
    n.cur[k] = r1(want);
    if (n.kind === 'title') n.cur.bonus = r1(n.cur.bonus * (1 + pct / 2));
    n.interest = clamp(n.interest - 4 - fatigue / 2, 0, 100);
    n.log.push(`Du forderst +${Math.round(pct * 100)} %. ${n.name}: ${pick(QUOTE.ok)}`);
  } else if (ratio <= n.limit) {
    n.cur[k] = r1((n.cur[k] + want) / 2);
    n.interest = clamp(n.interest - 10 - fatigue / 2, 0, 100);
    n.log.push(`Du forderst +${Math.round(pct * 100)} %. ${n.name}: ${pick(QUOTE.counter)}`);
  } else {
    n.interest = clamp(n.interest - 18 - fatigue, 0, 100);
    n.log.push(`Du forderst +${Math.round(pct * 100)} %. ${n.name}: ${pick(QUOTE.no)}`);
  }
  if (n.interest <= 0) {
    n.log.push(`${n.name}: ${QUOTE.gone[0]}`);
    n.gone = true;
    const list = n.kind === 'title' ? m.market.title : m.market.partners;
    const i = list.findIndex(x => x.name === n.name);
    if (i >= 0) list.splice(i, 1);
  }
  return null;
}
export function negoSign(season) {
  const m = season.mgmt, n = m.nego;
  if (!n || n.gone) return 'Keine laufende Verhandlung.';
  const list = n.kind === 'title' ? m.market.title : m.market.partners;
  const i = list.findIndex(x => x.name === n.name);
  const left = n.cur.races || 12;
  if (n.kind === 'title') { if (m.titleSponsor) return 'Es gibt bereits einen Titelsponsor.'; m.titleSponsor = { ...n.cur, left }; m.market.title = []; }
  else { if (m.sponsors.length >= 3) return 'Höchstens drei Partner.'; m.sponsors.push({ ...n.cur, left, hits: 0 }); if (i >= 0) list.splice(i, 1); }
  m.nego = null;
  scheduleSponsorEvents(season, n.name, n.kind === 'title' ? 4 : 2);
  return null;
}
export function negoCancel(season) {
  season.mgmt.nego = null;
}

// ---------- Kalender: Spieldatum, Termine, Fertigstellungen ----------
export function addDays(iso, d) {
  const t = new Date(`${iso}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + d);
  return t.toISOString().slice(0, 10);
}
export function fmtDate(iso, long = false) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('de-DE', long ? { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' } : { day: 'numeric', month: 'short', timeZone: 'UTC' });
}
export function weeksBetween(a, b) {
  return Math.max(0, Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / 86400000 / 7 * 10) / 10);
}
// Dauer eines Entwicklungsprojekts (Wochen): Technischer Direktor ≥ 85 und Entwicklungszentrum ab Stufe 3 je −1
export function projectWeeks(m, size) {
  return Math.max(1, DEV_SIZE[size].weeks - (postRating(m, 'td') >= 85 ? 1 : 0) - (bLvl(m, 'factory') >= 3 ? 1 : 0));
}
// Renntermin (Sonntag) eines Kalendereintrags im Saisonjahr
export function raceDate(season, entry) { return `${season.year}${entry.date.slice(4)}`; }

// Alte Spielstände: Datum und Fertigstellungstermine ergänzen
export function migrateCalendar(season, calendar) {
  const m = season.mgmt;
  if (!season.date) {
    const e = calendar[season.round];
    season.date = e ? addDays(raceDate(season, e), season.round === 0 ? -42 : -10) : `${season.year}-12-01`;
  }
  if (!m) return;
  for (const p of m.projects) if (!p.done) { p.done = addDays(season.date, (p.rounds || 1) * 14); delete p.rounds; delete p.total; }
  if (m.construction && !m.construction.done) { m.construction.done = addDays(season.date, (m.construction.rounds || 1) * 14); delete m.construction.rounds; delete m.construction.total; }
}

// Alle kommenden Termine (sortiert): Rennen, Entwicklungen, Gebäude
export function calendarEvents(season, calendar, trackName) {
  const m = season.mgmt;
  const ev = [];
  calendar.forEach((e, i) => {
    if (i < season.round) return;
    ev.push({ date: raceDate(season, e), kind: 'race', round: e.round, track: e.track, text: trackName(e.track) });
  });
  for (const p of (m && m.projects) || []) ev.push({ date: p.done, kind: 'dev', text: `${p.type === 'next' ? NEXT_DEV.name : DEV[p.type].name}: ${DEV_SIZE[p.size].name} fertig` });
  if (m && m.construction) ev.push({ date: m.construction.done, kind: 'build', text: `${BUILDINGS[m.construction.key].name} Stufe ${m.construction.lvl} fertig` });
  for (const e of (m && m.events) || []) if (!e.done) ev.push({ date: e.date, kind: 'sponsor', id: e.id, text: `${SPONSOR_EVENTS[e.type].name} · ${e.sponsor}` });
  if (m) ev.push(...agendaEvents(season, calendar, trackName));
  // bei gleichem Datum: Fertigstellungen vor dem Rennen
  return ev.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === 'race') - (b.kind === 'race'));
}
export function nextEvent(season, calendar, trackName) {
  return calendarEvents(season, calendar, trackName)[0] || null;
}

// Zum Datum vorspulen: alles Fertige übernehmen, Meldungen zurückgeben
export function advanceTo(season, date) {
  const m = season.mgmt;
  const notes = [];
  if (date > season.date) season.date = date;
  for (const p of m.projects.filter(x => x.done <= season.date)) {
    if (p.type === 'next') {
      m.nextDev = Math.round(((m.nextDev || 0) + p.gain) * 100) / 100;
      notes.push(`🧪 Entwicklung fürs neue Auto abgeschlossen: +${p.gain.toFixed(1).replace('.', ',')} (wirkt ab der nächsten Saison).`);
      continue;
    }
    m.dev[p.type] = Math.round((m.dev[p.type] + p.gain) * 100) / 100;
    notes.push(`🔧 Upgrade fertig: ${DEV[p.type].name} +${p.gain.toFixed(1).replace('.', ',')} – wirkt ab dem nächsten Rennen.`);
  }
  m.projects = m.projects.filter(x => x.done > season.date);
  if (m.construction && m.construction.done <= season.date) {
    m.buildings[m.construction.key] = m.construction.lvl;
    notes.push(`🏗 Fertig gebaut: ${BUILDINGS[m.construction.key].name} Stufe ${m.construction.lvl}.`);
    m.construction = null;
  }
  return notes;
}

// ---------- Sponsoren-Termine ----------
// Fahrer-Termin, Showrun oder Werksführung zwischen den Rennen. Hingehen: Geld + Zufriedenheit, kostet Fahrerstimmung.
// Absagen: Sponsor verärgert; unter 10 Zufriedenheit kündigt er.
export const SPONSOR_EVENTS = {
  meet:  { name: 'Fahrer-Termin', hint: 'Autogrammstunde und Fotos mit Kunden', driver: true, money: 0.4, mood: -3 },
  show:  { name: 'Showrun', hint: 'Demofahrt in der Innenstadt', driver: true, money: 0.8, mood: -5 },
  visit: { name: 'Werksführung', hint: 'Gäste des Sponsors besuchen die Fabrik', driver: false, money: 0.3, mood: 0 },
};
export function scheduleSponsorEvents(season, sponsor, count) {
  const m = season.mgmt;
  m.events = m.events || [];
  const races = SEASON_2026.map(e => raceDate(season, e));
  const end = races[races.length - 1];
  const start = addDays(season.date, 7);
  const span = Math.max(14, (new Date(`${end}T12:00:00Z`) - new Date(`${start}T12:00:00Z`)) / 86400000);
  const types = Object.keys(SPONSOR_EVENTS);
  for (let i = 0; i < count; i++) {
    let d = addDays(start, Math.round(span * (i + 0.3 + hash(`${sponsor}${i}d`) * 0.5) / count));
    // nicht an Rennwochenenden (Freitag bis Montag)
    for (let k = 0; k < 6 && races.some(r => d >= addDays(r, -2) && d <= addDays(r, 1)); k++) d = addDays(d, 3);
    const type = types[Math.floor(hash(`${sponsor}${i}t`) * types.length)];
    m.events.push({ id: `${sponsor}-${i}-${d}`, date: d, kind: 'sponsor', sponsor, type, done: false });
  }
}
export function sponsorByName(m, name) {
  if (m.titleSponsor && m.titleSponsor.name === name) return m.titleSponsor;
  return m.sponsors.find(x => x.name === name) || null;
}
export function migrateEvents(season) {
  const m = season.mgmt;
  if (!m || m.events) return;
  m.events = [];
  if (m.titleSponsor) scheduleSponsorEvents(season, m.titleSponsor.name, 2);
  for (const sp of m.sponsors) scheduleSponsorEvents(season, sp.name, 1);
}
// choice: Fahrer-ID, 'go' (ohne Fahrer) oder 'decline'
export function resolveSponsorEvent(season, id, choice) {
  const m = season.mgmt;
  const ev = (m.events || []).find(e => e.id === id);
  if (!ev || ev.done) return null;
  ev.done = true;
  const sp = sponsorByName(m, ev.sponsor);
  const t = SPONSOR_EVENTS[ev.type];
  if (!sp) return `${ev.sponsor} ist kein Partner mehr – Termin entfällt.`;
  if (sp.happy === undefined) sp.happy = 70;
  if (choice === 'decline') {
    sp.happy = clamp(sp.happy - 22, 0, 100);
    if (sp.happy < 10 && sp !== m.titleSponsor) {
      m.sponsors.splice(m.sponsors.indexOf(sp), 1);
      m.events = m.events.filter(e => e.sponsor !== sp.name || e.done);
      return `${sp.name} ist verärgert und beendet die Partnerschaft.`;
    }
    return `Termin abgesagt – ${sp.name} ist enttäuscht (Zufriedenheit ${sp.happy}).`;
  }
  const amount = r1(t.money * { top: 1.4, mid: 1, back: 0.8 }[m.tier]);
  m.money += amount;
  book(m, `${t.name} bei ${sp.name}`, amount);
  sp.happy = clamp(sp.happy + 10, 0, 100);
  if (t.driver && m.drivers[choice]) m.drivers[choice].morale = clamp(m.drivers[choice].morale + t.mood, 0, 100);
  return `${t.name} bei ${sp.name}: +${money(amount)}${t.driver && m.drivers[choice] ? `, Stimmung ${choice} ${t.mood}` : ''}. ${sp.name} ist zufrieden.`;
}

// ---------- Weitere Termine: Präsentation, Medientag, Vorstandssitzung, Vertragsende ----------
const BOARD_ROUNDS = [6, 12, 18];
function agendaEvents(season, calendar, trackName) {
  const m = season.mgmt;
  const done = m.agenda || (m.agenda = {});
  const out = [];
  const add = (id, date, kind, text, extra = {}) => { if (!done[id] && date >= season.date) out.push({ id, date, kind, text, ...extra }); };
  // Präsentation des neuen Autos (Vorsaison)
  if (season.round === 0) add(`present-${season.year}`, `${season.year}-02-16`, 'present', 'Präsentation des neuen Autos');
  calendar.forEach((e, i) => {
    if (i < season.round) return;
    // Medientag am Donnerstag vor jedem Rennen
    add(`media-${season.year}-${e.round}`, addDays(raceDate(season, e), -3), 'media', `Medientag · ${trackName(e.track)}`, { round: e.round });
    // Vorstandssitzung nach Rennen 6, 12, 18
    if (BOARD_ROUNDS.includes(e.round)) add(`board-${season.year}-${e.round}`, addDays(raceDate(season, e), 3), 'board', 'Vorstandssitzung · Zwischenbilanz', { round: e.round });
  });
  // Vertragsende: Fahrer, deren Vertrag in diesem Jahr ausläuft
  for (const [id, d] of Object.entries(m.drivers)) {
    if (d.contractEnd !== season.year) continue;
    const date = (m.remind && m.remind[id]) || `${season.year}-09-07`;
    add(`contract-${id}-${season.year}`, date, 'contract', `Vertrag von ${id} läuft aus`, { driver: id });
  }
  return out;
}

const MEDIA_Q = [
  { q: 'Was ist Ihr Ziel für dieses Wochenende?', a: [
    { t: '„Wir wollen um die Spitze kämpfen.“', eff: { rep: 2, morale: 3, hype: true } },
    { t: '„Wir schauen von Rennen zu Rennen.“', eff: { rep: 1 } },
    { t: '„Das Auto ist noch nicht, wo es sein muss.“', eff: { rep: -2, morale: -3, sponsor: -3 } }] },
  { q: 'Gibt es Spannungen zwischen Ihren beiden Fahrern?', a: [
    { t: '„Nein, die beiden verstehen sich sehr gut.“', eff: { morale: 2 } },
    { t: '„Ein bisschen Rivalität schadet nicht.“', eff: { morale: -1, rep: 1 } },
    { t: '„Kein Kommentar.“', eff: { rep: -1 } }] },
  { q: 'Ihre Sponsoren wünschen sich mehr Präsenz. Wie reagieren Sie?', a: [
    { t: '„Unsere Partner sind uns sehr wichtig.“', eff: { sponsor: 5 } },
    { t: '„Die Ergebnisse sprechen für sich.“', eff: { rep: 1, sponsor: -4 } },
    { t: '„Darüber reden wir intern.“', eff: {} }] },
  { q: 'Wann kommen die nächsten Upgrades?', a: [
    { t: '„Schon sehr bald – das Paket ist fast fertig.“', eff: { sponsor: 3, rep: 1, hype: true } },
    { t: '„Wir lassen uns Zeit, Qualität geht vor.“', eff: { rep: 1 } },
    { t: '„Das Budget ist eng.“', eff: { sponsor: -4, rep: -1 } }] },
  { q: 'Wie bewerten Sie die Arbeit der Rennleitung?', a: [
    { t: '„Sie machen einen schwierigen Job gut.“', eff: { rep: 1 } },
    { t: '„Zu viele Strafen in letzter Zeit.“', eff: { morale: 3, rep: -2 } },
    { t: '„Kein Kommentar.“', eff: {} }] },
  { q: 'Gerüchte besagen, ein Top-Team will Ihren Fahrer. Was sagen Sie?', a: [
    { t: '„Er fühlt sich bei uns wohl und bleibt.“', eff: { morale: 4 } },
    { t: '„Jeder ist ersetzbar.“', eff: { morale: -6, rep: 1 } },
    { t: '„Gerüchte kommentieren wir nicht.“', eff: {} }] },
];

// Dialog-Inhalt für einen Termin: { title, text, options: [{ key, label, sub?, secondary? }] }
export function agendaDialog(season, ev, teamPos) {
  const m = season.mgmt;
  if (ev.kind === 'present') return {
    title: '🎉 Präsentation des neuen Autos',
    text: 'Die Welt soll das neue Auto sehen. Wie groß soll die Präsentation werden?',
    options: [
      { key: 'big', label: 'Große Show', sub: '2,5 Mio. $ · Ruf und Sponsoren +' },
      { key: 'small', label: 'Schlicht in der Fabrik', sub: '0,5 Mio. $' },
      { key: 'online', label: 'Nur online', sub: 'kostenlos · etwas Ruf −', secondary: true }] };
  if (ev.kind === 'media') {
    const q = MEDIA_Q[Math.floor(hash(`${season.year}${ev.round}media`) * MEDIA_Q.length)];
    return { title: '🎤 Medientag', text: `Frage der Presse: <b>${q.q}</b>`, options: q.a.map((a, i) => ({ key: i, label: a.t })), q };
  }
  if (ev.kind === 'board') {
    const t = m.board.target;
    return {
      title: '🏛 Vorstandssitzung',
      text: `Zwischenbilanz nach Rennen ${ev.round}: Teamwertung <b>P${teamPos}</b>, Saisonziel <b>P${t}</b>, Vertrauen des Vorstands <b>${m.board.rep}</b>.`,
      options: [
        { key: 'budget', label: 'Zusatzbudget beantragen', sub: 'nur bei gutem Vertrauen' },
        { key: 'keep', label: 'Ziel bestätigen', sub: teamPos <= t ? 'auf Kurs' : 'riskant' },
        { key: 'lower', label: 'Ziel senken (P' + Math.min(11, t + 1) + ')', sub: 'Vertrauen −', secondary: true }] };
  }
  if (ev.kind === 'contract') {
    const d = m.drivers[ev.driver];
    return {
      title: `📝 Vertragsende ${ev.driver}`,
      text: `Der Vertrag läuft Ende ${season.year} aus. Gehalt ${money(d.salary)}/Jahr, Stimmung ${d.morale}.`,
      options: [
        { key: 'y1', label: '+1 Jahr', sub: 'Prämie 25 %, Gehalt +8 %' },
        { key: 'y2', label: '+2 Jahre', sub: 'Prämie 40 %, Gehalt +12 %, Stimmung +' },
        { key: 'later', label: 'Später entscheiden', sub: 'Erinnerung in 4 Wochen', secondary: true }] };
  }
  return null;
}

export function resolveAgenda(season, ev, choice, teamPos) {
  const m = season.mgmt;
  m.agenda = m.agenda || {};
  const markDone = () => { m.agenda[ev.id] = true; };
  const allMood = d => { for (const x of Object.values(m.drivers)) x.morale = clamp(x.morale + d, 0, 100); };
  const allSponsors = d => { for (const sp of [m.titleSponsor, ...m.sponsors].filter(Boolean)) sp.happy = clamp((sp.happy ?? 70) + d, 0, 100); };
  if (ev.kind === 'present') {
    markDone();
    if (choice === 'big') { spend(m, 2.5, 'Präsentation: große Show', false); m.board.rep = clamp(m.board.rep + 5, 0, 100); allSponsors(10); m.hype = 1.08; return 'Große Show: Fans und Sponsoren sind begeistert (Ruf +5, Sponsoren zufriedener, bessere Angebote).'; }
    if (choice === 'small') { spend(m, 0.5, 'Präsentation in der Fabrik', false); allSponsors(3); return 'Schlichte Präsentation in der Fabrik – solide.'; }
    m.board.rep = clamp(m.board.rep - 2, 0, 100);
    return 'Nur online präsentiert – das Echo ist mager (Ruf −2).';
  }
  if (ev.kind === 'media') {
    markDone();
    const q = MEDIA_Q[Math.floor(hash(`${season.year}${ev.round}media`) * MEDIA_Q.length)];
    const a = q.a[choice] || q.a[2];
    const e = a.eff;
    if (e.rep) m.board.rep = clamp(m.board.rep + e.rep, 0, 100);
    if (e.morale) allMood(e.morale);
    if (e.sponsor) allSponsors(e.sponsor);
    const parts = [e.rep ? `Ruf ${e.rep > 0 ? '+' : ''}${e.rep}` : '', e.morale ? `Fahrerstimmung ${e.morale > 0 ? '+' : ''}${e.morale}` : '', e.sponsor ? `Sponsoren ${e.sponsor > 0 ? '+' : ''}${e.sponsor}` : ''].filter(Boolean);
    return `🎤 Medientag: ${a.t}${parts.length ? ` (${parts.join(', ')})` : ''}`;
  }
  if (ev.kind === 'board') {
    markDone();
    if (choice === 'budget') {
      if (m.board.rep >= 55 && teamPos <= m.board.target + 1) {
        const extra = { top: 10, mid: 8, back: 6 }[m.tier];
        m.money += extra; book(m, 'Zusatzbudget des Vorstands', extra);
        return `Der Vorstand bewilligt ${money(extra)} Zusatzbudget.`;
      }
      m.board.rep = clamp(m.board.rep - 4, 0, 100);
      return 'Zusatzbudget abgelehnt – erst müssen die Ergebnisse stimmen (Vertrauen −4).';
    }
    if (choice === 'lower') { m.board.target = Math.min(11, m.board.target + 1); m.board.rep = clamp(m.board.rep - 6, 0, 100); return `Saisonziel auf Platz ${m.board.target} gesenkt (Vertrauen −6).`; }
    const ok = teamPos <= m.board.target;
    m.board.rep = clamp(m.board.rep + (ok ? 4 : -2), 0, 100);
    return ok ? 'Der Vorstand ist zufrieden und bestätigt das Ziel (Vertrauen +4).' : 'Ziel bestätigt – der Vorstand erwartet eine Steigerung (Vertrauen −2).';
  }
  if (ev.kind === 'contract') {
    const d = m.drivers[ev.driver];
    if (choice === 'later') {
      const last = raceDate(season, SEASON_2026[SEASON_2026.length - 1]);
      const nxt = addDays(ev.date, 28);
      m.remind = m.remind || {};
      if (nxt < last) { m.remind[ev.driver] = nxt; return `Erinnerung: Vertrag ${ev.driver} am ${fmtDate(nxt)}.`; }
      markDone();
      d.morale = clamp(d.morale - 10, 0, 100);
      d.salary = r1(d.salary * 1.3);
      return `${ev.driver} fühlt sich hingehalten – er bleibt nur zu deutlich höherem Gehalt (+30 %, Stimmung −10).`;
    }
    const years = choice === 'y2' ? 2 : 1;
    const bonus = r1(d.salary * (years === 2 ? 0.4 : 0.25));
    if (m.money < bonus) return 'Nicht genug Geld für die Unterschriftsprämie.';
    markDone();
    spend(m, bonus, `Vertragsverlängerung ${ev.driver} (+${years} J.)`, false);
    d.contractEnd += years;
    d.salary = r1(d.salary * (years === 2 ? 1.12 : 1.08));
    d.morale = clamp(d.morale + (years === 2 ? 14 : 8), 0, 100);
    return `${ev.driver} verlängert bis ${d.contractEnd} (Prämie ${money(bonus)}).`;
  }
  return null;
}
