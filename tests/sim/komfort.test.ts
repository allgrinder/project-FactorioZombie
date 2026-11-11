import { describe, expect, it } from 'vitest';
import { RESEARCH_QUEUE_MAX } from '../../src/data/tech';
import { type FurnaceEntity, insertInto } from '../../src/sim/machines';
import { ResearchSystem } from '../../src/sim/research';
import { deserializeWorld, serializeWorld } from '../../src/sim/serialize';
import { World } from '../../src/sim/world';

function clearWorld(): World {
  const w = new World(3);
  w.map.clearTrees(-30, -30, 30, 30);
  for (let y = -20; y < 20; y++) for (let x = -20; x < 20; x++) {
    w.map.setWater(x, y, false);
    w.map.setResource(x, y, 0, 0);
  }
  return w;
}

describe('Produktionsstatistik', () => {
  it('zählt hergestellte Platten und verbrauchtes Erz/Brennstoff je Zeitfenster', () => {
    const w = clearWorld();
    const f = w.place('stone-furnace', 0, 0, 0) as FurnaceEntity;
    insertInto(f, 'coal', 5, 'player');
    insertInto(f, 'iron-ore', 10, 'player');
    w.run(60 * 40);
    const { made, used } = w.stats.totals(0);
    expect(made.get('iron-plate')).toBe(10);
    expect(used.get('iron-ore')).toBe(10);
    expect(used.get('coal')).toBeGreaterThanOrEqual(1);
    // 10-Minuten-Fenster fasst je 10 s zusammen
    expect(w.stats.rings[1].made.length).toBe(4);
    expect(w.stats.totals(1).made.get('iron-plate')).toBe(10);
    expect(w.stats.series(0, 'iron-plate', 'made').reduce((a, b) => a + b, 0)).toBe(10);
  });
});

describe('Forschungswarteschlange', () => {
  it('reiht fehlende Voraussetzungen davor ein und arbeitet die Schlange ab', () => {
    const r = new ResearchSystem();
    r.complete('steam-power');
    r.complete('electronics');
    r.complete('automation-science-pack');
    expect(r.enqueue('gun-turret')).toBe(true);
    // Bewaffnung vor dem MG-Turm; erste startet sofort
    expect(r.current).toBe('military');
    expect(r.queue).toEqual(['gun-turret']);
    r.complete('military');
    expect(r.current).toBe('gun-turret');
    r.dequeue('gun-turret');
    expect(r.current).toBeNull();
    expect(r.queue).toEqual([]);
    // Länge begrenzt
    for (const t of ['automation', 'logistics', 'logistic-science-pack', 'fast-inserter', 'lamp', 'steel-processing', 'landfill', 'farming', 'radar']) r.enqueue(t);
    expect(r.queue.length + (r.current ? 1 : 0)).toBeLessThanOrEqual(RESEARCH_QUEUE_MAX + 1);
    const b = new ResearchSystem();
    b.load(r.serialize());
    expect(b.queue).toEqual(r.queue);
    expect(b.current).toBe(r.current);
  });

  it('bleibt beim Speichern und Laden der Welt erhalten', () => {
    const w = clearWorld();
    w.research.complete('steam-power');
    w.research.complete('electronics');
    w.research.complete('automation-science-pack');
    w.research.enqueue('logistics-2');
    const b = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(w))));
    expect(b.research.queue).toEqual(w.research.queue);
  });
});

describe('Blaupausen', () => {
  it('erfasst Gebäude mit Einstellungen, dreht, legt Geister ab, Bauen übernimmt das Rezept', async () => {
    const { capture, rotate, encode, decode } = await import('../../src/sim/blueprint');
    const w = clearWorld();
    const am = w.place('assembling-machine-1', 0, 0, 0)!;
    (am as unknown as { setRecipe(r: string): void }).setRecipe('iron-gear-wheel');
    w.place('inserter', 3, 1, 1);
    w.place('transport-belt', 4, 0, 2);
    w.place('transport-belt', 4, 1, 2);
    const bp = capture(w, -1, -1, 5, 3)!;
    expect(bp.w).toBe(5);
    expect(bp.h).toBe(3);
    expect(bp.entities.length).toBe(4);
    expect(bp.entities.find((e) => e.name === 'assembling-machine-1')!.settings).toEqual({ recipe: 'iron-gear-wheel' });
    // Drehen: 5×3 → 3×5, Greifarm zeigt nach Süden
    const r = rotate(bp);
    expect([r.w, r.h]).toEqual([3, 5]);
    expect(r.entities.find((e) => e.name === 'inserter')!.dir).toBe(2);
    expect(rotate(rotate(rotate(r)))).toEqual(bp);
    // Text hin und zurück
    expect(decode(encode(bp))).toEqual(bp);
    expect(decode('kaputt')).toBeNull();
    // Geister ablegen und bauen
    expect(w.ghosts.placeBlueprint(w, bp, 10, 0)).toBe(4);
    expect(w.ghosts.placeBlueprint(w, bp, 10, 0)).toBe(0); // schon belegt
    const built = w.place('assembling-machine-1', 10, 0, 0) as unknown as { recipe: { id: string } | null };
    expect(built.recipe?.id).toBe('iron-gear-wheel');
    expect(w.ghosts.all.size).toBe(3);
    const b = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(w))));
    expect(b.ghosts.all.size).toBe(3);
  });
});
