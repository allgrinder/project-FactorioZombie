import { HeatSystem } from './heat';
import { CorpseSystem } from './corpses';
import { FLOOR_BY_ID, FLOOR_BY_ITEM } from '../data/floors';
import { CapsuleSystem } from './capsules';
import { LEGACY_MAP_SETTINGS, type MapSettings } from '../data/mapgen';
import { EnemySystem } from './enemies';
import { NoiseSystem } from './noise';
import { SiteSystem } from './sites';
import { ChartSystem } from './chart';
import { EventQueue } from './events';
import { type EntityDef, entityDef, sizeOf } from '../data/entities';
import { RESOURCE_BY_INDEX } from '../data/resources';
import { DAY, darknessAt } from '../data/time';
import { BeltSystem } from './belts';
import type { InsertMode } from './entities/base';
import { ENTITY_CLASSES } from './entities/registry';
import { type Dir, tileKey } from './geom';
import { DrillEntity, type Entity, itemId, itemIndex } from './machines';
import { FluidSystem } from './fluids';
import { GameMap } from './map';
import { PowerSystem } from './power';
import { ResearchSystem } from './research';
import { ProductionStats } from './stats';
import { GhostSystem } from './blueprint';
import { BeaconSystem } from './modules';
import { RobotSystem } from './robots';
import { CircuitSystem } from './circuit';
import { TrainSystem } from './trains';
import { Burner } from './burner';
import type { Player } from './player';

export interface PlaceCheck {
  ok: boolean;
  reason?: string;
  /** Vorhandenes Band wird nur gedreht. */
  replace?: number;
}

/** Item auf dem Boden (Position in 1/256 Feldern). */
export interface GroundItem {
  item: string;
  x: number;
  y: number;
}

/** Mindestabstand zweier Items auf dem Boden (Felder). */
const GROUND_SPACING = 0.28;

/**
 * Die gesamte Simulation. Kennt weder DOM noch PixiJS.
 * step() rückt genau einen Tick (1/60 s) vor.
 */
export class World {
  tick = 0;
  readonly map: GameMap;
  readonly belts = new BeltSystem();
  readonly fluids = new FluidSystem();
  readonly power = new PowerSystem();
  readonly research = new ResearchSystem();
  readonly stats = new ProductionStats();
  /** Geplante Gebäude (Blaupausen). */
  readonly ghosts = new GhostSystem();
  /** Leuchtfeuer → Maschinen. */
  readonly beacons = new BeaconSystem();
  /** Bau- und Logistikroboter. */
  readonly robots = new RobotSystem();
  /** Schaltungsnetz (rote und grüne Drähte). */
  readonly circuit = new CircuitSystem();
  /** Gleise und Züge. */
  readonly trains = new TrainSystem();
  /** Lärm lockt Zombies an (Maschinen, Schüsse, Lockvögel). */
  readonly noise = new NoiseSystem();
  /** Fundorte der alten Welt (Dörfer, Wracks). */
  readonly sites = new SiteSystem();
  /** Aufgedeckte Kartenabschnitte (Figur, Radar, Roboterhangar). */
  readonly chart = new ChartSystem();
  /** Ereignisse für Ton/Effekte (nicht gespeichert). */
  readonly events = new EventQueue();
  readonly enemies = new EnemySystem();
  /** Bänder, die im nächsten Tick durch ihre Schaltbedingung angehalten sind (gespeichert). */
  readonly beltStopped = new Set<number>();
  /** Wärmenetz (Kernkraft). */
  readonly heat = new HeatSystem();
  /** Leichen der Spielfigur mit Inventar. */
  readonly corpses = new CorpseSystem();
  /** Geworfene Granaten und Klippensprengstoff. */
  readonly capsules = new CapsuleSystem();
  readonly entities = new Map<number, Entity>();
  private readonly occupancy = new Map<number, number>();
  /** Items auf dem Boden je Feld. */
  readonly ground = new Map<number, GroundItem[]>();
  nextId = 1;
  private _player: Player | null = null;
  get player(): Player | null {
    return this._player;
  }
  set player(p: Player | null) {
    this._player = p;
    if (p) {
      p.recipeUnlocked = (r) => this.research.recipeUnlocked(r);
      p.onCrafted = (item, n) => {
        this.research.onCrafted(item, n);
        this.stats.made(item, n);
      };
      p.onUsed = (item, n) => this.stats.used(item, n);
    }
  }
  /** Gestartete Raketen (Vorgänger, ungenutzt). */
  rocketsLaunched = 0;
  /** Tick, in dem der Funkturm die Rettung erreicht hat (Spielziel), sonst null. */
  rescuedAt: number | null = null;
  /** Wird bei jeder Gebäudeänderung erhöht (Renderer). */
  structureVersion = 0;

  /** Karteneinstellungen; die Gegner-Einstellung lässt sich im laufenden Spiel ändern (EnemySystem.applySetting). */
  settings: MapSettings;

  constructor(readonly seed: number, settings: MapSettings = LEGACY_MAP_SETTINGS) {
    this.settings = settings;
    this.map = new GameMap(seed, settings);
  }

  // ------------------------------------------------------------ Abfragen

  entityAt(x: number, y: number): Entity | undefined {
    const id = this.occupancy.get(tileKey(Math.floor(x), Math.floor(y)));
    return id === undefined ? undefined : this.entities.get(id);
  }

  static footprint(def: EntityDef, x: number, y: number, dir = 0): [number, number][] {
    const [w, h] = sizeOf(def, dir);
    const out: [number, number][] = [];
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) out.push([x + i, y + j]);
    return out;
  }

  /** Landaufschüttung: verwandelt ein Wasserfeld in Land (Wiki „Landfill“). */
  landfill(x: number, y: number): boolean {
    if (!this.map.isWater(x, y)) return false;
    if (this.entityAt(x, y)) return false;
    this.map.setWater(x, y, false);
    this.structureVersion++;
    return true;
  }

  /** Bodenbelag legen (Wiki: Fliesen unter Gebäuden erlaubt, nicht auf Wasser, Klippen, Bäumen). Liefert das
   * Item des ersetzten Belags (oder ''), bzw. null, wenn nicht möglich. */
  placeFloor(item: string, x: number, y: number): string | null {
    const def = FLOOR_BY_ITEM[item];
    if (!def || this.map.isBlocked(x, y) || this.map.trees.treeAt(x, y)) return null;
    const old = this.map.floorAt(x, y);
    if (old === def.id) return null;
    this.map.setFloor(x, y, def.id);
    return old ? FLOOR_BY_ID[old].item : '';
  }

  /** Belag aufnehmen; liefert sein Item oder null. */
  removeFloor(x: number, y: number): string | null {
    const old = this.map.setFloor(x, y, 0);
    return old ? FLOOR_BY_ID[old].item : null;
  }

  /** Felder der Uferpumpe: vorn (Ausgang, an Land) und hinten (im Wasser), abhängig von der Richtung. */
  static pumpTiles(x: number, y: number, dir: Dir): { front: [number, number]; back: [number, number] } {
    switch (dir) {
      case 0: return { front: [x, y], back: [x, y + 1] };
      case 1: return { front: [x + 1, y], back: [x, y] };
      case 2: return { front: [x, y + 1], back: [x, y] };
      default: return { front: [x, y], back: [x + 1, y] };
    }
  }

  /** Gebäude-ID auf einem Feld (Schlüssel tileKey). */
  occupantAt(key: number): number | undefined {
    return this.occupancy.get(key);
  }

  canPlace(name: string, x: number, y: number, dir: Dir): PlaceCheck {
    const def = entityDef(name);
    if (def.kind === 'belt') {
      const e = this.entityAt(x, y);
      if (e && e.kind === 'belt' && e.name === name) return e.dir === dir ? { ok: false, reason: 'Gleiches Band' } : { ok: true, replace: e.id };
    }
    // Uferpumpe (1×2): vorderes Feld an Land, hinteres im Wasser
    const pumpTiles = def.kind === 'offshore-pump' ? World.pumpTiles(x, y, dir) : null;
    for (const [tx, ty] of World.footprint(def, x, y, dir)) {
      if (this.occupancy.has(tileKey(tx, ty))) return { ok: false, reason: 'Belegt' };
      if (pumpTiles && tx === pumpTiles.back[0] && ty === pumpTiles.back[1]) {
        if (!this.map.isWater(tx, ty)) return { ok: false, reason: 'Hinteres Feld muss im Wasser liegen' };
        continue;
      }
      if (this.map.isWater(tx, ty)) return { ok: false, reason: 'Wasser' };
      if (this.map.isCliff(tx, ty)) return { ok: false, reason: 'Klippe im Weg' };
      if (this.map.trees.treeAt(tx, ty)) return { ok: false, reason: 'Baum im Weg' };
    }
    const [w, h] = sizeOf(def, dir);
    if (def.solid && !def.walkable && this.player && this.player.overlapsRect(x, y, w, h)) {
      return { ok: false, reason: 'Spieler im Weg' };
    }
    if (def.kind === 'pumpjack') {
      const r = this.map.resourceAt(x + 1, y + 1);
      if (!(r.amount > 0 && RESOURCE_BY_INDEX[r.res]?.fluid)) return { ok: false, reason: 'Muss mittig auf einer Ölquelle stehen' };
    }
    if (def.kind === 'drill') {
      const tmp = new DrillEntity(0, name, x, y, dir);
      if (!tmp.areaTiles().some(([tx, ty]) => {
        const r = this.map.resourceAt(tx, ty);
        return r.amount > 0 && !RESOURCE_BY_INDEX[r.res]?.fluid;
      })) {
        return { ok: false, reason: 'Keine Ressourcen' };
      }
    }
    return { ok: true };
  }

  // ------------------------------------------------------------ Bauen

  place(name: string, x: number, y: number, dir: Dir, force = false): Entity | null {
    const chk = this.canPlace(name, x, y, dir);
    if (chk.replace !== undefined) {
      const e = this.entities.get(chk.replace)!;
      e.dir = dir;
      this.belts.setDir(e.id, dir);
      this.structureVersion++;
      return e;
    }
    if (!chk.ok && !force) return null;
    const e = this.create(this.nextId++, name, x, y, dir);
    this.events.push('build', e.cx, e.cy, { id: e.id, w: e.w, h: e.h });
    return e;
  }

  /** Legt ein Gebäude mit fester ID an (auch beim Laden). */
  create(id: number, name: string, x: number, y: number, dir: Dir): Entity {
    const def = entityDef(name);
    const e = new ENTITY_CLASSES[def.kind](id, name, x, y, dir) as Entity;
    this.entities.set(id, e);
    for (const [tx, ty] of World.footprint(def, x, y, dir)) this.occupancy.set(tileKey(tx, ty), id);
    for (const v of Object.values(e)) if (v instanceof Burner) v.onBurn = (item) => this.stats.used(item, 1);
    e.onCreated(this);
    this.ghosts.onBuilt(e);
    if (id >= this.nextId) this.nextId = id + 1;
    this.structureVersion++;
    return e;
  }

  rotate(id: number, dir: Dir): boolean {
    const e = this.entities.get(id);
    if (!e || !entityDef(e.name).rotatable) return false;
    if (e.kind === 'underground') {
      e.flip();
      this.structureVersion++;
      return true;
    }
    if (e.def.width !== e.def.height) return false; // nicht quadratisch: zum Drehen neu bauen
    e.dir = dir;
    if (e.kind === 'belt') this.belts.setDir(id, dir);
    this.structureVersion++;
    return true;
  }

  /** Entfernt ein Gebäude und liefert alle Items (inkl. Gebäude-Item und Bandinhalt). */
  remove(id: number): { item: string; count: number }[] {
    const e = this.entities.get(id);
    if (!e) return [];
    const def = entityDef(e.name);
    const out: { item: string; count: number }[] = [{ item: def.item, count: def.itemCount ?? 1 }];
    if (e.kind === 'belt' || e.kind === 'underground') {
      for (const idx of this.belts.remove(id)) out.push({ item: itemId(idx), count: 1 });
    } else if (e.kind === 'splitter') {
      for (const hid of e.halfIds) for (const idx of this.belts.remove(hid)) out.push({ item: itemId(idx), count: 1 });
    } else out.push(...e.contents());
    e.onRemoved(this);
    this.entities.delete(id);
    for (const [tx, ty] of World.footprint(def, e.x, e.y, e.dir)) this.occupancy.delete(tileKey(tx, ty));
    this.structureVersion++;
    return out;
  }

  // ------------------------------------------------------------ Simulation

  /** Tageszeit 0..1 (0 = Mittag). */
  get daytime(): number {
    return (this.tick % DAY.ticks) / DAY.ticks;
  }
  /** Dunkelheit 0 (Tag) … 1 (Nacht). */
  get darkness(): number {
    return darknessAt(this.daytime);
  }

  step(): void {
    this.fluids.ensure(this);
    this.power.ensure(this);
    this.beacons.ensure(this);
    this.power.update(1 - this.darkness);
    // Bänder mit Schaltbedingung (Wiki „Transport belt“: Bedingung aktivieren/deaktivieren) halten einzeln an
    const stop = new Set<number>();
    for (const [id, c] of this.circuit.conditions) if (c.first && this.belts.tileById(id)) stop.add(id);
    this.belts.setStoppers(stop);
    this.belts.ensure();
    // Halte-Zustand aus dem Vortick (Schaltungswerte entstehen erst in circuit.update, ein Tick Verzögerung)
    for (const id of stop) {
      const t = this.belts.tileById(id);
      if (t?.line) t.line.stopped = this.beltStopped.has(id);
    }
    this.belts.update();
    this.circuit.update(this);
    this.beltStopped.clear();
    for (const id of stop) if (!this.circuit.enabled(id)) this.beltStopped.add(id);
    this.trains.update(this);
    this.heat.prepare(this);
    for (const e of this.entities.values()) e.update(this);
    this.heat.update();
    this.robots.update(this);
    // Fundorte vor den Zombies anlegen (Zombies lungern um Häuser und Wracks)
    if (this.tick % 60 === 0 && this._player && this.settings.sites) {
      const p = this._player;
      this.sites.ensureArea(this, p.x - 130, p.y - 130, p.x + 130, p.y + 130);
    }
    this.enemies.update(this);
    this.capsules.update(this);
    this.player?.update(this);
    this.noise.update(this);
    this.chart.update(this);
    this.tick++;
    if (this.tick % 60 === 0) {
      this.stats.second(this.tick / 60);
      this.power.second(this.tick / 60);
    }
  }

  /** Schaden an einem Gebäude; bei 0 Lebenspunkten wird es zerstört (Inhalt geht verloren, wie im Original). */
  damageEntity(e: Entity, dmg: number, quiet = false): void {
    e.hp -= dmg;
    if (!quiet) this.events.push('hit', e.cx, e.cy);
    if (e.hp > 0) return;
    if (!quiet) {
      this.events.push('explode', e.cx, e.cy);
      this.enemies.remnants.push({ x: e.cx, y: e.cy, kind: 'building', size: Math.max(e.w, e.h), tick: this.tick, name: e.name, dir: e.dir });
    }
    this.stats.used(`lost.${e.name}`, 1);
    this.remove(e.id);
  }

  /** Herstellung melden: Statistik und Auslöser-Forschung. */
  crafted(item: string, n: number): void {
    this.stats.made(item, n);
    this.research.onCrafted(item, n);
  }

  run(ticks: number): void {
    for (let i = 0; i < ticks; i++) this.step();
  }

  /**
   * Item an einen Weltpunkt abgeben: Band (an der Stelle), Gebäude oder – wenn erlaubt – freier Boden.
   */
  deliverAt(px: number, py: number, item: string, mode: InsertMode, allowGround: boolean, from?: { dir: Dir }): boolean {
    const tx = Math.floor(px);
    const ty = Math.floor(py);
    const target0 = this.entityAt(tx, ty);
    const target = target0?.kind === 'rail' ? undefined : target0;
    if (!target) {
      // stehender Zug: Greifarm belädt Wagen bzw. betankt die Lokomotive
      const veh = this.trains.vehicleAt(px, py);
      if (veh) return veh.train.speed === 0 && veh.vehicle.inv.add(item, 1) === 1;
      return allowGround ? this.dropGround(px, py, item) : false;
    }
    const bt = this.belts.tileAt(tx, ty);
    if (bt) return this.belts.insertAtPoint(bt, px - tx, py - ty, itemIndex(item), from ? BeltSystem.inserterDropLane(bt, from.dir) : undefined);
    return target.insert(item, 1, mode) === 1;
  }

  /** Nimmt ein passendes Item vom Feld an einem Weltpunkt: Band, Gebäude oder Boden. */
  takeAt(px: number, py: number, accept: (item: string) => boolean, from?: { dir: Dir; targetKind?: string }): string | null {
    const src0 = this.entityAt(px, py);
    const src = src0?.kind === 'rail' ? undefined : src0;
    if (!src) {
      const veh = this.trains.vehicleAt(px, py);
      if (veh) {
        if (veh.train.speed !== 0 || veh.vehicle.kind !== 'cargo-wagon') return null;
        const it = veh.vehicle.inv.firstItem(accept);
        if (it) veh.vehicle.inv.remove(it, 1);
        return it ?? null;
      }
      return this.takeGround(Math.floor(px), Math.floor(py), accept);
    }
    const t = this.belts.tileAt(Math.floor(px), Math.floor(py));
    if (t) {
      const idx = this.belts.takeFromTile(t, (i) => accept(itemId(i)), from ? BeltSystem.inserterPickupLanes(t, from.dir) : undefined);
      return idx < 0 ? null : itemId(idx);
    }
    return src.take(this, accept, from);
  }

  /** Für Renderer und Tests. */
  drillOutputPoint(e: DrillEntity): [number, number] {
    return e.outputPoint();
  }

  // ------------------------------------------------------------ Items auf dem Boden

  /** Legt ein Item auf freien Boden, wenn die Stelle frei ist. */
  dropGround(px: number, py: number, item: string): boolean {
    const tx = Math.floor(px);
    const ty = Math.floor(py);
    if (this.map.isBlocked(tx, ty) || this.entityAt(tx, ty)) return false;
    const k = tileKey(tx, ty);
    const list = this.ground.get(k) ?? [];
    const x = Math.round(px * 256);
    const y = Math.round(py * 256);
    const min = GROUND_SPACING * 256;
    if (list.some((g) => Math.abs(g.x - x) < min && Math.abs(g.y - y) < min)) return false;
    list.push({ item, x, y });
    this.ground.set(k, list);
    return true;
  }

  /** Item in der Nähe auf den Boden legen: freie Stelle spiralförmig um (px, py) suchen (wie Ausschütten im Original). */
  spill(px: number, py: number, item: string): boolean {
    const step = GROUND_SPACING;
    for (let ring = 0; ring < 40; ring++) {
      if (ring === 0) {
        if (this.dropGround(px, py, item)) return true;
        continue;
      }
      for (let i = -ring; i <= ring; i++) {
        for (const [dx, dy] of [[i, -ring], [i, ring], [-ring, i], [ring, i]] as const) {
          if (this.dropGround(px + dx * step, py + dy * step, item)) return true;
        }
      }
    }
    return false;
  }

  takeGround(tx: number, ty: number, accept: (item: string) => boolean = () => true): string | null {
    const k = tileKey(tx, ty);
    const list = this.ground.get(k);
    if (!list) return null;
    const i = list.findIndex((g) => accept(g.item));
    if (i < 0) return null;
    const [g] = list.splice(i, 1);
    if (!list.length) this.ground.delete(k);
    return g.item;
  }

  /** Alle Bodenitems im Umkreis (für Spieler-Aufheben). */
  groundNear(x: number, y: number, r: number): { key: number; g: GroundItem }[] {
    const out: { key: number; g: GroundItem }[] = [];
    for (let ty = Math.floor(y - r); ty <= Math.floor(y + r); ty++)
      for (let tx = Math.floor(x - r); tx <= Math.floor(x + r); tx++) {
        const k = tileKey(tx, ty);
        for (const g of this.ground.get(k) ?? []) {
          if (Math.hypot(g.x / 256 - x, g.y / 256 - y) <= r) out.push({ key: k, g });
        }
      }
    return out;
  }

  removeGround(key: number, g: GroundItem): void {
    const list = this.ground.get(key);
    if (!list) return;
    const i = list.indexOf(g);
    if (i >= 0) list.splice(i, 1);
    if (!list.length) this.ground.delete(key);
  }
}
