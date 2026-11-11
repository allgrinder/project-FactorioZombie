/**
 * Zombies, Lärm, Horden und Verteidigung. Alle Werte sind eigene Festlegungen für „Letzte Schicht“
 * (Begründung in docs/GAME_DATA.md, Abschnitt „Zombies“). Aussehen und Namen sind eigene Entwürfe.
 */
import type { EnemySetting } from './mapgen';

export type UnitKind = 'walker' | 'runner' | 'brute' | 'screamer';

export interface UnitDef {
  readonly kind: UnitKind;
  readonly name: string;
  readonly health: number;
  /** Schaden an der Spielfigur je Treffer. */
  readonly damage: number;
  /** Schaden an Gebäuden je Schlag. */
  readonly structureDamage: number;
  /** Ticks zwischen zwei Schlägen. */
  readonly cooldown: number;
  /** Angriffsreichweite (Felder, ab Körperrand). */
  readonly reach: number;
  /** Felder je Tick (Spielfigur: 0,15). */
  readonly speed: number;
  /** Panzerung gegen physischen Schaden: fester Abzug und Prozent. */
  readonly armorFlat: number;
  readonly armorPercent: number;
  readonly radius: number;
  /** Darstellung: Maßstab des Sprites. */
  readonly scale: number;
  /** Erscheint ab diesem Tag (1 = erster Tag). */
  readonly fromDay: number;
  /** Anteil an neuen Zombies: Grundwert + Zuwachs je Tag nach fromDay, höchstens max. */
  readonly share: number;
  readonly sharePerDay: number;
  readonly shareMax: number;
  /** Wahrscheinlichkeit je Treffer: blutende Wunde bzw. Infektion (Biss). */
  readonly bleedChance: number;
  readonly infectChance: number;
}

/**
 * Zombiearten. Schlurfer: langsam, häufig. Läufer: fast so schnell wie die Figur, wenig Leben. Brocken: zäh,
 * reißt Mauern ein. Schreier: lockt mit seinem Schrei weitere Zombies an.
 */
export const UNITS: Readonly<Record<UnitKind, UnitDef>> = {
  walker: {
    kind: 'walker', name: 'Schlurfer', health: 36, damage: 9, structureDamage: 7, cooldown: 55, reach: 0.45, speed: 0.045,
    armorFlat: 0, armorPercent: 0, radius: 0.28, scale: 1, fromDay: 1, share: 1, sharePerDay: 0, shareMax: 1, bleedChance: 0.25, infectChance: 0.04,
  },
  runner: {
    kind: 'runner', name: 'Läufer', health: 24, damage: 7, structureDamage: 4, cooldown: 38, reach: 0.45, speed: 0.125,
    armorFlat: 0, armorPercent: 0, radius: 0.26, scale: 0.95, fromDay: 3, share: 0.06, sharePerDay: 0.03, shareMax: 0.35, bleedChance: 0.3, infectChance: 0.04,
  },
  brute: {
    kind: 'brute', name: 'Brocken', health: 450, damage: 26, structureDamage: 45, cooldown: 75, reach: 0.7, speed: 0.055,
    armorFlat: 3, armorPercent: 0.15, radius: 0.45, scale: 1.4, fromDay: 6, share: 0.02, sharePerDay: 0.012, shareMax: 0.12, bleedChance: 0.5, infectChance: 0.03,
  },
  screamer: {
    kind: 'screamer', name: 'Schreier', health: 48, damage: 5, structureDamage: 3, cooldown: 60, reach: 0.45, speed: 0.06,
    armorFlat: 0, armorPercent: 0, radius: 0.27, scale: 1, fromDay: 4, share: 0.03, sharePerDay: 0.01, shareMax: 0.08, bleedChance: 0.15, infectChance: 0.04,
  },
};
export const UNIT_KINDS = Object.keys(UNITS) as UnitKind[];

/** Wahrnehmung und Verhalten. */
export const ZOMBIE = {
  /** Sichtweite am Tag und in der Nacht (Felder); dazwischen nach Dunkelheit. */
  sightDay: 11,
  sightNight: 7,
  /** Verfolgung bricht ab, wenn die Figur so lange (Ticks) weiter als sight × loseFactor entfernt ist. */
  loseFactor: 1.7,
  loseTicks: 240,
  /** Wahrnehmung nur alle n Ticks je Zombie (versetzt nach ID). */
  senseInterval: 10,
  /** Betäubung nach einem Nahkampftreffer (Ticks). */
  stunTicks: 26,
  /** Herumstreifen im Ruhezustand: Radius um den Heimatpunkt, Tempoanteil, mittlere Pause (Ticks). */
  wanderRadius: 5,
  wanderSpeed: 0.4,
  wanderPause: 420,
  /** Zombies, die weiter als so viele Felder von der Figur ruhen, werden nicht simuliert. */
  sleepDistance: 110,
  /** Schrei des Schreiers: Lärmradius und Abklingzeit. */
  screamRadius: 45,
  screamCooldown: 900,
  /** Nach dem Erreichen einer Lärmquelle: Gebäude in diesem Umkreis werden angegriffen. */
  smashRadius: 4,
  /** Obergrenze aller Zombies (Rechenaufwand). */
  maxUnits: 900,
} as const;

/**
 * Besiedlung der Karte je Einstellung: Rasterzelle, mittlere Zombies je Zelle in der Wildnis (bei voller Entfernung),
 * zusätzliche je Fundort (Häuser, Wracks), freier Radius um den Start, Entfernung bis zur vollen Dichte.
 * hordeFactor vervielfacht die Hordengröße, growth den täglichen Zuzug.
 */
export const ENEMY_MAPGEN: Readonly<Record<EnemySetting, {
  cell: number; perCell: number; perSite: number; startFree: number; fullAt: number; hordeFactor: number;
}>> = {
  aus: { cell: 32, perCell: 0, perSite: 0, startFree: 1e9, fullAt: 1e9, hordeFactor: 0 },
  wenig: { cell: 32, perCell: 0.7, perSite: 1.2, startFree: 55, fullAt: 220, hordeFactor: 0.5 },
  normal: { cell: 32, perCell: 1.4, perSite: 2.2, startFree: 45, fullAt: 180, hordeFactor: 1 },
  viele: { cell: 32, perCell: 2.6, perSite: 3.5, startFree: 38, fullAt: 140, hordeFactor: 1.8 },
};

/**
 * Horden: ab der Nacht des Tages firstDay zieht bei Einbruch der Dämmerung eine Horde aus zufälliger Richtung zum
 * Lager. Größe = (base + perDay × (Tag − firstDay)) × Faktor der Einstellung; jede bigEvery-te Nacht bigFactor-fach.
 */
export const HORDE = {
  firstDay: 2,
  base: 5,
  perDay: 2.5,
  bigEvery: 7,
  bigFactor: 2.5,
  maxSize: 220,
  distMin: 58,
  distMax: 72,
  /** Streuung der Startpositionen (Felder). */
  spread: 9,
} as const;

/**
 * Lärm: Radius in Feldern, in dem Zombies das Geräusch hören und nachsehen. Maschinen lärmen nur im Betrieb
 * (einmal je Sekunde); mehrere Maschinen im selben 8×8-Block addieren sich (siehe src/sim/noise.ts).
 */
export const NOISE_BY_ENTITY: Readonly<Record<string, number>> = {
  'burner-mining-drill': 20,
  'electric-mining-drill': 15,
  'stone-furnace': 5,
  'steel-furnace': 6,
  boiler: 9,
  'steam-engine': 24,
  'assembling-machine-1': 11,
  lab: 4,
  radar: 7,
  'radio-tower': 70,
};

export const NOISE = {
  pistol: 30,
  smg: 34,
  turret: 36,
  explosion: 55,
  melee: 5,
  chop: 10,
  mine: 7,
  build: 4,
  /** Lockvogel (Wurfgegenstand): Radius und Dauer (Ticks). */
  lure: 38,
  lureTicks: 25 * 60,
  /** Block, in dem Maschinenlärm zusammengefasst wird, und Zuwachs je Verdopplung der Maschinenzahl. */
  block: 8,
  crowdBoost: 0.18,
  /** Anzeige: so lange (Ticks) bleibt ein Geräusch auf der Karte sichtbar. */
  showTicks: 120,
} as const;

/** Munition: Schaden je Schuss, Schuss je Magazin. */
export const AMMO: Readonly<Record<string, { damage: number; rounds: number }>> = {
  'firearm-magazine': { damage: 6, rounds: 10 },
  'piercing-rounds-magazine': { damage: 11, rounds: 10 },
};

/** Maschinengewehrturm: 2×2, Reichweite 17, 10 Schuss/s. */
export const TURRET = {
  range: 17,
  cooldown: 6,
  /** Drehung je Tick (Bogenmaß). */
  turnSpeed: 0.15,
} as const;

/** Schusswaffen der Spielfigur. */
export const WEAPONS = {
  pistol: { range: 13, cooldown: 16, noise: NOISE.pistol },
  'submachine-gun': { range: 16, cooldown: 6, noise: NOISE.smg },
} as const;

/**
 * Nahkampfwaffen: Schaden, Abklingzeit (Ticks), Reichweite (Felder), Haltbarkeit (Schläge). chop: Faktor auf das
 * Fällen von Bäumen, dismantle: Faktor auf das Ausschlachten von Wracks und Ruinen. Beste vorhandene Waffe wird benutzt
 * (Reihenfolge = Vorrang).
 */
export interface MeleeDef {
  readonly damage: number;
  readonly cooldown: number;
  readonly reach: number;
  readonly durability: number;
  readonly chop?: number;
  readonly dismantle?: number;
}
export const MELEE: Readonly<Record<string, MeleeDef>> = {
  axe: { damage: 22, cooldown: 34, reach: 1.25, durability: 160, chop: 2 },
  crowbar: { damage: 17, cooldown: 30, reach: 1.3, durability: 320, dismantle: 2 },
  'baseball-bat': { damage: 15, cooldown: 26, reach: 1.35, durability: 110 },
  spear: { damage: 13, cooldown: 30, reach: 2.0, durability: 45 },
  knife: { damage: 9, cooldown: 15, reach: 1.0, durability: 140 },
};
/** Ohne Waffe: Fäuste. */
export const FISTS: MeleeDef = { damage: 3, cooldown: 24, reach: 0.95, durability: Infinity };

/** Spielfigur: Lebenspunkte; Heilung nur langsam und nur, wenn satt und nicht durstig (src/data/survival.ts). */
export const PLAYER_COMBAT = {
  health: 100,
} as const;

/** Reparaturset: Haltbarkeit 300 Punkte, 2 Lebenspunkte je Tick. */
export const REPAIR = { durability: 300, perTick: 2 } as const;

/**
 * Wurfgegenstände: Reichweite (Felder), Wirkradius, Schaden (Explosion), Abklingzeit, Lärm.
 * Lockvogel: kein Schaden, lärmt am Zielort (NOISE.lure).
 */
export const CAPSULES: Readonly<Record<string, { range: number; radius: number; damage: number; cooldown: number }>> = {
  grenade: { range: 15, radius: 5.5, damage: 60, cooldown: 30 },
  'cliff-explosives': { range: 10, radius: 1.5, damage: 0, cooldown: 30 },
  'noise-lure': { range: 18, radius: 0, damage: 0, cooldown: 30 },
};
export const CAPSULE_SPEED = 0.3;

/** Stacheldraht und Nagelfalle (Felder, über die Zombies laufen). */
export const HAZARD = {
  /** Stacheldraht: Tempoanteil, Schaden alle interval Ticks, Verschleiß des Drahts je Schaden. */
  wire: { slow: 0.35, damage: 3, interval: 30, wear: 1 },
  /** Nagelfalle: Schaden beim Betreten (Abklingzeit je Zombie), Verschleiß je Auslösung. */
  trap: { damage: 24, interval: 50, wear: 8 },
} as const;

/** Wegsuche: Flussfeld im Fenster ±window Felder um das Ziel; Verfolgung der Figur mit kleinerem Fenster. */
export const PATH = { window: 48, chaseWindow: 22, chaseRefresh: 20, maxFields: 24 } as const;
