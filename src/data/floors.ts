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
];

export const FLOOR_BY_ID: Readonly<Record<number, FloorDef>> = Object.fromEntries(FLOORS.map((f) => [f.id, f]));
export const FLOOR_BY_ITEM: Readonly<Record<string, FloorDef>> = Object.fromEntries(FLOORS.filter((f) => !f.fixed).map((f) => [f.item, f]));

/** Abbauzeit eines Belags (s, Wiki „Mining“: Fliesen 0,1 s) und Pinselgröße beim Legen (Felder, Tasten +/-). */
/** Asphalt (Straße). */
export const ASPHALT = 6;

export const FLOOR = { mineTime: 0.1, brushDefault: 2, brushMin: 1, brushMax: 8 } as const;
