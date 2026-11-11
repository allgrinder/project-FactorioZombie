import { ENTITIES } from '../data/entities';
import { FLUIDS } from '../data/fluids';
import { ITEMS } from '../data/items';
import { RECIPE_LIST, type RecipeDef, isCraftable } from '../data/recipes';
import { TECHS } from '../data/tech';
import {
  beltRates, DEFAULT_MACHINES, idealMultiple, type MachineChoice, practicalMultiple, ratePerMachine, ratioRules,
  type RatioNode, rawSource, recipesFor, solve, totals, usesOf,
} from '../sim/ratio';
import type { ResearchSystem } from '../sim/research';

/** Was das Handbuch vom HUD braucht. */
export interface HandbookHost {
  research(): ResearchSystem;
  icon(name: string, cls?: string): HTMLImageElement;
}

type Mode = 'sec' | 'min' | 'machines';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, parent?: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.appendChild(e);
  return e;
}

export const nameOf = (id: string): string => ITEMS[id]?.name ?? FLUIDS[id]?.name ?? ENTITIES[id]?.name ?? id;
const isFluidId = (id: string) => id in FLUIDS;

/** Zahl kurz auf Deutsch: bis 2 Nachkommastellen, ohne überflüssige Nullen. */
export function num(x: number, digits = 2): string {
  const f = 10 ** digits;
  return (Math.round(x * f) / f).toLocaleString('de-DE');
}

const STORE = 'letzteschicht.handbook';
interface Stored { m: MachineChoice; mode: Mode; amount: number; last?: string }

function load(): Stored {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) ?? 'null') as Partial<Stored> | null;
    if (s?.m) return { m: { ...DEFAULT_MACHINES, ...s.m }, mode: s.mode ?? 'machines', amount: s.amount ?? 1, last: s.last };
  } catch { /* ohne Speicher */ }
  return { m: { ...DEFAULT_MACHINES }, mode: 'machines', amount: 1 };
}

/** Gruppen der Liste links. */
const GROUPS: { title: string; test: (id: string) => boolean }[] = [
  { title: 'Wissenschaft', test: (id) => id.endsWith('-science-pack') },
  { title: 'Rohstoffe', test: (id) => !recipesFor(id).length },
  { title: 'Zwischenprodukte', test: (id) => !ITEMS[id]?.placeResult && !isFluidId(id) },
  { title: 'Flüssigkeiten', test: (id) => isFluidId(id) },
  { title: 'Gebäude', test: () => true },
];

/** Alle Produkte, die im Handbuch erscheinen (keine Fass-Varianten). */
function allProducts(): string[] {
  const ids = new Set<string>();
  for (const r of RECIPE_LIST) {
    if ((r.id.startsWith('empty-') && r.id !== 'empty-barrel') || r.id.startsWith('fill-')) continue;
    for (const x of [...r.results, ...r.ingredients]) if (!x.item.endsWith('-barrel') || x.item === 'empty-barrel') ids.add(x.item);
  }
  return [...ids].sort((a, b) => (ITEMS[a]?.order ?? 500) - (ITEMS[b]?.order ?? 500) || nameOf(a).localeCompare(nameOf(b), 'de'));
}

/**
 * Handbuch (Taste J): links alle Produkte, rechts Rezept, Verwendung und ein Verhältnis-Rechner
 * (wie viele Maschinen je Schritt, bis hinunter zu Bohrern und Pumpjacks), dazu eine Seite mit Faustregeln.
 */
export class HandbookView {
  readonly root: HTMLDivElement;
  private readonly list: HTMLDivElement;
  private readonly page: HTMLDivElement;
  private readonly search: HTMLInputElement;
  private readonly products = allProducts();
  private state = load();
  private selected: string | null = null;
  private recipeChoice: Record<string, string> = {};
  private history: string[] = [];
  /** Eingeklappte Zweige im Baum (Pfad aus Indizes). */
  private readonly collapsed = new Set<string>();

  constructor(private readonly host: HandbookHost) {
    this.root = el('div', 'hb-main');
    const left = el('div', 'hb-left', this.root);
    this.search = el('input', 'tt-search', left);
    this.search.placeholder = 'Suchen …';
    this.search.addEventListener('input', () => this.buildList());
    this.search.addEventListener('keydown', (e) => e.stopPropagation());
    const rules = el('button', 'hb-rules-btn', left, 'Faustregeln & Verhältnisse');
    rules.onclick = () => this.showRules();
    this.list = el('div', 'hb-list', left);
    this.page = el('div', 'hb-page', this.root);
    this.buildList();
    if (this.state.last && this.products.includes(this.state.last)) this.open(this.state.last);
    else this.showRules();
  }

  private save(): void {
    try {
      localStorage.setItem(STORE, JSON.stringify({ ...this.state, last: this.selected ?? undefined }));
    } catch { /* ohne Speicher */ }
  }

  private buildList(): void {
    const q = this.search.value.trim().toLowerCase();
    this.list.replaceChildren();
    const left = this.products.filter((id) => !q || nameOf(id).toLowerCase().includes(q) || id.includes(q));
    const done = new Set<string>();
    for (const g of GROUPS) {
      const ids = left.filter((id) => !done.has(id) && g.test(id));
      if (!ids.length) continue;
      el('div', 'hb-group', this.list, g.title);
      const grid = el('div', 'hb-grid', this.list);
      for (const id of ids) {
        done.add(id);
        const b = el('button', `hb-item${id === this.selected ? ' on' : ''}${this.unlocked(id) ? '' : ' locked'}`, grid);
        b.appendChild(this.host.icon(`item.${id}`, 'icon'));
        b.title = nameOf(id) + (this.unlocked(id) ? '' : ' (noch nicht erforscht)');
        b.onclick = () => this.open(id);
      }
    }
  }

  /** Ist mindestens ein Rezept des Produkts verfügbar (oder ein Rohstoff)? */
  private unlocked(id: string): boolean {
    const rs = recipesFor(id);
    if (!rs.length) return true;
    const r = this.host.research();
    return rs.some((x) => r.recipeUnlocked(x.id));
  }

  /** Klickbares Symbol, das das Produkt im Handbuch öffnet. */
  private link(id: string, parent: HTMLElement, amount?: string): HTMLElement {
    const a = el('span', 'hb-link', parent);
    a.appendChild(this.host.icon(`item.${id}`, 'icon small'));
    if (amount) el('b', '', a, amount);
    el('span', '', a, nameOf(id));
    a.title = `${nameOf(id)} im Handbuch öffnen`;
    a.onclick = (ev) => {
      ev.stopPropagation();
      this.open(id);
    };
    return a;
  }

  /** Neu zeichnen (z. B. nach Forschung). */
  refresh(): void {
    this.buildList();
    if (this.selected) this.render();
    else this.showRules();
  }

  open(id: string): void {
    if (this.selected && this.selected !== id) this.history.push(this.selected);
    if (this.selected !== id) this.page.scrollTop = 0;
    this.selected = id;
    this.save();
    this.buildList();
    this.render();
  }

  private render(): void {
    const id = this.selected;
    if (!id) return;
    const p = this.page;
    p.replaceChildren();
    const head = el('div', 'hb-head', p);
    if (this.history.length) {
      const back = el('button', 'small-btn', head, '←');
      back.title = 'Zurück';
      back.onclick = () => {
        const prev = this.history.pop();
        if (prev) {
          this.selected = prev;
          this.save();
          this.buildList();
          this.render();
        }
      };
    }
    head.appendChild(this.host.icon(`item.${id}`, 'icon big'));
    const ht = el('div', '', head);
    el('div', 'hb-title', ht, nameOf(id));
    const sub: string[] = [];
    if (isFluidId(id)) sub.push('Flüssigkeit');
    else if (ITEMS[id]) sub.push(`Stapel ${ITEMS[id].stackSize}`);
    if (ITEMS[id]?.placeResult) sub.push('Gebäude');
    if (ITEMS[id]?.fuelValue) sub.push(`Brennwert ${num(ITEMS[id].fuelValue! / 1e6)} MJ`);
    el('div', 'dim', ht, sub.join(' · '));

    const recipes = recipesFor(id);
    // Herkunft
    const sec = (title: string) => {
      const s = el('div', 'hb-sec', p);
      el('div', 'hb-sec-title', s, title);
      return s;
    };
    const src = rawSource(id, this.state.m);
    if (!recipes.length) {
      const s = sec('Gewinnung');
      if (src) {
        const row = el('div', 'hb-row', s);
        row.appendChild(this.host.icon(`item.${src.machine}`, 'icon small'));
        el('span', '', row, `${nameOf(src.machine)}: ${num(src.perMachine)} ${isFluidId(id) ? 'Einheiten' : 'Stück'}/s je Gebäude${src.note ? ` (${src.note})` : ''}`);
      } else if (id === 'wood') el('div', 'hb-row', s, 'Bäume fällen (Rechtsklick halten oder Bauroboter mit Strg+X).');
      else if (id === 'steam') el('div', 'hb-row', s, 'Kessel (Wasser + Brennstoff) oder Wärmetauscher erzeugen Dampf.');
      else el('div', 'hb-row dim', s, 'Kein Rezept – Rohstoff bzw. Abfallprodukt.');
    }
    // Rezepte
    if (recipes.length) {
      const s = sec(recipes.length > 1 ? 'Rezepte (Klick wählt für den Rechner)' : 'Rezept');
      const cur = this.recipeChoice[id] ?? recipes[0].id;
      for (const r of recipes) {
        const box = el('div', `hb-recipe${recipes.length > 1 ? ' pick' : ''}${recipes.length > 1 && r.id === cur ? ' on' : ''}`, s);
        if (recipes.length > 1) {
          box.onclick = () => {
            this.recipeChoice[id] = r.id;
            this.render();
          };
        }
        this.recipeLine(r, box);
      }
    }
    // Rechner
    if (recipes.length || src) this.calculator(sec('Verhältnis-Rechner'), id);
    // Verwendung
    const uses = usesOf(id).filter((r) => !r.id.startsWith('fill-'));
    const research = TECHS.filter((t) => t.packs.includes(id));
    if (uses.length || research.length) {
      const s = sec('Wird gebraucht für');
      const wrap = el('div', 'hb-uses', s);
      const seen = new Set<string>();
      for (const r of uses) {
        const out = r.results[0]?.item;
        if (!out || seen.has(out)) continue;
        seen.add(out);
        this.link(out, wrap);
      }
      if (research.length) el('div', 'dim hb-note', s, `Forschung: ${research.length} Technologien brauchen dieses Paket.`);
    }
  }

  private recipeLine(r: RecipeDef, box: HTMLElement): void {
    const line = el('div', 'hb-recipe-line', box);
    r.ingredients.forEach((x, i) => {
      if (i) el('span', 'dim', line, '+');
      this.link(x.item, line, num(x.amount));
    });
    el('span', 'hb-arrow', line, `→ ${num(r.time)} s →`);
    r.results.forEach((x, i) => {
      if (i) el('span', 'dim', line, '+');
      this.link(x.item, line, `${num(x.amount)}${x.probability !== undefined && x.probability < 1 ? ` (${num(x.probability * 100, 1)} %)` : ''}`);
    });
    const info = el('div', 'dim hb-note', box);
    const where: string[] = [];
    if (r.category === 'crafting') where.push('Hand');
    const ms = Object.values(ENTITIES).filter((e) => {
      const d = e as { categories?: readonly string[]; kind: string };
      if (r.category === 'smelting') return d.kind === 'furnace';
      if (r.category === 'rocket-building') return d.kind === 'rocket-silo';
      return d.categories?.includes(r.category);
    });
    where.push(...ms.map((e) => e.name));
    const tech = TECHS.find((t) => t.unlocks.includes(r.id));
    const res = this.host.research();
    const techTxt = tech ? ` · Forschung: ${tech.name} ${res.done.has(tech.id) ? '✓' : '(noch nicht erforscht)'}` : '';
    info.textContent = `Herstellung: ${where.join(', ')}${techTxt}`;
  }

  private calculator(s: HTMLElement, id: string): void {
    const st = this.state;
    const form = el('div', 'hb-form', s);
    const amount = el('input', 'hb-num', form);
    amount.type = 'number';
    amount.min = '0';
    amount.step = 'any';
    amount.value = String(st.amount);
    amount.addEventListener('keydown', (e) => e.stopPropagation());
    amount.addEventListener('change', () => {
      st.amount = Math.max(0, Number(amount.value) || 0);
      this.save();
      this.render();
    });
    const mode = el('select', 'sig-select', form);
    for (const [v, t] of [['machines', 'Maschinen (oberster Schritt)'], ['sec', 'Stück je Sekunde'], ['min', 'Stück je Minute']] as const) {
      Object.assign(el('option', '', mode), { value: v, textContent: t, selected: st.mode === v });
    }
    mode.onchange = () => {
      st.mode = mode.value as Mode;
      this.save();
      this.render();
    };
    const choice = this.recipeChoice;
    const ideal = idealMultiple(id, st.m, choice);
    const practical = practicalMultiple(id, st.m, choice);
    if (ratePerMachine(id, st.m, choice) > 0) {
      const b = el('button', 'small-btn', form, ideal ? `Ideales Verhältnis (${ideal})` : `Handliches Verhältnis (${practical})`);
      b.title = ideal
        ? 'Kleinste Maschinenzahl, bei der jeder Herstellungsschritt voll ausgelastet ist (Öfen und Abbau ausgenommen)'
        : 'Kein ganz glattes Verhältnis bis 60 – diese Zahl lässt am wenigsten Maschinen halb leer laufen';
      b.onclick = () => {
        st.mode = 'machines';
        st.amount = ideal ?? practical;
        this.save();
        this.render();
      };
    }
    // Gebäudewahl
    const pickRow = el('div', 'hb-form', s);
    const seg = <K extends keyof MachineChoice>(key: K, opts: MachineChoice[K][]) => {
      const g = el('div', 'hb-seg', pickRow);
      for (const o of opts) {
        const b = el('button', st.m[key] === o ? 'on' : '', g);
        b.appendChild(this.host.icon(`item.${o}`, 'icon small'));
        b.title = nameOf(o);
        b.onclick = () => {
          st.m[key] = o;
          this.save();
          this.render();
        };
      }
    };
    seg('drill', ['burner-mining-drill', 'electric-mining-drill']);
    seg('furnace', (['stone-furnace', 'steel-furnace', 'electric-furnace'] as const).filter(isCraftable));
    seg('assembler', (['assembling-machine-1', 'assembling-machine-2', 'assembling-machine-3'] as const).filter(isCraftable));

    const per = ratePerMachine(id, st.m, choice);
    const rate = st.mode === 'sec' ? st.amount : st.mode === 'min' ? st.amount / 60 : st.amount * per;
    if (!(rate > 0)) {
      el('div', 'dim hb-note', s, 'Menge eingeben.');
      return;
    }
    const root = solve(id, rate, st.m, choice);
    const belts = beltRates();
    const beltTxt = isFluidId(id) ? '' : ` · ${num(rate / belts[0].rate)} gelbe Bänder`;
    el('div', 'hb-note', s, `Ergebnis: ${num(rate)}/s = ${num(rate * 60, 1)}/min${beltTxt}`);
    const tree = el('div', 'hb-tree', s);
    const row = (n: RatioNode, depth: number, path: string) => {
      const r = el('div', `hb-trow${n.raw ? ' raw' : ''}`, tree);
      r.style.paddingLeft = `${depth * 18 + 4}px`;
      const a = el('span', 'hb-tcell', r);
      const shut = this.collapsed.has(path);
      const tog = el('span', 'hb-tog', a, n.children.length ? (shut ? '▸' : '▾') : '');
      if (n.children.length) {
        tog.title = shut ? 'Zutaten zeigen' : 'Zutaten ausblenden';
        tog.onclick = () => {
          if (shut) this.collapsed.delete(path);
          else this.collapsed.add(path);
          const top = this.page.scrollTop;
          this.render();
          this.page.scrollTop = top;
        };
      }
      this.link(n.item, a);
      el('span', 'hb-rate', r, `${num(n.rate)}/s`);
      const m = el('span', 'hb-mach', r);
      if (n.machine && n.count > 0) {
        m.appendChild(this.host.icon(`item.${n.machine}`, 'icon small'));
        const whole = Math.ceil(n.count - 1e-6);
        el('b', '', m, `${whole} ×`);
        el('span', '', m, nameOf(n.machine));
        if (Math.abs(whole - n.count) > 1e-6) el('span', 'dim', m, ` (${num(n.count)})`);
        if (n.machine === 'pumpjack') el('span', 'dim', m, ' bei 100 %');
      } else if (n.raw) el('span', 'dim', m, n.item === 'wood' ? 'Bäume fällen' : 'Rohstoff');
      if (n.byproducts.length) {
        el('span', 'dim hb-by', r, `+ ${n.byproducts.map((b) => `${num(b.rate)}/s ${nameOf(b.item)}`).join(', ')}`);
      }
      if (!shut) n.children.forEach((c, i) => row(c, depth + 1, `${path}/${i}`));
    };
    row(root, 0, id);
    // Summen
    const t = totals(root);
    const sum = el('div', 'hb-sum', s);
    const ms = el('div', '', sum);
    el('div', 'hb-sec-title', ms, 'Gebäude gesamt');
    for (const [mid, c] of [...t.machines].sort((a, b) => b[1] - a[1])) {
      const line = el('div', 'hb-row', ms);
      line.appendChild(this.host.icon(`item.${mid}`, 'icon small'));
      el('b', '', line, `${Math.ceil(c - 1e-6)} ×`);
      el('span', '', line, `${nameOf(mid)}${Math.abs(Math.ceil(c - 1e-6) - c) > 1e-6 ? ` (${num(c)})` : ''}`);
    }
    const rs = el('div', '', sum);
    el('div', 'hb-sec-title', rs, 'Rohstoffe je Sekunde');
    for (const [rid, c] of [...t.raw].sort((a, b) => b[1] - a[1])) {
      const line = el('div', 'hb-row', rs);
      this.link(rid, line, num(c));
    }
    el('div', 'dim hb-note', s, 'Ohne Module und Produktivitätsboni. Bruchteile = Maschine läuft nur teilweise; aufgerundet steht vorn.');
  }

  showRules(): void {
    this.selected = null;
    this.save();
    this.buildList();
    const p = this.page;
    p.replaceChildren();
    const head = el('div', 'hb-head', p);
    el('div', 'hb-title', head, 'Faustregeln & Verhältnisse');
    el('div', 'dim hb-note', p,
      `Mit ${nameOf(this.state.m.drill)}, ${nameOf(this.state.m.furnace)} und ${nameOf(this.state.m.assembler)} gerechnet (wählbar im Rechner eines Produkts). `
      + 'Klick auf eine Regel öffnet das Produkt mit Rechner.');
    for (const r of ratioRules(this.state.m)) {
      const box = el('div', 'hb-rule', p);
      box.onclick = () => this.open(r.item);
      el('div', 'hb-rule-title', box, r.title);
      const line = el('div', 'hb-rule-line', box);
      r.parts.forEach((x, i) => {
        if (i) el('span', 'hb-colon', line, ':');
        const c = el('span', 'hb-part', line);
        c.title = `${nameOf(x.machine)} für ${nameOf(x.item)}`;
        el('b', '', c, num(x.count, 2));
        c.appendChild(this.host.icon(`item.${x.machine}`, 'icon small'));
        if (x.machine !== x.item && !x.item.endsWith('-ore') && x.item !== 'water' && x.item !== 'steam') {
          el('span', 'dim', c, '→');
          c.appendChild(this.host.icon(`item.${x.item}`, 'icon small'));
        }
      });
      el('div', 'dim hb-note', box, r.note);
    }
    // Maschinenleistung
    const box = el('div', 'hb-rule', p);
    el('div', 'hb-rule-title', box, 'Bänder');
    el('div', 'dim hb-note', box, beltRates().map((b) => `${nameOf(b.id)}: ${num(b.rate)}/s (${num(b.rate / 2)} je Spur)`).join(' · '));
    const mbox = el('div', 'hb-rule', p);
    el('div', 'hb-rule-title', mbox, 'Geschwindigkeiten');
    const sp = (id: string) => (ENTITIES[id] as { craftingSpeed?: number; miningSpeed?: number });
    el('div', 'dim hb-note', mbox, [
      ...['assembling-machine-1', 'assembling-machine-2', 'assembling-machine-3', 'stone-furnace', 'steel-furnace', 'electric-furnace'].filter(isCraftable)
        .map((id) => `${nameOf(id)} ${num(sp(id).craftingSpeed ?? 1)}`),
      ...['burner-mining-drill', 'electric-mining-drill'].map((id) => `${nameOf(id)} ${num(sp(id).miningSpeed ?? 0)} Erz/s`),
    ].join(' · ') + ' – Maschinen je Schritt = Menge/s × Zeit ÷ (Ergebnis × Geschwindigkeit).');
  }
}
