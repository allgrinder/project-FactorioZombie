import type { Dir } from './geom';

/** Laufzeitstatus für Anzeige (Alt-Ansicht, Symbole). */
export enum Status {
  Idle = 0,
  Working = 1,
  NoFuel = 2,
  OutputBlocked = 3,
  NoInput = 4,
  Depleted = 5,
  NoTarget = 6,
  NoPower = 7,
}

export interface EntityBase {
  readonly id: number;
  /** Prototyp-ID aus src/data/entities.ts */
  readonly name: string;
  readonly x: number;
  readonly y: number;
  dir: Dir;
  status: Status;
}
