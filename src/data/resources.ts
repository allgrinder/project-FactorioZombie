/**
 * Abbaubare Ressourcen auf der Karte. Index 0 ist reserviert für "keine Ressource".
 * Neue Ressourcen hinten anfügen (Index wird im Spielstand gespeichert).
 */
export interface ResourceDef {
  readonly id: string;
  readonly index: number;
  readonly name: string;
  /** Ergebnis-Item beim Abbau. */
  readonly result: string;
  /** Abbauzeit in Sekunden bei Abbaugeschwindigkeit 1. */
  readonly miningTime: number;
  /** Mengenschwellen für die sichtbare Dichte (aufsteigend, Anzahl = Dichtestufen - 1). */
  readonly densityThresholds: readonly number[];
  /** Farbe auf der Übersichtskarte (sRGB). */
  readonly mapColor: number;
  /** Flüssige Ressource (Rohöl): Menge = Ergiebigkeit in Tausendstel Prozent, nur per Pumpjack. */
  readonly fluid?: boolean;
  /** Abbau braucht diese Flüssigkeit (Einheiten je Erz) im elektrischen Bohrer, nicht von Hand (Wiki „Uranium ore“). */
  readonly requiresFluid?: { readonly fluid: string; readonly amount: number; readonly tech: string };
}

export const RESOURCES: readonly ResourceDef[] = [
  { id: 'iron-ore', index: 1, name: 'Eisenschrott', result: 'iron-ore', miningTime: 1, densityThresholds: [150, 400, 800], mapColor: 0x6f8aa0 },
  { id: 'coal', index: 2, name: 'Kohle', result: 'coal', miningTime: 1, densityThresholds: [150, 400, 800], mapColor: 0x1e1d1c },
  { id: 'stone', index: 3, name: 'Bauschutt', result: 'stone', miningTime: 1, densityThresholds: [150, 400, 800], mapColor: 0xb09e7c },
  { id: 'copper-ore', index: 4, name: 'Kupferschrott', result: 'copper-ore', miningTime: 1, densityThresholds: [150, 400, 800], mapColor: 0xc0683a },
  { id: 'crude-oil', index: 5, name: 'Rohöl', result: 'crude-oil', miningTime: 1, densityThresholds: [80_000, 150_000, 250_000], mapColor: 0xc032c0, fluid: true },
  // Wiki „Uranium ore“: Abbauzeit 2, 10 Schwefelsäure je 10 Erz, Forschung „Uranabbau“
  {
    id: 'uranium-ore', index: 6, name: 'Uranerz', result: 'uranium-ore', miningTime: 2, densityThresholds: [150, 400, 800], mapColor: 0x6cc23a,
    requiresFluid: { fluid: 'sulfuric-acid', amount: 1, tech: 'uranium-mining' },
  },
];

export const RESOURCE_BY_INDEX: readonly (ResourceDef | undefined)[] = (() => {
  const arr: (ResourceDef | undefined)[] = [undefined];
  for (const r of RESOURCES) arr[r.index] = r;
  return arr;
})();

export function resourceById(id: string): ResourceDef {
  const r = RESOURCES.find((x) => x.id === id);
  if (!r) throw new Error(`Unbekannte Ressource: ${id}`);
  return r;
}

/** Dichtestufe 0..n für die Darstellung. */
export function densityLevel(def: ResourceDef, amount: number): number {
  let lvl = 0;
  for (const t of def.densityThresholds) if (amount >= t) lvl++;
  return lvl;
}
