// Erzeugt js/data/neutralStats.js: Rate von VSC, Safety Car und roter Flagge je Strecke (pro Runde),
// aus simulierten Rennen mit Zufallswetter. Aufruf: node tools/gen_neutral_stats.mjs [Rennen je Strecke]
import { writeFileSync } from 'node:fs';
import { TEAMS } from '../js/data/teams.js';
import { DRIVERS } from '../js/data/drivers.js';
import { TRACKS } from '../js/data/tracks/index.js';
import { buildTrack } from '../js/sim/trackModel.js';
import { Race } from '../js/sim/race.js';
import { distanceFor } from '../js/sim/length.js';
import { autoDirect } from '../js/control/autoDirector.js';
import { teamStep } from '../js/team/pitwall.js';
const N = Number(process.argv[2] || 8);
const out = {};
for (const id of Object.keys(TRACKS)) {
  const track = buildTrack(TRACKS[id]);
  let laps = 0, vsc = 0, sc = 0, red = 0;
  for (let k = 0; k < N; k++) {
    const { laps: l, full } = distanceFor(track, 'race', 'medium');
    const race = new Race({ track, teams: TEAMS, drivers: DRIVERS, seed: 1000 + k * 17, weather: 'random', kind: 'race', laps: l, fullLaps: full, playerTeam: null, difficulty: 'hard' });
    race.start('standing');
    let s = 0;
    while (race.phase !== 'finished' && s < 800000) { race.step(); autoDirect(race); teamStep(race); s++; }
    laps += l; vsc += race.neutralStats.vsc || 0; sc += race.neutralStats.sc || 0; red += race.neutralStats.red || 0;
  }
  out[id] = { vsc: +(vsc / laps).toFixed(5), sc: +(sc / laps).toFixed(5), red: +(red / laps).toFixed(5) };
  console.log(id, JSON.stringify(out[id]));
}
writeFileSync(new URL('../js/data/neutralStats.js', import.meta.url), `// Automatisch erzeugt mit tools/gen_neutral_stats.mjs – Ereignisse pro Runde (aus ${N} simulierten Rennen je Strecke).
// Wahrscheinlichkeit für mindestens ein Ereignis in n Runden: 1 − e^(−Rate · n)
export const NEUTRAL_STATS = ${JSON.stringify(out, null, 1)};
`);
