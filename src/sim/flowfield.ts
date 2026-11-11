import { entityDef } from '../data/entities';
import type { World } from './world';

/** Mehrkosten, um ein festes Gebäude zu durchqueren (Gegner greifen es dann an). */
export const OBSTACLE_COST = 8;
const DIAG = Math.SQRT2;

/**
 * Flussfeld für Gegner: Entfernung jedes Feldes im Fenster zum Ziel (Dijkstra, 8 Nachbarn).
 * Wasser und Klippen sind unpassierbar, feste Gebäude kosten OBSTACLE_COST extra (Umweg oder Durchbruch).
 * Deterministisch aus dem Weltzustand, nicht gespeichert.
 */
export class FlowField {
  readonly dist: Float64Array;

  constructor(readonly x0: number, readonly y0: number, readonly w: number, readonly h: number, dist: Float64Array) {
    this.dist = dist;
  }

  static build(world: World, goals: readonly [number, number][], x0: number, y0: number, w: number, h: number, ignore: number | null): FlowField {
    const N = w * h;
    const dist = new Float64Array(N).fill(Infinity);
    const cost = new Float32Array(N);
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const tx = x0 + i;
        const ty = y0 + j;
        const k = j * w + i;
        if (world.map.isBlocked(tx, ty)) cost[k] = Infinity;
        else {
          const e = world.entityAt(tx, ty);
          // Fundorte der alten Welt (Häuser, Wracks) werden nie eingerissen: wie Fels
          cost[k] = e && e.kind === 'loot' && e.id !== ignore ? Infinity : e && e.id !== ignore && e.kind !== 'rail' && entityDef(e.name).solid ? 1 + OBSTACLE_COST : 1;
        }
      }
    }
    // binärer Heap über (Entfernung, Index)
    const heapD: number[] = [];
    const heapI: number[] = [];
    const push = (d: number, i: number) => {
      let n = heapD.length;
      heapD.push(d);
      heapI.push(i);
      while (n > 0) {
        const p = (n - 1) >> 1;
        if (heapD[p] < heapD[n] || (heapD[p] === heapD[n] && heapI[p] <= heapI[n])) break;
        [heapD[p], heapD[n]] = [heapD[n], heapD[p]];
        [heapI[p], heapI[n]] = [heapI[n], heapI[p]];
        n = p;
      }
    };
    const pop = (): [number, number] => {
      const d = heapD[0];
      const i = heapI[0];
      const ld = heapD.pop()!;
      const li = heapI.pop()!;
      if (heapD.length) {
        heapD[0] = ld;
        heapI[0] = li;
        let n = 0;
        for (;;) {
          const a = 2 * n + 1;
          const b = a + 1;
          let m = n;
          const less = (x: number, y: number) => heapD[x] < heapD[y] || (heapD[x] === heapD[y] && heapI[x] < heapI[y]);
          if (a < heapD.length && less(a, m)) m = a;
          if (b < heapD.length && less(b, m)) m = b;
          if (m === n) break;
          [heapD[m], heapD[n]] = [heapD[n], heapD[m]];
          [heapI[m], heapI[n]] = [heapI[n], heapI[m]];
          n = m;
        }
      }
      return [d, i];
    };
    for (const [gx, gy] of goals) {
      const i = gx - x0;
      const j = gy - y0;
      if (i < 0 || j < 0 || i >= w || j >= h) continue;
      dist[j * w + i] = 0;
      push(0, j * w + i);
    }
    while (heapD.length) {
      const [d, k] = pop();
      if (d > dist[k]) continue;
      const i = k % w;
      const j = (k - i) / w;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = i + di;
          const nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
          const nk = nj * w + ni;
          const c = cost[nk];
          if (c === Infinity) continue;
          // diagonal nur, wenn beide Kanten-Nachbarn frei sind (keine Ecken an Wasser oder Gebäuden schneiden)
          if (di && dj && (cost[j * w + ni] !== 1 || cost[nj * w + i] !== 1)) continue;
          const nd = d + c * (di && dj ? DIAG : 1);
          if (nd < dist[nk]) {
            dist[nk] = nd;
            push(nd, nk);
          }
        }
      }
    }
    return new FlowField(x0, y0, w, h, dist);
  }

  /** Entfernung am Feld (Infinity außerhalb oder unerreichbar). */
  at(tx: number, ty: number): number {
    const i = tx - this.x0;
    const j = ty - this.y0;
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return Infinity;
    return this.dist[j * this.w + i];
  }

  /** Mittelpunkt des besten Nachbarfeldes (bergab), oder null, wenn außerhalb/unerreichbar. */
  next(x: number, y: number): [number, number] | null {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    const here = this.at(tx, ty);
    if (here === Infinity) return null;
    let best = here;
    let bx = tx;
    let by = ty;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const d = this.at(tx + di, ty + dj);
        if (d < best) {
          best = d;
          bx = tx + di;
          by = ty + dj;
        }
      }
    }
    return best < here ? [bx + 0.5, by + 0.5] : null;
  }
}
