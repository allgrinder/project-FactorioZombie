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
  readonly blurb: string;
}

export const WORLD = {
  /** Fester Karten-Seed der Welt. */
  seed: 326,
  name: 'Kreis Aschland',
  towns: [
    { id: 'aschbach', name: 'Aschbach', x: 96, y: -44, size: 1, axis: 'x', blurb: 'Weiler an der Kreuzung, der erste Ort hinter der Waldhütte' },
    { id: 'dornfeld', name: 'Dornfeld', x: -196, y: 64, size: 2, axis: 'x', blurb: 'Bauerndorf zwischen Feldern' },
    { id: 'moorbrueck', name: 'Moorbrück', x: 164, y: 216, size: 2, axis: 'y', blurb: 'Dorf am Wasser mit Laden und Werkstatt' },
    { id: 'eisenrode', name: 'Eisenrode', x: 392, y: -124, size: 3, axis: 'x', industrial: true, blurb: 'Industriestadt: Werkstätten, Wracks, viel Schrott' },
    { id: 'grauenfurt', name: 'Grauenfurt', x: -124, y: -336, size: 3, axis: 'y', blurb: 'Kreisstadt mit Läden – und den meisten Zombies' },
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
  ] as readonly (readonly (readonly [number, number])[])[],
  /** Militärposten: Lager mit Militärkisten, stark bewacht. */
  outposts: [{ name: 'Posten 7', x: 432, y: 262 }] as readonly { name: string; x: number; y: number }[],
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
