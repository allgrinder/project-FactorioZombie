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


});
