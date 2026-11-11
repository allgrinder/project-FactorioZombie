import { NOISE, NOISE_BY_ENTITY } from '../data/enemies';
import { Status } from './entity';
import type { World } from './world';

/** Ein Geräusch: Ort, Hörradius (Felder), Tick. */
export interface Noise {
  x: number;
  y: number;
  r: number;
  tick: number;
}

/** Lockvogel am Boden: lärmt bis zum Ablauf. */
export interface Lure {
  x: number;
  y: number;
  until: number;
}

/**
 * Lärm lockt Zombies an (Ersatz für die Verschmutzung des Vorgängers). Quellen: arbeitende Maschinen (einmal je
 * Sekunde, je 8×8-Block zusammengefasst – viele Maschinen sind lauter), Schüsse, Explosionen, Abbau, Lockvögel.
 * Geräusche werden gesammelt und alle 20 Ticks an die Zombies in Hörweite gemeldet (EnemySystem.hear).
 */
export class NoiseSystem {
  private pending: Noise[] = [];
  /** Zuletzt gemeldete Geräusche (Anzeige auf der Karte, nicht gespeichert). */
  readonly recent: Noise[] = [];
  /** Aktive Lockvögel (gespeichert). */
  readonly lures: Lure[] = [];
  /** Lautestes Maschinengeräusch der letzten Sekunde (Anzeige im HUD: Lärmpegel des Lagers). */
  baseLevel = 0;

  /** Geräusch melden; mehrere im selben Block verschmelzen zum lautesten. */
  emit(x: number, y: number, r: number): void {
    if (r <= 0) return;
    const B = NOISE.block;
    const bx = Math.floor(x / B);
    const by = Math.floor(y / B);
    for (const n of this.pending) {
      if (Math.floor(n.x / B) === bx && Math.floor(n.y / B) === by) {
        if (r > n.r) {
          n.r = r;
          n.x = x;
          n.y = y;
        }
        return;
      }
    }
    this.pending.push({ x, y, r, tick: 0 });
  }

  update(w: World): void {
    if (w.tick % 60 === 0) this.machines(w);
    if (w.tick % 20 !== 0) return;
    for (let i = this.lures.length - 1; i >= 0; i--) {
      const l = this.lures[i];
      if (w.tick >= l.until) this.lures.splice(i, 1);
      else this.emit(l.x, l.y, NOISE.lure);
    }
    for (let i = this.recent.length - 1; i >= 0; i--) if (w.tick - this.recent[i].tick > NOISE.showTicks) this.recent.splice(i, 1);
    if (!this.pending.length) return;
    const list = this.pending;
    this.pending = [];
    for (const n of list) {
      n.tick = w.tick;
      w.enemies.hear(w, n);
      this.recent.push(n);
    }
  }

  /** Maschinenlärm: je Block die lauteste arbeitende Maschine, verstärkt um crowdBoost je Verdopplung der Anzahl. */
  private machines(w: World): void {
    const B = NOISE.block;
    const blocks = new Map<number, { x: number; y: number; r: number; n: number }>();
    for (const e of w.entities.values()) {
      const r = NOISE_BY_ENTITY[e.name];
      if (!r || e.status !== Status.Working) continue;
      const k = Math.floor(e.cx / B) * 100003 + Math.floor(e.cy / B);
      const b = blocks.get(k);
      if (!b) blocks.set(k, { x: e.cx, y: e.cy, r, n: 1 });
      else {
        b.n++;
        if (r > b.r) {
          b.r = r;
          b.x = e.cx;
          b.y = e.cy;
        }
      }
    }
    let level = 0;
    for (const b of blocks.values()) {
      const r = b.r * (1 + NOISE.crowdBoost * Math.log2(b.n));
      level = Math.max(level, r);
      this.emit(b.x, b.y, r);
    }
    this.baseLevel = level;
  }

  addLure(x: number, y: number, tick: number): void {
    this.lures.push({ x, y, until: tick + NOISE.lureTicks });
  }

  serialize(): { l: [number, number, number][]; p?: [number, number, number][] } {
    return { l: this.lures.map((l) => [l.x, l.y, l.until]), ...(this.pending.length ? { p: this.pending.map((n) => [n.x, n.y, n.r]) } : {}) };
  }

  load(d: ReturnType<NoiseSystem['serialize']> | undefined): void {
    this.lures.length = 0;
    this.pending = (d?.p ?? []).map(([x, y, r]) => ({ x, y, r, tick: 0 }));
    this.recent.length = 0;
    for (const [x, y, until] of d?.l ?? []) this.lures.push({ x, y, until });
  }
}
