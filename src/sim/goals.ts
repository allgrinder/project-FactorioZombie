import { dayNumber } from '../data/time';
import type { World } from './world';

/**
 * Ziele (eigene Idee): ein Leitfaden durch die Runde. Jedes Ziel wird aus dem Spielstand abgelesen (Statistik,
 * Gebäude, Tag) und muss daher nicht gespeichert werden. Das HUD zeigt die nächsten offenen Ziele.
 */
export interface Goal {
  readonly id: string;
  readonly title: string;
  readonly hint: string;
  readonly done: (w: World) => boolean;
}

const made = (w: World, item: string): number => w.stats.totalMade.get(item) ?? 0;
const count = (w: World, pred: (name: string, kind: string) => boolean): number => {
  let n = 0;
  for (const e of w.entities.values()) if (pred(e.name, e.kind)) n++;
  return n;
};

export const GOALS: readonly Goal[] = [
  { id: 'fire', title: 'Lagerfeuer entzünden', hint: 'Lagerfeuer setzen (Taste 3) und Holz hineinlegen – das ist deine Basis', done: (w) => !!w.base },
  { id: 'scrap', title: '30 Stück Schrott sammeln', hint: 'Schrotthaufen mit gehaltener rechter Maustaste ausschlachten', done: (w) => made(w, 'iron-ore') + made(w, 'copper-ore') >= 30 },
  { id: 'smelt', title: '20 Eisenplatten schmelzen', hint: 'Ofen setzen, Schrott und Kohle oder Holz hinein', done: (w) => made(w, 'iron-plate') >= 20 },
  { id: 'loot', title: 'Ein Haus durchsuchen', hint: 'Häuser und Schuppen im nächsten Ort – Linksklick durchsucht', done: (w) => made(w, 'search.ruin-house') + made(w, 'search.ruin-store') + made(w, 'search.ruin-shed') > 0 },
  { id: 'walls', title: 'Basis mit 20 Mauerteilen sichern', hint: 'Holzbarrikaden oder Steinmauern um das Lagerfeuer, ein Tor als Durchgang', done: (w) => count(w, (_n, k) => k === 'wall') >= 20 },
  { id: 'lab', title: 'Forschung beginnen', hint: 'Labor bauen, Werkstatt-Wissen herstellen, mit T forschen', done: (w) => w.research.done.size >= 4 },
  { id: 'car', title: 'Pritschenwagen reparieren', hint: 'Das Wrack am Startplatz: 20 Eisenplatten, 8 Zahnräder, 10 Kabel – dann Benzinkanister in den Tank, V zum Einsteigen', done: (w) => w.cars.cars.length > 0 },
  { id: 'survivor', title: 'Einen Überlebenden retten', hint: 'In Dörfern und Städten warten Überlebende – hingehen, sie folgen dir zum Lagerfeuer', done: (w) => made(w, 'rescue.survivor') > 0 },
  { id: 'crew', title: 'Gemeinschaft mit 3 Bewohnern', hint: 'Überlebende in Orten finden und zum Lagerfeuer bringen; Aufgaben mit K verteilen, Essen ins Vorratslager', done: (w) => w.community.residents.length >= 3 },
  { id: 'tower', title: 'Basis bewachen', hint: 'MG-Turm oder Wachturm mit Magazinen, Feuerschalen für die Nacht', done: (w) => count(w, (_n, k) => k === 'turret') >= 2 },
  { id: 'night', title: 'Drei Nächte überleben', hint: 'Jede Nacht kommt eine Horde – sie zieht zum Lagerfeuer', done: (w) => dayNumber(w.tick) >= 4 },
  { id: 'drop', title: 'Einen Versorgungsabwurf bergen', hint: 'Ab Tag 2 landen Kisten am Fallschirm – laut, also schnell sein', done: (w) => made(w, 'search.airdrop') > 0 },
  { id: 'radio', title: 'Funkturm bauen', hint: 'Forschung „Funktechnik“, Funkteile aus Läden und Werkstätten', done: (w) => count(w, (n) => n === 'radio-tower') > 0 },
  { id: 'rescue', title: 'Die Rettung rufen', hint: 'Den Funkturm 15 Minuten unter Strom halten – und verteidigen', done: (w) => w.rescuedAt !== null },
];

/** Offene Ziele in Reihenfolge und Zahl der erledigten. */
export function goalStatus(w: World): { open: Goal[]; done: number } {
  const open = GOALS.filter((g) => !g.done(w));
  return { open, done: GOALS.length - open.length };
}
