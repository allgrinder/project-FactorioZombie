import { ENTITIES } from '../data/entities';
import { FLUIDS } from '../data/fluids';
import { ITEMS } from '../data/items';
import { RECIPE_LIST, RECIPES, type RecipeDef } from '../data/recipes';
import { RESOURCES } from '../data/resources';

/**
 * Verhältnis-Rechner für das Handbuch: Für ein Produkt und eine Zielmenge je Sekunde wird der Produktionsbaum
 * bis zu den Rohstoffen aufgelöst (Maschinenzahl = Menge × Rezeptzeit / (Ergebnis × Geschwindigkeit)).
 * Alle Werte kommen aus `src/data/`; ohne Module, Forschungsboni und Produktivität.
 */

export type MachineChoice = {
  /** Montagemaschine für Handwerksrezepte. */
  assembler: 'assembling-machine-1' | 'assembling-machine-2' | 'assembling-machine-3';
  furnace: 'stone-furnace' | 'steel-furnace' | 'electric-furnace';
  drill: 'burner-mining-drill' | 'electric-mining-drill';
};

export const DEFAULT_MACHINES: MachineChoice = { assembler: 'assembling-machine-1', furnace: 'stone-furnace', drill: 'electric-mining-drill' };

export interface RatioNode {
  item: string;
  /** Menge je Sekunde. */
  rate: number;
  recipe?: RecipeDef;
  /** Gebäude, das herstellt bzw. abbaut (fehlt: von Hand/Rohstoff ohne Gebäude). */
  machine?: string;
  /** Benötigte Gebäude (Bruchteil). */
  count: number;
  children: RatioNode[];
  /** Nebenprodukte dieses Schritts (je Sekunde). */
  byproducts: { item: string; rate: number }[];
  /** Rohstoff (kein Rezept). */
  raw: boolean;
  /** Kreis im Baum (z. B. Kovarex): hier abgebrochen. */
  cycle?: boolean;
}

/** Ohne Rezept zu Rohstoffen (Barrel-Entleeren u. Ä. gilt nicht als Herstellung). */
const SKIP = (r: RecipeDef) => (r.id.startsWith('empty-') && r.id.endsWith('-barrel') && r.id !== 'empty-barrel') || r.id === 'kovarex-enrichment-process' || r.id === 'nuclear-fuel-reprocessing';

/** Bevorzugtes Rezept, wenn mehrere ein Produkt herstellen (wie ein Einsteiger es zuerst baut). */
const PREFERRED: Record<string, string> = {
  'petroleum-gas': 'basic-oil-processing',
  'heavy-oil': 'advanced-oil-processing',
  'light-oil': 'advanced-oil-processing',
  'solid-fuel': 'solid-fuel-from-light-oil',
  'uranium-235': 'uranium-processing',
  'uranium-238': 'uranium-processing',
};

/** Alle Rezepte, die ein Produkt herstellen (bevorzugtes zuerst). */
export function recipesFor(item: string): RecipeDef[] {
  const list = RECIPE_LIST.filter((r) => !SKIP(r) && r.results.some((x) => x.item === item));
  const pref = PREFERRED[item] ?? item;
  return list.sort((a, b) => (b.id === pref ? 1 : 0) - (a.id === pref ? 1 : 0));
}

/** Rezepte, in denen ein Produkt Zutat ist. */
export function usesOf(item: string): RecipeDef[] {
  return RECIPE_LIST.filter((r) => r.ingredients.some((x) => x.item === item));
}

/** Menge eines Ergebnisses je Durchlauf (mit Wahrscheinlichkeit). */
export function yieldOf(r: RecipeDef, item: string): number {
  return r.results.filter((x) => x.item === item).reduce((s, x) => s + x.amount * (x.probability ?? 1), 0);
}

/** Gebäude für ein Rezept und dessen Geschwindigkeit. */
export function machineFor(r: RecipeDef, m: MachineChoice): { machine: string; speed: number } {
  const id = (() => {
    switch (r.category) {
      case 'smelting': return m.furnace;
      case 'oil-processing': return 'oil-refinery';
      case 'chemistry': return 'chemical-plant';
      case 'centrifuging': return 'centrifuge';
      case 'rocket-building': return 'rocket-silo';
      case 'crafting-with-fluid': return m.assembler === 'assembling-machine-1' ? 'assembling-machine-2' : m.assembler;
      default: return m.assembler;
    }
  })();
  return { machine: id, speed: (ENTITIES[id] as { craftingSpeed?: number }).craftingSpeed ?? 1 };
}

/** Abbau bzw. Förderung eines Rohstoffs: Gebäude und Menge je Sekunde und Gebäude. */
export function rawSource(item: string, m: MachineChoice): { machine: string; perMachine: number; note?: string } | null {
  if (item === 'water') return { machine: 'offshore-pump', perMachine: (ENTITIES['offshore-pump'] as { pumpingSpeed: number }).pumpingSpeed * 60 };
  const res = RESOURCES.find((r) => r.result === item);
  if (!res) return null;
  if (res.fluid) {
    // Pumpjack: 10 Einheiten je Zyklus bei 100 % Ergiebigkeit (src/sim/entities/fluidplus.ts)
    const ms = (ENTITIES.pumpjack as { miningSpeed: number }).miningSpeed;
    return { machine: 'pumpjack', perMachine: 10 * ms, note: 'bei 100 % Ergiebigkeit' };
  }
  const drill = res.requiresFluid ? 'electric-mining-drill' : m.drill;
  const ms = (ENTITIES[drill] as { miningSpeed: number }).miningSpeed;
  return { machine: drill, perMachine: ms / res.miningTime };
}

/** Produktionsbaum für `rate` Einheiten je Sekunde. `choice` legt je Produkt ein anderes Rezept fest. */
export function solve(item: string, rate: number, m: MachineChoice = DEFAULT_MACHINES, choice: Record<string, string> = {}, path: string[] = []): RatioNode {
  const pick = choice[item] && RECIPES[choice[item]] ? RECIPES[choice[item]] : recipesFor(item)[0];
  if (!pick || path.includes(item) || path.length > 14) {
    const src = rawSource(item, m);
    return { item, rate, machine: src?.machine, count: src ? rate / src.perMachine : 0, children: [], byproducts: [], raw: true, cycle: !!pick };
  }
  const { machine, speed } = machineFor(pick, m);
  const runs = rate / yieldOf(pick, item); // Durchläufe je Sekunde
  const count = (runs * pick.time) / speed;
  const children = pick.ingredients.map((x) => solve(x.item, x.amount * runs, m, choice, [...path, item]));
  const byproducts = pick.results.filter((x) => x.item !== item).map((x) => ({ item: x.item, rate: yieldOf(pick, x.item) * runs }));
  return { item, rate, recipe: pick, machine, count, children, byproducts, raw: false };
}

/** Summen über den Baum: Gebäude je Art und Rohstoffe je Sekunde. */
export function totals(root: RatioNode): { machines: Map<string, number>; raw: Map<string, number> } {
  const machines = new Map<string, number>();
  const raw = new Map<string, number>();
  const walk = (n: RatioNode) => {
    if (n.machine) machines.set(n.machine, (machines.get(n.machine) ?? 0) + n.count);
    if (n.raw) raw.set(n.item, (raw.get(n.item) ?? 0) + n.rate);
    n.children.forEach(walk);
  };
  walk(root);
  return { machines, raw };
}

/** Herstellungsmenge je Sekunde einer Maschine des obersten Rezepts. */
export function ratePerMachine(item: string, m: MachineChoice = DEFAULT_MACHINES, choice: Record<string, string> = {}): number {
  const n = solve(item, 1, m, choice);
  return n.count > 0 ? 1 / n.count : 0;
}

/** Schritte, die für das ideale Verhältnis zählen: alles außer Rohstoffen und Öfen (Platten kommen vom Band). */
function countsOf(root: RatioNode): number[] {
  const out: number[] = [];
  const walk = (n: RatioNode) => {
    if (!n.raw && n.machine && n.recipe?.category !== 'smelting') out.push(n.count);
    n.children.forEach(walk);
  };
  walk(root);
  return out;
}

/**
 * Kleinste Zahl an Maschinen des obersten Schritts (1…max), bei der alle Herstellungsschritte (ohne Öfen und
 * Abbau) ganze Maschinenzahlen haben – das „ideale Verhältnis“. Nicht auffindbar: null.
 */
export function idealMultiple(item: string, m: MachineChoice = DEFAULT_MACHINES, choice: Record<string, string> = {}, max = 60): number | null {
  const per = ratePerMachine(item, m, choice);
  if (!per) return null;
  const counts = countsOf(solve(item, per, m, choice));
  for (let k = 1; k <= max; k++) {
    if (counts.every((c) => Math.abs(c * k - Math.round(c * k)) < 1e-6)) return k;
  }
  return null;
}

/**
 * Handliches Vielfaches (1…24) des obersten Schritts: das ideale, sonst das mit dem geringsten Leerlauf
 * (aufgerundete Maschinen je Maschine des obersten Schritts).
 */
export function practicalMultiple(item: string, m: MachineChoice = DEFAULT_MACHINES, choice: Record<string, string> = {}): number {
  const ideal = idealMultiple(item, m, choice, 24);
  if (ideal) return ideal;
  const per = ratePerMachine(item, m, choice);
  if (!per) return 1;
  const counts = countsOf(solve(item, per, m, choice));
  let best = 1;
  let bestWaste = Infinity;
  for (let k = 1; k <= 24; k++) {
    const waste = counts.reduce((s, c) => s + Math.ceil(c * k - 1e-6) - c * k, 0) / k;
    if (waste < bestWaste - 1e-6) {
      best = k;
      bestWaste = waste;
    }
  }
  return best;
}

/** Durchsatz der Bänder (Einheiten je Sekunde, beide Spuren): 60 Ticks × Geschwindigkeit / Abstand × 2 Spuren. */
export function beltRates(): { id: string; rate: number }[] {
  return ['transport-belt', 'fast-transport-belt', 'express-transport-belt']
    .filter((id) => ENTITIES[id])
    .map((id) => ({ id, rate: ((ENTITIES[id] as { speed: number }).speed * 60 * 2) / 64 }));
}

/** Klassische Faustregeln: je Eintrag die Maschinenzahlen (ganzzahlig) einer Kette. */
export interface RatioRule {
  title: string;
  /** Hauptprodukt (zum Öffnen im Handbuch). */
  item: string;
  parts: { count: number; machine: string; item: string }[];
  note: string;
}

/** Ganzzahliges Verhältnis zweier Raten (Erzeuger je Stück a, Verbraucher je Stück b). */
export function intRatio(producerRate: number, consumerRate: number, max = 40): [number, number] {
  // p · producerRate = c · consumerRate
  for (let c = 1; c <= max; c++) {
    const p = (c * consumerRate) / producerRate;
    if (Math.abs(p - Math.round(p)) < 1e-6 && Math.round(p) > 0) return [Math.round(p), c];
  }
  const c = 1;
  return [Math.round(((c * consumerRate) / producerRate) * 10) / 10, c];
}

const fmt = (x: number) => (Math.round(x * 100) / 100).toLocaleString('de-DE');

export function ratioRules(m: MachineChoice = DEFAULT_MACHINES): RatioRule[] {
  const rules: RatioRule[] = [];
  const drillRate = rawSource('iron-ore', m)!.perMachine;
  const plateRate = ratePerMachine('iron-plate', m);
  {
    const [d, f] = intRatio(drillRate, plateRate);
    rules.push({
      title: 'Bohrer → Öfen', item: 'iron-plate', parts: [{ count: d, machine: m.drill, item: 'iron-ore' }, { count: f, machine: m.furnace, item: 'iron-plate' }],
      note: `Ein Bohrer liefert ${fmt(drillRate)} Erz/s, ein Ofen schmilzt ${fmt(plateRate)} Platten/s (gilt für Eisen und Kupfer).`,
    });
  }
  {
    const beltRate = beltRates()[0].rate;
    rules.push({
      title: 'Ein gelbes Band Platten', item: 'iron-plate',
      parts: [{ count: Math.ceil(beltRate / drillRate), machine: m.drill, item: 'iron-ore' }, { count: Math.ceil(beltRate / plateRate), machine: m.furnace, item: 'iron-plate' }],
      note: `Ein gelbes Band trägt ${fmt(beltRate)} Items/s (${fmt(beltRate / 2)} je Spur).`,
    });
  }
  const chain = (title: string, item: string, note: string) => {
    if (!recipesFor(item).length) return;
    const k = practicalMultiple(item, m);
    const root = solve(item, ratePerMachine(item, m) * k, m);
    const parts: RatioRule['parts'] = [];
    const walk = (n: RatioNode, top: boolean) => {
      if (n.raw || !n.machine) return;
      const cat = n.recipe?.category;
      // Platten kommen vom Band, Öl- und Chemieprodukte aus eigener Anlage
      if (cat === 'smelting' || (!top && (cat === 'oil-processing' || cat === 'chemistry'))) return;
      const ex = parts.find((p) => p.item === n.item);
      if (ex) ex.count += n.count;
      else parts.push({ count: n.count, machine: n.machine, item: n.item });
      n.children.forEach((c) => walk(c, false));
    };
    walk(root, true);
    for (const p of parts) p.count = Math.round(p.count * 1000) / 1000;
    rules.push({ title, item, parts: parts.reverse(), note: `${note}${note ? ' ' : ''}Ergibt ${fmt(root.rate)}/s.` });
  };
  chain('Kupferkabel → Schaltkreise', 'electronic-circuit', 'Klassiker: 3 Kabel-Maschinen versorgen 2 Schaltkreis-Maschinen.');
  chain('Rote Wissenschaft', 'automation-science-pack', 'Eine Zahnrad-Maschine reicht für viele Paket-Maschinen.');
  chain('Grüne Wissenschaft', 'logistic-science-pack', 'Bruchteile laufen nicht voll ausgelastet.');
  chain('Graue (Militär-)Wissenschaft', 'military-science-pack', '');
  {
    // Dampf: Kessel 1,8 MW → Dampf/s; Dampfmaschine verbraucht fluidPerTick × 60
    const boiler = ENTITIES.boiler as { energyUsage: number; steamPerWater: number };
    const engine = ENTITIES['steam-engine'] as { fluidPerTick: number; maxPower: number };
    const steam = FLUIDS.steam;
    const perBoiler = boiler.energyUsage / ((steam.defaultTemperature - FLUIDS.water.defaultTemperature) * steam.heatCapacity);
    const perEngine = engine.fluidPerTick * 60;
    const pump = rawSource('water', m)!.perMachine;
    const water = perBoiler / boiler.steamPerWater;
    // Standardblock wie im Original: 20 Kessel an einer Pumpe (Kohle für alle über ein Band)
    const boilers = 20;
    const engines = Math.round((boilers * perBoiler) / perEngine);
    rules.push({
      title: 'Dampfkraft (Standardblock, 36 MW)', item: 'steam-engine',
      parts: [{ count: 1, machine: 'offshore-pump', item: 'water' }, { count: boilers, machine: 'boiler', item: 'steam' }, { count: engines, machine: 'steam-engine', item: 'steam-engine' }],
      note: `1 Kessel (${fmt(perBoiler)} Dampf/s aus ${fmt(water)} Wasser/s) : ${fmt(perBoiler / perEngine)} Dampfmaschinen à ${fmt(engine.maxPower / 1e6)} MW. `
        + `Eine Uferpumpe (${fmt(pump)} Wasser/s) hat reichlich Reserve; ${boilers} Kessel brauchen ${fmt((boilers * boiler.energyUsage) / ITEMS.coal.fuelValue!)} Kohle/s = ein gelbes Band. Fertiger Bauplan unter B.`,
    });
  }
  {
    const panel = ENTITIES['solar-panel'] as { production: number };
    const acc = ENTITIES.accumulator as { buffer: number };
    rules.push({
      title: 'Solar mit Akkus', item: 'solar-panel',
      parts: [{ count: 25, machine: 'solar-panel', item: 'solar-panel' }, { count: 21, machine: 'accumulator', item: 'accumulator' }],
      note: `Panel ${fmt(panel.production / 1000)} kW Spitze, Akku ${fmt(acc.buffer / 1e6)} MJ: 25 : 21 trägt die Nacht (Wiki-Verhältnis 0,84).`,
    });
  }
  if (RECIPES['plastic-bar']) {
    const crude = rawSource('crude-oil', m)!.perMachine;
    const gas = ratePerMachine('petroleum-gas', m);
    const plastic = solve('plastic-bar', 1, m);
    const gasPerPlant = (plastic.children.find((c) => c.item === 'petroleum-gas')?.rate ?? 0) / plastic.count;
    const crudePerRef = solve('petroleum-gas', gas, m).children[0].rate;
    const [ref, plants] = intRatio(gas, gasPerPlant);
    rules.push({
      title: 'Öl → Plastik (Grundverarbeitung)', item: 'plastic-bar',
      parts: [
        { count: Math.round(((crudePerRef * ref) / crude) * 10) / 10, machine: 'pumpjack', item: 'crude-oil' },
        { count: ref, machine: 'oil-refinery', item: 'petroleum-gas' },
        { count: plants, machine: 'chemical-plant', item: 'plastic-bar' },
      ],
      note: `Raffinerie ${fmt(gas)} Erdgas/s, Chemiefabrik braucht ${fmt(gasPerPlant)} Erdgas/s (≈ ${fmt(gasPerPlant / gas)} Raffinerien je Chemiefabrik); `
        + `Pumpjack ${fmt(crude)} Rohöl/s bei 100 % Ergiebigkeit, Raffinerie braucht ${fmt(crudePerRef)} Rohöl/s.`,
    });
  }
  return rules;
}
