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
import { weatherLabel, createWeather } from './sim/weather.js';
import { distanceFor, LENGTHS } from './sim/length.js';
import { unservedSecs, PENALTIES } from './control/stewards.js';
import { loadSettings, saveSettings, loadSeason, saveSeason, clearSeason, saveGame, loadGame, clearGame } from './storage.js';
import { serializeRace, restoreRace } from './sim/persist.js';
import { newSeason, currentEntry, seasonOver, weekendParts, recordWeekend, driverStandings, teamStandings, finishOf, SPRINT_TRACKS } from './team/season.js';
import { pressQuotes } from './team/press.js';
import { updateRaceData } from './team/raceData.js';
import { renderRaceTable, strategyChart } from './ui/raceTable.js';
import { initCareer, careerAfterWeekend, careerSeasonEnd, acceptOffer, startNewSeason } from './team/career.js';
import {
  initManagement, teamsForWeekend, afterWeekend, seasonEnd, damageFrom, engineerEstimate, startProject, buyPart, newPowerUnit,
  extendContract, talkTo, expectedPoints, goalText, money, CAP, OPS, PU_ALLOWANCE, DEV, DEV_SIZE, PARTS, POSTS, CONCEPTS, CONCEPT_COST,
  migrateManagement, preseasonTasks, readyForRace, signTitle, signPartner, dropPartner, hire, chooseConcept, startSeason, devFactor, staffCostPerRace,
  migrateBuildings, BUILDINGS, BUILD_MAX, buildCost, buildWeeks, projectWeeks, addDays, fmtDate, weeksBetween, raceDate, migrateCalendar, calendarEvents, nextEvent, advanceTo, resolveSponsorEvent, migrateEvents, SPONSOR_EVENTS, agendaDialog, resolveAgenda, setBookingContext, startBuilding, bLvl, maxProjects, startNego, negoAction, negoSign, negoCancel,
} from './team/management.js';
import {
  PACE, PACE_ORDER, ERS, ERS_ORDER, STRATEGISTS, playerCars, setPace, setErs, callBox, cancelBox, tooLateForBox, tyreLife, adviceFor,
  lapsLeftOnTyres, nextStop, stopDue, shiftStop, dropStop, setStopCompound, addStop, setTeamOrder, swapCars, teamStep,
  rejoin, pitLoss, timeOf, circleAngle, lapTime, strategyOptions, applyStrategy, freshGain, fmt, TACTIC, TACTIC_ORDER, setTactic, redTyres,
} from './team/pitwall.js';
import { radioStep, answer, openMessage, ownCall, OWN_CALLS, moodLabel } from './team/radio.js';

import { Session } from './sim/session.js';
import { createWeekend, currentKind, nextKind, applyWeekend, finishSession, setSummary, setsOf, trackSetWear, SESSION_NAME, SESSION_SHORT } from './team/weekend.js';
import { SETUP_KEYS, feedback, setupScore } from './team/setup.js';
import { protestCases, protestKind, protestArgs, protestsLeft, fileProtest, MAX_PROTESTS } from './team/protest.js';
import { ScenePlayer } from './ui/scenePlayer.js';

export const VERSION = 29;

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
const SPRINT_PTS = [8, 7, 6, 5, 4, 3, 2, 1];   // Sprint: nur die ersten 8
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
      if (race.isSession) {
        // Training/Qualifying: Lautstärke nach Zahl der fahrenden Autos – leere Strecke = Stille
        const on = race.cars.filter(c => !c.retired && !c.inGarage && c.v > 3);
        const push = on.filter(c => c.prog && c.prog.phase === 'push').length;
        level = on.length ? 0.15 + 0.55 * Math.min(1, on.length / 14) : 0;
        rpm = on.length ? 0.45 + 0.21 * (push / on.length) : 0;
      }
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
const weatherPanel = new WeatherPanel({ root: $('wxScreen'), body: $('wxNow'), getRace: () => race });
$('wxOpen').addEventListener('click', () => { if (race) showWeather(); });
// Wetterübersicht des Wochenendes, aufgeteilt nach Sessions (Vorhersage aus denselben Wetterdaten wie die Simulation)
function sessionWeather(i) {
  const kind = wk.seq[i];
  if (i === wk.idx && race) return { wx: race.weather, dur: race.isSession ? race.info.segments.reduce((s, x) => s + x.dur, 0) : race.laps * race.track.baseLap * 1.05 };
  let dur;
  if (SESSION_KINDS.has(kind)) {
    const L = LENGTHS[settings.length] || LENGTHS.medium;
    dur = kind === 'fp' ? L.fp : (kind === 'quali' ? L.quali : L.sq).reduce((a, b) => a + b, 0) + 2 * L.brk;
  } else dur = distanceFor(track, kind, settings.length).laps * track.baseLap * 1.05;
  return { wx: createWeather(wk.seed + i * 101, wk.season ? 'random' : settings.weatherMode, dur, track.def.rainChance ?? 0.38), dur };
}
function weatherText({ wx, dur }) {
  if (!wx.showers.length) return { icon: '☀️', main: 'Trocken', sub: 'Kein Regen erwartet' };
  const parts = wx.showers.map(sh => {
    const strength = sh.peak > 0.75 ? 'starker Regen' : sh.peak > 0.5 ? 'Regen' : 'leichter Regen';
    const a = Math.max(0, Math.round(sh.t0 / 60)), b = Math.min(Math.round(dur / 60), Math.round(sh.t1 / 60));
    return sh.t0 <= 0 ? `${strength} von Beginn an bis ca. Minute ${b}` : `${strength} ab ca. Minute ${a} bis ${b}`;
  });
  const heavy = wx.showers.some(sh => sh.peak > 0.75);
  return { icon: heavy ? '⛈' : wx.showers.some(sh => sh.t0 <= 0) ? '🌧' : '🌦', main: wx.mode === 'rain' ? 'Regen' : 'Wechselhaft', sub: parts.join(' · ') };
}
function showWeather() {
  // Laufende Session: Regenradar wie bisher; alle weiteren Sessions des Wochenendes: Vorhersage
  weatherPanel.open();
  const later = wk.seq.map((k, i) => ({ k, i })).filter(x => x.i > wk.idx);
  $('wxSessions').innerHTML = later.length ? `<div class="setup-label" style="margin-top:14px">VORHERSAGE WEITERE SESSIONS</div>`
    + later.map(({ k, i }) => {
      const w = weatherText(sessionWeather(i));
      return `<div class="pw-wxrow"><span class="ic">${w.icon}</span><div><b>${SESSION_NAME[k]}</b><small>${w.main} – ${w.sub}</small></div></div>`;
    }).join('') + '<div class="pw-hint">Vorhersage des Wetterdienstes – Zeiten ab Beginn der Session.</div>' : '';
}
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
  if (race.isSession && e.type === 'overtake') return false;   // Training/Qualifying: keine Überholmanöver im Log
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
let season = loadSeason();
// Teamwerte für dieses Wochenende (Saison: Entwicklung, Personal, Antriebseinheit; KI-Teams entwickeln mit)
const teamsNow = () => (wk && wk.season && season && season.mgmt ? teamsForWeekend(season, TEAMS, track) : TEAMS);
let savedGame = null;     // gespeichertes Wochenende (zum Fortsetzen)
const isSeason = () => settings.mode === 'season';
// Eigenes Team: in der Saison fest, im Einzelrennen frei wählbar
const playerTeamId = () => (isSeason() && season ? season.teamId : settings.teamId);

function newRace(seed = randomSeed()) {
  let parts = settings.parts || ['fp', 'quali'];
  let trackId = settings.trackId;
  const entry = isSeason() && season ? currentEntry(season) : null;
  if (entry) { trackId = entry.track; parts = weekendParts(trackId); }
  track = getTrack(trackId);
  wk = createWeekend({ parts, seed, trackId: track.def.id, carIds: DRIVERS.filter(d => d.team === playerTeamId()).map(d => d.id) });
  if (entry) {
    wk.season = true;
    wk.penalties.race = { ...(season.gridPen || {}) };
    if (season.mgmt && season.mgmt.posts && season.mgmt.posts.strategy) wk.strategist = season.mgmt.posts.strategy.name;
  }
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
    track, teams: TEAMS, drivers: DRIVERS, seed: wk.seed + wk.idx * 101, weather: wk.season ? 'random' : settings.weatherMode, kind,
    length: settings.length, difficulty: 'medium', playerTeam: playerTeamId(),
  };
  if (!isS) {
    const { laps, full } = distanceFor(track, kind, settings.length);
    Object.assign(opts, { laps, fullLaps: full, gridOrder: wk.grid[kind], gridPenalties: { ...wk.penalties[kind] } });
  }
  map.setTrack(track);
  opts.teams = teamsNow();
  race = isS ? new Session(opts) : new Race(opts);
  // Saison: Stimmung der Fahrer aus der Teamzentrale
  if (wk.season && season && season.mgmt) for (const c of playerCars(race)) { const d = season.mgmt.drivers[c.id]; if (d) c.mood = d.morale; }
  applyWeekend(race, wk);
  hookRace();
  resetUi();
}

// Rückrufe der Simulation an Pit Wall (nach Aufbau und nach dem Laden)
function hookRace() {
  race.trackSets = () => { for (const c of playerCars(race)) trackSetWear(race, c); };
  race.onPlayerGarage = onGarage;
}
function resetUi() {
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
  ui.qa = {};
  ui.olWarn = {};
  ui.ffAsked = false;
  ff = false;
  $('ffTag').classList.add('hidden');
  $('askScreen').classList.add('hidden');
}

// Auto kommt nach einer Ausfahrt in die Garage: Rückmeldung des Fahrers (Training) bzw. Rundenzeit (Qualifying)
function onGarage(car) {
  if (race.kind === 'fp' && settings.speed !== 1 && !ff) setSpeed(1);   // Training: zurück in der Box → 1×
  const laps = (car.runLaps || []).filter(l => l.valid);
  const red = car.redAbort;
  car.redAbort = false;
  if (race.kind === 'fp' && (laps.length || red)) {
    // Auch nach Abbruch durch Rote Flagge: Rückmeldung zum Setup (aus Aufwärm- und angefangenen Runden)
    const fb = feedback(race.track, wk.setup[car.id], car.driver, race.time + (wk.runs[car.id]++) * 7.3);
    const text = red ? `Abgebrochen wegen Roter Flagge. ${fb.text}` : fb.text;
    wk.notes[car.id].push({ text, setup: { ...wk.setup[car.id] }, best: laps.length ? Math.min(...laps.map(l => l.time)) : null, n: laps.length });
    race.emit('radio', `Funk ${car.id}: „${text}“`, { cars: [car.id], own: true });
  } else if (laps.length) {
    const b = Math.min(...laps.map(l => l.time));
    const pos = race.segmentRanking ? race.segmentRanking().indexOf(car) + 1 : 0;
    race.emit('radio', `Teamfunk ${car.team.name} an ${car.id}: „${formatLap(b)}, du bist P${pos}.${laps.some(l => l.traffic) ? ' Da war Verkehr auf der Runde.' : ''}“`, { cars: [car.id], own: true });
  }
  car.runLaps = [];
}

// ---------- Speichern und Fortsetzen ----------
// Gespeichert wird das ganze Wochenende (Setup, Reifensätze, Ergebnisse) und die laufende Session.
let lastSave = 0;
function autosave() {
  if (!race || !wk) return;
  const started = race.phase !== 'pre';
  let data;
  try {
    data = {
      v: 1, mode: wk.season ? 'season' : 'single', savedAt: Date.now(), trackId: track.def.id, teamId: playerTeamId(),
      length: settings.length, weather: settings.weatherMode,
      wk: JSON.parse(JSON.stringify(wk)),
      race: started ? serializeRace(race) : null,
      kind: currentKind(wk), strategyDone: Boolean(race.strategyDone),
    };
  } catch { return; }
  savedGame = data;
  saveGame(data);
}

async function resumeGame() {
  const d = savedGame;
  if (!d) return;
  if (d.mode === 'season' && (!season || season.teamId !== d.teamId)) { toast('Spielstand passt nicht zur Saison'); return; }
  settings.mode = d.mode;
  settings.length = d.length;
  settings.weatherMode = d.weather;
  if (d.mode === 'single') { settings.teamId = d.teamId; settings.trackId = d.trackId; }
  saveSettings(settings);
  track = getTrack(d.trackId);
  wk = d.wk;
  let r = null;
  if (d.race) r = restoreRace({ track, teams: teamsNow(), drivers: DRIVERS, data: d.race });
  if (r) {
    map.setTrack(track);
    race = r;
    // Reifensätze wieder mit dem Wochenende verknüpfen, Funk ohne Antwort-Wirkung verfällt
    for (const c of race.cars) {
      if (!c.player) continue;
      const find = s => (s ? wk.sets[c.id].find(x => x.id === s.id) || null : null);
      c.curSet = find(c.curSet);
      c.nextSet = find(c.nextSet);
    }
    if (race.pwRadio) for (const m of race.pwRadio.msgs) if (!m.done) { m.done = true; m.expired = true; }
    applyWeekend(race, wk);
    hookRace();
    resetUi();
    race.strategyDone = d.strategyDone;
    ui.noticeSeen = (race.rcNotices || []).length;
    ui.lastMsg = race.pwRadio ? race.pwRadio.seq : 0;
    $('startScreen').classList.add('hidden');
    feed.update(race.events.filter(ownRadio));
    renderSpeedBtns();
    setTab('wall');
    if (race.phase === 'finished') showResults();
    else toast('Fortgesetzt – zum Weiterfahren ▶ drücken', 3000);
  } else {
    prepareSession();
    startRace();
  }
}
function renderResume() {
  const box = $('resumeBox');
  const d = savedGame;
  if (!d) { box.innerHTML = ''; return; }
  const t = TRACKS[d.trackId];
  const mins = Math.round((Date.now() - d.savedAt) / 60000);
  const when = mins < 1 ? 'gerade eben' : mins < 60 ? `vor ${mins} Min.` : mins < 1440 ? `vor ${Math.round(mins / 60)} Std.` : `vor ${Math.round(mins / 1440)} Tagen`;
  box.innerHTML = `<div class="pw-resume st-card"><div class="setup-label">GESPEICHERT · ${when}</div>
    <div><b>${d.mode === 'season' ? 'Saison · ' : ''}${esc(t ? t.grandPrix.replace('Großer Preis ', 'GP ') : d.trackId)}</b> · ${esc(SESSION_NAME[d.kind] || '')} · ${esc(TEAM_BY_ID[d.teamId] ? TEAM_BY_ID[d.teamId].name : '')}</div>
    <div class="pw-rbtns"><button id="resumeBtn" class="primary-btn">Fortsetzen</button><button id="dropSaveBtn" class="secondary-btn">Verwerfen</button></div></div>`;
  $('resumeBtn').onclick = () => { sound.unlock(); resumeGame(); };
  $('dropSaveBtn').onclick = async () => {
    if (!(await pwConfirm('Spielstand verwerfen?', 'Das gespeicherte Wochenende wird gelöscht.', 'Verwerfen'))) return;
    savedGame = null; clearGame(); renderResume();
  };
}

// ---------- Saison-Übersicht ----------
let seasonTab = 'drivers';
function showSeason(notes = []) {
  if (!season) return;
  $('seasonScreen').querySelector('.sheet-title').textContent = `🏆 Saison ${season.year}`;
  $('seasonNotes').innerHTML = notes.map(n => `<div class="pw-sum">${n}</div>`).join('');
  renderSeasonTab();
  $('seasonScreen').classList.remove('hidden');
}
function renderSeasonTab() {
  for (const b of document.querySelectorAll('#seasonScreen .stab')) b.classList.toggle('active', b.dataset.stab === seasonTab);
  $('seasonBody').innerHTML = seasonTabHtml(seasonTab);
}
function seasonTabHtml(seasonTab) {
  let html = '';
  if (seasonTab === 'drivers') {
    html = `<table class="pw-res"><tbody>${driverStandings(season, DRIVERS).map((x, i) => `<tr class="${x.d.team === season.teamId ? 'mine' : ''}"><td>${i + 1}</td><td class="tc" style="background:${TEAM_BY_ID[x.d.team].color}"></td><td>${esc(x.d.first[0])}. ${esc(x.d.last)}</td><td>${esc(TEAM_BY_ID[x.d.team].short)}</td><td style="text-align:right">${x.wins ? `${x.wins}× 🏆` : ''}</td><td style="text-align:right"><b>${x.pts}</b></td></tr>`).join('')}</tbody></table>`;
  } else if (seasonTab === 'teams') {
    html = `<table class="pw-res"><tbody>${teamStandings(season, TEAMS).map((x, i) => `<tr class="${x.t.id === season.teamId ? 'mine' : ''}"><td>${i + 1}</td><td class="tc" style="background:${x.t.color}"></td><td>${esc(x.t.name)}</td><td style="text-align:right"><b>${x.pts}</b></td></tr>`).join('')}</tbody></table>`;
  } else {
    const ids = DRIVERS.filter(d => d.team === season.teamId).map(d => d.id);
    html = `<table class="pw-res"><tbody>${SEASON_2026.map((e, i) => {
      const res = season.results.find(r => r.round === e.round);
      const t = TRACKS[e.track];
      const cell = res ? ids.map(id => `${id} ${finishOf(res.race, id) || '–'}${res.sprint ? ` <small>(S ${finishOf(res.sprint, id) || '–'})</small>` : ''}`).join(' · ') : i === season.round ? '<b>als Nächstes</b>' : new Date(e.date).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
      return `<tr class="${i === season.round ? 'mine' : ''}"><td>${e.round}</td><td>${esc(t.country)}${SPRINT_TRACKS.includes(e.track) ? ' <small>Sprint</small>' : ''}</td><td>${res && res.race[0] ? `🏆 ${res.race[0].id}` : ''}</td><td>${cell}</td></tr>`;
    }).join('')}</tbody></table>`;
  }
  return html;
}
for (const b of document.querySelectorAll('#seasonScreen .stab')) b.addEventListener('click', () => { seasonTab = b.dataset.stab; renderSeasonTab(); });
$('seasonCloseBtn').addEventListener('click', () => $('seasonScreen').classList.add('hidden'));
$('seasonBtn').addEventListener('click', () => showSeason());
$('seasonResetBtn').addEventListener('click', async () => {
  if (!(await pwConfirm('Saison neu starten?', 'Der bisherige Saisonstand geht verloren.', 'Neu starten'))) return;
  season = null;
  clearSeason();
  if (savedGame && savedGame.mode === 'season') { savedGame = null; clearGame(); }
  $('seasonScreen').classList.add('hidden');
  newRace();
});
function setMode(mode) {
  if (settings.mode === mode) return;
  settings.mode = mode;
  saveSettings(settings);
  newRace();
}
// ---------- Abrechnung nach dem Rennwochenende (vor der Teamzentrale) ----------
let pendingHQ = null;
function showBookings(before, log, after) {
  $('bookBody').innerHTML = `<div class="pw-bk top"><span>Kontostand vorher</span><b>${money(before)}</b></div>
    <table class="pw-res"><tbody>${log.map(l => `<tr><td>${esc(l.what)}</td><td style="text-align:right" class="${l.amount < 0 ? 'neg' : 'pos'}">${l.amount > 0 ? '+' : ''}${money(l.amount)}</td></tr>`).join('')}</tbody></table>
    <div class="pw-bk bottom"><span>Kontostand nachher</span><b class="${after < 0 ? 'neg' : ''}">${money(after)}</b><small class="${after - before < 0 ? 'neg' : 'pos'}">${after - before >= 0 ? '+' : ''}${money(after - before)}</small></div>`;
  $('bookScreen').classList.remove('hidden');
}
$('bookGo').addEventListener('click', () => {
  $('bookScreen').classList.add('hidden');
  showHQ(pendingHQ || []);
  pendingHQ = null;
});

// ---------- Teamzentrale (Saison): Vollbild-Menü des Teamchefs ----------
// Startseite in der Saison führt hierher; von hier aus geht es zum nächsten Rennwochenende.
let hqTab = 'home';          // home | sponsors | staff | drivers | dev | car | money | board | standings
let hqNotes = [];
let hqHire = null;           // Posten, für den gerade Bewerber angezeigt werden
const HQ_SECTIONS = [
  ['calendar', '📅', 'Kalender'], ['sponsors', '🤝', 'Sponsoren'], ['staff', '👥', 'Personal'], ['drivers', '🏎', 'Fahrer'], ['dev', '🔧', 'Entwicklung'],
  ['buildings', '🏗', 'Gebäude'], ['car', '⚙️', 'Auto & Teile'], ['money', '💶', 'Finanzen'], ['board', '🏛', 'Vorstand & Karriere'], ['standings', '🏆', 'Wertung'],
];
function showHQ(notes = null) {
  if (!season || !season.mgmt) return;
  migrateManagement(season, TEAMS);
  migrateBuildings(season);
  migrateCalendar(season, SEASON_2026);
  migrateEvents(season);
  setBookingContext(season);
  if (notes) hqNotes = notes;
  if (hqTab === 'report') hqTab = 'home';
  if (hqTab === 'career') hqTab = 'board';
  renderHQ();
  $('hqScreen').classList.remove('hidden');
  $('hqBody').scrollTop = 0;
}
function hqBar(label, v, max, col = '#ff6a3d', txt = null) {
  return `<div class="pw-hqbar"><span>${label}</span><i><b style="width:${Math.max(0, Math.min(100, v / max * 100))}%;background:${col}"></b></i><em>${txt ?? v}</em></div>`;
}
const stars = r => '★★★★★'.slice(0, Math.max(1, Math.round(r / 20))) + '☆☆☆☆☆'.slice(0, 5 - Math.max(1, Math.round(r / 20)));
// Kurzer Status je Kachel
function tileStatus(k) {
  const m = season.mgmt;
  switch (k) {
    case 'sponsors': return m.titleSponsor ? [`${esc(m.titleSponsor.name)} · ${m.sponsors.length}/3 Partner`, ''] : ['Kein Titelsponsor!', 'bad'];
    case 'staff': { const v = Object.keys(POSTS).filter(p => !m.posts[p]).length; return v ? [`${v} Posten frei`, 'bad'] : ['Alle Posten besetzt', '']; }
    case 'drivers': { const low = Object.values(m.drivers).filter(d => d.morale < 40).length; return low ? [`${low} Fahrer unzufrieden`, 'warn'] : ['Stimmung ok', '']; }
    case 'dev': return !m.concept ? ['Auto-Konzept fehlt!', 'bad'] : m.projects.length ? [`${m.projects.length} Projekt${m.projects.length > 1 ? 'e' : ''} läuft`, ''] : ['Keine Projekte', 'warn'];
    case 'buildings': return m.construction ? [`Baustelle bis ${fmtDate(m.construction.done)}`, ''] : ['Keine Baustelle', 'warn'];
    case 'calendar': { const n = nextEvent(season, SEASON_2026, trackLabel); return n ? [`Nächster Termin: ${fmtDate(n.date)}`, ''] : ['Keine Termine', '']; }
    case 'car': return m.pu.age >= 6 ? [`Antrieb ${m.pu.age} Wochenenden alt`, 'warn'] : [`Flügel ${m.parts.wing} · Chassis ${m.parts.chassis}`, ''];
    case 'money': return [`${money(m.money)}`, m.money < 0 ? 'bad' : ''];
    case 'board': return [`Ruf ${m.board.rep} · Ziel P${m.board.target}`, m.board.rep < 25 ? 'bad' : ''];
    case 'standings': { const p = teamStandings(season, TEAMS).findIndex(x => x.t.id === season.teamId) + 1; return [season.results.length ? `Teamwertung P${p}` : 'Noch keine Rennen', '']; }
    default: return ['', ''];
  }
}
function renderHQ() {
  const m = season.mgmt;
  const team = TEAM_BY_ID[season.teamId];
  const entry = currentEntry(season);
  $('hqTitle').innerHTML = hqTab === 'home' ? `<i style="background:${team.color}"></i>${esc(team.name)}` : `${HQ_SECTIONS.find(x => x[0] === hqTab)[1]} ${HQ_SECTIONS.find(x => x[0] === hqTab)[2]}`;
  $('hqBack').classList.toggle('hidden', hqTab === 'home');
  $('hqHead').innerHTML = `<span>📅 <b>${fmtDate(season.date, true)}</b></span><span>Saison ${season.year}${m.phase === 'preseason' ? ' · Vorsaison' : entry ? ` · Rennen ${entry.round}/${SEASON_2026.length}` : ' · beendet'}</span><span>Konto <b class="${m.money < 0 ? 'neg' : ''}">${money(m.money)}</b></span><span>Budget-Cap ${Math.round(m.spent)}/${CAP}</span>`;
  let h = '';
  if (hqTab === 'home') {
    if (m.phase === 'preseason' && !readyForRace(season)) {
      h += `<div class="pw-mcard pw-hero"><b>Willkommen, Teamchef!</b><small>Bevor die Saison beginnt: Sponsoren, Personal und das Auto-Konzept festlegen.</small>
        <div class="pw-tasks">${preseasonTasks(season).map(t => `<button data-go="${t.key === 'partners' ? 'sponsors' : t.key}" class="${t.done ? 'done' : t.optional ? 'opt' : ''}"><i>${t.done ? '✓' : t.optional ? '○' : '!'}</i>${esc(t.text)}${t.optional && !t.done ? ' <small>(optional)</small>' : ''}</button>`).join('')}</div></div>`;
    } else if (hqNotes.length) {
      h += `<div class="pw-mcard">${hqNotes.map(n => `<div class="pw-note">${n}</div>`).join('')}</div>`;
    }
    const nx = nextEvent(season, SEASON_2026, trackLabel);
    if (nx) h += `<div class="pw-mcard pw-next"><small>NÄCHSTER TERMIN</small><b>${calIcon(nx)} ${fmtDate(nx.date, true)}</b><span>${esc(nx.text)}</span></div>`;
    h += `<div class="pw-tiles">${HQ_SECTIONS.map(([k, ic, n]) => { const [st, cls] = tileStatus(k); return `<button class="pw-tile" data-go="${k}"><span class="ic">${ic}</span><b>${n}</b><small class="${cls}">${st}</small></button>`; }).join('')}</div>`;
  } else if (hqTab === 'sponsors' && m.nego) {
    h = negoHtml(m.nego);
  } else if (hqTab === 'sponsors') {
    h += '<div class="pw-label">TITELSPONSOR</div>';
    if (m.titleSponsor) {
      const t = m.titleSponsor;
      h += `<div class="pw-mcard"><b>${esc(t.name)}</b><small>${money(t.perRace)} pro Rennen · Bonus ${money(t.bonus)} bei Teamwertung Platz ${t.target} oder besser</small></div>`;
    } else {
      h += '<div class="pw-hint bad">Ohne Titelsponsor fehlt die wichtigste Einnahme. Wähle ein Angebot:</div>';
      h += (m.market.title || []).map((o, i) => `<div class="pw-mcard"><b>${esc(o.name)}</b> <span class="pw-chip">${o.kind}</span><small>${money(o.perRace)} pro Rennen · Bonus ${money(o.bonus)} bei Platz ${o.target} oder besser</small>
        <div class="pw-hqbtns"><button class="go" data-nego="title" data-idx="${i}">Verhandeln</button></div></div>`).join('');
    }
    h += `<div class="pw-label">PARTNER (${m.sponsors.length}/3) – Grundbetrag pro Rennen + Prämie fürs Ziel</div>`;
    h += m.sponsors.length ? m.sponsors.map((s, i) => `<div class="pw-mcard"><b>${esc(s.name)}</b><small>${s.fee ? `${money(s.fee)} pro Rennen · ` : ''}Prämie ${money(s.reward)}: ${goalText(s.goal)} · Zufriedenheit ${s.happy ?? 70} · erreicht ${s.hits}×${s.last === undefined ? '' : s.last ? ' · zuletzt ✓' : ' · zuletzt ✗'}</small>
      <div class="pw-hqbtns"><button data-drop="${i}">Vertrag beenden</button></div></div>`).join('') : '<div class="pw-hint">Noch keine Partner.</div>';
    if (m.sponsors.length < 3) {
      h += '<div class="pw-label">ANGEBOTE</div>' + (m.market.partners || []).map((o, i) => `<div class="pw-mcard"><b>${esc(o.name)}</b><small>${money(o.fee)} pro Rennen · Prämie ${money(o.reward)}: ${goalText(o.goal)}</small>
        <div class="pw-hqbtns"><button class="go" data-nego="partner" data-idx="${i}">Verhandeln</button></div></div>`).join('');
    }
    h += '<div class="pw-hint">Angebote ändern sich nach jedem Rennwochenende. Ein besserer Ruf bringt bessere Angebote.</div>';
  } else if (hqTab === 'staff') {
    h += Object.entries(POSTS).map(([k, p]) => {
      const cur = m.posts[k];
      const cands = hqHire === k ? (m.market.staff[k] || []) : [];
      return `<div class="pw-mcard ${cur ? '' : 'vacant'}"><b>${p.name}</b><small>${p.hint}</small>
        ${cur ? `<div class="pw-person"><span>${esc(cur.name)}</span><span class="st">${stars(cur.rating)} ${cur.rating}</span><span>${money(cur.salary)}/Jahr</span></div>` : '<div class="pw-person bad">Posten frei</div>'}
        <div class="pw-hqbtns"><button data-hire="${k}">${hqHire === k ? 'Bewerber ausblenden' : cur ? 'Ersetzen' : 'Besetzen'}</button></div>
        ${cands.map((c, i) => `<div class="pw-cand"><div><span>${esc(c.name)}</span><span class="st">${stars(c.rating)} ${c.rating}</span><small>${money(c.salary)}/Jahr · Ablöse ${money(c.fee)}</small></div><button class="go" data-hirepost="${k}" data-hireidx="${i}">Einstellen</button></div>`).join('')}
      </div>`;
    }).join('') + `<div class="pw-hint">Gehälter zählen zur Budgetobergrenze (${money(staffCostPerRace(m))} pro Rennen). Bewerber wechseln nach jedem Wochenende.</div>`;
  } else if (hqTab === 'drivers') {
    h = Object.entries(m.drivers).map(([id, d]) => {
      const drv = DRIVERS.find(x => x.id === id);
      const ml = moodLabel(d.morale);
      return `<div class="pw-mcard"><b>#${drv.number} ${esc(drv.first)} ${esc(drv.last)}</b><small>${season.driverPts[id] || 0} WM-Punkte · Vertrag bis ${d.contractEnd} · ${money(d.salary)}/Jahr</small>
        ${hqBar('TEMPO', drv.pace, 100, '#ff6a3d')}${hqBar('KONSTANZ', drv.consistency, 100, '#ffb02e')}${hqBar('REGEN', drv.wet, 100, '#38bdf8')}
        ${hqBar('STIMMUNG', d.morale, 100, d.morale >= 60 ? '#4ade80' : d.morale >= 40 ? '#facc15' : '#f87171', `${ml[1]} ${d.morale}`)}
        <div class="pw-hqbtns"><button data-talk="${id}" data-k="praise">Loben</button><button data-talk="${id}" data-k="promise">Versprechen</button><button data-talk="${id}" data-k="pressure">Druck machen</button></div>
        <div class="pw-hqbtns"><button data-extend="${id}">Vertrag +1 Jahr<small>Prämie ${money(Math.round(d.salary * 2.5) / 10)}, Gehalt +8 %</small></button></div></div>`;
    }).join('') + '<div class="pw-hint">Stimmung = Laune am Funk zu Rennbeginn. Sie steigt mit Punkten und sinkt bei Ausfällen, Teamorder gegen den Fahrer und gebrochenen Versprechen (in 3 Rennen keine Punkte).</div>';
  } else if (hqTab === 'dev') {
    if (!m.concept) {
      h += '<div class="pw-hint bad">Lege das Konzept für das neue Auto fest (einmalig, kostet ' + money(CONCEPT_COST) + '). Gutes Personal (Technischer Direktor, Chefdesigner, Motorenchef) holt mehr heraus – also am besten vorher einstellen.</div>';
      h += Object.entries(CONCEPTS).map(([k, c]) => `<div class="pw-mcard"><b>${c.name}</b><small>${c.hint}</small><div class="pw-hqbtns"><button class="go" data-concept="${k}">Wählen</button></div></div>`).join('');
    } else {
      h += `<div class="pw-mcard"><b>Konzept: ${CONCEPTS[m.concept].name}</b>${Object.entries(DEV).map(([k, d]) => hqBar(d.short, m.dev[k], 6, '#ff6a3d', m.dev[k].toFixed(1).replace('.', ','))).join('')}</div>`;
    }
    h += '<div class="pw-label">UPGRADES</div>' + Object.entries(DEV).map(([k, d]) => `<div class="pw-mcard"><b>${d.name}</b><small>${d.hint} · Ertrag ×${devFactor(m, k).toFixed(2).replace('.', ',')} durch dein Personal</small>
      <div class="pw-hqbtns">${Object.entries(DEV_SIZE).map(([s, z]) => `<button data-dev="${k}" data-size="${s}">${z.name}<small>${money(z.cost)} · ${projectWeeks(m, s)} Wochen · +${(z.gain * devFactor(m, k)).toFixed(1).replace('.', ',')}</small></button>`).join('')}</div></div>`).join('')
      + `<div class="pw-label">LAUFENDE PROJEKTE (max. ${maxProjects(bLvl(m, 'factory'))} – Entwicklungszentrum)</div>${m.projects.length ? m.projects.map(p => `<div class="pw-mcard"><b>${DEV[p.type].name}</b><small>${DEV_SIZE[p.size].name} · fertig am ${fmtDate(p.done, true)} (in ${weeksBetween(season.date, p.done).toString().replace('.', ',')} Wochen) · +${p.gain.toFixed(2).replace('.', ',')}</small></div>`).join('') : '<div class="pw-hint">Keine.</div>'}
      <div class="pw-hint">Die anderen Teams entwickeln auch – wer stehen bleibt, fällt zurück.</div>`;
  } else if (hqTab === 'calendar' && ui.calView === 'month') {
    h = calSwitch() + calMonthHtml();
  } else if (hqTab === 'calendar') {
    const ev = calendarEvents(season, SEASON_2026, trackLabel);
    const past = season.results.slice(-3).map(r => ({ date: raceDate(season, SEASON_2026[r.round - 1]), kind: 'done', text: `${trackLabel(r.track)} – ${DRIVERS.filter(d => d.team === season.teamId).map(d => `${d.id} ${finishOf(r.race, d.id) || '–'}`).join(', ')}` }));
    let month = '';
    h = calSwitch() + `<div class="pw-hint">Heute: <b>${fmtDate(season.date, true)}</b>. Mit dem Knopf auf der Hauptseite geht es zum nächsten Termin.</div><div class="pw-cal">`
      + [...past, ...ev].map(e => {
        const mo = new Date(`${e.date}T12:00:00Z`).toLocaleDateString('de-DE', { month: 'long', year: 'numeric', timeZone: 'UTC' });
        const head = mo !== month ? `<div class="pw-calm">${mo}</div>` : '';
        month = mo;
        return `${head}<div class="pw-cale ${e.kind}"><span class="d">${new Date(`${e.date}T12:00:00Z`).getUTCDate()}.</span><span class="i">${calIcon(e)}</span><span class="t">${e.kind === 'race' ? `<b>Rennen ${e.round}</b> · ` : ''}${esc(e.text)}${e.kind === 'race' && SPRINT_TRACKS.includes(e.track) ? ' <small>Sprint</small>' : ''}</span></div>`;
      }).join('') + '</div>';
  } else if (hqTab === 'buildings') {
    const c = m.construction;
    h = (c ? `<div class="pw-mcard pw-hero"><b>🏗 Baustelle: ${BUILDINGS[c.key].name} → Stufe ${c.lvl}</b>${hqBar('FORTSCHRITT', weeksBetween(c.start || season.date, season.date), Math.max(0.1, weeksBetween(c.start || season.date, c.done)), '#ff6a3d', `fertig am ${fmtDate(c.done)}`)}</div>` : '<div class="pw-hint">Es kann immer nur ein Gebäude gleichzeitig gebaut werden. Investitionen zählen nicht zur Budgetobergrenze, der Unterhalt schon.</div>')
      + Object.entries(BUILDINGS).map(([k, b]) => {
        const l = bLvl(m, k);
        const next = l + 1;
        return `<div class="pw-mcard"><b>${b.icon} ${b.name}</b> <span class="st">${'★'.repeat(l)}${'☆'.repeat(BUILD_MAX - l)}</span><small>Jetzt: ${b.eff(l)}${next <= BUILD_MAX ? `<br>Stufe ${next}: ${b.eff(next)}` : '<br>Höchste Stufe erreicht.'}</small>
          ${next <= BUILD_MAX ? `<div class="pw-hqbtns"><button class="go" data-build="${k}" ${c ? 'disabled' : ''}>Ausbauen<small>${money(buildCost(next))} · ${buildWeeks(next)} Wochen</small></button></div>` : ''}</div>`;
      }).join('');
  } else if (hqTab === 'car') {
    h = '<div class="pw-label">ERSATZTEILE</div>' + Object.entries(PARTS).map(([k, p]) => `<div class="pw-mcard"><b>${p.name}</b> · ${m.parts[k]} auf Lager<small>${money(p.price)} pro Stück · ohne Lager Eilfertigung zum doppelten Preis</small>
      <div class="pw-hqbtns"><button data-part="${k}" data-n="1">+1 kaufen</button><button data-part="${k}" data-n="3">+3 kaufen</button></div></div>`).join('')
      + `<div class="pw-label">ANTRIEBSEINHEIT</div><div class="pw-mcard"><b>Nr. ${m.pu.used} von ${PU_ALLOWANCE}</b> · ${m.pu.age} Wochenende${m.pu.age === 1 ? '' : 'n'} alt<small>${m.pu.age >= 6 ? 'Defektrisiko steigt deutlich!' : 'Ab 6 Wochenenden steigt das Defektrisiko.'} Ab der ${PU_ALLOWANCE + 1}. Einheit: 10 Startplätze Strafe.</small>
      <div class="pw-hqbtns"><button data-pu="1">Neue Einheit einbauen</button></div></div>`;
  } else if (hqTab === 'money') {
    const inc = (m.titleSponsor ? m.titleSponsor.perRace : 0) + m.sponsors.reduce((s, x) => s + (x.fee || 0), 0) + 1.2;
    const out = OPS + staffCostPerRace(m) + Object.values(m.drivers).reduce((s, d) => s + d.salary, 0) / 24;
    h = `${hqBar('KONTO', Math.max(0, m.money), 100, m.money < 10 ? '#f87171' : '#4ade80', money(m.money))}
      ${hqBar('BUDGET-CAP', m.spent, CAP, m.spent > CAP * 0.9 ? '#f87171' : '#ff6a3d', `${money(m.spent)} / ${money(CAP)}`)}
      <div class="pw-mcard"><b>Pro Rennen (ohne Prämien)</b><small>Einnahmen ~${money(inc)} (Titelsponsor, Partner, Preisgeld-Grundbetrag) · Ausgaben ~${money(out)} (Betrieb ${money(OPS)}, Personal ${money(staffCostPerRace(m))}, Fahrer) · Saldo <b class="${inc - out < 0 ? 'neg' : 'pos'}">${money(inc - out)}</b></small></div>
      ${ledgerHtml(m)}
      <div class="pw-hint">Preisgeld: 0,12 Mio. $ je WM-Punkt zusätzlich. Zur Budgetobergrenze zählen Betrieb, Personal, Entwicklung, Teile und Reparaturen – nicht die Fahrergehälter. Überschreitung: Punktabzug am Saisonende.</div>`;
  } else if (hqTab === 'board') {
    h = `<div class="pw-mcard"><b>Saisonziel: Platz ${m.board.target}</b> in der Teamwertung<small>Erwartung ~${expectedPoints(m.board.target).toFixed(1).replace('.', ',')} Punkte pro Rennen${m.board.last ? ` · zuletzt ${m.board.last.pts}` : ''}</small>
      ${hqBar('VERTRAUEN', m.board.rep, 100, m.board.rep >= 50 ? '#4ade80' : m.board.rep >= 25 ? '#facc15' : '#f87171')}</div>` + careerHtml();
  } else if (hqTab === 'standings') {
    h = `<div class="season-tabs">${[['drivers', 'Fahrer'], ['teams', 'Teams'], ['calendar', 'Kalender']].map(([k, n]) => `<button class="stab${seasonTab === k ? ' active' : ''}" data-stab2="${k}">${n}</button>`).join('')}</div>${seasonTabHtml(seasonTab)}`;
  }
  $('hqBody').innerHTML = h;
  $('hqScreen').querySelector('.pw-mgr-foot').classList.toggle('hidden', hqTab !== 'home');
  // Weiter-Knopf unten
  const go = $('hqGo');
  const c = initCareer(season);
  if (seasonOver(season) || c.fired) { go.textContent = c.fired ? 'Ohne Team – Angebote unter Vorstand & Karriere' : `Saison ${season.year + 1} – unter Vorstand & Karriere`; go.disabled = true; }
  else if (m.phase === 'preseason' && !readyForRace(season)) { go.textContent = 'Erst die Aufgaben erledigen'; go.disabled = true; }
  else if (savedGame && savedGame.mode === 'season') { go.textContent = 'Wochenende fortsetzen'; go.disabled = false; }
  else {
    const nx = nextEvent(season, SEASON_2026, trackLabel);
    go.innerHTML = nx ? `Weiter · ${fmtDate(nx.date)} · ${nx.kind === 'race' ? esc(nx.text) : EV_LABEL[nx.kind] || ''}` : 'Weiter';
    go.disabled = !nx;
  }
}
const trackLabel = id => TRACKS[id].grandPrix.replace('Großer Preis ', 'GP ');
const calIcon = e => ({ race: '🏁', dev: '🔧', build: '🏗', done: '✓', sponsor: '🤝', media: '🎤', board: '🏛', contract: '📝', present: '🎉' }[e.kind] || '•');
const EV_LABEL = { dev: 'Upgrade fertig', build: 'Bau fertig', sponsor: 'Sponsor-Termin', media: 'Medientag', board: 'Vorstandssitzung', contract: 'Vertragsende', present: 'Auto-Präsentation' };
const teamPosNow = () => teamStandings(season, TEAMS).findIndex(x => x.t.id === season.teamId) + 1;

// Kalender-Animation: Tag für Tag bis zum nächsten Termin, dort kurz anhalten
function animateCalendar(from, to, ev) {
  return new Promise(resolve => {
    const el = $('calAnim');
    const days = Math.max(0, Math.round((new Date(`${to}T12:00:00Z`) - new Date(`${from}T12:00:00Z`)) / 86400000));
    const steps = Math.min(days, 45);
    const per = days ? Math.max(25, Math.min(70, 1500 / Math.max(1, steps))) : 0;
    $('calAnimEv').innerHTML = '';
    el.classList.remove('hidden', 'stop');
    let i = 0;
    const show = iso => {
      const d = new Date(`${iso}T12:00:00Z`);
      $('calAnimDay').textContent = d.getUTCDate();
      $('calAnimWd').textContent = d.toLocaleDateString('de-DE', { weekday: 'long', timeZone: 'UTC' });
      $('calAnimMo').textContent = d.toLocaleDateString('de-DE', { month: 'long', year: 'numeric', timeZone: 'UTC' });
      $('calAnimBar').style.width = `${steps ? (i / steps) * 100 : 100}%`;
    };
    const tick = () => {
      i++;
      const iso = addDays(from, Math.round(days * i / Math.max(1, steps)));
      show(iso);
      if (i < steps) { setTimeout(tick, per); return; }
      el.classList.add('stop');
      $('calAnimEv').innerHTML = `${calIcon(ev)} ${esc(ev.text)}`;
      setTimeout(() => { el.classList.add('hidden'); resolve(); }, 900);
    };
    show(from);
    if (!steps) { tick(); return; }
    setTimeout(tick, per);
  });
}

// Finanzen: alle Buchungen der Saison, gruppiert nach Monaten oder nach Rennen
function ledgerHtml(m) {
  const list = m.ledger || [];
  const by = ui.ledgerBy || 'month';
  const groups = new Map();
  for (const e of list) {
    const key = by === 'month' ? (e.date || '').slice(0, 7) : String(e.round);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  const label = k => by === 'month'
    ? (k ? new Date(`${k}-01T12:00:00Z`).toLocaleDateString('de-DE', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : 'Ohne Datum')
    : Number(k) === 0 ? 'Vorsaison' : `Nach Rennen ${k} · ${trackLabel(SEASON_2026[Number(k) - 1].track)}`;
  const html = [...groups.entries()].reverse().map(([k, l]) => {
    const sum = l.reduce((a, e) => a + e.amount, 0);
    return `<details class="pw-ledger"${k === [...groups.keys()].pop() ? ' open' : ''}><summary><span>${label(k)}</span><b class="${sum < 0 ? 'neg' : 'pos'}">${sum >= 0 ? '+' : ''}${money(sum)}</b></summary>
      <table class="pw-res"><tbody>${l.map(e => `<tr><td>${e.date ? fmtDate(e.date) : ''}</td><td>${esc(e.what)}</td><td style="text-align:right" class="${e.amount < 0 ? 'neg' : 'pos'}">${e.amount > 0 ? '+' : ''}${money(e.amount)}</td></tr>`).join('')}</tbody></table></details>`;
  }).join('');
  return `<div class="pw-label">BUCHUNGEN</div><div class="pw-calsw"><button data-ledger="month" class="${by === 'month' ? 'on' : ''}">Nach Monaten</button><button data-ledger="round" class="${by === 'round' ? 'on' : ''}">Nach Rennen</button></div>
    ${html || '<div class="pw-hint">Noch keine Buchungen.</div>'}`;
}

// Kalender: Umschalter Liste/Monat und Monatsansicht
function calSwitch() {
  return `<div class="pw-calsw"><button data-calview="list" class="${ui.calView !== 'month' ? 'on' : ''}">☰ Liste</button><button data-calview="month" class="${ui.calView === 'month' ? 'on' : ''}">▦ Monat</button></div>`;
}
function calMonthHtml() {
  if (!ui.calMonth) ui.calMonth = season.date.slice(0, 7);
  const [y, mo] = ui.calMonth.split('-').map(Number);
  const first = new Date(Date.UTC(y, mo - 1, 1));
  const days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7;   // Montag zuerst
  const evs = calendarEvents(season, SEASON_2026, trackLabel);
  const past = season.results.map(r => ({ date: raceDate(season, SEASON_2026[r.round - 1]), kind: 'done', text: trackLabel(r.track) }));
  const byDay = {};
  for (const e of [...past, ...evs]) if (e.date.slice(0, 7) === ui.calMonth) (byDay[Number(e.date.slice(8))] ||= []).push(e);
  let cells = '';
  for (let i = 0; i < lead; i++) cells += '<div class="pw-cd empty"></div>';
  for (let d = 1; d <= days; d++) {
    const iso = `${ui.calMonth}-${String(d).padStart(2, '0')}`;
    const list = byDay[d] || [];
    cells += `<div class="pw-cd${iso === season.date ? ' today' : ''}${iso < season.date ? ' past' : ''}${list.some(e => e.kind === 'race') ? ' race' : ''}"><span>${d}</span><i>${list.map(calIcon).join('')}</i></div>`;
  }
  const items = Object.entries(byDay).sort((a, b) => a[0] - b[0]).flatMap(([d, l]) => l.map(e => `<div class="pw-cale ${e.kind}"><span class="d">${d}.</span><span class="i">${calIcon(e)}</span><span class="t">${esc(e.text)}</span></div>`)).join('');
  return `<div class="pw-calnav"><button data-calmove="-1">‹</button><b>${first.toLocaleDateString('de-DE', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</b><button data-calmove="1">›</button></div>
    <div class="pw-cgrid">${['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(x => `<div class="pw-cwd">${x}</div>`).join('')}${cells}</div>
    <div class="pw-cal">${items || '<div class="pw-hint">Keine Termine in diesem Monat.</div>'}</div>`;
}

// Sponsoren-Verhandlung
function negoHtml(n) {
  const k = n.kind === 'title' ? 'perRace' : 'fee';
  const terms = n.kind === 'title'
    ? `<div class="pw-terms"><div><small>pro Rennen</small><b>${money(n.cur.perRace)}</b></div><div><small>Saisonbonus</small><b>${money(n.cur.bonus)}</b></div><div><small>Ziel</small><b>Platz ${n.cur.target}</b></div></div>`
    : `<div class="pw-terms"><div><small>pro Rennen</small><b>${money(n.cur.fee)}</b></div><div><small>Prämie</small><b>${money(n.cur.reward)}</b></div><div><small>Ziel</small><b>${goalText(n.cur.goal)}</b></div></div>`;
  // Geschätzter Saisonwert: Fixum × 24 Rennen + erwartete Prämien (Bonus/Prämie zu ~40 % erreicht)
  const val = o => (n.kind === 'title' ? o.perRace * 24 + o.bonus * 0.5 : o.fee * 24 + o.reward * 24 * 0.4);
  const diff = Math.round((val(n.cur) / val(n.base) - 1) * 100);
  return `<div class="pw-mcard pw-hero"><b>🤝 ${esc(n.name)}</b> <span class="pw-chip">${n.kind === 'title' ? 'Titelsponsor' : 'Partner'}</span>${terms}
    ${hqBar('INTERESSE', n.interest, 100, n.interest >= 50 ? '#4ade80' : n.interest >= 25 ? '#facc15' : '#f87171')}
    <small>Runde ${n.round} · geschätzter Wert ~${money(val(n.cur))} pro Saison (${diff >= 0 ? '+' : ''}${diff} % zum ersten Angebot)</small></div>
    <div class="pw-nlog">${n.log.slice(-5).reverse().map(l => `<div>${esc(l)}</div>`).join('')}</div>
    ${n.gone ? '<div class="pw-hqbtns"><button data-na="cancel">Zurück zu den Sponsoren</button></div>' : `
    <div class="pw-label">DEINE FORDERUNG</div>
    <div class="pw-hqbtns"><button data-na="up5">+5 %<small>vorsichtig</small></button><button data-na="up10">+10 %<small>normal</small></button><button data-na="up20">+20 %<small>riskant</small></button></div>
    <div class="pw-hqbtns"><button data-na="swap" ${n.swapped ? 'disabled' : ''}>Mehr Erfolgsprämie<small>20 % Fixum gegen +60 % ${n.kind === 'title' ? 'Bonus' : 'Prämie'}</small></button></div>
    <div class="pw-hqbtns"><button class="go" data-na="sign">Unterschreiben</button><button data-na="cancel">Abbrechen</button></div>
    <div class="pw-hint">Jeder Sponsor hat eine Grenze, die du nicht siehst. Zu hohe Forderungen und viele Runden kosten Interesse – bei 0 zieht er sein Angebot zurück. Besserer Ruf und das Marketing-Gebäude geben mehr Spielraum.</div>`}`;
}

// Eigenes Bestätigungsfenster (statt Browser-Dialog)
function pwConfirm(title, text, okLabel = 'OK') {
  return pwChoose(title, text, [{ key: false, label: 'Abbrechen', secondary: true }, { key: true, label: okLabel }]);
}
// Auswahl mit mehreren Knöpfen: options [{ key, label, sub?, secondary? }] → Promise mit dem gewählten key
function pwChoose(title, text, options) {
  return new Promise(resolve => {
    $('pwDlgTitle').innerHTML = title;
    $('pwDlgText').innerHTML = text;
    const box = $('pwDlgBtns');
    box.className = `pw-dlg-btns n${options.length}`;
    box.innerHTML = options.map((o, i) => `<button data-i="${i}" class="${o.secondary ? 'secondary-btn' : 'primary-btn'}">${o.label}${o.sub ? `<small>${o.sub}</small>` : ''}</button>`).join('');
    $('pwDialog').classList.remove('hidden');
    box.onclick = e => {
      const b = e.target.closest('[data-i]');
      if (!b) return;
      box.onclick = null;
      $('pwDialog').classList.add('hidden');
      resolve(options[Number(b.dataset.i)].key);
    };
  });
}

// Karriere: Ruf als Teamchef, Angebote, Verlauf, neue Saison
function careerHtml() {
  const c = initCareer(season);
  const over = seasonOver(season);
  const tn = id => esc(TEAM_BY_ID[id].name);
  let h = `<div class="pw-label">KARRIERE</div>${hqBar('RUF ALS TEAMCHEF', c.rep, 100, c.rep >= 60 ? '#4ade80' : c.rep >= 35 ? '#facc15' : '#f87171')}
    <div class="pw-hint">Stärkere Teams melden sich erst ab hohem Ruf (Top-Team ~85). Angebote kommen nach Rennen 8 und 16 sowie zum Saisonende.</div>`;
  if (c.fired) h += '<div class="pw-hint bad"><b>Du bist ohne Team.</b> Nimm ein Angebot an, um weiterzumachen.</div>';
  h += c.offers.length ? c.offers.map(o => `<div class="pw-mcard"><b>${tn(o.teamId)}</b><small>${esc(o.why)} ${o.next ? `Ab ${o.year + 1}` : 'Wechsel ab dem nächsten Wochenende'} · Ziel: Platz ${o.target}</small>
      <div class="pw-hqbtns"><button class="go" data-offer="${o.teamId}">Annehmen</button></div></div>`).join('') : '<div class="pw-hint">Keine Angebote.</div>';
  if (over && !c.fired) h += `<div class="pw-hqbtns"><button class="go" data-newseason="1">Saison ${season.year + 1} mit ${tn(season.teamId)}</button></div>`;
  h += `<div class="pw-label">VERLAUF</div>${c.history.length ? `<table class="pw-res"><tbody>${c.history.map(x => `<tr><td>${x.year}</td><td>${tn(x.team)}</td><td>${x.end ? `${x.end} nach Rennen ${x.round}` : `Teamwertung P${x.pos} (Ziel P${x.target}) · ${x.pts} Pkt.`}</td></tr>`).join('')}</tbody></table>` : '<div class="pw-hint">Erste Saison.</div>'}`;
  return h;
}
$('hqBack').addEventListener('click', () => {
  if (season.mgmt.nego) { negoCancel(season); renderHQ(); return; }
  hqTab = 'home'; hqHire = null; renderHQ(); $('hqBody').scrollTop = 0;
});
$('hqClose').addEventListener('click', () => {
  if (hqTab !== 'home') { if (season.mgmt.nego) negoCancel(season); hqTab = 'home'; hqHire = null; renderHQ(); $('hqBody').scrollTop = 0; return; }
  $('hqScreen').classList.add('hidden');
  renderStart();
});
// Weiter zum nächsten Termin im Kalender: Rennen → Wochenende starten, sonst Fertigstellung übernehmen
$('hqGo').addEventListener('click', async () => {
  const m = season.mgmt;
  if (savedGame && savedGame.mode === 'season') { $('hqScreen').classList.add('hidden'); resumeGame(); return; }
  const nx = nextEvent(season, SEASON_2026, trackLabel);
  if (!nx) return;
  if (m.phase === 'preseason' && nx.kind !== 'race') { /* Vorsaison-Termine sind erlaubt */ }
  $('hqGo').disabled = true;
  await animateCalendar(season.date, nx.date, nx);
  if (nx.kind === 'race') {
    if (m.phase === 'preseason') { const err = startSeason(season); if (err) { toast(err); return; } }
    const notes = advanceTo(season, addDays(nx.date, -2));   // Freitag des Rennwochenendes
    saveSeason(season);
    if (notes.length) { hqNotes = notes; toast(notes[0], 3000); }
    $('hqScreen').classList.add('hidden');
    newRace();
    startRace();
    return;
  }
  hqNotes = advanceTo(season, nx.date);
  setBookingContext(season);
  if (nx.kind === 'sponsor') {
    // Sponsor-Termin: welcher Fahrer geht hin – oder absagen?
    const ev = m.events.find(e => e.id === nx.id);
    const t = SPONSOR_EVENTS[ev.type];
    const opts = t.driver
      ? Object.keys(m.drivers).map(id => ({ key: id, label: `${id} schicken`, sub: `Stimmung ${m.drivers[id].morale}` }))
      : [{ key: 'go', label: 'Gäste empfangen' }];
    const choice = await pwChoose(`🤝 ${t.name} · ${esc(ev.sponsor)}`, `${t.hint}. ${t.driver ? 'Ein Fahrer muss hin – das kostet ihn etwas Stimmung.' : ''} Absagen verärgert den Sponsor.`,
      [...opts, { key: 'decline', label: 'Absagen', secondary: true }]);
    hqNotes.push(resolveSponsorEvent(season, ev.id, choice));
  } else if (['media', 'board', 'contract', 'present'].includes(nx.kind)) {
    const pos = teamPosNow();
    const dlg = agendaDialog(season, nx, pos);
    let res = null;
    while (!res) {
      const choice = await pwChoose(dlg.title, dlg.text, dlg.options);
      res = resolveAgenda(season, nx, choice, pos);
      if (res && /Nicht genug Geld/.test(res)) { toast(res); res = null; }
    }
    hqNotes.push(res);
  }
  saveSeason(season);
  hqTab = 'home';
  renderHQ();
  $('hqBody').scrollTop = 0;
});
$('hqBody').addEventListener('click', async e => {
  const b = e.target.closest('button');
  if (!b || !season || b.disabled) return;
  let err = null;
  const m = season.mgmt;
  setBookingContext(season);
  if (b.dataset.go) { hqTab = b.dataset.go; hqHire = null; renderHQ(); $('hqBody').scrollTop = 0; return; }
  if (b.dataset.stab2) { seasonTab = b.dataset.stab2; renderHQ(); return; }
  if (b.dataset.ledger) { ui.ledgerBy = b.dataset.ledger; renderHQ(); return; }
  if (b.dataset.calview) { ui.calView = b.dataset.calview; ui.calMonth = season.date.slice(0, 7); renderHQ(); return; }
  if (b.dataset.calmove) { const [y, mo] = ui.calMonth.split('-').map(Number); const d = new Date(Date.UTC(y, mo - 1 + Number(b.dataset.calmove), 1)); ui.calMonth = d.toISOString().slice(0, 7); renderHQ(); return; }
  if (b.dataset.hire) { hqHire = hqHire === b.dataset.hire ? null : b.dataset.hire; renderHQ(); return; }
  if (b.dataset.hirepost) {
    const c = m.market.staff[b.dataset.hirepost][Number(b.dataset.hireidx)];
    if (!(await pwConfirm(`${POSTS[b.dataset.hirepost].name}: ${esc(c.name)}`, `Bewertung ${c.rating} · Gehalt ${money(c.salary)}/Jahr · Ablöse ${money(c.fee)}. Einstellen?`, 'Einstellen'))) return;
    err = hire(season, b.dataset.hirepost, Number(b.dataset.hireidx)); if (!err) hqHire = null;
  }
  else if (b.dataset.nego) err = startNego(season, b.dataset.nego, Number(b.dataset.idx));
  else if (b.dataset.na) {
    if (b.dataset.na === 'sign') {
      const n = m.nego;
      if (!(await pwConfirm('Vertrag unterschreiben?', `${esc(n.name)}: ${n.kind === 'title' ? `${money(n.cur.perRace)} pro Rennen, Bonus ${money(n.cur.bonus)} bei Platz ${n.cur.target} oder besser` : `${money(n.cur.fee)} pro Rennen, Prämie ${money(n.cur.reward)} (${goalText(n.cur.goal)})`}.`, 'Unterschreiben'))) return;
      err = negoSign(season);
      if (!err) toast('Vertrag unterschrieben!');
    } else if (b.dataset.na === 'cancel') negoCancel(season);
    else err = negoAction(season, b.dataset.na);
  }
  else if (b.dataset.drop) { if (!(await pwConfirm('Partnervertrag beenden?', 'Der Partner zahlt dann nichts mehr. Das Vertrauen des Vorstands sinkt etwas.', 'Beenden'))) return; err = dropPartner(season, Number(b.dataset.drop)); }
  else if (b.dataset.concept) { const c = CONCEPTS[b.dataset.concept]; if (!(await pwConfirm(c.name, `${c.hint}. Das Konzept gilt für die ganze Saison und kostet ${money(CONCEPT_COST)}.`, 'Festlegen'))) return; err = chooseConcept(season, b.dataset.concept); }
  else if (b.dataset.dev) {
    const z = DEV_SIZE[b.dataset.size], d = DEV[b.dataset.dev];
    if (!(await pwConfirm(`${d.name}: ${z.name}`, `Kosten ${money(z.cost)} (Budgetobergrenze) · Dauer ${projectWeeks(m, b.dataset.size)} Wochen (fertig am ${fmtDate(addDays(season.date, projectWeeks(m, b.dataset.size) * 7))}) · Ertrag ca. +${(z.gain * devFactor(m, b.dataset.dev)).toFixed(1).replace('.', ',')}. Jetzt starten?`, 'Starten'))) return;
    err = startProject(season, b.dataset.dev, b.dataset.size);
  }
  else if (b.dataset.build) {
    const k = b.dataset.build, l = bLvl(m, k) + 1;
    if (!(await pwConfirm(`${BUILDINGS[k].name} auf Stufe ${l}`, `${BUILDINGS[k].eff(l)}. Kosten ${money(buildCost(l))}, Bauzeit ${buildWeeks(l)} Wochen (fertig am ${fmtDate(addDays(season.date, buildWeeks(l) * 7))}). Bauen?`, 'Bauen'))) return;
    err = startBuilding(season, k);
  }
  else if (b.dataset.part) {
    const p = PARTS[b.dataset.part], n = Number(b.dataset.n);
    if (!(await pwConfirm(`${n}× ${p.name} kaufen?`, `Kosten ${money(p.price * n)} (Budgetobergrenze).`, 'Kaufen'))) return;
    err = buyPart(season, b.dataset.part, n);
  }
  else if (b.dataset.pu) { if (!(await pwConfirm('Neue Antriebseinheit einbauen?', `Erlaubt sind ${PU_ALLOWANCE} pro Saison. Ab der ${PU_ALLOWANCE + 1}. gibt es 10 Startplätze Strafe.`, 'Einbauen'))) return; err = newPowerUnit(season); }
  else if (b.dataset.talk) err = talkTo(season, b.dataset.talk, b.dataset.k);
  else if (b.dataset.extend) { if (!(await pwConfirm('Vertrag verlängern?', 'Ein Jahr länger, Gehalt +8 % und eine Unterschriftsprämie.', 'Verlängern'))) return; err = extendContract(season, b.dataset.extend); }
  else if (b.dataset.offer || b.dataset.newseason) {
    if (savedGame && savedGame.mode === 'season') { toast('Erst das laufende Wochenende zu Ende fahren (oder verwerfen).', 3500); return; }
    const id = b.dataset.offer || season.teamId;
    const name = TEAM_BY_ID[id].name;
    if (!(await pwConfirm(b.dataset.offer ? `Angebot von ${esc(name)} annehmen?` : `Neue Saison ${season.year + 1}`, b.dataset.offer ? 'Du wechselst das Team. Die Teamzentrale startet mit Budget, Personal und Zielen des neuen Teams.' : `Weiter mit ${esc(name)}.`, b.dataset.offer ? 'Annehmen' : 'Starten'))) return;
    season = b.dataset.offer ? acceptOffer(season, TEAMS, DRIVERS, id) : startNewSeason(season, TEAMS, DRIVERS);
    if (b.dataset.newseason || season.round === 0) season.mgmt.phase = 'preseason';
    saveSeason(season);
    hqNotes = [`Willkommen bei <b>${esc(name)}</b>! Saison ${season.year}, Ziel: Platz ${season.mgmt.board.target}.`];
    hqTab = 'home';
    newRace();
  }
  if (err) toast(err, 3000);
  saveSeason(season);
  renderHQ();
});

$('modeSingle').addEventListener('click', () => setMode('single'));
$('modeSeason').addEventListener('click', () => setMode('season'));

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
  const sea = isSeason();
  const running = sea && season;
  const entry = running ? currentEntry(season) : null;
  $('modeSingle').classList.toggle('active', !sea);
  $('modeSeason').classList.toggle('active', sea);
  $('seasonBtn').classList.toggle('hidden', !running);
  $('hqBtn').classList.add('hidden');
  if (running && !season.mgmt) { initManagement(season, TEAMS, DRIVERS); saveSeason(season); }
  $('gpList').classList.toggle('hidden', sea);
  $('sessionChecks').classList.toggle('hidden', sea);
  $('weatherSeg').classList.toggle('hidden', sea);
  $('wxSeasonNote').classList.toggle('hidden', !sea);
  $('teamList').classList.toggle('hidden', Boolean(running));
  renderResume();
  // Teams
  $('teamList').innerHTML = TEAMS.map(t => `<button class="pw-team${t.id === playerTeamId() ? ' on' : ''}" data-team="${t.id}" role="option"><i style="background:${t.color}"></i>${esc(t.name)}</button>`).join('');
  const t = TEAM_BY_ID[playerTeamId()];
  const drv = DRIVERS.filter(d => d.team === t.id);
  const bar = (label, v) => `<span>${label}</span><i><b style="width:${v}%"></b></i><span>${v}</span>`;
  $('teamInfo').innerHTML = `<b>${esc(t.name)}</b>${drv.map(d => `<div class="pw-drv">#${d.number} ${esc(d.first)} ${esc(d.last)}</div>`).join('')}
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
  $('evRound').textContent = entry ? `Saison ${season.year} · Rennen ${entry.round}/${SEASON_2026.length} · ${new Date(`${season.year}${entry.date.slice(4)}`).toLocaleDateString('de-DE')}`
    : running ? `Saison ${season.year} beendet` : sea ? 'Neue Saison – Team wählen' : '';
  $('gpInfo').innerHTML = `<b>${def.grandPrix.replace('Großer Preis ', 'GP ')}</b><div><span>${distanceFor(track, 'race', settings.length).laps}</span> Runden</div><div><span>${(def.lengthM / 1000).toFixed(3).replace('.', ',')}</span> km</div>`;
  renderSegs();
  const parts = settings.parts || ['fp', 'quali'];
  for (const cb of $('sessionChecks').querySelectorAll('input')) cb.checked = cb.value === 'race' || parts.includes(cb.value);
  $('weekendSteps').innerHTML = wk.seq.map((k, i) => `<span class="wstep${i < wk.idx ? ' done' : i === wk.idx ? ' now' : ''}">${SESSION_SHORT[k]}</span>`).join('<span class="wsep">›</span>');
  const fired = Boolean(running && season.career && season.career.fired);
  $('startBtn').textContent = sea && !season ? 'Saison starten' : running ? 'Saison fortsetzen' : wk.seq.length > 1 ? `Start: ${SESSION_NAME[wk.seq[0]]}` : 'Rennen starten';
  $('startBtn').disabled = false;
  if (running) $('teamInfo').insertAdjacentHTML('afterbegin', `<div class="pw-sum">Saison mit <b>${esc(t.name)}</b>${season.results.length ? ` · Teamwertung P${teamStandings(season, TEAMS).findIndex(x => x.t.id === season.teamId) + 1} · ${season.teamPts[season.teamId] || 0} Punkte` : ' · noch kein Rennen gefahren'}</div>`);
  const wx = race.weather;
  $('forecast').textContent = !wx.showers.length ? '☀️ Vorhersage: trocken'
    : wx.wetness > 0.2 ? `🌧 Vorhersage: Regen zum Start${wx.showers.length > 1 ? ', später weitere Schauer' : ''}`
      : '🌦 Vorhersage: wechselhaft – Regenschauer im Rennen möglich';
  drawStartHero();
}
$('teamList').addEventListener('click', e => {
  const b = e.target.closest('[data-team]');
  if (!b || b.dataset.team === settings.teamId || (isSeason() && season)) return;
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
  // Streckenbild der Startseite sichtbar machen – dort beginnt das Intro (fließender Übergang)
  const pv = $('trackPreview');
  if (!$('startScreen').classList.contains('hidden')) {
    const r = pv.getBoundingClientRect();
    if (r.top < 0 || r.bottom > window.innerHeight) pv.scrollIntoView({ block: 'center' });
  }
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
  setSpeed(1);   // jede Session (Training, Qualifying, Rennen) beginnt mit 1×
  paused = false;
  renderSpeedBtns();
  setTab('wall');
  requestWakeLock();
}

// ---------- Game-Loop ----------
function frame(now) {
  const realDt = Math.min(0.25, (now - lastFrame) / 1000);
  lastFrame = now;
  if (race && !paused && ff) {
    // Vorspulen: so viele Schritte wie in ~30 ms passen, ohne Abbremsen
    const t0 = performance.now();
    while (race.phase !== 'finished' && performance.now() - t0 < 30) {
      for (let k = 0; k < 40; k++) { race.step(); autoDirect(race); teamStep(race); radioStep(race); updateRaceData(race); }
    }
    if (race.phase === 'finished') { ff = false; $('ffTag').classList.add('hidden'); }
    for (const c of race.cars) prevD.set(c, c.d);
  } else if (race && !paused) {
    acc += realDt * settings.speed;
    let n = 0;
    while (acc >= DT && n < 2000) {
      for (const c of race.cars) prevD.set(c, c.d);
      race.step();
      autoDirect(race);
      teamStep(race);
      radioStep(race);
      updateRaceData(race);
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
      if (race.phase === 'finished' && !resultShown) { showResults(); autosave(); }
    }
    if (!paused && race.phase !== 'pre' && race.phase !== 'finished' && now - lastSave > 10000) { lastSave = now; autosave(); }
  }
  requestAnimationFrame(frame);
}

// Vorspulen: Quali – beide eigenen Fahrer ausgeschieden; Rennen – beide ausgefallen (Rückfrage)
let ff = false;
function startFF(text) {
  ff = true;
  paused = false;
  $('ffTag').textContent = text;
  $('ffTag').classList.remove('hidden');
  renderSpeedBtns();
}
function checkFastForward() {
  if (ff || race.phase !== 'running' && race.phase !== 'chequered') return;
  const mine = playerCars(race);
  if (race.isSession) {
    if (race.kind === 'fp' || ui.ffAsked) return;
    const out = mine.every(c => c.retired || (c.elimSeg !== null && c.elimSeg !== undefined));
    if (out && (race.segState === 'break' || race.segFlag)) { ui.ffAsked = true; startFF('⏩ Beide ausgeschieden – Rest wird simuliert …'); }
    return;
  }
  if (!ui.ffAsked && mine.every(c => c.retired || c.dsq)) {
    ui.ffAsked = true;
    $('askScreen').classList.remove('hidden');
  }
}
$('askWatch').addEventListener('click', () => $('askScreen').classList.add('hidden'));
$('askSim').addEventListener('click', () => { $('askScreen').classList.add('hidden'); startFF('⏩ Rennen wird bis zum Ende simuliert …'); });

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
  const ct = document.querySelector('.tab[data-tab="circle"]');
  ct.classList.toggle('hidden', race.isSession);
  if (race.isSession && activeTab === 'circle') setTab('wall');
  checkFastForward();
  updateStatus();
  checkNotices();
  renderWall();
  if (activeTab === 'circle') renderCircle();
  if (weatherPanel.isOpen && weatherPanel.offset === 0) weatherPanel.drawRadar();
  if (!touching) {
    $('panel-timing').classList.toggle('race-tt', !race.isSession);
    if (activeTab === 'timing') {
      if (race.isSession) renderTiming($('timing'), race, { gapMode: settings.gapMode, selected: map.selected });
      else renderRaceTable($('timing'), race, map.selected);
    }
    if (settings.showTower) renderTower($('tower'), race, map.selected, settings.gapMode);
  }
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
  else if (n && n.type === 'red' && !n.restart) msg = race.isSession ? 'ROTE FLAGGE – Session unterbrochen' : 'ROTE FLAGGE – Reifenwechsel in der Boxengasse frei';
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
      <div class="pw-sets" data-f="rsets"></div>
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
    const tyreTab = car.retired ? '' : ` · <i class="pw-tyre ${car.compound}">${car.compound}</i> ${tyreLaps(car)} Rd`;
    tab.querySelector('span').innerHTML = `${tpos}${tyreTab}${tmsg ? ' <i class="pw-dot">📻</i>' : ''}${car.redQueued && !car.redTyre ? ' <i class="pw-dot red">REIFEN?</i>' : ''}`;
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
    f('meta').innerHTML = `<b>${life}%</b> · ${tyreLaps(car)} Rd · ${car.stops} St`;
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
    // Reifensatz für den nächsten Stopp (aus dem Kontingent des Fahrers)
    if (car.nextSet && car.nextSet.c !== sel) car.nextSet = null;
    const nset = car.nextSet || setsOf(wk, car.id, sel).find(x => x !== car.curSet) || null;
    const nsig = `${sel}|${nset ? nset.id : 0}|${wk.sets[car.id].map(x => Math.round(x.laps)).join(',')}|${gone}`;
    if (f('rsets').dataset.sig !== nsig) { f('rsets').dataset.sig = nsig; f('rsets').innerHTML = gone ? '' : setChips(car, nset ? nset.id : 0, 'data-rset', sel); }
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
  if (b.dataset.wtab) {
    ui.wallCar = b.dataset.wtab;
    map.startFollow(b.dataset.wtab);   // Karte folgt dem gewählten Fahrer (mittig), „Gesamt“ beendet das
    renderWall(); $('panel-wall').scrollTop = 0; return;
  }
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
  if (b.dataset.rset) {
    const st = wk.sets[car.id].find(x => x.id === Number(b.dataset.rset));
    if (st && st !== car.curSet) { car.nextSet = st; setStopCompound(car, st.c); }
    renderWall();
    return;
  }
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
const mate = car => playerCars(race).find(x => x !== car);
// Windschatten geben: Zeitpunkt zum Rausfahren (Teamkollege auf der Aufwärmrunde) bzw. Status auf der Strecke
function towHint(car) {
  const m = mate(car);
  if (!m || race.kind === 'fp') return '';
  if (car.inGarage) {
    if (m.inGarage) return `🎧 Windschatten: Schick ${car.id} zuerst raus und ${m.id} 3–10 s danach. ${car.id} bleibt vorne, wartet auf ihn und zieht ihn über die längste Gerade.`;
    return `🎧 ${m.id} ist schon draußen – ${car.id} müsste vor ihm sein. Windschatten nur noch auf der Auslaufrunde von ${car.id} möglich.`;
  }
  if (m.inGarage && !car.towDone && race.givesTow(car)) return `🎧 Jetzt ${m.id} rausschicken – ${car.id} wartet auf ihn.`;
  const t = race.towTarget(car);
  if (car.towDone) return `🎧 Windschatten gegeben.`;
  if (!race.givesTow(car)) return car.prog.phase === 'push' ? `🎧 ${car.id} ist auf der schnellen Runde – Windschatten erst wieder auf der Auslaufrunde.` : '';
  if (car.towAside) return `🎧 ${car.id} macht Platz – ${m.id} geht in der Bremszone vorbei.`;
  if (car.towing) return `🎧 ${car.id} gibt ${m.id} Windschatten.`;
  if (t) return `🎧 ${car.id} wartet auf ${m.id} (${fmt(t.behind / Math.max(40, m.v || 40))} s dahinter).`;
  return `🎧 ${m.id} ist nicht in Reichweite – kein Windschatten.`;
}
function runCfg(car) {
  if (!ui.run[car.id]) ui.run[car.id] = { c: race.weather.wetness > 0.15 ? bestCompound(race.weather.wetness, 20) : race.kind === 'fp' ? 'M' : 'S', fresh: race.kind !== 'fp', push: race.kind === 'fp' ? 3 : 1, fuel: race.kind === 'fp' ? 'high' : 'low' };
  return ui.run[car.id];
}
// Gewählter Reifensatz (oder automatisch: neuer Satz bevorzugt, im Training gebrauchter)
function runSet(car) {
  const cfg = runCfg(car);
  const list = setsOf(wk, car.id, cfg.c);
  const pick = cfg.setId && list.find(s => s.id === cfg.setId);
  if (pick) return pick;
  const fresh = list.find(s => s.laps < 0.05), used = list.find(s => s.laps >= 0.05);
  return cfg.fresh ? fresh || used || null : used || fresh || null;
}
// Alle Sätze eines Fahrers als Auswahl-Chips (neu / gebraucht mit Runden)
function setChips(car, selId, attr = 'data-setid', filter = null) {
  const list = wk.sets[car.id].filter(s => !filter || s.c === filter).sort((a, b) => 'SMHIW'.indexOf(a.c) - 'SMHIW'.indexOf(b.c) || a.laps - b.laps);
  return list.map(st => `<button ${attr}="${st.id}" class="${st.id === selId ? 'on' : ''}${st === car.curSet && !car.inGarage ? ' mounted' : ''}"><i class="pw-tyre ${st.c}">${st.c}</i>${st.laps < 0.05 ? 'neu' : `${Math.round(st.laps)} Rd`}</button>`).join('');
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
// Runden auf dem montierten Reifensatz insgesamt (über alle Sessions des Wochenendes)
const tyreLaps = car => (car.curSet && car.curSet.lapCount !== undefined ? car.curSet.lapCount : car.tyreAge);

const mmss = t => `${Math.floor(Math.max(0, t) / 60)}:${String(Math.floor(Math.max(0, t) % 60)).padStart(2, '0')}`;

// Sektor-Quadrate im Reiter (wie in ZEITEN)
function tabSecs(car) {
  if (!car.prog) return '';
  if (car.inGarage) return '';
  if (car.prog.phase === 'out') return '<b class="tabph">OUT</b>';
  if (car.prog.phase !== 'push' && !car.lastSecs) return '<b class="tabph">IN</b>';
  const list = car.prog.phase === 'push' ? (car.curSecs && car.curSecs.length ? car.curSecs : car.lastSecs || []) : car.lastSecs || [];
  return `<span class="secs">${[0, 1, 2].map(k => `<i class="${list[k] || ''}"></i>`).join('')}</span>`;
}
// Einschätzung des Renningenieurs in Q1/Q2: reicht die Zeit? Erwartete Verbesserung der anderen: Streckenentwicklung
// und Autos, die noch fahren (in der Garage mit geplantem Run oder gerade auf der Strecke)
function qualiAssess(car) {
  if (race.kind === 'fp' || race.segState !== 'run' || car.retired) return null;
  const seg = race.segment;
  if (!seg.keep || (car.elimSeg !== null && car.elimSeg !== undefined)) return null;
  const my = car.segBest && car.segBest[race.segIdx];
  if (!my) return { key: 'none', cls: '', text: 'Noch keine Zeit – wir brauchen eine Runde.', radio: '' };
  const rk = race.segmentRanking();
  const pos = rk.indexOf(car) + 1;
  const tOf = c => c && c.segBest && c.segBest[race.segIdx];
  const still = rk.filter(c => c !== car && (!c.inGarage || (c.prog.runs[c.prog.runIdx] && !race.segFlag))).length;
  const improve = race.segFlag ? 0 : 0.15 + Math.min(0.35, still * 0.03);
  const fmt3 = x => x.toFixed(3).replace('.', ',');
  if (pos > seg.keep) {
    const cutT = tOf(rk[seg.keep - 1]);
    return { key: 'out', cls: 'bad', text: `P${pos} – ${cutT ? `${fmt3(my - cutT)} s hinter der Grenze` : 'außerhalb'}. Wir müssen noch mal raus!`, radio: `Wir sind P${pos} und raus. Wir müssen noch mal fahren!` };
  }
  const below = tOf(rk[seg.keep]);   // erstes Auto unter dem Strich
  if (!below) {
    const timed = rk.filter(tOf).length;
    return { key: 'early', cls: '', text: `P${pos} – erst ${timed} Autos haben eine Zeit. Genaue Einschätzung folgt, sobald mehr Zeiten stehen.`, radio: '' };
  }
  const margin = below - my;
  if (race.segFlag) return { key: 'flag', cls: '', text: `P${pos} – Zielflagge, jetzt entscheiden die letzten Runden der anderen.`, radio: '' };
  if (margin - improve > 0.35) return { key: 'safe', cls: 'good', text: `P${pos}, ${fmt3(margin)} s Polster – das reicht sicher. Wir können in der Box bleiben.`, radio: `P${pos}, das reicht sicher. Wir bleiben drin und sparen Reifen.` };
  if (margin - improve > 0) return { key: 'tight', cls: 'warn', text: `P${pos}, nur ${fmt3(margin)} s Polster – die Strecke wird schneller (${still} Autos fahren noch). Ein weiterer Run wäre sicherer.`, radio: `P${pos}, das wird knapp. Wir überlegen, noch mal rauszufahren.` };
  return { key: 'risky', cls: 'bad', text: `P${pos}, aber nur ${fmt3(margin)} s vor dem Strich – das reicht wahrscheinlich nicht. Noch mal raus!`, radio: `P${pos}, das reicht wahrscheinlich nicht. Wir müssen noch mal raus!` };
}

function sessStatus(car) {
  if (car.retired) return `AUSFALL – ${car.dnf || 'Defekt/Unfall'}`;
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
      <div class="pw-qa hidden" data-f="qa"></div>
      <div class="pw-row"><span class="pw-tyre" data-f="tyre"></span><span class="pw-life"><b data-f="life"></b></span><span class="pw-meta" data-f="meta"></span></div>
      <div class="pw-label">AUSFAHRT</div>
      <div class="pw-cmp" data-f="cmp">${['S', 'M', 'H', 'I', 'W'].map(k => `<button class="${k}" data-rc="${k}">${k}<small></small></button>`).join('')}</div>
      <div class="pw-label">REIFENSATZ WÄHLEN</div>
      <div class="pw-sets" data-f="sets"></div>
      <div class="pw-seg ers"><button data-auto="1">AUTO-PROGRAMM</button></div>
      <div class="pw-label">SCHNELLE RUNDEN${fp ? ' · SPRIT' : ''}</div>
      <div class="pw-seg">${RUN_PUSH[race.kind].map(n => `<button data-push="${n}">${n}</button>`).join('')}</div>
      ${!fp && mate(c) ? `<div class="pw-label">AUFWÄRMRUNDE</div><div class="pw-seg ers"><button data-gap="1">FREIE FAHRT</button><button data-tow="1">WINDSCHATTEN FÜR ${mate(c).id}<small>~${fmt(race.towGain, 2)} s</small></button></div>` : ''}
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
    tab.querySelector('span').innerHTML = car.retired ? 'AUSFALL' : `P${i + 1} · ${car.inGarage ? 'Garage' : `<i class="pw-tyre ${car.compound}">${car.compound}</i> ${tyreLaps(car)} Rd ${tabSecs(car)}`}`;
    // Renningenieur im Qualifying: reicht die Zeit für den nächsten Abschnitt?
    const qa = qualiAssess(car);
    const qel = f('qa');
    qel.classList.toggle('hidden', !qa);
    if (qa) {
      qel.className = `pw-qa ${qa.cls}`;
      qel.innerHTML = `🎧 <b>Renningenieur:</b> ${qa.text}`;
      const key = `${race.segIdx}|${qa.key}`;
      if (ui.qa[car.id] !== key) {
        if (qa.radio) {
          race.emit('radio', `Teamfunk ${car.team.name} an ${car.id}: „${qa.radio}“`, { cars: [car.id], own: true });
          if (qa.key === 'out' || qa.key === 'risky') { sound.radio(); toast(`🎧 ${car.id}: ${qa.radio}`, 3500); }
        }
        ui.qa[car.id] = key;
      }
    }
    el.classList.toggle('out', car.retired);
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
    const chosen = runSet(car);
    const ssig = `${chosen ? chosen.id : 0}|${wk.sets[car.id].map(x => Math.round(x.laps)).join(',')}|${car.inGarage}`;
    if (f('sets').dataset.sig !== ssig) { f('sets').dataset.sig = ssig; f('sets').innerHTML = setChips(car, chosen ? chosen.id : 0); }
    el.querySelector('[data-auto]').classList.toggle('on', Boolean(car.autoRuns));
    for (const b of el.querySelectorAll('[data-push]')) b.classList.toggle('on', Number(b.dataset.push) === cfg.push);
    for (const b of el.querySelectorAll('[data-fuel]')) b.classList.toggle('on', cfg.fuel === b.dataset.fuel);
    for (const b of el.querySelectorAll('[data-gap]')) { b.classList.toggle('on', car.inGarage ? Boolean(cfg.gap) : Boolean(car.wantGap)); b.disabled = !car.inGarage; }
    for (const b of el.querySelectorAll('[data-tow]')) { b.classList.toggle('on', Boolean(car.towGive)); b.disabled = car.retired || (car.elimSeg !== null && car.elimSeg !== undefined); }
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
      const undo = car.prog.phase === 'cool' && car.boxInPrev && !car.inPit && !race.segFlag;
      go.textContent = undo ? 'REINHOLEN ABBRECHEN' : car.prog.phase === 'cool' ? 'KOMMT REIN' : 'REINHOLEN';
      go.disabled = car.prog.phase === 'cool' && !undo;
      go.className = `pw-boxbtn pw-go ${undo ? 'undo' : 'called'}`;
    }
    // Hinweis
    let hint = '';
    if (out) hint = 'Für diesen Teil ist der Fahrer ausgeschieden.';
    else if (race.segState === 'break') hint = 'Pause – gleich geht es weiter.';
    else if (race.segFlag) hint = 'Zielflagge – nur bereits begonnene Runden zählen noch.';
    else if (car.towGive && towHint(car)) hint = towHint(car);
    else if (car.inGarage && race.remaining < race.outLapEstimate()) hint = 'Zu spät – die schnelle Runde würde nicht mehr vor der Zielflagge beginnen.';
    else if (car.inGarage && !fp) {
      // Renningenieur: Dauer der Out-Lap und spätester Zeitpunkt zum Rausfahren
      const ol = race.outLapEstimate(), latest = ol + 8, left = race.remaining - latest;
      hint = left <= 0 ? `🎧 Jetzt sofort raus! Out-Lap ca. ${mmss(ol)} – es wird sehr knapp.`
        : `🎧 Out-Lap ca. ${mmss(ol)} · spätestens bei ${mmss(latest)} Restzeit rausfahren (noch ${mmss(left)}).`;
      if (left > 0 && left < 30 && (ui.olWarn ||= {})[car.id] !== race.segIdx && !(car.prog.runs[car.prog.runIdx])) {
        ui.olWarn[car.id] = race.segIdx;
        const txt = `In ${Math.ceil(left)} Sekunden müssen wir spätestens raus, sonst schaffen wir keine Runde mehr.`;
        race.emit('radio', `Teamfunk ${car.team.name} an ${car.id}: „${txt}“`, { cars: [car.id], own: true });
        sound.radio(); toast(`🎧 ${car.id}: ${txt}`, 3500);
      }
    }
    else if (car.inGarage && fp) hint = 'Mehrere Runden mit viel Sprit zeigen das Renntempo, wenig Sprit die Quali-Pace. Nach jeder Ausfahrt gibt der Fahrer Rückmeldung.';
    f('hint').textContent = hint;
    // Runden
    const laps = car.sLaps.slice(-6).reverse();
    f('laps').innerHTML = laps.length ? laps.map(l => `<span class="${l.valid ? '' : 'del'}">${race.info.segments.length > 1 ? `${race.info.segments[l.seg].id} ` : ''}${l.label}${l.traffic ? ' <i>Verkehr</i>' : ''}${l.valid ? '' : ' <i>gestrichen</i>'}</span>`).join('') : '<span>–</span>';
    // Setup (nur Training)
    if (fp) {
      const lock = wk.setupLocked ? 'Parc fermé' : car.inGarage ? '' : '· nur in der Garage änderbar';
      // Ingenieure (Saison): Einschätzung der Setup-Qualität, genauer mit besseren Ingenieuren
      const est = wk.season && season ? engineerEstimate(season, setupScore(race.track, wk.setup[car.id]), `${wk.seed}${JSON.stringify(wk.setup[car.id])}`) : null;
      f('lock').textContent = `${lock}${est !== null ? ` · Ingenieure: Setup ~${est} %` : ''}`;
      for (const [k] of Object.entries(SETUP_KEYS)) el.querySelector(`[data-sv="${k}"]`).textContent = wk.setup[car.id][k];
      for (const b of el.querySelectorAll('[data-set]')) b.disabled = wk.setupLocked || !car.inGarage;
      el.querySelector('.pw-setup').classList.toggle('locked', wk.setupLocked || !car.inGarage);
      const notes = wk.notes[car.id].slice(-4).reverse();
      const nsig = String(wk.notes[car.id].length);
      if (f('notes').dataset.sig !== nsig) {
        f('notes').dataset.sig = nsig;
        f('notes').innerHTML = notes.length ? notes.map(n => `<div>„${esc(n.text)}“<small>Flügel ${n.setup.wing} · Balance ${n.setup.bal} · Federung ${n.setup.stiff} · ${n.n ? `${n.n} Rd, beste ${formatLap(n.best)}` : 'keine gezeitete Runde'}</small></div>`).join('') : '<div>Noch keine Ausfahrt.</div>';
      }
    }
    // Ausgefallen: nichts mehr einstellbar
    if (car.retired) {
      for (const b of el.querySelectorAll('button')) b.disabled = true;
      f('status').className = 'pw-status bad';
      f('traffic').textContent = '';
      f('hint').textContent = 'Das Auto ist ausgefallen und kann in dieser Session nicht mehr fahren.';
    }
    // Kontingent
    f('alloc').innerHTML = Object.entries(sum).map(([k, v]) => `<span><i class="pw-tyre ${k}">${k}</i> ${v.fresh} neu${v.used.length ? ` · ${v.used.length} gebr.` : ''}</span>`).join('') + (wk.returned[car.id] ? `<span>${wk.returned[car.id]} Sätze nach dem Training zurückgegeben</span>` : '');
  }
}

function sessionClick(e, b) {
  const el = e.target.closest('[data-car]');
  if (!el) return;
  const car = race.carById[el.dataset.car];
  const cfg = runCfg(car);
  if (b.dataset.rc) { cfg.c = b.dataset.rc; cfg.setId = null; }
  else if (b.dataset.setid) { const st = wk.sets[car.id].find(x => x.id === Number(b.dataset.setid)); if (st) { cfg.c = st.c; cfg.setId = st.id; } }
  else if (b.dataset.push) cfg.push = Number(b.dataset.push);
  else if (b.dataset.fuel) cfg.fuel = b.dataset.fuel;
  else if (b.dataset.auto) race.setAutoRuns(car, !car.autoRuns);
  else if (b.dataset.gap) cfg.gap = !cfg.gap;
  else if (b.dataset.tow) {
    car.towGive = !car.towGive;
    if (car.towGive) race.emit('radio', `Teamfunk ${car.team.name} an ${car.id}: „Auf der ${car.inGarage || car.prog.phase === 'out' ? 'Aufwärmrunde' : 'Auslaufrunde'} gibst du ${mate(car).id} Windschatten.“`, { cars: [car.id], own: true });
  }
  else if (b.dataset.set) {
    const k = b.dataset.set, d = SETUP_KEYS[k];
    wk.setup[car.id][k] = Math.max(d.min, Math.min(d.max, wk.setup[car.id][k] + Number(b.dataset.d)));
    applyWeekend(race, wk);
  } else if (b.dataset.act === 'go') {
    if (car.inGarage) {
      const fuel = cfg.fuel === 'high' ? 0.7 : race.kind === 'fp' ? 0.15 : 0.05;
      const ok = race.playerRun(car, { compound: cfg.c, push: cfg.push, fuel, set: runSet(car), gap: Boolean(cfg.gap) && race.kind !== 'fp' });
      if (ok) race.emit('radio', `Teamfunk ${car.team.name} an ${car.id}: „Raus geht’s – ${cfg.push} schnelle Runde${cfg.push > 1 ? 'n' : ''} auf ${COMPOUNDS[cfg.c].name}${car.towGive ? `, auf der Aufwärmrunde Windschatten für ${mate(car).id}` : cfg.gap ? ', mach dir auf der Aufwärmrunde Platz nach vorne' : ''}.“`, { cars: [car.id], own: true });
    } else if (car.prog.phase === 'cool' && car.boxInPrev) {
      if (race.playerCancelBoxIn(car)) race.emit('radio', `Teamfunk ${car.team.name} an ${car.id}: „Sorry, bleib draußen – weiter wie geplant.“`, { cars: [car.id], own: true });
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
  $('resultScreen').classList.add('hidden');
  $('stratScreen').classList.remove('hidden');
  $('stratScreen').scrollTop = 0;
}
function renderStrategy() {
  const cars = playerCars(race);
  const who = wk.strategist || STRATEGISTS[cars[0].team.id];
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
  $('newRaceBtn').textContent = nk ? `Weiter: ${SESSION_NAME[nk]}` : wk.season ? 'Weiter' : 'Zur Startseite';
  $('endWkBtn').classList.toggle('hidden', !nk);
  if (race.isSession) { showSessionResults(); return; }
  const st = race.standings();
  const leader = st[0];
  const mine = playerCars(race);
  let teamPts = 0;
  const rows = st.map((c, i) => {
    const table = race.kind === 'sprint' ? SPRINT_PTS : POINTS;
    const pts = !c.retired && !c.dsq ? table[i] || 0 : 0;
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
    ${mine.map(c => `<div class="pw-hist"><b>${c.id}</b> ${histHtml(c)}</div>`).join('')}
    <button class="secondary-btn pw-stratbtn" id="openStrat">📊 Strategien aller Fahrer</button>
    ${protestCases(race).length ? `<button class="secondary-btn pw-stratbtn" id="openProtest">⚖️ Entscheidungen der Rennleitung (${protestCases(race).length})</button>` : ''}
    <div class="pw-label" style="margin-top:14px">PRESSESTIMMEN</div>
    ${pressQuotes(race, teamsNow()).map(p => `<div class="pw-press"><b>${esc(p.outlet)}</b>„${esc(p.text)}“</div>`).join('')}`;
  $('resultTitle').textContent = `🏁 ${race.kind === 'sprint' ? 'Sprint' : 'Rennen'} · ${race.track.def.grandPrix.replace('Großer Preis ', 'GP ')}`;
  $('resultScreen').classList.remove('hidden');
  $('openStrat').onclick = () => {
    $('stratViewBody').innerHTML = strategyChart(race);
    $('stratView').classList.remove('hidden');
  };
  if ($('openProtest')) $('openProtest').onclick = () => { protestUi = { caseId: null }; renderProtest(); $('protestView').classList.remove('hidden'); };
}

// ---------- Proteste nach dem Rennen ----------
let protestUi = { caseId: null }, protestPlayer = null;
const verdictText = c => {
  const v = c.verdict;
  if (!v) return 'noch offen';
  if (c.status === 'nfa') return 'keine weitere Untersuchung';
  return `${v.carId ? `${PENALTIES[v.penalty].name} für ${v.carId}${v.points ? ` (${v.points} Strafpkt.)` : ''}` : 'keine Strafe'}${v.revoked ? ' – aufgehoben' : ''}`;
};
function renderProtest() {
  if (protestPlayer) { protestPlayer.destroy(); protestPlayer = null; }
  const body = $('protestBody');
  const list = protestCases(race);
  const left = protestsLeft(race);
  if (protestUi.caseId === null) {
    body.innerHTML = `<div class="pw-hint">Entscheidungen, an denen deine Fahrer beteiligt waren. Du kannst ${MAX_PROTESTS} Mal pro Rennen Einspruch oder Protest einlegen (noch ${left}).</div>`
      + list.map(({ c, kind, done }) => `<div class="pw-mcard"><b>DOC ${c.id} · ${esc(c.title)}</b><small>Runde ${c.lap} · ${esc(c.typeName)} · Urteil: <b>${esc(verdictText(c))}</b></small>
        ${done ? `<div class="pw-qa ${done.verdict && done.verdict.penalty === 'keep' ? 'bad' : 'good'}">${esc(done.result || '')}</div>`
          : kind === 'pending' ? '<small>Die Kommissare entscheiden noch …</small>'
            : kind ? `<div class="pw-hqbtns"><button class="go" data-pcase="${c.id}" ${left > 0 ? '' : 'disabled'}>${kind === 'appeal' ? 'Einspruch einlegen' : 'Protest einlegen'}</button></div>` : '<small>Kein Einspruch nötig – keine Strafe gegen dein Team, kein Gegner beteiligt.</small>'}
      </div>`).join('');
    return;
  }
  const c = race.cases.find(x => x.id === protestUi.caseId);
  const kind = protestKind(race, c);
  const args = protestArgs(race, c, kind);
  const sel = protestUi.sel || (protestUi.sel = []);
  body.innerHTML = `<div class="pw-mcard"><b>DOC ${c.id} · ${esc(c.title)}</b><small>${esc(c.summary || '')}</small><small>Urteil: <b>${esc(verdictText(c))}</b></small></div>
    ${c.scene ? '<div class="pw-label">SZENE</div><div id="protestScene"></div>' : ''}
    ${(c.evidence || []).length ? `<div class="pw-label">BEWEISE</div>${c.evidence.map(e => `<div class="pw-ev"><b>${esc(e.label)}</b> ${esc(e.text)}</div>`).join('')}` : ''}
    <div class="pw-label">${kind === 'appeal' ? 'EINSPRUCH' : 'PROTEST'} – WÄHLE BIS ZU 2 ARGUMENTE</div>
    <div class="pw-args">${args.map(a => `<button data-parg="${a.key}" class="${sel.includes(a.key) ? 'on' : ''}">${esc(a.text)}</button>`).join('')}</div>
    <div class="pw-hint">Die Kommissare entscheiden nach den Fakten. Passende Argumente helfen, unpassende schaden.</div>
    <div class="sheet-actions"><button class="secondary-btn" data-pback="1">Zurück</button><button class="primary-btn" data-psend="1" ${sel.length ? '' : 'disabled'}>Bei der Rennleitung einreichen</button></div>`;
  if (c.scene) protestPlayer = new ScenePlayer($('protestScene'), { track: race.track, scene: c.scene, sharp: true });
}
$('protestBody').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.pcase) { protestUi = { caseId: Number(b.dataset.pcase), sel: [] }; renderProtest(); $('protestBody').closest('.sheet').scrollTop = 0; }
  else if (b.dataset.pback) { protestUi = { caseId: null }; renderProtest(); }
  else if (b.dataset.parg) {
    const sel = protestUi.sel, k = b.dataset.parg;
    if (sel.includes(k)) sel.splice(sel.indexOf(k), 1); else { sel.push(k); if (sel.length > 2) sel.shift(); }
    renderProtest();
  } else if (b.dataset.psend) {
    const c = race.cases.find(x => x.id === protestUi.caseId);
    const res = fileProtest(race, c, protestKind(race, c), protestUi.sel);
    const pc = race.cases.find(x => x.byPlayer && x.base === c.id);
    if (pc) pc.result = res.text;
    protestUi = { caseId: null };
    toast(res.ok ? '⚖️ Protest erfolgreich!' : '⚖️ Abgelehnt', 2500);
    renderProtest();
    showResults();
    autosave();
  }
});
$('protestClose').addEventListener('click', () => { if (protestPlayer) { protestPlayer.destroy(); protestPlayer = null; } $('protestView').classList.add('hidden'); });
// Debriefing nach dem Training: alle Rückmeldungen der Fahrer je Stint, Setup fürs Qualifying anpassen
function debriefHtml() {
  return `<div class="pw-label">🔧 DEBRIEFING – SETUP FÜR QUALIFYING UND RENNEN</div>` + playerCars(race).map(c => {
    const notes = wk.notes[c.id] || [];
    const est = wk.season && season ? engineerEstimate(season, setupScore(race.track, wk.setup[c.id]), `${wk.seed}${JSON.stringify(wk.setup[c.id])}`) : null;
    return `<div class="pw-mcard pw-debrief" data-dcar="${c.id}"><b>${esc(c.driver.first)} ${esc(c.driver.last)}</b>${est !== null ? `<small>Ingenieure: Setup ~${est} %</small>` : ''}
      <div class="pw-notes">${notes.length ? notes.map((n, i) => `<div><i>Stint ${i + 1}</i> „${esc(n.text)}“<small>Flügel ${n.setup.wing} · Balance ${n.setup.bal} · Federung ${n.setup.stiff} · ${n.n ? `${n.n} Rd, beste ${formatLap(n.best)}` : 'keine gezeitete Runde'}</small></div>`).join('') : '<div>Keine Ausfahrt – keine Rückmeldung.</div>'}</div>
      <div class="pw-setup">${Object.entries(SETUP_KEYS).map(([k, d]) => `<div class="pw-srow"><span>${d.name}</span><button data-dset="${k}" data-d="-1">−</button><b>${wk.setup[c.id][k]}</b><button data-dset="${k}" data-d="1">+</button><small>${d.lo} ↔ ${d.hi}</small></div>`).join('')}</div>
    </div>`;
  }).join('') + '<div class="pw-hint">Ab dem Qualifying gilt Parc fermé – danach lässt sich das Setup nicht mehr ändern.</div>';
}
$('resultBody').addEventListener('click', e => {
  const b = e.target.closest('[data-dset]');
  if (!b || !race || race.kind !== 'fp' || wk.setupLocked) return;
  const car = b.closest('[data-dcar]').dataset.dcar, k = b.dataset.dset, d = SETUP_KEYS[k];
  wk.setup[car][k] = Math.max(d.min, Math.min(d.max, wk.setup[car][k] + Number(b.dataset.d)));
  const y = $('resultBody').closest('.sheet').scrollTop;
  showSessionResults();
  $('resultBody').closest('.sheet').scrollTop = y;
  autosave();
});
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
  // Training: noch nicht ausgewertete letzte Ausfahrt nachholen (Session endete, bevor das Auto in der Garage war)
  if (race.kind === 'fp') for (const c of mine) if ((c.runLaps && c.runLaps.length) || c.redAbort) onGarage(c);
  $('resultBody').innerHTML = `${race.kind === 'fp' ? debriefHtml() : ''}<div class="pw-sum"><b>${esc(TEAM_BY_ID[race.playerTeam].name)}</b>: ${mine.map(c => `${c.id} P${st.indexOf(c) + 1}`).join(' · ')}${race.kind !== 'fp' ? ' – das ist die Startaufstellung.' : ''}</div>
    <table class="pw-res"><tbody>${rows}</tbody></table>`;
  $('resultScreen').classList.remove('hidden');
}
$('newRaceBtn').addEventListener('click', () => {
  // Nur einmal pro beendeter Session (Doppeltipp / Fenster im Hintergrund)
  if (!race || race.phase !== 'finished' || race.wkDone) return;
  race.wkDone = true;
  $('resultScreen').classList.add('hidden');
  // Saison: Schäden aller Sessions sammeln, Stimmung der Fahrer nach dem Rennen merken
  if (wk.season) {
    const u = damageFrom(race);
    wk.used = { wing: (wk.used ? wk.used.wing : 0) + u.wing, chassis: (wk.used ? wk.used.chassis : 0) + u.chassis };
    if (currentKind(wk) === 'race') wk.moods = Object.fromEntries(playerCars(race).map(c => [c.id, Math.round(c.mood ?? 70)]));
  }
  finishSession(wk, race);
  if (wk.idx >= wk.seq.length) {
    // Wochenende vorbei: in der Saison Punkte übernehmen, Spielstand löschen
    savedGame = null;
    clearGame();
    if (wk.season && season) {
      const before = teamStandings(season, TEAMS).findIndex(x => x.t.id === season.teamId) + 1;
      const pts0 = season.teamPts[season.teamId] || 0;
      recordWeekend(season, wk, DRIVERS);
      if (!season.mgmt) initManagement(season, TEAMS, DRIVERS);
      const last = season.results[season.results.length - 1];
      const moneyBefore = season.mgmt.money;
      const notes = afterWeekend(season, TEAMS, DRIVERS, last, wk.used || {}, wk.moods || {});
      const after = teamStandings(season, TEAMS).findIndex(x => x.t.id === season.teamId) + 1;
      notes.push(...careerAfterWeekend(season, TEAMS, season.mgmt.report.r.pts, expectedPoints(season.mgmt.board.target)));
      if (seasonOver(season)) {
        notes.push(...seasonEnd(season, after));
        const final = teamStandings(season, TEAMS).findIndex(x => x.t.id === season.teamId) + 1;
        notes.push(...careerSeasonEnd(season, TEAMS, final));
      }
      saveSeason(season);
      newRace();
      hqTab = 'report';
      showBookings(moneyBefore, season.mgmt.report.log, season.mgmt.money);
      pendingHQ = [`<b>${esc(TEAM_BY_ID[season.teamId].name)}</b>: +${(season.teamPts[season.teamId] || 0) - pts0} Punkte · Teamwertung P${after}${after < before ? ' ▲' : after > before ? ' ▼' : ''}`,
        seasonOver(season) ? '<b>Die Saison ist beendet!</b>' : `Nächstes Rennen: <b>${esc(TRACKS[currentEntry(season).track].grandPrix.replace('Großer Preis ', 'GP '))}</b>`, ...notes];
      return;
    }
    newRace();
    return;
  }
  prepareSession();
  autosave();
  startRace();
});
$('endWkBtn').addEventListener('click', () => {
  if (wk.season) { toast('In der Saison wird jedes Wochenende zu Ende gefahren.'); return; }
  savedGame = null;
  clearGame();
  newRace();
});

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
  // Finger an den Knopf binden: pointerup kommt sicher an, auch wenn der Browser die Geste übernehmen will
  try { $('speedBtn').setPointerCapture(e.pointerId); } catch { /* egal */ }
  if (spd.open && $('speedMenu').classList.contains('hidden')) spd.open = false;   // Zustand reparieren
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
$('speedBtn').addEventListener('pointercancel', () => { if (spd.timer) { clearTimeout(spd.timer); spd.timer = null; } });
$('pauseBtn').addEventListener('click', () => {
  if (!race || race.phase === 'pre') return;
  paused = !paused;
  acc = 0;
  renderSpeedBtns();
  if (paused) autosave();
});
$('startBtn').addEventListener('click', async () => {
  sound.unlock();
  // Saison: alles läuft über die Teamzentrale (Vorsaison, Rennen, Karriere)
  if (isSeason() && season) { showHQ(); return; }
  if (savedGame && savedGame.mode === 'season' && isSeason()) { /* Saison-Spielstand bleibt */ } else if (savedGame && !(await pwConfirm('Spielstand überschreiben?', 'Es gibt ein gespeichertes Wochenende. Neu beginnen?', 'Neu beginnen'))) return;
  if (isSeason() && !season) {
    season = newSeason(settings.teamId);
    initManagement(season, TEAMS, DRIVERS);
    saveSeason(season);
    newRace();
    hqTab = 'home';
    hqNotes = [];
    showHQ();
    return;
  }
  savedGame = null;
  clearGame();
  startRace();
});
$('menuBtn').addEventListener('click', () => { $('optionsScreen').classList.remove('hidden'); });
$('optCloseBtn').addEventListener('click', () => $('optionsScreen').classList.add('hidden'));
$('optHomeBtn').addEventListener('click', () => {
  $('optionsScreen').classList.add('hidden');
  autosave();
  const keep = savedGame;
  newRace();
  savedGame = keep;
  renderResume();
  toast('Gespeichert – auf der Startseite fortsetzen');
});
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
$('timing').addEventListener('click', e => {
  const row = e.target.closest('[data-id]');
  if (!row || !race) return;
  const id = row.dataset.id;
  if (map.selected === id) { map.stopFollow(); map.selected = null; }
  else map.startFollow(id);
  refreshUi();
});
map.onFollowEnd = () => refreshUi();
// „Gesamt“: Verfolgen beenden und ganze Strecke zeigen
$('zoomResetBtn').addEventListener('click', () => { if (map.follow) map.stopFollow(); else map.resetView(); map.selected = null; });
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
  // Beim Wechsel in ein anderes Fenster läuft das Spiel weiter (nur speichern)
  if (document.visibilityState === 'hidden' && race && race.phase !== 'pre') autosave();
});
function vibrate(pattern) {
  if (settings.vibrate === false || !navigator.vibrate) return;
  try { navigator.vibrate(pattern); } catch { /* nicht unterstützt */ }
}

// Installierte App: auf der Startseite nach unten ziehen = neu laden (für Updates)
(() => {
  const scr = $('startScreen'), ind = $('ptr');
  let y0 = null, dy = 0, x0 = 0;
  const atTop = () => scr.scrollTop <= 0 && [...scr.querySelectorAll('.sheet')].every(el => el.scrollTop <= 0);
  scr.addEventListener('touchstart', e => {
    const t = e.touches[0];
    const ok = !scr.classList.contains('hidden') && atTop() && t.clientY < window.innerHeight / 4 && !e.target.closest('.gp-list');
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
loadGame().then(d => { if (d && d.v === 1) { savedGame = d; renderResume(); } }).catch(() => {});
bootStep(92, 'Startseite wird gezeichnet …');
requestAnimationFrame(frame);
bootDone();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(r => r.update()).catch(() => {});
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    // Nur auf der Startseite neu laden – nie während Intro, Strategiewahl oder einer Session
    const onStart = !$('startScreen').classList.contains('hidden') && $('introScreen').classList.contains('hidden');
    if ((!race || race.phase === 'pre') && onStart) { reloaded = true; location.reload(); }
  });
}
