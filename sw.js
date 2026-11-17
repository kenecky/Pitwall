// Service Worker: macht Pit Wall offline spielbar.
// Strategie "Netzwerk zuerst": neue Versionen kommen sofort an,
// ohne Netz wird die zuletzt geladene Version aus dem Cache genutzt.
// WICHTIG: Andere Apps auf kenecky.github.io (Race Control, Urlaubsausgaben-Tracker) teilen sich
// den Cache-Speicher mit uns. Deshalb nur eigene Caches (Präfix 'pw-') anlegen und löschen.
// Streckenumgebungen (js/data/scenery/) werden beim ersten Intro nachgeladen und dann gecacht.
const PREFIX = 'pw-';
const CACHE = PREFIX + 'v24';
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'css/pitwall.css',
  'js/control/autoDirector.js',
  'js/control/flags.js',
  'js/control/rating.js',
  'js/control/stewards.js',
  'js/data/drivers.js',
  'js/data/season2026.js',
  'js/data/teams.js',
  'js/data/tracks/albertpark.js',
  'js/data/tracks/bahrain.js',
  'js/data/tracks/baku.js',
  'js/data/tracks/barcelona.js',
  'js/data/tracks/cota.js',
  'js/data/tracks/hungaroring.js',
  'js/data/tracks/index.js',
  'js/data/tracks/interlagos.js',
  'js/data/tracks/jeddah.js',
  'js/data/tracks/lasvegas.js',
  'js/data/tracks/lusail.js',
  'js/data/tracks/madring.js',
  'js/data/tracks/mexico.js',
  'js/data/tracks/miami.js',
  'js/data/tracks/monaco.js',
  'js/data/tracks/montreal.js',
  'js/data/tracks/monza.js',
  'js/data/tracks/redbullring.js',
  'js/data/tracks/shanghai.js',
  'js/data/tracks/silverstone.js',
  'js/data/tracks/singapore.js',
  'js/data/tracks/spa.js',
  'js/data/tracks/suzuka.js',
  'js/data/tracks/yasmarina.js',
  'js/data/tracks/zandvoort.js',
  'js/main.js',
  'js/season/season.js',
  'js/sim/cases2.js',
  'js/sim/energy.js',
  'js/sim/events.js',
  'js/sim/hazards.js',
  'js/sim/incidents.js',
  'js/sim/length.js',
  'js/sim/messages.js',
  'js/sim/neutral.js',
  'js/sim/persist.js',
  'js/sim/race.js',
  'js/sim/regs.js',
  'js/sim/scenes.js',
  'js/sim/scrutiny.js',
  'js/sim/services.js',
  'js/sim/session.js',
  'js/sim/start.js',
  'js/sim/texts.js',
  'js/sim/trackModel.js',
  'js/sim/tyres.js',
  'js/sim/voices.js',
  'js/sim/weather.js',
  'js/sim/weatherEvents.js',
  'js/storage.js',
  'js/team/pitwall.js',
  'js/team/radio.js',
  'js/team/setup.js',
  'js/team/weekend.js',
  'js/team/season.js',
  'js/team/management.js',
  'js/team/career.js',
  'js/team/press.js',
  'js/team/raceData.js',
  'js/ui/raceTable.js',
  'js/ui/feed.js',
  'js/ui/intro.js',
  'js/ui/introMusic.js',
  'js/ui/map.js',
  'js/ui/scenePlayer.js',
  'js/ui/sound.js',
  'js/ui/timing.js',
  'js/ui/tower.js',
  'js/ui/trackArt.js',
  'js/ui/weatherPanel.js',
  'js/util/rng.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'fonts/JetBrainsMono-Regular.ttf',
  'fonts/JetBrainsMono-Bold.ttf',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith(PREFIX) && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })   // immer beim Server nachfragen (GitHub cacht sonst bis zu 10 Min.)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.open(CACHE).then(c => c.match(e.request).then(r => r || c.match('index.html'))))
  );
});
