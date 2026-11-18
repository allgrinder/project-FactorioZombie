/**
 * Die feste Welt von „Letzte Schicht“ (eigener Entwurf, Wunsch 12.11.2026: eine persistente, lebensechte Welt statt
 * Zufallskarten). Lage aller Orte und Straßen in Feldern; der Start (Waldhütte) liegt im Ursprung.
 * Gelände, Wasser und Trümmerfelder kommen weiter aus dem Karten-Seed – er ist fest, also ist die Welt immer gleich.
 * Die Orte werden angelegt, sobald die Figur in die Nähe kommt (src/sim/sites.ts).
 */
export interface TownDef {
  readonly id: string;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  /** 1 Weiler, 2 Dorf, 3 Stadt. */
  readonly size: 1 | 2 | 3;
  /** Richtung der Hauptstraße. */
  readonly axis: 'x' | 'y';
  /** Gewerbeort: mehr Werkstätten und Wracks. */
  readonly industrial?: boolean;
  /** Besondere Gebäude am Ortsrand (Polizeiwache, Arztpraxis, Tankstelle). */
  readonly special?: readonly ('police-station' | 'clinic' | 'gas-station')[];
  readonly blurb: string;
}

/** Sonderorte (Wunsch 18.11.2026): Gefängnis, Kraftwerk, Gewerbegebiet, Gutshöfe. gate: Seite der Einfahrt (0 N … 3 W). */
export interface PlaceDef {
  readonly id: string;
  readonly kind: 'prison' | 'powerplant' | 'industrial' | 'farmstead' | 'raidercamp' | 'evac';
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly gate: 0 | 1 | 2 | 3;
  readonly blurb: string;
}

export const WORLD = {
  /** Fester Karten-Seed der Welt. */
  seed: 326,
  name: 'Kreis Aschland',
  towns: [
    { id: 'aschbach', name: 'Aschbach', x: 96, y: -44, size: 1, axis: 'x', special: ['gas-station'], blurb: 'Weiler an der Kreuzung, der erste Ort hinter der Waldhütte' },
    { id: 'dornfeld', name: 'Dornfeld', x: -196, y: 64, size: 2, axis: 'x', special: ['clinic'], blurb: 'Bauerndorf zwischen Feldern' },
    { id: 'moorbrueck', name: 'Moorbrück', x: 164, y: 216, size: 2, axis: 'y', special: ['gas-station'], blurb: 'Dorf am Wasser mit Laden und Werkstatt' },
    { id: 'eisenrode', name: 'Eisenrode', x: 392, y: -124, size: 3, axis: 'x', industrial: true, special: ['police-station', 'gas-station'], blurb: 'Industriestadt: Werkstätten, Wracks, viel Schrott' },
    { id: 'grauenfurt', name: 'Grauenfurt', x: -124, y: -336, size: 3, axis: 'y', special: ['police-station', 'clinic'], blurb: 'Kreisstadt mit Läden – und den meisten Zombies' },
    { id: 'kaltenhain', name: 'Kaltenhain', x: -424, y: -152, size: 2, axis: 'y', blurb: 'abgelegenes Dorf im Westen' },
  ] as readonly TownDef[],
  /** Landstraßen: Wegpunkte von Ort zu Ort (zwei Felder breit; über Wasser als Damm bzw. Brücke). */
  roads: [
    [[8, -6], [40, -30], [96, -44]],
    [[96, -44], [210, -70], [300, -118], [392, -124]],
    [[96, -44], [120, 60], [150, 140], [164, 216]],
    [[8, -6], [-60, 20], [-130, 56], [-196, 64]],
    [[-196, 64], [-300, -10], [-390, -90], [-424, -152]],
    [[-424, -152], [-330, -250], [-220, -320], [-124, -336]],
    [[-124, -336], [-40, -230], [40, -120], [96, -44]],
    [[164, 216], [290, 250], [432, 262]],
    [[392, -124], [440, 40], [432, 262]],
    // Zufahrten zu den Sonderorten
    [[-300, 64], [-300, 132]],
    [[270, -70], [270, 36]],
    [[440, -41], [434, -41]],
    [[-60, 20], [-60, 118]],
    [[300, -118], [300, -168]],
    [[-6, -168], [40, -172]],
    [[250, 241], [250, 284]],
    [[-300, 64], [-360, 64]],
  ] as readonly (readonly (readonly [number, number])[])[],
  /** Schrottplätze (Ziel der Sammeltrupps): zwei nahe am Start, je einer bei den Orten. */
  junkyards: [
    [-46, -38], [58, 52], [128, -12], [-160, 96], [196, 182], [356, -82], [430, -160], [-92, -300], [-160, -372], [-392, -120],
  ] as readonly (readonly [number, number])[],
  /** Militärposten: Lager mit Militärkisten, stark bewacht. */
  outposts: [{ name: 'Posten 7', x: 432, y: 262 }] as readonly { name: string; x: number; y: number }[],
  /** Absturzstellen von Armee-Hubschraubern (Wrack mit Militärbeute, Kisten, Gefallene). */
  crashes: [[-250, -60], [220, -262], [380, 120], [-40, 260]] as readonly (readonly [number, number])[],
  places: [
    { id: 'jva', kind: 'prison', name: 'JVA Aschland', x: -300, y: 152, gate: 0, blurb: 'Gefängnis: Betonmauern, Wachtürme, Zellentrakt – die sicherste Festung im Kreis' },
    { id: 'kraftwerk', kind: 'powerplant', name: 'Kraftwerk Aschland', x: 270, y: 56, gate: 0, blurb: 'Kühltürme, Turbinenhalle, Kohlenhalde, Trafos' },
    { id: 'gewerbe', kind: 'industrial', name: 'Gewerbegebiet Eisenrode', x: 412, y: -40, gate: 1, blurb: 'Lagerhallen, Container, Schrott ohne Ende' },
    { id: 'lindenhof', kind: 'farmstead', name: 'Gut Lindenhof', x: -70, y: 132, gate: 0, blurb: 'Gutshof mit Scheune, Silos und Feldern' },
    { id: 'kraehen', kind: 'raidercamp', name: 'Lager der Krähen', x: -374, y: 64, gate: 1, blurb: 'Eine Plünderbande hat sich hinter Barrikaden verschanzt – ihr Lager ist voller Beute' },
    { id: 'notlager', kind: 'evac', name: 'Notlager Nord', x: 40, y: -190, gate: 2, blurb: 'Evakuierungs-Sammelstelle der Armee: Zelte, Lastwagen, Sanitätszelt – überrannt' },
    { id: 'sammelstelle', kind: 'evac', name: 'Sammelstelle Moorbrück', x: 250, y: 300, gate: 0, blurb: 'Zeltlager hinter Bauzaun, das niemand mehr bewacht' },
    { id: 'birkenrain', kind: 'farmstead', name: 'Hof Birkenrain', x: 296, y: -186, gate: 2, blurb: 'Abgelegener Hof im Osten' },
  ] as readonly PlaceDef[],
  /** Höfe an den Landstraßen: alle so viele Felder einer, so weit neben der Straße. */
  farmEvery: 85,
  farmOffset: 13,
  /** Hauptstraßenlänge, Zahl und Länge der Querstraßen je Ortsgröße. */
  mainLength: [36, 66, 104],
  crossStreets: [0, 2, 4],
  crossLength: [0, 34, 50],
  /** Einzelne Wracks und Lager in der Wildnis: Anteil der sonst zufälligen Fundorte. */
  wildChance: 0.3,
  /** Kein Wildnis-Fundort näher an einem Ort. */
  townClear: 80,
} as const;

/**
 * Stillgelegte Bahnstrecke (eigene Idee): gerade West–Ost-Linie nördlich von Moorbrück, mit Bahnhof und einem
 * entgleisten Güterzug (Wagen als Fundorte). y = Gleismitte (Bett y−1 … y+1).
 */
export const RAILWAY = {
  y: 174,
  x0: -520,
  x1: 520,
  station: { x: 150, name: 'Bahnhof Moorbrück' },
  train: { x: 296, cars: ['locomotive', 'freight-car', 'tank-car', 'freight-car', 'freight-car', 'tank-car', 'freight-car'] as const },
} as const;

/** Geschwungene Landstraße: Mittellinie in Abständen von ROAD_STEP Feldern (x, y je Punkt) mit Richtung (Bogenmaß). */
export interface RoadPath {
  readonly pts: readonly number[];
  readonly ang: readonly number[];
}

/** Abstand der Stützpunkte, halbe Breite (Felder), Schlängeln (größte Auslenkung, Wellenlänge). */
export const ROAD = { step: 0.5, half: 1.3, meander: 3.5, wave: 70 } as const;

let pathsCache: RoadPath[] | null = null;

/** Deterministisches Zufallsmaß für die Straßenform (ohne Simulationsimport). */
function rhash(a: number, b: number, c: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35) ^ Math.imul(c + 0x27d4eb2f, 0x165667b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

/**
 * Landstraßen als weiche Kurven (Wunsch 18.11.2026: „organisch“): Catmull-Rom-Spline durch die Wegpunkte, dazu ein
 * sanftes Schlängeln quer zur Fahrtrichtung, das an den Wegpunkten auf null geht. Endet eine Straße in einem Ort, läuft
 * sie auf das passende Ende seiner Hauptstraße zu (in deren Richtung). Zufahrten (Straßen, deren Anfang auf keinem
 * Ort liegt) beginnen am nächsten Punkt einer früheren Straße.
 */
export function roadPaths(): RoadPath[] {
  if (pathsCache) return pathsCache;
  const out: RoadPath[] = [];
  const townAt = (x: number, y: number) => WORLD.towns.find((t) => t.x === x && t.y === y);
  const known = (x: number, y: number) => !!townAt(x, y) || WORLD.outposts.some((o) => o.x === x && o.y === y) || (x === 8 && y === -6);
  WORLD.roads.forEach((road, ri) => {
    const wp: [number, number][] = road.map(([x, y]) => [x, y]);
    // Ortsenden: auf das Ende der Hauptstraße zulaufen, mit Verlängerung in deren Richtung
    const ends: ([number, number] | null)[] = [null, null];
    for (const e of [0, 1]) {
      const i = e === 0 ? 0 : wp.length - 1;
      const t = townAt(wp[i][0], wp[i][1]);
      if (!t) continue;
      const nb = wp[e === 0 ? 1 : wp.length - 2];
      const half = WORLD.mainLength[t.size - 1] / 2 + 1;
      const [dx, dy] = t.axis === 'x' ? [Math.sign(nb[0] - t.x) || 1, 0] : [0, Math.sign(nb[1] - t.y) || 1];
      const cx = t.axis === 'x' ? t.x + 1 : t.x + 1;
      const cy = t.axis === 'x' ? t.y + 1 : t.y + 1;
      wp[i] = [cx + dx * half, cy + dy * half];
      ends[e] = [-dx, -dy];
    }
    // Zufahrt: Anfang auf die nächste frühere Straße schnappen
    if (!known(road[0][0], road[0][1]) && out.length) {
      let best: [number, number] = wp[0];
      let bd = Infinity;
      for (const p of out) for (let k = 0; k < p.pts.length; k += 2) {
        const d = Math.hypot(p.pts[k] - wp[0][0], p.pts[k + 1] - wp[0][1]);
        if (d < bd) {
          bd = d;
          best = [p.pts[k], p.pts[k + 1]];
        }
      }
      if (bd < 40) wp[0] = best;
    }
    // Kontrollpunkte mit Phantompunkten an den Enden
    const ctrl: [number, number][] = [...wp];
    const first = ends[0] ? [wp[0][0] + ends[0][0] * 10, wp[0][1] + ends[0][1] * 10] as [number, number] : [2 * wp[0][0] - wp[1][0], 2 * wp[0][1] - wp[1][1]] as [number, number];
    const n = wp.length;
    const last = ends[1] ? [wp[n - 1][0] + ends[1][0] * 10, wp[n - 1][1] + ends[1][1] * 10] as [number, number] : [2 * wp[n - 1][0] - wp[n - 2][0], 2 * wp[n - 1][1] - wp[n - 2][1]] as [number, number];
    ctrl.unshift(first);
    ctrl.push(last);
    // fein abtasten, dann nach Bogenlänge neu verteilen
    const raw: [number, number][] = [];
    for (let s = 1; s < ctrl.length - 2; s++) {
      const [p0, p1, p2, p3] = [ctrl[s - 1], ctrl[s], ctrl[s + 1], ctrl[s + 2]];
      const L = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      const steps = Math.max(4, Math.ceil(L * 2));
      const phase = rhash(ri, s, 3) * Math.PI * 2;
      const amp = Math.min(ROAD.meander, L / 25);
      for (let q = 0; q < steps; q++) {
        const t = q / steps;
        const t2 = t * t;
        const t3 = t2 * t;
        const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        let x = f(p0[0], p1[0], p2[0], p3[0]);
        let y = f(p0[1], p1[1], p2[1], p3[1]);
        // Schlängeln quer zur Sehne, an den Wegpunkten null
        const nx = -(p2[1] - p1[1]) / (L || 1);
        const ny = (p2[0] - p1[0]) / (L || 1);
        const m = amp * Math.sin(Math.PI * t) * Math.sin((t * L * 2 * Math.PI) / ROAD.wave + phase);
        x += nx * m;
        y += ny * m;
        raw.push([x, y]);
      }
    }
    raw.push(wp[n - 1]);
    const pts: number[] = [raw[0][0], raw[0][1]];
    let carry = 0;
    for (let k = 1; k < raw.length; k++) {
      const [ax, ay] = raw[k - 1];
      const [bx, by] = raw[k];
      const d = Math.hypot(bx - ax, by - ay);
      let s = ROAD.step - carry;
      while (s <= d) {
        pts.push(ax + ((bx - ax) * s) / d, ay + ((by - ay) * s) / d);
        s += ROAD.step;
      }
      carry = d - (s - ROAD.step);
    }
    const ang: number[] = [];
    for (let k = 0; k < pts.length; k += 2) {
      const a = Math.max(0, k - 2);
      const b = Math.min(pts.length - 2, k + 2);
      ang.push(Math.atan2(pts[b + 1] - pts[a + 1], pts[b] - pts[a]));
    }
    out.push({ pts, ang });
  });
  return (pathsCache = out);
}
