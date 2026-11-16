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
export async function saveGame(data) {
  try { await idb('readwrite', st => st.put(data, SAVE_KEY)); } catch {
    try { localStorage.setItem(LS_SAVE, JSON.stringify(data)); } catch { /* voll/gesperrt */ }
  }
}
export async function loadGame() {
  try { const d = await idb('readonly', st => st.get(SAVE_KEY)); if (d) return d; } catch { /* Fallback */ }
  try { const raw = localStorage.getItem(LS_SAVE); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
export async function clearGame() {
  try { await idb('readwrite', st => st.delete(SAVE_KEY)); } catch { /* egal */ }
  try { localStorage.removeItem(LS_SAVE); } catch { /* egal */ }
}
