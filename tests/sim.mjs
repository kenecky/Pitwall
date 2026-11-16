// Headless-Test: ganze Rennen mit KI-Rennleitung und einfachem Teamchef-Skript.
// Aufruf: node tests/sim.mjs [anzahl] [strecke]
import { TEAMS } from '../js/data/teams.js';
import { DRIVERS } from '../js/data/drivers.js';
import { TRACKS } from '../js/data/tracks/index.js';
import { buildTrack } from '../js/sim/trackModel.js';
import { Race } from '../js/sim/race.js';
import { distanceFor } from '../js/sim/length.js';
import { autoDirect } from '../js/control/autoDirector.js';
import { setPace, playerCars, strategyOptions, applyStrategy, teamStep, rejoin, swapCars, lapsLeftOnTyres, tyreLife } from '../js/team/pitwall.js';

const N = +(process.argv[2] || 6);
const only = process.argv[3];
const ids = Object.keys(TRACKS);
let fails = 0;
for (let k = 0; k < N; k++) {
  const tid = only || ids[(k * 7) % ids.length];
  const track = buildTrack(TRACKS[tid]);
  const { laps, full } = distanceFor(track, 'race', k % 2 ? 'short' : 'medium');
  const team = TEAMS[k % TEAMS.length].id;
  const weather = ['dry', 'random', 'changeable', 'rain'][k % 4];
  const race = new Race({ track, teams: TEAMS, drivers: DRIVERS, seed: 1000 + k, weather, laps, fullLaps: full, playerTeam: team });
  const strat = [];
  for (const c of playerCars(race)) { const o = strategyOptions(race, c); applyStrategy(race, c, o[k % 2]); strat.push(`${c.id} ${o[k % 2].key}: ${o[k % 2].name}`); }
  if (k === 0) console.log('   ', strat.join(' | '));
  race.start('standing');
  let steps = 0;
  const t0 = Date.now();
  const mine = playerCars(race);
  while (race.phase !== 'finished' && steps < 400000) {
    race.step();
    autoDirect(race);
    teamStep(race);
    steps++;
    if (steps % 20 === 0 && race.phase === 'running') {
      for (const c of mine) {
        if (c.retired || c.finished || c.boxCall || c.inPit) continue;
        if (c.lap === 5 && c.paceMode === 'normal' && c === mine[0]) setPace(race, c, 'push');
        if (k === 0 && c.lap === 8 && !race.swapTried) { race.swapTried = 1; console.log('    Tausch:', JSON.stringify(swapCars(race)), 'Rejoin', c.id, JSON.stringify((({ loss, pos, free }) => ({ loss: +loss.toFixed(1), pos, free }))(rejoin(race, c))), 'Life', tyreLife(race, c), 'Rd', lapsLeftOnTyres(race, c).toFixed(1)); }
      }
    }
  }
  for (let i = 0; i < 200; i++) { race.step(); autoDirect(race); }
  const st = race.standings();
  const ok = race.phase === 'finished';
  for (const e of race.events) if (/^Teamorder/.test(e.text)) console.log('   ', e.text);
  if (!ok) fails++;
  const ev = race.events;
  const cnt = ty => ev.filter(e => e.type === ty).length;
  const open = race.cases.filter(c => ['new', 'investigating'].includes(c.status)).length;
  const ns = race.neutralStats;
  console.log(`${ok ? 'OK ' : 'ERR'} ${tid.padEnd(12)} ${weather.padEnd(10)} ${laps} R · ${team.padEnd(11)} · ${(race.time / 60).toFixed(0)} min · VSC ${ns.vsc} SC ${ns.sc} Rot ${ns.red} · Fälle ${race.cases.length} offen ${open} · DNF ${st.filter(c => c.retired).length} · ${Date.now() - t0} ms`);
  console.log('    Sieger', st[0].id, '· eigene:', mine.map(c => `${c.id} P${st.indexOf(c) + 1} ${c.stops}St ${[...c.usedCompounds].join('')}${c.retired ? ' DNF' : ''}${c.dsq ? ' DSQ' : ''}`).join(', '), ok ? '' : `phase=${race.phase} lap=${race.leaderLap} neutral=${JSON.stringify(race.neutral && { t: race.neutral.type, p: race.neutral.phase })}`);
}
process.exit(fails ? 1 : 0);
