import { describe, expect, it } from 'vitest';
import { STEAM_POWER } from '../../src/data/blueprints';
import { resourceById } from '../../src/data/resources';
import { placed } from '../../src/sim/blueprint';
import { insertInto } from '../../src/sim/machines';
import { powerReport } from '../../src/sim/powerreport';
import { World } from '../../src/sim/world';

function base(fuel: boolean): World {
  const w = new World(1);
  for (let y = -20; y < 30; y++) for (let x = -20; x < 30; x++) {
    w.map.setResource(x, y, 0, 0);
    w.map.setWater(x, y, false);
  }
  w.map.clearTrees(-20, -20, 30, 30);
  w.map.setWater(0, 0, true);
  for (const p of placed(STEAM_POWER, 0, 0)) w.place(p.name, p.x, p.y, p.dir);
  if (fuel) insertInto([...w.entities.values()].find((e) => e.kind === 'boiler')!, 'coal', 50, 'player');
  const iron = resourceById('iron-ore').index;
  for (let y = 7; y < 10; y++) for (let x = 9; x < 12; x++) w.map.setResource(x, y, iron, 5000);
  w.place('small-electric-pole', 8, 8, 0);
  w.place('electric-mining-drill', 9, 7, 2);
  w.place('iron-chest', 10, 10, 0);
  // Bohrer ganz ohne Mast
  for (let y = 20; y < 23; y++) for (let x = 20; x < 23; x++) w.map.setResource(x, y, iron, 5000);
  w.place('electric-mining-drill', 20, 20, 0);
  return w;
}

describe('Strom-Übersicht', () => {
  it('Netz mit Dampfkraft: Nennleistung 1,8 MW, Bedarf des Bohrers gedeckt, Bohrer ohne Mast erkannt', () => {
    const w = base(true);
    w.run(600);
    const r = powerReport(w);
    expect(r.nets.length).toBe(1);
    const n = r.nets[0];
    expect(n.installed * 60).toBe(1_800_000);
    expect(n.generators).toEqual([{ name: 'steam-engine', count: 2, installed: 30_000 }]);
    expect(n.consumers.find((c) => c.name === 'electric-mining-drill')?.count).toBe(1);
    expect(n.demand).toBeGreaterThan(0);
    expect(n.supplied).toBe(n.demand);
    expect(r.unconnected).toBe(1);
    expect(r.boilersNoFuel).toBe(0);
  });

  it('Kessel ohne Brennstoff: Hinweis und Dampfmaschinen ohne Dampf', () => {
    const w = base(false);
    w.run(600);
    const r = powerReport(w);
    expect(r.boilersNoFuel).toBe(1);
    expect(r.nets[0].noSteam).toBe(2);
    expect(r.nets[0].supplied).toBe(0);
  });
});
