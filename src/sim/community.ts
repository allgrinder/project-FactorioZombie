import { CONSUMABLES } from '../data/survival';
import { FISTS, MELEE, PLAYER_COMBAT, TURRET } from '../data/enemies';
import { ITEMS } from '../data/items';
import { COMMUNITY, DEFENSE, ESCORT, FARM, GUARD, HOME, type Job, JOBS, LOOTER, MEDIC, NAMES, PILES, REPAIR, SCAVENGER, SKILLS, SURVIVOR } from '../data/scavenge';
import { DAY, secondsToTicks } from '../data/time';
import { Status } from './entity';
import { FlowField } from './flowfield';
import { hash01 } from './rng';
import type { CampEntity, Entity, PileEntity, ProducerEntity } from './machines';
import type { World } from './world';
import { RAIDER, TRADER } from '../data/strangers';
import { stepRaider, stepTrader, strangersTick } from './strangers';

/**
 * Überlebende: wait (verbarrikadiert im Ort), follow (folgt der Figur).
 * Bewohner: home (am Lagerfeuer), out/gather/back (Sammeln), post (Wache), work (Gärtnern, Ausbessern, Sanitäter).
 */
export type WorkerState = 'home' | 'out' | 'gather' | 'back' | 'wait' | 'follow' | 'post' | 'work' | 'sleep';

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
  /** Nahkampfwaffe (aus dem Vorrat genommen); null: Fäuste. */
  weapon: string | null;
  /** Zugehörigkeit: eigene Leute (Bewohner, Überlebende), Plünderer, Händler. */
  faction: Faction;
  /** Heimat (Lager der Bande; Händler: Abzugspunkt). */
  hx: number;
  hy: number;
  /** Trägt eine Schusswaffe (Plünderer, Händler, Bewohner mit Pistole aus dem Vorrat). */
  gun: boolean;
  /** Eigenes Bett (Entity-ID) – dort wohnt und schläft er. */
  bed: number | null;
  /** Stimmung 0–100 (HOME). */
  morale: number;
  /** Tage in Folge mit Moral 0. */
  gloom: number;
  /** Folgt der Figur als Gefolge (Befehl „Mitkommen“). */
  follow: boolean;
}

export type Faction = 'ours' | 'raider' | 'trader';
const FACTIONS: Faction[] = ['ours', 'raider', 'trader'];

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
  private readonly fields = new Map<string, { f: FlowField; ver: number; gx?: number; gy?: number }>();
  /** Tote Bewohner seit dem letzten Morgen (Moral). */
  deathsToday = 0;
  /** Lagerfeuer in diesem Tick (zwischengespeichert). */
  private home: Entity | null = null;

  get(id: number): Worker | undefined {
    return this.workers.find((k) => k.id === id);
  }

  /** Bewohner der Gemeinschaft. */
  get residents(): Worker[] {
    return this.workers.filter((k) => k.resident && k.faction === 'ours');
  }

  /** Plünderer (alle, auch im Lager der Bande). */
  get raiders(): Worker[] {
    return this.workers.filter((k) => k.faction === 'raider');
  }

  /** Nächster Plünderer im Umkreis (Ziel für Figur, Türme, Wachen, Bewohner). */
  nearestHostile(x: number, y: number, r: number): Worker | null {
    let best: Worker | null = null;
    let bd = r;
    for (const k of this.workers) {
      if (k.faction !== 'raider') continue;
      const d = Math.hypot(k.x - x, k.y - y);
      if (d < bd) {
        bd = d;
        best = k;
      }
    }
    return best;
  }

  /** Fremden setzen (Plünderer im Lager der Bande, Händler am Rand). */
  addStranger(faction: Faction, x: number, y: number, seed: number): Worker {
    const k = this.addSurvivor(x, y, seed);
    k.faction = faction;
    k.resident = false;
    k.state = 'home';
    k.hx = x;
    k.hy = y;
    k.gun = faction === 'trader' || hash01(seed, k.id, 917) < 0.6;
    k.weapon = 'baseball-bat';
    k.hp = faction === 'raider' ? RAIDER.health : TRADER.health;
    return k;
  }

  /** Überfälle und Händlerbesuche (src/sim/strangers.ts). */
  readonly strangers = { nextRaid: -1, nextTrader: -1, visits: 0, nextRecruit: 0, offers: [] as { give: [string, number]; get: [string, number]; stock: number }[] };

  /** Überlebende, die noch warten oder folgen. */
  get survivors(): Worker[] {
    return this.workers.filter((k) => !k.resident && k.faction === 'ours');
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
      case 'out': return k.job === 'loot' ? 'auf dem Weg zum Plündern' : 'auf dem Weg zu einem Schrotthaufen';
      case 'gather': return k.job === 'loot' ? `durchsucht (${k.cargo.length} Stück dabei)` : `schlachtet aus (${k.cargo.length} Stück)`;
      case 'back': return k.cargo.length ? `bringt ${k.cargo.length} Stück ins Lager` : 'auf dem Heimweg';
      case 'post': return k.rounds > 0 ? `steht Wache (${k.rounds} Schuss im Magazin)` : 'steht Wache';
      case 'work': return k.job === 'farm' ? (k.pile === -1 ? 'legt ein Beet an' : 'pflegt ein Beet') : k.job === 'repair' ? 'bessert aus' : 'versorgt dich';
      case 'sleep': return 'schläft';
      case 'follow': return `begleitet dich${k.gun ? ` (Pistole, ${k.rounds} Schuss)` : ''}`;
      default: return k.job === 'rest' ? 'ruht' : k.bed !== null ? 'zu Hause' : 'am Lagerfeuer';
    }
  }

  /** Überlebenden in einem Ort setzen (Weltaufbau, src/sim/sites.ts); Name und Beruf aus dem Karten-Seed. */
  addSurvivor(x: number, y: number, seed = 0): Worker {
    const id = this.nextId++;
    const n = Math.floor(hash01(seed, id, 913) * NAMES.length);
    const skill = SKILLS[Math.floor(hash01(seed, id, 914) * SKILLS.length)];
    const k: Worker = {
      id, resident: false, name: NAMES[n], skill, job: skill, x, y, state: 'wait', pile: null, cargo: [], hp: SURVIVOR.health,
      wait: 0, flee: false, angle: Math.PI / 2, phase: 0, rounds: 0, hunger: 0, shot: -999, cd: 0, weapon: null,
      faction: 'ours', hx: 0, hy: 0, gun: false, bed: null, morale: HOME.morale, gloom: 0, follow: false,
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
    const mood = k.morale < HOME.low ? HOME.lowFactor : k.morale > HOME.high ? HOME.highFactor : 1;
    return (k.skill === k.job ? COMMUNITY.skillBonus : 1) * (k.hunger > 0 ? COMMUNITY.hungryFactor : 1) * mood;
  }

  /** Schaden (Zombie); bei 0 Leben stirbt er, seine Last fällt zu Boden. */
  hurt(w: World, k: Worker, dmg: number): void {
    k.hp -= dmg;
    w.events.push('bite', k.x, k.y);
    // Unbewaffnete und Schwerverletzte fliehen heim; wer eine Waffe hat, wehrt sich (defend)
    const weak = !k.weapon || k.hp < COMMUNITY.health * DEFENSE.fleeBelow;
    if (k.resident && k.job !== 'guard' && weak && !k.flee && (k.state === 'out' || k.state === 'gather' || k.state === 'work')) {
      k.flee = true;
      k.state = 'back';
    }
    if (k.hp > 0) return;
    for (const it of k.cargo) w.spill(k.x, k.y, it);
    this.workers.splice(this.workers.indexOf(k), 1);
    if (k.faction !== 'ours') {
      // Fremde lassen Waffe und Munition fallen
      if (k.gun) {
        w.spill(k.x, k.y, 'pistol');
        for (let i = 0; i < 1 + (k.id % 2); i++) w.spill(k.x, k.y, 'firearm-magazine');
      }
      w.enemies.remnants.push({ x: k.x, y: k.y, kind: 'unit', size: 1, tick: w.tick, name: 'worker', dir: k.angle });
      w.events.push('death', k.x, k.y);
      w.stats.made(k.faction === 'raider' ? 'kill.raider' : 'kill.trader', 1);
      if (k.faction === 'trader') w.player?.note(`Der Händler ${k.name} ist tot`);
      return;
    }
    w.enemies.remnants.push({ x: k.x, y: k.y, kind: 'unit', size: 1, tick: w.tick, name: 'worker', dir: k.angle });
    w.events.push('death', k.x, k.y);
    w.stats.used('resident', 1);
    if (k.resident) this.deathsToday++;
    w.player?.note(k.resident ? `${k.name} wurde von Zombies getötet` : `Der Überlebende ${k.name} wurde getötet`);
  }

  update(w: World): void {
    this.home = w.base;
    this.bedCache = w.entities;
    strangersTick(this, w);
    if (w.settings.needs && w.tick % DAY.ticks === Math.floor(DAY.ticks * 0.75)) this.meal(w);
    for (const k of [...this.workers]) {
      if (!this.workers.includes(k)) continue;
      if (k.faction === 'raider') stepRaider(this, w, k);
      else if (k.faction === 'trader') stepTrader(this, w, k);
      else if (!k.resident) this.stepSurvivor(w, k);
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

  /** Bewohner verlässt die Gemeinschaft (Last fällt zu Boden). */
  private leave(w: World, k: Worker, why: string): void {
    for (const it of k.cargo) w.spill(k.x, k.y, it);
    this.workers.splice(this.workers.indexOf(k), 1);
    w.player?.note(`${k.name} hat die Gemeinschaft ${why} verlassen`);
  }

  /** Gefolge an- bzw. abschalten (Fenster „Gemeinschaft“). */
  setFollow(k: Worker, on: boolean): void {
    if (!k.resident) return;
    k.follow = on;
    k.state = on ? 'follow' : 'back';
    k.pile = null;
    k.flee = false;
  }

  /** Morgens essen alle Bewohner je ein Essen aus dem Vorrat; wer leer ausgeht, wird hungrig und geht irgendwann. */
  private meal(w: World): void {
    let hungry = 0;
    const deaths = this.deathsToday;
    this.deathsToday = 0;
    for (const k of this.residents) {
      // Moral: Bett, Tote des Tages, dann Essen
      k.morale += (k.bed !== null && w.entities.has(k.bed) ? HOME.bed : HOME.noBed) + deaths * HOME.death;
      const food = this.takeSupply(w, (it) => (CONSUMABLES[it]?.hunger ?? 0) > 0);
      if (food) {
        w.stats.used(food, 1);
        k.hunger = 0;
        k.morale = Math.max(0, Math.min(100, k.morale + HOME.fed));
        k.gloom = k.morale <= 0 ? k.gloom + 1 : 0;
        if (k.gloom >= 2) this.leave(w, k, 'mutlos');
        continue;
      }
      k.morale = Math.max(0, Math.min(100, k.morale + HOME.hungry));
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
    if (this.defend(w, k)) return;
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
    this.walkPoint(w, k, p.x, p.y, SURVIVOR.followSpeed);
  }

  /** Zu einem Punkt gehen: über ein Wegfeld (Türen, um Wände herum), sonst geradewegs. */
  walkPoint(w: World, k: Worker, x: number, y: number, speed: number): void {
    const gx = Math.floor(x);
    const gy = Math.floor(y);
    const key = `p${k.id}`;
    let c = this.fields.get(key);
    const tx = Math.floor(k.x);
    const ty = Math.floor(k.y);
    if (!c || c.ver !== w.structureVersion || c.gx !== gx || c.gy !== gy || c.f.at(tx, ty) === Infinity) {
      const pad = 12;
      const x0 = Math.min(tx, gx) - pad;
      const y0 = Math.min(ty, gy) - pad;
      const f = FlowField.build(w, [[gx, gy]], x0, y0, Math.max(tx, gx) + pad - x0, Math.max(ty, gy) + pad - y0, null, true);
      c = { f, ver: w.structureVersion, gx, gy };
      this.fields.set(key, c);
    }
    if (c.f.at(tx, ty) === Infinity) return this.stepToward(w, k, x, y, speed);
    const nx = c.f.next(k.x, k.y);
    const [px, py] = nx ?? [x, y];
    this.stepToward(w, k, px, py, speed);
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
    if (w.tick % 60 === 0 && (k.state === 'home' || k.state === 'post')) k.hp = Math.min(COMMUNITY.health, k.hp + COMMUNITY.healPerSecond * (k.state === 'post' ? 0.5 : 1));
    if ((k.state === 'home' || k.follow) && (w.tick + k.id) % 300 === 0) this.arm(w, k);
    if ((w.tick + k.id) % 600 === 0) this.claimBed(w, k);
    if (this.defend(w, k)) return;
    if (k.follow) return this.stepFollow(w, k);
    if (this.stepSleep(w, k)) return;
    if (k.state === 'back') return this.stepBack(w, k);
    switch (k.job) {
      case 'scavenge': return this.stepScavenge(w, k);
      case 'loot': return this.stepLoot(w, k);
      case 'guard': return this.stepGuard(w, k);
      case 'farm': return this.stepFarm(w, k);
      case 'repair': return this.stepRepair(w, k);
      case 'medic': return this.stepMedic(w, k);
      default: return this.stepIdle(w, k);
    }
  }

  /** Beste Nahkampfwaffe aus dem Vorrat nehmen (Axt, Brecheisen, Schläger, Speer, Messer). */
  private arm(w: World, k: Worker): void {
    // Pistole für Wachen und Gefolge, Magazin nachfüllen
    if (!k.gun && (k.job === 'guard' || k.follow) && this.takeSupply(w, (x) => x === 'pistol' || x === 'submachine-gun')) k.gun = true;
    if (k.gun && k.rounds <= 0) {
      const mag = this.takeSupply(w, (it) => it === 'firearm-magazine' || it === 'piercing-rounds-magazine');
      if (mag) k.rounds = ESCORT.rounds * (mag === 'piercing-rounds-magazine' ? 2 : 1);
    }
    if (k.weapon) return;
    for (const it of DEFENSE.weapons) {
      if (this.takeSupply(w, (x) => x === it)) {
        k.weapon = it;
        return;
      }
    }
  }

  /**
   * Selbstverteidigung (alle Bewohner und folgende Überlebende): Steht ein Zombie in Reichweite, wird zurückgeschlagen
   * (Waffe bzw. Fäuste). Bewaffnete, gesunde Bewohner eilen Menschen in der Nähe zu Hilfe, die gerade angegriffen
   * werden – auch der Figur. true: dieser Tick ist mit Kämpfen verbraucht.
   */
  private defend(w: World, k: Worker): boolean {
    if (k.state === 'wait') return false;
    const fleeing = k.flee && k.hp < COMMUNITY.health * DEFENSE.fleeBelow;
    // Schusswaffe (Gefolge, Bewohner mit Pistole; Wachen schießen über stepGuard)
    if (k.gun && k.rounds > 0 && k.job !== 'guard' && k.faction === 'ours' && !fleeing) {
      const t = w.foe(k.x, k.y, ESCORT.gunRange);
      if (t && Math.hypot(t.x - k.x, t.y - k.y) > 1.6) {
        k.angle = Math.atan2(t.y - k.y, t.x - k.x);
        k.phase = 0;
        if (k.cd <= w.tick) {
          k.rounds--;
          w.enemies.damageTarget(w, t, ESCORT.gunDamage * this.bonus(k), { x: k.x, y: k.y });
          w.events.push('shot', k.x, k.y);
          w.noise.emit(k.x, k.y, ESCORT.gunNoise);
          k.shot = w.tick;
          k.cd = w.tick + ESCORT.gunCooldown;
        }
        return true;
      }
    }
    const m = (k.weapon && MELEE[k.weapon]) || FISTS;
    const u = k.faction === 'ours' ? w.foe(k.x, k.y, m.reach + 0.45) : w.enemies.nearestTarget(k.x, k.y, m.reach + 0.45, w.tick);
    if (u) {
      if (fleeing) return false;
      k.angle = Math.atan2(u.y - k.y, u.x - k.x);
      k.phase = 0;
      if (k.cd <= w.tick) {
        w.enemies.damageTarget(w, u, m.damage * DEFENSE.damageFactor * (k.hunger > 0 ? COMMUNITY.hungryFactor : 1), { x: k.x, y: k.y }, 12);
        w.events.push('melee', u.x, u.y);
        k.shot = w.tick;
        k.cd = w.tick + Math.round(m.cooldown * DEFENSE.cooldownFactor);
      }
      return true;
    }
    // zu Hilfe eilen: nur Bewaffnete mit genug Leben, nicht unterwegs mit Last
    if (!k.resident || !k.weapon || k.hp < COMMUNITY.health * 0.5 || k.cargo.length || fleeing) return false;
    const z = this.threat(w, k);
    if (!z) return false;
    this.stepToward(w, k, z.x, z.y, COMMUNITY.speed * 1.3);
    return true;
  }

  /** Zombie, der gerade einen Menschen in der Nähe bedrängt (Figur, Bewohner, Überlebender). */
  private threat(w: World, k: Worker): { x: number; y: number } | null {
    const people: { x: number; y: number }[] = [];
    const p = w.player;
    if (p && !p.dead && !p.inCar) people.push(p);
    for (const o of this.workers) if (o !== k && o.state !== 'wait' && o.faction !== 'raider') people.push(o);
    let best: { x: number; y: number } | null = null;
    let bd: number = DEFENSE.helpRadius;
    for (const q of people) {
      const dq = Math.hypot(q.x - k.x, q.y - k.y);
      if (dq > DEFENSE.helpRadius) continue;
      const z = w.foe(q.x, q.y, DEFENSE.threatRadius);
      if (!z) continue;
      const d = Math.hypot(z.x - k.x, z.y - k.y);
      if (d < bd) {
        bd = d;
        best = { x: z.x, y: z.y };
      }
    }
    return best;
  }

  /** Platz am Feuer (Kreis, je Bewohner ein anderer Winkel). */
  private spot(k: Worker): [number, number] | null {
    const b = this.home;
    if (!b) return null;
    // Wohnen: neben dem eigenen Bett
    const bed = this.bedEntity(k);
    if (bed) return [bed.cx + 0.85, bed.cy + 0.3];
    const a = k.id * 2.39996;
    const r = 2.4 + (k.id % 3) * 0.7;
    return [b.cx + Math.cos(a) * r, b.cy + Math.sin(a) * r];
  }

  private bedEntity(k: Worker): Entity | null {
    const e = k.bed !== null ? this.bedCache?.get(k.bed) : undefined;
    return e && e.kind === 'bed' ? e : null;
  }

  private bedCache: Map<number, Entity> | null = null;

  /** Freies Bett im Lager beanspruchen (Feldbett, Bett, Pritsche); ein verschwundenes Bett freigeben. */
  private claimBed(w: World, k: Worker): void {
    this.bedCache = w.entities;
    if (k.bed !== null && w.entities.get(k.bed)?.kind === 'bed') return;
    k.bed = null;
    const b = this.home;
    if (!b) return;
    let best: Entity | null = null;
    let bd: number = COMMUNITY.baseRadius;
    for (const e of w.entities.values()) {
      if (e.kind !== 'bed') continue;
      const d = Math.hypot(e.cx - b.cx, e.cy - b.cy);
      if (d >= bd || this.workers.some((o) => o.bed === e.id)) continue;
      bd = d;
      best = e;
    }
    if (best) k.bed = best.id;
  }

  /** Nachts schlafen alle außer Wachen (im eigenen Bett, sonst am Feuer); true: schläft bzw. geht schlafen. */
  private stepSleep(w: World, k: Worker): boolean {
    const night = w.darkness >= HOME.sleepDark;
    if (k.state === 'sleep') {
      if (night) {
        if (w.tick % 60 === 0) k.hp = Math.min(COMMUNITY.health, k.hp + HOME.sleepHeal);
        k.phase = 0;
        return true;
      }
      k.state = 'home';
      return false;
    }
    if (!night || k.job === 'guard' || k.cargo.length || (k.state !== 'home' && k.state !== 'work')) return false;
    this.bedCache = w.entities;
    const bed = this.bedEntity(k);
    const s: [number, number] | null = bed ? [bed.cx, bed.cy] : this.spot(k);
    if (!s) return false;
    if (Math.hypot(s[0] - k.x, s[1] - k.y) > 0.4) {
      this.walkPoint(w, k, s[0], s[1], COMMUNITY.speed * 0.8);
      return true;
    }
    k.state = 'sleep';
    return true;
  }

  /** Gefolge: folgt der Figur (Wegsuche), kämpft über defend; ohne Figur geht es heim. */
  private stepFollow(w: World, k: Worker): void {
    const p = w.player && !w.player.dead ? w.player : null;
    if (!p) {
      k.follow = false;
      k.state = 'back';
      return;
    }
    k.state = 'follow';
    const d = Math.hypot(p.x - k.x, p.y - k.y);
    if (d > SURVIVOR.lostDistance * 2) {
      k.follow = false;
      k.state = 'back';
      p.note(`${k.name} hat dich verloren und geht zurück ins Lager`);
      return;
    }
    if (d <= ESCORT.keep) {
      k.phase = 0;
      return;
    }
    this.walkPoint(w, k, p.x, p.y, ESCORT.speed);
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

  danger(w: World, k: Worker): boolean {
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

  // ------------------------------------------------------------ Plündern

  private stepLoot(w: World, k: Worker): void {
    if (k.state === 'out') return this.stepLootOut(w, k);
    if (k.state === 'gather') return this.stepLootSearch(w, k);
    this.stepIdle(w, k);
    if (w.tick < k.wait || k.hp < COMMUNITY.health * 0.6 || !this.home) return;
    const t = this.chooseLoot(w, k, this.home.cx, this.home.cy, LOOTER.radius);
    if (!t) {
      k.wait = w.tick + SCAVENGER.idleWait * 2;
      return;
    }
    k.pile = t.id;
    k.state = 'out';
    k.flee = false;
  }

  /** Nächster Fundort mit Beute (noch nicht durchsucht oder nicht leer), kein Zombie in der Nähe, nicht schon belegt. */
  private chooseLoot(w: World, k: Worker, x: number, y: number, r: number): Entity | null {
    let best: Entity | null = null;
    let bd = r;
    for (const e of w.entities.values()) {
      if (e.kind !== 'loot' || e.name === 'pickup-wreck' || (e.searched && e.inventory.isEmpty())) continue;
      const d = Math.hypot(e.cx - x, e.cy - y);
      if (d >= bd) continue;
      if (this.workers.some((o) => o !== k && o.job === 'loot' && o.pile === e.id)) continue;
      if (w.enemies.nearestTarget(e.cx, e.cy, LOOTER.avoid, w.tick)) continue;
      bd = d;
      best = e;
    }
    return best;
  }

  private stepLootOut(w: World, k: Worker): void {
    const e = k.pile !== null ? w.entities.get(k.pile) : undefined;
    if (!e || e.kind !== 'loot' || this.danger(w, k)) {
      k.flee = !!e;
      k.state = 'back';
      return;
    }
    if (rectDist(k.x, k.y, e) <= 1.0) {
      k.state = 'gather';
      k.wait = w.tick + (e.searched ? 30 : Math.round((e.searchTicks * LOOTER.searchFactor) / this.bonus(k)));
      return;
    }
    if (!this.walk(w, k, e, SCAVENGER.speed * (k.hunger > 0 ? COMMUNITY.hungryFactor : 1))) {
      k.pile = null;
      k.state = 'back';
    }
  }

  private stepLootSearch(w: World, k: Worker): void {
    const e = k.pile !== null ? w.entities.get(k.pile) : undefined;
    if (!e || e.kind !== 'loot' || this.danger(w, k)) {
      k.flee = !!e;
      k.state = 'back';
      return;
    }
    k.angle = Math.atan2(e.cy - k.y, e.cx - k.x);
    k.phase += 0.02;
    if (w.tick < k.wait) return;
    if (!e.searched) {
      e.searched = true;
      w.stats.made(`search.${e.name}`, 1);
      w.events.push('search', e.cx, e.cy);
    }
    for (const st of e.inventory.contents()) {
      const n = Math.min(st.count, LOOTER.capacity - k.cargo.length);
      for (let i = 0; i < n; i++) k.cargo.push(st.item);
      if (n) e.inventory.remove(st.item, n);
      if (k.cargo.length >= LOOTER.capacity) break;
    }
    // weiter zum nächsten Fundort in der Nähe, solange Platz ist
    const next = k.cargo.length < LOOTER.capacity * 0.75 ? this.chooseLoot(w, k, k.x, k.y, 14) : null;
    if (next) {
      k.pile = next.id;
      k.state = 'out';
      return;
    }
    k.pile = null;
    k.state = 'back';
  }

  // ------------------------------------------------------------ Wache

  /**
   * Posten: zuerst Wach- und MG-Türme im Lager (neben dem Turm, zum Feuer hin – von dort weiter), dann an der
   * Mauer (ein Feld innen vor der ersten Mauer in Blickrichtung), sonst auf dem Ring um das Feuer.
   */
  private post(w: World, k: Worker): { x: number; y: number; tower: boolean } | null {
    const b = this.home;
    if (!b) return null;
    const guards = this.workers.filter((x) => x.resident && x.job === 'guard');
    const i = guards.indexOf(k);
    if (w.tick % 120 === 0 || !this.towers || this.towersTick !== Math.floor(w.tick / 120)) {
      this.towersTick = Math.floor(w.tick / 120);
      this.towers = [];
      for (const e of w.entities.values()) if (e.kind === 'turret' && Math.hypot(e.cx - b.cx, e.cy - b.cy) <= COMMUNITY.baseRadius) this.towers.push(e);
      this.towers.sort((p, q) => p.id - q.id);
    }
    if (i < this.towers.length) {
      const t = this.towers[i];
      const a = Math.atan2(b.cy - t.cy, b.cx - t.cx);
      return { x: t.cx + Math.cos(a) * (t.w / 2 + 0.6), y: t.cy + Math.sin(a) * (t.h / 2 + 0.6), tower: true };
    }
    const j = i - this.towers.length;
    const n = Math.max(1, guards.length - this.towers.length);
    const a = (j / n) * Math.PI * 2 + 0.4;
    // Mauer in dieser Richtung?
    for (let r = 2; r <= COMMUNITY.baseRadius; r += 0.5) {
      const x = b.cx + Math.cos(a) * r;
      const y = b.cy + Math.sin(a) * r;
      const e = w.entityAt(Math.floor(x), Math.floor(y));
      if (e && e.kind === 'wall') return { x: b.cx + Math.cos(a) * (r - 1.2), y: b.cy + Math.sin(a) * (r - 1.2), tower: false };
      if (e && e.def.solid && e.kind !== 'fire') break;
    }
    return { x: b.cx + Math.cos(a) * GUARD.postRadius, y: b.cy + Math.sin(a) * GUARD.postRadius, tower: false };
  }

  private towers: Entity[] | null = null;
  private towersTick = -1;

  private stepGuard(w: World, k: Worker): void {
    const post = this.post(w, k);
    if (!post) return;
    const p: [number, number] = [post.x, post.y];
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
      const range = GUARD.range * (1 - TURRET.nightPenalty * dark) * (post.tower && far < 0.6 ? GUARD.towerBonus : 1) * w.weather.fx.range;
      const u = w.foe(k.x, k.y, range);
      if (u) {
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
      // Ernte zuerst, dann neue Beete anlegen (Holz aus dem Vorrat), sonst pflegen
      const bed = this.chooseBed(w, k);
      if (bed && bed.out.count(bed.def.product) > 0) {
        k.pile = bed.id;
        k.state = 'work';
        return;
      }
      if (this.plantBed(w, k)) return;
      if (bed) {
        k.pile = bed.id;
        k.state = 'work';
        return;
      }
      // sonst Wildkräuter am Lager sammeln
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

  /** Neues Gemüsebeet im Lager anlegen (FARM.bedWood Holz aus dem Vorrat, Bauzeit FARM.buildSeconds). */
  private plantBed(w: World, k: Worker): boolean {
    const b = this.home!;
    const farmers = this.workers.filter((x) => x.resident && x.job === 'farm').length;
    let beds = 0;
    for (const e of w.entities.values()) if (e.kind === 'producer' && e.def.product === 'vegetables' && Math.hypot(e.cx - b.cx, e.cy - b.cy) <= COMMUNITY.baseRadius) beds++;
    if (beds >= farmers * FARM.bedsPerFarmer || this.supply(w, (it) => it === 'wood') < FARM.bedWood) return false;
    // Platz: Ring 6–12 Felder um das Feuer, erste freie 2×2-Fläche
    for (let r = 6; r <= 12; r += 2) {
      for (let s = 0; s < 12; s++) {
        const a = (s / 12) * Math.PI * 2 + k.id;
        const x = Math.floor(b.cx + Math.cos(a) * r) - 1;
        const y = Math.floor(b.cy + Math.sin(a) * r) - 1;
        if (!w.canPlace('garden', x, y, 0).ok) continue;
        let clear = true;
        for (let j = -1; j <= 2 && clear; j++) for (let i = -1; i <= 2; i++) if (w.entityAt(x + i, y + j)) clear = false;
        if (!clear) continue;
        for (let n = 0; n < FARM.bedWood; n++) this.takeSupply(w, (it) => it === 'wood');
        w.stats.used('wood', FARM.bedWood);
        const e = w.create(w.nextId++, 'garden', x, y, 0);
        w.events.push('build', e.cx, e.cy, { id: e.id, w: 2, h: 2 });
        k.state = 'home';
        k.wait = w.tick + Math.round(secondsToTicks(FARM.buildSeconds) / this.bonus(k));
        w.player?.note(`${k.name} hat ein neues Gemüsebeet angelegt`);
        return true;
      }
    }
    return false;
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
  stepToward(w: World, k: Worker, tx: number, ty: number, speed: number): void {
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
  walk(w: World, k: Worker, goal: Entity, speed: number): boolean {
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
        k.name, k.skill, k.job, k.rounds, k.hunger, k.cd, k.weapon, FACTIONS.indexOf(k.faction), k.hx, k.hy, k.gun ? 1 : 0, k.bed, k.morale, k.gloom, k.follow ? 1 : 0]),
      s: this.strangers,
      dt: this.deathsToday,
    };
  }

  load(d: { n?: number; v?: number; w?: unknown[]; s?: Community['strangers']; dt?: number } | undefined): void {
    this.workers.length = 0;
    this.deathsToday = d?.dt ?? 0;
    const st = d?.s;
    Object.assign(this.strangers, { nextRaid: st?.nextRaid ?? -1, nextTrader: st?.nextTrader ?? -1, visits: st?.visits ?? 0, nextRecruit: st?.nextRecruit ?? 0,
      offers: (st?.offers ?? []).map((o) => ({ give: [...o.give] as [string, number], get: [...o.get] as [string, number], stock: o.stock })) });
    this.fields.clear();
    this.nextId = d?.n ?? 1;
    for (const r of (d?.w ?? []) as unknown[][]) {
      const [id, res, x, y, state, pile, cargo, hp, wait, flee, angle, phase, name, skill, jb, rounds, hunger, cd, weapon, fac, hx, hy, gun, bed, morale, gloom, fol] = r as [
        number, number, number, number, WorkerState, number | null, string, number, number, number, number, number, string?, string?, string?, number?, number?, number?, (string | null)?,
        number?, number?, number?, number?, (number | null)?, number?, number?, number?];
      // alte Spielstände (v1): zweite Spalte = Sammelstelle (0: Überlebender), Sammler werden Bewohner
      const resident = d?.v === 2 ? res === 1 : res !== 0;
      const nm = name ?? NAMES[id % NAMES.length];
      const sk = job(skill ?? 'scavenge');
      this.workers.push({
        id, resident, name: nm, skill: sk, job: job(jb ?? sk), x, y, state: resident && state === 'wait' ? 'home' : state, pile,
        cargo: cargo ? cargo.split(',').filter((it) => ITEMS[it]) : [], hp, wait, flee: !!flee, angle, phase, rounds: rounds ?? 0, hunger: hunger ?? 0,
        shot: -999, cd: cd ?? 0, weapon: weapon ?? null, faction: FACTIONS[fac ?? 0] ?? 'ours', hx: hx ?? 0, hy: hy ?? 0, gun: !!gun,
        bed: bed ?? null, morale: morale ?? HOME.morale, gloom: gloom ?? 0, follow: !!fol,
      });
    }
  }
}

function rectDist(x: number, y: number, e: Entity): number {
  const dx = Math.max(e.x - x, 0, x - (e.x + e.w));
  const dy = Math.max(e.y - y, 0, y - (e.y + e.h));
  return Math.hypot(dx, dy);
}
