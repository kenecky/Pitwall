// Pit Wall – Proteste des Teamchefs nach dem Rennen.
// Entscheidungen der Rennleitung, an denen eigene Fahrer beteiligt sind, können angefochten werden:
// „Einspruch“ gegen eine Strafe für den eigenen Fahrer, „Protest“ gegen ein (zu mildes) Urteil für einen Gegner.
// Die Kommissare entscheiden nach der Wahrheit des Falls (c.truth) und der Stärke der vorgebrachten Argumente.
import { PENALTIES, evaluateCase, decide } from '../control/stewards.js';

export const MAX_PROTESTS = 2;
const SKIP = new Set(['protest', 'language', 'tech', 'tyreRule']);   // Regeln/Technik: nichts zu argumentieren

// Anfechtbare Fälle: entschieden, eigener Fahrer beteiligt, nicht nur Teamkollegen untereinander
export function protestCases(race) {
  return race.cases.filter(c => !SKIP.has(c.type) && c.truth && (c.cars || []).some(id => race.carById[id] && race.carById[id].player))
    .map(c => ({ c, kind: protestKind(race, c), done: race.cases.find(x => x.type === 'protest' && x.base === c.id && x.byPlayer) }));
}

// 'appeal' (eigener Fahrer bestraft) | 'protest' (Gegner beteiligt) | 'pending' | null (nicht möglich)
export function protestKind(race, c) {
  if (!['decided', 'nfa'].includes(c.status)) return 'pending';
  const v = c.verdict || {};
  if (v.revoked) return null;
  const own = id => race.carById[id] && race.carById[id].player;
  if (v.carId && own(v.carId)) return 'appeal';
  if ((c.cars || []).some(id => !own(id))) return 'protest';
  return null;
}

export function protestsLeft(race) {
  return MAX_PROTESTS - race.cases.filter(x => x.byPlayer).length;
}

// Argumente je Art. strong: entscheidend, wenn es stimmt · weak: hilft etwas · never: zählt nicht
export function protestArgs(race, c, kind) {
  const t = c.truth, v = c.verdict || {};
  const ownId = (c.cars || []).find(id => race.carById[id].player);
  const other = (c.cars || []).find(id => !race.carById[id].player);
  const { verdict } = evaluateCase(race, c);
  if (kind === 'appeal') {
    const me = v.carId;
    return [
      { key: 'noOff', text: 'Kein Vergehen – unser Fahrer hat nichts falsch gemacht, das war ein Rennunfall.', ok: !t.offender, strong: true },
      { key: 'other', text: `${other ? `${other} ist` : 'Der andere Fahrer ist'} verantwortlich, nicht ${me}.`, ok: Boolean(t.offender && t.offender !== me), strong: true, hide: !other },
      { key: 'harsh', text: 'Die Strafe ist für dieses Vergehen zu hart.', ok: t.offender === me && verdict === 'harsh', strong: true },
      { key: 'prec', text: 'In vergleichbaren Fällen gab es mildere Strafen.', ok: t.offender === me && verdict === 'harsh', strong: false },
      { key: 'hard', text: 'Das ist Motorsport – man muss die Fahrer fahren lassen.', ok: false, never: true },
    ].filter(a => !a.hide);
  }
  const off = t.offender;
  return [
    { key: 'clear', text: `Das war ein klares Vergehen von ${other || 'dem Gegner'} – dafür braucht es eine Strafe.`, ok: Boolean(off && off !== ownId && !v.carId), strong: true },
    { key: 'mild', text: 'Die Strafe ist viel zu mild.', ok: Boolean(off && off !== ownId && v.carId === off && verdict === 'lenient'), strong: true, hide: !v.carId },
    { key: 'wrong', text: 'Es wurde der falsche Fahrer bestraft.', ok: verdict === 'wrong' && off !== ownId, strong: true, hide: !v.carId || v.carId === ownId },
    { key: 'same', text: 'Andere Fahrer wurden für so etwas auch bestraft.', ok: Boolean(off && off !== ownId && (verdict === 'lenient' || !v.carId)), strong: false },
    { key: 'lost', text: `${ownId} hat dadurch Positionen und Punkte verloren.`, ok: false, never: true },
  ].filter(a => !a.hide);
}

// Ist der Einspruch/Protest in der Sache begründet?
function founded(race, c, kind) {
  const t = c.truth, v = c.verdict || {};
  const { verdict } = evaluateCase(race, c);
  if (kind === 'appeal') return verdict === 'harsh' || verdict === 'wrong' || !t.offender;
  const ownIds = (c.cars || []).filter(id => race.carById[id].player);
  return Boolean(t.offender && !ownIds.includes(t.offender) && (verdict === 'lenient' || verdict === 'wrong' || !v.carId));
}

// Protest einreichen. keys: gewählte Argumente (1–2). Gibt { ok, text } zurück.
export function fileProtest(race, c, kind, keys) {
  const args = protestArgs(race, c, kind).filter(a => keys.includes(a.key));
  const isFounded = founded(race, c, kind);
  const strong = args.some(a => a.ok && a.strong), weak = args.some(a => a.ok && !a.strong), bad = args.filter(a => !a.ok).length;
  let p = !isFounded ? 0.03 : strong ? 0.85 : weak ? 0.55 : 0.15;
  p = Math.max(0, p - bad * 0.12);
  const win = race.rng.chance(p);
  const t = c.truth, v = c.verdict || {};
  const team = race.carById[(c.cars || []).find(id => race.carById[id].player)].team;
  const name = kind === 'appeal' ? 'Einspruch' : 'Protest';
  const pc = {
    id: ++race.caseSeq, time: race.time, lap: c.lap, status: 'new', verdict: null, type: 'protest', byPlayer: true,
    typeName: name, base: c.id, cars: c.cars, title: `${name} von ${team.name} zu DOC ${c.id}`,
    summary: `${team.name}: ${args.map(a => a.text).join(' ')}`, evidence: [], options: [],
    truth: isFounded ? { ...t, unfounded: false } : { offender: v.carId || null, expected: ['keep'], points: [0, 0], unfounded: true },
    when: 'Nach dem Rennen', args: keys,
  };
  race.cases.push(pc);
  race.emit('case', `${name} von ${team.name} zu DOC ${c.id} eingegangen.`, { caseId: pc.id, cars: c.cars });
  if (!win) {
    decide(race, pc, { carId: null, penalty: 'keep', points: 0 });
    const why = !isFounded ? 'Die Kommissare sehen keinen Grund, das Urteil zu ändern.'
      : !args.some(a => a.ok) ? 'Die vorgebrachten Argumente treffen den Kern des Falls nicht.'
        : 'Die Argumente waren nicht überzeugend genug.';
    return { ok: false, text: `${name} abgelehnt – das Urteil bleibt bestehen. ${why}${bad && isFounded ? ' Unpassende Argumente haben geschadet.' : ''}` };
  }
  // Neues Urteil nach der Wahrheit des Falls
  const sev = k => PENALTIES[k].sev;
  const exp = (t.expected || ['none']).filter(k => PENALTIES[k]);
  let res;
  if (!t.offender) res = { carId: null, penalty: 'none', points: 0 };
  else {
    const mild = [...exp].sort((a, b) => sev(a) - sev(b));
    let pen = mild[0];
    if (kind === 'protest' && v.carId === t.offender) pen = mild.find(k => sev(k) > sev(v.penalty)) || mild[mild.length - 1];
    res = { carId: t.offender, penalty: pen, points: (t.points || [0])[0] || 0 };
  }
  decide(race, pc, res);
  const what = res.carId ? `${PENALTIES[res.penalty].name} für ${res.carId}` : 'keine Strafe';
  return { ok: true, text: `${name} angenommen! Neues Urteil zu DOC ${c.id}: ${what}.` };
}
