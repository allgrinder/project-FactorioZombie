import type { Sprite } from 'pixi.js';
import { LIFE } from '../data/fx';
import { Status } from '../sim/entity';
import type { Entity } from '../sim/machines';

/** Gebäudearten, die beim Anlaufen kurz wackeln (Maschinen, keine Kleinteile). */
const WOBBLE_KINDS = new Set(['assembler', 'furnace', 'drill', 'boiler', 'generator', 'lab', 'offshore-pump']);

/**
 * „Leben beim Bauen“ (reine Darstellung): Gebäude springen beim Aufstellen kurz auf (Federn) und wackeln beim
 * Anlaufen nach einer Pause. Gestaucht wird am unteren Bildrand, damit das Gebäude auf dem Boden bleibt.
 */
export class EntityLife {
  private readonly pop = new Map<number, number>();
  private readonly wobble = new Map<number, number>();
  private readonly lastWork = new Map<number, number>();
  private readonly lastStatus = new Map<number, Status>();
  private pruneAt = 0;

  built(id: number): void {
    this.pop.set(id, performance.now());
  }

  /** Statuswechsel beobachten; Faktoren (x, y) für die Bilder des Gebäudes oder null. */
  scaleOf(e: Entity, now: number): [number, number] | null {
    const st = e.status;
    const prev = this.lastStatus.get(e.id);
    this.lastStatus.set(e.id, st);
    if (st === Status.Working) {
      const lw = this.lastWork.get(e.id);
      if (prev !== undefined && prev !== Status.Working && WOBBLE_KINDS.has(e.kind) && (lw === undefined || now - lw > LIFE.wobbleAfterMs)) {
        this.wobble.set(e.id, now);
      }
      this.lastWork.set(e.id, now);
    }
    let kx = 1;
    let ky = 1;
    const p = this.pop.get(e.id);
    if (p !== undefined) {
      const t = (now - p) / LIFE.popMs;
      if (t >= 1) this.pop.delete(e.id);
      else {
        // von 0,7 mit Überschwingen auf 1 (easeOutBack)
        const c = 2.2;
        const u = t - 1;
        const k = 1 + (c + 1) * u * u * u + c * u * u;
        const s = LIFE.popFrom + (1 - LIFE.popFrom) * k;
        kx *= s;
        ky *= s;
      }
    }
    const wb = this.wobble.get(e.id);
    if (wb !== undefined) {
      const t = (now - wb) / 1000;
      if (t >= LIFE.wobbleSeconds) this.wobble.delete(e.id);
      else {
        const a = LIFE.wobbleAmp * Math.sin(t * Math.PI * 2 * LIFE.wobbleHz) * Math.exp(-t * LIFE.wobbleDamp);
        ky *= 1 + a;
        kx *= 1 - a * 0.6;
      }
    }
    if (now > this.pruneAt) {
      this.pruneAt = now + 10_000;
      if (this.lastStatus.size > 20_000) {
        this.lastStatus.clear();
        this.lastWork.clear();
      }
    }
    return kx === 1 && ky === 1 ? null : [kx, ky];
  }

  /** Bilder um die Unterkante skalieren. */
  static apply(s: Sprite, kx: number, ky: number): void {
    const h = s.texture.orig.height * s.scale.y;
    s.position.y += (1 - s.anchor.y) * h * (1 - ky);
    s.scale.x *= kx;
    s.scale.y *= ky;
  }
}
