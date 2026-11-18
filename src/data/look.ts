/**
 * Farbabstimmung des ganzen Bildes (nur Darstellung). Zwei Stufen:
 *  ground – Boden, Wasser, Erze, Decals: dunkler und satter, damit Gebäude und Bänder davor stehen.
 *  world  – alles in der Welt: etwas mehr Kontrast, warme Lichter, kühle Schatten (Split-Toning).
 * Quelle: eigene Abstimmung nach Bildvergleich (Messvorschlag), siehe docs/ART_STYLE.md „Licht und Farbe“.
 */
export interface Grade {
  /** Helligkeit (Faktor). */
  readonly brightness: number;
  /** Kontrast um den Drehpunkt (1 = unverändert). */
  readonly contrast: number;
  readonly pivot: number;
  /** Sättigung (1 = unverändert). */
  readonly saturation: number;
  /** Farbstich der Lichter: Faktoren für R, G, B. */
  readonly gain: readonly [number, number, number];
  /** Anhebung der Schatten: Summand für R, G, B (0..1). */
  readonly lift: readonly [number, number, number];
}

export const LOOK = {
  ground: { brightness: 0.8, contrast: 1.18, pivot: 0.42, saturation: 0.98, gain: [0.98, 1, 0.98], lift: [0, 0, 0] } as Grade,
  world: { brightness: 1.02, contrast: 1.1, pivot: 0.45, saturation: 1.04, gain: [1.03, 1.0, 0.95], lift: [0, 0.004, 0.016] } as Grade,
  /** Leuchten (Bloom) für Leuchtebenen und Funken: Schwelle, Stärke, Weichzeichnung (pixi-filters). */
  bloom: { threshold: 0.15, bloomScale: 1.4, brightness: 1.1, blur: 6, quality: 4 },
  /** Deckkraft der Schattenebene (Gebäude, Bäume, Items). */
  shadowAlpha: 0.74,
  /** Großflächige Helligkeitsschwankung des Bodens: Stärke (±) und Größe der Flecken in Feldern. */
  macro: { amp: 0.13, scale: 22, amp2: 0.06, scale2: 7, hueScale: 46, hueDry: 0xfff0d0, hueLush: 0xd4ecc4 },
} as const;

/** Umgebungsleben (nur Darstellung, src/render/ambient.ts): Höchstzahlen im Bild, Fluchtabstand der Krähen, Farben. */
export const AMBIENT = {
  crowFlocks: 2,
  crowScare: 6,
  butterflies: 10,
  fireflies: 36,
  leaves: 40,
  butterflyColors: [0xf0e8d0, 0xe8c040, 0xd87a30, 0x9ab0e0, 0xf8f8f0],
  leafColors: [0xb0702a, 0xc89a38, 0x8a4a22, 0xa8862e],
  /** Rauch über schwelenden Ruinen (Anteil der ausgebrannten Häuser in HOUSES.smoulder): Teilchen je Tick, Höchstzahl. */
  smokeRate: 0.05,
  smokeMax: 160,
  /** Bodennebel morgens und bei Nebel: Schwaden im Bild, Deckkraft. */
  mist: 14,
  mistAlpha: 0.22,
  /** Hubschrauber-Überflug: Wahrscheinlichkeit je Tick am Tag, Tempo (Felder je Tick). */
  heliChance: 0.00006,
  heliSpeed: 0.12,
} as const;

/** Vignette (Bildränder abgedunkelt): freier Innenbereich in Prozent, Deckkraft am Rand. Aus mit ?look=0. */
export const VIGNETTE = { inner: 58, alpha: 0.38 } as const;

/** Wind in Bäumen und Gras (Scherung in Bogenmaß): Grundstärke je Wetter, Schwingung (1/s), Böenwelle. */
export const WIND = { calm: 0.012, rain: 0.03, storm: 0.07, speed: 1.3, gustSpeed: 0.5, gustScale: 0.06 } as const;

/** Ausgebrannte Häuser (nur Darstellung): Anteil, Dachlöcher, verkohlte Wandfarben. */
export const HOUSES = { burnt: 0.1, smoulder: 0.35, roofHoles: 0.7, charred: [0x4a4038, 0x3e3632, 0x564a40] } as const;

/** Bodenfarbe je Jahreszeit (multipliziert mit der Landschaftsfarbe): Frühling frisch, Herbst braun, Winter fahl. */
export const SEASON_GROUND = { spring: 0xe4f6d0, summer: 0xf6f8e8, autumn: 0xfff0d0, winter: 0xe4e8ee } as const;

/** Trampelpfade (nur Darstellung): Abtastung alle every Ticks, Zuwachs je Schritt, Abklingen je Abtastung, ab show sichtbar. */
export const TRAILS = { every: 6, gain: 0.03, decay: 0.00005, show: 0.3, maxAlpha: 0.75, maxTiles: 20000 } as const;
