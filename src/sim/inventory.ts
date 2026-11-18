import { ITEMS } from '../data/items';

export type InvData = ([string, number] | null)[];

export interface Stack {
  item: string;
  count: number;
}

/** Inventar aus festen Slots. Optional mit Filter (z. B. nur Brennstoff). */
export class Inventory {
  readonly slots: (Stack | null)[];
  /** Höchstmenge je Slot (z. B. 1 für Modulplätze). */
  maxPerSlot = Infinity;
  /**
   * Begrenzung (Vorbild: „rotes X“ der Kisten): nur die ersten bar Slots werden befüllt; dahinter liegende
   * Items bleiben und können entnommen werden.
   */
  bar: number;
  constructor(size: number, readonly filter?: (item: string) => boolean) {
    this.slots = new Array(size).fill(null);
    this.bar = size;
  }

  get size(): number {
    return this.slots.length;
  }

  /** Vergrößern (z. B. Werkzeuggürtel); eine volle Begrenzung wächst mit. */
  resize(size: number): void {
    const full = this.bar === this.slots.length;
    while (this.slots.length < size) this.slots.push(null);
    if (full) this.bar = this.slots.length;
  }

  /**
   * Verkleinern: Stapel aus den wegfallenden Plätzen rücken in freie Plätze davor. Liefert false (ohne Änderung),
   * wenn dafür kein Platz ist.
   */
  shrink(size: number): boolean {
    if (size >= this.slots.length) return true;
    const moving = this.slots.slice(size).filter((s): s is Stack => !!s);
    const free = this.slots.slice(0, size).filter((s) => !s).length;
    if (moving.length > free) return false;
    this.slots.length = size;
    for (const st of moving) this.slots[this.slots.indexOf(null)] = st;
    this.bar = Math.min(this.bar, size);
    return true;
  }

  accepts(item: string): boolean {
    return !this.filter || this.filter(item);
  }

  count(item: string): number {
    let n = 0;
    for (const s of this.slots) if (s && s.item === item) n += s.count;
    return n;
  }

  isEmpty(): boolean {
    return this.slots.every((s) => !s);
  }

  /** Wie viele Items dieses Typs noch hineinpassen. */
  space(item: string): number {
    if (!this.accepts(item)) return 0;
    const stack = Math.min(ITEMS[item]?.stackSize ?? 1, this.maxPerSlot);
    let n = 0;
    for (let i = 0; i < this.bar; i++) {
      const s = this.slots[i];
      if (!s) n += stack;
      else if (s.item === item) n += stack - s.count;
    }
    return n;
  }

  /** Fügt bis zu amount hinzu, gibt die tatsächlich eingefügte Menge zurück. */
  add(item: string, amount: number): number {
    if (amount <= 0 || !this.accepts(item)) return 0;
    const stack = Math.min(ITEMS[item]?.stackSize ?? 1, this.maxPerSlot);
    let left = amount;
    for (let i = 0; i < this.bar; i++) {
      const s = this.slots[i];
      if (left === 0) break;
      if (s && s.item === item && s.count < stack) {
        const t = Math.min(left, stack - s.count);
        s.count += t;
        left -= t;
      }
    }
    for (let i = 0; i < this.bar && left > 0; i++) {
      if (!this.slots[i]) {
        const t = Math.min(left, stack);
        this.slots[i] = { item, count: t };
        left -= t;
      }
    }
    return amount - left;
  }

  /** Entfernt bis zu amount, gibt die entfernte Menge zurück. Hinten beginnend. */
  remove(item: string, amount: number): number {
    let left = amount;
    for (let i = this.slots.length - 1; i >= 0 && left > 0; i--) {
      const s = this.slots[i];
      if (s && s.item === item) {
        const t = Math.min(left, s.count);
        s.count -= t;
        left -= t;
        if (s.count === 0) this.slots[i] = null;
      }
    }
    return amount - left;
  }

  /** Erstes vorhandenes Item, das pred erfüllt. */
  firstItem(pred: (item: string) => boolean = () => true): string | undefined {
    for (const s of this.slots) if (s && pred(s.item)) return s.item;
    return undefined;
  }

  /** Inhalt als Liste (zusammengefasst, sortiert nach Item-Reihenfolge). */
  contents(): Stack[] {
    const m = new Map<string, number>();
    for (const s of this.slots) if (s) m.set(s.item, (m.get(s.item) ?? 0) + s.count);
    return [...m.entries()]
      .map(([item, count]) => ({ item, count }))
      .sort((a, b) => (ITEMS[a.item]?.order ?? 0) - (ITEMS[b.item]?.order ?? 0));
  }

  /** Slots nach Item-Reihenfolge sortieren und zusammenfassen. */
  sort(): void {
    const c = this.contents();
    this.slots.fill(null);
    for (const s of c) this.add(s.item, s.count);
  }

  serialize(): ([string, number] | null)[] {
    return this.slots.map((s) => (s ? [s.item, s.count] : null));
  }

  load(data: ([string, number] | null)[]): void {
    if (data.length > this.slots.length) this.resize(data.length);
    for (let i = 0; i < this.slots.length; i++) {
      const d = data[i];
      // unbekannte Items (gestrichene Systeme in alten Spielständen) fallen weg
      this.slots[i] = d && ITEMS[d[0]] ? { item: d[0], count: d[1] } : null;
    }
  }
}
