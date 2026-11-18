import { describe, expect, it } from 'vitest';
import { BARRICADE } from '../../src/data/enemies';
import { LEGACY_MAP_SETTINGS } from '../../src/data/mapgen';
import { PLANKS } from '../../src/data/floors';
import { Player } from '../../src/sim/player';
import { hash01 } from '../../src/sim/rng';
import { deserializeWorld, serializeWorld } from '../../src/sim/serialize';
import { World } from '../../src/sim/world';

function arena(settings = {}): World {
  const w = new World(3, { ...LEGACY_MAP_SETTINGS, enemies: 'normal', ...settings });
  for (let y = -40; y < 40; y++) for (let x = -40; x < 40; x++) {
    w.map.setWater(x, y, false);
    w.map.setResource(x, y, 0, 0);
  }
  w.map.clearTrees(-40, -40, 40, 40);
  return w;
}

const h = (seed: number) => (n: number) => hash01(seed, n, 77);

function build(w: World, seed = 1, kind: 'home' | 'store' | 'works' = 'home') {
  expect(w.sites.house(w, 0, 0, 9, 7, kind, 2, 'brick', 'tile', h(seed))).toBe(true);
  const parts = [...w.entities.values()];
  return {
    walls: parts.filter((e) => e.kind === 'wall' && e.def.house && !e.def.window && !e.def.gate),
    windows: parts.filter((e) => e.kind === 'wall' && e.def.window),
    doors: parts.filter((e) => e.kind === 'wall' && e.def.gate),
    furniture: parts.filter((e) => e.kind === 'loot' || e.kind === 'bed' || e.kind === 'prop'),
  };
}

describe('Begehbare Häuser', () => {
  it('Außenwände, Haustür auf der Straßenseite, Fenster, Räume mit Möbeln und Dielen', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const w = arena({ enemies: 'aus' });
      const { walls, windows, doors, furniture } = build(w, seed);
      expect(walls.length + windows.length + doors.length).toBeGreaterThanOrEqual(2 * (9 + 7) - 4);
      expect(doors.some((d) => d.y === 6)).toBe(true);
      expect(windows.length).toBeGreaterThan(1);
      expect(furniture.some((e) => e.kind === 'loot')).toBe(true);
      expect(w.map.floorAt(4, 3) === PLANKS || w.map.floorAt(4, 3) === 12 || w.entityAt(4, 3)).toBeTruthy();
      expect(w.sites.houses).toHaveLength(1);
      expect(w.sites.houseAt(4, 3)).toBeTruthy();
    }
  });

  it('Die Figur geht durch die Tür hinein, Zombies müssen Fenster oder Tür aufbrechen', () => {
    const w = arena({ enemies: 'aus' });
    const { doors } = build(w, 3);
    const d = doors.find((x) => x.y === 6)!;
    const p = new Player(d.cx, d.cy + 2);
    w.player = p;
    p.moveY = -1;
    w.run(60);
    expect(p.y).toBeLessThan(6);
  });

  it('Verbarrikadieren kostet Holz; Bretter fangen Schaden ab, dann bricht das Fenster', () => {
    const w = arena({ enemies: 'aus' });
    const { windows } = build(w, 2);
    const win = windows[0];
    const p = new Player(win.cx, win.cy + (win.y === 0 ? -1.5 : 1.5));
    w.player = p;
    p.god = false;
    expect(w.barricade(win, p)).toMatch(/Holz/);
    p.inventory.add('wood', 10);
    expect(w.barricade(win, p)).toBeNull();
    expect(w.barricade(win, p)).toBeNull();
    expect(win.kind === 'wall' && win.boards).toBe(2);
    expect(p.inventory.count('wood')).toBe(10 - 2 * BARRICADE.wood);
    w.damageEntity(win, BARRICADE.boardHp * 1.5);
    expect(win.kind === 'wall' && win.boards).toBe(1);
    expect(win.hp).toBe(win.def.health);
    w.damageEntity(win, BARRICADE.boardHp + win.def.health);
    expect(w.entities.has(win.id)).toBe(false);
  });

  it('Zombies brechen ins Haus ein, wenn die Figur drin ist', () => {
    const w = arena();
    build(w, 4);
    const p = new Player(4.5, 3.5);
    w.player = p;
    const u = w.enemies.spawnAt(4.5, 14.5, 'walker', 'idle');
    let broke = false;
    for (let t = 0; t < 60 * 90 && !broke; t++) {
      w.step();
      broke = [...w.entities.values()].filter((e) => e.kind === 'wall' && (e.def.window || e.def.gate)).some((e) => e.hp < e.def.health);
    }
    expect(broke).toBe(true);
    void u;
  });

  it('Speichern/Laden behält Häuser, Bretter und zerbrochene Fenster', () => {
    const w = arena({ enemies: 'aus' });
    const { windows } = build(w, 5);
    const win = windows[0];
    if (win.kind === 'wall') {
      win.boardHp = BARRICADE.boardHp * 2;
      win.broken = true;
    }
    w.player = new Player(20, 20);
    const b = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(w))));
    expect(b.sites.houses).toEqual(w.sites.houses);
    const bw = b.entities.get(win.id)!;
    expect(bw.kind === 'wall' && bw.boards).toBe(2);
    expect(bw.kind === 'wall' && bw.broken).toBe(true);
    w.run(300);
    b.run(300);
    expect(JSON.stringify(serializeWorld(b))).toBe(JSON.stringify(serializeWorld(w)));
  });
});

describe('Häuser in der festen Welt', () => {
  it('in Häusern wachsen keine Bäume', async () => {
    const { WORLD } = await import('../../src/data/world');
    const { DEFAULT_MAP_SETTINGS } = await import('../../src/data/mapgen');
    const w = new World(WORLD.seed, { ...DEFAULT_MAP_SETTINGS, enemies: 'aus' });
    w.player = new Player(-196, 90);
    w.run(2);
    expect(w.sites.houses.length).toBeGreaterThan(10);
    for (const h of w.sites.houses) for (let y = h.y; y < h.y + h.h; y++) for (let x = h.x; x < h.x + h.w; x++) expect(w.map.trees.treeAt(x, y), `${x},${y}`).toBeUndefined();
  });
});

describe('Selbst bauen', () => {
  it('ein geschlossener Raum aus eigenen Wänden mit Tür bekommt ein Dach; fehlt eine Wand, ist es weg', () => {
    const w = arena({ enemies: 'aus' });
    for (let x = 10; x <= 14; x++) {
      w.place('hwall-wood', x, 10, 0);
      w.place(x === 12 ? 'hdoor' : 'hwall-wood', x, 14, 0);
    }
    for (let y = 11; y <= 13; y++) {
      w.place('hwall-wood', 10, y, 0);
      if (y !== 13) w.place('hwall-wood', 14, y, 0);
    }
    expect(w.sites.houses).toHaveLength(0);
    const last = w.place('hwin-wood', 14, 13, 1)!;
    expect(w.sites.houses).toHaveLength(1);
    expect(w.sites.houses[0]).toMatchObject({ x: 10, y: 10, w: 5, h: 5, own: true });
    w.remove(last.id);
    expect(w.sites.houses).toHaveLength(0);
  });

  it('eigene Hausteile lassen sich herstellen', async () => {
    const { RECIPES } = await import('../../src/data/recipes');
    for (const id of ['hwall-wood', 'hwall-brick', 'hwin-wood', 'hwin-brick', 'hdoor']) expect(RECIPES[id], id).toBeTruthy();
  });
});
