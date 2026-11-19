// Pit Wall – Saison 2026: Kalender, Wochenend-Format je Strecke, Punkte, Fahrer- und Teamwertung.
import { SEASON_2026 } from '../data/season2026.js';

export const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
export const SPRINT_POINTS = [8, 7, 6, 5, 4, 3, 2, 1];
// Sprint-Wochenenden 2026 (laut veröffentlichtem Kalender; anpassbar)
export const SPRINT_TRACKS = ['shanghai', 'miami', 'montreal', 'silverstone', 'zandvoort', 'singapore'];

export function newSeason(teamId) {
  return { version: 1, year: 2026, teamId, round: 0, results: [], driverPts: {}, teamPts: {}, gridPen: {}, started: Date.now(), date: '2026-01-19' };   // Vorsaison ab Mitte Januar
}

export function currentEntry(season) { return SEASON_2026[season.round] || null; }
export function seasonOver(season) { return season.round >= SEASON_2026.length; }

// Ablauf des Wochenendes: Sprint-Strecken mit Sprint-Qualifying und Sprint
export function weekendParts(trackId) {
  return SPRINT_TRACKS.includes(trackId) ? ['fp', 'sprint', 'quali'] : ['fp', 'quali'];
}

// Ergebnis eines Wochenendes übernehmen (Punkte, Startplatzstrafen fürs nächste Rennen)
export function recordWeekend(season, wk, drivers) {
  const entry = currentEntry(season);
  const teamOf = Object.fromEntries(drivers.map(d => [d.id, d.team]));
  const add = (id, p) => {
    if (!p) return;
    season.driverPts[id] = (season.driverPts[id] || 0) + p;
    season.teamPts[teamOf[id]] = (season.teamPts[teamOf[id]] || 0) + p;
  };
  const score = (res, table) => (res || []).forEach((r, i) => { if (!r.retired && !r.dsq) add(r.id, table[i] || 0); });
  score(wk.results.sprint, SPRINT_POINTS);
  score(wk.results.race, POINTS);
  season.results.push({
    round: entry.round, track: entry.track,
    race: (wk.results.race || []).map(r => ({ id: r.id, retired: r.retired, dsq: r.dsq })),
    sprint: wk.results.sprint ? wk.results.sprint.map(r => ({ id: r.id, retired: r.retired, dsq: r.dsq })) : null,
    grid: wk.grid.race,
  });
  season.gridPen = {};
  for (const p of wk.carry || []) season.gridPen[p.carId] = (season.gridPen[p.carId] || 0) + p.places;
  season.date = `${season.year}${entry.date.slice(4)}`;   // Spieldatum: Renntag
  season.round++;
}

export function driverStandings(season, drivers) {
  return drivers.map(d => ({ d, pts: season.driverPts[d.id] || 0, wins: season.results.filter(r => r.race[0] && r.race[0].id === d.id).length }))
    .filter(x => x.d.team || x.pts > 0)   // Fahrer ohne Cockpit nur, wenn sie Punkte haben
    .sort((a, b) => b.pts - a.pts || b.wins - a.wins);
}
export function teamStandings(season, teams) {
  return teams.map(t => ({ t, pts: season.teamPts[t.id] || 0 })).sort((a, b) => b.pts - a.pts);
}
// Platzierung eines Fahrers in einem gespeicherten Ergebnis
export function finishOf(list, id) {
  if (!list) return null;
  const i = list.findIndex(r => r.id === id);
  if (i < 0) return null;
  const r = list[i];
  return r.dsq ? 'DSQ' : r.retired ? 'DNF' : `P${i + 1}`;
}
