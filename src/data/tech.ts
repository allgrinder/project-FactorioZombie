/**
 * Technologien. Kosten: count Einheiten zu je time Sekunden, jede Einheit verbraucht ein Paket je Sorte.
 * Auslöser-Technologien (2.0) haben keine Kosten: sie werden erforscht, sobald trigger erfüllt ist
 * (z. B. 50 Eisenplatten hergestellt) und alle Voraussetzungen erforscht sind.
 * Quelle: Wiki, Infoboxen „… (research)“ (cost, cost-multiplier, required-technologies, effects, technology-trigger).
 */
export interface TechTrigger {
  /** craft-item: herstellen; mine-entity: abbauen/fördern (z. B. Rohöl). */
  readonly type: 'craft-item' | 'mine-entity';
  readonly item: string;
  readonly count: number;
}

/** Bonusarten der Forschung (Wiki „Research“, Abschnitt Bonusse). value: Prozent als Bruch (0,1 = +10 %) bzw. Anzahl. */
export type BonusType =
  | 'inserter-stack' | 'bulk-stack' | 'mining-productivity' | 'lab-speed' | 'toolbelt'
  | 'bullet-damage' | 'turret-damage' | 'shooting-speed' | 'robot-speed' | 'robot-cargo' | 'braking' | 'hand-mining'
  /** Strommasten leuchten nachts (Wunsch, nicht im Original). */
  | 'pole-light';

export interface TechEffect {
  readonly type: BonusType;
  readonly value: number;
}

export interface TechDef {
  readonly id: string;
  readonly name: string;
  readonly count: number;
  readonly time: number;
  readonly packs: readonly string[];
  readonly prerequisites: readonly string[];
  /** Freigeschaltete Rezepte. */
  readonly unlocks: readonly string[];
  readonly trigger?: TechTrigger;
  /** Boni (Forschungsstufen). */
  readonly effects?: readonly TechEffect[];
  /** Stufe (Anzeige „… 3“). */
  readonly level?: number;
  /**
   * Unendliche Forschung: bleibt nach Abschluss erforschbar; Stufe = level + Anzahl Abschlüsse,
   * Kosten je Stufe aus der Formel (Wiki), effects gelten je Abschluss.
   */
  readonly infinite?: { readonly count: (level: number) => number };
}

const RED = ['automation-science-pack'];
const RED_GREEN = ['automation-science-pack', 'logistic-science-pack'];
const RGM = [...RED_GREEN, 'military-science-pack'];

/**
 * Stufenforschung (Wiki „… (research)“): je Stufe Kosten, Zeit, Pakete, Wirkung. Stufe 1 hängt an pre,
 * jede weitere an der vorherigen. last.infinite macht die letzte Stufe unendlich.
 */
function levels(
  id: string, name: string, pre: readonly string[], rows: readonly [count: number, time: number, packs: readonly string[], effects: readonly TechEffect[]][],
  infinite?: { count: (level: number) => number },
): TechDef[] {
  return rows.map(([count, time, packs, effects], i) => ({
    id: `${id}-${i + 1}`, name: `${name} ${i + 1}`, count, time, packs, level: i + 1,
    prerequisites: i === 0 ? pre : [`${id}-${i}`], unlocks: [], effects,
    ...(infinite && i === rows.length - 1 ? { infinite } : {}),
  }));
}
const E = (type: BonusType, value: number): TechEffect => ({ type, value });
/** Physischer Schaden (Wiki): Kugeln und Geschützturm je Stufe. */
const dmg = (b: number, t: number) => [E('bullet-damage', b), E('turret-damage', t)];

/**
 * Forschungsbaum von „Letzte Schicht“: schlanke Produktion, Schwerpunkt Verteidigung und Überleben (eigene Kosten).
 * Die Auslöser-Forschungen des Anfangs (Dampfkraft, Elektronik) sind vom Vorgänger übernommen.
 */
const RAW_TECHS: readonly TechDef[] = [
  {
    id: 'steam-power', name: 'Dampfkraft', count: 0, time: 0, packs: [], prerequisites: [],
    unlocks: ['pipe', 'pipe-to-ground', 'offshore-pump', 'boiler', 'steam-engine'],
    trigger: { type: 'craft-item', item: 'iron-plate', count: 50 },
  },
  {
    id: 'electronics', name: 'Elektronik', count: 0, time: 0, packs: [], prerequisites: [],
    unlocks: ['copper-cable', 'electronic-circuit', 'inserter', 'lab', 'small-electric-pole'],
    trigger: { type: 'craft-item', item: 'copper-plate', count: 10 },
  },
  {
    id: 'automation-science-pack', name: 'Werkstatt-Wissen', count: 0, time: 0, packs: [],
    prerequisites: ['electronics', 'steam-power'], unlocks: ['automation-science-pack'],
    trigger: { type: 'craft-item', item: 'lab', count: 1 },
  },
  // Verteidigung
  { id: 'stone-wall', name: 'Befestigung', count: 10, time: 10, packs: RED, prerequisites: ['automation-science-pack'], unlocks: ['stone-wall', 'gate', 'barbed-wire', 'iron-stick'] },
  { id: 'traps', name: 'Fallen und Köder', count: 20, time: 10, packs: RED, prerequisites: ['stone-wall'], unlocks: ['spike-trap', 'noise-lure'] },
  { id: 'military', name: 'Bewaffnung', count: 10, time: 15, packs: RED, prerequisites: ['automation-science-pack'], unlocks: ['submachine-gun'] },
  { id: 'gun-turret', name: 'MG-Turm', count: 15, time: 10, packs: RED, prerequisites: ['military'], unlocks: ['gun-turret'] },
  { id: 'repair-pack', name: 'Reparaturset', count: 15, time: 10, packs: RED, prerequisites: ['automation-science-pack'], unlocks: ['repair-pack'] },
  { id: 'heavy-armor', name: 'Schutzkleidung', count: 30, time: 30, packs: RED, prerequisites: ['military', 'steel-processing'], unlocks: ['heavy-armor'] },
  {
    id: 'military-2', name: 'Bewaffnung 2', count: 20, time: 15, packs: RED_GREEN,
    prerequisites: ['military', 'steel-processing', 'logistic-science-pack'], unlocks: ['piercing-rounds-magazine', 'grenade'],
  },
  {
    id: 'military-science-pack', name: 'Wehr-Wissen', count: 30, time: 15, packs: RED_GREEN,
    prerequisites: ['military-2', 'stone-wall'], unlocks: ['military-science-pack'],
  },
  // Überleben
  { id: 'farming', name: 'Gartenbau', count: 15, time: 10, packs: RED, prerequisites: ['automation-science-pack'], unlocks: ['garden'] },
  { id: 'first-aid', name: 'Erste Hilfe', count: 20, time: 10, packs: RED, prerequisites: ['automation-science-pack'], unlocks: ['first-aid-kit'] },
  { id: 'medicine', name: 'Medizin', count: 80, time: 20, packs: RED_GREEN, prerequisites: ['first-aid', 'farming', 'logistic-science-pack'], unlocks: ['antibiotics'] },
  { id: 'toolbelt', name: 'Werkzeuggürtel', count: 60, time: 20, packs: RED_GREEN, prerequisites: ['logistic-science-pack'], unlocks: [], effects: [E('toolbelt', 10)] },
  {
    id: 'steel-axe', name: 'Stahlaxt', count: 0, time: 0, packs: [], prerequisites: ['steel-processing'], unlocks: [],
    trigger: { type: 'craft-item', item: 'steel-plate', count: 50 }, effects: [E('hand-mining', 1)],
  },
  // Produktion (schlank)
  { id: 'automation', name: 'Automatisierung', count: 10, time: 10, packs: RED, prerequisites: ['automation-science-pack'], unlocks: ['assembling-machine-1', 'long-handed-inserter'] },
  { id: 'logistics', name: 'Logistik', count: 20, time: 15, packs: RED, prerequisites: ['automation-science-pack'], unlocks: ['splitter', 'underground-belt'] },
  { id: 'electric-mining-drill', name: 'Sortieranlage', count: 25, time: 10, packs: RED, prerequisites: ['automation-science-pack'], unlocks: ['electric-mining-drill'] },
  { id: 'steel-processing', name: 'Stahlverarbeitung', count: 50, time: 5, packs: RED, prerequisites: ['automation-science-pack'], unlocks: ['steel-plate', 'steel-chest'] },
  { id: 'fast-inserter', name: 'Schneller Greifarm', count: 30, time: 15, packs: RED, prerequisites: ['automation'], unlocks: ['fast-inserter'] },
  { id: 'lamp', name: 'Lampe', count: 10, time: 15, packs: RED, prerequisites: ['automation-science-pack'], unlocks: ['lamp'],
    effects: [{ type: 'pole-light', value: 1 }] },
  { id: 'radar', name: 'Radar', count: 20, time: 10, packs: RED, prerequisites: ['automation-science-pack'], unlocks: ['radar'] },
  { id: 'logistic-science-pack', name: 'Technik-Wissen', count: 60, time: 5, packs: RED, prerequisites: ['automation'], unlocks: ['logistic-science-pack'] },
  {
    id: 'electric-energy-distribution-1', name: 'Stromverteilung', count: 60, time: 30, packs: RED_GREEN,
    prerequisites: ['logistic-science-pack', 'steel-processing'], unlocks: ['medium-electric-pole', 'iron-stick'],
  },
  {
    id: 'advanced-material-processing', name: 'Stahlofen', count: 75, time: 30, packs: RED_GREEN,
    prerequisites: ['logistic-science-pack', 'steel-processing'], unlocks: ['steel-furnace'],
  },
  { id: 'landfill', name: 'Landaufschüttung', count: 50, time: 30, packs: RED_GREEN, prerequisites: ['logistic-science-pack'], unlocks: ['landfill'] },
  // Leiser Strom: Solarpanel und Akku locken keine Zombies an
  {
    id: 'solar-energy', name: 'Solarenergie', count: 120, time: 30, packs: RED_GREEN,
    prerequisites: ['logistic-science-pack', 'steel-processing'], unlocks: ['solar-panel'],
  },
  {
    id: 'electric-energy-accumulators', name: 'Akkumulatoren', count: 120, time: 30, packs: RED_GREEN,
    prerequisites: ['solar-energy', 'electric-energy-distribution-1'], unlocks: ['accumulator'],
  },
  // Ziel: Funkturm bauen und Rettung rufen
  {
    id: 'radio', name: 'Funktechnik', count: 250, time: 30, packs: RGM,
    prerequisites: ['radar', 'electric-energy-distribution-1', 'military-science-pack'], unlocks: ['radio-tower'],
  },
  // Boni
  ...levels('research-speed', 'Laborgeschwindigkeit', ['logistic-science-pack'], [
    [100, 30, RED_GREEN, [E('lab-speed', 0.2)]],
    [200, 30, RED_GREEN, [E('lab-speed', 0.3)]],
  ]),
  ...levels('mining-productivity', 'Bergbau-Produktivität', ['electric-mining-drill', 'logistic-science-pack'], [
    [150, 60, RED_GREEN, [E('mining-productivity', 0.1)]],
    [300, 60, RED_GREEN, [E('mining-productivity', 0.1)]],
  ]),
  ...levels('physical-projectile-damage', 'Geschossschaden', ['military'], [
    [50, 30, RED, dmg(0.1, 0.1)],
    [100, 30, RED_GREEN, dmg(0.1, 0.1)],
    [200, 60, RGM, dmg(0.2, 0.2)],
    [300, 60, RGM, dmg(0.2, 0.2)],
  ], { count: (l) => 300 + (l - 4) * 150 }),
  ...levels('weapon-shooting-speed', 'Feuerrate', ['military'], [
    [50, 30, RED, [E('shooting-speed', 0.1)]],
    [100, 30, RED_GREEN, [E('shooting-speed', 0.2)]],
    [200, 60, RGM, [E('shooting-speed', 0.2)]],
  ]),
];

/**
 * Wie im Original braucht jede Forschung die Forschung, die ihre Wissenschaftspakete freischaltet (z. B. Stufe 3 von
 * „Physischer Projektilschaden“ mit Militär-Paketen → „Militär-Wissenschaft“). Fehlt sie in den Vorgängern, wird sie
 * ergänzt. Weltraumpakete gibt es erst nach dem Raketensilo.
 */
function withPackPrereqs(raw: readonly TechDef[]): TechDef[] {
  const byId = new Map(raw.map((t) => [t.id, t]));
  const packTech = new Map<string, string>([['space-science-pack', 'rocket-silo']]);
  for (const t of raw) for (const u of t.unlocks) if (u.endsWith('-science-pack') && !packTech.has(u)) packTech.set(u, t.id);
  const ancestors = (id: string, seen = new Set<string>()): Set<string> => {
    for (const p of byId.get(id)?.prerequisites ?? []) {
      if (seen.has(p)) continue;
      seen.add(p);
      ancestors(p, seen);
    }
    return seen;
  };
  // in Abhängigkeitsreihenfolge ergänzen, damit Vorgänger ihre Ergänzungen schon haben (keine doppelten Linien)
  const done = new Set<string>();
  const visit = (id: string): void => {
    if (done.has(id)) return;
    done.add(id);
    const t = byId.get(id);
    if (!t) return;
    for (const p of t.prerequisites) visit(p);
    const anc = ancestors(id);
    const extra: string[] = [];
    for (const pk of t.packs) {
      const pt = packTech.get(pk);
      if (pt && pt !== id && !anc.has(pt) && !extra.includes(pt) && !ancestors(pt).has(id)) extra.push(pt);
    }
    if (extra.length) byId.set(id, { ...t, prerequisites: [...t.prerequisites, ...extra] });
  };
  for (const t of raw) visit(t.id);
  return raw.map((t) => byId.get(t.id)!);
}

export const TECHS: readonly TechDef[] = withPackPrereqs(RAW_TECHS);

export const TECH_BY_ID: Readonly<Record<string, TechDef>> = Object.fromEntries(TECHS.map((t) => [t.id, t]));

/** Rezepte, die erst durch Forschung freigeschaltet werden. */
/** Länge der Forschungswarteschlange (Wiki „Research“: bis zu 7 Technologien). */
export const RESEARCH_QUEUE_MAX = 7;

export const LOCKED_RECIPES: ReadonlySet<string> = new Set(TECHS.flatMap((t) => t.unlocks));
