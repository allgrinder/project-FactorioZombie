import { DECOR, type DecorKind, GROVE, WATER_NEAR } from '../data/decor';
import { MAPGEN } from '../data/mapgen';
import type { GameMap } from '../sim/map';
import { hash01, valueNoise } from '../sim/rng';

export interface DecorItem {
  kind: DecorKind;
  /** Variante (Index in der Spriteliste). */
  variant: number;
  /** Weltposition (Felder) des Ankerpunkts (Stammfuß bzw. Mitte). */
  x: number;
  y: number;
  /** Ganzzahliges Feld unter dem Anker. */
  tx: number;
  ty: number;
  /** Drehung (rad) und Streckung für flache Flecken. */
  rot: number;
  sx: number;
  sy: number;
}

/**
 * Deterministische Dekoration je Chunk (nur Darstellung). Hängt allein vom Seed und der
 * Ausgangskarte ab, nicht vom Spielverlauf; Gebäude blenden Flora beim Zeichnen aus.
 */
export class DecorField {
  private readonly cache = new Map<number, DecorItem[]>();

  constructor(
    private readonly map: GameMap,
    private readonly seed: number,
    /** Anzahl Varianten je Sprite-Präfix (aus dem Manifest). */
    private readonly variants: (prefix: string) => number,
    /** Fruchtbarkeit 0..1 je Feld (Landschaftsräume). */
    private readonly fertility: (tx: number, ty: number) => number = () => 0.5,
  ) {}

  chunk(cx: number, cy: number): DecorItem[] {
    const key = (cx + 32768) * 65536 + (cy + 32768);
    let list = this.cache.get(key);
    if (!list) {
      list = this.generate(cx, cy);
      this.cache.set(key, list);
    }
    return list;
  }

  private waterWithin(x: number, y: number, r: number): boolean {
    for (let dy = -r; dy <= r; dy += r > 2 ? 2 : 1)
      for (let dx = -r; dx <= r; dx += r > 2 ? 2 : 1) if (this.map.isWater(x + dx, y + dy)) return true;
    return false;
  }

  private landWithin(x: number, y: number, r: number): boolean {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (!this.map.isWater(x + dx, y + dy)) return true;
    return false;
  }

  private nearResource(x: number, y: number, r: number): boolean {
    if (r <= 0) return false;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) if (this.map.resourceAt(x + dx, y + dy).amount > 0) return true;
    return false;
  }

  private generate(cx: number, cy: number): DecorItem[] {
    const CS = MAPGEN.chunkSize;
    const x0 = cx * CS;
    const y0 = cy * CS;
    const out: DecorItem[] = [];
    DECOR.forEach((kind, ki) => {
      const nv = this.variants(kind.sprite);
      if (nv === 0) return;
      const c = kind.cell;
      // Zellen, deren Ursprung in diesem Chunk liegt (Raster weltweit fest)
      const gx0 = Math.ceil(x0 / c);
      const gx1 = Math.floor((x0 + CS - 1) / c);
      const gy0 = Math.ceil(y0 / c);
      const gy1 = Math.floor((y0 + CS - 1) / c);
      for (let gy = gy0; gy <= gy1; gy++) {
        for (let gx = gx0; gx <= gx1; gx++) {
          const h = (k: number) => hash01(this.seed ^ 0x5eed, gx * 977 + ki, gy * 613 + ki * 31, k);
          const x = gx * c + h(1) * c;
          const y = gy * c + h(2) * c;
          let p = kind.chance;
          const f = kind.fertility || kind.groveBoost ? this.fertility(Math.floor(x), Math.floor(y)) : 0.5;
          if (kind.fertility) p *= Math.max(0.05, 1 + kind.fertility * (2 * f - 1));
          if (kind.groveBoost) {
            // Haine bevorzugt in fruchtbaren Gegenden
            const g = valueNoise(this.seed + 4242, x / GROVE.scale, y / GROVE.scale) + (f - 0.5) * 0.35;
            if (g > GROVE.threshold) p *= kind.groveBoost * ((g - GROVE.threshold) / (1 - GROVE.threshold) + 0.3);
          }
          if (kind.waterBoost && h(3) < p * kind.waterBoost && h(3) >= p && this.waterWithin(Math.floor(x), Math.floor(y), WATER_NEAR)) p *= kind.waterBoost;
          if (h(3) >= p) continue;
          if (kind.clearOfSpawn > 0 && Math.hypot(x, y) < kind.clearOfSpawn) continue;
          const tx = Math.floor(x);
          const ty = Math.floor(y);
          if (this.map.isWater(tx, ty) !== (kind.water === true)) continue;
          if (kind.water && !this.landWithin(tx, ty, 3)) continue;
          if (kind.shore && !this.waterWithin(tx, ty, 1)) continue;
          if (this.nearResource(tx, ty, kind.clearOfResources)) continue;
          const w = kind.warp === true;
          out.push({
            kind, variant: Math.floor(h(4) * nv), x, y, tx, ty,
            rot: w ? h(5) * Math.PI * 2 : 0,
            sx: w ? 0.8 + h(6) * 0.6 : 1,
            sy: w ? 0.65 + h(7) * 0.45 : 1,
          });
        }
      }
    });
    // Zeichenreihenfolge: große Flecken zuerst, dann kleine Decals; Flora wird ohnehin nach y sortiert
    out.sort((a, b) => (a.kind === b.kind ? a.y - b.y : DECOR.indexOf(a.kind) - DECOR.indexOf(b.kind)));
    return out;
  }
}
