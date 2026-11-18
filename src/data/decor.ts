/**
 * Dekoration der Karte (nur Darstellung, ohne Einfluss auf die Simulation).
 * Eigene Werte. Sprites aus assets/blender/models/decals.py, flora.py und landscape.py.
 */
export type DecorLayer = 'decal' | 'flora';

export interface DecorKind {
  readonly id: string;
  /** Sprite-Präfix; Varianten werden als <prefix>.<n> gezählt. */
  readonly sprite: string;
  readonly layer: DecorLayer;
  /** Rastergröße in Feldern: höchstens ein Kandidat je Rasterzelle. */
  readonly cell: number;
  /** Grundwahrscheinlichkeit je Zelle. */
  readonly chance: number;
  /** Zusätzlicher Faktor in „Hainen“ (großräumiges Rauschen > grove.threshold). */
  readonly groveBoost?: number;
  /** Abstand zu Ressourcenfeldern (Felder), 0 = auch darauf. */
  readonly clearOfResources: number;
  /** Abstand zum Startpunkt (Felder). */
  readonly clearOfSpawn: number;
  /** Hat eine eigene Schattenebene (<sprite>.<n>.shadow). */
  readonly shadow: boolean;
  /** Flache Flecken zufällig drehen und strecken (nur ohne gerichtete Schatten sinnvoll). */
  readonly warp?: boolean;
  /** Nur auf Wasser nahe dem Ufer (Seerosen). */
  readonly water?: boolean;
  /** Nur auf Belägen (Straße, Gehweg, Hof): Unkraut in Ritzen. */
  readonly floor?: boolean;
  /** Nur direkt am Ufer (Wasser im Nachbarfeld). */
  readonly shore?: boolean;
  /** Faktor, wenn Wasser in der Nähe ist (Radius WATER_NEAR). */
  readonly waterBoost?: number;
  /**
   * Abhängigkeit von der Fruchtbarkeit f (0 trocken … 1 üppig): Wahrscheinlichkeit × max(0,05; 1 + k·(2f − 1)).
   * Positiv: häufiger in feuchten Gegenden, negativ: häufiger in trockenen.
   */
  readonly fertility?: number;
}

export const DECOR: readonly DecorKind[] = [
  { id: 'tint', sprite: 'decal.tint', layer: 'decal', cell: 11, chance: 0.7, clearOfResources: 0, clearOfSpawn: 0, shadow: false, warp: true },
  // Bodenarten (große, weich auslaufende Flecken): Übergänge Gras → Sand/Erde/Fels
  { id: 'sand', sprite: 'decal.sand', layer: 'decal', cell: 16, chance: 0.06, waterBoost: 3.5, clearOfResources: 0, clearOfSpawn: 0, shadow: false, warp: true, fertility: -0.6 },
  { id: 'earth', sprite: 'decal.earth', layer: 'decal', cell: 15, chance: 0.12, clearOfResources: 0, clearOfSpawn: 0, shadow: false, warp: true, fertility: -0.9 },
  { id: 'rock', sprite: 'decal.rock', layer: 'decal', cell: 24, chance: 0.12, clearOfResources: 2, clearOfSpawn: 6, shadow: false, warp: true, fertility: -1.2 },
  { id: 'dirt', sprite: 'decal.dirt', layer: 'decal', cell: 11, chance: 0.12, clearOfResources: 0, clearOfSpawn: 0, shadow: false, warp: true, fertility: -0.8 },
  { id: 'gravel', sprite: 'decal.gravel', layer: 'decal', cell: 19, chance: 0.08, clearOfResources: 0, clearOfSpawn: 0, shadow: false, warp: true, fertility: -1.0 },
  { id: 'pebbles', sprite: 'decal.pebbles', layer: 'decal', cell: 3, chance: 0.22, clearOfResources: 0, clearOfSpawn: 0, shadow: false, fertility: -0.5 },
  { id: 'tuft', sprite: 'decal.tuft', layer: 'decal', cell: 3, chance: 0.3, clearOfResources: 1, clearOfSpawn: 0, shadow: false, fertility: 0.2 },
  { id: 'flowers', sprite: 'decal.flowers', layer: 'decal', cell: 5, chance: 0.18, clearOfResources: 1, clearOfSpawn: 0, shadow: false, fertility: 0.9 },
  // Spuren der Katastrophe (Vielfalt): Blut, Müll, Laub, Brandflecken, Reifenspuren
  { id: 'blood', sprite: 'decal.blood', layer: 'decal', cell: 34, chance: 0.08, clearOfResources: 0, clearOfSpawn: 6, shadow: false, warp: true },
  { id: 'trash', sprite: 'decal.trash', layer: 'decal', cell: 26, chance: 0.1, clearOfResources: 0, clearOfSpawn: 4, shadow: false, warp: true },
  { id: 'leaves', sprite: 'decal.leaves', layer: 'decal', cell: 9, chance: 0.08, groveBoost: 4, clearOfResources: 0, clearOfSpawn: 0, shadow: false, warp: true, fertility: 0.8 },
  { id: 'burnt', sprite: 'decal.burnt', layer: 'decal', cell: 44, chance: 0.06, clearOfResources: 0, clearOfSpawn: 10, shadow: false, warp: true },
  { id: 'tracks', sprite: 'decal.tracks', layer: 'decal', cell: 38, chance: 0.05, clearOfResources: 0, clearOfSpawn: 0, shadow: false, warp: true, fertility: -0.5 },
  // Wildwuchs (models/wildwuchs.py): Waldboden, Ritzen, Pfützen
  { id: 'moss', sprite: 'decal.moss', layer: 'decal', cell: 6, chance: 0.05, groveBoost: 5, clearOfResources: 1, clearOfSpawn: 0, shadow: false, warp: true, fertility: 0.9 },
  { id: 'needles', sprite: 'decal.needles', layer: 'decal', cell: 10, chance: 0.03, groveBoost: 4, clearOfResources: 1, clearOfSpawn: 0, shadow: false, warp: true, fertility: -0.2 },
  { id: 'puddle', sprite: 'decal.puddle', layer: 'decal', cell: 22, chance: 0.06, clearOfResources: 0, clearOfSpawn: 4, shadow: false, warp: true, fertility: 0.6 },
  { id: 'weeds', sprite: 'decal.weeds', layer: 'decal', cell: 2, chance: 0.22, floor: true, clearOfResources: 0, clearOfSpawn: 0, shadow: false, warp: true },
  { id: 'lily', sprite: 'decal.lily', layer: 'decal', cell: 3, chance: 0.22, water: true, clearOfResources: 0, clearOfSpawn: 0, shadow: false, warp: true },
  { id: 'reed', sprite: 'flora.reed', layer: 'flora', cell: 2, chance: 0.85, shore: true, clearOfResources: 1, clearOfSpawn: 0, shadow: true },
  { id: 'shrub', sprite: 'flora.shrub', layer: 'flora', cell: 6, chance: 0.16, groveBoost: 4, waterBoost: 3, clearOfResources: 2, clearOfSpawn: 9, shadow: true, fertility: 1.0 },
  { id: 'tallgrass', sprite: 'flora.tallgrass', layer: 'flora', cell: 3, chance: 0.15, groveBoost: 1.6, waterBoost: 2, clearOfResources: 1, clearOfSpawn: 5, shadow: true, fertility: 0.5 },
  { id: 'wild', sprite: 'flora.wild', layer: 'flora', cell: 4, chance: 0.08, clearOfResources: 1, clearOfSpawn: 5, shadow: true, fertility: 0.7 },
  { id: 'fern', sprite: 'flora.fern', layer: 'flora', cell: 3, chance: 0.03, groveBoost: 9, waterBoost: 2, clearOfResources: 1, clearOfSpawn: 6, shadow: true, fertility: 0.9 },
  { id: 'bramble', sprite: 'flora.bramble', layer: 'flora', cell: 5, chance: 0.025, groveBoost: 5, clearOfResources: 2, clearOfSpawn: 8, shadow: true, fertility: 0.6 },
  { id: 'thicket', sprite: 'flora.thicket', layer: 'flora', cell: 7, chance: 0.03, groveBoost: 4, waterBoost: 2, clearOfResources: 2, clearOfSpawn: 9, shadow: true, fertility: 0.8 },
  { id: 'stump', sprite: 'flora.stump', layer: 'flora', cell: 8, chance: 0.025, groveBoost: 5, clearOfResources: 2, clearOfSpawn: 8, shadow: true },
  { id: 'deadwood', sprite: 'flora.deadwood', layer: 'flora', cell: 7, chance: 0.02, groveBoost: 6, clearOfResources: 2, clearOfSpawn: 8, shadow: true },
  { id: 'mushroom', sprite: 'flora.mushroom', layer: 'flora', cell: 6, chance: 0.012, groveBoost: 7, clearOfResources: 1, clearOfSpawn: 6, shadow: true, fertility: 0.8 },
  { id: 'boulder', sprite: 'flora.boulder', layer: 'flora', cell: 11, chance: 0.12, clearOfResources: 2, clearOfSpawn: 9, shadow: true, fertility: -0.7 },
  { id: 'rocks', sprite: 'flora.rocks', layer: 'flora', cell: 23, chance: 0.12, clearOfResources: 2, clearOfSpawn: 10, shadow: true, fertility: -1.0 },
];

/** Haine: großräumiges Rauschen bestimmt, wo Bäume und Sträucher gehäuft stehen. */
export const GROVE = {
  scale: 60,
  threshold: 0.42,
} as const;

/** Radius (Felder), in dem Wasser als „in der Nähe“ gilt. */
export const WATER_NEAR = 5;

/** Unterhalb dieses Zooms werden kleine Decals nicht gezeichnet (Leistung). */
export const DECOR_MIN_ZOOM_SMALL = 0.35;

/**
 * Landschaftsräume (nur Darstellung): Fruchtbarkeit = Feuchte der Karte plus Bonus in Wassernähe.
 * Bodenfarbe wird je Feld zwischen trocken – mittel – üppig eingefärbt (Multiplikation mit der Wiesentextur).
 */
export const BIOME = {
  /** Wassernähe: Bonus bis zu waterBonus, linear abfallend bis waterRange Felder. */
  waterRange: 6,
  waterBonus: 0.35,
  dry: 0xfff0d2,
  mid: 0xf2f2e2,
  lush: 0xb8d09c,
} as const;

/**
 * Laubbaum-Arten (Sprite-Indizes flora.tree.<n>, Reihenfolge aus models/flora.py und models/wildwuchs.py).
 * Wilde Bäume wählen ihre Gruppe aus großräumigem Rauschen (Artenflecken), gepflanzte Bäume tragen die Gruppe in der
 * Variante (100 + Gruppe·10 + v).
 */
export const TREE_GROUPS = {
  mixed: [0, 1, 2, 3, 4, 5],
  birch: [8, 9, 10, 2],
  oak: [13, 14, 4, 5, 11],
  chestnut: [11, 12, 15, 16, 0],
  water: [8, 9, 10, 2, 3, 1],
  young: [22, 23],
  orchard: [18, 19, 20, 21],
  avenue: [15, 16, 11, 0, 1],
  town: [15, 17, 18, 21, 0, 2, 9],
} as const;
export type TreeGroup = keyof typeof TREE_GROUPS;
export const TREE_GROUP_IDS: readonly TreeGroup[] = ['mixed', 'birch', 'oak', 'chestnut', 'water', 'young', 'orchard', 'avenue', 'town'];

/** Artenflecken der wilden Laubbäume: Rauschmaßstab (Felder), Anteil Jungbäume, Fruchtbarkeit für Ufergehölz. */
export const TREE_PATCH = { scale: 34, young: 0.14, water: 0.82 } as const;
