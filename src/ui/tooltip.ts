import { FLUIDS } from '../data/fluids';
import { ITEMS } from '../data/items';
import { AMMO, CAPSULES, MELEE, NOISE_BY_ENTITY } from '../data/enemies';
import { CONSUMABLES } from '../data/survival';
import { FLOOR_BY_ITEM } from '../data/floors';
import { entityDef } from '../data/entities';
import { TECHS } from '../data/tech';
import { MJ } from '../data/time';
import { RECIPE_LIST, type RecipeDef, craftingRecipeFor, smeltingRecipeFor } from '../data/recipes';

/** Ein gemeinsames Tooltip-Fenster für Slots und Rezepte (folgt der Maus). */
export class Tooltip {
  readonly el: HTMLDivElement;

  constructor(parent: HTMLElement, private readonly iconUrl: (name: string) => string) {
    this.el = document.createElement('div');
    this.el.className = 'tooltip';
    parent.appendChild(this.el);
    window.addEventListener('pointermove', (e) => {
      if (this.el.style.display !== 'block') return;
      const w = this.el.offsetWidth;
      const h = this.el.offsetHeight;
      const x = Math.min(window.innerWidth - w - 6, e.clientX + 16);
      const y = Math.min(window.innerHeight - h - 6, e.clientY + 16);
      this.el.style.transform = `translate(${x}px, ${y}px)`;
    });
  }

  /** Tooltip an ein Element hängen; build wird beim Überfahren aufgerufen (aktuelle Werte). */
  attach(target: HTMLElement, build: () => HTMLElement | null): void {
    target.addEventListener('pointerenter', () => {
      const c = build();
      if (!c) return;
      this.el.replaceChildren(c);
      this.el.style.display = 'block';
    });
    target.addEventListener('pointerleave', () => this.hide());
  }

  hide(): void {
    this.el.style.display = 'none';
  }

  private icon(item: string): HTMLImageElement {
    const img = document.createElement('img');
    img.className = 'icon';
    img.src = this.iconUrl(`item.${item}`);
    return img;
  }

  /** Inhalt für ein Item (Name, Stapel, Brennwert, Bau). */
  item(id: string, count?: number): HTMLElement {
    const def = ITEMS[id];
    const box = document.createElement('div');
    const head = document.createElement('div');
    head.className = 'tt-head';
    head.textContent = `${def?.name ?? id}${count ? ` (${count})` : ''}`;
    box.appendChild(head);
    const section = (title: string, lines: string[]) => {
      if (!lines.length) return;
      const sec = document.createElement('div');
      sec.className = 'tt-sec';
      const t = document.createElement('div');
      t.className = 'tt-sec-head';
      t.textContent = title;
      sec.appendChild(t);
      for (const l of lines) {
        const d = document.createElement('div');
        d.className = 'tt-line';
        d.textContent = l;
        sec.appendChild(d);
      }
      box.appendChild(sec);
    };
    const basic: string[] = [`Stapelgröße: ${def?.stackSize ?? 1}`];
    if (def?.fuelValue) basic.push(`Brennwert: ${(def.fuelValue / MJ).toFixed(1)} MJ`);
    const ammo = AMMO[id];
    if (ammo) basic.push(`Schaden: ${ammo.damage} je Schuss · ${ammo.rounds} Schuss je Magazin`);
    section('Gegenstand', basic);
    // Geschmolzene Items (Platten, Ziegel, Stahl) kann man nicht von Hand herstellen – wie im Original
    const smelt = craftingRecipeFor(id) ? undefined : smeltingRecipeFor(id);
    if (smelt) {
      const src = smelt.ingredients.map((g) => `${g.amount} × ${nameOf(g.item)}`).join(' + ');
      section('Herstellung', [`Im Ofen: ${src} → ${nameOf(id)}`, 'Nicht von Hand: Ofen bauen, Erz und Brennstoff einlegen']);
    }
    const floor = FLOOR_BY_ITEM[id];
    if (floor) {
      section('Bodenbelag', [`${floor.name}: Laufgeschwindigkeit ${Math.round(floor.speed * 100)} %`,
        'In der Hand: Klicken/Ziehen legt den Belag (+/− Pinselgröße), Rechtsklick nimmt ihn wieder auf']);
    }
    const cap = CAPSULES[id];
    if (cap) {
      section('Wurf', [`Reichweite ${cap.range}${cap.radius ? ` · Wirkradius ${String(cap.radius).replace('.', ',')}` : ''}`,
        cap.damage ? `Schaden ${cap.damage} (Explosion, sehr laut)` : id === 'noise-lure' ? 'Lärmt am Zielort und lockt Zombies dorthin' : 'Entfernt Klippen',
        'In der Hand: Klick wirft auf die Mausposition']);
    }
    const use = CONSUMABLES[id];
    if (use) {
      const ln: string[] = [];
      if (use.hunger) ln.push(`Hunger ${use.hunger > 0 ? '+' : ''}${use.hunger}`);
      if (use.thirst) ln.push(`Durst ${use.thirst > 0 ? '+' : ''}${use.thirst}`);
      if (use.heal) ln.push(`Heilt ${use.heal} Lebenspunkte`);
      if (use.bandage) ln.push(`Stoppt ${use.bandage === 1 ? 'eine Blutung' : `${use.bandage} Blutungen`}`);
      if (use.cure) ln.push('Heilt die Infektion nach einem Biss');
      if (use.rest) ln.push(`Macht wach (Ausdauer +${use.rest})`);
      ln.push('Benutzen: Rechtsklick im Inventar oder in die Hand nehmen und ins Freie klicken');
      section('Benutzen', ln);
    }
    const melee = MELEE[id];
    if (melee) {
      const ln = [`Schaden ${melee.damage} · ${(60 / melee.cooldown).toFixed(1).replace('.', ',')} Schläge/s · Reichweite ${String(melee.reach).replace('.', ',')}`,
        `Haltbarkeit: ${melee.durability} Schläge`, 'Leise – lockt kaum Zombies an (Leertaste halten)'];
      if (melee.chop) ln.push(`Bäume fällen ${melee.chop}× so schnell`);
      if (melee.dismantle) ln.push(`Wracks und Ruinen ausschlachten ${melee.dismantle}× so schnell`);
      section('Nahkampfwaffe', ln);
    }
    if (id === 'empty-bottle') section('Benutzen', ['Am Wasser füllen: in die Hand nehmen und auf ein Wasserfeld klicken', 'Oder in die Regentonne legen']);
    // Gebäudedaten (wie die Infobox im Original)
    if (def?.placeResult) {
      const e = entityDef(def.placeResult) as unknown as Record<string, unknown>;
      const ln: string[] = [`Größe: ${e.width}×${e.height}`, `Lebenspunkte: ${e.health}`];
      if (typeof e.craftingSpeed === 'number') ln.push(`Fertigungstempo: ${e.craftingSpeed}`);
      if (typeof e.miningSpeed === 'number') ln.push(`Abbautempo: ${e.miningSpeed}/s`);
      if (typeof e.miningAreaSize === 'number') ln.push(`Abbaufläche: ${e.miningAreaSize}×${e.miningAreaSize} Felder`);
      if (typeof e.energyUsage === 'number' && (e.energyUsage as number) > 0) ln.push(`Leistung: ${fmtW(e.energyUsage as number)}${e.energy === 'burner' ? ' (Brennstoff)' : ''}`);
      if (typeof e.speed === 'number' && (e.kind === 'belt' || e.kind === 'splitter' || e.kind === 'underground')) ln.push(`Durchsatz: ${(((e.speed as number) * 60) / 64 * 2).toFixed(1)} Items/s`);
      if (e.kind === 'pole') {
        const de = (n: number) => String(n).replace('.', ',');
        ln.push(`Kabellänge: bis ${de(e.wireReach as number)} Felder (Mitte zu Mitte)`);
        ln.push(`Versorgungsbereich: ${de((e.supplyRadius as number) * 2)}×${de((e.supplyRadius as number) * 2)} Felder`);
      }
      if (typeof e.slots === 'number') ln.push(`Plätze: ${e.slots}`);
      if (typeof e.moduleSlots === 'number' && e.moduleSlots) ln.push(`Modulplätze: ${e.moduleSlots}`);
      const noise = NOISE_BY_ENTITY[def.placeResult];
      ln.push(noise ? `Lärm im Betrieb: lockt Zombies aus ${noise} Feldern an` : 'Leise: lockt keine Zombies an');
      section('Gebäude', ln);
    }
    // Verwendung: in welchen Rezepten es vorkommt (wie „Zutat für“)
    const uses = RECIPE_LIST.filter((r) => r.ingredients.some((g) => g.item === id)).map((r) => nameOf(r.results[0].item));
    if (uses.length) section('Zutat für', [uses.slice(0, 6).join(', ') + (uses.length > 6 ? ` … (+${uses.length - 6})` : '')]);
    const tech = TECHS.find((t) => t.unlocks.includes(id));
    if (tech) section('Freigeschaltet durch', [tech.name]);
    return box;
  }


  /**
   * Inhalt für ein Rezept: Ergebnis, Rezeptbaum (Zutaten und deren Zwischenprodukte, rekursiv) mit Vorrat,
   * Zeit, Summe der Grundmaterialien und optional die herstellbare Menge.
   * have: Vorrat des Spielers (fehlende Mengen rot), undefined ohne Spieler.
   */
  recipe(r: RecipeDef, speed = 1, craftable?: number, have?: (item: string) => number): HTMLElement {
    const box = document.createElement('div');
    box.className = 'tt-recipe';
    const res = r.results[0];
    const head = document.createElement('div');
    head.className = 'tt-head';
    head.textContent = `${nameOf(res.item)}${res.amount > 1 ? ` ×${res.amount}` : ''}`;
    box.appendChild(head);
    const tree = document.createElement('div');
    tree.className = 'tt-tree';
    for (const g of r.ingredients) this.treeRow(tree, g.item, g.amount, 0, have);
    box.appendChild(tree);
    // Summe der Grundmaterialien (Items ohne Handwerksrezept, z. B. Platten)
    const totals = new Map<string, number>();
    for (const g of r.ingredients) expand(g.item, g.amount, totals, 0);
    const keys = [...totals.keys()];
    if (keys.length && !(keys.length === r.ingredients.length && r.ingredients.every((g) => totals.get(g.item) === g.amount))) {
      const t = document.createElement('div');
      t.className = 'tt-sub';
      t.textContent = 'Grundmaterial gesamt';
      box.appendChild(t);
      const row = document.createElement('div');
      row.className = 'tt-totals';
      for (const [item, n] of totals) {
        const cell = document.createElement('span');
        cell.className = 'tt-total' + (have && have(item) < n ? ' missing' : '');
        cell.appendChild(this.icon(item));
        cell.appendChild(document.createTextNode(`${n}`));
        cell.title = nameOf(item);
        row.appendChild(cell);
      }
      box.appendChild(row);
    }
    const time = document.createElement('div');
    time.className = 'tt-line';
    time.textContent = `Zeit: ${(r.time / speed).toLocaleString('de-DE', { maximumFractionDigits: 2 })} s`;
    box.appendChild(time);
    if (craftable !== undefined) {
      const c = document.createElement('div');
      c.className = 'tt-line dim';
      c.textContent = craftable > 0 ? `Herstellbar: ${craftable}` : 'Zutaten fehlen';
      box.appendChild(c);
    }
    return box;
  }

  private treeRow(parent: HTMLElement, item: string, amount: number, depth: number, have?: (item: string) => number): void {
    const row = document.createElement('div');
    row.className = 'tt-ing';
    row.style.paddingLeft = `${depth * 14}px`;
    if (depth > 0) {
      const branch = document.createElement('span');
      branch.className = 'tt-branch';
      branch.textContent = '└';
      row.appendChild(branch);
    }
    row.appendChild(this.icon(item));
    const t = document.createElement('span');
    const stock = have ? have(item) : undefined;
    t.textContent = `${fmt(amount)} × ${nameOf(item)}`;
    row.appendChild(t);
    if (stock !== undefined) {
      const st = document.createElement('span');
      st.className = 'tt-stock' + (stock < amount ? ' missing' : '');
      st.textContent = `(${stock})`;
      row.appendChild(st);
    }
    const sub = craftingRecipeFor(item);
    const smelt = sub ? undefined : smeltingRecipeFor(item);
    if (smelt) {
      const tag = document.createElement('span');
      tag.className = 'tt-tag';
      tag.textContent = 'Ofen';
      row.appendChild(tag);
    }
    parent.appendChild(row);
    // Zwischenprodukte aufklappen, solange der Vorrat nicht reicht (oder ohne Spieler immer)
    if (sub && depth < 3 && (stock === undefined || stock < amount)) {
      const out = sub.results.find((x) => x.item === item)!.amount;
      const crafts = Math.ceil((amount - (stock ?? 0)) / out);
      for (const g of sub.ingredients) this.treeRow(parent, g.item, g.amount * crafts, depth + 1, have);
    }
  }
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toLocaleString('de-DE', { maximumFractionDigits: 1 });
}

/** Zerlegt ein Item bis zu Items ohne Handwerksrezept und summiert die Mengen. */
function expand(item: string, amount: number, out: Map<string, number>, depth: number): void {
  const r = craftingRecipeFor(item);
  if (!r || depth > 6) {
    out.set(item, (out.get(item) ?? 0) + amount);
    return;
  }
  const n = r.results.find((x) => x.item === item)!.amount;
  const crafts = Math.ceil(amount / n);
  for (const g of r.ingredients) expand(g.item, g.amount * crafts, out, depth + 1);
}

/** Anzeigename eines Items oder einer Flüssigkeit. */
export function nameOf(id: string): string {
  return ITEMS[id]?.name ?? FLUIDS[id]?.name ?? id;
}

function fmtW(w: number): string {
  return w >= 1e6 ? `${(w / 1e6).toFixed(1)} MW` : `${Math.round(w / 1e3)} kW`;
}
