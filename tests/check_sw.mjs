// Prüft vor jeder Veröffentlichung: alle JS-Dateien im Service Worker, Versionen gleich (sw.js, index.html, main.js).
import { readFileSync, readdirSync, statSync } from 'node:fs';
const walk = d => readdirSync(d).flatMap(f => { const p = `${d}/${f}`; return statSync(p).isDirectory() ? walk(p) : [p]; });
const sw = readFileSync('sw.js', 'utf8');
const missing = walk('js').filter(p => p.endsWith('.js') && !p.includes('/scenery/') && !sw.includes(`'${p}'`));
const v = sw.match(/PREFIX \+ 'v(\d+)'/)[1];
const vi = readFileSync('index.html', 'utf8').match(/Version (\d+)/)[1];
const vm = readFileSync('js/main.js', 'utf8').match(/VERSION = (\d+)/)[1];
let ok = true;
if (missing.length) { ok = false; console.log('Fehlt in sw.js:', missing.join(', ')); }
if (v !== vi || v !== vm) { ok = false; console.log(`Versionen ungleich: sw ${v}, index ${vi}, main ${vm}`); }
if (!/const PREFIX = 'pw-'/.test(sw)) { ok = false; console.log('Cache-Präfix muss pw- sein'); }
console.log(ok ? `OK – Version ${v}` : 'FEHLER');
process.exit(ok ? 0 : 1);
