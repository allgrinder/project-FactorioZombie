/**
 * Effekte (nur Darstellung): Austrittspunkte in Modellkoordinaten des Gebäudes bei Richtung Nord
 * (x Osten, y Norden, z Höhe in Feldern, wie in den Blender-Modellen) und Partikelwerte.
 */
export type FxKind = 'smoke' | 'dust' | 'spark';

export interface Emitter {
  readonly kind: FxKind;
  readonly at: readonly [number, number, number];
  /** Partikel pro Sekunde, solange das Gebäude arbeitet. */
  readonly rate: number;
  /** Zufällige Streuung des Austrittspunkts (Felder). */
  readonly spread?: number;
}

export const EMITTERS: Readonly<Record<string, readonly Emitter[]>> = {
  'stone-furnace': [
    { kind: 'smoke', at: [0.25, 0.25, 1.42], rate: 3.0 },
    { kind: 'spark', at: [0.25, 0.25, 1.42], rate: 0.9 },
  ],
  'burner-mining-drill': [
    { kind: 'smoke', at: [0.55, 0.35, 1.42], rate: 2.5 },
    { kind: 'dust', at: [0, 0, 0.05], rate: 1.2, spread: 0.9 },
  ],
  boiler: [
    { kind: 'smoke', at: [-0.85, -0.55, 1.85], rate: 3.0 },
    { kind: 'spark', at: [-0.85, -0.55, 1.85], rate: 0.5 },
  ],
  'electric-mining-drill': [{ kind: 'dust', at: [0, 0, 0.05], rate: 2.0, spread: 1.4 }],
};

/** Partikelwerte je Art: Lebensdauer (s), Steigen und Wind (Felder/s), Größe Anfang/Ende, Deckkraft. */
export const FX = {
  smoke: { life: 5.0, rise: 0.38, wind: 0.22, jitter: 0.07, size0: 0.45, size1: 2.4, alpha: 0.88 },
  dust: { life: 1.4, rise: 0.12, wind: 0.08, jitter: 0.15, size0: 0.35, size1: 1.0, alpha: 0.9 },
  spark: { life: 0.9, rise: 0.9, wind: 0.15, jitter: 0.35, size0: 0.55, size1: 0.2, alpha: 1.0 },
  /** Staub beim Handabbau (Partikel pro Sekunde). */
  mineDustRate: 6,
  maxParticles: 700,
} as const;

/**
 * Wolkenschatten (nur Darstellung): ein Raster mit Zellen, in denen je eine Wolke liegen kann; das Raster
 * zieht mit dem Wind (Felder/s). Zeitbasis sind Ticks, bei Pause stehen die Wolken.
 */
export const CLOUDS = {
  cell: 46,
  chance: 0.42,
  windX: 0.45,
  windY: 0.12,
  /** Deckkraft der Schatten. */
  alpha: 0.32,
  sizeMin: 0.9,
  sizeMax: 1.7,
} as const;

/** Nacht (nur Darstellung): Farbe und Deckkraft der Dunkelheit, Lichtradien in Feldern. */
export const NIGHT = {
  color: 0x0a1428,
  /** Abdunklung bei voller Dunkelheit (Anteil). */
  alpha: 0.86,
  /** Farbe des Restlichts (Mondlicht), mit der die Welt nachts multipliziert wird. */
  ambient: 0x2a3a5c,
  /** Goldene Stunde um die Dämmerung: Mitte (Abstand zu dusk/dawn), halbe Breite (Tageszeit), Stärke, Farben. */
  goldenShift: 0.02,
  goldenWidth: 0.07,
  goldenStrength: 0.4,
  goldenEvening: 0xffa060,
  goldenMorning: 0xffb8a0,
  /** Kerze bei Bewohnern zu Hause, Fackel der Plünderer (Radius in Feldern). */
  candleRadius: 4,
  candleColor: 0xffc070,
  torchRadius: 6,
  /** Glut schwelender Fahrzeugwracks (Radius). */
  wreckFire: 5,
  /** Kameraneigung der Blender-Renders (eisen.TILT) für die Bodennormale. */
  tiltDeg: 30,
  /** Höhe der Lichtquellen über dem Boden (Felder). */
  lightHeight: 1.6,
  /**
   * Lampe (Wunsch 09.11.2026, heller als im Original): großer Lichtkreis, Stärke über 1 hellt die Fläche
   * fast wie am Tag auf. Strommasten leuchten nach der Forschung „Lampe“ so hell wie früher die Lampen
   * (Radius 10 wie Wiki „Lamp“), solange ihr Netz Strom liefern kann.
   */
  lampRadius: 22,
  lampStrength: 1.6,
  lampColor: 0xfff0d8,
  /** Scheinwerfer: kaltweiß. */
  floodColor: 0xe8f0ff,
  poleRadius: 10,
  poleStrength: 1,
  poleColor: 0xffe6c0,
  /** Leuchtende Gebäude (Ofen, Kessel) und Taschenlampe der Figur. */
  fireRadius: 3.5,
  fireColor: 0xff9a4a,
  reactorRadius: 6,
  reactorColor: 0x9cff9a,
  playerRadius: 4,
  playerColor: 0xd8e4ff,
  /** Taschenlampe: Kegel in Blickrichtung (Messvorschlag). */
  flashlightRange: 14,
  flashlightAngle: 60,
  flashlightColor: 0xfff6e0,
  /** Zugscheinwerfer. */
  headlightRange: 18,
  headlightAngle: 40,
} as const;

/** Leben beim Bauen (reine Darstellung, Messvorschlag). */
export const LIFE = {
  /** Aufspringen beim Bauen: Startgröße und Dauer. */
  popFrom: 0.72,
  popMs: 320,
  /** Anlauf-Wackeln: nach mindestens dieser Pause (ms), Stärke, Frequenz, Dämpfung, Dauer. */
  wobbleAfterMs: 1500,
  wobbleAmp: 0.045,
  wobbleHz: 7,
  wobbleDamp: 7,
  wobbleSeconds: 0.7,
  /** Abgebaute Items fliegen zur Figur (Sekunden, Bogenhöhe in Feldern, Größe in Feldern). */
  flySeconds: 0.42,
  flyArc: 1.2,
  flySize: 0.55,
} as const;

/** Hitzeflimmern (nur Darstellung): Verzerrung in Bildpunkten, Auflösungsteiler, Flecken je Quelle, Steighöhe. */
export const HAZE = {
  strength: 7,
  downscale: 4,
  blobs: 3,
  /** Sekunden je Aufstieg eines Flecks und Steighöhe in Feldern. */
  period: 1.6,
  rise: 1.8,
} as const;
