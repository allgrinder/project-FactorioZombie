import { CAPSULES, CAPSULE_SPEED, NOISE } from '../data/enemies';
import type { World } from './world';

/** Fliegender Wurfgegenstand (Granate, Klippensprengstoff). Positionen in Feldern. */
export interface Capsule {
  item: string;
  x0: number;
  y0: number;
  tx: number;
  ty: number;
  t: number;
  total: number;
}

/**
 * Wurfgegenstände der Spielfigur (Granate, Klippensprengstoff, Lockvogel): Wurf auf einen Punkt in Reichweite,
 * Flug, dann Wirkung im Radius – Granate: Explosionsschaden an Gegnern und Nestern; Klippensprengstoff:
 * entfernt Klippen.
 */
export class CapsuleSystem {
  readonly flying: Capsule[] = [];
  private cd = 0;

  /** Wurf auf (tx, ty); Fehlertext oder null. */
  throw(w: World, item: string, tx: number, ty: number): string | null {
    const def = CAPSULES[item];
    const p = w.player;
    if (!def || !p) return 'Nicht werfbar';
    if (this.cd > 0) return null;
    const d = Math.hypot(tx - p.x, ty - p.y);
    if (d > def.range) return 'Außer Reichweite';
    if (!p.god && p.inventory.count(item) < 1) return 'Nicht im Inventar';
    if (!p.god) p.inventory.remove(item, 1);
    w.stats.used(item, 1);
    this.cd = def.cooldown;
    this.flying.push({ item, x0: p.x, y0: p.y, tx, ty, t: 0, total: Math.max(1, Math.ceil(d / CAPSULE_SPEED)) });
    return null;
  }

  update(w: World): void {
    if (this.cd > 0) this.cd--;
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const c = this.flying[i];
      if (++c.t < c.total) continue;
      this.flying.splice(i, 1);
      this.explode(w, c);
    }
  }

  private explode(w: World, c: Capsule): void {
    const def = CAPSULES[c.item];
    if (c.item !== 'noise-lure') w.events.push('explode', c.tx, c.ty);
    else w.events.push('lure', c.tx, c.ty);
    if (c.item === 'cliff-explosives') {
      const r = def.radius;
      let removed = 0;
      for (let y = Math.floor(c.ty - r - 1); y <= Math.floor(c.ty + r); y++) {
        for (let x = Math.floor(c.tx - r - 1); x <= Math.floor(c.tx + r); x++) {
          if (Math.hypot(x + 0.5 - c.tx, y + 0.5 - c.ty) <= r + 0.5 && w.map.removeCliff(x, y)) removed++;
        }
      }
      if (removed) w.structureVersion++;
      return;
    }
    if (c.item === 'noise-lure') {
      w.noise.addLure(c.tx, c.ty, w.tick);
      return;
    }
    // Explosionsschaden im Radius, laut
    w.noise.emit(c.tx, c.ty, NOISE.explosion);
    const r = def.radius;
    for (const u of w.enemies.near(c.tx, c.ty, r)) w.enemies.damageTarget(w, { kind: 'unit', id: u.id, x: u.x, y: u.y }, def.damage);
  }

  serialize(): { cd: number; f: Capsule[] } {
    return { cd: this.cd, f: this.flying.map((c) => ({ ...c })) };
  }

  load(d: { cd: number; f: Capsule[] } | undefined): void {
    this.flying.length = 0;
    this.cd = d?.cd ?? 0;
    for (const c of d?.f ?? []) this.flying.push({ ...c });
  }
}
