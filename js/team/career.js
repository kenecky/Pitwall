// Pit Wall – Karriere als Teamchef: Ruf über alle Saisons, Angebote anderer Teams, Entlassung, Teamwechsel,
// neue Saison. Zustand in season.career (wird in jede neue Saison übernommen).
import { initManagement, regShakeUp } from './management.js';
import { nextDriverSeason, applyRoster } from './drivers.js';
import { newSeason } from './season.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}
// Rang nach Grundtempo (1 = stärkstes Team) – bestimmt Ansehen des Teams und nötigen Ruf
export function teamRank(teams, id) {
  return [...teams].sort((a, b) => b.pace - a.pace).findIndex(t => t.id === id) + 1;
}
// Nötiger Ruf als Teamchef für ein Angebot dieses Teams (Top-Team ~85, Hinterbänkler ~35)
export function repNeeded(teams, id) {
  return 30 + (teams.length - teamRank(teams, id)) * 5.5;
}

export function initCareer(season) {
  if (!season.career) season.career = { rep: 50, history: [], offers: [], fired: false, teams: [season.teamId] };
  return season.career;
}

function makeOffer(season, teams, t, why) {
  return { teamId: t.id, target: clamp(teamRank(teams, t.id), 1, 10), until: season.round + 2, why, year: season.year };
}

// Angebote erzeugen. mode: 'mid' (während der Saison), 'end' (Saisonende), 'fired' (nach Entlassung)
function offersFor(season, teams, mode) {
  const c = season.career;
  const myRank = teamRank(teams, season.teamId);
  const out = [];
  const others = teams.filter(t => t.id !== season.teamId && !c.offers.some(o => o.teamId === t.id));
  if (mode === 'fired') {
    // Nach einer Entlassung: nur schwächere Teams, mindestens eines
    const weak = others.filter(t => teamRank(teams, t.id) >= Math.max(myRank, teams.length - 4)).sort((a, b) => teamRank(teams, a.id) - teamRank(teams, b.id));
    const pick = weak.length ? weak : others.sort((a, b) => teamRank(teams, b.id) - teamRank(teams, a.id));
    for (const t of pick.slice(0, 2)) out.push(makeOffer(season, teams, t, 'braucht einen neuen Teamchef und gibt dir eine zweite Chance.'));
    return out;
  }
  for (const t of others) {
    const rk = teamRank(teams, t.id);
    const need = repNeeded(teams, t.id);
    if (c.rep < need) continue;
    const step = rk < myRank;                         // Aufstieg zu einem stärkeren Team
    const p = (step ? 0.35 : 0.12) + (c.rep - need) / 100;
    if (hash(`${season.year}${season.round}${t.id}${mode}`) < p) out.push(makeOffer(season, teams, t, step ? 'ist von deiner Arbeit beeindruckt und will dich als Teamchef.' : 'sucht einen erfahrenen Teamchef.'));
  }
  return out.sort((a, b) => teamRank(teams, a.teamId) - teamRank(teams, b.teamId)).slice(0, 2);
}

// Nach jedem Wochenende: Ruf als Teamchef, Entlassung, Angebote
export function careerAfterWeekend(season, teams, lastPts, expected) {
  const c = initCareer(season);
  const m = season.mgmt;
  const notes = [];
  c.rep = clamp(Math.round(c.rep + clamp((lastPts - expected) / 4, -3, 3)), 0, 100);
  c.offers = c.offers.filter(o => o.until >= season.round);
  // Entlassung: Vorstand hat das Vertrauen verloren (frühestens nach 5 Rennen)
  if (m && m.board.rep < 15 && season.round >= 5 && !c.fired) {
    c.fired = true;
    c.rep = clamp(c.rep - 15, 0, 100);
    c.history.push({ year: season.year, team: season.teamId, round: season.round, end: 'entlassen' });
    c.offers = offersFor(season, teams, 'fired');
    notes.push('<b>Du wurdest entlassen.</b> Der Vorstand hat das Vertrauen verloren. Wähle ein neues Team (Karriere).');
    return notes;
  }
  if (season.round === 8 || season.round === 16) {
    const fresh = offersFor(season, teams, 'mid');
    c.offers.push(...fresh);
    for (const o of fresh) notes.push(`📩 Angebot: <b>${teams.find(t => t.id === o.teamId).name}</b> ${o.why} (Karriere)`);
  }
  return notes;
}

// Saisonende: Ruf nach Zielerreichung, Angebote für die nächste Saison
export function careerSeasonEnd(season, teams, teamPos) {
  const c = initCareer(season);
  const target = season.mgmt ? season.mgmt.board.target : teamRank(teams, season.teamId);
  const diff = target - teamPos;
  c.rep = clamp(Math.round(c.rep + (diff >= 0 ? 8 + diff * 4 : diff * 4)), 0, 100);
  if (teamPos === 1) c.rep = clamp(c.rep + 10, 0, 100);
  if (!c.fired) c.history.push({ year: season.year, team: season.teamId, pos: teamPos, target, pts: season.teamPts[season.teamId] || 0 });
  c.offers = offersFor(season, teams, 'end').map(o => ({ ...o, until: 999, next: true }));
  const notes = [`Ruf als Teamchef: ${c.rep}/100.`];
  for (const o of c.offers) notes.push(`📩 Angebot für ${season.year + 1}: <b>${teams.find(t => t.id === o.teamId).name}</b> ${o.why}`);
  return notes;
}

// Angebot annehmen: während der Saison ab dem nächsten Wochenende, sonst für die neue Saison
export function acceptOffer(season, teams, drivers, teamId) {
  const c = initCareer(season);
  const o = c.offers.find(x => x.teamId === teamId);
  if (!o) return null;
  if (o.next || season.round >= 24) return startNewSeason(season, teams, drivers, teamId);
  if (!c.fired) c.history.push({ year: season.year, team: season.teamId, round: season.round, end: 'gewechselt' });
  season.teamId = teamId;
  c.fired = false;
  c.offers = [];
  if (!c.teams.includes(teamId)) c.teams.push(teamId);
  initManagement(season, teams, drivers);
  season.mgmt.board.target = o.target;
  return season;
}

// Neue Saison (gleiches oder neues Team); Karriere wird übernommen
export function startNewSeason(old, teams, drivers, teamId = old.teamId) {
  const s = newSeason(teamId);
  s.year = old.year + 1;
  s.date = `${s.year}-01-19`;
  s.career = { ...initCareer(old), offers: [], fired: false };
  if (!s.career.teams.includes(teamId)) s.career.teams.push(teamId);
  // Neues Reglement: Kräfteverhältnis aus der Entwicklung der Vorsaison
  s.regAdj = regShakeUp(old, teams);
  const regs = old.mgmt && old.mgmt.regs;
  if (s.regAdj && regs) s.regNote = { type: regs.type, size: regs.size || 'medium', mine: s.regAdj[teamId] || 0 };
  // Auto verändert: das Setup-Optimum verschiebt sich (mittel ±1, groß ±2 je Einstellung) – alte Setups passen schlechter
  s.lastRegSize = regs ? regs.size || 'medium' : null;
  // Fahrermarkt: Verträge, Entwicklung, Rücktritte, Transfers, Nachwuchs
  const dm = nextDriverSeason(old, s.year, teams, (old.mgmt && old.mgmt.academy) || 0);
  s.drv = dm.drv;
  s.drvNotes = dm.notes;
  applyRoster(s);
  s.eraShift = { ...(old.eraShift || {}) };
  s.regEra = old.regEra || 0;
  if (regs && regs.size !== 'small') {
    s.regEra++;
    const amp = regs.size === 'big' ? 2 : 1;
    for (const k of ['fwing', 'rwing', 'height', 'stiff', 'diff', 'brake']) s.eraShift[k] = Math.max(-3, Math.min(3, (s.eraShift[k] || 0) + Math.round((hashStr(`${s.year}${k}era`) * 2 - 1) * amp)));
  }
  initManagement(s, teams, drivers);
  // Geld wird ins neue Jahr übertragen, die Akademie bleibt
  if (old.mgmt && teamId === old.teamId) {
    const carry = Math.round(old.mgmt.money * 10) / 10;
    s.mgmt.money = Math.round((s.mgmt.money + carry) * 10) / 10;
    s.mgmt.ledger = s.mgmt.ledger || [];
    s.mgmt.carry = carry;
    s.mgmt.academy = old.mgmt.academy || 0;
  }
  return s;
}

function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}
