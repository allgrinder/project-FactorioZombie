import { CONSUMABLES } from '../data/survival';
import { ITEMS } from '../data/items';
import { PILES, SCAVENGER } from '../data/scavenge';
import { secondsToTicks } from '../data/time';
import { FlowField } from './flowfield';
import type { CampEntity, Entity, PileEntity } from './machines';
import type { World } from './world';

/** home: in der Sammelstelle; out: unterwegs zum Haufen; gather: schlachtet aus; back: auf dem Heimweg. */
export type WorkerState = 'home' | 'out' | 'gather' | 'back';

/** Sammler (wie die Erntefahrzeuge eines Echtzeit-Strategiespiels): geht hinaus, sammelt, bringt heim. */
export interface Worker {
  readonly id: number;
  readonly camp: number;
  x: number;
  y: number;
  state: WorkerState;
  /** Ziel-Schrotthaufen (Entity-ID). */
  pile: number | null;
  /** Getragene Stücke. */
  cargo: string[];
  hp: number;
  /** Nächster Schritt frühestens in diesem Tick (Pause, Arbeit). */
  wait: number;
  /** Auf der Flucht (schneller, bricht den Gang ab). */
  flee: boolean;
  angle: number;
  phase: number;
}

/**
 * Sammeltrupps (Wunsch 17.11.2026: „wie bei C&C nach Schrott suchen“): Jede Sammelstelle stellt je Sammler-Ausrüstung
 * einen Sammler. Er sucht den nächsten Schrotthaufen im Umkreis, an dem kein Zombie steht, geht hin (Wegsuche um
 * Mauern, durch Tore), schlachtet ihn aus, bis er voll ist, und bringt die Ausbeute zurück. Zombies jagen Sammler;
 * kommt einer zu nahe, flieht der Sammler heim. Stirbt er, liegt seine Last am Boden und die Ausrüstung ist verloren.
 */
export class ScavengerSystem {
  readonly workers: Worker[] = [];
  private nextId = 1;
  /** Wegfelder je Ziel (nicht gespeichert, nur Rechenaufwand). */
  private readonly fields = new Map<string, { f: FlowField; ver: number }>();

  workersOf(camp: number): Worker[] {
    return this.workers.filter((k) => k.camp === camp);
  }

  get(id: number): Worker | undefined {
    return this.workers.find((k) => k.id === id);
  }

  /** Nächster Sammler draußen (nicht in der Sammelstelle) im Umkreis. */
  nearest(x: number, y: number, r: number): Worker | null {
    let best: Worker | null = null;
    let bd = r;
    for (const k of this.workers) {
      if (k.state === 'home') continue;
      const d = Math.hypot(k.x - x, k.y - y);
      if (d < bd) {
        bd = d;
        best = k;
      }
    }
    return best;
  }

  /** Sammelstelle abgerissen: alle ihre Sammler verschwinden, ihre Last fällt zu Boden. */
  recall(w: World, camp: number): void {
    for (const k of this.workersOf(camp)) {
      for (const it of k.cargo) w.spill(k.x, k.y, it);
      this.workers.splice(this.workers.indexOf(k), 1);
    }
  }

  /** Schaden an einem Sammler (Zombie); bei 0 Leben stirbt er. */
  hurt(w: World, k: Worker, dmg: number): void {
    k.hp -= dmg;
    w.events.push('bite', k.x, k.y);
    if (!k.flee && k.state !== 'home') {
      k.flee = true;
      k.state = 'back';
    }
    if (k.hp > 0) return;
    for (const it of k.cargo) w.spill(k.x, k.y, it);
    this.workers.splice(this.workers.indexOf(k), 1);
    const camp = w.entities.get(k.camp);
    if (camp?.kind === 'camp') camp.kits.remove('scavenger-kit', 1);
    w.enemies.remnants.push({ x: k.x, y: k.y, kind: 'unit', size: 1, tick: w.tick, name: 'worker', dir: k.angle });
    w.events.push('death', k.x, k.y);
    w.stats.used('scavenger-kit', 1);
    w.player?.note('Ein Sammler wurde von Zombies getötet – seine Last liegt am Boden');
  }

  update(w: World): void {
    if (w.tick % 60 === 0) this.staff(w);
    for (const k of [...this.workers]) this.step(w, k);
  }

  /** Je Sammelstelle so viele Sammler wie Ausrüstungen (überzählige gehen, sobald sie daheim sind). */
  private staff(w: World): void {
    for (const e of w.entities.values()) {
      if (e.kind !== 'camp') continue;
      const mine = this.workersOf(e.id);
      for (let i = mine.length; i < e.crew; i++) {
        this.workers.push({
          id: this.nextId++, camp: e.id, x: e.cx, y: e.cy, state: 'home', pile: null, cargo: [], hp: SCAVENGER.health,
          wait: w.tick + 30 * i, flee: false, angle: Math.PI / 2, phase: 0,
        });
      }
      let extra = mine.length - e.crew;
      for (const k of mine) {
        if (extra <= 0) break;
        if (k.state !== 'home') continue;
        this.workers.splice(this.workers.indexOf(k), 1);
        extra--;
      }
    }
  }

  private step(w: World, k: Worker): void {
    const camp = w.entities.get(k.camp) as CampEntity | undefined;
    if (!camp) {
      this.workers.splice(this.workers.indexOf(k), 1);
      return;
    }
    switch (k.state) {
      case 'home': return this.stepHome(w, k, camp);
      case 'out': return this.stepOut(w, k, camp);
      case 'gather': return this.stepGather(w, k, camp);
      case 'back': return this.stepBack(w, k, camp);
    }
  }

  private stepHome(w: World, k: Worker, camp: CampEntity): void {
    k.x = camp.cx;
    k.y = camp.cy;
    k.phase = 0;
    if (w.tick % 60 === 0) k.hp = Math.min(SCAVENGER.health, k.hp + SCAVENGER.healPerSecond);
    if (w.tick < k.wait || k.hp < SCAVENGER.health * 0.6) return;
    const pile = this.choosePile(w, camp, k);
    if (!pile) {
      k.wait = w.tick + SCAVENGER.idleWait;
      return;
    }
    // Verpflegung für den Gang (ohne Bedürfnisse frei)
    if (w.settings.needs) {
      const food = camp.food.firstItem((it) => (CONSUMABLES[it]?.hunger ?? 0) > 0);
      if (!food) {
        k.wait = w.tick + SCAVENGER.idleWait;
        return;
      }
      camp.food.remove(food, 1);
      w.stats.used(food, 1);
    }
    const exit = this.exitTile(w, camp, pile);
    if (!exit) {
      k.wait = w.tick + SCAVENGER.idleWait;
      return;
    }
    k.x = exit[0];
    k.y = exit[1];
    k.pile = pile.id;
    k.state = 'out';
    k.flee = false;
  }

  /** Freies Feld am Rand der Sammelstelle, möglichst auf der Seite zum Ziel. */
  private exitTile(w: World, camp: CampEntity, goal: Entity): [number, number] | null {
    let best: [number, number] | null = null;
    let bd = Infinity;
    for (let j = -1; j <= camp.h; j++) {
      for (let i = -1; i <= camp.w; i++) {
        if (i >= 0 && i < camp.w && j >= 0 && j < camp.h) continue;
        const tx = camp.x + i;
        const ty = camp.y + j;
        if (w.map.isBlocked(tx, ty)) continue;
        const e = w.entityAt(tx, ty);
        if (e && e.def.solid && !e.def.walkable) continue;
        const d = Math.hypot(tx + 0.5 - goal.cx, ty + 0.5 - goal.cy);
        if (d < bd) {
          bd = d;
          best = [tx + 0.5, ty + 0.5];
        }
      }
    }
    return best;
  }

  /** Nächster Haufen im Umkreis, an dem kein Zombie steht und an dem nicht schon zwei Sammler arbeiten. */
  private choosePile(w: World, camp: CampEntity, k: Worker): PileEntity | null {
    let best: PileEntity | null = null;
    let bd = camp.def.radius;
    for (const e of w.entities.values()) {
      if (e.kind !== 'pile' || e.amount <= 0) continue;
      const d = Math.hypot(e.cx - camp.cx, e.cy - camp.cy);
      if (d >= bd) continue;
      if (this.workers.filter((o) => o !== k && o.pile === e.id).length >= 2) continue;
      if (w.enemies.nearestTarget(e.cx, e.cy, SCAVENGER.avoidDistance, w.tick)) continue;
      bd = d;
      best = e;
    }
    return best;
  }

  private danger(w: World, k: Worker): boolean {
    if ((w.tick + k.id) % 15 !== 0) return false;
    return !!w.enemies.nearestTarget(k.x, k.y, SCAVENGER.fleeDistance, w.tick);
  }

  private stepOut(w: World, k: Worker, camp: CampEntity): void {
    const pile = k.pile !== null ? w.entities.get(k.pile) : undefined;
    if (!pile || pile.kind !== 'pile' || this.danger(w, k)) {
      k.flee = !!pile;
      k.state = 'back';
      return;
    }
    if (rectDist(k.x, k.y, pile) <= 0.9) {
      k.state = 'gather';
      k.wait = w.tick + this.ticksPerItem(pile);
      return;
    }
    if (!this.walk(w, k, pile, SCAVENGER.speed)) {
      // unerreichbar: anderen Haufen versuchen
      k.state = 'back';
    }
    void camp;
  }

  private ticksPerItem(pile: PileEntity): number {
    return secondsToTicks(PILES[pile.name].secondsPerItem * SCAVENGER.workFactor);
  }

  private stepGather(w: World, k: Worker, _camp: CampEntity): void {
    const pile = k.pile !== null ? w.entities.get(k.pile) : undefined;
    if (!pile || pile.kind !== 'pile' || this.danger(w, k)) {
      k.flee = !!pile;
      k.state = 'back';
      return;
    }
    k.angle = Math.atan2(pile.cy - k.y, pile.cx - k.x);
    k.phase += 0.02;
    if (w.tick < k.wait) return;
    const item = w.harvestPile(pile);
    if (item) k.cargo.push(item);
    if (k.cargo.length >= SCAVENGER.capacity || !w.entities.has(pile.id)) {
      k.state = 'back';
      return;
    }
    k.wait = w.tick + this.ticksPerItem(pile);
  }

  private stepBack(w: World, k: Worker, camp: CampEntity): void {
    if (rectDist(k.x, k.y, camp) <= 0.9) {
      // abladen; was nicht ins Lager passt, behält er (wartet daheim)
      const keep: string[] = [];
      for (const it of k.cargo) if (camp.store.add(it, 1) < 1) keep.push(it);
      k.cargo = keep;
      k.state = 'home';
      k.pile = null;
      k.flee = false;
      k.wait = w.tick + (keep.length ? SCAVENGER.idleWait : SCAVENGER.rest);
      if (keep.length && w.tick % 600 === 0) w.player?.note('Die Sammelstelle ist voll');
      return;
    }
    if (!this.walk(w, k, camp, k.flee ? SCAVENGER.fleeSpeed : SCAVENGER.speed)) {
      // kein Weg (eingemauert): direkt heim
      k.x = camp.cx;
      k.y = camp.cy;
    }
  }

  /** Ein Schritt Richtung Ziel-Gebäude über ein Wegfeld (Mauern umgehen, Tore benutzen). false: kein Weg. */
  private walk(w: World, k: Worker, goal: Entity, speed: number): boolean {
    const key = `${goal.id}`;
    let c = this.fields.get(key);
    const tx = Math.floor(k.x);
    const ty = Math.floor(k.y);
    if (!c || c.ver !== w.structureVersion || c.f.at(tx, ty) === Infinity) {
      const goals: [number, number][] = [];
      for (let j = 0; j < goal.h; j++) for (let i = 0; i < goal.w; i++) goals.push([goal.x + i, goal.y + j]);
      const pad = 16;
      const x0 = Math.min(tx, goal.x) - pad;
      const y0 = Math.min(ty, goal.y) - pad;
      const x1 = Math.max(tx, goal.x + goal.w) + pad;
      const y1 = Math.max(ty, goal.y + goal.h) + pad;
      c = { f: FlowField.build(w, goals, x0, y0, x1 - x0, y1 - y0, goal.id, true), ver: w.structureVersion };
      this.fields.set(key, c);
      if (this.fields.size > 32) this.fields.delete(this.fields.keys().next().value!);
      if (c.f.at(tx, ty) === Infinity) return false;
    }
    const nx = c.f.next(k.x, k.y);
    const [gx, gy] = nx ?? [goal.cx, goal.cy];
    const dx = gx - k.x;
    const dy = gy - k.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-6) return true;
    const s = Math.min(speed, d);
    k.angle = Math.atan2(dy, dx);
    k.x += (dx / d) * s;
    k.y += (dy / d) * s;
    k.phase += s;
    return true;
  }

  // ------------------------------------------------------------ Speichern

  serialize() {
    return {
      n: this.nextId,
      w: this.workers.map((k) => [k.id, k.camp, k.x, k.y, k.state, k.pile, k.cargo.join(','), k.hp, k.wait, k.flee ? 1 : 0, k.angle, k.phase]),
    };
  }

  load(d: ReturnType<ScavengerSystem['serialize']> | undefined): void {
    this.workers.length = 0;
    this.fields.clear();
    this.nextId = d?.n ?? 1;
    for (const r of (d?.w ?? []) as [number, number, number, number, WorkerState, number | null, string, number, number, number, number, number][]) {
      const [id, camp, x, y, state, pile, cargo, hp, wait, flee, angle, phase] = r;
      this.workers.push({ id, camp, x, y, state, pile, cargo: cargo ? cargo.split(',').filter((it) => ITEMS[it]) : [], hp, wait, flee: !!flee, angle, phase });
    }
  }
}

function rectDist(x: number, y: number, e: Entity): number {
  const dx = Math.max(e.x - x, 0, x - (e.x + e.w));
  const dy = Math.max(e.y - y, 0, y - (e.y + e.h));
  return Math.hypot(dx, dy);
}
