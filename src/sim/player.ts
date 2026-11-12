import { ARMORS, EQUIPMENT } from '../data/armor';
import { EquipmentGrid } from './armor';
import { FLOOR, FLOOR_BY_ID } from '../data/floors';
import { entityDef } from '../data/entities';
import { ITEMS, ITEM_IDS } from '../data/items';
import { MAPGEN } from '../data/mapgen';
import { AMMO, FISTS, HAZARD, MELEE, type MeleeDef, NOISE, PLAYER_COMBAT, REPAIR, type UnitDef, WEAPONS, ZOMBIE } from '../data/enemies';
import { CONSUMABLES, SURVIVAL, perTick } from '../data/survival';
import { DAY } from '../data/time';
import { hash01 } from './rng';
import { GOD, PLAYER, START_INVENTORY } from '../data/player';
import { RECIPES, type RecipeDef, craftingRecipeFor } from '../data/recipes';
import { RESOURCE_BY_INDEX } from '../data/resources';
import { secondsToTicks } from '../data/time';
import { Inventory } from './inventory';
import type { World } from './world';

/** Spieler-Positionen in 1/256 Feldern (ganzzahlig, deterministisch). */
export const SUB = 256;

export interface CraftJob {
  recipe: string;
  /** Verbleibende Ticks. */
  ticks: number;
  /** Ergebnis ins Inventar (false = Zwischenprodukt für den nächsten Auftrag). */
  toInventory: boolean;
  /** Bereits entnommene Rohzutaten (Erstattung beim Abbrechen). */
  refund?: [string, number][];
}

export type MineTarget =
  | { kind: 'resource'; x: number; y: number; /** Rohstoff-Index: gleicher Rohstoff → Fortschritt bleibt. */ res?: number }
  | { kind: 'entity'; id: number }
  | { kind: 'tree'; cx: number; cy: number; i: number; x: number; y: number }
  | { kind: 'floor'; x: number; y: number }
  | { kind: 'corpse'; id: number };

/** Leiche plündern: Abbauzeit (eigener Wert). */
const CORPSE_MINE_TIME = 0.5;

export class Player {
  /** Mittelpunkt in 1/256 Feldern. */
  px: number;
  py: number;
  prevPx: number;
  prevPy: number;
  /** Bewegungseingabe -1..1 je Achse. */
  moveX = 0;
  moveY = 0;
  facing = 2;
  walking = false;
  readonly inventory = new Inventory(PLAYER.inventorySlots);
  /** Angelegte Rüstung (Item) und ihr Ausrüstungsraster. */
  armor: string | null = null;
  grid: EquipmentGrid | null = null;
  /** Persönliche Bauroboter eingeschaltet (Wiki: Umschalter in der Schnellleiste). */
  personalRobots = true;
  /** Schnellleiste: Item-IDs (Verweise, wie im Vorbild). */
  readonly quickbar: (string | null)[] = new Array(PLAYER.quickbarSlots).fill(null);
  readonly craftQueue: CraftJob[] = [];
  /** Lebenspunkte, letzter Treffer, Tod (endgültig oder Wiedereinstieg am Start, je nach Karteneinstellung). */
  hp: number = PLAYER_COMBAT.health;
  lastHit = -1e9;
  dead = false;
  deathTick = 0;
  deathCause = '';
  /** Überleben: Hunger und Durst 100 (gut) … 0, Müdigkeit 0 (ausgeruht) … 100. */
  hunger: number = SURVIVAL.start.hunger;
  thirst: number = SURVIVAL.start.thirst;
  fatigue: number = SURVIVAL.start.fatigue;
  /** Blutende Wunden: Tick, an dem jede von selbst aufhört. */
  wounds: number[] = [];
  /** Infektion 0…1 (null = gesund); bei 1 tödlich. */
  infection: number | null = null;
  sleeping = false;
  /** Schläft im Bett (schnellere Erholung). */
  private inBed = false;
  /** Zuletzt gemeldete Warnstufen (Hunger, Durst, Müdigkeit, Fieber), damit Meldungen nicht wiederholt werden. */
  private warned = [0, 0, 0, 0];
  /** Angreifen (Leertaste halten): Nahkampf bzw. Schuss auf das nächste Ziel in Reichweite. */
  shooting = false;
  /** Schusswaffe statt Nahkampfwaffe benutzen (Taste X). */
  useGun = false;
  private gunCd = 0;
  private meleeCd = 0;
  /** Schläge je Nahkampfwaffe seit dem letzten Verschleiß. */
  meleeWear: Record<string, number> = {};
  /** Darstellung: letzter Schlag (Tick, Richtung). */
  lastMelee = -100;
  meleeAngle = 0;
  /** Fundort, der gerade durchsucht wird (Entity-ID). */
  searchTarget: number | null = null;
  /** Schuss im angebrochenen Magazin. */
  rounds = 0;
  roundsItem: string | null = null;
  /** Darstellung: letzter Schuss. */
  lastShot = -100;
  shotX = 0;
  shotY = 0;
  /** Reparatur (Reparaturset in der Hand, Linksklick halten). */
  repairTarget: number | null = null;
  repairUsed = 0;
  mineTarget: MineTarget | null = null;
  mineProgress = 0;
  /** Ticks, die das aktuelle Ziel benötigt (für den Fortschrittsbalken). */
  mineTotal = 0;
  /** Meldungen für das HUD (werden vom Spiel geleert). */
  readonly messages: string[] = [];
  /** Taste zum Aufheben von Bodenitems gehalten (Eingabe wie moveX). */
  pickingUp = false;
  /** Von der Welt gesetzt: Rezept freigeschaltet (Forschung). */
  recipeUnlocked: (recipe: string) => boolean = () => true;
  /** Von der Welt gesetzt: Herstellung melden (Auslöser-Forschung). */
  onCrafted: (item: string, n: number) => void = () => {};
  /** Von der Welt gesetzt: Verbrauch melden (Statistik). */
  onUsed: (item: string, n: number) => void = () => {};
  /** Gottmodus (Testhilfe, `?god`): schneller Abbau, Handwerk, Laufen, Reichweite. */
  god = false;
  private godAcc = 0;
  /** Vom Spieler abgebaute Gebäude (für Rückgängig; vom Spiel geleert). */
  readonly minedLog: { name: string; x: number; y: number; dir: number }[] = [];

  constructor(x: number, y: number) {
    this.px = this.prevPx = Math.round(x * SUB);
    this.py = this.prevPy = Math.round(y * SUB);
  }

  get x(): number {
    return this.px / SUB;
  }
  get y(): number {
    return this.py / SUB;
  }

  giveStart(): void {
    for (const s of START_INVENTORY) this.inventory.add(s.item, s.amount);
    this.quickbar[0] = 'transport-belt';
    this.quickbar[1] = 'burner-inserter';
    this.quickbar[2] = 'burner-mining-drill';
    this.quickbar[3] = 'stone-furnace';
    this.quickbar[4] = 'stone-crusher';
    this.quickbar[5] = 'coal';
    this.quickbar[6] = 'canned-food';
    this.quickbar[7] = 'water-bottle';
    this.quickbar[8] = 'bandage';
  }

  overlapsRect(x: number, y: number, w: number, h: number): boolean {
    const r = PLAYER.radius;
    return this.x + r > x && this.x - r < x + w && this.y + r > y && this.y - r < y + h;
  }

  distanceTo(x: number, y: number): number {
    return Math.hypot(this.x - x, this.y - y);
  }

  // ------------------------------------------------------------- Tick

  update(world: World): void {
    this.prevPx = this.px;
    this.prevPy = this.py;
    if (this.dead) return;
    // Forschungs-Boni der Figur: Stahlaxt, Werkzeuggürtel (+10 Inventarplätze)
    this.miningBonus = world.research.bonus('hand-mining');
    const slots = this.inventorySize(world);
    if (this.inventory.size < slots) this.inventory.resize(slots);
    this.grid?.update(1 - world.darkness);
    this.updateSurvival(world);
    if (this.dead) return;
    if (this.sleeping) {
      // Schlaf: nichts tun außer Handwerk; jede Bewegungseingabe weckt
      if (this.moveX !== 0 || this.moveY !== 0 || this.shooting) this.wake();
      else {
        this.walking = false;
        this.updateCrafting(world);
        return;
      }
    }
    this.updateCombat(world);
    this.updateSearch(world);
    this.updateMovement(world);
    this.updateMining(world);
    this.updateCrafting(world);
    if (this.pickingUp && world.tick % PLAYER.pickupInterval === 0) {
      if (!this.pickUpGround(world)) this.pickUpBelt(world);
    }
  }

  // ------------------------------------------------------------- Rüstung

  /** Inventarplätze: Grundwert + Werkzeuggürtel + Rüstung. */
  inventorySize(world: World): number {
    return PLAYER.inventorySlots + world.research.bonus('toolbelt') + (this.armor ? ARMORS[this.armor].inventoryBonus : 0);
  }

  /** Rüstung aus dem Inventar anlegen (die bisherige kommt ins Inventar). Liefert eine Meldung bei Fehlschlag. */
  equipArmor(world: World, item: string): string | null {
    if (!ARMORS[item] || this.inventory.count(item) < 1) return 'Keine Rüstung';
    if (this.armor) {
      const err = this.unequipArmor(world);
      if (err) return err;
    }
    this.inventory.remove(item, 1);
    this.armor = item;
    this.grid = EquipmentGrid.forArmor(item);
    this.inventory.resize(this.inventorySize(world));
    return null;
  }

  /** Rüstung ablegen: Ausrüstung und Rüstung kommen ins Inventar (das kleiner wird). */
  unequipArmor(world: World): string | null {
    if (!this.armor) return null;
    const back = [this.armor, ...(this.grid?.items.map((p) => p.item) ?? [])];
    const size = PLAYER.inventorySlots + world.research.bonus('toolbelt');
    // Platz prüfen: alles muss nach dem Verkleinern hineinpassen
    const test = new Inventory(this.inventory.size);
    test.load(this.inventory.serialize());
    if (!test.shrink(size) || back.some((it) => test.add(it, 1) < 1)) return 'Inventar zu voll, um die Rüstung abzulegen';
    if (this.personalRobotsOut(world) > 0) return 'Persönliche Roboter sind noch unterwegs';
    this.inventory.shrink(size);
    for (const it of back) this.inventory.add(it, 1);
    this.armor = null;
    this.grid = null;
    return null;
  }

  /** Ausrüstung aus dem Inventar ins Raster (ohne Lage: erster freier Platz). */
  insertEquipment(item: string, x?: number, y?: number): string | null {
    if (!this.grid) return 'Erst eine modulare Rüstung anlegen';
    if (!EQUIPMENT[item] || this.inventory.count(item) < 1) return 'Keine Ausrüstung';
    if (!this.grid.place(item, x, y)) return 'Kein Platz im Raster';
    this.inventory.remove(item, 1);
    return null;
  }

  /** Ausrüstung am Rasterfeld zurück ins Inventar. */
  removeEquipment(world: World, x: number, y: number): string | null {
    if (!this.grid) return null;
    const item = this.grid.removeAt(x, y);
    if (!item) return null;
    if (EQUIPMENT[item].kind === 'roboport' && this.personalRobotsOut(world) > this.grid.robotLimit) {
      this.grid.place(item, x, y);
      return 'Persönliche Roboter sind noch unterwegs';
    }
    if (this.inventory.add(item, 1) < 1) {
      this.grid.place(item, x, y);
      return 'Inventar voll';
    }
    return null;
  }

  personalRobotsOut(world: World): number {
    return world.robots.robots.filter((r) => r.personal).length;
  }

  // ------------------------------------------------------------- Kampf

  /**
   * Schaden an der Spielfigur. Zombietreffer (from) können eine blutende Wunde reißen oder infizieren.
   * Bei 0 Lebenspunkten Tod: endgültig oder Wiedereinstieg am Start (Karteneinstellung „Tod“).
   */
  damage(world: World, dmg: number, from?: UnitDef): void {
    if (this.dead || this.god) return;
    const a = this.armor ? ARMORS[this.armor] : null;
    // Rüstung: fester Abzug, dann Anteil
    if (a) dmg = Math.max(dmg * 0.1, (dmg - a.flat) * (1 - a.percent));
    this.hp -= dmg;
    this.lastHit = world.tick;
    this.wake();
    if (from && world.settings.needs) {
      const guard = a ? 1 - a.percent : 1;
      if (this.wounds.length < SURVIVAL.maxWounds && hash01(world.seed, world.tick, 71) < from.bleedChance * guard) {
        this.wounds.push(world.tick + SURVIVAL.bleedTicks);
        this.note('Du blutest – ein Verband stoppt die Blutung');
      }
      if (this.infection === null && hash01(world.seed, world.tick, 72) < from.infectChance * guard) {
        this.infection = 0;
        this.note('Du wurdest gebissen! Ohne Antibiotika endet das tödlich');
      }
    }
    if (this.hp <= 0) this.die(world, from ? `von einem ${from.name} getötet` : 'gestorben');
  }

  /** Tod der Figur. */
  die(world: World, cause: string): void {
    if (this.dead) return;
    world.events.push('playerdeath', this.x, this.y);
    // das Inventar bleibt in der Leiche am Todesort
    world.corpses.add(this.x, this.y, world.tick, this.inventory);
    this.mineTarget = null;
    this.searchTarget = null;
    this.sleeping = false;
    this.craftQueue.length = 0;
    this.wounds = [];
    this.infection = null;
    if (world.settings.death === 'endgueltig') {
      this.hp = 0;
      this.dead = true;
      this.deathTick = world.tick;
      this.deathCause = cause;
      return;
    }
    this.hp = PLAYER_COMBAT.health;
    this.hunger = Math.max(this.hunger, 50);
    this.thirst = Math.max(this.thirst, 50);
    this.fatigue = Math.min(this.fatigue, 40);
    this.px = 128;
    this.py = 128;
    this.prevPx = this.px;
    this.prevPy = this.py;
    this.note(`Du bist ${cause} – dein Inventar liegt in deiner Leiche (Rechtsklick holt es zurück)`);
  }

  // ------------------------------------------------------------- Überleben

  /** Hunger, Durst, Müdigkeit, Blutung, Infektion, Heilung. Ohne Bedürfnisse (Einstellung/Gottmodus) nur Heilung. */
  private updateSurvival(world: World): void {
    const S = SURVIVAL;
    const max = PLAYER_COMBAT.health;
    if (!world.settings.needs || this.god) {
      if (world.tick - this.lastHit > 600 && this.hp < max) this.hp = Math.min(max, this.hp + 0.05);
      return;
    }
    const work = this.sleeping ? 0.5 : this.walking || this.mineTarget ? S.workFactor : 1;
    this.hunger = Math.max(0, this.hunger - perTick(S.hungerDays) * work);
    this.thirst = Math.max(0, this.thirst - perTick(S.thirstDays) * work);
    if (this.sleeping) {
      this.fatigue = Math.max(0, this.fatigue - (this.inBed ? S.sleepRestBed : S.sleepRestGround));
      if (this.fatigue <= 0) {
        this.wake();
        this.note('Ausgeschlafen');
      } else if (world.tick % 30 === 0 && world.enemies.nearestTarget(this.x, this.y, S.wakeDistance, world.tick)) {
        this.wake();
        this.note('Du schreckst hoch – Zombies in der Nähe!');
      }
    } else this.fatigue = Math.min(100, this.fatigue + perTick(S.fatigueDays));
    if (world.tick % 60 !== 0) return;
    let cause = '';
    if (this.hunger <= 0) {
      this.hp -= S.starveDamagePerSecond;
      cause = 'verhungert';
    }
    if (this.thirst <= 0) {
      this.hp -= S.thirstDamagePerSecond;
      cause = 'verdurstet';
    }
    if (this.fatigue >= 100) {
      this.hp -= 0.3;
      cause ||= 'vor Erschöpfung zusammengebrochen';
    }
    this.wounds = this.wounds.filter((t) => t > world.tick);
    if (this.wounds.length) {
      this.hp -= S.bleedPerSecond * this.wounds.length;
      cause = 'verblutet';
    }
    if (this.infection !== null) {
      this.infection += 60 / (S.infectionDays * DAY.ticks);
      if (this.infection >= 1) {
        this.die(world, 'der Infektion erlegen');
        return;
      }
    }
    if (this.hp <= 0) {
      this.die(world, cause || 'gestorben');
      return;
    }
    if (this.hunger > S.healAbove && this.thirst > S.healAbove && !this.wounds.length && (this.infection ?? 0) < S.feverFrom && this.hp < max) {
      this.hp = Math.min(max, this.hp + S.healPerSecond * (this.sleeping ? 2 : 1));
    }
    this.warn(0, 100 - this.hunger, ['Du hast Hunger', 'Du verhungerst – iss etwas!']);
    this.warn(1, 100 - this.thirst, ['Du hast Durst', 'Du verdurstest – trink etwas!']);
    this.warn(2, this.fatigue, ['Du bist müde (Z: schlafen)', 'Du kannst dich kaum noch auf den Beinen halten']);
    this.warn(3, (this.infection ?? 0) * 100 + 25, ['Du hast Fieber – die Bisswunde hat sich entzündet', 'Das Fieber steigt – ohne Antibiotika bleibt wenig Zeit']);
  }

  /** Warnmeldung beim Überschreiten von 75 bzw. 92 (Wert 0 gut … 100 schlecht), einmal je Stufe. */
  private warn(i: number, v: number, msg: [string, string]): void {
    const level = v >= 92 ? 2 : v >= 75 ? 1 : 0;
    if (level > this.warned[i]) this.note(msg[level - 1]);
    this.warned[i] = level;
  }

  /** Lauf- und Arbeitstempo: müde, fiebrig oder ausgehungert ist die Figur langsamer. */
  get condition(): number {
    let f = 1;
    if (this.fatigue >= SURVIVAL.tiredFrom) f *= SURVIVAL.tiredSpeed;
    if ((this.infection ?? 0) >= SURVIVAL.feverFrom) f *= SURVIVAL.feverSpeed;
    if (this.hunger <= 0 || this.thirst <= 0) f *= 0.85;
    return f;
  }

  /** Schlafen legen (im Feldbett daneben oder auf dem Boden). Liefert eine Meldung, wenn es nicht geht. */
  sleep(world: World): string | null {
    if (this.dead) return null;
    if (this.sleeping) {
      this.wake();
      return null;
    }
    if (world.settings.needs && this.fatigue < SURVIVAL.sleepFrom) return 'Du bist nicht müde';
    if (world.enemies.nearestTarget(this.x, this.y, SURVIVAL.wakeDistance, world.tick)) return 'Zombies in der Nähe – hier kannst du nicht schlafen';
    this.inBed = false;
    for (let ty = Math.floor(this.y - 1.5); ty <= Math.floor(this.y + 1.5) && !this.inBed; ty++) {
      for (let tx = Math.floor(this.x - 1.5); tx <= Math.floor(this.x + 1.5); tx++) {
        if (world.entityAt(tx, ty)?.kind === 'bed') {
          this.inBed = true;
          break;
        }
      }
    }
    this.sleeping = true;
    this.mineTarget = null;
    this.searchTarget = null;
    this.note(this.inBed ? 'Du legst dich ins Feldbett' : 'Du legst dich auf den Boden (ein Feldbett wäre erholsamer)');
    return null;
  }

  wake(): void {
    this.sleeping = false;
  }

  /** Gegenstand benutzen (essen, trinken, verbinden). Liefert eine Meldung, wenn es nicht geht. */
  use(world: World, item: string): string | null {
    const c = CONSUMABLES[item];
    if (!c || this.dead) return 'Nicht benutzbar';
    if (!this.god && this.inventory.count(item) < 1) return 'Nicht im Inventar';
    const max = PLAYER_COMBAT.health;
    if (c.cure && this.infection === null) return 'Du bist nicht infiziert';
    if (c.bandage && !c.hunger && !this.wounds.length && this.hp >= max) return 'Du bist nicht verletzt';
    if (c.hunger && c.hunger > 0 && !c.thirst && this.hunger >= 99) return 'Du bist satt';
    if (c.returns && !this.god && this.inventory.space(c.returns) < 1 && this.inventory.count(item) > 1) return 'Inventar voll';
    if (!this.god) this.inventory.remove(item, 1);
    this.onUsed(item, 1);
    if (c.hunger) this.hunger = Math.max(0, Math.min(100, this.hunger + c.hunger));
    if (c.thirst) this.thirst = Math.max(0, Math.min(100, this.thirst + c.thirst));
    if (c.rest) this.fatigue = Math.max(0, this.fatigue - c.rest);
    if (c.heal) this.hp = Math.min(max, this.hp + c.heal);
    if (c.bandage) this.wounds.splice(0, c.bandage);
    if (c.cure) {
      this.infection = null;
      this.warned[3] = 0;
    }
    if (c.returns && !this.god) this.inventory.add(c.returns, 1);
    world.events.push('use', this.x, this.y, { item });
    this.note(`${ITEMS[item]?.name ?? item} ${c.verb}`);
    return null;
  }

  /** Leere Flaschen an einem Wasserfeld in Reichweite füllen. Liefert die Zahl der gefüllten Flaschen. */
  fillBottles(world: World, tx: number, ty: number): number {
    if (!world.map.isWater(tx, ty) || !this.canReachResource(tx, ty)) return 0;
    const n = this.inventory.count('empty-bottle');
    if (n < 1) return 0;
    this.inventory.remove('empty-bottle', n);
    const added = this.inventory.add('water-bottle', n);
    if (added < n) this.inventory.add('empty-bottle', n - added);
    if (added > 0) this.note(`${added}× Wasserflasche gefüllt`);
    return added;
  }

  /** Fundort durchsuchen (Linksklick): läuft, solange die Figur daneben steht. */
  search(world: World, id: number): string | null {
    const e = world.entities.get(id);
    if (!e || e.kind !== 'loot') return null;
    if (e.searched) return null;
    if (this.distanceToRect(e.x, e.y, e.w, e.h) > PLAYER.searchDistance) return 'Zu weit weg zum Durchsuchen';
    this.searchTarget = id;
    return null;
  }

  private updateSearch(world: World): void {
    const id = this.searchTarget;
    if (id === null) return;
    const e = world.entities.get(id);
    if (!e || e.kind !== 'loot' || e.searched || this.distanceToRect(e.x, e.y, e.w, e.h) > PLAYER.searchDistance) {
      this.searchTarget = null;
      return;
    }
    if (++e.searchProgress >= (this.god ? 1 : e.searchTicks)) {
      e.searched = true;
      this.searchTarget = null;
      world.events.push('search', e.cx, e.cy, { id: e.id });
      this.note(e.inventory.isEmpty() ? `${e.def.name}: nichts Brauchbares` : `${e.def.name} durchsucht`);
    }
  }

  distanceToRect(x: number, y: number, w: number, h: number): number {
    const dx = Math.max(x - this.x, 0, this.x - (x + w));
    const dy = Math.max(y - this.y, 0, this.y - (y + h));
    return Math.hypot(dx, dy);
  }

  saveSurvival() {
    return {
      hu: this.hunger, th: this.thirst, fa: this.fatigue, wo: [...this.wounds], inf: this.infection, sl: this.sleeping, bed: this.inBed,
      dead: this.dead, dt: this.deathTick, dc: this.deathCause, mw: { ...this.meleeWear }, ug: this.useGun, wa: [...this.warned], st: this.searchTarget,
    };
  }

  loadSurvival(d: ReturnType<Player['saveSurvival']> | undefined): void {
    if (!d) {
      // Spielstand ohne Überlebenswerte: satt und ausgeruht
      this.hunger = this.thirst = 100;
      this.fatigue = 0;
      return;
    }
    this.hunger = d.hu;
    this.thirst = d.th;
    this.fatigue = d.fa;
    this.wounds = [...d.wo];
    this.infection = d.inf;
    this.sleeping = d.sl;
    this.inBed = d.bed;
    this.dead = d.dead;
    this.deathTick = d.dt;
    this.deathCause = d.dc;
    this.meleeWear = { ...d.mw };
    this.useGun = d.ug;
    this.warned = [...d.wa];
    this.searchTarget = d.st;
  }

  private updateRepair(world: World): void {
    const id = this.repairTarget;
    if (id === null) return;
    const e = world.entities.get(id);
    if (!e || e.hp >= e.def.health || !this.canReach(e.cx, e.cy) || this.inventory.count('repair-pack') === 0) {
      this.repairTarget = null;
      return;
    }
    const heal = Math.min(REPAIR.perTick, e.def.health - e.hp);
    e.hp += heal;
    this.repairUsed += heal;
    if (this.repairUsed >= REPAIR.durability) {
      this.repairUsed -= REPAIR.durability;
      this.inventory.remove('repair-pack', 1);
      world.stats.used('repair-pack', 1);
    }
  }

  /** Schusswaffe: Maschinenpistole, wenn vorhanden, sonst Pistole. */
  get weapon(): 'submachine-gun' | 'pistol' | null {
    if (this.inventory.count('submachine-gun') > 0) return 'submachine-gun';
    if (this.inventory.count('pistol') > 0) return 'pistol';
    return null;
  }

  /** Beste Nahkampfwaffe im Inventar (Reihenfolge in MELEE), sonst null (Fäuste). */
  get meleeWeapon(): string | null {
    for (const id of Object.keys(MELEE)) if (this.inventory.count(id) > 0) return id;
    return null;
  }

  /** Munition im Inventar oder im angebrochenen Magazin. */
  get hasAmmo(): boolean {
    return this.rounds > 0 || Object.keys(AMMO).some((a) => this.inventory.count(a) > 0);
  }

  private updateCombat(world: World): void {
    this.updateRepair(world);
    if (this.gunCd > 0) this.gunCd--;
    if (this.meleeCd > 0) this.meleeCd--;
    if (!this.shooting) return;
    const wpn = this.weapon;
    if (this.useGun && wpn && this.hasAmmo) this.shoot(world, wpn);
    else this.strike(world);
  }

  private shoot(world: World, wpn: 'submachine-gun' | 'pistol'): void {
    if (this.gunCd > 0) return;
    const W = WEAPONS[wpn];
    const t = world.enemies.nearestTarget(this.x, this.y, W.range, world.tick);
    if (!t) return;
    if (this.rounds === 0) {
      const it = Object.keys(AMMO).reverse().find((a) => this.inventory.count(a) > 0)!;
      this.inventory.remove(it, 1);
      world.stats.used(it, 1);
      this.rounds = AMMO[it].rounds;
      this.roundsItem = it;
    }
    this.rounds--;
    this.gunCd = Math.max(1, Math.round(W.cooldown / (1 + world.research.bonus('shooting-speed'))));
    this.lastShot = world.tick;
    this.shotX = t.x;
    this.shotY = t.y;
    world.events.push('shot', this.x, this.y);
    world.noise.emit(this.x, this.y, W.noise);
    world.enemies.damageTarget(world, t, AMMO[this.roundsItem!].damage * (1 + world.research.bonus('bullet-damage')), { x: this.x, y: this.y });
    if (this.rounds === 0) this.roundsItem = null;
  }

  /** Nahkampf: Schlag auf den nächsten Zombie in Reichweite; betäubt kurz, nutzt die Waffe ab, ist leise. */
  private strike(world: World): void {
    if (this.meleeCd > 0) return;
    const item = this.meleeWeapon;
    const M: MeleeDef = item ? MELEE[item] : FISTS;
    const t = world.enemies.nearestTarget(this.x, this.y, M.reach + 0.35, world.tick);
    if (!t) return;
    this.meleeCd = Math.round(M.cooldown / this.condition);
    this.lastMelee = world.tick;
    this.meleeAngle = Math.atan2(t.y - this.y, t.x - this.x);
    world.events.push('melee', t.x, t.y);
    world.noise.emit(this.x, this.y, NOISE.melee);
    world.enemies.damageTarget(world, t, M.damage, { x: this.x, y: this.y }, ZOMBIE.stunTicks);
    if (item && !this.god) {
      const used = (this.meleeWear[item] ?? 0) + 1;
      if (used >= M.durability) {
        this.inventory.remove(item, 1);
        world.stats.used(item, 1);
        delete this.meleeWear[item];
        this.note(`${ITEMS[item].name} ist zerbrochen`);
      } else this.meleeWear[item] = used;
    }
  }

  /** Nächstes Bodenitem im Umkreis aufheben. */
  pickUpGround(world: World): boolean {
    const near = world.groundNear(this.x, this.y, PLAYER.groundPickupDistance);
    near.sort((a, b) => Math.hypot(a.g.x / SUB - this.x, a.g.y / SUB - this.y) - Math.hypot(b.g.x / SUB - this.x, b.g.y / SUB - this.y));
    for (const { key, g } of near) {
      if (this.inventory.add(g.item, 1) === 1) {
        world.removeGround(key, g);
        return true;
      }
    }
    return false;
  }

  /** Nächstes Item von einem Band in Reichweite aufnehmen (F halten, wie im Original). */
  pickUpBelt(world: World): boolean {
    const r = PLAYER.beltPickupDistance;
    const tiles: { tx: number; ty: number; d: number }[] = [];
    for (let ty = Math.floor(this.y - r); ty <= Math.floor(this.y + r); ty++) {
      for (let tx = Math.floor(this.x - r); tx <= Math.floor(this.x + r); tx++) {
        const d = Math.hypot(tx + 0.5 - this.x, ty + 0.5 - this.y);
        if (d <= r) tiles.push({ tx, ty, d });
      }
    }
    tiles.sort((a, b) => a.d - b.d);
    for (const { tx, ty } of tiles) {
      const t = world.belts.tileAt(tx, ty);
      if (!t) continue;
      const idx = world.belts.takeFromTile(t, (i) => this.inventory.space(ITEM_IDS[i]) > 0);
      if (idx >= 0) {
        this.inventory.add(ITEM_IDS[idx], 1);
        return true;
      }
    }
    return false;
  }

  /** Ein Item aus dem Inventar an einer Stelle auf den Boden (oder in ein Gebäude/Band) legen. */
  dropItem(world: World, item: string, px: number, py: number): boolean {
    if (this.inventory.count(item) < 1 || !this.canReach(px, py)) return false;
    if (!world.deliverAt(px, py, item, 'player', true)) return false;
    this.inventory.remove(item, 1);
    return true;
  }

  private updateMovement(world: World): void {
    let mx = Math.sign(this.moveX);
    let my = Math.sign(this.moveY);
    this.walking = mx !== 0 || my !== 0;
    if (!this.walking) return;
    if (mx !== 0 || my !== 0) this.facing = my < 0 ? 0 : my > 0 ? 2 : mx > 0 ? 1 : 3;
    // Bodenbelag unter der Figur beschleunigt (Wiki: Steinpflaster 130 %, Beton 140 %, veredelter Beton 150 %)
    const floor = world.map.floorAt(Math.floor(this.x), Math.floor(this.y));
    const fs = floor ? FLOOR_BY_ID[floor].speed : 1;
    // eigener Stacheldraht bremst auch die Figur
    const wire = world.entityAt(this.x, this.y)?.kind === 'wire' ? HAZARD.wire.slow + 0.2 : 1;
    const speed = Math.round(PLAYER.runningSpeed * SUB * fs * wire * this.condition * (this.god ? GOD.runningFactor : 1));
    // Diagonal: 181/256 ≈ 1/√2
    const diag = mx !== 0 && my !== 0;
    const step = diag ? Math.round((speed * 181) / 256) : speed;
    const nx = this.px + mx * step;
    if (!this.collides(world, nx, this.py)) this.px = nx;
    else mx = 0;
    const ny = this.py + my * step;
    if (!this.collides(world, this.px, ny)) this.py = ny;
    else my = 0;
    // Bewegung bricht Abbau ab
    if (mx !== 0 || my !== 0) {
      if (this.mineTarget) this.mineProgress = 0;
    }
  }

  private collides(world: World, px: number, py: number): boolean {
    const r = PLAYER.radius;
    const x = px / SUB;
    const y = py / SUB;
    for (let ty = Math.floor(y - r); ty <= Math.floor(y + r); ty++) {
      for (let tx = Math.floor(x - r); tx <= Math.floor(x + r); tx++) {
        if (world.map.isBlocked(tx, ty)) return true;
        const e = world.entityAt(tx, ty);
        const ed = e ? entityDef(e.name) : null;
        if (e && ed!.solid && !ed!.walkable) {
          // Spieler, die bereits darin stehen (z. B. nach dem Bauen), dürfen hinaus
          const cur = world.entityAt(Math.floor(this.x), Math.floor(this.y));
          if (cur === e) continue;
          return true;
        }
      }
    }
    return false;
  }

  // ------------------------------------------------------------- Abbauen

  setMineTarget(t: MineTarget | null): void {
    const same =
      t && this.mineTarget && t.kind === this.mineTarget.kind &&
      (t.kind === 'resource'
        ? this.mineTarget.kind === 'resource' && t.x === this.mineTarget.x && t.y === this.mineTarget.y
        : t.kind === 'tree'
          ? this.mineTarget.kind === 'tree' && t.cx === this.mineTarget.cx && t.cy === this.mineTarget.cy && t.i === this.mineTarget.i
          : t.kind === 'floor'
            ? this.mineTarget.kind === 'floor' && t.x === this.mineTarget.x && t.y === this.mineTarget.y
            : t.kind === 'corpse'
              ? this.mineTarget.kind === 'corpse' && t.id === this.mineTarget.id
              : this.mineTarget.kind === 'entity' && t.id === this.mineTarget.id);
    if (same) return;
    // Zeiger rutscht auf ein Nachbarfeld desselben Rohstoffs: Fortschritt behalten (kein Neustart des Balkens)
    if (t?.kind === 'resource' && this.mineTarget?.kind === 'resource' && t.res !== undefined && t.res === this.mineTarget.res) {
      this.mineTarget = t;
      return;
    }
    this.mineTarget = t;
    this.mineProgress = 0;
    this.mineTotal = 0;
  }

  canReachResource(x: number, y: number): boolean {
    // Abstand zum nächsten Punkt des Feldes
    const cx = Math.max(x, Math.min(this.x, x + 1));
    const cy = Math.max(y, Math.min(this.y, y + 1));
    return Math.hypot(this.x - cx, this.y - cy) <= PLAYER.resourceReachDistance * (this.god ? GOD.reachFactor : 1);
  }

  canReach(x: number, y: number): boolean {
    return this.distanceTo(x, y) <= this.reach;
  }

  /** Reichweite zum Bauen und Öffnen (Felder). */
  get reach(): number {
    return PLAYER.reachDistance * (this.god ? GOD.reachFactor : 1);
  }
  get buildDistance(): number {
    return PLAYER.buildDistance * (this.god ? GOD.reachFactor : 1);
  }
  /** Abbautempo: im Gottmodus fast sofort (Bäume, Gebäude). */
  /** Forschung „Stahlaxt“: +100 % Abbautempo der Figur (Wiki). */
  miningBonus = 0;
  private mineTicks(seconds: number): number {
    return this.god ? 1 : Math.max(1, secondsToTicks(seconds / (PLAYER.miningSpeed * (1 + this.miningBonus) * this.condition)));
  }

  private updateMining(world: World): void {
    const t = this.mineTarget;
    if (!t) return;
    if (t.kind === 'tree') {
      const tree = world.map.trees.treeAt(Math.floor(t.x), Math.floor(t.y));
      if (!tree || tree.i !== t.i || !this.canReach(t.x, t.y)) {
        this.mineProgress = 0;
        if (!tree || tree.i !== t.i) this.mineTarget = null;
        return;
      }
      const kind = MAPGEN.trees.kinds[tree.kind];
      if (this.inventory.space('wood') < kind.wood) {
        this.note('Inventar voll');
        return;
      }
      this.mineTotal = this.mineTicks(kind.mineTime / (this.inventory.count('axe') > 0 ? MELEE.axe.chop! : 1));
      if (++this.mineProgress >= this.mineTotal) {
        this.mineProgress = 0;
        world.events.push('tree', tree.x, tree.y, { item: 'wood' });
        world.noise.emit(tree.x, tree.y, NOISE.chop);
        if (world.map.trees.remove(tree.cx, tree.cy, tree.i)) {
          this.inventory.add('wood', kind.wood);
          world.stats.made('wood', kind.wood);
        }
        this.mineTarget = null;
      }
      return;
    }
    if (t.kind === 'corpse') {
      const c = world.corpses.get(t.id);
      if (!c || !this.canReach(c.x, c.y)) {
        this.mineProgress = 0;
        if (!c) this.mineTarget = null;
        return;
      }
      this.mineTotal = this.mineTicks(CORPSE_MINE_TIME);
      if (++this.mineProgress >= this.mineTotal) {
        this.mineProgress = 0;
        world.corpses.loot(t.id, this.inventory);
        if (world.corpses.get(t.id)) this.note('Inventar voll – Rest bleibt in der Leiche');
        this.mineTarget = null;
      }
      return;
    }
    if (t.kind === 'floor') {
      const id = world.map.floorAt(t.x, t.y);
      if (!id || !this.canReach(t.x + 0.5, t.y + 0.5)) {
        this.mineProgress = 0;
        if (!id) this.mineTarget = null;
        return;
      }
      const item = FLOOR_BY_ID[id].item;
      if (this.inventory.space(item) < 1) {
        this.note('Inventar voll');
        return;
      }
      this.mineTotal = this.mineTicks(FLOOR.mineTime);
      if (++this.mineProgress >= this.mineTotal) {
        this.mineProgress = 0;
        if (world.removeFloor(t.x, t.y)) this.inventory.add(item, 1);
        this.mineTarget = null;
      }
      return;
    }
    if (t.kind === 'resource') {
      const r = world.map.resourceAt(t.x, t.y);
      if (r.amount === 0 || !this.canReachResource(t.x, t.y)) {
        this.mineProgress = 0;
        return;
      }
      const def = RESOURCE_BY_INDEX[r.res]!;
      if (def.requiresFluid) {
        // Wiki „Uranium ore“: nicht von Hand, nur elektrischer Bohrer mit Schwefelsäure
        this.note(`${def.name}: nur mit elektrischem Bohrer und Schwefelsäure abbaubar`);
        this.mineTarget = null;
        return;
      }
      if (this.inventory.space(def.result) < 1) {
        this.note('Inventar voll');
        return;
      }
      if (this.god) {
        // Gottmodus: GOD.minePerSecond Stück je Sekunde vom selben Feld
        this.mineTotal = 1;
        this.godAcc += GOD.minePerSecond;
        while (this.godAcc >= 60) {
          this.godAcc -= 60;
          if (this.inventory.space(def.result) < 1 || !world.map.mineOne(t.x, t.y)) break;
          this.inventory.add(def.result, 1);
          world.stats.made(def.result, 1);
        }
        return;
      }
      this.mineTotal = secondsToTicks(def.miningTime / (PLAYER.miningSpeed * (1 + this.miningBonus) * PLAYER.handMiningFactor));
      if (++this.mineProgress >= this.mineTotal) {
        this.mineProgress = 0;
        world.events.push('mine', t.x + 0.5, t.y + 0.5, { item: def.result });
        world.noise.emit(this.x, this.y, NOISE.mine);
        if (world.map.mineOne(t.x, t.y)) {
          this.inventory.add(def.result, 1);
          world.stats.made(def.result, 1);
        }
      }
    } else {
      const e = world.entities.get(t.id);
      if (!e) {
        this.mineTarget = null;
        return;
      }
      const def = entityDef(e.name);
      if (!this.canReach(e.cx, e.cy)) {
        this.mineProgress = 0;
        return;
      }
      // Fundorte ausschlachten: nur aus der Nähe, mit Brecheisen schneller, und es macht Lärm
      const loot = e.kind === 'loot';
      if (loot && this.distanceToRect(e.x, e.y, e.w, e.h) > PLAYER.searchDistance) {
        this.mineProgress = 0;
        return;
      }
      this.mineTotal = this.mineTicks(def.mineTime / (loot && this.inventory.count('crowbar') > 0 ? MELEE.crowbar.dismantle! : 1));
      if (loot && this.mineProgress % 60 === 30) world.noise.emit(e.cx, e.cy, NOISE.chop);
      if (++this.mineProgress >= this.mineTotal) {
        this.mineProgress = 0;
        const rec = { name: e.name, x: e.x, y: e.y, dir: e.dir };
        world.events.push('remove', e.cx, e.cy, { item: def.item });
        if (this.pickUpEntity(world, t.id) && !loot) this.minedLog.push(rec);
        this.mineTarget = null;
      }
    }
  }

  /** Gebäude aufnehmen (inkl. Inhalt). Was nicht passt, geht verloren wird vermieden: Abbruch. */
  pickUpEntity(world: World, id: number): boolean {
    const e = world.entities.get(id);
    if (!e) return false;
    const def = entityDef(e.name);
    if (this.inventory.space(def.item) < 1) {
      this.note('Inventar voll');
      return false;
    }
    const items = world.remove(id);
    for (const s of items) {
      const added = this.inventory.add(s.item, s.count);
      if (added < s.count) this.note(`${s.count - added}× ${ITEMS[s.item]?.name ?? s.item} verloren (Inventar voll)`);
    }
    return true;
  }

  // ------------------------------------------------------------- Handwerk

  /** Wieviele Exemplare per Hand herstellbar sind (inkl. Zwischenprodukten). */
  craftableCount(recipeId: string): number {
    const r = RECIPES[recipeId];
    if (!r || r.category !== 'crafting' || !this.recipeUnlocked(r.id)) return 0;
    let n = 0;
    const stock = this.stock();
    while (n < 500 && this.plan(r, stock)) n++;
    return n;
  }

  private stock(): Map<string, number> {
    const m = new Map<string, number>();
    for (const s of this.inventory.contents()) m.set(s.item, s.count);
    return m;
  }

  /**
   * Plant eine Herstellung gegen den (veränderten) Vorrat. Fehlende Zutaten werden über
   * Zwischenrezepte ergänzt. Liefert die Aufträge (Zwischenprodukte zuerst) oder null.
   */
  private plan(r: RecipeDef, stock: Map<string, number>, depth = 0): string[] | null {
    if (depth > 8) return null;
    const jobs: string[] = [];
    const backup = new Map(stock);
    for (const ing of r.ingredients) {
      let have = stock.get(ing.item) ?? 0;
      while (have < ing.amount) {
        const found = craftingRecipeFor(ing.item);
        const sub = found && this.recipeUnlocked(found.id) ? found : undefined;
        const p = sub ? this.plan(sub, stock, depth + 1) : null;
        if (!sub || !p) {
          restore(stock, backup);
          return null;
        }
        jobs.push(...p);
        have = (stock.get(ing.item) ?? 0) + sub.results.find((x) => x.item === ing.item)!.amount;
        stock.set(ing.item, have);
      }
      stock.set(ing.item, have - ing.amount);
    }
    jobs.push(r.id);
    return jobs;
  }

  /** Herstellung einreihen. Zutaten werden sofort aus dem Inventar entnommen. */
  craft(recipeId: string, count = 1): number {
    const r = RECIPES[recipeId];
    if (!r || r.category !== 'crafting' || !this.recipeUnlocked(r.id)) return 0;
    let done = 0;
    for (let i = 0; i < count; i++) {
      const before = this.stock();
      const after = new Map(before);
      const jobs = this.plan(r, after);
      if (!jobs) break;
      // Rohverbrauch = Vorrat vorher - nachher (Zwischenprodukte gleichen sich aus)
      const raw: [string, number][] = [];
      for (const [item, n] of before) {
        const d = n - (after.get(item) ?? 0);
        if (d > 0) raw.push([item, d]);
      }
      for (const [item, amt] of raw) this.inventory.remove(item, amt);
      jobs.forEach((j, k) => {
        const last = k === jobs.length - 1;
        this.craftQueue.push({
          recipe: j,
          ticks: Math.max(1, secondsToTicks(RECIPES[j].time / (PLAYER.craftingSpeed * (this.god ? GOD.craftingSpeed : 1)))),
          toInventory: last,
          refund: last ? raw : undefined,
        });
      });
      done++;
    }
    return done;
  }

  private updateCrafting(world: World): void {
    const job = this.craftQueue[0];
    if (!job) return;
    if (--job.ticks > 0) return;
    this.craftQueue.shift();
    world.events.push('craft', this.x, this.y);
    for (const ing of RECIPES[job.recipe].ingredients) this.onUsed(ing.item, ing.amount);
    for (const res of RECIPES[job.recipe].results) this.onCrafted(res.item, res.amount);
    if (!job.toInventory) return; // Zwischenprodukt wird vom folgenden Auftrag verbraucht
    for (const res of RECIPES[job.recipe].results) {
      const added = this.inventory.add(res.item, res.amount);
      if (added < res.amount) {
        // Inventar voll: Rest fällt neben die Figur (geht nicht verloren)
        for (let k = added; k < res.amount; k++) world.spill(this.x, this.y, res.item);
        this.note('Inventar voll – Ergebnis liegt auf dem Boden');
      }
    }
  }

  /** Warteschlange abbrechen und Zutaten erstatten. */
  cancelCrafting(): void {
    for (const j of this.craftQueue) if (j.refund) for (const [item, amt] of j.refund) this.inventory.add(item, amt);
    this.craftQueue.length = 0;
  }

  note(msg: string): void {
    if (this.messages[this.messages.length - 1] !== msg) this.messages.push(msg);
    if (this.messages.length > 5) this.messages.shift();
  }
}

function restore(stock: Map<string, number>, backup: Map<string, number>): void {
  stock.clear();
  for (const [k, v] of backup) stock.set(k, v);
}
