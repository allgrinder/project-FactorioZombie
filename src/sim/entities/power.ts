import type { AccumulatorDef, BoilerDef, GeneratorDef, PipeDef, PumpDef, SolarDef } from '../../data/entities';
import { FLUIDS, FLUID_UNIT, steamEnergyPerUnit } from '../../data/fluids';
import { wattsToJoulesPerTick } from '../../data/time';
import { Burner } from '../burner';
import { Status } from '../entity';
import { type Dir, rotCW } from '../geom';
import type { Stack } from '../inventory';
import { FluidBox, type FluidHolder, type FluidPort } from '../fluids';
import type { Generator } from '../power';
import type { World } from '../world';
import { EntityBase, type GuiSlots, type InsertMode, invContents } from './base';
import { fuelAccept } from './basic';

/** Lokales Feld (für Richtung Nord, Größe w×h) in die gedrehte Grundfläche umrechnen. */
export function rotateLocal(lx: number, ly: number, w: number, h: number, dir: Dir): [number, number] {
  switch (dir) {
    case 0: return [lx, ly];
    case 1: return [h - 1 - ly, lx];
    case 2: return [w - 1 - lx, h - 1 - ly];
    case 3: return [ly, w - 1 - lx];
  }
}

export function boxData(b: FluidBox): [number, string | null] {
  return [b.amount, b.fluid];
}
export function loadBox(b: FluidBox, d: unknown): void {
  if (!Array.isArray(d)) return;
  b.amount = d[0] as number;
  b.fluid = d[1] as string | null;
}

// ------------------------------------------------------------------------- Rohr

export class PipeEntity extends EntityBase implements FluidHolder {
  readonly kind = 'pipe' as const;
  declare readonly def: PipeDef;
  readonly box: FluidBox;
  constructor(id: number, name: string, x: number, y: number, dir: Dir) {
    super(id, name, x, y, dir);
    this.box = new FluidBox(this.def.capacity * FLUID_UNIT, null);
  }
  fluidBoxes(): FluidBox[] {
    return [this.box];
  }
  fluidPorts(): FluidPort[] {
    return ([0, 1, 2, 3] as Dir[]).map((dir) => ({ box: this.box, tx: this.x, ty: this.y, dir }));
  }
  override save() {
    return { fb: boxData(this.box) };
  }
  override load(d: Record<string, unknown>): void {
    loadBox(this.box, d.fb);
  }
}

// ------------------------------------------------------------------------- Uferpumpe

export class PumpEntity extends EntityBase implements FluidHolder {
  readonly kind = 'offshore-pump' as const;
  declare readonly def: PumpDef;
  readonly box: FluidBox;
  workTicks = 0;
  constructor(id: number, name: string, x: number, y: number, dir: Dir) {
    super(id, name, x, y, dir);
    this.box = new FluidBox(this.def.capacity * FLUID_UNIT, this.def.fluid);
  }
  fluidBoxes(): FluidBox[] {
    return [this.box];
  }
  /** Vorderes Feld (an Land, Ausgang) und hinteres Feld (im Wasser, Ansaugung). */
  private tiles() {
    const x = this.x;
    const y = this.y;
    switch (this.dir) {
      case 0: return { front: [x, y], back: [x, y + 1] };
      case 1: return { front: [x + 1, y], back: [x, y] };
      case 2: return { front: [x, y + 1], back: [x, y] };
      default: return { front: [x, y], back: [x + 1, y] };
    }
  }
  fluidPorts(): FluidPort[] {
    const [tx, ty] = this.tiles().front;
    return [{ box: this.box, tx, ty, dir: this.dir }];
  }
  /** Feld, aus dem gepumpt wird (hinteres Feld im Wasser). */
  waterTile(): [number, number] {
    return this.tiles().back as [number, number];
  }
  override update(w: World): void {
    const net = this.box.net;
    const [wx, wy] = this.waterTile();
    if (!net || !w.map.isWater(wx, wy)) {
      this.status = Status.NoInput;
      return;
    }
    const n = net.add(this.def.fluid, this.def.pumpingSpeed * FLUID_UNIT);
    w.stats.made(this.def.fluid, n / FLUID_UNIT);
    // volle Leitung ist der Normalfall (1 Pumpe reicht für 20 Kessel): Leerlauf, kein Fehler
    this.status = n > 0 ? Status.Working : Status.Idle;
    if (n > 0) this.workTicks++;
  }
  override save() {
    return { fb: boxData(this.box), work: this.workTicks };
  }
  override load(d: Record<string, unknown>): void {
    loadBox(this.box, d.fb);
    this.workTicks = (d.work as number) ?? 0;
  }
}

// ------------------------------------------------------------------------- Kessel

export class BoilerEntity extends EntityBase implements FluidHolder {
  readonly kind = 'boiler' as const;
  declare readonly def: BoilerDef;
  readonly water: FluidBox;
  readonly steam: FluidBox;
  private readonly fuelSource: Burner;
  workTicks = 0;
  constructor(id: number, name: string, x: number, y: number, dir: Dir) {
    super(id, name, x, y, dir);
    this.water = new FluidBox(this.def.capacity * FLUID_UNIT, this.def.inputFluid);
    this.steam = new FluidBox(this.def.capacity * FLUID_UNIT, this.def.outputFluid);
    this.fuelSource = new Burner(this.def.fuelSlots);
  }
  override get burner(): Burner {
    return this.fuelSource;
  }
  get joulesPerTick(): number {
    return wattsToJoulesPerTick(this.def.energyUsage);
  }
  /** Dampf pro Tick bei voller Leistung (Tausendstel Einheiten). */
  get steamPerTick(): number {
    return Math.round((this.joulesPerTick * FLUID_UNIT) / steamEnergyPerUnit(this.def.targetTemperature));
  }
  fluidBoxes(): FluidBox[] {
    return [this.water, this.steam];
  }
  fluidPorts(): FluidPort[] {
    const { width: w, height: h } = this.def;
    const port = (box: FluidBox, lx: number, ly: number, d: Dir): FluidPort => {
      const [rx, ry] = rotateLocal(lx, ly, w, h, this.dir);
      return { box, tx: this.x + rx, ty: this.y + ry, dir: rotCW(d, this.dir) };
    };
    // Richtung Nord: Dampf oben Mitte, Wasser an beiden Schmalseiten unten
    return [port(this.steam, 1, 0, 0), port(this.water, 0, 1, 3), port(this.water, w - 1, 1, 1)];
  }
  override update(w: World): void {
    const wn = this.water.net;
    const sn = this.steam.net;
    // wie im Original: der Kessel erzeugt nur so viel Dampf, wie abgenommen wird (Rest der Leistung ruht)
    const full = this.steamPerTick;
    const amt = sn ? Math.min(full, sn.space(this.def.outputFluid)) : 0;
    const water = Math.ceil(amt / this.def.steamPerWater);
    if (!wn || wn.fluid !== this.def.inputFluid || wn.amount < Math.max(1, water)) {
      this.status = Status.NoInput;
      return;
    }
    if (!sn || amt <= 0) {
      // Dampf steht an, aber niemand braucht Strom: kein Fehler, nur Leerlauf
      this.status = this.fuelSource.canSupply(1) ? Status.Idle : Status.NoFuel;
      return;
    }
    if (!this.fuelSource.consume(Math.ceil((this.joulesPerTick * amt) / full))) {
      this.status = Status.NoFuel;
      return;
    }
    wn.take(this.def.inputFluid, water);
    sn.add(this.def.outputFluid, amt);
    w.stats.used(this.def.inputFluid, water / FLUID_UNIT);
    w.stats.made(this.def.outputFluid, amt / FLUID_UNIT);
    this.status = Status.Working;
    this.workTicks++;
  }
  override acceptAmount(item: string, mode: InsertMode): number {
    return fuelAccept(this.fuelSource, item, mode);
  }
  protected override doInsert(item: string, n: number): number {
    return this.fuelSource.fuel.add(item, n);
  }
  override contents(): Stack[] {
    return invContents(this.fuelSource.fuel);
  }
  override guiSlots(): GuiSlots[] {
    return [{ label: 'Brennstoff', inv: this.fuelSource.fuel }];
  }
  override save() {
    return { b: this.fuelSource.serialize(), w: boxData(this.water), s: boxData(this.steam), work: this.workTicks };
  }
  override load(d: Record<string, unknown>): void {
    this.fuelSource.load(d.b as ReturnType<Burner['serialize']>);
    loadBox(this.water, d.w);
    loadBox(this.steam, d.s);
    this.workTicks = (d.work as number) ?? 0;
  }
}

// ------------------------------------------------------------------------- Dampfmaschine

export class GeneratorEntity extends EntityBase implements FluidHolder, Generator {
  readonly kind = 'generator' as const;
  declare readonly def: GeneratorDef;
  readonly box: FluidBox;
  /** Erzeugte Energie im letzten Tick (J) für Anzeige und Animation. */
  lastOutput = 0;
  /** Leistung des letzten Ticks (J/Tick) für die Anzeige (nicht gespeichert). */
  shownOutput = 0;
  workTicks = 0;
  constructor(id: number, name: string, x: number, y: number, dir: Dir) {
    super(id, name, x, y, dir);
    this.box = new FluidBox(this.def.capacity * FLUID_UNIT, this.def.fluid);
  }
  /** Energie je Tausendstel Einheit Dampf (J). */
  get energyPerMilli(): number {
    return steamEnergyPerUnit(FLUIDS.steam.defaultTemperature) / FLUID_UNIT;
  }
  get maxPerTick(): number {
    return wattsToJoulesPerTick(this.def.maxPower);
  }
  fluidBoxes(): FluidBox[] {
    return [this.box];
  }
  fluidPorts(): FluidPort[] {
    const { width: w, height: h } = this.def;
    const port = (lx: number, ly: number, d: Dir): FluidPort => {
      const [rx, ry] = rotateLocal(lx, ly, w, h, this.dir);
      return { box: this.box, tx: this.x + rx, ty: this.y + ry, dir: rotCW(d, this.dir) };
    };
    return [port(1, 0, 0), port(1, h - 1, 2)];
  }
  potential(): number {
    const net = this.box.net;
    if (!net || net.fluid !== this.def.fluid) return 0;
    return Math.min(this.maxPerTick, Math.floor(net.amount * this.energyPerMilli));
  }
  produce(joules: number): void {
    const net = this.box.net;
    if (!net) return;
    this.lastSteam = net.take(this.def.fluid, Math.ceil(joules / this.energyPerMilli));
    this.lastOutput = joules;
  }
  /** Im letzten Tick verbrauchter Dampf (Tausendstel Einheiten). */
  private lastSteam = 0;
  override update(w: World): void {
    if (this.lastSteam > 0) w.stats.used(this.def.fluid, this.lastSteam / FLUID_UNIT);
    this.lastSteam = 0;
    this.shownOutput = this.lastOutput;
    if (this.lastOutput > 0) {
      this.status = Status.Working;
      this.workTicks++;
    } else this.status = this.box.net?.amount ? Status.Idle : Status.NoInput;
    this.lastOutput = 0;
  }
  override save() {
    return { fb: boxData(this.box), work: this.workTicks };
  }
  override load(d: Record<string, unknown>): void {
    loadBox(this.box, d.fb);
    this.workTicks = (d.work as number) ?? 0;
  }
}

// ------------------------------------------------------------------------- Strommast

export class PoleEntity extends EntityBase {
  readonly kind = 'pole' as const;
}

// ------------------------------------------------------------------------- Solarpanel

/** Solarpanel: liefert Höchstleistung × Tageslicht (1 − Dunkelheit); Vorrang vor Dampfmaschinen. */
export class SolarEntity extends EntityBase implements Generator {
  readonly kind = 'solar' as const;
  declare readonly def: SolarDef;
  readonly priority = 'primary' as const;
  /** Tageslicht 0..1, vom Stromnetz je Tick gesetzt. */
  light = 1;
  lastOutput = 0;
  potential(): number {
    return Math.floor(wattsToJoulesPerTick(this.def.production) * this.light);
  }
  produce(joules: number): void {
    this.lastOutput = joules;
  }
  override update(): void {
    this.status = this.lastOutput > 0 ? Status.Working : Status.Idle;
    this.lastOutput = 0;
  }
}

// ------------------------------------------------------------------------- Akkumulator

/** Akkumulator: Speicher, den das Netz aus Überschuss lädt und bei Mangel entlädt (Vorrang nach Erzeugern). */
export class AccumulatorEntity extends EntityBase {
  readonly kind = 'accumulator' as const;
  declare readonly def: AccumulatorDef;
  /** Gespeicherte Energie (J). */
  stored = 0;
  /** Letzter Tick: + geladen, − entladen (J). */
  lastFlow = 0;
  /** Höchstens ladbar in diesem Tick (J). */
  chargeRoom(): number {
    return Math.min(wattsToJoulesPerTick(this.def.inputFlow), this.def.buffer - this.stored);
  }
  /** Höchstens entnehmbar in diesem Tick (J). */
  dischargeMax(): number {
    return Math.min(wattsToJoulesPerTick(this.def.outputFlow), this.stored);
  }
  charge(j: number): void {
    this.stored = Math.min(this.def.buffer, this.stored + j);
    this.lastFlow = j;
  }
  discharge(j: number): void {
    this.stored = Math.max(0, this.stored - j);
    this.lastFlow = -j;
  }
  get fraction(): number {
    return this.stored / this.def.buffer;
  }
  override update(): void {
    this.status = this.lastFlow !== 0 ? Status.Working : Status.Idle;
    this.lastFlow = 0;
  }
  override save() {
    return { st: this.stored };
  }
  override load(d: Record<string, unknown>): void {
    this.stored = (d.st as number) ?? 0;
  }
}
