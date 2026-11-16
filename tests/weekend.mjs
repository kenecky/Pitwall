// Headless-Test: ganzes Wochenende (Training mit Setup, Qualifying mit manuellen Runs, ggf. Sprint, Rennen)
// Aufruf: node tests/weekend.mjs [strecke] [sprint]
import { TEAMS } from '../js/data/teams.js';
import { DRIVERS } from '../js/data/drivers.js';
import { TRACKS } from '../js/data/tracks/index.js';
import { buildTrack } from '../js/sim/trackModel.js';
import { Race } from '../js/sim/race.js';
import { Session } from '../js/sim/session.js';
import { distanceFor } from '../js/sim/length.js';
import { autoDirect } from '../js/control/autoDirector.js';
import { playerCars, strategyOptions, applyStrategy, teamStep } from '../js/team/pitwall.js';
import { createWeekend, currentKind, applyWeekend, finishSession, setSummary, bestSet, trackSetWear } from '../js/team/weekend.js';
import { feedback, setupScore, SETUP_KEYS } from '../js/team/setup.js';

const tid = process.argv[2] || 'silverstone';
const sprint = process.argv[3] === 'sprint';
const track = buildTrack(TRACKS[tid]);
const team = 'mclaren';
const wk = createWeekend({ parts: sprint ? ['fp', 'sprint', 'quali'] : ['fp', 'quali'], seed: 77, trackId: tid, carIds: DRIVERS.filter(d => d.team === team).map(d => d.id) });
console.log('Ablauf', wk.seq.join(' → '));
let fails = 0;
while (wk.idx < wk.seq.length) {
  const kind = currentKind(wk);
  const isS = ['fp', 'quali', 'sq'].includes(kind);
  const opts = { track, teams: TEAMS, drivers: DRIVERS, seed: 77 + wk.idx, weather: 'dry', kind, length: 'short', playerTeam: team, difficulty: 'medium' };
  if (!isS) {
    const { laps, full } = distanceFor(track, kind, 'short');
    Object.assign(opts, { laps, fullLaps: full, gridOrder: wk.grid[kind], gridPenalties: { ...wk.penalties[kind] } });
  }
  const race = isS ? new Session(opts) : new Race(opts);
  applyWeekend(race, wk);
  race.trackSets = () => { for (const c of playerCars(race)) trackSetWear(race, c); };
  race.onPlayerGarage = car => {
    if (race.kind !== 'fp') return;
    const fb = feedback(track, wk.setup[car.id], car.driver, race.time);
    wk.notes[car.id].push(fb.text);
    // Ingenieur folgt der Rückmeldung
    if (fb.key) { const k = SETUP_KEYS[fb.key]; wk.setup[car.id][fb.key] = Math.max(k.min, Math.min(k.max, wk.setup[car.id][fb.key] - fb.dir)); applyWeekend(race, wk); }
  };
  const mine = playerCars(race);
  if (!isS) for (const c of mine) applyStrategy(race, c, strategyOptions(race, c, wk)[0]);
  race.start('standing');
  if (kind === 'fp') for (const c of mine) race.setAutoRuns(c, true);
  let steps = 0, segSent = -1;
  while (race.phase !== 'finished' && steps < 400000) {
    race.step(); autoDirect(race); teamStep(race); steps++;
    if (isS && kind !== 'fp' && race.segState === 'run' && segSent !== race.segIdx && race.remaining < race.segment.dur * 0.55) {
      segSent = race.segIdx;
      for (const c of mine) {
        const set = bestSet(wk, c.id, 'S');
        console.log(`   ${race.segment.id} ${c.id} fährt raus auf S (${set ? Math.round(set.laps) : '-'} Rd):`, race.playerRun(c, { compound: 'S', push: 2, fuel: 0.06, set }));
      }
    }
  }
  const st = race.standings();
  const ok = race.phase === 'finished';
  if (!ok) fails++;
  console.log(`${ok ? 'OK ' : 'ERR'} ${kind.padEnd(6)} ${(race.time / 60).toFixed(0)} min · Rot ${race.neutralStats.red} · Fälle ${race.cases.length} · eigene: ${mine.map(c => `${c.id} P${st.indexOf(c) + 1}${isS ? ` ${c.bestLap ? c.bestLap.toFixed(2) : '–'} (Verkehr ${(c.sLaps || []).filter(l => l.traffic).length}/${(c.sLaps || []).length})` : ` ${(c.stintLog || []).map(x => x.c + x.laps).join('-')}`}`).join(', ')} · P1 ${st[0].id}`);
  finishSession(wk, race);
}
for (const id of Object.keys(wk.setup)) console.log(id, 'Setup', JSON.stringify(wk.setup[id]), 'Note', setupScore(track, wk.setup[id]), '%', '·', wk.notes[id].slice(-2).join(' / '), '· Softs', JSON.stringify(setSummary(wk, id).S));
console.log('Grid Rennen', (wk.grid.race || []).slice(0, 6).join(' '));
process.exit(fails ? 1 : 0);
