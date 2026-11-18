import { RAID, RAIDER, TRADER, TRADES } from '../data/strangers';
import { DAY } from '../data/time';
import type { Community, Worker } from './community';
import { hash01 } from './rng';
import type { Player } from './player';
import type { World } from './world';

/**
 * Fremde (Wunsch 18.11.2026): Plünderbande und Händler. Beide sind Menschen in der Liste der Gemeinschaft
 * (faction 'raider' bzw. 'trader'), damit Zombies sie genauso sehen, jagen und beißen wie Bewohner.
 *
 * Plünderer: leben im Lager der Bande, schlendern dort umher. Ab Tag RAID.firstDay zieht in der Dämmerung alle
 * RAID.interval Ticks ein Trupp zum Lagerfeuer der Figur, kämpft gegen Figur und Bewohner, stiehlt aus dem
 * Vorratslager und zieht mit der Beute ab; verletzt fliehen sie. Kommt die Figur ihrem Lager zu nahe, greift die
 * ganze Bande an. Neue Mitglieder kommen nach, solange die Bande nicht ausgelöscht ist.
 *
 * Händler: alle TRADER.interval Ticks einer, geht zum Lagerfeuer, bleibt TRADER.stay Ticks, tauscht (trade) und geht.
 */
export function strangersTick(c: Community, w: World): void {
  const s = c.strangers;
  const base = w.base;
  // Nachwuchs der Bande
  const raiders = c.raiders;
  if (raiders.length > 0 && raiders.length < RAIDER.gang && w.tick >= s.nextRecruit) {
    if (s.nextRecruit > 0) c.addStranger('raider', raiders[0].hx + ((w.tick % 5) - 2), raiders[0].hy + 1, w.seed);
    s.nextRecruit = w.tick + RAIDER.respawn;
  }
  // Überfälle in der Dämmerung
  if (s.nextRaid < 0) s.nextRaid = Math.round((RAID.firstDay - 1 + 0.27) * DAY.ticks);
  if (w.tick >= s.nextRaid) {
    s.nextRaid += RAID.interval;
    const ready = raiders.filter((k) => k.state === 'home' && k.hp > RAIDER.health * 0.6).slice(0, RAID.size);
    if (base && ready.length) {
      for (const k of ready) k.state = 'out';
      w.events.push('horde', base.cx, base.cy);
      w.player?.note(`Plünderer sind auf dem Weg zu deinem Lager (${ready.length})! Wachen auf die Posten`);
    }
  }
  // Händler
  if (s.nextTrader < 0) s.nextTrader = Math.round((TRADER.firstDay - 1 + 0.65) * DAY.ticks);
  if (w.tick >= s.nextTrader) {
    s.nextTrader += TRADER.interval;
    if (base && !c.workers.some((k) => k.faction === 'trader')) spawnTrader(c, w, base.cx, base.cy);
  }
}

function spawnTrader(c: Community, w: World, bx: number, by: number): void {
  const s = c.strangers;
  for (let t = 0; t < 16; t++) {
    const a = hash01(w.seed, s.visits, 70 + t) * Math.PI * 2;
    const x = bx + Math.cos(a) * TRADER.spawnDist;
    const y = by + Math.sin(a) * TRADER.spawnDist;
    if (w.map.isBlocked(Math.floor(x), Math.floor(y)) || w.entityAt(x, y)) continue;
    const k = c.addStranger('trader', x, y, w.seed);
    k.state = 'out';
    // Angebote dieses Besuchs
    const pool = [...TRADES.keys()];
    s.offers = [];
    for (let i = 0; i < TRADER.offers && pool.length; i++) {
      const j = Math.floor(hash01(w.seed, s.visits, 90 + i) * pool.length);
      const o = TRADES[pool.splice(j, 1)[0]];
      s.offers.push({ give: [...o.give] as [string, number], get: [...o.get] as [string, number], stock: TRADER.stock });
    }
    s.visits++;
    w.player?.note(`Der Händler ${k.name} ist unterwegs zu deinem Lagerfeuer`);
    return;
  }
}

/** Der Händler am Lagerfeuer (in Reichweite der Figur), sonst null. */
export function traderNear(c: Community, p: Player): Worker | null {
  for (const k of c.workers) if (k.faction === 'trader' && k.state === 'home' && Math.hypot(k.x - p.x, k.y - p.y) <= TRADER.reach) return k;
  return null;
}

/** Tausch Nummer i mit dem Händler. Liefert eine Meldung, wenn es nicht geht. */
export function trade(c: Community, w: World, p: Player, i: number): string | null {
  if (!traderNear(c, p)) return 'Kein Händler in der Nähe';
  const o = c.strangers.offers[i];
  if (!o || o.stock <= 0) return 'Ausverkauft';
  if (p.inventory.count(o.give[0]) < o.give[1]) return 'Dafür hast du nicht genug';
  p.inventory.remove(o.give[0], o.give[1]);
  const n = p.inventory.add(o.get[0], o.get[1]);
  for (let k = n; k < o.get[1]; k++) w.spill(p.x, p.y, o.get[0]);
  o.stock--;
  w.stats.used(o.give[0], o.give[1]);
  w.stats.made(`trade.${o.get[0]}`, o.get[1]);
  w.events.push('use', p.x, p.y);
  return null;
}

/** Nächster Gegner eines Plünderers: Figur, Bewohner, folgende Überlebende (und Händler). */
function raiderTarget(c: Community, w: World, k: Worker, r: number): { x: number; y: number; hit: (dmg: number) => void } | null {
  let best: { x: number; y: number; hit: (dmg: number) => void } | null = null;
  let bd = r;
  const p = w.player;
  if (p && !p.dead && !p.god) {
    const d = Math.hypot(p.x - k.x, p.y - k.y);
    if (d < bd) {
      bd = d;
      best = { x: p.x, y: p.y, hit: (dmg) => p.damage(w, p.inCar ? dmg * 0.3 : dmg) };
    }
  }
  for (const o of c.workers) {
    if (o.faction === 'raider' || o.state === 'wait') continue;
    const d = Math.hypot(o.x - k.x, o.y - k.y);
    if (d < bd) {
      bd = d;
      best = { x: o.x, y: o.y, hit: (dmg) => c.hurt(w, o, dmg) };
    }
  }
  return best;
}

/** Angriff auf ein Ziel in Reichweite (Schuss bzw. Schlag); true, wenn in Reichweite. */
function attack(w: World, k: Worker, t: { x: number; y: number; hit: (dmg: number) => void }, gunDamage: number): boolean {
  const d = Math.hypot(t.x - k.x, t.y - k.y);
  const reach = k.gun ? RAIDER.range : 1.4;
  if (d > reach) return false;
  k.angle = Math.atan2(t.y - k.y, t.x - k.x);
  k.phase = 0;
  if (k.cd <= w.tick) {
    if (k.gun) {
      t.hit(gunDamage);
      w.events.push('shot', k.x, k.y);
      w.noise.emit(k.x, k.y, RAIDER.noise);
      k.cd = w.tick + RAIDER.cooldown;
    } else {
      t.hit(RAIDER.melee);
      w.events.push('melee', t.x, t.y);
      k.cd = w.tick + RAIDER.meleeCooldown;
    }
    k.shot = w.tick;
  }
  return true;
}

/** Zombie in der Nähe als Ziel. */
function zombieTarget(w: World, k: Worker, r: number): { x: number; y: number; hit: (dmg: number) => void } | null {
  const z = w.enemies.nearestTarget(k.x, k.y, r, w.tick);
  return z && z.kind === 'unit' ? { x: z.x, y: z.y, hit: (dmg) => w.enemies.damageTarget(w, z, dmg, { x: k.x, y: k.y }) } : null;
}

export function stepRaider(c: Community, w: World, k: Worker): void {
  const home = Math.hypot(k.hx - k.x, k.hy - k.y);
  if (k.hp < RAIDER.health * RAIDER.fleeBelow && k.state !== 'back' && k.state !== 'home') {
    k.state = 'back';
    k.flee = true;
  }
  // Lager in Gefahr: die Figur kommt zu nahe
  const p = w.player;
  if (k.state === 'home' && p && !p.dead && !p.god && Math.hypot(p.x - k.hx, p.y - k.hy) < RAID.campAlarm) k.state = 'out';
  // kämpfen (Menschen nur, wenn auf Raubzug bzw. alarmiert; Zombies immer in der Nähe)
  const hostile = k.state === 'out' || k.state === 'gather' || (k.state === 'back' && !k.flee);
  const t = (hostile ? raiderTarget(c, w, k, RAIDER.sight) : null) ?? zombieTarget(w, k, RAIDER.zombieSight);
  if (t && attack(w, k, t, RAIDER.damage)) return;
  const speed = k.flee ? RAIDER.fleeSpeed : RAIDER.speed;
  switch (k.state) {
    case 'home': {
      if (w.tick % 60 === 0 && k.hp < RAIDER.health) k.hp = Math.min(RAIDER.health, k.hp + 1);
      k.flee = false;
      if (k.cargo.length) k.cargo = [];
      if (w.tick < k.wait) {
        k.phase = 0;
        return;
      }
      // im Lager herumschlendern
      const a = hash01(w.seed, k.id, w.tick) * Math.PI * 2;
      const r = 1 + hash01(w.seed, k.id, w.tick + 1) * 5;
      const tx = k.hx + Math.cos(a) * r;
      const ty = k.hy + Math.sin(a) * r;
      if (Math.hypot(tx - k.x, ty - k.y) < 0.3 || w.tick % 240 === 0) k.wait = w.tick + 120 + Math.floor(hash01(w.seed, k.id, w.tick + 2) * 240);
      c.stepToward(w, k, tx, ty, speed * 0.4);
      return;
    }
    case 'out': {
      // Ziel: Figur in der Nähe des Bandenlagers, sonst Vorratslager bzw. Lagerfeuer
      const alarm = p && !p.dead && !p.god && Math.hypot(p.x - k.hx, p.y - k.hy) < RAID.campAlarm * 1.5;
      if (alarm && p) return c.walkPoint(w, k, p.x, p.y, speed);
      const goal = c.depot(w) ?? w.base;
      if (!goal) {
        k.state = 'back';
        return;
      }
      if (Math.hypot(goal.cx - k.x, goal.cy - k.y) < goal.w / 2 + 1.6) {
        k.state = 'gather';
        k.wait = w.tick + RAIDER.stealTicks;
        return;
      }
      c.walkPoint(w, k, goal.cx, goal.cy, speed);
      return;
    }
    case 'gather': {
      k.phase += 0.02;
      if (w.tick < k.wait) return;
      k.wait = w.tick + RAIDER.stealTicks;
      const it = c.takeSupply(w, () => true);
      if (it) {
        k.cargo.push(it);
        w.stats.used(`stolen.${it}`, 1);
      }
      if (!it || k.cargo.length >= RAIDER.carry) {
        if (k.cargo.length) w.player?.note(`Plünderer haben ${k.cargo.length} Stück aus dem Vorrat gestohlen`);
        k.state = 'back';
      }
      return;
    }
    case 'back':
    default: {
      if (home < 3) {
        k.state = 'home';
        return;
      }
      c.walkPoint(w, k, k.hx, k.hy, speed);
    }
  }
}

export function stepTrader(c: Community, w: World, k: Worker): void {
  const z = zombieTarget(w, k, 9);
  if (z && attack(w, k, z, RAIDER.damage * 1.4)) return;
  const base = w.base;
  switch (k.state) {
    case 'out': {
      if (!base) {
        k.state = 'back';
        return;
      }
      if (Math.hypot(base.cx - k.x, base.cy - k.y) < 3.5) {
        k.state = 'home';
        k.wait = w.tick + TRADER.stay;
        k.phase = 0;
        w.player?.note(`Der Händler ${k.name} ist am Lagerfeuer – hingehen und anklicken zum Tauschen`);
        return;
      }
      c.walkPoint(w, k, base.cx, base.cy + 2.5, TRADER.speed);
      return;
    }
    case 'home': {
      k.phase = 0;
      if (w.tick >= k.wait) {
        k.state = 'back';
        w.player?.note(`Der Händler ${k.name} zieht weiter`);
      }
      return;
    }
    default: {
      if (Math.hypot(k.hx - k.x, k.hy - k.y) < 2) {
        c.workers.splice(c.workers.indexOf(k), 1);
        return;
      }
      c.walkPoint(w, k, k.hx, k.hy, TRADER.speed);
    }
  }
}
