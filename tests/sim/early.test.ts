import { describe, expect, it } from 'vitest';
import type { ElectricSource } from '../../src/sim/energy';
import {
  type ContainerEntity, type FluidPumpEntity, type FurnaceEntity, type InserterEntity,
  type PipeGroundEntity, type TankEntity, insertInto,
} from '../../src/sim/machines';
import { World } from '../../src/sim/world';

function clearWorld(seed = 3): World {
  const w = new World(seed);
  w.map.clearTrees(-30, -30, 30, 30);
  for (let y = -20; y < 20; y++) for (let x = -20; x < 20; x++) {
    w.map.setWater(x, y, false);
    w.map.setResource(x, y, 0, 0);
  }
  return w;
}

describe('Frühe Phase (Wiki-Werte)', () => {
  it('Stahl: erst nach Stahlverarbeitung, 5 Platten → 1 Stahl in 16 s (Stahlofen doppelt so schnell)', () => {
    const w = clearWorld();
    const f = w.place('stone-furnace', 0, 0, 0) as FurnaceEntity;
    insertInto(f, 'coal', 10, 'player');
    expect(f.acceptAmount('iron-plate', 'player')).toBe(0);
    w.research.complete('steel-processing');
    expect(insertInto(f, 'iron-plate', 50, 'player')).toBe(50);
    w.run(60 * 16 + 2);
    expect(f.result.count('steel-plate')).toBe(1);
    const s = w.place('steel-furnace', 4, 0, 0) as FurnaceEntity;
    insertInto(s, 'coal', 10, 'player');
    insertInto(s, 'iron-plate', 50, 'player');
    w.run(60 * 16 + 2);
    expect(s.result.count('steel-plate')).toBe(2);
  });

  it('Schneller Greifarm: 24 Ticks je Zyklus', () => {
    const w = clearWorld();
    const a = w.place('iron-chest', 0, 0, 0) as ContainerEntity;
    const ins = w.place('fast-inserter', 1, 0, 1) as InserterEntity;
    const b = w.place('iron-chest', 2, 0, 0) as ContainerEntity;
    insertInto(a, 'iron-plate', 100, 'player');
    const times: number[] = [];
    for (let t = 0; t < 600 && times.length < 11; t++) {
      (ins.energy as ElectricSource).buffer = 1e9;
      const before = b.inventory.count('iron-plate');
      w.step();
      if (b.inventory.count('iron-plate') > before) times.push(t);
    }
    expect((times[10] - times[0]) / 10).toBe(24);
  });

  it('Rohr unterirdisch verbindet bis 10 Felder, Pumpe fördert 1200/s, Tank fasst 25.000', () => {
    const w = clearWorld();
    const tank = w.place('storage-tank', -4, -1, 0) as TankEntity; // Anschluss Ost an (−2, 1)
    w.place('pipe', -1, 1, 0);
    const a = w.place('pipe-to-ground', 0, 1, 3) as PipeGroundEntity; // offen nach Westen
    const b = w.place('pipe-to-ground', 10, 1, 1) as PipeGroundEntity; // Abstand 10, offen nach Osten
    w.place('pipe', 11, 1, 0);
    w.step();
    expect(a.box.net).toBe(b.box.net);
    expect(tank.box.net).toBe(a.box.net);
    expect(tank.box.net!.capacity).toBe((25_000 + 100 + 100 + 100 + 100) * 1000);
    // zu weit: 11 Felder → keine Verbindung
    w.remove(b.id);
    w.place('pipe-to-ground', 11, 3, 1);
    const c = w.place('pipe-to-ground', 0, 3, 3) as PipeGroundEntity;
    w.step();
    expect(c.box.net!.boxes.length).toBe(1);
    // Pumpe: von hinten (Süden) nach vorn (Norden)
    const v = clearWorld();
    const src = v.place('storage-tank', 0, 2, 0) as TankEntity; // Ecke (0,2) Anschluss Nord → (0,1)
    const pump = v.place('pump', 0, 0, 0) as FluidPumpEntity; // Felder (0,0) vorn, (0,1) hinten
    v.place('pipe', 0, -1, 0);
    v.place('pipe', 0, -2, 0);
    const dst = v.place('storage-tank', -2, -5, 0) as TankEntity; // Ecke (0,−3) mit Anschluss Süd → Rohr (0,−2)
    expect(dst).toBeTruthy();
    v.step();
    src.box.net!.add('water', 10_000 * 1000);
    for (let t = 0; t < 60; t++) {
      pump.energy.buffer = 1e9;
      v.step();
    }
    expect(dst.box.net).toBe(pump.output.net);
    expect(Math.round(pump.output.net!.amount / 1000)).toBe(1200);
  });

  it('Landaufschüttung macht Wasser zu Land', () => {
    const w = clearWorld();
    w.map.setWater(3, 3, true);
    expect(w.canPlace('wooden-chest', 3, 3, 0).ok).toBe(false);
    expect(w.landfill(3, 3)).toBe(true);
    expect(w.map.isWater(3, 3)).toBe(false);
    expect(w.canPlace('wooden-chest', 3, 3, 0).ok).toBe(true);
    expect(w.landfill(3, 3)).toBe(false);
  });

  it('Mittlerer und großer Strommast: Reichweite 9 / 32, Versorgung 7×7 / 4×4', () => {
    const w = clearWorld();
    w.place('medium-electric-pole', 0, 0, 0);
    w.place('medium-electric-pole', 9, 0, 0);
    w.place('big-electric-pole', 0, 10, 0);
    w.place('big-electric-pole', 31, 10, 0);
    w.step();
    expect(w.power.wires.length).toBe(2);
  });
});

describe('Tag und Nacht', () => {
  it('Tag 36.000 Ticks (10 min), Dunkelheit nach Phasen, Lampen nur nachts', async () => {
    const { darknessAt, DAY } = await import('../../src/data/time');
    expect(DAY.ticks).toBe(36_000);
    expect(darknessAt(0)).toBe(0);
    expect(darknessAt(0.34)).toBeCloseTo(0.5, 5);
    expect(darknessAt(0.5)).toBe(1);
    expect(darknessAt(0.66)).toBeCloseTo(0.5, 5);
    expect(darknessAt(0.8)).toBe(0);
    const w = clearWorld();
    const lamp = w.place('lamp', 0, 0, 0)!;
    (lamp as unknown as { energy: ElectricSource }).energy.buffer = 1e9;
    w.step();
    expect(lamp.status).toBe(0); // Mittag: aus
    w.tick = Math.round(DAY.ticks * 0.5);
    (lamp as unknown as { energy: ElectricSource }).energy.buffer = 1e9;
    w.step();
    expect(lamp.status).toBe(1); // Nacht: an
  });
});
