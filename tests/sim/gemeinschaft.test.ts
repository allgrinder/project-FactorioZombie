import { describe, expect, it } from 'vitest';
import { LEGACY_MAP_SETTINGS } from '../../src/data/mapgen';
import { COMMUNITY, type Job, SCAVENGER } from '../../src/data/scavenge';
import { DAY } from '../../src/data/time';
import { UNITS } from '../../src/data/enemies';
import type { CampEntity, PileEntity, ProducerEntity } from '../../src/sim/machines';
import { Player } from '../../src/sim/player';
import { deserializeWorld, serializeWorld } from '../../src/sim/serialize';
import { World } from '../../src/sim/world';

function arena(settings = {}): World {
  const w = new World(3, { ...LEGACY_MAP_SETTINGS, enemies: 'normal', needs: true, ...settings });
  for (let y = -70; y < 70; y++) for (let x = -70; x < 70; x++) {
    w.map.setWater(x, y, false);
    w.map.setResource(x, y, 0, 0);
  }
  w.map.clearTrees(-70, -70, 70, 70);
  return w;
}

/** Lagerfeuer bei (0,0), Vorratslager daneben (optional), ein Bewohner mit Aufgabe. */
function base(w: World, j: Job, depot = true, food = 10) {
  const fire = w.place('campfire', 0, 0, 0)!;
  const camp = depot ? (w.place('scavenger-camp', 4, -1, 0) as CampEntity) : null;
  camp?.insert('canned-food', food, 'player');
  const k = w.community.addResident(1, 3, j);
  return { fire, camp, k };
}

describe('Gemeinschaft: Sammeln', () => {
  it('Bewohner sammelt ohne Ausrüstung selbstständig Schrott und bringt ihn ins Vorratslager', () => {
    const w = arena();
    const { camp, k } = base(w, 'scavenge');
    const pile = w.place('scrap-pile', 22, 1, 0) as PileEntity;
    const amount = pile.amount;
    w.run(60 * 80);
    const got = camp!.store.contents().reduce((a, s) => a + s.count, 0);
    expect(got).toBeGreaterThanOrEqual(SCAVENGER.capacity);
    expect(pile.amount).toBe(amount - got - k.cargo.length);
    expect(camp!.take(w, () => true)).toBeTruthy();
  });

  it('ohne Vorratslager landet die Ausbeute in einer Kiste am Feuer', () => {
    const w = arena();
    base(w, 'scavenge', false);
    const chest = w.place('wooden-chest', 3, 3, 0)!;
    w.place('scrap-pile', 20, 1, 0);
    w.run(60 * 80);
    expect(chest.kind === 'container' && chest.inventory.contents().length).toBeGreaterThan(0);
  });

  it('läuft um Mauern herum und durch das Tor', () => {
    const w = arena();
    const { camp } = base(w, 'scavenge');
    for (let i = -4; i <= 7; i++) {
      w.place('stone-wall', i, -4, 0);
      w.place('stone-wall', i, 7, 0);
      w.place('stone-wall', -4, i, 0);
      w.place(i === 2 ? 'gate' : 'stone-wall', 7, i, 0);
    }
    const pile = w.place('scrap-pile', -24, 1, 0) as PileEntity;
    const before = pile.amount;
    w.run(60 * 100);
    expect(pile.amount).toBeLessThan(before);
    expect(camp!.store.contents().length).toBeGreaterThan(0);
  });

  it('Zombies jagen Sammler; er flieht; stirbt er, liegt seine Last am Boden', () => {
    const w = arena();
    const { k } = base(w, 'scavenge');
    w.place('scrap-pile', 30, 1, 0);
    w.run(60 * 9);
    expect(k.state === 'out' || k.state === 'gather').toBe(true);
    for (let i = 0; i < 4; i++) w.enemies.spawnAt(k.x + 5 + i * 0.4, k.y + 1 + (i % 2), 'runner');
    let fled = false;
    let hunted = false;
    for (let t = 0; t < 60 * 30; t++) {
      w.step();
      fled ||= k.flee;
      hunted ||= [...w.enemies.units.values()].some((u) => u.prey === k.id);
    }
    expect(fled).toBe(true);
    expect(hunted).toBe(true);
    const w2 = arena();
    const { k: k2 } = base(w2, 'scavenge');
    k2.cargo.push('iron-ore', 'iron-ore');
    w2.community.hurt(w2, k2, 999);
    expect(w2.community.workers.includes(k2)).toBe(false);
    expect(w2.ground.size).toBeGreaterThan(0);
  });
});

describe('Gemeinschaft: Aufgaben', () => {
  it('Wache bezieht Posten und erschießt Zombies mit Magazinen aus dem Vorrat', () => {
    const w = arena();
    const { camp, k } = base(w, 'guard');
    camp!.insert('firearm-magazine', 3, 'player');
    w.run(60 * 4);
    expect(k.state).toBe('post');
    const u = w.enemies.spawnAt(12, 3, 'walker');
    w.run(60 * 10);
    expect(w.enemies.units.has(u.id)).toBe(false);
    expect(camp!.store.count('firearm-magazine')).toBeLessThan(3);
  });

  it('Gärtner pflegt und erntet das Beet ins Vorratslager', () => {
    const w = arena();
    const { camp } = base(w, 'farm', true, 0);
    const bed = w.place('garden', -6, 2, 0) as ProducerEntity;
    bed.out.add('vegetables', 3);
    w.run(60 * 30);
    expect(camp!.food.count('vegetables')).toBe(3);
    // gepflegt wächst es doppelt so schnell
    const p0 = bed.progress;
    w.run(60 * 10);
    expect(bed.progress - p0).toBeGreaterThan(60 * 10 * 1.8);
  });

  it('Gärtner ohne Beet sammelt Wildkräuter', () => {
    const w = arena();
    const { camp } = base(w, 'farm', true, 0);
    w.run(60 * 400);
    expect(camp!.food.count('vegetables')).toBeGreaterThanOrEqual(2);
  });

  it('Handwerker bessert beschädigte Mauern aus', () => {
    const w = arena({ enemies: 'aus' });
    base(w, 'repair');
    const wall = w.place('stone-wall', 6, 6, 0)!;
    wall.hp = wall.def.health / 3;
    w.run(60 * 60);
    expect(wall.hp).toBe(wall.def.health);
  });

  it('Sanitäter heilt die Figur am Lager und verbindet Wunden', () => {
    const w = arena({ enemies: 'aus' });
    const { camp } = base(w, 'medic');
    camp!.insert('bandage', 2, 'player');
    const p = new Player(2.5, -3.5);
    w.player = p;
    p.hp = 40;
    p.wounds.push(w.tick + 99999);
    w.run(60 * 8);
    expect(p.wounds.length).toBe(0);
    expect(p.hp).toBeGreaterThan(50);
    expect(camp!.store.count('bandage')).toBe(1);
  });

  it('Aufgabe wechseln: ★ früherer Beruf arbeitet besser', () => {
    const w = arena();
    const { k } = base(w, 'scavenge');
    k.skill = 'guard';
    expect(w.community.bonus(k)).toBe(1);
    w.community.assign(k, 'guard');
    expect(k.job).toBe('guard');
    expect(w.community.bonus(k)).toBe(COMMUNITY.skillBonus);
  });
});

describe('Gemeinschaft: Versorgung', () => {
  it('morgens isst jeder ein Essen; ohne Essen hungrig, nach drei Tagen geht er', () => {
    const w = arena({ enemies: 'aus' });
    const { camp, k } = base(w, 'rest', true, 1);
    const meal = Math.floor(DAY.ticks * 0.75);
    w.tick = meal - 5;
    w.run(10);
    expect(camp!.food.count('canned-food')).toBe(0);
    expect(k.hunger).toBe(0);
    for (let d = 1; d <= 3; d++) {
      w.tick = d * DAY.ticks + meal - 5;
      w.run(10);
    }
    expect(w.community.residents.length).toBe(0);
  });

  it('Speichern und Laden setzt die Arbeit der Gemeinschaft exakt fort', () => {
    const w = arena();
    const { camp } = base(w, 'scavenge');
    camp!.insert('firearm-magazine', 2, 'player');
    w.community.addResident(-1, 3, 'guard');
    w.community.addResident(2, -3, 'farm');
    w.place('garden', -7, 3, 0);
    w.place('scrap-pile', 18, 4, 0);
    w.enemies.spawnAt(40, 40, 'walker');
    w.run(60 * 12 + 7);
    const b = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(w))));
    w.run(900);
    b.run(900);
    expect(JSON.stringify(serializeWorld(b))).toBe(JSON.stringify(serializeWorld(w)));
  });
});

describe('Gemeinschaft: neue Aufgaben', () => {
  it('Plünderer durchsucht Fundorte im Umkreis und bringt die Beute ins Vorratslager', () => {
    const w = arena({ enemies: 'aus' });
    const { camp } = base(w, 'loot');
    const crate = w.place('supply-crate', 24, 2, 0)!;
    if (crate.kind === 'loot') {
      for (const st of crate.inventory.contents()) crate.inventory.remove(st.item, st.count);
      crate.inventory.add('canned-food', 3);
      crate.inventory.add('bandage', 2);
    }
    w.run(60 * 60);
    expect(crate.kind === 'loot' && crate.searched).toBe(true);
    expect(camp!.food.count('canned-food') + camp!.store.count('canned-food')).toBeGreaterThanOrEqual(3);
    expect(camp!.store.count('bandage')).toBeGreaterThanOrEqual(2);
  });

  it('Gärtner legt mit Holz aus dem Vorrat neue Beete an', () => {
    const w = arena({ enemies: 'aus' });
    const { camp } = base(w, 'farm', true, 0);
    camp!.insert('wood', 30, 'player');
    w.run(60 * 100);
    const beds = [...w.entities.values()].filter((e) => e.name === 'garden').length;
    expect(beds).toBeGreaterThanOrEqual(2);
    expect(camp!.store.count('wood')).toBeLessThan(30);
  });

  it('Wache besetzt den Wachturm und schießt von dort weiter', () => {
    const w = arena();
    const { camp, k } = base(w, 'guard');
    camp!.insert('firearm-magazine', 5, 'player');
    const tower = w.place('watchtower', 8, 8, 0)!;
    w.run(60 * 6);
    expect(Math.hypot(k.x - tower.cx, k.y - tower.cy)).toBeLessThan(2.5);
    // Zombie knapp außerhalb der normalen, aber innerhalb der Turm-Reichweite
    const u = w.enemies.spawnAt(k.x + 16, k.y, 'walker');
    w.run(30);
    expect(w.enemies.units.get(u.id)?.hp ?? 0).toBeLessThan(UNITS.walker.health);
  });
});

describe('Gemeinschaft: Selbstverteidigung', () => {
  it('jeder Bewohner nimmt sich eine Waffe aus dem Vorrat und erschlägt Zombies, die ihn angreifen', () => {
    const w = arena();
    const { camp, k } = base(w, 'rest');
    camp!.insert('baseball-bat', 1, 'player');
    w.run(400);
    expect(k.weapon).toBe('baseball-bat');
    const u = w.enemies.spawnAt(k.x + 3, k.y, 'walker');
    w.run(60 * 20);
    expect(w.enemies.units.has(u.id)).toBe(false);
    expect(w.community.residents).toContain(k);
  });

  it('auch ohne Waffe wehrt er sich mit den Fäusten', () => {
    const w = arena();
    const { k } = base(w, 'rest', true, 10);
    w.run(10);
    const u = w.enemies.spawnAt(k.x + 1, k.y, 'walker');
    const hp0 = u.hp;
    w.run(60 * 4);
    expect((w.enemies.units.get(u.id)?.hp ?? 0)).toBeLessThan(hp0);
  });

  it('Bewaffnete eilen der Figur zu Hilfe', () => {
    const w = arena();
    const { camp, k } = base(w, 'rest');
    camp!.insert('axe', 1, 'player');
    w.run(400);
    const p = new Player(k.x + 6, k.y);
    p.god = true;
    w.player = p;
    const u = w.enemies.spawnAt(p.x + 1, p.y, 'walker');
    w.run(60 * 15);
    expect(w.enemies.units.has(u.id)).toBe(false);
  });
});

describe('Gemeinschaft: Wohnen, Schlaf, Moral, Gefolge', () => {
  it('Bewohner beziehen ein Bett, schlafen nachts darin (Wachen nicht) und stehen morgens auf', () => {
    const w = arena({ enemies: 'aus' });
    const { k } = base(w, 'farm');
    const g = w.community.addResident(-1, 3, 'guard');
    const bed = w.place('bed', 6, 4, 0)!;
    w.run(700);
    expect(k.bed === bed.id || g.bed === bed.id).toBe(true);
    const sleeper = k.bed === bed.id ? k : g;
    sleeper.job = 'farm';
    const other = sleeper === k ? g : k;
    other.job = 'guard';
    w.tick = Math.round(DAY.ticks * 0.5);
    w.run(60 * 20);
    expect(sleeper.state).toBe('sleep');
    expect(Math.hypot(sleeper.x - bed.cx, sleeper.y - bed.cy)).toBeLessThan(0.6);
    expect(other.state).not.toBe('sleep');
    w.tick = Math.round(DAY.ticks * 0.95);
    w.run(10);
    expect(sleeper.state).not.toBe('sleep');
  });

  it('Moral: Essen und Bett heben sie, Hunger und Tote senken sie und damit die Arbeit', () => {
    const w = arena({ enemies: 'aus' });
    const { k } = base(w, 'rest', true, 0);
    const m0 = k.morale;
    const meal = Math.floor(DAY.ticks * 0.75);
    w.tick = meal - 2;
    w.run(4);
    expect(k.morale).toBeLessThan(m0);
    k.morale = 10;
    expect(w.community.bonus(k)).toBeLessThan(1);
  });

  it('Gefolge: folgt der Figur, nimmt eine Pistole aus dem Vorrat und schießt Zombies', () => {
    const w = arena();
    const { camp, k } = base(w, 'rest');
    camp!.insert('pistol', 1, 'player');
    camp!.insert('firearm-magazine', 2, 'player');
    const p = new Player(2.5, 6.5);
    p.god = true;
    w.player = p;
    w.community.setFollow(k, true);
    w.run(301);
    expect(k.gun).toBe(true);
    expect(k.rounds).toBeGreaterThan(0);
    p.px = Math.round(20 * 256);
    w.run(60 * 6);
    expect(Math.hypot(p.x - k.x, p.y - k.y)).toBeLessThan(3);
    const u = w.enemies.spawnAt(k.x + 7, k.y, 'walker');
    w.run(60 * 6);
    expect(w.enemies.units.has(u.id)).toBe(false);
  });
});
