/** Flüssigkeiten. Mengen im Spiel in Einheiten; intern ganzzahlig in Tausendstel (FLUID_UNIT). */
export const FLUID_UNIT = 1000;

export interface FluidDef {
  readonly id: string;
  readonly name: string;
  /** Wärmekapazität (J je Einheit und °C). */
  readonly heatCapacity: number;
  readonly defaultTemperature: number;
  /** Darstellungsfarbe (sRGB) */
  readonly color: number;
}

export const FLUIDS: Readonly<Record<string, FluidDef>> = {
  water: { id: 'water', name: 'Wasser', heatCapacity: 200, defaultTemperature: 15, color: 0x3a6f9a },
  steam: { id: 'steam', name: 'Dampf', heatCapacity: 200, defaultTemperature: 165, color: 0xd8d8d8 },
};

export function isFluid(id: string): boolean {
  return id in FLUIDS;
}

/** Energie in Joule, die eine Einheit Dampf bei Zieltemperatur gegenüber Wasser trägt. */
export function steamEnergyPerUnit(targetTemperature: number): number {
  const w = FLUIDS.water;
  return (targetTemperature - w.defaultTemperature) * w.heatCapacity;
}

/** Sehr dunkle Flüssigkeiten aufhellen, damit der Balken vor dunklem Grund sichtbar ist. */
export function visibleFluidColor(c: number): number {
  const r = (c >> 16) & 255;
  const g = (c >> 8) & 255;
  const b = c & 255;
  const lum = 0.3 * r + 0.59 * g + 0.11 * b;
  if (lum >= 70) return c;
  const k = (70 - lum) / 70;
  const mix = (v: number, t: number) => Math.round(v + (t - v) * k * 0.75);
  return (mix(r, 150) << 16) | (mix(g, 120) << 8) | mix(b, 90);
}

