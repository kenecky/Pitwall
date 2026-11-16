// Pit Wall – Einstieg: verbindet Simulation, KI-Rennleitung und die Pit-Wall-Konsole des Teamchefs.
import { TEAMS, TEAM_BY_ID } from './data/teams.js';
import { DRIVERS } from './data/drivers.js';
import { TRACKS } from './data/tracks/index.js';
import { SEASON_2026 } from './data/season2026.js';
import { Intro, INTRO_DUR, INTRO_TRACKS, introInfo } from './ui/intro.js';
import { playIntroMusic } from './ui/introMusic.js';
import { buildTrack } from './sim/trackModel.js';
import { Race, DT, COMPOUNDS, formatLap } from './sim/race.js';
import { bestCompound } from './sim/tyres.js';
import { randomSeed } from './util/rng.js';
import { trackStatus } from './control/flags.js';
import { autoDirect } from './control/autoDirector.js';
import { TrackMap } from './ui/map.js';
import { renderTiming, formatClock } from './ui/timing.js';
import { Feed, FEED_FILTERS, HELMET_ICON } from './ui/feed.js';
import { renderTower } from './ui/tower.js';
import { Sound } from './ui/sound.js';
import { WeatherPanel } from './ui/weatherPanel.js';
import { weatherLabel } from './sim/weather.js';
import { distanceFor } from './sim/length.js';
import { unservedSecs } from './control/stewards.js';
import { loadSettings, saveSettings } from './storage.js';
import {
  PACE, PACE_ORDER, ERS, ERS_ORDER, STRATEGISTS, playerCars, setPace, setErs, callBox, cancelBox, tooLateForBox, tyreLife, adviceFor,
  lapsLeftOnTyres, nextStop, stopDue, shiftStop, dropStop, setStopCompound, addStop, setTeamOrder, swapCars, teamStep,
  rejoin, pitLoss, timeOf, circleAngle, lapTime, strategyOptions, applyStrategy, freshGain, fmt, TACTIC, TACTIC_ORDER, setTactic, redTyres,
} from './team/pitwall.js';
import { radioStep, answer, openMessage, ownCall, OWN_CALLS, moodLabel } from './team/radio.js';

import { Session } from './sim/session.js';
import { createWeekend, currentKind, nextKind, applyWeekend, finishSession, setSummary, setsOf, trackSetWear, SESSION_NAME, SESSION_SHORT } from './team/weekend.js';
import { SETUP_KEYS, feedback } from './team/setup.js';

export const VERSION = 5;

// ---------- Ladeseite ----------
const BOOT = { steps: [[35, 'Strecken und Simulation geladen …']] };
function bootStep(pct, text) { BOOT.steps.push([pct, text]); }
function bootDone() {
  const el = document.getElementById('boot');
  if (!el) return;
  const loaded = new Promise(res => (document.readyState === 'complete' ? res() : window.addEventListener('load', res, { once: true })));
  const fonts = document.fonts ? document.fonts.ready.catch(() => {}) : Promise.resolve();
  let i = 0;
  const bar = document.getElementById('bootBar'), txt = document.getElementById('bootText');
  const next = () => {
    if (i < BOOT.steps.length) { bar.style.width = BOOT.steps[i][0] + '%'; txt.textContent = BOOT.steps[i][1]; i++; setTimeout(next, 200); return; }
    Promise.all([loaded, fonts]).then(() => {
      try { drawStartHero(); } catch { /* egal */ }
      bar.style.width = '100%'; txt.textContent = 'Fertig';
      setTimeout(() => { el.classList.add('gone'); setTimeout(() => el.remove(), 400); }, 250);
    });
  };
  next();
}

const SPEEDS = [1, 2, 4, 8, 16, 32];
const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

const settings = loadSettings();
if (!TEAM_BY_ID[settings.teamId]) settings.teamId = 'ferrari';
const builtTracks = {};
function getTrack(id) {
  if (!TRACKS[id]) id = 'redbullring';
  return builtTracks[id] || (builtTracks[id] = buildTrack(TRACKS[id]));
}
let track = getTrack(settings.trackId);
const map = new TrackMap($('map'), track);
map.showLabels = Boolean(settings.showLabels);
map.onSelectCar = id => { map.selected = id === null || map.selected === id ? null : id; };
map.onZoomChange = z => $('zoomResetBtn').classList.toggle('hidden', z <= 1.01);

// ---------- Ton ----------
const sound = new Sound();
sound.enabled = settings.sound !== false;
document.addEventListener('pointerdown', () => { sound.unlock(); sound.setEnabled(settings.sound !== false); }, true);
const snd = { lights: 0, phase: null, neutral: null, evId: 0, rl: false };
function updateSound() {
  if (!sound.ctx || !race) return;
  let level = 0, rpm = 0;
  const n = race.neutral;
  if (!paused && settings.sound !== false) {
    if (race.phase === 'formation') { level = 0.55; rpm = 0.3; }
    else if (race.phase === 'grid') { level = 0.35; rpm = 0.12; }
    else if (race.phase === 'lights') { level = 0.8; rpm = 0.5; }
    else if (race.phase === 'running' || race.phase === 'chequered') {
      level = 0.7;
      rpm = n ? 0.42 : 0.66;
      if (n && n.type === 'red') level = race.cars.some(c => !c.retired && !c.finished && !c.redQueued) ? 0.4 : 0;
    }
  }
  sound.setEngine(level, rpm);
  // Safety Car auf der Strecke (auch Inspektionsrunde): eigener, tieferer Motor
  const sc = race.sc && !race.sc.inPit && !paused && settings.sound !== false ? race.sc : null;
  sound.setScEngine(sc ? 0.75 : 0, sc ? Math.min(1, (sc.v || 0) / 70) : 0);
  const lo = race.lightsOn || 0;
  if (lo > snd.lights) sound.light();
  snd.lights = lo;
  if (snd.phase === 'lights' && race.phase === 'running') sound.lightsOut();
  const rl = Boolean(n && n.restart && n.phase === 'lights');
  if (snd.rl && !race.neutral) sound.lightsOut();
  snd.rl = rl;
  snd.phase = race.phase;
  const nt = n ? n.type : null;
  if (nt && nt !== snd.neutral) sound.neutral(nt);
  snd.neutral = nt;
  for (let i = race.events.length - 1; i >= 0 && race.events[i].id > snd.evId; i--) {
    const e = race.events[i];
    if (e.type === 'chequered') sound.chequered();
  }
  if (race.events.length) snd.evId = race.events[race.events.length - 1].id;
}

// ---------- Wetter-Fenster ----------
const weatherPanel = new WeatherPanel({ root: $('wxScreen'), body: $('wxBody'), getRace: () => race });
$('wxOpen').addEventListener('click', () => { if (race) weatherPanel.open(); });
$('wxCloseBtn').addEventListener('click', () => weatherPanel.close());
$('wxScreen').addEventListener('click', e => { if (e.target.id === 'wxScreen') weatherPanel.close(); });

// ---------- Log ----------
const feed = new Feed($('feed'), { colorOf: id => (race && race.carById[id] ? race.carById[id].team.color : null) });
function renderFeedFilter() {
  const cur = settings.feedFilter || 'all';
  $('feed').dataset.filter = cur;
  $('feedFilter').innerHTML = FEED_FILTERS.map(f => `<button class="fk-chip${f.id === cur ? ' on' : ''}" data-filter="${f.id}">${f.id === 'radio' ? HELMET_ICON : ''}${f.label}</button>`).join('');
}
$('feedFilter').addEventListener('click', e => {
  const b = e.target.closest('[data-filter]');
  if (!b) return;
  settings.feedFilter = b.dataset.filter;
  saveSettings(settings);
  renderFeedFilter();
});
renderFeedFilter();

// Log: Funk nur vom eigenen Team (eigene Fahrer bzw. eigener Kommandostand)
function ownRadio(e) {
  if (e.type !== 'radio') return true;
  if ((e.cars || []).some(id => race.carById[id] && race.carById[id].player)) return true;
  const t = TEAM_BY_ID[race.playerTeam];
  return Boolean(t && e.text.startsWith(`Teamfunk ${t.name}`));
}

// Mitteilungen der Rennleitung als Popup (z. B. Neustart nach Rot)
function checkNotices() {
  const list = race.rcNotices || [];
  if (list.length <= (ui.noticeSeen || 0)) return;
  ui.noticeSeen = list.length;
  $('rcNoticeText').textContent = list[list.length - 1].text;
  $('rcNotice').classList.remove('hidden');
  sound.neutral('red');
  vibrate([80, 40, 80]);
}
$('rcNoticeOk').addEventListener('click', () => $('rcNotice').classList.add('hidden'));

// ---------- Zustand ----------
let race = null;
let paused = true;
let acc = 0;
let lastFrame = performance.now();
let lastUi = 0;
let activeTab = 'wall';
let unread = 0;
let resultShown = false;
let wakeLock = null;
let touching = false;
const prevD = new Map();
const ui = { sel: {}, built: null, lastOwnEv: 0 };

// Neues Rennwochenende (Startseite)
let wk = null;
const SESSION_KINDS = new Set(['fp', 'quali', 'sq']);
function newRace(seed = randomSeed()) {
  track = getTrack(settings.trackId);
  const parts = settings.parts || ['fp', 'quali'];
  wk = createWeekend({ parts, seed, trackId: track.def.id, carIds: DRIVERS.filter(d => d.team === settings.teamId).map(d => d.id) });
  prepareSession();
  $('seedInfo').textContent = `Wochenende #${seed}`;
  $('seedInput').value = '';
  $('resultScreen').classList.add('hidden');
  $('startScreen').classList.remove('hidden');
  renderStart();
  if (INTRO_TRACKS.has(track.def.id)) setTimeout(() => loadScenery(track.def.id), 300);
  refreshUi();
  renderSpeedBtns();
}

// Nächste Session des Wochenendes aufbauen (Training, Qualifying, Sprint, Rennen)
function prepareSession() {
  const kind = currentKind(wk);
  const isS = SESSION_KINDS.has(kind);
  const opts = {
    track, teams: TEAMS, drivers: DRIVERS, seed: wk.seed + wk.idx * 101, weather: settings.weatherMode, kind,
    length: settings.length, difficulty: 'medium', playerTeam: settings.teamId,
  };
  if (!isS) {
    const { laps, full } = distanceFor(track, kind, settings.length);
    Object.assign(opts, { laps, fullLaps: full, gridOrder: wk.grid[kind], gridPenalties: { ...wk.penalties[kind] } });
  }
  map.setTrack(track);
  race = isS ? new Session(opts) : new Race(opts);
  applyWeekend(race, wk);
  race.trackSets = () => { for (const c of playerCars(race)) trackSetWear(race, c); };
  race.onPlayerGarage = onGarage;
  paused = true;
  acc = 0;
  resultShown = false;
  prevD.clear();
  feed.reset();
  unread = 0;
  updateBadge();
  map.selected = null;
  ui.sel = {};
  ui.built = null;
  ui.lastOwnEv = 0;
  ui.lastMsg = 0;
  ui.noticeSeen = 0;
  ui.run = {};
}

// Auto kommt nach einer Ausfahrt in die Garage: Rückmeldung des Fahrers (Training) bzw. Rundenzeit (Qualifying)
function onGarage(car) {
  const laps = (car.runLaps || []).filter(l => l.valid);
  if (race.kind === 'fp' && laps.length) {
    const fb = feedback(race.track, wk.setup[car.id], car.driver, race.time + (wk.runs[car.id]++) * 7.3);
    wk.notes[car.id].push({ text: fb.text, setup: { ...wk.setup[car.id] }, best: Math.min(...laps.map(l => l.time)), n: laps.length });
    race.emit('radio', `Funk ${car.id}: „${fb.text}“`, { cars: [car.id], own: true });
  } else if (laps.length) {
    const b = Math.min(...laps.map(l => l.time));
    const pos = race.segmentRanking ? race.segmentRanking().indexOf(car) + 1 : 0;
    race.emit('radio', `Teamfunk ${car.team.name} an ${car.id}: „${formatLap(b)}, du bist P${pos}.${laps.some(l => l.traffic) ? ' Da war Verkehr auf der Runde.' : ''}“`, { cars: [car.id], own: true });
  }
  car.runLaps = [];
}

// ---------- Startseite ----------
const SEGS = {
  weatherSeg: { key: 'weatherMode', items: [['random', '🎲', 'Zufällig'], ['dry', '☀️', 'Trocken'], ['rain', '🌧', 'Regen'], ['changeable', '🌦', 'Wechselhaft']] },
  lengthSeg: { key: 'length', items: [['short', '', 'Kurz', '¼ Distanz'], ['medium', '', 'Mittel', '½ Distanz'], ['full', '', 'Lang', 'volle Distanz']] },
};
function renderSegs() {
  for (const [id, { key, items }] of Object.entries(SEGS)) {
    const cur = items.some(x => x[0] === settings[key]) ? settings[key] : items[1][0];
    $(id).innerHTML = items.map(([v, icon, label, sub]) =>
      `<button class="seg-b${v === cur ? ' on' : ''}" data-v="${v}" role="radio" aria-checked="${v === cur}">${icon ? `<i>${icon}</i>` : ''}<b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</button>`).join('');
  }
}
for (const [id, { key }] of Object.entries(SEGS)) {
  $(id).addEventListener('click', e => {
    const b = e.target.closest('[data-v]');
    if (!b || settings[key] === b.dataset.v) return;
    settings[key] = b.dataset.v;
    saveSettings(settings);
    newRace(race.seed);
  });
}

function renderStart() {
  // Teams
  $('teamList').innerHTML = TEAMS.map(t => `<button class="pw-team${t.id === settings.teamId ? ' on' : ''}" data-team="${t.id}" role="option"><i style="background:${t.color}"></i>${esc(t.name)}</button>`).join('');
  const t = TEAM_BY_ID[settings.teamId];
  const drv = DRIVERS.filter(d => d.team === t.id);
  const bar = (label, v) => `<span>${label}</span><i><b style="width:${v}%"></b></i><span>${v}</span>`;
  $('teamInfo').innerHTML = `<b>${esc(t.name)}</b> · ${drv.map(d => `${esc(d.first)} ${esc(d.last)} (#${d.number})`).join(' & ')}
    <div class="pw-bars">${bar('AUTO', t.pace)}${bar('ZUVERL.', t.reliability)}${bar('BOXENCREW', t.pitCrew)}</div>`;
  // Rennen
  const list = $('gpList');
  if (!list.children.length) {
    list.innerHTML = SEASON_2026.map(e => {
      const tr = TRACKS[e.track];
      return `<button class="gp-item" data-track="${tr.id}" role="option"><span class="gp-no">${String(e.round).padStart(2, '0')}</span><span><b>${tr.country}</b><small>${tr.name}</small></span></button>`;
    }).join('');
  }
  for (const b of list.children) b.classList.toggle('on', b.dataset.track === settings.trackId);
  const def = track.def;
  $('evRound').textContent = '';
  $('gpInfo').innerHTML = `<b>${def.grandPrix.replace('Großer Preis ', 'GP ')}</b><div><span>${race.laps}</span> Runden</div><div><span>${(def.lengthM / 1000).toFixed(3).replace('.', ',')}</span> km</div>`;
  renderSegs();
  const parts = settings.parts || ['fp', 'quali'];
  for (const cb of $('sessionChecks').querySelectorAll('input')) cb.checked = cb.value === 'race' || parts.includes(cb.value);
  $('weekendSteps').innerHTML = wk.seq.map((k, i) => `<span class="wstep${i < wk.idx ? ' done' : i === wk.idx ? ' now' : ''}">${SESSION_SHORT[k]}</span>`).join('<span class="wsep">›</span>');
  $('startBtn').textContent = wk.seq.length > 1 ? `Wochenende starten · ${SESSION_NAME[wk.seq[0]]}` : 'Rennen starten';
  const wx = race.weather;
  $('forecast').textContent = !wx.showers.length ? '☀️ Vorhersage: trocken'
    : wx.wetness > 0.2 ? `🌧 Vorhersage: Regen zum Start${wx.showers.length > 1 ? ', später weitere Schauer' : ''}`
      : '🌦 Vorhersage: wechselhaft – Regenschauer im Rennen möglich';
  drawStartHero();
}
$('teamList').addEventListener('click', e => {
  const b = e.target.closest('[data-team]');
  if (!b || b.dataset.team === settings.teamId) return;
  settings.teamId = b.dataset.team;
  saveSettings(settings);
  newRace(race.seed);
});
$('gpList').addEventListener('click', e => {
  const b = e.target.closest('[data-track]');
  if (!b || b.dataset.track === settings.trackId) return;
  settings.trackId = b.dataset.track;
  saveSettings(settings);
  newRace();
});
$('sessionChecks').addEventListener('change', e => {
  // Sprint nur mit Qualifying (Startaufstellung fürs Rennen)
  const box = v => $('sessionChecks').querySelector(`input[value="${v}"]`);
  if (e.target.value === 'sprint' && e.target.checked) box('quali').checked = true;
  if (e.target.value === 'quali' && !e.target.checked) box('sprint').checked = false;
  settings.parts = [...$('sessionChecks').querySelectorAll('input:checked')].map(x => x.value).filter(v => v !== 'race');
  saveSettings(settings);
  newRace(race.seed);
});
$('seedInput').addEventListener('change', e => {
  const v = parseInt(e.target.value, 10);
  if (Number.isFinite(v) && v > 0) newRace(v);
});

function drawStartHero() {
  drawTrackPreview($('trackPreview'), track);
  const list = $('gpList');
  const on = list.querySelector('.gp-item.on');
  if (on && list.clientWidth && !list.dataset.scrolled) {
    list.scrollLeft = on.offsetLeft - list.offsetLeft - (list.clientWidth - on.offsetWidth) / 2;
    list.dataset.scrolled = '1';
  }
}
function drawTrackPreview(cv, tr) {
  const r = cv.getBoundingClientRect();
  if (!r.width) return;
  const dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, r.width, r.height);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < tr.N; i += 4) { minX = Math.min(minX, tr.xs[i]); maxX = Math.max(maxX, tr.xs[i]); minY = Math.min(minY, tr.ys[i]); maxY = Math.max(maxY, tr.ys[i]); }
  const pad = 14, padTop = 22, padBottom = 46;
  const k = Math.min((r.width - 2 * pad) / (maxX - minX), (r.height - padTop - padBottom) / (maxY - minY));
  const ox = (r.width - (maxX - minX) * k) / 2 - minX * k;
  const oy = padTop + (r.height - padTop - padBottom - (maxY - minY) * k) / 2 - minY * k;
  ctx.beginPath();
  for (let i = 0; i <= tr.N; i += 2) { const j = i % tr.N; const x = ox + tr.xs[j] * k, y = oy + tr.ys[j] * k; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(250, 204, 21, .35)'; ctx.shadowBlur = 14;
  ctx.strokeStyle = '#3a4352'; ctx.lineWidth = 8; ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#f1f4f8'; ctx.lineWidth = 2.6; ctx.stroke();
  const x0 = ox + tr.xs[0] * k, y0 = oy + tr.ys[0] * k;
  ctx.fillStyle = '#ef4444'; ctx.fillRect(x0 - 4, y0 - 4, 8, 8);
  cv._map = { ox, oy, k };   // für den fließenden Übergang ins Intro
}

// ---------- Intro ----------
const sceneryCache = new Map();
function loadScenery(id) {
  if (!sceneryCache.has(id)) sceneryCache.set(id, import(`./data/scenery/${id}.js`).then(m => m.default).catch(() => null));
  return sceneryCache.get(id);
}
function setStartBusy(on) {
  $('startBtn').classList.toggle('busy', on);
  $('startBtn').disabled = on;
}
function playIntro(done) {
  setStartBusy(true);
  requestAnimationFrame(() => setTimeout(() => loadScenery(race.track.def.id).then(sc => runIntro(done, sc)), 40));
}
function runIntro(done, scenery) {
  const scr = $('introScreen'), cv = $('introCanvas');
  const info = introInfo(race.track, race.laps, SEASON_2026, TEAMS);
  info.scenery = scenery;
  const pv = $('trackPreview'), pr = pv.getBoundingClientRect();
  if (pv._map && pr.width && !$('startScreen').classList.contains('hidden')) info.from = { left: pr.left, top: pr.top, ...pv._map };
  scr.classList.remove('hidden');
  scr.classList.remove('show');
  const intro = new Intro(cv, race.track, info);
  intro.resize();
  intro.renderAt(0);
  setStartBusy(false);
  let music = null;
  if (settings.sound !== false) { sound.unlock(); if (sound.ctx) try { music = playIntroMusic(sound.ctx, sound.master, sound.noiseBuf, race.track.def.id); } catch { music = null; } }
  requestAnimationFrame(() => scr.classList.add('show'));
  const t0 = performance.now();
  let over = false;
  const finish = () => {
    if (over) return;
    over = true;
    if (music) music.stop(0.35);
    scr.classList.add('hidden');
    scr.removeEventListener('pointerdown', finish);
    done();
  };
  scr.addEventListener('pointerdown', finish);
  const loop = now => {
    if (over) return;
    const t = (now - t0) / 1000;
    if (t >= INTRO_DUR) { finish(); return; }
    intro.renderAt(t);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function startRace() {
  if (INTRO_TRACKS.has(race.track.def.id) && !wk.introShown) {
    wk.introShown = true;
    playIntro(() => startRace());
    return;
  }
  if (!race.isSession && !race.strategyDone) { showStrategy(); return; }
  $('startScreen').classList.add('hidden');
  $('resultScreen').classList.add('hidden');
  race.start('standing');
  setSpeed(Math.max(4, settings.speed));
  paused = false;
  renderSpeedBtns();
  setTab('wall');
  requestWakeLock();
}

// ---------- Game-Loop ----------
function frame(now) {
  const realDt = Math.min(0.25, (now - lastFrame) / 1000);
  lastFrame = now;
  if (race && !paused) {
    acc += realDt * settings.speed;
    let n = 0;
    while (acc >= DT && n < 2000) {
      for (const c of race.cars) prevD.set(c, c.d);
      race.step();
      autoDirect(race);
      teamStep(race);
      radioStep(race);
      acc -= DT;
      n++;
      if (watchEvents()) break;
    }
  }
  if (race) {
    const alpha = paused ? 1 : Math.min(1, acc / DT);
    const renderD = new Map();
    for (const c of race.cars) {
      const p = prevD.get(c);
      renderD.set(c, p === undefined || Math.abs(c.d - p) > 200 ? c.d : p + (c.d - p) * alpha);
    }
    map.paused = paused;
    map.draw(race, renderD);
    drawGhost();
    updateSound();
    if (now - lastUi > 300) {
      lastUi = now;
      refreshUi();
      const added = feed.update(race.events.filter(ownRadio));
      if (added && activeTab !== 'feed') { unread += added; updateBadge(); }
      if (race.phase === 'finished' && !resultShown) showResults();
    }
  }
  requestAnimationFrame(frame);
}

// Wichtige Momente für den Teamchef: Neutralisierung, Schaden, Funk der eigenen Fahrer → Tempo runter
let lastNeutral = null;
function watchEvents() {
  const n = race.neutral ? race.neutral.type : null;
  let brake = false;
  if (n !== lastNeutral) {
    if (n === 'vsc' || n === 'sc') { brake = true; vibrate([60, 40, 60]); }
    lastNeutral = n;
  }
  const evs = race.events;
  for (let i = evs.length - 1; i >= 0 && evs[i].id > ui.lastOwnEv; i--) {
    const e = evs[i];
    const own = (e.cars || []).some(id => race.carById[id] && race.carById[id].player);
    if (own && !e.own && (e.type === 'radio' || e.type === 'case' || /Schaden|Reifenschaden|Defekt|SCHWARZ-ORANGE|STRAFE/.test(e.text))) {
      if (e.type === 'radio') sound.radio();
      if (/Schaden|Reifenschaden|Defekt|SCHWARZ-ORANGE|STRAFE/.test(e.text)) brake = true;
    }
  }
  if (evs.length) ui.lastOwnEv = evs[evs.length - 1].id;
  const R = race.pwRadio;
  if (R && R.seq > (ui.lastMsg || 0)) {
    const m = R.msgs[R.msgs.length - 1];
    ui.lastMsg = R.seq;
    sound.radio();
    vibrate([40, 30, 40]);
    if (activeTab !== 'wall' || ui.wallCar !== m.carId) toast(`📻 ${m.carId}: ${m.text}`, 3500);
    brake = true;
  }
  if (brake && settings.speed > 2 && race.phase === 'running') { setSpeed(2); return true; }
  return false;
}

// ---------- Anzeige ----------
function refreshUi() {
  if (!race) return;
  updateStatus();
  checkNotices();
  renderWall();
  if (activeTab === 'circle') renderCircle();
  if (!touching) {
    if (activeTab === 'timing') renderTiming($('timing'), race, { gapMode: settings.gapMode, selected: map.selected });
    if (settings.showTower) renderTower($('tower'), race, map.selected, settings.gapMode);
  }
  if (weatherPanel.isOpen && weatherPanel.offset === 0) weatherPanel.drawRadar();
}

function updateStatus() {
  if (race.isSession) {
    $('lapLabel').textContent = race.info.short;
    const rem = race.segState === 'break' ? race.breakLeft : race.remaining;
    const mm = `${Math.floor(rem / 60)}:${String(Math.floor(rem % 60)).padStart(2, '0')}`;
    $('lap').textContent = race.phase === 'pre' ? 'Start' : race.phase === 'finished' ? 'Ende' : race.segState === 'break' ? `Pause ${mm}` : `${race.segment.id} ${mm}`;
  } else {
    $('lapLabel').textContent = race.phase === 'formation' ? 'FORMATION' : race.preStart ? 'START' : race.kind === 'sprint' ? 'SPRINT' : 'LAP';
    $('lap').textContent = race.preStart ? `${race.laps} LAPS` : `${race.leaderLap}/${race.laps}`;
  }
  const running = race.phase === 'running' || race.phase === 'chequered' || race.phase === 'finished';
  $('clock').textContent = formatClock(running ? race.time : 0);
  const wl = weatherLabel(race.weather);
  $('wx').innerHTML = `${wl.icon}<span class="wx-t"> ${wl.track}</span>`;
  const flag = $('flag');
  const status = trackStatus(race);
  const n = race.neutral;
  const set = (t, c) => { flag.textContent = t; flag.className = `flag-chip ${c}`; };
  if (race.phase === 'chequered' || race.phase === 'finished') set('CHEQUERED', 'flag-chequered');
  else if (n && n.type === 'red' && n.restart) set(n.phase === 'formation' ? 'FORMATION' : 'RESTART', 'flag-start');
  else if (n && n.type === 'red') set('RED FLAG', 'flag-red');
  else if (n && n.type === 'sc') set(n.go ? 'SC RESTART' : n.phase === 'in' ? 'SC IN' : 'SAFETY CAR', 'flag-sc');
  else if (n && n.type === 'vsc') set(n.phase === 'ending' ? 'VSC ENDING' : 'VSC', 'flag-vsc');
  else if (race.phase === 'delay') set('START DELAYED', 'flag-double');
  else if (race.phase === 'formation') set('FORMATION', 'flag-start');
  else if (race.preStart) set('START', 'flag-start');
  else if (status === 'double') set('DBL YELLOW', 'flag-double');
  else if (status === 'yellow') set('YELLOW', 'flag-yellow');
  else if (status === 'slippery') set('SURFACE', 'flag-slippery');
  else set('TRACK GREEN', 'flag-green');
  const lights = $('lights');
  lights.classList.toggle('hidden', race.lightsOn === 0);
  [...lights.children].forEach((el, i) => el.classList.toggle('on', i < race.lightsOn));
  $('gapHead').textContent = settings.gapMode === 'interval' ? 'Intervall' : 'Abstand';
  // Hinweis über der Karte
  const al = $('pwAlert');
  let msg = '';
  if (n && n.type === 'sc' && n.phase === 'out') msg = 'SAFETY CAR – günstiges Boxenfenster!';
  else if (n && n.type === 'vsc' && n.phase === 'active') msg = 'VSC – Boxenstopp kostet jetzt weniger Zeit';
  else if (n && n.type === 'red' && !n.restart) msg = 'ROTE FLAGGE – Reifenwechsel in der Boxengasse frei';
  al.textContent = msg;
  al.classList.toggle('hidden', !msg);
}

// ---------- Pit-Wall-Konsole ----------
function buildWall() {
  const cars = playerCars(race);
  ui.built = race;
  if (!ui.circleCar || !race.carById[ui.circleCar]) ui.circleCar = cars[0].id;
  if (!ui.wallCar || !race.carById[ui.wallCar]) ui.wallCar = cars[0].id;
  $('wall').innerHTML = `<div class="pw-dtabs">${cars.map(c => `<button data-wtab="${c.id}" style="--tc:${c.team.color}"><b>${esc(c.driver.last)}</b><span data-wt="${c.id}"></span></button>`).join('')}</div>` + cars.map(c => `
    <div class="pw-car" data-car="${c.id}" style="--tc:${c.team.color}">
      <div class="pw-head">
        <span class="pw-pos" data-f="pos">–</span>
        <span class="pw-name">${esc(c.driver.first)} ${esc(c.driver.last)}<small data-f="sub"></small></span>
        <span class="pw-gaps" data-f="gaps"></span>
      </div>
      <div class="pw-radio hidden" data-f="radio"></div>
      <div class="pw-red hidden" data-f="red"></div>
      <div class="pw-row">
        <span class="pw-tyre" data-f="tyre"></span>
        <span class="pw-life"><b data-f="life"></b></span>
        <span class="pw-meta" data-f="meta"></span>
      </div>
      <div class="pw-hist" data-f="hist"></div>
      <div class="pw-label">TEMPO</div>
      <div class="pw-seg">${PACE_ORDER.map(p => `<button data-pace="${p}"><b>${PACE[p].short}</b><small data-l="${p}"></small></button>`).join('')}</div>
      <div class="pw-hold" data-f="hold"></div>
      <div class="pw-label">ZWEIKAMPF</div>
      <div class="pw-seg">${TACTIC_ORDER.map(t => `<button data-tac="${t}">${TACTIC[t].short}</button>`).join('')}</div>
      <div class="pw-label">ENERGIE</div>
      <div class="pw-ers"><span class="pw-life"><b data-f="ers"></b></span><span class="pw-meta" data-f="erspct"></span></div>
      <div class="pw-seg ers">${ERS_ORDER.map(m => `<button data-ers="${m}">${ERS[m].short}</button>`).join('')}</div>
      <div class="pw-label">BOXENSTOPP</div>
      <div class="pw-plan" data-f="plan"></div>
      <div class="pw-box">
        <div class="pw-cmp">${['S', 'M', 'H', 'I', 'W'].map(k => `<button class="${k}" data-cmp="${k}" aria-label="${COMPOUNDS[k].name}">${k}</button>`).join('')}</div>
        <button class="pw-boxbtn" data-act="box">BOX</button>
      </div>
      <div class="pw-rejoin" data-f="rejoin"></div>
 <div class="pw-hint" data-f="hint"></div>
      <div class="pw-label">FUNK AN ${c.id}</div>
      <div class="pw-calls">${OWN_CALLS.map(o => `<button data-call="${o.id}">${o.label}</button>`).join('')}</div>
      <button class="pw-circbtn" data-act="circle" aria-label="Circle of Doom">◎</button>
    </div>`).join('') + `
    <div class="pw-orders">
      <div class="pw-label" style="margin-top:0">TEAMORDER</div>
      <div class="pw-seg"><button data-order="free">FREI FAHREN</button><button data-order="hold">POSITION HALTEN</button><button data-order="swap">TAUSCHEN</button></div>
      <div class="pw-hint" data-f="order"></div>
    </div>`;
}

function defaultCompound(car) {
  const w = race.weather.wetness;
  const left = (race.laps - car.lap) * (race.wear || 1);
  if (w > 0.15 || COMPOUNDS[car.compound].wet) return bestCompound(w, left);
  const a = adviceFor(race, car);
  if (a && a.compound !== car.compound) return a.compound;
  const slick = left > 34 ? 'H' : left > 16 ? 'M' : 'S';
  return slick === car.compound && car.usedCompounds.size < 2 ? (slick === 'H' ? 'M' : 'H') : slick;
}

function fmtGap(g) {
  if (!g) return '–';
  if (g.laps) return `${g.laps} Rd`;
  return `${fmt(g.time)} s`;
}
const lapsTxt = x => (x >= 99 ? '99+' : x < 1 ? '<1' : String(Math.floor(x)));

function renderWall() {
  if (race.isSession) { renderSessionWall(); return; }
  if (ui.built !== race) buildWall();
  const st = race.standings();
  const lifeCol = v => (v > 55 ? '#22c55e' : v > 30 ? '#facc15' : v > 15 ? '#f97316' : '#ef4444');
  for (const el of $('wall').querySelectorAll('.pw-car')) {
    const car = race.carById[el.dataset.car];
    el.classList.toggle('hidden', car.id !== ui.wallCar);
    // Reiter: Position, offene Funkmeldung, Box
    const tab = $('wall').querySelector(`[data-wtab="${car.id}"]`);
    tab.classList.toggle('on', car.id === ui.wallCar);
    const tmsg = openMessage(race, car);
    const tpos = car.retired ? 'OUT' : `P${st.indexOf(car) + 1}`;
    tab.querySelector('span').innerHTML = `${tpos}${tmsg ? ' <i class="pw-dot">📻</i>' : ''}${car.redQueued && !car.redTyre ? ' <i class="pw-dot red">REIFEN?</i>' : ''}`;
    // Rote Flagge: Reifenwahl in der Boxengasse
    const red = el.querySelector('[data-f="red"]');
    const redOn = Boolean(car.redQueued && race.neutral && race.neutral.type === 'red');
    const redSig = redOn ? `${car.redTyre}|${car.compound}` : '';
    if (red.dataset.sig !== redSig) {
      red.dataset.sig = redSig;
      red.classList.toggle('hidden', !redOn);
      red.innerHTML = redOn ? `<div class="pw-rtext">🟥 <b>Rote Flagge</b> – ${car.id} steht in der Boxengasse. Reifenwechsel ist frei:</div>
        <div class="pw-cmp">${['S', 'M', 'H', 'I', 'W'].map(k => `<button class="${k}${car.redTyre === k ? ' on' : ''}" data-red="${k}">${k}</button>`).join('')}</div>
        <button class="pw-keep${car.redTyre === 'keep' ? ' on' : ''}" data-red="keep">Reifen behalten (${COMPOUNDS[car.redTyre && car.redTyre !== 'keep' ? car.redFrom : car.compound].name})</button>
        <div class="pw-hint">${car.redTyre && car.redTyre !== 'keep' ? `Neu: ${COMPOUNDS[car.redTyre].name}. Bis zum Neustart änderbar.` : car.redTyre === 'keep' ? 'Reifen bleiben drauf. Bis zum Neustart änderbar.' : 'Noch keine Entscheidung – ohne Wahl bleiben die Reifen drauf.'}</div>` : '';
    }
    const f = k => el.querySelector(`[data-f="${k}"]`);
    const i = st.indexOf(car);
    const gone = car.retired || car.finished;
    el.classList.toggle('out', car.retired);
    f('pos').textContent = car.retired ? 'OUT' : `P${i + 1}`;
    const pens = unservedSecs(car);
    const serve = [...(car.serve || []), ...(car.serving ? [car.serving] : [])].map(p => (p.type === 'dt' ? 'Durchfahrt' : 'Stop & Go'));
    const ml = moodLabel(car.mood ?? 70);
    f('sub').textContent = [`Start P${car.gridPos}`, car.strategy ? `Strategie ${car.strategy}` : '', `Stimmung ${ml[1]} ${ml[0]}`, car.dsq ? 'DSQ' : '', pens ? `+${pens} s Strafe` : '', ...serve].filter(Boolean).join(' · ');
    const ahead = st[i - 1], behind = st[i + 1];
    let gaps = '';
    if (!race.preStart && !car.retired) {
      gaps = `${ahead ? `<em>▲ ${ahead.id}</em> ${fmtGap(race.gap(car, ahead))}` : '<em>Führung</em>'}<br>${behind && !behind.retired ? `<em>▼ ${behind.id}</em> ${fmtGap(race.gap(behind, car))}` : ''}`;
    }
    f('gaps').innerHTML = gaps;
    const C = COMPOUNDS[car.compound];
    const tyre = f('tyre');
    tyre.textContent = C.id;
    tyre.className = `pw-tyre ${C.id}`;
    const life = tyreLife(race, car);
    f('life').style.width = `${life}%`;
    f('life').style.background = lifeCol(life);
    f('meta').innerHTML = `<b>${life}%</b> · ${car.tyreAge} Rd · ${car.stops} St`;
    const hs = (car.stintLog || []).map(x => x.c + x.laps).join('|');
    if (f('hist').dataset.sig !== hs) { f('hist').dataset.sig = hs; f('hist').innerHTML = `<span class="pw-hl">REIFEN BISHER</span>${histHtml(car)}`; }
    // Tempo mit Reifen-Runden je Stufe
    const toGo = Math.max(0, race.laps - car.lap);
    for (const b of el.querySelectorAll('[data-pace]')) {
      b.classList.toggle('on', car.paceMode === b.dataset.pace);
      b.disabled = gone;
      b.querySelector('small').textContent = `${lapsTxt(lapsLeftOnTyres(race, car, b.dataset.pace))} Rd`;
    }
    const hold = lapsLeftOnTyres(race, car);
    f('hold').innerHTML = gone ? '' : `Reifen halten bei ${PACE[car.paceMode].name} noch <b>~${lapsTxt(hold)} Runden</b> · bis Ziel ${toGo}${hold >= toGo ? ' ✓' : ''}`;
    // Energie
    const e = Math.round((car.energy ?? 1) * 100);
    f('ers').style.width = `${e}%`;
    f('ers').style.background = e > 30 ? '#38bdf8' : '#f97316';
    f('erspct').innerHTML = `<b>${e}%</b>`;
    for (const b of el.querySelectorAll('[data-tac]')) { b.classList.toggle('on', (car.tactic || 'normal') === b.dataset.tac); b.disabled = gone; }
    for (const b of el.querySelectorAll('[data-call]')) b.disabled = gone || race.preStart;
    const rb = f('radio');
    const msg = openMessage(race, car);
    const rsig = msg ? msg.id : 0;
    if (rb.dataset.sig !== String(rsig)) {
      rb.dataset.sig = String(rsig);
      rb.classList.toggle('hidden', !msg);
      rb.innerHTML = msg ? `<div class="pw-rtext">📻 <b>${car.id}:</b> „${esc(msg.text)}“</div><div class="pw-ropts">${msg.options.map(o => `<button data-msg="${msg.id}" data-opt="${o.id}">${esc(o.label)}</button>`).join('')}</div><i class="pw-rtime"></i>` : '';
    }
    if (msg) { const tl = rb.querySelector('.pw-rtime'); tl.style.width = `${Math.max(0, Math.min(100, (msg.until - race.time) / (msg.until - msg.t) * 100))}%`; }
    for (const b of el.querySelectorAll('[data-ers]')) { b.classList.toggle('on', (car.ersMode || 'normal') === b.dataset.ers); b.disabled = gone; }
    // Plan
    const nx = nextStop(car);
    const due = stopDue(car);
    const plan = f('plan');
    const sig = `${nx ? nx.lap + nx.compound : '-'}|${car.boxCall ? 1 : 0}|${due}|${gone}|${car.inPit}`;
    if (plan.dataset.sig !== sig) {
      plan.dataset.sig = sig;
      if (gone) plan.innerHTML = '';
      else if (car.boxCall) plan.innerHTML = `<span>BOX angesagt → ${COMPOUNDS[car.boxCall.compound].name}</span>`;
      else if (nx) plan.innerHTML = `<span>PLAN: ${due ? 'diese Runde' : `R${nx.lap}`} → ${COMPOUNDS[nx.compound].name}</span><button data-plan="-1">−1</button><button data-plan="1">+1</button><button data-plan="x">✕</button>`;
      else plan.innerHTML = `<span>Kein Stopp geplant</span><button data-plan="add">+ STOPP</button>`;
    }
    // Reifenwahl = Mischung des nächsten Stopps
    if (!ui.sel[car.id]) ui.sel[car.id] = defaultCompound(car);
    const sel = car.boxCall ? car.boxCall.compound : nx ? nx.compound : ui.sel[car.id];
    for (const b of el.querySelectorAll('[data-cmp]')) {
      b.classList.toggle('on', b.dataset.cmp === sel);
      b.disabled = gone || car.inPit;
    }
    // Box-Knopf
    const bb = el.querySelector('[data-act="box"]');
    const late = (car.boxCall || due) && tooLateForBox(race, car) && !(car.boxCall && car.boxCall.lap);
    bb.className = 'pw-boxbtn';
    if (car.inPit || car.stopTimer > 0) { bb.textContent = car.redQueued ? 'ROT · BOX' : 'IN DER BOX'; bb.classList.add('inpit'); bb.disabled = true; }
    else if (car.boxCall || due) { bb.textContent = late ? 'KOMMT REIN' : 'ABBRECHEN'; bb.classList.add('called'); bb.disabled = late; }
    else { bb.textContent = 'BOX'; bb.disabled = gone || race.preStart || car.lap >= race.laps - 1; }
    // Wo kommt er raus?
    const rj = f('rejoin');
    if (gone || race.preStart || car.inPit) { rj.textContent = ''; rj.className = 'pw-rejoin'; }
    else {
      const r = rejoin(race, car);
      const tr = r.ahead && r.ahead.gap < 1.5;
      rj.className = `pw-rejoin ${tr ? 'traffic' : 'free'}`;
      rj.innerHTML = `Stopp jetzt: P${r.pos} · <b>${tr ? `Verkehr hinter ${r.ahead.car.id} (${fmt(r.ahead.gap)} s)` : `freie Luft${r.ahead ? ` (${fmt(r.ahead.gap)} s bis ${r.ahead.car.id})` : ''}`}</b> · Verlust ${fmt(r.loss)} s`;
    }
    const hint = hintFor(car, st);
    const h = f('hint');
    h.textContent = hint.text;
    h.className = `pw-hint${hint.cls ? ' ' + hint.cls : ''}`;
  }
  // Teamorder
  const ord = race.teamOrder || 'free';
  const swapping = race.cars.find(c => c.letBy);
  for (const b of $('wall').querySelectorAll('[data-order]')) b.classList.toggle('on', b.dataset.order === 'swap' ? Boolean(swapping) : b.dataset.order === ord && !swapping);
  const oh = $('wall').querySelector('[data-f="order"]');
  if (oh) oh.textContent = swapping ? `${swapping.id} lässt ${swapping.letBy} vorbei …` : ord === 'hold' ? 'Keine Angriffe auf den Teamkollegen.' : ui.orderMsg || 'Beide dürfen frei gegeneinander fahren.';
}

function hintFor(car, st) {
  if (car.retired) return { text: car.dnf ? `Ausgeschieden: ${car.dnf}` : 'Ausgeschieden', cls: 'bad' };
  if (car.finished) return { text: `Im Ziel auf P${car.finishPos}.` };
  if (race.preStart) return { text: `Start auf ${COMPOUNDS[car.compound].name}.` };
  const w = race.weather.wetness;
  const left = race.laps - car.lap;
  const mate = race.cars.find(o => o.player && o !== car && !o.retired && !o.finished);
  const n = race.neutral;
  const comes = car.boxCall || stopDue(car);
  if (car.damage) return { text: car.damage === 'puncture' ? 'Reifenschaden! Er kommt sofort rein.' : 'Schaden am Auto – Reparaturstopp nötig.', cls: 'bad' };
  if (comes && mate && (mate.boxCall || stopDue(mate) || mate.inPit)) return { text: `Achtung Doppelstopp: ${mate.id} kommt auch – der Zweite muss hinten warten (~3–5 s).`, cls: 'warn' };
  const slick = !COMPOUNDS[car.compound].wet;
  if (slick && w > 0.3) return { text: `Strecke ${w > 0.6 ? 'sehr nass' : 'nass'} – Slicks verlieren viel Zeit. ${bestCompound(w, left) === 'W' ? 'Regenreifen' : 'Intermediates'}?`, cls: 'bad' };
  if (slick && race.weather.rain > 0.2) return { text: 'Es regnet – Strecke wird nasser. Wetterradar prüfen (Wettersymbol oben).', cls: 'warn' };
  if (!slick && w < 0.15 && left > 2) return { text: 'Strecke trocknet ab – Zeit für Slicks?', cls: 'warn' };
  if (n && (n.type === 'sc' || n.type === 'vsc') && left > 3 && !comes) {
    const r = rejoin(race, car);
    return { text: `${n.type === 'sc' ? 'Safety Car' : 'VSC'}: Stopp kostet jetzt nur ~${fmt(r.loss)} s statt ~${fmt(pitLoss({ ...race, neutral: null, track: race.track }, car))} s.`, cls: 'warn' };
  }
  const life = tyreLife(race, car);
  if (life < 15 && left > 2) return { text: 'Reifen über der Klippe – er verliert viel Zeit pro Runde.', cls: 'bad' };
  const dry = ![...car.usedCompounds].some(x => x === 'I' || x === 'W') && w < 0.1;
  if (dry && car.usedCompounds.size < 2 && !nextStop(car) && left <= 10) return { text: 'Pflicht: Im Trockenen muss noch eine zweite Mischung gefahren werden!', cls: 'bad' };
  const i = st.indexOf(car);
  const ahead = st[i - 1];
  // Overcut: Gegner direkt vor uns hat gerade gestoppt
  const passed = race.cars.find(o => !o.player && !o.retired && o.inPit && st.indexOf(o) === i - 1);
  if (passed && life > 35 && !comes) return { text: `Overcut-Chance: ${passed.id} ist in der Box – draußen bleiben und freie Runden fahren (Push).`, cls: 'warn' };
  if (ahead && !ahead.player && !ahead.inPit && !n && !comes) {
    const g = race.gap(car, ahead);
    const cmp = ui.sel[car.id] || defaultCompound(car);
    const gain = freshGain(race, car, cmp);
    if (g && !g.laps && g.time < 2.5 && car.tyreAge >= ahead.tyreAge - 1 && gain > 0.6) {
      const r = rejoin(race, car);
      return { text: `Undercut auf ${ahead.id} (${fmt(g.time)} s): frische ${COMPOUNDS[cmp].name} bringen ~${fmt(gain)} s/Runde. ${r.ahead && r.ahead.gap < 1.5 ? `Aber Verkehr hinter ${r.ahead.car.id}!` : 'Rauskommen in freier Luft.'}`, cls: 'warn' };
    }
  }
  if (car.tactic === 'block') return { text: `Aufhalten: ${car.id} fährt ~0,8 s/Runde langsamer und hält das Feld auf${mate && st.indexOf(mate) < i ? ` – ${mate.id} kann sich absetzen` : ''}.`, cls: 'warn' };
  if (car.tactic === 'overtake' && (!ahead || (race.gap(car, ahead) || { time: 9 }).time > 1.5)) return { text: 'Überholen: kein Auto in Reichweite – mehr Risiko ohne Nutzen.' };
  const nx = nextStop(car);
  if (nx) {
    const hold = lapsLeftOnTyres(race, car);
    if (hold < nx.lap - car.lap - 1) return { text: `Reifen halten nicht bis Runde ${nx.lap} – Tempo runter oder früher stoppen.`, cls: 'warn' };
    return { text: `Strategie ${car.strategy || ''}: nächster Stopp Runde ${nx.lap} auf ${COMPOUNDS[nx.compound].name}.` };
  }
  if (car.paceMode === 'attack') return { text: 'Attacke kostet viel Reifen und erhöht das Fehlerrisiko.' };
  return { text: lapsLeftOnTyres(race, car) < left ? 'Reifen halten nicht bis ins Ziel – Stopp einplanen oder schonen.' : 'Kein weiterer Stopp nötig.', cls: lapsLeftOnTyres(race, car) < left ? 'warn' : '' };
}

$('wall').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b || b.disabled || !race) return;
  sound.unlock();
  if (b.dataset.wtab) { ui.wallCar = b.dataset.wtab; renderWall(); $('panel-wall').scrollTop = 0; return; }
  if (race.isSession) { sessionClick(e, b); return; }
  if (b.dataset.order) {
    if (b.dataset.order === 'swap') { const r = swapCars(race); ui.orderMsg = r.ok ? '' : r.why; }
    else { setTeamOrder(race, b.dataset.order); ui.orderMsg = ''; }
    renderWall();
    return;
  }
  const el = e.target.closest('[data-car]');
  if (!el) return;
  const car = race.carById[el.dataset.car];
  if (b.dataset.msg) { answer(race, Number(b.dataset.msg), b.dataset.opt); renderWall(); return; }
  if (b.dataset.red) { redTyres(race, car, b.dataset.red); renderWall(); return; }
  if (b.dataset.pace) setPace(race, car, b.dataset.pace);
  else if (b.dataset.tac) setTactic(race, car, b.dataset.tac);
  else if (b.dataset.call) ownCall(race, car, b.dataset.call);
  else if (b.dataset.ers) setErs(race, car, b.dataset.ers);
  else if (b.dataset.cmp) {
    ui.sel[car.id] = b.dataset.cmp;
    setStopCompound(car, b.dataset.cmp);
  } else if (b.dataset.plan) {
    const v = b.dataset.plan;
    if (v === 'x') dropStop(race, car);
    else if (v === 'add') addStop(race, car, ui.sel[car.id] || defaultCompound(car));
    else shiftStop(race, car, Number(v));
  } else if (b.dataset.act === 'box') {
    if (car.boxCall || stopDue(car)) cancelBox(race, car);
    else callBox(race, car, ui.sel[car.id] || defaultCompound(car));
  } else if (b.dataset.act === 'circle') {
    ui.circleCar = car.id;
    setTab('circle');
    return;
  }
  renderWall();
});

// ---------- Reifen-Historie (Rennen) ----------
function histHtml(car) {
  const log = car.stintLog || [];
  if (!log.length) return `<span class="pw-tyre ${car.compound}">${car.compound}</span>`;
  return log.map((x, i) => `<span class="pw-tyre ${x.c}">${x.c}</span><span>${x.laps} Rd${x.used > 0 ? ` (gebr. ${x.used})` : ''}${i === log.length - 1 && !car.finished && !car.retired ? ' · jetzt' : ''}</span>`).join('<i>›</i>');
}

// ---------- Training / Qualifying: Ausfahrten, Verkehr, Setup ----------
const RUN_PUSH = { fp: [1, 3, 5, 8], quali: [1, 2, 3], sq: [1, 2, 3] };
function runCfg(car) {
  if (!ui.run[car.id]) ui.run[car.id] = { c: race.weather.wetness > 0.15 ? bestCompound(race.weather.wetness, 20) : race.kind === 'fp' ? 'M' : 'S', fresh: race.kind !== 'fp', push: race.kind === 'fp' ? 3 : 1, fuel: race.kind === 'fp' ? 'high' : 'low' };
  return ui.run[car.id];
}
function runSet(car) {
  const cfg = runCfg(car);
  const list = setsOf(wk, car.id, cfg.c);
  const fresh = list.find(s => s.laps < 0.05), used = list.find(s => s.laps >= 0.05);
  return cfg.fresh ? fresh || used || null : used || fresh || null;
}
// Verkehrs-Prognose fürs Rausfahren: Autos auf der Aufwärmrunde und Autos, die gleich aus der Garage kommen
function trafficForecast(car) {
  const others = race.cars.filter(c => c !== car && !c.retired && (c.elimSeg === null || c.elimSeg === undefined));
  const outlap = others.filter(c => !c.inGarage && c.prog.phase === 'out').length;
  const onTrack = others.filter(c => !c.inGarage).length;
  const soon = others.filter(c => c.inGarage && c.prog.runs[c.prog.runIdx] && c.prog.runs[c.prog.runIdx].depart - race.clock < 60).length;
  const score = outlap + soon * 0.8 + onTrack * 0.15;
  return { level: score < 2.5 ? 'niedrig' : score < 5 ? 'mittel' : 'hoch', cls: score < 2.5 ? 'free' : score < 5 ? 'mid' : 'traffic', outlap, soon, onTrack };
}
function sessStatus(car) {
  if (car.retired) return 'Ausgeschieden (Defekt/Unfall)';
  if (car.elimSeg !== null && car.elimSeg !== undefined) return `Ausgeschieden in ${race.info.segments[car.elimSeg].id}`;
  if (car.inGarage) return 'In der Garage';
  const p = car.prog.phase;
  return p === 'out' ? 'Aufwärmrunde' : p === 'push' ? `Schnelle Runde${car.prog.pushLeft > 1 ? ` (noch ${car.prog.pushLeft})` : ''}${car.dirty ? ' · im Verkehr!' : ''}` : 'Auslaufrunde – kommt rein';
}

function buildSessionWall() {
  const cars = playerCars(race);
  ui.built = race;
  if (!ui.wallCar || !race.carById[ui.wallCar]) ui.wallCar = cars[0].id;
  const fp = race.kind === 'fp';
  $('wall').innerHTML = `<div class="pw-dtabs">${cars.map(c => `<button data-wtab="${c.id}" style="--tc:${c.team.color}"><b>${esc(c.driver.last)}</b><span data-wt="${c.id}"></span></button>`).join('')}</div>` + cars.map(c => `
    <div class="pw-car" data-car="${c.id}" style="--tc:${c.team.color}">
      <div class="pw-head">
        <span class="pw-pos" data-f="pos">–</span>
        <span class="pw-name">${esc(c.driver.first)} ${esc(c.driver.last)}<small data-f="sub"></small></span>
        <span class="pw-gaps" data-f="gaps"></span>
      </div>
      <div class="pw-status" data-f="status"></div>
      <div class="pw-row"><span class="pw-tyre" data-f="tyre"></span><span class="pw-life"><b data-f="life"></b></span><span class="pw-meta" data-f="meta"></span></div>
      <div class="pw-label">AUSFAHRT</div>
      <div class="pw-cmp" data-f="cmp">${['S', 'M', 'H', 'I', 'W'].map(k => `<button class="${k}" data-rc="${k}">${k}<small></small></button>`).join('')}</div>
      <div class="pw-seg ers"><button data-fresh="1">NEUER SATZ</button><button data-fresh="0">GEBRAUCHT</button><button data-auto="1">AUTO-PROGRAMM</button></div>
      <div class="pw-label">SCHNELLE RUNDEN${fp ? ' · SPRIT' : ''}</div>
      <div class="pw-seg">${RUN_PUSH[race.kind].map(n => `<button data-push="${n}">${n}</button>`).join('')}</div>
      ${fp ? '<div class="pw-seg ers"><button data-fuel="low">WENIG SPRIT</button><button data-fuel="high">VIEL SPRIT</button><span></span></div>' : ''}
      <div class="pw-rejoin" data-f="traffic"></div>
      <button class="pw-boxbtn pw-go" data-act="go">RAUSFAHREN</button>
      <div class="pw-hint" data-f="hint"></div>
      <div class="pw-label">RUNDEN</div>
      <div class="pw-laps" data-f="laps"></div>
      ${fp ? `<div class="pw-label">SETUP <span data-f="lock"></span></div>
      <div class="pw-setup">${Object.entries(SETUP_KEYS).map(([k, d]) => `<div class="pw-srow"><span>${d.name}</span><button data-set="${k}" data-d="-1">−</button><b data-sv="${k}"></b><button data-set="${k}" data-d="1">+</button><small>${d.lo} ↔ ${d.hi}</small></div>`).join('')}</div>
      <div class="pw-label">RÜCKMELDUNG DES FAHRERS</div>
      <div class="pw-notes" data-f="notes"></div>` : ''}
      <div class="pw-label">REIFEN-KONTINGENT</div>
      <div class="pw-alloc" data-f="alloc"></div>
    </div>`).join('');
}

function renderSessionWall() {
  if (ui.built !== race) buildSessionWall();
  const st = race.standings();
  const fp = race.kind === 'fp';
  for (const el of $('wall').querySelectorAll('.pw-car')) {
    const car = race.carById[el.dataset.car];
    const f = k => el.querySelector(`[data-f="${k}"]`);
    el.classList.toggle('hidden', car.id !== ui.wallCar);
    const i = st.indexOf(car);
    const tab = $('wall').querySelector(`[data-wtab="${car.id}"]`);
    tab.classList.toggle('on', car.id === ui.wallCar);
    tab.querySelector('span').textContent = `P${i + 1} · ${car.inGarage ? 'Garage' : 'Strecke'}`;
    f('pos').textContent = `P${i + 1}`;
    const t = race.rankTime(car);
    f('sub').textContent = t ? `Bestzeit ${formatLap(t)}` : 'Noch keine Zeit';
    // Abstand zur Spitze und zur Ausscheidungsgrenze
    const lead = st[0] && race.rankTime(st[0]);
    let gaps = t && lead ? `<em>zu P1</em> ${i === 0 ? '–' : `+${fmt(t - lead, 3)}`}` : '';
    const seg = race.segment;
    if (!fp && seg.keep && race.segState === 'run' && (car.elimSeg === null || car.elimSeg === undefined)) {
      const rk = race.segmentRanking();
      const cut = rk[seg.keep - 1], ct = cut && cut.segBest && cut.segBest[race.segIdx];
      const my = car.segBest && car.segBest[race.segIdx];
      const ri = rk.indexOf(car);
      gaps += `<br><em>Grenze P${seg.keep}</em> ${ct ? formatLap(ct) : '–'}${my && ct ? ` (${ri < seg.keep ? 'sicher' : `+${fmt(my - ct, 3)}`})` : ''}`;
    }
    f('gaps').innerHTML = gaps;
    f('status').textContent = sessStatus(car);
    f('status').className = `pw-status${car.dirty ? ' bad' : car.inGarage ? '' : ' on'}`;
    const C = COMPOUNDS[car.compound];
    f('tyre').textContent = C.id; f('tyre').className = `pw-tyre ${C.id}`;
    const life = car.inGarage ? null : tyreLife(race, car);
    f('life').style.width = `${life ?? 0}%`;
    f('life').style.background = '#22c55e';
    f('meta').innerHTML = car.inGarage ? 'in der Box' : `<b>${life}%</b> · ${car.sLaps.length} Rd gezeitet`;
    // Ausfahrt-Einstellungen
    const cfg = runCfg(car);
    const sum = setSummary(wk, car.id);
    for (const b of el.querySelectorAll('[data-rc]')) {
      const k = b.dataset.rc;
      b.classList.toggle('on', cfg.c === k);
      b.querySelector('small').textContent = sum[k].fresh;
    }
    for (const b of el.querySelectorAll('[data-fresh]')) b.classList.toggle('on', String(cfg.fresh ? 1 : 0) === b.dataset.fresh);
    el.querySelector('[data-auto]').classList.toggle('on', Boolean(car.autoRuns));
    for (const b of el.querySelectorAll('[data-push]')) b.classList.toggle('on', Number(b.dataset.push) === cfg.push);
    for (const b of el.querySelectorAll('[data-fuel]')) b.classList.toggle('on', cfg.fuel === b.dataset.fuel);
    const set = runSet(car);
    const out = car.elimSeg !== null && car.elimSeg !== undefined;
    const tf = trafficForecast(car);
    f('traffic').className = `pw-rejoin ${tf.cls === 'free' ? 'free' : 'traffic'}`;
    f('traffic').innerHTML = car.inGarage && !out ? `Verkehr beim Rausfahren: <b>${tf.level}</b> · ${tf.onTrack} auf der Strecke, ${tf.outlap} auf der Aufwärmrunde, ${tf.soon} fahren in 60 s raus` : '';
    const go = el.querySelector('[data-act="go"]');
    const blocked = race.phase !== 'running' || race.segState !== 'run' || race.segFlag || (race.neutral && race.neutral.type === 'red');
    if (car.inGarage) {
      go.textContent = set ? `RAUSFAHREN · ${COMPOUNDS[cfg.c].name} ${set.laps < 0.05 ? 'neu' : `gebr. ${Math.round(set.laps)} Rd`}` : 'KEIN SATZ VERFÜGBAR';
      go.disabled = out || !set || blocked || car.retired;
      go.className = 'pw-boxbtn pw-go';
    } else {
      go.textContent = car.prog.phase === 'cool' ? 'KOMMT REIN' : 'REINHOLEN';
      go.disabled = car.prog.phase === 'cool';
      go.className = 'pw-boxbtn pw-go called';
    }
    // Hinweis
    let hint = '';
    if (out) hint = 'Für diesen Teil ist der Fahrer ausgeschieden.';
    else if (race.segState === 'break') hint = 'Pause – gleich geht es weiter.';
    else if (race.segFlag) hint = 'Zielflagge – nur bereits begonnene Runden zählen noch.';
    else if (car.inGarage && !fp && race.remaining < race.track.baseLap * 2.1 + 20 && !t) hint = 'Letzte Chance: Aufwärmrunde + schnelle Runde passen gerade noch!';
    else if (car.inGarage && race.remaining < race.track.baseLap * 1.3 + 25) hint = 'Zu spät – die schnelle Runde würde nicht mehr vor der Zielflagge beginnen.';
    else if (car.inGarage && !fp && !cfg.fresh) hint = 'Gebrauchte Reifen sind langsamer – neue Softs bringen die beste Zeit.';
    else if (car.inGarage && !fp) hint = `Strecke wird schneller – späte Runden sind besser, aber riskanter (Verkehr, Rote Flagge).`;
    else if (car.inGarage && fp) hint = 'Mehrere Runden mit viel Sprit zeigen das Renntempo, wenig Sprit die Quali-Pace. Nach jeder Ausfahrt gibt der Fahrer Rückmeldung.';
    f('hint').textContent = hint;
    // Runden
    const laps = car.sLaps.slice(-6).reverse();
    f('laps').innerHTML = laps.length ? laps.map(l => `<span class="${l.valid ? '' : 'del'}">${race.info.segments.length > 1 ? `${race.info.segments[l.seg].id} ` : ''}${l.label}${l.traffic ? ' <i>Verkehr</i>' : ''}${l.valid ? '' : ' <i>gestrichen</i>'}</span>`).join('') : '<span>–</span>';
    // Setup (nur Training)
    if (fp) {
      const lock = wk.setupLocked ? 'Parc fermé' : car.inGarage ? '' : '· nur in der Garage änderbar';
      f('lock').textContent = lock;
      for (const [k] of Object.entries(SETUP_KEYS)) el.querySelector(`[data-sv="${k}"]`).textContent = wk.setup[car.id][k];
      for (const b of el.querySelectorAll('[data-set]')) b.disabled = wk.setupLocked || !car.inGarage;
      const notes = wk.notes[car.id].slice(-4).reverse();
      const nsig = String(wk.notes[car.id].length);
      if (f('notes').dataset.sig !== nsig) {
        f('notes').dataset.sig = nsig;
        f('notes').innerHTML = notes.length ? notes.map(n => `<div>„${esc(n.text)}“<small>Flügel ${n.setup.wing} · Balance ${n.setup.bal} · Federung ${n.setup.stiff} · ${n.n} Rd, beste ${formatLap(n.best)}</small></div>`).join('') : '<div>Noch keine Ausfahrt.</div>';
      }
    }
    // Kontingent
    f('alloc').innerHTML = Object.entries(sum).map(([k, v]) => `<span><i class="pw-tyre ${k}">${k}</i> ${v.fresh} neu${v.used.length ? ` · ${v.used.length} gebr.` : ''}</span>`).join('');
  }
}

function sessionClick(e, b) {
  const el = e.target.closest('[data-car]');
  if (!el) return;
  const car = race.carById[el.dataset.car];
  const cfg = runCfg(car);
  if (b.dataset.rc) cfg.c = b.dataset.rc;
  else if (b.dataset.fresh) cfg.fresh = b.dataset.fresh === '1';
  else if (b.dataset.push) cfg.push = Number(b.dataset.push);
  else if (b.dataset.fuel) cfg.fuel = b.dataset.fuel;
  else if (b.dataset.auto) race.setAutoRuns(car, !car.autoRuns);
  else if (b.dataset.set) {
    const k = b.dataset.set, d = SETUP_KEYS[k];
    wk.setup[car.id][k] = Math.max(d.min, Math.min(d.max, wk.setup[car.id][k] + Number(b.dataset.d)));
    applyWeekend(race, wk);
  } else if (b.dataset.act === 'go') {
    if (car.inGarage) {
      const ok = race.playerRun(car, { compound: cfg.c, push: cfg.push, fuel: cfg.fuel === 'high' ? 0.7 : race.kind === 'fp' ? 0.15 : 0.05, set: runSet(car) });
      if (ok) race.emit('radio', `Teamfunk ${car.team.name} an ${car.id}: „Raus geht’s – ${cfg.push} schnelle Runde${cfg.push > 1 ? 'n' : ''} auf ${COMPOUNDS[cfg.c].name}.“`, { cars: [car.id], own: true });
    } else if (race.playerBoxIn(car)) race.emit('radio', `Teamfunk ${car.team.name} an ${car.id}: „Box, box – komm rein.“`, { cars: [car.id], own: true });
  }
  renderSessionWall();
}

// ---------- Circle of Doom: eine Runde als Zeit-Kreis, Rejoin nach einem Stopp ----------
$('circleCars').addEventListener('click', e => {
  const b = e.target.closest('[data-id]');
  if (b) { ui.circleCar = b.dataset.id; renderCircle(); }
});
function renderCircle() {
  if (!race) return;
  const mine = playerCars(race);
  const chips = mine.map(c => `<button data-id="${c.id}" class="${c.id === ui.circleCar ? 'on' : ''}">${c.id}</button>`).join('');
  if ($('circleCars').innerHTML !== chips) $('circleCars').innerHTML = chips;
  const cv = $('circle');
  // Größe so, dass der Kreis ohne Scrollen in den Bereich passt
  const pan = $('panel-circle');
  const size = Math.floor(Math.max(150, Math.min(pan.clientWidth - 16, pan.clientHeight - $('circleCars').offsetHeight - 22, 360)));
  if (cv.style.width !== `${size}px`) { cv.style.width = `${size}px`; cv.style.height = `${size}px`; }
  const r = cv.getBoundingClientRect();
  if (!r.width) return;
  const dpr = window.devicePixelRatio || 1;
  if (cv.width !== Math.round(r.width * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.width * dpr); }
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const S = r.width, cx = S / 2, cy = S / 2, R = S * 0.31;
  ctx.clearRect(0, 0, S, S);
  const P = a => [cx + Math.sin(a) * R, cy - Math.cos(a) * R];
  // Ring
  ctx.lineWidth = 14; ctx.strokeStyle = '#2a303a';
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
  // Start/Ziel und Boxenausfahrt
  ctx.fillStyle = '#f1f4f8'; ctx.fillRect(cx - 1.5, cy - R - 11, 3, 22);
  const car = race.carById[ui.circleCar];
  const live = car && !car.retired && !car.finished && !race.preStart;
  let rj = null;
  if (live) {
    rj = rejoin(race, car);
    // Fenster ±1,5 s um den Rejoin-Punkt
    const Tl = lapTime(race.track);
    const a = circleAngle(race, rj.ghostT), wa = 1.5 / Tl * Math.PI * 2;
    ctx.lineWidth = 16;
    ctx.strokeStyle = rj.ahead && rj.ahead.gap < 1.5 ? 'rgba(249,115,22,.45)' : 'rgba(34,197,94,.4)';
    ctx.beginPath(); ctx.arc(cx, cy, R, a - Math.PI / 2 - wa, a - Math.PI / 2 + wa); ctx.stroke();
  }
  // Autos
  const cars = race.cars.filter(c => !c.retired && !(c.finished && race.phase === 'finished'));
  const placed = [];
  for (const c of cars) {
    const a = circleAngle(race, timeOf(race, c));
    const [x, y] = P(a);
    const own = c.player;
    ctx.beginPath(); ctx.arc(x, y, own ? 7 : 5, 0, Math.PI * 2);
    ctx.fillStyle = c.team.color; ctx.fill();
    ctx.lineWidth = own ? 2.5 : 1; ctx.strokeStyle = own ? '#facc15' : '#0b0d11'; ctx.stroke();
    // Kürzel außen, bei Gedränge abwechselnd weiter außen
    let k = 0;
    while (placed.some(p => Math.abs(p.a - a) < 0.13 && p.k === k) && k < 3) k++;
    placed.push({ a, k });
    const lr = R + 18 + k * 13;
    ctx.font = `${own ? 800 : 600} ${own ? 11 : 9.5}px ui-monospace, monospace`;
    ctx.fillStyle = own ? '#facc15' : '#aab3c2';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(c.id, cx + Math.sin(a) * lr, cy - Math.cos(a) * lr);
    if (c.inPit) { ctx.fillStyle = '#94a3b8'; ctx.font = '700 8px ui-monospace, monospace'; ctx.fillText('BOX', cx + Math.sin(a) * (R - 16), cy - Math.cos(a) * (R - 16)); }
  }
  // Geist: dort käme das Auto nach einem Stopp jetzt heraus
  if (rj) {
    const [x, y] = P(circleAngle(race, rj.ghostT));
    ctx.setLineDash([3, 3]); ctx.lineWidth = 2.5; ctx.strokeStyle = '#facc15';
    ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#facc15'; ctx.font = '800 10px ui-monospace, monospace';
    ctx.fillText(`${car.id} ⟲`, cx + (x - cx) * 0.72, cy + (y - cy) * 0.72);
  }
  // Mitte
  ctx.fillStyle = '#e6e9ef'; ctx.font = '800 13px ui-monospace, monospace';
  ctx.fillText(rj ? `P${rj.pos}` : '–', cx, cy - 8);
  ctx.fillStyle = '#8a94a7'; ctx.font = '600 10px ui-monospace, monospace';
  ctx.fillText(rj ? 'nach Stopp' : '', cx, cy + 8);
}

// Geist des ausgewählten Autos auch auf der Karte
function drawGhost() {
  if (activeTab !== 'circle' || !race || race.preStart) return;
  const car = race.carById[ui.circleCar];
  if (!car || car.retired || car.finished) return;
  const rj = rejoin(race, car);
  const ctx = map.ctx;
  ctx.setTransform(map.dpr || 1, 0, 0, map.dpr || 1, 0, 0);
  const [x, y] = map.pos(rj.ghostD);
  ctx.setLineDash([3, 3]); ctx.lineWidth = 2.5; ctx.strokeStyle = '#facc15';
  ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#facc15'; ctx.font = '800 10px ui-monospace, monospace'; ctx.textAlign = 'left';
  ctx.fillText(`${car.id} ⟲`, x + 12, y + 4);
}

// ---------- Rennstrategie vor dem Start ----------
const stratPick = {};
let stratOpts = {};
function showStrategy() {
  const cars = playerCars(race);
  stratOpts = {};
  for (const c of cars) { stratOpts[c.id] = strategyOptions(race, c, wk); stratPick[c.id] = 'A'; }
  renderStrategy();
  $('startScreen').classList.add('hidden');
  $('stratScreen').classList.remove('hidden');
  $('stratScreen').scrollTop = 0;
}
function renderStrategy() {
  const cars = playerCars(race);
  const who = STRATEGISTS[cars[0].team.id];
  const tyres = s => [s.start, ...s.stops.map(x => x.compound)].map((k, i) => `${i ? `<span>R${s.stops[i - 1].lap}</span>` : ''}<span class="pw-tyre ${k}">${k}</span>`).join('');
  $('stratBody').innerHTML = `<div class="pw-sum">Rennstratege <b>${esc(who)}</b> hat zwei Varianten je Fahrer gerechnet (${race.laps} Runden, Boxenverlust ~${fmt(pitLoss(race, cars[0]))} s).</div>`
    + cars.map((c, n) => `<div class="pw-strat" style="--tc:${c.team.color}"><h3><span class="pw-snum">${n + 1}</span>${esc(c.driver.first)} ${esc(c.driver.last)} <small>#${c.driver.number} · Startplatz ${c.gridPos}</small></h3>
      ${stratOpts[c.id].map(s => `<button class="pw-opt${stratPick[c.id] === s.key ? ' on' : ''}" data-car="${c.id}" data-k="${s.key}"><b>${s.key} · ${esc(s.name)}</b><div class="tyres">${tyres(s)}</div><div>${esc(s.note)}</div></button>`).join('')}</div>`).join('');
}
$('stratBody').addEventListener('click', e => {
  const b = e.target.closest('[data-k]');
  if (!b) return;
  stratPick[b.dataset.car] = b.dataset.k;
  renderStrategy();
});
$('stratGo').addEventListener('click', () => {
  for (const c of playerCars(race)) applyStrategy(race, c, stratOpts[c.id].find(s => s.key === stratPick[c.id]));
  race.strategyDone = true;
  ui.sel = {};
  $('stratScreen').classList.add('hidden');
  startRace();
});

// ---------- Ergebnis ----------
function showResults() {
  resultShown = true;
  const nk = nextKind(wk);
  $('newRaceBtn').textContent = nk ? `Weiter: ${SESSION_NAME[nk]}` : 'Zur Startseite';
  $('endWkBtn').classList.toggle('hidden', !nk);
  if (race.isSession) { showSessionResults(); return; }
  const st = race.standings();
  const leader = st[0];
  const mine = playerCars(race);
  let teamPts = 0;
  const rows = st.map((c, i) => {
    const pts = !c.retired && !c.dsq && i < 10 ? POINTS[i] : 0;
    if (c.player) teamPts += pts;
    let gap = '';
    if (c.dsq) gap = 'DSQ';
    else if (c.retired) gap = 'DNF';
    else if (i === 0) gap = formatClock(race.adjustedFinish(c));
    else if (c.lap < leader.lap) gap = `+${leader.lap - c.lap} Rd`;
    else gap = `+${(race.adjustedFinish(c) - race.adjustedFinish(leader)).toFixed(1).replace('.', ',')} s`;
    return `<tr class="${c.player ? 'mine' : ''}"><td>${c.retired || c.dsq ? '–' : i + 1}</td><td class="tc" style="background:${c.team.color}"></td><td>${c.id}</td><td>${esc(c.team.short)}</td><td style="text-align:right">${gap}</td><td>${c.stops}</td><td style="text-align:right">${pts || ''}</td></tr>`;
  }).join('');
  const t = TEAM_BY_ID[race.playerTeam];
  $('resultTitle').textContent = `🏁 ${race.track.def.grandPrix.replace('Großer Preis ', 'GP ')}`;
  $('resultBody').innerHTML = `<div class="pw-sum"><b>${esc(t.name)}</b>: ${mine.map(c => `${c.id} ${c.retired ? 'DNF' : c.dsq ? 'DSQ' : 'P' + (st.indexOf(c) + 1)}`).join(' · ')} · <b>${teamPts} Punkte</b></div>
    <table class="pw-res"><tbody>${rows}</tbody></table>
    ${mine.map(c => `<div class="pw-hist"><b>${c.id}</b> ${histHtml(c)}</div>`).join('')}`;
  $('resultTitle').textContent = `🏁 ${race.kind === 'sprint' ? 'Sprint' : 'Rennen'} · ${race.track.def.grandPrix.replace('Großer Preis ', 'GP ')}`;
  $('resultScreen').classList.remove('hidden');
}
function showSessionResults() {
  const st = race.standings();
  const best = st[0] && race.rankTime(st[0]);
  const rows = st.map((c, i) => {
    const t = race.rankTime(c);
    const seg = c.elimSeg !== null && c.elimSeg !== undefined ? race.info.segments[c.elimSeg].id : '';
    return `<tr class="${c.player ? 'mine' : ''}"><td>${i + 1}</td><td class="tc" style="background:${c.team.color}"></td><td>${c.id}</td><td>${esc(c.team.short)}</td><td style="text-align:right">${t ? (i === 0 ? formatLap(t) : `+${fmt(t - best, 3)}`) : 'keine Zeit'}</td><td>${seg}</td></tr>`;
  }).join('');
  const mine = playerCars(race);
  $('resultTitle').textContent = `⏱ ${race.info.name} · ${race.track.def.grandPrix.replace('Großer Preis ', 'GP ')}`;
  $('resultBody').innerHTML = `<div class="pw-sum"><b>${esc(TEAM_BY_ID[race.playerTeam].name)}</b>: ${mine.map(c => `${c.id} P${st.indexOf(c) + 1}`).join(' · ')}${race.kind !== 'fp' ? ' – das ist die Startaufstellung.' : ''}</div>
    <table class="pw-res"><tbody>${rows}</tbody></table>`;
  $('resultScreen').classList.remove('hidden');
}
$('newRaceBtn').addEventListener('click', () => {
  finishSession(wk, race);
  if (wk.idx >= wk.seq.length) { newRace(); return; }
  prepareSession();
  startRace();
});
$('endWkBtn').addEventListener('click', () => newRace());

// ---------- Bedienung ----------
function setTab(tab) {
  activeTab = tab;
  for (const b of document.querySelectorAll('.tab')) b.classList.toggle('active', b.dataset.tab === tab);
  for (const p of document.querySelectorAll('.panel')) p.classList.toggle('active', p.id === `panel-${tab}`);
  if (tab === 'feed') { unread = 0; updateBadge(); }
  refreshUi();
}
for (const b of document.querySelectorAll('.tab')) b.addEventListener('click', () => setTab(b.dataset.tab));
function updateBadge() {
  const el = $('feedBadge');
  el.textContent = unread > 99 ? '99+' : String(unread);
  el.classList.toggle('hidden', !unread);
}
function setSpeed(v) {
  settings.speed = v;
  saveSettings(settings);
  renderSpeedBtns();
}
function renderSpeedBtns() {
  const isPaused = Boolean(paused && race && race.phase !== 'pre');
  const b = $('speedBtn');
  b.textContent = `${settings.speed}×`;
  $('pauseBtn').textContent = isPaused ? '▶' : '❚❚';
  b.classList.toggle('is-running', !isPaused);
  $('app').classList.toggle('is-paused', isPaused);
  document.querySelector('.paused-tag').style.display = isPaused ? '' : 'none';
}
// Tempo: kurz tippen = nächste Stufe · gedrückt halten = Auswahl öffnen, nach unten wischen, loslassen = wählen
const spd = { timer: null, open: false, hot: null };
function openSpeedMenu() {
  const m = $('speedMenu');
  m.innerHTML = SPEEDS.map(v => `<button data-sp="${v}" class="${v === settings.speed ? 'cur' : ''}">${v}×</button>`).join('');
  const r = $('speedBtn').getBoundingClientRect();
  m.classList.remove('hidden');
  m.style.top = `${r.bottom + 6}px`;
  m.style.left = `${Math.max(8, Math.min(window.innerWidth - m.offsetWidth - 8, r.left + r.width / 2 - m.offsetWidth / 2))}px`;
  spd.open = true;
  vibrate(15);
}
function closeSpeedMenu() { $('speedMenu').classList.add('hidden'); spd.open = false; spd.hot = null; }
function speedHot(x, y) {
  const b = document.elementFromPoint(x, y);
  const hit = b && b.closest && b.closest('#speedMenu [data-sp]');
  spd.hot = hit ? Number(hit.dataset.sp) : null;
  for (const el of $('speedMenu').children) el.classList.toggle('hot', Number(el.dataset.sp) === spd.hot);
}
$('speedBtn').addEventListener('pointerdown', e => {
  e.preventDefault();
  if (spd.open) { closeSpeedMenu(); spd.skip = true; return; }
  spd.skip = false;
  spd.timer = setTimeout(() => { spd.timer = null; openSpeedMenu(); }, 320);
});
document.addEventListener('pointermove', e => { if (spd.open && e.buttons) speedHot(e.clientX, e.clientY); });
document.addEventListener('pointerup', e => {
  if (spd.timer) {                      // kurzer Tipp
    clearTimeout(spd.timer); spd.timer = null;
    if (e.target.closest && e.target.closest('#speedBtn')) setSpeed(SPEEDS[(SPEEDS.indexOf(settings.speed) + 1) % SPEEDS.length]);
    return;
  }
  if (!spd.open || spd.skip) return;
  speedHot(e.clientX, e.clientY);
  if (spd.hot) { setSpeed(spd.hot); closeSpeedMenu(); }
});
$('speedMenu').addEventListener('click', e => {
  const b = e.target.closest('[data-sp]');
  if (b) { setSpeed(Number(b.dataset.sp)); closeSpeedMenu(); }
});
document.addEventListener('pointerdown', e => { if (spd.open && !e.target.closest('#speedMenu, #speedBtn')) closeSpeedMenu(); });
$('speedBtn').addEventListener('contextmenu', e => e.preventDefault());
$('pauseBtn').addEventListener('click', () => {
  if (!race || race.phase === 'pre') return;
  paused = !paused;
  acc = 0;
  renderSpeedBtns();
});
$('startBtn').addEventListener('click', () => { sound.unlock(); startRace(); });
$('menuBtn').addEventListener('click', () => { $('optionsScreen').classList.remove('hidden'); });
$('optCloseBtn').addEventListener('click', () => $('optionsScreen').classList.add('hidden'));
$('optHomeBtn').addEventListener('click', () => { $('optionsScreen').classList.add('hidden'); newRace(); });
$('soundToggle').checked = settings.sound !== false;
$('soundToggle').addEventListener('change', e => {
  settings.sound = e.target.checked;
  saveSettings(settings);
  sound.unlock();
  sound.setEnabled(settings.sound);
});
$('vibrateToggle').checked = settings.vibrate !== false;
$('vibrateToggle').addEventListener('change', e => { settings.vibrate = e.target.checked; saveSettings(settings); });
$('labelsBtn').addEventListener('click', () => {
  settings.showLabels = !settings.showLabels;
  map.showLabels = settings.showLabels;
  saveSettings(settings);
  $('labelsBtn').classList.toggle('active', settings.showLabels);
});
$('labelsBtn').classList.toggle('active', Boolean(settings.showLabels));
$('zoomResetBtn').addEventListener('click', () => map.resetView());
function applyTower() {
  $('tower').classList.toggle('hidden', !settings.showTower);
  $('towerBtn').classList.toggle('active', settings.showTower);
}
$('towerBtn').addEventListener('click', () => { settings.showTower = !settings.showTower; saveSettings(settings); applyTower(); refreshUi(); });
applyTower();
$('tower').addEventListener('pointerdown', () => { touching = true; });
document.addEventListener('pointerup', () => { touching = false; });
$('tower').addEventListener('click', e => {
  if (e.target.closest('.tw-head')) { settings.gapMode = settings.gapMode === 'interval' ? 'leader' : 'interval'; saveSettings(settings); refreshUi(); return; }
  const row = e.target.closest('[data-id]');
  if (row) { map.selected = map.selected === row.dataset.id ? null : row.dataset.id; refreshUi(); }
});
$('gapHead').addEventListener('click', () => { settings.gapMode = settings.gapMode === 'interval' ? 'leader' : 'interval'; saveSettings(settings); refreshUi(); });

let toastTimer = null;
export function toast(text, ms = 2400) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
  } catch { /* nicht unterstützt */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && race && !paused) requestWakeLock();
  if (document.visibilityState === 'hidden' && race && race.phase !== 'pre' && race.phase !== 'finished') { paused = true; renderSpeedBtns(); }
});
function vibrate(pattern) {
  if (settings.vibrate === false || !navigator.vibrate) return;
  try { navigator.vibrate(pattern); } catch { /* nicht unterstützt */ }
}

// Installierte App: auf der Startseite nach unten ziehen = neu laden (für Updates)
(() => {
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (!standalone) return;
  const scr = $('startScreen'), ind = $('ptr');
  let y0 = null, dy = 0, x0 = 0;
  const atTop = () => scr.scrollTop <= 0 && [...scr.querySelectorAll('.sheet')].every(el => el.scrollTop <= 0);
  scr.addEventListener('touchstart', e => {
    const t = e.touches[0];
    const ok = !scr.classList.contains('hidden') && atTop() && t.clientY < window.innerHeight / 3 && !e.target.closest('.gp-list');
    y0 = ok ? t.clientY : null; x0 = t.clientX; dy = 0;
  }, { passive: true });
  scr.addEventListener('touchmove', e => {
    if (y0 === null) return;
    const t = e.touches[0];
    if (Math.abs(t.clientX - x0) > Math.max(24, Math.abs(t.clientY - y0))) { y0 = null; dy = 0; ind.classList.add('hidden'); return; }
    dy = t.clientY - y0;
    if (dy <= 0) { ind.classList.add('hidden'); return; }
    ind.classList.remove('hidden');
    ind.style.transform = `translateY(${Math.min(dy, 120) * 0.6}px)`;
    ind.firstElementChild.textContent = dy > 90 ? '↻ Loslassen zum Aktualisieren' : '↓ Zum Aktualisieren ziehen';
  }, { passive: true });
  scr.addEventListener('touchend', async () => {
    if (y0 === null) return;
    y0 = null;
    if (dy > 90) {
      ind.firstElementChild.textContent = '↻ Wird aktualisiert …';
      try { const r = await navigator.serviceWorker?.getRegistration(); if (r) await r.update(); } catch { /* egal */ }
      location.reload();
    } else ind.classList.add('hidden');
  });
})();

// ---------- Start ----------
bootStep(70, 'Pit Wall wird eingerichtet …');
newRace();
bootStep(92, 'Startseite wird gezeichnet …');
requestAnimationFrame(frame);
bootDone();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(r => r.update()).catch(() => {});
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    if (!race || race.phase === 'pre') { reloaded = true; location.reload(); }
  });
}
