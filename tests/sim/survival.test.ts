import { describe, expect, it } from 'vitest';
import { UNITS } from '../../src/data/enemies';
import { ASPHALT } from '../../src/data/floors';
import { DEFAULT_MAP_SETTINGS, LEGACY_MAP_SETTINGS } from '../../src/data/mapgen';
import { RECIPE_LIST, RECIPES, isCraftable } from '../../src/data/recipes';
import { SURVIVAL } from '../../src/data/survival';
import { TECHS } from '../../src/data/tech';
import { DAY } from '../../src/data/time';
import { ITEMS } from '../../src/data/items';
import type { ElectricSource } from '../../src/sim/energy';
import type { LootEntity, ProducerEntity, RadioEntity } from '../../src/sim/machines';
import { Player } from '../../src/sim/player';
import { deserializeWorld, serializeWorld } from '../../src/sim/serialize';
import { World } from '../../src/sim/world';

function arena(settings = {}): World {
  const w = new World(3, { ...LEGACY_MAP_SETTINGS, needs: true, death: 'endgueltig', ...settings });
  for (let y = -30; y < 30; y++) for (let x = -30; x < 30; x++) {
    w.map.setWater(x, y, false);
    w.map.setResource(x, y, 0, 0);
  }
  w.map.clearTrees(-30, -30, 30, 30);
  w.player = new Player(0.5, 0.5);
  return w;
}

describe('Hunger, Durst, Müdigkeit', () => {
  it('sinken mit der Zeit; Essen und Trinken helfen, die Flasche bleibt', () => {
    const w = arena();
    const p = w.player!;
    const h0 = p.hunger;
    const t0 = p.thirst;
    w.run(DAY.ticks / 2);
    expect(p.hunger).toBeLessThan(h0 - 10);
    expect(p.thirst).toBeLessThan(t0 - 20);
    expect(p.fatigue).toBeGreaterThan(SURVIVAL.start.fatigue + 20);
    p.inventory.add('canned-food', 1);
    p.inventory.add('water-bottle', 1);
    const h1 = p.hunger;
    expect(p.use(w, 'canned-food')).toBeNull();
    expect(p.hunger).toBeGreaterThan(h1 + 30);
    expect(p.use(w, 'water-bottle')).toBeNull();
    expect(p.inventory.count('empty-bottle')).toBe(1);
    expect(p.use(w, 'canned-food')).not.toBeNull(); // keine mehr
  });

  it('ohne Wasser verdurstet die Figur – endgültiger Tod, Inventar in der Leiche', () => {
    const w = arena();
    const p = w.player!;
    p.inventory.add('iron-plate', 5);
    p.hunger = 100;
    w.run(Math.round(DAY.ticks * (SURVIVAL.thirstDays + 0.6)));
    expect(p.dead).toBe(true);
    expect(p.deathCause).toContain('verdurstet');
    expect(w.corpses.all.length).toBe(1);
    const tick = w.tick;
    const x = p.px;
    p.moveX = 1;
    w.run(60);
    expect(p.px).toBe(x); // Tote laufen nicht
    expect(w.tick).toBe(tick + 60);
    const b = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(w))));
    expect(b.player!.dead).toBe(true);
  });

  it('Einstellung „Wiedereinstieg“: Neustart am Lager statt Ende', () => {
    const w = arena({ death: 'wiedereinstieg' });
    const p = w.player!;
    p.px = 10 * 256;
    p.inventory.add('iron-plate', 5);
    p.damage(w, 500);
    expect(p.dead).toBe(false);
    expect(p.hp).toBe(100);
    expect(p.x).toBeCloseTo(0.5);
    expect(p.inventory.count('iron-plate')).toBe(0);
    expect(w.corpses.all.length).toBe(1);
  });

  it('Schlaf baut Müdigkeit ab (im Feldbett schneller), Zombies in der Nähe wecken', () => {
    const rest = (bed: boolean) => {
      const w = arena();
      const p = w.player!;
      if (bed) w.place('bed', 1, 0, 0);
      p.fatigue = 80;
      expect(p.sleep(w)).toBeNull();
      expect(p.sleeping).toBe(true);
      w.run(600);
      return 80 - p.fatigue;
    };
    expect(rest(true)).toBeGreaterThan(rest(false) * 1.8);
    const w = arena();
    const p = w.player!;
    p.fatigue = 10;
    expect(p.sleep(w)).toContain('nicht müde');
    p.fatigue = 90;
    const z = w.enemies.spawnAt(6.5, 0.5, 'walker');
    expect(p.sleep(w)).toContain('Zombies');
    w.enemies.units.delete(z.id);
    expect(p.sleep(w)).toBeNull();
    w.enemies.spawnAt(7.5, 0.5, 'walker');
    w.run(31);
    expect(p.sleeping).toBe(false);
  });

  it('müde und fiebrig ist die Figur langsamer', () => {
    const w = arena();
    const p = w.player!;
    expect(p.condition).toBe(1);
    p.fatigue = 90;
    expect(p.condition).toBeCloseTo(SURVIVAL.tiredSpeed);
    p.infection = 0.8;
    expect(p.condition).toBeCloseTo(SURVIVAL.tiredSpeed * SURVIVAL.feverSpeed);
  });
});

describe('Wunden und Infektion', () => {
  it('Blutung kostet Leben, ein Verband stoppt sie', () => {
    const w = arena();
    const p = w.player!;
    p.hunger = p.thirst = 100;
    p.wounds.push(w.tick + SURVIVAL.bleedTicks);
    w.run(600);
    expect(p.hp).toBeCloseTo(100 - 10 * SURVIVAL.bleedPerSecond, 1);
    p.inventory.add('bandage', 2);
    expect(p.use(w, 'bandage')).toBeNull();
    expect(p.wounds.length).toBe(0);
    p.hp = 50;
    const hp = p.hp;
    w.run(600);
    expect(p.hp).toBeGreaterThan(hp); // heilt wieder
    p.hp = 100;
    expect(p.use(w, 'bandage')).toContain('nicht verletzt');
  });

  it('Biss: Infektion endet tödlich, Antibiotika heilen', () => {
    const w = arena();
    const p = w.player!;
    p.infection = 0;
    p.inventory.add('canned-food', 20);
    p.inventory.add('water-bottle', 20);
    p.inventory.add('antibiotics', 2);
    const keepAlive = (ticks: number) => {
      for (let t = 0; t < ticks && !p.dead; t += 600) {
        if (p.hunger < 50) p.use(w, 'canned-food');
        if (p.thirst < 50) p.use(w, 'water-bottle');
        p.fatigue = 0;
        w.run(600);
      }
    };
    keepAlive(DAY.ticks);
    expect(p.dead).toBe(false);
    expect(p.infection).toBeGreaterThan(0.6);
    expect(p.use(w, 'antibiotics')).toBeNull();
    expect(p.infection).toBeNull();
    expect(p.use(w, 'antibiotics')).toContain('nicht infiziert');
    p.infection = 0;
    keepAlive(DAY.ticks * 2);
    expect(p.dead).toBe(true);
    expect(p.deathCause).toContain('Infektion');
  });

  it('Zombietreffer können Wunden reißen und infizieren (Zufall aus Seed und Tick)', () => {
    const w = arena();
    const p = w.player!;
    let wounds = 0;
    let bites = 0;
    for (let i = 0; i < 400; i++) {
      w.tick++;
      p.hp = 100;
      p.wounds = [];
      p.infection = null;
      p.damage(w, 1, UNITS.walker);
      wounds += p.wounds.length;
      bites += p.infection !== null ? 1 : 0;
    }
    expect(wounds / 400).toBeGreaterThan(UNITS.walker.bleedChance * 0.6);
    expect(wounds / 400).toBeLessThan(UNITS.walker.bleedChance * 1.5);
    expect(bites).toBeGreaterThan(2);
    expect(bites).toBeLessThan(45);
  });
});

describe('Versorgung', () => {
  it('leere Flaschen am Wasser füllen; Regentonne füllt sie von selbst', () => {
    const w = arena();
    const p = w.player!;
    w.map.setWater(2, 0, true);
    p.inventory.add('empty-bottle', 3);
    expect(p.fillBottles(w, 10, 10)).toBe(0);
    expect(p.fillBottles(w, 2, 0)).toBe(3);
    expect(p.inventory.count('water-bottle')).toBe(3);
    const barrel = w.place('rain-barrel', -2, 0, 0) as ProducerEntity;
    expect(barrel.insert('empty-bottle', 2, 'player')).toBe(2);
    w.run(75 * 60 * 2 + 5);
    expect(barrel.out.count('water-bottle')).toBe(2);
    expect(barrel.take(w, () => true)).toBe('water-bottle');
  });

  it('Gemüsebeet wächst nur bei Tageslicht, bis das Beet voll ist', () => {
    const w = arena();
    const g = w.place('garden', 3, 3, 0) as ProducerEntity;
    w.run(150 * 60 + 5);
    expect(g.out.count('vegetables')).toBe(1);
    w.tick = Math.round(DAY.ticks * 0.5);
    w.run(150 * 60 + 5);
    expect(g.out.count('vegetables')).toBe(1);
    expect(ITEMS.vegetables.name).toBe('Gemüse');
  });

  it('Schrott lässt sich einschmelzen, Akku braucht keine Chemie', () => {
    expect(RECIPES['scrap-smelting'].results[0].item).toBe('iron-plate');
    expect(RECIPES.accumulator.ingredients.some((i) => i.item === 'battery')).toBe(false);
    const w = arena();
    const f = w.place('stone-furnace', 3, 3, 0)!;
    f.insert('scrap', 4, 'player');
    f.insert('coal', 2, 'player');
    w.run(60 * 8);
    expect(f.contents().find((s) => s.item === 'iron-plate')?.count).toBe(2);
  });
});

describe('Fundorte', () => {
  it('Wrack durchsuchen: erst danach ist die Beute sichtbar; Greifarme kommen nicht heran', () => {
    const w = arena();
    const p = w.player!;
    const car = w.create(w.nextId++, 'car-wreck', 2, 0, 0) as LootEntity;
    expect(car.guiSlots().length).toBe(0);
    expect(car.take(w, () => true)).toBeNull();
    expect(p.search(w, car.id)).toBeNull();
    w.run(car.searchTicks - 1);
    expect(car.searched).toBe(false);
    w.run(2);
    expect(car.searched).toBe(true);
    expect(car.guiSlots().length).toBe(1);
    // gleiche Beute bei gleicher Karte und Lage
    const w2 = arena();
    const car2 = w2.create(w2.nextId++, 'car-wreck', 2, 0, 0) as LootEntity;
    expect(car2.inventory.serialize()).toEqual(car.inventory.serialize());
    // zu weit weg
    p.px = 20 * 256;
    const house = w.create(w.nextId++, 'ruin-house', -10, -10, 0) as LootEntity;
    expect(p.search(w, house.id)).toContain('weit');
  });

  it('Ausschlachten liefert Schrott und Bauteile, mit Brecheisen schneller', () => {
    const time = (crowbar: boolean) => {
      const w = arena();
      const p = w.player!;
      if (crowbar) p.inventory.add('crowbar', 1);
      const car = w.create(w.nextId++, 'car-wreck', 1, 0, 0) as LootEntity;
      const loot = car.inventory.count('scrap');
      p.setMineTarget({ kind: 'entity', id: car.id });
      let t = 0;
      while (w.entities.has(car.id) && t < 5000) {
        w.step();
        t++;
      }
      expect(p.inventory.count('scrap')).toBe(10 + loot);
      expect(p.inventory.count('iron-gear-wheel')).toBeGreaterThanOrEqual(3);
      return t;
    };
    expect(time(true)).toBeLessThan(time(false) * 0.6);
  });

  it('Karte: Startfundort in der Nähe, Dörfer mit Straße weiter draußen; bleibt nach dem Laden', () => {
    const w = new World(11, { ...DEFAULT_MAP_SETTINGS, enemies: 'aus' });
    const p = new Player(0.5, 0.5);
    w.player = p;
    w.step();
    const starter = w.sites.sites.find((s) => s.kind === 'starter');
    expect(starter).toBeTruthy();
    expect(Math.hypot(starter!.x, starter!.y)).toBeLessThan(35);
    // weit herumlaufen lassen (Figur versetzen), bis ein Dorf erzeugt ist
    for (let i = 0; i < 40 && !w.sites.sites.some((s) => s.kind === 'village'); i++) {
      p.px = Math.round(Math.cos(i * 0.7) * (150 + i * 40)) * 256;
      p.py = Math.round(Math.sin(i * 0.7) * (150 + i * 40)) * 256;
      w.tick = Math.ceil(w.tick / 60) * 60;
      w.step();
    }
    const village = w.sites.sites.find((s) => s.kind === 'village')!;
    expect(village).toBeTruthy();
    const loot = [...w.entities.values()].filter((e) => e.kind === 'loot');
    const near = loot.filter((e) => Math.hypot(e.cx - village.x, e.cy - village.y) < 30);
    expect(near.length).toBeGreaterThanOrEqual(3);
    let road = 0;
    for (let y = village.y - 25; y <= village.y + 25; y++) for (let x = village.x - 25; x <= village.x + 25; x++) if (w.map.floorAt(x, y) === ASPHALT) road++;
    expect(road).toBeGreaterThan(20);
    const b = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(w))));
    expect(b.sites.sites.length).toBe(w.sites.sites.length);
    expect([...b.entities.values()].filter((e) => e.kind === 'loot').length).toBe(loot.length);
    const n = b.entities.size;
    b.step();
    expect(b.entities.size).toBe(n); // nichts doppelt angelegt
  });

  it('Zombies lungern an Fundorten; rund um den Start ist es ruhig', () => {
    const w = new World(11, { ...DEFAULT_MAP_SETTINGS });
    const p = new Player(0.5, 0.5);
    w.player = p;
    w.step();
    expect(w.enemies.near(0, 0, 40).length).toBe(0);
    expect(w.enemies.units.size).toBeGreaterThan(5);
  });
});

describe('Spielziel und Inhalt', () => {
  it('Funkturm ruft unter Strom die Rettung', () => {
    const w = arena();
    const r = w.place('radio-tower', 4, 4, 0) as RadioEntity;
    w.run(60);
    expect(w.rescuedAt).toBeNull();
    expect(r.sent).toBe(0);
    for (let t = 0; t < r.totalTicks + 5; t++) {
      (r as unknown as { energy: ElectricSource }).energy.buffer = 1e9;
      w.step();
    }
    expect(w.rescuedAt).not.toBeNull();
    const b = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(w))));
    expect(b.rescuedAt).toBe(w.rescuedAt);
  });

  it('gestrichene Inhalte sind weg, jede Forschung schaltet vorhandene Rezepte frei, alle Zutaten sind beschaffbar', () => {
    for (const id of ['oil-refinery', 'locomotive', 'roboport', 'nuclear-reactor', 'rocket-silo', 'assembling-machine-2', 'express-transport-belt', 'speed-module']) {
      expect(isCraftable(id), id).toBe(false);
    }
    for (const t of TECHS) for (const u of t.unlocks) expect(RECIPES[u], `${t.id} → ${u}`).toBeTruthy();
    for (const t of TECHS) for (const pre of t.prerequisites) expect(TECHS.some((x) => x.id === pre), `${t.id} braucht ${pre}`).toBe(true);
    // Rohstoffe und reine Beute
    const raw = new Set(['iron-ore', 'copper-ore', 'coal', 'stone', 'wood', 'water', 'steam', 'scrap', 'cloth', 'radio-parts', 'vegetables', 'water-bottle']);
    for (const r of RECIPE_LIST) for (const i of r.ingredients) expect(raw.has(i.item) || isCraftable(i.item), `${r.id} braucht ${i.item}`).toBe(true);
    for (const r of RECIPE_LIST) for (const x of [...r.ingredients, ...r.results]) expect(ITEMS[x.item] || x.item === 'water' || x.item === 'steam', x.item).toBeTruthy();
  });

  it('Startausrüstung und neue Runde: satt genug, bewaffnet, verbunden', () => {
    const p = new Player(0, 0);
    p.giveStart();
    expect(p.meleeWeapon).toBe('baseball-bat');
    expect(p.weapon).toBe('pistol');
    expect(p.inventory.count('bandage')).toBe(2);
    expect(p.hunger).toBe(SURVIVAL.start.hunger);
  });
});
