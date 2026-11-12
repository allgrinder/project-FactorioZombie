import { type EntityDef, entityDef } from '../data/entities';
import { ASPHALT } from '../data/floors';
import { SITES } from '../data/loot';
import { type TownDef, WORLD } from '../data/world';
import { hash01 } from './rng';
import type { World } from './world';

export type SiteKind = 'starter' | 'village' | 'farm' | 'garage' | 'camp' | 'wreck' | 'town' | 'outpost';

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
        if (w.settings.plan) this.planCell(w, gx, gy);
        else this.genCell(w, gx, gy);
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

  private fits(w: World, def: EntityDef, x: number, y: number, level = false): boolean {
    for (let j = 0; j < def.height; j++) {
      for (let i = 0; i < def.width; i++) {
        const tx = x + i;
        const ty = y + j;
        if ((!level && w.map.isBlocked(tx, ty)) || w.entityAt(tx, ty) || w.map.resourceAt(tx, ty).amount > 0) return false;
      }
    }
    const p = w.player;
    return !(p && p.overlapsRect(x - 1, y - 1, def.width + 2, def.height + 2));
  }

  /** Fundort-Gebäude setzen, wenn die Fläche frei ist (Bäume werden gerodet). */
  private put(w: World, name: string, x: number, y: number, level = false): boolean {
    const def = entityDef(name);
    x = Math.round(x);
    y = Math.round(y);
    if (!this.fits(w, def, x, y, level)) return false;
    // Orte der festen Welt stehen auf festem Grund: Wasser und Klippen unter dem Gebäude weichen
    if (level) for (let j = -1; j <= def.height; j++) for (let i = -1; i <= def.width; i++) this.flatten(w, x + i, y + j);
    w.map.clearTrees(x - 1, y - 1, x + def.width, y + def.height);
    w.create(w.nextId++, name, x, y, 0);
    return true;
  }

  private flatten(w: World, x: number, y: number): void {
    if (w.map.isWater(x, y)) w.map.setWater(x, y, false);
    if (w.map.isCliff(x, y)) w.map.removeCliff(x, y);
  }

  private asphalt(w: World, x0: number, y0: number, x1: number, y1: number, level = false): void {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (level) this.flatten(w, x, y);
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

  /** Dorf der Zufallskarten: eine Straße (waagerecht oder senkrecht) mit Häusern, Laden, Werkstatt, Wracks. */
  private village(w: World, cx: number, cy: number, h: (n: number) => number): number {
    return this.street(w, cx, cy, h(1) < 0.6, 30 + Math.floor(h(2) * 14), 'village', h, false);
  }

  /**
   * Straße mit Bebauung auf beiden Seiten. profile: 'village' (gemischt), 'center' (Läden, Werkstätten),
   * 'homes' (Wohnhäuser, Schuppen), 'works' (Werkstätten, Wracks). level: Wasser/Klippen einebnen (feste Welt).
   */
  private street(w: World, cx: number, cy: number, horizontal: boolean, len: number, profile: 'village' | 'center' | 'homes' | 'works',
    h: (n: number) => number, level: boolean): number {
    const a0 = -Math.floor(len / 2);
    let placed = 0;
    let special = 0;
    if (horizontal) this.asphalt(w, cx + a0, cy, cx + a0 + len, cy + 1, level);
    else this.asphalt(w, cx, cy + a0, cx + 1, cy + a0 + len, level);
    const pick = (r: number): string => {
      switch (profile) {
        case 'center': return r < 0.34 ? 'ruin-store' : r < 0.5 ? 'ruin-garage' : r < 0.62 ? 'ruin-shed' : 'ruin-house';
        case 'homes': return r < 0.26 ? 'ruin-shed' : 'ruin-house';
        case 'works': return r < 0.5 ? 'ruin-garage' : r < 0.75 ? 'ruin-shed' : r < 0.85 ? 'ruin-store' : 'ruin-house';
        default: return r < 0.14 && !(special & 1) ? 'ruin-store' : r < 0.28 && !(special & 2) ? 'ruin-garage' : r < 0.5 ? 'ruin-shed' : 'ruin-house';
      }
    };
    for (const side of [0, 1]) {
      let a = a0 + 1 + Math.floor(h(10 + side) * 3);
      let i = 0;
      while (a < a0 + len - 3) {
        const name = pick(h(20 + side * 40 + i));
        const def = entityDef(name);
        const along = horizontal ? def.width : def.height;
        const depth = horizontal ? def.height : def.width;
        // Abstand zur Straße: ein Feld Gehweg
        const off = side === 0 ? -1 - depth : 3;
        const ok = horizontal ? this.put(w, name, cx + a, cy + off, level) : this.put(w, name, cx + off, cy + a, level);
        if (ok) {
          placed++;
          if (name === 'ruin-store') special |= 1;
          if (name === 'ruin-garage') special |= 2;
          // Müllcontainer oder Kiste neben manchem Haus
          const extra = h(100 + side * 40 + i);
          if (extra < 0.3) {
            const ex = horizontal ? cx + a + along : cx + (side === 0 ? -2 : 3);
            const ey = horizontal ? cy + (side === 0 ? -2 : 3) : cy + a + along;
            placed += +this.put(w, extra < 0.15 ? 'dumpster' : 'supply-crate', ex, ey, level);
          }
        }
        a += along + 2 + Math.floor(h(60 + side * 40 + i) * 4);
        i++;
      }
    }
    // Wracks auf (waagerecht) bzw. neben (senkrecht) der Straße
    const cars = Math.round((profile === 'works' ? 0.16 : 0.09) * len) + Math.floor(h(3) * 2);
    for (let i = 0; i < cars; i++) {
      const a = a0 + 2 + Math.floor(h(200 + i) * (len - 6));
      placed += +(horizontal ? this.put(w, 'car-wreck', cx + a, cy, level) : this.put(w, 'car-wreck', cx - 4, cy + a, level));
    }
    return placed;
  }

  // ------------------------------------------------------------ Feste Welt (src/data/world.ts)

  /** Höfe an den Landstraßen (einmal aus den Straßen berechnet). */
  private farmSpots: [number, number][] | null = null;
  private farms(): [number, number][] {
    if (this.farmSpots) return this.farmSpots;
    const out: [number, number][] = [];
    WORLD.roads.forEach((road, ri) => {
      let run = WORLD.farmEvery * 0.6;
      for (let k = 0; k + 1 < road.length; k++) {
        const [ax, ay] = road[k];
        const [bx, by] = road[k + 1];
        const L = Math.hypot(bx - ax, by - ay);
        while (run < L) {
          const t = run / L;
          const side = hash01(WORLD.seed, ri, out.length, 840) < 0.5 ? 1 : -1;
          const nx = (-(by - ay) / L) * side;
          const ny = ((bx - ax) / L) * side;
          const x = Math.round(ax + (bx - ax) * t + nx * WORLD.farmOffset);
          const y = Math.round(ay + (by - ay) * t + ny * WORLD.farmOffset);
          if (Math.hypot(x, y) > 45 && !this.nearTown(x, y, 60)) out.push([x, y]);
          run += WORLD.farmEvery;
        }
        run -= L;
      }
    });
    return (this.farmSpots = out);
  }

  private nearTown(x: number, y: number, r: number): boolean {
    return WORLD.towns.some((t) => Math.hypot(t.x - x, t.y - y) < r) || WORLD.outposts.some((o) => Math.hypot(o.x - x, o.y - y) < r * 0.5);
  }

  /** Eine Rasterzelle der festen Welt: Straßenstücke, Orte, Posten und Höfe, die sie berühren; dazu wenige Wracks. */
  private planCell(w: World, gx: number, gy: number): void {
    const c = SITES.cell;
    const x0 = gx * c;
    const y0 = gy * c;
    const x1 = x0 + c;
    const y1 = y0 + c;
    // Landstraßen zuerst (Orte setzen ihre Straßen darüber)
    for (const road of WORLD.roads) {
      for (let k = 0; k + 1 < road.length; k++) {
        const [ax, ay] = road[k];
        const [bx, by] = road[k + 1];
        if (Math.max(ax, bx) < x0 - 2 || Math.min(ax, bx) > x1 + 2 || Math.max(ay, by) < y0 - 2 || Math.min(ay, by) > y1 + 2) continue;
        const L = Math.hypot(bx - ax, by - ay);
        for (let d = 0; d <= L; d += 0.5) {
          const x = Math.floor(ax + ((bx - ax) * d) / L);
          const y = Math.floor(ay + ((by - ay) * d) / L);
          if (x < x0 || x >= x1 || y < y0 || y >= y1) continue;
          this.asphalt(w, x, y, x + 1, y + 1, true);
        }
      }
    }
    const inCell = (x: number, y: number) => x >= x0 && x < x1 && y >= y0 && y < y1;
    for (const t of WORLD.towns) if (inCell(t.x, t.y)) this.town(w, t);
    for (const o of WORLD.outposts) if (inCell(o.x, o.y)) this.outpost(w, o.x, o.y);
    this.farms().forEach(([x, y], i) => {
      if (!inCell(x, y)) return;
      const h = (n: number) => hash01(WORLD.seed, i, 850 + n);
      let placed = +this.put(w, 'ruin-house', x - 3, y - 2, true);
      placed += +this.put(w, 'ruin-shed', x + 4, y - 1 + Math.round(h(1) * 3), true);
      placed += +this.put(w, 'supply-crate', x + 3, y + 3, true);
      if (h(2) < 0.5) placed += +this.put(w, 'car-wreck', x - 5, y + 3, true);
      if (placed) this.sites.push({ x, y, r: 9, weight: 1.5, kind: 'farm' });
    });
    // Wildnis: vereinzelt ein Wrack oder ein verlassenes Lager, nicht bei Orten
    const s = w.seed;
    if (hash01(s, gx, gy, 811) >= WORLD.wildChance) return;
    const x = Math.round((gx + 0.2 + hash01(s, gx, gy, 812) * 0.6) * c);
    const y = Math.round((gy + 0.2 + hash01(s, gx, gy, 813) * 0.6) * c);
    if (Math.hypot(x, y) < SITES.startFree || this.nearTown(x, y, WORLD.townClear)) return;
    if (hash01(s, gx, gy, 814) < 0.3) {
      let placed = +this.put(w, 'supply-crate', x, y);
      placed += +this.put(w, 'supply-crate', x + 2, y + 1);
      placed += +this.put(w, 'car-wreck', x - 5, y - 1);
      if (placed) this.sites.push({ x, y, r: 6, weight: 1.5, kind: 'camp' });
    } else if (this.put(w, 'car-wreck', x, y)) this.sites.push({ x, y, r: 5, weight: 0.7, kind: 'wreck' });
  }

  /** Ort: Hauptstraße (Ortskern) mit Querstraßen (Wohnhäuser); Gewerbeorte mit Werkstätten am Rand. */
  private town(w: World, t: TownDef): void {
    const hs = (k: number) => (n: number) => hash01(WORLD.seed, t.x, t.y, 900 + k * 300 + n);
    const horizontal = t.axis === 'x';
    const len = WORLD.mainLength[t.size - 1];
    const weight = 2 + t.size * 1.5;
    this.street(w, t.x, t.y, horizontal, len, t.size === 1 ? 'village' : 'center', hs(0), true);
    // Fundort-Einträge entlang der Hauptstraße (Zombies lungern dort)
    for (let a = -len / 2 + 9; a < len / 2; a += 18) this.sites.push({ x: t.x + (horizontal ? a : 0), y: t.y + (horizontal ? 0 : a), r: 11, weight, kind: 'town' });
    const n = WORLD.crossStreets[t.size - 1];
    const cl = WORLD.crossLength[t.size - 1];
    for (let k = 0; k < n; k++) {
      const a = Math.round(-len / 2 + ((k + 0.5) * len) / n);
      // abwechselnd nach beiden Seiten, vom Gehweg der Hauptstraße weg
      const side = k % 2 === 0 ? 1 : -1;
      const off = side * (cl / 2 + 8);
      const cx = t.x + (horizontal ? a : off);
      const cy = t.y + (horizontal ? off : a);
      const profile = t.industrial && k % 2 === 1 ? 'works' : 'homes';
      // Zufahrt von der Hauptstraße
      if (horizontal) this.asphalt(w, cx, Math.min(t.y, cy), cx + 1, Math.max(t.y, cy), true);
      else this.asphalt(w, Math.min(t.x, cx), cy, Math.max(t.x, cx), cy + 1, true);
      this.street(w, cx, cy, !horizontal, cl, profile, hs(k + 1), true);
      this.sites.push({ x: cx, y: cy, r: 13, weight: weight * 0.8, kind: 'town' });
    }
  }

  /** Militärposten: Kisten hinter Wracks, stark bewacht. */
  private outpost(w: World, x: number, y: number): void {
    this.asphalt(w, x - 6, y - 4, x + 7, y + 5, true);
    for (const [dx, dy] of [[-3, -2], [-1, -2], [1, -2], [3, -2], [-3, 2], [3, 2]] as const) this.put(w, dx % 2 ? 'military-crate' : 'supply-crate', x + dx, y + dy, true);
    this.put(w, 'military-crate', x, y, true);
    this.put(w, 'car-wreck', x - 8, y + 6, true);
    this.put(w, 'car-wreck', x + 5, y - 7, true);
    this.put(w, 'ruin-shed', x - 9, y - 6, true);
    this.sites.push({ x, y, r: 10, weight: 7, kind: 'outpost' });
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
