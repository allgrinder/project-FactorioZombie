import { describe, expect, it } from 'vitest';
import { DEFAULT_MAP_SETTINGS, LEGACY_MAP_SETTINGS } from '../../src/data/mapgen';
import { Player } from '../../src/sim/player';
import { deserializeWorld, serializeWorld } from '../../src/sim/serialize';
import { World } from '../../src/sim/world';

function cliffsIn(w: World, r: number): [number, number][] {
  const out: [number, number][] = [];
  for (let y = -r; y < r; y++) for (let x = -r; x < r; x++) if (w.map.isCliff(x, y)) out.push([x, y]);
  return out;
}

describe('Klippen', () => {
  it('neue Karten haben Klippen außerhalb des Startgebiets, alte Spielstände keine', () => {
    const w = new World(42, DEFAULT_MAP_SETTINGS);
    const c = cliffsIn(w, 200);
    expect(c.length).toBeGreaterThan(200);
    for (const [x, y] of c) {
      expect(Math.hypot(x, y)).toBeGreaterThanOrEqual(40);
      expect(w.map.isWater(x, y)).toBe(false);
      expect(w.map.resourceAt(x, y).amount).toBe(0);
    }
    expect(cliffsIn(new World(42, LEGACY_MAP_SETTINGS), 200).length).toBe(0);
    expect(cliffsIn(new World(42, { ...DEFAULT_MAP_SETTINGS, cliffs: 'aus' }), 200).length).toBe(0);
    const few = cliffsIn(new World(42, { ...DEFAULT_MAP_SETTINGS, cliffs: 'wenig' }), 200).length;
    expect(few).toBeLessThan(c.length);
  });

  it('Klippen blockieren das Bauen; entfernte Klippen bleiben nach dem Laden weg', () => {
    const w = new World(42, DEFAULT_MAP_SETTINGS);
    const [x, y] = cliffsIn(w, 200)[0];
    expect(w.canPlace('wooden-chest', x, y, 0)).toMatchObject({ ok: false, reason: 'Klippe im Weg' });
    expect(w.map.removeCliff(x, y)).toBe(true);
    expect(w.canPlace('wooden-chest', x, y, 0).ok).toBe(true);
    const b = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(w))));
    expect(b.map.isCliff(x, y)).toBe(false);
    expect(cliffsIn(b, 200).length).toBe(cliffsIn(w, 200).length);
  });
});

describe('Wurfgegenstände', () => {
  it('Klippensprengstoff entfernt Klippen im Radius 1,5, nur in Reichweite 10', () => {
    const w = new World(42, DEFAULT_MAP_SETTINGS);
    const [x, y] = cliffsIn(w, 200)[0];
    const p = new Player(x + 0.5, y + 6.5);
    w.player = p;
    p.inventory.add('cliff-explosives', 2);
    expect(w.capsules.throw(w, 'cliff-explosives', x + 0.5, y - 20)).toBe('Außer Reichweite');
    expect(w.capsules.throw(w, 'cliff-explosives', x + 0.5, y + 0.5)).toBeNull();
    expect(p.inventory.count('cliff-explosives')).toBe(1);
    w.run(120);
    expect(w.map.isCliff(x, y)).toBe(false);
    expect(w.capsules.flying.length).toBe(0);
  });

  it('Granate: Explosionsschaden im Wirkradius, sehr laut', () => {
    const w = new World(5, { ...DEFAULT_MAP_SETTINGS, cliffs: 'aus', enemies: 'aus', sites: false });
    const p = new Player(0.5, 0.5);
    w.player = p;
    p.inventory.add('grenade', 1);
    const near = w.enemies.spawnAt(p.x + 8, p.y, 'walker');
    const far = w.enemies.spawnAt(p.x + 8, p.y + 9, 'walker');
    expect(w.capsules.throw(w, 'grenade', p.x + 8, p.y)).toBeNull();
    for (let i = 0; i < 40 && w.capsules.flying.length; i++) w.step();
    expect(w.enemies.units.has(near.id)).toBe(false);
    expect(w.enemies.units.has(far.id)).toBe(true);
  });
});
