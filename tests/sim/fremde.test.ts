import { describe, expect, it } from 'vitest';
import { LEGACY_MAP_SETTINGS } from '../../src/data/mapgen';
import { RAIDER, TRADER } from '../../src/data/strangers';
import type { CampEntity } from '../../src/sim/machines';
import { Player } from '../../src/sim/player';
import { deserializeWorld, serializeWorld } from '../../src/sim/serialize';
import { trade, traderNear } from '../../src/sim/strangers';
import { World } from '../../src/sim/world';

function arena(settings = {}): World {
  const w = new World(3, { ...LEGACY_MAP_SETTINGS, enemies: 'aus', needs: false, ...settings });
  for (let y = -70; y < 70; y++) for (let x = -70; x < 70; x++) {
    w.map.setWater(x, y, false);
    w.map.setResource(x, y, 0, 0);
  }
  w.map.clearTrees(-70, -70, 70, 70);
  return w;
}

function base(w: World) {
  w.place('campfire', 0, 0, 0);
  const camp = w.place('scavenger-camp', 4, -1, 0) as CampEntity;
  camp.store.add('iron-plate', 50);
  return camp;
}

function gang(w: World, n = 3) {
  return Array.from({ length: n }, (_, i) => w.community.addStranger('raider', 45.5, 0.5 + i, 3));
}

describe('Plünderbande', () => {
  it('Überfall: der Trupp zieht zum Lager, stiehlt aus dem Vorrat und kehrt heim', () => {
    const w = arena();
    const camp = base(w);
    const rs = gang(w);
    w.community.strangers.nextRaid = w.tick + 1;
    w.run(2);
    expect(rs.every((k) => k.state === 'out')).toBe(true);
    let stolen = false;
    for (let t = 0; t < 60 * 120 && !stolen; t++) {
      w.step();
      stolen = camp.store.count('iron-plate') < 50;
    }
    expect(stolen).toBe(true);
    w.run(60 * 90);
    expect(rs.some((k) => k.state === 'home' || k.state === 'back')).toBe(true);
  });

  it('Wachen mit Magazinen schlagen den Überfall zurück; Tote lassen Waffe und Munition fallen', () => {
    const w = arena();
    const camp = base(w);
    camp.insert('firearm-magazine', 10, 'player');
    w.community.addResident(1, 3, 'guard');
    w.community.addResident(-1, 3, 'guard');
    gang(w, 2);
    w.community.strangers.nextRaid = w.tick + 1;
    w.run(60 * 120);
    // verletzt geflohen oder tot – gestohlen wurde wenig
    expect(w.community.raiders.every((k) => k.state === 'home' || k.state === 'back')).toBe(true);
    expect(camp.store.count('iron-plate')).toBeGreaterThan(40);
  });

  it('die Figur kann Plünderer erschießen; das Lager der Bande greift an, wenn sie zu nahe kommt', () => {
    const w = arena();
    const [r] = gang(w, 1);
    r.gun = true;
    const p = new Player(40.5, 0.5);
    w.player = p;
    p.inventory.add('pistol', 1);
    p.inventory.add('firearm-magazine', 5);
    w.run(2);
    expect(r.state).toBe('out');
    expect(w.foe(p.x, p.y, 12)?.kind).toBe('person');
    p.useGun = true;
    p.shooting = true;
    w.run(60 * 10);
    expect(w.community.raiders.length).toBe(0);
    expect([...w.ground.values()].flat().some((g) => g.item === 'pistol')).toBe(true);
  });

  it('Speichern/Laden mitten im Überfall läuft gleich weiter', () => {
    const w = arena();
    base(w);
    gang(w);
    w.community.strangers.nextRaid = w.tick + 1;
    w.run(60 * 20 + 3);
    const b = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(w))));
    w.run(600);
    b.run(600);
    expect(JSON.stringify(serializeWorld(b))).toBe(JSON.stringify(serializeWorld(w)));
  });
});

describe('Händler', () => {
  it('kommt ans Lagerfeuer, tauscht und zieht weiter', () => {
    const w = arena();
    base(w);
    const p = new Player(2.5, 4.5);
    w.player = p;
    w.community.strangers.nextTrader = w.tick + 1;
    w.run(2);
    const t = w.community.workers.find((k) => k.faction === 'trader')!;
    expect(t).toBeTruthy();
    w.run(60 * 60);
    expect(t.state).toBe('home');
    p.px = Math.round(t.x * 256);
    p.py = Math.round((t.y + 1) * 256);
    expect(traderNear(w.community, p)).toBe(t);
    const o = w.community.strangers.offers[0];
    expect(trade(w.community, w, p, 0)).toMatch(/genug/);
    p.inventory.add(o.give[0], o.give[1]);
    expect(trade(w.community, w, p, 0)).toBeNull();
    expect(p.inventory.count(o.get[0])).toBeGreaterThanOrEqual(o.get[1]);
    expect(o.stock).toBe(TRADER.stock - 1);
    w.run(TRADER.stay + 60 * 60);
    expect(w.community.workers.some((k) => k.faction === 'trader')).toBe(false);
    void RAIDER;
  });
});
