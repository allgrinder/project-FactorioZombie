/**
 * Plündern statt Bergbau (Wunsch 17.11.2026: „Minen klappen so nicht“): Material liegt als Schrotthaufen in Höfen,
 * Orten und auf Schrottplätzen. Man schlachtet sie von Hand aus oder lässt Bewohner sammeln (src/sim/community.ts).
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

/** Sammler (Aufgabe „Sammeln“, src/sim/community.ts): Tempo (Felder je Tick; Figur 0,15), Last je Gang, Pausen, Flucht. */
export const SCAVENGER = {
  speed: 0.1,
  fleeSpeed: 0.135,
  capacity: 20,
  /** Faktor auf die Sekunden je Stück (Sammler sind langsamer als die Figur mit Brecheisen). */
  workFactor: 1.4,
  /** Pause zwischen zwei Gängen (Ticks) und Wartezeit, wenn nichts zu tun ist. */
  rest: 600,
  idleWait: 300,
  /** Zombie näher als so viele Felder: Sammler bricht ab und läuft heim. */
  fleeDistance: 8,
  /** Haufen meiden, an denen so nah ein Zombie steht. */
  avoidDistance: 12,
  /** Suchumkreis ohne Vorratslager (vom Lagerfeuer aus); mit Lager gilt dessen Umkreis. */
  radius: 60,
} as const;

/**
 * Überlebende (eigene Idee): warten in Orten. Kommt die Figur näher als joinDistance, folgt der Überlebende ihr
 * (Tempo followSpeed, Abstand keep). Bleibt er mehr als lostDistance zurück, wartet er wieder. Erreicht er das
 * Lagerfeuer (homeDistance), wird er Bewohner der Gemeinschaft.
 */
export const SURVIVOR = {
  joinDistance: 2.5,
  followSpeed: 0.14,
  keep: 2.2,
  lostDistance: 40,
  homeDistance: 6,
  health: 50,
} as const;

/** Aufgaben der Bewohner (Wunsch 18.11.2026: „jeder Bewohner hat eine Aufgabe“). */
export type Job = 'scavenge' | 'loot' | 'guard' | 'farm' | 'repair' | 'medic' | 'rest';

export const JOBS: Record<Job, { name: string; past: string; icon: string; hint: string }> = {
  scavenge: { name: 'Sammeln', past: 'Schrotthandel', icon: 'iron-ore', hint: 'schlachtet Schrotthaufen im Umkreis aus und bringt die Ausbeute ins Vorratslager' },
  loot: { name: 'Plündern', past: 'Umzugsfirma', icon: 'crowbar', hint: 'durchsucht Häuser, Läden und Wracks im Umkreis und bringt die Beute ins Vorratslager' },
  guard: { name: 'Wache', past: 'Polizei', icon: 'pistol', hint: 'besetzt Wachtürme und MG-Türme, sonst Posten an der Mauer bzw. am Feuer; schießt mit Magazinen aus dem Vorrat (vom Turm weiter)' },
  farm: { name: 'Gärtnern', past: 'Landwirtschaft', icon: 'vegetables', hint: 'pflegt und erntet Gemüsebeete (wachsen doppelt so schnell), legt mit Holz aus dem Vorrat neue an; sonst Wildkräuter' },
  repair: { name: 'Ausbessern', past: 'Autowerkstatt', icon: 'repair-pack', hint: 'bessert beschädigte Mauern, Tore und Türme im Lager aus' },
  medic: { name: 'Sanitäter', past: 'Krankenpflege', icon: 'bandage', hint: 'heilt dich und die Bewohner am Lager, verbindet Wunden (Verbände, Antibiotika aus dem Vorrat)' },
  rest: { name: 'Ruhen', past: '', icon: 'bed', hint: 'bleibt am Lagerfeuer und erholt sich' },
};
export const JOB_ORDER: Job[] = ['scavenge', 'loot', 'guard', 'farm', 'repair', 'medic', 'rest'];
/** Fähigkeiten (frühere Berufe) neuer Überlebender, gewichtet. */
export const SKILLS: Job[] = ['scavenge', 'loot', 'guard', 'guard', 'farm', 'repair', 'medic'];

export const NAMES = [
  'Anna', 'Ben', 'Carla', 'Dieter', 'Emil', 'Frieda', 'Greta', 'Hannes', 'Ilse', 'Jonas', 'Karl', 'Lena', 'Mats', 'Nora',
  'Otto', 'Paula', 'Rudi', 'Sophie', 'Theo', 'Uschi', 'Vera', 'Willi', 'Yusuf', 'Zoe', 'Aylin', 'Bernd', 'Elif', 'Fritz',
  'Hanna', 'Ivan', 'Jule', 'Kemal', 'Lotte', 'Milan', 'Nele', 'Ole',
];

/**
 * Gemeinschaft: Bewohner leben am Lagerfeuer (Kreis um das Feuer), essen einmal am Tag aus dem Vorrat (Vorratslager,
 * Kisten im Lager). Hungrige arbeiten langsamer; nach leaveDays Tagen ohne Essen gehen sie. Passt die Aufgabe zur
 * Fähigkeit (früherer Beruf), arbeiten sie um skillBonus besser.
 */
export const COMMUNITY = {
  health: 60,
  speed: 0.1,
  /** Umkreis des Lagers (Felder um das Lagerfeuer): Vorrat in Kisten, Ausbessern, Beete, Sanitäter. */
  baseRadius: 22,
  healPerSecond: 0.5,
  skillBonus: 1.5,
  hungryFactor: 0.6,
  leaveDays: 3,
} as const;

export const GUARD = {
  range: 13,
  cooldown: 40,
  damage: 9,
  /** Schuss je Magazin. */
  rounds: 10,
  noise: 16,
  melee: 6,
  meleeCooldown: 60,
  /** Postenring um das Lagerfeuer. */
  postRadius: 5,
  /** Reichweite auf bzw. neben einem Turm (erhöht). */
  towerBonus: 1.4,
} as const;

/**
 * Selbstverteidigung aller Bewohner (Wunsch 18.11.2026: „warum verteidigen sich die Bewohner nicht?“): Nahkampf mit der
 * besten Waffe aus dem Vorrat (Reihenfolge weapons), sonst Fäuste; Schaden × damageFactor, Takt × cooldownFactor
 * gegenüber der Figur. Unter fleeBelow Leben fliehen sie heim. Bewaffnete eilen Menschen im Umkreis helpRadius zu
 * Hilfe, an denen ein Zombie näher als threatRadius steht.
 */
export const DEFENSE = {
  weapons: ['axe', 'crowbar', 'baseball-bat', 'spear', 'knife'],
  damageFactor: 0.8,
  cooldownFactor: 1.5,
  fleeBelow: 0.35,
  helpRadius: 9,
  threatRadius: 2.2,
} as const;

export const MEDIC = { reach: 2.5, hpPerSecond: 2, residentHpPerSecond: 1 } as const;
export const REPAIR = { hpPerSecond: 8 } as const;
/** Gärtner: Wachstum je Tick zusätzlich, Ernte ab so vielen Stück heimbringen, Wildkräuter alle forageSeconds. */
export const FARM = { boost: 1, carry: 3, forageSeconds: 150, bedsPerFarmer: 3, bedWood: 8, buildSeconds: 30 } as const;
/** Plündern: Umkreis um das Lagerfeuer, Last je Gang, Faktor auf die Suchzeit, Zombies so nah meiden. */
export const LOOTER = { radius: 90, capacity: 16, searchFactor: 1.5, avoid: 12 } as const;
