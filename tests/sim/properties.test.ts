import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ITEMS } from '../../src/data/items';
import { DEFAULT_MAP_SETTINGS } from '../../src/data/mapgen';
import { Inventory } from '../../src/sim/inventory';
import { deserializeWorld, serializeWorld } from '../../src/sim/serialize';
import { World } from '../../src/sim/world';

/** Eigenschafts-Tests (fast-check): zufällige Abläufe, feste Invarianten. */
const ITEMS_USED = ['iron-ore', 'coal', 'iron-plate', 'copper-cable', 'iron-gear-wheel', 'stone'];

describe('Eigenschaften', () => {
  it('Inventar: Mengen stimmen mit einem einfachen Modell überein, kein Stapel über der Stapelgröße', () => {
    fc.assert(fc.property(
      fc.array(fc.tuple(fc.boolean(), fc.constantFrom(...ITEMS_USED), fc.integer({ min: 1, max: 400 })), { maxLength: 60 }),
      (ops) => {
        const inv = new Inventory(10);
        const model = new Map<string, number>();
        for (const [add, item, n] of ops) {
          if (add) {
            const space = inv.space(item);
            const got = inv.add(item, n);
            expect(got).toBe(Math.min(n, space));
            model.set(item, (model.get(item) ?? 0) + got);
          } else {
            const have = model.get(item) ?? 0;
            const got = inv.remove(item, n);
            expect(got).toBe(Math.min(n, have));
            model.set(item, have - got);
          }
          for (const st of inv.slots) if (st) expect(st.count).toBeLessThanOrEqual(ITEMS[st.item].stackSize);
        }
        for (const it of ITEMS_USED) expect(inv.count(it)).toBe(model.get(it) ?? 0);
      },
    ), { numRuns: 150 });
  });

  it('Bänder: auf einem geschlossenen Ring bleibt die Zahl der Items erhalten', () => {
    fc.assert(fc.property(fc.integer({ min: 2, max: 8 }), fc.integer({ min: 2, max: 8 }), fc.integer({ min: 1, max: 30 }), fc.integer({ min: 1, max: 600 }),
      (wd, ht, items, ticks) => {
        const w = new World(1);
        for (let y = -2; y < ht + 2; y++) for (let x = -2; x < wd + 2; x++) w.map.setWater(x, y, false);
        // Ring im Uhrzeigersinn
        for (let x = 0; x < wd; x++) w.place('transport-belt', x, 0, 1, true);
        for (let y = 0; y < ht; y++) w.place('transport-belt', wd, y, 2, true);
        for (let x = wd; x > 0; x--) w.place('transport-belt', x, ht, 3, true);
        for (let y = ht; y > 0; y--) w.place('transport-belt', 0, y, 0, true);
        let placed = 0;
        for (let k = 0; k < items; k++) {
          const t = w.belts.tileAt(k % wd, 0);
          if (t && w.belts.insertAtPoint(t, 0.5, k % 2 ? 0.25 : 0.75, 0)) placed++;
        }
        w.run(ticks);
        expect(w.belts.itemCount).toBe(placed);
      },
    ), { numRuns: 40 });
  });

  it('Speichern/Laden: nach zufälligen Bauten und Laufzeiten läuft der geladene Stand gleich weiter', () => {
    const NAMES = ['burner-mining-drill', 'stone-furnace', 'wooden-chest', 'transport-belt', 'burner-inserter', 'gun-turret', 'stone-wall'];
    fc.assert(fc.property(
      fc.array(fc.tuple(fc.constantFrom(...NAMES), fc.integer({ min: -12, max: 12 }), fc.integer({ min: -12, max: 12 }), fc.integer({ min: 0, max: 3 })), { minLength: 1, maxLength: 25 }),
      fc.integer({ min: 0, max: 400 }), fc.integer({ min: 1, max: 400 }), fc.boolean(),
      (builds, t1, t2, enemies) => {
        const w = new World(7, { ...DEFAULT_MAP_SETTINGS, enemies: 'normal' });
        for (let y = -20; y < 20; y++) for (let x = -20; x < 20; x++) w.map.setWater(x, y, false);
        for (const [n, x, y, d] of builds) {
          const e = w.place(n, x, y, d as 0 | 1 | 2 | 3);
          if (e && (e.kind === 'drill' || e.kind === 'furnace')) e.insert('coal', 5, 'player');
        }
        if (enemies) {
          // Zombies: ruhend, als Horde zum Lager und einem Geräusch nachgehend
          w.enemies.spawnAt(25.5, -2.5, 'walker');
          w.enemies.spawnAt(-24.5, 6.5, 'runner');
          for (let i = 0; i < 4; i++) {
            const u = w.enemies.spawnAt(26.5 + i, 10.5, i === 3 ? 'brute' : 'walker', 'horde');
            u.tx = 0.5;
            u.ty = 0.5;
          }
          w.noise.emit(0, 0, 60);
        }
        w.run(t1);
        const b = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(w))));
        w.run(t2);
        b.run(t2);
        expect(JSON.stringify(serializeWorld(b))).toBe(JSON.stringify(serializeWorld(w)));
      },
    ), { numRuns: 25 });
  }, 120_000);
});
