import { BIOME } from '../data/decor';
import { LOOK } from '../data/look';
import type { GameMap } from '../sim/map';

function lerpColor(a: number, b: number, t: number): number {
  const r = ((a >> 16) & 255) + (((b >> 16) & 255) - ((a >> 16) & 255)) * t;
  const g = ((a >> 8) & 255) + (((b >> 8) & 255) - ((a >> 8) & 255)) * t;
  const bl = (a & 255) + ((b & 255) - (a & 255)) * t;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}

function mulColor(a: number, b: number): number {
  const f = (sh: number) => Math.round((((a >> sh) & 255) * ((b >> sh) & 255)) / 255);
  return (f(16) << 16) | (f(8) << 8) | f(0);
}

function scaleColor(c: number, k: number): number {
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return (f((c >> 16) & 255) << 16) | (f((c >> 8) & 255) << 8) | f(c & 255);
}

function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Glattes Wertrauschen 0..1 (nur Darstellung). */
export function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(x0, y0, seed);
  const b = hash(x0 + 1, y0, seed);
  const c = hash(x0, y0 + 1, seed);
  const d = hash(x0 + 1, y0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Bodenfarbe 0xRRGGBB für eine Fruchtbarkeit 0..1. */
export function biomeColor(f: number): number {
  return f < 0.5 ? lerpColor(BIOME.dry, BIOME.mid, f * 2) : lerpColor(BIOME.mid, BIOME.lush, (f - 0.5) * 2);
}

/**
 * Fruchtbarkeit je Feld (Feuchte + Wassernähe), je Chunk zwischengespeichert. Nur Darstellung:
 * Bodenfarbe, Bewuchs und Übersichtskarte.
 */
export class BiomeField {
  constructor(private readonly map: GameMap) {}

  /** Fruchtbarkeit 0..1 (aus der Simulation, siehe TreeField). */
  fertility(tx: number, ty: number): number {
    return this.map.trees.fertility(tx, ty);
  }

  /** Farbe je Feld, je Chunk (32×32) zwischengespeichert: die Rauschfunktionen sind pro Bild zu teuer. */
  private readonly cache = new Map<number, Uint32Array>();
  color(tx: number, ty: number): number {
    const cx = tx >> 5;
    const cy = ty >> 5;
    const key = (cx + 32768) * 65536 + (cy + 32768);
    let c = this.cache.get(key);
    if (!c) {
      if (this.cache.size > 4096) this.cache.clear();
      c = new Uint32Array(1024);
      for (let i = 0; i < 1024; i++) c[i] = this.compute(cx * 32 + (i & 31), cy * 32 + (i >> 5)) | 0x1000000;
      this.cache.set(key, c);
    }
    return c[((ty - cy * 32) << 5) + (tx - cx * 32)] & 0xffffff;
  }

  private compute(tx: number, ty: number): number {
    const m = LOOK.macro;
    // Farbflecken: saftig grüne und strohgelbe Wiesenstücke (großräumig, unabhängig von der Helligkeit)
    const hue = valueNoise(tx / m.hueScale, ty / m.hueScale, 37) * 0.7 + valueNoise(tx / (m.hueScale * 0.35), ty / (m.hueScale * 0.35), 41) * 0.3;
    const c = mulColor(biomeColor(this.fertility(tx, ty)), lerpColor(m.hueDry, m.hueLush, Math.max(0, Math.min(1, (hue - 0.5) * 1.8 + 0.5))));
    const k = 1 + m.amp * (valueNoise(tx / m.scale, ty / m.scale, 11) * 2 - 1) + m.amp2 * (valueNoise(tx / m.scale2, ty / m.scale2, 23) * 2 - 1);
    return scaleColor(c, k);
  }
}
