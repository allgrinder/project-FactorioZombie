import { CAR } from '../data/vehicles';
import { ITEMS } from '../data/items';
import { Burner } from './burner';
import { type InvData, Inventory } from './inventory';
import type { Entity } from './machines';
import type { Player } from './player';
import type { World } from './world';

/** Pritschenwagen: Lage (Feldmitte), Richtung (Bogenmaß, 0 = Osten, y nach Süden), Tempo (Felder je Tick). */
export interface Car {
  readonly id: number;
  x: number;
  y: number;
  angle: number;
  speed: number;
  hp: number;
  readonly fuel: Burner;
  readonly cargo: Inventory;
  /** Motor läuft (Darstellung, Lärm). */
  running: boolean;
}

/**
 * Fahrzeuge (eigene Idee): Der defekte Pritschenwagen am Startfundort wird mit Platten, Zahnrädern und Kabeln
 * repariert. Er fährt mit Benzinkanistern, auf Asphalt schneller als im Gelände, hat eine Ladefläche, schützt die
 * Insassen, überfährt Zombies – und ist laut. Ein- und aussteigen mit V.
 */
export class CarSystem {
  readonly cars: Car[] = [];
  /** Wagen, in dem die Figur sitzt. */
  driving: number | null = null;
  private nextId = 1;

  get(id: number): Car | undefined {
    return this.cars.find((c) => c.id === id);
  }

  /** Nächster Wagen im Umkreis. */
  near(x: number, y: number, r: number): Car | null {
    let best: Car | null = null;
    let bd = r;
    for (const c of this.cars) {
      const d = Math.hypot(c.x - x, c.y - y);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  }

  spawn(x: number, y: number, angle = 0): Car {
    const c: Car = { id: this.nextId++, x, y, angle, speed: 0, hp: CAR.health, fuel: new Burner(CAR.fuelSlots), cargo: new Inventory(CAR.cargoSlots), running: false };
    this.cars.push(c);
    return c;
  }

  /** Fehlende Teile für die Reparatur (leer: alles da). */
  missing(p: Player): { item: string; amount: number }[] {
    return CAR.repair.filter((r) => p.inventory.count(r.item) < r.amount).map((r) => ({ item: r.item, amount: r.amount - p.inventory.count(r.item) }));
  }

  /** Defekten Pritschenwagen reparieren: Teile verbrauchen, Wrack weg, fahrbarer Wagen an seiner Stelle. */
  repair(w: World, wreck: Entity, p: Player): string | null {
    if (wreck.name !== 'pickup-wreck') return 'Kein Wagen';
    const miss = this.missing(p);
    if (miss.length && !p.god) return `Für die Reparatur fehlen: ${miss.map((m) => `${m.amount}× ${ITEMS[m.item]?.name ?? m.item}`).join(', ')}`;
    if (!p.god) for (const r of CAR.repair) p.inventory.remove(r.item, r.amount);
    const cx = wreck.cx;
    const cy = wreck.cy;
    const keep = wreck.kind === 'loot' ? wreck.inventory.contents() : [];
    w.remove(wreck.id);
    const c = this.spawn(cx, cy, 0);
    for (const s of keep) c.cargo.add(s.item, s.count);
    w.events.push('build', cx, cy, { id: -1, w: 3, h: 2 });
    w.stats.made('repair.car', 1);
    p.note('Der Pritschenwagen läuft wieder! Benzinkanister in den Tank, mit V einsteigen');
    return null;
  }

  /** Ein- bzw. aussteigen (Taste V). Liefert eine Meldung, wenn es nicht geht. */
  toggle(w: World, p: Player): string | null {
    if (this.driving !== null) {
      const c = this.get(this.driving);
      this.driving = null;
      p.inCar = false;
      if (c) {
        // neben dem Wagen aussteigen (links in Fahrtrichtung, sonst irgendwo frei)
        for (const off of [Math.PI / 2, -Math.PI / 2, Math.PI, 0]) {
          const x = c.x + Math.cos(c.angle + off) * 1.4;
          const y = c.y + Math.sin(c.angle + off) * 1.4;
          if (blocked(w, x, y)) continue;
          p.px = p.prevPx = Math.round(x * 256);
          p.py = p.prevPy = Math.round(y * 256);
          break;
        }
        c.speed = 0;
        c.running = false;
      }
      return null;
    }
    const c = this.near(p.x, p.y, CAR.enterDistance);
    if (!c) return null;
    this.driving = c.id;
    p.inCar = true;
    p.mineTarget = null;
    p.searchTarget = null;
    p.sleeping = false;
    if (c.fuel.fuel.isEmpty() && c.fuel.energy <= 0) return 'Der Tank ist leer – Benzinkanister in den Wagen legen (Klick auf den Wagen)';
    return null;
  }

  update(w: World): void {
    const p = w.player;
    for (const c of [...this.cars]) {
      const driver = this.driving === c.id && p && !p.dead ? p : null;
      let throttle = driver ? -Math.sign(driver.moveY) : 0;
      const steer = driver ? Math.sign(driver.moveX) : 0;
      // Benzin: Vollgas voller Verbrauch, Leerlauf ein Zehntel
      if (driver) {
        const jpt = (CAR.power / 60) * (throttle !== 0 ? 1 : 0.1);
        c.running = c.fuel.consume(jpt);
        if (!c.running) throttle = 0;
      } else c.running = false;
      const road = w.map.floorAt(Math.floor(c.x), Math.floor(c.y)) > 0;
      const max = road ? CAR.maxRoad : CAR.maxField;
      if (throttle > 0) c.speed = c.speed < 0 ? Math.min(0, c.speed + CAR.brake) : Math.min(max, c.speed + CAR.accel);
      else if (throttle < 0) c.speed = c.speed > 0 ? Math.max(0, c.speed - CAR.brake) : Math.max(-CAR.maxReverse, c.speed - CAR.accel);
      else c.speed *= 1 - CAR.drag;
      if (c.speed > max) c.speed = Math.max(max, c.speed - CAR.brake);
      if (Math.abs(c.speed) < 0.002) c.speed = 0;
      c.angle += steer * CAR.turn * (c.speed / CAR.maxRoad);
      if (c.speed !== 0) this.drive(w, c);
      if (c.running && w.tick % 30 === 0) w.noise.emit(c.x, c.y, CAR.noise);
      if (driver) {
        driver.px = Math.round(c.x * 256);
        driver.py = Math.round(c.y * 256);
      }
      if (c.hp <= 0) this.wreck(w, c);
    }
  }

  /** Einen Schritt fahren: Hindernisse stoppen (Blechschaden), Zombies werden überfahren. */
  private drive(w: World, c: Car): void {
    const nx = c.x + Math.cos(c.angle) * c.speed;
    const ny = c.y + Math.sin(c.angle) * c.speed;
    // Prüfpunkte: Mitte, Front/Heck und Seiten
    const pts: [number, number][] = [[0, 0], [CAR.radius, 0], [-CAR.radius, 0], [0, CAR.radius * 0.6], [0, -CAR.radius * 0.6]];
    for (const [a, b] of pts) {
      const x = nx + Math.cos(c.angle) * a - Math.sin(c.angle) * b;
      const y = ny + Math.sin(c.angle) * a + Math.cos(c.angle) * b;
      if (blocked(w, x, y)) {
        const hit = Math.abs(c.speed);
        if (hit > 0.15) {
          c.hp -= hit * 120;
          w.events.push('hit', x, y);
        }
        c.speed = -c.speed * 0.25;
        return;
      }
    }
    c.x = nx;
    c.y = ny;
    const fast = Math.abs(c.speed);
    if (fast < 0.06) return;
    for (const u of w.enemies.near(c.x, c.y, CAR.radius + 0.35, w.tick)) {
      w.enemies.damageTarget(w, { kind: 'unit', id: u.id, x: u.x, y: u.y }, (CAR.ramDamage * fast) / CAR.maxRoad, undefined, 40);
      const live = w.enemies.units.get(u.id);
      if (live) {
        const a = Math.atan2(live.y - c.y, live.x - c.x);
        live.x += Math.cos(a) * 0.5;
        live.y += Math.sin(a) * 0.5;
      }
      c.speed *= 0.93;
      c.hp -= 2;
    }
  }

  /** Wagen zerstört: Ladung fällt heraus, Insassen steigen verletzt aus. */
  private wreck(w: World, c: Car): void {
    const p = w.player;
    if (this.driving === c.id && p) {
      this.toggle(w, p);
      p.damage(w, 25);
      p.note('Der Wagen ist hinüber');
    }
    for (const s of c.cargo.contents()) for (let i = 0; i < s.count; i++) w.spill(c.x, c.y, s.item);
    w.events.push('explode', c.x, c.y);
    w.enemies.remnants.push({ x: c.x, y: c.y, kind: 'building', size: 3, tick: w.tick, name: 'car-wreck', dir: 0 });
    this.cars.splice(this.cars.indexOf(c), 1);
  }

  serialize() {
    return {
      n: this.nextId, d: this.driving,
      c: this.cars.map((c) => [c.id, c.x, c.y, c.angle, c.speed, c.hp, c.fuel.serialize(), c.cargo.serialize()] as [number, number, number, number, number, number, ReturnType<Burner['serialize']>, InvData]),
    };
  }

  load(d: ReturnType<CarSystem['serialize']> | undefined): void {
    this.cars.length = 0;
    this.nextId = d?.n ?? 1;
    this.driving = d?.d ?? null;
    for (const [id, x, y, angle, speed, hp, fuel, cargo] of d?.c ?? []) {
      const c: Car = { id, x, y, angle, speed, hp, fuel: new Burner(CAR.fuelSlots), cargo: new Inventory(CAR.cargoSlots), running: false };
      c.fuel.load(fuel);
      c.cargo.load(cargo);
      this.cars.push(c);
    }
  }
}

/** Für den Wagen unpassierbar: Wasser, Klippen, Bäume, feste Gebäude (Tore und Masten nicht). */
function blocked(w: World, x: number, y: number): boolean {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (w.map.isBlocked(tx, ty) || w.map.trees.treeAt(tx, ty)) return true;
  const e = w.entityAt(tx, ty);
  return !!e && e.def.solid && !e.def.walkable;
}
