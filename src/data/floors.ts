/**
 * Bodenbeläge (Wiki „Stone brick“, „Concrete“, „Hazard concrete“, „Refined concrete“, „Refined hazard concrete“):
 * Laufgeschwindigkeit der Spielfigur, Abbauzeit 0,1 s. Steinpflaster wird aus Steinziegeln gelegt.
 */
export interface FloorDef {
  readonly id: number;
  readonly item: string;
  readonly name: string;
  /** Faktor auf die Laufgeschwindigkeit. */
  readonly speed: number;
  /** Sprite-Präfix (Varianten .0 …). */
  readonly sprite: string;
  /** Minimap-Farbe. */
  readonly mapColor: number;
  /** Nicht legbar (Straßen der alten Welt); Aufnehmen liefert item. */
  readonly fixed?: boolean;
}

export const FLOORS: readonly FloorDef[] = [
  { id: 1, item: 'stone-brick', name: 'Steinpflaster', speed: 1.3, sprite: 'floor.stone', mapColor: 0x6e6355 },
  { id: 2, item: 'concrete', name: 'Beton', speed: 1.4, sprite: 'floor.concrete', mapColor: 0x77756f },
  { id: 3, item: 'hazard-concrete', name: 'Gefahrenbeton', speed: 1.4, sprite: 'floor.hazard', mapColor: 0x8a7a3e },
  { id: 4, item: 'refined-concrete', name: 'Veredelter Beton', speed: 1.5, sprite: 'floor.refined', mapColor: 0x5f6266 },
  { id: 5, item: 'refined-hazard-concrete', name: 'Veredelter Gefahrenbeton', speed: 1.5, sprite: 'floor.refined-hazard', mapColor: 0x7f6f3a },
  // Straßen verlassener Siedlungen (src/sim/sites.ts)
  { id: 6, item: 'stone', name: 'Rissiger Asphalt', speed: 1.3, sprite: 'floor.asphalt', mapColor: 0x4a4a4c, fixed: true },
  // Ortsbild der festen Welt (src/sim/sites.ts): Gehweg, Acker, Mittellinie (am Süd- bzw. Ostrand des Feldes)
  { id: 7, item: 'stone-brick', name: 'Gehweg', speed: 1.3, sprite: 'floor.pavement', mapColor: 0x6a675f, fixed: true },
  { id: 8, item: 'wood', name: 'Acker', speed: 0.85, sprite: 'floor.field', mapColor: 0x6a5a38, fixed: true },
  { id: 9, item: 'stone', name: 'Asphalt mit Mittellinie', speed: 1.3, sprite: 'floor.roadline-s', mapColor: 0x4a4a4c, fixed: true },
  { id: 10, item: 'stone', name: 'Asphalt mit Mittellinie', speed: 1.3, sprite: 'floor.roadline-e', mapColor: 0x4a4a4c, fixed: true },
  // Innenböden begehbarer Häuser (lib/haus.py)
  { id: 11, item: 'wood', name: 'Dielen', speed: 1.1, sprite: 'floor.planks', mapColor: 0x6e5238, fixed: true },
  { id: 12, item: 'stone', name: 'Fliesen', speed: 1.1, sprite: 'floor.tiles', mapColor: 0x8a8880, fixed: true },
  // Landstraße (geschwungen): Belag nur für Tempo und Karte; gezeichnet wird sie entlang der Kurve (renderer drawRoads)
  { id: 13, item: 'stone', name: 'Landstraße', speed: 1.3, sprite: '', mapColor: 0x4a4a4c, fixed: true },
  // Gleisbett der stillgelegten Bahn (gezeichnet entlang der Strecke im Renderer)
  { id: 14, item: 'stone', name: 'Gleisbett', speed: 1.0, sprite: '', mapColor: 0x5e584e, fixed: true },
];

export const FLOOR_BY_ID: Readonly<Record<number, FloorDef>> = Object.fromEntries(FLOORS.map((f) => [f.id, f]));
export const FLOOR_BY_ITEM: Readonly<Record<string, FloorDef>> = Object.fromEntries(FLOORS.filter((f) => !f.fixed).map((f) => [f.item, f]));

/** Abbauzeit eines Belags (s, Wiki „Mining“: Fliesen 0,1 s) und Pinselgröße beim Legen (Felder, Tasten +/-). */
/** Asphalt (Straße). */
export const ASPHALT = 6;
export const PAVEMENT = 7;
export const FIELD = 8;
export const ROADLINE_S = 9;
export const ROADLINE_E = 10;
export const PLANKS = 11;
export const TILES = 12;
export const ROAD_FLOOR = 13;
export const RAIL_FLOOR = 14;
export const CONCRETE = 2;

export const FLOOR = { mineTime: 0.1, brushDefault: 2, brushMin: 1, brushMax: 8 } as const;
