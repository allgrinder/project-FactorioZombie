/** Ereignisse für Ton und Effekte (nur Darstellung, nicht gespeichert). Höchstens MAX, älteste fallen weg. */
export type GameEventType = 'build' | 'remove' | 'mine' | 'tree' | 'craft' | 'shot' | 'turret' | 'bite' | 'hit' | 'death' | 'explode' | 'research'
  | 'horde' | 'scream' | 'trap' | 'lure' | 'rescue' | 'melee' | 'search' | 'use' | 'playerdeath';

export interface GameEvent {
  type: GameEventType;
  x: number;
  y: number;
  /** Gebäude (build): ID und Größe. */
  id?: number;
  w?: number;
  h?: number;
  /** Item, das ins Inventar geht (mine, remove, tree). */
  item?: string;
}

const MAX = 96;

export class EventQueue {
  private readonly list: GameEvent[] = [];
  push(type: GameEventType, x: number, y: number, extra?: Omit<GameEvent, 'type' | 'x' | 'y'>): void {
    if (this.list.length >= MAX) this.list.shift();
    this.list.push(extra ? { type, x, y, ...extra } : { type, x, y });
  }
  /** Alle Ereignisse seit dem letzten Abholen. */
  drain(): GameEvent[] {
    return this.list.splice(0, this.list.length);
  }
}
