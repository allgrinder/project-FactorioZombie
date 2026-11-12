import { ENEMY_MAPGEN, HAZARD, HORDE, PATH, PLAYER_COMBAT, UNITS, UNIT_KINDS, ZOMBIE, type UnitKind } from '../data/enemies';
import type { EnemySetting } from '../data/mapgen';
import { PLAYER } from '../data/player';
import { DAY, dayNumber } from '../data/time';
import type { Entity } from './machines';
import { FlowField } from './flowfield';
import type { Noise } from './noise';
import { hash01 } from './rng';
import type { World } from './world';

/**
 * Zustand eines Zombies: ruht (streift um seinen Heimatpunkt), geht einem Geräusch nach, verfolgt die Figur
 * oder zieht als Teil einer Horde zum Lager.
 */
export type UnitMode = 'idle' | 'investigate' | 'chase' | 'horde';

export interface Unit {
  readonly id: number;
  readonly kind: UnitKind;
  x: number;
  y: number;
  hp: number;
  mode: UnitMode;
  /** Gebäude, das gerade eingerissen wird (ID), sonst null. */
  target: number | null;
  /** Ziel: Lärmquelle, Hordenziel bzw. zuletzt gesehener Ort der Figur. */
  tx: number;
  ty: number;
  /** Heimatpunkt (Herumstreifen). */
  hx: number;
  hy: number;
  cd: number;
  /** Blickrichtung (Bogenmaß) und Laufphase für die Darstellung. */
  angle: number;
  phase: number;
  /** Ticks ohne Fortschritt (festgefahren) und Ausweichrichtung bis sideUntil. */
  stuck: number;
  side: number;
  sideUntil: number;
  /** Betäubt bis (Ticks, zählt herunter). */
  stun: number;
  /** Ticks, seit die Figur außer Sicht ist. */
  lost: number;
  /** Ruhezustand: Tick des nächsten Schritts; Fallen/Draht: nächster Schaden frühestens; Schrei frühestens. */
  wait: number;
  hz: number;
  scream: number;
  /** nächste Zielsuche frühestens in diesem Tick (nur Rechenaufwand). */
  retry: number;
}

export type Target = { kind: 'unit'; id: number; x: number; y: number };

/** Kurz sichtbare Reste für die Darstellung (Kadaver, Wracks). */
export interface Remnant {
  x: number;
  y: number;
  kind: 'unit' | 'building';
  size: number;
  tick: number;
  /** Zombieart bzw. Gebäude: Name und Richtung (Wrack in dessen Form) */
  name?: string;
  dir?: number;
}

/** Letzte Horde (Anzeige). */
export interface HordeInfo {
  tick: number;
  day: number;
  size: number;
  /** Richtung, aus der sie kommt (Bogenmaß, 0 = Osten, y nach Süden). */
  angle: number;
}

const cellKey = (gx: number, gy: number) => gx * 100003 + gy;

/** Gebäude, die Zombies angreifen (keine Gleise, keine Fundorte der alten Welt). */
export const isTargetable = (e: Entity): boolean => e.kind !== 'rail' && e.kind !== 'loot';

const COMPASS = ['Osten', 'Südosten', 'Süden', 'Südwesten', 'Westen', 'Nordwesten', 'Norden', 'Nordosten'];
export function compassName(angle: number): string {
  const k = ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
  return COMPASS[k];
}

export class EnemySystem {
  readonly units = new Map<number, Unit>();
  /** Bereits besiedelte Rasterzellen. */
  private readonly cells = new Set<number>();
  private nextUnit = 1;
  readonly remnants: Remnant[] = [];
  /** Erlegte Zombies (Statistik, Endbildschirm). */
  kills = 0;
  lastHorde: HordeInfo | null = null;

  private gen(w: World) {
    return ENEMY_MAPGEN[w.settings.enemies] ?? ENEMY_MAPGEN.aus;
  }

  /** Zombie-Einstellung im laufenden Spiel ändern. „Aus“ entfernt alle Zombies. */
  applySetting(w: World, e: EnemySetting): void {
    w.settings = { ...w.settings, enemies: e };
    if (e === 'aus') this.units.clear();
  }

  // ------------------------------------------------------------ Besiedlung

  /** Besiedelt die Rasterzellen, die das Rechteck berühren (deterministisch je Zelle, nur einmal). */
  ensureArea(w: World, x0: number, y0: number, x1: number, y1: number): void {
    const g = this.gen(w);
    if (g.perCell <= 0) return;
    const c = g.cell;
    for (let gy = Math.floor(y0 / c); gy <= Math.floor(y1 / c); gy++) {
      for (let gx = Math.floor(x0 / c); gx <= Math.floor(x1 / c); gx++) {
        const k = cellKey(gx, gy);
        if (this.cells.has(k)) continue;
        this.cells.add(k);
        this.genCell(w, gx, gy);
      }
    }
  }

  private genCell(w: World, gx: number, gy: number): void {
    const g = this.gen(w);
    const s = w.seed;
    const c = g.cell;
    const mx = (gx + 0.5) * c;
    const my = (gy + 0.5) * c;
    const dist = Math.hypot(mx, my);
    if (dist < g.startFree) return;
    const ramp = 0.2 + 0.8 * Math.min(1, (dist - g.startFree) / Math.max(1, g.fullAt - g.startFree));
    const want = g.perCell * ramp * (0.4 + 1.2 * hash01(s, gx, gy, 701));
    let n = Math.floor(want) + (hash01(s, gx, gy, 702) < want % 1 ? 1 : 0);
    const day = dayNumber(w.tick);
    for (let i = 0; i < n && this.units.size < ZOMBIE.maxUnits; i++) {
      const x = (gx + hash01(s, gx, gy, 710 + i * 2)) * c;
      const y = (gy + hash01(s, gx, gy, 711 + i * 2)) * c;
      if (Math.hypot(x, y) >= g.startFree * 0.9 && this.free(w, x, y)) this.spawnAt(x, y, this.pickKind(day));
    }
    // Fundorte: Zombies lungern um Häuser und Wracks
    for (const site of w.sites.sitesIn(gx * c, gy * c, (gx + 1) * c, (gy + 1) * c)) {
      if (Math.hypot(site.x, site.y) < g.startFree * 0.55) continue;
      n = Math.round(g.perSite * site.weight * (0.6 + 0.8 * hash01(s, site.x | 0, site.y | 0, 720)));
      for (let i = 0; i < n && this.units.size < ZOMBIE.maxUnits; i++) {
        const a = hash01(s, site.x | 0, site.y | 0, 730 + i) * Math.PI * 2;
        const r = site.r * (0.4 + 0.9 * hash01(s, site.x | 0, site.y | 0, 760 + i));
        const x = site.x + Math.cos(a) * r;
        const y = site.y + Math.sin(a) * r;
        if (Math.hypot(x, y) >= g.startFree * 0.9 && this.free(w, x, y)) this.spawnAt(x, y, this.pickKind(day));
      }
    }
  }

  private free(w: World, x: number, y: number): boolean {
    return !w.map.isBlocked(Math.floor(x), Math.floor(y)) && !w.entityAt(x, y);
  }

  /** Zombie setzen (Besiedlung, Horden, Tests). */
  spawnAt(x: number, y: number, kind: UnitKind, mode: UnitMode = 'idle'): Unit {
    const u: Unit = {
      id: this.nextUnit++, kind, x, y, hp: UNITS[kind].health, mode, target: null, tx: x, ty: y, hx: x, hy: y,
      cd: 0, angle: 0, phase: 0, stuck: 0, side: 0, sideUntil: 0, stun: 0, lost: 0, wait: 0, hz: 0, scream: 0, retry: 0,
    };
    u.angle = hash01(u.id, 17) * Math.PI * 2;
    this.units.set(u.id, u);
    return u;
  }

  /** deterministischer Zufall der Simulation */
  private rs = 12345;
  private rand(): number {
    this.rs = (Math.imul(this.rs, 1103515245) + 12345) >>> 0;
    return this.rs / 4294967296;
  }

  /** Art eines neuen Zombies nach dem Tag: Läufer, Schreier und Brocken kommen später dazu und werden häufiger. */
  pickKind(day: number): UnitKind {
    const r = this.rand();
    let acc = 0;
    for (const k of UNIT_KINDS) {
      if (k === 'walker') continue;
      const d = UNITS[k];
      if (day < d.fromDay) continue;
      acc += Math.min(d.shareMax, d.share + d.sharePerDay * (day - d.fromDay));
      if (r < acc) return k;
    }
    return 'walker';
  }

  // ------------------------------------------------------------ Horden

  /** Größe der Horde am Tag day (0 = keine). */
  hordeSize(w: World, day: number): number {
    const f = this.gen(w).hordeFactor;
    if (f <= 0 || day < HORDE.firstDay) return 0;
    const big = day % HORDE.bigEvery === 0 ? HORDE.bigFactor : 1;
    return Math.min(HORDE.maxSize, Math.round((HORDE.base + HORDE.perDay * (day - HORDE.firstDay)) * f * big));
  }

  /** Mittelpunkt des Lagers: Schwerpunkt der eigenen Gebäude um die Figur, sonst die Figur. */
  baseCenter(w: World): [number, number] | null {
    const p = w.player;
    if (!p) return null;
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (const e of w.entities.values()) {
      if (!isTargetable(e) || Math.hypot(e.cx - p.x, e.cy - p.y) > 70) continue;
      sx += e.cx;
      sy += e.cy;
      n++;
    }
    return n >= 4 ? [sx / n, sy / n] : [p.x, p.y];
  }

  /** Horde aus Richtung angle (zufällig, wenn nicht angegeben) losschicken. Liefert die Zahl der Zombies. */
  spawnHorde(w: World, size: number, angle?: number): number {
    const c = this.baseCenter(w);
    if (!c || size <= 0) return 0;
    const day = dayNumber(w.tick);
    let made = 0;
    let a = angle ?? this.rand() * Math.PI * 2;
    // Richtung suchen, in der Land ist
    for (let attempt = 0; attempt < 8 && made === 0; attempt++) {
      const dist = HORDE.distMin + this.rand() * (HORDE.distMax - HORDE.distMin);
      const ox = c[0] + Math.cos(a) * dist;
      const oy = c[1] + Math.sin(a) * dist;
      for (let i = 0; i < size * 3 && made < size && this.units.size < ZOMBIE.maxUnits; i++) {
        const x = ox + (this.rand() - 0.5) * 2 * HORDE.spread;
        const y = oy + (this.rand() - 0.5) * 2 * HORDE.spread;
        if (!this.free(w, x, y)) continue;
        const u = this.spawnAt(x, y, this.pickKind(day), 'horde');
        u.tx = c[0];
        u.ty = c[1];
        made++;
      }
      if (made === 0) a += Math.PI / 4;
    }
    if (made > 0) {
      this.lastHorde = { tick: w.tick, day, size: made, angle: a };
      w.events.push('horde', c[0] + Math.cos(a) * 20, c[1] + Math.sin(a) * 20);
      w.player?.note(`Eine Horde nähert sich aus ${compassName(a)} (${made} Zombies)!`);
    }
    return made;
  }

  // ------------------------------------------------------------ Lärm

  /** Geräusch: ruhende Zombies in Hörweite gehen nachsehen; wer schon nachsieht, wechselt zum näheren Geräusch. */
  hear(w: World, n: Noise): void {
    if (this.units.size === 0) return;
    for (const u of this.near(n.x, n.y, n.r, w.tick)) {
      if (u.mode === 'chase' || u.mode === 'horde' || u.target !== null) continue;
      const d = Math.hypot(u.x - n.x, u.y - n.y);
      if (d > n.r || d < 1.5) continue;
      // am Rand der Hörweite reagiert nicht jeder
      if (d > n.r * 0.6 && hash01(u.id, n.tick, 31) > 1 - (d / n.r - 0.6) * 1.75 + 0.3) continue;
      if (u.mode === 'investigate' && Math.hypot(u.x - u.tx, u.y - u.ty) <= d) continue;
      u.mode = 'investigate';
      u.tx = n.x + (hash01(u.id, 41) - 0.5) * 2;
      u.ty = n.y + (hash01(u.id, 42) - 0.5) * 2;
      u.lost = 0;
    }
  }

  // ------------------------------------------------------------ Takt

  update(w: World): void {
    const g = this.gen(w);
    const p = w.player;
    if (w.tick % 60 === 0 && p && g.perCell > 0) this.ensureArea(w, p.x - 90, p.y - 90, p.x + 90, p.y + 90);
    // Horde bei Einbruch der Dämmerung
    if (p && !p.dead && w.tick % DAY.ticks === Math.round(DAY.dusk * DAY.ticks)) {
      const size = this.hordeSize(w, dayNumber(w.tick));
      if (size > 0) this.spawnHorde(w, size);
    }
    if (this.units.size > 0) {
      const sight = ZOMBIE.sightDay + (ZOMBIE.sightNight - ZOMBIE.sightDay) * w.darkness;
      for (const u of this.units.values()) this.stepUnit(w, u, sight);
    }
    // Kadaver nach 2 min, Wracks nach 15 min entfernen (oder sobald dort neu gebaut wird)
    if (w.tick % 30 === 0) {
      for (let i = this.remnants.length - 1; i >= 0; i--) {
        const r = this.remnants[i];
        const life = r.kind === 'building' ? 15 * 3600 : 7200;
        if (w.tick - r.tick > life || (r.kind === 'building' && w.entityAt(r.x, r.y))) this.remnants.splice(i, 1);
      }
    }
  }

  private stepUnit(w: World, u: Unit, sight: number): void {
    const def = UNITS[u.kind];
    const p0 = w.player;
    const p = p0 && !p0.dead && !p0.god ? p0 : null;
    const pd = p ? Math.hypot(p.x - u.x, p.y - u.y) : Infinity;
    // weit entfernte, ruhende Zombies schlafen
    if (u.mode === 'idle' && pd > ZOMBIE.sleepDistance) return;
    if (u.cd > 0) u.cd--;
    if (u.stun > 0) {
      u.stun--;
      return;
    }
    // Wahrnehmung: Figur in Sichtweite → Verfolgung
    if (p && u.mode !== 'chase' && (w.tick + u.id) % ZOMBIE.senseInterval === 0 && pd < sight) this.startChase(w, u);
    switch (u.mode) {
      case 'chase': this.stepChase(w, u, def, p, pd, sight); break;
      case 'investigate':
      case 'horde': this.stepMarch(w, u, def, p, pd); break;
      default: this.stepIdle(w, u, def);
    }
  }

  private startChase(w: World, u: Unit): void {
    u.mode = 'chase';
    u.target = null;
    u.lost = 0;
    if (u.kind === 'screamer' && w.tick >= u.scream) {
      u.scream = w.tick + ZOMBIE.screamCooldown;
      u.stun = 30;
      w.noise.emit(u.x, u.y, ZOMBIE.screamRadius);
      w.events.push('scream', u.x, u.y);
    }
  }

  private stepChase(w: World, u: Unit, def: (typeof UNITS)[UnitKind], p: World['player'], pd: number, sight: number): void {
    if (!p) {
      this.calm(u);
      return;
    }
    if (pd > sight * ZOMBIE.loseFactor) {
      if (++u.lost > ZOMBIE.loseTicks) {
        // Spur verloren: zum zuletzt gesehenen Ort
        u.mode = 'investigate';
        u.target = null;
        return;
      }
    } else {
      u.lost = 0;
      u.tx = p.x;
      u.ty = p.y;
    }
    if (pd <= def.radius + PLAYER.radius + def.reach) {
      u.phase = 0;
      u.target = null;
      u.angle = Math.atan2(p.y - u.y, p.x - u.x);
      if (u.cd === 0) {
        p.damage(w, def.damage, def);
        w.events.push('bite', p.x, p.y);
        u.cd = def.cooldown;
      }
      return;
    }
    // Hindernis im Weg einreißen
    if (u.target !== null && this.attackEntity(w, u, def)) return;
    if (pd > PATH.chaseWindow - 3) {
      this.move(w, u, u.tx, u.ty, def.speed, true);
      return;
    }
    const f = this.chaseField(w, p.x, p.y);
    this.follow(w, u, f, u.tx, u.ty, def.speed);
  }

  /** Marsch zu einem Geräusch bzw. als Horde zum Lager; am Ziel Gebäude einreißen. */
  private stepMarch(w: World, u: Unit, def: (typeof UNITS)[UnitKind], p: World['player'], pd: number): void {
    if (u.target !== null && this.attackEntity(w, u, def)) return;
    const d = Math.hypot(u.x - u.tx, u.y - u.ty);
    if (d < 1.7) {
      if (w.tick >= u.retry) {
        u.retry = w.tick + 30 + (u.id % 15);
        const e = this.nearbyBuilding(w, u.x, u.y, u.mode === 'horde' ? 24 : ZOMBIE.smashRadius);
        if (e) {
          u.target = e.id;
          return;
        }
        // Horde ohne Ziel: zur Figur, wenn sie in der Nähe ist
        if (u.mode === 'horde' && p && pd < 60) {
          u.tx = p.x;
          u.ty = p.y;
          return;
        }
        this.calm(u);
      }
      return;
    }
    // weit weg (außerhalb des Fensters) und auf den letzten Feldern geradewegs zum Ziel, Hindernisse einreißen
    if (d > PATH.window - 4 || d < 3.7) {
      this.move(w, u, u.tx, u.ty, def.speed, true);
      return;
    }
    // Ziel auf die Mitte eines 4×4-Blocks gerastert: das Feld hängt nur vom Schlüssel und der Welt ab
    // (gleiches Ergebnis nach dem Laden); das letzte Stück läuft der Zombie direkt
    const gx = (Math.floor(u.tx) >> 2) * 4 + 2;
    const gy = (Math.floor(u.ty) >> 2) * 4 + 2;
    const key = `n${gx},${gy}`;
    let c = this.fields.get(key);
    if (!c || c.ver !== w.structureVersion) {
      const R = PATH.window;
      const goals: [number, number][] = [[gx, gy]];
      const ge = w.entityAt(gx, gy);
      // Ziel in einem Gebäude: dessen ganze Grundfläche ist Ziel
      if (ge) for (let j = 0; j < ge.h; j++) for (let i = 0; i < ge.w; i++) goals.push([ge.x + i, ge.y + j]);
      c = { f: FlowField.build(w, goals, gx - R, gy - R, 2 * R, 2 * R, ge ? ge.id : null), ver: w.structureVersion };
      this.remember(key, c);
    }
    this.follow(w, u, c.f, u.tx, u.ty, def.speed);
  }

  private stepIdle(w: World, u: Unit, def: (typeof UNITS)[UnitKind]): void {
    if (w.tick < u.wait) {
      u.phase = 0;
      return;
    }
    const d = Math.hypot(u.x - u.tx, u.y - u.ty);
    if (d < 0.3 || u.stuck > 20) {
      // neuer Punkt um den Heimatpunkt, dann Pause
      const a = this.rand() * Math.PI * 2;
      const r = this.rand() * ZOMBIE.wanderRadius;
      u.tx = u.hx + Math.cos(a) * r;
      u.ty = u.hy + Math.sin(a) * r;
      u.wait = w.tick + Math.round(ZOMBIE.wanderPause * (0.4 + 1.2 * this.rand()));
      u.stuck = 0;
      u.phase = 0;
      return;
    }
    this.move(w, u, u.tx, u.ty, def.speed * ZOMBIE.wanderSpeed, false);
  }

  private calm(u: Unit): void {
    u.mode = 'idle';
    u.target = null;
    u.hx = u.tx = u.x;
    u.hy = u.ty = u.y;
    u.wait = 0;
    u.lost = 0;
  }

  /** Greift das Gebäude u.target an bzw. läuft hin. false: Ziel gibt es nicht mehr. */
  private attackEntity(w: World, u: Unit, def: (typeof UNITS)[UnitKind]): boolean {
    const e = w.entities.get(u.target!);
    if (!e) {
      u.target = null;
      return false;
    }
    const dx = Math.max(e.x - u.x, 0, u.x - (e.x + e.w));
    const dy = Math.max(e.y - u.y, 0, u.y - (e.y + e.h));
    if (Math.hypot(dx, dy) <= def.reach + def.radius) {
      u.phase = 0;
      u.angle = Math.atan2(e.cy - u.y, e.cx - u.x);
      if (u.cd === 0) {
        w.damageEntity(e, def.structureDamage);
        u.cd = def.cooldown;
      }
      return true;
    }
    const key = `e${e.id}`;
    let c = this.fields.get(key);
    if (!c || c.ver !== w.structureVersion) {
      const goals: [number, number][] = [];
      for (let j = 0; j < e.h; j++) for (let i = 0; i < e.w; i++) goals.push([e.x + i, e.y + j]);
      const R = 24;
      c = { f: FlowField.build(w, goals, Math.floor(e.cx) - R, Math.floor(e.cy) - R, 2 * R, 2 * R, e.id), ver: w.structureVersion };
      this.remember(key, c);
    }
    if (c.f.at(Math.floor(u.x), Math.floor(u.y)) === Infinity) {
      // unerreichbar: Ziel aufgeben
      u.target = null;
      return false;
    }
    this.follow(w, u, c.f, e.cx, e.cy, def.speed, e.id);
    return true;
  }

  // ------------------------------------------------------------ Wegsuche

  /** Flussfelder je Ziel (Wegsuche um Wasser und Mauern), neu bei jeder Bauänderung. */
  private readonly fields = new Map<string, { f: FlowField; ver: number }>();
  private chase: { f: FlowField; ver: number; tick: number; px: number; py: number } | null = null;

  private remember(key: string, c: { f: FlowField; ver: number }): void {
    this.fields.delete(key);
    this.fields.set(key, c);
    if (this.fields.size > PATH.maxFields) this.fields.delete(this.fields.keys().next().value!);
  }

  /** Flussfeld zur Figur: neu, wenn sie das Feld wechselt (höchstens alle chaseRefresh Ticks) oder gebaut wurde. */
  private chaseField(w: World, px: number, py: number): FlowField {
    const tx = Math.floor(px);
    const ty = Math.floor(py);
    const c = this.chase;
    if (c && c.ver === w.structureVersion && ((c.px === tx && c.py === ty) || w.tick - c.tick < PATH.chaseRefresh)) return c.f;
    return this.buildChase(w, tx, ty, w.tick);
  }

  private buildChase(w: World, tx: number, ty: number, tick: number): FlowField {
    const R = PATH.chaseWindow;
    const f = FlowField.build(w, [[tx, ty]], tx - R, ty - R, 2 * R, 2 * R, null);
    this.chase = { f, ver: w.structureVersion, tick, px: tx, py: ty };
    return f;
  }

  /** Dem Flussfeld folgen; liegt das nächste Feld in einem Gebäude, wird es eingerissen. */
  private follow(w: World, u: Unit, f: FlowField, gx: number, gy: number, speed: number, goalId: number | null = null): void {
    const nx = f.next(u.x, u.y);
    if (!nx) {
      this.move(w, u, gx, gy, speed, true);
      return;
    }
    const e = w.entityAt(nx[0], nx[1]);
    if (e && e.def.solid && e.id !== goalId && isTargetable(e)) {
      u.target = e.id;
      return;
    }
    // leichte Streuung je Zombie, damit Gruppen nicht auf einer Linie laufen
    const ox = (hash01(u.id, 51) - 0.5) * 0.5;
    const oy = (hash01(u.id, 52) - 0.5) * 0.5;
    this.move(w, u, nx[0] + ox, nx[1] + oy, speed, false);
  }

  /** Schritt in Richtung (tx, ty); Wasser und Fundorte umgehen, Gebäude im Weg angreifen (aggressive). */
  private move(w: World, u: Unit, tx: number, ty: number, speed: number, aggressive: boolean): void {
    const dx = tx - u.x;
    const dy = ty - u.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-6) return;
    // Stacheldraht und Nagelfalle unter dem Zombie
    const here = w.entityAt(u.x, u.y);
    if (here && (here.kind === 'wire' || here.kind === 'trap')) {
      if (here.kind === 'wire') {
        speed *= HAZARD.wire.slow;
        if ((w.tick + u.id) % HAZARD.wire.interval === 0) {
          w.damageEntity(here, HAZARD.wire.wear, true);
          if (this.hurt(w, u, HAZARD.wire.damage)) return;
        }
      } else if (w.tick >= u.hz) {
        u.hz = w.tick + HAZARD.trap.interval;
        w.damageEntity(here, HAZARD.trap.wear, true);
        w.events.push('trap', u.x, u.y);
        if (this.hurt(w, u, HAZARD.trap.damage)) return;
      }
    }
    const s = Math.min(speed, d);
    let a = Math.atan2(dy, dx);
    if (w.tick < u.sideUntil) a += u.side;
    let first: number | null = null;
    for (const off of [0, 0.6, -0.6, 1.2, -1.2, 1.9, -1.9]) {
      const b = a + off * (u.id % 2 ? 1 : -1);
      const nx = u.x + Math.cos(b) * s;
      const ny = u.y + Math.sin(b) * s;
      if (w.map.isBlocked(Math.floor(nx), Math.floor(ny))) continue;
      const blocker = w.entityAt(nx, ny);
      if (blocker && blocker.def.solid && blocker.kind !== 'rail') {
        if (isTargetable(blocker)) {
          if (off === 0) first = blocker.id;
          if (off === 0 && aggressive) {
            u.target = blocker.id;
            return;
          }
        }
        continue;
      }
      u.x = nx;
      u.y = ny;
      u.angle = b;
      u.phase += s;
      if (off === 0) u.stuck = 0;
      else if (++u.stuck > 90 && w.tick >= u.sideUntil) this.sidestep(w, u);
      return;
    }
    // kein Ausweichen möglich: das Hindernis angreifen bzw. seitlich ausweichen
    if (first !== null && u.mode !== 'idle') u.target = first;
    if (++u.stuck > 45 && w.tick >= u.sideUntil) this.sidestep(w, u);
  }

  /** Festgefahren (See, Klippe): eine Weile schräg zur Zielrichtung laufen. */
  private sidestep(w: World, u: Unit): void {
    u.side = (u.id % 2 ? 1 : -1) * (1.1 + this.rand() * 0.7);
    u.sideUntil = w.tick + 90 + Math.floor(this.rand() * 120);
    u.stuck = 0;
  }

  /** Nächstes angreifbares Gebäude im Umkreis. */
  private nearbyBuilding(w: World, x: number, y: number, r: number): Entity | null {
    let best: Entity | null = null;
    let bd = r;
    const tiles = (2 * r + 1) * (2 * r + 1);
    if (w.entities.size < tiles / 4) {
      for (const e of w.entities.values()) {
        if (!isTargetable(e)) continue;
        const d = Math.hypot(e.cx - x, e.cy - y);
        if (d < bd) {
          bd = d;
          best = e;
        }
      }
      return best;
    }
    for (let ty = Math.floor(y - r); ty <= Math.floor(y + r); ty++) {
      for (let tx = Math.floor(x - r); tx <= Math.floor(x + r); tx++) {
        const d = Math.hypot(tx + 0.5 - x, ty + 0.5 - y);
        if (d >= bd) continue;
        const e = w.entityAt(tx, ty);
        if (!e || !isTargetable(e)) continue;
        bd = d;
        best = e;
      }
    }
    return best;
  }

  // ------------------------------------------------------------ Kampf

  /** Eimer-Raster der Zombies (16×16 Felder), je Tick beim ersten Zugriff neu gefüllt. */
  private buckets = new Map<number, Unit[]>();
  private bucketTick = -1;
  private bucketsFor(tick: number): Map<number, Unit[]> {
    if (this.bucketTick !== tick) {
      this.buckets.clear();
      for (const u of this.units.values()) {
        const k = Math.floor(u.x / 16) * 100003 + Math.floor(u.y / 16);
        let l = this.buckets.get(k);
        if (!l) this.buckets.set(k, (l = []));
        l.push(u);
      }
      this.bucketTick = tick;
    }
    return this.buckets;
  }

  /** Zombies im Umkreis (über das Eimer-Raster, wenn es viele sind). */
  near(x: number, y: number, r: number, tick = -2): Unit[] {
    const out: Unit[] = [];
    if (tick >= 0 && this.units.size > 32) {
      const b = this.bucketsFor(tick);
      for (let gy = Math.floor((y - r) / 16); gy <= Math.floor((y + r) / 16); gy++) {
        for (let gx = Math.floor((x - r) / 16); gx <= Math.floor((x + r) / 16); gx++) {
          for (const u of b.get(gx * 100003 + gy) ?? []) {
            if (this.units.has(u.id) && Math.hypot(u.x - x, u.y - y) <= r) out.push(u);
          }
        }
      }
    } else {
      for (const u of this.units.values()) if (Math.hypot(u.x - x, u.y - y) <= r) out.push(u);
    }
    return out;
  }

  /** Nächstes Ziel für Türme und Spieler: Zombie im Umkreis. */
  nearestTarget(x: number, y: number, r: number, tick = -2): Target | null {
    let best: Unit | null = null;
    let bd = r;
    for (const u of this.near(x, y, r, tick)) {
      const d = Math.hypot(u.x - x, u.y - y);
      if (d < bd || (d === bd && best && u.id < best.id)) {
        bd = d;
        best = u;
      }
    }
    return best ? { kind: 'unit', id: best.id, x: best.x, y: best.y } : null;
  }

  /** Physischer Schaden mit Panzerung (fester Abzug, dann Anteil). */
  static applyArmor(dmg: number, flat: number, pct: number): number {
    const after = dmg > flat ? dmg - flat : 1 / (2 + flat - dmg);
    return after * (1 - pct);
  }

  /** Schaden an einem Zombie; liefert true, wenn er stirbt. */
  private hurt(w: World, u: Unit, dmg: number): boolean {
    const def = UNITS[u.kind];
    u.hp -= EnemySystem.applyArmor(dmg, def.armorFlat, def.armorPercent);
    if (u.hp > 0) return false;
    this.units.delete(u.id);
    this.kills++;
    this.remnants.push({ x: u.x, y: u.y, kind: 'unit', size: def.scale, tick: w.tick, name: u.kind, dir: u.angle });
    w.events.push('death', u.x, u.y);
    w.stats.made(`kill.${u.kind}`, 1);
    return true;
  }

  /** Treffer durch Turm, Schuss, Granate oder Nahkampf (stun: Betäubung in Ticks). */
  damageTarget(w: World, t: Target, dmg: number, by?: { x: number; y: number }, stun = 0): void {
    const u = this.units.get(t.id);
    if (!u) return;
    if (this.hurt(w, u, dmg)) return;
    if (stun > 0) {
      u.stun = Math.max(u.stun, u.kind === 'brute' ? Math.round(stun / 3) : stun);
      // nach der Betäubung braucht der Zombie einen Moment, bevor er wieder zuschlägt
      u.cd = Math.max(u.cd, u.stun + 12);
    }
    // Getroffene wenden sich dem Angreifer zu
    if (by && u.mode !== 'chase' && u.mode !== 'horde') {
      const p = w.player;
      if (p && !p.dead && Math.hypot(by.x - p.x, by.y - p.y) < 1 && Math.hypot(p.x - u.x, p.y - u.y) < ZOMBIE.sightDay * 2) this.startChase(w, u);
      else {
        u.mode = 'investigate';
        u.target = null;
        u.tx = by.x;
        u.ty = by.y;
      }
    }
  }

  // ------------------------------------------------------------ Speichern

  /** Welt, zu der das Verfolgungsfeld gehört (für den Spielstand: nur ein gültiges Feld wird wiederhergestellt). */
  private chaseValid(ver: number): [number, number, number] | null {
    const c = this.chase;
    return c && c.ver === ver ? [c.px, c.py, c.tick] : null;
  }

  serialize(structureVersion = -1) {
    return {
      v: 2, nu: this.nextUnit, rs: this.rs, k: this.kills, lh: this.lastHorde, ch: this.chaseValid(structureVersion),
      cells: [...this.cells].sort((a, b) => a - b),
      units: [...this.units.values()].map((u) => [
        u.id, u.kind, u.x, u.y, u.hp, u.mode, u.target, u.tx, u.ty, u.hx, u.hy, u.cd, u.angle, u.phase, u.stuck, u.side, u.sideUntil,
        u.stun, u.lost, u.wait, u.hz, u.scream, u.retry,
      ]),
    };
  }

  load(w: World, d?: ReturnType<EnemySystem['serialize']>): void {
    this.units.clear();
    this.cells.clear();
    this.fields.clear();
    this.chase = null;
    this.remnants.length = 0;
    this.kills = 0;
    this.lastHorde = null;
    // Spielstände des Vorgängers (Krabbler und Nester) werden nicht übernommen
    if (!d || d.v !== 2) return;
    this.nextUnit = d.nu;
    this.rs = d.rs;
    this.kills = d.k ?? 0;
    this.lastHorde = d.lh ?? null;
    for (const c of d.cells) this.cells.add(c);
    for (const r of d.units as [number, UnitKind, number, number, number, UnitMode, number | null, ...number[]][]) {
      const [id, kind, x, y, hp, mode, target, tx, ty, hx, hy, cd, angle, phase, stuck, side, sideUntil, stun, lost, wait, hz, scream, retry] = r;
      if (!UNITS[kind]) continue;
      this.units.set(id, { id, kind, x, y, hp, mode, target, tx, ty, hx, hy, cd, angle, phase, stuck, side, sideUntil, stun, lost, wait, hz, scream, retry });
    }
    // Verfolgungsfeld wie vor dem Speichern (Gebäude sind beim Laden schon angelegt)
    if (d.ch) this.buildChase(w, d.ch[0], d.ch[1], d.ch[2]);
  }
}

export { PLAYER_COMBAT };
