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
  'fruit': { hunger: 10, thirst: 6, verb: 'gegessen' },
  'raw-fish': { hunger: 6, thirst: -3, verb: 'roh gegessen' },
  'cooked-fish': { hunger: 30, thirst: -2, verb: 'gegessen' },
  'raw-meat': { hunger: 8, thirst: -6, verb: 'roh hinuntergewürgt' },
  'cooked-meat': { hunger: 42, thirst: -4, verb: 'gegessen' },
  'water-bottle': { thirst: 45, returns: 'empty-bottle', verb: 'getrunken' },
  'soda': { thirst: 28, hunger: 4, verb: 'getrunken' },
  'coffee': { thirst: 10, rest: 30, verb: 'getrunken' },
  'bandage': { bandage: 1, heal: 4, verb: 'angelegt' },
  'first-aid-kit': { bandage: 3, heal: 45, verb: 'benutzt' },
  'antibiotics': { cure: true, verb: 'eingenommen' },
};

export const isConsumable = (item: string): boolean => item in CONSUMABLES;

/** Obstbäume (gepflanzte Gruppe „orchard“, Variante 160–169): Obst beim Fällen im Sommer und Herbst. */
export const FRUIT_TREE = { variantMin: 160, variantMax: 170, min: 3, max: 6 } as const;

/**
 * Ausdauer (Puste, 0…100): Sprinten (Umschalt halten) und Schläge kosten Ausdauer, sie kehrt im Gehen bzw. Stehen zurück.
 * Erschöpft (unter tiredAt) dauert jeder Schlag länger. Sprinten ist hörbar (Schritte).
 */
export const STAMINA = {
  max: 100,
  sprintFactor: 1.45,
  sprintCost: 0.32,
  regenWalk: 0.12,
  regenStand: 0.22,
  meleeCost: 7,
  tiredAt: 20,
  tiredCooldown: 1.6,
  /** Ab so viel Ausdauer darf man wieder sprinten, wenn sie einmal leer war. */
  sprintResume: 25,
  /** Schrittlärm beim Sprinten: Radius, alle n Ticks. */
  sprintNoise: 9,
  sprintNoiseEvery: 30,
} as const;

/**
 * Schleichen (Taste C): langsamer, Zombies bemerken die Figur erst auf kurze Entfernung, Schläge sind leiser.
 * Ein Schlag gegen einen Zombie, der die Figur nicht verfolgt, tötet lautlos (Brocken: dreifacher Schaden).
 */
export const SNEAK = {
  speed: 0.55,
  /** Faktor auf die Sichtweite der Zombies; Sprinten macht auffälliger. */
  visibility: 0.42,
  sprintVisibility: 1.25,
  /** Im hohen Gras / Wald (Baum im Umkreis) zusätzlich. */
  coverVisibility: 0.75,
  meleeNoise: 0.4,
  bruteFactor: 3,
} as const;

/**
 * Körperwärme (0 kalt … 100 warm), nur in der festen Welt: Kälte aus Nacht, Jahreszeit und Wetter. Drinnen (Hausboden,
 * Wagen) halb so kalt, am Feuer wärmt es auf. Ein Wintermantel halbiert den Verlust. Ausgekühlt: langsamer, bei 0 Schaden.
 */
export const WARMTH = {
  start: 100,
  /** Kälte je Quelle (Einheiten), Verlust je Sekunde = Kälte × lossPerCold. */
  night: 0.7,
  season: { spring: 0.15, summer: 0, autumn: 0.45, winter: 1.2 } as Readonly<Record<string, number>>,
  weather: { clear: 0, fog: 0.15, rain: 0.6, storm: 0.9, snow: 0.9 } as Readonly<Record<string, number>>,
  lossPerCold: 0.2,
  /** Erholung je Sekunde ohne Kälte, am Feuer (Radius in Feldern). */
  regen: 0.4,
  fireGain: 2.0,
  fireRadius: 6,
  shelter: 0.4,
  coat: 0.5,
  coldFrom: 35,
  coldSpeed: 0.85,
  freezeDamage: 0.3,
} as const;

/**
 * Fertigkeiten: Nahkampf (Treffer), Plündern (Durchsuchen), Überleben (Jagen, Angeln). Stufe = ⌊√(Erfahrung / step)⌋,
 * höchstens max. Je Stufe: Nahkampfschaden +perLevel.melee, Durchsuchen schneller, Angeln erfolgreicher, weniger Hunger.
 */
export type SkillId = 'melee' | 'loot' | 'survival';
export const SKILLS = {
  names: { melee: 'Nahkampf', loot: 'Plündern', survival: 'Überleben' } as Readonly<Record<SkillId, string>>,
  step: 6,
  max: 5,
  xp: { hit: 1, kill: 3, search: 2, fish: 4, hunt: 5 },
  perLevel: { melee: 0.1, loot: 0.12, fish: 0.025, hunger: 0.04 },
} as const;

/** Angeln (Angel im Inventar, Wasser in Reichweite, Taste U): je Sekunde Biss-Chance; Abbruch durch Bewegung. */
export const FISHING = {
  reach: 2.5,
  chance: 0.06,
  maxSeconds: 90,
} as const;
