// Headless-Test Karriere (ohne Rennen): Entlassung, Angebote, Wechsel während der Saison, Saisonende, neue Saison.
import { TEAMS } from '../js/data/teams.js';
import { DRIVERS } from '../js/data/drivers.js';
import { newSeason } from '../js/team/season.js';
import { initManagement } from '../js/team/management.js';
import { initCareer, careerAfterWeekend, careerSeasonEnd, acceptOffer, startNewSeason, repNeeded } from '../js/team/career.js';

const name = id => TEAMS.find(t => t.id === id).name;
let fails = 0;
const check = (ok, text) => { console.log(`${ok ? 'OK ' : 'ERR'} ${text}`); if (!ok) fails++; };

console.log('Nötiger Ruf:', TEAMS.map(t => `${t.short} ${Math.round(repNeeded(TEAMS, t.id))}`).join(' · '));

// 1) Schwaches Ergebnis → Entlassung nach Rennen 5 → Angebote schwächerer Teams
let s = newSeason('mclaren');
initManagement(s, TEAMS, DRIVERS);
initCareer(s);
let notes = [];
for (let r = 1; r <= 6 && !s.career.fired; r++) {
  s.round = r;
  s.mgmt.board.rep = 12;
  notes = careerAfterWeekend(s, TEAMS, 0, 22);
}
check(s.career.fired, `Entlassung bei McLaren nach Rennen ${s.round} · Ruf ${s.career.rep}`);
check(s.career.offers.length > 0, `Angebote danach: ${s.career.offers.map(o => name(o.teamId)).join(', ')}`);
const o1 = s.career.offers[0];
s = acceptOffer(s, TEAMS, DRIVERS, o1.teamId);
check(s.teamId === o1.teamId && !s.career.fired && s.mgmt, `Wechsel zu ${name(s.teamId)} · Ziel P${s.mgmt.board.target} · Konto ${s.mgmt.money}`);

// 2) Starke Saison → Angebot eines stärkeren Teams nach Rennen 8 oder 16
let t = newSeason('williams');
initManagement(t, TEAMS, DRIVERS);
initCareer(t).rep = 82;
let mid = [];
for (const r of [8, 16]) { t.round = r; mid = mid.concat(careerAfterWeekend(t, TEAMS, 8, 1.5)); }
check(t.career.offers.length > 0, `Angebote während der Saison (Ruf ${t.career.rep}): ${t.career.offers.map(o => name(o.teamId)).join(', ') || '–'}`);

// 3) Saisonende: Ziel übertroffen → Ruf steigt, neue Saison mit altem Team
t.round = 24;
t.teamPts[t.teamId] = 120;
const endNotes = careerSeasonEnd(t, TEAMS, 5);
check(t.career.history.length === 1 && t.career.rep > 82, `Saisonende: ${endNotes.join(' | ')}`);
const t2 = startNewSeason(t, TEAMS, DRIVERS);
check(t2.year === 2027 && t2.round === 0 && t2.teamId === 'williams' && t2.career.history.length === 1, `Neue Saison ${t2.year} mit ${name(t2.teamId)} · Verlauf ${t2.career.history.length}`);
// Angebot für die nächste Saison annehmen
if (t.career.offers.length) {
  const t3 = acceptOffer(t, TEAMS, DRIVERS, t.career.offers[0].teamId);
  check(t3.year === 2027 && t3.teamId === t.career.offers[0].teamId, `Angebot für 2027 angenommen: ${name(t3.teamId)}`);
}
JSON.parse(JSON.stringify(t2));
process.exit(fails ? 1 : 0);
