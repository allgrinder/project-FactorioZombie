import { type EntityDef, entityDef } from '../data/entities';
import { ASPHALT } from '../data/floors';
import { SITES } from '../data/loot';
import { hash01 } from './rng';
import type { World } from './world';

export type SiteKind = 'starter' | 'village' | 'farm' | 'garage' | 'camp' | 'wreck';

/** Fundort: Mittelpunkt, Radius (Zombies lungern darin), Gewicht (Zahl der Zombies), Art. */
export interface Site {
  x: number;
  y: number;
  r: number;
  weight: number;
  kind: SiteKind;
}

const cellKey = (gx: number, gy: number) => gx * 100003 + gy;
const STARTER = 999_999_937;

/**
 * Fundorte der alten Welt: verlassene Dörfer (Straße mit Häusern, Laden, Wracks), Höfe, Werkstätten, Lager
 * und einzelne Wracks. Deterministisch je Rasterzelle aus dem Karten-Seed; angelegt, sobald die Figur in die
 * Nähe kommt. Die Gebäude sind gewöhnliche Entities (kind 'loot') und stehen damit im Spielstand.
 */
export class SiteSystem {
  readonly sites: Site[] = [];
  private readonly cells = new Set<number>();

  ensureArea(w: World, x0: number, y0: number, x1: number, y1: number): void {
    if (!w.settings.sites) return;
    if (!this.cells.has(STARTER)) {
      this.cells.add(STARTER);
      this.starter(w);
    }
    const c = SITES.cell;
    for (let gy = Math.floor(y0 / c); gy <= Math.floor(y1 / c); gy++) {
      for (let gx = Math.floor(x0 / c); gx <= Math.floor(x1 / c); gx++) {
        const k = cellKey(gx, gy);
        if (this.cells.has(k)) continue;
        this.cells.add(k);
        this.genCell(w, gx, gy);
      }
    }
  }

  sitesIn(x0: number, y0: number, x1: number, y1: number): Site[] {
    return this.sites.filter((s) => s.x >= x0 && s.x < x1 && s.y >= y0 && s.y < y1);
  }

  /** Nächster Fundort (Anzeige, Tests). */
  nearest(x: number, y: number): Site | null {
    let best: Site | null = null;
    let bd = Infinity;
    for (const s of this.sites) {
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  // ------------------------------------------------------------ Bauen

  private fits(w: World, def: EntityDef, x: number, y: number): boolean {
    for (let j = 0; j < def.height; j++) {
      for (let i = 0; i < def.width; i++) {
        const tx = x + i;
        const ty = y + j;
        if (w.map.isBlocked(tx, ty) || w.entityAt(tx, ty) || w.map.resourceAt(tx, ty).amount > 0) return false;
      }
    }
    const p = w.player;
    return !(p && p.overlapsRect(x - 1, y - 1, def.width + 2, def.height + 2));
  }

  /** Fundort-Gebäude setzen, wenn die Fläche frei ist (Bäume werden gerodet). */
  private put(w: World, name: string, x: number, y: number): boolean {
    const def = entityDef(name);
    x = Math.round(x);
    y = Math.round(y);
    if (!this.fits(w, def, x, y)) return false;
    w.map.clearTrees(x - 1, y - 1, x + def.width, y + def.height);
    w.create(w.nextId++, name, x, y, 0);
    return true;
  }

  private asphalt(w: World, x0: number, y0: number, x1: number, y1: number): void {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (w.map.isBlocked(x, y) || w.map.resourceAt(x, y).amount > 0 || w.map.floorAt(x, y)) continue;
        w.map.setFloor(x, y, ASPHALT);
      }
    }
    w.map.clearTrees(x0, y0, x1, y1);
  }

  // ------------------------------------------------------------ Arten

  /** Startfundort in Sichtweite: Schuppen, Wrack und Kiste – zeigt, wie Plündern geht. */
  private starter(w: World): void {
    const s = w.seed;
    const a0 = hash01(s, 801) * Math.PI * 2;
    for (let k = 0; k < 12; k++) {
      const a = a0 + (k * Math.PI) / 6;
      const d = SITES.starter.distMin + hash01(s, 802, k) * (SITES.starter.distMax - SITES.starter.distMin);
      const x = Math.round(Math.cos(a) * d);
      const y = Math.round(Math.sin(a) * d);
      if (!this.put(w, 'ruin-shed', x, y)) continue;
      this.put(w, 'car-wreck', x + 5, y + 2);
      this.put(w, 'supply-crate', x - 2, y + 1);
      this.asphalt(w, x + 4, y + 4, x + 9, y + 5);
      this.sites.push({ x: x + 2, y: y + 2, r: 6, weight: 0, kind: 'starter' });
      return;
    }
  }

  private genCell(w: World, gx: number, gy: number): void {
    const s = w.seed;
    const c = SITES.cell;
    if (hash01(s, gx, gy, 811) >= SITES.chance) return;
    const x = Math.round((gx + 0.25 + hash01(s, gx, gy, 812) * 0.5) * c);
    const y = Math.round((gy + 0.25 + hash01(s, gx, gy, 813) * 0.5) * c);
    if (Math.hypot(x, y) < SITES.startFree) return;
    const t = hash01(s, gx, gy, 814);
    const h = (n: number) => hash01(s, gx, gy, 820 + n);
    let placed = 0;
    let site: Site;
    if (t < SITES.village) {
      placed = this.village(w, x, y, h);
      site = { x, y, r: 16, weight: 4, kind: 'village' };
    } else if (t < SITES.village + SITES.farm) {
      placed += +this.put(w, 'ruin-house', x - 3, y - 2);
      placed += +this.put(w, 'ruin-shed', x + 5, y - 1 + Math.round(h(1) * 3));
      placed += +this.put(w, 'supply-crate', x + 3, y + 3);
      if (h(2) < 0.5) placed += +this.put(w, 'dumpster', x - 5, y + 3);
      site = { x, y, r: 9, weight: 1.5, kind: 'farm' };
    } else if (t < SITES.village + SITES.farm + SITES.garage) {
      this.asphalt(w, x - 6, y + 2, x + 6, y + 6);
      placed += +this.put(w, 'ruin-garage', x - 2, y - 3);
      const cars = 2 + Math.floor(h(1) * 3);
      for (let i = 0; i < cars; i++) placed += +this.put(w, 'car-wreck', x - 6 + i * 4, y + 3 + (i % 2) * 2);
      placed += +this.put(w, 'dumpster', x + 4, y - 2);
      site = { x, y, r: 10, weight: 2, kind: 'garage' };
    } else if (t < SITES.village + SITES.farm + SITES.garage + SITES.camp) {
      placed += +this.put(w, 'military-crate', x, y);
      placed += +this.put(w, 'supply-crate', x + 2, y);
      placed += +this.put(w, 'supply-crate', x - 1, y + 2);
      placed += +this.put(w, 'car-wreck', x - 5, y - 1);
      site = { x, y, r: 7, weight: 2.5, kind: 'camp' };
    } else {
      placed += +this.put(w, 'car-wreck', x, y);
      if (h(1) < 0.6) placed += +this.put(w, 'supply-crate', x + 4, y + 1);
      site = { x, y, r: 5, weight: 0.7, kind: 'wreck' };
    }
    if (placed > 0) this.sites.push(site);
  }

  /** Dorf: Straße (waagerecht oder senkrecht) mit Häusern auf beiden Seiten, einem Laden, einer Werkstatt, Wracks. */
  private village(w: World, cx: number, cy: number, h: (n: number) => number): number {
    const horizontal = h(1) < 0.6;
    const len = 30 + Math.floor(h(2) * 14);
    const a0 = -Math.floor(len / 2);
    let placed = 0;
    let special = 0;
    if (horizontal) this.asphalt(w, cx + a0, cy, cx + a0 + len, cy + 1);
    else this.asphalt(w, cx, cy + a0, cx + 1, cy + a0 + len);
    for (const side of [0, 1]) {
      let a = a0 + 1 + Math.floor(h(10 + side) * 3);
      let i = 0;
      while (a < a0 + len - 3) {
        const r = h(20 + side * 40 + i);
        const name = r < 0.14 && !(special & 1) ? 'ruin-store' : r < 0.28 && !(special & 2) ? 'ruin-garage' : r < 0.5 ? 'ruin-shed' : 'ruin-house';
        const def = entityDef(name);
        const along = horizontal ? def.width : def.height;
        const depth = horizontal ? def.height : def.width;
        // Abstand zur Straße: ein Feld Gehweg
        const off = side === 0 ? -1 - depth : 3;
        const ok = horizontal ? this.put(w, name, cx + a, cy + off) : this.put(w, name, cx + off, cy + a);
        if (ok) {
          placed++;
          if (name === 'ruin-store') special |= 1;
          if (name === 'ruin-garage') special |= 2;
          // Müllcontainer oder Kiste neben manchem Haus
          const extra = h(100 + side * 40 + i);
          if (extra < 0.3) {
            const ex = horizontal ? cx + a + along : cx + (side === 0 ? -2 : 3);
            const ey = horizontal ? cy + (side === 0 ? -2 : 3) : cy + a + along;
            placed += +this.put(w, extra < 0.15 ? 'dumpster' : 'supply-crate', ex, ey);
          }
        }
        a += along + 2 + Math.floor(h(60 + side * 40 + i) * 4);
        i++;
      }
    }
    // Wracks auf (waagerecht) bzw. neben (senkrecht) der Straße
    const cars = 2 + Math.floor(h(3) * 3);
    for (let i = 0; i < cars; i++) {
      const a = a0 + 2 + Math.floor(h(200 + i) * (len - 6));
      placed += +(horizontal ? this.put(w, 'car-wreck', cx + a, cy) : this.put(w, 'car-wreck', cx - 1, cy + a));
    }
    return placed;
  }

  // ------------------------------------------------------------ Speichern

  serialize(): { c: number[]; s: [number, number, number, number, SiteKind][] } {
    return { c: [...this.cells].sort((a, b) => a - b), s: this.sites.map((s) => [s.x, s.y, s.r, s.weight, s.kind]) };
  }

  load(d: ReturnType<SiteSystem['serialize']> | undefined): void {
    this.cells.clear();
    this.sites.length = 0;
    for (const c of d?.c ?? []) this.cells.add(c);
    for (const [x, y, r, weight, kind] of d?.s ?? []) this.sites.push({ x, y, r, weight, kind });
  }
}
