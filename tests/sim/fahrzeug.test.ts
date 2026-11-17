import { describe, expect, it } from 'vitest';
import { CAR } from '../../src/data/vehicles';
import { LEGACY_MAP_SETTINGS } from '../../src/data/mapgen';
import { Player } from '../../src/sim/player';
import { deserializeWorld, serializeWorld } from '../../src/sim/serialize';
import { World } from '../../src/sim/world';

function arena(): World {
  const w = new World(5, { ...LEGACY_MAP_SETTINGS });
  for (let y = -40; y < 40; y++) for (let x = -60; x < 60; x++) {
    w.map.setWater(x, y, false);
    w.map.setResource(x, y, 0, 0);
  }
  w.map.clearTrees(-60, -40, 60, 40);
  return w;
}

function driver(w: World): Player {
  const p = new Player(0.5, 0.5);
  w.player = p;
  return p;
}

describe('Pritschenwagen', () => {
  it('Wrack braucht Teile; repariert steht ein fahrbarer Wagen da', () => {
    const w = arena();
    const p = driver(w);
    const wreck = w.place('pickup-wreck', 3, 3, 0)!;
    expect(w.cars.repair(w, wreck, p)).toMatch(/fehlen/);
    for (const r of CAR.repair) p.inventory.add(r.item, r.amount);
    expect(w.cars.repair(w, wreck, p)).toBeNull();
    expect(w.entities.get(wreck.id)).toBeUndefined();
    expect(w.cars.cars.length).toBe(1);
    for (const r of CAR.repair) expect(p.inventory.count(r.item)).toBe(0);
  });

  it('fährt mit Benzin geradeaus, ohne Benzin nicht; Aussteigen setzt die Figur neben den Wagen', () => {
    const w = arena();
    const p = driver(w);
    const c = w.cars.spawn(2, 0.5, 0);
    expect(w.cars.toggle(w, p)).toMatch(/Tank/);
    expect(p.inCar).toBe(true);
    p.moveY = -1;
    w.run(120);
    expect(c.x).toBeCloseTo(2, 5);
    w.cars.toggle(w, p);
    c.fuel.fuel.add('fuel-can', 1);
    w.cars.toggle(w, p);
    w.run(240);
    expect(c.x).toBeGreaterThan(30);
    expect(p.x).toBeCloseTo(c.x, 0);
    p.moveY = 0;
    w.run(300);
    expect(c.speed).toBeLessThan(0.02);
    w.cars.toggle(w, p);
    expect(p.inCar).toBe(false);
    expect(Math.hypot(p.x - c.x, p.y - c.y)).toBeGreaterThan(1);
  });

  it('Lenken dreht, Mauern stoppen (mit Blechschaden)', () => {
    const w = arena();
    const p = driver(w);
    const c = w.cars.spawn(0.5, 0.5, 0);
    c.fuel.fuel.add('fuel-can', 1);
    for (let y = -6; y <= 6; y++) w.place('stone-wall', 14, y, 0);
    w.cars.toggle(w, p);
    p.moveY = -1;
    w.run(400);
    expect(c.x).toBeLessThan(14);
    expect(c.hp).toBeLessThan(CAR.health);
    p.moveX = 1;
    p.moveY = 1;
    w.run(60);
    p.moveY = -1;
    w.run(60);
    expect(c.angle).not.toBe(0);
  });

  it('überfährt Zombies', () => {
    const w = arena();
    const p = driver(w);
    const c = w.cars.spawn(0.5, 0.5, 0);
    c.fuel.fuel.add('fuel-can', 1);
    const u = w.enemies.spawnAt(25, 0.5, 'walker');
    w.cars.toggle(w, p);
    p.moveY = -1;
    w.run(300);
    expect(w.enemies.units.get(u.id)).toBeUndefined();
  });

  it('Speichern/Laden setzt die Fahrt exakt fort', () => {
    const w = arena();
    const p = driver(w);
    const c = w.cars.spawn(0.5, 0.5, 0.3);
    c.fuel.fuel.add('fuel-can', 2);
    c.cargo.add('iron-plate', 7);
    w.cars.toggle(w, p);
    p.moveY = -1;
    p.moveX = 1;
    w.run(90);
    const w2 = deserializeWorld(serializeWorld(w));
    w2.player!.moveY = -1;
    w2.player!.moveX = 1;
    w.run(120);
    w2.run(120);
    expect(serializeWorld(w2)).toEqual(serializeWorld(w));
    expect(w2.player!.inCar).toBe(true);
    expect(w2.cars.cars[0].cargo.count('iron-plate')).toBe(7);
  });
});
