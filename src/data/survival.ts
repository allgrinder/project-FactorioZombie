/**
 * Überleben: Hunger, Durst, Müdigkeit, Wunden, Infektion. Eigene Werte (docs/GAME_DATA.md, Abschnitt „Überleben“).
 * Alle Bedürfnisse laufen von 100 (gut) nach 0 (schlecht); Müdigkeit von 0 (ausgeruht) nach 100 (erschöpft).
 */
import { DAY } from './time';

export const SURVIVAL = {
  /** Satt → verhungert in so vielen Tagen; ab 0 Schaden je Sekunde. */
  hungerDays: 2.6,
  thirstDays: 1.6,
  starveDamagePerSecond: 0.45,
  thirstDamagePerSecond: 0.7,
  /** Arbeit (Abbau, Laufen) verbraucht mehr: Faktor auf den Grundverbrauch, solange die Figur läuft/abbaut. */
  workFactor: 1.35,
  /** Wach → erschöpft in so vielen Tagen; ab tiredFrom langsamer, bei 100 Schaden und Zwangsschlaf. */
  fatigueDays: 1.9,
  tiredFrom: 75,
  tiredSpeed: 0.75,
  /** Schlaf: so viele Müdigkeitspunkte je Tick im Bett / auf dem Boden; die Zeit läuft dabei schneller (sleepSpeed Ticks je Bild). */
  sleepRestBed: 0.028,
  sleepRestGround: 0.014,
  sleepSpeed: 8,
  /** Zombie näher als so viele Felder weckt (bzw. verhindert das Einschlafen). */
  wakeDistance: 9,
  /** Schlafen erst ab dieser Müdigkeit möglich. */
  sleepFrom: 30,
  /** Heilung je Sekunde, wenn Hunger und Durst über healAbove liegen und keine Wunde blutet; im Schlaf doppelt. */
  healPerSecond: 0.12,
  healAbove: 40,
  /** Blutung: Schaden je Sekunde je Wunde, höchstens maxWounds; hört von selbst nach bleedTicks auf. */
  bleedPerSecond: 0.35,
  maxWounds: 3,
  bleedTicks: 90 * 60,
  /** Infektion: tödlich nach so vielen Tagen; ab feverFrom (Anteil) langsamer und Meldung. */
  infectionDays: 1.5,
  feverFrom: 0.5,
  feverSpeed: 0.85,
  /** Startwerte einer neuen Runde. */
  start: { hunger: 80, thirst: 80, fatigue: 10 },
} as const;

/** Verbrauch je Tick aus „in n Tagen von 100 auf 0“. */
export const perTick = (days: number): number => 100 / (days * DAY.ticks);

/** Benutzbare Gegenstände (Rechtsklick im Inventar oder Taste). */
export interface ConsumableDef {
  readonly hunger?: number;
  readonly thirst?: number;
  /** Sofortige Heilung. */
  readonly heal?: number;
  /** Stoppt so viele Blutungen. */
  readonly bandage?: number;
  /** Heilt die Infektion. */
  readonly cure?: boolean;
  /** Senkt die Müdigkeit (Kaffee). */
  readonly rest?: number;
  /** Zurück ins Inventar (leere Flasche). */
  readonly returns?: string;
  /** Verb für die Meldung. */
  readonly verb: string;
}

export const CONSUMABLES: Readonly<Record<string, ConsumableDef>> = {
  'canned-food': { hunger: 40, thirst: 4, verb: 'gegessen' },
  'snack': { hunger: 14, thirst: -4, verb: 'gegessen' },
  'vegetables': { hunger: 18, thirst: 5, verb: 'gegessen' },
  'stew': { hunger: 60, thirst: 12, verb: 'gegessen' },
  'water-bottle': { thirst: 45, returns: 'empty-bottle', verb: 'getrunken' },
  'soda': { thirst: 28, hunger: 4, verb: 'getrunken' },
  'coffee': { thirst: 10, rest: 30, verb: 'getrunken' },
  'bandage': { bandage: 1, heal: 4, verb: 'angelegt' },
  'first-aid-kit': { bandage: 3, heal: 45, verb: 'benutzt' },
  'antibiotics': { cure: true, verb: 'eingenommen' },
};

export const isConsumable = (item: string): boolean => item in CONSUMABLES;
