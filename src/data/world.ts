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
  readonly kind: 'prison' | 'powerplant' | 'industrial' | 'farmstead';
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
  ] as readonly (readonly (readonly [number, number])[])[],
  /** Schrottplätze (Ziel der Sammeltrupps): zwei nahe am Start, je einer bei den Orten. */
  junkyards: [
    [-46, -38], [58, 52], [128, -12], [-160, 96], [196, 182], [356, -82], [430, -160], [-92, -300], [-160, -372], [-392, -120],
  ] as readonly (readonly [number, number])[],
  /** Militärposten: Lager mit Militärkisten, stark bewacht. */
  outposts: [{ name: 'Posten 7', x: 432, y: 262 }] as readonly { name: string; x: number; y: number }[],
  places: [
    { id: 'jva', kind: 'prison', name: 'JVA Aschland', x: -300, y: 152, gate: 0, blurb: 'Gefängnis: Betonmauern, Wachtürme, Zellentrakt – die sicherste Festung im Kreis' },
    { id: 'kraftwerk', kind: 'powerplant', name: 'Kraftwerk Aschland', x: 270, y: 56, gate: 0, blurb: 'Kühltürme, Turbinenhalle, Kohlenhalde, Trafos' },
    { id: 'gewerbe', kind: 'industrial', name: 'Gewerbegebiet Eisenrode', x: 412, y: -40, gate: 1, blurb: 'Lagerhallen, Container, Schrott ohne Ende' },
    { id: 'lindenhof', kind: 'farmstead', name: 'Gut Lindenhof', x: -70, y: 132, gate: 0, blurb: 'Gutshof mit Scheune, Silos und Feldern' },
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
 * Landstraßen als achsparallele Abschnitte [ax, ay, bx, by]: jedes Stück der Wegpunktliste wird zu „erst waagerecht,
 * dann senkrecht“ – auf dem Feldraster sehen gerade Straßen mit rechtwinkligen Kurven besser aus als Treppenstufen.
 * Die Straße ist zwei Felder breit (ay…ay+1 bzw. bx…bx+1).
 */
export function roadSegments(): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  for (const road of WORLD.roads) {
    for (let k = 0; k + 1 < road.length; k++) {
      const [ax, ay] = road[k];
      const [bx, by] = road[k + 1];
      if (ax !== bx) out.push([ax, ay, bx, ay]);
      if (ay !== by) out.push([bx, ay, bx, by]);
    }
  }
  return out;
}
