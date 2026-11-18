import { CLIMATE, RADIO, SEASON_NAME, SEASONS, type Season, WEATHER_FX, WEATHER_NAME, type WeatherKind } from '../data/weather';
import { DAY, dayNumber } from '../data/time';
import { hash01 } from './rng';
import type { World } from './world';

const KINDS: WeatherKind[] = ['clear', 'rain', 'fog', 'storm', 'snow'];

/**
 * Wetter und Jahreszeiten (Block E): Jahreszeit aus dem Tag, Wetter nach Los je Abschnitt (deterministisch aus Seed
 * und Abschnittsnummer). Funksprüche bringen Notrufe, Abwürfe, Händler, Hordenwarnungen und Plünderer-Meldungen.
 */
export class WeatherSystem {
  kind: WeatherKind = 'clear';
  until = 0;
  spell = 0;
  /** Nächster Funkspruch und Zahl bisheriger (für das Los). */
  nextRadio = -1;
  radios = 0;
  /** Faktor auf die nächste Horde (Hordenwarnung). */
  hordeBoost = 1;
  /** Notruf-Marker für die Karte: Lage und Ablauf. */
  beacons: { x: number; y: number; until: number }[] = [];

  season(tick: number): Season {
    return SEASONS[Math.floor((dayNumber(tick) - 1) / CLIMATE.seasonDays) % 4];
  }

  get winter(): boolean {
    return this.kind === 'snow' || this.seasonNow === 'winter';
  }

  private seasonNow: Season = 'spring';

  /** Wirkung des aktuellen Wetters. */
  get fx() {
    return WEATHER_FX[this.kind];
  }

  label(tick: number): string {
    return `${SEASON_NAME[this.season(tick)]}, ${WEATHER_NAME[this.kind]}`;
  }

  update(w: World): void {
    // Wetter, Jahreszeiten und Funk gehören zur festen Welt (Tests und Sandkasten: immer klar)
    if (!w.settings.plan) return;
    this.seasonNow = this.season(w.tick);
    if (w.tick >= this.until) {
      const s = this.seasonNow;
      const wt = CLIMATE.weights[s];
      const sum = wt.reduce((a, b) => a + b, 0);
      let r = hash01(w.seed, this.spell, 4401) * sum;
      let k = 0;
      while (r >= wt[k]) r -= wt[k++];
      const prev = this.kind;
      // der erste Vormittag ist immer klar (erster Eindruck)
      this.kind = this.spell === 0 ? 'clear' : KINDS[Math.min(k, KINDS.length - 1)];
      const hours = CLIMATE.minHours + hash01(w.seed, this.spell, 4402) * (CLIMATE.maxHours - CLIMATE.minHours);
      this.until = w.tick + Math.round((hours / 24) * DAY.ticks);
      this.spell++;
      if (this.kind !== prev && w.tick > 0) {
        const msg: Partial<Record<WeatherKind, string>> = {
          rain: 'Es fängt an zu regnen – der Regen übertönt Geräusche, Regentonnen füllen sich schneller',
          fog: 'Nebel zieht auf – Zombies sehen schlecht, Türme und Wachen aber auch',
          storm: 'Ein Gewitter zieht auf – Donner übertönt fast jeden Lärm',
          snow: 'Es schneit – im Winter wachsen keine Beete, und man wird schneller hungrig',
        };
        if (msg[this.kind]) w.player?.note(msg[this.kind]!);
      }
    }
    this.beacons = this.beacons.filter((b) => b.until > w.tick);
    w.noise.damp = this.fx.noise;
    this.radio(w);
  }

  /** Funksprüche. */
  private radio(w: World): void {
    if (this.nextRadio < 0) this.nextRadio = Math.round((RADIO.firstDay - 1 + 0.4) * DAY.ticks);
    if (w.tick < this.nextRadio) return;
    this.nextRadio += RADIO.interval;
    if (this.nextRadio <= w.tick) this.nextRadio = w.tick + RADIO.interval;
    const p = w.player;
    if (!p || p.dead) return;
    const n = this.radios++;
    const pick = Math.floor(hash01(w.seed, n, 4410) * 5);
    const dir = (x: number, y: number) => {
      const a = Math.atan2(y - p.y, x - p.x);
      const names = ['Osten', 'Südosten', 'Süden', 'Südwesten', 'Westen', 'Nordwesten', 'Norden', 'Nordosten'];
      return `${names[(Math.round(a / (Math.PI / 4)) + 8) % 8]}, etwa ${Math.round(Math.hypot(x - p.x, y - p.y))} Felder`;
    };
    switch (pick) {
      case 0: {
        // Notruf: ein Überlebender an einem Fundort in passender Entfernung
        const cands = w.sites.sites.filter((s) => {
          const d = Math.hypot(s.x - p.x, s.y - p.y);
          return d >= RADIO.sosMin && d <= RADIO.sosMax && s.kind !== 'starter' && s.kind !== 'camp';
        });
        if (!cands.length) return;
        const s = cands[Math.floor(hash01(w.seed, n, 4411) * cands.length)];
        let x = s.x + 0.5;
        let y = s.y + 0.5;
        for (let t = 0; t < 12 && (w.map.isBlocked(Math.floor(x), Math.floor(y)) || w.entityAt(x, y)); t++) {
          x += 1;
          y += t % 2;
        }
        w.community.addSurvivor(x, y, w.seed + n);
        this.beacons.push({ x, y, until: w.tick + DAY.ticks * 2 });
        p.note(`Funkspruch: „Hier sitzt jemand fest, bitte helft!“ – ${dir(x, y)} (blau blinkend auf der Karte)`);
        return;
      }
      case 1: {
        w.drops.announce(w);
        return;
      }
      case 2: {
        w.community.strangers.nextTrader = Math.min(w.community.strangers.nextTrader, w.tick + Math.round(DAY.ticks * 0.15));
        p.note('Funkspruch: Ein Händler ist auf dem Weg zu euch');
        return;
      }
      case 3: {
        this.hordeBoost = RADIO.hordeBoost;
        p.note('Funkspruch: „Eine große Herde zieht durch den Kreis – verbarrikadiert euch!“ Die nächste Horde wird größer');
        return;
      }
      default: {
        if (!w.community.raiders.length || !w.base) return;
        const dusk = (dayNumber(w.tick) - 1 + DAY.dusk + 0.01) * DAY.ticks;
        w.community.strangers.nextRaid = Math.round(dusk > w.tick ? dusk : dusk + DAY.ticks);
        p.note('Funkspruch: „Die Krähen ziehen los – heute Nacht sind sie bei euch!“');
      }
    }
  }

  serialize() {
    return { k: this.kind, u: this.until, s: this.spell, r: this.nextRadio, n: this.radios, h: this.hordeBoost, b: this.beacons.map((b) => ({ ...b })) };
  }

  load(d: ReturnType<WeatherSystem['serialize']> | undefined): void {
    this.kind = d?.k ?? 'clear';
    this.until = d?.u ?? 0;
    this.spell = d?.s ?? 0;
    this.nextRadio = d?.r ?? -1;
    this.radios = d?.n ?? 0;
    this.hordeBoost = d?.h ?? 1;
    this.beacons = (d?.b ?? []).map((b) => ({ ...b }));
  }
}
