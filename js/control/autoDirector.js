// Pit Wall: Die Rennleitung arbeitet automatisch im Hintergrund (KI).
// Start, Flaggen, VSC/Safety Car/rote Flagge, Einsatzfahrzeuge, Neustarts und Urteile der Kommissare.
// Wird nach jedem Simulationsschritt aufgerufen (Browser und Node-Test gleich).
import { NEED_LEVEL, cornerLabel } from '../sim/hazards.js';
import { setSectorFlag } from './flags.js';
import { decide, noFurtherAction } from './stewards.js';
import { deployVSC, endVSC, deploySC, allowUnlap, scInThisLap, redFlag, restartRace, canRestart } from '../sim/neutral.js';
import { deployMedical, deploySweeper, deployCrane, recallCrane, setPitClosed, svc } from '../sim/services.js';
import { ALL_ON, sendInspection, releaseFormation, startLights, lightsOut, abortStart, startFromGridBehindSC, canResumeStart, resumeStart, restartLights, restartLightsOut } from '../sim/start.js';
import { showBlackOrange } from '../sim/events.js';

// Eigener, vom Rennen getrennter Zufall: die KI soll den Zufallsstrom der Simulation nicht verschieben
function rnd(ad) {
  ad.s = (ad.s * 1664525 + 1013904223) >>> 0;
  return ad.s / 4294967296;
}

function state(race) {
  if (!race.ad) race.ad = { s: (race.seed * 7919 + 17) >>> 0, seen: {}, clearSince: null, caseAt: {}, hold: null, redStopAt: null, verdicts: 0 };
  return race.ad;
}

export function autoDirect(race) {
  const ad = state(race);
  if (race.isSession) { sessionDirect(race, ad); return; }
  const t = race.time;
  switch (race.phase) {
    case 'pre': return;
    case 'ready': return readyPhase(race, ad);
    case 'grid': return gridPhase(race, ad);
    case 'lights':
      if (ad.hold === null) ad.hold = ALL_ON + 0.3 + rnd(ad) * 1.8;
      if (race.lightsTimer >= ad.hold) { lightsOut(race); ad.hold = null; }
      return;
    case 'delay':
      securityFor(race, ad, t);
      if (canResumeStart(race)) resumeStart(race);
      return;
    case 'formation': return;
    default: break;
  }
  const n = race.neutral;
  if (n && n.type === 'red' && n.restart) return restartPhase(race, ad, n);
  securityFor(race, ad, t);
  if (race.phase === 'running') neutralize(race, ad, t);
  blackOrange(race, ad);
  stewards(race, ad, t);
}

// ---------- Vor dem Start ----------
function readyPhase(race, ad) {
  if (!race.inspection) { sendInspection(race); return; }
  securityFor(race, ad, race.time);
  const I = race.inspection;
  const busy = (race.sc && race.sc.inspection) || race.hazards.some(h => !h.ended)
    || (race.svc && (race.svc.medical || race.svc.sweeper));
  if (I.stage === 'done' && !busy) {
    for (const c of svc(race).cranes.slice()) recallCrane(race, c.sector);
    clearFlags(race);
    releaseFormation(race);
  }
}

function gridPhase(race, ad) {
  const f = race.formation;
  const issue = race.startIssue;
  if (issue && !issue.released) {
    if (issue.type === 'stall') { abortStart(race); return; }
    if (issue.type === 'rain') { startFromGridBehindSC(race); return; }
  }
  if (f && f.arrived && f.gridT > 2 + rnd(ad) * 2) startLights(race);
}

function restartPhase(race, ad, n) {
  if (n.phase === 'grid' && race.formation && race.formation.arrived) { restartLights(race); ad.hold = null; return; }
  if (n.phase === 'lights') {
    if (ad.hold === null) ad.hold = ALL_ON + 0.3 + rnd(ad) * 1.5;
    if (n.lightsTimer >= ad.hold) { restartLightsOut(race); ad.hold = null; }
  }
}

// ---------- Gefahren absichern ----------
function securityFor(race, ad, t) {
  const open = race.hazards.filter(h => !h.ended);
  for (const h of open) {
    // Reaktionszeit der Rennleitung: 2–6 s
    if (ad.seen[h.id] === undefined) ad.seen[h.id] = t + 2 + rnd(ad) * 4;
    if (t < ad.seen[h.id]) continue;
    if (!h.global && (h.need === 'yellow' || h.need === 'double')) {
      const want = h.need;
      const cur = race.flags[h.sector];
      if (cur !== 'double' && cur !== want) setSectorFlag(race, h.sector, want);
    } else if (!h.global && NEED_LEVEL[h.need] >= 3 && race.flags[h.sector] !== 'double') {
      setSectorFlag(race, h.sector, 'double');
    }
    if (h.need === 'pit') setPitClosed(race, true);
    const s = svc(race);
    const scOut = (race.neutral && (race.neutral.type === 'sc' || race.neutral.type === 'red')) || race.phase === 'delay' || race.phase === 'ready';
    if (h.needsCrane && !h.global && !s.cranes.some(c => c.sector === h.sector)) deployCrane(race, h.sector);
    if (h.medical && !h.medicalDone && !s.medical && scOut) deployMedical(race, h.sector);
    if (h.needsSweeper && !h.swept && !s.sweeper && scOut) deploySweeper(race, h.sector);
    // Kehrmaschine ohne SC nötig? Dann wenigstens VSC → SC (macht neutralize über need)
    if (h.needsSweeper && !h.swept && !scOut && race.phase === 'running' && !race.neutral && h.work !== null && h.work < h.workTotal * 0.5 && deployVSC(race)) race.emit('rc', `Grund für das virtuelle Safety Car: Reinigung nötig – ${h.desc || 'Schmutz auf der Fahrbahn'}${h.corner ? ` (${cornerLabel(h.corner)})` : ''}.`);
  }
  // Aufräumen: Flaggen in Sektoren ohne offene Gefahr, Kräne zurück, Boxengasse auf
  for (let i = 0; i < race.flags.length; i++) {
    if (race.flags[i] === 'clear') continue;
    const busy = race.hazards.some(h => h.sector === i && (!h.ended || t - h.endTime < 3));
    if (!busy) setSectorFlag(race, i, 'clear');
  }
  const s = svc(race);
  for (const c of s.cranes.slice()) {
    if (!race.hazards.some(h => !h.ended && h.sector === c.sector && h.needsCrane)) recallCrane(race, c.sector);
  }
  if (s.pitClosed && !open.some(h => h.need === 'pit')) setPitClosed(race, false);
}

function clearFlags(race) {
  for (let i = 0; i < race.flags.length; i++) if (race.flags[i] !== 'clear') setSectorFlag(race, i, 'clear');
}

// ---------- VSC, Safety Car, rote Flagge ----------
function neutralize(race, ad, t) {
  const open = race.hazards.filter(h => !h.ended && t >= (ad.seen[h.id] ?? Infinity));
  // Sweeper ohne SC: auf SC hochstufen, sobald die Reinigung stockt
  const needSweep = open.some(h => h.needsSweeper && !h.swept && h.work !== null && h.work < h.workTotal * 0.45);
  let need = Math.max(0, ...open.map(h => NEED_LEVEL[h.need] || 0));
  if (needSweep) need = Math.max(need, 4);
  const n = race.neutral;
  const lvl = n ? { vsc: 3, sc: 4, red: 5 }[n.type] : 0;
  const leader = race.standings()[0];
  const lapsLeft = race.laps - (leader ? leader.lap : 0);

  if (need >= 5 && lvl < 5) { if (redFlag(race)) reason(race, open, 5, 'die rote Flagge'); ad.redStopAt = null; return; }
  if (need === 4 && lvl < 4) { if (deploySC(race)) reason(race, open, 4, 'das Safety Car', needSweep); ad.clearSince = null; return; }
  if (need === 3 && lvl < 3) { if (deployVSC(race)) reason(race, open, 3, 'das virtuelle Safety Car'); ad.clearSince = null; return; }

  if (!n) return;
  // Wie lange ist die Gefahr schon beseitigt (für das aktuelle Niveau)?
  const stillNeeded = need >= lvl;
  if (stillNeeded) { ad.clearSince = null; }
  else if (ad.clearSince === null) ad.clearSince = t;
  const clearFor = ad.clearSince === null ? 0 : t - ad.clearSince;

  if (n.type === 'vsc' && n.phase === 'active' && !stillNeeded && clearFor > 3) endVSC(race);
  if (n.type === 'sc' && n.phase === 'out' && race.sc && !race.sc.waiting && !n.finish) {
    if (!stillNeeded && t - n.start > 50) {
      if (!n.unlap && clearFor > 4 && lapsLeft > 3) allowUnlap(race);
      const unlapping = race.cars.some(c => c.unlap);
      if ((n.unlap || lapsLeft <= 3) && !unlapping && clearFor > 8) scInThisLap(race);
    }
  }
  if (n.type === 'red' && n.phase === 'stopped') {
    // Rennleitung kündigt Zeit und Art des Neustarts an (Log + Popup), verschiebt bei Bedarf
    if (!n.restartAt) {
      const est = Math.max(0, ...race.hazards.filter(h => !h.ended).map(h => (h.work || 0) / (WORK_RED[h.need] || 1)));
      n.restartMode = race.weather.wetness > 0.55 ? 'sc' : 'standing';
      n.restartAt = t + Math.ceil(Math.max(240, est + 90) / 60) * 60;
      notice(race, `Neustart in ${Math.round((n.restartAt - t) / 60)} Minuten – ${n.restartMode === 'sc' ? 'hinter dem Safety Car' : 'stehender Start aus der Startaufstellung'}. Reifenwechsel in der Boxengasse sind frei.`);
    } else if (t >= n.restartAt) {
      if (canRestart(race)) {
        restartRace(race, n.restartMode);
      } else {
        n.restartAt = t + 120;
        notice(race, 'Neustart verschoben – die Strecke ist noch nicht frei. Neuer Neustart in 2 Minuten.');
      }
    }
  }
}

// Schwarz-Orange bei losem Frontflügel oder wenn das Team mit Schaden draußen bleiben will
function blackOrange(race, ad) {
  if (race.phase !== 'running') return;
  for (const c of race.cars) {
    if (c.boShown || c.retired || c.finished || c.inPit) continue;
    if (c.wingLoose || (c.damage && c.damageStayOut)) {
      const key = 'bo' + c.id;
      if (ad.seen[key] === undefined) ad.seen[key] = race.time + 8 + rnd(ad) * 15;
      if (race.time >= ad.seen[key]) showBlackOrange(race, c);
    }
  }
}

// ---------- Kommissare ----------
// Urteile nach etwa 20–90 s. Meist richtig, manchmal zu mild/hart (realistische Streuung).
function stewards(race, ad, t) {
  for (const c of race.cases) {
    if (c.status !== 'new' && c.status !== 'investigating') continue;
    if (ad.caseAt[c.id] === undefined) ad.caseAt[c.id] = t + (race.phase === 'finished' ? 2 : 20 + rnd(ad) * 70);
    if (t < ad.caseAt[c.id] && race.phase !== 'finished') continue;
    judge(race, ad, c);
  }
}

function judge(race, ad, c) {
  const tr = c.truth || {};
  if (c.type === 'protest') {
    decide(race, c, tr.unfounded ? { carId: null, penalty: 'keep', points: 0 } : { carId: null, penalty: 'none', points: 0 });
    return;
  }
  const x = rnd(ad);
  if (!tr.offender) {
    if (x < 0.06 && c.cars && c.cars.length && (c.options || []).includes('warning')) decide(race, c, { carId: c.cars[0], penalty: 'warning', points: 0 });
    else noFurtherAction(race, c);
    return;
  }
  const exp = tr.expected || ['warning'];
  let penalty = exp[Math.floor(rnd(ad) * exp.length)];
  if (x < 0.07) penalty = 'none';                          // übersehen / anders bewertet
  const pts = tr.points ? tr.points[0] + Math.round(rnd(ad) * (tr.points[1] - tr.points[0])) : 0;
  if (penalty === 'none') noFurtherAction(race, c);
  else decide(race, c, { carId: tr.offender, penalty, points: pts });
}

// Bergungstempo unter Rot je Gefahrenstufe (wie hazards.js, Spalte „Rot“)
const WORK_RED = { yellow: 3, double: 4, vsc: 3, sc: 2.5, red: 1, pit: 1 };

// Mitteilung der Rennleitung: im Log und als Popup (race.rcNotices)
function notice(race, text) {
  race.emit('rc', `RENNLEITUNG: ${text}`);
  (race.rcNotices || (race.rcNotices = [])).push({ t: race.time, text });
}

// ---------- Training / Qualifying ----------
// Flaggen wie im Rennen; statt VSC/SC gibt es nur die rote Flagge (Uhr steht). Danach Fortsetzung oder Abbruch.
function sessionDirect(race, ad) {
  if (race.phase !== 'running') return;
  const t = race.time;
  securityFor(race, ad, t);
  const n = race.neutral;
  const open = race.hazards.filter(h => !h.ended && t >= (ad.seen[h.id] ?? Infinity));
  const need = Math.max(0, ...open.map(h => NEED_LEVEL[h.need] || 0));
  if (!n && need >= 4 && race.segState === 'run' && !race.segFlag) { race.sessionRedFlag(); ad.sessRedAt = null; }
  if (n && n.type === 'red' && n.phase === 'stopped') {
    if (ad.sessRedAt == null) ad.sessRedAt = t;
    if (!race.hazards.some(h => !h.ended) && t - ad.sessRedAt > 45) {
      if (race.remaining < 50) race.sessionAbandon(); else race.sessionResume();
      ad.sessRedAt = null;
    }
  }
  stewards(race, ad, t);
}

// Begründung der Rennleitung für VSC, Safety Car und rote Flagge (im Log)
const TYPE_TEXT = {
  crash: 'schwerer Unfall', stopped: 'liegengebliebenes Auto', spin: 'Dreher', slow: 'langsames Auto auf der Strecke',
  debris: 'Trümmerteile auf der Strecke', oil: 'Öl auf der Fahrbahn', gravel: 'Kies auf der Fahrbahn', animal: 'Tier auf der Strecke',
  manhole: 'loser Gullydeckel', weather: 'zu viel Wasser auf der Strecke', storm: 'Unwetter', heli: 'Rettungshubschrauber kann nicht fliegen',
  puncture: 'Reifenteile auf der Strecke', wheel: 'verlorenes Rad auf der Strecke', pit: 'Hindernis in der Boxengasse',
};
function reason(race, open, level, what, sweep = false) {
  const hs = open.filter(h => (NEED_LEVEL[h.need] || 0) >= level);
  let h = hs.sort((a, b) => (NEED_LEVEL[b.need] || 0) - (NEED_LEVEL[a.need] || 0))[0];
  let text;
  if (!h && sweep) {
    h = open.find(x => x.needsSweeper && !x.swept);
    text = `Die Kehrmaschine muss auf die Strecke${h && h.corner ? ` (${cornerLabel(h.corner)})` : ''} – ${h ? (h.desc || TYPE_TEXT[h.type] || 'Reinigung') : 'Reinigung'}`;
  } else if (h) {
    const where = h.global ? '' : h.corner ? ` (${cornerLabel(h.corner)}, Sektor ${h.sector + 1})` : ` (Sektor ${h.sector + 1})`;
    text = `${h.desc || TYPE_TEXT[h.type] || 'Gefahr auf der Strecke'}${where}`;
  } else text = 'Gefahr auf der Strecke';
  race.emit('rc', `Grund für ${what}: ${text}.`);
}
