// Pit Wall – Mehrspieler-Verbindung (Gastgeber ↔ Gast).
// Echte Verbindung: WebRTC über PeerJS (kostenloser öffentlicher Vermittlungsdienst 0.peerjs.com, ohne Anmeldung).
// Die Bibliothek wird erst geladen, wenn jemand Mehrspieler startet. Die Daten laufen direkt zwischen den Geräten
// (im selben WLAN). Test ohne Netz: URL mit ?mptest → BroadcastChannel zwischen zwei Tabs desselben Browsers.
const PEER_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
const ID_PREFIX = 'pitwall-mp-';

let peerLib = null;
function loadPeer() {
  if (peerLib) return peerLib;
  peerLib = new Promise((resolve, reject) => {
    if (window.Peer) { resolve(window.Peer); return; }
    const s = document.createElement('script');
    s.src = PEER_URL;
    s.onload = () => (window.Peer ? resolve(window.Peer) : reject(new Error('PeerJS nicht verfügbar')));
    s.onerror = () => { peerLib = null; reject(new Error('Verbindungsbibliothek konnte nicht geladen werden (Internet nötig).')); };
    document.head.appendChild(s);
  });
  return peerLib;
}

export function newRoomCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 5; i++) c += A[Math.floor(Math.random() * A.length)];
  return c;
}

// role: 'host' | 'guest' · Rückrufe: onMessage(obj), onOpen(), onClose(reason)
export async function connect({ role, code, onMessage, onOpen, onClose }) {
  const test = /[?&]mptest\b/.test(location.search);
  if (test) return broadcastNet({ role, code, onMessage, onOpen, onClose });
  const Peer = await loadPeer();
  return new Promise((resolve, reject) => {
    let conn = null, done = false;
    const net = {
      send(obj) { if (conn && conn.open) conn.send(obj); },
      close() { try { conn && conn.close(); } catch { /* egal */ } try { peer.destroy(); } catch { /* egal */ } },
      get open() { return Boolean(conn && conn.open); },
    };
    const wire = c => {
      conn = c;
      c.on('open', () => onOpen && onOpen());
      c.on('data', d => onMessage && onMessage(d));
      c.on('close', () => onClose && onClose('Verbindung getrennt.'));
      c.on('error', () => onClose && onClose('Verbindungsfehler.'));
    };
    const peer = role === 'host' ? new Peer(ID_PREFIX + code) : new Peer();
    peer.on('open', () => {
      if (!done) { done = true; resolve(net); }
      if (role === 'guest') wire(peer.connect(ID_PREFIX + code, { reliable: true }));
    });
    peer.on('connection', c => {
      if (role !== 'host') return;
      if (conn && conn.open) { c.on('open', () => { c.send({ type: 'full' }); setTimeout(() => c.close(), 500); }); return; }
      wire(c);
    });
    peer.on('error', e => {
      const msg = e && e.type === 'peer-unavailable' ? 'Kein Spiel mit diesem Code gefunden.'
        : e && e.type === 'unavailable-id' ? 'Dieser Code ist gerade belegt – bitte neu erstellen.'
          : 'Verbindungsfehler (' + (e && e.type ? e.type : 'unbekannt') + ').';
      if (!done) { done = true; reject(new Error(msg)); } else if (onClose) onClose(msg);
    });
  });
}

// Testverbindung zwischen zwei Tabs (gleicher Browser)
function broadcastNet({ role, code, onMessage, onOpen, onClose }) {
  const ch = new BroadcastChannel('pw-mp-' + code);
  let open = false;
  const other = role === 'host' ? 'guest' : 'host';
  ch.onmessage = e => {
    const m = e.data;
    if (!m || m.to !== role) return;
    if (m.hello) { if (!open) { open = true; ch.postMessage({ to: other, hello: true }); onOpen && onOpen(); } return; }
    if (m.bye) { onClose && onClose('Verbindung getrennt.'); return; }
    onMessage && onMessage(m.d);
  };
  if (role === 'guest') ch.postMessage({ to: 'host', hello: true });
  return Promise.resolve({
    send(obj) { ch.postMessage({ to: other, d: obj }); },
    close() { ch.postMessage({ to: other, bye: true }); ch.close(); },
    get open() { return open; },
  });
}
