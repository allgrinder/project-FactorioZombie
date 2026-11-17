import { describe, expect, it } from 'vitest';
import { DEFAULT_MAP_SETTINGS as DEFAULTS, LEGACY_MAP_SETTINGS } from '../../src/data/mapgen';

/** Die Tests prüfen die Rohstofffelder des Vorgängers (in „Letzte Schicht“ abgeschaltet). */
const DEFAULT_MAP_SETTINGS = { ...DEFAULTS, ore: true, sites: false, plan: false };
import { deserializeWorld, serializeWorld } from '../../src/sim/serialize';
import { World } from '../../src/sim/world';

function oreAround(w: World, r: number): { tiles: number; amount: number } {
  let tiles = 0;
  let amount = 0;
  for (let y = -r; y < r; y++) {
    for (let x = -r; x < r; x++) {
      const a = w.map.resourceAt(x, y);
      if (a.amount > 0 && a.res !== 0) {
        tiles++;
        amount += a.amount;
      }
    }
  }
  return { tiles, amount };
}

describe('Karteneinstellungen', () => {
  it('Rohstoffe: leicht fast unerschöpflich, schwer = Grundwerte; Felder in neuen Runden größer', () => {
    const legacy = oreAround(new World(42, LEGACY_MAP_SETTINGS), 40);
    const schwer = oreAround(new World(42, { ...DEFAULT_MAP_SETTINGS, resources: 'schwer' }), 40);
    const leicht = oreAround(new World(42, { ...DEFAULT_MAP_SETTINGS, resources: 'leicht' }), 40);
    expect(schwer.tiles).toBeGreaterThan(legacy.tiles * 2);
    expect(leicht.tiles).toBe(schwer.tiles);
    expect(leicht.amount / schwer.amount).toBeGreaterThan(20);
  });

  it('Einstellungen werden gespeichert; alte Spielstände ohne Einstellung behalten die alte Karte', () => {
    const w = new World(7, { ...DEFAULT_MAP_SETTINGS, resources: 'leicht', enemies: 'aus' });
    const d = JSON.parse(JSON.stringify(serializeWorld(w)));
    const b = deserializeWorld(d);
    expect(b.settings.resources).toBe('leicht');
    expect(b.settings.enemies).toBe('aus');
    delete d.settings;
    const old = deserializeWorld(d);
    expect(old.settings).toEqual(LEGACY_MAP_SETTINGS);
    expect(oreAround(old, 30)).toEqual(oreAround(new World(7), 30));
  });
});
