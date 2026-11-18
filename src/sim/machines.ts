/**
 * Schnittstelle zu den Gebäudeklassen (src/sim/entities/) für Welt, Renderer, HUD und Tests.
 */
import { ITEMS, ITEM_IDS } from '../data/items';
import type { InsertMode } from './entities/base';
import { BeltEntity, ContainerEntity, DrillEntity, FurnaceEntity } from './entities/basic';
import { HALF_TURN, InserterEntity, InserterPhase } from './entities/inserter';
import { FluidPumpEntity, LampEntity, PipeGroundEntity, TankEntity } from './entities/fluidplus';
import { SplitterEntity, UndergroundEntity } from './entities/logistics';
import { AssemblerEntity, BeaconEntity, LabEntity } from './entities/production';
import { RoboportEntity } from './entities/robots';
import { CombinatorEntity, RadarEntity } from './entities/rocket';
import { TurretEntity, WallEntity } from './entities/military';
import { BedEntity, CampEntity, FireEntity, HazardEntity, LootEntity, PileEntity, ProducerEntity, PropEntity, RadioEntity } from './entities/survival';

export { BedEntity, CampEntity, FireEntity, HazardEntity, LootEntity, PileEntity, PropEntity, ProducerEntity, RadioEntity, TurretEntity, WallEntity };
import { AccumulatorEntity, BoilerEntity, GeneratorEntity, PipeEntity, PoleEntity, PumpEntity, SolarEntity } from './entities/power';

export { AccumulatorEntity, BeaconEntity, CombinatorEntity, RadarEntity, RoboportEntity, SolarEntity };
export { AssemblerEntity, FluidPumpEntity, LabEntity, LampEntity, PipeGroundEntity, SplitterEntity, TankEntity, UndergroundEntity };
export { BeltEntity, BoilerEntity, ContainerEntity, DrillEntity, FurnaceEntity, GeneratorEntity, HALF_TURN, InserterEntity, InserterPhase, PipeEntity, PoleEntity, PumpEntity };
export type { InsertMode };

export type Entity =
  | BeltEntity | DrillEntity | FurnaceEntity | InserterEntity | ContainerEntity
  | PipeEntity | PumpEntity | BoilerEntity | GeneratorEntity | PoleEntity | AssemblerEntity | LabEntity | UndergroundEntity | SplitterEntity
  | PipeGroundEntity | FluidPumpEntity | TankEntity | LampEntity | SolarEntity | AccumulatorEntity | BeaconEntity | RoboportEntity | RadarEntity | CombinatorEntity
  | TurretEntity | WallEntity
  | HazardEntity | BedEntity | ProducerEntity | RadioEntity | LootEntity | PileEntity | FireEntity | CampEntity | PropEntity;

export function itemIndex(id: string): number {
  const i = ITEM_IDS.indexOf(id);
  if (i < 0) throw new Error(`Unbekanntes Item ${id}`);
  return i;
}
export function itemId(index: number): string {
  return ITEM_IDS[index];
}

export function acceptAmount(e: Entity, item: string, mode: InsertMode): number {
  return e.acceptAmount(item, mode);
}

export function insertInto(e: Entity, item: string, amount: number, mode: InsertMode): number {
  return e.insert(item, amount, mode);
}

export function entityContents(e: Entity): { item: string; count: number }[] {
  return e.contents();
}

export function stackSize(item: string): number {
  return ITEMS[item]?.stackSize ?? 1;
}
