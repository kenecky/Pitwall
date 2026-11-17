// Training und Qualifying: Autos starten aus der Garage, fahren Aufwärm-, schnelle und
// Auslaufrunden; Session-Uhr (steht bei Rot), Q1–Q3 mit Ausscheiden, Bestzeiten.
import { Race, DT, formatLap, aggressionOf, errorsOf } from './race.js';
import { COMPOUNDS, bestCompound } from './tyres.js';
import { rollLapIncidents } from './hazards.js';
import { createLapCase, createImpedingCase } from './incidents.js';
import { sessionDurations } from './length.js';
import { rollPitQueue, rollSlowOutlap, rollOutlapPass } from './cases2.js';
import { rollParcFerme } from './regs.js';
import { prepareScrutiny } from './scrutiny.js';
import { isStraight } from './energy.js';

export const SESSION_INFO = {
  fp:    { name: 'Freies Training',   short: 'FP', segments: [{ id: 'FP', dur: 1200 }] },
  quali: { name: 'Qualifying',        short: 'Q',  segments: [{ id: 'Q1', dur: 600, keep: 16 }, { id: 'Q2', dur: 480, keep: 10 }, { id: 'Q3', dur: 420 }] },
  sq:    { name: 'Sprint-Qualifying', short: 'SQ', segments: [{ id: 'SQ1', dur: 420, keep: 16 }, { id: 'SQ2', dur: 360, keep: 10 }, { id: 'SQ3', dur: 300 }] },
};
const OUTLAP_RATIO = 1.5;   // Erfahrungswert, wird im Lauf der Session durch gemessene Out-Laps ersetzt

export class Session extends Race {
  constructor(opts) {
    // Abschnittsdauern je nach Einstellung „Dauer“
    const base = SESSION_INFO[opts.kind];
    const { segs, brk } = sessionDurations(opts.kind, opts.length || 'full');
    const info = { ...base, brk, segments: base.segments.map((x, i) => ({ ...x, dur: segs[i] ?? x.dur })) };
    const total = info.segments.reduce((s, x) => s + x.dur, 0) + brk * (info.segments.length - 1);
    super({ ...opts, laps: 999, durationSec: total });
    this.info = info;
    this.segIdx = 0;
    this.clock = 0;          // aktive Zeit im Abschnitt (steht bei Rot)
    this.segFlag = false;    // Zielflagge des Abschnitts
    this.segState = 'run';   // run | break
    this.breakLeft = 0;
    this.lapSeq = 0;
    this.sessionBest = null;
  }

  get isSession() { return true; }

  get segment() { return this.info.segments[this.segIdx]; }

  get remaining() { return Math.max(0, this.segment.dur - this.clock); }

  get leaderLap() { return 0; }

  emit(type, text, data = {}) {
    super.emit(type, text, data);
    const e = this.events[this.events.length - 1];
    e.lap = 0;
    if (this.info) e.seg = this.segment.id;
  }

  // ---------- Rote Flagge (Session-Uhr steht, alle in die Garage) ----------

  sessionRedFlag() {
    if (this.phase !== 'running' || this.segState !== 'run' || (this.neutral && this.neutral.type === 'red')) return false;
    this.neutral = { type: 'red', phase: 'stopping', start: this.time, session: true, clearAnnounced: false };
    this.neutralStats.red++;
    for (const c of this.cars) {
      c.pass = null;
      if (!c.inGarage && c.prog.phase !== 'garage') { c.prog.phase = 'cool'; c.prog.pushLeft = 0; c.redAbort = true; c.boxInPrev = null; }
    }
    this.emit('rc', `ROTE FLAGGE – ${this.info.name} unterbrochen, die Uhr steht. Alle Autos in die Box.`);
    return true;
  }

  // Rote Flagge: Session wird nicht wieder aufgenommen (z. B. kurz vor Schluss)
  sessionAbandon() {
    const n = this.neutral;
    if (!n || n.type !== 'red' || n.phase !== 'stopped') return false;
    this.abandonLeft = this.remaining;
    this.neutral = null;
    this.clock = this.segment.dur;
    this.segFlag = true;
    this.emit('rc', `${this.info.name}${this.info.segments.length > 1 ? ` – ${this.segment.id}` : ''} wird nicht wieder aufgenommen. Es gelten die bisherigen Zeiten.`);
    return true;
  }

  sessionResume() {
    const n = this.neutral;
    if (!n || n.type !== 'red' || n.phase !== 'stopped' || this.hazards.some(h => !h.ended)) return false;
    this.neutral = null;
    for (const c of this.cars) {
      for (let i = c.prog.runIdx; i < c.prog.runs.length; i++) {
        c.prog.runs[i].depart = Math.max(c.prog.runs[i].depart, this.clock + this.rng.range(15, 90));
      }
      // Wer durch Rot einen Versuch verloren hat, bekommt einen neuen (sofern Zeit bleibt)
      // (eigene Autos nur mit Auto-Programm – sonst entscheidet der Teamchef selbst)
      if (c.prog.runIdx >= c.prog.runs.length && c.elimSeg === null && !c.retired && this.remaining > 150 && (!c.player || c.autoRuns)) {
        c.prog.runs.push({ depart: this.clock + this.rng.range(20, 80), push: 1, compound: 'S', fuel: 0.05 });
      }
    }
    this.emit('rc', `${this.info.name} wird fortgesetzt – noch ${Math.ceil(this.remaining / 60)} Minuten.`);
    return true;
  }

  // ---------- Aufbau: alle Autos in der Garage ----------

  setupGrid() {
    const tr = this.track;
    const span = Math.max(30, Math.min(190, (tr.pit.exit > tr.pit.box ? tr.pit.exit - tr.pit.box : 200) - 30));
    const teams = [...new Set(this.cars.map(c => c.team.id))];
    this.cars.forEach((c, i) => {
      const ti = teams.indexOf(c.team.id);
      c.garageOffset = 3 + (ti * 2 + (i % 2)) * (span / (teams.length * 2));
      c.gridPos = i + 1;
      c.d = tr.pit.box + c.garageOffset;
      c.inPit = true;
      c.inGarage = true;
      c.stopTimer = Infinity;
      c.stoppedThisVisit = true;
      c.launchUntil = -1;
      c.reaction = 0;
      c.compound = 'S';
      c.plan = [];
      c.fuel = 0.2;
      c.sLaps = [];          // gezeitete Runden: { id, seg, time, valid, label }
      c.prog = { runs: [], runIdx: 0, phase: 'garage', pushLeft: 0 };
      c.elimSeg = null;
      c.lapNoise = this.newLapNoise(c);
    });
  }

  start() {
    if (this.phase !== 'pre') return;
    this.phase = 'running';
    this.time = 0;
    this.startSegment(0);
  }

  startSegment(i) {
    this.segIdx = i;
    this.clock = 0;
    // Sektorzeiten (violett/grün/gelb) gelten je Session bzw. Q1/Q2/Q3: zurücksetzen
    this.bestSec = [Infinity, Infinity, Infinity];
    for (const c of this.cars) { c.pbSec = [Infinity, Infinity, Infinity]; c.lastSecs = null; c.curSecs = []; }
    this.segFlag = false;
    this.segState = 'run';
    const seg = this.segment;
    this.emit('start', `${this.info.name}${this.info.segments.length > 1 ? ` – ${seg.id}` : ''} beginnt (${Math.round(seg.dur / 60)} Minuten).`);
    for (const c of this.cars) {
      if (c.retired || c.elimSeg !== null) { c.prog.runs = []; continue; }
      // Pit Wall: eigene Autos fahren nur auf Anweisung (oder im Auto-Programm des Ingenieurs)
      const runs = c.player && !c.autoRuns ? [] : this.planRuns(c, seg, 0);
      c.prog = { runs, runIdx: 0, phase: c.inGarage ? 'garage' : c.prog.phase, pushLeft: c.prog.pushLeft || 0 };
    }
    this.planTows(seg);
  }

  // KI-Teams auf Windschatten-Strecken: ein Fahrer fährt so raus, dass er auf seiner Aufwärmrunde vor dem
  // Teamkollegen (auf dessen schneller Runde) herfährt. Der Geber muss in der Out- oder In-Lap sein.
  planTows(seg) {
    if (this.kind === 'fp' || this.towGain < 0.15) return;
    const teams = new Map();
    for (const c of this.cars) if (!c.player && !c.retired && (c.elimSeg ?? null) === null && c.prog.runs.length) (teams.get(c.team.id) || teams.set(c.team.id, []).get(c.team.id)).push(c);
    for (const pair of teams.values()) {
      if (pair.length !== 2 || !this.rng.chance(0.2 + this.towGain)) continue;
      const [R, G] = pair[0].driver.pace >= pair[1].driver.pace ? pair : [pair[1], pair[0]];
      // erster Run des Schnelleren; der Geber fährt danach direkt seine eigene schnelle Runde
      const rr = R.prog.runs[0], gr = G.prog.runs[0];
      const dep = rr.depart + this.outLapEstimate() - this.track.baseLap * 0.3 - 4;
      if (dep + this.outLapEstimate() + 10 > seg.dur) continue;
      gr.depart = dep; gr.towGive = true;
    }
  }

  // Ausfahrten eines Autos für den Abschnitt (ab Session-Uhr „from“)
  planRuns(c, seg, from = 0) {
    const out = Math.round(this.track.baseLap * 1.25 + 25);   // Boxengasse + Aufwärmrunde
    {
      const r = this.rng;
      const lap = this.track.baseLap;
      let runs;
      if (this.kind === 'fp') {
        // Je nach Dauer 1–3 Ausfahrten, die längeren mit mehr Sprit
        const n = seg.dur >= 1000 ? 3 : seg.dur >= 650 ? 2 : 1;
        const slot = seg.dur / n;
        const maxPush = Math.max(1, Math.floor((slot - out - 50) / lap));
        runs = [];
        for (let j = 0; j < n; j++) {
          runs.push({
            depart: j * slot + r.range(0.04, 0.4) * slot,
            push: r.int(Math.min(2, maxPush), Math.min(maxPush, j === 0 ? 6 : 4)),
            compound: j === n - 1 ? 'S' : r.pick(['M', 'H', 'S']),
            fuel: j === n - 1 ? r.range(0.1, 0.4) : r.range(0.3, 0.9),
          });
        }
      } else {
        const last = { depart: Math.max(15, seg.dur - out - lap * r.range(0.15, 0.7)), push: 1, compound: 'S', fuel: 0.05 };
        const cycle = out + lap * 2 + 20;     // Garage → schnelle Runde → zurück
        runs = seg.dur >= 2 * cycle + 60
          ? [{ depart: r.range(20, seg.dur * 0.3), push: r.chance(0.4) ? 2 : 1, compound: 'S', fuel: 0.08 }, last]
          : [{ ...last, depart: r.range(Math.min(20, last.depart), last.depart) }];
      }
      return runs.filter(x => x.depart >= from - 1);
    }
  }

  // ---------- Pit Wall: Befehle für eigene Autos ----------
  // Sofort rausfahren mit gewählter Mischung, Anzahl schneller Runden und Sprit
  // tow: ID des Teamkollegen, der Windschatten gibt · gap: Abstand zum Vordermann aufbauen (freie Fahrt)
  playerRun(car, { compound = 'S', push = 1, fuel = 0.1, set = null, delay = 0, gap = false } = {}) {
    if (!car.inGarage || car.retired || car.elimSeg !== null || this.segFlag || this.segState !== 'run' || (this.neutral && this.neutral.type === 'red')) return false;
    car.prog.runs.splice(car.prog.runIdx, 0, { depart: this.clock + delay, push, compound, fuel, gap });
    car.nextSet = set;
    return true;
  }
  // Auto reinholen (nach der laufenden Runde in die Box)
  playerBoxIn(car) {
    if (car.inGarage || !car.prog || car.prog.phase === 'cool') return false;
    car.boxInPrev = { phase: car.prog.phase, pushLeft: car.prog.pushLeft };
    car.prog.phase = 'cool';
    return true;
  }
  // Reinholen zurücknehmen (verklickt) – solange das Auto noch nicht in der Boxengasse ist
  playerCancelBoxIn(car) {
    const p = car.boxInPrev;
    if (!p || car.inGarage || car.inPit || this.segFlag) return false;
    car.prog.phase = p.phase;
    car.prog.pushLeft = p.pushLeft;
    car.boxInPrev = null;
    return true;
  }
  // Auto-Programm des Ingenieurs für den Rest des Abschnitts
  setAutoRuns(car, on) {
    car.autoRuns = on;
    if (on && car.elimSeg === null) car.prog.runs.splice(car.prog.runIdx, Infinity, ...this.planRuns(car, this.segment, this.clock).map(x => ({ ...x, depart: Math.max(x.depart, this.clock) })));
    else car.prog.runs.splice(car.prog.runIdx, Infinity);
  }

  // Gummi baut sich mit jedem Auto auf der Strecke auf (über die ganze Session), Regen baut ihn ab
  rubberStep() {
    if (this.rubber === undefined) this.rubber = 0;
    const total = this.info.segments.reduce((sum, x) => sum + x.dur, 0);
    const onTrack = this.cars.filter(c => !c.inGarage && !c.retired).length;
    const rain = this.weather.rain || 0, wet = this.weather.wetness || 0;
    if (wet > 0.15 || rain > 0.1) this.rubber = Math.max(0, this.rubber - DT * (0.0015 + rain * 0.004));
    else this.rubber = Math.min(1, this.rubber + DT * (0.15 + onTrack / 22) / (total * 0.55));
  }

  // KI-Entscheidung vor dem letzten Run in Q1/Q2: Zeit sicher genug? Top-Teams bleiben öfter drin – und manchmal
  // ist ein Team zu sicher und fliegt doch noch raus.
  skipLastRun(c) {
    const seg = this.segment;
    if (!seg.keep || this.kind === 'fp') return false;
    const mine = c.segBest && c.segBest[this.segIdx];
    if (!mine) return false;
    const rk = this.segmentRanking();
    const pos = rk.indexOf(c) + 1;
    if (pos < 1 || pos > seg.keep) return false;   // unter dem Strich: immer noch mal raus
    const cut = rk[seg.keep - 1];
    const cutT = cut && cut.segBest && cut.segBest[this.segIdx];
    const timed = rk.filter(x => x.segBest && x.segBest[this.segIdx] !== undefined).length;
    // Polster: Abstand zur aktuellen Grenze, abzüglich der erwarteten Verbesserung der anderen (Streckenentwicklung)
    const margin = cutT && timed >= seg.keep ? cutT - mine - 0.35 : (seg.keep - pos) * 0.12 - 0.2;
    const top = c.team.pace >= 88;
    let p = margin > 0.6 ? 0.9 : margin > 0.3 ? 0.6 : margin > 0.1 ? 0.3 : 0.04;
    if (top) p = Math.min(0.97, p + 0.15);
    if (pos > seg.keep - 2) p *= 0.3;
    const skip = this.rng.chance(p);
    if (skip) this.emit('info', `${c.id} bleibt in der Box – ${c.team.name} hält die Zeit für sicher genug (P${pos}).`, { cars: [c.id] });
    return skip;
  }

  // Pit Wall: drei Zeitsektoren (je ein Drittel der Runde). Auf schnellen Runden wird jeder Sektor bewertet:
  // 'p' violett = absolute Bestzeit, 'g' grün = persönliche Bestzeit, 'y' gelb = keine Verbesserung.
  sectorCheck() {
    const L = this.track.L;
    if (!this.bestSec) this.bestSec = [Infinity, Infinity, Infinity];
    for (const c of this.cars) {
      if (c.retired || c.inGarage) { c.secIdx = null; c.curSecs = []; c.lastSecs = null; continue; }
      const idx = Math.min(2, Math.floor((((c.d % L) + L) % L) / (L / 3)));
      if (c.secIdx === null || c.secIdx === undefined) { c.secIdx = idx; c.secStart = this.time; c.curSecs = []; c.secPush = false; continue; }
      if (idx === c.secIdx) continue;
      const done = c.secIdx;
      const t = this.time - c.secStart;
      c.secStart = this.time;
      c.secIdx = idx;
      if (c.secPush && c.curSecs.length === done) {
        if (!c.pbSec) c.pbSec = [Infinity, Infinity, Infinity];
        let st = 'y';
        if (t < this.bestSec[done]) {
          st = 'p'; this.bestSec[done] = t;
          // Nur einer kann violett haben: beim bisherigen Halter wird der Sektor grün
          for (const o of this.cars) {
            if (o === c) continue;
            if (o.curSecs && o.curSecs[done] === 'p') o.curSecs[done] = 'g';
            if (o.lastSecs && o.lastSecs[done] === 'p') o.lastSecs[done] = 'g';
          }
        }
        else if (t < c.pbSec[done]) st = 'g';
        if (t < c.pbSec[done]) c.pbSec[done] = t;
        c.curSecs.push(st);
      }
      if (idx === 0) {
        // neue Runde: fertige schnelle Runde bis Ende Sektor 1 weiter anzeigen
        if (c.curSecs.length === 3) c.lastSecs = c.curSecs;
        c.curSecs = [];
        c.secPush = c.prog && c.prog.phase === 'push';
      } else if (idx === 1) c.lastSecs = null;
    }
  }

  // Verkehr: Auto auf schneller Runde dicht hinter einem anderen (verwirbelte Luft, Behinderung)
  trafficCheck() {
    const tr = this.track, L = tr.L;
    const on = this.cars.filter(c => !c.retired && !c.inPit && !c.inGarage);
    for (const c of on) {
      c.dirty = false;
      c.tow = false;
      c.towing = null;
      let best = Infinity, ahead = null;
      for (const o of on) {
        if (o === c) continue;
        const g = ((o.d - c.d) % L + L) % L;
        if (g < best) { best = g; ahead = o; }
      }
      c.aheadGap = best; c.aheadId = ahead ? ahead.id : null;
      if (c.prog.phase !== 'push') continue;
      // Windschatten vom Teamkollegen: im richtigen Abstand kein Nachteil, sondern Gewinn auf den Geraden
      // Windschatten: Teamkollege vorne gibt ihn auf seiner Aufwärm- oder Auslaufrunde, im richtigen Abstand
      if (ahead && ahead.team === c.team && this.givesTow(ahead) && best >= c.v * 0.3 && best <= c.v * 2.2) { c.tow = true; ahead.towing = c.id; continue; }
      if (best < Math.max(40, c.v * 1.2)) { c.dirty = true; c.trafficT = (c.trafficT || 0) + DT; }
    }
  }

  // ---------- Simulation ----------

  step() {
    if (this.phase === 'pre' || this.phase === 'finished') return;
    if (this.segState === 'break') {
      // Pause: erst wenn alle Autos zurück in der Box sind, läuft die Pausenzeit
      if (this.cars.some(c => !c.retired && !c.inGarage)) super.step();
      else {
        this.time += DT;
        if (!this.breakRunning) {
          this.breakRunning = true;
          const mins = this.breakLeft / 60;
          this.emit('info', `Alle Autos in der Box – ${this.info.segments[this.segIdx + 1].id} beginnt in ${mins >= 1 ? `${String(Math.round(mins * 10) / 10).replace('.', ',')} Minuten` : `${this.breakLeft} Sekunden`}.`);
        }
        this.breakLeft -= DT;
      }
      if (this.breakLeft <= 0) this.startSegment(this.segIdx + 1);
      return;
    }
    const red = this.neutral && this.neutral.type === 'red';
    if (!red) {
      this.clock += DT;
      if (!this.segFlag && this.clock >= this.segment.dur) {
        this.segFlag = true;
        this.emit('chequered', `Zielflagge für ${this.segment.id}. Begonnene Runden dürfen noch beendet werden.`);
        for (const c of this.cars) if (c.prog.phase === 'out') c.prog.phase = 'cool';
      }
      // Abfahrten aus der Garage
      if (!this.segFlag) {
        for (const c of this.cars) {
          const run = c.prog.runs[c.prog.runIdx];
          if (!c.inGarage || c.retired || !run || this.clock < run.depart) continue;
          // KI im Qualifying: Ist die Zeit sicher genug, bleibt das Auto für den letzten Run in der Box
          if (!c.player && c.prog.runIdx > 0 && this.skipLastRun(c)) { c.prog.runs.splice(c.prog.runIdx); continue; }
          c.prog.runIdx++;
          c.prog.current = run;
          c.stopTimer = 0.001;   // → leaveGarage über finishStop
        }
      }
    }
    super.step();
    this.rubberStep();
    this.trafficCheck();
    this.sectorCheck();
    const n = this.neutral;
    if (n && n.type === 'red' && n.phase === 'stopping' && this.cars.every(c => c.retired || c.inGarage)) {
      n.phase = 'stopped';
      this.emit('rc', 'Alle Autos sind in der Box.');
    }
    // Abschnitt endet, wenn die letzte gezeitete Runde beendet ist (Auslaufrunden zählen nicht)
    if (this.segFlag && !n && this.cars.every(c => c.retired || c.inGarage || c.prog.phase !== 'push')) this.endSegment();
  }

  // Geschätzte Dauer der Out-Lap (Garage bis Start der schnellen Runde) in Sekunden
  outLapEstimate() {
    return this.outLapAvg || this.track.baseLap * OUTLAP_RATIO;
  }

  // Wert des Windschattens je Strecke (s pro Runde): viele lange Geraden → viel (Monza ~0,35), Monaco ~0
  get towGain() {
    if (this._towGain === undefined) {
      // Vollgas-Geraden messen: Länge über 350 m zählt, die längste Gerade zusätzlich
      const tr = this.track, step = tr.ds * 2, n = Math.ceil(tr.L / step);
      let s0 = 0;
      for (let i = 0; i < n; i++) if (!isStraight(tr, i * step)) { s0 = i; break; }
      let run = 0, sum = 0, longest = 0;
      for (let k = 0; k <= n; k++) {
        if (isStraight(tr, ((s0 + k) % n) * step)) run += step;
        else { if (run > 350) sum += run - 350; longest = Math.max(longest, run); run = 0; }
      }
      this._towGain = Math.round((0.13 * sum + 0.12 * Math.max(0, longest - 700)) / 10) / 100;
    }
    return this._towGain;
  }

  givesTow(car) {
    return Boolean(car.towGive && car.prog && (car.prog.phase === 'out' || car.prog.phase === 'cool') && !car.inPit && !car.inGarage);
  }
  // Teamkollege, der hinter dem Geber auf der schnellen Runde ist (oder gleich beginnt): Abstand in m, sonst null
  towTarget(car) {
    const L = this.track.L;
    const mate = this.cars.find(o => o !== car && o.team === car.team && !o.retired && !o.inGarage && !o.inPit && o.prog && (o.prog.phase === 'push' || o.prog.phase === 'out'));
    if (!mate) return null;
    const behind = ((car.d - mate.d) % L + L) % L;
    return behind < Math.max(55, car.v) * 15 ? { mate, behind } : null;
  }

  programFactor(car) {
    const ph = car.prog && car.prog.phase;
    if (this.givesTow(car)) {
      // Windschatten geben: auf den Teamkollegen warten, dann mit ~1 s Vorsprung voll vorneweg
      const t = this.towTarget(car);
      if (t) {
        const v = Math.max(55, t.mate.v);   // Abstand in Sekunden des Teamkollegen
        return t.behind > v * 1.6 ? 0.78 : t.behind > v * 0.5 ? 1.04 : 1.08;   // kalte Reifen: voll attackieren
      }
    }
    if (ph === 'out' && !car.inPit && car.wantGap) {
      const v = Math.max(55, car.v), g = car.aheadGap ?? Infinity;
      return g < v * 5.5 ? 0.62 : 0.82;   // freie Fahrt: Lücke zum Vordermann aufmachen (~5 s)
    }
    if (ph === 'out') return 0.82;
    if (ph === 'cool') return 0.72;
    return 1;
  }

  lapTarget(car) {
    const base = super.lapTarget(car);
    // Rennsprit-Anteil aus der Basis entfernen, Session-Sprit und Streckenentwicklung einrechnen
    const progress = Math.min(1, Math.max(0, car.d / (this.laps * this.track.L)));
    // Streckenentwicklung: Gummi auf der Strecke (Q1 → Q3 immer schneller, Regen wäscht ihn ab)
    const evolution = -(this.kind === 'fp' ? 0.6 : 0.9) * (this.rubber || 0);
    return base - 2.2 * (1 - progress) + 2.2 * (car.fuel ?? 0.2) + evolution + (car.dirty ? 0.4 : 0) - (car.tow ? this.towGain : 0);
  }

  // Autos auf Aufwärm-/Auslaufrunde lassen Autos auf schneller Runde vorbei – meistens
  yieldsTo(B, A) {
    if (!B.prog || !A.prog || B.prog.phase !== 'push' || A.prog.phase === 'push') return false;
    if (A.team === B.team && this.givesTow(A)) return false;   // Windschatten: vorne bleiben
    const key = `${A.id}>${B.id}:${B.lap}`;
    this.impedeChecked = this.impedeChecked || {};
    if (!this.impedeChecked[key]) {
      this.impedeChecked[key] = true;
      if (this.kind !== 'fp' && this.rng.chance(0.009 * aggressionOf(A) / 70)) {
        const lost = this.rng.range(0.2, 1.2);
        B.slowUntil = this.time + 1.2 + lost;
        B.compromised = true;
        createImpedingCase(this, A, B, lost);
        A.impedeUntil = this.time + 2.5;
        return false;
      }
    }
    return !(A.impedeUntil > this.time);
  }

  sessionPitDecision(car) {
    if (this.neutral && this.neutral.type === 'red') return 'garage';
    if (car.prog.phase === 'cool') return 'garage';
    return null;
  }

  enterGarage(car) {
    car.toGarage = false;
    car.stoppedThisVisit = true;
    car.inGarage = true;
    car.stopTimer = Infinity;
    car.v = 0;
    car.move = 0;
    car.d += Math.max(0, car.garageOffset - 2);
    car.prog.phase = 'garage';
    car.boxInPrev = null;
    car.pass = null;
    car.wantGap = false; car.tow = false; car.towing = null;
    if (!car.player) car.towGive = false;
    if (car.player && this.onPlayerGarage) this.onPlayerGarage(car);
  }

  // Aus der Garage losfahren
  finishStop(car) {
    if (!car.inGarage) { super.finishStop(car); return; }
    const run = car.prog.current || { compound: 'S', push: 1, fuel: 0.1 };
    const w = this.weather.wetness;
    car.compound = w > 0.15 ? bestCompound(w, 20) : run.compound;
    car.fuel = run.fuel;
    car.tyreAge = 0; car.tyreWear = 0;
    if (car.player && this.onPlayerTyres) this.onPlayerTyres(car);
    car.runLaps = [];
    car.inGarage = false;
    car.stopTimer = 0;
    car.stoppedThisVisit = true;
    car.prog.phase = 'out';
    if (!car.player) car.towGive = Boolean(run.towGive);   // eigene Autos: Schalter des Teamchefs
    car.wantGap = Boolean(run.gap);
    car.outStartD = car.d;
    car.outT0 = this.time;
    rollPitQueue(this, car);
    rollSlowOutlap(this, car);   // Aufwärmrunde zählt erst ab einer vollen Runde
    if (run.gap || car.towGive) rollSlowOutlap(this, car);   // wer Abstand sucht, fährt öfter zu langsam
    rollOutlapPass(this, car);
    car.prog.pushLeft = run.push;
    car.compromised = false;
  }

  onSessionLap(car, lapTime) {
    const p = car.prog;
    if (p.phase === 'push' && !car.inPit) {
      const rec = {
        id: ++this.lapSeq, seg: this.segIdx, time: lapTime, valid: !car.compromised,
        label: formatLap(lapTime), compromised: Boolean(car.compromised), traffic: (car.trafficT || 0) > 1.5,
      };
      car.trafficT = 0;
      if (car.runLaps) car.runLaps.push(rec);
      rec.valid = true;
      car.sLaps.push(rec);
      car.compromised = false;
      this.recalcBest(car);
      if (!this.sessionBest || lapTime < this.sessionBest.time) {
        this.sessionBest = { carId: car.id, time: lapTime };
        this.emit('fastest', `Bestzeit: ${car.id} ${formatLap(lapTime)}`, { cars: [car.id] });
      }
      // Track Limits auf der gezeiteten Runde?
      if (this.rng.chance((this.kind === 'fp' ? 0.012 : 0.025) * (errorsOf(car) / 28))) {
        createLapCase(this, car, rec, this.rng.pick(this.track.corners).id);
      }
      rollLapIncidents(this, car);
      p.pushLeft--;
      p.phase = p.pushLeft > 0 && !this.segFlag ? 'push' : 'cool';
    } else if (p.phase === 'out') {
      if (car.d - (car.outStartD ?? -Infinity) < this.track.L * 0.6) return;   // nur über die Linie in der Boxengasse
      p.phase = this.segFlag ? 'cool' : 'push';
      car.trafficT = 0;
      // Dauer Garage → Start der schnellen Runde (für den Renningenieur), ohne Neutralisierung
      if (car.outT0 !== undefined && !this.neutral) {
        const d = this.time - car.outT0;
        this.outLapAvg = this.outLapAvg ? this.outLapAvg * 0.8 + d * 0.2 : d;
      }
    }
  }

  recalcBest(car) {
    const valid = car.sLaps.filter(l => l.valid);
    car.bestLap = valid.length ? Math.min(...valid.map(l => l.time)) : null;
    car.segBest = {};
    for (const l of valid) if (car.segBest[l.seg] === undefined || l.time < car.segBest[l.seg]) car.segBest[l.seg] = l.time;
  }

  deleteLap(car, lapId) {
    const l = car.sLaps.find(x => x.id === lapId);
    if (!l || !l.valid) return;
    l.valid = false;
    this.recalcBest(car);
    this.emit('rc', `Rundenzeit ${l.label} von ${car.id} gestrichen (Track Limits).`, { cars: [car.id] });
  }

  endSegment() {
    const seg = this.segment;
    const ranked = this.segmentRanking();
    if (seg.keep && this.segIdx < this.info.segments.length - 1) {
      const keep = Math.min(seg.keep, ranked.length);
      const out = ranked.slice(keep);
      out.forEach(c => { if (c.elimSeg === null) c.elimSeg = this.segIdx; });
      this.emit('rc', `Ausgeschieden in ${seg.id}: ${out.map(c => c.id).join(', ')}`);
      this.segState = 'break';
      this.bestSec = [Infinity, Infinity, Infinity];
      for (const c of this.cars) { c.pbSec = [Infinity, Infinity, Infinity]; c.lastSecs = null; c.curSecs = []; }
      this.breakLeft = this.info.brk ?? 420;
      this.breakRunning = false;
      this.emit('info', `Pause – die Pausenzeit läuft, sobald alle Autos zurück in der Box sind.`);
      return;
    }
    this.phase = 'finished';
    rollParcFerme(this);
    prepareScrutiny(this);     // technische Abnahme auch nach dem Qualifying
    const order = this.standings();
    this.emit('finish', `${this.info.name} beendet. ${this.kind === 'fp' ? 'Schnellster' : 'Pole Position'}: ${order[0].driver.first} ${order[0].driver.last}.`);
  }

  // Reihenfolge im laufenden Abschnitt (aktive Autos)
  segmentRanking() {
    const active = this.cars.filter(c => c.elimSeg === null);
    const t = c => (c.segBest && c.segBest[this.segIdx] !== undefined ? c.segBest[this.segIdx] : Infinity);
    return active.sort((a, b) => t(a) - t(b) || a.gridPos - b.gridPos);
  }

  // Gesamtwertung: wer länger dabei war, steht vorne; innerhalb nach Bestzeit im letzten Abschnitt
  standings() {
    if (this.kind === 'fp') {
      return [...this.cars].sort((a, b) => (a.bestLap ?? Infinity) - (b.bestLap ?? Infinity) || a.gridPos - b.gridPos);
    }
    const lastSeg = c => (c.elimSeg === null ? this.segIdx : c.elimSeg);
    const t = c => (c.segBest && c.segBest[lastSeg(c)] !== undefined ? c.segBest[lastSeg(c)] : Infinity);
    return [...this.cars].sort((a, b) => lastSeg(b) - lastSeg(a) || t(a) - t(b) || a.gridPos - b.gridPos);
  }

  // Abstand zur Bestzeit des Vorausliegenden in der Wertung
  gap(car, ref) {
    if (!ref || car === ref) return null;
    if (this.segState === 'break' && this.kind !== 'fp') return null;
    const seg = this.kind === 'fp' ? null : (car.elimSeg === null ? this.segIdx : car.elimSeg);
    const tc = seg === null ? car.bestLap : car.segBest && car.segBest[seg];
    const tr = seg === null ? ref.bestLap : ref.segBest && ref.segBest[seg];
    if (tc === undefined || tc === null || tr === undefined || tr === null) return null;
    return { time: tc - tr };
  }

  // Maßgebliche Zeit für die Wertung (im Qualifying: Bestzeit im letzten erreichten Abschnitt)
  rankTime(car) {
    if (this.kind === 'fp') return car.bestLap;
    if (this.segState === 'break' && (car.elimSeg === null || car.elimSeg === undefined)) return null;   // Pause: Zeiten zurückgesetzt
    const seg = car.elimSeg === null ? this.segIdx : car.elimSeg;
    return car.segBest && car.segBest[seg] !== undefined ? car.segBest[seg] : null;
  }

  // Startaufstellung (Fahrer-IDs) aus dem Ergebnis
  resultOrder() {
    // Disqualifizierte (z. B. technische Abnahme) starten von hinten
    const st = this.standings();
    return [...st.filter(c => !c.dsq), ...st.filter(c => c.dsq)].map(c => c.id);
  }
}

export { COMPOUNDS };
