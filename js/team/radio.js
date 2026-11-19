// Pit Wall – Teamfunk: Die eigenen Fahrer melden sich (Reifen, Wetter, Schäden, Verkehr, Beschwerden).
// Der Teamchef antwortet per Schnellauswahl. Antworten wirken auf Stimmung und Verhalten.
// Zufall nur über race.chatRand() – der Rennverlauf der Simulation bleibt sonst unverändert.
import { COMPOUNDS, bestCompound } from '../sim/tyres.js';
import {
  playerCars, tyreLife, lapsLeftOnTyres, callBox, setPace, setErs, setTactic, swapCars, setTeamOrder, nextStop, stopDue,
} from './pitwall.js';

const pick = (race, arr) => arr[Math.floor(race.chatRand() * arr.length)];
const say = (race, car, text) => race.emit('radio', `Funk ${car.id}: „${text}“`, { cars: [car.id], own: true });
const tell = (race, car, text) => race.emit('radio', `Teamfunk ${car.team.name} an ${car.id}: „${text}“`, { cars: [car.id], own: true });

export function mood(car, delta) {
  car.mood = Math.max(0, Math.min(100, (car.mood ?? 70) + delta));
}
export function moodLabel(m) {
  return m >= 80 ? ['sehr gut', '😀'] : m >= 60 ? ['gut', '🙂'] : m >= 40 ? ['gereizt', '😐'] : m >= 20 ? ['sauer', '😠'] : ['wütend', '🤬'];
}

function state(race) {
  if (!race.pwRadio) race.pwRadio = { seq: 0, msgs: [], next: 0, seenEv: 0 };
  return race.pwRadio;
}

// Offene Funkmeldung eines Fahrers (höchstens eine gleichzeitig)
export function openMessage(race, car) {
  const R = race.pwRadio;
  return R ? R.msgs.find(m => m.carId === car.id && !m.done) : null;
}

function post(race, car, kind, text, options, ttl = 30) {
  const R = state(race);
  if (openMessage(race, car)) return false;
  const k = car.radioKinds || (car.radioKinds = {});
  if (k[kind] && race.time - k[kind] < (KIND_GAP[kind] || 120)) return false;
  if (car.lastRadioAt && race.time - car.lastRadioAt < 25) return false;
  k[kind] = race.time;
  car.lastRadioAt = race.time;
  const m = { id: ++R.seq, carId: car.id, kind, text, options, t: race.time, until: race.time + ttl, done: false };
  R.msgs.push(m);
  say(race, car, text);
  return m;
}
// Mindestabstand je Meldungsart (s Rennzeit)
const KIND_GAP = { tyres: 240, weather: 150, dry: 150, damage: 60, stuck: 200, mate: 200, battery: 180, blue: 150, penalty: 300, stop: 300, swapped: 300, closing: 200, push: 240, praise: 9999 };

// Antwort des Teamchefs
export function answer(race, msgId, optId) {
  const R = state(race);
  const m = R.msgs.find(x => x.id === msgId);
  if (!m || m.done) return false;
  const car = race.carById[m.carId];
  const o = m.options.find(x => x.id === optId);
  if (!o) return false;
  m.done = true;
  m.answer = o.label;
  tell(race, car, o.say || o.label);
  if (o.act) o.act(race, car);
  if (o.mood) mood(car, o.mood);
  if (o.reply) setTimeout0(race, car, o.reply);
  return true;
}
// Antwort des Fahrers kommt kurz danach (beim nächsten Schritt)
function setTimeout0(race, car, text) {
  const R = state(race);
  (R.replies || (R.replies = [])).push({ carId: car.id, text, at: race.time + 2 });
}

// Teamchef meldet sich von sich aus
export const OWN_CALLS = [
  { id: 'praise', label: 'Lob', say: 'Super Arbeit, weiter so!', mood: 6, reply: ['Danke, Team!', 'Läuft gut heute.', 'Wir bleiben dran!'] },
  { id: 'focus', label: 'Konzentrieren', say: 'Bleib konzentriert, keine Fehler jetzt.', mood: -1, act: (race, car) => { car.caution = Math.min(0.8, (car.caution || 0) + 0.1); }, reply: ['Verstanden.', 'Bin konzentriert.', 'Ja, ja …'] },
  { id: 'tyres', label: 'Reifenstatus?', say: 'Wie fühlen sich die Reifen an?', reply: null },
  { id: 'motivate', label: 'Motivieren', say: 'Du bist schneller als die vor dir. Hol sie dir!', mood: 4, reply: ['Okay, ich gebe alles!', 'Ich versuch’s!'] },
];
export function ownCall(race, car, id) {
  const c = OWN_CALLS.find(x => x.id === id);
  if (!c || car.retired || car.finished) return false;
  const k = car.ownCalls || (car.ownCalls = {});
  const spam = k[id] && race.time - k[id] < 90;
  k[id] = race.time;
  tell(race, car, c.say);
  if (spam) { mood(car, -4); setTimeout0(race, car, pick(race, ['Ja, hab ich verstanden!', 'Ihr müsst mir das nicht dauernd sagen.', 'Lasst mich fahren!'])); return true; }
  if (c.mood) mood(car, c.mood);
  if (c.act) c.act(race, car);
  if (id === 'tyres') setTimeout0(race, car, tyreFeel(race, car));
  else if (c.reply) setTimeout0(race, car, pick(race, c.reply));
  return true;
}
function tyreFeel(race, car) {
  const l = tyreLife(race, car);
  const left = Math.floor(lapsLeftOnTyres(race, car));
  if (COMPOUNDS[car.compound].wet && race.weather.wetness < 0.2) return 'Die Regenreifen überhitzen, die Strecke ist zu trocken!';
  if (l > 70) return 'Reifen fühlen sich gut an, viel Grip.';
  if (l > 45) return `Reifen sind okay. Noch ein paar Runden, vielleicht ${left}.`;
  if (l > 20) return `Der Grip lässt nach, vor allem hinten. Höchstens noch ${Math.max(1, left)} Runden.`;
  return 'Die Reifen sind komplett weg!';
}

// ---------- Auslöser (alle ~1 s Rennzeit) ----------
export function radioStep(race) {
  if (race.isSession || race.phase !== 'running') return;
  const R = state(race);
  // Antworten der Fahrer
  if (R.replies && R.replies.length) {
    for (const r of R.replies.filter(x => race.time >= x.at)) { const c = race.carById[r.carId]; if (c && !c.retired) say(race, c, r.text); }
    R.replies = R.replies.filter(x => race.time < x.at);
  }
  // Unbeantwortete Meldungen verfallen: der Fahrer fühlt sich ignoriert
  for (const m of R.msgs) {
    if (!m.done && race.time > m.until) {
      m.done = true; m.expired = true;
      const c = race.carById[m.carId];
      mood(c, -3);
      if (m.fallback) m.fallback(race, c);
    }
  }
  if (race.time < R.next) return;
  R.next = race.time + 1;
  const st = race.standings();
  for (const car of race.cars.filter(c => c.player)) {   // alle menschlichen Teams (Mehrspieler)
    if (car.retired || car.finished || car.inPit) continue;
    eventTriggers(race, car);
    if (openMessage(race, car)) continue;
    stateTriggers(race, car, st);
  }
  R.seenEv = race.events.length ? race.events[race.events.length - 1].id : 0;
}

// Ereignisse aus dem Log: Strafe, langsamer Stopp, Tausch angeordnet
function eventTriggers(race, car) {
  const R = race.pwRadio;
  for (let i = race.events.length - 1; i >= 0 && race.events[i].id > R.seenEv; i--) {
    const e = race.events[i];
    if (!(e.cars || []).includes(car.id) || e.own) continue;
    if (/^STRAFE: .* für /.test(e.text) && e.text.includes(`für ${car.id}`)) {
      post(race, car, 'penalty', pick(race, ['Eine Strafe? Das ist doch ein Witz!', 'Was?! Dafür eine Strafe?', 'Das war nie im Leben meine Schuld!']), [
        { id: 'calm', label: 'Beruhigen', say: 'Ruhig bleiben, wir holen das zurück.', mood: 3, reply: 'Okay … okay.' },
        { id: 'agree', label: 'Zustimmen', say: 'Sehen wir genauso, wir legen Protest ein.', mood: 6, reply: 'Danke, das war unfair.' },
        { id: 'blame', label: 'Kritisieren', say: 'Das war unnötig. Sauber fahren!', mood: -8, act: (r, c) => { c.caution = Math.min(0.8, (c.caution || 0) + 0.2); }, reply: 'Na toll …' },
      ]);
    } else if (/^Boxenstopp /.test(e.text) && car.lastStopTime > 4.2 && e.text.startsWith(`Boxenstopp ${car.id}`)) {
      post(race, car, 'stop', pick(race, [`Was war das für ein Stopp?! ${car.lastStopTime.toFixed(1).replace('.', ',')} Sekunden!`, 'Das hat ewig gedauert in der Box!']), [
        { id: 'sorry', label: 'Entschuldigen', say: 'Sorry, Problem mit dem Rad. Wir holen das zurück.', mood: 2, reply: 'Okay, weiter geht’s.' },
        { id: 'push', label: 'Push jetzt', say: 'Vergiss es, jetzt pushen!', act: (r, c) => setPace(r, c, 'push'), reply: 'Verstanden, ich gebe Gas.' },
      ]);
    }
  }
}

// Zustände: Reifen, Wetter, Schaden, Verkehr, Teamkollege, Batterie, Hintermann
function stateTriggers(race, car, st) {
  const w = race.weather.wetness;
  const slick = !COMPOUNDS[car.compound].wet;
  const left = race.laps - car.lap;
  const life = tyreLife(race, car);
  const i = st.indexOf(car);
  const ahead = st[i - 1], behind = st[i + 1];
  const mate = race.cars.find(o => o !== car && o.player && o.team === car.team && !o.retired && !o.finished);
  const boxing = car.boxCall || stopDue(car);
  const defaultCmp = () => {
    if (w > 0.15) return bestCompound(w, left * (race.wear || 1));
    const n = nextStop(car);
    if (n) return n.compound;
    const s = left * (race.wear || 1) > 34 ? 'H' : left * (race.wear || 1) > 16 ? 'M' : 'S';
    return s === car.compound && car.usedCompounds.size < 2 ? (s === 'H' ? 'M' : 'H') : s;
  };

  // Schaden
  if (car.damage === 'wing' && !boxing) {
    post(race, car, 'damage', pick(race, ['Ich habe Schaden am Frontflügel! Untersteuern ohne Ende.', 'Frontflügel ist kaputt, das Auto ist schwer zu fahren!']), [
      { id: 'box', label: 'Box, neue Nase', act: (r, c) => callBox(r, c, defaultCmp()), reply: 'Okay, ich komme rein.' },
      { id: 'stay', label: 'Draußen bleiben', say: 'Bleib draußen, wir beobachten das.', mood: -2, reply: 'Na gut, aber es ist schlimm.' },
    ], 20);
    return;
  }
  // Wetter: Regen auf Slicks
  if (slick && (race.weather.rain > 0.25 || w > 0.18) && left > 2 && !boxing) {
    const cmp = bestCompound(Math.max(w, 0.35), left);
    post(race, car, 'weather', w > 0.3 ? 'Es ist richtig nass! Ich habe keinen Grip auf den Slicks!' : 'Es fängt an zu regnen, die Strecke wird rutschig.', [
      { id: 'box', label: `Box für ${COMPOUNDS[cmp].name}`, act: (r, c) => callBox(r, c, cmp), reply: 'Gute Entscheidung, ich komme.' },
      { id: 'stay', label: 'Noch draußen bleiben', say: 'Bleib noch draußen, der Schauer soll kurz sein.', reply: w > 0.3 ? 'Das ist gefährlich hier draußen!' : 'Okay, ich versuche es.', mood: w > 0.3 ? -4 : 0 },
      { id: 'how', label: 'Wie schlimm?', say: 'Wie schlimm ist es?', reply: w > 0.3 ? 'Sehr schlimm, ich rutsche überall!' : 'Noch fahrbar, aber es wird mehr.' },
    ], 25);
    return;
  }
  // Abtrocknen auf Inters/Regenreifen
  if (!slick && w < 0.16 && left > 3 && !boxing) {
    const cmp = defaultCmp();
    post(race, car, 'dry', 'Die Linie ist fast trocken, die Inters bauen ab. Slicks?', [
      { id: 'box', label: `Box für ${COMPOUNDS[cmp].name}`, act: (r, c) => callBox(r, c, COMPOUNDS[cmp].wet ? 'M' : cmp), reply: 'Ja! Ich komme rein.' },
      { id: 'wait', label: 'Noch eine Runde', say: 'Noch eine Runde, dann entscheiden wir.', reply: 'Okay, eine Runde noch.' },
    ], 25);
    return;
  }
  // Reifen am Ende
  if (life < 22 && left > 2 && !boxing) {
    post(race, car, 'tyres', pick(race, ['Die Reifen sind fertig! Ich habe keinen Grip mehr.', 'Reifen sind weg, ich verliere überall Zeit!', 'Die Hinterreifen bauen komplett ab!']), [
      { id: 'box', label: 'Box diese Runde', act: (r, c) => callBox(r, c, defaultCmp()), mood: 2, reply: 'Danke, ich komme rein.' },
      { id: 'save', label: 'Schonen, durchhalten', say: 'Wir brauchen noch ein paar Runden. Reifen schonen.', act: (r, c) => setPace(r, c, 'save'), mood: -3, reply: pick(race, ['Ich versuche es …', 'Das wird schwer.']) },
      { id: 'plan', label: 'Bleib beim Plan', say: 'Wir bleiben beim Plan.', mood: -2, reply: 'Okay …' },
    ]);
    return;
  }
  // Batterie leer
  if ((car.energy ?? 1) < 0.12 && car.ersMode === 'overtake') {
    post(race, car, 'battery', 'Die Batterie ist leer, ich habe keine Leistung auf der Geraden!', [
      { id: 'harvest', label: 'Laden-Modus', act: (r, c) => setErs(r, c, 'harvest'), reply: 'Okay, ich lade.' },
      { id: 'normal', label: 'Normal', act: (r, c) => setErs(r, c, 'normal'), reply: 'Verstanden.' },
    ], 20);
    return;
  }
  if (race.neutral) return;
  // Hinter dem Teamkollegen fest und schneller
  if (ahead && ahead === mate && !mate.letBy) {
    const g = race.gap(car, ahead);
    const faster = race.lapTarget(car) < race.lapTarget(ahead) - 0.15;
    if (g && !g.laps && g.time < 1.0 && faster) {
      car.stuckT = (car.stuckT || 0) + 1;
      if (car.stuckT > 45) {
        car.stuckT = 0;
        post(race, car, 'mate', pick(race, [`Ich bin schneller als ${ahead.driver.last}! Lasst mich vorbei!`, `Was macht ${ahead.driver.last} da? Wir verlieren beide Zeit!`]), [
          { id: 'swap', label: 'Tauschen', act: (r, c) => swapCars(r), mood: 6, reply: 'Danke!' },
          { id: 'hold', label: 'Position halten', act: (r, c) => setTeamOrder(r, 'hold'), mood: -8, reply: pick(race, ['Das ist doch nicht euer Ernst!', 'Unglaublich …']) },
          { id: 'free', label: 'Freies Fahren', say: 'Ihr dürft fahren, aber keine Berührung!', act: (r, c) => setTeamOrder(r, 'free'), mood: 3, reply: 'Alles klar.' },
        ]);
        return;
      }
    } else car.stuckT = 0;
  } else if (ahead && !ahead.player) {
    // Hinter einem Gegner fest
    const g = race.gap(car, ahead);
    const lapped = ahead.lap < car.lap;
    if (g && !g.laps && g.time < 1.0) {
      car.stuckT = (car.stuckT || 0) + 1;
      if (lapped && car.stuckT > 12) {
        car.stuckT = 0;
        post(race, car, 'blue', pick(race, [`Blaue Flaggen! ${ahead.id} macht keinen Platz!`, `${ahead.id} ignoriert die blauen Flaggen!`]), [
          { id: 'rc', label: 'Rennleitung melden', say: 'Wir melden das der Rennleitung.', mood: 4, reply: 'Danke.' },
          { id: 'calm', label: 'Ruhig bleiben', say: 'Ruhig bleiben, er geht gleich zur Seite.', reply: 'Hoffentlich …' },
        ], 20);
        return;
      }
      if (!lapped && car.stuckT > 75) {
        car.stuckT = 0;
        post(race, car, 'stuck', pick(race, [`Ich bin schneller als ${ahead.id}, komme aber nicht vorbei.`, `Ich hänge hinter ${ahead.id} fest, die Reifen überhitzen.`]), [
          { id: 'attack', label: 'Überholen + Overtake', act: (r, c) => { setTactic(r, c, 'overtake'); setErs(r, c, 'overtake'); }, mood: 4, reply: 'Jetzt greife ich an!' },
          { id: 'under', label: 'Undercut (Box)', act: (r, c) => callBox(r, c, defaultCmp()), reply: 'Okay, Undercut.' },
          { id: 'wait', label: 'Geduld, schonen', say: 'Geduld. Reifen schonen, die Chance kommt.', act: (r, c) => setPace(r, c, 'save'), mood: -2, reply: 'Verstanden …' },
        ]);
        return;
      }
    } else car.stuckT = 0;
  }
  // Hintermann kommt näher, während wir schonen
  if (behind && !behind.player && car.paceMode === 'save') {
    const g = race.gap(behind, car);
    if (g && !g.laps && g.time < 1.2) {
      post(race, car, 'closing', `${behind.id} kommt näher! Darf ich pushen?`, [
        { id: 'push', label: 'Push frei', act: (r, c) => setPace(r, c, 'push'), mood: 3, reply: 'Danke, ich halte ihn hinter mir.' },
        { id: 'defend', label: 'Schonen + verteidigen', say: 'Weiter schonen, aber Position verteidigen.', act: (r, c) => setTactic(r, c, 'defend'), reply: 'Okay.' },
        { id: 'no', label: 'Weiter schonen', say: 'Weiter schonen, das ist wichtiger.', mood: -4, reply: 'Dann verliere ich die Position …' },
      ]);
      return;
    }
  }
  // Teamorder „Tauschen“ gegen den Willen des Fahrers
  if (car.letBy && !car.swapRadio) {
    car.swapRadio = true;
    post(race, car, 'swapped', pick(race, ['Warum ich?! Ich bin genauso schnell!', 'Echt jetzt? Ich soll Platz machen?']), [
      { id: 'explain', label: 'Erklären', say: 'Es geht um die Teamwertung. Du bekommst die Position zurück, wenn es passt.', mood: 2, reply: 'Okay … aber das merke ich mir.' },
      { id: 'order', label: 'Das ist eine Anweisung', say: 'Das ist eine Anweisung. Lass ihn vorbei.', mood: -6, reply: 'Na gut.' },
    ], 20);
    return;
  }
  if (!car.letBy) car.swapRadio = false;
  // Gutes Rennen: Fahrer freut sich (einmal), wenn er deutlich nach vorne gekommen ist
  if (!car.radioKinds?.praise && car.lap > 3 && i + 1 <= car.gridPos - 4) {
    post(race, car, 'praise', pick(race, ['Das Auto ist super heute!', 'Wir sind richtig gut unterwegs!']), [
      { id: 'thanks', label: 'Weiter so', say: 'Starke Arbeit, weiter so!', mood: 5, reply: 'Wird gemacht!' },
      { id: 'focus', label: 'Konzentriert bleiben', say: 'Gut, aber konzentriert bleiben.', mood: 1, reply: 'Klar.' },
    ], 20);
  }
}
