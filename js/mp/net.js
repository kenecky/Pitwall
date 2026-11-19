// Pit Wall – Mehrspieler-Verbindung (Gastgeber ↔ Gast).
// Echte Verbindung: WebRTC über PeerJS (kostenloser öffentlicher Vermittlungsdienst 0.peerjs.com, ohne Anmeldung).
// Die Bibliothek wird erst geladen, wenn jemand Mehrspieler startet. Die Daten laufen direkt zwischen den Geräten
// (im selben WLAN). Test ohne Netz: URL mit ?mptest → BroadcastChannel zwischen zwei Tabs desselben Browsers.
// Nachrichten werden selbst als JSON-Text verschickt und in kleine Stücke geteilt (Safari erlaubt nur ~64 KB je
// Nachricht, der Spielstand ist größer).
const PEER_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
const ID_PREFIX = 'pitwall-mp-';
const CHUNK = 12000;   // Zeichen je Stück

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

// Text-Protokoll: „S<json>“ = ganze Nachricht, „C<id>:<i>:<n>:<teil>“ = Stück i von n
function packer(rawSend) {
  let seq = 0;
  return obj => {
    const s = JSON.stringify(obj, (k, v) => (v === Infinity ? '__INF__' : v === -Infinity ? '__NINF__' : v));   // Infinity bleibt erhalten
    if (s.length <= CHUNK) { rawSend('S' + s); return; }
    const id = (++seq).toString(36), n = Math.ceil(s.length / CHUNK);
    for (let i = 0; i < n; i++) rawSend(`C${id}:${i}:${n}:${s.slice(i * CHUNK, (i + 1) * CHUNK)}`);
  };
}
function unpacker(onMessage) {
  const parts = new Map();
  return data => {
    if (typeof data !== 'string') return;
    let json = null;
    if (data[0] === 'S') json = data.slice(1);
    else if (data[0] === 'C') {
      const a = data.indexOf(':'), b = data.indexOf(':', a + 1), c = data.indexOf(':', b + 1);
      const id = data.slice(1, a), i = Number(data.slice(a + 1, b)), n = Number(data.slice(b + 1, c));
      let p = parts.get(id);
      if (!p) { p = { n, got: 0, list: new Array(n) }; parts.set(id, p); }
      if (p.list[i] === undefined) { p.list[i] = data.slice(c + 1); p.got++; }
      if (p.got < p.n) return;
      parts.delete(id);
      json = p.list.join('');
      // alte, nie vollständig gewordene Nachrichten verwerfen
      if (parts.size > 20) parts.clear();
    }
    if (json === null) return;
    let obj;
    try { obj = JSON.parse(json, (k, v) => (v === '__INF__' ? Infinity : v === '__NINF__' ? -Infinity : v)); } catch { return; }
    try { onMessage && onMessage(obj); } catch (err) { console.error(err); }
  };
}

// role: 'host' | 'guest' · Rückrufe: onMessage(obj), onOpen(), onClose(reason)
export async function connect({ role, code, onMessage, onOpen, onClose }) {
  const test = /[?&]mptest\b/.test(location.search);
  if (test) return broadcastNet({ role, code, onMessage, onOpen, onClose });
  const Peer = await loadPeer();
  return new Promise((resolve, reject) => {
    let conn = null, done = false, send = () => {};
    const net = {
      send(obj) { if (conn && conn.open) { try { send(obj); } catch (err) { console.error(err); } } },
      // Datenkanal überlastet? Dann den nächsten Spielstand auslassen
      busy() { try { return Boolean(conn && conn.dataChannel && conn.dataChannel.bufferedAmount > 1500000); } catch { return false; } },
      close() { try { conn && conn.close(); } catch { /* egal */ } try { peer.destroy(); } catch { /* egal */ } },
      get open() { return Boolean(conn && conn.open); },
    };
    const wire = c => {
      conn = c;
      send = packer(s => c.send(s));
      c.on('open', () => onOpen && onOpen());
      c.on('data', unpacker(onMessage));
      c.on('close', () => onClose && onClose('Verbindung getrennt.'));
      c.on('error', () => onClose && onClose('Verbindungsfehler.'));
    };
    const peer = role === 'host' ? new Peer(ID_PREFIX + code) : new Peer();
    peer.on('open', () => {
      if (!done) { done = true; resolve(net); }
      if (role === 'guest') wire(peer.connect(ID_PREFIX + code, { reliable: true, serialization: 'raw' }));
    });
    peer.on('connection', c => {
      if (role !== 'host') return;
      if (conn && conn.open) { c.on('open', () => { c.send('S' + JSON.stringify({ type: 'full' })); setTimeout(() => c.close(), 500); }); return; }
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

// Testverbindung zwischen zwei Tabs (gleicher Browser) – gleiches Text-Protokoll wie die echte Verbindung
function broadcastNet({ role, code, onMessage, onOpen, onClose }) {
  const ch = new BroadcastChannel('pw-mp-' + code);
  let open = false;
  const other = role === 'host' ? 'guest' : 'host';
  const recv = unpacker(onMessage);
  ch.onmessage = e => {
    const m = e.data;
    if (!m || m.to !== role) return;
    if (m.hello) { if (!open) { open = true; ch.postMessage({ to: other, hello: true }); onOpen && onOpen(); } return; }
    if (m.bye) { onClose && onClose('Verbindung getrennt.'); return; }
    recv(m.d);
  };
  if (role === 'guest') ch.postMessage({ to: 'host', hello: true });
  const send = packer(s => ch.postMessage({ to: other, d: s }));
  return Promise.resolve({
    send(obj) { try { send(obj); } catch (err) { console.error(err); } },
    busy() { return false; },
    close() { ch.postMessage({ to: other, bye: true }); ch.close(); },
    get open() { return open; },
  });
}
