import { ANIMALS, type AnimalKind, WILDLIFE } from '../data/wildlife';
import { hash01 } from './rng';
import type { World } from './world';

/** Ein Wildtier. mode: grasen (graze), ziehen (walk), fliehen (flee), angreifen (charge, nur Wildschwein). */
export interface Animal {
  readonly id: number;
  readonly kind: AnimalKind;
  x: number;
  y: number;
  hp: number;
  mode: 'graze' | 'walk' | 'flee' | 'charge';
  /** Ziel bzw. Fluchtpunkt. */
  tx: number;
  ty: number;
  /** Ticks bis zur nächsten Entscheidung; Abklingzeit des Angriffs. */
  wait: number;
  cd: number;
  /** Rudel (gemeinsame Flucht). */
  readonly herd: number;
  /** Darstellung: Blickrichtung (Bogenmaß) und Laufphase. */
  angle: number;
  phase: number;
}

type AnimalData = [number, AnimalKind, number, number, number, Animal['mode'], number, number, number, number, number, number, number];

/**
 * Wildtiere (eigene Idee): leben im ruhigen, fruchtbaren Land um die Figur herum, erscheinen außer Sicht und
 * verschwinden in großer Entfernung wieder. Sie fliehen vor Menschen und Zombies; erlegt geben sie Fleisch und Fell.
 * Ein verletztes Wildschwein greift an. Deterministisch über hash01(Seed, Tick, …).
 */
export class WildlifeSystem {
  readonly animals: Animal[] = [];
  private nextId = 1;
  private nextHerd = 1;

  get(id: number): Animal | undefined {
    return this.animals.find((a) => a.id === id);
  }

  /** Nächstes Tier im Umkreis (Jagd: Ziel für Schlag und Schuss). */
  nearest(x: number, y: number, r: number): Animal | null {
    let best: Animal | null = null;
    let bd = r;
    for (const a of this.animals) {
      const d = Math.hypot(a.x - x, a.y - y);
      if (d < bd) {
        bd = d;
        best = a;
      }
    }
    return best;
  }

  spawn(kind: AnimalKind, x: number, y: number, herd = this.nextHerd++): Animal {
    const a: Animal = { id: this.nextId++, kind, x, y, hp: ANIMALS[kind].hp, mode: 'graze', tx: x, ty: y, wait: 30, cd: 0, herd, angle: 0, phase: 0 };
    this.animals.push(a);
    return a;
  }

  /** Treffer: bei 0 Lebenspunkten liegt die Beute am Boden; sonst flieht das Rudel (Wildschwein greift an). */
  hurt(w: World, a: Animal, dmg: number, by?: { x: number; y: number }): void {
    a.hp -= dmg;
    w.events.push('hit', a.x, a.y);
    if (a.hp <= 0) {
      const i = this.animals.indexOf(a);
      if (i >= 0) this.animals.splice(i, 1);
      for (const d of ANIMALS[a.kind].drops) for (let k = 0; k < d.amount; k++) w.spill(a.x, a.y, d.item);
      w.enemies.remnants.push({ x: a.x, y: a.y, kind: 'animal', size: 1, tick: w.tick, name: a.kind });
      return;
    }
    const src = by ?? { x: a.x, y: a.y };
    if (ANIMALS[a.kind].charge && by) {
      a.mode = 'charge';
      a.wait = WILDLIFE.panic;
      return;
    }
    for (const o of this.animals) if (o.herd === a.herd) this.scare(o, src.x, src.y);
  }

  private scare(a: Animal, fx: number, fy: number): void {
    if (a.mode === 'charge') return;
    const ang = Math.atan2(a.y - fy, a.x - fx);
    a.mode = 'flee';
    a.tx = a.x + Math.cos(ang) * 30;
    a.ty = a.y + Math.sin(ang) * 30;
    a.wait = WILDLIFE.panic;
  }

  private free(w: World, x: number, y: number): boolean {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (w.map.isBlocked(tx, ty) || w.map.trees.treeAt(tx, ty)) return false;
    const e = w.entityAt(tx, ty);
    return !e || !e.def.solid;
  }

  update(w: World): void {
    const p = w.player;
    if (!p || !w.settings.needs) return;
    if (w.tick % WILDLIFE.spawnEvery === 0) this.populate(w, p.x, p.y);
    const night = w.darkness > 0.5;
    for (let i = this.animals.length - 1; i >= 0; i--) {
      const a = this.animals[i];
      const def = ANIMALS[a.kind];
      if (Math.hypot(a.x - p.x, a.y - p.y) > WILDLIFE.despawn) {
        this.animals.splice(i, 1);
        continue;
      }
      if (a.cd > 0) a.cd--;
      // Gefahr: Figur, Bewohner, Zombies in der Nähe (alle 10 Ticks geprüft)
      if ((w.tick + a.id) % 10 === 0 && a.mode !== 'charge') {
        const flee = def.flee * (night ? WILDLIFE.nightFlee : 1) * (p.inCar ? 2 : 1);
        let threat: { x: number; y: number } | null = null;
        if (!p.dead && !p.god && Math.hypot(p.x - a.x, p.y - a.y) < flee) threat = p;
        if (!threat) {
          const z = w.enemies.nearestTarget(a.x, a.y, WILDLIFE.zombieFlee, w.tick);
          if (z) threat = z;
        }
        if (!threat) for (const k of w.community.workers) if (Math.hypot(k.x - a.x, k.y - a.y) < flee * 0.7) threat = k;
        if (threat) for (const o of this.animals) if (o.herd === a.herd && Math.hypot(o.x - a.x, o.y - a.y) < 12) this.scare(o, threat.x, threat.y);
      }
      let speed = 0;
      if (a.mode === 'charge') {
        a.tx = p.x;
        a.ty = p.y;
        speed = def.run * 0.9;
        const d = Math.hypot(p.x - a.x, p.y - a.y);
        if (d < 0.8 && a.cd === 0 && def.charge && !p.dead) {
          p.damage(w, def.charge.damage);
          a.cd = def.charge.cooldown;
        }
        if (--a.wait <= 0 || p.dead) a.mode = 'walk';
      } else if (a.mode === 'flee') {
        speed = def.run;
        if (--a.wait <= 0) {
          a.mode = 'graze';
          a.wait = 60;
        }
      } else if (a.mode === 'walk') {
        speed = def.walk * 3;
        if (Math.hypot(a.tx - a.x, a.ty - a.y) < 0.4 || --a.wait <= 0) {
          a.mode = 'graze';
          a.wait = 120 + Math.floor(hash01(w.seed, a.id, w.tick, 901) * 360);
        }
      } else if (--a.wait <= 0) {
        // nach dem Grasen ein Stück weiterziehen, beim Rudel bleiben
        const lead = this.animals.find((o) => o.herd === a.herd) ?? a;
        const ang = hash01(w.seed, a.id, w.tick, 902) * Math.PI * 2;
        const r = 2 + hash01(w.seed, a.id, w.tick, 903) * 6;
        a.tx = (lead === a ? a.x : lead.x) + Math.cos(ang) * r;
        a.ty = (lead === a ? a.y : lead.y) + Math.sin(ang) * r;
        a.mode = 'walk';
        a.wait = 400;
      }
      if (speed > 0) {
        const dx = a.tx - a.x;
        const dy = a.ty - a.y;
        const d = Math.hypot(dx, dy);
        if (d > 0.05) {
          let ang = Math.atan2(dy, dx);
          let moved = false;
          // Hindernisse: seitlich ausweichen
          for (const off of [0, 0.6, -0.6, 1.2, -1.2, 2]) {
            const nx = a.x + Math.cos(ang + off) * Math.min(speed, d);
            const ny = a.y + Math.sin(ang + off) * Math.min(speed, d);
            if (this.free(w, nx, ny)) {
              a.x = nx;
              a.y = ny;
              ang += off;
              moved = true;
              break;
            }
          }
          if (moved) {
            a.angle = ang;
            a.phase = (a.phase + speed * 6) % 1;
          } else if (a.mode === 'walk') a.wait = 0;
        }
      }
    }
  }

  /** Neue Rudel außer Sicht im fruchtbaren, ruhigen Land. */
  private populate(w: World, px: number, py: number): void {
    if (this.animals.length >= WILDLIFE.max) return;
    const s = w.seed;
    const t = w.tick;
    const ang = hash01(s, t, 0, 910) * Math.PI * 2;
    const r = WILDLIFE.spawnMin + hash01(s, t, 0, 911) * (WILDLIFE.spawnMax - WILDLIFE.spawnMin);
    const x = px + Math.cos(ang) * r;
    const y = py + Math.sin(ang) * r;
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (!this.free(w, x, y) || w.map.floorAt(tx, ty)) return;
    if (w.map.trees.fertility(tx, ty) < WILDLIFE.fertility) return;
    for (const site of w.sites.sites) if (Math.hypot(site.x - x, site.y - y) < WILDLIFE.clearOfSites) return;
    if (w.enemies.nearestTarget(x, y, 14, t)) return;
    let roll = hash01(s, t, 0, 912);
    let kind: AnimalKind = 'deer';
    for (const k of Object.keys(ANIMALS) as AnimalKind[]) {
      if (roll < ANIMALS[k].weight) {
        kind = k;
        break;
      }
      roll -= ANIMALS[k].weight;
    }
    const [lo, hi] = ANIMALS[kind].herd;
    const n = lo + Math.floor(hash01(s, t, 0, 913) * (hi - lo + 1));
    const herd = this.nextHerd++;
    for (let i = 0; i < n; i++) {
      const ox = x + (hash01(s, t, i, 914) - 0.5) * 4;
      const oy = y + (hash01(s, t, i, 915) - 0.5) * 4;
      if (this.free(w, ox, oy)) this.spawn(kind, ox, oy, herd);
    }
  }

  serialize(): { n: number; h: number; a: AnimalData[] } {
    return {
      n: this.nextId,
      h: this.nextHerd,
      a: this.animals.map((a) => [a.id, a.kind, a.x, a.y, a.hp, a.mode, a.tx, a.ty, a.wait, a.cd, a.herd, a.angle, a.phase]),
    };
  }

  load(d: ReturnType<WildlifeSystem['serialize']> | undefined): void {
    this.animals.length = 0;
    if (!d) return;
    this.nextId = d.n;
    this.nextHerd = d.h;
    for (const [id, kind, x, y, hp, mode, tx, ty, wait, cd, herd, angle, phase] of d.a)
      this.animals.push({ id, kind, x, y, hp, mode, tx, ty, wait, cd, herd, angle, phase });
  }
}
