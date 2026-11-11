import { AMMO, NOISE, TURRET } from '../../data/enemies';
import type { TurretDef, WallDef } from '../../data/entities';
import { Status } from '../entity';
import type { Dir } from '../geom';
import { type InvData, Inventory, type Stack } from '../inventory';
import type { World } from '../world';
import { EntityBase, type GuiSlots, type InsertMode, invContents } from './base';

export const isAmmo = (item: string): boolean => item in AMMO;

/**
 * Geschützturm (Wiki „Gun turret“): dreht sich zum nächsten Gegner in Reichweite und schießt 10×/s.
 * Ein Magazin hat 10 Schuss; Greifarme füllen bis ammoFill Magazine auf.
 */
export class TurretEntity extends EntityBase {
  readonly kind = 'turret' as const;
  declare readonly def: TurretDef;
  readonly ammo = new Inventory(1, isAmmo);
  /** Schuss im angebrochenen Magazin. */
  rounds = 0;
  roundsItem: string | null = null;
  /** Ausrichtung (Bogenmaß, 0 = Osten, im Uhrzeigersinn mit y nach Süden). */
  angle = Math.PI / 2;
  cooldown = 0;
  /** Darstellung: Tick des letzten Schusses und Ziel. */
  lastShot = -100;
  shotX = 0;
  shotY = 0;
  constructor(id: number, name: string, x: number, y: number, dir: Dir) {
    super(id, name, x, y, dir);
  }

  override update(w: World): void {
    if (this.cooldown > 0) this.cooldown--;
    const target = w.enemies.nearestTarget(this.cx, this.cy, TURRET.range, w.tick);
    if (!target) {
      this.status = this.rounds > 0 || !this.ammo.isEmpty() ? Status.Idle : Status.NoInput;
      return;
    }
    const want = Math.atan2(target.y - this.cy, target.x - this.cx);
    let d = want - this.angle;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.angle += Math.max(-TURRET.turnSpeed, Math.min(TURRET.turnSpeed, d));
    if (Math.abs(d) > 0.3 || this.cooldown > 0) {
      this.status = Status.Working;
      return;
    }
    if (this.rounds === 0) {
      const it = this.ammo.firstItem(isAmmo);
      if (!it) {
        this.status = Status.NoInput;
        return;
      }
      this.ammo.remove(it, 1);
      w.stats.used(it, 1);
      this.rounds = AMMO[it].rounds;
      this.roundsItem = it;
    }
    this.rounds--;
    // Forschung: Feuerrate verkürzt die Abklingzeit, Projektilschaden × Turmschaden (Wiki)
    this.cooldown = Math.max(1, Math.round(TURRET.cooldown / (1 + w.research.bonus('shooting-speed'))));
    this.lastShot = w.tick;
    this.shotX = target.x;
    this.shotY = target.y;
    w.events.push('turret', this.cx, this.cy);
    w.noise.emit(this.cx, this.cy, NOISE.turret);
    const dmg = AMMO[this.roundsItem!].damage * (1 + w.research.bonus('bullet-damage')) * (1 + w.research.bonus('turret-damage'));
    w.enemies.damageTarget(w, target, dmg);
    if (this.rounds === 0) this.roundsItem = null;
    this.status = Status.Working;
  }

  override acceptAmount(item: string, mode: InsertMode): number {
    if (!isAmmo(item)) return 0;
    const have = this.ammo.count(item);
    if (mode === 'inserter') return Math.max(0, Math.min(this.def.ammoFill - have, this.ammo.space(item)));
    return this.ammo.space(item);
  }
  protected override doInsert(item: string, n: number): number {
    return this.ammo.add(item, n);
  }
  override contents(): Stack[] {
    return invContents(this.ammo);
  }
  override guiSlots(): GuiSlots[] {
    return [{ label: 'Munition', inv: this.ammo }];
  }
  override save() {
    return { am: this.ammo.serialize(), r: this.rounds, ri: this.roundsItem, an: this.angle, cd: this.cooldown };
  }
  override load(d: Record<string, unknown>): void {
    this.ammo.load(d.am as InvData);
    this.rounds = (d.r as number) ?? 0;
    this.roundsItem = (d.ri as string | null) ?? null;
    this.angle = (d.an as number) ?? this.angle;
    this.cooldown = (d.cd as number) ?? 0;
  }
}

/** Steinmauer, Holzbarrikade, Tor: Hindernis mit Lebenspunkten (das Tor lässt nur die Figur durch). */
export class WallEntity extends EntityBase {
  readonly kind = 'wall' as const;
  declare readonly def: WallDef;
}
