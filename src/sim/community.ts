import { CONSUMABLES } from '../data/survival';
import { PLAYER_COMBAT, TURRET } from '../data/enemies';
import { ITEMS } from '../data/items';
import { COMMUNITY, FARM, GUARD, type Job, JOBS, MEDIC, NAMES, PILES, REPAIR, SCAVENGER, SKILLS, SURVIVOR } from '../data/scavenge';
import { DAY, secondsToTicks } from '../data/time';
import { Status } from './entity';
import { FlowField } from './flowfield';
import { hash01 } from './rng';
import type { CampEntity, Entity, PileEntity, ProducerEntity } from './machines';
import type { World } from './world';

/**
 * Überlebende: wait (verbarrikadiert im Ort), follow (folgt der Figur).
 * Bewohner: home (am Lagerfeuer), out/gather/back (Sammeln), post (Wache), work (Gärtnern, Ausbessern, Sanitäter).
 */
export type WorkerState = 'home' | 'out' | 'gather' | 'back' | 'wait' | 'follow' | 'post' | 'work';

export interface Worker {
  readonly id: number;
  /** false: Überlebender, der noch auf Rettung wartet bzw. folgt; true: Bewohner der Gemeinschaft. */
  resident: boolean;
  name: string;
  /** Früherer Beruf: passende Aufgabe gelingt besser. */
  skill: Job;
  job: Job;
  x: number;
  y: number;
  state: WorkerState;
  /** Ziel (Haufen, Beet, Gebäude). */
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
  /** Schuss im Magazin (Wache). */
  rounds: number;
  /** Tage ohne Essen. */
  hunger: number;
  /** Letzter Schuss/Schlag (Darstellung). */
  shot: number;
  /** Nächste Aktion der Wache frühestens in diesem Tick. */
  cd: number;
}

const job = (j: string): Job => (j in JOBS ? (j as Job) : 'scavenge');

/**
 * Gemeinschaft (Wunsch 18.11.2026: „Überlebende finden, die dann die Gemeinschaft unterstützen; jeder Bewohner hat eine
 * Aufgabe“): In Orten warten Überlebende. Geht man hin, folgen sie; erreichen sie das Lagerfeuer, werden sie Bewohner
 * mit Namen, früherem Beruf und einer Aufgabe (Sammeln, Wache, Gärtnern, Ausbessern, Sanitäter, Ruhen). Sie arbeiten
 * selbstständig, essen einmal am Tag aus dem Vorrat und werden von Zombies gejagt – das Lager will bewacht sein.
 */
export class Community {
  readonly workers: Worker[] = [];
  private nextId = 1;
  /** Wegfelder je Ziel (nicht gespeichert, nur Rechenaufwand). */
  private readonly fields = new Map<string, { f: FlowField; ver: number }>();
  /** Lagerfeuer in diesem Tick (zwischengespeichert). */
  private home: Entity | null = null;

  get(id: number): Worker | undefined {
    return this.workers.find((k) => k.id === id);
  }

  /** Bewohner der Gemeinschaft. */
  get residents(): Worker[] {
    return this.workers.filter((k) => k.resident);
  }

  /** Überlebende, die noch warten oder folgen. */
  get survivors(): Worker[] {
    return this.workers.filter((k) => !k.resident);
  }

  /** Nächster für Zombies sichtbarer Mensch (wartende Überlebende sind verbarrikadiert). */
  nearest(x: number, y: number, r: number): Worker | null {
    let best: Worker | null = null;
    let bd = r;
    for (const k of this.workers) {
      if (k.state === 'wait') continue;
      const d = Math.hypot(k.x - x, k.y - y);
      if (d < bd) {
        bd = d;
        best = k;
      }
    }
    return best;
  }

  /** Mensch unter der Maus (Anzeige), auch wartende. */
  at(x: number, y: number, r: number): Worker | null {
    let best: Worker | null = null;
    let bd = r;
    for (const k of this.workers) {
      const d = Math.hypot(k.x - x, k.y - y + 0.4);
      if (d < bd) {
        bd = d;
        best = k;
      }
    }
    return best;
  }

  /** Was er gerade tut (Anzeige). */
  doing(k: Worker): string {
    if (!k.resident) return k.state === 'wait' ? 'wartet auf Hilfe' : 'folgt dir zum Lagerfeuer';
    if (k.flee) return 'auf der Flucht';
    switch (k.state) {
      case 'out': return 'auf dem Weg zu einem Schrotthaufen';
      case 'gather': return `schlachtet aus (${k.cargo.length} Stück)`;
      case 'back': return k.cargo.length ? `bringt ${k.cargo.length} Stück ins Lager` : 'auf dem Heimweg';
      case 'post': return k.rounds > 0 ? `steht Wache (${k.rounds} Schuss im Magazin)` : 'steht Wache';
      case 'work': return k.job === 'farm' ? 'pflegt ein Beet' : k.job === 'repair' ? 'bessert aus' : 'versorgt dich';
      default: return k.job === 'rest' ? 'ruht am Feuer' : 'am Lagerfeuer';
    }
  }

  /** Überlebenden in einem Ort setzen (Weltaufbau, src/sim/sites.ts); Name und Beruf aus dem Karten-Seed. */
  addSurvivor(x: number, y: number, seed = 0): Worker {
    const id = this.nextId++;
    const n = Math.floor(hash01(seed, id, 913) * NAMES.length);
    const skill = SKILLS[Math.floor(hash01(seed, id, 914) * SKILLS.length)];
    const k: Worker = {
      id, resident: false, name: NAMES[n], skill, job: skill, x, y, state: 'wait', pile: null, cargo: [], hp: SURVIVOR.health,
      wait: 0, flee: false, angle: Math.PI / 2, phase: 0, rounds: 0, hunger: 0, shot: -999, cd: 0,
    };
    this.workers.push(k);
    return k;
  }

  /** Bewohner direkt anlegen (Tests, Szenen). */
  addResident(x: number, y: number, j: Job, seed = 0): Worker {
    const k = this.addSurvivor(x, y, seed);
    k.resident = true;
    k.job = j;
    k.state = 'home';
    k.hp = COMMUNITY.health;
    return k;
  }

  /** Aufgabe wechseln (Fenster „Gemeinschaft“): Last fällt ins Lager bzw. bleibt bei ihm, er geht heim. */
  assign(k: Worker, j: Job): void {
    if (!k.resident || k.job === j) return;
    k.job = j;
    if (k.state !== 'home') {
      k.state = 'back';
      k.flee = false;
    }
    k.pile = null;
    k.wait = 0;
  }

  /** Bewohner, der für ein Ziel arbeitet (Darstellung, Zuteilung). */
  bonus(k: Worker): number {
    return (k.skill === k.job ? COMMUNITY.skillBonus : 1) * (k.hunger > 0 ? COMMUNITY.hungryFactor : 1);
  }

  /** Schaden (Zombie); bei 0 Leben stirbt er, seine Last fällt zu Boden. */
  hurt(w: World, k: Worker, dmg: number): void {
    k.hp -= dmg;
    w.events.push('bite', k.x, k.y);
    if (k.resident && k.job !== 'guard' && !k.flee && (k.state === 'out' || k.state === 'gather' || k.state === 'work')) {
      k.flee = true;
      k.state = 'back';
    }
    if (k.hp > 0) return;
    for (const it of k.cargo) w.spill(k.x, k.y, it);
    this.workers.splice(this.workers.indexOf(k), 1);
    w.enemies.remnants.push({ x: k.x, y: k.y, kind: 'unit', size: 1, tick: w.tick, name: 'worker', dir: k.angle });
    w.events.push('death', k.x, k.y);
    w.stats.used('resident', 1);
    w.player?.note(k.resident ? `${k.name} wurde von Zombies getötet` : `Der Überlebende ${k.name} wurde getötet`);
  }

  update(w: World): void {
    this.home = w.base;
    if (w.settings.needs && w.tick % DAY.ticks === Math.floor(DAY.ticks * 0.75)) this.meal(w);
    for (const k of [...this.workers]) {
      if (!this.workers.includes(k)) continue;
      if (!k.resident) this.stepSurvivor(w, k);
      else this.stepResident(w, k);
    }
  }

  // ------------------------------------------------------------ Vorrat

  /** Vorratslager (ältestes); ohne Lager liefern Bewohner in Kisten im Lager oder ans Feuer. */
  depot(w: World): CampEntity | null {
    let best: CampEntity | null = null;
    for (const e of w.entities.values()) if (e.kind === 'camp' && (!best || e.id < best.id)) best = e;
    return best;
  }

  /** Kisten im Umkreis des Lagerfeuers. */
  private chests(w: World): Entity[] {
    const b = this.home;
    if (!b) return [];
    const out: Entity[] = [];
    for (const e of w.entities.values()) if (e.kind === 'container' && Math.hypot(e.cx - b.cx, e.cy - b.cy) <= COMMUNITY.baseRadius) out.push(e);
    return out.sort((a, c) => a.id - c.id);
  }

  /** Stück in den Vorrat legen: Vorratslager, sonst Kisten im Lager, sonst am Feuer auf den Boden. */
  stash(w: World, item: string, x: number, y: number): void {
    const d = this.depot(w);
    if (d) {
      if ((CONSUMABLES[item]?.hunger ?? 0) > 0 && d.food.add(item, 1) > 0) return;
      if (d.store.add(item, 1) > 0) return;
    }
    for (const c of this.chests(w)) if (c.kind === 'container' && c.inventory.add(item, 1) > 0) return;
    w.spill(x, y, item);
  }

  /** Wie viel vom Vorrat (Vorratslager, Kisten im Lager) passt (Anzeige). */
  supply(w: World, pred: (item: string) => boolean): number {
    this.home = w.base;
    let n = 0;
    const d = this.depot(w);
    const invs = d ? [d.food, d.store] : [];
    for (const c of this.chests(w)) if (c.kind === 'container') invs.push(c.inventory);
    for (const inv of invs) for (const st of inv.slots) if (st && pred(st.item)) n += st.count;
    return n;
  }

  /** Ein Stück aus dem Vorrat nehmen (Vorratslager, Kisten im Lager); null: nichts da. */
  takeSupply(w: World, pred: (item: string) => boolean): string | null {
    const d = this.depot(w);
    for (const inv of d ? [d.food, d.store] : []) {
      const it = inv.firstItem(pred);
      if (it) {
        inv.remove(it, 1);
        return it;
      }
    }
    for (const c of this.chests(w)) {
      if (c.kind !== 'container') continue;
      const it = c.inventory.firstItem(pred);
      if (it) {
        c.inventory.remove(it, 1);
        return it;
      }
    }
    return null;
  }

  /** Morgens essen alle Bewohner je ein Essen aus dem Vorrat; wer leer ausgeht, wird hungrig und geht irgendwann. */
  private meal(w: World): void {
    let hungry = 0;
    for (const k of this.residents) {
      const food = this.takeSupply(w, (it) => (CONSUMABLES[it]?.hunger ?? 0) > 0);
      if (food) {
        w.stats.used(food, 1);
        k.hunger = 0;
        continue;
      }
      hungry++;
      if (++k.hunger >= COMMUNITY.leaveDays) {
        for (const it of k.cargo) w.spill(k.x, k.y, it);
        this.workers.splice(this.workers.indexOf(k), 1);
        w.player?.note(`${k.name} hat die Gemeinschaft hungrig verlassen`);
      }
    }
    if (hungry) w.player?.note(`${hungry} Bewohner haben heute nichts zu essen – Essen ins Vorratslager legen`);
  }

  // ------------------------------------------------------------ Überlebende

  /** Überlebender: wartet, bis die Figur kommt; folgt ihr; am Lagerfeuer wird er Bewohner. */
  private stepSurvivor(w: World, k: Worker): void {
    const p = w.player && !w.player.dead ? w.player : null;
    if (w.tick % 60 === 0) k.hp = Math.min(SURVIVOR.health, k.hp + 0.2);
    if (!p) return;
    const d = Math.hypot(p.x - k.x, p.y - k.y);
    if (k.state === 'wait') {
      k.phase = 0;
      if (d < SURVIVOR.joinDistance) {
        k.state = 'follow';
        p.note(`${k.name} (früher: ${JOBS[k.skill].past}) schließt sich dir an – ${this.home ? 'bring sie heil zum Lagerfeuer' : 'entzünde ein Lagerfeuer als Basis'}`);
        w.events.push('use', k.x, k.y);
      }
      return;
    }
    const b = this.home;
    if (b && Math.hypot(b.cx - k.x, b.cy - k.y) < SURVIVOR.homeDistance) return this.rescue(w, k);
    if (d > SURVIVOR.lostDistance) {
      k.state = 'wait';
      p.note(`${k.name} hat dich verloren und wartet`);
      return;
    }
    if (d <= SURVIVOR.keep) {
      k.phase = 0;
      return;
    }
    this.stepToward(w, k, p.x, p.y, SURVIVOR.followSpeed);
  }

  /** Gerettet: wird Bewohner mit der Aufgabe, die zu seinem früheren Beruf passt. */
  private rescue(w: World, k: Worker): void {
    k.resident = true;
    k.job = k.skill;
    k.state = 'home';
    k.hp = Math.max(k.hp, 1);
    k.wait = w.tick + 120;
    w.stats.made('rescue.survivor', 1);
    w.events.push('rescue', k.x, k.y);
    w.player?.note(`Gerettet! ${k.name} gehört jetzt zur Gemeinschaft – Aufgabe: ${JOBS[k.job].name} (Taste K)`);
  }

  // ------------------------------------------------------------ Bewohner

  private stepResident(w: World, k: Worker): void {
    if (w.tick % 60 === 0 && k.state === 'home') k.hp = Math.min(COMMUNITY.health, k.hp + COMMUNITY.healPerSecond);
    if (k.state === 'back') return this.stepBack(w, k);
    switch (k.job) {
      case 'scavenge': return this.stepScavenge(w, k);
      case 'guard': return this.stepGuard(w, k);
      case 'farm': return this.stepFarm(w, k);
      case 'repair': return this.stepRepair(w, k);
      case 'medic': return this.stepMedic(w, k);
      default: return this.stepIdle(w, k);
    }
  }

  /** Platz am Feuer (Kreis, je Bewohner ein anderer Winkel). */
  private spot(k: Worker): [number, number] | null {
    const b = this.home;
    if (!b) return null;
    const a = k.id * 2.39996;
    const r = 2.4 + (k.id % 3) * 0.7;
    return [b.cx + Math.cos(a) * r, b.cy + Math.sin(a) * r];
  }

  /** Am Feuer bleiben (bzw. dorthin gehen). */
  private stepIdle(w: World, k: Worker): void {
    const s = this.spot(k);
    if (!s) return;
    if (Math.hypot(s[0] - k.x, s[1] - k.y) > 0.3) {
      if (Math.hypot(s[0] - k.x, s[1] - k.y) > 8) {
        k.state = 'back';
        return;
      }
      this.stepToward(w, k, s[0], s[1], COMMUNITY.speed * 0.7);
      return;
    }
    k.phase = 0;
    if (this.home) k.angle = Math.atan2(this.home.cy - k.y, this.home.cx - k.x);
    k.state = 'home';
  }

  /** Heimweg: Last ins Lager, dann an den Platz am Feuer. */
  private stepBack(w: World, k: Worker): void {
    const b = this.home;
    const d = k.cargo.length ? this.depot(w) ?? b : b;
    if (!d) {
      // kein Lager: Last bleibt bei ihm, er wartet
      k.state = 'home';
      return;
    }
    if (rectDist(k.x, k.y, d) <= 1.6) {
      for (const it of k.cargo) this.stash(w, it, k.x, k.y);
      k.cargo = [];
      k.flee = false;
      k.state = 'home';
      k.pile = null;
      k.wait = w.tick + (k.job === 'scavenge' ? SCAVENGER.rest : 60);
      return;
    }
    if (!this.walk(w, k, d, (k.flee ? SCAVENGER.fleeSpeed : SCAVENGER.speed) * (k.hunger > 0 ? COMMUNITY.hungryFactor : 1))) {
      k.x = d.cx;
      k.y = d.cy + d.h / 2 + 0.6;
    }
  }

  // ------------------------------------------------------------ Sammeln

  private stepScavenge(w: World, k: Worker): void {
    if (k.state === 'out') return this.stepOut(w, k);
    if (k.state === 'gather') return this.stepGather(w, k);
    this.stepIdle(w, k);
    if (w.tick < k.wait || k.hp < COMMUNITY.health * 0.6 || !this.home) return;
    const pile = this.choosePile(w, k);
    if (!pile) {
      k.wait = w.tick + SCAVENGER.idleWait;
      return;
    }
    k.pile = pile.id;
    k.state = 'out';
    k.flee = false;
  }

  /** Nächster Haufen im Umkreis (Vorratslager bzw. Lagerfeuer), an dem kein Zombie steht und nicht schon zwei arbeiten. */
  private choosePile(w: World, k: Worker): PileEntity | null {
    const camp = this.depot(w);
    const o = camp ?? this.home!;
    let best: PileEntity | null = null;
    let bd: number = camp ? camp.def.radius : SCAVENGER.radius;
    for (const e of w.entities.values()) {
      if (e.kind !== 'pile' || e.amount <= 0) continue;
      const d = Math.hypot(e.cx - o.cx, e.cy - o.cy);
      if (d >= bd) continue;
      if (this.workers.filter((x) => x !== k && x.pile === e.id).length >= 2) continue;
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

  private stepOut(w: World, k: Worker): void {
    const pile = k.pile !== null ? w.entities.get(k.pile) : undefined;
    if (!pile || pile.kind !== 'pile' || this.danger(w, k)) {
      k.flee = !!pile;
      k.state = 'back';
      return;
    }
    if (rectDist(k.x, k.y, pile) <= 0.9) {
      k.state = 'gather';
      k.wait = w.tick + this.ticksPerItem(pile, k);
      return;
    }
    if (!this.walk(w, k, pile, SCAVENGER.speed * (k.hunger > 0 ? COMMUNITY.hungryFactor : 1))) k.state = 'back';
  }

  private ticksPerItem(pile: PileEntity, k: Worker): number {
    return Math.round(secondsToTicks(PILES[pile.name].secondsPerItem * SCAVENGER.workFactor) / this.bonus(k));
  }

  private stepGather(w: World, k: Worker): void {
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
    k.wait = w.tick + this.ticksPerItem(pile, k);
  }

  // ------------------------------------------------------------ Wache

  /** Posten auf dem Ring um das Feuer (Wachen gleichmäßig verteilt). */
  private post(k: Worker): [number, number] | null {
    const b = this.home;
    if (!b) return null;
    const guards = this.workers.filter((x) => x.resident && x.job === 'guard');
    const i = guards.indexOf(k);
    const a = (i / Math.max(1, guards.length)) * Math.PI * 2 + 0.4;
    return [b.cx + Math.cos(a) * GUARD.postRadius, b.cy + Math.sin(a) * GUARD.postRadius];
  }

  private stepGuard(w: World, k: Worker): void {
    const p = this.post(k);
    if (!p) return;
    const far = Math.hypot(p[0] - k.x, p[1] - k.y);
    if (far > 12) {
      k.state = 'back';
      return;
    }
    k.state = 'post';
    if (k.cd > w.tick) {
      // nachladen bzw. nach dem Schuss kurz stehen
    } else {
      // Ziel: nächster Zombie; nachts ohne Licht kürzer (wie Türme)
      const dark = w.isLit(k.x, k.y) ? 0 : w.darkness;
      const range = GUARD.range * (1 - TURRET.nightPenalty * dark);
      const u = w.enemies.nearestTarget(k.x, k.y, range, w.tick);
      if (u && u.kind === 'unit') {
        k.angle = Math.atan2(u.y - k.y, u.x - k.x);
        if (k.rounds <= 0) {
          const mag = this.takeSupply(w, (it) => it === 'firearm-magazine' || it === 'piercing-rounds-magazine');
          if (mag) {
            w.stats.used(mag, 1);
            k.rounds = GUARD.rounds * (mag === 'piercing-rounds-magazine' ? 2 : 1);
          }
        }
        const d = Math.hypot(u.x - k.x, u.y - k.y);
        if (k.rounds > 0) {
          k.rounds--;
          w.enemies.damageTarget(w, u, GUARD.damage * this.bonus(k), { x: k.x, y: k.y });
          w.events.push('shot', k.x, k.y);
          if (w.tick % 2 === 0) w.noise.emit(k.x, k.y, GUARD.noise);
          k.shot = w.tick;
          k.cd = w.tick + Math.round(GUARD.cooldown / this.bonus(k));
          return;
        }
        if (d <= 1.4) {
          w.enemies.damageTarget(w, u, GUARD.melee * this.bonus(k), { x: k.x, y: k.y }, 20);
          w.events.push('hit', u.x, u.y);
          k.shot = w.tick;
          k.cd = w.tick + GUARD.meleeCooldown;
          return;
        }
      }
    }
    if (far > 0.3) this.stepToward(w, k, p[0], p[1], COMMUNITY.speed * 0.8);
    else {
      k.phase = 0;
      if (k.cd <= w.tick && this.home) k.angle = Math.atan2(k.y - this.home.cy, k.x - this.home.cx);
    }
  }

  // ------------------------------------------------------------ Gärtnern

  private stepFarm(w: World, k: Worker): void {
    const b = this.home;
    if (!b) return;
    if (k.state !== 'work') {
      this.stepIdle(w, k);
      if (w.tick < k.wait) return;
      const bed = this.chooseBed(w, k);
      if (bed) {
        k.pile = bed.id;
        k.state = 'work';
        return;
      }
      // keine Beete: Wildkräuter am Lager sammeln
      k.wait = w.tick + Math.round(secondsToTicks(FARM.forageSeconds) / this.bonus(k));
      if (w.tick > 0) this.stash(w, 'vegetables', k.x, k.y);
      return;
    }
    const bed = k.pile !== null ? w.entities.get(k.pile) : undefined;
    if (!bed || bed.kind !== 'producer') {
      k.state = 'back';
      return;
    }
    if (rectDist(k.x, k.y, bed) > 1.0) {
      if (!this.walk(w, k, bed, COMMUNITY.speed)) k.state = 'back';
      return;
    }
    k.angle = Math.atan2(bed.cy - k.y, bed.cx - k.x);
    k.phase += 0.02;
    // pflegen: wächst schneller
    if (bed.status === Status.Working) bed.progress += FARM.boost * this.bonus(k);
    if (w.tick % 60 === 0) {
      const n = bed.out.count(bed.def.product);
      for (let i = 0; i < n; i++) k.cargo.push(bed.def.product);
      if (n) bed.out.remove(bed.def.product, n);
      if (k.cargo.length >= FARM.carry) {
        k.state = 'back';
        return;
      }
      // anderes Beet mit Ertrag?
      if (w.tick % 600 === 0) {
        const other = this.chooseBed(w, k);
        if (other && other.id !== bed.id && other.out.count(other.def.product) > 0) k.pile = other.id;
      }
    }
  }

  private chooseBed(w: World, k: Worker): ProducerEntity | null {
    const b = this.home!;
    let best: ProducerEntity | null = null;
    let score = -Infinity;
    for (const e of w.entities.values()) {
      if (e.kind !== 'producer' || e.def.product !== 'vegetables') continue;
      if (Math.hypot(e.cx - b.cx, e.cy - b.cy) > COMMUNITY.baseRadius) continue;
      const others = this.workers.filter((x) => x !== k && x.pile === e.id).length;
      const s = e.out.count(e.def.product) * 10 - others * 100 - e.id * 1e-4;
      if (s > score) {
        score = s;
        best = e;
      }
    }
    return best;
  }

  // ------------------------------------------------------------ Ausbessern

  private stepRepair(w: World, k: Worker): void {
    const b = this.home;
    if (!b) return;
    if (k.state !== 'work') {
      this.stepIdle(w, k);
      if (w.tick < k.wait) return;
      const t = this.chooseDamaged(w, k);
      if (!t) {
        k.wait = w.tick + 120;
        return;
      }
      k.pile = t.id;
      k.state = 'work';
      return;
    }
    const e = k.pile !== null ? w.entities.get(k.pile) : undefined;
    if (!e || e.hp >= e.def.health) {
      k.pile = null;
      const t = this.chooseDamaged(w, k);
      if (t) k.pile = t.id;
      else k.state = 'back';
      return;
    }
    if (rectDist(k.x, k.y, e) > 1.1) {
      if (!this.walk(w, k, e, COMMUNITY.speed)) {
        k.pile = null;
        k.state = 'back';
      }
      return;
    }
    k.angle = Math.atan2(e.cy - k.y, e.cx - k.x);
    k.phase += 0.02;
    k.shot = w.tick;
    e.hp = Math.min(e.def.health, e.hp + (REPAIR.hpPerSecond * this.bonus(k)) / 60);
    if (w.tick % 40 === 0) w.events.push('hit', e.cx, e.cy);
  }

  /** Am stärksten beschädigtes eigenes Gebäude im Lager, an dem kein anderer arbeitet und kein Zombie steht. */
  private chooseDamaged(w: World, k: Worker): Entity | null {
    const b = this.home!;
    let best: Entity | null = null;
    let bf = 0.999;
    for (const e of w.entities.values()) {
      if (e.kind === 'loot' || e.kind === 'pile' || e.kind === 'prop' || e.hp >= e.def.health) continue;
      if (Math.hypot(e.cx - b.cx, e.cy - b.cy) > COMMUNITY.baseRadius) continue;
      if (this.workers.some((x) => x !== k && x.job === 'repair' && x.pile === e.id)) continue;
      const f = e.hp / e.def.health;
      if (f >= bf) continue;
      if (w.enemies.nearestTarget(e.cx, e.cy, 3, w.tick)) continue;
      bf = f;
      best = e;
    }
    return best;
  }

  // ------------------------------------------------------------ Sanitäter

  private stepMedic(w: World, k: Worker): void {
    const b = this.home;
    if (!b) return;
    const p = w.player && !w.player.dead ? w.player : null;
    const max = PLAYER_COMBAT.health;
    const needs = p && !p.inCar && Math.hypot(p.x - b.cx, p.y - b.cy) < COMMUNITY.baseRadius && (p.hp < max - 1 || p.wounds.length > 0 || p.infection !== null);
    if (needs && p) {
      k.state = 'work';
      const d = Math.hypot(p.x - k.x, p.y - k.y);
      if (d > MEDIC.reach) {
        this.stepToward(w, k, p.x, p.y, COMMUNITY.speed * 1.2);
        return;
      }
      k.phase = 0;
      k.angle = Math.atan2(p.y - k.y, p.x - k.x);
      if (w.tick % 60 !== 0) return;
      k.shot = w.tick;
      p.hp = Math.min(max, p.hp + MEDIC.hpPerSecond * this.bonus(k));
      if (p.wounds.length && this.takeSupply(w, (it) => it === 'bandage' || it === 'first-aid-kit')) {
        p.wounds = [];
        w.events.push('use', p.x, p.y);
        p.note(`${k.name} hat deine Wunden verbunden`);
      }
      if (p.infection !== null && this.takeSupply(w, (it) => it === 'antibiotics')) {
        p.infection = null;
        p.note(`${k.name} hat dir Antibiotika gegeben`);
      }
      return;
    }
    if (k.state === 'work') k.state = 'home';
    this.stepIdle(w, k);
    // Bewohner am Feuer pflegen
    if (w.tick % 60 === 0) {
      for (const o of this.workers) {
        if (!o.resident || o.hp >= COMMUNITY.health || Math.hypot(o.x - b.cx, o.y - b.cy) > 8) continue;
        o.hp = Math.min(COMMUNITY.health, o.hp + MEDIC.residentHpPerSecond * this.bonus(k));
      }
    }
  }

  // ------------------------------------------------------------ Wege

  /** Schritt geradewegs Richtung Ziel; Hindernisse seitlich umgehen (wie Zombies, ohne Wegfeld). */
  private stepToward(w: World, k: Worker, tx: number, ty: number, speed: number): void {
    const dx = tx - k.x;
    const dy = ty - k.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-6) return;
    const s = Math.min(speed, d);
    const a = Math.atan2(dy, dx);
    for (const off of [0, 0.6, -0.6, 1.2, -1.2, 1.9, -1.9]) {
      const b = a + off * (k.id % 2 ? 1 : -1);
      const nx = k.x + Math.cos(b) * s;
      const ny = k.y + Math.sin(b) * s;
      if (w.map.isBlocked(Math.floor(nx), Math.floor(ny))) continue;
      const e = w.entityAt(nx, ny);
      if (e && e.def.solid && !e.def.walkable) continue;
      k.x = nx;
      k.y = ny;
      k.angle = b;
      k.phase += s;
      return;
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
      if (c.f.at(tx, ty) === Infinity) {
        // in einem gesperrten Feld (z. B. neben dem Feuer): einen Schritt geradewegs
        this.stepToward(w, k, goal.cx, goal.cy, speed);
        return Math.hypot(goal.cx - k.x, goal.cy - k.y) < 40;
      }
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
      v: 2,
      w: this.workers.map((k) => [k.id, k.resident ? 1 : 0, k.x, k.y, k.state, k.pile, k.cargo.join(','), k.hp, k.wait, k.flee ? 1 : 0, k.angle, k.phase,
        k.name, k.skill, k.job, k.rounds, k.hunger, k.cd]),
    };
  }

  load(d: { n?: number; v?: number; w?: unknown[] } | undefined): void {
    this.workers.length = 0;
    this.fields.clear();
    this.nextId = d?.n ?? 1;
    for (const r of (d?.w ?? []) as unknown[][]) {
      const [id, res, x, y, state, pile, cargo, hp, wait, flee, angle, phase, name, skill, jb, rounds, hunger, cd] = r as [
        number, number, number, number, WorkerState, number | null, string, number, number, number, number, number, string?, string?, string?, number?, number?, number?];
      // alte Spielstände (v1): zweite Spalte = Sammelstelle (0: Überlebender), Sammler werden Bewohner
      const resident = d?.v === 2 ? res === 1 : res !== 0;
      const nm = name ?? NAMES[id % NAMES.length];
      const sk = job(skill ?? 'scavenge');
      this.workers.push({
        id, resident, name: nm, skill: sk, job: job(jb ?? sk), x, y, state: resident && state === 'wait' ? 'home' : state, pile,
        cargo: cargo ? cargo.split(',').filter((it) => ITEMS[it]) : [], hp, wait, flee: !!flee, angle, phase, rounds: rounds ?? 0, hunger: hunger ?? 0,
        shot: -999, cd: cd ?? 0,
      });
    }
  }
}

function rectDist(x: number, y: number, e: Entity): number {
  const dx = Math.max(e.x - x, 0, x - (e.x + e.w));
  const dy = Math.max(e.y - y, 0, y - (e.y + e.h));
  return Math.hypot(dx, dy);
}
