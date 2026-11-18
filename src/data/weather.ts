/**
 * Wetter, Jahreszeiten, Funk (Block E, eigene Werte). Ein Jahr hat 4 Jahreszeiten zu je seasonDays Tagen
 * (Frühling, Sommer, Herbst, Winter). Das Wetter wechselt nach minHours…maxHours Spielstunden (1 Tag = 24 h).
 */
export type WeatherKind = 'clear' | 'rain' | 'fog' | 'storm' | 'snow';
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export const SEASONS: readonly Season[] = ['spring', 'summer', 'autumn', 'winter'];
export const SEASON_NAME: Record<Season, string> = { spring: 'Frühling', summer: 'Sommer', autumn: 'Herbst', winter: 'Winter' };
export const WEATHER_NAME: Record<WeatherKind, string> = { clear: 'klar', rain: 'Regen', fog: 'Nebel', storm: 'Gewitter', snow: 'Schnee' };

export const CLIMATE = {
  seasonDays: 7,
  minHours: 4,
  maxHours: 14,
  /** Gewichte je Jahreszeit: klar, Regen, Nebel, Gewitter, Schnee. */
  weights: {
    spring: [5, 3, 2, 1, 0],
    summer: [7, 1, 1, 2, 0],
    autumn: [3, 3, 3, 1, 0],
    winter: [3, 0, 2, 0, 4],
  } as Record<Season, [number, number, number, number, number]>,
} as const;

/**
 * Wirkung: Lärmweite (Regen und Sturm übertönen), Sicht der Zombies, Reichweite von Türmen und Wachen (Nebel), Regentonne
 * (Regen füllt schneller), Hunger der Figur (Winter); im Winter wachsen keine Beete.
 */
export const WEATHER_FX: Record<WeatherKind, { noise: number; sight: number; range: number; rain: number }> = {
  clear: { noise: 1, sight: 1, range: 1, rain: 0 },
  rain: { noise: 0.7, sight: 0.85, range: 0.9, rain: 3 },
  fog: { noise: 1, sight: 0.55, range: 0.6, rain: 0 },
  storm: { noise: 0.5, sight: 0.75, range: 0.8, rain: 4 },
  snow: { noise: 0.85, sight: 0.8, range: 0.85, rain: 0 },
};
export const WINTER = { hunger: 1.35 } as const;

/**
 * Funksprüche: ab Tag firstDay alle interval Ticks einer (Art nach Los): Notruf (ein Überlebender wartet an einem
 * Fundort), angekündigter Abwurf, Händler unterwegs, Hordenwarnung (nächste Horde × hordeBoost), Plünderer gesichtet
 * (Überfall heute Nacht).
 */
export const RADIO = { firstDay: 2, interval: 36_000 * 1.25, hordeBoost: 1.5, sosMin: 70, sosMax: 200 } as const;
