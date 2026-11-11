import { describe, expect, it } from 'vitest';
import { PLAYER } from '../../src/data/player';
import { TECH_BY_ID } from '../../src/data/tech';
import { Player } from '../../src/sim/player';
import { ResearchSystem } from '../../src/sim/research';
import { deserializeWorld, serializeWorld } from '../../src/sim/serialize';
import { World } from '../../src/sim/world';

describe('Forschungs-Boni', () => {
  it('Stufen summieren sich (Wiki-Tabellen)', () => {
    const r = new ResearchSystem();
    for (let i = 1; i <= 2; i++) r.complete(`research-speed-${i}`);
    expect(r.bonus('lab-speed')).toBeCloseTo(0.5);
    for (let i = 1; i <= 3; i++) r.complete(`weapon-shooting-speed-${i}`);
    expect(r.bonus('shooting-speed')).toBeCloseTo(0.5);
    for (let i = 1; i <= 4; i++) r.complete(`physical-projectile-damage-${i}`);
    expect(r.bonus('bullet-damage')).toBeCloseTo(0.6);
    expect(r.bonus('turret-damage')).toBeCloseTo(0.6);
  });

  it('unendliche Forschung: Stufe zählt hoch, Kosten nach Formel, bleibt erforschbar', () => {
    const r = new ResearchSystem();
    const t = TECH_BY_ID['physical-projectile-damage-4'];
    expect(r.countOf(t)).toBe(300);
    r.complete('physical-projectile-damage-4');
    r.complete('physical-projectile-damage-4');
    expect(r.levelOf(t)).toBe(6);
    expect(r.countOf(t)).toBe(600);
    expect(r.nameOf(t.id)).toBe('Geschossschaden 6');
    expect(r.bonus('bullet-damage')).toBeCloseTo(0.4);
    expect(r.done.has(t.id)).toBe(false);
    const b = new ResearchSystem();
    b.load(r.serialize());
    expect(b.levelOf(t)).toBe(6);
  });

  it('Werkzeuggürtel +10 Plätze, Stahlaxt verdoppelt das Abbautempo; bleibt nach dem Laden', () => {
    const w = new World(1);
    const p = new Player(0.5, 0.5);
    w.player = p;
    w.research.complete('toolbelt');
    w.research.complete('steel-axe');
    w.step();
    expect(p.inventory.size).toBe(PLAYER.inventorySlots + 10);
    expect(p.miningBonus).toBe(1);
    p.inventory.add('iron-plate', 100 * (PLAYER.inventorySlots + 5));
    const b = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(w))));
    expect(b.player!.inventory.count('iron-plate')).toBe(p.inventory.count('iron-plate'));
  });

  it('Bergbau-Produktivität: Bohrer liefert mehr, ohne mehr abzubauen', () => {
    const run = (prod: boolean) => {
      const w = new World(1);
      for (let y = -4; y < 4; y++) for (let x = -4; x < 4; x++) {
        w.map.setWater(x, y, false);
        w.map.setResource(x, y, 0, 0);
      }
      for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) w.map.setResource(x, y, 1, 10000);
      if (prod) for (let i = 1; i <= 2; i++) w.research.complete(`mining-productivity-${i}`);
      const d = w.place('burner-mining-drill', 0, 0, 0)!;
      const c = w.place('iron-chest', 0, -1, 0)!;
      (d as unknown as { insert: (i: string, n: number, m: string) => number }).insert?.('coal', 50, 'player');
      w.run(60 * 120);
      return c.contents().reduce((a, s) => a + s.count, 0);
    };
    const base = run(false);
    expect(base).toBeGreaterThan(10);
    expect(run(true) / base).toBeCloseTo(1.2, 1);
  });
});
