import type { BedDef, CampDef, FireDef, HazardDef, LootDef, PileDef, ProducerDef, PropDef, RadioDef } from '../../data/entities';
import { DAY } from '../../data/time';
import { CONSUMABLES } from '../../data/survival';
import { Burner } from '../burner';
import { fuelAccept } from './basic';
import { PILES } from '../../data/scavenge';
import { LOOT, LOOT_TABLES } from '../../data/loot';
import { secondsToTicks, wattsToJoulesPerTick } from '../../data/time';
import { ElectricSource } from '../energy';
import { Status } from '../entity';
import type { Dir } from '../geom';
import { type InvData, Inventory, type Stack } from '../inventory';
import { hash01 } from '../rng';
import type { World } from '../world';
import { EntityBase, type GuiSlots, type InsertMode, invContents } from './base';

/**
 * Fundort der alten Welt (Autowrack, Haus, Kiste): Beute nach Tabelle, deterministisch aus Karten-Seed und Lage.
 * Der Inhalt ist erst nach dem Durchsuchen sichtbar (Player.search); Greifarme kommen nicht heran.
 * Ausschlachten (Abbauen) liefert Schrott und Baustoffe.
 */
export class LootEntity extends EntityBase {
  readonly kind = 'loot' as const;
  declare readonly def: LootDef;
  readonly inventory: Inventory;
  searched = false;
  /** Fortschritt des Durchsuchens (Ticks). */
  searchProgress = 0;
  constructor(id: number, name: string, x: number, y: number, dir: Dir) {
    super(id, name, x, y, dir);
    this.inventory = new Inventory(this.def.slots);
  }
  get searchTicks(): number {
    return secondsToTicks(this.def.searchTime);
  }
  override onCreated(w: World): void {
    const rows = LOOT_TABLES[this.def.table] ?? [];
    const far = 1 + (LOOT.farBoost - 1) * Math.min(1, Math.hypot(this.cx, this.cy) / LOOT.farAt);
    rows.forEach((r, i) => {
      const chance = r.rare ? Math.min(0.95, r.chance * far) : r.chance;
      if (hash01(w.seed, this.x, this.y, 900 + i) >= chance) return;
      const n = r.min + Math.floor(hash01(w.seed, this.x, this.y, 950 + i) * (r.max - r.min + 1));
      this.inventory.add(r.item, n);
    });
  }
  override contents(): Stack[] {
    const out = invContents(this.inventory);
    for (const s of this.def.salvage) out.push({ item: s.item, count: s.amount });
    return out;
  }
  override guiSlots(): GuiSlots[] {
    return this.searched ? [{ label: 'Fundstücke', inv: this.inventory }] : [];
  }
  override save() {
    return { inv: this.inventory.serialize(), ...(this.searched ? { se: 1 } : this.searchProgress ? { sp: this.searchProgress } : {}) };
  }
  override load(d: Record<string, unknown>): void {
    this.inventory.load(d.inv as InvData);
    this.searched = !!d.se;
    this.searchProgress = (d.sp as number) ?? 0;
  }
}

/** Stacheldraht und Nagelfalle: Wirkung in EnemySystem.move (Zombie steht auf dem Feld). */
export class HazardEntity extends EntityBase {
  declare readonly def: HazardDef;
  get kind(): 'wire' | 'trap' {
    return this.def.kind;
  }
}

/** Feldbett: Schlafplatz (Player.sleep). */
export class BedEntity extends EntityBase {
  readonly kind = 'bed' as const;
  declare readonly def: BedDef;
}

/**
 * Erzeuger ohne Strom: Gemüsebeet (wächst bei Tageslicht), Regentonne (füllt leere Flaschen).
 * Greifarme können den Ertrag entnehmen und (Regentonne) leere Flaschen einlegen.
 */
export class ProducerEntity extends EntityBase {
  readonly kind = 'producer' as const;
  declare readonly def: ProducerDef;
  readonly out: Inventory;
  readonly input: Inventory | null;
  progress = 0;
  constructor(id: number, name: string, x: number, y: number, dir: Dir) {
    super(id, name, x, y, dir);
    this.out = new Inventory(1, (it) => it === this.def.product);
    this.input = this.def.consumes ? new Inventory(1, (it) => it === this.def.consumes) : null;
  }
  get totalTicks(): number {
    return secondsToTicks(this.def.interval);
  }
  override update(w: World): void {
    if (this.out.count(this.def.product) >= this.def.capacity) {
      this.status = Status.OutputBlocked;
      return;
    }
    if (this.input && this.input.count(this.def.consumes!) < 1) {
      this.status = Status.NoInput;
      return;
    }
    if (this.def.daylight && w.darkness > 0.5) {
      this.status = Status.Idle;
      return;
    }
    this.status = Status.Working;
    if (++this.progress < this.totalTicks) return;
    this.progress = 0;
    if (this.input) {
      this.input.remove(this.def.consumes!, 1);
      w.stats.used(this.def.consumes!, 1);
    }
    this.out.add(this.def.product, 1);
    w.crafted(this.def.product, 1);
  }
  override acceptAmount(item: string, _mode: InsertMode): number {
    return this.input && item === this.def.consumes ? this.input.space(item) : 0;
  }
  protected override doInsert(item: string, n: number): number {
    return this.input!.add(item, n);
  }
  override take(_w: World, accept: (item: string) => boolean): string | null {
    const it = this.def.product;
    if (!accept(it) || this.out.count(it) < 1) return null;
    this.out.remove(it, 1);
    return it;
  }
  override contents(): Stack[] {
    return this.input ? invContents(this.input, this.out) : invContents(this.out);
  }
  override guiSlots(): GuiSlots[] {
    const s: GuiSlots[] = [];
    if (this.input) s.push({ label: 'Leere Flaschen', inv: this.input });
    s.push({ label: 'Ertrag', inv: this.out });
    return s;
  }
  override save() {
    return { out: this.out.serialize(), ...(this.input ? { in: this.input.serialize() } : {}), pr: this.progress };
  }
  override load(d: Record<string, unknown>): void {
    this.out.load(d.out as InvData);
    if (this.input && d.in) this.input.load(d.in as InvData);
    this.progress = (d.pr as number) ?? 0;
  }
}

/**
 * Funkturm (Spielziel): sendet unter Strom den Notruf. Nach callSeconds Sendezeit trifft die Rettung ein
 * (World.rescuedAt). Im Betrieb sehr laut (NOISE_BY_ENTITY) – die Zombies der ganzen Gegend kommen.
 */
export class RadioEntity extends EntityBase {
  readonly kind = 'radio' as const;
  declare readonly def: RadioDef;
  readonly energy: ElectricSource;
  /** Gesendete Ticks. */
  sent = 0;
  constructor(id: number, name: string, x: number, y: number, dir: Dir) {
    super(id, name, x, y, dir);
    const jpt = wattsToJoulesPerTick(this.def.energyUsage);
    this.energy = new ElectricSource(jpt, 0, jpt * 2);
  }
  get totalTicks(): number {
    return secondsToTicks(this.def.callSeconds);
  }
  override update(w: World): void {
    if (w.rescuedAt !== null) {
      this.status = Status.Idle;
      return;
    }
    if (!this.energy.consume(this.energy.usagePerTick)) {
      this.status = Status.NoPower;
      return;
    }
    this.status = Status.Working;
    if (++this.sent >= this.totalTicks) {
      w.rescuedAt = w.tick;
      w.events.push('rescue', this.cx, this.cy);
      w.player?.note('Funkspruch beantwortet: Die Rettung ist unterwegs – du hast es geschafft!');
    }
  }
  override save() {
    return { ...this.energy.serialize(), sent: this.sent };
  }
  override load(d: Record<string, unknown>): void {
    this.energy.load(d as { eb: number });
    this.sent = (d.sent as number) ?? 0;
  }
}

/**
 * Schrotthaufen: enthält amount Stück; jeder Zug (Hand oder Sammler) liefert ein Stück nach der gewichteten Ausbeute,
 * deterministisch aus Karten-Seed, Lage und Restmenge. Leer verschwindet er (World.harvestPile).
 */
export class PileEntity extends EntityBase {
  readonly kind = 'pile' as const;
  declare readonly def: PileDef;
  amount = 0;
  /** Menge beim Anlegen (Darstellung: voll/halb). */
  total = 0;
  constructor(id: number, name: string, x: number, y: number, dir: Dir) {
    super(id, name, x, y, dir);
  }
  get spec() {
    return PILES[this.name];
  }
  override onCreated(w: World): void {
    if (this.total) return;
    const s = this.spec;
    this.total = this.amount = s.amountMin + Math.floor(hash01(w.seed, this.x, this.y, 977) * (s.amountMax - s.amountMin + 1));
  }
  /** Nächstes Stück (ohne es zu entnehmen). */
  peek(w: World): string {
    const ys = this.spec.yields;
    const sum = ys.reduce((a, y) => a + y.weight, 0);
    let t = hash01(w.seed, this.x * 31 + this.y, this.amount, 978) * sum;
    for (const y of ys) {
      if (t < y.weight) return y.item;
      t -= y.weight;
    }
    return ys[0].item;
  }
  override contents(): Stack[] {
    return [];
  }
  override save() {
    return { am: this.amount, to: this.total };
  }
  override load(d: Record<string, unknown>): void {
    this.amount = (d.am as number) ?? this.amount;
    this.total = (d.to as number) ?? this.total;
  }
}

/**
 * Feuer (Lagerfeuer, Feuerschale): brennt ab der Dämmerung mit Brennstoff (Holz, Kohle) und leuchtet (lightRadius).
 * Das erste Lagerfeuer ist die Mitte der Basis (World.base).
 */
export class FireEntity extends EntityBase {
  readonly kind = 'fire' as const;
  declare readonly def: FireDef;
  readonly fuel: Burner;
  workTicks = 0;
  constructor(id: number, name: string, x: number, y: number, dir: Dir) {
    super(id, name, x, y, dir);
    this.fuel = new Burner(this.def.fuelSlots);
  }
  override get burner(): Burner {
    return this.fuel;
  }
  /** Brennt gerade (leuchtet). */
  get lit(): boolean {
    return this.status === Status.Working;
  }
  override update(w: World): void {
    if (w.darkness < DAY.lampOn * 0.5) {
      this.status = Status.Idle;
      return;
    }
    if (this.fuel.consume(wattsToJoulesPerTick(this.def.energyUsage))) {
      this.status = Status.Working;
      this.workTicks++;
    } else this.status = Status.NoFuel;
  }
  override acceptAmount(item: string, mode: InsertMode): number {
    return fuelAccept(this.fuel, item, mode);
  }
  protected override doInsert(item: string, n: number): number {
    return this.fuel.fuel.add(item, n);
  }
  override contents(): Stack[] {
    return invContents(this.fuel.fuel);
  }
  override guiSlots(): GuiSlots[] {
    return [{ label: 'Brennstoff', inv: this.fuel.fuel }];
  }
  override save() {
    return { b: this.fuel.serialize(), wt: this.workTicks };
  }
  override load(d: Record<string, unknown>): void {
    if (d.b) this.fuel.load(d.b as { e: number; f: InvData });
    this.workTicks = (d.wt as number) ?? 0;
  }
}

export const isScavengerFood = (item: string): boolean => (CONSUMABLES[item]?.hunger ?? 0) > 0;

/**
 * Vorratslager der Gemeinschaft (src/sim/community.ts): Sammler und Gärtner liefern hier ab, die Bewohner essen
 * morgens aus dem Fach „Verpflegung“, Wachen nehmen Magazine, Sanitäter Verbände aus der Ausbeute. Greifarme legen
 * Essen hinein und entnehmen die Ausbeute.
 */
export class CampEntity extends EntityBase {
  readonly kind = 'camp' as const;
  declare readonly def: CampDef;
  readonly food: Inventory;
  readonly store: Inventory;
  constructor(id: number, name: string, x: number, y: number, dir: Dir) {
    super(id, name, x, y, dir);
    this.food = new Inventory(4, isScavengerFood);
    this.store = new Inventory(this.def.slots);
  }
  override update(w: World): void {
    const n = w.community.residents.length;
    this.status = n === 0 ? Status.Idle : this.food.isEmpty() && w.settings.needs ? Status.NoInput : Status.Working;
  }
  override acceptAmount(item: string, mode: InsertMode): number {
    if (isScavengerFood(item)) return this.food.space(item);
    return mode === 'inserter' ? 0 : this.store.space(item);
  }
  protected override doInsert(item: string, n: number): number {
    return isScavengerFood(item) ? this.food.add(item, n) : this.store.add(item, n);
  }
  override take(_w: World, accept: (item: string) => boolean): string | null {
    for (let i = this.store.slots.length - 1; i >= 0; i--) {
      const s = this.store.slots[i];
      if (s && accept(s.item)) {
        const it = s.item;
        this.store.remove(it, 1);
        return it;
      }
    }
    return null;
  }
  override contents(): Stack[] {
    return invContents(this.food, this.store);
  }
  override guiSlots(): GuiSlots[] {
    return [{ label: 'Verpflegung (morgens isst jeder Bewohner eins)', inv: this.food }, { label: 'Vorrat', inv: this.store }];
  }
  override save() {
    return { f: this.food.serialize(), s: this.store.serialize() };
  }
  override load(d: Record<string, unknown>): void {
    this.food.load(d.f as InvData);
    this.store.load(d.s as InvData);
  }
}

/** Requisite der alten Welt: Zaun, Mast, Schild, Heuballen. */
export class PropEntity extends EntityBase {
  readonly kind = 'prop' as const;
  declare readonly def: PropDef;
}
