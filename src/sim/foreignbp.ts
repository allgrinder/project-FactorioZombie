import { strFromU8, unzlibSync } from 'fflate';
import { ENTITIES, entityDef, sizeOf } from '../data/entities';
import { ITEMS } from '../data/items';
import { RECIPES } from '../data/recipes';
import type { Blueprint, BlueprintEntity, Settings } from './blueprint';
import type { Dir } from './geom';

/**
 * Blaupausen-Texte im Format des Vorbilds (Wiki „Blueprint string format“): Versionsbyte „0“, dann Base64 einer
 * zlib-komprimierten JSON-Beschreibung (seit 2.0 auch unkomprimiertes JSON). Gebäude werden auf unsere Namen,
 * Positionen (Mitte → linke obere Ecke) und Richtungen (1.1: 8 Stufen, 2.0: 16 Stufen → 4) umgerechnet.
 * Unbekannte Gebäude, Drähte, Bodenbeläge und Module werden ausgelassen und gezählt.
 */

/** Namen des Vorbilds, die bei uns anders heißen (beide Versionen). */
const ALIASES: Record<string, string> = {
  'small-lamp': 'lamp',
  'filter-inserter': 'fast-inserter',
  'stack-inserter': 'bulk-inserter',
  'stack-filter-inserter': 'bulk-inserter',
  'logistic-chest-passive-provider': 'passive-provider-chest',
  'logistic-chest-active-provider': 'active-provider-chest',
  'logistic-chest-storage': 'storage-chest',
  'logistic-chest-requester': 'requester-chest',
  'logistic-chest-buffer': 'buffer-chest',
};

/** Gebäude, deren Richtung im Vorbild zur Aufnahmeseite zeigt (bei uns: Ablageseite). */
const PICKUP_FACING = new Set(['inserter']);

export interface ForeignReport {
  /** Gebäude im Text. */
  total: number;
  /** Übernommene Gebäude. */
  imported: number;
  /** Ausgelassene Gebäude je Name. */
  unknown: Map<string, number>;
  /** Weitere Hinweise (Drähte, Bodenbeläge, Module, Bögen). */
  notes: string[];
}

export interface ForeignBlueprint {
  label: string;
  bp: Blueprint;
}

interface FEntity {
  name: string;
  position: { x: number; y: number };
  direction?: number;
  recipe?: string;
  type?: 'input' | 'output';
  input_priority?: 'left' | 'right';
  output_priority?: 'left' | 'right';
  filter?: string | { name: string };
  filters?: { index: number; name: string }[];
  filter_mode?: 'whitelist' | 'blacklist';
  use_filters?: boolean;
  bar?: number;
  station?: string;
  items?: unknown;
  connections?: unknown;
}
interface FBlueprint {
  label?: string;
  entities?: FEntity[];
  tiles?: unknown[];
  wires?: unknown[];
  version?: number;
}
interface FBook {
  label?: string;
  blueprints?: { index?: number; blueprint?: FBlueprint; blueprint_book?: FBook }[];
}

/** Text entpacken: „0“ + Base64(zlib(JSON)) oder rohes JSON. */
export function decodeForeignJson(text: string): unknown | null {
  const t = text.trim();
  try {
    if (t.startsWith('{')) return JSON.parse(t);
    if (!t.startsWith('0')) return null;
    const bin = atob(t.slice(1).replace(/\s+/g, ''));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return JSON.parse(strFromU8(unzlibSync(bytes)));
  } catch {
    return null;
  }
}

/** Sieht der Text nach dem Format des Vorbilds aus? */
export function isForeignText(text: string): boolean {
  const t = text.trim();
  return t.length > 8 && (t.startsWith('0eN') || t.startsWith('{"blueprint'));
}

/** Alle Blaupausen eines Textes (auch aus Büchern, verschachtelt) samt Bericht. */
export function importForeign(text: string): { blueprints: ForeignBlueprint[]; report: ForeignReport } | null {
  const root = decodeForeignJson(text) as { blueprint?: FBlueprint; blueprint_book?: FBook } | null;
  if (!root || typeof root !== 'object') return null;
  const report: ForeignReport = { total: 0, imported: 0, unknown: new Map(), notes: [] };
  const out: ForeignBlueprint[] = [];
  const notes = new Set<string>();
  const walk = (b: FBlueprint | undefined, label: string) => {
    if (!b) return;
    const bp = convert(b, report, notes);
    if (bp) out.push({ label: b.label || label, bp });
  };
  const walkBook = (book: FBook, prefix: string) => {
    const list = [...(book.blueprints ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    list.forEach((it, i) => {
      if (it.blueprint) walk(it.blueprint, `${prefix}${i + 1}`);
      else if (it.blueprint_book) walkBook(it.blueprint_book, `${it.blueprint_book.label || prefix}${i + 1}.`);
    });
  };
  if (root.blueprint) walk(root.blueprint, 'Blaupause');
  else if (root.blueprint_book) walkBook(root.blueprint_book, `${root.blueprint_book.label ?? 'Buch'} `);
  else return null;
  report.notes = [...notes];
  return { blueprints: out, report };
}

function ourName(name: string): string | null {
  const n = ALIASES[name] ?? name;
  return ENTITIES[n] ? n : null;
}

/** Richtung des Vorbilds → unsere 4 Richtungen (1.1: 0..7, 2.0: 0..15). */
function dir4(d: number | undefined, v2: boolean): Dir {
  const steps = v2 ? 4 : 2;
  return ((Math.round((d ?? 0) / steps) % 4) + 4) % 4 as Dir;
}

function convert(b: FBlueprint, report: ForeignReport, notes: Set<string>): Blueprint | null {
  const v2 = Math.floor((b.version ?? 0) / 2 ** 48) >= 2;
  const ents = b.entities ?? [];
  report.total += ents.length;
  if (b.tiles?.length) notes.add(`${b.tiles.length} Bodenbeläge ausgelassen`);
  if (b.wires?.length || ents.some((e) => e.connections)) notes.add('Schaltungsdrähte ausgelassen');
  const raw: { name: string; cx: number; cy: number; dir: Dir; settings?: Settings; src: FEntity }[] = [];
  for (const e of ents) {
    let name = ourName(e.name);
    let dir = dir4(e.direction, v2);
    if (name === 'straight-rail') {
      // nur gerade Gleise (1.1: Richtung 0/2 bzw. 2.0: 0/4); Diagonalen und Bögen haben bei uns andere Formen
      const d = e.direction ?? 0;
      if (d % (v2 ? 4 : 2) !== 0) name = null;
    }
    if (!name) {
      report.unknown.set(e.name, (report.unknown.get(e.name) ?? 0) + 1);
      continue;
    }
    if (PICKUP_FACING.has(entityDef(name).kind)) dir = ((dir + 2) % 4) as Dir;
    if (e.items) notes.add('Module ausgelassen');
    raw.push({ name, cx: e.position.x, cy: e.position.y, dir, settings: settingsFrom(name, e), src: e });
  }
  fixUndergrounds(raw);
  if (!raw.length) return null;
  // Mitte → linke obere Ecke
  const placed = raw.map((r) => {
    const def = entityDef(r.name);
    const [w, h] = sizeOf(def, r.dir);
    return { ...r, x: Math.round(r.cx - w / 2), y: Math.round(r.cy - h / 2), w, h };
  });
  const minX = Math.min(...placed.map((p) => p.x));
  const minY = Math.min(...placed.map((p) => p.y));
  const maxX = Math.max(...placed.map((p) => p.x + p.w));
  const maxY = Math.max(...placed.map((p) => p.y + p.h));
  const entities: BlueprintEntity[] = placed.map((p) => ({ name: p.name, dx: p.x - minX, dy: p.y - minY, dir: p.dir, ...(p.settings ? { settings: p.settings } : {}) }));
  report.imported += entities.length;
  return { w: maxX - minX, h: maxY - minY, entities };
}

function itemName(f: string | { name: string } | undefined): string | null {
  const n = typeof f === 'string' ? f : f?.name;
  return n && ITEMS[n] ? n : null;
}

function settingsFrom(name: string, e: FEntity): Settings | undefined {
  const kind = entityDef(name).kind;
  if (kind === 'assembler' && e.recipe && RECIPES[e.recipe]) return { recipe: e.recipe };
  if (kind === 'underground') return { out: e.type === 'output' };
  if (kind === 'container' && typeof e.bar === 'number') return { bar: e.bar };
  if (kind === 'inserter' && e.filters?.length && e.use_filters !== false) {
    const slots = (entityDef(name) as { filterSlots?: number }).filterSlots ?? 0;
    if (!slots) return undefined;
    const f: (string | null)[] = Array.from({ length: slots }, () => null);
    for (const x of e.filters) if (x.index >= 1 && x.index <= slots) f[x.index - 1] = itemName(x.name);
    return f.some((x) => x) ? { if: f, ib: e.filter_mode === 'blacklist' } : undefined;
  }
  if (kind === 'splitter') {
    const pr = (p?: 'left' | 'right') => (p === 'left' ? 0 : p === 'right' ? 1 : -1);
    const s: Settings = { ip: pr(e.input_priority), op: pr(e.output_priority), fi: itemName(e.filter) };
    return s.ip! < 0 && s.op! < 0 && !s.fi ? undefined : s;
  }
  return undefined;
}

/**
 * Untergrund-Ausgänge: Bei uns zeigt auch der Ausgang in Laufrichtung. Steht der Eingang (gleiche Sorte,
 * gleiche Linie) „vor“ statt „hinter“ dem Ausgang, ist die Richtung des Vorbilds umgekehrt gemeint – dann drehen.
 */
function fixUndergrounds(list: { name: string; cx: number; cy: number; dir: Dir; settings?: Settings }[]): void {
  const DXs = [0, 1, 0, -1];
  const DYs = [-1, 0, 1, 0];
  for (const o of list) {
    if (entityDef(o.name).kind !== 'underground' || !o.settings?.out) continue;
    const max = (entityDef(o.name) as { maxDistance?: number }).maxDistance ?? 10;
    const hasInput = (d: Dir) => list.some((i) => i !== o && i.name === o.name && !i.settings?.out && i.dir === d && (() => {
      // Eingang liegt stromaufwärts: o = i + k·Richtung
      for (let k = 1; k <= 12 + max; k++) if (Math.abs(i.cx + DXs[d] * k - o.cx) < 0.01 && Math.abs(i.cy + DYs[d] * k - o.cy) < 0.01) return true;
      return false;
    })());
    if (!hasInput(o.dir) && hasInput(((o.dir + 2) % 4) as Dir)) o.dir = ((o.dir + 2) % 4) as Dir;
  }
}

/** Kurzer Bericht für die Anzeige. */
export function reportText(r: ForeignReport, count: number): string {
  const parts = [`${r.imported} von ${r.total} Gebäuden übernommen${count > 1 ? ` (${count} Blaupausen)` : ''}`];
  if (r.unknown.size) {
    const top = [...r.unknown].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n, c]) => `${n} ×${c}`).join(', ');
    parts.push(`unbekannt: ${top}${r.unknown.size > 5 ? ' …' : ''}`);
  }
  parts.push(...r.notes);
  return parts.join(' · ');
}
