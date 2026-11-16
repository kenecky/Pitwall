// Pit Wall – Einstieg: verbindet Simulation, KI-Rennleitung und die Pit-Wall-Konsole des Teamchefs.
import { TEAMS, TEAM_BY_ID } from './data/teams.js';
import { DRIVERS } from './data/drivers.js';
import { TRACKS } from './data/tracks/index.js';
import { SEASON_2026 } from './data/season2026.js';
import { Intro, INTRO_DUR, INTRO_TRACKS, introInfo } from './ui/intro.js';
import { playIntroMusic } from './ui/introMusic.js';
import { buildTrack } from './sim/trackModel.js';
import { Race, DT, COMPOUNDS } from './sim/race.js';
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
  PACE, PACE_ORDER, playerCars, setPace, callBox, cancelBox, tooLateForBox, tyreLife, adviceFor,
} from './team/pitwall.js';

export const VERSION = 1;

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

function newRace(seed = randomSeed()) {
  track = getTrack(settings.trackId);
  const { laps, full } = distanceFor(track, 'race', settings.length);
  map.setTrack(track);
  race = new Race({
    track, teams: TEAMS, drivers: DRIVERS, seed, weather: settings.weatherMode, laps, fullLaps: full,
    kind: 'race', difficulty: 'medium', playerTeam: settings.teamId,
  });
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
  $('seedInfo').textContent = `Rennen #${seed}`;
  $('seedInput').value = '';
  $('resultScreen').classList.add('hidden');
  $('startScreen').classList.remove('hidden');
  renderStart();
  if (INTRO_TRACKS.has(track.def.id)) setTimeout(() => loadScenery(track.def.id), 300);
  refreshUi();
  renderSpeedBtns();
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
  if (INTRO_TRACKS.has(race.track.def.id) && !race.introShown) {
    race.introShown = true;
    playIntro(() => startRace());
    return;
  }
  $('startScreen').classList.add('hidden');
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
    updateSound();
    if (now - lastUi > 300) {
      lastUi = now;
      refreshUi();
      const added = feed.update(race.events);
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
  if (brake && settings.speed > 2 && race.phase === 'running') { setSpeed(2); return true; }
  return false;
}

// ---------- Anzeige ----------
function refreshUi() {
  if (!race) return;
  updateStatus();
  renderWall();
  if (!touching) {
    if (activeTab === 'timing') renderTiming($('timing'), race, { gapMode: settings.gapMode, selected: map.selected });
    if (settings.showTower) renderTower($('tower'), race, map.selected, settings.gapMode);
  }
  if (weatherPanel.isOpen && weatherPanel.offset === 0) weatherPanel.drawRadar();
}

function updateStatus() {
  $('lapLabel').textContent = race.phase === 'formation' ? 'FORMATION' : race.preStart ? 'START' : 'LAP';
  $('lap').textContent = race.preStart ? `${race.laps} LAPS` : `${race.leaderLap}/${race.laps}`;
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
  $('wall').innerHTML = cars.map(c => `
    <div class="pw-car" data-car="${c.id}" style="--tc:${c.team.color}">
      <div class="pw-head">
        <span class="pw-pos" data-f="pos">–</span>
        <span class="pw-name">${esc(c.driver.first)} ${esc(c.driver.last)}<small data-f="sub"></small></span>
        <span class="pw-gaps" data-f="gaps"></span>
      </div>
      <div class="pw-row">
        <span class="pw-tyre" data-f="tyre"></span>
        <span class="pw-life"><b data-f="life"></b></span>
        <span class="pw-meta" data-f="meta"></span>
      </div>
      <div class="pw-label">TEMPO</div>
      <div class="pw-seg">${PACE_ORDER.map(p => `<button data-pace="${p}">${PACE[p].short}</button>`).join('')}</div>
      <div class="pw-label">BOXENSTOPP</div>
      <div class="pw-box">
        <div class="pw-cmp">${['S', 'M', 'H', 'I', 'W'].map(k => `<button class="${k}" data-cmp="${k}" aria-label="${COMPOUNDS[k].name}">${k}</button>`).join('')}</div>
        <button class="pw-boxbtn" data-act="box">BOX</button>
      </div>
      <div class="pw-hint" data-f="hint"></div>
    </div>`).join('');
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
  return `${g.time.toFixed(1).replace('.', ',')} s`;
}

function renderWall() {
  if (ui.built !== race) buildWall();
  const st = race.standings();
  const lifeCol = v => (v > 55 ? '#22c55e' : v > 30 ? '#facc15' : v > 15 ? '#f97316' : '#ef4444');
  for (const el of $('wall').children) {
    const car = race.carById[el.dataset.car];
    const f = k => el.querySelector(`[data-f="${k}"]`);
    const i = st.indexOf(car);
    const gone = car.retired || car.finished;
    el.classList.toggle('out', car.retired);
    f('pos').textContent = car.retired ? 'OUT' : `P${i + 1}`;
    const pens = unservedSecs(car);
    const serve = [...(car.serve || []), ...(car.serving ? [car.serving] : [])].map(p => (p.type === 'dt' ? 'Durchfahrt' : 'Stop & Go'));
    f('sub').textContent = [`Start P${car.gridPos}`, car.dsq ? 'DSQ' : '', pens ? `+${pens} s Strafe` : '', ...serve].filter(Boolean).join(' · ');
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
    // Tempo
    for (const b of el.querySelectorAll('[data-pace]')) {
      b.classList.toggle('on', car.paceMode === b.dataset.pace);
      b.disabled = gone;
    }
    // Reifenwahl
    if (!ui.sel[car.id] || (!car.boxCall && ui.sel[car.id] === car.compound && !COMPOUNDS[car.compound].wet && car.usedCompounds.size < 2)) ui.sel[car.id] = defaultCompound(car);
    const sel = car.boxCall ? car.boxCall.compound : ui.sel[car.id];
    for (const b of el.querySelectorAll('[data-cmp]')) {
      b.classList.toggle('on', b.dataset.cmp === sel);
      b.disabled = gone || car.inPit;
    }
    // Box-Knopf
    const bb = el.querySelector('[data-act="box"]');
    const late = car.boxCall && tooLateForBox(race, car) && car.boxCall.lap === 0;
    bb.className = 'pw-boxbtn';
    if (car.inPit || car.stopTimer > 0) { bb.textContent = car.redQueued ? 'ROT · BOX' : 'IN DER BOX'; bb.classList.add('inpit'); bb.disabled = true; }
    else if (car.boxCall) { bb.textContent = late ? 'KOMMT REIN' : 'ABBRECHEN'; bb.classList.add('called'); bb.disabled = late; }
    else { bb.textContent = 'BOX'; bb.disabled = gone || race.preStart || car.lap >= race.laps - 1; }
    // Hinweise
    const hint = hintFor(car, st);
    const h = f('hint');
    h.textContent = hint.text;
    h.className = `pw-hint${hint.cls ? ' ' + hint.cls : ''}`;
  }
}

function hintFor(car, st) {
  if (car.retired) return { text: car.dnf ? `Ausgeschieden: ${car.dnf}` : 'Ausgeschieden', cls: 'bad' };
  if (car.finished) return { text: `Im Ziel auf P${car.finishPos}.` };
  if (race.preStart) {
    const a = adviceFor(race, car);
    return { text: a ? `Strategen: Start auf ${COMPOUNDS[car.compound].name}, Stopp um Runde ${a.lap} auf ${COMPOUNDS[a.compound].name}.` : `Start auf ${COMPOUNDS[car.compound].name}.` };
  }
  const w = race.weather.wetness;
  const left = race.laps - car.lap;
  const mate = race.cars.find(o => o.player && o !== car && !o.retired && !o.finished);
  const n = race.neutral;
  if (car.damage) return { text: car.damage === 'puncture' ? 'Reifenschaden! Er kommt sofort rein.' : 'Schaden am Auto – Reparaturstopp nötig.', cls: 'bad' };
  if (car.boxCall && mate && (mate.boxCall || mate.inPit)) return { text: `Achtung Doppelstopp: ${mate.id} kommt auch – ${car.id} muss hinten warten.`, cls: 'warn' };
  if (car.boxCall) return { text: `Box angesagt: ${COMPOUNDS[car.boxCall.compound].name}${car.boxCall.lap ? ' – zu spät für diese Runde, kommt in der nächsten' : ''}.`, cls: 'warn' };
  const slick = !COMPOUNDS[car.compound].wet;
  if (slick && w > 0.3) return { text: `Strecke ${w > 0.6 ? 'sehr nass' : 'nass'} – Slicks verlieren viel Zeit. ${bestCompound(w, left) === 'W' ? 'Regenreifen' : 'Intermediates'}?`, cls: 'bad' };
  if (slick && race.weather.rain > 0.2) return { text: 'Es regnet – Strecke wird nasser. Wetterradar prüfen (🌧 oben).', cls: 'warn' };
  if (!slick && w < 0.15 && left > 2) return { text: 'Strecke trocknet ab – Zeit für Slicks?', cls: 'warn' };
  if (n && (n.type === 'sc' || n.type === 'vsc') && left > 3) return { text: `${n.type === 'sc' ? 'Safety Car' : 'VSC'}: Stopp kostet jetzt rund ${n.type === 'sc' ? 'die Hälfte' : 'ein Drittel'} weniger Zeit.`, cls: 'warn' };
  const life = tyreLife(race, car);
  if (life < 20 && left > 2) return { text: 'Reifen sind am Ende – er verliert viel Zeit pro Runde.', cls: 'bad' };
  const dry = ![...car.usedCompounds].some(x => x === 'I' || x === 'W') && w < 0.1;
  if (dry && car.usedCompounds.size < 2 && left <= 8) return { text: 'Pflicht: Im Trockenen muss noch eine zweite Mischung gefahren werden!', cls: 'bad' };
  const i = st.indexOf(car);
  const ahead = st[i - 1];
  if (ahead && !ahead.player && !ahead.inPit && !n) {
    const g = race.gap(car, ahead);
    if (g && !g.laps && g.time < 2.0 && car.tyreAge >= ahead.tyreAge && life < 60) return { text: `Undercut-Chance: ${car.id} ${g.time.toFixed(1).replace('.', ',')} s hinter ${ahead.id} (Reifen ${ahead.tyreAge} Rd).`, cls: 'warn' };
  }
  const a = adviceFor(race, car);
  if (a) return { text: `Strategen: Stopp um Runde ${a.lap} auf ${COMPOUNDS[a.compound].name}.` };
  if (car.paceMode === 'attack') return { text: 'Attacke kostet viel Reifen und erhöht das Fehlerrisiko.' };
  return { text: car.stops ? 'Kein weiterer Stopp geplant.' : '' };
}

$('wall').addEventListener('click', e => {
  const el = e.target.closest('[data-car]');
  if (!el || !race) return;
  const car = race.carById[el.dataset.car];
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  if (b.dataset.pace) setPace(race, car, b.dataset.pace);
  else if (b.dataset.cmp) {
    ui.sel[car.id] = b.dataset.cmp;
    if (car.boxCall) { car.boxCall.compound = b.dataset.cmp; car.plan[0].compound = b.dataset.cmp; }
  } else if (b.dataset.act === 'box') {
    if (car.boxCall) cancelBox(race, car);
    else {
      callBox(race, car, ui.sel[car.id] || defaultCompound(car));
    }
  }
  sound.unlock();
  renderWall();
});

// ---------- Ergebnis ----------
function showResults() {
  resultShown = true;
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
    <table class="pw-res"><tbody>${rows}</tbody></table>`;
  $('resultScreen').classList.remove('hidden');
}
$('newRaceBtn').addEventListener('click', () => newRace());

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
$('speedBtn').addEventListener('click', () => {
  const i = SPEEDS.indexOf(settings.speed);
  setSpeed(SPEEDS[(i + 1) % SPEEDS.length]);
});
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
