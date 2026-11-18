import { CHART } from '../../data/chart';
import type { RadarDef } from '../../data/entities';
import { wattsToJoulesPerTick } from '../../data/time';
import { ElectricSource } from '../energy';
import { Status } from '../entity';
import type { Dir } from '../geom';
import type { World } from '../world';
import { EntityBase } from './base';

/**
 * Radar (Wiki „Radar“): deckt mit Strom 7×7 Abschnitte ständig auf und erkundet ferne Abschnitte
 * (je 10 MJ einer, bei 300 kW alle 33,3 s).
 */
export class RadarEntity extends EntityBase {
  readonly kind = 'radar' as const;
  declare readonly def: RadarDef;
  readonly energy: ElectricSource;
  workTicks = 0;
  /** Gesammelte Energie für die nächste Fernerkundung (J). */
  scan = 0;
  /** Zuletzt erkundeter Abschnitt (Anzeige). */
  lastScan: [number, number] | null = null;
  constructor(id: number, name: string, x: number, y: number, dir: Dir) {
    super(id, name, x, y, dir);
    const jpt = wattsToJoulesPerTick(this.def.energyUsage);
    this.energy = new ElectricSource(jpt, 0, jpt * 2);
  }
  override update(w: World): void {
    if (this.energy.consume(this.energy.usagePerTick)) {
      this.status = Status.Working;
      this.workTicks++;
      this.scan += this.energy.usagePerTick;
      if (this.scan >= CHART.scanEnergy) {
        this.scan -= CHART.scanEnergy;
        this.lastScan = w.chart.scanFrom(this.cx, this.cy, w.tick);
      }
    } else this.status = Status.NoPower;
  }
  override save() {
    return { ...this.energy.serialize(), work: this.workTicks, sc: this.scan };
  }
  override load(d: Record<string, unknown>): void {
    this.energy.load(d as { eb: number });
    this.workTicks = (d.work as number) ?? 0;
    this.scan = (d.sc as number) ?? 0;
  }
}
