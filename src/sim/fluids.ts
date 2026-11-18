import { DX, DY, type Dir, opposite, tileKey } from './geom';
import type { World } from './world';

/**
 * Flüssigkeiten als Netze (wie Rohrsegmente): verbundene Behälter teilen sich einen Vorrat.
 * Mengen ganzzahlig in Tausendstel Einheiten. Netze werden bei Bauänderungen neu gebildet;
 * der Inhalt wird dabei anteilig auf die Behälter verteilt und wieder zusammengezählt.
 */
export class FluidBox {
  amount = 0;
  fluid: string | null = null;
  net: FluidNet | null = null;
  constructor(
    /** Fassungsvermögen (Tausendstel Einheiten). */
    readonly capacity: number,
    /** Nur diese Flüssigkeit (null = beliebig); Maschinen setzen ihn je Rezept. */
    public filter: string | null,
  ) {}
}

export interface FluidPort {
  box: FluidBox;
  /** Feld innerhalb des Gebäudes, an dem angeschlossen wird. */
  tx: number;
  ty: number;
  /** Richtung nach außen. */
  dir: Dir;
}

/** Gebäude mit Flüssigkeitsanschlüssen. */
export interface FluidHolder {
  fluidBoxes(): FluidBox[];
  fluidPorts(): FluidPort[];
  /** Zusätzliche direkte Verbindungen (z. B. Rohr unterirdisch zum Gegenstück). */
  fluidLinks?(w: World): FluidBox[];
}

export function isFluidHolder(e: unknown): e is FluidHolder {
  return typeof (e as FluidHolder | null)?.fluidPorts === 'function';
}

export class FluidNet {
  fluid: string | null = null;
  amount = 0;
  capacity = 0;
  readonly boxes: FluidBox[] = [];
  /** Erlaubte Flüssigkeit (aus Filtern der Behälter). */
  filter: string | null = null;

  /** Fügt bis zu amt hinzu, gibt die angenommene Menge zurück. */
  add(fluid: string, amt: number): number {
    if (this.filter && this.filter !== fluid) return 0;
    if (this.fluid && this.fluid !== fluid && this.amount > 0) return 0;
    const n = Math.min(amt, this.capacity - this.amount);
    if (n <= 0) return 0;
    this.fluid = fluid;
    this.amount += n;
    return n;
  }

  take(fluid: string, amt: number): number {
    if (this.fluid !== fluid) return 0;
    const n = Math.min(amt, this.amount);
    this.amount -= n;
    if (this.amount === 0) this.fluid = null;
    return n;
  }

  space(fluid: string): number {
    if (this.filter && this.filter !== fluid) return 0;
    if (this.fluid && this.fluid !== fluid && this.amount > 0) return 0;
    return this.capacity - this.amount;
  }
}

export class FluidSystem {
  private version = -1;
  nets: FluidNet[] = [];
  /** Verbindungsmasken je Gebäude-ID (N=1, O=2, S=4, W=8) für die Darstellung von Rohren. */
  readonly connections = new Map<number, number>();

  ensure(w: World): void {
    if (this.version === w.structureVersion) return;
    this.version = w.structureVersion;
    this.rebuild(w);
  }

  /** Inhalt der Netze anteilig auf die Behälter schreiben (vor Umbau und Speichern). */
  flush(): void {
    for (const net of this.nets) {
      let rest = net.amount;
      for (const b of net.boxes) {
        b.amount = Math.min(b.capacity, Math.floor((net.amount * b.capacity) / Math.max(1, net.capacity)));
        rest -= b.amount;
      }
      for (const b of net.boxes) {
        if (rest <= 0) break;
        const add = Math.min(rest, b.capacity - b.amount);
        b.amount += add;
        rest -= add;
      }
      for (const b of net.boxes) b.fluid = b.amount > 0 ? net.fluid : null;
    }
  }

  private rebuild(w: World): void {
    // 1. Inhalt der alten Netze auf die Behälter verteilen
    this.flush();
    // 2. Union-Find über passende Anschlüsse
    const holders: { id: number; h: FluidHolder }[] = [];
    for (const e of w.entities.values()) if (isFluidHolder(e)) holders.push({ id: e.id, h: e });
    const parent = new Map<FluidBox, FluidBox>();
    const find = (b: FluidBox): FluidBox => {
      let r = b;
      while (parent.get(r) !== r) r = parent.get(r)!;
      parent.set(b, r);
      return r;
    };
    const portsAt = new Map<number, { id: number; port: FluidPort }[]>();
    for (const { id, h } of holders) {
      for (const b of h.fluidBoxes()) parent.set(b, b);
      for (const p of h.fluidPorts()) {
        const k = tileKey(p.tx, p.ty);
        let l = portsAt.get(k);
        if (!l) portsAt.set(k, (l = []));
        l.push({ id, port: p });
      }
    }
    this.connections.clear();
    for (const { id, h } of holders) {
      for (const p of h.fluidPorts()) {
        const nk = tileKey(p.tx + DX[p.dir], p.ty + DY[p.dir]);
        const other = portsAt.get(nk)?.find((o) => o.id !== id && o.port.dir === opposite(p.dir));
        if (!other) continue;
        const fa = p.box.filter;
        const fb = other.port.box.filter;
        if (fa && fb && fa !== fb) continue;
        const ra = find(p.box);
        const rb = find(other.port.box);
        if (ra !== rb) parent.set(ra, rb);
        this.connections.set(id, (this.connections.get(id) ?? 0) | (1 << p.dir));
      }
    }
    for (const { h } of holders) {
      if (!h.fluidLinks) continue;
      for (const other of h.fluidLinks(w)) {
        const own = h.fluidBoxes()[0];
        if (!parent.has(other)) continue;
        const ra = find(own);
        const rb = find(other);
        if (ra !== rb) parent.set(ra, rb);
      }
    }
    // 3. Netze bilden (Reihenfolge nach Gebäude-ID → deterministisch)
    const byRoot = new Map<FluidBox, FluidNet>();
    const nets: FluidNet[] = [];
    for (const { h } of holders) {
      for (const b of h.fluidBoxes()) {
        const r = find(b);
        let net = byRoot.get(r);
        if (!net) {
          net = new FluidNet();
          byRoot.set(r, net);
          nets.push(net);
        }
        net.boxes.push(b);
        net.capacity += b.capacity;
        if (b.filter) net.filter = b.filter;
        b.net = net;
      }
    }
    // 4. Inhalt zusammenzählen (bei gemischtem Inhalt gewinnt die größte Menge)
    for (const net of nets) {
      const sums = new Map<string, number>();
      for (const b of net.boxes) if (b.fluid && b.amount > 0) sums.set(b.fluid, (sums.get(b.fluid) ?? 0) + b.amount);
      let best: string | null = null;
      let bestAmt = 0;
      for (const [f, a] of [...sums.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1))) if (a > bestAmt) { best = f; bestAmt = a; }
      net.fluid = best;
      net.amount = Math.min(bestAmt, net.capacity);
    }
    this.nets = nets;
  }
}

/**
 * Füllstand eines Behälters für die Anzeige (in Einheiten): eigener Anteil (Netze verteilen gleichmäßig nach
 * Fassungsvermögen, wie die Füllstandsanzeige im Original je Gebäude) und das ganze angeschlossene Rohrnetz.
 */
export function fluidSummary(b: FluidBox, unit: number): { fluid: string | null; own: number; ownCap: number; net: number; netCap: number } {
  const n = b.net;
  const fluid = (n?.fluid ?? b.fluid ?? b.filter) as string | null;
  if (!n) return { fluid, own: b.amount / unit, ownCap: b.capacity / unit, net: b.amount / unit, netCap: b.capacity / unit };
  const own = n.capacity > 0 ? (n.amount * b.capacity) / n.capacity : 0;
  return { fluid, own: own / unit, ownCap: b.capacity / unit, net: n.amount / unit, netCap: n.capacity / unit };
}
