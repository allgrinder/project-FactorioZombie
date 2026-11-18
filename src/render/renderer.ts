import { FLOOR_BY_ID } from '../data/floors';
import { RAILWAY, roadPaths } from '../data/world';
import { Application, Container, type Filter, Graphics, Sprite, Texture } from 'pixi.js';
import { BELT } from '../data/belt';
import { type DrillDef, type InserterDef, type PoleDef, entityDef, sizeOf } from '../data/entities';
import { DECOR_MIN_ZOOM_SMALL, TREE_GROUPS, TREE_GROUP_IDS, TREE_PATCH } from '../data/decor';
import { valueNoise as noise2 } from './biome';
import { MAPGEN } from '../data/mapgen';
import { RESOURCE_BY_INDEX, densityLevel } from '../data/resources';
import { BeltSystem, Shape } from '../sim/belts';
import { Status } from '../sim/entity';
import { DX, DY, type Dir, rotateVec } from '../sim/geom';
import { type Entity, InserterPhase, itemId } from '../sim/machines';
import { drillAreaTiles, drillOutputPoint } from '../sim/entities/basic';
import { CircuitSystem } from '../sim/circuit';
import type { World } from '../sim/world';
import type { SpriteLib } from './assets';
import { BiomeField } from './biome';
import { DecorField } from './decor';
import { HOUSES, LOOK, SEASON_GROUND, TRAILS, VIGNETTE, WIND } from '../data/look';
import { AdvancedBloomFilter } from 'pixi-filters';
import type { GameEvent } from '../sim/events';
import { PLAYER_COMBAT, UNITS, type UnitKind } from '../data/enemies';
import { DROPS } from '../data/loot';
import { COMMUNITY, type Job, JOBS, SURVIVOR } from '../data/scavenge';

/** Dach über begehbaren Häusern: Anhebung um die Wandhöhe (0,8 × tan 30°) und Überstand (Felder). */
const ROOF_LIFT = 0.46;
const ROOF_OVERHANG = 0.18;

/** Farben multiplizieren (Tönung kombinieren). */
function mulTint(a: number, b: number): number {
  const r = (((a >> 16) & 255) * ((b >> 16) & 255)) / 255;
  const g = (((a >> 8) & 255) * ((b >> 8) & 255)) / 255;
  const bl = ((a & 255) * (b & 255)) / 255;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}

/** Kleidung der Zombies und Menschen (Vielfalt), Herbstlaub, Hausfarben je Bauart und Dach. */
const ZOMBIE_TINTS = [0xffffff, 0xe6ccb8, 0xb8c6dc, 0xdcb0a8, 0xc8d2b0, 0xd8d8d2, 0xb4a490, 0xeedcc4, 0xc0b0c8];
const PEOPLE_TINTS = [0xffffff, 0xeedcc8, 0xd0dcec, 0xe8c8c0, 0xd8e4cc, 0xe0e0e0];
const AUTUMN = [0xf0c070, 0xe8a060, 0xd88a58, 0xf0d888, 0xd8b070, 0xe0e0a0];
/** Hausböden je Haus: Dielen (hell bis dunkel), Fliesen (Weiß, Beige, Grün, Blau). */
const FLOOR_TINTS = { planks: [0xffffff, 0xe8d8c4, 0xc8b49c, 0xf0e4d4, 0xb8a088], tiles: [0xffffff, 0xece4d4, 0xd4e0d0, 0xd0dce8, 0xe8d8d0] };

const WALL_TINTS: Record<string, number[]> = {
  plaster: [0xffffff, 0xf6e8c0, 0xecd2c4, 0xd8e0ea, 0xe2ecd6, 0xf2d8b0, 0xe8e4dc],
  brick: [0xffffff, 0xecd4cc, 0xdcc8c0, 0xf0e0d0],
  wood: [0xffffff, 0xc8bcb0, 0xbccab4, 0xd4c0a0, 0xb0b8c8],
  concrete: [0xffffff, 0xe8e4dc, 0xd8dce0],
};
const ROOF_TINTS: Record<string, number[]> = {
  tile: [0xffffff, 0xecccb8, 0xdcb2a2, 0xc8a284, 0xf0d8c0],
  slate: [0xffffff, 0xccd4dc, 0xbcbcca, 0xd8d0c8],
  metal: [0xffffff, 0xd4bca4, 0xbccac4, 0xc8b0a0],
  flat: [0xffffff, 0xe0dcd4, 0xd0d4d8, 0xd8ccb4, 0x9e9a92, 0xc4ccb4, 0xb8b0a4],
};

/** Kleidung je Aufgabe (Tönung der Arbeiterfigur). */
const JOB_TINT: Record<Job, number> = { scavenge: 0xffffff, loot: 0xc8b8a0, guard: 0x9fb0c8, farm: 0xd8e8a8, repair: 0xf0d098, medic: 0xf4eeee, rest: 0xc8c0b8 };

/** Ersatzfarben der Zombies, solange die Sprites fehlen (Kreise in drawCombat). */
const ZOMBIE_COLOR: Record<UnitKind, number> = { walker: 0x6f7f4a, runner: 0x9a6a3a, brute: 0x4a5a3a, screamer: 0x8a4a6a, crawler: 0x5a5048 };
import { CloudShadows } from './clouds';
import { bloomEnabled, gradeFilter, lookEnabled } from './look';
import { NightLayer } from './night';
import { UNUSED, type FluidBox, fluidSummary, isFluidHolder } from '../sim/fluids';
import { FLUIDS, FLUID_UNIT, visibleFluidColor } from '../data/fluids';
import { EntityLife } from './life';
import { HeatHaze } from './haze';
import { HAZE } from '../data/fx';
import { Effects } from './effects';
import { AmbientLife, burningWreck } from './ambient';
import { ParticlePool, SpritePool } from './pools';

export const TILE = 64;
/** Bewegtes Wasser: Ticks je Bild der Lichtreflexe (16 Bilder) und des Uferschaums (8 Bilder). */
const GLINT_TICKS = 6;
const FOAM_TICKS = 9;

export interface Ghost {
  name: string;
  x: number;
  y: number;
  dir: Dir;
  ok: boolean;
}

export interface RenderUi {
  ghost: Ghost | null;
  /** Weitere Vorschau-Geister (Blaupause im Cursor). */
  ghosts?: Ghost[];
  /** Auswahlrechteck (Felder, x1/y1 exklusiv); cut = Ausschneiden (rot). */
  selection?: { x0: number; y0: number; x1: number; y1: number; cut?: boolean } | null;
  /** Bereiche der Roboterhangars zeigen (Hangar/Logistikkiste im Cursor oder unter der Maus). */
  robotAreas?: boolean;
  /** Stromnetz zeigen (Mast im Cursor oder unter der Maus): Versorgungsflächen, Kabelvorschau für pole. */
  power?: { pole: Ghost | null } | null;
  /** Bohrer im Cursor oder unter der Maus: Abbaufelder und Ausgabestelle zeigen. */
  drill?: Ghost | null;
  /** Greifarm im Cursor oder unter der Maus: woher er nimmt (grün) und wohin er legt (gelb). */
  inserter?: Ghost | null;
  /** Bodenbelag in der Hand: Pinselquadrat (Felder). */
  floorBrush?: { x: number; y: number; n: number } | null;
  /** Wurfgegenstand in der Hand: Reichweite um die Figur, Zielkreis (Wirkradius) an der Maus. */
  throwAim?: { px: number; py: number; range: number; radius: number; x: number; y: number } | null;
  /** Drahtwerkzeug: Vorschau vom ersten Anschluss zur Maus (Felder). */
  wire?: { color: 'red' | 'green'; from: { x: number; y: number } | null; to: { x: number; y: number } } | null;
  alt: boolean;
  /** Markierung unter dem Cursor (Feldrechteck). */
  hover: { x: number; y: number; w: number; h: number } | null;
  /** Flüssigkeitsanschlüsse mit Pfeil und Symbol zeigen (Rohr o. Ä. in der Hand; Alt-Ansicht zeigt sie immer). */
  fluidPorts?: boolean;
  /** Abbaufortschritt 0..1 am Hover-Ziel. */
  mining: number;
}

const SHAPE_KEY = ['s', 'l', 'r'];
/** Items auf Bändern und in Greifarmen: Größe und dunkle Kontur (Lesbarkeit aus der Entfernung). */
const ITEM_SCALE_BELT = 0.5;
const ITEM_OUTLINE = { scale: 1.16, alpha: 0.6 };

/** Pflanzen-Deko, die mit der Jahreszeit die Farbe wechselt. */
/** Belag „Acker“ (src/data/floors.ts) und Feldfrüchte (models/flur.py). */
const CROP_FLOOR = 8;
const CROPS = ['wheat', 'maize', 'sunflower', 'beet'] as const;

/** Anteil der Häuser mit gemaltem Hilferuf auf dem Dach. */
const PAINT_SHARE = 0.08;

/** Flecken auf Flachdächern. */
const ROOF_GRIME = ['decal.weeds', 'decal.leaves', 'decal.weeds', 'decal.trash'] as const;

/** Flecken, die auch auf Straße, Gehweg und Hausboden liegen. */
const URBAN_DECALS = new Set(['blood', 'trash', 'burnt', 'tracks', 'puddle', 'weeds', 'leaves', 'papers', 'glass']);
const BUSHY = new Set(['rocks', 'shrub', 'thicket', 'bramble', 'boulder']);
const LEAFY = new Set(['shrub', 'fern', 'bramble', 'thicket', 'tallgrass', 'wild', 'reed']);

export class Camera {
  x = 0;
  y = 0;
  zoom = 1;
  minZoom = 0.25;
  maxZoom = 3;
}

/** Boden-Decal unter Gebäuden (Einbindung in die Landschaft). */
const GROUND_DECAL: Partial<Record<string, string>> = {
  drill: 'decal.dirt',
  furnace: 'decal.dirt',
  boiler: 'decal.dirt',
  generator: 'decal.gravel',
  assembler: 'decal.gravel',
  lab: 'decal.gravel',
};

/** Sprite-Präfix je Greifarm. */
const INSERTER_PREFIX: Record<string, string> = {
  'burner-inserter': 'inserter',
  inserter: 'inserter-electric',
  'long-handed-inserter': 'inserter-long',
  'fast-inserter': 'inserter-fast',
  'bulk-inserter': 'inserter-bulk',
};

export class GameRenderer {
  readonly app: Application;
  readonly camera = new Camera();
  private readonly root = new Container();
  private readonly groundLayer = new Container();
  private ground!: ParticlePool;
  private res!: ParticlePool;
  private water: ParticlePool | null = null;
  private waterTex: Texture[][] = [];
  /** Bewegtes Wasser: Lichtreflexe (je Feldparität × Bild) und Uferschaum (je Fall × Variante × Bild). */
  private readonly waterFx = new SpritePool();
  private glintTex: Texture[][] = [];
  private foamTex = new Map<string, Texture[]>();
  private readonly decals = new SpritePool();
  /** Bodenbeläge (Steinpflaster, Beton …) über Boden und Decals, unter Erz und Gebäuden. */
  private readonly floorPool = new SpritePool();
  /** Flecken auf Belägen (Blut, Müll, Unkraut in Ritzen, Ruß in ausgebrannten Häusern). */
  private readonly floorDecals = new SpritePool();
  private readonly roadPool = new SpritePool();
  /** Wetter: Partikel (Regen, Schnee), Nebel- und Blitz-Schleier (nur Darstellung). */
  private readonly weatherPool = new SpritePool();
  /** Schneedecke im Winter (in der Bodengruppe, unter Gebäuden). */
  private readonly snowCover = new Sprite(Texture.WHITE);
  private readonly weatherDrops: { x: number; y: number; s: number }[] = [];
  private flash = 0;
  private readonly groundItems = new SpritePool();
  private decor: DecorField | null = null;
  private decorMap: unknown = null;
  private belts!: ParticlePool;
  private items!: ParticlePool;
  private readonly shadows = new SpritePool();
  private readonly ents = new SpritePool();
  private readonly glow = new SpritePool();
  private readonly fxPool = new SpritePool();
  private readonly fxAddPool = new SpritePool();
  private readonly ambientPool = new SpritePool();
  private readonly ambientGlow = new SpritePool();
  ambient: AmbientLife | null = null;
  private effects: Effects | null = null;
  private readonly cloudPool = new SpritePool();
  private clouds: CloudShadows | null = null;
  private night: NightLayer | null = null;
  private readonly life = new EntityLife();
  private haze: HeatHaze | null = null;
  /** Filter der Welt ohne Hitzeflimmern. */
  private rootFilters: Filter[] = [];
  private hazeOn = false;
  /** Blickrichtung der Figur (0..7, 0 = Norden, im Uhrzeigersinn). */
  private playerDir = 4;
  private readonly icons = new SpritePool();
  private readonly overlay = new Graphics();
  /** Hintergrundscheiben der Alt-Symbole (unter den Symbolen). */
  private readonly altBg = new Graphics();
  private readonly wires = new Graphics();
  /** Schatten der Stromkabel am Boden (unter den Gebäuden). */
  private readonly wireShadows = new Graphics();
  private readonly ghostSprites = new SpritePool();
  /** Boden ist eine periodische Fläche aus groundPeriod×groundPeriod Kacheln. */
  private groundPeriod = 1;
  private readonly groundTex: Texture[] = [];
  /** Bandbilder je Geschwindigkeit: [Form*4+Richtung] -> Frames. */
  private readonly beltTex = new Map<number, Texture[][]>();
  /** Endkappen je Geschwindigkeit: [Ende 0..3, Anfang 0..3] */
  private readonly capTex = new Map<number, Texture[]>();
  private readonly resCache = new Map<number, Texture>();
  private resVariants = 4;

  /** Raster-Verzeichnis der Gebäude (16×16 Felder), neu bei Bauänderungen: nur Sichtbares durchlaufen. */
  private gridVersion = -1;
  private gridWorld: World | null = null;
  private readonly grid = new Map<number, Entity[]>();
  private visFrame: Entity[] = [];
  private visKey = '';
  visibleEntities(world: World, v: { x0: number; y0: number; x1: number; y1: number }): Entity[] {
    const G = 16;
    if (this.gridVersion !== world.structureVersion || this.gridWorld !== world) {
      this.grid.clear();
      for (const e of world.entities.values()) {
        const k = Math.floor(e.x / G) * 100003 + Math.floor(e.y / G);
        let list = this.grid.get(k);
        if (!list) this.grid.set(k, (list = []));
        list.push(e);
      }
      this.gridVersion = world.structureVersion;
      this.gridWorld = world;
      this.visKey = '';
    }
    const M = 10; // größte Gebäudebreite (Raketensilo 9)
    const gx0 = Math.floor((v.x0 - M) / G);
    const gy0 = Math.floor((v.y0 - M) / G);
    const gx1 = Math.floor(v.x1 / G);
    const gy1 = Math.floor(v.y1 / G);
    const key = `${gx0},${gy0},${gx1},${gy1},${world.tick}`;
    if (key === this.visKey) return this.visFrame;
    const out: Entity[] = [];
    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const list = this.grid.get(gx * 100003 + gy);
        if (!list) continue;
        for (const e of list) if (!(e.x + e.w < v.x0 || e.x > v.x1 || e.y + e.h < v.y0 || e.y > v.y1)) out.push(e);
      }
    }
    // feste Reihenfolge wie world.entities (nach ID), damit Sprites nicht springen
    out.sort((a, b) => a.id - b.id);
    this.visFrame = out;
    this.visKey = key;
    return out;
  }

  private resTex(res: number, id: string, variant: number, lvl: number): Texture {
    const key = res * 64 + variant * 8 + lvl;
    let t = this.resCache.get(key);
    if (!t) this.resCache.set(key, (t = this.sprites.frame(`res.${id}.${variant}.${lvl}`)));
    return t;
  }
  private readonly tmp = { x: 0, y: 0 };
  stats = { ground: 0, decor: 0, belts: 0, items: 0, entities: 0 };

  private constructor(app: Application, readonly sprites: SpriteLib) {
    this.app = app;
  }

  static async create(parent: HTMLElement, sprites: SpriteLib): Promise<GameRenderer> {
    const app = new Application();
    await app.init({
      resizeTo: parent,
      background: '#1d1b17',
      antialias: false,
      autoDensity: true,
      resolution: Math.min(2, window.devicePixelRatio || 1),
      preference: 'webgl',
    });
    parent.appendChild(app.canvas);
    // Vignette: Bildränder leicht abgedunkelt (DOM-Ebene über der Welt, lässt Klicks durch)
    if (lookEnabled()) {
      const vg = document.createElement('div');
      vg.className = 'vignette';
      vg.style.cssText = `position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at center, rgba(0,0,0,0) ${VIGNETTE.inner}%, rgba(12,9,6,${VIGNETTE.alpha}) 100%)`;
      parent.appendChild(vg);
    }
    const r = new GameRenderer(app, sprites);
    r.init();
    return r;
  }

  private init(): void {
    const s = this.sprites;
    this.ground = new ParticlePool(s.frame('ground.0.0'));
    this.res = new ParticlePool(s.frame('ground.0.0'));
    if (s.has('water.15.0')) {
      this.water = new ParticlePool(s.frame('water.15.0'));
      for (let c = 0; c < 16; c++) {
        const list: Texture[] = [];
        for (let v = 0; s.has(`water.${c}.${v}`); v++) list.push(s.frame(`water.${c}.${v}`));
        this.waterTex.push(list);
      }
    }
    for (let q = 0; q < 4; q++) {
      const list: Texture[] = [];
      for (let f = 0; s.has(`water.glint.${q}.${f}`); f++) list.push(s.frame(`water.glint.${q}.${f}`));
      this.glintTex.push(list);
    }
    for (let c = 1; c < 15; c++) {
      for (let v = 0; s.has(`water.foam.${c}.${v}.0`); v++) {
        const list: Texture[] = [];
        for (let f = 0; s.has(`water.foam.${c}.${v}.${f}`); f++) list.push(s.frame(`water.foam.${c}.${v}.${f}`));
        this.foamTex.set(`${c}.${v}`, list);
      }
    }
    this.belts = new ParticlePool(s.frame('belt.s.0'));
    this.items = new ParticlePool(s.frame('item.iron-ore'));
    this.glow.container.blendMode = 'add';
    this.fxAddPool.container.blendMode = 'add';
    this.effects = new Effects(s, this.fxPool, this.fxAddPool, TILE);
    this.ambient = new AmbientLife(s, TILE);
    this.ambientGlow.container.blendMode = 'add';
    this.clouds = new CloudShadows(s, this.cloudPool, TILE);
    this.night = new NightLayer(s, this.app.renderer, TILE);
    this.ents.container.sortableChildren = true;
    this.ghostSprites.container.alpha = 0.55;
    // Bodenebenen in eigener Gruppe (eigene Farbabstimmung, data/look.ts)
    this.groundLayer.addChild(
      this.ground.container,
      ...(this.water ? [this.water.container, this.waterFx.container] : []),
      this.decals.container,
      this.roadPool.container,
      this.floorPool.container,
      this.floorDecals.container,
      this.snowCover,
      this.res.container,
    );
    if (lookEnabled()) {
      // Leuchten: Glut, Lampen, Funken und Mündungsfeuer strahlen über ihre Fläche hinaus
      // Ergebnis additiv mischen (sonst verdecken die schwarzen Leuchtbild-Ränder die Gebäude)
      const bloom = () => {
        const f = new AdvancedBloomFilter(LOOK.bloom);
        f.blendMode = 'add';
        return f;
      };
      if (bloomEnabled()) {
        this.glow.container.filters = [bloom()];
        this.fxAddPool.container.filters = [bloom()];
      }
      this.groundLayer.filters = [gradeFilter(LOOK.ground)];
      this.root.filters = [gradeFilter(LOOK.world)];
      this.rootFilters = [...(this.root.filters as Filter[])];
      // Hitzeflimmern nur mit eingeschalteten Leuchteffekten (Leistung)
      if (bloomEnabled()) {
        this.haze = new HeatHaze(this.app.renderer, TILE);
        this.root.addChild(this.haze.mapSprite);
      }
    }
    this.root.addChild(
      this.groundLayer,
      this.groundItems.container,
      this.belts.container,
      this.items.container,
      this.wireShadows,
      this.shadows.container,
      this.ents.container,
      this.fxPool.container,
      this.ambientPool.container,
      this.wires,
      // Nachtlicht multipliziert alles darunter; Leuchten und Funken bleiben darüber hell
      this.night!.sprite,
      this.glow.container,
      this.fxAddPool.container,
      this.ambientGlow.container,
      this.cloudPool.container,
      this.weatherPool.container,
      this.ghostSprites.container,
      this.altBg,
      this.icons.container,
      this.overlay,
    );
    this.shadows.container.alpha = lookEnabled() ? LOOK.shadowAlpha : 0.5;
    this.app.stage.addChild(this.root);
    while (s.has(`ground.${this.groundPeriod}.0`)) this.groundPeriod++;
    const gp = this.groundPeriod;
    for (let y = 0; y < gp; y++) for (let x = 0; x < gp; x++) this.groundTex[x + gp * y] = s.frame(`ground.${x}.${y}`);
    while (s.has(`res.iron-ore.${this.resVariants}.0`)) this.resVariants++;
    // Bandstufen: Präfix der Sprites je Geschwindigkeit (fehlt eine Stufe, wird das gelbe Band genutzt)
    for (const [speed, prefix] of [[BELT.speed, 'belt'], [BELT.speed * 2, 'fast-belt'], [BELT.speed * 3, 'express-belt']] as const) {
      const pre = s.has(`${prefix}.s.0`) ? prefix : 'belt';
      const tex: Texture[][] = [];
      for (let sh = 0; sh < 3; sh++) for (let d = 0; d < 4; d++) tex[sh * 4 + d] = s.frames(`${pre}.${SHAPE_KEY[sh]}.${d}`);
      this.beltTex.set(speed, tex);
      const caps: Texture[] = [];
      if (s.has(`${pre}.cap.end.0`)) for (const k of ['end', 'start']) for (let d = 0; d < 4; d++) caps.push(s.frame(`${pre}.cap.${k}.${d}`));
      this.capTex.set(speed, caps);
    }
  }

  /** Bildschirm -> Weltkoordinaten (Felder). */
  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    const c = this.camera;
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    return { x: c.x + (sx - w / 2) / (TILE * c.zoom), y: c.y + (sy - h / 2) / (TILE * c.zoom) };
  }

  viewRect(): { x0: number; y0: number; x1: number; y1: number } {
    const a = this.screenToWorld(0, 0);
    const b = this.screenToWorld(this.app.screen.width, this.app.screen.height);
    return { x0: Math.floor(a.x) - 2, y0: Math.floor(a.y) - 3, x1: Math.ceil(b.x) + 2, y1: Math.ceil(b.y) + 2 };
  }

  /** Ereignisse der Simulation (Explosionen usw.) an die Effekte geben. */
  onEvents(events: readonly GameEvent[]): void {
    for (const ev of events) if (ev.type === 'build' && ev.id !== undefined) this.life.built(ev.id);
    this.effects?.onEvents(events);
  }

  render(world: World, alpha: number, ui: RenderUi): void {
    const c = this.camera;
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    this.root.scale.set(c.zoom);
    this.root.position.set(Math.round(w / 2 - c.x * TILE * c.zoom), Math.round(h / 2 - c.y * TILE * c.zoom));
    const view = this.viewRect();
    if (this.ambient) this.ambient.smokers.length = 0;
    this.drawGround(world, view);
    this.drawBelts(world, view, alpha);
    this.drawItems(world, view, alpha);
    this.drawEntities(world, view, alpha, ui);
    this.drawWires(world, view, ui);
    this.effects?.update(world, alpha, view);
    this.ambient?.update(world, alpha, view, this.ambientPool, this.ambientGlow);
    this.clouds?.update(world, alpha, view);
    if (this.night) {
      // Nachtlicht über Gebäuden und Rauch, unter Leuchten, Bauvorschau, Symbolen und Overlay
      const a = (this.playerDir * Math.PI) / 4;
      this.night.update(world, c, w, h, this.root, this.ents, { x: Math.sin(a), y: -Math.cos(a) });
      this.night.sprite.position.set(-this.root.x / c.zoom, -this.root.y / c.zoom);
      this.night.sprite.scale.set(1 / c.zoom);
    }
    if (this.haze) {
      this.haze.update(world, c, w, h, (world.tick + alpha) / 60);
      this.haze.mapSprite.position.set(-this.root.x / c.zoom, -this.root.y / c.zoom);
      this.haze.mapSprite.scale.set(HAZE.downscale / c.zoom);
      if (this.haze.active !== this.hazeOn) {
        this.hazeOn = this.haze.active;
        this.root.filters = this.hazeOn ? [this.haze.filter, ...this.rootFilters] : this.rootFilters;
      }
    }
    this.drawWeather(world, view);
    this.drawOverlay(world, ui);
  }

  /**
   * Wetter: Regen- bzw. Schneepartikel über dem sichtbaren Ausschnitt, Nebelschleier, Blitze im Gewitter; im Winter
   * ein kühler, heller Boden (Schnee).
   */
  private drawWeather(world: World, v: ReturnType<GameRenderer['viewRect']>): void {
    const p = this.weatherPool;
    p.begin();
    const wk = world.weather.kind;
    const winter = world.weather.winter;
    this.snowCover.visible = winter;
    if (winter) {
      this.snowCover.tint = 0xeef2f6;
      this.snowCover.alpha = world.weather.kind === 'snow' ? 0.55 : 0.4;
      this.snowCover.position.set((v.x0 - 1) * TILE, (v.y0 - 1) * TILE);
      this.snowCover.width = (v.x1 - v.x0 + 2) * TILE;
      this.snowCover.height = (v.y1 - v.y0 + 2) * TILE;
    }
    const s = this.sprites;
    const w = v.x1 - v.x0;
    const h = v.y1 - v.y0;
    const rain = wk === 'rain' || wk === 'storm';
    const snow = wk === 'snow';
    const want = rain ? (wk === 'storm' ? 420 : 260) : snow ? 220 : 0;
    const drops = this.weatherDrops;
    while (drops.length < want) drops.push({ x: v.x0 + Math.random() * w, y: v.y0 + Math.random() * h, s: 0.6 + Math.random() * 0.8 });
    drops.length = want;
    if (want && (rain ? s.has('fx.rain') : s.has('fx.snow.0'))) {
      for (const d of drops) {
        if (rain) {
          d.x -= 0.05 * d.s;
          d.y += 0.55 * d.s;
        } else {
          d.x += Math.sin((d.y + d.s * 10) * 0.7) * 0.02;
          d.y += 0.05 * d.s;
        }
        if (d.y > v.y1 + 1) d.y -= h + 2;
        if (d.x < v.x0 - 1) d.x += w + 2;
        if (d.x > v.x1 + 1) d.x -= w + 2;
        if (d.y < v.y0 - 1) d.y += h + 2;
        const sp = p.get(s.frame(rain ? 'fx.rain' : `fx.snow.${Math.floor(d.s * 10) % 3}`));
        sp.position.set(d.x * TILE, d.y * TILE);
        sp.rotation = rain ? 0.09 : 0;
        sp.alpha = rain ? 0.45 : 0.9;
        sp.scale.set(rain ? d.s : 0.8 + d.s * 0.4);
      }
    }
    // Nebel, Regenschleier, Blitz
    const veil = wk === 'fog' ? 0.24 : wk === 'storm' ? 0.16 : wk === 'rain' ? 0.1 : wk === 'snow' ? 0.08 : 0;
    if (wk === 'storm' && Math.random() < 0.004) this.flash = 0.55;
    this.flash *= 0.9;
    // Schleier liegt über der Nachtebene: nachts entsprechend dunkler (sonst leuchtet Nebel in der Nacht)
    const nk = Math.round(255 * (1 - 0.88 * world.darkness));
    const veilTint = mulTint(wk === 'fog' ? 0xc8ccd0 : 0x6a7280, (nk << 16) | (nk << 8) | nk);
    for (const [a, tint] of [[veil, veilTint], [this.flash, 0xffffff]] as const) {
      if (a < 0.01) continue;
      const sp = p.get(Texture.WHITE);
      sp.anchor.set(0);
      sp.tint = tint;
      sp.alpha = a;
      sp.position.set((v.x0 - 1) * TILE, (v.y0 - 1) * TILE);
      sp.width = (w + 2) * TILE;
      sp.height = (h + 2) * TILE;
    }
    p.end();
  }

  // ------------------------------------------------------------------ Boden

  private drawGround(world: World, v: ReturnType<GameRenderer['viewRect']>): void {
    const g = this.ground;
    const rp = this.res;
    g.begin();
    rp.begin();
    const CS = MAPGEN.chunkSize;
    // Jahreszeit und Nässe: bei Regen und Sturm dunkler, kühler (nasser Boden)
    const wk = world.settings.plan ? world.weather.kind : 'clear';
    const sg = mulTint(SEASON_GROUND[world.settings.plan ? world.weather.season(world.tick) : 'summer'], wk === 'rain' ? 0xd2d6da : wk === 'storm' ? 0xc4c8ce : 0xffffff);
    for (let cy = Math.floor(v.y0 / CS); cy <= Math.floor(v.y1 / CS); cy++) {
      for (let cx = Math.floor(v.x0 / CS); cx <= Math.floor(v.x1 / CS); cx++) {
        const chunk = world.map.getChunk(cx, cy);
        const tx0 = Math.max(v.x0, cx * CS);
        const tx1 = Math.min(v.x1, cx * CS + CS - 1);
        const ty0 = Math.max(v.y0, cy * CS);
        const ty1 = Math.min(v.y1, cy * CS + CS - 1);
        for (let ty = ty0; ty <= ty1; ty++) {
          for (let tx = tx0; tx <= tx1; tx++) {
            const i = (ty - cy * CS) * CS + (tx - cx * CS);
            const px = tx * TILE + TILE / 2;
            const py = ty * TILE + TILE / 2;
            const gp = this.groundPeriod;
            g.push(this.groundTex[(((tx % gp) + gp) % gp) + gp * (((ty % gp) + gp) % gp)], px, py, 1, 1, 0, mulTint(this.biomeField(world).color(tx, ty), sg));
            const res = chunk.resource[i];
            if (res) {
              const def = RESOURCE_BY_INDEX[res]!;
              const lvl = densityLevel(def, chunk.amount[i]);
              const variant = (chunk.ground[i] >> 3) % this.resVariants;
              const h = chunk.ground[i];
              const hh = (h * 2654435761) >>> 0;
              const rot = (((hh >>> 8) & 255) / 255 - 0.5) * 1.0;
              const sc = 0.88 + ((hh >>> 16) & 255) / 255 * 0.26;
              rp.push(this.resTex(res, def.id, variant, lvl), px + ((h & 7) - 3.5) * 1.6, py + (((h >> 5) & 7) - 3.5) * 1.6, sc, 1, rot);
            }
          }
        }
      }
    }
    g.end();
    rp.end();
    this.stats.ground = g.count + rp.count;
    this.drawWater(world, v);
    this.drawDecals(world, v);
    this.drawRoads(world, v);
    this.drawFloors(world, v);
    this.drawGroundItems(world, v);
  }

  // ------------------------------------------------------------------ Items auf dem Boden

  private drawGroundItems(world: World, v: ReturnType<GameRenderer['viewRect']>): void {
    const p = this.groundItems;
    p.begin();
    if (world.ground.size) {
      const shadow = this.sprites.has('item.shadow') ? this.sprites.frame('item.shadow') : null;
      for (const list of world.ground.values()) {
        for (const g of list) {
          const x = g.x / 256;
          const y = g.y / 256;
          if (x < v.x0 || x > v.x1 + 1 || y < v.y0 || y > v.y1 + 1) continue;
          if (shadow) {
            const sh = p.get(shadow);
            sh.position.set(x * TILE + 2, y * TILE + 3);
            sh.alpha = 0.55;
          }
          const sp = p.get(this.sprites.frame(`item.${g.item}`));
          sp.position.set(x * TILE, y * TILE);
          sp.scale.set(ITEM_SCALE_BELT);
        }
      }
    }
    p.end();
  }

  // ------------------------------------------------------------------ Wasser

  /** Wasser nach dem Ecken-Prinzip: ein Sprite je Feldecke, Fall aus den vier Nachbarfeldern. */
  private drawWater(world: World, v: ReturnType<GameRenderer['viewRect']>): void {
    const pool = this.water;
    if (!pool) return;
    pool.begin();
    const fx = this.waterFx;
    fx.begin();
    const t = world.tick;
    const CS = MAPGEN.chunkSize;
    const m = world.map;
    for (let cy = Math.floor(v.y0 / CS); cy <= Math.floor((v.y1 + 1) / CS); cy++) {
      for (let cx = Math.floor(v.x0 / CS); cx <= Math.floor((v.x1 + 1) / CS); cx++) {
        // Ecken dieses Chunks brauchen Wasserinfo des Chunks und seiner Nachbarn links/oben
        if (!m.getChunk(cx, cy).hasWater && !m.getChunk(cx - 1, cy).hasWater && !m.getChunk(cx, cy - 1).hasWater && !m.getChunk(cx - 1, cy - 1).hasWater) continue;
        const x0 = Math.max(v.x0, cx * CS);
        const x1 = Math.min(v.x1 + 1, cx * CS + CS - 1);
        const y0 = Math.max(v.y0, cy * CS);
        const y1 = Math.min(v.y1 + 1, cy * CS + CS - 1);
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            const c = (m.isWater(x - 1, y - 1) ? 1 : 0) | (m.isWater(x, y - 1) ? 2 : 0) | (m.isWater(x - 1, y) ? 4 : 0) | (m.isWater(x, y) ? 8 : 0);
            if (c === 0) continue;
            const list = this.waterTex[c];
            if (!list.length) continue;
            const vi = (((x * 7 + y * 13) % list.length) + list.length) % list.length;
            pool.push(list[vi], x * TILE, y * TILE);
            // Uferschaum auf der Uferlinie (gleiche Variante wie das Ufer), Brandung im eigenen Takt je Ort
            if (c !== 15) {
              const foam = this.foamTex.get(`${c}.${vi}`);
              if (foam?.length) {
                const ph = ((x * 5 + y * 3) & 7);
                const fr = Math.floor(t / FOAM_TICKS + ph) % foam.length;
                const sp = fx.get(foam[fr]);
                sp.position.set(x * TILE, y * TILE);
                sp.blendMode = 'normal';
              }
            }
          }
        }
      }
    }
    pool.end();
    // Lichtschimmer auf dem Wasser, zum Ufer hin über drei Felder ausgeblendet (keine harten Kanten)
    const glint = this.glintTex;
    if (glint.length === 4 && glint[0].length) {
      const fr = Math.floor(t / GLINT_TICKS) % glint[0].length;
      for (let cy = Math.floor(v.y0 / CS); cy <= Math.floor(v.y1 / CS); cy++) {
        for (let cx = Math.floor(v.x0 / CS); cx <= Math.floor(v.x1 / CS); cx++) {
          const c = m.getChunk(cx, cy);
          if (!c.hasWater) continue;
          const dist = this.shoreDistance(world, cx, cy);
          for (let y = Math.max(v.y0, cy * CS); y <= Math.min(v.y1, cy * CS + CS - 1); y++) {
            for (let x = Math.max(v.x0, cx * CS); x <= Math.min(v.x1, cx * CS + CS - 1); x++) {
              const d = dist[(y - cy * CS) * CS + (x - cx * CS)];
              if (!d) continue;
              const sp = fx.get(glint[(x & 1) + 2 * (y & 1)][fr]);
              sp.position.set((x + 0.5) * TILE, (y + 0.5) * TILE);
              sp.blendMode = 'add';
              sp.alpha = Math.min(1, (d - 0.5) / 3);
            }
          }
        }
      }
    }
    fx.end();
  }

  /** Je Wasserfeld eines Chunks: Abstand zum nächsten Land (1 … 4, 0 = Land), zwischengespeichert je Chunk-Version. */
  private readonly shoreCache = new Map<number, { version: number; d: Uint8Array }>();
  private shoreDistance(world: World, cx: number, cy: number): Uint8Array {
    const CS = MAPGEN.chunkSize;
    const m = world.map;
    const c = m.getChunk(cx, cy);
    const key = cx * 100003 + cy;
    const hit = this.shoreCache.get(key);
    if (hit && hit.version === c.version) return hit.d;
    const d = new Uint8Array(CS * CS);
    const R = 4;
    for (let j = 0; j < CS; j++) {
      for (let i = 0; i < CS; i++) {
        const x = cx * CS + i;
        const y = cy * CS + j;
        if (!m.isWater(x, y)) continue;
        let best = R;
        for (let dy = -R + 1; dy < R && best > 1; dy++) {
          for (let dx = -R + 1; dx < R && best > 1; dx++) {
            const k = Math.max(Math.abs(dx), Math.abs(dy));
            if (k < best && !m.isWater(x + dx, y + dy)) best = k;
          }
        }
        d[j * CS + i] = best;
      }
    }
    if (this.shoreCache.size > 400) this.shoreCache.clear();
    this.shoreCache.set(key, { version: c.version, d });
    return d;
  }

  // ------------------------------------------------------------------ Dekoration

  private decorField(world: World): DecorField {
    if (!this.decor || this.decorMap !== world.map) {
      const s = this.sprites;
      const bio = this.biomeField(world);
      this.decor = new DecorField(world.map, world.seed, (prefix) => s.countPrefix(`${prefix}.`), (tx, ty) => bio.fertility(tx, ty));
      this.decorMap = world.map;
    }
    return this.decor;
  }

  private biome: BiomeField | null = null;
  private biomeMap: World['map'] | null = null;
  biomeField(world: World): BiomeField {
    if (!this.biome || this.biomeMap !== world.map) {
      this.biome = new BiomeField(world.map);
      this.biomeMap = world.map;
    }
    return this.biome;
  }

  /** Sichtbare Dekoration je Chunk, mit Rand für große Sprites (Bäume). */
  private *visibleDecor(world: World, v: ReturnType<GameRenderer['viewRect']>, margin: number) {
    const field = this.decorField(world);
    const CS = MAPGEN.chunkSize;
    for (let cy = Math.floor((v.y0 - margin) / CS); cy <= Math.floor((v.y1 + margin) / CS); cy++)
      for (let cx = Math.floor((v.x0 - margin) / CS); cx <= Math.floor((v.x1 + margin) / CS); cx++)
        for (const d of field.chunk(cx, cy)) {
          if (d.x < v.x0 - margin || d.x > v.x1 + margin || d.y < v.y0 - margin || d.y > v.y1 + margin) continue;
          yield d;
        }
  }

  /** Geschwungene Landstraßen und Feldwege: Querschnitts-Stücke entlang der Kurve, gedreht, mit Mittellinie. */
  private drawRoads(world: World, v: ReturnType<GameRenderer['viewRect']>): void {
    const p = this.roadPool;
    p.begin();
    const s = this.sprites;
    if (s.has('road.slice.0')) {
      const m = 3;
      const lay = (pts: readonly number[], ang: readonly number[] | null, prefix: string, dashes: boolean) => {
        const n = pts.length / 2;
        for (let q = 0; q < n; q++) {
          const x = pts[q * 2];
          const y = pts[q * 2 + 1];
          if (x < v.x0 - m || x > v.x1 + m || y < v.y0 - m || y > v.y1 + m) continue;
          const a = ang ? ang[q] : Math.atan2(pts[Math.min(n - 1, q + 1) * 2 + 1] - pts[Math.max(0, q - 1) * 2 + 1], pts[Math.min(n - 1, q + 1) * 2] - pts[Math.max(0, q - 1) * 2]);
          const sp = p.get(s.frame(`${prefix}.${(q * 7 + Math.floor(x)) & 3}`));
          sp.position.set(x * TILE, y * TILE);
          sp.rotation = a;
          if (dashes && q % 4 === 0) {
            const d = p.get(s.frame(`road.dash.${q & 3}`));
            d.position.set((x + Math.cos(a) * 0.25) * TILE, (y + Math.sin(a) * 0.25) * TILE);
            d.rotation = a;
          }
        }
      };
      for (const path of roadPaths()) lay(path.pts, path.ang, 'road.slice', false);
      // Mittellinie in eigenem Durchgang (liegt über allen Stücken)
      for (const path of roadPaths()) {
        const n = path.ang.length;
        for (let q = 0; q < n; q += 4) {
          const x = path.pts[q * 2];
          const y = path.pts[q * 2 + 1];
          if (x < v.x0 - m || x > v.x1 + m || y < v.y0 - m || y > v.y1 + m) continue;
          const a = path.ang[q];
          const d = p.get(s.frame(`road.dash.${q & 3}`));
          d.position.set((x + Math.cos(a) * 0.25) * TILE, (y + Math.sin(a) * 0.25) * TILE);
          d.rotation = a;
        }
      }
      if (s.has('track.slice.0')) for (const t of world.sites.tracks) lay(t, null, 'track.slice', false);
    }
    // Stillgelegte Bahn: Gleisstücke entlang der Strecke (über Straßen: ebenerdiger Übergang, über Wasser: Brücke)
    if (world.settings.plan && s.has('rail.slice.0') && RAILWAY.y >= v.y0 - 3 && RAILWAY.y <= v.y1 + 3) {
      for (let tx = Math.max(v.x0 - 1, RAILWAY.x0); tx < Math.min(v.x1 + 2, RAILWAY.x1); tx++) {
        const sp = p.get(s.frame(`rail.slice.${(Math.imul(tx, 2654435761) >>> 28) & 3}`));
        sp.position.set((tx + 0.5) * TILE, (RAILWAY.y + 0.5) * TILE);
      }
    }
    p.end();
  }

  private drawFloors(world: World, v: ReturnType<GameRenderer['viewRect']>): void {
    const p = this.floorPool;
    p.begin();
    // nasser Asphalt und Pflaster bei Regen dunkler
    const wk = world.settings.plan ? world.weather.kind : 'clear';
    const wetTint = wk === 'rain' ? 0xc6cad0 : wk === 'storm' ? 0xb4b8c0 : 0xffffff;
    p.container.tint = wetTint;
    this.roadPool.container.tint = wetTint;
    const s = this.sprites;
    world.map.floorsIn(v.x0 - 1, v.y0 - 1, v.x1 + 1, v.y1 + 1, (x, y, id) => {
      const def = FLOOR_BY_ID[id];
      if (!def || !def.sprite) return;
      const h = (Math.imul(x * 73856093 ^ y * 19349663, 0x9e3779b1) >>> 0) % 4;
      const name = `${def.sprite}.${h}`;
      if (!s.has(name)) {
        // ohne Grafik: Farbfläche aus der Minimap-Farbe
        const sp = p.get(Texture.WHITE);
        sp.tint = def.mapColor;
        sp.anchor.set(0.5);
        sp.width = TILE;
        sp.height = TILE;
        sp.position.set((x + 0.5) * TILE, (y + 0.5) * TILE);
        return;
      }
      const fs = p.get(s.frame(name));
      fs.position.set((x + 0.5) * TILE, (y + 0.5) * TILE);
      // Hausböden: Holzton bzw. Fliesenfarbe je Haus
      if (id === 11 || id === 12) {
        const hs = this.houseOf(world, x, y);
        if (hs) {
          const pal = id === 11 ? FLOOR_TINTS.planks : FLOOR_TINTS.tiles;
          fs.tint = hs.burnt ? 0x5a5048 : pal[(hs.hue >> 5) % pal.length];
        }
      }
    });
    p.end();
  }

  private drawDecals(world: World, v: ReturnType<GameRenderer['viewRect']>): void {
    const p = this.decals;
    p.begin();
    const q = this.floorDecals;
    q.begin();
    const small = this.camera.zoom >= DECOR_MIN_ZOOM_SMALL;
    const wk = world.settings.plan ? world.weather.kind : 'clear';
    const wet = wk === 'rain' || wk === 'storm' ? 1 : wk === 'snow' ? 0 : 0.35;
    let n = 0;
    for (const d of this.visibleDecor(world, v, 6)) {
      if (d.kind.layer !== 'decal') continue;
      if (!small && d.kind.cell < 6) continue;
      if (!this.sprites.has(`${d.kind.sprite}.${d.variant}`)) continue;
      const onFloor = world.map.floorAt(d.tx, d.ty) !== 0;
      if (d.kind.floor !== undefined && !onFloor) continue;
      if (onFloor && !URBAN_DECALS.has(d.kind.id)) continue;
      const name = `${d.kind.sprite}.${d.variant}`;
      const sp = (onFloor ? q : p).get(this.sprites.frame(name));
      // Pfützen: nach Regen voll, sonst nur feuchte Reste
      if (d.kind.id === 'puddle') sp.alpha = wet;
      sp.position.set(d.x * TILE, d.y * TILE);
      const k = this.sprites.info(name)?.meta?.scale ?? 1;
      sp.scale.set(k * d.sx, k * d.sy);
      sp.rotation = d.rot;
      n++;
    }
    // Trampelpfade: wo Figur und Bewohner oft gehen, wird das Gras zu Erde
    this.wearTrails(world);
    if (this.sprites.has('decal.dirt.0')) {
      for (const [k, wv] of this.wear) {
        if (wv < TRAILS.show) continue;
        const tx = Math.floor(k / 65536) - 32768;
        const ty = (k % 65536) - 32768;
        if (tx < v.x0 - 1 || tx > v.x1 + 1 || ty < v.y0 - 1 || ty > v.y1 + 1) continue;
        if (world.map.floorAt(tx, ty)) continue;
        const hh = ((Math.imul(tx, 73856093) ^ Math.imul(ty, 19349663)) >>> 0);
        const name = `decal.dirt.${hh % 4}`;
        const sp = p.get(this.sprites.frame(name));
        sp.position.set((tx + 0.5) * TILE, (ty + 0.5) * TILE);
        sp.scale.set((this.sprites.info(name)?.meta?.scale ?? 1) * 0.55);
        sp.rotation = (hh >> 8) % 7;
        sp.alpha = Math.min(TRAILS.maxAlpha, (wv - TRAILS.show) * 1.2);
        n++;
      }
    }
    // Teppiche in Wohnhäusern (Dielenboden in der Hausmitte)
    if (this.sprites.has('decal.rug.0')) {
      for (const h of world.sites.houses) {
        if (h.g !== undefined || h.w < 6 || h.h < 5) continue;
        if (h.x > v.x1 + 2 || h.x + h.w < v.x0 - 2 || h.y > v.y1 + 2 || h.y + h.h < v.y0 - 2) continue;
        const rx = Math.floor(h.x + h.w / 2);
        const ry = Math.floor(h.y + h.h / 2);
        if (world.map.floorAt(rx, ry) !== 11) continue;
        const rh = ((Math.imul(h.x, 2654435761) ^ Math.imul(h.y, 40503)) >>> 0) % 100;
        if (rh >= 70) continue;
        const name = `decal.rug.${rh % 4}`;
        const sp = q.get(this.sprites.frame(name));
        sp.position.set(rx * TILE, (ry + 0.5) * TILE);
        sp.scale.set(this.sprites.info(name)?.meta?.scale ?? 1);
        sp.rotation = h.w > h.h ? Math.PI / 2 : 0;
        if (GameRenderer.burnt(h)) sp.tint = 0x3a3430;
        n++;
      }
    }
    // Ausgebrannte Häuser: Ruß und Asche auf dem Boden
    if (this.sprites.has('decal.burnt.0')) {
      for (const h of world.sites.houses) {
        if (h.x > v.x1 + 1 || h.x + h.w < v.x0 - 1 || h.y > v.y1 + 1 || h.y + h.h < v.y0 - 1) continue;
        if (!GameRenderer.burnt(h.g !== undefined ? world.sites.houses[h.g] : h)) continue;
        for (let j = 0; j < h.h; j += 2) for (let i = 0; i < h.w; i += 2) {
          const hh = ((Math.imul(h.x + i, 73856093) ^ Math.imul(h.y + j, 19349663)) >>> 0);
          const name = `decal.burnt.${hh % 3}`;
          const sp = q.get(this.sprites.frame(name));
          sp.position.set((h.x + i + 1) * TILE, (h.y + j + 1) * TILE);
          sp.scale.set(2.2 * (this.sprites.info(name)?.meta?.scale ?? 1));
          sp.rotation = (hh >> 8) % 7;
          sp.alpha = 0.85;
          n++;
        }
      }
    }
    // Waldboden: Laub- bzw. Nadelstreu unter jedem Baum (versetzt in den Kronenschatten)
    if (small && this.sprites.has('decal.litter.0')) {
      const CS = MAPGEN.chunkSize;
      for (let cy = Math.floor((v.y0 - 3) / CS); cy <= Math.floor((v.y1 + 3) / CS); cy++)
        for (let cx = Math.floor((v.x0 - 3) / CS); cx <= Math.floor((v.x1 + 3) / CS); cx++)
          for (const t of world.map.trees.treesIn(cx, cy)) {
            if (t.x < v.x0 - 3 || t.x > v.x1 + 3 || t.y < v.y0 - 3 || t.y > v.y1 + 3) continue;
            if (world.map.floorAt(t.tx, t.ty)) continue;
            const h = (Math.imul(t.tx, 73856093) ^ Math.imul(t.ty, 19349663)) >>> 0;
            const name = `${t.kind === 1 ? 'decal.needles' : 'decal.litter'}.${h % 3}`;
            if (!this.sprites.has(name)) continue;
            const sp = p.get(this.sprites.frame(name));
            sp.position.set((t.x + 0.25) * TILE, (t.y + 0.2) * TILE);
            const k = (this.sprites.info(name)?.meta?.scale ?? 1) * (t.kind === 2 ? 1.6 : 2.4 + ((h >> 6) % 8) * 0.12);
            sp.scale.set(k, k * (0.75 + ((h >> 10) % 5) * 0.06));
            sp.rotation = ((h >> 13) % 628) / 100;
            sp.alpha = 0.6;
            n++;
          }
    }
    // Einbindung: festgetretene Erde bzw. Kies unter größeren Gebäuden
    if (this.sprites.has('decal.dirt.0')) {
      for (const e of this.visibleEntities(world, v)) {
        if (!GROUND_DECAL[e.kind]) continue;
        const h = (Math.imul(e.x * 73856093 ^ e.y * 19349663, 0x9e3779b1) >>> 0);
        const name = `${GROUND_DECAL[e.kind]}.${h % 4}`;
        if (!this.sprites.has(name)) continue;
        const tex = this.sprites.frame(name);
        const sp = p.get(tex);
        sp.position.set(e.cx * TILE, e.cy * TILE);
        const size = Math.max(e.w, e.h) * 1.45 * TILE;
        sp.scale.set(size / tex.width, (Math.min(e.w, e.h) * 1.45 * TILE) / tex.height);
        if (e.h > e.w) sp.scale.set((e.w * 1.45 * TILE) / tex.width, (e.h * 1.45 * TILE) / tex.height);
        sp.rotation = ((h >> 8) % 7 - 3) * 0.05;
        sp.alpha = 0.9;
        n++;
      }
    }
    p.end();
    q.end();
    this.stats.decor = n;
  }

  /** Flora im Gebäude-Layer (nach y sortiert), Schatten in der Schattenebene. Unter Gebäuden ausgeblendet. */
  private drawFlora(world: World, v: ReturnType<GameRenderer['viewRect']>): void {
    const s = this.sprites;
    for (const d of this.visibleDecor(world, v, 7)) {
      if (d.kind.layer !== 'flora') continue;
      if (world.map.isCliff(d.tx, d.ty) || world.map.floorAt(d.tx, d.ty)) continue;
      // Bäume halten Abstand zu Gebäuden (Krone), kleinere Pflanzen nur zum eigenen Feld
      const r = d.kind.id === 'tree' || d.kind.id === 'conifer' ? 2 : BUSHY.has(d.kind.id) ? 1 : 0;
      let blocked = false;
      for (let oy = -r; oy <= r && !blocked; oy++) for (let ox = -r; ox <= r && !blocked; ox++) if (world.entityAt(d.tx + ox, d.ty + oy)) blocked = true;
      if (blocked) continue;
      // Wildblumen und Pilze nicht im Winter, Farne im Winter nur vereinzelt
      if (world.settings.plan && world.weather.season(world.tick) === 'winter' && (d.kind.id === 'wild' || d.kind.id === 'mushroom' || (d.kind.id === 'fern' && (Math.floor(d.x * 5 + d.y * 3) & 3) !== 0))) continue;
      let name = `${d.kind.sprite}.${d.variant}`;
      // Sträucher je Jahreszeit: Herbstlaub bzw. kahl im Winter
      let swapped = false;
      if (d.kind.id === 'shrub' || d.kind.id === 'thicket' || d.kind.id === 'bramble') {
        const season = world.settings.plan ? world.weather.season(world.tick) : 'summer';
        const hv = Math.floor(d.x * 7 + d.y * 13);
        const pre = season === 'winter' ? 'flora.bareshrub' : season === 'autumn' && (hv & 3) !== 0 ? 'flora.autumnshrub' : '';
        if (pre && s.has(`${pre}.0`)) {
          name = `${pre}.${Math.abs(hv) % s.countPrefix(`${pre}.`)}`;
          swapped = true;
        }
      }
      if (d.kind.shadow) {
        const sh = this.shadows.get(s.frame(`${name}.shadow`));
        sh.position.set(d.x * TILE, d.y * TILE);
        sh.scale.set(s.info(`${name}.shadow`)?.meta?.scale ?? 1);
      }
      const sp = this.ents.get(s.frame(name));
      sp.position.set(d.x * TILE, d.y * TILE);
      sp.zIndex = d.y * TILE;
      if (LEAFY.has(d.kind.id)) {
        sp.tint = this.seasonTint(world, swapped ? 2 : d.kind.id === 'tallgrass' ? 3 : 0, Math.floor(d.x * 7 + d.y * 13));
        sp.skew.x = this.windSway(world, d.x, d.y) * (d.kind.id === 'tallgrass' || d.kind.id === 'reed' ? 1.6 : 0.8);
      }
    }
    this.drawCrops(world, v);
    // Bäume aus der Simulation (fällbar)
    const CS = MAPGEN.chunkSize;
    const m = 7;
    for (let cy = Math.floor((v.y0 - 2) / CS); cy <= Math.floor((v.y1 + m) / CS); cy++) {
      for (let cx = Math.floor((v.x0 - m) / CS); cx <= Math.floor((v.x1 + m) / CS); cx++) {
        for (const t of world.map.trees.treesIn(cx, cy)) {
          if (t.x < v.x0 - m || t.x > v.x1 + m || t.y < v.y0 - 2 || t.y > v.y1 + m) continue;
          const name = this.treeSprite(world, t);
          if (!name) continue;
          if (s.has(`${name}.shadow`)) {
            const sh = this.shadows.get(s.frame(`${name}.shadow`));
            sh.position.set(t.x * TILE, t.y * TILE);
            sh.scale.set(s.info(`${name}.shadow`)?.meta?.scale ?? 1);
            // kahle Bäume werfen nur lichte Schatten
            if (name.startsWith('flora.bare') || t.kind === 2) sh.alpha = 0.45;
          }
          const sp = this.ents.get(s.frame(name));
          sp.position.set(t.x * TILE, t.y * TILE);
          sp.zIndex = t.y * TILE;
          sp.tint = name.startsWith('flora.autumn') || name.startsWith('flora.bare') ? this.seasonTint(world, 2, t.tx * 31 + t.ty * 17) : this.seasonTint(world, t.kind, t.tx * 31 + t.ty * 17 + t.variant);
          sp.scale.set(0.9 + ((t.tx * 13 + t.ty * 7) & 7) * 0.03);
          sp.skew.x = this.windSway(world, t.x, t.y) * (t.kind === 2 ? 0.3 : 1);
        }
      }
    }
    this.drawCliffs(world, v);
  }

  /** Abnutzung je Feld (nur Darstellung, nicht gespeichert): wächst unter Füßen, verblasst langsam. */
  private readonly wear = new Map<number, number>();
  private wearTick = -1;
  private wearTrails(world: World): void {
    if (world.tick - this.wearTick < TRAILS.every && this.wearTick >= 0 && world.tick >= this.wearTick) return;
    this.wearTick = world.tick;
    const step = (x: number, y: number) => {
      const k = (Math.floor(x) + 32768) * 65536 + (Math.floor(y) + 32768);
      this.wear.set(k, Math.min(1, (this.wear.get(k) ?? 0) + TRAILS.gain));
    };
    const p = world.player;
    if (p && !p.dead && !p.inCar) step(p.x, p.y);
    for (const k of world.community.workers) if (k.faction === 'ours') step(k.x, k.y);
    if (this.wear.size > TRAILS.maxTiles) for (const [k, v] of this.wear) if (v < TRAILS.show) this.wear.delete(k);
    for (const [k, v] of this.wear) {
      const nv = v - TRAILS.decay;
      if (nv <= 0) this.wear.delete(k);
      else this.wear.set(k, nv);
    }
  }

  /** Acker-Ursprung je Feld (Art der Feldfrucht gilt für den ganzen Acker). */
  private readonly fieldCrop = new Map<number, number>();
  private fieldMapRef: World['map'] | null = null;

  /**
   * Feldfrüchte auf verwilderten Äckern (nur Darstellung): Art je Acker (Weizen, Mais, Sonnenblumen, Rüben), Stufe je
   * Jahreszeit (jung, reif, dürr; im Winter nur Stoppeln), Lücken wo die Saat nicht aufging.
   */
  private drawCrops(world: World, v: ReturnType<GameRenderer['viewRect']>): void {
    const s = this.sprites;
    if (!s.has('crop.wheat.ripe.0')) return;
    if (this.fieldMapRef !== world.map) {
      this.fieldCrop.clear();
      this.fieldMapRef = world.map;
    }
    const season = world.settings.plan ? world.weather.season(world.tick) : 'summer';
    const stage = season === 'spring' ? 'young' : season === 'summer' ? 'ripe' : 'dry';
    const map = world.map;
    for (let ty = v.y0 - 2; ty <= v.y1 + 1; ty++) {
      for (let tx = v.x0 - 1; tx <= v.x1 + 1; tx++) {
        if (map.floorAt(tx, ty) !== CROP_FLOOR) continue;
        if (world.entityAt(tx, ty)) continue;
        const key = (tx + 32768) * 65536 + (ty + 32768);
        let crop = this.fieldCrop.get(key);
        if (crop === undefined) {
          let x0 = tx;
          let y0 = ty;
          while (map.floorAt(x0 - 1, ty) === CROP_FLOOR && tx - x0 < 40) x0--;
          while (map.floorAt(x0, y0 - 1) === CROP_FLOOR && ty - y0 < 40) y0--;
          crop = (((x0 * 2246822519) ^ (y0 * 3266489917)) >>> 0) % CROPS.length;
          this.fieldCrop.set(key, crop);
          if (this.fieldCrop.size > 60000) this.fieldCrop.clear();
        }
        const h = ((Math.imul(tx, 374761393) ^ Math.imul(ty, 668265263)) >>> 0) % 100;
        if (h < 12 || (season === 'winter' && h < 60)) continue;
        const name = `crop.${CROPS[crop]}.${stage}.${h & 1}`;
        if (!s.has(name)) continue;
        const sp = this.ents.get(s.frame(name));
        sp.position.set((tx + 0.5) * TILE, (ty + 0.5) * TILE);
        sp.zIndex = (ty + 0.5) * TILE;
        sp.skew.x = this.windSway(world, tx, ty) * 1.4;
        if (season === 'winter') sp.tint = 0xb8b0a4;
      }
    }
  }

  /** Wind: Scherung der Pflanzen-Sprites (am Fuß verankert), Böen wandern als Welle über die Karte; Sturm stärker. */
  private windSway(world: World, x: number, y: number): number {
    const k = world.settings.plan ? world.weather.kind : 'clear';
    const amp = k === 'storm' ? WIND.storm : k === 'rain' || k === 'snow' ? WIND.rain : WIND.calm;
    const t = world.tick / 60;
    const gust = 0.6 + 0.4 * Math.sin(t * WIND.gustSpeed - (x + y * 0.4) * WIND.gustScale);
    return amp * gust * Math.sin(t * WIND.speed + x * 0.37 + y * 0.23);
  }

  /**
   * Laub je Jahreszeit und Baum: Frühling frisch, Sommer satt, Herbst gelb bis rostrot (je Baum verschieden), Winter
   * kahl-grau bzw. bereift (Nadelbäume); dazu kleine Helligkeitsunterschiede je Baum.
   */
  private seasonTint(world: World, kind: number, h: number): number {
    const season = world.settings.plan ? world.weather.season(world.tick) : 'summer';
    const j = ((h * 2654435761) >>> 0) % 997;
    const bright = 0.9 + (j % 13) * 0.009;
    const conifer = kind === 1;
    const dead = kind === 2;
    if (kind === 3) {
      // Gräser: Sommer grün, Herbst/Winter strohig
      const base = season === 'autumn' ? 0xf0d8a8 : season === 'winter' ? 0xd8ccb8 : season === 'spring' ? 0xe8ffd8 : 0xffffff;
      const g = Math.min(255, Math.round(255 * bright));
      return mulTint(base, (g << 16) | (g << 8) | g);
    }
    let base = 0xffffff;
    if (!dead) {
      if (season === 'spring') base = conifer ? 0xf0fff0 : 0xe8ffd8;
      else if (season === 'autumn' && !conifer) base = AUTUMN[j % AUTUMN.length];
      else if (season === 'winter') base = conifer ? 0xe4ecf4 : 0xbcb4ac;
    }
    const g = Math.min(255, Math.round(255 * bright));
    return mulTint(base, (g << 16) | (g << 8) | g);
  }

  private cliffCount = -1;
  /** Klippen: je Klippenfeld eine Felsstufe (Variante und kleiner Versatz aus der Lage), nach Tiefe sortiert. */
  private drawCliffs(world: World, v: ReturnType<GameRenderer['viewRect']>): void {
    const s = this.sprites;
    if (this.cliffCount < 0) this.cliffCount = s.countPrefix('cliff.');
    const n = this.cliffCount;
    if (n <= 0) return;
    const CS = MAPGEN.chunkSize;
    for (let cy = Math.floor((v.y0 - 1) / CS); cy <= Math.floor((v.y1 + 2) / CS); cy++) {
      for (let cx = Math.floor((v.x0 - 1) / CS); cx <= Math.floor((v.x1 + 1) / CS); cx++) {
        const c = world.map.getChunk(cx, cy);
        if (!c.hasCliff) continue;
        const ty0 = Math.max(cy * CS, v.y0 - 1);
        const ty1 = Math.min(cy * CS + CS - 1, v.y1 + 2);
        const tx0 = Math.max(cx * CS, v.x0 - 1);
        const tx1 = Math.min(cx * CS + CS - 1, v.x1 + 1);
        for (let ty = ty0; ty <= ty1; ty++) {
          for (let tx = tx0; tx <= tx1; tx++) {
            if (!c.cliff[(ty - cy * CS) * CS + (tx - cx * CS)]) continue;
            const h = ((tx * 73856093) ^ (ty * 19349663)) >>> 0;
            const name = `cliff.${h % n}`;
            const x = (tx + 0.5 + (((h >>> 8) & 15) / 15 - 0.5) * 0.2) * TILE;
            const y = (ty + 0.5 + (((h >>> 12) & 15) / 15 - 0.5) * 0.2) * TILE;
            if (s.has(`${name}.shadow`)) this.shadows.get(s.frame(`${name}.shadow`)).position.set(x, y);
            const sp = this.ents.get(s.frame(name));
            sp.position.set(x, y);
            sp.zIndex = y;
          }
        }
      }
    }
  }

  private treeCounts: number[] | null = null;
  /** Sprite einer Baumart/Variante; fehlt die Art (z. B. abgestorbene Bäume), wird ein normaler Baum gezeigt. */
  private autumnCount = -1;
  private bareCount = -1;
  private treeSprite(world: World, t: { kind: number; variant: number; x: number; y: number; tx: number; ty: number }): string | null {
    const kinds = MAPGEN.trees.kinds;
    if (!this.treeCounts) this.treeCounts = kinds.map((k) => this.sprites.countPrefix(`${k.sprite}.`));
    let k = t.kind;
    if (!this.treeCounts[k]) k = 0;
    const n = this.treeCounts[k];
    if (!n) return null;
    if (k !== 0 || n <= 8) return `${kinds[k].sprite}.${t.variant % n}`;
    // Laubbäume: Art aus der Gruppe (gepflanzt: in der Variante, wild: Artenflecken, Ufer, Jungwuchs)
    let group: readonly number[];
    let v = t.variant;
    if (v >= 100) {
      group = TREE_GROUPS[TREE_GROUP_IDS[Math.floor((v - 100) / 10)] ?? 'mixed'];
      v = (v - 100) % 10;
    } else {
      const h = ((Math.imul(t.tx, 73856093) ^ Math.imul(t.ty, 19349663)) >>> 0) % 1000;
      const nz = noise2(t.x / TREE_PATCH.scale, t.y / TREE_PATCH.scale, world.seed + 77);
      if (h < TREE_PATCH.young * 1000) group = TREE_GROUPS.young;
      else if (this.biomeField(world).fertility(t.tx, t.ty) > TREE_PATCH.water && h % 3 !== 0) group = TREE_GROUPS.water;
      else group = nz < 0.3 ? TREE_GROUPS.birch : nz < 0.55 ? TREE_GROUPS.mixed : nz < 0.75 ? TREE_GROUPS.oak : TREE_GROUPS.chestnut;
      v = v + (h >> 4);
    }
    const idx = group[v % group.length];
    // Jahreszeit: Herbstlaub (die meisten Bäume) bzw. kahl im Winter
    const season = world.settings.plan ? world.weather.season(world.tick) : 'summer';
    const hs = ((Math.imul(t.tx, 2654435761) ^ Math.imul(t.ty, 40503)) >>> 0) % 100;
    if (season === 'spring' && idx >= 18 && idx <= 21) {
      const nb = this.sprites.countPrefix('flora.blossom.');
      if (nb > 0) return `flora.blossom.${(idx + hs) % nb}`;
    }
    if (season === 'autumn' && hs < 75) {
      if (this.autumnCount < 0) this.autumnCount = this.sprites.countPrefix('flora.autumn.');
      if (this.autumnCount > 0) return `flora.autumn.${(idx + hs) % this.autumnCount}`;
    } else if (season === 'winter') {
      if (this.bareCount < 0) this.bareCount = this.sprites.countPrefix('flora.bare.');
      if (this.bareCount > 0) return `flora.bare.${(idx + hs) % this.bareCount}`;
    }
    return `${kinds[0].sprite}.${idx < n ? idx : t.variant % 8}`;
  }

  // ------------------------------------------------------------------ Bänder

  private drawBelts(world: World, v: ReturnType<GameRenderer['viewRect']>, alpha: number): void {
    const b = this.belts;
    b.begin();
    world.belts.ensure();
    // 16 Frames pro 32 px Rillenabstand: 1 Frame pro Tick = 8 Positionen = 2 px (schnelles Band: 2 Frames)
    const t0 = world.tick + alpha;
    const fallback = this.beltTex.get(BELT.speed)!;
    for (const t of world.belts.allTiles()) {
      if (t.x < v.x0 || t.x > v.x1 || t.y < v.y0 || t.y > v.y1) continue;
      const frames = (this.beltTex.get(t.speed) ?? fallback)[t.shape * 4 + t.dir];
      const frame = Math.floor((t0 * t.speed) / BELT.speed);
      b.push(frames[frame % frames.length], t.x * TILE + TILE / 2, t.y * TILE + TILE / 2);
    }
    // Umlenktrommeln an offenen Bandanfängen und -enden (nur gerade Felder, nicht an Untergrund/Splitter)
    const off = (t: { x: number; y: number }) => t.x < v.x0 || t.x > v.x1 || t.y < v.y0 || t.y > v.y1;
    for (const line of world.belts.lines) {
      const caps = this.capTex.get(line.speed);
      if (!caps?.length) continue;
      const first = line.tiles[0];
      const last = line.tiles[line.tiles.length - 1];
      const out = line.lanes[0].out;
      const loop = out !== null && out.line === line && !out.split;
      if (loop) continue;
      if (!line.fedStraight && first.shape === Shape.Straight && !first.ug && !first.splitter && !off(first)) {
        b.push(caps[4 + first.dir], first.x * TILE + TILE / 2, first.y * TILE + TILE / 2);
      }
      if (!out && last.shape === Shape.Straight && !last.ug && !last.splitter && !off(last)) {
        b.push(caps[last.dir], last.x * TILE + TILE / 2, last.y * TILE + TILE / 2);
      }
    }
    b.end();
    this.stats.belts = b.count;
  }

  private drawItems(world: World, v: ReturnType<GameRenderer['viewRect']>, alpha: number): void {
    const pool = this.items;
    pool.begin();
    const p = this.tmp;
    const itemTex: Texture[] = [];
    const shadow = this.sprites.has('item.shadow') ? this.sprites.frame('item.shadow') : null;
    for (const line of world.belts.lines) {
      const tiles = line.tiles;
      const lag = (1 - alpha) * line.speed;
      for (let l = 0; l < 2; l++) {
        const lane = line.lanes[l];
        const gaps = lane.gaps;
        if (gaps.length === 0) continue;
        let pos = 0;
        let j = tiles.length - 1;
        for (let i = 0; i < gaps.length; i++) {
          pos += gaps[i];
          let d = i >= lane.firstMoving ? pos + lag : pos;
          if (d >= lane.len) d = lane.len - 0.001;
          while (j > 0 && d >= lane.tileEnd[j] + tiles[j].lens[l]) j--;
          while (j < tiles.length - 1 && d < lane.tileEnd[j]) j++;
          const t = tiles[j];
          if (t.x < v.x0 || t.x > v.x1 || t.y < v.y0 || t.y > v.y1) continue;
          const vo = BeltSystem.visualOffset(t, l, Math.max(0, d - lane.tileEnd[j]));
          if (vo < 0) continue; // unter der Erde
          BeltSystem.pointOn(t.shape, t.dir, l, vo, p);
          const idx = lane.items[i];
          const tex = itemTex[idx] ?? (itemTex[idx] = this.sprites.frame(`item.${itemId(idx)}`));
          const ix = (t.x + p.x) * TILE;
          const iy = (t.y + p.y) * TILE;
          if (shadow) pool.push(shadow, ix + 3, iy + 4, 1.1, 0.5);
          pool.push(tex, ix, iy, ITEM_SCALE_BELT * ITEM_OUTLINE.scale, ITEM_OUTLINE.alpha, 0, 0x000000);
          pool.push(tex, ix, iy, ITEM_SCALE_BELT);
        }
      }
    }
    pool.end();
    this.stats.items = pool.count;
  }

  // ------------------------------------------------------------------ Gebäude

  private drawEntities(world: World, v: ReturnType<GameRenderer['viewRect']>, alpha: number, ui: RenderUi): void {
    const s = this.sprites;
    this.shadows.begin();
    this.ents.begin();
    this.glow.begin();
    this.icons.begin();
    let n = 0;
    const blink = Math.floor((world.tick + alpha) / 30) % 2 === 0;
    const now = performance.now();
    for (const e of this.visibleEntities(world, v)) {
      if (e.kind === 'belt') continue;
      n++;
      const cx = e.cx * TILE;
      const cy = e.cy * TILE;
      const e0 = this.ents.used;
      const g0 = this.glow.used;
      this.drawEntity(e, cx, cy, world, alpha);
      // Aufspringen beim Bauen, Wackeln beim Anlaufen
      const k = this.life.scaleOf(e, now);
      if (k) {
        for (let i = e0; i < this.ents.used; i++) EntityLife.apply(this.ents.at(i), k[0], k[1]);
        for (let i = g0; i < this.glow.used; i++) EntityLife.apply(this.glow.at(i), k[0], k[1]);
      }
      if (blink && (e.status === Status.NoFuel || e.status === Status.OutputBlocked)) {
        const icon = this.icons.get(s.frame(e.status === Status.NoFuel ? 'icon.nofuel' : 'icon.blocked'));
        icon.position.set(cx, cy);
        icon.scale.set(0.5);
      }
    }
    this.drawFlora(world, v);
    // Leichen der Figur: liegende, abgedunkelte Figur
    for (const c of world.corpses.all) {
      if (c.x < v.x0 - 2 || c.x > v.x1 + 2 || c.y < v.y0 - 2 || c.y > v.y1 + 2) continue;
      if (!this.sprites.has('player.idle.2')) break;
      const sp = this.ents.get(this.sprites.frame('player.idle.2', 0));
      sp.position.set(c.x * TILE, c.y * TILE);
      sp.rotation = Math.PI / 2;
      sp.tint = 0x6a6258;
      sp.zIndex = c.y * TILE - 20;
    }
    const pl = world.player;
    if (pl && !pl.inCar) {
      const px = (pl.prevPx + (pl.px - pl.prevPx) * alpha) / 256;
      const py = (pl.prevPy + (pl.py - pl.prevPy) * alpha) / 256;
      const t = world.tick + alpha;
      let tex: Texture;
      if (s.has('player.walk.0')) {
        // 8 Richtungen aus der Bewegung bzw. zum Abbauziel; Ruhe, Laufen, Abbauen
        const mt = pl.mineTarget;
        const mining = mt !== null && pl.mineProgress > 0;
        // Nahkampf: Schwung mit dem Brecheisen (Abbau-Bilder), zum Ziel gedreht
        const striking = t - pl.lastMelee < 16;
        let dx = pl.px - pl.prevPx;
        let dy = pl.py - pl.prevPy;
        if (mining) {
          const e = mt.kind === 'entity' ? world.entities.get(mt.id) : undefined;
          const tx = mt.kind === 'resource' ? mt.x + 0.5 : mt.kind === 'tree' ? mt.x : e?.cx ?? px;
          const ty = mt.kind === 'resource' ? mt.y + 0.5 : mt.kind === 'tree' ? mt.y : e?.cy ?? py;
          dx = tx - px;
          dy = ty - py;
        }
        if (striking) {
          dx = Math.cos(pl.meleeAngle);
          dy = Math.sin(pl.meleeAngle);
        }
        if (dx !== 0 || dy !== 0) this.playerDir = (Math.round(Math.atan2(dx, -dy) / (Math.PI / 4)) + 8) % 8;
        const k = this.playerDir;
        if (striking) tex = s.frame(`player.mine.${k}`, 3 + Math.floor(((t - pl.lastMelee) / 16) * 4));
        else if (mining) tex = s.frame(`player.mine.${k}`, Math.floor(t / 7.5));
        else if (pl.walking) tex = s.frame(`player.walk.${k}`, Math.floor(t / 2.5));
        else tex = s.frame(`player.idle.${k}`, Math.floor(t / 10));
      } else tex = s.frame(`player.${pl.facing}`, pl.walking ? Math.floor(t / 5) : 0);
      const sp = this.ents.get(tex);
      sp.position.set(px * TILE, py * TILE);
      sp.zIndex = py * TILE;
    }
    this.drawWorkers(world, v, alpha);
    this.drawRoofs(world, v);
    this.drawRobots(world);
    this.drawVehicles(world);
    this.drawEnemies(world, v, alpha);
    this.drawWildlife(world, v);
    this.drawGhost(ui, world);
    this.shadows.end();
    this.ents.end();
    this.glow.end();
    this.icons.end();
    this.stats.entities = n;
  }

  private drawEntity(e: Entity, cx: number, cy: number, world: World, alpha: number): void {
    const s = this.sprites;
    const z = cy + 16;
    cx = Math.round(cx);
    switch (e.kind) {
      case 'drill': {
        const base = e.name === 'burner-mining-drill' ? 'drill' : e.name;
        if (!s.has(`${base}.${e.dir}`)) {
          this.drawGeneric(e, cx, cy, z);
          break;
        }
        const sh = this.shadows.get(s.frame(`${base}.${e.dir}.shadow`));
        sh.position.set(cx, cy);
        const sp = this.ents.get(s.frame(`${base}.${e.dir}`, Math.floor(e.workTicks / this.ticksPerFrame(`${base}.${e.dir}`))));
        sp.position.set(cx, cy);
        sp.zIndex = z;
        break;
      }
      case 'turret': {
        const tb = `${e.name}.base`;
        if (!s.has(tb)) {
          this.drawGeneric(e, cx, cy, z);
          break;
        }
        if (s.has(`${tb}.shadow`)) {
          const sh = this.shadows.get(s.frame(`${tb}.shadow`));
          sh.position.set(cx, cy);
          sh.scale.set(s.info(`${tb}.shadow`)?.meta?.scale ?? 1);
        }
        const b = this.ents.get(s.frame(tb));
        b.position.set(cx, cy);
        b.zIndex = z;
        const n = s.info(`${e.name}.head`)?.meta?.angles ?? 16;
        const k = ((Math.round(((e.angle + Math.PI / 2) / (Math.PI * 2)) * n) % n) + n) % n;
        const hd = this.ents.get(s.frame(`${e.name}.head`, k));
        hd.position.set(cx, cy);
        hd.zIndex = z + 1;
        break;
      }
      case 'prop': {
        // Zaun: Richtung nach den Nachbarn (waagerecht, wenn links oder rechts ein Zaun steht)
        if (e.name === 'hedge' && s.has('hedge.v0')) {
          // Hecke: eine Art je Gartenstück (grobes Raster), zwei Formen im Wechsel
          const sp = (((Math.floor(e.x / 9) * 73856093) ^ (Math.floor(e.y / 9) * 19349663)) >>> 0) % 3;
          const hsp = this.drawNamed(`hedge.v${sp * 2 + ((e.x + e.y) & 1)}`, cx, cy, z);
          hsp.tint = this.seasonTint(world, 0, e.x * 3 + e.y);
        } else if (e.name === 'fence' && s.has('fence.h')) {
          const n = (dx: number, dy: number) => world.entityAt(e.x + dx, e.y + dy)?.name === 'fence';
          const hz = n(-1, 0) || n(1, 0) || !(n(0, -1) || n(0, 1));
          this.drawNamed(hz ? 'fence.h' : 'fence.v', cx, cy, z);
        } else {
          // Varianten <name>.v<n> nach der Lage
          const n = s.countPrefix(`${e.name}.v`);
          if (n) this.drawNamed(`${e.name}.v${Math.abs(e.x * 7 + e.y * 13) % n}`, cx, cy, z);
          else this.drawGeneric(e, cx, cy, z);
        }
        break;
      }
      case 'furnace': {
        const fp = e.name !== 'stone-furnace' && s.has(`${e.name}.off`) ? e.name : 'furnace';
        const sh = this.shadows.get(s.frame(`${fp}.shadow`));
        sh.position.set(cx, cy);
        const on = e.status === Status.Working;
        const sp = this.ents.get(s.frame(on ? `${fp}.on` : `${fp}.off`));
        sp.position.set(cx, cy);
        sp.zIndex = z;
        if (on) {
          const t = world.tick + alpha;
          const g = this.glow.get(s.frame(`${fp}.glow`, Math.floor(t / 6) + e.id * 3));
          g.position.set(cx, cy);
          g.alpha = 0.8 + 0.2 * Math.sin(t * 0.37 + e.id) * Math.sin(t * 0.13 + e.id * 2);
        }
        break;
      }
      case 'inserter': {
        const pre = INSERTER_PREFIX[e.name] && s.has(`${INSERTER_PREFIX[e.name]}.arm`) ? INSERTER_PREFIX[e.name] : 'inserter';
        const sh = this.shadows.get(s.frame(`${pre}.shadow`));
        sh.position.set(cx, cy);
        const base = this.ents.get(s.frame(`${pre}.base`));
        base.position.set(cx, cy);
        base.zIndex = z;
        let t = e.armT();
        const moving = e.phase === InserterPhase.ToDrop || e.phase === InserterPhase.ToPickup;
        if (moving) {
          const back = ((1 - alpha) * e.turnPerTick) / 500;
          t = e.phase === InserterPhase.ToDrop ? Math.max(0, t - back) : Math.min(1, t + back);
        }
        const rot = ((e.dir + 2) * Math.PI) / 2 + t * Math.PI;
        const reach = e.def.pickupVector[1] + (-e.def.dropVector[1] - e.def.pickupVector[1]) * t;
        const info = s.info(`${pre}.arm`);
        const angles = info?.meta?.angles ?? 0;
        let hx: number;
        let hy: number;
        if (angles > 0) {
          // vorgerenderte Winkel (geneigte Kamera), Reichweite über leichte Skalierung
          const k = ((Math.round((rot / (Math.PI * 2)) * angles) % angles) + angles) % angles;
          const sc = reach / (info?.meta?.reach ?? 1);
          // dunkle Kontur unter dem Arm (hebt ihn vom Boden ab)
          const ol = this.ents.get(s.frame(`${pre}.arm`, k));
          ol.position.set(cx, cy);
          ol.scale.set(sc * 1.05);
          ol.tint = 0x000000;
          ol.alpha = 0.45;
          ol.zIndex = z + 0.9;
          const arm = this.ents.get(s.frame(`${pre}.arm`, k));
          arm.position.set(cx, cy);
          arm.scale.set(sc);
          arm.zIndex = z + 1;
          const lift = (info?.meta?.handLift ?? 0) * TILE;
          hx = cx + Math.sin(rot) * reach * TILE;
          hy = cy - Math.cos(rot) * reach * TILE - lift;
        } else {
          const arm = this.ents.get(s.frame(`${pre}.arm`));
          const armLen = (info?.meta?.reach ?? 1) * TILE;
          const lift = (s.info('inserter.base')?.meta?.pivotLift ?? 0) * TILE;
          arm.position.set(cx, cy - lift);
          arm.rotation = rot;
          arm.scale.set(1, (reach * TILE) / armLen);
          arm.zIndex = z + 1;
          hx = cx + Math.sin(rot) * reach * TILE;
          hy = cy - lift - Math.cos(rot) * reach * TILE;
        }
        if (e.held) {
          const ot = this.ents.get(s.frame(`item.${e.held}`));
          ot.position.set(hx, hy);
          ot.scale.set(ITEM_SCALE_BELT * ITEM_OUTLINE.scale);
          ot.tint = 0x000000;
          ot.alpha = ITEM_OUTLINE.alpha;
          ot.zIndex = z + 1.9;
          const it = this.ents.get(s.frame(`item.${e.held}`));
          it.position.set(hx, hy);
          it.scale.set(ITEM_SCALE_BELT);
          it.zIndex = z + 2;
        }
        break;
      }
      case 'pipe': {
        const mask = world.fluids.connections.get(e.id) ?? 0;
        if (s.has(`pipe.${mask}`)) {
          const sp = this.ents.get(s.frame(`pipe.${mask}`));
          sp.position.set(cx, cy);
          sp.zIndex = z - 32;
        } else this.drawGeneric(e, cx, cy, z - 32);
        this.pipeWindow(e, cx, cy, z - 31);
        break;
      }
      case 'belt':
        break;
      case 'underground': {
        const base = s.has(`${e.name}.in.0`) ? e.name : 'underground-belt';
        const key = `${base}.${e.output ? 'out' : 'in'}.${e.dir}`;
        if (s.has(key)) {
          const sp = this.ents.get(s.frame(key));
          sp.position.set(cx, cy);
          sp.zIndex = z;
        } else this.drawGeneric(e, cx, cy, z);
        break;
      }
      case 'loot': {
        // Versorgungsabwurf: schwebt am Fallschirm herab
        let lift = 0;
        if (e.name === 'airdrop') {
          const d = world.drops.drops.find((x) => x.id === e.id);
          const f = d ? (world.tick + alpha - d.tick) / DROPS.fallTicks : 1;
          if (f < 1) {
            lift = (1 - f) * 9 * TILE;
            if (s.has('airdrop.chute')) {
              const ch = this.ents.get(s.frame('airdrop.chute'));
              ch.position.set(cx + Math.sin((world.tick + alpha) / 25) * 10, cy - lift);
              ch.zIndex = z + 2000;
            }
          }
        }
        // Leiche: Kadaver-Bild eines Zombies in wechselnder Kleidung, gedreht nach der Lage
        if (e.name === 'corpse') {
          const hh = ((Math.imul(e.x, 73856093) ^ Math.imul(e.y, 19349663)) >>> 0);
          const v = hh % 7;
          const key = v === 0 ? 'zombie.walker.dead' : `zombie.walker.v${v}.dead`;
          if (s.has(key)) {
            const csp = this.ents.get(s.frame(key, (hh >> 4) & 1));
            csp.position.set(cx, cy);
            csp.rotation = (((hh >> 6) % 100) / 100 - 0.5) * 0.9;
            if ((hh >> 3) & 1) csp.scale.x = -1;
            csp.tint = 0xb8b0a4;
            csp.zIndex = z - 60;
            break;
          }
        }
        // Fundorte: Variante nach der Lage (gleiche Karte → gleiches Bild)
        const n = s.countPrefix(`${e.name}.v`);
        if (!n) this.drawGeneric(e, cx, cy - lift, z + (lift ? 2000 : 0));
        else {
          const lsp = this.drawNamed(`${e.name}.v${Math.abs(e.x * 7 + e.y * 13) % n}`, cx, cy - lift, z + (lift ? 2000 : 0));
          // Möbel in ausgebrannten Häusern: verkohlt
          if (this.houseOf(world, e.x, e.y)?.burnt) lsp.tint = 0x5a524a;
          // schwelendes Wrack: verrußt, Rauch steigt auf
          if (burningWreck(e)) {
            lsp.tint = 0x6a5a50;
            this.ambient?.smokers.push({ x: e.cx, y: e.cy });
          }
        }
        break;
      }
      case 'pile': {
        // Schrotthaufen: Variante nach der Lage; ab der Hälfte ausgeschlachtet kleiner (.half)
        const n = s.countPrefix(`${e.name}.v`);
        const half = e.amount < e.total / 2 && s.has(`${e.name}.half`);
        if (half) this.drawNamed(`${e.name}.half`, cx, cy, z, `${e.name}.v0.shadow`);
        else if (n) this.drawNamed(`${e.name}.v${Math.abs(e.x * 7 + e.y * 13) % n}`, cx, cy, z);
        else this.drawGeneric(e, cx, cy, z);
        break;
      }
      case 'wall': {
        if (e.def.house || e.name === 'stone-wall' || e.name === 'wooden-barricade') {
          this.drawHousePart(world, e, cx, cy, z);
          break;
        }
        // Tor: offen, solange die Figur in der Nähe steht
        const p = world.player;
        if (e.def.gate && s.has('gate.open') && p && !p.dead && Math.hypot(p.x - e.cx, p.y - e.cy) < 2.2) this.drawNamed('gate.open', cx, cy, z, 'gate.shadow');
        else this.drawGeneric(e, cx, cy, z);
        break;
      }
      case 'producer': {
        // Gemüsebeet: kahl, solange nichts gewachsen ist
        if (e.name === 'garden' && s.has('garden.bare') && e.out.isEmpty() && e.progress < e.totalTicks / 2) this.drawNamed('garden.bare', cx, cy, z, 'garden.shadow');
        else this.drawGeneric(e, cx, cy, z);
        break;
      }
      default:
        this.drawGeneric(e, cx, cy, z);
    }
  }

  /**
   * Bauteil eines begehbaren Hauses: Wandstück je nach Nachbarn (Maske N=1, O=2, S=4, W=8), Fenster (heil bzw.
   * zerbrochen), Tür (offen, wenn Figur oder Bewohner davor stehen), dazu Bretter.
   */
  private drawHousePart(world: World, e: Entity & { kind: 'wall' }, cx: number, cy: number, z: number): void {
    const s = this.sprites;
    const axis = e.dir % 2 === 0 ? 'h' : 'v';
    let base: string;
    let shadow: string;
    if (e.def.gate) {
      const p = world.player;
      const near = (p && !p.dead && Math.hypot(p.x - e.cx, p.y - e.cy) < 1.4) || !!world.community.at(e.cx, e.cy + 0.4, 1.2);
      base = near && e.boardHp <= 0 ? `hdoor.${axis}.open` : `hdoor.${axis}`;
      shadow = `hdoor.${axis}.shadow`;
    } else if (e.def.window) {
      base = `hwin.${e.def.house}.${axis}${e.broken ? '.broken' : ''}`;
      shadow = `hwin.${axis}.shadow`;
    } else {
      // Wände verbinden sich mit allen Wandstücken, Fenstern, Türen und Toren daneben
      const wallAt = (x: number, y: number) => world.entityAt(x, y)?.kind === 'wall';
      const m = (wallAt(e.x, e.y - 1) ? 1 : 0) | (wallAt(e.x + 1, e.y) ? 2 : 0) | (wallAt(e.x, e.y + 1) ? 4 : 0) | (wallAt(e.x - 1, e.y) ? 8 : 0);
      const mat = e.def.house ?? (e.name === 'stone-wall' ? 'concrete' : 'wood');
      base = `hwall.${mat}.${m}`;
      shadow = `hwall.${m}.shadow`;
    }
    if (!s.has(base)) {
      this.drawGeneric(e, cx, cy, z);
      return;
    }
    const wsp = this.drawNamed(base, cx, cy, z, shadow);
    // Hausfarbe: jedes Haus bekommt seinen Farbton (Putz gelb, rosa, hellblau …; Ziegel, Holz, Beton dezent)
    if (!e.def.gate && e.def.house) {
      const hs = this.houseOf(world, e.x, e.y);
      if (hs) {
        const pal = WALL_TINTS[e.def.house] ?? WALL_TINTS.concrete;
        wsp.tint = hs.burnt ? HOUSES.charred[hs.hue % HOUSES.charred.length] : pal[hs.hue % pal.length];
      }
    }
    if (e.boardHp > 0 && s.has(`boards.${axis}.1`)) {
      const sp = this.ents.get(s.frame(`boards.${axis}.${Math.min(3, e.boards)}`));
      sp.position.set(cx, cy);
      sp.zIndex = z + 1;
    }
  }

  /** Haus zu einem Feld (Zwischenspeicher, wächst mit der Hausliste) und Farbwahl je Haus. */
  private houseTiles = new Map<number, { hue: number; burnt: boolean }>();
  private houseCount = 0;
  /** Ausgebrannt (nur Darstellung): verkohlte Wände, Dach mit Löchern, Brandflecken innen. Nie das eigene Haus. */
  private static burnt(main: { x: number; y: number; own?: boolean }): boolean {
    if (main.own) return false;
    return ((((main.x * 2246822519) ^ (main.y * 3266489917)) >>> 0) % 1000) < HOUSES.burnt * 1000;
  }
  private houseOf(world: World, x: number, y: number): { hue: number; burnt: boolean } | undefined {
    const hs = world.sites.houses;
    if (hs.length < this.houseCount) {
      this.houseTiles.clear();
      this.houseCount = 0;
    }
    for (let i = this.houseCount; i < hs.length; i++) {
      const h = hs[i];
      const main = h.g !== undefined ? hs[h.g] : h;
      const hue = ((main.x * 73856093) ^ (main.y * 19349663)) >>> 0;
      const burnt = GameRenderer.burnt(main);
      for (let j = h.y; j < h.y + h.h; j++) for (let k = h.x; k < h.x + h.w; k++) this.houseTiles.set((k + 32768) * 65536 + (j + 32768), { hue, burnt });
    }
    this.houseCount = hs.length;
    return this.houseTiles.get((x + 32768) * 65536 + (y + 32768));
  }

  /** Dachdeckung je Haus (1 = sichtbar); blendet aus, solange die Figur drinnen ist. */
  private readonly roofAlpha = new Map<string, number>();

  /** Dächer begehbarer Häuser: Kacheln über dem Grundriss, um die Wandhöhe angehoben, mit Überstand. */
  private drawRoofs(world: World, v: ReturnType<GameRenderer['viewRect']>): void {
    const s = this.sprites;
    const p = world.player;
    const px = p && !p.dead ? p.x : -1e9;
    const py = p && !p.dead ? p.y : -1e9;
    const lift = ROOF_LIFT * TILE;
    const hs = world.sites.houses;
    const snowy = world.settings.plan && world.weather.winter;
    const within = (h: (typeof hs)[number]) => px >= h.x && px < h.x + h.w && py >= h.y - 0.2 && py < h.y + h.h;
    // Haupthaus und Anbau blenden gemeinsam aus
    const groupIn = new Set<number>();
    hs.forEach((h, i) => {
      if (!within(h)) return;
      groupIn.add(h.g ?? i);
    });
    for (let hi = 0; hi < hs.length; hi++) {
      const h = hs[hi];
      if (h.x > v.x1 + 1 || h.x + h.w < v.x0 - 1 || h.y > v.y1 + 2 || h.y + h.h < v.y0 - 1) continue;
      const key = `${h.x},${h.y}`;
      const inside = groupIn.has(h.g ?? hi);
      const a0 = this.roofAlpha.get(key) ?? 1;
      const a = Math.max(0, Math.min(1, a0 + (inside ? -0.12 : 0.08)));
      this.roofAlpha.set(key, a);
      if (a <= 0.01) continue;
      const kind = h.roof;
      const burnt = GameRenderer.burnt(h.g !== undefined ? hs[h.g] : h);
      if (burnt && h.g === undefined && this.ambient && (Math.abs(h.x * 31 + h.y * 17) % 100) < HOUSES.smoulder * 100) this.ambient.smokers.push({ x: h.x + h.w / 2, y: h.y + h.h / 2 });
      const sx = (h.w + ROOF_OVERHANG * 2) / h.w;
      const sy = (h.h + ROOF_OVERHANG * 2) / h.h;
      const ccx = (h.x + h.w / 2) * TILE;
      const ccy = (h.y + h.h / 2) * TILE - lift;
      for (let j = 0; j < h.h; j++) {
        for (let i = 0; i < h.w; i++) {
          const vv = (h.x + i * 7 + (h.y + j) * 13) & 1;
          let name: string;
          if (kind === 'flat') {
            const ns = j === 0 ? 'n' : j === h.h - 1 ? 's' : '';
            const ew = i === 0 ? 'w' : i === h.w - 1 ? 'e' : '';
            // Lüfter/Klimageräte nur vereinzelt
            name = ns || ew ? `roof.flat.${ns}${ew}.0` : `roof.flat.c.${(h.x * 31 + i * 7 + (h.y + j) * 13) % 9 === 0 ? 1 : 0}`;
          }
          else if (h.ridge === 0) {
            const mid = (h.h - 1) / 2;
            name = `roof.${kind}.${j === mid ? 'r' : j < mid ? 'n' : 's'}.${vv}`;
          } else {
            const mid = (h.w - 1) / 2;
            name = `roof.${kind}.${i === mid ? 'rv' : i < mid ? 'w' : 'e'}.${vv}`;
          }
          if (!s.has(name)) continue;
          // eingestürztes Dach: Löcher, wo die Balken verbrannt sind
          if (burnt && ((Math.imul(h.x + i, 374761393) ^ Math.imul(h.y + j, 668265263)) >>> 0) % 100 < HOUSES.roofHoles * 100) continue;
          const sp = this.ents.get(s.frame(name));
          sp.position.set(ccx + (i + 0.5 - h.w / 2) * TILE * sx, ccy + (j + 0.5 - h.h / 2) * TILE * sy);
          sp.scale.set(sx * 1.02, sy * 1.02);
          sp.alpha = a;
          const main = h.g !== undefined ? hs[h.g] : h;
          const pal = ROOF_TINTS[kind] ?? ROOF_TINTS.flat;
          sp.tint = pal[(((main.x * 73856093) ^ (main.y * 19349663)) >>> 0) % pal.length];
          if (world.weather.winter) sp.tint = mulTint(sp.tint, 0xe2e7ee);
          if (burnt) sp.tint = 0x34302c;
          sp.zIndex = (h.y + h.h) * TILE - 2;

          // Flachdächer: Moos, Pfützen, Laub und Unrat
          if (kind === 'flat') {
            const rh = ((Math.imul(h.x + i, 2654435761) ^ Math.imul(h.y + j, 40503)) >>> 0) % 1000;
            if (rh < ROOF_GRIME.length * 36) {
              const dn = `${ROOF_GRIME[rh % ROOF_GRIME.length]}.${(rh >> 3) % 3}`;
              if (s.has(dn)) {
                const d = this.ents.get(s.frame(dn));
                d.position.copyFrom(sp.position);
                d.scale.set((s.info(dn)?.meta?.scale ?? 1) * (1 + (rh % 5) * 0.12));
                d.rotation = rh * 0.37;
                d.alpha = a * 0.75;
                d.zIndex = sp.zIndex + 0.5;
              }
            }
          }
        }
      }
      // Schnee auf dem Dach: eine gleichmäßige Decke je Dach (Winter, nicht über Brandruinen)
      if (snowy && !burnt) {
        const sn = this.ents.get(Texture.WHITE);
        sn.anchor.set(0.5);
        sn.width = h.w * TILE * sx;
        sn.height = h.h * TILE * sy;
        sn.position.set(ccx, ccy);
        sn.tint = 0xeef2f6;
        sn.alpha = a * 0.6;
        sn.zIndex = (h.y + h.h) * TILE - 1.5;
      }
      // Hilferufe auf Dächern (gemalt, nur Haupthäuser, nicht ausgebrannt)
      if (h.g === undefined && !burnt && h.w >= 5 && h.h >= 4) {
        const ph = (((h.x * 2246822519) ^ (h.y * 3266489917)) >>> 0) % 1000;
        if (ph < PAINT_SHARE * 1000) {
          const pn = `decal.paint.${ph % 6}`;
          if (s.has(pn)) {
            const tex = s.frame(pn);
            const d = this.ents.get(tex);
            const ms = s.info(pn)?.meta?.scale ?? 1;
            const rot = h.h > h.w * 1.3;
            const aw = ((rot ? h.h : h.w) - 1) * TILE;
            const ah = ((rot ? h.w : h.h) - 1) * TILE;
            const sc = Math.min(1, aw / (tex.width * ms), ah / (tex.height * ms));
            d.position.set(ccx, ccy);
            d.scale.set(sc * ms);
            d.rotation = ((ph % 7) - 3) * 0.03 + (rot ? Math.PI / 2 : 0);
            d.alpha = a * 0.85;
            d.zIndex = (h.y + h.h) * TILE - 0.5;
          }
        }
      }
      // Dachaufbauten je Haus (nicht über Anbauten): Schornstein am First, Antenne, Schüssel, Solar, Dachfenster
      if (h.g === undefined && h.w * h.h >= 20 && !burnt) {
        const hh = ((h.x * 2654435761) ^ (h.y * 40503)) >>> 0;
        const props: [string, number, number][] = [];
        if (kind !== 'flat') {
          const along = h.ridge === 0 ? h.w : h.h;
          const at = 1 + (hh % Math.max(1, along - 2));
          props.push(['roof.chimney', h.ridge === 0 ? at : (h.w - 1) / 2, h.ridge === 0 ? (h.h - 1) / 2 - 0.3 : at]);
          if ((hh >> 4) % 3 === 0) props.push(['roof.antenna', h.ridge === 0 ? along - 1.5 : (h.w - 1) / 2 + 0.6, h.ridge === 0 ? (h.h - 1) / 2 : along - 1.5]);
          if ((hh >> 7) % 4 === 0) props.push(['roof.solar', h.ridge === 0 ? 1.5 + ((hh >> 9) % Math.max(1, h.w - 3)) : h.w - 1.6, h.ridge === 0 ? h.h - 1.6 : 1.5]);
          if ((hh >> 11) % 3 === 0) props.push(['roof.dish', h.ridge === 0 ? 0.8 : h.w - 1, h.ridge === 0 ? h.h - 1.4 : 0.8]);
          if ((hh >> 13) % 3 === 0) props.push(['roof.skylight', h.ridge === 0 ? h.w - 2 : 1, h.ridge === 0 ? 1 : h.h - 2]);
        } else {
          if ((hh >> 3) % 2 === 0) props.push(['roof.dish', 1.2, 1.2]);
          for (let q = 0; q < (hh >> 5) % 3; q++) props.push(['roof.skylight', 2 + ((hh >> (q * 3)) % Math.max(1, h.w - 4)), 2 + q * 2]);
        }
        for (const [nm, i2, j2] of props) {
          if (!s.has(nm) || i2 < 0 || j2 < 0 || i2 > h.w - 1 || j2 > h.h - 1) continue;
          const sp = this.ents.get(s.frame(nm));
          sp.position.set(ccx + (i2 + 0.5 - h.w / 2) * TILE * sx, ccy + (j2 + 0.5 - h.h / 2) * TILE * sy);
          sp.alpha = a;
          sp.zIndex = (h.y + h.h) * TILE - 1;
        }
      }
    }
  }

  /** Sprite mit Schatten unter festem Namen. */
  private drawNamed(base: string, cx: number, cy: number, z: number, shadow = `${base}.shadow`): Sprite {
    const s = this.sprites;
    if (s.has(shadow)) {
      const sh = this.shadows.get(s.frame(shadow));
      sh.position.set(cx, cy);
      sh.scale.set(s.info(shadow)?.meta?.scale ?? 1);
    }
    const sp = this.ents.get(s.frame(base));
    sp.position.set(cx, cy);
    sp.zIndex = z;
    return sp;
  }

  private dotTex: Texture | null = null;

  /**
   * Sichtfenster eines Rohrs (wie die Fenster der Rohre im Original): Farbe der Flüssigkeit, umso kräftiger,
   * je voller das Rohr ist; leere Rohre ohne Fenster.
   */
  private pipeWindow(e: Entity, cx: number, cy: number, z: number): void {
    if (!isFluidHolder(e)) return;
    const b = e.fluidBoxes()[0];
    const sum = b ? fluidSummary(b, FLUID_UNIT) : null;
    if (!sum?.fluid || sum.own <= 0.5) return;
    if (!this.dotTex) {
      const gr = new Graphics().roundRect(0, 0, 32, 32, 9).fill(0xffffff);
      this.dotTex = this.app.renderer.generateTexture(gr);
    }
    const f = Math.min(1, sum.own / Math.max(1e-9, sum.ownCap));
    const sp = this.ents.get(this.dotTex);
    sp.anchor.set(0.5);
    sp.position.set(cx, cy - TILE * 0.06);
    sp.scale.set((TILE * 0.26) / 32);
    sp.tint = visibleFluidColor(FLUIDS[sum.fluid]?.color ?? 0x888888);
    sp.alpha = 0.35 + 0.6 * f;
    sp.zIndex = z;
  }

  /**
   * Flüssigkeitsanschlüsse aller sichtbaren Gebäude: Pfeil (hinein/heraus) am Rand und Symbol der Flüssigkeit,
   * nur genutzte Anschlüsse (Rezept bzw. Inhalt bekannt).
   */
  private drawFluidPorts(world: World, g: Graphics): void {
    const s = this.sprites;
    const z = this.camera.zoom;
    const v = this.viewRect();
    for (const e of this.visibleEntities(world, v)) {
      if (e.kind === 'pipe' || e.kind === 'pipe-ground' || !isFluidHolder(e)) continue;
      const boxes = e.fluidBoxes();
      for (const p of e.fluidPorts()) {
        const b = p.box;
        if (b.filter === UNUSED) continue;
        const fluid = (b.filter ?? b.net?.fluid ?? b.fluid) as string | null;
        if (!fluid && e.kind === 'tank') continue;
        const dir = portDirection(e, boxes.indexOf(b), b);
        // Randmitte des Anschlussfelds
        const ex = (p.tx + 0.5 + DX[p.dir] * 0.5) * TILE;
        const ey = (p.ty + 0.5 + DY[p.dir] * 0.5) * TILE;
        if (dir) {
          // Pfeil: heraus = nach außen, hinein = zum Gebäude
          const sgn = dir === 'out' ? 1 : -1;
          const ax = DX[p.dir] * sgn;
          const ay = DY[p.dir] * sgn;
          const tip = TILE * 0.2;
          const back = TILE * 0.06;
          const wide = TILE * 0.13;
          const bx = ex - ax * back;
          const by = ey - ay * back;
          g.poly([bx + ax * tip, by + ay * tip, bx - ay * wide, by + ax * wide, bx + ay * wide, by - ax * wide])
            .fill({ color: dir === 'out' ? 0xffb03a : 0x7ad0ff, alpha: 0.95 }).stroke({ width: 1.5 / z, color: 0x000000, alpha: 0.6 });
        }
        if (fluid && s.has(`item.${fluid}`)) {
          const ix = ex + DX[p.dir] * TILE * 0.42;
          const iy = ey + DY[p.dir] * TILE * 0.42;
          const size = TILE * 0.4;
          this.altBg.circle(ix, iy, size * 0.62).fill({ color: 0x0b0b0a, alpha: 0.7 }).stroke({ width: 1.5, color: 0x000000, alpha: 0.5 });
          const sp = this.icons.get(s.frame(`item.${fluid}`));
          sp.position.set(ix, iy);
          sp.scale.set((size / TILE) * 0.95);
        }
      }
    }
  }

  /** Stromkabel zwischen Masten, leicht durchhängend. */
  private drawWires(world: World, v: ReturnType<GameRenderer['viewRect']>, ui: RenderUi): void {
    const g = this.wires;
    g.clear();
    const gs = this.wireShadows;
    gs.clear();
    // Licht von Nordwesten: Schatten fallen nach Südosten, Versatz wächst mit der Kabelhöhe
    const SHX = 0.85;
    const SHY = 0.32;
    const liftOf = (name: string) => (this.sprites.info(name)?.meta?.wireLift ?? this.sprites.info('small-electric-pole')?.meta?.wireLift ?? 0.95) * TILE;
    for (const [a, b] of world.power.wires) {
      const pa = world.entities.get(a);
      const pb = world.entities.get(b);
      if (!pa || !pb) continue;
      const la = liftOf(pa.name);
      const lb = liftOf(pb.name);
      if (Math.max(pa.cx, pb.cx) < v.x0 || Math.min(pa.cx, pb.cx) > v.x1 || Math.max(pa.cy, pb.cy) < v.y0 || Math.min(pa.cy, pb.cy) > v.y1) continue;
      const ax = pa.cx * TILE;
      const ay = pa.cy * TILE - la;
      const bx = pb.cx * TILE;
      const by = pb.cy * TILE - lb;
      const sag = Math.hypot(bx - ax, by - ay) * 0.08;
      g.moveTo(ax, ay).quadraticCurveTo((ax + bx) / 2, (ay + by) / 2 + sag, bx, by).stroke({ width: 1.8, color: 0x4a2e1a, alpha: 0.9 });
      g.moveTo(ax, ay - 0.6).quadraticCurveTo((ax + bx) / 2, (ay + by) / 2 + sag - 0.6, bx, by - 0.6).stroke({ width: 0.7, color: 0xb07040, alpha: 0.7 });
      const sax = pa.cx * TILE + la * SHX;
      const say = pa.cy * TILE + la * SHY;
      const sbx = pb.cx * TILE + lb * SHX;
      const sby = pb.cy * TILE + lb * SHY;
      gs.moveTo(sax, say).quadraticCurveTo((sax + sbx) / 2 - sag * SHX * 0.5, (say + sby) / 2 - sag * 0.2, sbx, sby).stroke({ width: 2, color: 0x000000, alpha: 0.28 });
    }
    // Freileitungen zwischen den Holzmasten der alten Welt (je Mast zu seinen zwei nächsten Nachbarn)
    const poles = this.visibleEntities(world, { x0: v.x0 - 16, y0: v.y0 - 16, x1: v.x1 + 16, y1: v.y1 + 16 }).filter((e) => e.name === 'utility-pole');
    const POLE_LIFT = 1.44 * TILE;
    for (const pa of poles) {
      const near = poles.filter((pb) => pb !== pa && Math.hypot(pb.cx - pa.cx, pb.cy - pa.cy) < 17).sort((x, y) => Math.hypot(x.cx - pa.cx, x.cy - pa.cy) - Math.hypot(y.cx - pa.cx, y.cy - pa.cy)).slice(0, 2);
      for (const pb of near) {
        if (pb.id < pa.id && near.length > 0 && poles.some((q) => q === pb)) {
          // nur einmal je Paar zeichnen: der Mast mit der kleineren ID zeichnet, wenn auch er den anderen als Nachbarn hat
          const back = poles.filter((q) => q !== pb && Math.hypot(q.cx - pb.cx, q.cy - pb.cy) < 17).sort((x, y) => Math.hypot(x.cx - pb.cx, x.cy - pb.cy) - Math.hypot(y.cx - pb.cx, y.cy - pb.cy)).slice(0, 2);
          if (back.includes(pa)) continue;
        }
        const d = Math.hypot(pb.cx - pa.cx, pb.cy - pa.cy) * TILE;
        for (const off of [-0.38, 0, 0.38]) {
          const ax = pa.cx * TILE + off * TILE;
          const ay = pa.cy * TILE - POLE_LIFT;
          const bx = pb.cx * TILE + off * TILE;
          const by = pb.cy * TILE - POLE_LIFT;
          g.moveTo(ax, ay).quadraticCurveTo((ax + bx) / 2, (ay + by) / 2 + d * 0.06, bx, by).stroke({ width: 1.4, color: 0x1e1c1a, alpha: 0.85 });
          gs.moveTo(ax + POLE_LIFT * SHX, pa.cy * TILE + POLE_LIFT * SHY).quadraticCurveTo((ax + bx) / 2 + POLE_LIFT * SHX, (pa.cy + pb.cy) / 2 * TILE + POLE_LIFT * SHY, bx + POLE_LIFT * SHX, pb.cy * TILE + POLE_LIFT * SHY).stroke({ width: 1.6, color: 0x000000, alpha: 0.2 });
        }
      }
    }
    // Schaltungsdrähte (rot/grün), leicht versetzt
    const lift = (e: Entity) => (e.kind === 'pole' ? liftOf(e.name) : 0.35 * TILE);
    for (const wr of world.circuit.wires) {
      const ea = world.entities.get(wr.a.id);
      const eb = world.entities.get(wr.b.id);
      if (!ea || !eb) continue;
      const pa = CircuitSystem.pointPos(ea, wr.a.side);
      const pb = CircuitSystem.pointPos(eb, wr.b.side);
      if (Math.max(pa.x, pb.x) < v.x0 || Math.min(pa.x, pb.x) > v.x1 || Math.max(pa.y, pb.y) < v.y0 || Math.min(pa.y, pb.y) > v.y1) continue;
      const off = wr.color === 'red' ? -2 : 2;
      const ax = pa.x * TILE + off;
      const ay = pa.y * TILE - lift(ea);
      const bx = pb.x * TILE + off;
      const by = pb.y * TILE - lift(eb);
      const sag = Math.hypot(bx - ax, by - ay) * 0.1;
      g.moveTo(ax, ay).quadraticCurveTo((ax + bx) / 2, (ay + by) / 2 + sag, bx, by).stroke({ width: 1.5, color: wr.color === 'red' ? 0xd0342c : 0x3fae4a, alpha: 0.95 });
    }
    if (ui.wire?.from) {
      const { from, to, color } = ui.wire;
      g.moveTo(from.x * TILE, from.y * TILE - 0.35 * TILE).lineTo(to.x * TILE, to.y * TILE)
        .stroke({ width: 1.5, color: color === 'red' ? 0xd0342c : 0x3fae4a, alpha: 0.6 });
    }
  }

  /** Sprite nach Schema name.richtung bzw. name (animiert, mit Schatten und Leuchten), sonst Item-Symbol. */
  /** Ticks je Animationsbild aus der Bildrate des Sprites (Standard 15 Bilder/s). */
  private ticksPerFrame(name: string): number {
    return 60 / (this.sprites.info(name)?.fps ?? 15);
  }

  /** Arbeitslicht: pulsierender Lichtpunkt an der Gebäudeecke im Arbeitstakt (wie die Statuslampen im Original). */
  private statusLight(e: Entity, cx: number, cy: number, work: number): void {
    const s = this.sprites;
    if (!s.has('fx.light') || e.w < 2) return;
    const color = e.kind === 'lab' ? 0x7fd8ff : e.kind === 'furnace' ? 0xffb050 : 0x9dff7a;
    const pulse = 0.55 + 0.45 * Math.sin((work / 60) * Math.PI * 2 * 1.2);
    const g = this.glow.get(s.frame('fx.light'));
    g.position.set(cx + e.w * TILE * 0.38, cy - e.h * TILE * 0.42);
    g.scale.set((TILE * 0.32) / g.texture.width);
    g.tint = color;
    g.alpha = pulse * 0.9;
  }

  private drawGeneric(e: Entity, cx: number, cy: number, z: number): void {
    const s = this.sprites;
    const base = s.has(`${e.name}.${e.dir}`) ? `${e.name}.${e.dir}` : s.has(e.name) ? e.name : null;
    const work = (e as { workTicks?: number }).workTicks ?? 0;
    if (!base) {
      const sp = this.ents.get(s.frame(`item.${e.def.item}`));
      sp.position.set(cx, cy);
      sp.scale.set(Math.min(e.w, e.h) * 0.85);
      sp.zIndex = z;
      return;
    }
    if (s.has(`${base}.shadow`)) {
      const sh = this.shadows.get(s.frame(`${base}.shadow`));
      sh.position.set(cx, cy);
      sh.scale.set(s.info(`${base}.shadow`)?.meta?.scale ?? 1);
    }
    const sp = this.ents.get(s.frame(base, Math.floor(work / this.ticksPerFrame(base))));
    if (e.status === Status.Working) this.statusLight(e, cx, cy, work);
    sp.position.set(cx, cy);
    sp.zIndex = z;
    if (e.status === Status.Working && s.has(`${base}.glow`)) {
      const g = this.glow.get(s.frame(`${base}.glow`, Math.floor(work / 6)));
      g.position.set(cx, cy);
    }
  }

  private drawGhost(ui: RenderUi, world: World): void {
    const gp = this.ghostSprites;
    gp.begin();
    // geplante Gebäude (Blaupausen) in Blau
    const v = this.viewRect();
    for (const g of world.ghosts.all.values()) {
      if (g.x > v.x1 + 2 || g.x < v.x0 - 6 || g.y > v.y1 + 2 || g.y < v.y0 - 6) continue;
      this.drawGhostSprite({ name: g.name, x: g.x, y: g.y, dir: g.dir, ok: true }, 0x8ab8ff, 0.55);
    }
    for (const g of ui.ghosts ?? []) this.drawGhostSprite(g, g.ok ? 0x7dff8a : 0xff6a5a, 0.8);
    if (ui.ghost) this.drawGhostSprite(ui.ghost, ui.ghost.ok ? 0x7dff8a : 0xff6a5a, 1);
    gp.end();
  }

  private drawGhostSprite(g: Ghost, tint: number, alpha: number): void {
    const gp = this.ghostSprites;
    {
      const def = entityDef(g.name);
      const [gw, gh] = sizeOf(def, g.dir);
      const cx = (g.x + gw / 2) * TILE;
      const cy = (g.y + gh / 2) * TILE;
      let tex: Texture;
      switch (def.kind) {
        case 'belt': {
          const pre = def.speed >= BELT.speed * 3 ? 'express-belt' : def.speed > BELT.speed ? 'fast-belt' : 'belt';
          tex = this.sprites.frame(this.sprites.has(`${pre}.s.${g.dir}`) ? `${pre}.s.${g.dir}` : `belt.s.${g.dir}`);
          break;
        }
        case 'underground': {
          const b = this.sprites.has(`${g.name}.in.${g.dir}`) ? g.name : 'underground-belt';
          tex = this.sprites.frame(this.sprites.has(`${b}.in.${g.dir}`) ? `${b}.in.${g.dir}` : `item.${def.item}`);
          break;
        }
        case 'drill': tex = this.sprites.frame(g.name === 'burner-mining-drill' || !this.sprites.has(`${g.name}.${g.dir}`) ? `drill.${g.dir}` : `${g.name}.${g.dir}`); break;
        case 'furnace': tex = this.sprites.frame(g.name !== 'stone-furnace' && this.sprites.has(`${g.name}.off`) ? `${g.name}.off` : 'furnace.off'); break;
        case 'inserter': tex = this.sprites.frame('inserter.base'); break;
        default: {
          const b = this.sprites.has(`${g.name}.${g.dir}`) ? `${g.name}.${g.dir}` : this.sprites.has(g.name) ? g.name : `item.${def.item}`;
          tex = this.sprites.frame(b);
        }
      }
      const sp = gp.get(tex);
      sp.position.set(cx, cy);
      sp.tint = tint;
      sp.alpha = alpha;
      if (def.kind === 'inserter') {
        const angles = this.sprites.info('inserter.arm')?.meta?.angles ?? 0;
        const arm = gp.get(this.sprites.frame('inserter.arm', angles ? (g.dir * angles) / 4 : 0));
        arm.position.set(cx, cy);
        if (!angles) arm.rotation = (g.dir * Math.PI) / 2;
        arm.tint = tint;
        arm.alpha = alpha;
      }
    }
  }

  /** Züge: Fahrzeuge in 16 Winkeln (sonst gedrehtes Item-Symbol). */
  private drawVehicles(world: World): void {
    const v = this.viewRect();
    const s = this.sprites;
    // Pritschenwagen: 16 Winkel (0 = Osten, im Uhrzeigersinn), Schatten; fährt er, wackelt er leicht
    for (const c of world.cars.cars) {
      if (c.x < v.x0 - 4 || c.x > v.x1 + 4 || c.y < v.y0 - 4 || c.y > v.y1 + 5) continue;
      const k = ((Math.round(c.angle / (Math.PI / 8)) % 16) + 16) % 16;
      const key = `pickup.${k}`;
      if (s.has(`${key}.shadow`)) {
        const sh = this.shadows.get(s.frame(`${key}.shadow`));
        sh.position.set(c.x * TILE, c.y * TILE);
      }
      const bump = c.running ? Math.sin(world.tick * 0.9 + c.id) * (Math.abs(c.speed) > 0.05 ? 1.2 : 0.5) : 0;
      const sp = this.ents.get(s.frame(s.has(key) ? key : 'item.fuel-can'));
      sp.position.set(c.x * TILE, c.y * TILE + bump);
      if (!s.has(key)) {
        sp.rotation = c.angle;
        sp.scale.set(3, 2);
      }
      sp.zIndex = c.y * TILE + 20;
    }
  }

  /**
   * Zombies: Kadaver, Wracks zerstörter Gebäude, Zombies (8 Richtungen, Laufbilder je Art; ohne Sprites zeichnet
   * drawCombat Kreise). Sprite-Namen: zombie.<art>.<richtung>, zombie.<art>.dead, zombie.shadow.
   */
  private drawEnemies(world: World, v: ReturnType<GameRenderer['viewRect']>, alpha: number): void {
    const s = this.sprites;
    const en = world.enemies;
    for (const r of en.remnants) {
      if (r.x < v.x0 - 4 || r.x > v.x1 + 4 || r.y < v.y0 - 4 || r.y > v.y1 + 4) continue;
      const age = world.tick - r.tick;
      if (r.kind === 'building' && r.name) {
        // Wrack: Gebäudebild verkohlt, eingesunken, leicht verdreht
        const base = s.has(`${r.name}.${r.dir}`) ? `${r.name}.${r.dir}` : s.has(r.name) ? r.name
          : r.name === 'burner-mining-drill' && s.has(`drill.${r.dir}`) ? `drill.${r.dir}` : s.has(`${r.name}.off`) ? `${r.name}.off` : null;
        const h = (Math.imul(Math.round(r.x * 7 + r.y * 13), 0x9e3779b1) >>> 0) / 4294967296;
        if (s.has('decal.dirt.0')) {
          // Brandfleck am Boden (Schattenebene, unter allen Gebäuden)
          const sc = this.shadows.get(s.frame(`decal.dirt.${Math.floor(h * 4)}`));
          sc.position.set(r.x * TILE, r.y * TILE + 6);
          sc.scale.set(r.size * 0.55);
          sc.tint = 0x000000;
          sc.alpha = 0.9 * Math.max(0, 1 - age / (15 * 3600));
        }
        if (base) {
          const sp = this.ents.get(s.frame(base));
          sp.position.set(r.x * TILE, r.y * TILE + 6);
          sp.scale.set(0.94, 0.8);
          sp.rotation = (h - 0.5) * 0.12;
          sp.tint = 0x4e443a;
          sp.alpha = Math.min(1, 1.2 - age / (15 * 3600));
          sp.zIndex = r.y * TILE - 80;
        }
        continue;
      }
      if (r.kind === 'animal') {
        const ak = `animal.${r.name}.dead`;
        if (!s.has(ak)) continue;
        const sp = this.ents.get(s.frame(ak));
        sp.position.set(r.x * TILE, r.y * TILE);
        sp.scale.set(1);
        sp.alpha = Math.max(0, Math.min(1, 1.5 - age / 7200));
        sp.zIndex = r.y * TILE - 64;
        continue;
      }
      const vk = r.name && r.id !== undefined ? this.zombieBase(r.name, r.id) : `zombie.${r.name ?? 'walker'}`;
      const key = s.has(`${vk}.dead`) ? `${vk}.dead` : `zombie.${r.name ?? 'walker'}.dead`;
      if (!s.has(key)) continue;
      const sp = this.ents.get(s.frame(key, Math.floor(Math.abs(r.x * 3 + r.y * 5))));
      sp.position.set(r.x * TILE, r.y * TILE);
      sp.scale.set(r.size);
      sp.alpha = Math.max(0, Math.min(1, 1.5 - age / 4800));
      sp.zIndex = r.y * TILE - 64;
    }
    const t = world.tick + alpha;
    for (const u of en.units.values()) {
      if (u.x < v.x0 - 2 || u.x > v.x1 + 2 || u.y < v.y0 - 2 || u.y > v.y1 + 3) continue;
      const def = UNITS[u.kind];
      const base = this.zombieBase(u.kind, u.id);
      if (!s.has(`${base}.0`)) continue;
      const n = s.info(`${base}.0`)?.meta?.angles ?? 8;
      const k = ((Math.round(((u.angle + Math.PI / 2) / (Math.PI * 2)) * n) % n) + n) % n;
      if (s.has('zombie.shadow')) {
        const sh = this.shadows.get(s.frame('zombie.shadow'));
        sh.position.set(u.x * TILE, u.y * TILE);
        sh.scale.set(def.scale);
      }
      // Laufbild aus der zurückgelegten Strecke; im Stand leichtes Schwanken (Bild 0/1)
      const moving = u.phase > 0;
      const frames = s.frames(`${base}.${k}`).length;
      const f = moving ? Math.floor(u.phase * (frames / 1.1)) : 0;
      const sp = this.ents.get(s.frame(`${base}.${k}`, f));
      const sway = moving ? 0 : Math.sin(t / 22 + u.id) * 0.03;
      sp.position.set(u.x * TILE, u.y * TILE);
      // Größe und Kleidung je Zombie (Vielfalt): ±8 % Größe, Farbe aus einer Palette, dazu Verwesung
      sp.scale.set(def.scale * (0.92 + ((u.id * 7) % 9) * 0.02));
      sp.rotation = sway + (u.stun > 0 ? 0.12 : 0);
      const v8 = 215 + ((u.id * 37) % 41);
      sp.tint = mulTint(ZOMBIE_TINTS[(u.id * 5 + 3) % ZOMBIE_TINTS.length], (v8 << 16) | ((v8 - ((u.id * 13) % 20)) << 8) | (v8 - ((u.id * 7) % 26)));
      sp.zIndex = u.y * TILE;
      // Kriecher im Gras: halb verdeckt, bis man nah dran ist
      if (u.kind === 'crawler' && !world.map.floorAt(Math.floor(u.x), Math.floor(u.y))) {
        const p = world.player;
        const d = p ? Math.hypot(p.x - u.x, p.y - u.y) : 99;
        sp.alpha = d < 4 ? 1 : Math.max(0.45, 1 - (d - 4) * 0.08);
      }
    }
  }

  private zombieVariants = new Map<string, number>();
  /** Kleidung je Zombie: Grundmodell oder eine der Varianten zombie.<art>.v<n> (models/zombievolk.py). */
  private zombieBase(kind: string, id: number): string {
    let n = this.zombieVariants.get(kind);
    if (n === undefined) {
      n = 0;
      for (let v = 1; v < 32; v++) if (this.sprites.has(`zombie.${kind}.v${v}.0`)) n = v;
      this.zombieVariants.set(kind, n);
    }
    if (!n) return `zombie.${kind}`;
    const pick = ((Math.imul(id, 2654435761) >>> 0) >> 7) % (n + 1);
    if (pick === 0 || !this.sprites.has(`zombie.${kind}.v${pick}.0`)) return `zombie.${kind}`;
    return `zombie.${kind}.v${pick}`;
  }

  /** Wildtiere: 8 Richtungen, Laufbilder aus der Laufphase, beim Grasen gesenkter Kopf. */
  private drawWildlife(world: World, v: ReturnType<GameRenderer['viewRect']>): void {
    const s = this.sprites;
    this.ambient?.drawGround(this.ents);
    for (const a of world.wildlife.animals) {
      if (a.x < v.x0 - 2 || a.x > v.x1 + 2 || a.y < v.y0 - 2 || a.y > v.y1 + 3) continue;
      const base = `animal.${a.kind}`;
      if (!s.has(`${base}.0`)) continue;
      const k = ((Math.round(((a.angle + Math.PI / 2) / (Math.PI * 2)) * 8) % 8) + 8) % 8;
      const graze = a.mode === 'graze' && s.has(`${base}.graze.${k}`) && ((a.id * 7 + Math.floor(world.tick / 240)) % 3) !== 0;
      const tex = graze ? s.frame(`${base}.graze.${k}`) : s.frame(`${base}.${k}`, a.mode === 'graze' ? 0 : Math.floor(a.phase * s.frames(`${base}.${k}`).length));
      const sp = this.ents.get(tex);
      sp.position.set(a.x * TILE, a.y * TILE);
      sp.scale.set(0.92 + ((a.id * 7) % 9) * 0.02);
      sp.zIndex = a.y * TILE;
    }
  }

  /** Bewohner und Überlebende: Figur in Arbeitskleidung, Farbe je Aufgabe, Aufgabensymbol bzw. Last über dem Kopf. */
  private drawWorkers(world: World, v: ReturnType<GameRenderer['viewRect']>, alpha: number): void {
    const s = this.sprites;
    if (!s.has('player.walk.0')) return;
    const t = world.tick + alpha;
    for (const k of world.community.workers) {
      if (k.x < v.x0 - 2 || k.x > v.x1 + 2 || k.y < v.y0 - 2 || k.y > v.y1 + 3) continue;
      const dir = (Math.round((k.angle + Math.PI / 2) / (Math.PI / 4)) + 8) % 8;
      const base = s.has('worker.walk.0') ? 'worker' : 'player';
      const busy = k.state === 'gather' || (k.state === 'work' && k.job !== 'medic') || t - k.shot < 14;
      const tex = busy ? s.frame(`${base}.mine.${dir}`, Math.floor(t / 7.5)) : s.frame(`${base}.walk.${dir}`, Math.floor(k.phase * 6));
      const sp = this.ents.get(tex);
      sp.position.set(k.x * TILE, k.y * TILE);
      sp.scale.set(0.92);
      if (base === 'player') sp.tint = 0xb8c8a0;
      // Überlebende: andere Kleidung (getönt), wartend mit Winken
      if (k.faction === 'raider') sp.tint = 0xb06a5a;
      else if (k.faction === 'trader') sp.tint = 0xe0d090;
      else if (!k.resident) {
        sp.tint = 0xa8bce0;
        if (k.state === 'wait') sp.rotation = Math.sin(t / 15 + k.id) * 0.05;
      } else sp.tint = mulTint(JOB_TINT[k.job], PEOPLE_TINTS[(k.id * 3) % PEOPLE_TINTS.length]);
      sp.scale.set(0.88 + ((k.id * 5) % 5) * 0.025);
      if (k.state === 'sleep') {
        sp.rotation = Math.PI / 2;
        sp.tint = 0x9a9aa8;
      }
      sp.zIndex = k.y * TILE;
      // Last bzw. Aufgabensymbol (klein) über dem Kopf
      const icon = k.cargo.length ? k.cargo[k.cargo.length - 1] : k.faction === 'raider' ? (k.gun ? 'pistol' : 'baseball-bat') : k.faction === 'trader' ? 'backpack' : k.resident ? JOBS[k.job].icon : null;
      if (icon && s.has(`item.${icon}`)) {
        const it = this.ents.get(s.frame(`item.${icon}`));
        it.position.set(k.x * TILE, (k.y - 0.95) * TILE);
        it.scale.set(k.cargo.length ? 0.32 : 0.22);
        it.alpha = k.cargo.length ? 1 : 0.85;
        it.zIndex = k.y * TILE + 1;
      }
    }
  }

  /** Roboter im Flug: Sprite (sonst Item-Symbol) mit Flughöhe und Bodenschatten. */
  private drawRobots(world: World): void {
    const v = this.viewRect();
    const s = this.sprites;
    const lift = 1.1 * TILE;
    for (const r of world.robots.robots) {
      if (r.x < v.x0 - 2 || r.x > v.x1 + 2 || r.y < v.y0 - 2 || r.y > v.y1 + 3) continue;
      const key = s.has(`robot.${r.kind}`) ? `robot.${r.kind}` : `item.${r.kind}`;
      const bob = Math.sin((world.tick + r.id * 7) * 0.12) * 2;
      if (!r.charging) {
        const sh = this.shadows.get(s.frame(s.has(`robot.${r.kind}.shadow`) ? `robot.${r.kind}.shadow` : 'item.shadow'));
        sh.position.set(r.x * TILE + 10, r.y * TILE + 6);
      }
      const sp = this.ents.get(s.frame(key));
      sp.position.set(r.x * TILE, r.y * TILE - (r.charging ? 0.5 * TILE : lift) + bob);
      if (!s.has(`robot.${r.kind}`)) sp.scale.set(0.55);
      sp.zIndex = 1e7 + r.y * TILE;
      for (const c of r.cargo.slice(0, 1)) {
        const it = this.ents.get(s.frame(`item.${c.item}`));
        it.position.set(r.x * TILE, r.y * TILE - lift + bob + 14);
        it.scale.set(0.3);
        it.zIndex = 1e7 + r.y * TILE + 1;
      }
    }
  }

  // ------------------------------------------------------------------ Overlay

  /**
   * Wie im Original beim Bauen von Masten: Versorgungsflächen aller Masten (blau, vereinigt),
   * für den Mast im Cursor bzw. unter der Maus zusätzlich Fläche, Kabelreichweite und Kabelvorschau
   * (grün: wird verbunden; rot: nächster Mast zu weit weg).
   */
  private drawPowerAreas(world: World, pole: Ghost | null, g: Graphics): void {
    const z = this.camera.zoom;
    const v = this.viewRect();
    const poles: { cx: number; cy: number; def: PoleDef; x: number; y: number }[] = [];
    for (const e of world.entities.values()) if (e.kind === 'pole') poles.push({ cx: e.cx, cy: e.cy, def: e.def as PoleDef, x: e.x, y: e.y });
    // Vereinigung der Versorgungsflächen als Feldzeilen (gleichmäßige Farbe ohne Überlappungen)
    const rows = new Map<number, [number, number][]>();
    const area = (cx: number, cy: number, r: number) => {
      const x0 = Math.max(v.x0, Math.ceil(cx - r - 1e-9));
      const x1 = Math.min(v.x1, Math.floor(cx + r - 1e-9));
      for (let y = Math.max(v.y0, Math.ceil(cy - r - 1e-9)); y <= Math.min(v.y1, Math.floor(cy + r - 1e-9)); y++) {
        if (x0 > x1) continue;
        let l = rows.get(y);
        if (!l) rows.set(y, (l = []));
        l.push([x0, x1]);
      }
    };
    for (const p of poles) area(p.cx, p.cy, p.def.supplyRadius);
    for (const [y, spans] of rows) {
      spans.sort((a, b) => a[0] - b[0]);
      let [a, b] = spans[0];
      for (let i = 1; i <= spans.length; i++) {
        const s = spans[i];
        if (s && s[0] <= b + 1) {
          b = Math.max(b, s[1]);
          continue;
        }
        g.rect(a * TILE, y * TILE, (b - a + 1) * TILE, TILE);
        if (s) [a, b] = s;
      }
    }
    g.fill({ color: 0x3a8fff, alpha: 0.16 });
    if (!pole) return;
    const def = entityDef(pole.name) as PoleDef;
    const [w, h] = sizeOf(def, pole.dir);
    const cx = pole.x + w / 2;
    const cy = pole.y + h / 2;
    const r = def.supplyRadius;
    g.rect((cx - r) * TILE, (cy - r) * TILE, 2 * r * TILE, 2 * r * TILE)
      .fill({ color: 0x3a8fff, alpha: 0.14 })
      .stroke({ width: 2 / z, color: 0x9fd4ff, alpha: 0.95 });
    // Kabelreichweite (Mittelpunkt zu Mittelpunkt)
    g.circle(cx * TILE, cy * TILE, def.wireReach * TILE).stroke({ width: 1.5 / z, color: 0x9fd4ff, alpha: 0.45 });
    let near: { cx: number; cy: number; d: number } | null = null;
    let linked = 0;
    for (const p of poles) {
      if (p.x === pole.x && p.y === pole.y) continue;
      const d = Math.hypot(p.cx - cx, p.cy - cy);
      if (d <= Math.min(def.wireReach, p.def.wireReach)) {
        g.moveTo(cx * TILE, cy * TILE).lineTo(p.cx * TILE, p.cy * TILE).stroke({ width: 2.5 / z, color: 0x7dff8a, alpha: 0.9 });
        linked++;
      } else if (!near || d < near.d) near = { cx: p.cx, cy: p.cy, d };
    }
    if (!linked && near && near.d < def.wireReach * 3) {
      g.moveTo(cx * TILE, cy * TILE).lineTo(near.cx * TILE, near.cy * TILE).stroke({ width: 2.5 / z, color: 0xff6a5a, alpha: 0.85 });
    }
  }

  /**
   * Abbaufelder eines Bohrers: Felder mit Rohstoff hell, leere Felder blass, Rahmen um den Bereich;
   * gelb die Ausgabestelle (dort muss ein Band, eine Kiste oder ein Ofen stehen).
   */
  private drawDrillArea(world: World, d: Ghost, g: Graphics): void {
    const z = this.camera.zoom;
    const def = entityDef(d.name) as DrillDef;
    const area = drillAreaTiles(def, d.x, d.y);
    for (const [tx, ty] of area) {
      const r = world.map.resourceAt(tx, ty);
      const has = r.amount > 0 && !RESOURCE_BY_INDEX[r.res]?.fluid;
      g.rect(tx * TILE, ty * TILE, TILE, TILE).fill({ color: has ? 0x4fb4ff : 0xffffff, alpha: has ? 0.28 : 0.07 });
    }
    const n = def.miningAreaSize;
    g.rect(area[0][0] * TILE, area[0][1] * TILE, n * TILE, n * TILE).stroke({ width: 2 / z, color: 0x9fd4ff, alpha: 0.95 });
    const [px, py] = drillOutputPoint(def, d.x, d.y, d.dir);
    const ox = Math.floor(px);
    const oy = Math.floor(py);
    g.rect(ox * TILE + 2, oy * TILE + 2, TILE - 4, TILE - 4).fill({ color: 0xffd23a, alpha: 0.18 }).stroke({ width: 2 / z, color: 0xffd23a, alpha: 0.95 });
    this.arrow(g, px - DX[d.dir] * 0.15, py - DY[d.dir] * 0.15, d.dir, 0xffd23a, 0.3, 0.95);
  }

  /** Greifarm: Aufnahmefeld und Gebäude dort grün, Ablagefeld und Zielgebäude gelb, Pfeil dazwischen. */
  private drawInserterReach(world: World, ins: Ghost, g: Graphics): void {
    const z = this.camera.zoom;
    const def = entityDef(ins.name) as InserterDef;
    const cx = ins.x + 0.5;
    const cy = ins.y + 0.5;
    const [pvx, pvy] = rotateVec(def.pickupVector[0], def.pickupVector[1], ins.dir);
    const [dvx, dvy] = rotateVec(def.dropVector[0], def.dropVector[1], ins.dir);
    const pick: [number, number] = [cx + pvx, cy + pvy];
    const drop: [number, number] = [cx + dvx, cy + dvy];
    const mark = (p: [number, number], color: number) => {
      const e = world.entityAt(p[0], p[1]);
      if (e && e.kind !== 'belt') {
        g.rect(e.x * TILE + 2, e.y * TILE + 2, e.w * TILE - 4, e.h * TILE - 4).fill({ color, alpha: 0.12 }).stroke({ width: 2 / z, color, alpha: 0.9 });
      }
      const tx = Math.floor(p[0]);
      const ty = Math.floor(p[1]);
      g.rect(tx * TILE + 4, ty * TILE + 4, TILE - 8, TILE - 8).fill({ color, alpha: 0.3 }).stroke({ width: 2 / z, color, alpha: 1 });
    };
    mark(pick, 0x6fe07a);
    mark(drop, 0xffd23a);
    g.moveTo(pick[0] * TILE, pick[1] * TILE).lineTo(drop[0] * TILE, drop[1] * TILE).stroke({ width: 2.5 / z, color: 0xffd23a, alpha: 0.85 });
    this.arrow(g, drop[0] - DX[ins.dir] * 0.2, drop[1] - DY[ins.dir] * 0.2, ins.dir, 0xffd23a, 0.3, 0.95);
  }

  private drawOverlay(world: World, ui: RenderUi): void {
    const g = this.overlay;
    g.clear();
    this.altBg.clear();
    const z = this.camera.zoom;
    if (ui.robotAreas) {
      for (const net of world.robots.nets) {
        for (const p of net.ports) {
          const L = 25;
          const C = 55;
          g.rect((p.px - C) * TILE, (p.py - C) * TILE, 2 * C * TILE, 2 * C * TILE).fill({ color: 0x4fbf4f, alpha: 0.05 }).stroke({ width: 1 / z, color: 0x66ff66, alpha: 0.5 });
          g.rect((p.px - L) * TILE, (p.py - L) * TILE, 2 * L * TILE, 2 * L * TILE).fill({ color: 0xf98a1d, alpha: 0.07 }).stroke({ width: 1.5 / z, color: 0xf98a1d, alpha: 0.7 });
        }
      }
    }
    if (ui.power) this.drawPowerAreas(world, ui.power.pole, g);
    if (ui.drill) this.drawDrillArea(world, ui.drill, g);
    if (ui.inserter) this.drawInserterReach(world, ui.inserter, g);
    if (ui.floorBrush) {
      const b = ui.floorBrush;
      g.rect(b.x * TILE, b.y * TILE, b.n * TILE, b.n * TILE).fill({ color: 0x7dff8a, alpha: 0.12 }).stroke({ width: 2 / z, color: 0x7dff8a, alpha: 0.9 });
    }
    if (ui.throwAim) {
      const a = ui.throwAim;
      const ok = Math.hypot(a.x - a.px, a.y - a.py) <= a.range;
      g.circle(a.px * TILE, a.py * TILE, a.range * TILE).stroke({ width: 1.5 / z, color: 0xffd23a, alpha: 0.5 });
      g.circle(a.x * TILE, a.y * TILE, a.radius * TILE).fill({ color: ok ? 0xff7a3a : 0xff3a3a, alpha: 0.15 }).stroke({ width: 2 / z, color: ok ? 0xffb03a : 0xff4a3a, alpha: 0.9 });
    }
    // zum Abriss markiert: rotes Kreuz
    for (const id of world.robots.marked) {
      const e = world.entities.get(id);
      if (!e) continue;
      const x0 = e.x * TILE + 6;
      const y0 = e.y * TILE + 6;
      const x1 = (e.x + e.w) * TILE - 6;
      const y1 = (e.y + e.h) * TILE - 6;
      g.moveTo(x0, y0).lineTo(x1, y1).moveTo(x1, y0).lineTo(x0, y1).stroke({ width: 3 / z, color: 0xff4030, alpha: 0.85 });
    }
    // zum Fällen markierte Bäume
    for (const t of world.robots.markedTrees.values()) {
      const cx = t.x * TILE;
      const cy = (t.y - 0.6) * TILE;
      const r = TILE * 0.35;
      g.moveTo(cx - r, cy - r).lineTo(cx + r, cy + r).moveTo(cx + r, cy - r).lineTo(cx - r, cy + r).stroke({ width: 3 / z, color: 0xff4030, alpha: 0.85 });
    }
    // Baufläche der persönlichen Roboter (beim Planen: Blaupause im Cursor oder Auswahl)
    const pl = world.player;
    if (pl?.grid && pl.grid.roboports > 0 && pl.personalRobots && (ui.selection || (ui.ghosts?.length ?? 0) > 0)) {
      const R = pl.grid.constructionRadius;
      const px = pl.px / 256;
      const py = pl.py / 256;
      g.rect((px - R) * TILE, (py - R) * TILE, 2 * R * TILE, 2 * R * TILE).stroke({ width: 2 / z, color: 0x7ad0ff, alpha: 0.55 });
    }
    this.drawCombat(world, g);
    if (ui.selection) {
      const r = ui.selection;
      const col = r.cut ? 0xff6a5a : 0x8ac8ff;
      g.rect(r.x0 * TILE, r.y0 * TILE, (r.x1 - r.x0) * TILE, (r.y1 - r.y0) * TILE)
        .fill({ color: col, alpha: 0.12 })
        .stroke({ width: 2 / z, color: col, alpha: 0.95 });
    }
    if (ui.hover) {
      const hv = ui.hover;
      g.rect(hv.x * TILE, hv.y * TILE, hv.w * TILE, hv.h * TILE).stroke({ width: 2 / z, color: 0xffe08a, alpha: 0.9 });
      if (ui.mining > 0) {
        g.rect(hv.x * TILE, (hv.y + hv.h) * TILE + 4, hv.w * TILE, 6).fill({ color: 0x222222, alpha: 0.8 });
        g.rect(hv.x * TILE, (hv.y + hv.h) * TILE + 4, hv.w * TILE * ui.mining, 6).fill({ color: 0xf0b030 });
      }
    }
    if (ui.ghost) {
      const def = entityDef(ui.ghost.name);
      if (def.kind === 'drill') {
        const a = def.miningAreaSize;
        const [gw, gh] = sizeOf(def, ui.ghost.dir);
        const ox = ui.ghost.x + (gw - a) / 2;
        const oy = ui.ghost.y + (gh - a) / 2;
        g.rect(ox * TILE + 2, oy * TILE + 2, a * TILE - 4, a * TILE - 4).stroke({ width: 2 / z, color: 0x80c0ff, alpha: 0.8 });
      }
      const [aw, ah] = sizeOf(def, ui.ghost.dir);
      if (def.rotatable) this.arrow(g, ui.ghost.x + aw / 2, ui.ghost.y + ah / 2, ui.ghost.dir, ui.ghost.ok ? 0x9dff9a : 0xff8070);
    }
    if (ui.alt || ui.fluidPorts) this.drawFluidPorts(world, g);
    if (!ui.alt) return;
    const v = this.viewRect();
    for (const e of this.visibleEntities(world, v)) {
      if (e.kind === 'belt') {
        this.arrow(g, e.x + 0.5, e.y + 0.5, e.dir, 0xffffff, 0.22, 0.45);
        continue;
      }
      if (e.kind === 'drill') {
        const [px, py] = world.drillOutputPoint(e);
        this.arrow(g, px, py - DY[e.dir] * 0.3 - 0, e.dir, 0xffd060, 0.3);
        const area = e.areaTiles();
        g.rect(area[0][0] * TILE + 3, area[0][1] * TILE + 3, e.def.miningAreaSize * TILE - 6, e.def.miningAreaSize * TILE - 6).stroke({ width: 1.5 / z, color: 0x80c0ff, alpha: 0.5 });
      } else if (e.kind === 'inserter') {
        this.arrow(g, e.x + 0.5 + DX[e.dir] * 0.75, e.y + 0.5 + DY[e.dir] * 0.75, e.dir, 0xffd060, 0.22);
      } else if (e.kind === 'tank') {
        // Füllstand in der Farbe der Flüssigkeit
        const s = fluidSummary(e.box, FLUID_UNIT);
        const f = s.own / Math.max(1e-9, s.ownCap);
        const bw = e.w * TILE * 0.8;
        const bx = (e.x + e.w * 0.1) * TILE;
        const by = (e.y + e.h - 0.45) * TILE;
        g.rect(bx, by, bw, 10).fill({ color: 0x14120f, alpha: 0.85 });
        if (f > 0) g.rect(bx + 1, by + 1, (bw - 2) * f, 8).fill({ color: s.fluid ? visibleFluidColor(FLUIDS[s.fluid]?.color ?? 0x8a8a8a) : 0x8a8a8a, alpha: 0.95 });
      }
      this.drawAltContents(e, g, world);
    }
  }

  /** Schüsse (Leuchtspur, Mündungsfeuer), Lebensbalken, Platzhalter für Gegner ohne Grafik. */
  private drawCombat(world: World, g: Graphics): void {
    const z = this.camera.zoom;
    const v = this.viewRect();
    const t = world.tick;
    const shot = (x0: number, y0: number, x1: number, y1: number) => {
      g.moveTo(x0 * TILE, y0 * TILE).lineTo(x1 * TILE, y1 * TILE).stroke({ width: 2 / z, color: 0xffe08a, alpha: 0.8 });
      g.circle(x0 * TILE, y0 * TILE, 7).fill({ color: 0xffc040, alpha: 0.85 });
      g.circle(x1 * TILE, y1 * TILE, 4).fill({ color: 0xffa040, alpha: 0.7 });
    };
    // Wurfgegenstände im Flug (Bogen: Höhe nach Parabel)
    for (const c of world.capsules.flying) {
      const f = c.t / c.total;
      const x = c.x0 + (c.tx - c.x0) * f;
      const y = c.y0 + (c.ty - c.y0) * f;
      const lift = Math.sin(f * Math.PI) * Math.min(3, c.total * 0.04);
      g.circle(x * TILE, y * TILE, 6).fill({ color: 0x000000, alpha: 0.25 });
      g.circle(x * TILE, (y - lift) * TILE, 7).fill({ color: c.item === 'grenade' ? 0x4f5a3e : 0x8a2f22 }).stroke({ width: 1.5 / z, color: 0x111111 });
    }
    const bar = (x: number, y: number, w: number, f: number) => {
      g.rect(x * TILE, y * TILE, w * TILE, 5).fill({ color: 0x111111, alpha: 0.8 });
      g.rect(x * TILE, y * TILE, w * TILE * Math.max(0, f), 5).fill({ color: f > 0.5 ? 0x5fd35f : f > 0.25 ? 0xe0c040 : 0xe05040 });
    };
    for (const e of this.visibleEntities(world, v)) {
      if (e.hp < e.def.health) bar(e.x + 0.1, e.y + e.h - 0.1, e.w - 0.2, e.hp / e.def.health);
      if (e.kind === 'turret' && t - e.lastShot < 3) {
        shot(e.cx + Math.cos(e.angle) * 1.1, e.cy - 0.35 + Math.sin(e.angle) * 1.1, e.shotX, e.shotY);
      }
    }
    for (const k of world.community.workers) {
      const max = k.resident ? COMMUNITY.health : SURVIVOR.health;
      if (k.hp < max) bar(k.x - 0.3, k.y + 0.3, 0.6, k.hp / max);
    }
    for (const u of world.enemies.units.values()) {
      if (u.x < v.x0 || u.x > v.x1 || u.y < v.y0 || u.y > v.y1) continue;
      const def = UNITS[u.kind];
      if (!this.sprites.has(`zombie.${u.kind}.0`)) g.circle(u.x * TILE, u.y * TILE, def.radius * TILE).fill({ color: ZOMBIE_COLOR[u.kind] }).stroke({ width: 2 / z, color: 0x1a2410 });
      if (u.hp < def.health) bar(u.x - 0.3, u.y + def.radius + 0.1, 0.6, u.hp / def.health);
    }
    for (const r of world.enemies.remnants) {
      if (r.kind !== 'building' || this.sprites.has('decal.dirt.0')) continue;
      g.ellipse(r.x * TILE, r.y * TILE + 8, r.size * 0.6 * TILE, r.size * 0.42 * TILE).fill({ color: 0x15110d, alpha: 0.45 * Math.max(0, 1 - (t - r.tick) / (15 * 3600)) });
    }
    const p = world.player;
    if (p && !p.dead) {
      if (t - p.lastShot < 3) shot(p.x, p.y - 0.5, p.shotX, p.shotY);
      // Nahkampf: kurzer Schwungbogen in Schlagrichtung
      if (t - p.lastMelee < 7) {
        const a = p.meleeAngle;
        const k = (t - p.lastMelee) / 7;
        g.arc(p.x * TILE, (p.y - 0.3) * TILE, 0.9 * TILE, a - 0.9 + k * 0.6, a + 0.3 + k * 0.6).stroke({ width: 5 / z, color: 0xfff2d0, alpha: 0.75 * (1 - k) });
      }
      // Durchsuchen: Fortschrittsbalken am Fundort
      const st = p.searchTarget !== null ? world.entities.get(p.searchTarget) : undefined;
      if (st && st.kind === 'loot') bar(st.x + 0.2, st.y - 0.35, st.w - 0.4, st.searchProgress / st.searchTicks);
      if (p.hp < PLAYER_COMBAT.health) bar(p.x - 0.4, p.y + 0.35, 0.8, p.hp / PLAYER_COMBAT.health);
    }
  }

  /**
   * Alt-Ansicht wie im Original: großes Symbol des Produkts auf Maschinen (Rezept, Erz unter dem Bohrer,
   * Flüssigkeit im Tank), bis zu vier Items über Kisten, Module als kleine Symbole, Statuspunkt.
   */
  private drawAltContents(e: Entity, g: Graphics, world: World): void {
    const s = this.sprites;
    const icon = (item: string, x: number, y: number, size: number) => {
      const name = `item.${item}`;
      if (!s.has(name)) return;
      this.altBg.circle(x, y, size * 0.62).fill({ color: 0x0b0b0a, alpha: 0.62 }).stroke({ width: 1.5, color: 0x000000, alpha: 0.5 });
      const sp = this.icons.get(s.frame(name));
      sp.position.set(x, y);
      sp.scale.set((size / TILE) * 0.95);
    };
    const cx = e.cx * TILE;
    const cy = e.cy * TILE;
    const big = Math.min(e.w, e.h) * TILE * (e.w >= 3 ? 0.48 : e.w >= 2 ? 0.6 : 0.72);
    let main: string | null = null;
    if (e.kind === 'assembler') main = e.recipe?.results[0]?.item ?? null;
    else if (e.kind === 'furnace') main = e.recipe?.results[0].item ?? e.result.firstItem() ?? null;
    else if (e.kind === 'drill') {
      for (const [tx, ty] of e.areaTiles()) {
        const r = world.map.resourceAt(tx, ty);
        if (r.amount > 0) {
          main = RESOURCE_BY_INDEX[r.res]?.result ?? null;
          break;
        }
      }
    } else if (e.kind === 'tank') main = e.box.fluid ?? null;
    else if (e.kind === 'offshore-pump') main = 'water';
    else if (e.kind === 'turret') main = e.ammo.firstItem() ?? e.roundsItem ?? null;
    if (main) icon(main, cx, cy - (e.h >= 2 ? 0.08 * TILE : 0), big);
    if (e.kind === 'container') {
      // häufigste Items (bis zu vier) im Raster
      const counts = new Map<string, number>();
      const inv = e.inventory;
      for (const st of inv.slots) if (st) counts.set(st.item, (counts.get(st.item) ?? 0) + st.count);
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 4).map(([k]) => k);
      const n = top.length;
      const sz = n === 1 ? TILE * 0.6 : TILE * 0.42;
      top.forEach((it, k) => {
        const ox = n === 1 ? 0 : ((k % 2) - 0.5) * sz * 1.05;
        const oy = n <= 2 ? 0 : (Math.floor(k / 2) - 0.5) * sz * 1.05;
        icon(it, cx + ox, cy + oy - 6, sz);
      });
    }
    // Module als kleine Symbole am unteren Rand
    const mods = (e as { modules?: { slots: ({ item: string } | null)[] } | null }).modules;
    if (mods) {
      const list = mods.slots.filter((x): x is { item: string } => !!x).map((x) => x.item);
      list.forEach((it, k) => icon(it, cx + (k - (list.length - 1) / 2) * TILE * 0.32, (e.y + e.h) * TILE - TILE * 0.28, TILE * 0.28));
    }
    const stat = STATUS_COLORS[e.status];
    if (stat !== undefined) g.circle(cx + e.w * TILE * 0.36, cy - e.h * TILE * 0.36, 5).fill({ color: stat }).stroke({ width: 1, color: 0x000000, alpha: 0.6 });
  }


  private arrow(g: Graphics, x: number, y: number, dir: Dir, color: number, size = 0.3, alpha = 0.85): void {
    const fx = DX[dir];
    const fy = DY[dir];
    const lx = -fy;
    const ly = fx;
    const cx = x * TILE;
    const cy = y * TILE;
    const s = size * TILE;
    g.poly([
      cx + fx * s, cy + fy * s,
      cx - fx * s * 0.6 + lx * s * 0.7, cy - fy * s * 0.6 + ly * s * 0.7,
      cx - fx * s * 0.2, cy - fy * s * 0.2,
      cx - fx * s * 0.6 - lx * s * 0.7, cy - fy * s * 0.6 - ly * s * 0.7,
    ]).fill({ color, alpha });
  }
}

const STATUS_COLORS: Partial<Record<Status, number>> = {
  [Status.Working]: 0x50d060,
  [Status.NoFuel]: 0xe04030,
  [Status.OutputBlocked]: 0xf0a020,
  [Status.NoInput]: 0xd0c040,
  [Status.Depleted]: 0x808080,
  [Status.NoTarget]: 0xd0c040,
  [Status.Idle]: 0x808080,
  [Status.NoPower]: 0xe04030,
};

export { Shape };

/** Fließrichtung eines Anschlusses: aus Rezept bzw. Gebäudeart; null = unbekannt (nur Symbol). */
function portDirection(e: Entity, boxIndex: number, b: FluidBox): 'in' | 'out' | null {
  switch (e.kind) {
    case 'assembler': return e.def.fluidBoxes?.[boxIndex]?.type === 'output' ? 'out' : 'in';
    case 'boiler': return b === e.water ? 'in' : 'out';
    case 'generator': return 'in';
    case 'offshore-pump': return 'out';
    default: return null;
  }
}
