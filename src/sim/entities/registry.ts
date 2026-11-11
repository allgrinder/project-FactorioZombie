import type { EntityDef } from '../../data/entities';
import type { Dir } from '../geom';
import type { EntityBase } from './base';
import { BeltEntity, ContainerEntity, DrillEntity, FurnaceEntity } from './basic';
import { InserterEntity } from './inserter';
import { FluidPumpEntity, LampEntity, PipeGroundEntity, PumpjackEntity, TankEntity } from './fluidplus';
import { SplitterEntity, UndergroundEntity } from './logistics';
import { AssemblerEntity, BeaconEntity, LabEntity } from './production';
import { RoboportEntity } from './robots';
import { CombinatorEntity, RadarEntity, RailEntity, RocketSiloEntity, TrainStopEntity } from './rocket';
import { TurretEntity, WallEntity } from './military';
import { BedEntity, HazardEntity, LootEntity, ProducerEntity, RadioEntity } from './survival';
import { HeatExchangerEntity, HeatPipeEntity, ReactorEntity } from './nuclear';
import { AccumulatorEntity, BoilerEntity, GeneratorEntity, PipeEntity, PoleEntity, PumpEntity, SolarEntity } from './power';

type Ctor = new (id: number, name: string, x: number, y: number, dir: Dir) => EntityBase;

/** Gebäudeart (EntityDef.kind) -> Klasse. Neue Gebäude hier eintragen. */
export const ENTITY_CLASSES: Record<EntityDef['kind'], Ctor> = {
  belt: BeltEntity,
  drill: DrillEntity,
  furnace: FurnaceEntity,
  inserter: InserterEntity,
  container: ContainerEntity,
  pipe: PipeEntity,
  'offshore-pump': PumpEntity,
  boiler: BoilerEntity,
  generator: GeneratorEntity,
  pole: PoleEntity,
  assembler: AssemblerEntity,
  lab: LabEntity,
  underground: UndergroundEntity,
  splitter: SplitterEntity,
  'pipe-ground': PipeGroundEntity,
  pump: FluidPumpEntity,
  tank: TankEntity,
  lamp: LampEntity,
  pumpjack: PumpjackEntity,
  solar: SolarEntity,
  accumulator: AccumulatorEntity,
  beacon: BeaconEntity,
  roboport: RoboportEntity,
  'rocket-silo': RocketSiloEntity,
  radar: RadarEntity,
  combinator: CombinatorEntity,
  rail: RailEntity,
  'train-stop': TrainStopEntity,
  turret: TurretEntity,
  wall: WallEntity,
  reactor: ReactorEntity,
  'heat-pipe': HeatPipeEntity,
  'heat-exchanger': HeatExchangerEntity,
  wire: HazardEntity,
  trap: HazardEntity,
  bed: BedEntity,
  producer: ProducerEntity,
  radio: RadioEntity,
  loot: LootEntity,
};
