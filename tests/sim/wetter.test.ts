import { describe, expect, it } from 'vitest';
import { DEFAULT_MAP_SETTINGS } from '../../src/data/mapgen';
import { DAY } from '../../src/data/time';
import { CLIMATE, RADIO } from '../../src/data/weather';
import { WORLD } from '../../src/data/world';
import { Player } from '../../src/sim/player';
import { deserializeWorld, serializeWorld } from '../../src/sim/serialize';
import { World } from '../../src/sim/world';

function world(): World {
  const w = new World(WORLD.seed, { ...DEFAULT_MAP_SETTINGS, enemies: 'aus' });
  w.player = new Player(0.5, 0.5);
  w.player.god = true;
  return w;
}

describe('Wetter und Jahreszeiten', () => {
  it('Jahreszeit folgt dem Tag; das Wetter wechselt und wirkt auf Lärm', () => {
    const w = world();
    expect(w.weather.season(0)).toBe('spring');
    expect(w.weather.season(CLIMATE.seasonDays * 3 * DAY.ticks + 10)).toBe('winter');
    const kinds = new Set<string>();
    for (let d = 0; d < 6; d++) {
      w.tick = d * DAY.ticks;
      w.weather.until = 0;
      w.step();
      kinds.add(w.weather.kind);
      expect(w.noise.damp).toBe(w.weather.fx.noise);
    }
    expect(kinds.size).toBeGreaterThan(1);
  });

  it('im Winter wachsen keine Beete', () => {
    const w = world();
    const bed = w.place('garden', 10, 10, 0)!;
    w.tick = CLIMATE.seasonDays * 3 * DAY.ticks + 100;
    w.weather.until = 0;
    w.run(120);
    expect(w.weather.winter).toBe(true);
    expect(bed.kind === 'producer' && bed.progress).toBeLessThanOrEqual(1);
  });

  it('Funkspruch: Notruf setzt einen Überlebenden samt Markierung', () => {
    const w = world();
    w.run(61);
    const before = w.community.survivors.length;
    let tries = 0;
    while (!w.weather.beacons.length && tries++ < 20) {
      w.weather.nextRadio = w.tick;
      w.step();
    }
    expect(w.weather.beacons.length).toBeGreaterThan(0);
    expect(w.community.survivors.length).toBeGreaterThan(before);
    void RADIO;
  });

  it('Speichern/Laden behält Wetter und Funk', () => {
    const w = world();
    w.tick = 2 * DAY.ticks;
    w.run(120);
    const b = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(w))));
    expect(b.weather.kind).toBe(w.weather.kind);
    w.run(300);
    b.run(300);
    expect(JSON.stringify(serializeWorld(b))).toBe(JSON.stringify(serializeWorld(w)));
  });
});
