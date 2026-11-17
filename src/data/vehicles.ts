/**
 * Pritschenwagen (eigene Idee, Wunsch 17.11.2026: hinausfahren, plündern, zurück zur Basis). Werte in Feldern je Tick
 * (Figur zu Fuß 0,15). Der Wagen fährt mit Benzin aus Kanistern, ist laut und überfährt Zombies.
 */
export const CAR = {
  /** Höchsttempo auf Asphalt bzw. im Gelände, rückwärts. */
  maxRoad: 0.42,
  maxField: 0.26,
  maxReverse: 0.08,
  accel: 0.006,
  brake: 0.02,
  /** Rollwiderstand je Tick (Anteil). */
  drag: 0.012,
  /** Lenkung (Bogenmaß je Tick bei voller Fahrt, im Stand nichts). */
  turn: 0.045,
  /** Kollisionsradius (Felder). */
  radius: 0.85,
  health: 600,
  /** Verbrauch bei Vollgas (W); im Leerlauf ein Zehntel. */
  power: 60_000,
  /** Lärm (Felder): Motor alle 30 Ticks, solange er läuft. */
  noise: 26,
  /** Überfahren: Schaden je Tick Tempo-Anteil und Rückstoß. */
  ramDamage: 60,
  /** Ein- und Aussteigen: höchstens so weit entfernt (Felder). */
  enterDistance: 3,
  cargoSlots: 30,
  fuelSlots: 2,
  /** Schutz der Insassen: Anteil des Schadens, der durchkommt. */
  cabinProtection: 0.3,
  /** Reparatur des Wracks am Startfundort. */
  repair: [{ item: 'iron-plate', amount: 20 }, { item: 'iron-gear-wheel', amount: 8 }, { item: 'copper-cable', amount: 10 }],
} as const;
