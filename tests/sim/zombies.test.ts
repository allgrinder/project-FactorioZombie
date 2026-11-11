import { describe, expect, it } from 'vitest';
import { HAZARD, HORDE, MELEE, NOISE, UNITS } from '../../src/data/enemies';
import { LEGACY_MAP_SETTINGS } from '../../src/data/mapgen';
import { DAY } from '../../src/data/time';
import { Status } from '../../src/sim/entity';
import { Player } from '../../src/sim/player';
import { deserializeWorld, serializeWorld } from '../../src/sim/serialize';
import { World } from '../../src/sim/world';

/** Freie Fläche ohne Wasser, Erz und Bäume; Zombies nur von Hand gesetzt. */
function arena(withPlayer = true): World {
  const w = new World(3, { ...LEGACY_MAP_SETTINGS, enemies: 'normal' });
  for (let y = -60; y < 60; y++) for (let x = -60; x < 60; x++) {
    w.map.setWater(x, y, false);
    w.map.setResource(x, y, 0, 0);
  }
  w.map.clearTrees(-60, -60, 60, 60);
  if (withPlayer) w.player = new Player(0.5, 0.5);
  return w;
}

describe('Zombies: Wahrnehmung und Angriff', () => {
  it('Schlurfer sieht die Figur, verfolgt sie und schlägt zu', () => {
    const w = arena();
    const u = w.enemies.spawnAt(7.5, 0.5, 'walker');
    w.run(20);
    expect(u.mode).toBe('chase');
    w.run(60 * 6);
    expect(w.player!.hp).toBeLessThan(100);
    expect(Math.hypot(u.x - 0.5, u.y - 0.5)).toBeLessThan(1.2);
  });

  it('außer Sicht bleibt er ruhig; nachts sieht er weniger weit', () => {
    const w = arena();
    const far = w.enemies.spawnAt(20.5, 0.5, 'walker');
    const mid = w.enemies.spawnAt(9.5, 0.5, 'walker');
    w.tick = Math.round(DAY.ticks * 0.5); // Mitternacht
    w.run(30);
    expect(far.mode).toBe('idle');
    expect(mid.mode).toBe('idle');
    w.tick = 0; // Mittag
    w.run(30);
    expect(mid.mode).toBe('chase');
    expect(far.mode).toBe('idle');
  });

  it('verliert die Spur, wenn die Figur weit genug weg ist', () => {
    const w = arena();
    const u = w.enemies.spawnAt(6.5, 0.5, 'walker');
    w.run(20);
    expect(u.mode).toBe('chase');
    const p = w.player!;
    p.px = 45 * 256;
    p.py = 45 * 256;
    w.run(60 * 12);
    expect(u.mode).not.toBe('chase');
  });

  it('Läufer sind fast so schnell wie die Figur, Brocken halten viel aus', () => {
    expect(UNITS.runner.speed).toBeGreaterThan(UNITS.walker.speed * 2);
    expect(UNITS.runner.speed).toBeLessThan(0.15);
    expect(UNITS.brute.health).toBeGreaterThan(UNITS.walker.health * 10);
    expect(UNITS.brute.structureDamage).toBeGreaterThan(UNITS.walker.structureDamage * 4);
  });
});

describe('Lärm', () => {
  it('ein Geräusch lockt ruhende Zombies in Hörweite an, andere nicht', () => {
    const w = arena(false);
    const near = w.enemies.spawnAt(22.5, 0.5, 'walker');
    const far = w.enemies.spawnAt(55.5, 0.5, 'walker');
    w.noise.emit(0.5, 0.5, 30);
    w.run(40);
    expect(near.mode).toBe('investigate');
    expect(far.mode).toBe('idle');
    w.run(60 * 12);
    expect(Math.hypot(near.x, near.y)).toBeLessThan(4);
    // am Ziel ist nichts: wieder ruhig
    expect(near.mode).toBe('idle');
  });

  it('Schüsse sind laut, Nahkampf ist leise', () => {
    expect(NOISE.pistol).toBeGreaterThan(NOISE.melee * 4);
    const w = arena();
    const p = w.player!;
    p.inventory.add('pistol', 1);
    p.inventory.add('firearm-magazine', 2);
    p.useGun = true;
    const target = w.enemies.spawnAt(8.5, 0.5, 'walker');
    const listener = w.enemies.spawnAt(0.5, 26.5, 'walker');
    p.shooting = true;
    w.run(45);
    expect(target.hp).toBeLessThan(UNITS.walker.health);
    expect(listener.mode).toBe('investigate');
  });

  it('arbeitende Maschinen lärmen: Zombies kommen und reißen sie ein', () => {
    const w = arena(false);
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) w.map.setResource(x, y, 1, 5000);
    const drill = w.place('burner-mining-drill', 0, 0, 0)!;
    drill.insert('coal', 20, 'player');
    w.place('iron-chest', 0, -1, 0);
    const u = w.enemies.spawnAt(15.5, 0.5, 'walker');
    w.run(120);
    expect(drill.status).toBe(Status.Working);
    expect(w.noise.baseLevel).toBeGreaterThan(15);
    expect(u.mode).toBe('investigate');
    w.run(60 * 25);
    const chest = w.entityAt(0, -1);
    expect(drill.hp < drill.def.health || !chest || chest.hp < chest.def.health).toBe(true);
    w.run(60 * 120);
    expect(w.entities.has(drill.id)).toBe(false);
  });

  it('mehr Maschinen im selben Block sind lauter', () => {
    const run = (n: number) => {
      const w = arena(false);
      for (let i = 0; i < n; i++) {
        for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) w.map.setResource(i * 2 + x, y, 1, 5000);
        w.place('burner-mining-drill', i * 2, 0, 2)!.insert('coal', 5, 'player');
      }
      w.run(121);
      return w.noise.baseLevel;
    };
    expect(run(3)).toBeGreaterThan(run(1));
  });

  it('Lockvogel lockt Zombies an seinen Landeplatz', () => {
    const w = arena();
    const p = w.player!;
    p.god = true; // unsichtbar für Zombies, Wurf ohne Vorrat
    const u = w.enemies.spawnAt(0.5, 30.5, 'walker');
    expect(w.capsules.throw(w, 'noise-lure', 14.5, 0.5)).toBeNull();
    w.run(60 * 14);
    expect(w.noise.lures.length).toBe(1);
    expect(u.mode).toBe('investigate');
    expect(Math.hypot(u.tx - 14.5, u.ty - 0.5)).toBeLessThan(2.5);
    w.run(NOISE.lureTicks);
    expect(w.noise.lures.length).toBe(0);
  });
});

describe('Verteidigung', () => {
  it('Mauern halten Zombies auf, bis sie eingerissen sind; die Holzbarrikade fällt zuerst', () => {
    const fall = (wall: string) => {
      const w = arena();
      for (let y = -12; y <= 12; y++) w.place(wall, 4, y, 0);
      w.enemies.spawnAt(9.5, 0.5, 'walker');
      let t = 0;
      while (w.player!.hp >= 100 && t < 60 * 240) {
        w.step();
        t++;
      }
      return t;
    };
    const wood = fall('wooden-barricade');
    const stone = fall('stone-wall');
    expect(wood).toBeGreaterThan(60 * 15);
    expect(stone).toBeGreaterThan(wood * 1.5);
  });

  it('Stacheldraht bremst und verletzt, Nagelfalle verletzt stark; beide nutzen sich ab', () => {
    const w = arena(false);
    for (let y = -4; y <= 6; y++) for (let x = 2; x <= 10; x++) w.place('barbed-wire', x, y, 0);
    const u = w.enemies.spawnAt(14.5, 0.5, 'walker', 'investigate');
    u.tx = -8.5;
    u.ty = 0.5;
    const free = w.enemies.spawnAt(14.5, 20.5, 'walker', 'investigate');
    free.tx = -8.5;
    free.ty = 20.5;
    w.run(60 * 6);
    expect(u.x).toBeGreaterThan(free.x + 4);
    expect(u.hp).toBeLessThan(UNITS.walker.health);
    const worn = [...w.entities.values()].filter((e) => e.kind === 'wire' && e.hp < e.def.health);
    expect(worn.length).toBeGreaterThan(0);
    // Falle
    const w2 = arena(false);
    for (let y = -4; y <= 6; y++) w2.place('spike-trap', 5, y, 0);
    const v = w2.enemies.spawnAt(8.5, 0.5, 'walker', 'investigate');
    v.tx = 0.5;
    v.ty = 0.5;
    w2.run(60 * 3);
    expect(v.hp).toBeLessThanOrEqual(UNITS.walker.health - HAZARD.trap.damage);
    expect([...w2.entities.values()].some((e) => e.kind === 'trap' && e.hp < e.def.health)).toBe(true);
  });

  it('das Tor lässt die Figur durch, Zombies nicht', () => {
    const w = arena();
    for (let y = -10; y <= 10; y++) w.place(y === 0 ? 'gate' : 'stone-wall', 3, y, 0);
    const p = w.player!;
    p.god = true;
    p.moveX = 1;
    w.run(20);
    expect(p.x).toBeGreaterThan(5);
    p.moveX = 0;
    p.god = false;
    const u = w.enemies.spawnAt(-2.5, 0.5, 'walker');
    w.run(60 * 6);
    expect(u.x).toBeLessThan(3);
    expect(w.entityAt(3, 0)!.hp).toBeLessThan(300);
  });

  it('MG-Turm schießt mit Magazinen auf Zombies in Reichweite und ist laut', () => {
    const w = arena(false);
    const t = w.place('gun-turret', 0, 0, 0)!;
    t.insert('firearm-magazine', 10, 'player');
    const u = w.enemies.spawnAt(10.5, 1.0, 'walker');
    const listener = w.enemies.spawnAt(1.0, 30.5, 'walker');
    w.run(90);
    expect(w.enemies.units.has(u.id)).toBe(false);
    expect(w.enemies.kills).toBe(1);
    expect(listener.mode).toBe('investigate');
  });

  it('Fundorte der alten Welt greifen Zombies nicht an', () => {
    const w = arena();
    const car = w.create(w.nextId++, 'car-wreck', 3, 0, 0);
    w.enemies.spawnAt(9.5, 0.5, 'walker');
    w.run(60 * 10);
    expect(car.hp).toBe(car.def.health);
    expect(w.player!.hp).toBeLessThan(100);
  });
});

describe('Nahkampf', () => {
  it('Baseballschläger: drei Schläge für einen Schlurfer, betäubt, nutzt sich ab', () => {
    const w = arena();
    const p = w.player!;
    p.inventory.add('baseball-bat', 1);
    const u = w.enemies.spawnAt(1.6, 0.5, 'walker');
    p.shooting = true;
    w.step();
    expect(u.hp).toBe(UNITS.walker.health - MELEE['baseball-bat'].damage);
    expect(u.stun).toBeGreaterThan(0);
    w.run(MELEE['baseball-bat'].cooldown * 2 + 2);
    expect(w.enemies.units.has(u.id)).toBe(false);
    expect(p.meleeWear['baseball-bat']).toBe(3);
    expect(p.hp).toBe(100);
  });

  it('die Waffe zerbricht nach ihrer Haltbarkeit; ohne Waffe bleiben die Fäuste', () => {
    const w = arena();
    const p = w.player!;
    p.inventory.add('spear', 1);
    p.meleeWear.spear = MELEE.spear.durability - 1;
    w.enemies.spawnAt(2.0, 0.5, 'brute');
    p.shooting = true;
    w.step();
    expect(p.inventory.count('spear')).toBe(0);
    expect(p.meleeWeapon).toBeNull();
  });
});

describe('Horden', () => {
  it('ab der zweiten Nacht, wachsen täglich, jede siebte Nacht groß', () => {
    const w = arena();
    const e = w.enemies;
    expect(e.hordeSize(w, 1)).toBe(0);
    expect(e.hordeSize(w, HORDE.firstDay)).toBe(HORDE.base);
    expect(e.hordeSize(w, 5)).toBeGreaterThan(e.hordeSize(w, 4));
    expect(e.hordeSize(w, 7)).toBeGreaterThan(e.hordeSize(w, 8));
    expect(e.hordeSize(w, 500)).toBe(HORDE.maxSize);
    e.applySetting(w, 'aus');
    expect(e.hordeSize(w, 9)).toBe(0);
  });

  it('kommt in der Dämmerung aus einer Richtung und zieht zum Lager', () => {
    const w = arena();
    const p = w.player!;
    p.god = true;
    w.tick = DAY.ticks + Math.round(DAY.dusk * DAY.ticks) - 1; // Tag 2, kurz vor der Dämmerung
    w.run(3);
    const horde = [...w.enemies.units.values()].filter((u) => u.mode === 'horde');
    expect(horde.length).toBe(HORDE.base);
    const d0 = Math.min(...horde.map((u) => Math.hypot(u.x, u.y)));
    expect(d0).toBeGreaterThan(HORDE.distMin - HORDE.spread - 5);
    expect(w.enemies.lastHorde?.size).toBe(HORDE.base);
    expect(p.messages.some((m) => m.includes('Horde'))).toBe(true);
    w.run(60 * 30);
    expect(Math.max(...horde.map((u) => Math.hypot(u.x, u.y)))).toBeLessThan(12);
  });

  it('Speichern und Laden: Zombies, Horde und Lärm laufen gleich weiter', () => {
    const w = arena();
    w.player!.inventory.add('baseball-bat', 1);
    for (let y = -4; y <= 4; y++) w.place('stone-wall', 5, y, 0);
    w.enemies.spawnHorde(w, 12, 0.3);
    w.enemies.spawnAt(9.5, 0.5, 'runner');
    w.noise.emit(3, 3, 40);
    w.run(500);
    const b = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(w))));
    w.run(700);
    b.run(700);
    expect(JSON.stringify(serializeWorld(b))).toBe(JSON.stringify(serializeWorld(w)));
  });
});
