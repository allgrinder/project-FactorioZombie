/**
 * Rezepte. category bestimmt, wo das Rezept hergestellt wird:
 *  - 'crafting': Handwerk (später Montagemaschinen)
 *  - 'smelting': Öfen (Rezept wird über die Zutat gewählt)
 */
export type RecipeCategory = 'crafting' | 'smelting';

export interface ItemAmount {
  readonly item: string;
  readonly amount: number;
}

export interface RecipeDef {
  readonly id: string;
  readonly category: RecipeCategory;
  /** Herstellungszeit in Sekunden bei Geschwindigkeit 1. */
  readonly time: number;
  readonly ingredients: readonly ItemAmount[];
  readonly results: readonly ItemAmount[];
}

const ORIGINAL: RecipeDef[] = [
  { id: 'iron-plate', category: 'smelting', time: 3.2, ingredients: [{ item: 'iron-ore', amount: 1 }], results: [{ item: 'iron-plate', amount: 1 }] },
  { id: 'copper-plate', category: 'smelting', time: 3.2, ingredients: [{ item: 'copper-ore', amount: 1 }], results: [{ item: 'copper-plate', amount: 1 }] },
  { id: 'stone-brick', category: 'smelting', time: 3.2, ingredients: [{ item: 'stone', amount: 2 }], results: [{ item: 'stone-brick', amount: 1 }] },
  { id: 'copper-cable', category: 'crafting', time: 0.5, ingredients: [{ item: 'copper-plate', amount: 1 }], results: [{ item: 'copper-cable', amount: 2 }] },
  { id: 'iron-stick', category: 'crafting', time: 0.5, ingredients: [{ item: 'iron-plate', amount: 1 }], results: [{ item: 'iron-stick', amount: 2 }] },
  { id: 'stone-furnace', category: 'crafting', time: 0.5, ingredients: [{ item: 'stone', amount: 5 }], results: [{ item: 'stone-furnace', amount: 1 }] },
  { id: 'iron-gear-wheel', category: 'crafting', time: 0.5, ingredients: [{ item: 'iron-plate', amount: 2 }], results: [{ item: 'iron-gear-wheel', amount: 1 }] },
  {
    id: 'burner-inserter', category: 'crafting', time: 0.5,
    ingredients: [{ item: 'iron-gear-wheel', amount: 1 }, { item: 'iron-plate', amount: 1 }],
    results: [{ item: 'burner-inserter', amount: 1 }],
  },
  {
    id: 'transport-belt', category: 'crafting', time: 0.5,
    ingredients: [{ item: 'iron-gear-wheel', amount: 1 }, { item: 'iron-plate', amount: 1 }],
    results: [{ item: 'transport-belt', amount: 2 }],
  },
  {
    id: 'underground-belt', category: 'crafting', time: 1,
    ingredients: [{ item: 'iron-plate', amount: 10 }, { item: 'transport-belt', amount: 5 }],
    results: [{ item: 'underground-belt', amount: 2 }],
  },
  {
    id: 'splitter', category: 'crafting', time: 1,
    ingredients: [{ item: 'electronic-circuit', amount: 5 }, { item: 'iron-plate', amount: 5 }, { item: 'transport-belt', amount: 4 }],
    results: [{ item: 'splitter', amount: 1 }],
  },
  { id: 'steel-plate', category: 'smelting', time: 16, ingredients: [{ item: 'iron-plate', amount: 5 }], results: [{ item: 'steel-plate', amount: 1 }] },
  { id: 'steel-chest', category: 'crafting', time: 0.5, ingredients: [{ item: 'steel-plate', amount: 8 }], results: [{ item: 'steel-chest', amount: 1 }] },
  {
    id: 'steel-furnace', category: 'crafting', time: 3,
    ingredients: [{ item: 'steel-plate', amount: 6 }, { item: 'stone-brick', amount: 10 }], results: [{ item: 'steel-furnace', amount: 1 }],
  },
  {
    id: 'fast-inserter', category: 'crafting', time: 0.5,
    ingredients: [{ item: 'electronic-circuit', amount: 2 }, { item: 'inserter', amount: 1 }, { item: 'iron-plate', amount: 2 }],
    results: [{ item: 'fast-inserter', amount: 1 }],
  },
  {
    id: 'military-science-pack', category: 'crafting', time: 10,
    ingredients: [{ item: 'grenade', amount: 1 }, { item: 'piercing-rounds-magazine', amount: 1 }, { item: 'stone-wall', amount: 2 }],
    results: [{ item: 'military-science-pack', amount: 2 }],
  },
  {
    id: 'medium-electric-pole', category: 'crafting', time: 0.5,
    ingredients: [{ item: 'copper-cable', amount: 2 }, { item: 'iron-stick', amount: 4 }, { item: 'steel-plate', amount: 2 }],
    results: [{ item: 'medium-electric-pole', amount: 1 }],
  },
  { id: 'firearm-magazine', category: 'crafting', time: 1, ingredients: [{ item: 'iron-plate', amount: 4 }], results: [{ item: 'firearm-magazine', amount: 1 }] },
  {
    id: 'piercing-rounds-magazine', category: 'crafting', time: 6,
    ingredients: [{ item: 'copper-plate', amount: 2 }, { item: 'firearm-magazine', amount: 2 }, { item: 'steel-plate', amount: 1 }],
    results: [{ item: 'piercing-rounds-magazine', amount: 2 }],
  },
  {
    id: 'pistol', category: 'crafting', time: 5,
    ingredients: [{ item: 'copper-plate', amount: 5 }, { item: 'iron-plate', amount: 5 }], results: [{ item: 'pistol', amount: 1 }],
  },
  {
    id: 'submachine-gun', category: 'crafting', time: 10,
    ingredients: [{ item: 'copper-plate', amount: 5 }, { item: 'iron-gear-wheel', amount: 10 }, { item: 'iron-plate', amount: 10 }],
    results: [{ item: 'submachine-gun', amount: 1 }],
  },
  {
    id: 'gun-turret', category: 'crafting', time: 8,
    ingredients: [{ item: 'copper-plate', amount: 10 }, { item: 'iron-gear-wheel', amount: 10 }, { item: 'iron-plate', amount: 20 }],
    results: [{ item: 'gun-turret', amount: 1 }],
  },
  {
    id: 'repair-pack', category: 'crafting', time: 0.5,
    ingredients: [{ item: 'electronic-circuit', amount: 2 }, { item: 'iron-gear-wheel', amount: 2 }], results: [{ item: 'repair-pack', amount: 1 }],
  },
  { id: 'grenade', category: 'crafting', time: 8, ingredients: [{ item: 'coal', amount: 10 }, { item: 'iron-plate', amount: 5 }], results: [{ item: 'grenade', amount: 1 }] },
  { id: 'stone-wall', category: 'crafting', time: 0.5, ingredients: [{ item: 'stone-brick', amount: 5 }], results: [{ item: 'stone-wall', amount: 1 }] },
  {
    id: 'lamp', category: 'crafting', time: 0.5,
    ingredients: [{ item: 'copper-cable', amount: 3 }, { item: 'electronic-circuit', amount: 1 }, { item: 'iron-plate', amount: 1 }],
    results: [{ item: 'lamp', amount: 1 }],
  },
  { id: 'landfill', category: 'crafting', time: 0.5, ingredients: [{ item: 'stone', amount: 50 }], results: [{ item: 'landfill', amount: 1 }] },
  {
    id: 'pipe-to-ground', category: 'crafting', time: 0.5,
    ingredients: [{ item: 'iron-plate', amount: 5 }, { item: 'pipe', amount: 10 }], results: [{ item: 'pipe-to-ground', amount: 2 }],
  },
  {
    id: 'solar-panel', category: 'crafting', time: 10,
    ingredients: [{ item: 'copper-plate', amount: 5 }, { item: 'electronic-circuit', amount: 15 }, { item: 'steel-plate', amount: 5 }],
    results: [{ item: 'solar-panel', amount: 1 }],
  },
  { id: 'wooden-chest', category: 'crafting', time: 0.5, ingredients: [{ item: 'wood', amount: 2 }], results: [{ item: 'wooden-chest', amount: 1 }] },
  { id: 'electronic-circuit', category: 'crafting', time: 0.5, ingredients: [{ item: 'iron-plate', amount: 1 }, { item: 'copper-cable', amount: 3 }], results: [{ item: 'electronic-circuit', amount: 1 }] },
  { id: 'pipe', category: 'crafting', time: 0.5, ingredients: [{ item: 'iron-plate', amount: 1 }], results: [{ item: 'pipe', amount: 1 }] },
  { id: 'offshore-pump', category: 'crafting', time: 0.5, ingredients: [{ item: 'pipe', amount: 3 }, { item: 'iron-gear-wheel', amount: 2 }], results: [{ item: 'offshore-pump', amount: 1 }] },
  { id: 'boiler', category: 'crafting', time: 0.5, ingredients: [{ item: 'stone-furnace', amount: 1 }, { item: 'pipe', amount: 4 }], results: [{ item: 'boiler', amount: 1 }] },
  {
    id: 'steam-engine', category: 'crafting', time: 0.5,
    ingredients: [{ item: 'iron-gear-wheel', amount: 8 }, { item: 'pipe', amount: 5 }, { item: 'iron-plate', amount: 10 }],
    results: [{ item: 'steam-engine', amount: 1 }],
  },
  { id: 'small-electric-pole', category: 'crafting', time: 0.5, ingredients: [{ item: 'copper-cable', amount: 2 }, { item: 'wood', amount: 1 }], results: [{ item: 'small-electric-pole', amount: 2 }] },
  {
    id: 'inserter', category: 'crafting', time: 0.5,
    ingredients: [{ item: 'electronic-circuit', amount: 1 }, { item: 'iron-gear-wheel', amount: 1 }, { item: 'iron-plate', amount: 1 }],
    results: [{ item: 'inserter', amount: 1 }],
  },
  {
    id: 'long-handed-inserter', category: 'crafting', time: 0.5,
    ingredients: [{ item: 'iron-gear-wheel', amount: 1 }, { item: 'iron-plate', amount: 1 }, { item: 'inserter', amount: 1 }],
    results: [{ item: 'long-handed-inserter', amount: 1 }],
  },
  {
    id: 'assembling-machine-1', category: 'crafting', time: 0.5,
    ingredients: [{ item: 'electronic-circuit', amount: 3 }, { item: 'iron-gear-wheel', amount: 5 }, { item: 'iron-plate', amount: 9 }],
    results: [{ item: 'assembling-machine-1', amount: 1 }],
  },
  {
    id: 'lab', category: 'crafting', time: 2,
    ingredients: [{ item: 'electronic-circuit', amount: 10 }, { item: 'iron-gear-wheel', amount: 10 }, { item: 'transport-belt', amount: 4 }],
    results: [{ item: 'lab', amount: 1 }],
  },
  {
    id: 'automation-science-pack', category: 'crafting', time: 5,
    ingredients: [{ item: 'copper-plate', amount: 1 }, { item: 'iron-gear-wheel', amount: 1 }],
    results: [{ item: 'automation-science-pack', amount: 1 }],
  },
  {
    id: 'logistic-science-pack', category: 'crafting', time: 6,
    ingredients: [{ item: 'inserter', amount: 1 }, { item: 'transport-belt', amount: 1 }],
    results: [{ item: 'logistic-science-pack', amount: 1 }],
  },
  { id: 'iron-chest', category: 'crafting', time: 0.5, ingredients: [{ item: 'iron-plate', amount: 8 }], results: [{ item: 'iron-chest', amount: 1 }] },
  { id: 'heavy-armor', category: 'crafting', time: 8, ingredients: [{ item: 'copper-plate', amount: 100 }, { item: 'steel-plate', amount: 50 }], results: [{ item: 'heavy-armor', amount: 1 }] },
  {
    id: 'radar', category: 'crafting', time: 0.5,
    ingredients: [{ item: 'electronic-circuit', amount: 5 }, { item: 'iron-gear-wheel', amount: 5 }, { item: 'iron-plate', amount: 10 }],
    results: [{ item: 'radar', amount: 1 }],
  },
];

const I = (item: string, amount: number): ItemAmount => ({ item, amount });
const craft = (id: string, time: number, ingredients: ItemAmount[], amount = 1): RecipeDef => ({ id, category: 'crafting', time, ingredients, results: [I(id, amount)] });

/** Neue Rezepte (eigene Werte, docs/GAME_DATA.md Abschnitt „Überleben“ und „Verteidigung“). */
const SURVIVAL: RecipeDef[] = [
  // Akku ohne Chemie (das Batterie-Rezept des Vorgängers entfällt)
  craft('accumulator', 10, [I('iron-plate', 4), I('copper-cable', 20), I('electronic-circuit', 5)]),
  // Nahkampf
  craft('spear', 1, [I('wood', 2), I('iron-plate', 1)]),
  craft('knife', 1, [I('iron-plate', 2), I('wood', 1)]),
  craft('baseball-bat', 2, [I('wood', 4)]),
  craft('axe', 2, [I('wood', 2), I('iron-plate', 3)]),
  craft('crowbar', 2, [I('iron-plate', 4)]),
  // Verteidigung
  craft('wooden-barricade', 0.5, [I('wood', 3)]),
  craft('hwall-wood', 0.5, [I('wood', 3)]),
  craft('hwall-brick', 1, [I('stone-brick', 4)]),
  craft('hwin-wood', 1, [I('wood', 3)]),
  craft('hwin-brick', 1, [I('stone-brick', 2), I('wood', 1)]),
  craft('hdoor', 1, [I('wood', 4), I('iron-plate', 1)]),
  craft('gate', 1, [I('wood', 4), I('iron-plate', 2), I('iron-gear-wheel', 1)]),
  craft('barbed-wire', 0.5, [I('iron-stick', 2), I('iron-plate', 1)], 2),
  craft('spike-trap', 1, [I('wood', 2), I('iron-stick', 4)]),
  craft('noise-lure', 2, [I('electronic-circuit', 1), I('iron-plate', 1)]),
  // Versorgung
  craft('bandage', 1, [I('cloth', 2)]),
  craft('first-aid-kit', 3, [I('bandage', 3), I('iron-plate', 1)]),
  craft('antibiotics', 12, [I('vegetables', 6), I('water-bottle', 1), I('coal', 2)]),
  craft('empty-bottle', 1, [I('iron-plate', 2)]),
  { id: 'stew', category: 'crafting', time: 4, ingredients: [I('vegetables', 2), I('water-bottle', 1)], results: [I('stew', 1), I('empty-bottle', 1)] },
  craft('bed', 2, [I('wood', 6), I('cloth', 3)]),
  craft('garden', 3, [I('wood', 8), I('vegetables', 2)]),
  craft('rain-barrel', 2, [I('wood', 6), I('iron-plate', 4)]),
  craft('campfire', 1, [I('stone', 10), I('wood', 4)]),
  craft('brazier', 1, [I('iron-plate', 4), I('iron-stick', 2)]),
  craft('floodlight', 2, [I('iron-plate', 5), I('copper-cable', 6), I('electronic-circuit', 2)]),
  craft('watchtower', 4, [I('wood', 30), I('iron-plate', 10), I('stone-brick', 10)]),
  craft('scavenger-camp', 3, [I('wood', 20), I('iron-plate', 10), I('iron-gear-wheel', 5)]),
  craft('backpack', 3, [I('cloth', 10), I('iron-stick', 2)]),
  craft('radio-tower', 20, [I('steel-plate', 50), I('electronic-circuit', 50), I('copper-cable', 100), I('radio-parts', 5)]),
];

const list: RecipeDef[] = [...ORIGINAL, ...SURVIVAL];

export const RECIPES: Readonly<Record<string, RecipeDef>> = Object.freeze(Object.fromEntries(list.map((r) => [r.id, r])));
export const RECIPE_LIST: readonly RecipeDef[] = list;

export function recipe(id: string): RecipeDef {
  const r = RECIPES[id];
  if (!r) throw new Error(`Unbekanntes Rezept: ${id}`);
  return r;
}

/** Lässt sich das Item in diesem Spiel herstellen (Rezept vorhanden)? Gestrichene Inhalte des Vorgängers nicht. */
export function isCraftable(itemId: string): boolean {
  return list.some((r) => r.results.some((x) => x.item === itemId));
}

/** Schmelzrezept zu einer Zutat (z. B. Eisenerz -> Eisenplatte). */
export function smeltingRecipeFor(itemId: string): RecipeDef | undefined {
  return list.find((r) => r.category === 'smelting' && r.ingredients[0]?.item === itemId);
}

/** Rezept, das ein Item per Hand herstellt. */
export function craftingRecipeFor(itemId: string): RecipeDef | undefined {
  return list.find((r) => r.category === 'crafting' && r.results.some((x) => x.item === itemId));
}
