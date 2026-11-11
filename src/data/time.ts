/** Feste Simulationsrate. Alle Zeitangaben in den Daten sind Sekunden und werden hierüber in Ticks umgerechnet. */
export const TICKS_PER_SECOND = 60;

export function secondsToTicks(seconds: number): number {
  return Math.round(seconds * TICKS_PER_SECOND);
}

/** Watt -> Joule pro Tick (ganzzahlig). */
export function wattsToJoulesPerTick(watts: number): number {
  return Math.round(watts / TICKS_PER_SECOND);
}

export const KJ = 1_000;
export const MJ = 1_000_000;

/**
 * Tag und Nacht: ein Tag dauert 36.000 Ticks (10 min; eigener Wert, länger als beim Vorgänger, damit Hunger, Durst
 * und Schlaf Zeit haben). Tageszeit 0 = Mittag. Tag 0,72–0,28 hell, Abend 0,28–0,40 dunkler werdend,
 * Nacht 0,40–0,60 dunkel, Morgen 0,60–0,72 heller. Lampen schalten sich nachts ein (lampOn: ab dieser Dunkelheit).
 */
export const DAY = { ticks: 36_000, dusk: 0.28, evening: 0.4, morning: 0.6, dawn: 0.72, lampOn: 0.3 } as const;

/** Laufender Tag (1 = erster Tag); der Tag beginnt am Mittag des Spielstarts. */
export function dayNumber(tick: number): number {
  return Math.floor(tick / DAY.ticks) + 1;
}

/** Dunkelheit 0 (Tag) … 1 (Nacht) zur Tageszeit t (0..1). */
export function darknessAt(t: number): number {
  if (t < DAY.dusk || t >= DAY.dawn) return 0;
  if (t < DAY.evening) return (t - DAY.dusk) / (DAY.evening - DAY.dusk);
  if (t < DAY.morning) return 1;
  return 1 - (t - DAY.morning) / (DAY.dawn - DAY.morning);
}
