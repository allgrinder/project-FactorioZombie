import { REGIONS } from '../data/decor';
import { valueNoise } from './rng';

/** Landschaftsregion an (x, y): Heide (trocken, offen), Moor (feucht) oder normales Land. Deterministisch aus dem Seed. */
export function regionAt(seed: number, x: number, y: number, fertility: number): 'heath' | 'moor' | null {
  const n = valueNoise(seed + 9191, x / REGIONS.scale, y / REGIONS.scale);
  if (n < REGIONS.heath && fertility < REGIONS.heathFertility) return 'heath';
  if (n > REGIONS.moor && fertility > REGIONS.moorFertility) return 'moor';
  return null;
}
