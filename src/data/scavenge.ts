/**
 * Plündern statt Bergbau (Wunsch 17.11.2026: „Minen klappen so nicht“): Material liegt als Schrotthaufen in Höfen,
 * Orten und auf Schrottplätzen. Man schlachtet sie von Hand aus oder schickt Sammeltrupps (src/sim/scavengers.ts).
 * Alle Werte sind eigene Festlegungen (docs/KONZEPT.md).
 */

/** Gewichtete Ausbeute eines Haufens: je Zug ein Stück, Wahrscheinlichkeit ∝ weight. */
export interface PileYield {
  readonly item: string;
  readonly weight: number;
}

/** Schrotthaufen: Ausbeute, Menge (Stück), Sekunden je Stück von Hand, Lärm je Stück (Felder). */
export interface PileSpec {
  readonly yields: readonly PileYield[];
  readonly amountMin: number;
  readonly amountMax: number;
  readonly secondsPerItem: number;
  readonly noise: number;
}

const Y = (item: string, weight: number): PileYield => ({ item, weight });

export const PILES: Readonly<Record<string, PileSpec>> = {
  'scrap-pile': {
    yields: [Y('iron-ore', 55), Y('copper-ore', 14), Y('iron-stick', 10), Y('iron-gear-wheel', 8), Y('copper-cable', 7), Y('pipe', 4), Y('steel-plate', 2)],
    amountMin: 50, amountMax: 90, secondsPerItem: 0.8, noise: 9,
  },
  'rubble-pile': {
    yields: [Y('stone', 64), Y('stone-brick', 14), Y('iron-ore', 12), Y('wood', 10)],
    amountMin: 50, amountMax: 90, secondsPerItem: 0.7, noise: 8,
  },
  'coal-pile': {
    yields: [Y('coal', 88), Y('stone', 12)],
    amountMin: 60, amountMax: 110, secondsPerItem: 0.55, noise: 6,
  },
  'wood-pile': {
    yields: [Y('wood', 90), Y('iron-stick', 10)],
    amountMin: 30, amountMax: 50, secondsPerItem: 0.5, noise: 5,
  },
  'parts-pile': {
    yields: [Y('iron-ore', 34), Y('copper-ore', 18), Y('iron-gear-wheel', 16), Y('copper-cable', 14), Y('pipe', 10), Y('electronic-circuit', 5), Y('steel-plate', 3)],
    amountMin: 35, amountMax: 65, secondsPerItem: 1.0, noise: 10,
  },
  'ewaste-pile': {
    yields: [Y('copper-ore', 42), Y('copper-cable', 24), Y('iron-ore', 18), Y('electronic-circuit', 12), Y('radio-parts', 1)],
    amountMin: 35, amountMax: 65, secondsPerItem: 1.0, noise: 8,
  },
};

/** Brecheisen: so viel schneller ausschlachten (Haufen, Wracks, Ruinen). */
export const CROWBAR_FACTOR = 2;

/** Sammler (src/sim/scavengers.ts): Tempo (Felder je Tick; Figur 0,15), Last je Gang, Leben, Pausen, Flucht. */
export const SCAVENGER = {
  speed: 0.1,
  fleeSpeed: 0.135,
  capacity: 20,
  health: 60,
  /** Faktor auf die Sekunden je Stück (Sammler sind langsamer als die Figur mit Brecheisen). */
  workFactor: 1.4,
  /** Pause zwischen zwei Gängen (Ticks) und Wartezeit, wenn nichts zu tun ist. */
  rest: 600,
  idleWait: 300,
  /** Zombie näher als so viele Felder: Sammler bricht ab und läuft heim. */
  fleeDistance: 8,
  /** Haufen meiden, an denen so nah ein Zombie steht. */
  avoidDistance: 12,
  /** Heilung je Sekunde in der Sammelstelle. */
  healPerSecond: 1,
} as const;

/**
 * Überlebende (eigene Idee): warten in Orten. Kommt die Figur näher als joinDistance, folgt der Überlebende ihr
 * (Tempo followSpeed, Abstand keep). Bleibt er mehr als lostDistance zurück, wartet er wieder. Erreicht er das
 * Lagerfeuer (homeDistance), wird er Sammler: eine Sammler-Ausrüstung in die nächste Sammelstelle mit freiem Platz,
 * sonst in das Inventar der Figur.
 */
export const SURVIVOR = {
  joinDistance: 2.5,
  followSpeed: 0.14,
  keep: 2.2,
  lostDistance: 40,
  homeDistance: 6,
  health: 50,
} as const;
