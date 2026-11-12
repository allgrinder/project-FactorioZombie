import { describe, expect, it } from 'vitest';
import { RECIPE_LIST } from '../../src/data/recipes';
import {
  DEFAULT_MACHINES, beltRates, idealMultiple, intRatio, ratePerMachine, ratioRules, recipesFor, solve,
} from '../../src/sim/ratio';

const AM1 = { ...DEFAULT_MACHINES, assembler: 'assembling-machine-1' as const };

describe('Verhältnis-Rechner (Handbuch)', () => {
  it('Bohrer : Steinofen = 5 : 8, ein gelbes Band = 15/s', () => {
    expect(ratePerMachine('iron-plate')).toBeCloseTo(0.3125);
    expect(intRatio(0.5, 0.3125)).toEqual([5, 8]);
    expect(beltRates()[0].rate).toBe(15);
    const n = solve('iron-plate', 15);
    expect(n.count).toBeCloseTo(48);
    expect(n.children[0].count).toBeCloseTo(30);
  });

  it('Klassiker: 3 Kabel : 2 Schaltkreise, 1 Zahnrad : 10 rote Pakete (gleiche Maschinen)', () => {
    expect(idealMultiple('electronic-circuit', AM1)).toBe(2);
    const c = solve('electronic-circuit', 2 * ratePerMachine('electronic-circuit', AM1), AM1);
    expect(c.count).toBeCloseTo(2);
    expect(c.children.find((x) => x.item === 'copper-cable')!.count).toBeCloseTo(3);
    expect(idealMultiple('automation-science-pack', AM1)).toBe(10);
  });

  it('Dampfkraft 1 : 20 : 40; gestrichene Ketten (Öl, Plastik) fehlen', () => {
    const rules = ratioRules();
    const steam = rules.find((r) => r.title.startsWith('Dampfkraft'))!;
    expect(steam.parts.map((p) => p.count)).toEqual([1, 20, 40]);
    expect(rules.find((r) => r.item === 'plastic-bar')).toBeUndefined();
    expect(rules.find((r) => r.item === 'chemical-science-pack')).toBeUndefined();
  });

  it('jedes Produkt lässt sich ohne Fehler und ohne Endlosschleife auflösen', () => {
    const items = new Set(RECIPE_LIST.flatMap((r) => r.results.map((x) => x.item)));
    for (const id of items) {
      const n = solve(id, 1);
      expect(Number.isFinite(n.count)).toBe(true);
    }
    expect(recipesFor('petroleum-gas').length).toBe(0);
    expect(recipesFor('iron-plate').map((r) => r.id).sort()).toEqual(['iron-plate']);
  });
});
