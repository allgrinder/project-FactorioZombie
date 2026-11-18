import { type EntityDef, entityDef } from '../data/entities';
import { ASPHALT, CONCRETE, FIELD, PAVEMENT, PLANKS, ROADLINE_E, ROADLINE_S, TILES } from '../data/floors';
import { SITES } from '../data/loot';
import { type PlaceDef, type TownDef, WORLD, roadSegments } from '../data/world';
import { hash01 } from './rng';
import { RAIDER } from '../data/strangers';
import type { World } from './world';

export type SiteKind = 'starter' | 'village' | 'farm' | 'garage' | 'camp' | 'wreck' | 'town' | 'outpost' | 'junkyard';

/** Fundort: Mittelpunkt, Radius (Zombies lungern darin), Gewicht (Zahl der Zombies), Art. */
export interface Site {
  x: number;
  y: number;
  r: number;
  weight: number;
  kind: SiteKind;
}

export type RoofKind = 'tile' | 'slate' | 'metal' | 'flat';
/** Begehbares Haus: Grundriss (Felder), Dach (Darstellung, blendet aus, wenn die Figur drin ist), First (0 Ost-West, 1 Nord-Süd). */
export interface House {
  x: number;
  y: number;
  w: number;
  h: number;
  roof: RoofKind;
  ridge: 0 | 1;
}
/** Nutzung: Wohnhaus, Laden, Scheune, Werkstatt/Halle, Zellentrakt, Büro/Wache. */
export type HouseKind = 'home' | 'store' | 'barn' | 'works' | 'cells' | 'office' | 'church';
type Room = { x: number; y: number; w: number; h: number; type: string };

const cellKey = (gx: number, gy: number) => gx * 100003 + gy;
const STARTER = 999_999_937;

/**
 * Fundorte der alten Welt: verlassene Dörfer (Straße mit Häusern, Laden, Wracks), Höfe, Werkstätten, Lager
 * und einzelne Wracks. Deterministisch je Rasterzelle aus dem Karten-Seed; angelegt, sobald die Figur in die
 * Nähe kommt. Die Gebäude sind gewöhnliche Entities (kind 'loot') und stehen damit im Spielstand.
 */
export class SiteSystem {
  readonly sites: Site[] = [];
  /** Begehbare Häuser (für Dächer und Karte). */
  readonly houses: House[] = [];
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

  /** Baum pflanzen (Allee, Hecke, Garten), wo Land frei ist: kein Belag, kein Gebäude in der Nähe. kind 0 Laub-, 1 Nadelbaum. */
  private tree(w: World, x: number, y: number, kind = 0): void {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (w.map.isBlocked(tx, ty) || w.map.floorAt(tx, ty) || w.map.resourceAt(tx, ty).amount > 0) return;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (w.entityAt(tx + i, ty + j)) return;
    for (const hs of this.houses) if (tx >= hs.x - 1 && tx <= hs.x + hs.w && ty >= hs.y - 1 && ty <= hs.y + hs.h) return;
    if (Math.hypot(x, y) < SITES.startFree * 0.5) return;
    w.map.trees.plant(x, y, kind, Math.floor(hash01(WORLD.seed, tx, ty, 77) * 8));
  }

  /** Baumreihe von (ax, ay) nach (bx, by): alle step Felder, mit Lücken (gap = Anteil fehlender Bäume) und leichtem Versatz. */
  private treeRow(w: World, ax: number, ay: number, bx: number, by: number, step: number, gap: number, kind = 0, inside?: (x: number, y: number) => boolean): void {
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.floor(len / step);
    for (let i = 0; i <= n; i++) {
      const f = n ? i / n : 0;
      const x = ax + (bx - ax) * f;
      const y = ay + (by - ay) * f;
      const h = hash01(WORLD.seed, Math.round(x * 3), Math.round(y * 3), 78);
      if (h < gap) continue;
      const jx = x + (hash01(WORLD.seed, Math.round(x), Math.round(y), 79) - 0.5) * 0.9;
      const jy = y + (hash01(WORLD.seed, Math.round(x), Math.round(y), 80) - 0.5) * 0.9;
      if (inside && !inside(Math.floor(jx), Math.floor(jy))) continue;
      this.tree(w, jx, jy, h > 0.93 ? 1 - kind : kind);
    }
  }

  /** Belag setzen, wo Land ist (over: vorhandenen Belag ersetzen, z. B. Asphalt durch Mittellinie). */
  private paint(w: World, x: number, y: number, id: number, over = false): void {
    if (w.map.isBlocked(x, y) || w.map.resourceAt(x, y).amount > 0) return;
    if (!over && w.map.floorAt(x, y)) return;
    const e = w.entityAt(x, y);
    if (e && e.kind !== 'wire' && e.kind !== 'trap') return;
    w.map.setFloor(x, y, id);
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
      // der erste Überlebende wartet gleich am Schuppen
      w.community.addSurvivor(x + 1.5, y + 4.5, w.seed);
      // defekter Pritschenwagen (zu reparieren): ein paar Ausweichstellen, falls etwas im Weg steht
      for (const [dx, dy] of [[5, 2], [5, 5], [-6, 1], [1, 6], [6, -3], [-3, -6]]) {
        if (this.put(w, 'pickup-wreck', x + dx, y + dy, true)) break;
      }
      this.put(w, 'supply-crate', x - 2, y + 1);
      // Material für den Anfang: Schrott, Schutt, Kohle, Holz (von Hand ausschlachten)
      for (const [name, dx, dy] of [['scrap-pile', 9, -2], ['rubble-pile', -5, -3], ['coal-pile', -4, 4], ['wood-pile', 1, -3], ['scrap-pile', 11, 6]] as const) {
        for (let t = 0; t < 4 && !this.put(w, name, x + dx + t * 2, y + dy); t++);
      }
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
    if (level) {
      // Ortsstraße: gestrichelte Mittellinie und Gehwege auf beiden Seiten
      for (let a = a0; a <= a0 + len; a++) {
        const dash = ((a % 4) + 4) % 4 < 2;
        if (horizontal) {
          if (dash) this.paint(w, cx + a, cy, ROADLINE_S, true);
          this.paint(w, cx + a, cy - 1, PAVEMENT);
          this.paint(w, cx + a, cy + 2, PAVEMENT);
        } else {
          if (dash) this.paint(w, cx, cy + a, ROADLINE_E, true);
          this.paint(w, cx - 1, cy + a, PAVEMENT);
          this.paint(w, cx + 2, cy + a, PAVEMENT);
        }
      }
    }
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
        // meist begehbare Häuser; manche sind ausgebrannte Ruinen (nicht betretbar)
        const hi = (m: number) => h(1000 + side * 500 + i * 17 + m);
        const walk = name === 'ruin-house' ? hi(0) < 0.85 : name === 'ruin-store' ? hi(0) < 0.8 : name === 'ruin-garage' ? hi(0) < 0.65 : false;
        const hk: HouseKind = name === 'ruin-store' ? 'store' : name === 'ruin-garage' ? 'works' : 'home';
        const def = entityDef(name);
        const HW = hk === 'store' ? 10 + Math.floor(hi(1) * 3) : hk === 'works' ? 8 + Math.floor(hi(1) * 3) : 7 + Math.floor(hi(1) * 4);
        const HH = hk === 'store' ? 7 + Math.floor(hi(2) * 2) : hk === 'works' ? 7 + Math.floor(hi(2) * 2) : 6 + Math.floor(hi(2) * 3);
        const along = walk ? (horizontal ? HW : HH) : horizontal ? def.width : def.height;
        const depth = walk ? (horizontal ? HH : HW) : horizontal ? def.height : def.width;
        // Abstand zur Straße: ein Feld Gehweg, dazu ein Vorgarten unterschiedlicher Tiefe
        const setback = walk && hk === 'home' ? Math.floor(hi(3) * 3) : 0;
        const off = side === 0 ? -1 - depth - setback : 3 + setback;
        let ok: boolean;
        if (walk) {
          const doorSide = horizontal ? (side === 0 ? 2 : 0) : side === 0 ? 1 : 3;
          const m = hi(4);
          const mat = hk === 'works' ? (m < 0.6 ? 'concrete' : 'brick') : m < 0.45 ? 'brick' : m < 0.9 ? 'plaster' : 'wood';
          const r = hi(5);
          const roof: RoofKind = hk === 'store' ? 'flat' : hk === 'works' ? (r < 0.6 ? 'metal' : 'flat') : r < 0.5 ? 'tile' : r < 0.85 ? 'slate' : 'metal';
          ok = horizontal ? this.house(w, cx + a, cy + off, HW, HH, hk, doorSide, mat, roof, hi, level) : this.house(w, cx + off, cy + a, HW, HH, hk, doorSide, mat, roof, hi, level);
        } else ok = horizontal ? this.put(w, name, cx + a, cy + off, level) : this.put(w, name, cx + off, cy + a, level);
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
          } else if (extra > 0.72 || name === 'ruin-garage') {
            // hinter dem Haus: Schutt eines eingestürzten Anbaus, bei Werkstätten Autoteile
            const back = side === 0 ? -2 : depth + 1;
            const ex = horizontal ? cx + a : cx + off + (side === 0 ? -2 : depth);
            const ey = horizontal ? cy + off + (side === 0 ? -2 : depth) : cy + a;
            void back;
            placed += +this.put(w, name === 'ruin-garage' ? 'parts-pile' : 'rubble-pile', ex, ey, level);
          }
        }
        // Gartenzaun hinter dem Haus und manchmal ein verwildertes Gemüsebeet
        if (ok && level && walk && hk === 'home' && hi(6) < 0.55) {
          const back = side === 0 ? off - 3 : off + depth + 2;
          for (let q = -1; q <= along; q++) {
            if (q === Math.floor(along / 2)) continue;
            if (horizontal) this.put(w, 'fence', cx + a + q, cy + back);
            else this.put(w, 'fence', cx + back, cy + a + q);
          }
          if (hi(7) < 0.5) {
            const gb = side === 0 ? off - 2 : off + depth;
            if (horizontal) this.put(w, 'garden', cx + a + 1 + Math.floor(hi(8) * (along - 3)), cy + gb - (side === 0 ? 0 : 0));
            else this.put(w, 'garden', cx + gb, cy + a + 1 + Math.floor(hi(8) * (along - 3)));
          }
        }
        // Garten hinter dem Haus: ein, zwei Bäume (manche Grundstücke bleiben leer und verwildern)
        if (ok && level) {
          const back = side === 0 ? -1 - depth - 2.5 : 3 + depth + 2.5;
          for (let t = 0; t < 2; t++) {
            if (h(140 + side * 40 + i + t * 7) > (t === 0 ? 0.65 : 0.3)) continue;
            const along2 = a + h(150 + side * 40 + i + t) * along;
            const deep = back + (side === 0 ? -1 : 1) * h(160 + side * 40 + i + t) * 2;
            this.tree(w, horizontal ? cx + along2 : cx + deep, horizontal ? cy + deep : cy + along2, h(170 + i) < 0.2 ? 1 : 0);
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
    let run = WORLD.farmEvery * 0.6;
    roadSegments().forEach(([ax, ay, bx, by], ri) => {
      const L = Math.hypot(bx - ax, by - ay);
      while (run < L) {
        const t = run / L;
        const side = hash01(WORLD.seed, ri, out.length, 840) < 0.5 ? 1 : -1;
        const horiz = ay === by;
        const x = Math.round(ax + (bx - ax) * t + (horiz ? 0 : side * WORLD.farmOffset));
        const y = Math.round(ay + (by - ay) * t + (horiz ? side * WORLD.farmOffset : 0));
        if (Math.hypot(x, y) > 45 && !this.nearTown(x, y, 60)) out.push([x, y]);
        run += WORLD.farmEvery;
      }
      run -= L;
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
    for (const [ax, ay, bx, by] of roadSegments()) {
      const horiz = ay === by;
      const lo = horiz ? Math.min(ax, bx) : Math.min(ay, by);
      const hi = (horiz ? Math.max(ax, bx) : Math.max(ay, by)) + 1;
      if ((horiz ? hi < x0 || lo >= x1 || ay + 1 < y0 || ay >= y1 : hi < y0 || lo >= y1 || bx + 1 < x0 || bx >= x1)) continue;
      const inside = (x: number, y: number) => x >= x0 && x < x1 && y >= y0 && y < y1;
      for (let a = lo; a <= hi; a++) {
        for (let k = 0; k < 2; k++) {
          const x = horiz ? a : bx + k;
          const y = horiz ? ay + k : a;
          if (inside(x, y)) this.asphalt(w, x, y, x, y, true);
        }
        // gestrichelte Mittellinie, nicht an den Kurven
        if (a - lo > 3 && hi - a > 3 && ((a % 4) + 4) % 4 < 2) {
          const x = horiz ? a : bx;
          const y = horiz ? ay : a;
          if (inside(x, y) && !this.nearTown(x, y, 40)) this.paint(w, x, y, horiz ? ROADLINE_S : ROADLINE_E, true);
        }
      }
      // liegengebliebene Autos am Straßenrand (etwa alle 60 Felder, wechselnde Seite)
      for (let a = lo + 30; a < hi - 10; a += 60) {
        const side = hash01(WORLD.seed, ax, ay, 880 + a) < 0.5 ? 1 : -1;
        const x = horiz ? a : side > 0 ? bx + 3 : bx - 4;
        const y = horiz ? (side > 0 ? ay + 3 : ay - 3) : a;
        if (!inside(x, y) || this.nearTown(x, y, 50)) continue;
        if (this.put(w, 'car-wreck', x, y, true) && hash01(WORLD.seed, x, y, 881) < 0.4) this.put(w, 'scrap-pile', x + (horiz ? 4 : 0), y + (horiz ? 0 : 3), true);
      }
      // Alleen: manche Abschnitte mit Laubbäumen auf beiden Seiten, sonst einzelne Bäume am Rand
      {
        const allee = hash01(WORLD.seed, ax, ay, 870) < 0.7;
        const step = allee ? 6 : 13;
        const gap = allee ? 0.15 : 0.5;
        for (let a = lo + 6; a < hi - 5; a += step) {
          if (this.nearTown(horiz ? a : bx, horiz ? ay : a, 42)) continue;
          for (const s of [-1, 1]) {
            const x = horiz ? a + 0.5 : s < 0 ? bx - 3.5 : bx + 5.5;
            const y = horiz ? (s < 0 ? ay - 3.5 : ay + 5.5) : a + 0.5;
            if (!inside(Math.floor(x), Math.floor(y))) continue;
            if (hash01(WORLD.seed, Math.floor(x), Math.floor(y), 871) < gap) continue;
            this.tree(w, x + (hash01(WORLD.seed, a, s, 872) - 0.5) * 0.8, y + (hash01(WORLD.seed, a, s, 873) - 0.5) * 0.8);
          }
        }
      }
      // Holzmasten am Straßenrand (alle 14 Felder, auf der Süd- bzw. Ostseite), nicht in Orten
      for (let a = lo + 7; a < hi; a += 14) {
        const x = horiz ? a : bx + 3;
        const y = horiz ? ay + 3 : a;
        if (!inside(x, y) || this.nearTown(x, y, 45)) continue;
        if (!w.map.floorAt(x, y)) this.put(w, 'utility-pole', x, y);
      }
    }
    const inCell = (x: number, y: number) => x >= x0 && x < x1 && y >= y0 && y < y1;
    for (const t of WORLD.towns) if (inCell(t.x, t.y)) this.town(w, t);
    for (const o of WORLD.outposts) if (inCell(o.x, o.y)) this.outpost(w, o.x, o.y);
    for (const pl of WORLD.places) if (inCell(pl.x, pl.y)) this.place(w, pl);
    WORLD.junkyards.forEach(([x, y], i) => {
      if (inCell(x, y)) this.junkyard(w, x, y, i);
    });
    this.farms().forEach(([x, y], i) => {
      if (!inCell(x, y)) return;
      const h = (n: number) => hash01(WORLD.seed, i, 850 + n);
      let placed = +this.put(w, 'ruin-house', x - 3, y - 2, true);
      placed += +this.put(w, 'ruin-shed', x + 4, y - 1 + Math.round(h(1) * 3), true);
      placed += +this.put(w, 'supply-crate', x + 3, y + 3, true);
      if (h(2) < 0.5) placed += +this.put(w, 'car-wreck', x - 5, y + 3, true);
      // Hof: Holzstapel und Kohlenkeller bzw. Bauschutt einer eingestürzten Scheune
      placed += +this.put(w, 'wood-pile', x + 8, y + 2, true);
      placed += +this.put(w, h(3) < 0.5 ? 'coal-pile' : 'rubble-pile', x - 6, y - 5, true);
      // Acker mit Zaun und Heuballen (auf der straßenabgewandten Seite)
      this.field(w, x + (h(4) < 0.5 ? -20 : 10), y + (h(5) < 0.5 ? -16 : 7), 12, 8, h);
      // Hofbäume: alte Linde/Eiche am Haus, Obstbäume dahinter
      this.tree(w, x - 6 + h(20) * 2, y - 1 + h(21) * 2);
      this.tree(w, x + 1 + h(22) * 2, y - 6 + h(23));
      for (let i = 0; i < 4; i++) if (h(24 + i) < 0.6) this.tree(w, x - 2 + i * 3 + h(30 + i), y - 9 + h(34 + i) * 2);
      if (placed) this.sites.push({ x, y, r: 9, weight: 1.5, kind: 'farm' });
    });
    // Wildnis: vereinzelt ein Wrack oder ein verlassenes Lager, nicht bei Orten
    const s = w.seed;
    if (hash01(s, gx, gy, 811) >= WORLD.wildChance) return;
    const x = Math.round((gx + 0.2 + hash01(s, gx, gy, 812) * 0.6) * c);
    const y = Math.round((gy + 0.2 + hash01(s, gx, gy, 813) * 0.6) * c);
    if (Math.hypot(x, y) < SITES.startFree || this.nearTown(x, y, WORLD.townClear)) return;
    if (hash01(s, gx, gy, 814) < 0.45) {
      // Schrotthaufen am Wegesrand
      let placed = +this.put(w, hash01(s, gx, gy, 815) < 0.7 ? 'scrap-pile' : 'rubble-pile', x, y);
      if (hash01(s, gx, gy, 816) < 0.5) placed += +this.put(w, 'car-wreck', x + 3, y - 1);
      if (placed) this.sites.push({ x, y, r: 5, weight: 0.8, kind: 'wreck' });
    } else if (hash01(s, gx, gy, 814) < 0.6) {
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
    // besondere Gebäude hinter dem Ortsende (Hauptstraße verlängert)
    (t.special ?? []).forEach((name, i) => {
      const sgn = i % 2 === 0 ? 1 : -1;
      const a = sgn * (len / 2 + 3) + (sgn < 0 ? -6 : 0);
      // Straße vom Ortsende bis hinter das Gebäude verlängern
      const lo = Math.min(Math.round((sgn * len) / 2), a) - 1;
      const hi = Math.max(Math.round((sgn * len) / 2), a + 6) + 1;
      if (horizontal) this.asphalt(w, t.x + lo, t.y, t.x + hi, t.y + 1, true);
      else this.asphalt(w, t.x, t.y + lo, t.x + 1, t.y + hi, true);
      const def = entityDef(name);
      const ok = horizontal ? this.put(w, name, t.x + a, t.y - 1 - def.height, true) : this.put(w, name, t.x - 1 - def.width, t.y + a, true);
      if (ok) this.sites.push({ x: t.x + (horizontal ? a + 3 : -4), y: t.y + (horizontal ? -3 : a + 3), r: 9, weight: weight * 1.3, kind: 'town' });
    });
    // Überlebende: in Dörfern einer, in Städten zwei (vor einem Haus an der Hauptstraße)
    for (let i = 0; i < t.size - 1; i++) {
      const a = Math.round((i === 0 ? -0.25 : 0.3) * len);
      w.community.addSurvivor(t.x + (horizontal ? a : -1.5) + 0.5, t.y + (horizontal ? -1.5 : a) + 0.5, w.seed);
    }
    // Ortsschilder an beiden Enden, Laternen auf dem Gehweg
    for (const s of [-1, 1]) {
      const a = s * (len / 2 + 2);
      this.put(w, 'town-sign', t.x + (horizontal ? a : -2), t.y + (horizontal ? -2 : a), true);
    }
    for (let a = -len / 2 + 4; a < len / 2 - 2; a += 10) {
      this.put(w, 'street-lamp', t.x + (horizontal ? a : 2), t.y + (horizontal ? 2 : a), true);
    }
    // Fundort-Einträge entlang der Hauptstraße (Zombies lungern dort)
    for (let a = -len / 2 + 9; a < len / 2; a += 18) this.sites.push({ x: t.x + (horizontal ? a : 0), y: t.y + (horizontal ? 0 : a), r: 11, weight, kind: 'town' });
    const n = WORLD.crossStreets[t.size - 1];
    const cl = WORLD.crossLength[t.size - 1];
    // Dorfplatz mit Kirche (ab Dorfgröße) an einer zufälligen Stelle der Hauptstraße
    if (t.size >= 2) {
      const a = Math.round((hs(50)(1) - 0.5) * len * 0.5);
      const side = hs(50)(2) < 0.5 ? -1 : 1;
      const px = t.x + (horizontal ? a - 6 : side < 0 ? -15 : 4);
      const py = t.y + (horizontal ? (side < 0 ? -13 : 4) : a - 6);
      for (let y = py; y < py + (horizontal ? 10 : 12); y++) for (let x = px; x < px + (horizontal ? 12 : 10); x++) this.paint(w, x, y, PAVEMENT);
      this.tree(w, px + 5.5, py + 5.5);
      const cw = 9;
      const ch = 12;
      this.house(w, horizontal ? px + 13 : px, horizontal ? py + (side < 0 ? -3 : 1) : py + 13, horizontal ? cw : ch, horizontal ? ch : cw,
        'church', horizontal ? (side < 0 ? 2 : 0) : side < 0 ? 1 : 3, 'plaster', 'slate', hs(51), true);
    }
    for (let k = 0; k < n; k++) {
      // Querstraßen an unregelmäßigen Stellen, zu beiden Seiten nach Los, unterschiedlich lang
      const a = Math.round(-len / 2 + ((k + 0.25 + hs(60)(k) * 0.5) * len) / n);
      const side = hs(61)(k) < 0.5 ? 1 : -1;
      const clk = Math.round(cl * (0.55 + hs(62)(k) * 0.6));
      const off = side * (clk / 2 + 8);
      const cx = t.x + (horizontal ? a : off);
      const cy = t.y + (horizontal ? off : a);
      const profile = t.industrial && k % 2 === 1 ? 'works' : 'homes';
      // Zufahrt von der Hauptstraße
      if (horizontal) this.asphalt(w, cx, Math.min(t.y, cy), cx + 1, Math.max(t.y, cy), true);
      else this.asphalt(w, Math.min(t.x, cx), cy, Math.max(t.x, cx), cy + 1, true);
      this.street(w, cx, cy, !horizontal, clk, profile, hs(k + 1), true);
      this.sites.push({ x: cx, y: cy, r: 13, weight: weight * 0.8, kind: 'town' });
      // Stichweg am Ende der Querstraße (manchmal), mit ein paar Häusern
      if (hs(63)(k) < 0.6) {
        const end = side * (clk + 8);
        const sl = 16 + Math.floor(hs(64)(k) * 14);
        const dir2 = hs(65)(k) < 0.5 ? -1 : 1;
        const sx = t.x + (horizontal ? a + dir2 * (sl / 2 + 1) : end);
        const sy = t.y + (horizontal ? end : a + dir2 * (sl / 2 + 1));
        this.street(w, sx, sy, horizontal, sl, 'homes', hs(70 + k), true);
      }
    }
  }

  /**
   * Schrottplatz: eingezäunter Platz mit Schrott-, Teile- und Elektroschrotthaufen zwischen Wracks – das Ziel der
   * Sammeltrupps. Zaun mit einer Lücke als Einfahrt.
   */
  private junkyard(w: World, x: number, y: number, i: number): void {
    const h = (n: number) => hash01(WORLD.seed, i, 870 + n);
    const W2 = 9;
    const H2 = 7;
    // festgefahrener Boden; Wasser und Klippen eingeebnet
    for (let b = -H2; b <= H2; b++) for (let a = -W2; a <= W2; a++) this.flatten(w, x + a, y + b);
    w.map.clearTrees(x - W2 - 1, y - H2 - 1, x + W2 + 1, y + H2 + 1);
    const kinds = ['scrap-pile', 'parts-pile', 'scrap-pile', 'ewaste-pile', 'scrap-pile', 'parts-pile', 'rubble-pile', 'scrap-pile'];
    let k = 0;
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 4; col++) {
        const px = x - W2 + 2 + col * 4 + Math.round(h(k) * 1);
        const py = y - H2 + 3 + row * 6 + Math.round(h(k + 20) * 1);
        this.put(w, kinds[(k + i) % kinds.length], px, py, true);
        k++;
      }
    }
    this.put(w, 'car-wreck', x - W2 + 3, y + H2 - 3, true);
    this.put(w, 'car-wreck', x + W2 - 6, y - 1, true);
    this.put(w, 'dumpster', x + W2 - 3, y + H2 - 2, true);
    // Zaun ringsum, Einfahrt im Süden
    for (let a = -W2 - 1; a <= W2 + 1; a++) {
      this.put(w, 'fence', x + a, y - H2 - 1, true);
      if (Math.abs(a) > 2) this.put(w, 'fence', x + a, y + H2 + 1, true);
    }
    for (let b = -H2; b <= H2; b++) {
      this.put(w, 'fence', x - W2 - 1, y + b, true);
      this.put(w, 'fence', x + W2 + 1, y + b, true);
    }
    this.sites.push({ x, y, r: 10, weight: 2.5, kind: 'junkyard' });
  }

  /** Acker w×h mit Lattenzaun ringsum (Lücke als Tor) und ein paar Heuballen. */
  private field(w: World, x0: number, y0: number, fw: number, fh: number, h: (n: number) => number): void {
    for (let y = y0; y < y0 + fh; y++) for (let x = x0; x < x0 + fw; x++) {
      if (w.map.isBlocked(x, y) || w.entityAt(x, y)) continue;
      w.map.clearTrees(x, y, x, y);
      this.paint(w, x, y, FIELD);
    }
    const gate = Math.floor(h(6) * (fw - 2)) + 1;
    for (let x = x0 - 1; x <= x0 + fw; x++) {
      this.put(w, 'fence', x, y0 - 1);
      if (x !== x0 + gate && x !== x0 + gate + 1) this.put(w, 'fence', x, y0 + fh);
    }
    for (let y = y0; y < y0 + fh; y++) {
      this.put(w, 'fence', x0 - 1, y);
      this.put(w, 'fence', x0 + fw, y);
    }
    for (let i = 0; i < 3; i++) if (h(7 + i) < 0.6) this.put(w, 'hay-bale', x0 + 1 + Math.floor(h(10 + i) * (fw - 2)), y0 + 1 + Math.floor(h(13 + i) * (fh - 2)));
    // Feldhecke: Baumreihe mit Lücken auf zwei Seiten des Ackers
    const g = 2.6;
    if (h(16) < 0.7) this.treeRow(w, x0 - g, y0 - g, x0 + fw + g, y0 - g, 3.2, 0.3);
    if (h(17) < 0.7) this.treeRow(w, x0 + fw + g, y0 - g, x0 + fw + g, y0 + fh + g, 3.2, 0.3);
    if (h(18) < 0.4) this.treeRow(w, x0 - g, y0 - g, x0 - g, y0 + fh + g, 3.2, 0.35);
  }

  // ------------------------------------------------------------ Sonderorte

  /** Fläche einebnen, Bäume roden, optional Belag. */
  private ground(w: World, x0: number, y0: number, x1: number, y1: number, floor = 0): void {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      this.flatten(w, x, y);
      if (floor && !w.entityAt(x, y)) w.map.setFloor(x, y, floor);
    }
    w.map.clearTrees(x0, y0, x1, y1);
  }

  /** Umfassung aus Einzelteilen (Mauer, Zaun) mit Lücke für eine Einfahrt (gate: Seite, gw: Breite, gateName: Tor). */
  private ring(w: World, x0: number, y0: number, x1: number, y1: number, name: string, gate: number, gw: number, gateName: string | null): void {
    const gx = Math.round((x0 + x1) / 2) - Math.floor(gw / 2);
    const gy = Math.round((y0 + y1) / 2) - Math.floor(gw / 2);
    for (let x = x0; x <= x1; x++) for (const y of [y0, y1]) {
      const inGate = ((gate === 0 && y === y0) || (gate === 2 && y === y1)) && x >= gx && x < gx + gw;
      if (inGate) {
        if (gateName) this.put(w, gateName, x, y, true);
      } else this.put(w, name, x, y, true);
    }
    for (let y = y0 + 1; y < y1; y++) for (const x of [x0, x1]) {
      const inGate = ((gate === 3 && x === x0) || (gate === 1 && x === x1)) && y >= gy && y < gy + gw;
      if (inGate) {
        if (gateName) this.put(w, gateName, x, y, true);
      } else this.put(w, name, x, y, true);
    }
  }

  private place(w: World, p: PlaceDef): void {
    const h = (n: number) => hash01(WORLD.seed, p.x, p.y, 3000 + n);
    switch (p.kind) {
      case 'prison': return this.prison(w, p, h);
      case 'powerplant': return this.powerplant(w, p, h);
      case 'industrial': return this.industrial(w, p, h);
      case 'raidercamp': return this.raiderCamp(w, p, h);
      default: return this.farmstead(w, p, h);
    }
  }

  /**
   * Gefängnis (wie in der Fernsehserie, die der Wunsch nennt, als Festung gedacht): Betonmauer mit Tor, außen
   * Stacheldraht, Wachtürme in den Ecken, Zellentrakt, Verwaltung, Kantine, Hof. Drinnen Spinde und Pritschen,
   * draußen viele Zombies (ehemalige Insassen); zwei Überlebende haben sich in der Verwaltung verschanzt.
   */
  private prison(w: World, p: PlaceDef, h: (n: number) => number): void {
    const x0 = p.x - 18;
    const y0 = p.y - 14;
    const x1 = p.x + 18;
    const y1 = p.y + 14;
    this.ground(w, x0 - 4, y0 - 4, x1 + 4, y1 + 4);
    for (let y = y0 + 1; y < y1; y++) for (let x = x0 + 1; x < x1; x++) w.map.setFloor(x, y, CONCRETE);
    this.ring(w, x0, y0, x1, y1, 'hwall-concrete', p.gate, 2, 'gate');
    // Stacheldraht außen (Lücke vor dem Tor)
    for (let x = x0 - 2; x <= x1 + 2; x++) for (const y of [y0 - 2, y1 + 2]) if (!(y === y0 - 2 && Math.abs(x - p.x) <= 2)) this.put(w, 'barbed-wire', x, y);
    for (let y = y0 - 1; y <= y1 + 1; y++) for (const x of [x0 - 2, x1 + 2]) this.put(w, 'barbed-wire', x, y);
    // Wachtürme in den Ecken
    for (const [tx, ty] of [[x0 + 1, y0 + 1], [x1 - 2, y0 + 1], [x0 + 1, y1 - 2], [x1 - 2, y1 - 2]]) this.put(w, 'prison-tower', tx, ty);
    // Zellentrakt (Süden), Verwaltung (Nordwest), Kantine (Nordost)
    this.cellBlock(w, p.x - 11, y1 - 11, 22, h);
    this.house(w, x0 + 4, y0 + 4, 10, 7, 'office', 2, 'concrete', 'flat', (n) => h(100 + n));
    this.house(w, x1 - 13, y0 + 4, 10, 7, 'store', 2, 'concrete', 'flat', (n) => h(200 + n));
    // Hof: Basketballkorb gibt es nicht – dafür ein Gemüsebeet der letzten Wärter und eine Werkbank
    this.put(w, 'garden', p.x - 1, p.y - 4);
    this.put(w, 'supply-crate', p.x + 3, p.y - 4);
    w.community.addSurvivor(x0 + 8.5, y0 + 7.5, w.seed);
    w.community.addSurvivor(x0 + 6.5, y0 + 8.5, w.seed);
    this.sites.push({ x: p.x, y: p.y - 22, r: 12, weight: 5, kind: 'town' });
    this.sites.push({ x: p.x, y: p.y, r: 14, weight: 4, kind: 'town' });
  }

  /** Zellentrakt: Gang in der Mitte, oben und unten je eine Reihe Zellen (2×2 innen) mit Pritsche und Gittertür. */
  private cellBlock(w: World, x: number, y: number, W: number, h: (n: number) => number): void {
    const H = 9;
    for (let j = -1; j <= H; j++) for (let i = -1; i <= W; i++) if (w.entityAt(x + i, y + j)) return;
    const door = new Set<string>();
    const wall = (i: number, j: number): boolean => {
      if (i === 0 || i === W - 1 || j === 0 || j === H - 1) return !(j === 4 && (i === 0 || i === W - 1));
      if (j === 3 || j === 5) return true;
      if (j !== 4 && (i - 0) % 3 === 0) return true;
      return false;
    };
    for (let c = 0; c * 3 + 3 <= W - 1; c++) {
      door.add(`${c * 3 + 1},3`);
      door.add(`${c * 3 + 2},5`);
    }
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const tx = x + i;
      const ty = y + j;
      w.map.setFloor(tx, ty, CONCRETE);
      if (j === 4 && (i === 0 || i === W - 1)) {
        w.create(w.nextId++, 'hdoor', tx, ty, 1);
        continue;
      }
      if (!wall(i, j)) continue;
      if (door.has(`${i},${j}`)) w.create(w.nextId++, 'hdoor', tx, ty, 0);
      else w.create(w.nextId++, 'hwall-concrete', tx, ty, 0);
    }
    for (let c = 0; c * 3 + 3 <= W - 1; c++) {
      const i = c * 3 + 1;
      w.create(w.nextId++, 'bunk', x + i + 1, y + 1, 0);
      if (h(c) < 0.5) w.create(w.nextId++, 'locker', x + i, y + 2, 0);
      w.create(w.nextId++, 'bunk', x + i, y + 6, 0);
      if (h(c + 40) < 0.6 && w.settings.enemies !== 'aus') w.enemies.spawnAt(x + i + 1.5, y + 7.5, 'walker');
    }
    this.houses.push({ x, y, w: W, h: H, roof: 'flat', ridge: 0 });
  }

  /**
   * Lager der Plünderbande: Barrikadenring mit offener Einfahrt, Feuerschalen, Schuppen, Container mit Beute,
   * Militärkisten, Wracks; sechs Plünderer (src/sim/strangers.ts).
   */
  private raiderCamp(w: World, p: PlaceDef, h: (n: number) => number): void {
    const x0 = p.x - 12;
    const y0 = p.y - 9;
    const x1 = p.x + 12;
    const y1 = p.y + 9;
    this.ground(w, x0 - 2, y0 - 2, x1 + 2, y1 + 2);
    this.ring(w, x0, y0, x1, y1, 'wooden-barricade', p.gate, 3, null);
    this.put(w, 'brazier', p.x - 2, p.y, true);
    this.put(w, 'brazier', p.x + 5, p.y - 4, true);
    this.put(w, 'ruin-shed', x0 + 2, y0 + 2, true);
    this.put(w, 'ruin-shed', x0 + 2, y1 - 5, true);
    for (let k = 0; k < 3; k++) this.put(w, 'container', x0 + 8 + k * 4, y0 + 2, true);
    this.put(w, 'military-crate', x1 - 3, y1 - 3, true);
    this.put(w, 'military-crate', x1 - 5, y1 - 3, true);
    this.put(w, 'supply-crate', x0 + 8, y1 - 3, true);
    this.put(w, 'car-wreck', p.x + 2, y1 - 4, true);
    this.put(w, 'scrap-pile', x0 + 7, p.y + 1, true);
    for (let k = 0; k < 4; k++) this.put(w, 'barbed-wire', x1 + 2, p.y - 2 + k);
    for (let k = 0; k < RAIDER.gang; k++) w.community.addStranger('raider', p.x - 4 + (k % 3) * 3 + 0.5, p.y - 2 + Math.floor(k / 3) * 4 + 0.5, w.seed);
    w.community.strangers.nextRecruit = w.tick + RAIDER.respawn;
    void h;
    this.sites.push({ x: p.x, y: p.y, r: 10, weight: 0.8, kind: 'camp' });
  }

  /** Kraftwerk: zwei Kühltürme, Turbinenhalle, Schornstein, Trafohof hinter Zaun, Kohlenhalde, Parkplatz. */
  private powerplant(w: World, p: PlaceDef, h: (n: number) => number): void {
    const x0 = p.x - 22;
    const y0 = p.y - 17;
    this.ground(w, x0 - 2, y0 - 2, p.x + 24, p.y + 19);
    for (let y = y0; y < y0 + 8; y++) for (let x = p.x - 8; x < p.x + 8; x++) w.map.setFloor(x, y, ASPHALT);
    this.ring(w, x0, y0, p.x + 22, p.y + 17, 'fence', p.gate, 4, null);
    this.put(w, 'cooling-tower', x0 + 3, y0 + 9, true);
    this.put(w, 'cooling-tower', x0 + 3, y0 + 18, true);
    this.house(w, p.x - 8, p.y - 3, 16, 10, 'works', 0, 'concrete', 'metal', (n) => h(10 + n));
    this.put(w, 'chimney', p.x + 9, p.y - 2, true);
    // Trafohof
    const tx = p.x + 12;
    const ty = p.y + 6;
    this.ring(w, tx - 1, ty - 1, tx + 9, ty + 8, 'fence', 3, 2, null);
    for (const [a, b] of [[0, 0], [4, 0], [0, 4], [4, 4]]) this.put(w, 'transformer', tx + 1 + a, ty + 1 + b, true);
    for (let k = 0; k < 4; k++) this.put(w, 'utility-pole', tx + 10 + k * 5, ty + 3);
    // Kohlenhalde und Schrott
    for (let k = 0; k < 5; k++) this.put(w, 'coal-pile', p.x - 6 + k * 3, p.y + 11 + Math.floor(h(30 + k) * 2), true);
    for (let k = 0; k < 3; k++) this.put(w, k === 1 ? 'parts-pile' : 'scrap-pile', p.x + 12 + k * 3, p.y - 12, true);
    this.put(w, 'car-wreck', p.x - 6, y0 + 2, true);
    this.put(w, 'car-wreck', p.x + 2, y0 + 4, true);
    this.sites.push({ x: p.x, y: p.y, r: 16, weight: 4, kind: 'town' });
  }

  /** Gewerbegebiet: Zaun, zwei Lagerhallen, Containerreihen, viele Schrott- und Teilehaufen, Laster. */
  private industrial(w: World, p: PlaceDef, h: (n: number) => number): void {
    const x0 = p.x - 20;
    const y0 = p.y - 15;
    const x1 = p.x + 20;
    const y1 = p.y + 15;
    this.ground(w, x0 - 1, y0 - 1, x1 + 1, y1 + 1);
    for (let y = y0 + 1; y < y1; y++) for (let x = x0 + 1; x < x1; x++) w.map.setFloor(x, y, ASPHALT);
    this.ring(w, x0, y0, x1, y1, 'fence', p.gate, 4, null);
    this.house(w, x0 + 3, y0 + 3, 14, 9, 'works', 2, h(1) < 0.5 ? 'concrete' : 'brick', 'metal', (n) => h(10 + n));
    this.house(w, x0 + 3, y0 + 16, 14, 9, 'works', 0, 'concrete', 'flat', (n) => h(60 + n));
    for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) if (h(100 + r * 2 + c) < 0.8) this.put(w, 'container', x0 + 21 + c * 5, y0 + 3 + r * 3, true);
    const kinds = ['scrap-pile', 'parts-pile', 'ewaste-pile', 'scrap-pile', 'rubble-pile', 'scrap-pile'];
    for (let k = 0; k < 8; k++) this.put(w, kinds[k % kinds.length], x0 + 21 + (k % 4) * 4, y0 + 17 + Math.floor(k / 4) * 5 + Math.floor(h(200 + k) * 2), true);
    this.put(w, 'chimney', x0 + 18, y0 + 12, true);
    for (let k = 0; k < 3; k++) this.put(w, 'car-wreck', x1 - 5, y0 + 4 + k * 8, true);
    this.put(w, 'dumpster', x0 + 18, y0 + 3, true);
    this.sites.push({ x: p.x, y: p.y, r: 16, weight: 4, kind: 'town' });
  }

  /** Gutshof: Bauernhaus, Scheune (begehbar), zwei Silos, Felder mit Hecken, Hofbäume, Holz und Schrott. */
  private farmstead(w: World, p: PlaceDef, h: (n: number) => number): void {
    this.ground(w, p.x - 14, p.y - 12, p.x + 14, p.y + 12);
    const s = p.gate === 0 ? -1 : 1;
    this.house(w, p.x - 12, p.y + (s < 0 ? 3 : -11), 9, 7, 'home', s < 0 ? 0 : 2, 'brick', 'tile', (n) => h(10 + n));
    this.house(w, p.x + 1, p.y + (s < 0 ? 3 : -12), 12, 8, 'barn', s < 0 ? 0 : 2, 'wood', 'metal', (n) => h(60 + n));
    this.put(w, 'silo', p.x + 1, p.y + (s < 0 ? -8 : 4), true);
    this.put(w, 'silo', p.x + 5, p.y + (s < 0 ? -8 : 4), true);
    this.put(w, 'wood-pile', p.x - 8, p.y + (s < 0 ? -7 : 5), true);
    this.put(w, 'scrap-pile', p.x + 10, p.y + (s < 0 ? -7 : 5), true);
    this.put(w, 'car-wreck', p.x - 4, p.y - 2, true);
    for (let k = 0; k < 3; k++) if (h(80 + k) < 0.8) this.put(w, 'garden', p.x - 12 + k * 3, p.y + (s < 0 ? -6 : 6));
    this.field(w, p.x - 34, p.y - 10, 16, 10, (n) => h(120 + n));
    this.field(w, p.x + 18, p.y - 10, 14, 12, (n) => h(150 + n));
    this.field(w, p.x - 8, p.y + (s < 0 ? 14 : -26), 18, 10, (n) => h(180 + n));
    this.tree(w, p.x - 2, p.y + (s < 0 ? 6 : -6));
    this.tree(w, p.x - 14.5, p.y - 1);
    w.community.addSurvivor(p.x - 7.5, p.y + (s < 0 ? 6.5 : -7.5), w.seed);
    this.sites.push({ x: p.x, y: p.y, r: 12, weight: 2.5, kind: 'farm' });
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
    w.community.addSurvivor(x + 0.5, y + 3.5, w.seed);
  }

  // ------------------------------------------------------------ Speichern

  serialize(): { c: number[]; s: [number, number, number, number, SiteKind][]; h?: [number, number, number, number, RoofKind, 0 | 1][] } {
    return {
      c: [...this.cells].sort((a, b) => a - b), s: this.sites.map((s) => [s.x, s.y, s.r, s.weight, s.kind]),
      ...(this.houses.length ? { h: this.houses.map((h) => [h.x, h.y, h.w, h.h, h.roof, h.ridge] as [number, number, number, number, RoofKind, 0 | 1]) } : {}),
    };
  }

  load(d: ReturnType<SiteSystem['serialize']> | undefined): void {
    this.cells.clear();
    this.sites.length = 0;
    this.houses.length = 0;
    for (const c of d?.c ?? []) this.cells.add(c);
    for (const [x, y, r, weight, kind] of d?.s ?? []) this.sites.push({ x, y, r, weight, kind });
    for (const [x, y, w, h, roof, ridge] of d?.h ?? []) this.houses.push({ x, y, w, h, roof, ridge });
  }

  /** Begehbares Haus unter (x, y), falls vorhanden. */
  houseAt(x: number, y: number): House | null {
    for (const h of this.houses) if (x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h) return h;
    return null;
  }

  // ------------------------------------------------------------ Begehbare Häuser

  /**
   * Begehbares Haus (Wunsch 18.11.2026): Außenwände mit Fenstern und Haustür auf der Seite door (0 N … 3 W), Räume
   * durch Innenwände mit Durchgängen, Böden und Möbel je Raum, Dach als Darstellung. false: Fläche nicht frei.
   */
  house(w: World, x: number, y: number, W: number, H: number, kind: HouseKind, door: number, mat: string, roof: RoofKind,
    h: (n: number) => number, level = true): boolean {
    for (let j = -1; j <= H; j++) for (let i = -1; i <= W; i++) {
      const tx = x + i;
      const ty = y + j;
      if ((!level && w.map.isBlocked(tx, ty)) || w.entityAt(tx, ty) || w.map.resourceAt(tx, ty).amount > 0) return false;
    }
    const p = w.player;
    if (p && p.overlapsRect(x - 1, y - 1, W + 2, H + 2)) return false;
    if (level) for (let j = -1; j <= H; j++) for (let i = -1; i <= W; i++) this.flatten(w, x + i, y + j);
    w.map.clearTrees(x - 1, y - 1, x + W, y + H);
    const idx = (i: number, j: number) => j * W + i;
    const wall = new Uint8Array(W * H); // 1 Wand, 2 Durchgang innen
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (i === 0 || j === 0 || i === W - 1 || j === H - 1) wall[idx(i, j)] = 1;
    // Räume: rekursiv teilen (Wohnhäuser zweimal, Läden/Hallen einmal, Scheunen gar nicht)
    const rooms: Room[] = [];
    const depthMax = kind === 'home' || kind === 'office' ? 2 : kind === 'barn' || kind === 'church' ? 0 : 1;
    let n = 0;
    const split = (r: Room, depth: number) => {
      const k = n++;
      const canV = r.w >= 5;
      const canH = r.h >= 5;
      if (depth >= depthMax || (!canV && !canH)) {
        rooms.push(r);
        return;
      }
      const vert = canV && (!canH || r.w >= r.h || h(200 + k) < 0.3);
      if (vert) {
        const sx = r.x + 2 + Math.floor(h(210 + k) * (r.w - 4));
        const gy = r.y + 1 + Math.floor(h(220 + k) * Math.max(1, r.h - 2));
        for (let j = r.y; j < r.y + r.h; j++) wall[idx(sx, j)] = j === gy ? 2 : 1;
        split({ x: r.x, y: r.y, w: sx - r.x, h: r.h, type: '' }, depth + 1);
        split({ x: sx + 1, y: r.y, w: r.x + r.w - sx - 1, h: r.h, type: '' }, depth + 1);
      } else {
        const sy = r.y + 2 + Math.floor(h(230 + k) * (r.h - 4));
        const gx = r.x + 1 + Math.floor(h(240 + k) * Math.max(1, r.w - 2));
        for (let i = r.x; i < r.x + r.w; i++) wall[idx(i, sy)] = i === gx ? 2 : 1;
        split({ x: r.x, y: r.y, w: r.w, h: sy - r.y, type: '' }, depth + 1);
        split({ x: r.x, y: sy + 1, w: r.w, h: r.y + r.h - sy - 1, type: '' }, depth + 1);
      }
    };
    split({ x: 1, y: 1, w: W - 2, h: H - 2, type: '' }, 0);
    const isWall = (i: number, j: number) => i >= 0 && j >= 0 && i < W && j < H && wall[idx(i, j)] === 1;
    const edge = (i: number, j: number) => i === 0 || j === 0 || i === W - 1 || j === H - 1;
    // Abzweig einer Innenwand an der Außenwand (dort weder Tür noch Fenster)
    const junction = (i: number, j: number) => edge(i, j) && [[0, 1], [1, 0], [0, -1], [-1, 0]].some(([a, b]) => {
      const ni = i + a;
      const nj = j + b;
      return ni > 0 && nj > 0 && ni < W - 1 && nj < H - 1 && wall[idx(ni, nj)] >= 1;
    });
    const corner = (i: number, j: number) => (i === 0 || i === W - 1) && (j === 0 || j === H - 1);
    // Haustür(en): Feld auf der Türseite, innen ein Raum, nicht an Ecken oder Abzweigen
    const sideTiles = (side: number): [number, number][] => {
      const out: [number, number][] = [];
      if (side === 0 || side === 2) for (let i = 1; i < W - 1; i++) out.push([i, side === 0 ? 0 : H - 1]);
      else for (let j = 1; j < H - 1; j++) out.push([side === 3 ? 0 : W - 1, j]);
      return out;
    };
    const inward = (i: number, j: number): [number, number] => [i === 0 ? 1 : i === W - 1 ? W - 2 : i, j === 0 ? 1 : j === H - 1 ? H - 2 : j];
    const doors = new Set<number>();
    const okDoor = (i: number, j: number) => {
      const [ii, jj] = inward(i, j);
      return !corner(i, j) && !junction(i, j) && wall[idx(ii, jj)] === 0 && !junction(i + (j === 0 || j === H - 1 ? 1 : 0), j + (i === 0 || i === W - 1 ? 1 : 0))
        && !junction(i - (j === 0 || j === H - 1 ? 1 : 0), j - (i === 0 || i === W - 1 ? 1 : 0));
    };
    const pickDoor = (side: number, salt: number, width = 1) => {
      const c = sideTiles(side).filter(([i, j]) => okDoor(i, j));
      if (!c.length) return;
      const [i, j] = c[Math.floor(h(salt) * c.length)];
      doors.add(idx(i, j));
      if (width > 1) {
        const [a, b] = side === 0 || side === 2 ? [i + 1, j] : [i, j + 1];
        if (!corner(a, b) && a < W - 1 && b < H - 1) doors.add(idx(a, b));
      }
    };
    pickDoor(door, 300, kind === 'barn' || kind === 'works' ? 2 : 1);
    if (kind !== 'cells' && h(301) < (kind === 'home' ? 0.5 : 0.3)) pickDoor((door + 2) % 4, 302);
    // Bauteile setzen
    const nearDoor = (i: number, j: number) => [[0, 1], [1, 0], [0, -1], [-1, 0], [0, 0]].some(([a, b]) => doors.has(idx(i + a, j + b)) || wall[idx(Math.min(W - 1, Math.max(0, i + a)), Math.min(H - 1, Math.max(0, j + b)))] === 2);
    const winChance = kind === 'church' ? 0.95 : kind === 'barn' ? 0.15 : kind === 'cells' ? 0 : kind === 'works' ? 0.35 : 0.8;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const tx = x + i;
      const ty = y + j;
      const k = idx(i, j);
      const horiz = j === 0 || j === H - 1;
      if (doors.has(k)) {
        w.create(w.nextId++, 'hdoor', tx, ty, horiz ? 0 : 1);
        continue;
      }
      if (wall[k] !== 1) continue;
      const along = horiz ? i : j;
      const shop = kind === 'store' && j === (door === 0 ? 0 : door === 2 ? H - 1 : -1);
      const win = edge(i, j) && !corner(i, j) && !junction(i, j) && !nearDoor(i, j) && (shop || along % 2 === 1) && h(400 + k) < winChance;
      if (win) {
        const e = w.create(w.nextId++, `hwin-${mat}`, tx, ty, horiz ? 0 : 1);
        if (e.kind === 'wall' && h(500 + k) < 0.3) e.broken = true;
      } else w.create(w.nextId++, `hwall-${mat}`, tx, ty, 0);
    }
    // Räume einordnen: kleinster (≤ 6 Felder) Bad, einer Küche, größter Wohnzimmer, Rest Schlafzimmer
    const byArea = [...rooms].sort((a, b) => a.w * a.h - b.w * b.h || a.x - b.x || a.y - b.y);
    if (kind === 'home') {
      if (byArea.length >= 3 && byArea[0].w * byArea[0].h <= 9) byArea[0].type = 'bath';
      const rest = byArea.filter((r) => !r.type);
      if (rest.length) rest[rest.length - 1].type = 'living';
      const k2 = rest.filter((r) => !r.type);
      if (k2.length) k2[Math.floor(h(600) * k2.length)].type = 'kitchen';
      for (const r of rooms) if (!r.type) r.type = 'bed';
      if (!rooms.some((r) => r.type === 'kitchen')) rooms[0].type = 'kitchen';
    } else if (kind === 'office') {
      for (const [i, r] of byArea.entries()) r.type = i === 0 ? 'bath' : i === byArea.length - 1 ? 'office' : h(610 + i) < 0.5 ? 'office' : 'locker';
    } else for (const [i, r] of byArea.entries()) r.type = i === byArea.length - 1 ? kind : `${kind}-back`;
    // Böden
    const floorOf = (t: string) => t === 'kitchen' || t === 'bath' ? TILES : kind === 'home' || kind === 'office' || kind === 'church' ? PLANKS : kind === 'barn' ? 0 : CONCRETE;
    for (const r of rooms) for (let j = r.y; j < r.y + r.h; j++) for (let i = r.x; i < r.x + r.w; i++) {
      const f = floorOf(r.type);
      if (f) w.map.setFloor(x + i, y + j, f);
    }
    for (let k = 0; k < W * H; k++) if (wall[k] === 2 || doors.has(k)) {
      const f = kind === 'barn' ? 0 : kind === 'home' || kind === 'office' ? PLANKS : CONCRETE;
      if (f) w.map.setFloor(x + (k % W), y + Math.floor(k / W), f);
    }
    // Möbel: an der Nordwand (so sind die Modelle gebaut), Durchgänge frei
    const used = new Set<number>();
    const free = (i: number, j: number) => i > 0 && j > 0 && i < W - 1 && j < H - 1 && wall[idx(i, j)] === 0 && !used.has(idx(i, j)) && !nearDoor(i, j);
    const north = (r: Room) => {
      const out: number[] = [];
      for (let i = r.x; i < r.x + r.w; i++) if (isWall(i, r.y - 1) && free(i, r.y)) out.push(i);
      return out;
    };
    const put = (name: string, i: number, j: number, fw = 1, fh = 1) => {
      for (let b = 0; b < fh; b++) for (let a = 0; a < fw; a++) if (!free(i + a, j + b)) return false;
      w.create(w.nextId++, name, x + i, y + j, 0);
      for (let b = 0; b < fh; b++) for (let a = 0; a < fw; a++) used.add(idx(i + a, j + b));
      return true;
    };
    const along = (r: Room, list: string[], salt: number) => {
      const xs = north(r);
      let s = Math.floor(h(salt) * Math.max(1, xs.length - list.length + 1));
      for (const name of list) {
        while (s < xs.length && !free(xs[s], r.y)) s++;
        if (s >= xs.length) return;
        const fw = name === 'sofa' || name === 'store-shelf' ? 2 : 1;
        if (fw === 2 && !free(xs[s] + 1, r.y)) {
          s++;
          continue;
        }
        put(name, xs[s], r.y, fw);
        s += fw;
      }
    };
    rooms.forEach((r, ri) => {
      const hr = (m: number) => h(700 + ri * 13 + m);
      switch (r.type) {
        case 'kitchen': along(r, hr(1) < 0.5 ? ['kitchen', 'stove', 'kitchen', 'fridge'] : ['fridge', 'kitchen', 'stove'], 701 + ri); break;
        case 'bath': along(r, ['bathroom'], 702 + ri); break;
        case 'bed': {
          const xs = north(r);
          if (xs.length) put('house-bed', xs[Math.floor(hr(2) * xs.length)], r.y, 1, 2);
          along(r, hr(3) < 0.5 ? ['wardrobe', 'desk'] : ['wardrobe'], 703 + ri);
          break;
        }
        case 'living': {
          along(r, hr(4) < 0.6 ? ['shelf', 'sofa', 'shelf'] : ['sofa', 'desk'], 704 + ri);
          const cx = r.x + Math.floor(r.w / 2);
          const cy = r.y + Math.floor(r.h / 2) + 1;
          if (r.w >= 3 && r.h >= 3) put('table', cx, Math.min(cy, r.y + r.h - 1));
          break;
        }
        case 'office': along(r, ['desk', 'shelf', 'locker'], 705 + ri); break;
        case 'locker': along(r, ['locker', 'locker', 'locker'], 706 + ri); break;
        case 'store': {
          // Regalreihen quer, Gänge dazwischen; Theke (Schreibtisch) an der Tür
          for (let j = r.y + 1; j < r.y + r.h - 1; j += 2) for (let i = r.x + 1; i + 1 < r.x + r.w - 1; i += 3) if (hr(10 + i + j * 7) < 0.85) put('store-shelf', i, j, 2);
          break;
        }
        case 'store-back': case 'works-back': along(r, ['shelf', 'locker', 'shelf'], 707 + ri); break;
        case 'church': {
          // Bankreihen (Tische) und der Altar (Schreibtisch) an der Nordwand
          along(r, ['shelf', 'desk', 'shelf'], 710 + ri);
          for (let j = r.y + 2; j < r.y + r.h - 1; j += 2) for (let i = r.x + 1; i < r.x + r.w - 1; i++) if (i !== r.x + Math.floor(r.w / 2)) put('table', i, j);
          break;
        }
        case 'works': {
          along(r, ['workbench', 'workbench', 'locker', 'shelf'], 708 + ri);
          if (r.w >= 4 && r.h >= 4) this.put(w, hr(5) < 0.5 ? 'parts-pile' : 'scrap-pile', x + r.x + 1, y + r.y + r.h - 2);
          break;
        }
        case 'barn': {
          if (r.w >= 4 && r.h >= 4) this.put(w, hr(6) < 0.5 ? 'wood-pile' : 'scrap-pile', x + r.x + r.w - 3, y + r.y + 1);
          for (let k = 0; k < 4; k++) {
            const i = r.x + Math.floor(hr(20 + k) * r.w);
            const j = r.y + Math.floor(hr(30 + k) * r.h);
            if (free(i, j)) this.put(w, 'hay-bale', x + i, y + j);
          }
          along(r, ['workbench'], 709 + ri);
          break;
        }
        default: break;
      }
    });
    this.houses.push({ x, y, w: W, h: H, roof, ridge: W >= H ? 0 : 1 });
    // manchmal wartet ein Zombie drinnen
    if (kind !== 'cells' && h(900) < 0.22) {
      const r = rooms[Math.floor(h(901) * rooms.length)];
      const i = r.x + Math.floor(r.w / 2);
      const j = r.y + Math.floor(r.h / 2);
      if (free(i, j) && w.settings.enemies !== 'aus') w.enemies.spawnAt(x + i + 0.5, y + j + 0.5, 'walker');
    }
    return true;
  }
}
