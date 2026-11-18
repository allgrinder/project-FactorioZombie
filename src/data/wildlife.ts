/**
 * Wildtiere (eigene Festlegungen, siehe docs/KONZEPT.md „Wildtiere“): Rehe, Hasen und Wildschweine leben in
 * fruchtbarem, ruhigem Land abseits der Orte. Sie fliehen vor Menschen, Zombies und Lärm und lassen sich jagen.
 * Tempo in Feldern je Tick, Radien in Feldern.
 */
export type AnimalKind = 'deer' | 'rabbit' | 'boar';

export interface AnimalDef {
  readonly name: string;
  readonly hp: number;
  /** Grasen/Umherziehen und Flucht. */
  readonly walk: number;
  readonly run: number;
  /** Fluchtabstand zu Menschen (tags; nachts × WILDLIFE.nightFlee). */
  readonly flee: number;
  /** Beute beim Erlegen. */
  readonly drops: readonly { item: string; amount: number }[];
  /** Anteil an neuen Tieren. */
  readonly weight: number;
  /** Rudelgröße min–max. */
  readonly herd: readonly [number, number];
  /** Greift an, wenn verletzt (Schaden je Stoß, Abklingzeit in Ticks). */
  readonly charge?: { damage: number; cooldown: number };
}

export const ANIMALS: Readonly<Record<AnimalKind, AnimalDef>> = {
  deer: { name: 'Reh', hp: 40, walk: 0.012, run: 0.14, flee: 11, drops: [{ item: 'raw-meat', amount: 4 }, { item: 'hide', amount: 1 }], weight: 0.45, herd: [2, 4] },
  rabbit: { name: 'Hase', hp: 8, walk: 0.01, run: 0.13, flee: 6, drops: [{ item: 'raw-meat', amount: 1 }], weight: 0.4, herd: [1, 2] },
  boar: { name: 'Wildschwein', hp: 70, walk: 0.01, run: 0.11, flee: 7, drops: [{ item: 'raw-meat', amount: 5 }, { item: 'hide', amount: 1 }], weight: 0.15, herd: [1, 3], charge: { damage: 12, cooldown: 70 } },
};

export const WILDLIFE = {
  /** Höchstzahl Tiere in der Nähe der Figur. */
  max: 18,
  /** Neue Tiere erscheinen in diesem Abstandsring um die Figur, außer Sicht. */
  spawnMin: 34,
  spawnMax: 56,
  /** Weiter entfernte Tiere verschwinden (die Welt bleibt ruhig). */
  despawn: 80,
  /** Versuch alle n Ticks. */
  spawnEvery: 90,
  /** Mindest-Fruchtbarkeit des Grases am Erscheinungsort. */
  fertility: 0.42,
  /** Abstand zu Orten und Fundorten. */
  clearOfSites: 26,
  /** Lärm über dieser Stärke in diesem Umkreis schreckt auf. */
  noiseRadius: 22,
  /** Nachts sind Tiere weniger scheu (näher heranpirschen). */
  nightFlee: 0.6,
  /** Fluchtdauer (Ticks) nach einem Schreck. */
  panic: 150,
  /** Zombies erschrecken Tiere in diesem Umkreis. */
  zombieFlee: 6,
} as const;
