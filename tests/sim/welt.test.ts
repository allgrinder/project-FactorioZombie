import { describe, expect, it } from 'vitest';
import { DEFAULT_MAP_SETTINGS } from '../../src/data/mapgen';
import { WORLD, roadPaths } from '../../src/data/world';
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
    // Zufahrten zweigen von einer Landstraße ab und enden an einem Sonderort
    const paths = roadPaths();
    const onRoad = (x: number, y: number) => paths.some((p) => { for (let k = 0; k < p.pts.length; k += 2) if (Math.hypot(p.pts[k] - x, p.pts[k + 1] - y) < 40) return true; return false; });
    const nearPlace = (x: number, y: number) => WORLD.places.some((pl) => Math.hypot(pl.x - x, pl.y - y) < 30);
    for (const road of WORLD.roads) {
      for (const p of [road[0], road[road.length - 1]]) {
        expect(ends.some(([x, y]) => x === p[0] && y === p[1]) || onRoad(p[0], p[1]) || nearPlace(p[0], p[1]), `${p}`).toBe(true);
      }
    }
    for (const pl of WORLD.places) expect(WORLD.roads.some((r) => nearPlace(r[r.length - 1][0], r[r.length - 1][1]) && Math.hypot(r[r.length - 1][0] - pl.x, r[r.length - 1][1] - pl.y) < 30), pl.name).toBe(true);
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
    // begehbare Häuser (Wohnhäuser, Läden mit Regalen) und ein paar ausgebrannte Ruinen
    const houses = w.sites.houses.filter((h) => Math.hypot(h.x - t.x, h.y - t.y) < 90);
    expect(houses.length).toBeGreaterThanOrEqual(12);
    expect(count('store-shelf')).toBeGreaterThanOrEqual(6);
    expect(count('kitchen')).toBeGreaterThanOrEqual(6);
    expect(count('car-wreck')).toBeGreaterThanOrEqual(4);
    // Kreisstadt: Polizeiwache und Arztpraxis am Ortsrand
    expect(count('police-station')).toBe(1);
    expect(count('clinic')).toBe(1);
    expect(w.sites.sites.filter((s) => s.kind === 'town').length).toBeGreaterThanOrEqual(6);
    // Landstraße: durchgehend begehbar und befestigt, auch wo vorher Wasser oder Klippen waren
    for (const path of roadPaths()) {
      for (let k = 0; k < path.pts.length; k += 2) {
        const x = Math.floor(path.pts[k]);
        const y = Math.floor(path.pts[k + 1]);
        if (Math.abs(x - t.x) > 150 || Math.abs(y - t.y) > 150) continue;
        expect(w.map.isBlocked(x, y), `${x},${y}`).toBe(false);
        expect(w.map.floorAt(x, y) > 0 || !!w.entityAt(x, y), `${x},${y}`).toBe(true);
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

describe('Natürliche Welt', () => {
  it('Alleen, Hecken und Gartenbäume werden gepflanzt und überstehen Speichern/Laden samt gefällter Bäume', () => {
    const w = new World(WORLD.seed, { ...DEFAULT_MAP_SETTINGS, enemies: 'aus' });
    w.player = new Player(0.5, 0.5);
    const t = WORLD.towns.find((x) => x.id === 'dornfeld')!;
    w.player.px = t.x * 256;
    w.player.py = t.y * 256;
    w.step();
    const planted = w.map.trees.serializePlanted();
    expect(planted.length).toBeGreaterThan(20);
    // einen gepflanzten Baum fällen
    const [px, py] = planted[3];
    const tree = w.map.trees.treeAt(Math.floor(px), Math.floor(py))!;
    expect(tree).toBeTruthy();
    w.map.trees.remove(tree.cx, tree.cy, tree.i);
    const b = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(w))));
    expect(b.map.trees.treeAt(Math.floor(px), Math.floor(py))).toBeUndefined();
    const [qx, qy] = planted[5];
    expect(b.map.trees.treeAt(Math.floor(qx), Math.floor(qy))).toBeTruthy();
    expect(JSON.stringify(serializeWorld(b))).toBe(JSON.stringify(serializeWorld(w)));
  });
});

describe('Sonderorte', () => {
  it('Gefängnis, Kraftwerk, Gewerbegebiet und Gutshöfe entstehen mit ihren Bauten', () => {
    const w = new World(WORLD.seed, { ...DEFAULT_MAP_SETTINGS, enemies: 'aus' });
    w.player = new Player(0.5, 0.5);
    const count = (name: string, x: number, y: number, r = 40) => [...w.entities.values()].filter((e) => e.name === name && Math.hypot(e.cx - x, e.cy - y) < r).length;
    for (const pl of WORLD.places) {
      w.player.px = pl.x * 256;
      w.player.py = (pl.y + 40) * 256;
      w.run(61);
    }
    const at = (id: string) => WORLD.places.find((p) => p.id === id)!;
    const jva = at('jva');
    expect(count('hwall-concrete', jva.x, jva.y)).toBeGreaterThan(100);
    expect(count('prison-tower', jva.x, jva.y)).toBe(4);
    expect(count('bunk', jva.x, jva.y)).toBeGreaterThanOrEqual(10);
    const kw = at('kraftwerk');
    expect(count('cooling-tower', kw.x, kw.y)).toBe(2);
    expect(count('transformer', kw.x, kw.y)).toBe(4);
    const gw = at('gewerbe');
    expect(count('container', gw.x, gw.y)).toBeGreaterThanOrEqual(4);
    expect([...w.entities.values()].filter((e) => e.kind === 'pile' && Math.hypot(e.cx - gw.x, e.cy - gw.y) < 30).length).toBeGreaterThanOrEqual(6);
    const kr = at('kraehen');
    expect(w.community.raiders.filter((k) => Math.hypot(k.x - kr.x, k.y - kr.y) < 20).length).toBe(6);
    const lh = at('lindenhof');
    expect(count('silo', lh.x, lh.y)).toBe(2);
    expect(w.sites.houses.filter((h) => Math.hypot(h.x - lh.x, h.y - lh.y) < 20).length).toBeGreaterThanOrEqual(2);
  });
});
