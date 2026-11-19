import { BIOME } from '../data/decor';
import { MAPGEN } from '../data/mapgen';
import { hash01, valueNoise } from './rng';
import { regionAt } from './regions';
import { REGIONS } from '../data/decor';

/** Ein Baum auf der Karte (fällbar). x/y: Stammfuß in Feldern, tx/ty: Feld des Stammes. */
export interface Tree {
  /** Index innerhalb des Chunks (für Speichern). */
  readonly i: number;
  readonly cx: number;
  readonly cy: number;
  /** Art (Index in MAPGEN.trees.kinds). */
  readonly kind: number;
  readonly variant: number;
  readonly x: number;
  readonly y: number;
  readonly tx: number;
  readonly ty: number;
}

/** Was der Baumgenerator von der Karte braucht (vermeidet zyklische Importe). */
export interface TreeMapView {
  readonly seed: number;
  isWater(x: number, y: number): boolean;
  moistureAt(x: number, y: number): number;
  resourceAt(x: number, y: number): { res: number; amount: number };
}

interface ChunkTrees {
  list: Tree[];
  /** Feldschlüssel (lokal y*CS+x) → Baum. */
  byTile: Map<number, Tree>;
}

/**
 * Bäume und Fruchtbarkeit: deterministisch aus Seed und Karte (Wasser, Erz, Feuchte), je Chunk erzeugt.
 * Gefällte Bäume werden als Abweichung gespeichert.
 */
export class TreeField {
  private readonly chunks = new Map<number, ChunkTrees>();
  private readonly fert = new Map<number, Float32Array>();
  /** Gefällte Bäume je Chunk (Indizes). */
  private readonly removed = new Map<number, Set<number>>();
  /** Gepflanzte Bäume (Alleen, Hecken, Gärten der Orte) in Pflanzreihenfolge: x, y, Art, Variante. */
  private readonly planted: [number, number, number, number][] = [];

  constructor(private readonly map: TreeMapView) {}

  private static key(cx: number, cy: number): number {
    return (cx + 32768) * 65536 + (cy + 32768);
  }

  /** Fruchtbarkeit 0..1: Feuchte plus Bonus in Wassernähe (je Chunk zwischengespeichert). */
  fertility(tx: number, ty: number): number {
    const CS = MAPGEN.chunkSize;
    const cx = Math.floor(tx / CS);
    const cy = Math.floor(ty / CS);
    const k = TreeField.key(cx, cy);
    let a = this.fert.get(k);
    if (!a) {
      a = this.buildFertility(cx, cy);
      this.fert.set(k, a);
    }
    return a[(ty - cy * CS) * CS + (tx - cx * CS)];
  }

  private buildFertility(cx: number, cy: number): Float32Array {
    const CS = MAPGEN.chunkSize;
    const out = new Float32Array(CS * CS);
    const R = BIOME.waterRange;
    let anyWater = false;
    // Wasser im Umkreis eines Chunks? (grob über Stichproben, dann je Feld genau)
    for (let y = cy * CS - R; y < cy * CS + CS + R && !anyWater; y += 2) for (let x = cx * CS - R; x < cx * CS + CS + R && !anyWater; x += 2) if (this.map.isWater(x, y)) anyWater = true;
    for (let i = 0; i < CS * CS; i++) {
      const tx = cx * CS + (i % CS);
      const ty = cy * CS + Math.floor(i / CS);
      let f = this.map.moistureAt(tx + 0.5, ty + 0.5);
      if (anyWater) {
        let best = R + 1;
        for (let oy = -R; oy <= R; oy++) {
          for (let ox = -R; ox <= R; ox++) {
            const d = Math.abs(ox) + Math.abs(oy) * 0.9;
            if (d >= best) continue;
            if (this.map.isWater(tx + ox, ty + oy)) best = d;
          }
        }
        if (best <= R) f += BIOME.waterBonus * (1 - best / (R + 1));
      }
      out[i] = Math.min(1, f);
    }
    return out;
  }

  private chunk(cx: number, cy: number): ChunkTrees {
    const k = TreeField.key(cx, cy);
    let c = this.chunks.get(k);
    if (!c) {
      c = this.generate(cx, cy);
      this.chunks.set(k, c);
    }
    return c;
  }

  /** Stehende Bäume eines Chunks. */
  treesIn(cx: number, cy: number): readonly Tree[] {
    const c = this.chunk(cx, cy);
    const rm = this.removed.get(TreeField.key(cx, cy));
    return rm ? c.list.filter((t) => !rm.has(t.i)) : c.list;
  }

  /** Baum, dessen Stamm auf diesem Feld steht. */
  treeAt(tx: number, ty: number): Tree | undefined {
    const CS = MAPGEN.chunkSize;
    const cx = Math.floor(tx / CS);
    const cy = Math.floor(ty / CS);
    const t = this.chunk(cx, cy).byTile.get((ty - cy * CS) * CS + (tx - cx * CS));
    if (!t) return undefined;
    return this.removed.get(TreeField.key(cx, cy))?.has(t.i) ? undefined : t;
  }

  /**
   * Baum pflanzen (Weltaufbau: Alleen, Hecken, Gärten). Er hängt hinten an die Liste seines Chunks an, damit gefällte
   * Indizes gültig bleiben; die Pflanzliste wird gespeichert und beim Laden in gleicher Reihenfolge wiederholt.
   */
  plant(x: number, y: number, kind: number, variant: number): boolean {
    const CS = MAPGEN.chunkSize;
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    const cx = Math.floor(tx / CS);
    const cy = Math.floor(ty / CS);
    const c = this.chunk(cx, cy);
    const local = (ty - cy * CS) * CS + (tx - cx * CS);
    if (c.byTile.has(local) || this.map.isWater(tx, ty)) return false;
    const t: Tree = { i: c.list.length, cx, cy, kind, variant, x, y, tx, ty };
    c.list.push(t);
    c.byTile.set(local, t);
    this.planted.push([x, y, kind, variant]);
    return true;
  }

  serializePlanted(): [number, number, number, number][] {
    return this.planted.map((p) => [...p] as [number, number, number, number]);
  }

  loadPlanted(list: [number, number, number, number][] | undefined): void {
    for (const [x, y, k, v] of list ?? []) this.plant(x, y, k, v);
  }

  /** Baum fällen. Gibt false zurück, wenn er nicht (mehr) steht. */
  remove(cx: number, cy: number, i: number): boolean {
    const k = TreeField.key(cx, cy);
    let s = this.removed.get(k);
    if (s?.has(i)) return false;
    if (!this.chunk(cx, cy).list.some((t) => t.i === i)) return false;
    if (!s) this.removed.set(k, (s = new Set()));
    s.add(i);
    return true;
  }

  serialize(): [number, number, number][] {
    const out: [number, number, number][] = [];
    for (const [k, s] of [...this.removed.entries()].sort((a, b) => a[0] - b[0])) {
      const cx = Math.floor(k / 65536) - 32768;
      const cy = (k % 65536) - 32768;
      for (const i of [...s].sort((a, b) => a - b)) out.push([cx, cy, i]);
    }
    return out;
  }

  load(list: [number, number, number][]): void {
    for (const [cx, cy, i] of list) {
      const k = TreeField.key(cx, cy);
      let s = this.removed.get(k);
      if (!s) this.removed.set(k, (s = new Set()));
      s.add(i);
    }
  }

  private nearResource(x: number, y: number, r: number): boolean {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (this.map.resourceAt(x + dx, y + dy).amount > 0) return true;
    return false;
  }

  private waterWithin(x: number, y: number, r: number): boolean {
    for (let dy = -r; dy <= r; dy += 2) for (let dx = -r; dx <= r; dx += 2) if (this.map.isWater(x + dx, y + dy)) return true;
    return false;
  }

  private generate(cx: number, cy: number): ChunkTrees {
    const T = MAPGEN.trees;
    const CS = MAPGEN.chunkSize;
    const x0 = cx * CS;
    const y0 = cy * CS;
    const list: Tree[] = [];
    const byTile = new Map<number, Tree>();
    const seed = this.map.seed;
    T.kinds.forEach((kind, ki) => {
      const c = kind.cell;
      for (let gy = Math.ceil(y0 / c); gy <= Math.floor((y0 + CS - 1) / c); gy++) {
        for (let gx = Math.ceil(x0 / c); gx <= Math.floor((x0 + CS - 1) / c); gx++) {
          const h = (k: number) => hash01(seed ^ 0x7ee5, gx * 977 + ki, gy * 613 + ki * 31, k);
          const x = gx * c + h(1) * c;
          const y = gy * c + h(2) * c;
          const tx = Math.floor(x);
          const ty = Math.floor(y);
          if (tx < x0 || tx >= x0 + CS || ty < y0 || ty >= y0 + CS) continue;
          if (Math.hypot(x, y) < T.clearOfSpawn) continue;
          let p = kind.chance;
          const f = this.fertility(tx, ty);
          if (kind.fertility) p *= Math.max(0.05, 1 + kind.fertility * (2 * f - 1));
          // Regionen: Heide offen mit einzelnen Kiefern, Moor licht mit toten Bäumen
          const reg = regionAt(seed, x, y, f);
          if (reg) p *= (REGIONS.trees[reg] as readonly number[])[ki] ?? 1;
          if (kind.groveBoost) {
            const g = valueNoise(seed + 4242, x / T.grove.scale, y / T.grove.scale) + (f - 0.5) * 0.35;
            if (g > T.grove.threshold) p *= kind.groveBoost * ((g - T.grove.threshold) / (1 - T.grove.threshold) + 0.3);
          }
          if (kind.waterBoost && h(3) < p * kind.waterBoost && h(3) >= p && this.waterWithin(tx, ty, T.waterNear)) p *= kind.waterBoost;
          if (h(3) >= p) continue;
          if (this.map.isWater(tx, ty)) continue;
          const local = (ty - y0) * CS + (tx - x0);
          if (byTile.has(local)) continue;
          if (this.nearResource(tx, ty, T.clearOfResources)) continue;
          const t: Tree = { i: list.length, cx, cy, kind: ki, variant: Math.floor(h(4) * T.variants), x, y, tx, ty };
          list.push(t);
          byTile.set(local, t);
        }
      }
    });
    return { list, byTile };
  }
}
