import { DROPS } from '../data/loot';
import { dayNumber } from '../data/time';
import { compassName } from './enemies';
import { hash01 } from './rng';
import type { World } from './world';

/**
 * Versorgungsabwürfe (eigene Idee): Ab Tag 2 landet regelmäßig eine Kiste am Fallschirm in einiger Entfernung von der
 * Basis. Sie enthält Munition, Medizin und Verpflegung – aber die Landung ist laut, die Zombies der Gegend kommen.
 * Die Kiste ist ein gewöhnlicher Fundort (kind 'loot', Name 'airdrop').
 */
export class DropSystem {
  /** Abwürfe: Entity-ID und Tick der Landung (für den Fallschirm in der Darstellung). */
  readonly drops: { id: number; tick: number }[] = [];
  /** Tick des nächsten Abwurfs (−1 = noch nicht geplant). */
  next = -1;

  update(w: World): void {
    if (w.tick % 60 !== 0 || !w.player || !w.settings.sites) return;
    // geplündert oder abgebaut: vergessen
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const e = w.entities.get(this.drops[i].id);
      if (!e || (e.kind === 'loot' && e.searched && e.inventory.isEmpty())) this.drops.splice(i, 1);
    }
    if (dayNumber(w.tick) < DROPS.firstDay) return;
    if (this.next < 0) this.next = w.tick + Math.round(DROPS.interval * 0.25);
    if (w.tick < this.next) return;
    this.next = w.tick + DROPS.interval;
    if (this.drops.length >= DROPS.maxOpen) return;
    this.drop(w);
  }

  /** Abwurf in zufälliger Richtung um die Basis; liefert die Lage oder null. */
  drop(w: World): [number, number] | null {
    const b = w.base;
    const p = w.player!;
    const cx = b ? b.cx : p.x;
    const cy = b ? b.cy : p.y;
    for (let k = 0; k < 24; k++) {
      const a = hash01(w.seed, w.tick, k, 991) * Math.PI * 2;
      const d = DROPS.minDist + hash01(w.seed, w.tick, k, 992) * (DROPS.maxDist - DROPS.minDist);
      const x = Math.round(cx + Math.cos(a) * d);
      const y = Math.round(cy + Math.sin(a) * d);
      if (!this.free(w, x, y)) continue;
      const e = w.create(w.nextId++, 'airdrop', x, y, 0);
      this.drops.push({ id: e.id, tick: w.tick });
      w.noise.emit(x + 1, y + 1, DROPS.noise);
      w.events.push('drop', x + 1, y + 1);
      p.note(`Versorgungsabwurf im ${compassName(a)}, etwa ${Math.round(d / 10) * 10} Felder entfernt – die Zombies haben ihn auch gehört`);
      return [x, y];
    }
    return null;
  }

  private free(w: World, x: number, y: number): boolean {
    for (let j = -1; j < 3; j++) for (let i = -1; i < 3; i++) if (w.map.isBlocked(x + i, y + j) || w.entityAt(x + i, y + j)) return false;
    return true;
  }

  serialize(): { n: number; d: [number, number][] } {
    return { n: this.next, d: this.drops.map((d) => [d.id, d.tick]) };
  }

  load(d: ReturnType<DropSystem['serialize']> | undefined): void {
    this.drops.length = 0;
    this.next = d?.n ?? -1;
    for (const [id, tick] of d?.d ?? []) this.drops.push({ id, tick });
  }
}
