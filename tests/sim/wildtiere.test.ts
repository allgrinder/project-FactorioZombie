import { describe, expect, it } from 'vitest';
import { LEGACY_MAP_SETTINGS } from '../../src/data/mapgen';
import { ANIMALS } from '../../src/data/wildlife';
import { Player } from '../../src/sim/player';
import { deserializeWorld, serializeWorld } from '../../src/sim/serialize';
import { World } from '../../src/sim/world';

function meadow(): { w: World; p: Player } {
  const w = new World(7, { ...LEGACY_MAP_SETTINGS, needs: true });
  for (let y = -70; y < 70; y++) for (let x = -70; x < 70; x++) {
    w.map.setWater(x, y, false);
    w.map.setResource(x, y, 0, 0);
  }
  w.map.clearTrees(-70, -70, 70, 70);
  const p = new Player(0.5, 0.5);
  w.player = p;
  return { w, p };
}

describe('Wildtiere', () => {
  it('Rudel flieht vor der Figur', () => {
    const { w } = meadow();
    const a = w.wildlife.spawn('deer', 6, 0.5);
    const b = w.wildlife.spawn('deer', 7, 1.5, a.herd);
    w.run(40);
    expect(a.mode).toBe('flee');
    expect(b.mode).toBe('flee');
    w.run(120);
    expect(Math.hypot(a.x, a.y)).toBeGreaterThan(14);
  });

  it('erlegt: Fleisch und Fell am Boden, Kadaver bleibt liegen', () => {
    const { w } = meadow();
    const a = w.wildlife.spawn('deer', 20, 20);
    w.enemies.damageTarget(w, { kind: 'animal', id: a.id, x: a.x, y: a.y }, 999, { x: 0, y: 0 });
    expect(w.wildlife.animals.length).toBe(0);
    const items: string[] = [];
    for (const { g } of w.groundNear(20, 20, 4)) items.push(g.item);
    expect(items.filter((i) => i === 'raw-meat').length).toBe(ANIMALS.deer.drops[0].amount);
    expect(items).toContain('hide');
    expect(w.enemies.remnants.some((r) => r.kind === 'animal')).toBe(true);
  });

  it('Nahkampf trifft ein Tier, wenn kein Zombie da ist', () => {
    const { w, p } = meadow();
    const a = w.wildlife.spawn('rabbit', 1.2, 0.5);
    p.shooting = true;
    w.run(2);
    expect(a.hp).toBeLessThan(ANIMALS.rabbit.hp);
  });

  it('verletztes Wildschwein greift an', () => {
    const { w, p } = meadow();
    const a = w.wildlife.spawn('boar', 4, 0.5);
    w.enemies.damageTarget(w, { kind: 'animal', id: a.id, x: a.x, y: a.y }, 10, { x: p.x, y: p.y });
    expect(a.mode).toBe('charge');
    const hp = p.hp;
    w.run(120);
    expect(p.hp).toBeLessThan(hp);
  });

  it('erscheinen von selbst außer Sicht und überstehen Speichern/Laden', () => {
    const { w } = meadow();
    w.run(90 * 30);
    expect(w.wildlife.animals.length).toBeGreaterThan(0);
    for (const a of w.wildlife.animals) expect(Math.hypot(a.x, a.y)).toBeGreaterThan(20);
    const copy = deserializeWorld(serializeWorld(w));
    expect(copy.wildlife.animals).toEqual(w.wildlife.animals);
    w.run(300);
    copy.run(300);
    expect(copy.wildlife.animals).toEqual(w.wildlife.animals);
  });
});
