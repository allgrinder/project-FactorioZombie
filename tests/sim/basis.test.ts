import { describe, expect, it } from 'vitest';
import { DROPS } from '../../src/data/loot';
import { LEGACY_MAP_SETTINGS } from '../../src/data/mapgen';
import { SCAVENGER } from '../../src/data/scavenge';
import { DAY } from '../../src/data/time';
import { TURRET, UNITS } from '../../src/data/enemies';
import type { CampEntity, FireEntity, PileEntity, TurretEntity } from '../../src/sim/machines';
import { Player } from '../../src/sim/player';
import { deserializeWorld, serializeWorld } from '../../src/sim/serialize';
import { Status } from '../../src/sim/entity';
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

function camp(w: World, x = 0, y = 0, kits = 1, food = 10): CampEntity {
  const c = w.place('scavenger-camp', x, y, 0) as CampEntity;
  c.insert('scavenger-kit', kits, 'player');
  c.insert('canned-food', food, 'player');
  return c;
}

describe('Sammeltrupps', () => {
  it('Sammler holt Schrott vom nächsten Haufen und bringt ihn heim; jeder Gang kostet Verpflegung', () => {
    const w = arena();
    const c = camp(w);
    const pile = w.place('scrap-pile', 20, 1, 0) as PileEntity;
    const amount = pile.amount;
    w.run(60);
    expect(w.scavengers.workersOf(c.id).length).toBe(1);
    w.run(60 * 70);
    const got = c.store.contents().reduce((a, s) => a + s.count, 0);
    expect(got).toBeGreaterThanOrEqual(SCAVENGER.capacity);
    expect(pile.amount).toBe(amount - got - w.scavengers.workers[0].cargo.length);
    expect(c.food.count('canned-food')).toBeLessThan(10);
    // Greifarme entnehmen die Ausbeute
    expect(c.take(w, () => true)).toBeTruthy();
  });

  it('ohne Verpflegung (mit Bedürfnissen) bleibt er daheim; ohne Haufen im Umkreis auch', () => {
    const w = arena();
    const c = camp(w, 0, 0, 1, 0);
    w.place('scrap-pile', 20, 1, 0);
    w.run(60 * 20);
    expect(w.scavengers.workers[0].state).toBe('home');
    const w2 = arena();
    const c2 = camp(w2);
    w2.place('scrap-pile', 200, 1, 0);
    w2.run(60 * 20);
    expect(w2.scavengers.workersOf(c2.id)[0].state).toBe('home');
    void c;
  });

  it('läuft um Mauern herum und durch das Tor', () => {
    const w = arena();
    const c = camp(w);
    // Mauerring um die Sammelstelle, Tor im Osten
    for (let i = -3; i <= 5; i++) {
      w.place('stone-wall', i, -3, 0);
      w.place('stone-wall', i, 5, 0);
      w.place('stone-wall', -3, i, 0);
      w.place(i === 1 ? 'gate' : 'stone-wall', 5, i, 0);
    }
    const pile = w.place('scrap-pile', -20, 1, 0) as PileEntity;
    const before = pile.amount;
    w.run(60 * 90);
    expect(pile.amount).toBeLessThan(before);
    expect(c.store.contents().length).toBeGreaterThan(0);
  });

  it('Zombies jagen Sammler; der Sammler flieht, stirbt er, liegt die Last am Boden und die Ausrüstung ist weg', () => {
    const w = arena();
    camp(w);
    w.place('scrap-pile', 30, 1, 0);
    w.run(60 * 9);
    const k = w.scavengers.workers[0];
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
    // Sammler totschlagen: Last fällt zu Boden, Ausrüstung weg
    const w2 = arena();
    const c2 = camp(w2);
    w2.place('scrap-pile', 30, 1, 0);
    w2.run(60 * 20);
    const k2 = w2.scavengers.workers[0];
    k2.cargo.push('iron-ore', 'iron-ore');
    w2.scavengers.hurt(w2, k2, 999);
    expect(w2.scavengers.workers.includes(k2)).toBe(false);
    expect(c2.kits.count('scavenger-kit')).toBe(0);
    expect(w2.ground.size).toBeGreaterThan(0);
  });

  it('Speichern und Laden mitten im Gang läuft gleich weiter', () => {
    const w = arena();
    camp(w, 0, 0, 2);
    w.place('scrap-pile', 18, 4, 0);
    w.place('parts-pile', -16, -6, 0);
    w.enemies.spawnAt(40, 40, 'walker');
    w.run(60 * 12 + 7);
    const b = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(w))));
    w.run(900);
    b.run(900);
    expect(JSON.stringify(serializeWorld(b))).toBe(JSON.stringify(serializeWorld(w)));
  });
});

describe('Basis', () => {
  it('Lagerfeuer brennt nachts mit Holz, leuchtet, ist die Mitte der Basis und Ziel der Horden', () => {
    const w = arena();
    w.player = new Player(0.5, 0.5);
    const f = w.place('campfire', 4, 4, 0) as FireEntity;
    f.insert('wood', 5, 'player');
    w.run(10);
    expect(f.status).toBe(Status.Idle); // Mittag
    w.tick = Math.round(DAY.ticks * 0.5);
    w.run(40);
    expect(f.status).toBe(Status.Working);
    expect(w.isLit(f.cx + 5, f.cy)).toBe(true);
    expect(w.isLit(f.cx + 15, f.cy)).toBe(false);
    expect(w.base?.id).toBe(f.id);
    const p = w.player!;
    p.px = 400 * 256;
    w.enemies.spawnHorde(w, 6, 0);
    const u = [...w.enemies.units.values()].find((x) => x.mode === 'horde')!;
    expect(Math.hypot(u.tx - f.cx, u.ty - f.cy)).toBeLessThan(1);
  });

  it('Schlaf am brennenden Lagerfeuer ist so erholsam wie im Feldbett', () => {
    const w = arena({ enemies: 'aus' });
    const p = new Player(0.5, 0.5);
    w.player = p;
    const f = w.place('campfire', 2, 0, 0) as FireEntity;
    f.insert('wood', 5, 'player');
    w.tick = Math.round(DAY.ticks * 0.5);
    w.run(2);
    p.fatigue = 80;
    p.sleep(w);
    w.run(600);
    const fire = 80 - p.fatigue;
    expect(fire).toBeGreaterThan(600 * 0.025);
  });

  it('nachts ohne Licht schießt der Turm kürzer, im Licht voll', () => {
    const w = arena({ enemies: 'aus' });
    const t = w.place('gun-turret', 0, 0, 0) as TurretEntity;
    expect(t.range(w)).toBe(TURRET.range);
    w.tick = Math.round(DAY.ticks * 0.5);
    w.step();
    expect(t.range(w)).toBeCloseTo(TURRET.range * (1 - TURRET.nightPenalty));
    const f = w.place('brazier', 3, 0, 0) as FireEntity;
    f.insert('coal', 2, 'player');
    w.run(31);
    expect(t.range(w)).toBe(TURRET.range);
  });

  it('Wachturm: weiter, langsamer, stärker als der MG-Turm', () => {
    const w = arena();
    const t = w.place('watchtower', 0, 0, 0) as TurretEntity;
    t.insert('firearm-magazine', 5, 'player');
    const u = w.enemies.spawnAt(22, 1, 'walker');
    w.run(5);
    expect(t.range(w)).toBeGreaterThan(TURRET.range);
    w.run(120);
    expect(w.enemies.units.has(u.id)).toBe(false);
    expect(UNITS.walker.health).toBeLessThan(6 * 2.6 * 3);
  });

  it('neue Figur startet am Lagerfeuer', () => {
    const w = arena();
    const p = new Player(0.5, 0.5);
    w.player = p;
    const f = w.place('campfire', 30, 30, 0)!;
    p.damage(w, 999);
    w.settings = { ...w.settings, death: 'endgueltig' };
    if (!p.dead) p.die(w, 'Test');
    const n = w.newCharacter()!;
    expect(Math.hypot(n.x - f.cx, n.y - f.cy)).toBeLessThan(6);
  });
});

describe('Versorgungsabwürfe', () => {
  it('ab Tag 2 landet eine Kiste in der Ferne, laut, mit Beute', () => {
    const w = arena({ sites: true });
    w.player = new Player(0.5, 0.5);
    w.player.god = true;
    w.tick = DAY.ticks + 60 * 10;
    w.run(Math.round(DROPS.interval * 0.25) + 120);
    expect(w.drops.drops.length).toBe(1);
    const e = w.entities.get(w.drops.drops[0].id)!;
    expect(e.name).toBe('airdrop');
    const d = Math.hypot(e.cx, e.cy);
    expect(d).toBeGreaterThan(DROPS.minDist - 3);
    expect(d).toBeLessThan(DROPS.maxDist + 3);
    expect(e.kind === 'loot' && !e.inventory.isEmpty()).toBe(true);
    expect(w.player.messages.some((m) => m.includes('Versorgungsabwurf'))).toBe(true);
    const b = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(w))));
    expect(b.drops.drops).toEqual(w.drops.drops);
    expect(b.drops.next).toBe(w.drops.next);
  });
});

describe('Überlebende', () => {
  it('wartet sicher, folgt der Figur, wird am Lagerfeuer Sammler der Sammelstelle', () => {
    const w = arena({ enemies: 'aus' });
    const p = new Player(0.5, 0.5);
    w.player = p;
    const fire = w.place('campfire', -2, -6, 0)!;
    const c = w.place('scavenger-camp', 4, -8, 0) as CampEntity;
    const s = w.scavengers.addSurvivor(30.5, 0.5);
    w.run(30);
    expect(s.state).toBe('wait');
    expect(w.scavengers.nearest(s.x, s.y, 5)).toBeNull(); // wartend: Zombies sehen ihn nicht
    p.px = Math.round(29 * 256);
    w.run(2);
    expect(s.state).toBe('follow');
    // Figur geht heim, der Überlebende folgt
    for (let i = 0; i < 60 * 20 && w.scavengers.survivors.length; i++) {
      p.moveX = p.x > fire.cx + 2 ? -1 : 0;
      p.moveY = p.y > fire.cy + 3 ? -1 : 0;
      w.step();
    }
    expect(w.scavengers.survivors.length).toBe(0);
    expect(c.kits.count('scavenger-kit')).toBe(1);
    expect(w.stats.totalMade.get('rescue.survivor') ?? 0).toBe(0); // Sekundenstatistik
    w.run(61);
    expect(w.stats.totalMade.get('rescue.survivor')).toBe(1);
  });

  it('feste Welt: in Dörfern und Städten warten Überlebende', async () => {
    const { WORLD } = await import('../../src/data/world');
    const { DEFAULT_MAP_SETTINGS } = await import('../../src/data/mapgen');
    const w = new World(WORLD.seed, { ...DEFAULT_MAP_SETTINGS, enemies: 'aus' });
    w.player = new Player(0.5, 0.5);
    const t = WORLD.towns.find((x) => x.size === 3)!;
    w.player.px = t.x * 256;
    w.player.py = t.y * 256;
    w.step();
    expect(w.scavengers.survivors.filter((k) => Math.hypot(k.x - t.x, k.y - t.y) < 60).length).toBe(2);
  });
});
