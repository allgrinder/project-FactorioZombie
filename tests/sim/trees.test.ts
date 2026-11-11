import { describe, expect, it } from 'vitest';
import { GameMap } from '../../src/sim/map';
import { Player } from '../../src/sim/player';
import { deserializeWorld, serializeWorld } from '../../src/sim/serialize';
import { World } from '../../src/sim/world';

function firstTree(m: GameMap) {
  for (let r = 1; r < 8; r++)
    for (let cy = -r; cy <= r; cy++)
      for (let cx = -r; cx <= r; cx++) {
        const l = m.trees.treesIn(cx, cy);
        if (l.length) return l[0];
      }
  throw new Error('kein Baum');
}

describe('Bäume und Holz', () => {
  it('Bäume sind deterministisch und stehen nicht am Start, im Wasser oder auf Erz', () => {
    const a = new GameMap(7);
    const b = new GameMap(7);
    let n = 0;
    for (let cy = -4; cy < 4; cy++) for (let cx = -4; cx < 4; cx++) {
      const la = a.trees.treesIn(cx, cy);
      expect(b.trees.treesIn(cx, cy).map((t) => [t.x, t.y, t.kind])).toEqual(la.map((t) => [t.x, t.y, t.kind]));
      for (const t of la) {
        n++;
        expect(Math.hypot(t.x, t.y)).toBeGreaterThan(13);
        expect(a.isWater(t.tx, t.ty)).toBe(false);
        expect(a.resourceAt(t.tx, t.ty).amount).toBe(0);
      }
    }
    expect(n).toBeGreaterThan(50);
  });

  it('Fällen gibt Holz (Baum 4), dauert 1,1 s, wird gespeichert und blockiert vorher das Bauen', () => {
    const w = new World(7);
    const t = firstTree(w.map);
    expect(w.canPlace('wooden-chest', t.tx, t.ty, 0).ok).toBe(false);
    const p = new Player(t.x, t.y + 1);
    w.player = p;
    p.setMineTarget({ kind: 'tree', cx: t.cx, cy: t.cy, i: t.i, x: t.x, y: t.y });
    const wood = p.inventory.count('wood');
    w.run(Math.round(60 * (0.55 / 0.5)) + 1);
    const kind = t.kind === 2 ? 2 : 4;
    expect(p.inventory.count('wood') - wood).toBe(kind);
    expect(w.map.trees.treeAt(t.tx, t.ty)).toBeUndefined();
    expect(w.canPlace('wooden-chest', t.tx, t.ty, 0).ok).toBe(true);
    const b = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(w))));
    expect(b.map.trees.treeAt(t.tx, t.ty)).toBeUndefined();
    expect(b.map.trees.treesIn(t.cx, t.cy).length).toBe(w.map.trees.treesIn(t.cx, t.cy).length);
  });

  it('Holz ist Brennstoff, Strommast braucht Holz, Holzkiste hat 16 Plätze', async () => {
    const { ITEMS } = await import('../../src/data/items');
    const { RECIPES } = await import('../../src/data/recipes');
    const { entityDef } = await import('../../src/data/entities');
    expect(ITEMS.wood.fuelValue).toBe(2_000_000);
    expect(RECIPES['small-electric-pole'].ingredients.map((i) => i.item).sort()).toEqual(['copper-cable', 'wood']);
    expect((entityDef('wooden-chest') as { slots: number }).slots).toBe(16);
    const p = new Player(0, 0);
    p.giveStart();
    expect(p.inventory.count('wood')).toBe(6);
  });
});
