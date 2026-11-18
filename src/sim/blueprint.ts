import { entityDef, sizeOf } from '../data/entities';
import { ITEM_IDS } from '../data/items';
import { type Dir, tileKey } from './geom';
import type { Entity } from './machines';
import type { World } from './world';

/** Einstellungen eines Gebäudes, die eine Blaupause mitnimmt (Rezept, Splitter, Untergrund-Richtung). */
export type Settings = { recipe?: string; out?: boolean; ip?: number; op?: number; fi?: string | null; bar?: number; if?: (string | null)[]; ib?: boolean; st?: string };

export interface BlueprintEntity {
  readonly name: string;
  /** Linke obere Ecke relativ zur Blaupause. */
  readonly dx: number;
  readonly dy: number;
  readonly dir: Dir;
  readonly settings?: Settings;
}

export interface Blueprint {
  readonly w: number;
  readonly h: number;
  readonly entities: readonly BlueprintEntity[];
}

/** Geist: geplantes Gebäude, das gebaut werden soll (Blaupause). Belegt keine Felder der echten Gebäude. */
export interface GhostEntity {
  readonly id: number;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly dir: Dir;
  readonly settings?: Settings;
}

export function settingsOf(e: Entity): Settings | undefined {
  if (e.kind === 'assembler' && e.recipe) return { recipe: e.recipeKey! };
  if (e.kind === 'underground') return { out: e.output };
  if (e.kind === 'container' && e.inventory.bar < e.inventory.size) return { bar: e.inventory.bar };
  if (e.kind === 'inserter' && e.filters.some((f) => f)) return { if: [...e.filters], ib: e.filterBlacklist };
  if (e.kind === 'splitter') {
    const st = e.state;
    if (st.inputPriority < 0 && st.outputPriority < 0 && st.filter < 0) return undefined;
    return { ip: st.inputPriority, op: st.outputPriority, fi: st.filter >= 0 ? ITEM_IDS[st.filter] : null };
  }
  return undefined;
}

export function applySettings(e: Entity, s: Settings | undefined): void {
  if (!s) return;
  if (e.kind === 'assembler' && s.recipe) e.setRecipe(s.recipe);
  if (e.kind === 'underground' && s.out !== undefined && e.output !== s.out) e.load({ out: s.out });
  if (e.kind === 'inserter' && s.if) {
    e.filters = [...s.if];
    e.filterBlacklist = !!s.ib;
  }
  if (e.kind === 'container' && s.bar !== undefined) e.inventory.bar = Math.max(0, Math.min(e.inventory.size, s.bar));
  if (e.kind === 'splitter') {
    e.state.inputPriority = s.ip ?? -1;
    e.state.outputPriority = s.op ?? -1;
    e.state.filter = s.fi ? ITEM_IDS.indexOf(s.fi) : -1;
  }
}

/** Blaupause aus einem Rechteck (Felder, einschließlich) – alle Gebäude, die ganz oder teilweise darin liegen. */
export function capture(w: World, x0: number, y0: number, x1: number, y1: number): Blueprint | null {
  const ax = Math.min(x0, x1);
  const ay = Math.min(y0, y1);
  const bx = Math.max(x0, x1);
  const by = Math.max(y0, y1);
  const found = new Map<number, Entity>();
  for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) {
    const e = w.entityAt(x, y);
    if (e) found.set(e.id, e);
  }
  if (!found.size) return null;
  const list = [...found.values()].sort((a, b) => a.id - b.id);
  const minX = Math.min(...list.map((e) => e.x));
  const minY = Math.min(...list.map((e) => e.y));
  const maxX = Math.max(...list.map((e) => e.x + e.w));
  const maxY = Math.max(...list.map((e) => e.y + e.h));
  return {
    w: maxX - minX,
    h: maxY - minY,
    entities: list.map((e) => {
      const s = settingsOf(e);
      return { name: e.name, dx: e.x - minX, dy: e.y - minY, dir: e.dir, ...(s ? { settings: s } : {}) };
    }),
  };
}

/** Um 90° im Uhrzeigersinn drehen (R beim Platzieren). */
export function rotate(bp: Blueprint): Blueprint {
  return {
    w: bp.h,
    h: bp.w,
    entities: bp.entities.map((e) => {
      const def = entityDef(e.name);
      const h = sizeOf(def, e.dir)[1];
      const dir = (def.rotatable ? (e.dir + 1) % 4 : e.dir) as Dir;
      return { ...e, dx: bp.h - (e.dy + h), dy: e.dx, dir };
    }),
  };
}

/** Gebäude einer Blaupause, abgelegt mit linker oberer Ecke bei (x, y). */
export function placed(bp: Blueprint, x: number, y: number): { name: string; x: number; y: number; dir: Dir; settings?: Settings }[] {
  return bp.entities.map((e) => ({ name: e.name, x: x + e.dx, y: y + e.dy, dir: e.dir, settings: e.settings }));
}

/** Text zum Teilen: eigenes Format (JSON, Base64), nicht kompatibel mit anderen Spielen. */
export function encode(bp: Blueprint): string {
  const bytes = new TextEncoder().encode(JSON.stringify({ v: 1, ...bp }));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return 'EW1' + btoa(bin);
}

export function decode(text: string): Blueprint | null {
  try {
    const t = text.trim();
    if (!t.startsWith('EW1')) return null;
    const bin = atob(t.slice(3));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const d = JSON.parse(new TextDecoder().decode(bytes)) as Blueprint & { v: number };
    if (d.v !== 1 || !Array.isArray(d.entities)) return null;
    for (const e of d.entities) entityDef(e.name);
    return { w: d.w, h: d.h, entities: d.entities };
  } catch {
    return null;
  }
}

/** Geister in der Welt: werden durch passendes Bauen (Spieler, später Roboter) zu echten Gebäuden. */
export class GhostSystem {
  readonly all = new Map<number, GhostEntity>();
  private readonly occ = new Map<number, number>();
  private nextId = 1;
  /** Erhöht bei jeder Änderung (Darstellung). */
  version = 0;

  at(tx: number, ty: number): GhostEntity | undefined {
    const id = this.occ.get(tileKey(tx, ty));
    return id !== undefined ? this.all.get(id) : undefined;
  }

  /** Geist darf hin: Gelände wie beim Bauen (Bäume erlaubt, die fällt der Bauende), kein Gebäude, kein Geist. */
  canPlace(w: World, name: string, x: number, y: number, dir: Dir): boolean {
    for (const [tx, ty] of footprint(name, x, y, dir)) if (this.occ.has(tileKey(tx, ty))) return false;
    const chk = w.canPlace(name, x, y, dir);
    return chk.ok || chk.reason === 'Baum im Weg' || chk.reason === 'Spieler im Weg';
  }

  add(w: World, name: string, x: number, y: number, dir: Dir, settings?: Settings): GhostEntity | null {
    if (!this.canPlace(w, name, x, y, dir)) return null;
    const g: GhostEntity = { id: this.nextId++, name, x, y, dir, ...(settings ? { settings } : {}) };
    this.all.set(g.id, g);
    for (const [tx, ty] of footprint(name, x, y, dir)) this.occ.set(tileKey(tx, ty), g.id);
    this.version++;
    return g;
  }

  /** Blaupause als Geister ablegen; liefert die Zahl der gesetzten Geister. */
  placeBlueprint(w: World, bp: Blueprint, x: number, y: number): number {
    let n = 0;
    for (const p of placed(bp, x, y)) if (this.add(w, p.name, p.x, p.y, p.dir, p.settings)) n++;
    return n;
  }

  remove(id: number): void {
    const g = this.all.get(id);
    if (!g) return;
    this.all.delete(id);
    for (const [tx, ty] of footprint(g.name, g.x, g.y, g.dir)) if (this.occ.get(tileKey(tx, ty)) === id) this.occ.delete(tileKey(tx, ty));
    this.version++;
  }

  /** Ein echtes Gebäude entstand: passenden Geist übernehmen (Einstellungen), überdeckte Geister entfernen. */
  onBuilt(e: Entity): void {
    let match: GhostEntity | undefined;
    const hit = new Set<number>();
    for (const [tx, ty] of footprint(e.name, e.x, e.y, e.dir)) {
      const id = this.occ.get(tileKey(tx, ty));
      if (id !== undefined) hit.add(id);
    }
    for (const id of hit) {
      const g = this.all.get(id)!;
      if (g.name === e.name && g.x === e.x && g.y === e.y) match = g;
      this.remove(id);
    }
    if (match) applySettings(e, match.settings);
  }

  serialize(): { n: number; g: [number, string, number, number, number, Settings | null][] } {
    return { n: this.nextId, g: [...this.all.values()].map((g) => [g.id, g.name, g.x, g.y, g.dir, g.settings ?? null]) };
  }
  load(_w: World, d: ReturnType<GhostSystem['serialize']> | undefined): void {
    if (!d || !Array.isArray(d.g)) return;
    for (const [id, name, x, y, dir, s] of d.g) {
      const g: GhostEntity = { id, name, x, y, dir: dir as Dir, ...(s ? { settings: s } : {}) };
      this.all.set(id, g);
      for (const [tx, ty] of footprint(name, x, y, g.dir)) this.occ.set(tileKey(tx, ty), id);
    }
    this.nextId = d.n;
    this.version++;
  }
}

function footprint(name: string, x: number, y: number, dir: Dir): [number, number][] {
  const [w, h] = sizeOf(entityDef(name), dir);
  const out: [number, number][] = [];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) out.push([x + i, y + j]);
  return out;
}
