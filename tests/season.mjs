// Headless-Test: Saison – zwei Wochenenden, Spielstand mitten im Rennen speichern und laden, Punkte und Wertung.
import { TEAMS } from '../js/data/teams.js';
import { DRIVERS } from '../js/data/drivers.js';
import { TRACKS } from '../js/data/tracks/index.js';
import { buildTrack } from '../js/sim/trackModel.js';
import { Race } from '../js/sim/race.js';
import { Session } from '../js/sim/session.js';
import { distanceFor } from '../js/sim/length.js';
import { autoDirect } from '../js/control/autoDirector.js';
import { serializeRace, restoreRace } from '../js/sim/persist.js';
import { playerCars, strategyOptions, applyStrategy, teamStep } from '../js/team/pitwall.js';
import { radioStep } from '../js/team/radio.js';
import { createWeekend, currentKind, applyWeekend, finishSession, trackSetWear } from '../js/team/weekend.js';
import { initManagement, teamsForWeekend, afterWeekend, damageFrom, startProject, money } from '../js/team/management.js';
import { newSeason, currentEntry, weekendParts, recordWeekend, driverStandings, teamStandings } from '../js/team/season.js';

const team = 'williams';
let season = newSeason(team);
initManagement(season, TEAMS, DRIVERS);
console.log('Projekt:', startProject(season, 'aero', 'small') || 'gestartet', '· Konto', money(season.mgmt.money), '· Ziel P' + season.mgmt.board.target);
let fails = 0;
for (let w = 0; w < 2; w++) {
  const entry = currentEntry(season);
  const track = buildTrack(TRACKS[entry.track]);
  let wk = createWeekend({ parts: weekendParts(entry.track), seed: 300 + w, trackId: entry.track, carIds: DRIVERS.filter(d => d.team === team).map(d => d.id) });
  wk.season = true;
  while (wk.idx < wk.seq.length) {
    const kind = currentKind(wk);
    const isS = ['fp', 'quali', 'sq'].includes(kind);
    const opts = { track, teams: teamsForWeekend(season, TEAMS, track), drivers: DRIVERS, seed: wk.seed + wk.idx * 101, weather: 'random', kind, length: 'short', playerTeam: team, difficulty: 'medium' };
    if (!isS) { const { laps, full } = distanceFor(track, kind, 'short'); Object.assign(opts, { laps, fullLaps: full, gridOrder: wk.grid[kind], gridPenalties: { ...wk.penalties[kind] } }); }
    let race = isS ? new Session(opts) : new Race(opts);
    const hook = r => { applyWeekend(r, wk); r.trackSets = () => { for (const c of playerCars(r)) trackSetWear(r, c); }; };
    hook(race);
    if (!isS) for (const c of playerCars(race)) applyStrategy(race, c, strategyOptions(race, c, wk)[0]);
    race.start('standing');
    if (isS) for (const c of playerCars(race)) race.setAutoRuns(c, true);
    let steps = 0, saved = false;
    while (race.phase !== 'finished' && steps < 400000) {
      race.step(); autoDirect(race); teamStep(race); radioStep(race); steps++;
      // Mitten im Rennen: speichern (JSON wie IndexedDB) und neu laden
      if (kind === 'race' && !saved && race.leaderLap > race.laps / 2) {
        saved = true;
        const data = JSON.parse(JSON.stringify({ wk, race: serializeRace(race) }));
        wk = data.wk;
        const r2 = restoreRace({ track, teams: TEAMS, drivers: DRIVERS, data: data.race });
        if (!r2) { console.log('ERR Laden fehlgeschlagen'); fails++; break; }
        for (const c of r2.cars) if (c.player) { c.curSet = c.curSet ? wk.sets[c.id].find(x => x.id === c.curSet.id) : null; }
        hook(r2);
        console.log(`   gespeichert/geladen in Runde ${race.leaderLap}: Führender ${race.standings()[0].id} = ${r2.standings()[0].id}`);
        race = r2;
      }
    }
    const ok = race.phase === 'finished';
    const u = damageFrom(race); wk.used = { wing: (wk.used?.wing || 0) + u.wing, chassis: (wk.used?.chassis || 0) + u.chassis };
    if (kind === 'race') wk.moods = Object.fromEntries(playerCars(race).map(c => [c.id, Math.round(c.mood)]));
    if (!ok) fails++;
    console.log(`${ok ? 'OK ' : 'ERR'} R${entry.round} ${entry.track.padEnd(10)} ${kind.padEnd(6)} eigene: ${playerCars(race).map(c => `${c.id} P${race.standings().indexOf(c) + 1}`).join(', ')}`);
    finishSession(wk, race);
  }
  recordWeekend(season, wk, DRIVERS);
  const notes = afterWeekend(season, TEAMS, DRIVERS, season.results[season.results.length - 1], wk.used || {}, wk.moods || {});
  const m = season.mgmt;
  console.log(`   Bericht: Konto ${money(m.money)} · Cap ${money(m.spent)} · Ruf ${m.board.rep} · Aero ${m.dev.aero} · PU-Alter ${m.pu.age} · Stimmung ${Object.entries(m.drivers).map(([k, d]) => k + ' ' + d.morale).join(' ')} · ${notes.join(' | ')}`);
  console.log('   Buchungen:', m.report.log.map(l => `${l.what} ${l.amount.toFixed(1)}`).join('; '));
  season = JSON.parse(JSON.stringify(season));
}
console.log('Fahrer:', driverStandings(season, DRIVERS).slice(0, 5).map(x => `${x.d.id} ${x.pts}`).join(' · '));
console.log('Teams :', teamStandings(season, TEAMS).map(x => `${x.t.short} ${x.pts}`).join(' · '));
console.log('Runde jetzt', season.round, '· Startplatzstrafen', JSON.stringify(season.gridPen));
process.exit(fails ? 1 : 0);
