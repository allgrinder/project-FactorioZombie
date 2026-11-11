/** Spielfigur. Quelle: factorio-data character-Prototyp, siehe docs/GAME_DATA.md */
export const PLAYER = {
  /** Laufgeschwindigkeit in Feldern pro Tick. */
  runningSpeed: 0.15,
  miningSpeed: 0.5,
  /** Handabbau von Rohstoffen: Faktor auf miningSpeed (Wunsch: 6× schneller als im Original, siehe GAME_DATA.md). */
  handMiningFactor: 6,
  /** Reichweite für Bauen und Gebäude öffnen (Felder). */
  buildDistance: 10,
  reachDistance: 10,
  /** Reichweite für Handabbau von Ressourcen (Felder). */
  resourceReachDistance: 2.7,
  /** Fundorte durchsuchen und ausschlachten: Abstand zur Grundfläche (Felder, eigener Wert). */
  searchDistance: 2.2,
  inventorySlots: 80,
  quickbarSlots: 10,
  /** Kollisionsradius in Feldern. */
  radius: 0.2,
  craftingSpeed: 1,
  /** Reichweite für das Aufheben von Bodenitems (Felder). */
  groundPickupDistance: 1,
  /** Aufheben von Bändern (F halten): Reichweite in Feldern und Takt (Ticks je Item). */
  beltPickupDistance: 1.5,
  pickupInterval: 2,
} as const;

/**
 * Gottmodus (eigener Link `?god`, Testhilfe – nicht im Original): schneller Handabbau, Handwerk, Laufen, Reichweite, Forschung.
 */
export const GOD = {
  /** Handabbau von Erz/Stein/Kohle: Stück je Sekunde. */
  minePerSecond: 40,
  /** Faktor für Handwerk, Laufen und Reichweite. */
  craftingSpeed: 20,
  runningFactor: 2,
  reachFactor: 3,
  /** Labore forschen schneller (Gottmodus). */
  researchFactor: 20,
} as const;

/** Startausrüstung: das Nötigste für die ersten Tage (eigene Festlegung). */
export const START_INVENTORY: readonly { item: string; amount: number }[] = [
  { item: 'iron-plate', amount: 8 },
  { item: 'wood', amount: 6 },
  { item: 'burner-mining-drill', amount: 1 },
  { item: 'stone-furnace', amount: 1 },
  { item: 'baseball-bat', amount: 1 },
  { item: 'pistol', amount: 1 },
  { item: 'firearm-magazine', amount: 3 },
  { item: 'canned-food', amount: 2 },
  { item: 'water-bottle', amount: 2 },
  { item: 'bandage', amount: 2 },
];
