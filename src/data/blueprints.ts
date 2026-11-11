/**
 * Mitgelieferte Blaupausen-Vorlagen (eigene Anordnungen, Verhältnisse nach Wiki „Power production“:
 * 1 Kessel (1,8 MW) versorgt 2 Dampfmaschinen (je 900 kW)).
 */
import type { Blueprint, Settings } from '../sim/blueprint';
import { entityDef, sizeOf } from './entities';
import { isCraftable } from './recipes';

export interface BlueprintPreset {
  readonly name: string;
  readonly hint: string;
  readonly bp: Blueprint;
}

/**
 * Dampfkraft, Wasser im Norden (R dreht): Uferpumpe → Rohr → Kessel (Feuerung oben, Dampf nach unten)
 * → 2 Dampfmaschinen hintereinander → Strommast an der Seite. Kessel braucht Brennstoff (Kohle oder Holz).
 */
export const STEAM_POWER: Blueprint = {
  w: 5,
  h: 14,
  entities: [
    { name: 'offshore-pump', dx: 0, dy: 0, dir: 2 },
    { name: 'pipe', dx: 0, dy: 2, dir: 0 },
    { name: 'boiler', dx: 1, dy: 2, dir: 2 },
    { name: 'steam-engine', dx: 1, dy: 4, dir: 0 },
    { name: 'steam-engine', dx: 1, dy: 9, dir: 0 },
    { name: 'small-electric-pole', dx: 4, dy: 8, dir: 0 },
  ],
};

type Dir4 = 0 | 1 | 2 | 3;
interface Part { name: string; x: number; y: number; dir?: Dir4; settings?: Settings }

/** Teile (beliebige Koordinaten) zu einer Blaupause mit Ursprung links oben. */
function make(parts: Part[]): Blueprint {
  const minX = Math.min(...parts.map((p) => p.x));
  const minY = Math.min(...parts.map((p) => p.y));
  let w = 0;
  let h = 0;
  const entities = parts.map((p) => {
    const dir = (p.dir ?? 0) as Dir4;
    const [sw, sh] = sizeOf(entityDef(p.name), dir);
    w = Math.max(w, p.x - minX + sw);
    h = Math.max(h, p.y - minY + sh);
    return { name: p.name, dx: p.x - minX, dy: p.y - minY, dir, ...(p.settings ? { settings: p.settings } : {}) };
  });
  return { w, h, entities };
}

/**
 * Ofenreihe für ein volles gelbes Band (15 Platten/s): 2 × n Öfen links und rechts des Ausgabebands (Mitte),
 * außen je ein Eingabeband (eine Spur Erz, eine Spur Kohle), Strom über kleine Masten in den Greifarm-Spalten.
 * Steinofen 0,3125 Platten/s → 48 Öfen; Stahlofen 0,625/s → 24 Öfen.
 */
export function smelterColumn(furnace: string, n: number): Blueprint {
  const parts: Part[] = [];
  for (let k = 0; k < n; k++) {
    const y = 1 + 2 * k;
    parts.push({ name: furnace, x: 2, y }, { name: furnace, x: 7, y });
    parts.push({ name: 'inserter', x: 1, y, dir: 1 }, { name: 'inserter', x: 4, y, dir: 1 });
    parts.push({ name: 'inserter', x: 6, y, dir: 3 }, { name: 'inserter', x: 9, y, dir: 3 });
    if (k % 3 === 0) parts.push({ name: 'small-electric-pole', x: 1, y: y + 1 }, { name: 'small-electric-pole', x: 9, y: y + 1 });
  }
  parts.push({ name: 'small-electric-pole', x: 3, y: 0 }, { name: 'small-electric-pole', x: 7, y: 0 });
  for (let y = 0; y <= 2 * n; y++) parts.push({ name: 'transport-belt', x: 5, y, dir: 0 });
  for (let y = 1; y <= 2 * n + 1; y++) parts.push({ name: 'transport-belt', x: 0, y, dir: 0 }, { name: 'transport-belt', x: 10, y, dir: 0 });
  return make(parts);
}

/**
 * Bohrerfeld für ein volles gelbes Band: 2 × n elektrische Bohrer (je 0,5 Erz/s) beidseits eines Bands nach Norden,
 * Masten außen (je einer für zwei Bohrer). 30 Bohrer = 15 Erz/s, jede Seite füllt eine Spur.
 */
export function drillField(n: number): Blueprint {
  const parts: Part[] = [];
  for (let i = 0; i < n; i++) {
    parts.push({ name: 'electric-mining-drill', x: 0, y: 3 * i, dir: 1 }, { name: 'electric-mining-drill', x: 4, y: 3 * i, dir: 3 });
  }
  for (let y = 1; y < 3 * n; y += 6) parts.push({ name: 'small-electric-pole', x: -1, y }, { name: 'small-electric-pole', x: 7, y });
  parts.push({ name: 'small-electric-pole', x: 1, y: -1 }, { name: 'small-electric-pole', x: 5, y: -1 });
  for (let y = -1; y < 3 * n; y++) parts.push({ name: 'transport-belt', x: 3, y, dir: 0 });
  return make(parts);
}

/**
 * Dampfkraft-Kachel (Wiki „Power production“): 1 Uferpumpe : n Kessel : 2n Dampfmaschinen (1 Kessel 1,8 MW
 * = 2 Maschinen à 900 kW). Wasser läuft durch die Kesselreihe, Kohle kommt über das Band unten, Brennstoff-Greifarme
 * nehmen sich ihren Brennstoff selbst vom Band (kein Strom zum Anfahren nötig).
 */
export function steamBlock(n: number): Blueprint {
  const parts: Part[] = [{ name: 'offshore-pump', x: -2, y: 1, dir: 1 }];
  for (let i = 0; i < n; i++) {
    const x = 4 * i;
    parts.push({ name: 'boiler', x, y: 0, dir: 0 });
    parts.push({ name: 'steam-engine', x, y: -5, dir: 0 }, { name: 'steam-engine', x, y: -10, dir: 0 });
    parts.push({ name: 'burner-inserter', x: x + 1, y: 2, dir: 0 });
    if (i < n - 1) parts.push({ name: 'pipe', x: x + 3, y: 1 });
    parts.push({ name: 'small-electric-pole', x: x + 3, y: -5 });
  }
  for (let x = 0; x <= 4 * n - 1; x++) parts.push({ name: 'transport-belt', x, y: 3, dir: 3 });
  return make(parts);
}

/**
 * Dampfkraft-Standardblock 1 Uferpumpe : 2n Kessel : 4n Dampfmaschinen als Doppelreihe: oben n Kessel (Dampf nach
 * Norden), unten n gespiegelte Kessel (Dampf nach Süden), dazwischen ein gemeinsames Kohleband (läuft nach Westen,
 * rechts einspeisen). Brennstoff-Greifarme von beiden Seiten, die Uferpumpe speist beide Reihen über eine Rohrsäule
 * links. Kleine Masten zwischen den Dampfmaschinen; zwei Masten neben dem Band verbinden beide Reihen zu einem Netz.
 * n = 10: 20 Kessel × 1,8 MW = 36 MW, 20 × 0,45 Kohle/s = 9 Kohle/s (ein gelbes Band reicht).
 */
export function steamBlockDouble(n: number): Blueprint {
  const parts: Part[] = [{ name: 'offshore-pump', x: -3, y: 3, dir: 1 }];
  for (let y = 1; y <= 5; y++) parts.push({ name: 'pipe', x: -1, y });
  for (let i = 0; i < n; i++) {
    const x = 4 * i;
    // obere Reihe
    parts.push({ name: 'boiler', x, y: 0, dir: 0 });
    parts.push({ name: 'steam-engine', x, y: -5, dir: 0 }, { name: 'steam-engine', x, y: -10, dir: 0 });
    parts.push({ name: 'burner-inserter', x: x + 1, y: 2, dir: 0 });
    // untere Reihe (gespiegelt)
    parts.push({ name: 'boiler', x, y: 5, dir: 2 });
    parts.push({ name: 'steam-engine', x, y: 7, dir: 0 }, { name: 'steam-engine', x, y: 12, dir: 0 });
    parts.push({ name: 'burner-inserter', x: x + 1, y: 4, dir: 2 });
    if (i < n - 1) parts.push({ name: 'pipe', x: x + 3, y: 1 }, { name: 'pipe', x: x + 3, y: 5 });
    parts.push({ name: 'small-electric-pole', x: x + 3, y: -5 }, { name: 'small-electric-pole', x: x + 3, y: 10 });
  }
  // Verbindung der beiden Reihen (Kabelreichweite 7,5)
  parts.push({ name: 'small-electric-pole', x: 3, y: 2 }, { name: 'small-electric-pole', x: 3, y: 4 });
  for (let x = 0; x <= 4 * n - 1; x++) parts.push({ name: 'transport-belt', x, y: 3, dir: 3 });
  return make(parts);
}

/**
 * Solarkachel 18 × 18 (Verhältnis 25 Solarpanele : 21 Akkus, Wiki „Solar panel“: 0,84 Akkus je Panel für
 * Dauerleistung) mit Umspannwerk in der Mitte; Kacheln lassen sich lückenlos aneinandersetzen.
 */
export function solarTile(): Blueprint {
  const parts: Part[] = [];
  for (const y of [0, 3, 12, 15]) for (let x = 0; x < 18; x += 3) parts.push({ name: 'solar-panel', x, y });
  parts.push({ name: 'solar-panel', x: 0, y: 6 });
  let acc = 0;
  const add = (x: number, y: number) => {
    if (acc < 21) parts.push({ name: 'accumulator', x, y });
    acc++;
  };
  for (let x = 4; x < 18; x += 2) add(x, 6);
  for (let x = 4; x < 18; x += 2) if (x !== 8) add(x, 8);
  for (let x = 0; x < 18; x += 2) add(x, 10);
  parts.push({ name: 'substation', x: 8, y: 8 });
  return make(parts);
}

/**
 * Mall für Grundteile (Montagemaschine 2): zwei Bänder in der Mitte – A: Eisenplatten | Zahnräder,
 * B: Schaltkreise | (frei). Oben: Untergrundband ← Band → Splitter, Rohr → Rohr unterirdisch (direkt verkettet);
 * unten: Greifarm → langer Greifarm, Bohrer, Montagemaschine 1, Eisenkiste. Jede Maschine füllt eine Kiste,
 * die auf einen Stapel begrenzt ist (sonst verbrauchen die ersten Maschinen alles Eisen, wie bei Malls üblich).
 */
export function mall(): Blueprint {
  const parts: Part[] = [];
  const am = (x: number, y: number, recipe: string) => parts.push({ name: 'assembling-machine-2', x, y, settings: { recipe } });
  const top = ['underground-belt', 'transport-belt', 'splitter', 'pipe', 'pipe-to-ground'];
  const bottom = ['inserter', 'long-handed-inserter', 'electric-mining-drill', 'assembling-machine-1', 'iron-chest'];
  top.forEach((r, i) => {
    const x = 4 * i;
    am(x, 0, r);
    if (r === 'transport-belt') {
      // Bänder sind Zwischenprodukt für Untergrundband und Splitter: zwei schnelle Greifarme von Band A (3 Bänder/s)
      parts.push({ name: 'fast-inserter', x, y: 3, dir: 0 }, { name: 'fast-inserter', x: x + 2, y: 3, dir: 0 });
    } else parts.push({ name: 'inserter', x, y: 3, dir: 0 }, { name: 'long-handed-inserter', x: x + 2, y: 3, dir: 0 });
    parts.push({ name: 'inserter', x: x + 1, y: -1, dir: 0 }, { name: 'iron-chest', x: x + 1, y: -2, settings: { bar: 1 } });
  });
  bottom.forEach((r, i) => {
    const x = 4 * i;
    am(x, 7, r);
    parts.push({ name: 'inserter', x, y: 6, dir: 2 }, { name: 'long-handed-inserter', x: x + 2, y: 6, dir: 2 });
    parts.push({ name: 'inserter', x: x + 1, y: 10, dir: 2 }, { name: 'iron-chest', x: x + 1, y: 11, settings: { bar: 1 } });
  });
  // direkte Verkettung: Band → Untergrundband und Splitter, Rohr → Rohr unterirdisch, Greifarm → langer Greifarm
  parts.push({ name: 'fast-inserter', x: 3, y: 1, dir: 3 }, { name: 'fast-inserter', x: 7, y: 1, dir: 1 }, { name: 'fast-inserter', x: 15, y: 1, dir: 1 });
  parts.push({ name: 'inserter', x: 3, y: 8, dir: 1 });
  for (let x = -1; x <= 19; x++) parts.push({ name: 'transport-belt', x, y: 4, dir: 1 }, { name: 'transport-belt', x, y: 5, dir: 1 });
  for (const x of [3, 7, 11, 15, 19]) parts.push({ name: 'small-electric-pole', x, y: -1 }, { name: 'small-electric-pole', x, y: 10 });
  for (const x of [3, 11, 19]) parts.push({ name: 'small-electric-pole', x, y: 3 }, { name: 'small-electric-pole', x, y: 6 });
  return make(parts);
}

/**
 * Plastik aus Rohöl: Lagertank → 2 Raffinerien (Grundverarbeitung, je 100 Rohöl → 45 Erdgas in 5 s) → 1 Chemiefabrik
 * (20 Erdgas + 1 Kohle → 2 Plastik in 1 s). 18 Erdgas/s für 20 benötigte: die Chemiefabrik läuft zu 90 %.
 * Rohöl unten rechts am Tank anschließen (40 Rohöl/s = 4 Pumpjacks bei 100 % Ergiebigkeit).
 */
export function plasticBlock(): Blueprint {
  const parts: Part[] = [];
  parts.push({ name: 'oil-refinery', x: 0, y: 0, dir: 0, settings: { recipe: 'basic-oil-processing' } });
  parts.push({ name: 'oil-refinery', x: 6, y: 0, dir: 0, settings: { recipe: 'basic-oil-processing' } });
  parts.push({ name: 'storage-tank', x: 5, y: 7, dir: 0 });
  // Rohöl (wie im Original unten rechts an der Raffinerie): Tank → Leitung unter den Raffinerien
  parts.push({ name: 'pipe', x: 3, y: 5 }, { name: 'pipe', x: 9, y: 5 });
  for (let x = 3; x <= 9; x++) parts.push({ name: 'pipe', x, y: 6 });
  // Erdgas (oben rechts) → Leitung oben → Chemiefabrik
  parts.push({ name: 'pipe', x: 4, y: -1 }, { name: 'pipe', x: 10, y: -1 });
  for (let x = 4; x <= 10; x++) parts.push({ name: 'pipe', x, y: -2 });
  parts.push({ name: 'chemical-plant', x: 6, y: -5, dir: 0, settings: { recipe: 'plastic-bar' } });
  // schnelle Greifarme: die Chemiefabrik braucht 0,9 Kohle/s und gibt 1,8 Plastik/s aus
  parts.push({ name: 'fast-inserter', x: 5, y: -5, dir: 1 }, { name: 'iron-chest', x: 4, y: -5 });
  parts.push({ name: 'fast-inserter', x: 7, y: -6, dir: 0 }, { name: 'iron-chest', x: 7, y: -7 });
  parts.push({ name: 'small-electric-pole', x: 5, y: -3 }, { name: 'small-electric-pole', x: 5, y: 1 });
  return make(parts);
}

const ALL_PRESETS: readonly BlueprintPreset[] = [
  {
    name: 'Dampfkraft 1:2 (1,8 MW)',
    hint: 'Uferpumpe ans Ufer (oberstes Feld auf Wasser, R dreht), dann Kohle oder Holz in den Kessel legen.',
    bp: STEAM_POWER,
  },
  {
    name: 'Dampfkraft 1:10:20 (18 MW)',
    hint: 'Uferpumpe links ans Ufer (linkes Feld auf Wasser), Kohle rechts aufs Band unten; Masten oben verbinden. Kacheln lassen sich mit eigener Pumpe nebeneinandersetzen.',
    bp: steamBlock(10),
  },
  {
    name: 'Dampfkraft 1:20:40 (36 MW, Doppelreihe)',
    hint: 'Uferpumpe links ans Ufer (linkes Feld auf Wasser). Kohle von rechts auf das mittlere Band (9 Kohle/s, ein gelbes Band reicht); '
      + 'die Brennstoff-Greifarme versorgen sich selbst. Strom an einem der Masten oben oder unten abnehmen.',
    bp: steamBlockDouble(10),
  },
  {
    name: 'Solarfeld 25:21 (≈1 MW Tag und Nacht)',
    hint: '25 Solarpanele, 21 Akkus und ein Umspannwerk; Kacheln lückenlos aneinandersetzen, die Umspannwerke verbinden sich.',
    bp: solarTile(),
  },
  {
    name: 'Bohrerfeld 30 = 1 Band (15 Erz/s)',
    hint: '2 × 15 elektrische Bohrer auf ein Erzfeld legen; das Band läuft oben hinaus. Strom an einen der oberen Masten.',
    bp: drillField(15),
  },
  {
    name: 'Ofenreihe 48 Steinöfen = 1 Band (15 Platten/s)',
    hint: 'Unten zwei Eingabebänder (je eine Spur Erz 7,5/s, eine Spur Kohle), oben in der Mitte kommen die Platten heraus. Strom an einen oberen Mast.',
    bp: smelterColumn('stone-furnace', 24),
  },
  {
    name: 'Ofenreihe 24 Stahlöfen = 1 Band (15 Platten/s)',
    hint: 'Wie die Steinofenreihe, aber halb so lang (Stahlofen doppelt so schnell).',
    bp: smelterColumn('steel-furnace', 12),
  },
  {
    name: 'Mall: Bänder, Greifarme, Rohre, Bohrer …',
    hint: 'Oberes Band: Eisenplatten | Zahnräder, unteres Band: Schaltkreise – beide von links einspeisen. Jede Maschine füllt ihre Kiste bis zu einem Stapel (Begrenzung in der Kiste änderbar).',
    bp: mall(),
  },
  {
    name: 'Plastik: Tank → 2 Raffinerien → Chemiefabrik',
    hint: 'Rohöl unten rechts am Tank anschließen (40/s = 4 Pumpjacks bei 100 %), Kohle in die linke Kiste, Plastik kommt in die obere Kiste.',
    bp: plasticBlock(),
  },
];

/** Nur Vorlagen, deren Gebäude es in diesem Spiel gibt (gestrichene Anlagen des Vorgängers fallen weg). */
export const PRESETS: readonly BlueprintPreset[] = ALL_PRESETS.filter((p) => p.bp.entities.every((e) => isCraftable(entityDef(e.name).item)));
