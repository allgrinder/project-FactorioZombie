import { describe, expect, it } from 'vitest';
import { DEFAULT_MAP_SETTINGS, LEGACY_MAP_SETTINGS, RUBBLE } from '../../src/data/mapgen';
import { RESOURCE_BY_INDEX, resourceById } from '../../src/data/resources';
import { Status } from '../../src/sim/entity';
import { World } from '../../src/sim/world';

/** Zählt das Material aller Trümmerfelder im Quadrat ±r um (cx, cy). */
function census(w: World, cx: number, cy: number, r: number): Map<string, number> {
  const m = new Map<string, number>();
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
    const t = w.map.resourceAt(x, y);
    if (t.amount > 0) m.set(RESOURCE_BY_INDEX[t.res]!.id, (m.get(RESOURCE_BY_INDEX[t.res]!.id) ?? 0) + 1);
  }
  return m;
}

describe('Trümmerfelder', () => {
  it('Anteile je Feldart ergeben 1; jede Art hat ihr Hauptmaterial', () => {
    for (const [id, k] of Object.entries(RUBBLE)) {
      expect(k.mix.reduce((a, m) => a + m.share, 0)).toBeCloseTo(1);
      expect(k.mix[0].resource).toBe(id);
      expect(k.mix[0].share).toBeGreaterThan(0.5);
    }
  });

  it('Felder sind gemischt: am Start gibt es alle vier Materialien, Eisen vor allem auf dem Schrottplatz', () => {
    const w = new World(21, DEFAULT_MAP_SETTINGS);
    const all = census(w, 0, 0, 60);
    for (const id of ['iron-ore', 'copper-ore', 'stone', 'coal']) expect(all.get(id) ?? 0, id).toBeGreaterThan(20);
    // Feldart unter einem Feld: Name und Hauptanteil passen zusammen
    let checked = 0;
    for (let y = -60; y <= 60 && checked < 3; y += 3) for (let x = -60; x <= 60 && checked < 3; x += 3) {
      if (w.map.resourceAt(x, y).amount === 0 || w.map.rubbleName(x, y) !== 'Schrottplatz') continue;
      const c = census(w, x, y, 4);
      const total = [...c.values()].reduce((a, b) => a + b, 0);
      if (total < 60) continue;
      expect((c.get('iron-ore') ?? 0) / total).toBeGreaterThan(0.4);
      expect(c.size).toBeGreaterThan(1);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
    // kein Öl und kein Uran in der Trümmerwelt
    expect(all.has('crude-oil')).toBe(false);
  });

  it('ohne die Einstellung bleiben die Felder rein (Tests, Demo)', () => {
    const w = new World(21, { ...DEFAULT_MAP_SETTINGS, rubble: false });
    let mixed = 0;
    for (let y = -40; y <= 40; y++) for (let x = -40; x <= 40; x++) {
      const a = w.map.resourceAt(x, y);
      const b = w.map.resourceAt(x + 1, y);
      if (a.amount && b.amount && a.res !== b.res) mixed++;
    }
    expect(mixed).toBeLessThan(40);
    expect(new World(1, LEGACY_MAP_SETTINGS).map.rubbleName(0, 0)).toBeNull();
  });

  it('Schrottgreifer verwertet nur Metall, Schuttbrecher nur Schutt und Kohle, die Sortieranlage alles', () => {
    const iron = resourceById('iron-ore').index;
    const stone = resourceById('stone').index;
    const setup = () => {
      const w = new World(5, { ...LEGACY_MAP_SETTINGS, rubble: true });
      for (let y = -8; y < 8; y++) for (let x = -8; x < 8; x++) {
        w.map.setWater(x, y, false);
        w.map.setResource(x, y, 0, 0);
      }
      w.map.clearTrees(-8, -8, 8, 8);
      return w;
    };
    // nur Schutt: der Greifer lässt sich nicht setzen, der Brecher schon
    let w = setup();
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) w.map.setResource(x, y, stone, 500);
    const chk = w.canPlace('burner-mining-drill', 0, 0, 0);
    expect(chk.ok).toBe(false);
    expect(chk.reason).toContain('Schrottgreifer');
    expect(w.canPlace('stone-crusher', 0, 0, 0).ok).toBe(true);
    // gemischt: jeder holt nur seins
    w = setup();
    w.map.setResource(0, 0, iron, 500);
    w.map.setResource(1, 0, stone, 500);
    w.map.setResource(0, 1, stone, 500);
    w.map.setResource(1, 1, iron, 500);
    const g = w.place('burner-mining-drill', 0, 0, 0)!;
    g.insert('coal', 10, 'player');
    const chest = w.place('iron-chest', 0, -1, 0)!;
    w.run(60 * 60);
    expect(g.status).toBe(Status.Working);
    const got = chest.contents();
    expect(got.length).toBe(1);
    expect(got[0].item).toBe('iron-ore');
    expect(w.map.resourceAt(1, 0).amount).toBe(500);
    // Eisen erschöpft: der Greifer meldet „erschöpft“, obwohl noch Schutt liegt
    w.map.setResource(0, 0, 0, 0);
    w.map.setResource(1, 1, 0, 0);
    w.run(10);
    expect(g.status).toBe(Status.Depleted);
    w.remove(g.id);
    const c = w.place('stone-crusher', 0, 0, 0)!;
    c.insert('coal', 10, 'player');
    w.run(60 * 30);
    expect(chest.contents().some((s) => s.item === 'stone')).toBe(true);
    // Sortieranlage: kein Filter
    expect(w.canPlace('electric-mining-drill', 3, 3, 0).ok).toBe(false); // keine Trümmer dort
    w.map.setResource(4, 4, stone, 100);
    expect(w.canPlace('electric-mining-drill', 3, 3, 0).ok).toBe(true);
  });
});
