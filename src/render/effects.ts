import type { Texture } from 'pixi.js';
import { EMITTERS, FX, type FxKind, LIFE } from '../data/fx';
import { Status } from '../sim/entity';
import type { GameEvent } from '../sim/events';
import type { World } from '../sim/world';
import type { SpriteLib } from './assets';
import type { SpritePool } from './pools';

const TILT_LIFT = Math.tan(Math.PI / 6); // Bildhöhe je Feld Modellhöhe (Kamera 30° geneigt)

interface Particle {
  kind: FxKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  tex: Texture;
  rot: number;
  vr: number;
  tint: number;
  /** Lebensdauer-Faktor und Größenfaktor (Ausbrüche) */
  life: number;
  size: number;
}

/**
 * Rauch, Staub und Funken als reine Darstellung (eigener Zufall, beeinflusst die Simulation nicht).
 * Zeitbasis sind Simulationsticks, damit Effekte bei Pause stehen bleiben.
 */
export class Effects {
  private readonly parts: Particle[] = [];
  private readonly acc = new Map<string, number>();
  private lastT = -1;
  private readonly tex: Record<FxKind, Texture[]>;
  readonly enabled: boolean;

  /** Abgebaute Items auf dem Weg zur Figur. */
  private readonly flying: { tex: Texture; x: number; y: number; age: number; delay: number }[] = [];

  constructor(private readonly sprites: SpriteLib, private readonly pool: SpritePool, private readonly addPool: SpritePool, private readonly tile: number) {
    const list = (prefix: string) => {
      const out: Texture[] = [];
      for (let i = 0; sprites.has(`${prefix}.${i}`); i++) out.push(sprites.frame(`${prefix}.${i}`));
      return out;
    };
    this.tex = { smoke: list('fx.smoke'), dust: list('fx.dust'), spark: sprites.has('fx.spark') ? [sprites.frame('fx.spark')] : [] };
    this.enabled = this.tex.smoke.length > 0;
  }

  update(world: World, alpha: number, view: { x0: number; y0: number; x1: number; y1: number }): void {
    this.pool.begin();
    this.addPool.begin();
    if (!this.enabled) {
      this.pool.end();
      this.addPool.end();
      return;
    }
    const t = world.tick + alpha;
    const dt = this.lastT < 0 ? 0 : Math.max(0, Math.min(10, t - this.lastT)) / 60;
    this.lastT = t;
    const T = this.tile;
    if (dt > 0) {
      for (const e of world.entities.values()) {
        const ems = EMITTERS[e.name];
        if (!ems || e.status !== Status.Working) continue;
        if (e.x + e.w < view.x0 - 2 || e.x > view.x1 + 2 || e.y + e.h < view.y0 - 3 || e.y > view.y1 + 2) continue;
        ems.forEach((em, k) => {
          const key = `${e.id}:${k}`;
          let a = (this.acc.get(key) ?? Math.random()) + em.rate * dt;
          while (a >= 1) {
            a -= 1;
            // Modellpunkt drehen (im Uhrzeigersinn je Richtung) und auf den Bildschirm projizieren
            let [bx, by] = [em.at[0], em.at[1]];
            for (let r = 0; r < e.dir; r++) [bx, by] = [by, -bx];
            const sp = em.spread ?? 0;
            const ox = sp ? (Math.random() - 0.5) * 2 * sp : 0;
            const oy = sp ? (Math.random() - 0.5) * 2 * sp : 0;
            this.spawn(em.kind, (e.cx + bx + ox) * T, (e.cy - by + oy) * T - em.at[2] * TILT_LIFT * T);
          }
          this.acc.set(key, a);
        });
      }
      const p = world.player;
      if (p?.mineTarget && p.mineProgress > 0) {
        const key = 'mine';
        let a = (this.acc.get(key) ?? 0) + FX.mineDustRate * dt;
        const mt = p.mineTarget;
        const target = mt.kind === 'corpse' ? world.corpses.get(mt.id) ?? null : mt.kind === 'resource' || mt.kind === 'floor' ? { x: mt.x + 0.5, y: mt.y + 0.5 } : mt.kind === 'tree' ? { x: mt.x, y: mt.y - 0.3 } : (() => {
          const e = world.entities.get(mt.id);
          return e ? { x: e.cx, y: e.cy } : null;
        })();
        while (a >= 1 && target) {
          a -= 1;
          this.spawn('dust', (target.x + (Math.random() - 0.5) * 0.6) * T, (target.y + (Math.random() - 0.5) * 0.5) * T);
        }
        this.acc.set(key, a);
      }
    }
    // bewegen, altern, zeichnen
    let n = 0;
    for (const q of this.parts) {
      const cfg = FX[q.kind];
      q.age += dt;
      if (q.age >= cfg.life * q.life) continue;
      q.x += q.vx * dt * T;
      q.y += q.vy * dt * T;
      q.rot += q.vr * dt;
      if (q.kind === 'spark') q.vy += 0.35 * dt; // Funken sinken nach dem Aufsteigen
      if (q.life !== 1) {
        q.vx *= 1 - Math.min(1, 2.5 * dt);
        q.vy *= 1 - Math.min(1, 2.5 * dt);
      }
      this.parts[n++] = q;
      const f = q.age / (cfg.life * q.life);
      const size = (cfg.size0 + (cfg.size1 - cfg.size0) * f) * q.size;
      const fade = q.kind === 'spark' ? 1 - f : Math.min(1, f * 5) * (1 - f);
      const s = (q.kind === 'spark' ? this.addPool : this.pool).get(q.tex);
      s.position.set(q.x, q.y);
      s.scale.set((size * T) / q.tex.width);
      s.rotation = q.rot;
      s.alpha = cfg.alpha * fade;
      s.tint = q.tint;
    }
    this.parts.length = n;
    // Items fliegen im Bogen zur Figur und werden dabei kleiner
    const pl = world.player;
    let m = 0;
    for (const f of this.flying) {
      f.age += dt;
      const t = (f.age - f.delay) / LIFE.flySeconds;
      if (t >= 1 || !pl) continue;
      this.flying[m++] = f;
      if (t < 0) continue;
      const e = t * t * (3 - 2 * t);
      const tx = pl.px / 256;
      const ty = pl.py / 256 - 0.6;
      const x = f.x + (tx - f.x) * e;
      const y = f.y + (ty - f.y) * e - Math.sin(Math.PI * t) * LIFE.flyArc;
      const s = this.pool.get(f.tex);
      s.position.set(x * T, y * T);
      s.scale.set((LIFE.flySize * (1 - 0.45 * t) * T) / f.tex.width);
      s.alpha = t > 0.85 ? (1 - t) / 0.15 : 1;
      s.zIndex = 1e9;
    }
    this.flying.length = m;
    this.pool.end();
    this.addPool.end();
  }

  private spawn(kind: FxKind, x: number, y: number): void {
    const list = this.tex[kind];
    if (!list.length || this.parts.length >= FX.maxParticles) return;
    const cfg = FX[kind];
    this.parts.push({
      kind, x, y,
      vx: cfg.wind + (Math.random() - 0.5) * 2 * cfg.jitter,
      vy: -cfg.rise * (0.8 + Math.random() * 0.4),
      age: 0,
      tex: list[(Math.random() * list.length) | 0],
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.6,
      tint: 0xffffff, life: 1, size: 1,
    });
  }

  /** Ausbruch: n Partikel strahlenförmig (Felder/s), mit Farbe, Lebensdauer- und Größenfaktor. */
  burst(kind: FxKind, x: number, y: number, n: number, speed: number, tint = 0xffffff, life = 1, size = 1): void {
    const list = this.tex[kind];
    if (!list.length) return;
    for (let i = 0; i < n && this.parts.length < FX.maxParticles; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      this.parts.push({
        kind, x: x * this.tile, y: y * this.tile, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.7 - (kind === 'smoke' ? 0.3 : 0),
        age: 0, tex: list[(Math.random() * list.length) | 0], rot: Math.random() * Math.PI * 2, vr: (Math.random() - 0.5) * 2,
        tint, life: life * (0.7 + Math.random() * 0.6), size: size * (0.7 + Math.random() * 0.6),
      });
    }
  }

  /** Simulationsereignisse sichtbar machen (Explosionen, Treffer, Kadaver, Mündungsfeuer). */
  onEvents(events: readonly GameEvent[]): void {
    if (!this.enabled) return;
    for (const ev of events) {
      switch (ev.type) {
        case 'explode':
          this.burst('spark', ev.x, ev.y, 14, 3.5, 0xffc060, 0.8, 1.3);
          this.burst('smoke', ev.x, ev.y, 10, 1.4, 0x3a3530, 0.7, 1.2);
          this.burst('dust', ev.x, ev.y, 8, 2, 0x6a5a48, 1, 1.2);
          break;
        case 'death':
          this.burst('dust', ev.x, ev.y, 6, 1.6, 0x5a1a14, 0.7, 0.7);
          break;
        case 'melee':
        case 'trap':
          this.burst('dust', ev.x, ev.y, 3, 1.4, 0x6a1c16, 0.6, 0.5);
          break;
        case 'search':
          this.burst('dust', ev.x, ev.y, 6, 1.2, 0x8a7a62, 0.7, 0.9);
          break;
        case 'hit':
          this.burst('spark', ev.x, ev.y, 2, 2, 0xffd080, 0.3, 0.5);
          break;
        case 'turret':
        case 'shot':
          this.burst('spark', ev.x, ev.y - 0.4, 1, 0.6, 0xffe0a0, 0.15, 0.7);
          break;
        case 'build': {
          // Staubring entlang der Grundfläche (größere Gebäude: mehr Staub)
          const w = ev.w ?? 1;
          const h = ev.h ?? 1;
          const n = Math.min(28, 4 + 2 * (w + h));
          for (let i = 0; i < n && this.parts.length < FX.maxParticles; i++) {
            const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
            const ex = Math.cos(a);
            const ey = Math.sin(a);
            // Punkt auf dem Rand des Rechtecks in Richtung a
            const k = 0.5 / Math.max(Math.abs(ex) / w, Math.abs(ey) / h);
            this.burst('dust', ev.x + ex * k, ev.y + ey * k, 1, 0.1, 0x8a7a62, 0.8, 0.8 + 0.1 * Math.min(w, 4));
            const q = this.parts[this.parts.length - 1];
            if (q) {
              q.vx = ex * (0.9 + Math.random() * 0.6) * 1.4;
              q.vy = ey * (0.9 + Math.random() * 0.6) * 0.9 - 0.2;
            }
          }
          break;
        }
        case 'mine':
        case 'remove':
        case 'tree':
          if (ev.item && this.sprites.has(`item.${ev.item}`)) {
            const count = ev.type === 'tree' ? 3 : 1;
            for (let i = 0; i < count; i++) {
              this.flying.push({ tex: this.sprites.frame(`item.${ev.item}`), x: ev.x + (Math.random() - 0.5) * 0.4, y: ev.y + (Math.random() - 0.5) * 0.4, age: 0, delay: i * 0.08 });
            }
          }
          if (ev.type === 'tree') this.burst('dust', ev.x, ev.y, 6, 1.5, 0x6a7a40, 0.8, 0.8);
          break;
        default:
          break;
      }
    }
  }
}
