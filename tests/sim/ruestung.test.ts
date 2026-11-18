import { describe, expect, it } from 'vitest';
import { Player } from '../../src/sim/player';
import { deserializeWorld, serializeWorld } from '../../src/sim/serialize';
import { World } from '../../src/sim/world';

function setup(): { w: World; p: Player } {
  const w = new World(3);
  w.map.clearTrees(-40, -40, 80, 80);
  for (let y = -30; y < 30; y++) for (let x = -30; x < 30; x++) {
    w.map.setWater(x, y, false);
    w.map.setResource(x, y, 0, 0);
  }
  const p = new Player(0.5, 0.5);
  w.player = p;
  return { w, p };
}

describe('Rüstung (Wiki „Heavy armor“)', () => {
  it('Schwere Rüstung: Widerstand 6 / 30 %, Ablegen gibt sie zurück, Speichern/Laden', () => {
    const { w, p } = setup();
    const before = p.inventory.size;
    p.inventory.add('heavy-armor', 1);
    expect(p.equipArmor(w, 'heavy-armor')).toBeNull();
    expect(p.armor).toBe('heavy-armor');
    expect(p.inventory.count('heavy-armor')).toBe(0);
    const hp = p.hp;
    p.damage(w, 20);
    expect(hp - p.hp).toBeCloseTo((20 - 6) * 0.7, 6);
    const b = deserializeWorld(serializeWorld(w));
    expect(b.player!.armor).toBe('heavy-armor');
    expect(p.unequipArmor(w)).toBeNull();
    expect(p.inventory.size).toBe(before);
    expect(p.inventory.count('heavy-armor')).toBe(1);
  });
});
