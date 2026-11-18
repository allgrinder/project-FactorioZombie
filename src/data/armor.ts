/**
 * Rüstung (Wiki-Infobox „Heavy armor“, Werte für normale Qualität).
 * Vereinfachung: Widerstand gegen „physisch“ gilt für jeden Schaden an der Figur.
 */
export interface ArmorDef {
  readonly id: string;
  /** Zusätzliche Inventarplätze. */
  readonly inventoryBonus: number;
  /** Physischer Widerstand: fester Abzug und Anteil. */
  readonly flat: number;
  readonly percent: number;
}

export const ARMORS: Readonly<Record<string, ArmorDef>> = {
  'heavy-armor': { id: 'heavy-armor', inventoryBonus: 0, flat: 6, percent: 0.3 },
};
