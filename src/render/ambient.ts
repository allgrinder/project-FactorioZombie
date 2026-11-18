import { Texture } from 'pixi.js';
import { AMBIENT } from '../data/look';
import { MAPGEN } from '../data/mapgen';
import type { World } from '../sim/world';
import type { SpriteLib } from './assets';
import type { SpritePool } from './pools';

interface Crow {
  x: number;
  y: number;
  /** Flughöhe in Feldern (0 = sitzt). */
  alt: number;
  vx: number;
  vy: number;
  dir: number;
  /** Nächstes Hüpfen/Picken (Zeit in Ticks). */
  next: number;
  phase: number;
}

interface Flock {
  crows: Crow[];
  flying: boolean;
  age: number;
}

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  seed: number;
  /** Höhe über dem Boden (Laub fällt). */
  z: number;
}

/**
 * Umgebungsleben als reine Darstellung (eigener Zufall, ohne Einfluss auf die Simulation): Krähenschwärme auf
 * Feldern und bei Kadavern, die auffliegen, wenn jemand näher kommt; Schmetterlinge über Wiesen; Glühwürmchen in
 * Sommernächten; fallendes Laub im Herbst. Werte in src/data/look.ts (AMBIENT).
 */
/** Schwelendes Wrack (nur Darstellung): ein fester Anteil der Fahrzeugwracks brennt noch. */
export function burningWreck(e: { name: string; x: number; y: number }): boolean {
  if (!e.name.endsWith('-wreck')) return false;
  return ((((e.x * 2654435761) ^ (e.y * 40503)) >>> 0) % 1000) < AMBIENT.burningWrecks * 1000;
}

export class AmbientLife {
  private readonly flocks: Flock[] = [];
  private readonly butterflies: Mote[] = [];
  private readonly fireflies: Mote[] = [];
  private readonly leaves: Mote[] = [];
  private lastT = -1;
  private readonly crowsOk: boolean;
  private readonly smokeTex: Texture[] = [];
  private readonly smoke: Mote[] = [];
  private readonly mist: Mote[] = [];
  /** Enten auf dem Wasser (Gruppen) und Wellenringe springender Fische. */
  private readonly ducks: { x: number; y: number; dir: number; tx: number; ty: number; v: number; wait: number }[] = [];
  private readonly ripples: { x: number; y: number; age: number }[] = [];
  /** Hubschrauber auf dem Überflug (Weltlage in Feldern), sonst null. */
  heli: { x: number; y: number; vx: number; vy: number; dir: number; age: number } | null = null;
  /** Schwelende Ruinen im Bild (vom Renderer je Bild gefüllt). */
  readonly smokers: { x: number; y: number }[] = [];

  constructor(private readonly sprites: SpriteLib, private readonly tile: number) {
    this.crowsOk = sprites.has('crow.sit.0') && sprites.has('crow.fly.0');
    for (let i = 0; sprites.has(`fx.smoke.${i}`); i++) this.smokeTex.push(sprites.frame(`fx.smoke.${i}`));
  }

  /** Sitzende Krähen (im Gebäude-Layer, nach y sortiert). */
  drawGround(ents: SpritePool): void {
    if (!this.crowsOk) return;
    const T = this.tile;
    for (const f of this.flocks) {
      if (f.flying) continue;
      for (const c of f.crows) {
        const sp = ents.get(this.sprites.frame(`crow.sit.${c.dir}`));
        sp.position.set(c.x * T, c.y * T);
        sp.zIndex = c.y * T;
      }
    }
  }

  update(world: World, alpha: number, view: { x0: number; y0: number; x1: number; y1: number }, pool: SpritePool, glow: SpritePool): void {
    pool.begin();
    glow.begin();
    const t = world.tick + alpha;
    const dt = this.lastT < 0 ? 0 : Math.max(0, Math.min(10, t - this.lastT));
    this.lastT = t;
    const season = world.settings.plan ? world.weather.season(world.tick) : 'summer';
    const dark = world.darkness;
    const rain = world.settings.plan && (world.weather.kind === 'rain' || world.weather.kind === 'storm') ? 1 : 0;
    this.updateCrows(world, dt, view, pool, dark);
    // Schmetterlinge: Frühling/Sommer am Tag, ohne Regen
    const wantB = dark < 0.3 && rain < 0.2 && (season === 'spring' || season === 'summer') ? AMBIENT.butterflies : 0;
    this.motes(this.butterflies, wantB, view, dt, world, (m) => {
      m.vx += (Math.random() - 0.5) * 0.004 * dt;
      m.vy += (Math.random() - 0.5) * 0.004 * dt;
      m.vx = Math.max(-0.03, Math.min(0.03, m.vx));
      m.vy = Math.max(-0.03, Math.min(0.03, m.vy));
    });
    const T = this.tile;
    for (const m of this.butterflies) {
      const flap = Math.abs(Math.sin((t + m.seed * 50) * 0.5));
      const col = AMBIENT.butterflyColors[m.seed % AMBIENT.butterflyColors.length];
      for (const s of [-1, 1]) {
        const w = pool.get(Texture.WHITE);
        w.tint = col;
        w.width = 3 * flap + 0.5;
        w.height = 3.5;
        w.anchor.set(s < 0 ? 1 : 0, 0.5);
        w.position.set(m.x * T, (m.y - 0.8 - Math.sin(t * 0.05 + m.seed) * 0.15) * T);
        w.alpha = 0.9 * Math.min(1, m.age / 30, (m.life - m.age) / 30);
      }
    }
    // Glühwürmchen: warme Nächte im Grünen
    const wantF = dark > 0.55 && rain < 0.2 && season === 'summer' ? AMBIENT.fireflies : 0;
    this.motes(this.fireflies, wantF, view, dt, world, (m) => {
      m.vx += (Math.random() - 0.5) * 0.002 * dt;
      m.vy += (Math.random() - 0.5) * 0.002 * dt;
      m.vx *= 0.98;
      m.vy *= 0.98;
    }, true);
    for (const m of this.fireflies) {
      const blink = Math.max(0, Math.sin((t + m.seed * 97) * 0.06)) ** 3;
      if (blink < 0.05) continue;
      const g = glow.get(Texture.WHITE);
      g.tint = 0xd8ff70;
      g.width = g.height = 4;
      g.anchor.set(0.5);
      g.position.set(m.x * T, (m.y - 0.6) * T);
      g.alpha = blink * Math.min(1, m.age / 40, (m.life - m.age) / 40);
      const h = glow.get(Texture.WHITE);
      h.tint = 0x88aa30;
      h.width = h.height = 14;
      h.anchor.set(0.5);
      h.position.copyFrom(g.position);
      h.alpha = g.alpha * 0.25;
    }
    // Herbstlaub: fällt unter Bäumen
    const wantL = season === 'autumn' ? AMBIENT.leaves : 0;
    if (this.leaves.length < wantL && Math.random() < 0.3 * dt) {
      const tr = this.randomTree(world, view);
      if (tr) this.leaves.push({ x: tr.x + (Math.random() - 0.5) * 2.5, y: tr.y + (Math.random() - 0.5) * 1.5, vx: 0.004, vy: 0, age: 0, life: 260, seed: Math.floor(Math.random() * 1000), z: 2 + Math.random() * 2 });
    }
    for (let i = this.leaves.length - 1; i >= 0; i--) {
      const m = this.leaves[i];
      m.age += dt;
      m.z = Math.max(0, m.z - 0.012 * dt);
      if (m.z > 0) m.x += (m.vx + Math.sin((t + m.seed) * 0.04) * 0.01) * dt;
      if (m.age > m.life) {
        this.leaves.splice(i, 1);
        continue;
      }
      const l = pool.get(Texture.WHITE);
      l.tint = AMBIENT.leafColors[m.seed % AMBIENT.leafColors.length];
      l.width = 6;
      l.height = 4;
      l.anchor.set(0.5);
      l.rotation = (t + m.seed) * 0.08 * (m.z > 0 ? 1 : 0) + m.seed;
      l.position.set(m.x * T, (m.y - m.z * 0.6) * T);
      l.alpha = Math.min(1, (m.life - m.age) / 40);
    }
    this.updateWater(world, dt, view, pool);
    this.updateHeli(world, dt, t, view, pool);
    this.updateSmoke(world, dt, t, pool);
    this.updateMist(world, dt, t, view, pool);
    pool.end();
    glow.end();
  }

  /** Wasserleben: Enten schwimmen langsam umher (flüchten vor der Figur), Fische springen. Nur bei Tag bzw. ohne Eis. */
  private updateWater(world: World, dt: number, view: { x0: number; y0: number; x1: number; y1: number }, pool: SpritePool): void {
    const T = this.tile;
    const winter = world.settings.plan && world.weather.season(world.tick) === 'winter';
    const water = (x: number, y: number) => world.map.isWater(Math.floor(x), Math.floor(y));
    // neue Entengruppe auf sichtbarem Wasser
    if (!winter && this.ducks.length < AMBIENT.ducks && this.sprites.has('duck.0.0') && Math.random() < 0.01 * dt) {
      const x = view.x0 + Math.random() * (view.x1 - view.x0);
      const y = view.y0 + Math.random() * (view.y1 - view.y0);
      if (water(x, y) && water(x + 1, y) && water(x - 1, y) && water(x, y + 1)) {
        const v = Math.random() < 0.5 ? 0 : 1;
        for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) this.ducks.push({ x: x + (Math.random() - 0.5) * 2, y: y + (Math.random() - 0.5) * 1.5, dir: 0, tx: x, ty: y, v: i === 0 ? v : 1, wait: Math.random() * 100 });
      }
    }
    const p = world.player;
    for (let i = this.ducks.length - 1; i >= 0; i--) {
      const d = this.ducks[i];
      if (d.x < view.x0 - 20 || d.x > view.x1 + 20 || d.y < view.y0 - 20 || d.y > view.y1 + 20 || winter) {
        this.ducks.splice(i, 1);
        continue;
      }
      d.wait -= dt;
      const scared = p && !p.dead && Math.hypot(p.x - d.x, p.y - d.y) < 4;
      if (scared) {
        const a = Math.atan2(d.y - p.y, d.x - p.x);
        d.tx = d.x + Math.cos(a) * 4;
        d.ty = d.y + Math.sin(a) * 4;
      } else if (d.wait <= 0) {
        d.tx = d.x + (Math.random() - 0.5) * 5;
        d.ty = d.y + (Math.random() - 0.5) * 4;
        d.wait = 120 + Math.random() * 300;
      }
      const dx = d.tx - d.x;
      const dy = d.ty - d.y;
      const len = Math.hypot(dx, dy);
      if (len > 0.05) {
        const sp = (scared ? 0.05 : 0.008) * dt;
        const nx = d.x + (dx / len) * Math.min(sp, len);
        const ny = d.y + (dy / len) * Math.min(sp, len);
        if (water(nx, ny) && water(nx + 0.4, ny) && water(nx - 0.4, ny)) {
          d.x = nx;
          d.y = ny;
          d.dir = ((Math.round(((Math.atan2(dy, dx) + Math.PI / 2) / (Math.PI * 2)) * 8) % 8) + 8) % 8;
        } else d.wait = 0;
      }
      const s = pool.get(this.sprites.frame(`duck.${d.v}.${d.dir}`));
      s.position.set(d.x * T, (d.y + Math.sin((world.tick + i * 40) * 0.05) * 0.02) * T);
    }
    // springende Fische
    if (!winter && this.sprites.has('fx.ripple.0') && Math.random() < 0.015 * dt) {
      const x = view.x0 + Math.random() * (view.x1 - view.x0);
      const y = view.y0 + Math.random() * (view.y1 - view.y0);
      if (water(x, y) && water(x + 1, y + 1) && water(x - 1, y - 1)) this.ripples.push({ x, y, age: 0 });
    }
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.age += dt;
      if (r.age > 80) {
        this.ripples.splice(i, 1);
        continue;
      }
      const k = r.age / 80;
      const s = pool.get(this.sprites.frame(`fx.ripple.${Math.min(3, Math.floor(k * 4))}`));
      s.position.set(r.x * T, r.y * T);
      s.alpha = 0.55 * (1 - k);
    }
  }

  /** Hubschrauber: selten am Tag ein Überflug quer durchs Bild, hoch oben, mit Schatten am Boden. */
  private updateHeli(world: World, dt: number, t: number, view: { x0: number; y0: number; x1: number; y1: number }, pool: SpritePool): void {
    if (!this.sprites.has('heli.0')) return;
    if (!this.heli && world.darkness < 0.3 && Math.random() < AMBIENT.heliChance * dt) {
      const a = Math.random() * Math.PI * 2;
      const cx = (view.x0 + view.x1) / 2;
      const cy = (view.y0 + view.y1) / 2;
      const r = Math.max(view.x1 - view.x0, view.y1 - view.y0) * 0.8 + 10;
      const vx = -Math.cos(a) * AMBIENT.heliSpeed;
      const vy = -Math.sin(a) * AMBIENT.heliSpeed;
      const dir = ((Math.round(((Math.atan2(vy, vx) + Math.PI / 2) / (Math.PI * 2)) * 8) % 8) + 8) % 8;
      this.heli = { x: cx + Math.cos(a) * r + (Math.random() - 0.5) * 20, y: cy + Math.sin(a) * r, vx, vy, dir, age: 0 };
    }
    const h = this.heli;
    if (!h) return;
    h.x += h.vx * dt;
    h.y += h.vy * dt;
    h.age += dt;
    if (h.age > 60 * 40) {
      this.heli = null;
      return;
    }
    const T = this.tile;
    const f = Math.floor(t / 2) % 4;
    const sh = pool.get(this.sprites.frame(`heli.${h.dir}`, f));
    sh.position.set((h.x + 4) * T, (h.y + 3) * T);
    sh.tint = 0x000000;
    sh.alpha = 0.22;
    sh.scale.set(0.9);
    const sp = pool.get(this.sprites.frame(`heli.${h.dir}`, f));
    sp.position.set(h.x * T, (h.y - 6) * T);
    sp.scale.set(1.15);
  }

  /** Rauchsäulen über schwelenden Ruinen: dunkler Rauch steigt auf und treibt mit dem Wind. */
  private updateSmoke(world: World, dt: number, t: number, pool: SpritePool): void {
    if (!this.smokeTex.length) return;
    const T = this.tile;
    for (const s of this.smokers) if (this.smoke.length < AMBIENT.smokeMax && Math.random() < AMBIENT.smokeRate * dt) {
      this.smoke.push({ x: s.x + (Math.random() - 0.5) * 1.5, y: s.y + (Math.random() - 0.5), vx: 0.004 + Math.random() * 0.004, vy: 0, age: 0, life: 420 + Math.random() * 240, seed: Math.floor(Math.random() * 1000), z: 0 });
    }
    for (let i = this.smoke.length - 1; i >= 0; i--) {
      const m = this.smoke[i];
      m.age += dt;
      if (m.age > m.life) {
        this.smoke.splice(i, 1);
        continue;
      }
      const k = m.age / m.life;
      m.z += 0.02 * dt;
      m.x += m.vx * dt;
      const sp = pool.get(this.smokeTex[m.seed % this.smokeTex.length]);
      sp.position.set(m.x * T, (m.y - m.z * 0.6) * T);
      sp.scale.set(0.8 + k * 3.2);
      sp.rotation = m.seed + t * 0.002;
      sp.tint = 0x3a3632;
      sp.alpha = Math.min(1, m.age / 40) * (1 - k) * 0.55;
    }
    void world;
  }

  /** Bodennebel in der Morgendämmerung und bei Nebelwetter: große, langsam ziehende Schwaden. */
  private updateMist(world: World, dt: number, t: number, view: { x0: number; y0: number; x1: number; y1: number }, pool: SpritePool): void {
    if (!this.smokeTex.length) return;
    const dtime = world.daytime;
    const fog = world.settings.plan && world.weather.kind === 'fog';
    const morning = dtime > 0.58 && dtime < 0.8 ? Math.min(1, (dtime - 0.58) / 0.04, (0.8 - dtime) / 0.06) : 0;
    const want = Math.round((fog ? 1 : morning) * AMBIENT.mist);
    const T = this.tile;
    if (this.mist.length < want && Math.random() < 0.3 * dt) {
      this.mist.push({ x: view.x0 + Math.random() * (view.x1 - view.x0), y: view.y0 + Math.random() * (view.y1 - view.y0), vx: 0.003, vy: 0, age: 0, life: 900 + Math.random() * 600, seed: Math.floor(Math.random() * 1000), z: 0 });
    }
    for (let i = this.mist.length - 1; i >= 0; i--) {
      const m = this.mist[i];
      m.age += dt;
      m.x += m.vx * dt;
      if (m.age > m.life || this.mist.length > want + 2) {
        this.mist.splice(i, 1);
        continue;
      }
      const sp = pool.get(this.smokeTex[m.seed % this.smokeTex.length]);
      sp.position.set(m.x * T, m.y * T);
      sp.scale.set(5 + (m.seed % 5));
      sp.rotation = m.seed;
      sp.tint = 0xe8ecf0;
      sp.alpha = Math.min(1, m.age / 120, (m.life - m.age) / 120) * AMBIENT.mistAlpha;
    }
    void t;
  }

  /** Schwebeteilchen in Sichtweite halten (erscheinen im Bild, verschwinden nach ihrer Lebenszeit). */
  private motes(list: Mote[], want: number, view: { x0: number; y0: number; x1: number; y1: number }, dt: number, world: World, steer: (m: Mote) => void, green = false): void {
    if (list.length < want && Math.random() < 0.2 * dt) {
      const x = view.x0 + Math.random() * (view.x1 - view.x0);
      const y = view.y0 + Math.random() * (view.y1 - view.y0);
      const tx = Math.floor(x);
      const ty = Math.floor(y);
      const ok = !world.map.isWater(tx, ty) && !world.map.floorAt(tx, ty) && (!green || world.map.trees.fertility(tx, ty) > 0.45);
      if (ok) list.push({ x, y, vx: 0, vy: 0, age: 0, life: 400 + Math.random() * 600, seed: Math.floor(Math.random() * 1000), z: 0 });
    }
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i];
      m.age += dt;
      steer(m);
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (m.age > m.life || m.x < view.x0 - 4 || m.x > view.x1 + 4 || m.y < view.y0 - 4 || m.y > view.y1 + 4 || list.length > want + 4) list.splice(i, 1);
    }
  }

  private randomTree(world: World, view: { x0: number; y0: number; x1: number; y1: number }): { x: number; y: number } | null {
    const CS = MAPGEN.chunkSize;
    const cx = Math.floor((view.x0 + Math.random() * (view.x1 - view.x0)) / CS);
    const cy = Math.floor((view.y0 + Math.random() * (view.y1 - view.y0)) / CS);
    const list = world.map.trees.treesIn(cx, cy).filter((t) => t.kind !== 1);
    return list.length ? list[Math.floor(Math.random() * list.length)] : null;
  }

  private updateCrows(world: World, dt: number, view: { x0: number; y0: number; x1: number; y1: number }, pool: SpritePool, dark: number): void {
    if (!this.crowsOk) return;
    const T = this.tile;
    // neue Schwärme am Tag: bei Kadavern oder auf offenem Land
    if (dark < 0.4 && this.flocks.filter((f) => !f.flying).length < AMBIENT.crowFlocks && Math.random() < 0.01 * dt) {
      const rem = world.enemies.remnants.filter((r) => r.kind !== 'building' && r.x > view.x0 && r.x < view.x1 && r.y > view.y0 && r.y < view.y1);
      let x: number;
      let y: number;
      if (rem.length && Math.random() < 0.6) {
        const r = rem[Math.floor(Math.random() * rem.length)];
        x = r.x;
        y = r.y;
      } else {
        x = view.x0 + Math.random() * (view.x1 - view.x0);
        y = view.y0 + Math.random() * (view.y1 - view.y0);
      }
      const p = world.player;
      if (!world.map.isWater(Math.floor(x), Math.floor(y)) && !world.entityAt(Math.floor(x), Math.floor(y)) && (!p || Math.hypot(p.x - x, p.y - y) > 9)) {
        const n = 3 + Math.floor(Math.random() * 6);
        const crows: Crow[] = [];
        for (let i = 0; i < n; i++) crows.push({ x: x + (Math.random() - 0.5) * 2.5, y: y + (Math.random() - 0.5) * 2, alt: 0, vx: 0, vy: 0, dir: Math.floor(Math.random() * 4), next: Math.random() * 120, phase: Math.random() });
        this.flocks.push({ crows, flying: false, age: 0 });
      }
    }
    for (let i = this.flocks.length - 1; i >= 0; i--) {
      const f = this.flocks[i];
      f.age += dt;
      const c0 = f.crows[0];
      if (!f.flying) {
        // Störung: Figur, Bewohner oder Zombie in der Nähe, Schuss oder Dunkelheit
        const p = world.player;
        let scare = dark > 0.6 || (p !== null && !p.dead && Math.hypot(p.x - c0.x, p.y - c0.y) < AMBIENT.crowScare) || (p !== null && world.tick - p.lastShot < 30 && Math.hypot(p.x - c0.x, p.y - c0.y) < 25);
        if (!scare) for (const k of world.community.workers) if (Math.hypot(k.x - c0.x, k.y - c0.y) < AMBIENT.crowScare * 0.8) scare = true;
        if (!scare && world.enemies.nearestTarget(c0.x, c0.y, 3)) scare = true;
        if (scare) {
          f.flying = true;
          const from = p ?? { x: c0.x, y: c0.y + 1 };
          const a = Math.atan2(c0.y - from.y, c0.x - from.x);
          for (const c of f.crows) {
            const aa = a + (Math.random() - 0.5) * 0.9;
            const sp = 0.07 + Math.random() * 0.04;
            c.vx = Math.cos(aa) * sp;
            c.vy = Math.sin(aa) * sp;
            c.dir = ((Math.round(((aa + Math.PI / 2) / (Math.PI * 2)) * 8) % 8) + 8) % 8;
          }
        } else {
          // hüpfen und picken
          for (const c of f.crows) {
            c.next -= dt;
            if (c.next <= 0) {
              c.next = 40 + Math.random() * 160;
              if (Math.random() < 0.5) c.dir = Math.floor(Math.random() * 4);
              else {
                c.x += (Math.random() - 0.5) * 0.4;
                c.y += (Math.random() - 0.5) * 0.3;
              }
            }
          }
          if (f.age > 60 * 90 || c0.x < view.x0 - 20 || c0.x > view.x1 + 20 || c0.y < view.y0 - 20 || c0.y > view.y1 + 20) this.flocks.splice(i, 1);
          continue;
        }
      }
      let alive = false;
      for (const c of f.crows) {
        c.alt = Math.min(6, c.alt + 0.03 * dt);
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        c.phase += 0.09 * dt;
        if (c.x > view.x0 - 6 && c.x < view.x1 + 6 && c.y > view.y0 - 10 && c.y < view.y1 + 6) alive = true;
        // Schatten am Boden, Vogel in der Höhe
        const sh = pool.get(Texture.WHITE);
        sh.tint = 0x000000;
        sh.alpha = 0.18 * Math.max(0, 1 - c.alt / 6);
        sh.width = 12;
        sh.height = 6;
        sh.anchor.set(0.5);
        sh.position.set((c.x + c.alt * 0.3) * T, (c.y + c.alt * 0.15) * T);
        const key = `crow.fly.${c.dir}`;
        const sp = pool.get(this.sprites.frame(key, Math.floor(c.phase * 4)));
        sp.position.set(c.x * T, (c.y - c.alt * 0.6) * T);
      }
      if (!alive || f.age > 60 * 120) this.flocks.splice(i, 1);
    }
  }
}
