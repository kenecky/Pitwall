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
