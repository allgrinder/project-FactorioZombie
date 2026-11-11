import { KJ } from './time';

/**
 * Gebäude-Prototypen. kind bestimmt das Verhalten in src/sim/.
 * Neue Gebäude: Eintrag hier + Item in items.ts + Rezept in recipes.ts.
 */
interface EntityBase {
  readonly id: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly health: number;
  /** Item, das beim Abbauen zurückgegeben wird. */
  readonly item: string;
  /** Abbauzeit für den Spieler in Sekunden (bei Abbaugeschwindigkeit 1). */
  readonly mineTime: number;
  /** Spieler kann nicht hindurchlaufen. */
  readonly solid: boolean;
  /**
   * Die Figur kann trotzdem hindurchlaufen (Wunsch 09.11.2026: kleine/mittlere Masten, Lampen); für Gegner und
   * Wegsuche bleibt es ein Hindernis.
   */
  readonly walkable?: boolean;
  readonly rotatable: boolean;
  /** Modulplätze (Wiki-Infobox „Modules“); fehlt = keine. */
  readonly moduleSlots?: number;
  /** Items je Gebäude (Gleisbogen: 4 Schienen); fehlt = 1. */
  readonly itemCount?: number;
}

export interface BeltDef extends EntityBase {
  readonly kind: 'belt';
  /** Positionen pro Tick (256 pro Feld). */
  readonly speed: number;
}

export interface UndergroundDef extends EntityBase {
  readonly kind: 'underground';
  readonly speed: number;
  /** Größter Abstand Eingang–Ausgang in Feldern. */
  readonly maxDistance: number;
}

export interface SplitterDef extends EntityBase {
  readonly kind: 'splitter';
  readonly speed: number;
}

/** Energieart: Brennstoff (Burner) oder Strom (elektrisches Netz). */
export type EnergyKind = 'burner' | 'electric';

export interface DrillDef extends EntityBase {
  readonly kind: 'drill';
  readonly energy: EnergyKind;
  readonly miningSpeed: number;
  /** Leistungsaufnahme in Watt. */
  readonly energyUsage: number;
  /** Abbaubereich (quadratisch, zentriert auf das Gebäude), in Feldern. */
  readonly miningAreaSize: number;
  /** Ausgabepunkt relativ zur Gebäudemitte bei Richtung Nord, in Feldern. */
  readonly outputVector: readonly [number, number];
  readonly fuelSlots: number;
  /** Flüssigkeitseingang (Schwefelsäure für Uranerz, Wiki „Electric mining drill“: links, rechts, hinten). */
  readonly fluidInput?: MachineFluidBox;
}

export interface FurnaceDef extends EntityBase {
  readonly kind: 'furnace';
  readonly craftingSpeed: number;
  readonly energyUsage: number;
  readonly fuelSlots: number;
  /** Standard: Brennstoff. */
  readonly energy?: EnergyKind;
  readonly drain?: number;
}

/** Pumpjack: fördert Rohöl aus dem Feld unter seiner Mitte (Wiki: 10 × Ergiebigkeit pro s). */
export interface PumpjackDef extends EntityBase {
  readonly kind: 'pumpjack';
  readonly energyUsage: number;
  readonly miningSpeed: number;
  readonly capacity: number;
}

export interface InserterDef extends EntityBase {
  readonly kind: 'inserter';
  readonly energy: EnergyKind;
  /** Grundlast im Netz (W), nur elektrisch. */
  readonly drain: number;
  /** Drehgeschwindigkeit in Umdrehungen pro Tick (Prototyp). */
  readonly rotationSpeed: number;
  /** Ticks je Halbdrehung, wie im Spiel gemessen (ganzzahlig, abgerundet; Wiki: Ticks je Zyklus / 2). */
  readonly halfTurnTicks: number;
  /** Energie pro vollständigem Transfer (hin und zurück) in Joule. */
  readonly energyPerTransfer: number;
  /** Startenergie im Brennstoffpuffer in Joule. */
  readonly initialEnergy: number;
  /** Aufnahme- und Ablagepunkt relativ zur Mitte bei Richtung Nord (Ablage nach Norden), in Feldern. */
  readonly pickupVector: readonly [number, number];
  readonly dropVector: readonly [number, number];
  readonly fuelSlots: number;
  /** Greifarm füllt Brennstoff in fremde Brennstoffslots nur bis zu dieser Anzahl. */
  readonly fuelInsertLimit: number;
  /** Massengreifarm: Grundkapazität 2 und eigener Forschungsbonus (Wiki „Inserter capacity bonus“). */
  readonly bulk?: boolean;
  /** Filterplätze (Wiki 2.0: schneller Greifarm und Massengreifarm haben einen Filtermodus mit 5 Plätzen). */
  readonly filterSlots?: number;
}

export interface ContainerDef extends EntityBase {
  readonly kind: 'container';
  readonly slots: number;
  /** Logistikkiste (Roboternetz). */
  readonly logistic?: 'passive-provider' | 'active-provider' | 'storage' | 'requester' | 'buffer';
  /** Landeplatz für Raketenfracht (Weltraum-Wissenschaft). */
  readonly cargoPad?: boolean;
}

/** Raketensilo 9×9: baut Raketenteile (Rezept fest), startet Raketen mit Satellit. Quelle: Wiki „Rocket silo“. */
export interface RocketSiloDef extends EntityBase {
  readonly kind: 'rocket-silo';
  readonly craftingSpeed: number;
  readonly energyUsage: number;
  /** Teile je Rakete (Grundspiel 100). */
  readonly partsPerRocket: number;
  /** Ticks je Start (Wiki-Tabelle, normale Qualität: 1632). */
  readonly launchTicks: number;
  /** Ticks bis die Fracht am Landeplatz ankommt (Wiki: etwa 29 s). */
  readonly deliveryTicks: number;
}

/** Kombinator: konstant (1×1, ohne Strom) oder rechnend/entscheidend (1×2, Eingang hinten, Ausgang vorn, 1 kW). */
export interface CombinatorDef extends EntityBase {
  readonly kind: 'combinator';
  readonly mode: 'constant' | 'arithmetic' | 'decider';
  readonly energyUsage: number;
}

/**
 * Gleis: gerade 2×2 (dir 0 senkrecht, 1 waagerecht), Bogen 4×4 (dir 0–3), Diagonalstück 2×2 (dir = abgeschnittene
 * Ecke, 0 = links oben, im Uhrzeigersinn) oder 45°-Übergang 2×4 (gerade → diagonal, auch gespiegelt).
 */
export interface RailDef extends EntityBase {
  readonly kind: 'rail';
  readonly shape: 'straight' | 'curve' | 'diagonal' | 'half' | 'half-mirror';
}

/** Bahnhof 2×2 neben dem Gleis (rechts in Fahrtrichtung). */
export interface TrainStopDef extends EntityBase {
  readonly kind: 'train-stop';
}

/** Radar 3×3: verbraucht Strom (Karte ist hier ohnehin aufgedeckt). */
export interface RadarDef extends EntityBase {
  readonly kind: 'radar';
  readonly energyUsage: number;
}

/** Roboterhangar (Roboport) 4×4; Werte in src/data/robots.ts. */
export interface RoboportDef extends EntityBase {
  readonly kind: 'roboport';
}

export interface PipeDef extends EntityBase {
  readonly kind: 'pipe';
  /** Fassungsvermögen (Einheiten). */
  readonly capacity: number;
}

export interface PumpDef extends EntityBase {
  readonly kind: 'offshore-pump';
  /** Fördermenge in Einheiten pro Tick. */
  readonly pumpingSpeed: number;
  readonly capacity: number;
  readonly fluid: string;
}

export interface BoilerDef extends EntityBase {
  readonly kind: 'boiler';
  readonly energyUsage: number;
  readonly fuelSlots: number;
  readonly inputFluid: string;
  readonly outputFluid: string;
  /** Zieltemperatur des Dampfes (°C) – bestimmt die Energie je Einheit. */
  readonly targetTemperature: number;
  /** Einheiten Dampf je Einheit Wasser. */
  readonly steamPerWater: number;
  readonly capacity: number;
}

export interface GeneratorDef extends EntityBase {
  readonly kind: 'generator';
  /** Höchstleistung (W). */
  readonly maxPower: number;
  /** Dampfverbrauch bei voller Leistung (Einheiten pro Tick). */
  readonly fluidPerTick: number;
  readonly fluid: string;
  readonly capacity: number;
  /** Dampftemperatur (°C) für die Energie je Einheit; Standard 165 (Dampfmaschine), Turbine 500. */
  readonly temperature?: number;
}

/** Kernreaktor (Wiki „Nuclear reactor“): 40 MW Wärme, +100 % je benachbartem laufendem Reaktor, 10 MJ/°C, bis 1000 °C. */
export interface ReactorDef extends EntityBase {
  readonly kind: 'reactor';
  readonly consumption: number;
  readonly heatCapacity: number;
  readonly maxTemperature: number;
}

/** Wärmerohr (Wiki „Heat pipe“): 1 MJ/°C, bis 1000 °C. */
export interface HeatPipeDef extends EntityBase {
  readonly kind: 'heat-pipe';
  readonly heatCapacity: number;
  readonly maxTemperature: number;
}

/** Wärmetauscher (Wiki „Heat exchanger“): 10 MW, braucht ≥ 500 °C, macht 500-°C-Dampf, 1 MJ/°C. */
export interface HeatExchangerDef extends EntityBase {
  readonly kind: 'heat-exchanger';
  readonly energyUsage: number;
  readonly heatCapacity: number;
  readonly maxTemperature: number;
  readonly minTemperature: number;
  readonly inputFluid: string;
  readonly outputFluid: string;
  readonly targetTemperature: number;
  readonly steamPerWater: number;
  readonly capacity: number;
}

export interface PoleDef extends EntityBase {
  readonly kind: 'pole';
  /** Kabelreichweite (Felder, Mittelpunkt zu Mittelpunkt). */
  readonly wireReach: number;
  /** Versorgungsbereich: Abstand vom Mittelpunkt (Felder), quadratisch. */
  readonly supplyRadius: number;
}

/** Flüssigkeitsbehälter einer Maschine: Anschlüsse (lokales Feld, Richtung) bei Richtung Nord. */
export interface MachineFluidBox {
  readonly type: 'input' | 'output';
  readonly volume: number;
  readonly ports: readonly (readonly [number, number, 0 | 1 | 2 | 3])[];
}

export interface AssemblerDef extends EntityBase {
  readonly kind: 'assembler';
  readonly craftingSpeed: number;
  readonly energyUsage: number;
  readonly drain: number;
  /** Rezeptkategorien, die die Maschine herstellen kann. */
  readonly categories: readonly string[];
  readonly fluidBoxes?: readonly MachineFluidBox[];
}

export interface LabDef extends EntityBase {
  readonly kind: 'lab';
  readonly researchSpeed: number;
  readonly energyUsage: number;
  readonly drain: number;
  readonly inputs: readonly string[];
}

/** Rohr unterirdisch: verbindet sich über bis zu maxDistance Felder mit einem gegenüberliegenden Gegenstück. */
export interface PipeGroundDef extends EntityBase {
  readonly kind: 'pipe-ground';
  readonly capacity: number;
  readonly maxDistance: number;
}

/** Pumpe (elektrisch): fördert von hinten nach vorn. */
export interface FluidPumpDef extends EntityBase {
  readonly kind: 'pump';
  readonly energyUsage: number;
  /** Einheiten je Tick. */
  readonly pumpingSpeed: number;
  readonly capacity: number;
}

export interface TankDef extends EntityBase {
  readonly kind: 'tank';
  readonly capacity: number;
}

/** Geschützturm (Wiki „Gun turret“): schießt mit Munition aus dem eigenen Vorrat auf Gegner. */
export interface TurretDef extends EntityBase {
  readonly kind: 'turret';
  /** Greifarme füllen bis zu so vielen Magazinen auf (Wiki: automated_ammo_count 10). */
  readonly ammoFill: number;
}

/** Mauer: nur Hindernis mit Lebenspunkten. */
export interface WallDef extends EntityBase {
  readonly kind: 'wall';
  /** Tor: die Figur geht hindurch (walkable), Zombies nicht. */
  readonly gate?: boolean;
}

/** Stacheldraht / Nagelfalle: begehbar, bremst bzw. verletzt Zombies (Werte HAZARD in src/data/enemies.ts). */
export interface HazardDef extends EntityBase {
  readonly kind: 'wire' | 'trap';
}

/** Feldbett: hier schläft die Figur (schneller erholt als auf dem Boden). */
export interface BedDef extends EntityBase {
  readonly kind: 'bed';
}

/** Erzeuger ohne Strom: Gemüsebeet (Gemüse), Regentonne (füllt leere Flaschen). */
export interface ProducerDef extends EntityBase {
  readonly kind: 'producer';
  readonly product: string;
  /** Sekunden je Stück. */
  readonly interval: number;
  /** Höchstens so viele fertige Stücke im Ausgang. */
  readonly capacity: number;
  /** Verbraucht je Stück ein solches Item (Regentonne: leere Flasche). */
  readonly consumes?: string;
  /** Wächst nur bei Tageslicht (Beet). */
  readonly daylight?: boolean;
}

/** Funkturm: sendet unter Strom den Notruf; nach callSeconds Sendezeit kommt die Rettung (Spielziel). Sehr laut. */
export interface RadioDef extends EntityBase {
  readonly kind: 'radio';
  readonly energyUsage: number;
  readonly callSeconds: number;
}

/**
 * Fundort der alten Welt (Wrack, Haus, Kiste): nicht baubar, wird durchsucht (Beutetabelle in src/data/loot.ts)
 * und kann ausgeschlachtet werden (item × itemCount plus salvage). Zombies greifen Fundorte nicht an.
 */
export interface LootDef extends EntityBase {
  readonly kind: 'loot';
  readonly slots: number;
  readonly table: string;
  /** Sekunden für das erste Durchsuchen. */
  readonly searchTime: number;
  readonly salvage: readonly { readonly item: string; readonly amount: number }[];
}

export interface LampDef extends EntityBase {
  readonly kind: 'lamp';
  readonly energyUsage: number;
}

/** Leuchtfeuer: überträgt Geschwindigkeits- und Effizienzmodule auf Maschinen im 9×9-Bereich. Quelle: Wiki „Beacon“. */
export interface BeaconDef extends EntityBase {
  readonly kind: 'beacon';
  readonly energyUsage: number;
}

/** Solarpanel: Leistung folgt dem Tageslicht (1 − Dunkelheit), Vorrang vor Dampf. Quelle: Wiki „Solar panel“. */
export interface SolarDef extends EntityBase {
  readonly kind: 'solar';
  /** Höchstleistung bei vollem Tageslicht (W). */
  readonly production: number;
}

/** Akkumulator: lädt aus Überschuss, entlädt bei Mangel. Quelle: Wiki „Accumulator“. */
export interface AccumulatorDef extends EntityBase {
  readonly kind: 'accumulator';
  /** Speicher (J). */
  readonly buffer: number;
  /** Lade- bzw. Entladeleistung (W). */
  readonly inputFlow: number;
  readonly outputFlow: number;
}

export type EntityDef = BeltDef | DrillDef | FurnaceDef | InserterDef | ContainerDef | PipeDef | PumpDef | BoilerDef | GeneratorDef | PoleDef | AssemblerDef | LabDef | UndergroundDef | SplitterDef
  | PipeGroundDef | FluidPumpDef | TankDef | LampDef | PumpjackDef | SolarDef | AccumulatorDef | BeaconDef | RoboportDef | RocketSiloDef | RadarDef | CombinatorDef | RailDef | TrainStopDef
  | TurretDef | WallDef | ReactorDef | HeatPipeDef | HeatExchangerDef | HazardDef | BedDef | ProducerDef | RadioDef | LootDef;

const list: EntityDef[] = [
  {
    kind: 'belt', id: 'transport-belt', name: 'Förderband', width: 1, height: 1, health: 150,
    item: 'transport-belt', mineTime: 0.1, solid: false, rotatable: true, speed: 8,
  },
  {
    kind: 'belt', id: 'fast-transport-belt', name: 'Schnelles Förderband', width: 1, height: 1, health: 160,
    item: 'fast-transport-belt', mineTime: 0.1, solid: false, rotatable: true, speed: 16,
  },
  {
    kind: 'underground', id: 'underground-belt', name: 'Untergrundband', width: 1, height: 1, health: 150,
    item: 'underground-belt', mineTime: 0.1, solid: false, rotatable: true, speed: 8, maxDistance: 10,
  },
  {
    kind: 'splitter', id: 'splitter', name: 'Splitter', width: 2, height: 1, health: 170,
    item: 'splitter', mineTime: 0.1, solid: false, rotatable: true, speed: 8,
  },
  {
    kind: 'underground', id: 'fast-underground-belt', name: 'Schnelles Untergrundband', width: 1, height: 1, health: 160,
    item: 'fast-underground-belt', mineTime: 0.1, solid: false, rotatable: true, speed: 16, maxDistance: 15,
  },
  {
    kind: 'splitter', id: 'fast-splitter', name: 'Schneller Splitter', width: 2, height: 1, health: 180,
    item: 'fast-splitter', mineTime: 0.1, solid: false, rotatable: true, speed: 16,
  },
  {
    kind: 'drill', id: 'burner-mining-drill', name: 'Brennstoff-Bohrer', width: 2, height: 2, health: 150,
    item: 'burner-mining-drill', mineTime: 0.3, solid: true, rotatable: true, energy: 'burner',
    miningSpeed: 0.25, energyUsage: 150_000, miningAreaSize: 2, outputVector: [-0.35, -1.3], fuelSlots: 1,
  },
  {
    kind: 'furnace', id: 'stone-furnace', name: 'Steinofen', width: 2, height: 2, health: 200,
    item: 'stone-furnace', mineTime: 0.2, solid: true, rotatable: false,
    craftingSpeed: 1, energyUsage: 90_000, fuelSlots: 1,
  },
  {
    kind: 'inserter', id: 'burner-inserter', name: 'Brennstoff-Greifarm', width: 1, height: 1, health: 100,
    item: 'burner-inserter', mineTime: 0.1, solid: true, rotatable: true, energy: 'burner', drain: 0,
    rotationSpeed: 0.013, halfTurnTicks: 38, energyPerTransfer: 66.9 * KJ, initialEnergy: 500 * KJ,
    pickupVector: [0, 1], dropVector: [0, -1.2], fuelSlots: 1,
    fuelInsertLimit: 5,
  },
  {
    kind: 'drill', id: 'electric-mining-drill', name: 'Elektrischer Bohrer', width: 3, height: 3, health: 300,
    item: 'electric-mining-drill', mineTime: 0.3, solid: true, rotatable: true, energy: 'electric',
    miningSpeed: 0.5, energyUsage: 90_000, miningAreaSize: 5, outputVector: [0, -1.85], fuelSlots: 0, moduleSlots: 3,
    fluidInput: { type: 'input', volume: 200, ports: [[0, 1, 3], [2, 1, 1], [1, 2, 2]] },
  },
  {
    kind: 'inserter', id: 'inserter', name: 'Greifarm', width: 1, height: 1, health: 150,
    item: 'inserter', mineTime: 0.1, solid: true, rotatable: true, energy: 'electric', drain: 400,
    // Wiki „Inserters“, Energie je Zyklus 6,65 kJ, 70 Ticks je Zyklus
    rotationSpeed: 0.014, halfTurnTicks: 35, energyPerTransfer: 6.65 * KJ, initialEnergy: 0,
    pickupVector: [0, 1], dropVector: [0, -1.2], fuelSlots: 0,
    fuelInsertLimit: 5,
  },
  {
    kind: 'inserter', id: 'long-handed-inserter', name: 'Langer Greifarm', width: 1, height: 1, health: 160,
    item: 'long-handed-inserter', mineTime: 0.1, solid: true, rotatable: true, energy: 'electric', drain: 400,
    // Wiki „Inserters“, Energie je Zyklus 7 kJ, 48 Ticks je Zyklus
    rotationSpeed: 0.02, halfTurnTicks: 24, energyPerTransfer: 7 * KJ, initialEnergy: 0,
    pickupVector: [0, 2], dropVector: [0, -2.2], fuelSlots: 0,
    fuelInsertLimit: 5,
  },
  {
    kind: 'pipe', id: 'pipe', name: 'Rohr', width: 1, height: 1, health: 100,
    item: 'pipe', mineTime: 0.1, solid: true, rotatable: false, capacity: 100,
  },
  {
    kind: 'offshore-pump', id: 'offshore-pump', name: 'Uferpumpe', width: 1, height: 2, health: 150,
    item: 'offshore-pump', mineTime: 0.1, solid: true, rotatable: true, pumpingSpeed: 20, capacity: 100, fluid: 'water',
  },
  {
    kind: 'boiler', id: 'boiler', name: 'Kessel', width: 3, height: 2, health: 200,
    item: 'boiler', mineTime: 0.2, solid: true, rotatable: true, energyUsage: 1_800_000, fuelSlots: 1,
    inputFluid: 'water', outputFluid: 'steam', targetTemperature: 165, steamPerWater: 10, capacity: 200,
  },
  {
    kind: 'generator', id: 'steam-engine', name: 'Dampfmaschine', width: 3, height: 5, health: 400,
    item: 'steam-engine', mineTime: 0.3, solid: true, rotatable: true, maxPower: 900_000, fluidPerTick: 0.5,
    fluid: 'steam', capacity: 200,
  },
  {
    // Wiki „Steam turbine“: 5,82 MW, 60 Einheiten 500-°C-Dampf je Sekunde, 3×5
    kind: 'generator', id: 'steam-turbine', name: 'Dampfturbine', width: 3, height: 5, health: 300,
    item: 'steam-turbine', mineTime: 0.3, solid: true, rotatable: true, maxPower: 5_820_000, fluidPerTick: 1,
    fluid: 'steam-hot', capacity: 200, temperature: 500,
  },
  {
    kind: 'reactor', id: 'nuclear-reactor', name: 'Kernreaktor', width: 5, height: 5, health: 500,
    item: 'nuclear-reactor', mineTime: 0.5, solid: true, rotatable: false, consumption: 40_000_000, heatCapacity: 10_000_000, maxTemperature: 1000,
  },
  {
    kind: 'heat-pipe', id: 'heat-pipe', name: 'Wärmerohr', width: 1, height: 1, health: 200,
    item: 'heat-pipe', mineTime: 0.1, solid: true, rotatable: false, heatCapacity: 1_000_000, maxTemperature: 1000,
  },
  {
    // Wiki: 10 MW, 103 Einheiten 500-°C-Dampf/s, Wasser 1:10 wie beim Kessel; Wärmeeingang hinten (gegenüber dem Dampfausgang)
    kind: 'heat-exchanger', id: 'heat-exchanger', name: 'Wärmetauscher', width: 3, height: 2, health: 200,
    item: 'heat-exchanger', mineTime: 0.1, solid: true, rotatable: true, energyUsage: 10_000_000, heatCapacity: 1_000_000,
    maxTemperature: 1000, minTemperature: 500, inputFluid: 'water', outputFluid: 'steam-hot', targetTemperature: 500, steamPerWater: 10, capacity: 200,
  },
  {
    // Wiki „Centrifuge“: 3×3, 350 kW, Grundlast 11,6 kW, Tempo 1, 2 Modulplätze
    kind: 'assembler', id: 'centrifuge', name: 'Zentrifuge', width: 3, height: 3, health: 350,
    item: 'centrifuge', mineTime: 0.1, solid: true, rotatable: false, craftingSpeed: 1, energyUsage: 350_000, drain: 11_600,
    categories: ['centrifuging'], moduleSlots: 2,
  },
  {
    kind: 'pole', id: 'small-electric-pole', name: 'Kleiner Strommast', width: 1, height: 1, health: 100,
    item: 'small-electric-pole', mineTime: 0.1, solid: true, walkable: true, rotatable: false, wireReach: 7.5, supplyRadius: 3.5,
  },
  {
    kind: 'assembler', id: 'assembling-machine-1', name: 'Montagemaschine', width: 3, height: 3, health: 300,
    item: 'assembling-machine-1', mineTime: 0.2, solid: true, rotatable: false, craftingSpeed: 0.5, energyUsage: 75_000, drain: 2_500,
    categories: ['crafting', 'advanced-crafting'],
  },
  {
    kind: 'lab', id: 'lab', name: 'Labor', width: 3, height: 3, health: 150,
    item: 'lab', mineTime: 0.2, solid: true, rotatable: false, researchSpeed: 1, energyUsage: 60_000, drain: 2_000, moduleSlots: 2,
    inputs: ['automation-science-pack', 'logistic-science-pack', 'military-science-pack', 'chemical-science-pack', 'production-science-pack', 'utility-science-pack', 'space-science-pack'],
  },
  {
    kind: 'container', id: 'steel-chest', name: 'Stahlkiste', width: 1, height: 1, health: 350,
    item: 'steel-chest', mineTime: 0.2, solid: true, rotatable: false, slots: 48,
  },
  {
    kind: 'furnace', id: 'steel-furnace', name: 'Stahlofen', width: 2, height: 2, health: 300,
    item: 'steel-furnace', mineTime: 0.2, solid: true, rotatable: false, craftingSpeed: 2, energyUsage: 90_000, fuelSlots: 1,
  },
  {
    kind: 'inserter', id: 'fast-inserter', name: 'Schneller Greifarm', width: 1, height: 1, health: 150,
    item: 'fast-inserter', mineTime: 0.1, solid: true, rotatable: true, energy: 'electric', drain: 500,
    // Wiki „Inserters“: 0,04 U/Tick, 24 Ticks je Zyklus, 8,12 kJ je Zyklus
    rotationSpeed: 0.04, halfTurnTicks: 12, energyPerTransfer: 8.12 * KJ, initialEnergy: 0,
    pickupVector: [0, 1], dropVector: [0, -1.2], fuelSlots: 0,
    fuelInsertLimit: 5, filterSlots: 5,
  },
  {
    kind: 'inserter', id: 'bulk-inserter', name: 'Massengreifarm', width: 1, height: 1, health: 160,
    item: 'bulk-inserter', mineTime: 0.1, solid: true, rotatable: true, energy: 'electric', drain: 1000,
    // Wiki „Bulk inserter“/„Inserters“: wie der schnelle Greifarm 24 Ticks je Zyklus; Leistungsmodifikator 20 statt 7 kJ
    // → 8,12 × 20/7 = 23,2 kJ je Zyklus (Messvorschlag); greift bis zu 2 (+ Forschung) Items auf einmal
    rotationSpeed: 0.04, halfTurnTicks: 12, energyPerTransfer: 23.2 * KJ, initialEnergy: 0,
    pickupVector: [0, 1], dropVector: [0, -1.2], fuelSlots: 0,
    fuelInsertLimit: 5, bulk: true, filterSlots: 5,
  },
  {
    kind: 'pole', id: 'medium-electric-pole', name: 'Mittlerer Strommast', width: 1, height: 1, health: 100,
    item: 'medium-electric-pole', mineTime: 0.1, solid: true, walkable: true, rotatable: false, wireReach: 9, supplyRadius: 4.5,
  },
  {
    kind: 'pole', id: 'big-electric-pole', name: 'Großer Strommast', width: 2, height: 2, health: 150,
    item: 'big-electric-pole', mineTime: 0.1, solid: true, rotatable: false, wireReach: 32, supplyRadius: 3,
  },
  {
    kind: 'lamp', id: 'lamp', name: 'Lampe', width: 1, height: 1, health: 100,
    item: 'lamp', mineTime: 0.1, solid: true, walkable: true, rotatable: false, energyUsage: 5_000,
  },
  {
    kind: 'assembler', id: 'assembling-machine-2', name: 'Montagemaschine 2', width: 3, height: 3, health: 350,
    item: 'assembling-machine-2', mineTime: 0.2, solid: true, rotatable: true, craftingSpeed: 0.75, energyUsage: 150_000, drain: 5_000,
    categories: ['crafting', 'advanced-crafting', 'crafting-with-fluid'], moduleSlots: 2,
    // Eingang mit Anschluss oben und unten in der Mitte (durchgängig); Ausgang links/rechts in der Mitte
    // (Wiki 2.0: Eingang und Ausgang; Lage des Ausgangs eigene Wahl, damit bestehende Anlagen weiter passen)
    fluidBoxes: [{ type: 'input', volume: 1000, ports: [[1, 0, 0], [1, 2, 2]] }, { type: 'output', volume: 1000, ports: [[0, 1, 3], [2, 1, 1]] }],
  },
  {
    kind: 'assembler', id: 'assembling-machine-3', name: 'Montagemaschine 3', width: 3, height: 3, health: 400,
    item: 'assembling-machine-3', mineTime: 0.2, solid: true, rotatable: true, craftingSpeed: 1.25, energyUsage: 375_000, drain: 12_500,
    categories: ['crafting', 'advanced-crafting', 'crafting-with-fluid'], moduleSlots: 4,
    fluidBoxes: [{ type: 'input', volume: 1000, ports: [[1, 0, 0], [1, 2, 2]] }, { type: 'output', volume: 1000, ports: [[0, 1, 3], [2, 1, 1]] }],
  },
  {
    kind: 'beacon', id: 'beacon', name: 'Leuchtfeuer', width: 3, height: 3, health: 200,
    item: 'beacon', mineTime: 0.2, solid: true, rotatable: false, energyUsage: 480_000, moduleSlots: 2,
  },
  {
    kind: 'pipe-ground', id: 'pipe-to-ground', name: 'Rohr unterirdisch', width: 1, height: 1, health: 150,
    item: 'pipe-to-ground', mineTime: 0.1, solid: true, rotatable: true, capacity: 100, maxDistance: 10,
  },
  {
    kind: 'pump', id: 'pump', name: 'Pumpe', width: 1, height: 2, health: 180,
    item: 'pump', mineTime: 0.2, solid: true, rotatable: true, energyUsage: 30_000, pumpingSpeed: 20, capacity: 400,
  },
  {
    kind: 'tank', id: 'storage-tank', name: 'Lagertank', width: 3, height: 3, health: 500,
    item: 'storage-tank', mineTime: 0.5, solid: true, rotatable: true, capacity: 25_000,
  },
  {
    kind: 'pumpjack', id: 'pumpjack', name: 'Pumpjack', width: 3, height: 3, health: 200,
    item: 'pumpjack', mineTime: 0.5, solid: true, rotatable: true, energyUsage: 90_000, miningSpeed: 1, capacity: 1000, moduleSlots: 2,
  },
  {
    kind: 'assembler', id: 'oil-refinery', name: 'Ölraffinerie', width: 5, height: 5, health: 350,
    item: 'oil-refinery', mineTime: 0.2, solid: true, rotatable: true, craftingSpeed: 1, energyUsage: 420_000, drain: 14_000,
    categories: ['oil-processing'], moduleSlots: 3,
    fluidBoxes: [
      { type: 'input', volume: 1000, ports: [[1, 4, 2]] },
      { type: 'input', volume: 1000, ports: [[3, 4, 2]] },
      { type: 'output', volume: 1000, ports: [[0, 0, 0]] },
      { type: 'output', volume: 1000, ports: [[2, 0, 0]] },
      { type: 'output', volume: 1000, ports: [[4, 0, 0]] },
    ],
  },
  {
    kind: 'assembler', id: 'chemical-plant', name: 'Chemiefabrik', width: 3, height: 3, health: 300,
    item: 'chemical-plant', mineTime: 0.1, solid: true, rotatable: true, craftingSpeed: 1, energyUsage: 210_000, drain: 7_000,
    categories: ['chemistry'], moduleSlots: 3,
    fluidBoxes: [
      { type: 'input', volume: 1000, ports: [[0, 2, 2]] },
      { type: 'input', volume: 1000, ports: [[2, 2, 2]] },
      { type: 'output', volume: 1000, ports: [[0, 0, 0]] },
      { type: 'output', volume: 1000, ports: [[2, 0, 0]] },
    ],
  },
  {
    kind: 'furnace', id: 'electric-furnace', name: 'Elektrischer Ofen', width: 3, height: 3, health: 350,
    item: 'electric-furnace', mineTime: 0.2, solid: true, rotatable: false, craftingSpeed: 2, energyUsage: 180_000, fuelSlots: 0,
    energy: 'electric', drain: 6_000, moduleSlots: 2,
  },
  {
    kind: 'pole', id: 'substation', name: 'Umspannwerk', width: 2, height: 2, health: 200,
    item: 'substation', mineTime: 0.1, solid: true, rotatable: false, wireReach: 18, supplyRadius: 10,
  },
  {
    kind: 'belt', id: 'express-transport-belt', name: 'Express-Förderband', width: 1, height: 1, health: 170,
    item: 'express-transport-belt', mineTime: 0.1, solid: false, rotatable: true, speed: 24,
  },
  {
    kind: 'underground', id: 'express-underground-belt', name: 'Express-Untergrundband', width: 1, height: 1, health: 170,
    item: 'express-underground-belt', mineTime: 0.1, solid: false, rotatable: true, speed: 24, maxDistance: 20,
  },
  {
    kind: 'splitter', id: 'express-splitter', name: 'Express-Splitter', width: 2, height: 1, health: 190,
    item: 'express-splitter', mineTime: 0.1, solid: false, rotatable: true, speed: 24,
  },
  {
    kind: 'solar', id: 'solar-panel', name: 'Solarpanel', width: 3, height: 3, health: 200,
    item: 'solar-panel', mineTime: 0.1, solid: true, rotatable: false, production: 60_000,
  },
  {
    kind: 'accumulator', id: 'accumulator', name: 'Akkumulator', width: 2, height: 2, health: 150,
    item: 'accumulator', mineTime: 0.1, solid: true, rotatable: false, buffer: 5_000_000, inputFlow: 300_000, outputFlow: 300_000,
  },
  {
    kind: 'roboport', id: 'roboport', name: 'Roboterhangar', width: 4, height: 4, health: 500,
    item: 'roboport', mineTime: 0.1, solid: true, rotatable: false,
  },
  ...([
    ['passive-provider-chest', 'Passive Anbieterkiste', 'passive-provider'],
    ['active-provider-chest', 'Aktive Anbieterkiste', 'active-provider'],
    ['storage-chest', 'Lagerkiste', 'storage'],
    ['requester-chest', 'Anforderungskiste', 'requester'],
    ['buffer-chest', 'Pufferkiste', 'buffer'],
  ] as const).map(([id, name, logistic]): ContainerDef => ({
    kind: 'container', id, name, width: 1, height: 1, health: 350, item: id, mineTime: 0.1, solid: true, rotatable: false, slots: 48, logistic,
  })),
  {
    kind: 'rocket-silo', id: 'rocket-silo', name: 'Raketensilo', width: 9, height: 9, health: 5000,
    item: 'rocket-silo', mineTime: 1, solid: true, rotatable: false, craftingSpeed: 1, energyUsage: 4_000_000, moduleSlots: 4,
    partsPerRocket: 100, launchTicks: 1632, deliveryTicks: 29 * 60,
  },
  {
    kind: 'container', id: 'cargo-landing-pad', name: 'Fracht-Landeplatz', width: 8, height: 8, health: 1000,
    item: 'cargo-landing-pad', mineTime: 1, solid: true, rotatable: false, slots: 80, logistic: 'passive-provider', cargoPad: true,
  },
  {
    kind: 'radar', id: 'radar', name: 'Radar', width: 3, height: 3, health: 250,
    item: 'radar', mineTime: 0.1, solid: true, rotatable: false, energyUsage: 300_000,
  },
  {
    kind: 'combinator', id: 'constant-combinator', name: 'Konstanter Kombinator', width: 1, height: 1, health: 120,
    item: 'constant-combinator', mineTime: 0.1, solid: true, rotatable: true, mode: 'constant', energyUsage: 0,
  },
  {
    kind: 'combinator', id: 'arithmetic-combinator', name: 'Rechenkombinator', width: 1, height: 2, health: 150,
    item: 'arithmetic-combinator', mineTime: 0.1, solid: true, rotatable: true, mode: 'arithmetic', energyUsage: 1_000,
  },
  {
    kind: 'combinator', id: 'decider-combinator', name: 'Entscheidungskombinator', width: 1, height: 2, health: 150,
    item: 'decider-combinator', mineTime: 0.1, solid: true, rotatable: true, mode: 'decider', energyUsage: 1_000,
  },
  {
    kind: 'rail', id: 'straight-rail', name: 'Gleis', width: 2, height: 2, health: 200,
    item: 'rail', mineTime: 0.2, solid: false, rotatable: true, shape: 'straight',
  },
  {
    kind: 'rail', id: 'curved-rail', name: 'Gleisbogen', width: 4, height: 4, health: 200,
    item: 'rail', mineTime: 0.2, solid: false, rotatable: true, shape: 'curve', itemCount: 4,
  },
  {
    kind: 'rail', id: 'diagonal-rail', name: 'Diagonalgleis', width: 2, height: 2, health: 200,
    item: 'rail', mineTime: 0.2, solid: false, rotatable: true, shape: 'diagonal',
  },
  {
    kind: 'rail', id: 'half-rail', name: 'Gleisübergang', width: 2, height: 4, health: 200,
    item: 'rail', mineTime: 0.2, solid: false, rotatable: true, shape: 'half', itemCount: 2,
  },
  {
    kind: 'rail', id: 'half-rail-mirror', name: 'Gleisübergang', width: 2, height: 4, health: 200,
    item: 'rail', mineTime: 0.2, solid: false, rotatable: true, shape: 'half-mirror', itemCount: 2,
  },
  {
    kind: 'train-stop', id: 'train-stop', name: 'Bahnhof', width: 2, height: 2, health: 250,
    item: 'train-stop', mineTime: 0.2, solid: true, rotatable: true,
  },
  {
    kind: 'container', id: 'wooden-chest', name: 'Holzkiste', width: 1, height: 1, health: 100,
    item: 'wooden-chest', mineTime: 0.1, solid: true, rotatable: false, slots: 16,
  },
  {
    kind: 'container', id: 'iron-chest', name: 'Eisenkiste', width: 1, height: 1, health: 200,
    item: 'iron-chest', mineTime: 0.2, solid: true, rotatable: false, slots: 32,
  },
  {
    kind: 'turret', id: 'gun-turret', name: 'MG-Turm', width: 2, height: 2, health: 400,
    item: 'gun-turret', mineTime: 0.5, solid: true, rotatable: false, ammoFill: 10,
  },
  {
    kind: 'wall', id: 'stone-wall', name: 'Steinmauer', width: 1, height: 1, health: 350,
    item: 'stone-wall', mineTime: 0.2, solid: true, rotatable: false,
  },
  // ---- Letzte Schicht: Verteidigung, Überleben, Fundorte (eigene Werte, docs/GAME_DATA.md)
  {
    kind: 'wall', id: 'wooden-barricade', name: 'Holzbarrikade', width: 1, height: 1, health: 140,
    item: 'wooden-barricade', mineTime: 0.2, solid: true, rotatable: false,
  },
  {
    kind: 'wall', id: 'gate', name: 'Tor', width: 1, height: 1, health: 300,
    item: 'gate', mineTime: 0.3, solid: true, walkable: true, rotatable: false, gate: true,
  },
  {
    kind: 'wire', id: 'barbed-wire', name: 'Stacheldraht', width: 1, height: 1, health: 60,
    item: 'barbed-wire', mineTime: 0.2, solid: false, rotatable: false,
  },
  {
    kind: 'trap', id: 'spike-trap', name: 'Nagelfalle', width: 1, height: 1, health: 160,
    item: 'spike-trap', mineTime: 0.2, solid: false, rotatable: false,
  },
  {
    kind: 'bed', id: 'bed', name: 'Feldbett', width: 1, height: 2, health: 80,
    item: 'bed', mineTime: 0.3, solid: true, walkable: true, rotatable: false,
  },
  {
    kind: 'producer', id: 'garden', name: 'Gemüsebeet', width: 2, height: 2, health: 80,
    item: 'garden', mineTime: 0.5, solid: true, rotatable: false, product: 'vegetables', interval: 150, capacity: 6, daylight: true,
  },
  {
    kind: 'producer', id: 'rain-barrel', name: 'Regentonne', width: 1, height: 1, health: 100,
    item: 'rain-barrel', mineTime: 0.3, solid: true, rotatable: false, product: 'water-bottle', interval: 75, capacity: 4, consumes: 'empty-bottle',
  },
  {
    kind: 'radio', id: 'radio-tower', name: 'Funkturm', width: 3, height: 3, health: 600,
    item: 'radio-tower', mineTime: 1, solid: true, rotatable: false, energyUsage: 400_000, callSeconds: 900,
  },
  {
    kind: 'loot', id: 'car-wreck', name: 'Autowrack', width: 3, height: 2, health: 500,
    item: 'scrap', itemCount: 10, mineTime: 5, solid: true, rotatable: false, slots: 6, table: 'car', searchTime: 2.5,
    salvage: [{ item: 'iron-gear-wheel', amount: 3 }, { item: 'copper-cable', amount: 4 }],
  },
  {
    kind: 'loot', id: 'ruin-house', name: 'Verlassenes Haus', width: 5, height: 4, health: 2000,
    item: 'scrap', itemCount: 6, mineTime: 14, solid: true, rotatable: false, slots: 12, table: 'house', searchTime: 5,
    salvage: [{ item: 'wood', amount: 24 }, { item: 'stone-brick', amount: 20 }, { item: 'cloth', amount: 4 }],
  },
  {
    kind: 'loot', id: 'ruin-shed', name: 'Schuppen', width: 3, height: 3, health: 800,
    item: 'scrap', itemCount: 6, mineTime: 8, solid: true, rotatable: false, slots: 8, table: 'shed', searchTime: 3,
    salvage: [{ item: 'wood', amount: 14 }],
  },
  {
    kind: 'loot', id: 'ruin-store', name: 'Geplünderter Laden', width: 6, height: 4, health: 2500,
    item: 'scrap', itemCount: 12, mineTime: 16, solid: true, rotatable: false, slots: 16, table: 'store', searchTime: 6,
    salvage: [{ item: 'stone-brick', amount: 30 }, { item: 'wood', amount: 10 }],
  },
  {
    kind: 'loot', id: 'ruin-garage', name: 'Werkstatt', width: 4, height: 4, health: 2000,
    item: 'scrap', itemCount: 20, mineTime: 14, solid: true, rotatable: false, slots: 12, table: 'garage', searchTime: 5,
    salvage: [{ item: 'stone-brick', amount: 16 }, { item: 'iron-gear-wheel', amount: 6 }],
  },
  {
    kind: 'loot', id: 'supply-crate', name: 'Vorratskiste', width: 1, height: 1, health: 100,
    item: 'wood', itemCount: 2, mineTime: 0.5, solid: true, rotatable: false, slots: 4, table: 'crate', searchTime: 1.2, salvage: [],
  },
  {
    kind: 'loot', id: 'military-crate', name: 'Militärkiste', width: 1, height: 1, health: 200,
    item: 'scrap', itemCount: 3, mineTime: 0.8, solid: true, rotatable: false, slots: 6, table: 'military', searchTime: 2, salvage: [],
  },
  {
    kind: 'loot', id: 'dumpster', name: 'Müllcontainer', width: 2, height: 1, health: 300,
    item: 'scrap', itemCount: 6, mineTime: 3, solid: true, rotatable: false, slots: 6, table: 'trash', searchTime: 2, salvage: [],
  },
];

export const ENTITIES: Readonly<Record<string, EntityDef>> = Object.freeze(Object.fromEntries(list.map((e) => [e.id, e])));

export function entityDef(id: string): EntityDef {
  const d = ENTITIES[id];
  if (!d) throw new Error(`Unbekanntes Gebäude: ${id}`);
  return d;
}

/** Grundfläche (Breite, Höhe) in Feldern für eine Richtung; bei Ost/West getauscht. */
export function sizeOf(def: EntityDef, dir: number): [number, number] {
  return dir % 2 === 1 ? [def.height, def.width] : [def.width, def.height];
}

/**
 * Füllgrenze für Greifarme (Wiki „Inserters“, Insertion limits): Zutaten für 1 Vorgang plus die Vorgänge,
 * die während einer Greifarm-Drehung (1,166 s) fertig werden (aufgerundet), mindestens 2, höchstens 100.
 * Gilt für Montagemaschinen, Öfen und (mit Forschungseinheiten) Labore.
 */
export const INSERTION_LIMIT = { swingSeconds: 1.166, minCrafts: 2, maxCrafts: 100 } as const;

/** Anzahl Vorgänge, bis zu der Greifarme Zutaten nachfüllen (Vorgangsdauer in Sekunden). */
export function insertionLimitCrafts(craftSeconds: number): number {
  const L = INSERTION_LIMIT;
  return Math.max(L.minCrafts, Math.min(L.maxCrafts, 1 + Math.ceil(L.swingSeconds / craftSeconds - 1e-9)));
}
