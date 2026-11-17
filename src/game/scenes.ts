import { DEFAULT_MAP_SETTINGS, type MapSettings } from '../data/mapgen';
import { WORLD } from '../data/world';
import type { Dir } from '../sim/geom';
import { resourceById } from '../data/resources';
import { type AssemblerEntity, type Entity, type LabEntity, insertInto, itemIndex } from '../sim/machines';
import { Player } from '../sim/player';
import { World } from '../sim/world';

export interface Scene {
  world: World;
  /** Bauen ohne Itemverbrauch, Debug-Tasten aktiv. */
  creative: boolean;
  camera: { x: number; y: number; zoom: number };
  title: string;
}

export type SceneName = 'freeplay' | 'sandbox' | 'stress' | 'demo';

export function createScene(name: SceneName, seed = 12345, settings: MapSettings = DEFAULT_MAP_SETTINGS): Scene {
  switch (name) {
    case 'stress': return stressScene();
    case 'demo': return demoScene(seed);
    case 'sandbox': return sandboxScene(seed);
    default: return freeplayScene(seed, settings);
  }
}

export function freeplayScene(seed: number, settings: MapSettings = DEFAULT_MAP_SETTINGS): Scene {
  const world = new World(seed, settings);
  const p = new Player(0.5, 0.5);
  p.giveStart();
  world.player = p;
  p.note('Kreis Aschland, nach dem Zusammenbruch. Setz dein Lagerfeuer, plündere die Haufen am Schuppen – und sei vor der zweiten Nacht befestigt.');
  return { world, creative: false, camera: { x: 0.5, y: 0.5, zoom: 1 }, title: seed === WORLD.seed ? WORLD.name : `Karte ${seed}` };
}

function sandboxScene(seed: number): Scene {
  const world = new World(seed);
  return { world, creative: true, camera: { x: 0, y: 0, zoom: 1 }, title: 'Sandkasten' };
}

/**
 * Lastszene: 50 Schleifen aus je 2×50 Bandfeldern = 5.000 Felder,
 * je Spur 100 Items = 10.000 Items in Bewegung.
 */
export function stressScene(): Scene {
  const world = new World(1);
  const H = 50;
  const LOOPS = 50;
  const x0 = -LOOPS;
  const y0 = -H / 2;
  for (let k = 0; k < LOOPS; k++) {
    const a = x0 + k * 2;
    const place = (x: number, y: number, d: Dir) => world.place('transport-belt', x, y0 + y, d, true);
    for (let y = 1; y < H; y++) place(a, y, 0);
    place(a, 0, 1);
    place(a + 1, 0, 2);
    for (let y = 1; y < H - 1; y++) place(a + 1, y, 2);
    place(a + 1, H - 1, 3);
  }
  world.belts.ensure();
  const items = [itemIndex('iron-ore'), itemIndex('coal'), itemIndex('stone'), itemIndex('iron-plate')];
  let n = 0;
  for (const line of world.belts.lines) {
    for (let l = 0; l < 2; l++) {
      const lane = line.lanes[l];
      const count = 100;
      const step = Math.floor(lane.len / count);
      for (let i = 0; i < count; i++) {
        if (world.belts.insertAt(lane, i * step, items[(n + l) % items.length])) n++;
      }
    }
  }
  return { world, creative: true, camera: { x: 0, y: 0, zoom: 0.25 }, title: `Last: ${world.belts.count} Felder, ${n} Items` };
}

/**
 * Demo: fertige Kette. Eisenerz- und Kohlebohrer speisen ein gemeinsames Band
 * (Erz links, Kohle rechts), Greifarme beladen zwei Steinöfen mit Erz und Kohle,
 * weitere Greifarme legen die Platten auf ein Ausgabeband.
 */
export function demoScene(seed: number): Scene {
  const world = buildDemoWorld(seed);
  return { world, creative: true, camera: { x: 0.5, y: 1.5, zoom: 1 }, title: 'Demo: Produktionskette' };
}

export function buildDemoWorld(seed: number): World {
  const world = new World(seed);
  const iron = resourceById('iron-ore').index;
  const coal = resourceById('coal').index;
  // Bäume und vorhandene Ressourcen im Demobereich entfernen, dann eigene Felder anlegen
  world.map.clearTrees(-14, -8, 18, 30);
  for (let y = -6; y <= 8; y++) for (let x = -10; x <= 12; x++) world.map.setResource(x, y, 0, 0);
  for (let y = -3; y <= -1; y++) for (let x = -7; x <= -2; x++) world.map.setResource(x, y, iron, 4000);
  for (let y = 1; y <= 3; y++) for (let x = -7; x <= -4; x++) world.map.setResource(x, y, coal, 4000);
  const P = (name: string, x: number, y: number, d: Dir) => {
    const e = world.place(name, x, y, d);
    if (!e) throw new Error(`Demo: ${name} bei ${x},${y} nicht platzierbar`);
    return e;
  };
  for (let x = -6; x <= 7; x++) P('transport-belt', x, 0, 1);
  for (let x = 1; x <= 10; x++) P('transport-belt', x, 5, 1);
  const fuel = (e: Entity, n: number) => insertInto(e, 'coal', n, 'player');
  fuel(P('burner-mining-drill', -6, -2, 2), 20);
  fuel(P('burner-mining-drill', -4, -2, 2), 20);
  fuel(P('burner-mining-drill', -6, 1, 0), 20);
  P('stone-furnace', 2, 2, 0);
  P('stone-furnace', 5, 2, 0);
  P('burner-inserter', 2, 1, 2);
  P('burner-inserter', 5, 1, 2);
  fuel(P('burner-inserter', 3, 4, 2), 2);
  fuel(P('burner-inserter', 6, 4, 2), 2);
  buildDemoPower(world, P);
  return world;
}

/**
 * Stromteil der Demo (südlich): Teich → Uferpumpe → Kessel (Kohle aus Kiste) → Dampfmaschine → Masten.
 * Eine Montagemaschine macht Zahnräder aus Platten einer Kiste, die über Band, Untergrundband,
 * schnelles Band und Splitter laufen; ein Labor erforscht Automatisierung.
 */
function buildDemoPower(world: World, P: (name: string, x: number, y: number, d: Dir) => Entity): void {
  for (let y = 10; y <= 28; y++) for (let x = -13; x <= 16; x++) {
    world.map.setResource(x, y, 0, 0);
    world.map.setWater(x, y, false);
  }
  for (let y = 18; y <= 24; y++) for (let x = -12; x <= -8; x++) world.map.setWater(x, y, !((x === -12 || x === -8) && (y === 18 || y === 24)));
  P('offshore-pump', -8, 21, 1);
  P('pipe', -6, 21, 0);
  P('pipe', -5, 21, 0);
  P('boiler', -4, 20, 0);
  P('pipe', -3, 19, 0);
  P('steam-engine', -4, 14, 0);
  const coalChest = P('iron-chest', -3, 23, 0);
  insertInto(coalChest, 'coal', 400, 'player');
  insertInto(P('burner-inserter', -3, 22, 0), 'coal', 1, 'player');
  for (const [x, y] of [[-1, 15], [1, 16], [6, 16], [10, 16]] as const) P('small-electric-pole', x, y, 0);
  const plates = P('iron-chest', 1, 14, 0);
  insertInto(plates, 'iron-plate', 800, 'player');
  P('inserter', 2, 14, 1);
  const asm = P('assembling-machine-1', 3, 13, 0) as AssemblerEntity;
  asm.setRecipe('iron-gear-wheel');
  P('inserter', 6, 14, 1);
  P('transport-belt', 7, 14, 2);
  P('transport-belt', 7, 15, 2);
  P('underground-belt', 7, 16, 2);
  P('underground-belt', 7, 19, 2);
  P('fast-transport-belt', 7, 20, 2);
  P('fast-transport-belt', 7, 21, 2);
  P('splitter', 7, 22, 2);
  for (let y = 23; y <= 26; y++) {
    P('transport-belt', 7, y, 2);
    P('transport-belt', 8, y, 2);
  }
  const lab = P('lab', 9, 12, 0) as LabEntity;
  insertInto(lab, 'automation-science-pack', 10, 'player');
  for (const t of ['steam-power', 'electronics', 'automation-science-pack']) world.research.complete(t);
  world.research.start('automation');
}
