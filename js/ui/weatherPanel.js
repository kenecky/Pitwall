// Wetter-Fenster: Vorhersage-Tabelle und Regenradar mit Zeitregler.
// Das Radar wird aus dem festgelegten Regenverlauf (Schauer mit Beginn/Ende/Stärke) abgeleitet:
// Jeder Schauer ist eine Gruppe von Regenzellen, die mit dem Wind über die Strecke zieht –
// genau in der Zeit, in der es an der Strecke regnet.
import { rainAt } from '../sim/weather.js';
import { createRng } from '../util/rng.js';

const VIEW_KM = 14;              // Breite des Radarbilds in km
const STOPS = [                   // Intensität → Farbe (wie übliche Regenradar-Skalen)
  [0.04, [154, 215, 255, 0]],
  [0.12, [154, 215, 255, 150]],   // hellblau: sehr wenig
  [0.3, [36, 96, 214, 190]],      // dunkelblau: wenig
  [0.5, [245, 217, 10, 205]],     // gelb: viel
  [0.7, [255, 138, 31, 215]],     // orange: sehr viel
  [0.88, [224, 30, 30, 225]],     // rot: sehr stark
];

export function rainWord(r) {
  if (r < 0.05) return ['☀️', 'Trocken'];
  if (r < 0.2) return ['🌦', 'Leichter Regen'];
  if (r < 0.45) return ['🌧', 'Regen'];
  if (r < 0.75) return ['🌧', 'Starker Regen'];
  return ['⛈', 'Sehr starker Regen'];
}

// Regenzellen (km, relativ zur Strecke) – deterministisch aus Rennen-Nr. und Regenverlauf.
// Der Wind dreht von Zeit zu Zeit (vor allem vor Schauern): Zellen ziehen auf gekrümmten Bahnen.
// Das Radar zeigt die Zukunft nur als Hochrechnung mit dem AKTUELLEN Wind – dreht er, kommt es anders.
const MODELS = new WeakMap();
const T0 = -4000, T1 = 14000, STEP = 20;
export function radarModel(race) {
  if (MODELS.has(race)) return MODELS.get(race);
  const wx = race.weather;
  const r = createRng(((race.seed || 1) * 7919) ^ 0x51ed);
  const ang = r.range(0, Math.PI * 2);
  const speed = r.range(22, 42) / 3600;            // km/s
  // Winddrehungen: vor jedem Schauer eine (er kam „von der Seite“), dazu zufällige
  const turns = [];
  for (const sh of wx.showers) turns.push({ t: (sh.t0 + sh.t1) / 2 - r.range(500, 1500), d: (r.chance(0.5) ? 1 : -1) * r.range(0.5, 1.15) });
  for (let i = 0, n = 1 + Math.floor(r.next() * 3); i < n; i++) turns.push({ t: r.range(-1800, 9000), d: (r.chance(0.5) ? 1 : -1) * r.range(0.25, 0.8) });
  const angAt = t => {
    let a = ang;
    for (const x of turns) { const k = Math.max(0, Math.min(1, (t - x.t) / 600)); a += x.d * k * k * (3 - 2 * k); }
    return a;
  };
  // Verschiebung durch den Wind seit T0 (Tabelle)
  const n = Math.ceil((T1 - T0) / STEP) + 1, DX = new Float64Array(n), DY = new Float64Array(n);
  for (let i = 1; i < n; i++) { const a = angAt(T0 + (i - 0.5) * STEP); DX[i] = DX[i - 1] + Math.cos(a) * speed * STEP; DY[i] = DY[i - 1] + Math.sin(a) * speed * STEP; }
  const disp = t => {
    const f = Math.max(0, Math.min(n - 1.001, (t - T0) / STEP)), i = Math.floor(f), k = f - i;
    return [DX[i] + (DX[i + 1] - DX[i]) * k, DY[i] + (DY[i + 1] - DY[i]) * k];
  };
  const m = { ang, speed, angAt, disp, cells: [] };
  // Zelle: Versatz (along/across im Windsystem zur Zeit tm), liegt zur Zeit tm genau dort über der Strecke
  const add = (tm, along, across, rad, amp) => {
    const a = angAt(tm), [dx, dy] = disp(tm);
    m.cells.push({ tm, ox: Math.cos(a) * along - Math.sin(a) * across - dx, oy: Math.sin(a) * along + Math.cos(a) * across - dy, rad, amp });
  };
  for (const sh of wx.showers) {
    const t1 = sh.t1, t0 = Math.max(sh.t0, -1800);
    const tm = (t0 + t1) / 2;
    const len = speed * (t1 - t0);                  // so lange liegt der Schauer über der Strecke
    const cnt = 9 + Math.floor(r.next() * 7);
    const width = r.range(2.5, 4.5);
    for (let i = 0; i < cnt; i++) {
      const u = r.next() - 0.5;
      const along = u * len * 0.95;
      const across = r.gauss(width * 0.45);
      const core = 1 - Math.min(1, Math.abs(u) * 1.6 + Math.abs(across) / (width * 1.6));
      add(tm, along, across, r.range(0.9, 1.9), sh.peak * (0.35 + 0.75 * core) * r.range(0.85, 1.12));
    }
    add(tm, 0, 0, 1.6, sh.peak);   // an der Strecke so stark wie im Regenverlauf
  }
  // Schauer, die an der Strecke vorbeiziehen (auch mit drehendem Wind nie darüber)
  if (wx.showers.length) {
    const extra = 3 + Math.floor(r.next() * 4);
    for (let i = 0; i < extra; i++) {
      const side = r.chance(0.5) ? 1 : -1;
      const tm = r.range(-1200, 4800), amp = r.range(0.2, 0.85);
      let across = side * r.range(4, 8);
      const parts = [0, 1, 2, 3].map(() => ({ al: r.range(-2, 2), ac: r.range(-1, 1), rad: r.range(0.7, 1.5), amp: amp * r.range(0.6, 1) }));
      // Mindestabstand zur Strecke über die ganze Lebensdauer prüfen, sonst weiter nach außen
      for (let tries = 0; tries < 6; tries++) {
        const a = angAt(tm), [dx, dy] = disp(tm);
        const ox = -Math.sin(a) * across - dx, oy = Math.cos(a) * across - dy;
        let min = Infinity;
        for (let t = tm - 4000; t <= tm + 4000; t += 200) { const [x, y] = disp(t); min = Math.min(min, Math.hypot(ox + x, oy + y)); }
        if (min > 4.5) break;
        across *= 1.5;
      }
      for (const q of parts) add(tm, q.al, across + q.ac, q.rad, q.amp);
    }
  }
  MODELS.set(race, m);
  return m;
}

// Zellenmitte zur Zeit t – ab „jetzt“ (tn) nur hochgerechnet mit dem aktuellen Wind
function cellPos(m, c, t, tn) {
  if (tn === undefined || t <= tn) { const [x, y] = m.disp(t); return [c.ox + x, c.oy + y]; }
  const [x, y] = m.disp(tn), a = m.angAt(tn);
  return [c.ox + x + Math.cos(a) * m.speed * (t - tn), c.oy + y + Math.sin(a) * m.speed * (t - tn)];
}

// Weiches Wertrauschen (zieht mit dem Wind) für eine natürliche, fleckige Struktur
function hash(i, j) {
  let h = (i * 374761393 + j * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise(x, y) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

export function intensityAt(m, x, y, t, tn) {
  let v = 0;
  for (const c of m.cells) {
    const [cx, cy] = cellPos(m, c, t, tn);
    const d2 = (x - cx) ** 2 + (y - cy) ** 2;
    if (d2 > c.rad * c.rad * 9) continue;
    v = Math.max(v, c.amp * Math.exp(-d2 / (c.rad * c.rad)));
  }
  if (v < 0.02) return 0;
  const [sx, sy] = m.disp(Math.min(t, tn ?? t));
  const nx = (x - sx) / 1.3, ny = (y - sy) / 1.3;
  const tex = 0.72 + 0.28 * noise(nx, ny) + 0.12 * (noise(nx * 2.7, ny * 2.7) - 0.5);
  return Math.min(1, v * tex);
}

function colorFor(v) {
  if (v <= STOPS[0][0]) return null;
  for (let i = 1; i < STOPS.length; i++) {
    if (v <= STOPS[i][0]) {
      const [a, ca] = STOPS[i - 1], [b, cb] = STOPS[i];
      const k = (v - a) / (b - a);
      return ca.map((x, j) => x + (cb[j] - x) * k);
    }
  }
  return STOPS[STOPS.length - 1][1];
}

export class WeatherPanel {
  constructor({ root, body, getRace }) {
    this.root = root;
    this.body = body;
    this.getRace = getRace;
    this.offset = 0;     // Sekunden in die Zukunft
    this.low = document.createElement('canvas');
    body.addEventListener('input', e => {
      if (e.target.id !== 'wxSlider') return;
      this.offset = Number(e.target.value) * 60;
      this.drawRadar();
    });
  }

  get isOpen() { return !this.root.classList.contains('hidden'); }

  open() {
    this.offset = 0;
    this.root.classList.remove('hidden');
    this.render();
  }

  close() { this.root.classList.add('hidden'); }

  render() {
    const race = this.getRace();
    if (!race) return;
    const wx = race.weather;
    const now = Math.max(0, race.time);
    const nowR = rainAt(wx, now);
    const [icon, word] = rainWord(nowR);
    const wet = Math.round(wx.wetness * 100);
    const m = radarModel(race);
    const rows = [5, 15, 30, 60].map(min => {
      // Prognose: Hochrechnung mit dem aktuellen Wind – dreht er, stimmt sie nicht mehr
      const [i, w] = rainWord(Math.max(0, ...[[0, 0], [0.8, 0], [-0.8, 0], [0, 0.8], [0, -0.8]].map(([x, y]) => intensityAt(m, x, y, now + min * 60, now))));
      return `<tr><td>+${min} min</td><td class="wx-ico">${i}</td><td>${w}</td></tr>`;
    }).join('');
    this.body.innerHTML = `
      <div class="wx-now">${this.nowHtml(icon, word, wet)}</div>
      <div class="setup-label">PROGNOSE AN DER STRECKE (AKTUELLER WIND)</div>
      <table class="wx-table">${rows}</table>
      <div class="setup-label">REGENRADAR</div>
      <div class="wx-radar"><canvas id="wxRadar"></canvas><span id="wxTime" class="wx-time"></span><span class="wx-scale">${VIEW_KM} km</span></div>
      <input id="wxSlider" type="range" min="0" max="60" step="1" value="${this.offset / 60}" aria-label="Zeit vorspulen">
      <div class="wx-legend">
        <span><i style="background:#9ad7ff"></i>sehr wenig</span><span><i style="background:#2460d6"></i>wenig</span>
        <span><i style="background:#f5d90a"></i>viel</span><span><i style="background:#ff8a1f"></i>sehr viel</span><span><i style="background:#e01e1e"></i>sehr stark</span>
      </div>`;
    this.drawRadar();
  }

  nowHtml(icon, word, wet) {
    return `<div><span class="setup-label">JETZT</span><b>${icon} ${word}</b></div>
        <div><span class="setup-label">STRECKE</span><b>${wet < 8 ? 'trocken' : wet < 30 ? 'feucht' : wet < 70 ? 'nass' : 'sehr nass'} · ${wet} %</b></div>`;
  }
  // Live: Regen jetzt und Nässe der Strecke aktualisieren (ohne das Fenster neu aufzubauen)
  updateNow() {
    const race = this.getRace(), el = this.body.querySelector('.wx-now');
    if (!race || !el) return;
    const [icon, word] = rainWord(rainAt(race.weather, Math.max(0, race.time)));
    const html = this.nowHtml(icon, word, Math.round(race.weather.wetness * 100));
    if (el.innerHTML !== html) el.innerHTML = html;
  }

  drawRadar() {
    const race = this.getRace();
    const cv = this.body.querySelector('#wxRadar');
    if (!race || !cv) return;
    const rect = cv.getBoundingClientRect();
    if (!rect.width) return;
    const dpr = window.devicePixelRatio || 1;
    const W = Math.round(rect.width * dpr), H = Math.round(rect.height * dpr);
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    const t = Math.max(0, race.time) + this.offset;
    const kmPerPx = VIEW_KM / rect.width;
    const viewH = rect.height * kmPerPx;
    // Hintergrund mit km-Raster
    ctx.fillStyle = '#0c1117';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(120,140,160,.12)';
    ctx.lineWidth = 1;
    for (let km = -10; km <= 10; km += 2) {
      const x = (rect.width / 2 + km / kmPerPx) * dpr, y = (rect.height / 2 + km / kmPerPx) * dpr;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    // Regenfeld in grober Auflösung berechnen, weich hochskaliert → fließende Übergänge
    const m = radarModel(race);
    const gw = 80, gh = Math.round(80 * viewH / VIEW_KM);
    this.low.width = gw; this.low.height = gh;
    const lctx = this.low.getContext('2d');
    const img = lctx.createImageData(gw, gh);
    for (let j = 0; j < gh; j++) {
      for (let i = 0; i < gw; i++) {
        const x = (i / gw - 0.5) * VIEW_KM, y = (j / gh - 0.5) * viewH;
        const c = colorFor(intensityAt(m, x, y, t, Math.max(0, race.time)));
        if (!c) continue;
        const o = (j * gw + i) * 4;
        img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = c[3];
      }
    }
    lctx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.low, 0, 0, W, H);
    // Strecke als Linie in der Mitte (nicht maßstäblich vergrößert, damit sie gut sichtbar ist)
    const tr = race.track;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < tr.N; i += 4) { minX = Math.min(minX, tr.xs[i]); maxX = Math.max(maxX, tr.xs[i]); minY = Math.min(minY, tr.ys[i]); maxY = Math.max(maxY, tr.ys[i]); }
    const size = Math.min(rect.width, rect.height) * 0.34;
    const k = size / Math.max(maxX - minX, maxY - minY);
    const ox = rect.width / 2 - (minX + maxX) / 2 * k, oy = rect.height / 2 - (minY + maxY) / 2 * k;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.beginPath();
    for (let i = 0; i <= tr.N; i += 2) { const q = i % tr.N; const x = ox + tr.xs[q] * k, y = oy + tr.ys[q] * k; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.closePath();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 4; ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.8; ctx.stroke();
    // Windrichtung
    const ax = rect.width - 26, ay = 26;
    ctx.save(); ctx.translate(ax, ay); ctx.rotate(m.angAt(Math.max(0, race.time)));
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(10, 0); ctx.lineTo(5, -4); ctx.moveTo(10, 0); ctx.lineTo(5, 4); ctx.stroke();
    ctx.restore();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const lbl = this.body.querySelector('#wxTime');
    const mm = Math.floor(t / 60);
    if (lbl) lbl.textContent = `${this.offset ? `+${this.offset / 60} min` : 'JETZT'} · Rennzeit ${Math.floor(mm / 60)}:${String(mm % 60).padStart(2, '0')}`;
  }
}
