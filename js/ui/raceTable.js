// Pit Wall – Timing-Tabelle im Rennen: Position, Fahrer, Abstand zum Vordermann, letzte Sektoren, Reifen, Stopps.
import { COMPOUNDS } from '../sim/tyres.js';
import { formatLap } from '../sim/race.js';

const sec = s => (s ? `<span class="tt-s ${s.st}">${s.t.toFixed(3).replace('.', ',')}</span>` : '<span class="tt-s">–</span>');

export function renderRaceTable(el, race, selected) {
  const st = race.standings();
  const head = `<div class="tt-row tt-head"><span>P</span><span></span><span>Fahrer</span><span class="r">Int.</span><span class="r">S1</span><span class="r">S2</span><span class="r">S3</span><span>Reifen</span><span class="r">St</span></div>`;
  const rows = st.map((c, i) => {
    let gap;
    if (c.dsq) gap = 'DSQ';
    else if (c.retired) gap = 'OUT';
    else if (race.preStart) gap = '';
    else if (i === 0) gap = c.finished ? '🏁' : 'Leader';
    else if (c.inPit || c.stopTimer > 0) gap = 'BOX';
    else { const g = race.gap(c, st[i - 1]); gap = !g ? '' : g.laps ? `+${g.laps} Rd` : `+${g.time.toFixed(1).replace('.', ',')}`; }
    const s = c.rSec || [];
    const C = COMPOUNDS[c.compound];
    const sel = selected === c.id;
    const det = sel ? `<div class="tt-det">#${c.driver.number} ${c.driver.first} ${c.driver.last} · ${c.team.name} · Letzte Runde ${formatLap(c.lastLap)} · Beste ${formatLap(c.bestLap)} · Startplatz ${c.gridPos}${c.retired && c.dnf ? ` · Ausfall: ${c.dnf}` : ''}</div>` : '';
    return `<div class="tt-row${c.player ? ' mine' : ''}${sel ? ' sel' : ''}${c.retired ? ' out' : ''}" data-id="${c.id}"><span class="p">${c.retired ? '–' : i + 1}</span><span class="tb" style="background:${c.team.color}"></span><span class="n">${c.id}</span><span class="r">${gap}</span>${sec(s[0])}${sec(s[1])}${sec(s[2])}<span class="ty"><i class="pw-tyre ${C.id}">${C.id}</i>${c.tyreAge}</span><span class="r">${c.stops}</span></div>${det}`;
  }).join('');
  el.innerHTML = head + rows;
}

// Strategie-Übersicht nach dem Rennen: Reifen-Stints je Fahrer (sortiert nach Ergebnis)
export function strategyChart(race) {
  const st = race.standings();
  const laps = race.laps;
  const rows = st.map(c => {
    const stints = (c.stints || [{ c: c.compound, from: 0, to: c.lap }]).filter(x => x.to > x.from || x === (c.stints || [])[0]);
    const end = c.retired ? Math.max(...stints.map(x => x.to)) : laps;
    const segs = stints.map((x, i) => {
      const w = Math.max(0.5, (Math.min(x.to, end) - x.from) / laps * 100);
      const label = i < stints.length - 1 ? `<b>${x.to}</b>` : '';
      return `<span class="sc-seg ${x.c}" style="width:${w}%">${label}</span>`;
    }).join('');
    return `<div class="sc-row${c.player ? ' mine' : ''}"><span class="sc-name">${c.driver.last.toUpperCase()}</span><span class="sc-bar">${segs}</span><span class="sc-end">${c.retired ? 'DNF' : end}</span></div>`;
  }).join('');
  return `<div class="sc-legend">${['S', 'M', 'H', 'I', 'W'].map(k => `<span><i class="sc-seg ${k}"></i>${COMPOUNDS[k].name}</span>`).join('')}</div>${rows}`;
}

// Timing-Tabelle in Training/Qualifying: Bestzeit/Abstand, Sektoren der laufenden bzw. letzten schnellen Runde,
// Reifen mit Runden, Status (Aufwärm-/Auslaufrunde, Box)
export function renderSessionTable(el, race, selected, gapMode) {
  let st = race.standings();
  if (race.phase !== 'finished') st = st.filter(c => c.elimSeg === null || c.elimSeg === undefined);
  const lead = st[0] && race.rankTime(st[0]);
  const head = `<div class="tt-row tt-head"><span>P</span><span></span><span>Fahrer</span><span class="r">${gapMode === 'interval' ? 'Int.' : 'Zeit'}</span><span class="r">S1</span><span class="r">S2</span><span class="r">S3</span><span>Reifen</span><span class="r">St</span></div>`;
  const tyreOf = l => (l && l.compound ? ` <i class="pw-tyre ${l.compound}">${l.compound}</i>` : '');
  const rows = st.map((c, i) => {
    const t = race.rankTime(c);
    let gap = '–';
    if (t) {
      if (i === 0) gap = formatLap(t);
      else { const ref = gapMode === 'interval' ? race.rankTime(st[i - 1]) : lead; gap = ref ? `+${(t - ref).toFixed(3).replace('.', ',')}` : formatLap(t); }
    }
    const S = c.tblS || [], T = c.tblT || [];
    const sx = k => (T[k] !== undefined ? `<span class="tt-s ${S[k] || ''}">${T[k].toFixed(3).replace('.', ',')}</span>` : '<span class="tt-s">–</span>');
    const ph = c.prog && c.prog.phase;
    const stat = c.retired ? 'OUT' : c.inGarage ? 'BOX' : c.inPit ? 'BOX' : ph === 'out' ? 'OUT' : ph === 'cool' ? 'IN' : '⏱';
    const laps = c.curSet && c.curSet.lapCount !== undefined ? c.curSet.lapCount : c.tyreAge;
    const sel = selected === c.id;
    const best = (c.sLaps || []).filter(l => l.valid).reduce((b, l) => (!b || l.time < b.time ? l : b), null);
    const last = (c.sLaps || [])[(c.sLaps || []).length - 1];
    const det = sel ? `<div class="tt-det">#${c.driver.number} ${c.driver.first} ${c.driver.last} · ${c.team.name} · Beste ${best ? best.label + tyreOf(best) : '–'} · Letzte ${last ? last.label + tyreOf(last) : '–'} · ${(c.sLaps || []).length} gezeitete Runden${c.retired && c.dnf ? ` · Ausfall: ${c.dnf}` : ''}</div>` : '';
    return `<div class="tt-row${c.player ? ' mine' : ''}${sel ? ' sel' : ''}${c.retired ? ' out' : ''}" data-id="${c.id}"><span class="p">${i + 1}</span><span class="tb" style="background:${c.team.color}"></span><span class="n">${c.id}</span><span class="r">${gap}</span>${sx(0)}${sx(1)}${sx(2)}<span class="ty"><i class="pw-tyre ${c.compound}">${c.compound}</i>${laps}</span><span class="r">${stat}</span></div>${det}`;
  }).join('');
  el.innerHTML = head + rows;
}
