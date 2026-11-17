import { describe, expect, it } from 'vitest';
import { freeplayScene } from '../../src/game/scenes';
import { type FurnaceEntity, type PileEntity, insertInto } from '../../src/sim/machines';
import type { Player } from '../../src/sim/player';
import type { World } from '../../src/sim/world';

/** Nächster Schrotthaufen einer Art. */
function nearestPile(w: World, name: string, from: [number, number]): PileEntity {
  let best: PileEntity | null = null;
  let bd = Infinity;
  for (const e of w.entities.values()) {
    if (e.kind !== 'pile' || e.name !== name) continue;
    const d = Math.hypot(e.cx - from[0], e.cy - from[1]);
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  expect(best, name).toBeTruthy();
  expect(bd).toBeLessThan(45);
  return best!;
}

/** Spieler neben ein Gebäude laufen lassen (über die normale Bewegung, ohne Kollision zu prüfen). */
function standBeside(w: World, p: Player, e: PileEntity) {
  p.px = Math.round((e.x + e.w + 0.6) * 256);
  p.py = Math.round((e.y + 0.5) * 256);
  w.step();
}

function salvage(w: World, p: Player, e: PileEntity, ticks: number) {
  p.setMineTarget({ kind: 'entity', id: e.id });
  for (let i = 0; i < ticks; i++) w.step();
  p.setMineTarget(null);
}

describe('Freies Spiel', () => {
  it('Start ohne Bergbau: Haufen am Startfundort ausschlachten, schmelzen, herstellen', () => {
    const { world: w } = freeplayScene(12345);
    const p = w.player!;
    w.settings = { ...w.settings, enemies: 'aus' };
    expect(p.inventory.count('iron-plate')).toBe(8);
    expect(p.inventory.count('stone-furnace')).toBe(1);
    expect(p.inventory.count('campfire')).toBe(1);
    expect(p.inventory.count('burner-mining-drill')).toBe(0);
    w.step();
    // keine Rohstofffelder mehr
    let ore = 0;
    for (let y = -60; y <= 60; y += 2) for (let x = -60; x <= 60; x += 2) if (w.map.resourceAt(x, y).amount > 0) ore++;
    expect(ore).toBe(0);

    // Kohle und Schrott von Hand
    const coal = nearestPile(w, 'coal-pile', [0, 0]);
    standBeside(w, p, coal);
    salvage(w, p, coal, 60 * 8);
    expect(p.inventory.count('coal')).toBeGreaterThanOrEqual(8);
    const scrap = nearestPile(w, 'scrap-pile', [0, 0]);
    const before = scrap.amount;
    standBeside(w, p, scrap);
    salvage(w, p, scrap, 60 * 20);
    expect(scrap.amount).toBeLessThan(before - 15);
    expect(p.inventory.count('iron-ore')).toBeGreaterThanOrEqual(8);

    // Ofen setzen, Schrott einschmelzen
    const f = w.place('stone-furnace', Math.floor(p.x) + 3, Math.floor(p.y) + 3, 0) as FurnaceEntity;
    expect(f).toBeTruthy();
    p.inventory.remove('stone-furnace', 1);
    p.inventory.remove('coal', insertInto(f, 'coal', 4, 'player'));
    p.inventory.remove('iron-ore', insertInto(f, 'iron-ore', 8, 'player'));
    w.run(60 * 30);
    expect(f.result.count('iron-plate')).toBe(8);

    // Lagerfeuer setzen: Mitte der Basis
    expect(w.base).toBeNull();
    const fire = w.place('campfire', Math.floor(p.x) - 4, Math.floor(p.y) + 3, 0)!;
    expect(fire).toBeTruthy();
    expect(w.base?.id).toBe(fire.id);
    expect(w.enemies.baseCenter(w)).toEqual([fire.cx, fire.cy]);

    // Aus Platten: Zahnräder, Greifarm und Bänder herstellen (inkl. Zwischenprodukten)
    p.inventory.add('iron-plate', f.result.remove('iron-plate', 100));
    expect(p.craft('burner-inserter', 1)).toBe(1);
    expect(p.craft('transport-belt', 2)).toBe(2);
    w.run(60 * 5);
    expect(p.inventory.count('burner-inserter')).toBe(1);
    expect(p.inventory.count('transport-belt')).toBe(4);
  });
});
