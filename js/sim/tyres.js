// Reifenmischungen (Slicks + Intermediates + Regenreifen)
export const COMPOUNDS = {
  S: { id: 'S', name: 'Soft',         offset: 0.00, deg: 0.075, cliff: 18, warm: 0.8 },
  M: { id: 'M', name: 'Medium',       offset: 0.35, deg: 0.045, cliff: 30, warm: 1.3 },
  H: { id: 'H', name: 'Hard',         offset: 0.70, deg: 0.028, cliff: 44, warm: 2.0 },
  I: { id: 'I', name: 'Inter',        offset: 0,    deg: 0.06,  cliff: 28, wet: true },
  W: { id: 'W', name: 'Regenreifen',  offset: 0,    deg: 0.05,  cliff: 32, wet: true },
};

// Zeitverlust pro Runde (s) einer Mischung bei Streckennässe w (0 = trocken, 1 = überflutet), als Anteil der
// Basisrunde base: Inter ~8–10 % langsamer als trocken, Regenreifen ~13–16 %. Inter ist bei leichtem/mittlerem Regen
// schneller, Regenreifen ab ~65 % Nässe (Aquaplaning der Inter). Slicks bis ~22 % Nässe vor den Inters.
export function wetLoss(id, w, base = 90) {
  if (id === 'I') return base * (0.07 + 0.06 * w + (w < 0.25 ? (0.25 - w) * 0.4 : 0) + (w > 0.55 ? (w - 0.55) * 0.45 : 0));
  if (id === 'W') return base * (0.11 + 0.07 * w + (w < 0.35 ? (0.35 - w) * 0.35 : 0));
  return w < 0.08 ? 0 : base * ((w - 0.08) * 0.6 + Math.max(0, w - 0.35) * 0.8);
}

// Beste Mischung für eine Nässe (Slick-Wahl nach Restrunden)
export function bestCompound(w, lapsLeft, base = 90) {
  const slick = lapsLeft > 34 ? 'H' : lapsLeft > 16 ? 'M' : 'S';
  let best = slick, bl = wetLoss(slick, w, base) + COMPOUNDS[slick].offset;
  for (const id of ['I', 'W']) {
    const l = wetLoss(id, w, base);
    if (l < bl) { bl = l; best = id; }
  }
  return best;
}
