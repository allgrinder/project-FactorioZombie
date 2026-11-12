/**
 * Beutetabellen der Fundorte (eigene Werte). Jede Zeile wird einzeln gewürfelt: mit Wahrscheinlichkeit chance
 * liegen min..max Stück im Fundort. rare-Zeilen werden mit der Entfernung vom Start wahrscheinlicher
 * (Faktor bis LOOT.farBoost bei LOOT.farAt Feldern).
 */
export interface LootRow {
  readonly item: string;
  readonly min: number;
  readonly max: number;
  readonly chance: number;
  readonly rare?: boolean;
}

const R = (item: string, min: number, max: number, chance: number, rare = false): LootRow => ({ item, min, max, chance, rare });

export const LOOT_TABLES: Readonly<Record<string, readonly LootRow[]>> = {
  house: [
    R('canned-food', 1, 3, 0.7), R('snack', 1, 3, 0.5), R('water-bottle', 1, 2, 0.6), R('soda', 1, 2, 0.35), R('coffee', 1, 2, 0.25),
    R('cloth', 2, 6, 0.8), R('bandage', 1, 2, 0.35), R('empty-bottle', 1, 2, 0.4), R('knife', 1, 1, 0.3), R('baseball-bat', 1, 1, 0.2),
    R('vegetables', 1, 3, 0.25), R('antibiotics', 1, 1, 0.05, true), R('pistol', 1, 1, 0.06, true), R('firearm-magazine', 1, 3, 0.12, true),
  ],
  shed: [
    R('axe', 1, 1, 0.35), R('crowbar', 1, 1, 0.3), R('wood', 4, 12, 0.8), R('iron-stick', 2, 8, 0.5), R('iron-gear-wheel', 1, 4, 0.4),
    R('vegetables', 2, 5, 0.4), R('empty-bottle', 1, 3, 0.4), R('cloth', 1, 3, 0.3), R('repair-pack', 1, 2, 0.15),
  ],
  store: [
    R('canned-food', 3, 8, 0.9), R('snack', 3, 8, 0.8), R('soda', 2, 6, 0.7), R('water-bottle', 2, 5, 0.7), R('coffee', 1, 4, 0.5),
    R('bandage', 1, 4, 0.5), R('first-aid-kit', 1, 1, 0.2), R('antibiotics', 1, 2, 0.12, true), R('cloth', 2, 6, 0.4),
    R('radio-parts', 1, 2, 0.25, true), R('empty-bottle', 2, 4, 0.5),
  ],
  garage: [
    R('crowbar', 1, 1, 0.5), R('iron-plate', 6, 20, 0.8), R('iron-gear-wheel', 3, 10, 0.7), R('copper-cable', 6, 20, 0.6),
    R('electronic-circuit', 2, 8, 0.45), R('steel-plate', 2, 8, 0.3, true), R('repair-pack', 1, 4, 0.4), R('radio-parts', 1, 2, 0.3, true),
    R('coal', 5, 15, 0.4), R('firearm-magazine', 1, 4, 0.15, true),
  ],
  car: [
    R('iron-ore', 2, 6, 0.8), R('iron-gear-wheel', 1, 3, 0.4), R('copper-cable', 2, 6, 0.4), R('snack', 1, 2, 0.25), R('water-bottle', 1, 1, 0.25),
    R('cloth', 1, 3, 0.3), R('bandage', 1, 1, 0.15), R('crowbar', 1, 1, 0.1), R('firearm-magazine', 1, 2, 0.08, true),
  ],
  crate: [
    R('canned-food', 1, 3, 0.6), R('water-bottle', 1, 2, 0.5), R('bandage', 1, 2, 0.4), R('wood', 2, 6, 0.4), R('iron-plate', 2, 8, 0.4),
    R('firearm-magazine', 1, 3, 0.2), R('cloth', 1, 3, 0.3),
  ],
  military: [
    R('firearm-magazine', 4, 12, 0.95), R('piercing-rounds-magazine', 2, 6, 0.3, true), R('pistol', 1, 1, 0.5), R('submachine-gun', 1, 1, 0.15, true),
    R('grenade', 1, 4, 0.35), R('first-aid-kit', 1, 2, 0.5), R('canned-food', 2, 4, 0.5), R('radio-parts', 1, 2, 0.3), R('antibiotics', 1, 1, 0.15),
  ],
  trash: [
    R('iron-ore', 2, 8, 0.8), R('empty-bottle', 1, 4, 0.6), R('cloth', 1, 4, 0.5), R('wood', 1, 5, 0.4), R('snack', 1, 1, 0.15), R('iron-stick', 1, 4, 0.3),
  ],
};

export const LOOT = { farBoost: 2.5, farAt: 400 } as const;

/**
 * Fundorte auf der Karte (src/sim/sites.ts): Raster, Wahrscheinlichkeit je Zelle, Mindestabstand vom Start.
 * Arten: Dorf (Straße mit Häusern), Hof, Werkstatt mit Wracks, einzelnes Wrack mit Kiste.
 */
export const SITES = {
  cell: 72,
  chance: 0.62,
  /** Keine Fundorte näher am Start (außer dem Startfundort). */
  startFree: 40,
  /** Anteile der Arten (Rest: einzelnes Wrack). */
  village: 0.34,
  farm: 0.22,
  garage: 0.18,
  camp: 0.1,
  /** Startfundort: Schuppen, Wrack und Kiste in dieser Entfernung. */
  starter: { distMin: 20, distMax: 27 },
} as const;
