import { describe, expect, it } from 'vitest';
import { DEFAULT_MAP_SETTINGS as DEFAULTS, LEGACY_MAP_SETTINGS, type MapSettings } from '../../src/data/mapgen';

/** Die Tests prüfen die Rohstofffelder des Vorgängers (in „Letzte Schicht“ abgeschaltet). */
const DEFAULT_MAP_SETTINGS = { ...DEFAULTS, ore: true, sites: false, plan: false };
import { GameMap } from '../../src/sim/map';

/** Erzmenge (Stichprobe jedes 3. Feld) in einem Quadrat um den Start. */
function ore(s: MapSettings, r = 360): { tiles: number; amount: number } {
  const m = new GameMap(4242, s);
  let tiles = 0;
  let amount = 0;
  for (let y = -r; y < r; y += 3) for (let x = -r; x < r; x += 3) {
    const t = m.resourceAt(x, y);
    if (t.res > 0 && t.amount > 0) {
      tiles++;
      amount += t.amount;
    }
  }
  return { tiles, amount };
}

describe('Rohstoff-Häufigkeit (Wunsch 09.11.2026)', () => {
  it('„Viel“ (Standard neuer Runden) hat deutlich mehr Erzfelder und Menge als „Normal“', () => {
    const base = { ...DEFAULT_MAP_SETTINGS, frequency: 'normal' as const };
    const n = ore(base);
    const v = ore(DEFAULT_MAP_SETTINGS);
    expect(DEFAULT_MAP_SETTINGS.frequency).toBe('viel');
    expect(v.tiles).toBeGreaterThan(n.tiles * 1.5);
    expect(v.amount).toBeGreaterThan(n.amount * 2);
  });

  it('Alte Spielstände (ohne Einstellung) behalten ihre Karte', () => {
    const a = new GameMap(99, LEGACY_MAP_SETTINGS);
    const b = new GameMap(99, { ...LEGACY_MAP_SETTINGS, frequency: 'normal' });
    for (let y = -200; y < 200; y += 7) for (let x = -200; x < 200; x += 7) expect(a.resourceAt(x, y)).toEqual(b.resourceAt(x, y));
  });
});
