import type { InserterDef } from '../../data/entities';
import { isFuel } from '../../data/items';
import { wattsToJoulesPerTick } from '../../data/time';
import { Burner } from '../burner';
import { ElectricSource } from '../energy';
import { Status } from '../entity';
import { type Dir, rotateVec } from '../geom';
import type { Stack } from '../inventory';
import type { World } from '../world';
import { type EnergySource, EntityBase, type GuiSlots, type InsertMode, invContents } from './base';

export enum InserterPhase {
  WaitPickup = 0,
  ToDrop = 1,
  WaitDrop = 2,
  ToPickup = 3,
}

/** Winkeleinheiten: 1000 = volle Umdrehung, halbe Drehung = 500. */
export const HALF_TURN = 500;

/**
 * Greifarm: nimmt vom Feld hinter sich (Gebäude, Band oder Boden) und legt vor sich ab.
 * Energie je Halbdrehung; Brennstoff-Greifarme versorgen sich selbst mit Brennstoff.
 */
export class InserterEntity extends EntityBase {
  readonly kind = 'inserter' as const;
  declare readonly def: InserterDef;
  readonly energy: EnergySource;
  phase = InserterPhase.WaitPickup;
  /** Fortschritt der aktuellen Halbdrehung in Ticks. */
  progress = 0;
  held: string | null = null;
  /** Anzahl gegriffener Items (Kapazität: 1 bzw. Massengreifarm 2, plus Forschung „Greifarm-Kapazität“). */
  heldCount = 0;
  /** Filter (Wiki 2.0: schneller Greifarm und Massengreifarm): Items der Liste; leer = kein Filter. */
  filters: (string | null)[] = [];
  /** Negativliste: alles außer den Filter-Items. */
  filterBlacklist = false;
  /** Art des Ablageziels (für das Weiterreichen zwischen Laboren). */
  targetKind: string | undefined;

  constructor(id: number, name: string, x: number, y: number, dir: Dir, energy?: EnergySource) {
    super(id, name, x, y, dir);
    if (energy) this.energy = energy;
    else if (this.def.energy === 'electric') {
      const half = Math.round(this.def.energyPerTransfer / 2);
      this.energy = new ElectricSource(half, wattsToJoulesPerTick(this.def.drain), Math.round(half * 1.5));
    } else this.energy = new Burner(this.def.fuelSlots, this.def.initialEnergy);
  }
  override get burner(): Burner | null {
    return this.energy instanceof Burner ? this.energy : null;
  }
  /** Ticks je Halbdrehung (ganzzahlig wie im Original). */
  get halfTurnTicks(): number {
    return this.def.halfTurnTicks;
  }
  /** Für die Darstellung: Fortschritt je Tick in Tausendstel-Umdrehungen. */
  get turnPerTick(): number {
    return HALF_TURN / this.def.halfTurnTicks;
  }
  /** Wie viele Items der Arm auf einmal greift. */
  stackSize(w: World): number {
    return this.def.bulk ? 2 + w.research.bonus('bulk-stack') : 1 + w.research.bonus('inserter-stack');
  }
  /** Lässt der Filter dieses Item durch? */
  filterOk(item: string): boolean {
    if (!this.def.filterSlots) return true;
    const set = this.filters.filter((f): f is string => !!f);
    if (!set.length) return true;
    return this.filterBlacklist ? !set.includes(item) : set.includes(item);
  }
  get halfSwingEnergy(): number {
    return Math.round(this.def.energyPerTransfer / 2);
  }
  armT(): number {
    const n = this.def.halfTurnTicks;
    switch (this.phase) {
      case InserterPhase.WaitPickup: return 0;
      case InserterPhase.ToDrop: return this.progress / n;
      case InserterPhase.WaitDrop: return 1;
      case InserterPhase.ToPickup: return 1 - this.progress / n;
    }
  }
  points(): { pickup: [number, number]; drop: [number, number] } {
    const [px, py] = rotateVec(this.def.pickupVector[0], this.def.pickupVector[1], this.dir);
    const [dx, dy] = rotateVec(this.def.dropVector[0], this.def.dropVector[1], this.dir);
    return { pickup: [this.cx + px, this.cy + py], drop: [this.cx + dx, this.cy + dy] };
  }

  /**
   * Ablauf je Tick: drehen (1 Schritt je Tick) bis zur Halbdrehung, dann im nächsten Tick aufnehmen bzw. ablegen
   * und im selben Tick den ersten Schritt zurück. Ergibt 2 × halfTurnTicks Ticks je Zyklus (Wiki: 76/70/48).
   */
  override update(w: World): void {
    const { pickup, drop } = this.points();
    const dst = w.entityAt(drop[0], drop[1]);
    // Ziel: Gebäude (außer Greifarm) oder freier Boden
    const groundTarget = !dst && !w.map.isBlocked(Math.floor(drop[0]), Math.floor(drop[1]));
    this.targetKind = dst?.kind;
    const half = this.halfSwingEnergy;
    const burner = this.burner;
    const n = this.def.halfTurnTicks;
    switch (this.phase) {
      case InserterPhase.WaitPickup: {
        if ((!dst && !groundTarget) || dst?.kind === 'inserter') {
          this.status = Status.NoTarget;
          return;
        }
        // Selbstversorgung: leerer Brennstoffslot -> eigenen Brennstoff greifen
        if (burner && burner.fuel.isEmpty()) {
          const fuel = w.takeAt(pickup[0], pickup[1], (it) => isFuel(it), this);
          if (fuel) {
            burner.fuel.add(fuel, 1);
            this.status = Status.Working;
            return;
          }
        }
        if (!this.energy.canSupply(half)) {
          this.status = this.energy.type === 'electric' ? Status.NoPower : Status.NoFuel;
          return;
        }
        const onBelt = !!w.belts.tileAt(Math.floor(drop[0]), Math.floor(drop[1]));
        const toBuilding = !!dst && !onBelt;
        const accept = toBuilding ? (it: string) => this.filterOk(it) && dst.acceptAmount(it, 'inserter') > 0 : (it: string) => this.filterOk(it);
        const item = w.takeAt(pickup[0], pickup[1], accept, this);
        if (!item) {
          this.status = Status.NoInput;
          return;
        }
        // Stapel: so viele gleiche Items wie Kapazität und Ziel zulassen (Wiki „Inserter capacity bonus“)
        let count = 1;
        const cap = Math.min(this.stackSize(w), toBuilding ? dst.acceptAmount(item, 'inserter') : Infinity);
        while (count < cap && w.takeAt(pickup[0], pickup[1], (it) => it === item, this)) count++;
        this.energy.consume(half);
        this.held = item;
        this.heldCount = count;
        this.phase = InserterPhase.ToDrop;
        this.progress = 1;
        this.status = Status.Working;
        return;
      }
      case InserterPhase.ToDrop:
      case InserterPhase.ToPickup: {
        this.progress++;
        if (this.progress >= n) {
          this.progress = 0;
          this.phase = this.phase === InserterPhase.ToDrop ? InserterPhase.WaitDrop : InserterPhase.WaitPickup;
        }
        return;
      }
      case InserterPhase.WaitDrop: {
        if (this.held) {
          if (!dst && !groundTarget) {
            this.status = Status.NoTarget;
            return;
          }
          // In Gebäude alles in einem Tick, auf Band und Boden ein Item je Tick (Wiki „Inserter capacity bonus“)
          const onBelt = !!w.belts.tileAt(Math.floor(drop[0]), Math.floor(drop[1]));
          const perTick = dst && !onBelt ? this.heldCount : 1;
          let moved = 0;
          while (moved < perTick && this.heldCount > 0 && w.deliverAt(drop[0], drop[1], this.held, 'inserter', true, this)) {
            this.heldCount--;
            moved++;
          }
          if (this.heldCount > 0) {
            this.status = moved ? Status.Working : Status.OutputBlocked;
            return;
          }
          this.held = null;
        }
        if (!this.energy.consume(half)) {
          this.status = this.energy.type === 'electric' ? Status.NoPower : Status.NoFuel;
          return;
        }
        this.status = Status.Working;
        this.phase = InserterPhase.ToPickup;
        this.progress = 1;
        return;
      }
    }
  }

  override acceptAmount(item: string, mode: InsertMode): number {
    const b = this.burner;
    return b && mode === 'player' && isFuel(item) ? b.fuel.space(item) : 0;
  }
  protected override doInsert(item: string, n: number): number {
    return this.burner?.fuel.add(item, n) ?? 0;
  }
  override contents(): Stack[] {
    const b = this.burner;
    const out = b ? invContents(b.fuel) : [];
    if (this.held) out.push({ item: this.held, count: Math.max(1, this.heldCount) });
    return out;
  }
  override guiSlots(): GuiSlots[] {
    const b = this.burner;
    return b ? [{ label: 'Brennstoff', inv: b.fuel }] : [];
  }
  override save() {
    const en = this.energy instanceof ElectricSource ? this.energy.serialize() : { b: this.burner?.serialize() };
    return {
      ...en, phase: this.phase, progress: this.progress, held: this.held,
      ...(this.heldCount > 1 ? { hc: this.heldCount } : {}),
      ...(this.filters.some((f) => f) ? { f: this.filters, fb: this.filterBlacklist } : {}),
    };
  }
  override load(d: Record<string, unknown>): void {
    if (d.b && this.burner) this.burner.load(d.b as ReturnType<Burner['serialize']>);
    if (this.energy instanceof ElectricSource) this.energy.load(d as { eb: number });
    this.phase = d.phase as InserterPhase;
    this.progress = d.progress as number;
    this.held = (d.held as string | null) ?? null;
    this.heldCount = this.held ? ((d.hc as number | undefined) ?? 1) : 0;
    this.filters = (d.f as (string | null)[] | undefined) ?? [];
    this.filterBlacklist = !!d.fb;
  }
}
