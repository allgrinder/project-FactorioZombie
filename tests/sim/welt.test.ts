import { describe, expect, it } from 'vitest';
import { ASPHALT } from '../../src/data/floors';
import { DEFAULT_MAP_SETTINGS } from '../../src/data/mapgen';
import { WORLD } from '../../src/data/world';
import { Player } from '../../src/sim/player';
import { deserializeWorld, serializeWorld } from '../../src/sim/serialize';
import { World } from '../../src/sim/world';

function world(enemies: 'aus' | 'normal' = 'aus'): World {
  const w = new World(WORLD.seed, { ...DEFAULT_MAP_SETTINGS, enemies });
  w.player = new Player(0.5, 0.5);
  return w;
}

/** Figur an einen Ort versetzen und die Umgebung anlegen lassen. */
function visit(w: World, x: number, y: number): void {
  w.player!.px = Math.round(x * 256);
  w.player!.py = Math.round(y * 256);
  w.tick = Math.ceil(w.tick / 60) * 60;
  w.step();
}

describe('Feste Welt', () => {
  it('Orte liegen auseinander, jede Straße verbindet bekannte Punkte, der Start ist frei', () => {
    for (const a of WORLD.towns) {
      expect(Math.hypot(a.x, a.y), a.name).toBeGreaterThan(90);
      for (const b of WORLD.towns) if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(150);
    }
    const ends = [...WORLD.towns.map((t) => [t.x, t.y]), ...WORLD.outposts.map((o) => [o.x, o.y]), [8, -6]];
    for (const road of WORLD.roads) {
      for (const p of [road[0], road[road.length - 1]]) expect(ends.some(([x, y]) => x === p[0] && y === p[1])).toBe(true);
    }
  });

  it('ist immer gleich: gleiche Gebäude an gleicher Stelle', () => {
    const snap = () => {
      const w = world();
      visit(w, 96, -30);
      return [...w.entities.values()].filter((e) => e.kind === 'loot').map((e) => `${e.name}@${e.x},${e.y}`).sort().join('|');
    };
    const a = snap();
    expect(a.length).toBeGreaterThan(100);
    expect(snap()).toBe(a);
  });

  it('Stadt: Hauptstraße mit Läden, Querstraßen mit Wohnhäusern, Asphalt; Landstraße führt über Wasser', () => {
    const w = world();
    const t = WORLD.towns.find((x) => x.id === 'grauenfurt')!;
    visit(w, t.x, t.y);
    const near = [...w.entities.values()].filter((e) => e.kind === 'loot' && Math.hypot(e.cx - t.x, e.cy - t.y) < 90);
    const count = (n: string) => near.filter((e) => e.name === n).length;
    expect(count('ruin-store')).toBeGreaterThanOrEqual(3);
    expect(count('ruin-house')).toBeGreaterThanOrEqual(10);
    expect(count('car-wreck')).toBeGreaterThanOrEqual(4);
    expect(w.sites.sites.filter((s) => s.kind === 'town').length).toBeGreaterThanOrEqual(6);
    // Landstraße: durchgehend begehbar, auch wo vorher Wasser oder Klippen waren
    for (const road of WORLD.roads) {
      for (let k = 0; k + 1 < road.length; k++) {
        const [ax, ay] = road[k];
        const [bx, by] = road[k + 1];
        if (Math.hypot((ax + bx) / 2 - t.x, (ay + by) / 2 - t.y) > 120) continue;
        const L = Math.hypot(bx - ax, by - ay);
        for (let d = 0; d <= L; d += 1) {
          const x = Math.floor(ax + ((bx - ax) * d) / L);
          const y = Math.floor(ay + ((by - ay) * d) / L);
          if (Math.abs(x - t.x) > 180 || Math.abs(y - t.y) > 180) continue;
          expect(w.map.isBlocked(x, y), `${x},${y}`).toBe(false);
          expect(w.map.floorAt(x, y) === ASPHALT || w.map.resourceAt(x, y).amount > 0 || !!w.entityAt(x, y)).toBe(true);
        }
      }
    }
  });

  it('in Orten warten viele Zombies, am Start keine', () => {
    const w = world('normal');
    w.step();
    expect(w.enemies.near(0, 0, 40).length).toBe(0);
    const t = WORLD.towns.find((x) => x.id === 'aschbach')!;
    w.player!.god = true;
    visit(w, t.x - 60, t.y);
    expect(w.enemies.near(t.x, t.y, 30).length).toBeGreaterThanOrEqual(4);
  });
});

describe('Die Welt überdauert den Tod', () => {
  it('neue Figur: Lager, Leiche und Tageszähler bleiben, die alte Figur steht als Zombie auf', () => {
    const w = world('normal');
    const p = w.player!;
    p.giveStart();
    w.run(120);
    const wall = w.place('stone-wall', 5, 5, 0)!;
    p.px = 30 * 256;
    p.py = 2 * 256;
    p.inventory.add('iron-plate', 40);
    p.damage(w, 999);
    expect(p.dead).toBe(true);
    const tick = w.tick;
    const fresh = w.newCharacter()!;
    expect(fresh).not.toBe(p);
    expect(w.player).toBe(fresh);
    expect(fresh.dead).toBe(false);
    expect(fresh.inventory.count('pistol')).toBe(1);
    expect(fresh.inventory.count('iron-plate')).toBe(8);
    expect(Math.hypot(fresh.x, fresh.y)).toBeLessThan(40);
    expect(w.tick).toBe(tick);
    expect(w.characters).toBe(2);
    expect(w.entities.has(wall.id)).toBe(true);
    expect(w.corpses.all.length).toBe(1);
    expect(w.corpses.all[0].inv.count('iron-plate')).toBe(48);
    expect(w.enemies.near(30, 2, 1).length).toBe(1);
    expect(w.newCharacter()).toBeNull(); // nur nach dem Tod
    const b = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(w))));
    expect(b.characters).toBe(2);
    w.run(200);
    b.run(200);
    expect(JSON.stringify(serializeWorld(b))).toBe(JSON.stringify(serializeWorld(w)));
  });
});
