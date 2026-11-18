/**
 * Fremde (Wunsch 18.11.2026: „andere Menschen – Plünderbanden, Händler, andere Gemeinschaften“). Eigene Werte.
 * Plünderer leben im Lager der „Krähen“ (WORLD.places), überfallen ab Tag firstDay in der Dämmerung das Lager der
 * Figur, stehlen aus dem Vorratslager und fliehen verletzt. Händler kommen alle interval Ticks für stay Ticks ans
 * Lagerfeuer und tauschen.
 */
export const RAIDER = {
  health: 70,
  speed: 0.11,
  fleeSpeed: 0.14,
  /** Schusswaffe: Reichweite, Takt, Schaden, Lärm; ohne Waffe Nahkampf. */
  range: 11,
  cooldown: 50,
  damage: 7,
  noise: 16,
  melee: 8,
  meleeCooldown: 45,
  /** Sicht für Menschen bzw. Zombies (wehren sich gegen Zombies nur in der Nähe). */
  sight: 14,
  zombieSight: 6,
  /** Unter diesem Lebensanteil fliehen sie. */
  fleeBelow: 0.35,
  /** So viele Stücke tragen sie aus dem Vorratslager fort; ein Stück je stealTicks. */
  carry: 10,
  stealTicks: 30,
  /** Bande im Lager (Neuzugang alle respawn Ticks, solange weniger als gang). */
  gang: 6,
  respawn: 36_000 * 1.5,
} as const;

export const RAID = {
  firstDay: 4,
  /** Abstand zwischen zwei Überfällen (Ticks) und Gruppengröße. */
  interval: 36_000 * 2.5,
  size: 4,
  /** Kommt die Figur dem Lager der Bande so nah, greift die ganze Bande an. */
  campAlarm: 22,
} as const;

export const TRADER = {
  firstDay: 3,
  interval: 36_000 * 2,
  /** Verweildauer am Lagerfeuer (Ticks). */
  stay: 36_000 * 0.25,
  health: 90,
  speed: 0.1,
  /** Startabstand vom Lagerfeuer. */
  spawnDist: 55,
  /** Angebote je Besuch und Vorrat je Angebot. */
  offers: 4,
  stock: 3,
  /** Bis zu diesem Abstand kann man mit ihm handeln. */
  reach: 3,
} as const;

/** Tauschangebote (Händler wählt je Besuch offers davon): Figur gibt give, bekommt get. */
export const TRADES: readonly { give: [string, number]; get: [string, number] }[] = [
  { give: ['iron-plate', 20], get: ['firearm-magazine', 4] },
  { give: ['copper-cable', 30], get: ['canned-food', 4] },
  { give: ['wood', 30], get: ['water-bottle', 3] },
  { give: ['vegetables', 6], get: ['bandage', 3] },
  { give: ['iron-gear-wheel', 10], get: ['antibiotics', 1] },
  { give: ['canned-food', 6], get: ['pistol', 1] },
  { give: ['stone', 40], get: ['fuel-can', 1] },
  { give: ['iron-plate', 40], get: ['radio-parts', 1] },
  { give: ['cloth', 12], get: ['first-aid-kit', 1] },
  { give: ['electronic-circuit', 4], get: ['submachine-gun', 1] },
  { give: ['firearm-magazine', 6], get: ['piercing-rounds-magazine', 2] },
  { give: ['vegetables', 10], get: ['coffee', 4] },
];
