// Lokale Speicherung auf dem Gerät.
// WICHTIG: Auf kenecky.github.io laufen weitere Apps (Race Control, Urlaubsausgaben-Tracker).
// Alle Schlüssel dieses Spiels beginnen deshalb mit „pw-“ – nie fremde Schlüssel lesen oder löschen.
const KEY = 'pw-settings-v1';

const DEFAULTS = {
  speed: 4,
  teamId: 'ferrari',     // eigenes Team (Teamchef)
  trackId: 'redbullring',
  weatherMode: 'random', // random | dry | rain | changeable
  length: 'medium',      // short | medium | full
  sound: true,
  vibrate: true,
  showTower: true,
  gapMode: 'leader',
  mode: 'single',        // single | season
  parts: ['fp', 'quali'],
};

export function loadSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* Speicher nicht verfügbar */ }
}

// ---------- Saison (localStorage, eigener Schlüssel) ----------
const SEASON_KEY = 'pw-season-v1';
export function loadSeason() {
  try { const raw = localStorage.getItem(SEASON_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
export function saveSeason(season) {
  try { localStorage.setItem(SEASON_KEY, JSON.stringify(season)); } catch { /* Speicher voll/gesperrt */ }
}
export function clearSeason() {
  try { localStorage.removeItem(SEASON_KEY); } catch { /* egal */ }
}

// ---------- Spielstand (laufendes Wochenende) in IndexedDB „pw-db“, Fallback localStorage ----------
const DB_NAME = 'pw-db';
const STORE = 'saves';
const SAVE_KEY = 'current';
const LS_SAVE = 'pw-save-v1';

function openDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('kein IndexedDB')); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function idb(mode, fn) {
  return openDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); resolve(req && req.result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  }));
}
// Drei getrennte Spielstände: Einzelrennen ('single'), Saison ('season'), Mehrspieler ('mp')
export const SLOTS = ['single', 'season', 'mp'];
const lsKey = slot => `${LS_SAVE}-${slot}`;
export async function saveGame(data, slot) {
  try { await idb('readwrite', st => st.put(data, slot)); } catch {
    try { localStorage.setItem(lsKey(slot), JSON.stringify(data)); } catch { /* voll/gesperrt */ }
  }
}
export async function loadGame(slot) {
  try { const d = await idb('readonly', st => st.get(slot)); if (d) return d; } catch { /* Fallback */ }
  try { const raw = localStorage.getItem(lsKey(slot)); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
export async function clearGame(slot) {
  try { await idb('readwrite', st => st.delete(slot)); } catch { /* egal */ }
  try { localStorage.removeItem(lsKey(slot)); } catch { /* egal */ }
}
// Alter gemeinsamer Spielstand ('current') → in den passenden neuen Speicherplatz übernehmen.
// Der alte wird erst gelöscht, wenn der neue nachweislich geschrieben ist.
async function migrateOld() {
  let old = null, fromIdb = false;
  try { old = await idb('readonly', st => st.get(SAVE_KEY)); fromIdb = Boolean(old); } catch { /* egal */ }
  if (!old) { try { const raw = localStorage.getItem(LS_SAVE); old = raw ? JSON.parse(raw) : null; } catch { old = null; } }
  if (!old) return;
  const slot = old.mode === 'season' ? 'season' : 'single';
  if (!(await loadGame(slot))) await saveGame(old, slot);
  const check = await loadGame(slot);
  if (!check) return;   // nicht sicher übernommen – alten Stand behalten
  if (fromIdb) { try { await idb('readwrite', st => st.delete(SAVE_KEY)); } catch { /* egal */ } }
  try { localStorage.removeItem(LS_SAVE); } catch { /* egal */ }
}
export async function loadAllGames() {
  try { await migrateOld(); } catch { /* alter Stand bleibt liegen */ }
  const out = {};
  for (const slot of SLOTS) { try { out[slot] = await loadGame(slot); } catch { out[slot] = null; } }
  return out;
}

// ---------- Gespeicherte Setups (je Strecke und Fahrer: trocken/nass), saisonübergreifend ----------
const SETUP_LIB = 'pw-setups-v1';
export function loadSetupLib() {
  try { return JSON.parse(localStorage.getItem(SETUP_LIB) || '{}'); } catch { return {}; }
}
export function saveSetupLib(lib) {
  try { localStorage.setItem(SETUP_LIB, JSON.stringify(lib)); } catch { /* Speicher voll/gesperrt */ }
}
