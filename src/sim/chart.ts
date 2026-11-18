import { CHART } from '../data/chart';
import { Status } from './entity';
import type { World } from './world';

const key = (cx: number, cy: number) => (cx + 32768) * 65536 + (cy + 32768);
const unkey = (k: number): [number, number] => [Math.floor(k / 65536) - 32768, (k % 65536) - 32768];
const chunkOf = (t: number) => Math.floor(t / CHART.chunk);

/**
 * Aufgedeckte Kartenabschnitte (Wiki „Radar“): Figur und Radar decken ihre Umgebung laufend auf,
 * Radare erkunden zusätzlich ferne Abschnitte. Nur Anzeige (Karte/Minimap); die Simulation bleibt unberührt.
 */
export class ChartSystem {
  /** Abschnitt → Tick der letzten Aufdeckung. */
  readonly seen = new Map<number, number>();
  /** Zähler für Kartenzeichnungen (ändert sich bei neuen Abschnitten). */
  version = 0;

  isCharted(tx: number, ty: number): boolean {
    return this.seen.has(key(chunkOf(tx), chunkOf(ty)));
  }
  chunkCharted(cx: number, cy: number): boolean {
    return this.seen.has(key(cx, cy));
  }
  /** Abschnitt gerade beobachtet (Gegner und Fahrzeuge sichtbar). */
  chunkLive(cx: number, cy: number, tick: number): boolean {
    const t = this.seen.get(key(cx, cy));
    return t !== undefined && tick - t <= CHART.liveSeconds * 60;
  }
  get count(): number {
    return this.seen.size;
  }

  chartChunk(cx: number, cy: number, tick: number): void {
    const k = key(cx, cy);
    if (!this.seen.has(k)) this.version++;
    this.seen.set(k, tick);
  }

  /** Quadrat mit Radius r (in Abschnitten) um das Feld (x, y). */
  chartAround(x: number, y: number, r: number, tick: number): void {
    const cx = chunkOf(Math.floor(x));
    const cy = chunkOf(Math.floor(y));
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) this.chartChunk(cx + dx, cy + dy, tick);
  }

  update(w: World): void {
    const tick = w.tick;
    if (this.seen.size === 0) {
      // neue Runde (oder alter Spielstand): Startgebiet und Umgebung aller Gebäude
      const p = w.player;
      this.chartAround(p ? p.px / 256 : 0, p ? p.py / 256 : 0, CHART.startRadius, tick);
      for (const e of w.entities.values()) this.chartAround(e.cx, e.cy, 1, tick);
    }
    if (tick % 60 !== 0) return;
    const p = w.player;
    if (p && !p.dead) this.chartAround(p.px / 256, p.py / 256, CHART.playerRadius, tick);
    for (const e of w.entities.values()) {
      if (e.status !== Status.Working) continue;
      if (e.kind === 'radar') this.chartAround(e.cx, e.cy, CHART.radarNearRadius, tick);
    }
  }

  /**
   * Fernerkundung eines Radars: Ring für Ring nach außen (ab dem Nahbereich), je Ring von links oben im
   * Uhrzeigersinn; Unerkundetes zuerst, sonst der am längsten nicht gesehene Abschnitt. Liefert den Abschnitt.
   */
  scanFrom(x: number, y: number, tick: number): [number, number] | null {
    const cx = chunkOf(Math.floor(x));
    const cy = chunkOf(Math.floor(y));
    let oldest: [number, number] | null = null;
    let oldestT = Infinity;
    for (let r = CHART.radarNearRadius + 1; r <= CHART.radarFarRadius; r++) {
      for (const [dx, dy] of ring(r)) {
        const t = this.seen.get(key(cx + dx, cy + dy));
        if (t === undefined) {
          this.chartChunk(cx + dx, cy + dy, tick);
          return [cx + dx, cy + dy];
        }
        if (t < oldestT) {
          oldestT = t;
          oldest = [cx + dx, cy + dy];
        }
      }
    }
    if (oldest) this.chartChunk(oldest[0], oldest[1], tick);
    return oldest;
  }

  serialize(): number[] {
    const out: number[] = [];
    for (const [k, t] of this.seen) out.push(k, t);
    return out;
  }
  load(d: number[] | undefined): void {
    this.seen.clear();
    if (!d) return;
    for (let i = 0; i + 1 < d.length; i += 2) this.seen.set(d[i], d[i + 1]);
    this.version++;
  }
  /** Alle aufgedeckten Abschnitte (für Tests/Anzeige). */
  *chunks(): IterableIterator<[number, number]> {
    for (const k of this.seen.keys()) yield unkey(k);
  }
}

/** Ring mit Radius r: von der linken oberen Ecke im Uhrzeigersinn. */
function ring(r: number): [number, number][] {
  const out: [number, number][] = [];
  for (let x = -r; x < r; x++) out.push([x, -r]);
  for (let y = -r; y < r; y++) out.push([r, y]);
  for (let x = r; x > -r; x--) out.push([x, r]);
  for (let y = r; y > -r; y--) out.push([-r, y]);
  return out;
}
