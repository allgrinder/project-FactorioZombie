import { MJ } from './time';

/**
 * Item-Definitionen. Neue Items: hier eintragen, Symbol in assets/blender/models/items.py ergänzen.
 * Quellen: docs/GAME_DATA.md
 */
export interface ItemDef {
  readonly id: string;
  readonly name: string;
  readonly stackSize: number;
  /** Brennwert in Joule (nur Brennstoffe). */
  readonly fuelValue?: number;
  /** Gebäude, das dieses Item platziert. */
  readonly placeResult?: string;
  /** Sortierreihenfolge im Inventar. */
  readonly order: number;
}

const list: ItemDef[] = [
  { id: 'iron-ore', name: 'Eisenschrott', stackSize: 50, order: 10 },
  { id: 'coal', name: 'Kohle', stackSize: 50, fuelValue: 4 * MJ, order: 11 },
  { id: 'wood', name: 'Holz', stackSize: 100, fuelValue: 2 * MJ, order: 9 },
  { id: 'wooden-chest', name: 'Holzkiste', stackSize: 50, placeResult: 'wooden-chest', order: 33 },
  { id: 'stone', name: 'Bauschutt', stackSize: 50, order: 12 },
  { id: 'iron-plate', name: 'Eisenplatte', stackSize: 100, order: 20 },
  { id: 'iron-gear-wheel', name: 'Zahnrad', stackSize: 100, order: 21 },
  { id: 'copper-ore', name: 'Kupferschrott', stackSize: 50, order: 13 },
  { id: 'copper-plate', name: 'Kupferplatte', stackSize: 100, order: 22 },
  { id: 'copper-cable', name: 'Kupferkabel', stackSize: 200, order: 23 },
  { id: 'iron-stick', name: 'Eisenstange', stackSize: 100, order: 24 },
  { id: 'stone-brick', name: 'Steinziegel', stackSize: 100, order: 25 },
  { id: 'transport-belt', name: 'Förderband', stackSize: 100, placeResult: 'transport-belt', order: 30 },
  { id: 'fast-transport-belt', name: 'Schnelles Förderband', stackSize: 100, placeResult: 'fast-transport-belt', order: 35 },
  { id: 'underground-belt', name: 'Untergrundband', stackSize: 50, placeResult: 'underground-belt', order: 36 },
  { id: 'splitter', name: 'Splitter', stackSize: 50, placeResult: 'splitter', order: 37 },
  { id: 'fast-underground-belt', name: 'Schnelles Untergrundband', stackSize: 50, placeResult: 'fast-underground-belt', order: 38 },
  { id: 'fast-splitter', name: 'Schneller Splitter', stackSize: 50, placeResult: 'fast-splitter', order: 39 },
  { id: 'burner-inserter', name: 'Brennstoff-Greifarm', stackSize: 50, placeResult: 'burner-inserter', order: 31 },
  { id: 'burner-mining-drill', name: 'Brennstoff-Bohrer', stackSize: 50, placeResult: 'burner-mining-drill', order: 32 },
  { id: 'stone-furnace', name: 'Steinofen', stackSize: 50, placeResult: 'stone-furnace', order: 33 },
  { id: 'iron-chest', name: 'Eisenkiste', stackSize: 50, placeResult: 'iron-chest', order: 34 },
  { id: 'electronic-circuit', name: 'Elektronischer Schaltkreis', stackSize: 200, order: 26 },
  { id: 'pipe', name: 'Rohr', stackSize: 100, placeResult: 'pipe', order: 40 },
  { id: 'offshore-pump', name: 'Uferpumpe', stackSize: 20, placeResult: 'offshore-pump', order: 41 },
  { id: 'boiler', name: 'Kessel', stackSize: 50, placeResult: 'boiler', order: 42 },
  { id: 'steam-engine', name: 'Dampfmaschine', stackSize: 10, placeResult: 'steam-engine', order: 43 },
  { id: 'small-electric-pole', name: 'Kleiner Strommast', stackSize: 50, placeResult: 'small-electric-pole', order: 44 },
  { id: 'electric-mining-drill', name: 'Elektrischer Bohrer', stackSize: 50, placeResult: 'electric-mining-drill', order: 45 },
  { id: 'inserter', name: 'Greifarm', stackSize: 50, placeResult: 'inserter', order: 46 },
  { id: 'assembling-machine-1', name: 'Montagemaschine', stackSize: 50, placeResult: 'assembling-machine-1', order: 48 },
  { id: 'lab', name: 'Labor', stackSize: 10, placeResult: 'lab', order: 49 },
  { id: 'automation-science-pack', name: 'Automatisierungs-Wissenschaftspaket', stackSize: 200, order: 60 },
  { id: 'logistic-science-pack', name: 'Logistik-Wissenschaftspaket', stackSize: 200, order: 61 },
  { id: 'steel-plate', name: 'Stahlplatte', stackSize: 100, order: 27 },
  { id: 'engine-unit', name: 'Motor', stackSize: 50, order: 28 },
  { id: 'landfill', name: 'Landaufschüttung', stackSize: 100, order: 70 },
  { id: 'steel-chest', name: 'Stahlkiste', stackSize: 50, placeResult: 'steel-chest', order: 35 },
  { id: 'steel-furnace', name: 'Stahlofen', stackSize: 50, placeResult: 'steel-furnace', order: 36 },
  { id: 'fast-inserter', name: 'Schneller Greifarm', stackSize: 50, placeResult: 'fast-inserter', order: 47 },
  { id: 'bulk-inserter', name: 'Massengreifarm', stackSize: 50, placeResult: 'bulk-inserter', order: 48 },
  { id: 'medium-electric-pole', name: 'Mittlerer Strommast', stackSize: 50, placeResult: 'medium-electric-pole', order: 44 },
  { id: 'big-electric-pole', name: 'Großer Strommast', stackSize: 50, placeResult: 'big-electric-pole', order: 44 },
  { id: 'lamp', name: 'Lampe', stackSize: 50, placeResult: 'lamp', order: 50 },
  { id: 'assembling-machine-2', name: 'Montagemaschine 2', stackSize: 50, placeResult: 'assembling-machine-2', order: 48 },
  { id: 'pipe-to-ground', name: 'Rohr unterirdisch', stackSize: 50, placeResult: 'pipe-to-ground', order: 40 },
  { id: 'pump', name: 'Pumpe', stackSize: 50, placeResult: 'pump', order: 41 },
  { id: 'storage-tank', name: 'Lagertank', stackSize: 50, placeResult: 'storage-tank', order: 41 },
  { id: 'explosives', name: 'Sprengstoff', stackSize: 50, order: 84 },
  { id: 'military-science-pack', name: 'Militär-Wissenschaftspaket', stackSize: 200, order: 62 },
  { id: 'electric-furnace', name: 'Elektrischer Ofen', stackSize: 50, placeResult: 'electric-furnace', order: 36 },
  { id: 'substation', name: 'Umspannwerk', stackSize: 50, placeResult: 'substation', order: 44 },
  { id: 'solar-panel', name: 'Solarpanel', stackSize: 50, placeResult: 'solar-panel', order: 45 },
  { id: 'accumulator', name: 'Akkumulator', stackSize: 50, placeResult: 'accumulator', order: 46 },
  { id: 'express-transport-belt', name: 'Express-Förderband', stackSize: 100, placeResult: 'express-transport-belt', order: 39 },
  { id: 'express-underground-belt', name: 'Express-Untergrundband', stackSize: 50, placeResult: 'express-underground-belt', order: 39 },
  { id: 'express-splitter', name: 'Express-Splitter', stackSize: 50, placeResult: 'express-splitter', order: 39 },
  { id: 'long-handed-inserter', name: 'Langer Greifarm', stackSize: 50, placeResult: 'long-handed-inserter', order: 47 },
  // Spätes Spiel des Vorgängers: Montage 3, Beton
  { id: 'assembling-machine-3', name: 'Montagemaschine 3', stackSize: 50, placeResult: 'assembling-machine-3', order: 54 },
  { id: 'concrete', name: 'Beton', stackSize: 100, order: 16 },
  { id: 'hazard-concrete', name: 'Gefahrenbeton', stackSize: 100, order: 17 },
  { id: 'refined-concrete', name: 'Veredelter Beton', stackSize: 100, order: 18 },
  { id: 'refined-hazard-concrete', name: 'Veredelter Gefahrenbeton', stackSize: 100, order: 19 },
  { id: 'radar', name: 'Radar', stackSize: 50, placeResult: 'radar', order: 134 },
  // Militär (Wiki „Firearm magazine“, „Piercing rounds magazine“, „Gun turret“, „Stone wall“, „Pistol“, „Submachine gun“)
  { id: 'firearm-magazine', name: 'Magazin', stackSize: 200, order: 130 },
  { id: 'piercing-rounds-magazine', name: 'Panzerbrechendes Magazin', stackSize: 200, order: 131 },
  { id: 'pistol', name: 'Pistole', stackSize: 5, order: 132 },
  { id: 'submachine-gun', name: 'Maschinenpistole', stackSize: 5, order: 133 },
  { id: 'gun-turret', name: 'MG-Turm', stackSize: 50, placeResult: 'gun-turret', order: 134 },
  { id: 'stone-wall', name: 'Steinmauer', stackSize: 100, placeResult: 'stone-wall', order: 135 },
  { id: 'repair-pack', name: 'Reparaturset', stackSize: 100, order: 136 },
  // Rüstung (Wiki-Infobox, src/data/armor.ts)
  { id: 'heavy-armor', name: 'Schwere Rüstung', stackSize: 1, order: 137 },
  // Wurfgegenstände (Wiki „Grenade“, „Cliff explosives“)
  { id: 'grenade', name: 'Granate', stackSize: 100, order: 137 },
  { id: 'cliff-explosives', name: 'Klippensprengstoff', stackSize: 20, order: 138 },
  // ---- Letzte Schicht: Überleben, Beute, Nahkampf, Verteidigung (eigene Entwürfe; Werte in src/data/survival.ts, enemies.ts)
  { id: 'cloth', name: 'Stoff', stackSize: 50, order: 15 },
  { id: 'radio-parts', name: 'Funkteile', stackSize: 20, order: 15.5 },
  { id: 'canned-food', name: 'Konserve', stackSize: 20, order: 150 },
  { id: 'snack', name: 'Knabberzeug', stackSize: 20, order: 151 },
  { id: 'vegetables', name: 'Gemüse', stackSize: 20, order: 152 },
  { id: 'stew', name: 'Eintopf', stackSize: 10, order: 153 },
  { id: 'water-bottle', name: 'Wasserflasche', stackSize: 10, order: 154 },
  { id: 'empty-bottle', name: 'Leere Flasche', stackSize: 10, order: 155 },
  { id: 'soda', name: 'Limonade', stackSize: 20, order: 156 },
  { id: 'coffee', name: 'Kaffee', stackSize: 20, order: 157 },
  { id: 'bandage', name: 'Verband', stackSize: 20, order: 160 },
  { id: 'first-aid-kit', name: 'Verbandskasten', stackSize: 10, order: 161 },
  { id: 'antibiotics', name: 'Antibiotika', stackSize: 10, order: 162 },
  { id: 'axe', name: 'Axt', stackSize: 5, order: 125 },
  { id: 'crowbar', name: 'Brecheisen', stackSize: 5, order: 126 },
  { id: 'baseball-bat', name: 'Baseballschläger', stackSize: 5, order: 127 },
  { id: 'spear', name: 'Speer', stackSize: 10, order: 128 },
  { id: 'knife', name: 'Messer', stackSize: 5, order: 129 },
  { id: 'noise-lure', name: 'Lockvogel', stackSize: 20, order: 137.5 },
  { id: 'wooden-barricade', name: 'Holzbarrikade', stackSize: 100, placeResult: 'wooden-barricade', order: 134.5 },
  // Hausbau (Block C): Wände verbinden sich, Fenster und Türen mit R drehen
  { id: 'hwall-wood', name: 'Bretterwand', stackSize: 100, placeResult: 'hwall-wood', order: 134.51 },
  { id: 'hwall-brick', name: 'Ziegelwand', stackSize: 100, placeResult: 'hwall-brick', order: 134.52 },
  { id: 'hwin-wood', name: 'Holzfenster', stackSize: 50, placeResult: 'hwin-wood', order: 134.53 },
  { id: 'hwin-brick', name: 'Fenster (Ziegel)', stackSize: 50, placeResult: 'hwin-brick', order: 134.54 },
  { id: 'hdoor', name: 'Tür', stackSize: 50, placeResult: 'hdoor', order: 134.55 },
  { id: 'gate', name: 'Tor', stackSize: 50, placeResult: 'gate', order: 135.2 },
  { id: 'barbed-wire', name: 'Stacheldraht', stackSize: 100, placeResult: 'barbed-wire', order: 135.4 },
  { id: 'spike-trap', name: 'Nagelfalle', stackSize: 50, placeResult: 'spike-trap', order: 135.6 },
  { id: 'bed', name: 'Feldbett', stackSize: 5, placeResult: 'bed', order: 170 },
  { id: 'garden', name: 'Gemüsebeet', stackSize: 20, placeResult: 'garden', order: 171 },
  { id: 'rain-barrel', name: 'Regentonne', stackSize: 20, placeResult: 'rain-barrel', order: 172 },
  { id: 'radio-tower', name: 'Funkturm', stackSize: 1, placeResult: 'radio-tower', order: 173 },
  { id: 'campfire', name: 'Lagerfeuer', stackSize: 5, placeResult: 'campfire', order: 169 },
  { id: 'brazier', name: 'Feuerschale', stackSize: 20, placeResult: 'brazier', order: 169.5 },
  { id: 'floodlight', name: 'Scheinwerfer', stackSize: 20, placeResult: 'floodlight', order: 50.5 },
  { id: 'watchtower', name: 'Wachturm', stackSize: 10, placeResult: 'watchtower', order: 134.2 },
  { id: 'scavenger-camp', name: 'Vorratslager', stackSize: 5, placeResult: 'scavenger-camp', order: 32 },
  { id: 'scavenger-kit', name: 'Sammler-Ausrüstung', stackSize: 10, order: 32.1 },
  { id: 'backpack', name: 'Rucksack', stackSize: 1, order: 140.5 },
  { id: 'fuel-can', name: 'Benzinkanister', stackSize: 10, fuelValue: 25 * MJ, order: 11.5 },
];

export const ITEMS: Readonly<Record<string, ItemDef>> = Object.freeze(
  Object.fromEntries(list.map((i) => [i.id, i])),
);

export const ITEM_IDS: readonly string[] = list.map((i) => i.id);

export function item(id: string): ItemDef {
  const def = ITEMS[id];
  if (!def) throw new Error(`Unbekanntes Item: ${id}`);
  return def;
}

export function isFuel(id: string): boolean {
  return (ITEMS[id]?.fuelValue ?? 0) > 0;
}
