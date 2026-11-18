import { type EntityDef, entityDef } from '../data/entities';
import { ASPHALT, CONCRETE, FIELD, PAVEMENT, PLANKS, RAIL_FLOOR, ROAD_FLOOR, ROADLINE_E, ROADLINE_S, TILES } from '../data/floors';
import { SITES } from '../data/loot';
import { type PlaceDef, RAILWAY, ROAD, type TownDef, WORLD, roadPaths } from '../data/world';
import { TREE_GROUP_IDS, type TreeGroup } from '../data/decor';
import { hash01 } from './rng';
import { RAIDER } from '../data/strangers';
import { BARRICADE } from '../data/enemies';
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
  /** Selbst gebaut (Dach verschwindet, wenn eine Wand fehlt). */
  own?: boolean;
  /** Anbau: Index des Haupthauses (Dach blendet gemeinsam aus). */
  g?: number;
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
  private tree(w: World, x: number, y: number, kind = 0, group?: TreeGroup): void {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (w.map.isBlocked(tx, ty) || w.map.floorAt(tx, ty) || w.map.resourceAt(tx, ty).amount > 0) return;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (w.entityAt(tx + i, ty + j)) return;
    for (const hs of this.houses) if (tx >= hs.x - 1 && tx <= hs.x + hs.w && ty >= hs.y - 1 && ty <= hs.y + hs.h) return;
    if (Math.hypot(x, y) < SITES.startFree * 0.5) return;
    const v = Math.floor(hash01(WORLD.seed, tx, ty, 77) * 8);
    w.map.trees.plant(x, y, kind, kind === 0 && group ? 100 + TREE_GROUP_IDS.indexOf(group) * 10 + v : v);
  }

  /** Baumreihe von (ax, ay) nach (bx, by): alle step Felder, mit Lücken (gap = Anteil fehlender Bäume) und leichtem Versatz. */
  private treeRow(w: World, ax: number, ay: number, bx: number, by: number, step: number, gap: number, kind = 0, inside?: (x: number, y: number) => boolean, group?: TreeGroup): void {
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
      this.tree(w, jx, jy, h > 0.93 ? 1 - kind : kind, h > 0.8 ? 'young' : group);
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
          const roof: RoofKind = hk === 'store' ? (r < 0.5 ? 'flat' : r < 0.8 ? 'tile' : 'slate') : hk === 'works' ? (r < 0.6 ? 'metal' : 'flat') : r < 0.5 ? 'tile' : r < 0.85 ? 'slate' : 'metal';
          // Wohnhäuser oft mit Anbau nach hinten (L-Form)
          const back = (doorSide + 2) % 4;
          const span = back % 2 === 0 ? HW : HH;
          const aw2 = 4 + Math.floor(hi(9) * 2);
          const annex = hk === 'home' && hi(10) < 0.55 && span >= aw2 + 2
            ? (back % 2 === 0 ? { side: back, at: Math.floor(hi(11) * (span - aw2 + 1)), w: aw2, h: 4 + Math.floor(hi(12) * 2) }
              : { side: back, at: Math.floor(hi(11) * (span - aw2 + 1)), w: 4 + Math.floor(hi(12) * 2), h: aw2 })
            : undefined;
          ok = horizontal ? this.house(w, cx + a, cy + off, HW, HH, hk, doorSide, mat, roof, hi, level, annex) : this.house(w, cx + off, cy + a, HW, HH, hk, doorSide, mat, roof, hi, level, annex);
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
        // Vorgarten und Hof (Vielfalt): Briefkasten am Weg, Mülltonnen an der Seite, hinten Kram nach Los
        if (ok && level && walk && hk === 'home') {
          const front = side === 0 ? off + depth : off - 1; // Feld zwischen Haus und Gehweg
          const at = (al: number, dp: number): [number, number] => (horizontal ? [cx + a + al, cy + dp] : [cx + dp, cy + a + al]);
          if (hi(20) < 0.7) {
            const [mx, my] = at(Math.floor(hi(21) * along), side === 0 ? front + setback : front - setback);
            if (setback > 0) this.put(w, 'mailbox', mx, my);
          }
          if (hi(22) < 0.6) {
            const [tx2, ty2] = at(along + 0.0, side === 0 ? front - 1 : front + 1);
            this.put(w, 'trash-bin', tx2, ty2);
          }
          const yard = ['swing', 'picnic-table', 'laundry-line', 'dog-house', 'garden-shed', 'pallets', 'oil-drums', 'tire-pile', 'trash-bin'];
          const backRow = side === 0 ? off - 2 : off + depth + 1;
          for (let q = 0; q < 2; q++) {
            if (hi(30 + q) > (q === 0 ? 0.75 : 0.4)) continue;
            const name = yard[Math.floor(hi(32 + q) * yard.length)];
            const [yx, yy] = at(Math.floor(hi(34 + q) * Math.max(1, along - 3)), backRow - (side === 0 ? (name === 'garden-shed' ? 1 : 0) : 0));
            this.put(w, name, yx, yy);
          }
        }
        // Gartenzaun hinter dem Haus und manchmal ein verwildertes Gemüsebeet
        if (ok && level && walk && hk === 'home' && hi(6) < 0.55) {
          const back = side === 0 ? off - 3 : off + depth + 2;
          const border = hi(9) < 0.45 ? 'hedge' : 'fence';
          for (let q = -1; q <= along; q++) {
            if (q === Math.floor(along / 2)) continue;
            if (horizontal) this.put(w, border, cx + a + q, cy + back);
            else this.put(w, border, cx + back, cy + a + q);
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
            this.tree(w, horizontal ? cx + along2 : cx + deep, horizontal ? cy + deep : cy + along2, h(170 + i) < 0.2 ? 1 : 0, 'town');
          }
        }
        a += along + 2 + Math.floor(h(60 + side * 40 + i) * 4);
        i++;
      }
    }
    // Wracks auf (waagerecht) bzw. neben (senkrecht) der Straße
    const cars = Math.round((profile === 'works' ? 0.16 : 0.09) * len) + Math.floor(h(3) * 2);
    for (let i = 0; i < cars; i++) {
      const a = a0 + 2 + Math.floor(h(200 + i) * (len - 8));
      const r = h(260 + i);
      const name = r < 0.5 ? 'car-wreck' : r < 0.72 ? 'van-wreck' : r < 0.8 ? 'police-wreck' : r < 0.88 ? 'ambulance-wreck' : horizontal && r < 0.95 ? 'bus-wreck' : 'car-wreck';
      placed += +(horizontal ? this.put(w, name, cx + a, cy, level) : this.put(w, name, cx - 4, cy + a, level));
      // Leiche neben dem Wrack (manchmal)
      if (h(280 + i) < 0.3) horizontal ? this.put(w, 'corpse', cx + a + 1, cy + 2, level) : this.put(w, 'corpse', cx - 1, cy + a + 1, level);
    }
    // Leichen auf Gehweg und Straße
    for (let i = 0; i < Math.floor(len / 14); i++) {
      if (h(290 + i) < 0.5) continue;
      const a = a0 + 2 + Math.floor(h(295 + i) * (len - 4));
      if (horizontal) this.put(w, 'corpse', cx + a, cy + (h(299 + i) < 0.5 ? -1 : 2), level);
      else this.put(w, 'corpse', cx + (h(299 + i) < 0.5 ? -1 : 2), cy + a, level);
    }
    // Straßenmöbel auf dem Gehweg: Bänke, Mülleimer, Telefonzelle, Bushaltestelle; Laub und Kegel
    if (level && profile !== 'works') {
      for (let a = a0 + 3; a < a0 + len - 4; a += 7 + Math.floor(h(300 + a) * 6)) {
        const r = h(310 + a);
        const sideRow = r < 0.5 ? -1 : 2;
        const name = r < 0.18 ? 'bench' : r < 0.36 ? 'trash-bin' : r < 0.44 ? 'phone-booth' : r < 0.54 && len > 30 ? 'bus-stop' : r < 0.62 ? 'traffic-cone' : '';
        if (!name) continue;
        if (horizontal) this.put(w, name, cx + a, cy + sideRow, level);
        else this.put(w, name, cx + (sideRow < 0 ? -1 : 2), cy + a, level);
      }
    }
    // Straßensperre am Ortsende (manchmal): Absperrung, Kegel, Streifenwagen
    if (level && h(320) < 0.35) {
      const e = a0 + len - 2;
      if (horizontal) {
        this.put(w, 'road-barrier', cx + e, cy, level);
        this.put(w, 'traffic-cone', cx + e - 1, cy + 1, level);
        if (h(321) < 0.5) this.put(w, 'police-wreck', cx + e - 5, cy - 4, level);
      } else {
        this.put(w, 'traffic-cone', cx, cy + e, level);
        this.put(w, 'traffic-cone', cx + 1, cy + e - 1, level);
      }
    }
    return placed;
  }

  // ------------------------------------------------------------ Feste Welt (src/data/world.ts)

  /** Höfe an den Landstraßen (einmal aus den Straßen berechnet). */
  private farmSpots: [number, number, number, number][] | null = null;
  private farms(): [number, number, number, number][] {
    if (this.farmSpots) return this.farmSpots;
    const out: [number, number, number, number][] = [];
    const every = Math.round(WORLD.farmEvery / ROAD.step);
    roadPaths().forEach((path, ri) => {
      for (let q = Math.round(every * 0.6); q < path.ang.length; q += every) {
        const a = path.ang[q];
        const side = hash01(WORLD.seed, ri, out.length, 840) < 0.5 ? 1 : -1;
        const x = Math.round(path.pts[q * 2] - Math.sin(a) * side * WORLD.farmOffset);
        const y = Math.round(path.pts[q * 2 + 1] + Math.cos(a) * side * WORLD.farmOffset);
        if (Math.hypot(x, y) > 45 && !this.nearTown(x, y, 60)) out.push([x, y, path.pts[q * 2], path.pts[q * 2 + 1]]);
      }
    });
    return (this.farmSpots = out);
  }

  /** Feldweg (nur Darstellung, im Spielstand): leicht geschwungene Linie von (ax, ay) nach (bx, by). */
  readonly tracks: number[][] = [];

  private track(ax: number, ay: number, bx: number, by: number, salt: number): void {
    const L = Math.hypot(bx - ax, by - ay);
    if (L < 3) return;
    const nx = -(by - ay) / L;
    const ny = (bx - ax) / L;
    const bend = (hash01(WORLD.seed, salt, 861) - 0.5) * L * 0.35;
    const cx = (ax + bx) / 2 + nx * bend;
    const cy = (ay + by) / 2 + ny * bend;
    const pts: number[] = [];
    const n = Math.max(2, Math.ceil(L / ROAD.step));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const u = 1 - t;
      pts.push(u * u * ax + 2 * u * t * cx + t * t * bx, u * u * ay + 2 * u * t * cy + t * t * by);
    }
    this.tracks.push(pts.map((v) => Math.round(v * 100) / 100));
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
    // Landstraßen zuerst (Orte setzen ihre Straßen darüber): geschwungene Kurven, Belag ROAD (gezeichnet wird die
    // Straße im Renderer entlang der Kurve), dazu Wracks, Masten und Alleen am Rand
    const inside = (x: number, y: number) => x >= x0 && x < x1 && y >= y0 && y < y1;
    const R = ROAD.half;
    roadPaths().forEach((path, ri) => {
      const pts = path.pts;
      for (let k = 0; k < pts.length; k += 2) {
        const px = pts[k];
        const py = pts[k + 1];
        if (px < x0 - R - 1 || px > x1 + R + 1 || py < y0 - R - 1 || py > y1 + R + 1) continue;
        for (let ty = Math.floor(py - R); ty <= Math.floor(py + R); ty++) for (let tx = Math.floor(px - R); tx <= Math.floor(px + R); tx++) {
          if (!inside(tx, ty) || Math.hypot(tx + 0.5 - px, ty + 0.5 - py) > R) continue;
          const f = w.map.floorAt(tx, ty);
          if (f && f !== ROAD_FLOOR) continue; // Ortsstraßen bleiben
          this.flatten(w, tx, ty);
          if (!w.entityAt(tx, ty)) w.map.setFloor(tx, ty, ROAD_FLOOR);
        }
      }
      // Ausstattung nur von Stützpunkten in dieser Zelle (sonst doppelt)
      const n = pts.length / 2;
      for (let q = 0; q < n; q++) {
        const px = pts[q * 2];
        const py = pts[q * 2 + 1];
        if (!inside(Math.floor(px), Math.floor(py)) || this.nearTown(px, py, 42)) continue;
        const a = path.ang[q];
        const nx = -Math.sin(a);
        const ny = Math.cos(a);
        const s = q * ROAD.step;
        // liegengebliebene Autos (etwa alle 60 Felder, wechselnde Seite), manchmal mit Schrott
        if (q % 120 === 60) {
          const side = hash01(WORLD.seed, ri, q, 880) < 0.5 ? 1 : -1;
          const cx = Math.round(px + nx * side * 4 - 1.5);
          const cy = Math.round(py + ny * side * 4 - 1);
          const r = hash01(WORLD.seed, ri, q, 882);
          const vehicle = r < 0.45 ? 'car-wreck' : r < 0.65 ? 'van-wreck' : r < 0.75 ? 'tractor-wreck' : r < 0.82 ? 'ambulance-wreck' : r < 0.88 ? 'police-wreck' : r < 0.94 ? 'fallen-log' : 'bus-wreck';
          if (!this.nearTown(cx, cy, 50) && this.put(w, vehicle, cx, cy, true)) {
            if (hash01(WORLD.seed, cx, cy, 881) < 0.45) this.put(w, 'scrap-pile', Math.round(cx + nx * side * 3), Math.round(cy + ny * side * 3), true);
            else if (hash01(WORLD.seed, cx, cy, 883) < 0.4) this.put(w, 'corpse', Math.round(cx - nx * side * 2), Math.round(cy - ny * side * 2), true);
          }
        }
        // Holzmasten auf einer Seite, alle 14 Felder
        if (q % 28 === 14) {
          const mx = Math.floor(px + nx * 3.4);
          const my = Math.floor(py + ny * 3.4);
          if (!w.map.floorAt(mx, my)) this.put(w, 'utility-pole', mx, my);
        }
        // Alleen: manche Straßen beidseitig, sonst einzelne Bäume
        const allee = hash01(WORLD.seed, ri, Math.floor(s / 200), 870) < 0.7;
        if (q % (allee ? 12 : 26) === 6) {
          for (const side of [-1, 1]) {
            if (hash01(WORLD.seed, ri, q * 2 + side, 871) < (allee ? 0.15 : 0.5)) continue;
            this.tree(w, px + nx * side * 5 + (hash01(WORLD.seed, ri, q, 872) - 0.5) * 0.8, py + ny * side * 5 + (hash01(WORLD.seed, ri, q, 873) - 0.5) * 0.8, 0, 'avenue');
          }
        }
      }
    });
    const inCell = (x: number, y: number) => x >= x0 && x < x1 && y >= y0 && y < y1;
    // Stillgelegte Bahn: Gleisbett (Straßen kreuzen ebenerdig), Bahnhof, entgleister Güterzug
    const RY = RAILWAY.y;
    if (RY + 1 >= y0 && RY - 1 < y1) {
      for (let tx = Math.max(x0, RAILWAY.x0); tx < Math.min(x1, RAILWAY.x1); tx++) {
        // Böschung des Damms
        for (const ty of [RY - 2, RY + 2]) if (inside(tx, ty) && !w.map.floorAt(tx, ty)) this.flatten(w, tx, ty);
        for (let ty = RY - 1; ty <= RY + 1; ty++) {
          if (!inside(tx, ty)) continue;
          const f = w.map.floorAt(tx, ty);
          if (f && f !== RAIL_FLOOR) continue;
          // über Wasser als Bahndamm aufgeschüttet
          this.flatten(w, tx, ty);
          w.map.clearTrees(tx, ty, tx, ty);
          if (!w.entityAt(tx, ty)) w.map.setFloor(tx, ty, RAIL_FLOOR);
        }
      }
      if (inCell(RAILWAY.station.x, RY)) this.station(w);
      if (inCell(RAILWAY.train.x, RY)) this.train(w);
    }
    for (const t of WORLD.towns) if (inCell(t.x, t.y)) this.town(w, t);
    for (const o of WORLD.outposts) if (inCell(o.x, o.y)) this.outpost(w, o.x, o.y);
    for (const pl of WORLD.places) if (inCell(pl.x, pl.y)) this.place(w, pl);
    WORLD.junkyards.forEach(([x, y], i) => {
      if (inCell(x, y)) this.junkyard(w, x, y, i);
    });
    this.farms().forEach(([x, y, rx, ry], i) => {
      if (!inCell(x, y)) return;
      const h = (n: number) => hash01(WORLD.seed, i, 850 + n);
      // Bauernhaus (begehbar, oft mit Anbau), Tür zur Straße; Feldweg zur Landstraße
      const doorSide = Math.abs(rx - x) > Math.abs(ry - y) ? (rx > x ? 1 : 3) : ry > y ? 2 : 0;
      const annex = h(40) < 0.6 ? { side: (doorSide + 2) % 4, at: 1, w: 5, h: 5 } : undefined;
      let placed = +this.house(w, x - 4, y - 3, 8, 6, 'home', doorSide, h(41) < 0.6 ? 'brick' : 'plaster', h(42) < 0.6 ? 'tile' : 'slate', (n) => h(100 + n), true, annex);
      if (!placed) placed = +this.put(w, 'ruin-house', x - 3, y - 2, true);
      this.track(x, y, rx, ry, i);
      placed += +this.put(w, 'ruin-shed', x + 4, y - 1 + Math.round(h(1) * 3), true);
      placed += +this.put(w, 'supply-crate', x + 3, y + 3, true);
      if (h(2) < 0.5) placed += +this.put(w, h(43) < 0.6 ? 'tractor-wreck' : 'car-wreck', x - 5, y + 3, true);
      // Hofkram nach Los
      const farmKram = ['pallets', 'oil-drums', 'tire-pile', 'dog-house', 'laundry-line', 'trash-bin', 'garden-shed'];
      for (let q = 0; q < 3; q++) if (h(44 + q) < 0.6) placed += +this.put(w, farmKram[Math.floor(h(47 + q) * farmKram.length)], x + 4 + q * 2, y + 5 + (q % 2), true);
      // Hof: Holzstapel und Kohlenkeller bzw. Bauschutt einer eingestürzten Scheune
      placed += +this.put(w, 'wood-pile', x + 8, y + 2, true);
      placed += +this.put(w, h(3) < 0.5 ? 'coal-pile' : 'rubble-pile', x - 6, y - 5, true);
      // Acker mit Zaun und Heuballen (auf der straßenabgewandten Seite)
      const fx = x + (h(4) < 0.5 ? -20 : 10);
      const fy = y + (h(5) < 0.5 ? -16 : 7);
      this.field(w, fx, fy, 12, 8, h);
      this.track(x, y, fx + 6, fy + 9, i + 5000);
      // Hofbäume: alte Linde/Eiche am Haus, Obstbäume dahinter
      this.tree(w, x - 6 + h(20) * 2, y - 1 + h(21) * 2, 0, 'oak');
      this.tree(w, x + 1 + h(22) * 2, y - 6 + h(23), 0, 'chestnut');
      for (let i = 0; i < 4; i++) if (h(24 + i) < 0.6) this.tree(w, x - 2 + i * 3 + h(30 + i), y - 9 + h(34 + i) * 2, 0, 'orchard');
      if (placed) this.sites.push({ x, y, r: 9, weight: 1.5, kind: 'farm' });
    });
    // Wildnis: vereinzelt ein Wrack oder ein verlassenes Lager, nicht bei Orten
    const s = w.seed;
    // umgestürzte Bäume im Wald (je Zelle bis zu zwei, nur wo Bäume stehen)
    for (let q = 0; q < 2; q++) {
      const lx = Math.round((gx + hash01(s, gx, gy, 830 + q)) * c);
      const ly = Math.round((gy + hash01(s, gx, gy, 832 + q)) * c);
      let trees = 0;
      for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) if (w.map.trees.treeAt(lx + i, ly + j)) trees++;
      if (trees >= 3 && !this.nearTown(lx, ly, 40)) this.put(w, 'fallen-log', lx, ly);
    }
    // Ruderboot am Seeufer: Landfeld mit Wasser im Nachbarfeld
    if (hash01(s, gx, gy, 840) < 0.45) {
      for (let q = 0; q < 24; q++) {
        const bx = Math.round((gx + hash01(s, gx, gy, 841 + q)) * c);
        const by = Math.round((gy + hash01(s, gx, gy, 871 + q)) * c);
        if (w.map.isWater(bx, by) || w.map.isWater(bx + 1, by)) continue;
        if (!(w.map.isWater(bx, by + 1) || w.map.isWater(bx, by - 1) || w.map.isWater(bx - 1, by) || w.map.isWater(bx + 2, by))) continue;
        if (Math.hypot(bx, by) < SITES.startFree * 0.6) continue;
        if (this.put(w, 'rowboat', bx, by)) {
          if (hash01(s, gx, gy, 899) < 0.6) this.put(w, 'jetty', bx, by + (w.map.isWater(bx, by + 1) ? -1 : 1));
          break;
        }
      }
    }
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
    } else if (hash01(s, gx, gy, 814) < 0.75) {
      // verlassener Zeltplatz: Kuppelzelte um eine kalte Feuerstelle, Holzstapel, manchmal ein Wagen
      let placed = +this.put(w, 'fire-ring', x, y);
      for (let q = 0; q < 3; q++) {
        if (q > 0 && hash01(s, gx, gy, 818 + q) < 0.4) continue;
        const a = (q / 3) * Math.PI * 2 + hash01(s, gx, gy, 821) * 2;
        placed += +this.put(w, 'dome-tent', Math.round(x + Math.cos(a) * 3.2 - 0.5), Math.round(y + Math.sin(a) * 3.2 - 0.5));
      }
      if (hash01(s, gx, gy, 822) < 0.5) this.put(w, 'wood-pile', x + 2, y + 3);
      if (hash01(s, gx, gy, 823) < 0.4) this.put(w, 'car-wreck', x - 7, y + 1);
      if (hash01(s, gx, gy, 824) < 0.4) this.put(w, 'corpse', x + 1, y - 2);
      if (placed) this.sites.push({ x, y, r: 6, weight: 1.2, kind: 'camp' });
    } else if (this.put(w, hash01(s, gx, gy, 817) < 0.3 ? 'van-wreck' : 'car-wreck', x, y)) this.sites.push({ x, y, r: 5, weight: 0.7, kind: 'wreck' });
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
    let parkTry: (() => void) | null = null;
    if (t.size >= 2) {
      const a = Math.round((hs(50)(1) - 0.5) * len * 0.5);
      const side = hs(50)(2) < 0.5 ? -1 : 1;
      const px = t.x + (horizontal ? a - 6 : side < 0 ? -15 : 4);
      const py = t.y + (horizontal ? (side < 0 ? -13 : 4) : a - 6);
      for (let y = py; y < py + (horizontal ? 10 : 12); y++) for (let x = px; x < px + (horizontal ? 12 : 10); x++) this.paint(w, x, y, PAVEMENT);
      this.tree(w, px + 5.5, py + 5.5, 0, 'oak');
      const cw = 9;
      const ch = 12;
      this.house(w, horizontal ? px + 13 : px, horizontal ? py + (side < 0 ? -3 : 1) : py + 13, horizontal ? cw : ch, horizontal ? ch : cw,
        'church', horizontal ? (side < 0 ? 2 : 0) : side < 0 ? 1 : 3, 'plaster', 'slate', hs(51), true);
      this.cemetery(w, horizontal ? px : px + (side < 0 ? -13 : 11), horizontal ? py + (side < 0 ? -13 : 11) : py, horizontal, hs(52));
      // Park auf der anderen Seite der Hauptstraße: Wege, Brunnen, Spielplatz, Bänke, Bäume
      parkTry = () => { for (const shift of [0, 16, -16, 30, -30, 44, -44]) {
        for (const sd of [-side, side]) {
          const qx = t.x + (horizontal ? a - 6 + shift : sd < 0 ? 4 : -17);
          const qy = t.y + (horizontal ? (sd < 0 ? 4 : -13) : a - 6 + shift);
          if (this.park(w, qx, qy, horizontal ? 13 : 10, horizontal ? 10 : 13, hs(53), t.id)) break;
        }
        if (this.parks.has(t.id)) break;
      } };
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
    // Park zuletzt, damit er Straßen und Häusern nicht im Weg ist
    (parkTry as (() => void) | null)?.();
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
  /** Ortspark: frei nur, wenn der Platz unbebaut ist. Kreuzweg, Brunnen in der Mitte, Spielgeräte, Bänke, Bäume. */
  private readonly parks = new Set<string>();
  private park(w: World, x0: number, y0: number, W: number, H: number, h: (n: number) => number, town = ''): boolean {
    for (let y = y0; y < y0 + H; y++) for (let x = x0; x < x0 + W; x++) if (w.map.floorAt(x, y) || w.entityAt(x, y) || this.houses.some((hs) => x >= hs.x - 1 && x <= hs.x + hs.w && y >= hs.y - 1 && y <= hs.y + hs.h)) return false;
    this.parks.add(town);
    this.ground(w, x0, y0, x0 + W - 1, y0 + H - 1);
    const cx = x0 + Math.floor(W / 2);
    const cy = y0 + Math.floor(H / 2);
    for (let x = x0; x < x0 + W; x++) this.paint(w, x, cy, PAVEMENT);
    for (let y = y0; y < y0 + H; y++) this.paint(w, cx, y, PAVEMENT);
    for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 2; x <= cx + 2; x++) this.paint(w, x, y, PAVEMENT);
    this.put(w, 'fountain', cx - 1, cy - 1, true);
    const spots: [string, number, number][] = [['slide', x0 + 1, y0 + 1], ['sandbox', x0 + W - 3, y0 + 1], ['climber', x0 + 1, y0 + H - 3], ['swing', x0 + W - 3, y0 + H - 2]];
    for (const [n, x, y] of spots) if (h(10 + x) < 0.85) this.put(w, n, x, y, true);
    this.put(w, 'bench', cx + 2, cy - 3, true);
    this.put(w, 'bench', cx - 3, cy + 3, true);
    this.put(w, 'trash-bin', cx + 3, cy + 3, true);
    for (const [x, y] of [[x0 + 0.5, cy - 2.5], [x0 + W - 1.5, cy + 2.5], [cx - 3.5, y0 + 0.5], [cx + 3.5, y0 + H - 1.5]]) this.tree(w, x, y, 0, 'town');
    if (h(20) < 0.5) this.put(w, 'corpse', cx + 1, cy + 2, true);
    this.sites.push({ x: cx, y: cy, r: 7, weight: 1.2, kind: 'town' });
    return true;
  }

  /** Friedhof neben dem Dorfplatz: Hecke ringsum, Gräberreihen mit Weg, Grabsteine, Kreuze, offene Gräber, Eiben. */
  private cemetery(w: World, x0: number, y0: number, horizontal: boolean, h: (n: number) => number): void {
    const W2 = horizontal ? 12 : 10;
    const H2 = horizontal ? 10 : 12;
    for (let y = y0 - 1; y <= y0 + H2; y++) for (let x = x0 - 1; x <= x0 + W2; x++) if (w.map.floorAt(x, y) || w.entityAt(x, y)) return;
    this.ground(w, x0 - 1, y0 - 1, x0 + W2, y0 + H2);
    this.ring(w, x0 - 1, y0 - 1, x0 + W2, y0 + H2, 'hedge', horizontal ? 2 : 1, 2, null);
    let i = 0;
    for (let y = y0 + 1; y < y0 + H2 - 1; y += 2) {
      for (let x = x0 + 1; x < x0 + W2 - 1; x++) {
        i++;
        if (Math.abs(x - (x0 + W2 / 2)) < 1) {
          this.paint(w, x, y, PAVEMENT);
          this.paint(w, x, y + 1, PAVEMENT);
          continue;
        }
        if (h(i) < 0.2) continue;
        this.put(w, 'grave', x, y);
      }
    }
    this.tree(w, x0 + 0.5, y0 + 0.5, 1);
    this.tree(w, x0 + W2 - 1.5, y0 + H2 - 1.5, 1);
    this.sites.push({ x: x0 + W2 / 2, y: y0 + H2 / 2, r: 8, weight: 1.5, kind: 'town' });
  }

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
      case 'evac': return this.evac(w, p, h);
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
    // Sandsäcke und Absperrung vor dem Tor
    this.put(w, 'sandbags', p.x - 4, y0 - 4, true);
    this.put(w, 'sandbags', p.x + 3, y0 - 4, true);
    this.put(w, 'road-barrier', p.x - 1, y0 - 5, true);
    this.put(w, 'police-wreck', p.x + 6, y0 - 8, true);
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
    // Lagerplatz: Paletten, Fässer, Reifen, Kegel, Transporter
    for (let k = 0; k < 6; k++) this.put(w, ['pallets', 'oil-drums', 'tire-pile', 'pallets', 'oil-drums', 'traffic-cone'][k], x1 - 3 - (k % 3) * 2, y1 - 3 - Math.floor(k / 3) * 2, true);
    this.put(w, 'van-wreck', x0 + 22, y1 - 4, true);
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
    this.put(w, 'tractor-wreck', p.x - 4, p.y - 2, true);
    for (let k = 0; k < 3; k++) if (h(80 + k) < 0.8) this.put(w, 'garden', p.x - 12 + k * 3, p.y + (s < 0 ? -6 : 6));
    for (const [n, dx] of [['pallets', 12], ['oil-drums', 13], ['tire-pile', 12], ['dog-house', -14], ['laundry-line', -13]] as const) {
      this.put(w, n, p.x + dx, p.y + (s < 0 ? 1 : -2) + (n === 'tire-pile' ? 1 : 0), true);
    }
    this.field(w, p.x - 34, p.y - 10, 16, 10, (n) => h(120 + n));
    this.track(p.x - 4, p.y, p.x - 26, p.y + 1, p.x * 7 + 1);
    this.track(p.x + 6, p.y, p.x + 25, p.y + 3, p.x * 7 + 2);
    this.field(w, p.x + 18, p.y - 10, 14, 12, (n) => h(150 + n));
    this.field(w, p.x - 8, p.y + (s < 0 ? 14 : -26), 18, 10, (n) => h(180 + n));
    this.tree(w, p.x - 2, p.y + (s < 0 ? 6 : -6), 0, 'oak');
    this.tree(w, p.x - 14.5, p.y - 1, 0, 'chestnut');
    // Streuobstwiese hinter dem Gutshof
    const oy = p.y + (s < 0 ? -22 : 16);
    for (let j = 0; j < 3; j++) for (let i = 0; i < 5; i++) if (h(300 + j * 5 + i) < 0.8) this.tree(w, p.x + 22 + i * 4 + (j % 2) * 2 + h(320 + i) * 0.6, oy + j * 4 + h(330 + j) * 0.6, 0, 'orchard');
    w.community.addSurvivor(p.x - 7.5, p.y + (s < 0 ? 6.5 : -7.5), w.seed);
    this.sites.push({ x: p.x, y: p.y, r: 12, weight: 2.5, kind: 'farm' });
  }

  /** Militärposten: Kisten hinter Wracks, stark bewacht. */
  /**
   * Evakuierungs-Sammelstelle (eigene Idee): Bauzaun mit Einfahrt, Sandsäcke und Absperrung am Tor, Reihen von
   * Armeezelten, Sanitätszelt mit Feldbetten, Lastwagen, Dixi-Klos, Leichensäcke. Überrannt: viele Zombies, viel Beute.
   */
  private evac(w: World, p: PlaceDef, h: (n: number) => number): void {
    const x0 = p.x - 17;
    const y0 = p.y - 12;
    const x1 = p.x + 17;
    const y1 = p.y + 12;
    this.ground(w, x0 - 3, y0 - 3, x1 + 3, y1 + 3);
    // Lagerstraße aus Asphalt quer durch, Kies vor den Zelten
    for (let x = x0 + 1; x < x1; x++) for (const y of [p.y, p.y + 1]) w.map.setFloor(x, y, ASPHALT);
    this.ring(w, x0, y0, x1, y1, 'site-fence', p.gate, 4, null);
    const gy = p.gate === 0 ? y0 : y1;
    const out = p.gate === 0 ? -1 : 1;
    this.put(w, 'sandbags', p.x - 5, gy + out * 2, true);
    this.put(w, 'sandbags', p.x + 4, gy + out * 2, true);
    this.put(w, 'road-barrier', p.x - 1, gy + out * 3, true);
    this.put(w, 'traffic-cone', p.x + 2, gy + out * 3, true);
    // Zeltreihen nördlich und südlich der Lagerstraße
    let k = 0;
    for (const ty of [p.y - 5, p.y + 3]) {
      for (let tx = x0 + 2; tx + 3 < x1 - 1; tx += 4) {
        k++;
        if (h(10 + k) < 0.12) continue;
        const med = k === 3 || k === 10;
        this.put(w, med ? 'medical-tent' : 'army-tent', tx, ty, true);
      }
    }
    // Feldbetten neben dem Sanitätszelt, Leichensäcke, Lastwagen, Dixi-Klos, Kisten
    for (let i = 0; i < 5; i++) if (h(40 + i) < 0.75) this.put(w, 'cot', x0 + 2 + i, y0 + 1, true);
    for (let i = 0; i < 3; i++) this.put(w, 'body-bags', x1 - 7 + (i % 2) * 2, y1 - 2 - i, true);
    for (let i = 0; i < 5; i++) if (h(70 + i) < 0.7) this.put(w, 'corpse', x0 + 3 + Math.floor(h(75 + i) * 28), p.y + (i % 2 ? 2 : -2), true);
    this.put(w, 'army-truck', p.x - 2, p.y - 1 + (h(50) < 0.5 ? 0 : 0), true);
    this.put(w, 'army-truck', x0 + 3, p.y, true);
    for (let i = 0; i < 3; i++) this.put(w, 'porta-potty', x1 - 2, y0 + 2 + i, true);
    this.put(w, 'military-crate', x1 - 4, p.y - 2, true);
    this.put(w, 'supply-crate', x1 - 5, p.y - 2, true);
    this.put(w, 'supply-crate', x1 - 4, p.y + 3, true);
    this.put(w, 'oil-drums', x0 + 1, y1 - 1, true);
    this.put(w, 'ambulance-wreck', p.x + 6, gy + out * 6, true);
    this.sites.push({ x: p.x, y: p.y, r: 16, weight: 6, kind: 'outpost' });
    if (h(60) < 0.6) w.community.addSurvivor(x0 + 2.5, y0 + 2.5, w.seed);
  }

  /** Bahnhof: Empfangsgebäude, Bahnsteig mit Dach und Bänken, Ortsschild, ein paar Koffer (Kisten). */
  private station(w: World): void {
    const x = RAILWAY.station.x;
    const y = RAILWAY.y;
    for (let tx = x - 12; tx <= x + 12; tx++) for (let ty = y - 4; ty <= y - 2; ty++) {
      this.flatten(w, tx, ty);
      w.map.clearTrees(tx, ty, tx, ty);
      w.map.setFloor(tx, ty, PAVEMENT);
    }
    this.house(w, x - 6, y - 12, 12, 7, 'office', 2, 'brick', 'slate', (n) => hash01(WORLD.seed, x, y, 4000 + n), true);
    this.put(w, 'platform-roof', x - 9, y - 4, true);
    this.put(w, 'platform-roof', x + 3, y - 4, true);
    for (const dx of [-11, -2, 7]) this.put(w, 'bench', x + dx, y - 2, true);
    this.put(w, 'trash-bin', x - 3, y - 4, true);
    this.put(w, 'town-sign', x + 10, y - 3, true);
    this.put(w, 'corpse', x + 1, y - 3, true);
    this.put(w, 'supply-crate', x - 7, y - 2, true);
    this.sites.push({ x, y: y - 6, r: 12, weight: 2.5, kind: 'town' });
  }

  /** Entgleister Güterzug: Lok und Wagen, manche aus dem Gleis gesprungen, Fracht verstreut. */
  private train(w: World): void {
    let x = RAILWAY.train.x;
    const y = RAILWAY.y;
    RAILWAY.train.cars.forEach((car, i) => {
      const len = car === 'locomotive' ? 7 : 6;
      const h = (n: number) => hash01(WORLD.seed, x, i, 4100 + n);
      let off = i > 1 && h(1) < 0.45 ? (h(2) < 0.5 ? -3 : 2) : 0;
      // nur aufs Land springen, nicht in den See
      for (let tx = x; tx < x + len && off; tx++) if (w.map.isWater(tx, y - 1 + off) || w.map.isWater(tx, y + off)) off = 0;
      for (let ty = y - 1 + off; ty <= y + off; ty++) for (let tx = x; tx < x + len; tx++) w.map.clearTrees(tx, ty, tx, ty);
      this.put(w, car, x, y - 1 + off, true);
      if (off && h(3) < 0.7) this.put(w, h(4) < 0.5 ? 'scrap-pile' : 'pallets', x + 2, y + (off < 0 ? 1 : -3), true);
      x += len + 1;
    });
    this.put(w, 'corpse', RAILWAY.train.x + 3, y + 2, true);
    this.sites.push({ x: RAILWAY.train.x + 22, y, r: 22, weight: 4, kind: 'wreck' });
  }

  private outpost(w: World, x: number, y: number): void {
    this.asphalt(w, x - 6, y - 4, x + 7, y + 5, true);
    for (const [dx, dy] of [[-3, -2], [-1, -2], [1, -2], [3, -2], [-3, 2], [3, 2]] as const) this.put(w, dx % 2 ? 'military-crate' : 'supply-crate', x + dx, y + dy, true);
    this.put(w, 'military-crate', x, y, true);
    this.put(w, 'car-wreck', x - 8, y + 6, true);
    this.put(w, 'car-wreck', x + 5, y - 7, true);
    for (const [dx, dy] of [[-6, -5], [3, -5], [-6, 4], [3, 4]]) this.put(w, 'sandbags', x + dx, y + dy, true);
    this.put(w, 'oil-drums', x + 6, y + 2, true);
    this.put(w, 'ambulance-wreck', x - 12, y - 2, true);
    this.put(w, 'ruin-shed', x - 9, y - 6, true);
    this.sites.push({ x, y, r: 10, weight: 7, kind: 'outpost' });
    w.community.addSurvivor(x + 0.5, y + 3.5, w.seed);
  }

  // ------------------------------------------------------------ Speichern

  serialize(): { c: number[]; s: [number, number, number, number, SiteKind][]; h?: [number, number, number, number, RoofKind, 0 | 1, number?, number?][]; t?: number[][] } {
    return {
      c: [...this.cells].sort((a, b) => a - b), s: this.sites.map((s) => [s.x, s.y, s.r, s.weight, s.kind]),
      ...(this.tracks.length ? { t: this.tracks.map((t) => [...t]) } : {}),
      ...(this.houses.length ? { h: this.houses.map((h) => (h.g !== undefined ? [h.x, h.y, h.w, h.h, h.roof, h.ridge, h.own ? 1 : 0, h.g] : h.own ? [h.x, h.y, h.w, h.h, h.roof, h.ridge, 1] : [h.x, h.y, h.w, h.h, h.roof, h.ridge]) as [number, number, number, number, RoofKind, 0 | 1, number?, number?]) } : {}),
    };
  }

  load(d: ReturnType<SiteSystem['serialize']> | undefined): void {
    this.cells.clear();
    this.sites.length = 0;
    this.houses.length = 0;
    this.tracks.length = 0;
    for (const t of d?.t ?? []) this.tracks.push([...t]);
    for (const c of d?.c ?? []) this.cells.add(c);
    for (const [x, y, r, weight, kind] of d?.s ?? []) this.sites.push({ x, y, r, weight, kind });
    for (const [x, y, w, h, roof, ridge, own, g] of d?.h ?? []) {
      const hs: House = { x, y, w, h, roof, ridge };
      if (own) hs.own = true;
      if (g !== undefined) hs.g = g;
      this.houses.push(hs);
    }
  }

  /**
   * Selbst gebauter Raum (Block C): Schließt eine neue Wand einen rechteckigen Innenraum (höchstens ROOM_MAX Felder)
   * vollständig ein, bekommt er ein Dach wie ein Haus (Wellblech, bei Ziegelwänden Ziegel).
   */
  detectRoom(w: World, x: number, y: number): void {
    const ROOM_MAX = 144;
    const isWall = (tx: number, ty: number) => w.entityAt(tx, ty)?.kind === 'wall';
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const sx = x + dx;
      const sy = y + dy;
      if (isWall(sx, sy) || w.map.isBlocked(sx, sy) || this.houseAt(sx, sy)) continue;
      const seen = new Set<number>();
      const stack: [number, number][] = [[sx, sy]];
      let x0 = sx, y0 = sy, x1 = sx, y1 = sy;
      let open = false;
      while (stack.length && !open) {
        const [cx, cy] = stack.pop()!;
        const k = (cx + 32768) * 65536 + (cy + 32768);
        if (seen.has(k)) continue;
        seen.add(k);
        if (seen.size > ROOM_MAX) open = true;
        x0 = Math.min(x0, cx); y0 = Math.min(y0, cy); x1 = Math.max(x1, cx); y1 = Math.max(y1, cy);
        for (const [ax, ay] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
          const nx = cx + ax;
          const ny = cy + ay;
          if (!isWall(nx, ny)) stack.push([nx, ny]);
        }
      }
      // nur geschlossene, rechteckige Innenräume
      if (open || seen.size !== (x1 - x0 + 1) * (y1 - y0 + 1)) continue;
      const mat = w.entityAt(x, y);
      const brick = mat?.kind === 'wall' && (mat.def.house === 'brick' || mat.def.house === 'plaster');
      const W = x1 - x0 + 3;
      const H = y1 - y0 + 3;
      this.houses.push({ x: x0 - 1, y: y0 - 1, w: W, h: H, roof: brick ? 'tile' : 'metal', ridge: W >= H ? 0 : 1, own: true });
    }
  }

  /** Eine Wand ist weg: Dächer über diesem Feld (Rand eines Hauses) verschwinden. */
  wallGone(x: number, y: number): void {
    for (let i = this.houses.length - 1; i >= 0; i--) {
      const h = this.houses[i];
      const edge = (x === h.x || x === h.x + h.w - 1) && y >= h.y && y < h.y + h.h || (y === h.y || y === h.y + h.h - 1) && x >= h.x && x < h.x + h.w;
      if (edge && h.own) this.houses.splice(i, 1);
    }
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
    h: (n: number) => number, level = true, annex?: { side: number; at: number; w: number; h: number }): boolean {
    // Grundriss: Hauptrechteck (x, y, W, H) und optional ein Anbau an der Seite annex.side (L-Form), überlappend in
    // der gemeinsamen Wandlinie. Alles in einem umschließenden Raster (Ursprung bx, by).
    let ax = 0, ay = 0, aw = 0, ah = 0;
    if (annex) {
      aw = annex.w;
      ah = annex.h;
      if (annex.side === 0) { ax = x + annex.at; ay = y - ah + 1; }
      else if (annex.side === 2) { ax = x + annex.at; ay = y + H - 1; }
      else if (annex.side === 1) { ax = x + W - 1; ay = y + annex.at; }
      else { ax = x - aw + 1; ay = y + annex.at; }
    }
    const bx = annex ? Math.min(x, ax) : x;
    const by = annex ? Math.min(y, ay) : y;
    const BW = (annex ? Math.max(x + W, ax + aw) : x + W) - bx;
    const BH = (annex ? Math.max(y + H, ay + ah) : y + H) - by;
    const ox = x - bx;
    const oy = y - by;
    const inMain = (i: number, j: number) => i >= ox && j >= oy && i < ox + W && j < oy + H;
    const inAnnex = (i: number, j: number) => !!annex && i >= ax - bx && j >= ay - by && i < ax - bx + aw && j < ay - by + ah;
    const inMask = (i: number, j: number) => inMain(i, j) || inAnnex(i, j);
    for (let j = -1; j <= BH; j++) for (let i = -1; i <= BW; i++) {
      if (!inMask(i, j) && !inMask(i - 1, j) && !inMask(i + 1, j) && !inMask(i, j - 1) && !inMask(i, j + 1) && !inMask(i - 1, j - 1) && !inMask(i + 1, j + 1) && !inMask(i + 1, j - 1) && !inMask(i - 1, j + 1)) continue;
      const tx = bx + i;
      const ty = by + j;
      if ((!level && w.map.isBlocked(tx, ty)) || w.entityAt(tx, ty) || w.map.resourceAt(tx, ty).amount > 0) return false;
    }
    const p = w.player;
    if (p && p.overlapsRect(bx - 1, by - 1, BW + 2, BH + 2)) return false;
    if (level) for (let j = -1; j <= BH; j++) for (let i = -1; i <= BW; i++) this.flatten(w, bx + i, by + j);
    w.map.clearTrees(bx - 1, by - 1, bx + BW, by + BH);
    // ab hier: Raster BW×BH; W/H/x/y bezeichnen weiter das Hauptrechteck
    const idx = (i: number, j: number) => j * BW + i;
    const wall = new Uint8Array(BW * BH); // 1 Wand, 2 Durchgang innen
    const boundary = new Uint8Array(BW * BH);
    for (let j = 0; j < BH; j++) for (let i = 0; i < BW; i++) {
      if (!inMask(i, j)) continue;
      let out = false;
      for (let b = -1; b <= 1 && !out; b++) for (let a = -1; a <= 1; a++) if (!inMask(i + a, j + b)) out = true;
      if (out) {
        wall[idx(i, j)] = 1;
        boundary[idx(i, j)] = 1;
      }
    }
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
    split({ x: ox + 1, y: oy + 1, w: W - 2, h: H - 2, type: '' }, 0);
    if (annex) {
      // Anbau: eigener Raum; Trennwand auf der gemeinsamen Linie mit einem Durchgang
      const ai = ax - bx;
      const aj = ay - by;
      rooms.push({ x: ai + 1, y: aj + 1, w: aw - 2, h: ah - 2, type: 'annex' });
      const line: [number, number][] = [];
      for (let j = 0; j < BH; j++) for (let i = 0; i < BW; i++) if (inMain(i, j) && inAnnex(i, j) && !boundary[idx(i, j)]) line.push([i, j]);
      line.forEach(([i, j], q) => { wall[idx(i, j)] = q === Math.floor(line.length / 2) ? 2 : 1; });
    }
    const isWall = (i: number, j: number) => i >= 0 && j >= 0 && i < BW && j < BH && wall[idx(i, j)] === 1;
    const edge = (i: number, j: number) => i >= 0 && j >= 0 && i < BW && j < BH && boundary[idx(i, j)] === 1;
    const horizAt = (i: number, j: number) => edge(i - 1, j) && edge(i + 1, j);
    const vertAt = (i: number, j: number) => edge(i, j - 1) && edge(i, j + 1);
    // Ecke: keine gerade Wand (weder waagerecht noch senkrecht durchgehend)
    const corner = (i: number, j: number) => !(horizAt(i, j) !== vertAt(i, j));
    // Abzweig einer Innenwand an der Außenwand (dort weder Tür noch Fenster)
    const junction = (i: number, j: number) => edge(i, j) && [[0, 1], [1, 0], [0, -1], [-1, 0]].some(([a, b]) => {
      const ni = i + a;
      const nj = j + b;
      return inMask(ni, nj) && !edge(ni, nj) && wall[idx(ni, nj)] >= 1;
    });
    // Haustür(en): Feld auf der Türseite des Hauptrechtecks, innen ein Raum, nicht an Ecken oder Abzweigen
    const sideTiles = (side: number): [number, number][] => {
      const out: [number, number][] = [];
      if (side === 0 || side === 2) for (let i = ox + 1; i < ox + W - 1; i++) out.push([i, side === 0 ? oy : oy + H - 1]);
      else for (let j = oy + 1; j < oy + H - 1; j++) out.push([side === 3 ? ox : ox + W - 1, j]);
      return out.filter(([i, j]) => edge(i, j));
    };
    const inward = (i: number, j: number): [number, number] => {
      for (const [a, b] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) if (inMask(i + a, j + b) && !edge(i + a, j + b)) return [i + a, j + b];
      return [i, j];
    };
    const doors = new Set<number>();
    const okDoor = (i: number, j: number) => {
      const [ii, jj] = inward(i, j);
      const hz = horizAt(i, j);
      return !corner(i, j) && !junction(i, j) && wall[idx(ii, jj)] === 0 && !junction(i + (hz ? 1 : 0), j + (hz ? 0 : 1))
        && !junction(i - (hz ? 1 : 0), j - (hz ? 0 : 1));
    };
    const pickDoor = (side: number, salt: number, width = 1) => {
      const c = sideTiles(side).filter(([i, j]) => okDoor(i, j));
      if (!c.length) return;
      const [i, j] = c[Math.floor(h(salt) * c.length)];
      doors.add(idx(i, j));
      if (width > 1) {
        const [a, b] = side === 0 || side === 2 ? [i + 1, j] : [i, j + 1];
        if (edge(a, b) && !corner(a, b)) doors.add(idx(a, b));
      }
    };
    pickDoor(door, 300, kind === 'barn' || kind === 'works' ? 2 : 1);
    if (kind !== 'cells' && h(301) < (kind === 'home' ? 0.5 : 0.3)) pickDoor((door + 2) % 4, 302);
    // Umrechnung für den Rest: lokale Koordinaten beziehen sich auf das umschließende Raster
    const mainRect = { x, y, w: W, h: H };
    x = bx;
    y = by;
    W = BW;
    H = BH;
    // Bauteile setzen
    const nearDoor = (i: number, j: number) => [[0, 1], [1, 0], [0, -1], [-1, 0], [0, 0]].some(([a, b]) => doors.has(idx(i + a, j + b)) || wall[idx(Math.min(W - 1, Math.max(0, i + a)), Math.min(H - 1, Math.max(0, j + b)))] === 2);
    const fortified = kind === 'home' && h(600) < SITES.fortified;
    const winChance = kind === 'church' ? 0.95 : kind === 'barn' ? 0.15 : kind === 'cells' ? 0 : kind === 'works' ? 0.35 : 0.8;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const tx = x + i;
      const ty = y + j;
      const k = idx(i, j);
      const horiz = horizAt(i, j);
      if (doors.has(k)) {
        w.create(w.nextId++, 'hdoor', tx, ty, horiz ? 0 : 1);
        continue;
      }
      if (wall[k] !== 1) continue;
      const along = horiz ? i : j;
      const shop = kind === 'store' && j === (door === 0 ? oy : door === 2 ? oy + mainRect.h - 1 : -1);
      const win = edge(i, j) && !corner(i, j) && !junction(i, j) && !nearDoor(i, j) && (shop || along % 2 === 1) && h(400 + k) < winChance;
      if (win) {
        const e = w.create(w.nextId++, `hwin-${mat}`, tx, ty, horiz ? 0 : 1);
        // Spuren früherer Überlebender: manche Wohnhäuser sind verrammelt (Bretter vor den Fenstern, Türen frei)
        if (e.kind === 'wall' && fortified && h(520 + k) < 0.85) e.boardHp = BARRICADE.boardHp * (1 + Math.floor(h(540 + k) * BARRICADE.maxBoards));
        else if (e.kind === 'wall' && h(500 + k) < 0.3) e.broken = true;
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
    const free = (i: number, j: number) => inMask(i, j) && !edge(i, j) && wall[idx(i, j)] === 0 && !used.has(idx(i, j)) && !nearDoor(i, j);
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
    this.houses.push({ ...mainRect, roof, ridge: mainRect.w >= mainRect.h ? 0 : 1 });
    if (annex) this.houses.push({ x: ax, y: ay, w: aw, h: ah, roof, ridge: aw >= ah ? 0 : 1, g: this.houses.length - 1 });
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
