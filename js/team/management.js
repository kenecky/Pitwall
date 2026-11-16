// Pit Wall – Teammanagement in der Saison (zwischen den Rennen):
// Budget mit Budgetobergrenze, Entwicklung (Aero, Motor, Zuverlässigkeit), Ersatzteile und Antriebseinheiten,
// Personal (Boxencrew, Ingenieure), Fahrerverträge und Stimmung, Sponsorenziele, Vorstand und Ruf.
// Alle Beträge in Mio. $. Der Zustand liegt in season.mgmt (reine Daten, speicherbar).
import { optimum } from './setup.js';

export const CAP = 215;                 // Budgetobergrenze pro Saison (Mio. $)
export const PU_ALLOWANCE = 4;          // Antriebseinheiten pro Saison ohne Strafe
export const OPS = 5.6;                 // Grundbetrieb pro Rennwochenende (zählt zur Budgetobergrenze)
const POS_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

export const DEV = {
  aero:  { name: 'Aerodynamik',      short: 'AERO',  hint: 'mehr Tempo, vor allem auf kurvigen Strecken' },
  motor: { name: 'Motor',            short: 'MOTOR', hint: 'mehr Tempo, vor allem auf schnellen Strecken' },
  rel:   { name: 'Zuverlässigkeit',  short: 'ZUV.',  hint: 'weniger Defekte' },
};
export const DEV_SIZE = {
  small: { name: 'Kleines Update', cost: 4, rounds: 2, gain: 0.6 },
  big:   { name: 'Großes Paket',   cost: 11, rounds: 4, gain: 1.7 },
};
export const STAFF = {
  crew: { name: 'Boxencrew',   hint: 'kürzere Boxenstopps', pay: 0.3 },
  eng:  { name: 'Ingenieure',  hint: 'schnellere Entwicklung, genauere Setup-Einschätzung', pay: 0.4 },
};
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
    board: { target: clamp(rank, 1, 10), rep: 50, msgs: [] },
    ai: Object.fromEntries(teams.filter(t => t.id !== team.id).map(t => [t.id, { pace: 0, rel: 0 }])),
    report: null,
    talked: {},
  };
  // Sponsoren mit Rennzielen (passend zur Stärke des Teams)
  const pool = tier === 'top' ? ['podium', 'top5', 'bothPts', 'both'] : tier === 'mid' ? ['points', 'top5', 'both', 'gain'] : ['points', 'both', 'gain', 'bothPts'];
  for (let i = 0; i < 3; i++) {
    const g = pool[i];
    const reward = { podium: 2.5, top5: 1.8, bothPts: 2.2, both: 0.8, points: 1.5, gain: 0.7 }[g];
    m.sponsors.push({ name: SPONSORS[Math.floor(hash(season.started + team.id + i) * SPONSORS.length + i * 3) % SPONSORS.length], goal: g, reward, hits: 0 });
  }
  m.titleSponsor = { name: SPONSORS[Math.floor(hash(team.id + 'title') * SPONSORS.length)], target: m.board.target, bonus: { top: 20, mid: 14, back: 10 }[tier], perRace: { top: 7.0, mid: 6.2, back: 5.6 }[tier] };
  season.mgmt = m;
  return m;
}

// ---------- Werte des eigenen Teams und der KI-Teams für ein Wochenende ----------
export function teamsForWeekend(season, teams, track) {
  const m = season.mgmt;
  if (!m) return teams;
  const o = optimum(track);
  const wn = (o.wing - 1) / 10;                 // 0 = schnelle Strecke, 1 = viel Abtrieb
  return teams.map(t => {
    if (t.id === season.teamId) {
      const pace = t.pace + m.dev.aero * (0.5 + wn) + m.dev.motor * (1.5 - wn);
      const rel = t.reliability + m.dev.rel * 2 - Math.max(0, m.pu.age - 5) * 3;
      return { ...t, pace: Math.min(100, pace), reliability: clamp(rel, 40, 99), pitCrew: clamp(t.pitCrew + (m.staff.crew - 3) * 3, 60, 99) };
    }
    const a = m.ai[t.id] || { pace: 0, rel: 0 };
    return { ...t, pace: Math.min(100, t.pace + a.pace), reliability: clamp(t.reliability + a.rel, 40, 99) };
  });
}

// Ingenieure: Einschätzung der Setup-Qualität (genauer mit besseren Ingenieuren)
export function engineerEstimate(season, score, seed) {
  const lvl = season.mgmt ? season.mgmt.staff.eng : 3;
  if (lvl < 3) return null;
  const err = (5 - lvl) * 7 * (hash(String(seed)) - 0.5) * 2;
  return clamp(Math.round(score + err), 0, 100);
}

// ---------- Aktionen in der Teamzentrale ----------
export function capLeft(m) { return CAP - m.spent; }

function spend(m, amount, what, capRelevant = true) {
  m.money -= amount;
  if (capRelevant) m.spent += amount;
  (m.log || (m.log = [])).push({ what, amount: -amount });
}

export function startProject(season, type, size) {
  const m = season.mgmt, s = DEV_SIZE[size];
  if (!DEV[type] || !s) return 'Unbekanntes Projekt.';
  if (m.projects.length >= 2) return 'Höchstens zwei Projekte gleichzeitig.';
  if (m.money < s.cost) return 'Nicht genug Geld.';
  if (capLeft(m) < s.cost) return 'Das würde die Budgetobergrenze überschreiten.';
  spend(m, s.cost, `${DEV[type].name}: ${s.name}`);
  const rounds = Math.max(1, s.rounds - (m.staff.eng >= 5 ? 1 : 0));
  const gain = s.gain * (1 + (m.staff.eng - 3) * 0.12);
  m.projects.push({ type, size, rounds, total: rounds, gain: Math.round(gain * 100) / 100 });
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

// Neue Antriebseinheit: ab der fünften gibt es 10 Startplätze Strafe
export function newPowerUnit(season) {
  const m = season.mgmt;
  if (m.pu.age === 0) return 'Die Antriebseinheit ist schon neu.';
  m.pu.used++;
  m.pu.age = 0;
  if (m.pu.used > PU_ALLOWANCE) {
    season.gridPen = season.gridPen || {};
    for (const id of Object.keys(m.drivers)) season.gridPen[id] = (season.gridPen[id] || 0) + 10;
    return `Neue Antriebseinheit Nr. ${m.pu.used} – über dem Kontingent: 10 Startplätze Strafe für beide Fahrer.`;
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
  m.money += prize; m.log.push({ what: 'Preisgeld', amount: prize });
  m.money += m.titleSponsor.perRace; m.log.push({ what: `Titelsponsor ${m.titleSponsor.name}`, amount: m.titleSponsor.perRace });
  for (const s of m.sponsors) {
    const hit = GOALS[s.goal].ok(r);
    s.last = hit;
    if (hit) { s.hits++; m.money += s.reward; m.log.push({ what: `${s.name}: ${GOALS[s.goal].text}`, amount: s.reward }); }
  }
  // Ausgaben: Personal (Budgetobergrenze), Fahrergehälter (nicht), Reparaturen und Ersatzteile
  const staff = m.staff.crew * STAFF.crew.pay + m.staff.eng * STAFF.eng.pay + OPS;   // + Grundbetrieb (Fabrik, Reisen, Logistik)
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
  // Antriebseinheit altert
  m.pu.age++;
  if (m.pu.age >= 6) notes.push(`Die Antriebseinheit hat ${m.pu.age} Wochenenden hinter sich – das Defektrisiko steigt.`);

  // Entwicklung: Projekte fertig?
  for (const p of m.projects) p.rounds--;
  for (const p of m.projects.filter(x => x.rounds <= 0)) {
    m.dev[p.type] = Math.round((m.dev[p.type] + p.gain) * 100) / 100;
    notes.push(`Upgrade fertig: ${DEV[p.type].name} +${p.gain.toFixed(1).replace('.', ',')}.`);
  }
  m.projects = m.projects.filter(x => x.rounds > 0);
  // KI-Teams entwickeln auch (reiche Teams etwas schneller)
  for (const t of teams) {
    if (t.id === season.teamId) continue;
    const a = m.ai[t.id];
    const rich = paceRank(teams, t.id) <= 4 ? 1.15 : 1;
    a.pace = Math.round((a.pace + hash(`${season.round}${t.id}p`) * 0.32 * rich) * 100) / 100;
    a.rel = Math.round((a.rel + hash(`${season.round}${t.id}r`) * 0.25) * 100) / 100;
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
  if (teamPos <= m.titleSponsor.target) { m.money += m.titleSponsor.bonus; out.push(`Saisonziel erreicht: Bonus ${money(m.titleSponsor.bonus)} von ${m.titleSponsor.name}.`); }
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
