// Pit Wall – Pressestimmen nach Rennen und Sprint: Ergebnis gemessen an der Teamstärke, Strategie, Ausfälle, Starts.
// Fiktive Medien, Texte aus Bausteinen; Zufall nur über den Seed des Rennens (gleiches Rennen = gleiche Stimmen).
const OUTLETS = ['Boxengasse Magazin', 'Paddock Post', 'Grid Journal', 'Rennsport Aktuell', 'Pole Position Weekly', 'Motor & Mensch'];

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}

// Erwarteter Platz des besseren eigenen Autos nach Teamstärke (1 = stärkstes Team → ~P1–2)
function expectedBest(teams, teamId) {
  const rank = [...teams].sort((a, b) => b.pace - a.pace).findIndex(t => t.id === teamId) + 1;
  return Math.max(1, Math.round(rank * 2 - 1.5));
}

export function pressQuotes(race, teams) {
  const team = teams.find(t => t.id === race.playerTeam);
  if (!team) return [];
  const st = race.standings();
  const mine = st.filter(c => c.player);
  const pos = c => st.indexOf(c) + 1;
  const ok = c => !c.retired && !c.dsq;
  const finishers = mine.filter(ok);
  const best = finishers.length ? Math.min(...finishers.map(pos)) : null;
  const exp = expectedBest(teams, team.id);
  const pick = (k, arr) => arr[Math.floor(hash(`${race.seed}${k}`) * arr.length)];
  const name = team.name;
  const sprint = race.kind === 'sprint';
  const q = [];

  // 1) Gesamturteil: Ergebnis gemessen an der Stärke des Teams
  let verdict;
  if (!finishers.length) verdict = pick('v0', [`Ein Wochenende zum Vergessen für ${name}: kein Auto im Ziel.`, `Doppelausfall – bei ${name} herrscht nach dem ${sprint ? 'Sprint' : 'Rennen'} betretenes Schweigen.`]);
  else if (best === 1) verdict = pick('v1', [`Sieg für ${name}! ${mine.find(c => pos(c) === 1).driver.last} liefert eine Meisterleistung.`, `${name} ganz oben – das Team hat heute alles richtig gemacht.`]);
  else if (best <= exp - 3) verdict = pick('v2', [`Überraschung des Tages: ${name} fährt weit über den eigenen Möglichkeiten auf P${best}.`, `Starkes Ergebnis für ${name} – P${best} hatte ihnen niemand zugetraut.`]);
  else if (best <= exp) verdict = pick('v3', [`Solide Vorstellung von ${name}, P${best} entspricht ziemlich genau dem Potenzial.`, `${name} holt heraus, was drin war: P${best}.`]);
  else if (best <= exp + 4) verdict = pick('v4', [`Enttäuschung bei ${name}: Mit P${best} bleibt das Team unter seinen Möglichkeiten.`, `Für ein Team wie ${name} ist P${best} zu wenig.`]);
  else verdict = pick('v5', [`Desaster für ${name}: Nur P${best} – da passt einiges nicht zusammen.`, `${name} fährt hinterher – P${best} ist weit weg von den Erwartungen.`]);
  q.push(verdict);

  // 2) Strategie
  const stops = mine.map(c => c.stops);
  const winner = st[0];
  const neutral = mine.filter(c => (c.neutralStops || 0) > 0);
  const slow = mine.filter(c => (c.slowStops || 0) > 0);
  const uc = race.events.filter(e => /^Undercut (gelungen|misslungen)/.test(e.text) && (e.cars || []).some(id => race.carById[id] && race.carById[id].player));
  if (neutral.length && finishers.some(c => neutral.includes(c) && pos(c) <= (best ?? 99) + 2)) q.push(pick('s1', [`Clever: ${name} nutzte die Neutralisierung für einen günstigen Stopp – das war der Schlüssel.`, `Der Kommandostand von ${name} reagierte blitzschnell auf das Safety Car.`]));
  else if (uc.some(e => /gelungen/.test(e.text))) q.push(`Der Undercut von ${name} ging auf – die Strategen haben den richtigen Moment erwischt.`);
  else if (uc.some(e => /misslungen/.test(e.text))) q.push(`Der Undercut-Versuch von ${name} verpuffte – zu früh, zu viel Verkehr.`);
  else if (slow.length) q.push(pick('s2', [`Ein langsamer Boxenstopp kostete ${name} wertvolle Zeit.`, `An der Box lief bei ${name} nicht alles rund.`]));
  else if (!sprint && finishers.length && stops.every(x => x > (winner.stops || 0) + 1)) q.push(`Fragwürdige Taktik: ${name} stoppte deutlich öfter als der Sieger.`);
  else if (!sprint && finishers.length && stops.some(x => x < (winner.stops || 1)) && best !== null && best <= exp) q.push(`Mutige Strategie von ${name} mit weniger Stopps – sie ging auf.`);
  else q.push(pick('s3', [`Die Strategie von ${name} war unauffällig, aber solide.`, `Bei ${name} gab es strategisch wenig zu beanstanden.`]));

  // 3) Einzelne Fahrer: Ausfall, Aufholjagd, Start
  const dnf = mine.find(c => c.retired);
  const gainer = finishers.map(c => ({ c, g: c.gridPos - pos(c) })).sort((a, b) => b.g - a.g)[0];
  if (dnf) q.push(`${dnf.driver.last} schied aus${dnf.dnf ? ` (${dnf.dnf})` : ''} – ein herber Rückschlag für das Team.`);
  else if (gainer && gainer.g >= 4) q.push(`Aufholjagd: ${gainer.c.driver.last} machte von Startplatz ${gainer.c.gridPos} aus ${gainer.g} Plätze gut.`);
  else if (gainer && gainer.g <= -4) q.push(`${gainer.c.driver.last} fiel von Startplatz ${gainer.c.gridPos} auf P${pos(gainer.c)} zurück.`);
  else if (finishers.length === 2) {
    const [a, b] = finishers.sort((x, y) => pos(x) - pos(y));
    q.push(`Im Teamduell hatte ${a.driver.last} (P${pos(a)}) heute die Nase vorn vor ${b.driver.last} (P${pos(b)}).`);
  }
  return q.map((text, i) => ({ outlet: OUTLETS[Math.floor(hash(`${race.seed}o${i}`) * OUTLETS.length + i) % OUTLETS.length], text }));
}
