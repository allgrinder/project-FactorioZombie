import { describe, expect, it } from 'vitest';
import { LEGACY_MAP_SETTINGS } from '../../src/data/mapgen';
import { SKILLS, STAMINA, WARMTH } from '../../src/data/survival';
import { DAY } from '../../src/data/time';
import { Player } from '../../src/sim/player';
import type { FireEntity } from '../../src/sim/entities/survival';
import { deserializeWorld, serializeWorld } from '../../src/sim/serialize';
import { World } from '../../src/sim/world';

function arena(extra: Partial<typeof LEGACY_MAP_SETTINGS> & Record<string, unknown> = {}): { w: World; p: Player } {
  const w = new World(3, { ...LEGACY_MAP_SETTINGS, enemies: 'normal', ...extra });
  for (let y = -40; y < 40; y++) for (let x = -40; x < 40; x++) {
    w.map.setWater(x, y, false);
    w.map.setResource(x, y, 0, 0);
  }
  w.map.clearTrees(-40, -40, 40, 40);
  const p = new Player(0.5, 0.5);
  w.player = p;
  return { w, p };
}

describe('Schleichen', () => {
  it('geduckt bemerkt ein Zombie die Figur erst viel später', () => {
    const a = arena();
    const ua = a.w.enemies.spawnAt(7.5, 0.5, 'walker');
    a.w.run(30);
    expect(ua.mode).toBe('chase');
    const b = arena();
    b.p.toggleCrouch();
    const ub = b.w.enemies.spawnAt(7.5, 0.5, 'walker');
    b.w.run(30);
    expect(ub.mode).toBe('idle');
  });

  it('lautloser Schlag tötet einen ahnungslosen Zombie', () => {
    const { w, p } = arena();
    p.toggleCrouch();
    const u = w.enemies.spawnAt(1.4, 0.5, 'walker');
    p.shooting = true;
    w.run(3);
    expect(w.enemies.units.has(u.id)).toBe(false);
    expect(p.skills.melee).toBe(SKILLS.xp.kill);
  });

  it('aufrecht braucht derselbe Zombie mehrere Schläge', () => {
    const { w, p } = arena();
    const u = w.enemies.spawnAt(1.4, 0.5, 'walker');
    p.shooting = true;
    w.run(3);
    expect(w.enemies.units.has(u.id)).toBe(true);
  });
});

describe('Ausdauer', () => {
  it('Sprinten ist schneller, kostet Puste und sperrt sich, wenn sie leer ist', () => {
    const a = arena();
    a.p.moveX = 1;
    a.w.run(120);
    const b = arena();
    b.p.moveX = 1;
    b.p.sprinting = true;
    b.w.run(120);
    expect(b.p.x).toBeGreaterThan(a.p.x * 1.3);
    expect(b.p.stamina).toBeLessThan(STAMINA.max - 30);
    b.w.run(600);
    expect(b.p.sprintActive).toBe(false);
  });
});

describe('Körperwärme', () => {
  it('Winternacht kühlt aus, am Lagerfeuer wird es warm', () => {
    const { w, p } = arena({ needs: true, plan: true });
    w.tick = DAY.ticks * 21 + Math.round(DAY.ticks * 0.4); // Winter, Beginn der Nacht
    w.run(60 * 150);
    expect(p.warmth).toBeLessThan(60);
    const before = p.condition;
    p.warmth = WARMTH.coldFrom - 5;
    expect(p.condition).toBeLessThan(before);
    const fire = w.place('campfire', 2, 0, 0) as FireEntity;
    fire.insert('wood', 10, 'player');
    const cold = p.warmth;
    w.run(60 * 30);
    expect(p.warmth).toBeGreaterThan(cold + 30);
  });

  it('ein Wintermantel halbiert den Verlust', () => {
    const a = arena({ needs: true, plan: true });
    const b = arena({ needs: true, plan: true });
    b.p.inventory.add('warm-coat', 1);
    for (const x of [a, b]) {
      x.w.tick = DAY.ticks * 21 + Math.round(DAY.ticks * 0.5);
      x.w.run(60 * 60);
    }
    expect(100 - b.p.warmth).toBeLessThan((100 - a.p.warmth) * 0.6);
  });
});

describe('Angeln und Können', () => {
  it('am Wasser beißt irgendwann ein Fisch; Überleben steigt', () => {
    const { w, p } = arena();
    w.map.setWater(2, 0, true);
    p.inventory.add('fishing-rod', 1);
    let fish = 0;
    for (let i = 0; i < 20 && fish === 0; i++) {
      expect(p.startFishing(w)).toBeNull();
      w.run(60 * 92);
      fish = p.inventory.count('raw-fish');
    }
    expect(fish).toBe(1);
    expect(p.skills.survival).toBeGreaterThan(0);
  });

  it('ohne Angel oder ohne Wasser geht es nicht', () => {
    const { w, p } = arena();
    expect(p.startFishing(w)).toMatch(/Angel/);
    p.inventory.add('fishing-rod', 1);
    expect(p.startFishing(w)).toMatch(/Wasser/);
  });

  it('Stufen steigen mit Erfahrung, alles übersteht Speichern/Laden', () => {
    const { w, p } = arena({ needs: true, plan: true });
    p.gainXp('loot', SKILLS.step * 4);
    expect(p.skillLevel('loot')).toBe(2);
    p.toggleCrouch();
    p.stamina = 42;
    p.warmth = 55;
    const c = deserializeWorld(serializeWorld(w));
    const q = c.player!;
    expect(q.skillLevel('loot')).toBe(2);
    expect(q.crouching).toBe(true);
    expect(q.stamina).toBe(42);
    expect(q.warmth).toBe(55);
    w.run(200);
    c.run(200);
    expect(JSON.stringify(serializeWorld(c))).toBe(JSON.stringify(serializeWorld(w)));
  });
});
