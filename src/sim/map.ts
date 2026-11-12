import { FREQUENCY_SETTINGS, LEGACY_MAP_SETTINGS, MAPGEN, type MapSettings, RESOURCE_SETTINGS, RUBBLE } from '../data/mapgen';
import { RESOURCE_BY_INDEX, densityLevel, resourceById } from '../data/resources';
import { tileKey } from './geom';
import { fbm, hash01, hash32, valueNoise } from './rng';
import { TreeField } from './trees';

const CS = MAPGEN.chunkSize;

export class Chunk {
  readonly ground = new Uint8Array(CS * CS);
  readonly resource = new Uint8Array(CS * CS);
  readonly amount = new Uint32Array(CS * CS);
  /** 1 = Wasser (nicht begehbar, nicht bebaubar). */
  readonly water = new Uint8Array(CS * CS);
  /** Ursprüngliches Wasser und Erz (vor Abbau/Aufschüttung) – Grundlage für Bäume (Determinismus). */
  readonly water0 = new Uint8Array(CS * CS);
  readonly resource0 = new Uint8Array(CS * CS);
  readonly amount0 = new Uint32Array(CS * CS);
  /** 1 = Klippe (nicht begehbar, nicht bebaubar; mit Klippensprengstoff entfernbar). */
  readonly cliff = new Uint8Array(CS * CS);
  hasWater = false;
  hasCliff = false;
  /** Wird erhöht, wenn sich die sichtbare Darstellung ändert (Renderer-Cache). */
  version = 0;
  constructor(readonly cx: number, readonly cy: number) {}
}

/** Acht feste Richtungen ohne trigonometrische Funktionen (Determinismus). */
const DIRS8: readonly [number, number][] = [
  [1, 0], [0.70710678, 0.70710678], [0, 1], [-0.70710678, 0.70710678],
  [-1, 0], [-0.70710678, -0.70710678], [0, -1], [0.70710678, -0.70710678],
];

/** 16 Richtungen als Konstanten (cos, sin von k·22,5°), ohne Laufzeit-Trigonometrie. */
const DIRS16: readonly [number, number][] = [
  [1, 0], [0.92387953, 0.38268343], [0.70710678, 0.70710678], [0.38268343, 0.92387953],
  [0, 1], [-0.38268343, 0.92387953], [-0.70710678, 0.70710678], [-0.92387953, 0.38268343],
  [-1, 0], [-0.92387953, -0.38268343], [-0.70710678, -0.70710678], [-0.38268343, -0.92387953],
  [0, -1], [0.38268343, -0.92387953], [0.70710678, -0.70710678], [0.92387953, -0.38268343],
];

/** Teilellipse eines Feldes (Lage relativ zur Mitte, Halbachsen, Drehung). */
interface Lobe {
  ox: number;
  oy: number;
  rx: number;
  ry: number;
  c: number;
  s: number;
}

interface Patch {
  res: number;
  x: number;
  y: number;
  radius: number;
  richness: number;
  lobes: Lobe[];
  /** Reichweite für die Suche (Felder). */
  reach: number;
}

/** Natürliche Form aus 2–4 ineinanderlaufenden, gedrehten Ellipsen. */
function makeLobes(seed: number, a: number, b: number, R: number): Lobe[] {
  const h = (k: number) => hash01(seed, a, b, 100 + k);
  const n = 2 + Math.floor(h(0) * 3);
  const lobes: Lobe[] = [];
  for (let i = 0; i < n; i++) {
    const [c, s] = DIRS16[Math.floor(h(10 + i) * 16)];
    const [dx, dy] = DIRS16[Math.floor(h(20 + i) * 16)];
    const dist = i === 0 ? 0 : R * (0.35 + 0.45 * h(30 + i));
    const big = i === 0 ? 1 : 0.75;
    lobes.push({
      ox: dx * dist,
      oy: dy * dist,
      rx: R * big * (0.6 + 0.45 * h(40 + i)),
      ry: R * big * (0.35 + 0.35 * h(50 + i)),
      c,
      s,
    });
  }
  return lobes;
}

export function chunkKey(cx: number, cy: number): number {
  return tileKey(cx, cy);
}

/**
 * Endlose, per Seed erzeugte Karte. Chunks entstehen bei Bedarf; abgebaute Mengen
 * werden als Abweichung gespeichert, damit der Spielstand klein bleibt.
 */
export class GameMap {
  private readonly chunks = new Map<number, Chunk>();
  /** chunkKey -> (Index im Chunk -> [Ressource, aktuelle Menge]) */
  private readonly modified = new Map<number, Map<number, [number, number]>>();
  private readonly startPatches: Patch[];
  private readonly startLake: Patch;
  /** Fällbare Bäume (Holz) und Fruchtbarkeit. */
  readonly trees: TreeField;

  /** Faktor auf die Menge je Feld (Einstellungen Rohstoffe und Häufigkeit). */
  private readonly richness: number;
  /** Faktor auf die Zahl der Felder (Einstellung Häufigkeit): Raster um √factor enger. */
  private readonly frequency: number;

  constructor(readonly seed: number, readonly settings: MapSettings = LEGACY_MAP_SETTINGS) {
    const base = hash32(seed, 77) % 8;
    const size = settings.size;
    const freq = FREQUENCY_SETTINGS[settings.frequency ?? 'normal'];
    this.frequency = freq.factor;
    this.richness = RESOURCE_SETTINGS[settings.resources].richness * freq.amount;
    // Startfelder; ab „viel“ ein zweiter Satz weiter draußen (Richtungen 2, 5, 7 und weiter draußen 0; nicht in Richtung des Startsees)
    const starts = freq.factor > 1 ? [...MAPGEN.startPatches, ...MAPGEN.startPatchesExtra] : MAPGEN.startPatches;
    const dirIdx = [0, 3, 6, 1, 2, 5, 7, 0];
    this.startPatches = starts.map((p, i) => {
      const [dx, dy] = DIRS8[(base + dirIdx[i]) % 8];
      const radius = p.radius * size;
      // größere Felder etwas weiter weg, damit sie sich nicht überlappen
      const dist = p.distance * (size > 1 ? 0.55 + 0.5 * size : 1);
      return {
        res: resourceById(p.resource).index,
        x: dx * dist,
        y: dy * dist,
        radius,
        richness: p.richness,
        lobes: makeLobes(seed, 9000 + i, 77, radius),
        reach: radius * 2.3,
      };
    });
    // Startsee in einer Richtung, die kein Startfeld belegt (Startfelder: base + 0, 3, 6, 1)
    const SL = MAPGEN.startLake;
    const [lx, ly] = DIRS8[(base + 4) % 8];
    const lr = SL.radiusMin + hash01(seed, 78) * (SL.radiusMax - SL.radiusMin);
    this.trees = new TreeField({
      seed,
      isWater: (x, y) => this.naturalWater(x, y) || this.isCliff(x, y),
      moistureAt: (x, y) => this.moistureAt(x, y),
      resourceAt: (x, y) => ({ res: 0, amount: this.naturalResource(x, y) ? 1 : 0 }),
    });
    this.startLake = { res: 0, x: lx * SL.distance, y: ly * SL.distance, radius: lr, richness: 0, lobes: makeLobes(seed, 9100, 78, lr), reach: lr * 2.3 };
  }

  /** Feuchte 0..1 (trocken bis feucht), großräumig und glatt. */
  moistureAt(x: number, y: number): number {
    const M = MAPGEN.moisture;
    const n = fbm(this.seed + 700, x / M.scale, y / M.scale, 3);
    return Math.min(1, Math.max(0, (n - 0.5) * M.contrast + 0.5));
  }

  getChunk(cx: number, cy: number): Chunk {
    const k = chunkKey(cx, cy);
    let c = this.chunks.get(k);
    if (!c) {
      c = this.generate(cx, cy);
      const mods = this.modified.get(k);
      if (mods) for (const [i, [res, amt]] of mods) {
        c.amount[i] = amt;
        c.resource[i] = amt === 0 ? 0 : res;
      }
      this.chunks.set(k, c);
    }
    return c;
  }

  /** Bereits erzeugte Chunks (für den Renderer). */
  peekChunk(cx: number, cy: number): Chunk | undefined {
    return this.chunks.get(chunkKey(cx, cy));
  }

  resourceAt(x: number, y: number): { res: number; amount: number } {
    const cx = Math.floor(x / CS);
    const cy = Math.floor(y / CS);
    const c = this.getChunk(cx, cy);
    const i = (y - cy * CS) * CS + (x - cx * CS);
    return { res: c.resource[i], amount: c.amount[i] };
  }

  /** Eine Einheit abbauen. Gibt die Ressourcen-ID des Feldes zurück oder 0. */
  mineOne(x: number, y: number): number {
    const cx = Math.floor(x / CS);
    const cy = Math.floor(y / CS);
    const c = this.getChunk(cx, cy);
    const i = (y - cy * CS) * CS + (x - cx * CS);
    const res = c.resource[i];
    if (res === 0 || c.amount[i] === 0) return 0;
    const def = RESOURCE_BY_INDEX[res]!;
    const before = densityLevel(def, c.amount[i]);
    const amt = c.amount[i] - 1;
    c.amount[i] = amt;
    if (amt === 0) {
      c.resource[i] = 0;
      c.version++;
    } else if (densityLevel(def, amt) !== before) c.version++;
    this.record(cx, cy, i, res, amt);
    return res;
  }

  /** Geänderte Wasserfelder (Feldschlüssel -> Wasser ja/nein), werden gespeichert. */
  private readonly waterMods = new Map<number, boolean>();

  /** Wasser direkt setzen (Szenen, Tests, später Landfüllung). */
  setWater(x: number, y: number, water: boolean): void {
    const cx = Math.floor(x / CS);
    const cy = Math.floor(y / CS);
    const c = this.getChunk(cx, cy);
    const i = (y - cy * CS) * CS + (x - cx * CS);
    if ((c.water[i] === 1) !== water) this.waterMods.set(tileKey(x, y), water);
    c.water[i] = water ? 1 : 0;
    if (water) c.hasWater = true;
    c.version++;
  }

  serializeWater(): [number, number, number][] {
    return [...this.waterMods.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => [Math.floor(k / 65536) - 32768, (k % 65536) - 32768, v ? 1 : 0]);
  }

  loadWater(list: [number, number, number][]): void {
    for (const [x, y, v] of list) this.setWater(x, y, v === 1);
  }

  /** Ressource direkt setzen (Szenen, Editor). amount 0 entfernt sie. */
  setResource(x: number, y: number, res: number, amount: number): void {
    const cx = Math.floor(x / CS);
    const cy = Math.floor(y / CS);
    const c = this.getChunk(cx, cy);
    const i = (y - cy * CS) * CS + (x - cx * CS);
    c.resource[i] = amount > 0 ? res : 0;
    c.amount[i] = amount > 0 ? amount : 0;
    c.version++;
    this.record(cx, cy, i, res, c.amount[i]);
  }

  private record(cx: number, cy: number, i: number, res: number, amt: number): void {
    const k = chunkKey(cx, cy);
    let mods = this.modified.get(k);
    if (!mods) this.modified.set(k, (mods = new Map()));
    mods.set(i, [res, amt]);
  }

  serializeModifications(): [number, number, number, number, number][] {
    const out: [number, number, number, number, number][] = [];
    const keys = [...this.modified.keys()].sort((a, b) => a - b);
    for (const k of keys) {
      const mods = this.modified.get(k)!;
      const idx = [...mods.keys()].sort((a, b) => a - b);
      for (const i of idx) {
        const cx = Math.floor(k / 65536) - 32768;
        const cy = (k % 65536) - 32768;
        const [res, amt] = mods.get(i)!;
        out.push([cx, cy, i, amt, res]);
      }
    }
    return out;
  }

  loadModifications(list: [number, number, number, number, number][]): void {
    for (const [cx, cy, i, amt, res] of list) {
      this.record(cx, cy, i, res, amt);
      const c = this.chunks.get(chunkKey(cx, cy));
      if (c) {
        c.amount[i] = amt;
        c.resource[i] = amt === 0 ? 0 : res;
        c.version++;
      }
    }
  }

  private patchesNear(x0: number, y0: number, x1: number, y1: number): Patch[] {
    const out: Patch[] = [];
    for (const p of this.startPatches) {
      const r = p.reach;
      if (p.x + r >= x0 && p.x - r <= x1 && p.y + r >= y0 && p.y - r <= y1) out.push(p);
    }
    const cell = Math.round(MAPGEN.patchCell / Math.sqrt(this.frequency));
    const size = this.settings.size;
    const reach = MAPGEN.patchRadiusMax * size * 2.3;
    const gx0 = Math.floor((x0 - reach) / cell);
    const gx1 = Math.floor((x1 + reach) / cell);
    const gy0 = Math.floor((y0 - reach) / cell);
    const gy1 = Math.floor((y1 + reach) / cell);
    const totalWeight = MAPGEN.patchWeights.reduce((s, w) => s + w.weight, 0);
    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        if (hash01(this.seed, gx, gy, 1) >= MAPGEN.patchChance) continue;
        const px = (gx + 0.15 + hash01(this.seed, gx, gy, 2) * 0.7) * cell;
        const py = (gy + 0.15 + hash01(this.seed, gx, gy, 3) * 0.7) * cell;
        const dist = Math.sqrt(px * px + py * py);
        if (dist < MAPGEN.startExclusionRadius * Math.max(1, size * 0.8)) continue;
        let pick = hash01(this.seed, gx, gy, 4) * totalWeight;
        let resId: string = MAPGEN.patchWeights[0].resource;
        for (const w of MAPGEN.patchWeights) {
          if (pick < w.weight) { resId = w.resource; break; }
          pick -= w.weight;
        }
        const radius = (MAPGEN.patchRadiusMin + hash01(this.seed, gx, gy, 5) * (MAPGEN.patchRadiusMax - MAPGEN.patchRadiusMin)) * size;
        out.push({
          res: resourceById(resId).index,
          x: px,
          y: py,
          radius,
          richness: MAPGEN.patchRichnessBase + dist * MAPGEN.patchRichnessPerTile,
          lobes: makeLobes(this.seed, gx, gy, radius),
          reach: radius * 2.3,
        });
      }
    }
    return out;
  }

  /** Wert eines Feldes an einem Punkt: > 0 innen, Rand bei 0 (mit verzerrten Koordinaten). */
  private patchValue(p: Patch, px: number, py: number): number {
    const W = MAPGEN.patchWarp * p.radius;
    const wx = px + W * (valueNoise(this.seed + p.res * 7 + 1, px / 6, py / 6) - 0.5) * 2;
    const wy = py + W * (valueNoise(this.seed + p.res * 7 + 2, px / 6, py / 6) - 0.5) * 2;
    let v = -Infinity;
    for (const l of p.lobes) {
      const dx = wx - (p.x + l.ox);
      const dy = wy - (p.y + l.oy);
      const u = (dx * l.c + dy * l.s) / l.rx;
      const w = (-dx * l.s + dy * l.c) / l.ry;
      const lv = 1 - Math.sqrt(u * u + w * w);
      if (lv > v) v = lv;
    }
    return v;
  }

  /** Wasser: Seen, Flüsse mit Furten, Startsee und kleine Teiche; nicht in der Nähe des Starts. */
  private waterAt(x: number, y: number, ponds: Patch[]): boolean {
    const L = MAPGEN.lakes;
    const d = Math.sqrt(x * x + y * y);
    const fall = Math.min(1, Math.max(0, (d - L.spawnClear) / L.spawnFade));
    if (fall <= 0) return false;
    const px = x + 0.5;
    const py = y + 0.5;
    const sl = this.startLake;
    if (Math.abs(px - sl.x) < sl.reach && Math.abs(py - sl.y) < sl.reach && this.patchValue(sl, px, py) > 0) return true;
    // Seen: verzerrtes fraktales Rauschen, in feuchten Gegenden häufiger
    const wx = px + L.warp * (fbm(this.seed + 911, px / L.warpScale, py / L.warpScale, 2) - 0.5) * 2;
    const wy = py + L.warp * (fbm(this.seed + 912, px / L.warpScale, py / L.warpScale, 2) - 0.5) * 2;
    const n = fbm(this.seed + 901, wx / L.scale, wy / L.scale, L.octaves);
    const m = this.moistureAt(px, py);
    if (n + (m - 0.5) * L.moistureBias - (1 - fall) * 0.35 > L.threshold) return true;
    // Flüsse: schmale Nulllinie eines zweiten Rauschens, mit Furten
    const R = MAPGEN.rivers;
    const rx = px + R.warp * (fbm(this.seed + 931, px / R.warpScale, py / R.warpScale, 2) - 0.5) * 2;
    const ry = py + R.warp * (fbm(this.seed + 932, px / R.warpScale, py / R.warpScale, 2) - 0.5) * 2;
    const ridge = Math.abs(fbm(this.seed + 933, rx / R.scale, ry / R.scale, 3) - 0.5);
    const wv = valueNoise(this.seed + 934, px / R.widthScale, py / R.widthScale);
    if (wv > R.fordBelow) {
      const width = R.width * (0.35 + 1.3 * (wv - R.fordBelow) / (1 - R.fordBelow)) * fall;
      if (ridge < width) return true;
    }
    for (const p of ponds) if (this.patchValue(p, px, py) > 0) return true;
    return false;
  }

  private pondsNear(x0: number, y0: number, x1: number, y1: number): Patch[] {
    const P = MAPGEN.ponds;
    const out: Patch[] = [];
    const reach = P.radiusMax * 2.3;
    for (let gy = Math.floor((y0 - reach) / P.cell); gy <= Math.floor((y1 + reach) / P.cell); gy++) {
      for (let gx = Math.floor((x0 - reach) / P.cell); gx <= Math.floor((x1 + reach) / P.cell); gx++) {
        if (hash01(this.seed, gx, gy, 61) >= P.chance) continue;
        const px = (gx + 0.2 + hash01(this.seed, gx, gy, 62) * 0.6) * P.cell;
        const py = (gy + 0.2 + hash01(this.seed, gx, gy, 63) * 0.6) * P.cell;
        if (Math.sqrt(px * px + py * py) < MAPGEN.lakes.spawnClear + P.radiusMax) continue;
        const r = P.radiusMin + hash01(this.seed, gx, gy, 64) * (P.radiusMax - P.radiusMin);
        out.push({ res: 0, x: px, y: py, radius: r, richness: 0, lobes: makeLobes(this.seed + 5, gx, gy, r), reach: r * 2.3 });
      }
    }
    return out;
  }

  /** Bäume in einem Rechteck fällen (Szenen, Tests). */
  clearTrees(x0: number, y0: number, x1: number, y1: number): void {
    for (let cy = Math.floor(y0 / CS); cy <= Math.floor(y1 / CS); cy++)
      for (let cx = Math.floor(x0 / CS); cx <= Math.floor(x1 / CS); cx++)
        for (const t of this.trees.treesIn(cx, cy)) if (t.tx >= x0 && t.tx <= x1 && t.ty >= y0 && t.ty <= y1) this.trees.remove(cx, cy, t.i);
  }

  /** Wasser vor Aufschüttungen (für Bäume und Fruchtbarkeit). */
  naturalWater(x: number, y: number): boolean {
    const cx = Math.floor(x / CS);
    const cy = Math.floor(y / CS);
    return this.getChunk(cx, cy).water0[(Math.floor(y) - cy * CS) * CS + (Math.floor(x) - cx * CS)] === 1;
  }

  /** Ursprünglich Erz vorhanden (vor dem Abbau). */
  naturalResource(x: number, y: number): boolean {
    const cx = Math.floor(x / CS);
    const cy = Math.floor(y / CS);
    return this.getChunk(cx, cy).resource0[(Math.floor(y) - cy * CS) * CS + (Math.floor(x) - cx * CS)] !== 0;
  }

  isCliff(x: number, y: number): boolean {
    const cx = Math.floor(x / CS);
    const cy = Math.floor(y / CS);
    const c = this.getChunk(cx, cy);
    return c.hasCliff && c.cliff[(Math.floor(y) - cy * CS) * CS + (Math.floor(x) - cx * CS)] === 1;
  }

  /** Weder Wasser noch Klippe (begehbar, bebaubar soweit kein Gebäude). */
  isBlocked(x: number, y: number): boolean {
    return this.isWater(x, y) || this.isCliff(x, y);
  }

  /** Bodenbeläge (Feldschlüssel -> Belag-ID, siehe src/data/floors.ts), werden gespeichert. */
  private readonly floors = new Map<number, number>();
  /** Erhöht bei jeder Änderung der Beläge (Darstellung). */
  floorVersion = 0;

  floorAt(x: number, y: number): number {
    return this.floors.get(tileKey(Math.floor(x), Math.floor(y))) ?? 0;
  }

  /** Belag setzen (0 entfernt ihn); liefert den vorherigen Belag. */
  setFloor(x: number, y: number, id: number): number {
    const k = tileKey(Math.floor(x), Math.floor(y));
    const old = this.floors.get(k) ?? 0;
    if (old === id) return old;
    if (id) this.floors.set(k, id);
    else this.floors.delete(k);
    this.floorVersion++;
    const cx = Math.floor(x / CS);
    const cy = Math.floor(y / CS);
    this.getChunk(cx, cy).version++;
    return old;
  }

  /** Beläge in einem Rechteck (Darstellung). */
  floorsIn(x0: number, y0: number, x1: number, y1: number, out: (x: number, y: number, id: number) => void): void {
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > this.floors.size) {
      for (const [k, id] of this.floors) {
        const x = Math.floor(k / 65536) - 32768;
        const y = (k % 65536) - 32768;
        if (x >= x0 && x <= x1 && y >= y0 && y <= y1) out(x, y, id);
      }
      return;
    }
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const id = this.floors.get(tileKey(x, y));
      if (id) out(x, y, id);
    }
  }

  serializeFloors(): [number, number, number][] {
    return [...this.floors].sort((a, b) => a[0] - b[0]).map(([k, id]) => [Math.floor(k / 65536) - 32768, (k % 65536) - 32768, id]);
  }

  loadFloors(list: [number, number, number][] | undefined): void {
    for (const [x, y, id] of list ?? []) this.setFloor(x, y, id);
  }

  /** Entfernte Klippen (Feldschlüssel), werden gespeichert. */
  private readonly cliffMods = new Set<number>();

  /** Klippe entfernen (Klippensprengstoff); true, wenn dort eine war. */
  removeCliff(x: number, y: number): boolean {
    const cx = Math.floor(x / CS);
    const cy = Math.floor(y / CS);
    const c = this.getChunk(cx, cy);
    const i = (Math.floor(y) - cy * CS) * CS + (Math.floor(x) - cx * CS);
    if (!c.cliff[i]) return false;
    c.cliff[i] = 0;
    c.version++;
    this.cliffMods.add(tileKey(Math.floor(x), Math.floor(y)));
    return true;
  }

  serializeCliffs(): [number, number][] {
    return [...this.cliffMods].sort((a, b) => a - b).map((k) => [Math.floor(k / 65536) - 32768, (k % 65536) - 32768]);
  }

  loadCliffs(list: [number, number][] | undefined): void {
    for (const [x, y] of list ?? []) this.removeCliff(x, y);
  }

  isWater(x: number, y: number): boolean {
    const cx = Math.floor(x / CS);
    const cy = Math.floor(y / CS);
    const c = this.getChunk(cx, cy);
    return c.water[(Math.floor(y) - cy * CS) * CS + (Math.floor(x) - cx * CS)] === 1;
  }

  private generate(cx: number, cy: number): Chunk {
    const c = new Chunk(cx, cy);
    const x0 = cx * CS;
    const y0 = cy * CS;
    const ponds = this.pondsNear(x0, y0, x0 + CS, y0 + CS);
    for (let i = 0; i < CS * CS; i++) {
      const x = x0 + (i % CS);
      const y = y0 + Math.floor(i / CS);
      c.ground[i] = hash32(this.seed, x, y, 9) % 256;
      if (this.waterAt(x, y, ponds)) {
        c.water[i] = 1;
        c.water0[i] = 1;
        c.hasWater = true;
      }
    }
    // Öl und Uran gibt es in der Trümmerwelt nicht
    if (!this.settings.rubble) this.placeOil(c, x0, y0);
    const patches = this.patchesNear(x0, y0, x0 + CS, y0 + CS);
    if (patches.length) this.placeOre(c, x0, y0, patches);
    if (!this.settings.rubble) this.placeUranium(c, x0, y0);
    this.placeCliffs(c, x0, y0, ponds);
    return c;
  }

  /** Uranvorkommen (eigenes Raster, weit draußen; ändert vorhandene Erzfelder nicht). */
  private placeUranium(c: Chunk, x0: number, y0: number): void {
    const U = { ...MAPGEN.uranium, cell: Math.round(MAPGEN.uranium.cell / Math.sqrt(this.frequency)) };
    const res = resourceById('uranium-ore').index;
    const size = this.settings.size;
    const reach = U.radiusMax * size * 2.3;
    const patches: Patch[] = [];
    for (let gy = Math.floor((y0 - reach) / U.cell); gy <= Math.floor((y0 + CS + reach) / U.cell); gy++) {
      for (let gx = Math.floor((x0 - reach) / U.cell); gx <= Math.floor((x0 + CS + reach) / U.cell); gx++) {
        if (hash01(this.seed, gx, gy, 901) >= U.chance) continue;
        const px = (gx + 0.2 + hash01(this.seed, gx, gy, 902) * 0.6) * U.cell;
        const py = (gy + 0.2 + hash01(this.seed, gx, gy, 903) * 0.6) * U.cell;
        const dist = Math.hypot(px, py);
        if (dist < U.minDistance) continue;
        const radius = (U.radiusMin + hash01(this.seed, gx, gy, 904) * (U.radiusMax - U.radiusMin)) * size;
        patches.push({ res, x: px, y: py, radius, richness: U.richness + dist * U.richnessPerTile, lobes: makeLobes(this.seed, gx + 7000, gy, radius), reach: radius * 2.3 });
      }
    }
    if (!patches.length) return;
    for (let i = 0; i < CS * CS; i++) {
      if (c.water[i] || c.resource[i]) continue;
      const x = x0 + (i % CS);
      const y = y0 + Math.floor(i / CS);
      for (const p of patches) {
        if (Math.abs(x - p.x) > p.reach || Math.abs(y - p.y) > p.reach) continue;
        const v = this.patchValue(p, x + 0.5, y + 0.5);
        if (v <= 0) continue;
        c.resource[i] = res;
        c.resource0[i] = res;
        c.amount[i] = Math.max(10, Math.round(p.richness * (0.3 + v * 0.9) * this.richness));
        c.amount0[i] = c.amount[i];
        break;
      }
    }
  }

  /** Höhenstufe für Klippen (nur Kartengenerierung). */
  private cliffLevel(x: number, y: number, levels: number): number {
    const C = MAPGEN.cliffs;
    return Math.floor(fbm(this.seed + 900, x / C.scale, y / C.scale, 3) * levels);
  }

  /** Klippen eines Chunks: Feld höher als ein Nachbar (4er-Nachbarschaft), außer in Lücken, Start, Wasser, Erz. */
  private placeCliffs(c: Chunk, x0: number, y0: number, ponds: ReturnType<GameMap['pondsNear']>): void {
    const setting = this.settings.cliffs ?? 'aus';
    if (setting === 'aus') return;
    const C = MAPGEN.cliffs;
    const { levels, gap } = C[setting];
    for (let i = 0; i < CS * CS; i++) {
      if (c.water[i] || c.resource[i]) continue;
      const x = x0 + (i % CS);
      const y = y0 + Math.floor(i / CS);
      if (x * x + y * y < C.startFree * C.startFree) continue;
      const l = this.cliffLevel(x + 0.5, y + 0.5, levels);
      let edge = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        if (this.cliffLevel(x + dx + 0.5, y + dy + 0.5, levels) < l) {
          edge = true;
          break;
        }
      }
      if (!edge) continue;
      if (valueNoise(this.seed + 901, x / C.gapScale, y / C.gapScale) < gap) continue;
      // nicht direkt am Wasser (Ufer bleiben begehbar)
      let wet = false;
      for (let dy = -1; dy <= 1 && !wet; dy++) for (let dx = -1; dx <= 1 && !wet; dx++) if (this.waterAt(x + dx, y + dy, ponds)) wet = true;
      if (wet) continue;
      c.cliff[i] = 1;
      c.hasCliff = true;
    }
  }

  private placeOre(c: Chunk, x0: number, y0: number, patches: Patch[]): void {
    const fringe = MAPGEN.patchFringe;
    for (let i = 0; i < CS * CS; i++) {
      if (c.water[i] || c.resource[i]) continue;
      const x = x0 + (i % CS);
      const y = y0 + Math.floor(i / CS);
      if (x * x + y * y < MAPGEN.spawnFree * MAPGEN.spawnFree) continue;
      let best = -Infinity;
      let bestP: Patch | null = null;
      for (const p of patches) {
        if (Math.abs(x - p.x) > p.reach || Math.abs(y - p.y) > p.reach) continue;
        const v = this.patchValue(p, x + 0.5, y + 0.5);
        if (v > best) {
          best = v;
          bestP = p;
        }
      }
      if (!bestP) continue;
      // Ausläufer: vereinzelte Felder knapp außerhalb des Randes
      if (best <= 0) {
        if (best < -fringe) continue;
        const k = 1 + best / fringe;
        if (hash01(this.seed, x, y, 71) > 0.45 * k * k) continue;
      }
      const rich = 0.6 + 0.8 * valueNoise(this.seed + bestP.res * 13, x / 4.5, y / 4.5);
      const res = this.settings.rubble ? this.rubbleAt(bestP.res, x, y) : bestP.res;
      c.resource[i] = res;
      c.resource0[i] = res;
      c.amount[i] = Math.max(10, Math.round(bestP.richness * (0.3 + Math.max(0, best) * 0.9) * rich * this.richness));
      c.amount0[i] = c.amount[i];
    }
  }

  /**
   * Trümmerfeld: Material eines Feldes nach der Zusammensetzung der Feldart (RUBBLE). Nester von etwa 2×2 Feldern
   * (zeilenweise versetzt), damit Förderer zusammenhängendes Material finden.
   */
  private rubbleAt(kind: number, x: number, y: number): number {
    const mix = RUBBLE[RESOURCE_BY_INDEX[kind]?.id ?? ''];
    if (!mix) return kind;
    const by = y >> 1;
    const bx = (x + (hash32(this.seed, by, 74) & 1)) >> 1;
    let t = hash01(this.seed, bx, by, 73);
    for (const m of mix.mix) {
      if (t < m.share) return resourceById(m.resource).index;
      t -= m.share;
    }
    return kind;
  }

  /** Art des Trümmerfelds an einem Feld (Name für die Anzeige), sonst null. */
  rubbleName(x: number, y: number): string | null {
    if (!this.settings.rubble) return null;
    let best = -Infinity;
    let kind = 0;
    for (const p of this.patchesNear(x, y, x, y)) {
      const v = this.patchValue(p, x + 0.5, y + 0.5);
      if (v > best) {
        best = v;
        kind = p.res;
      }
    }
    return best > -MAPGEN.patchFringe ? RUBBLE[RESOURCE_BY_INDEX[kind]?.id ?? '']?.name ?? null : null;
  }

  /** Ölquellen eines Chunks (deterministisch je Feldzelle, unabhängig von der Erzeugungsreihenfolge). */
  private placeOil(c: Chunk, x0: number, y0: number): void {
    const O = { ...MAPGEN.oil, cell: Math.round(MAPGEN.oil.cell / Math.sqrt(this.frequency)) };
    const res = resourceById('crude-oil').index;
    const reach = O.radius + 1;
    for (let gy = Math.floor((y0 - reach) / O.cell); gy <= Math.floor((y0 + CS + reach) / O.cell); gy++) {
      for (let gx = Math.floor((x0 - reach) / O.cell); gx <= Math.floor((x0 + CS + reach) / O.cell); gx++) {
        if (hash01(this.seed, gx, gy, 501) >= O.chance) continue;
        const cx = (gx + 0.2 + 0.6 * hash01(this.seed, gx, gy, 502)) * O.cell;
        const cy = (gy + 0.2 + 0.6 * hash01(this.seed, gx, gy, 503)) * O.cell;
        const dist = Math.hypot(cx, cy);
        if (dist < O.minDistance) continue;
        const n = O.wellsMin + Math.floor(hash01(this.seed, gx, gy, 504) * (O.wellsMax - O.wellsMin + 1));
        const wells: [number, number][] = [];
        for (let k = 0; k < n * 6 && wells.length < n; k++) {
          const a = hash01(this.seed, gx, gy, 600 + k) * Math.PI * 2;
          const r = O.radius * Math.sqrt(hash01(this.seed, gx, gy, 700 + k));
          const wx = Math.floor(cx + Math.cos(a) * r);
          const wy = Math.floor(cy + Math.sin(a) * r);
          if (wells.some(([px, py]) => Math.max(Math.abs(px - wx), Math.abs(py - wy)) < O.spacing)) continue;
          wells.push([wx, wy]);
        }
        wells.forEach(([wx, wy], k) => {
          if (wx < x0 || wx >= x0 + CS || wy < y0 || wy >= y0 + CS) return;
          const i = (wy - y0) * CS + (wx - x0);
          if (c.water[i]) return;
          const y = O.yieldMin + (O.yieldMax - O.yieldMin) * hash01(this.seed, gx, gy, 800 + k) + dist * O.yieldPerTile;
          c.resource[i] = res;
          c.resource0[i] = res;
          c.amount[i] = Math.round(y * 1000);
          c.amount0[i] = c.amount[i];
        });
      }
    }
  }

  /** Ursprüngliche Menge (vor Abbau) – Ergiebigkeitsuntergrenze der Ölquellen. */
  originalAmount(x: number, y: number): number {
    const cx = Math.floor(x / CS);
    const cy = Math.floor(y / CS);
    return this.getChunk(cx, cy).amount0[(Math.floor(y) - cy * CS) * CS + (Math.floor(x) - cx * CS)];
  }
}
