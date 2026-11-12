import { entityDef } from '../data/entities';
import { ITEMS } from '../data/items';
import { MELEE, PLAYER_COMBAT, UNITS } from '../data/enemies';
import { SURVIVAL, isConsumable } from '../data/survival';
import { PLAYER } from '../data/player';
import { DAY, dayNumber } from '../data/time';
import { compassName } from '../sim/enemies';
import { WORLD } from '../data/world';
import { CLIFF_SETTINGS, type CliffSetting, DEATH_SETTINGS, type DeathSetting, DEFAULT_MAP_SETTINGS, ENEMY_SETTINGS, FREQUENCY_SETTINGS, type FrequencySetting, type EnemySetting, RESOURCE_SETTINGS, type ResourceSetting } from '../data/mapgen';
import { EMPTY_ANY_BARREL, FILL_ANY_BARREL, RECIPES, RECIPE_LIST, isFluidBarrelRecipe } from '../data/recipes';
import { TECHS, TECH_BY_ID, type TechEffect } from '../data/tech';
import type { Game } from '../game/game';
import { deleteSave, listSaves, loadWorld, saveWorld } from '../game/save';
import { type SaveData, deserializeWorld, serializeWorld } from '../sim/serialize';
import { isGzip, pack, unpack } from '../game/packing';
import { PRESETS } from '../data/blueprints';
import { type Blueprint, decode as bpDecode, encode as bpEncode } from '../sim/blueprint';
import { importForeign, isForeignText, reportText } from '../sim/foreignbp';
import { type SpriteLib, graphicsQuality, setGraphicsQuality } from '../render/assets';
import { bloomEnabled, setBloomEnabled } from '../render/look';
import { Status } from '../sim/entity';
import { type Entity, acceptAmount, insertInto, itemId, itemIndex } from '../sim/machines';
import type { Inventory } from '../sim/inventory';
import { ARITHMETIC_OPS, COMPARATORS, VIRTUAL_SIGNALS, signalLabel } from '../data/circuit';
import { FLUIDS } from '../data/fluids';
import type { Condition } from '../sim/circuit';
import { MapView, Minimap } from './minimap';
import { StatsView, fmtPower } from './stats';
import { powerReport } from '../sim/powerreport';
import { Tooltip } from './tooltip';
import { ARMORS, EQUIPMENT } from '../data/armor';
import { type FluidHolder, UNUSED, fluidSummary, isFluidHolder } from '../sim/fluids';
import { isHeatNode, temperatureOf } from '../sim/entities/nuclear';
import { FLUID_UNIT, isFluid, visibleFluidColor } from '../data/fluids';
import { CHART } from '../data/chart';
import { TechTreeView } from './techtree';
import { HandbookView } from './handbook';

const STATUS_TEXT: Record<Status, string> = {
  [Status.Idle]: 'Leerlauf',
  [Status.Working]: 'Arbeitet',
  [Status.NoFuel]: 'Kein Brennstoff',
  [Status.OutputBlocked]: 'Ausgabe blockiert',
  [Status.NoInput]: 'Keine Zutaten',
  [Status.Depleted]: 'Ressourcen erschöpft',
  [Status.NoTarget]: 'Kein Ziel',
  [Status.NoPower]: 'Kein Strom',
  [Status.Disabled]: 'Durch Schaltbedingung aus',
};

/** Flüssigkeitsmenge lesbar (Tausender mit Punkt). */
function fmtFluid(v: number): string {
  return Math.round(v).toLocaleString('de-DE');
}

/** Wirkung einer Forschungsstufe als Text. */
function effectText(e: TechEffect): string {
  const pct = `+${Math.round(e.value * 100)} %`;
  switch (e.type) {
    case 'inserter-stack': return `+${e.value} Greifarm-Kapazität`;
    case 'bulk-stack': return `+${e.value} Massengreifarm-Kapazität`;
    case 'mining-productivity': return `${pct} Bergbau-Produktivität`;
    case 'lab-speed': return `${pct} Laborgeschwindigkeit`;
    case 'toolbelt': return `+${e.value} Inventarplätze`;
    case 'bullet-damage': return `${pct} Kugelschaden`;
    case 'turret-damage': return `${pct} Geschützturm-Schaden`;
    case 'shooting-speed': return `${pct} Feuerrate`;
    case 'robot-speed': return `${pct} Robotertempo`;
    case 'robot-cargo': return `+${e.value} Roboterfracht`;
    case 'braking': return `${pct} Bremskraft`;
    case 'hand-mining': return `${pct} Abbautempo der Figur`;
    case 'pole-light': return 'Strommasten leuchten nachts';
  }
}

/** Statustext; Leerlauf bei Strom- und Wasserteilen genauer benennen. */
function statusText(e: Entity): string {
  if (e.kind === 'assembler' && !e.recipe) return 'Kein Rezept – unten ein Rezept wählen';
  if (e.status === Status.Idle) {
    if (e.kind === 'offshore-pump') return 'Leitung voll – wartet auf Verbrauch';
    if (e.kind === 'boiler') return 'Dampf voll – kein Strombedarf';
    if (e.kind === 'generator') return 'Kein Strombedarf (Verbraucher anschließen)';
  }
  return STATUS_TEXT[e.status];
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  parent?.appendChild(e);
  return e;
}

/** Schlankes DOM-Overlay für Schnellleiste, Inventar, Handwerk und Gebäudefenster. */
/** Rezeptreiter wie im Original. */
const CRAFT_GROUPS = ['Überleben', 'Kampf', 'Logistik', 'Produktion', 'Zwischenprodukte'] as const;
type CraftGroup = (typeof CRAFT_GROUPS)[number];
const LOGISTIK_KINDS = new Set(['belt', 'underground', 'splitter', 'inserter', 'container', 'pole', 'pipe', 'pipe-ground', 'pump', 'tank', 'rail', 'train-stop', 'roboport', 'lamp', 'combinator']);
const KAMPF = new Set([
  'firearm-magazine', 'piercing-rounds-magazine', 'pistol', 'submachine-gun', 'gun-turret', 'stone-wall', 'repair-pack', 'radar', 'grenade', 'heavy-armor',
  'spear', 'knife', 'baseball-bat', 'axe', 'crowbar', 'wooden-barricade', 'gate', 'barbed-wire', 'spike-trap', 'noise-lure',
]);
const UEBERLEBEN = new Set(['bandage', 'first-aid-kit', 'antibiotics', 'empty-bottle', 'stew', 'bed', 'garden', 'rain-barrel', 'radio-tower']);
function recipeGroup(item: string): CraftGroup {
  if (KAMPF.has(item)) return 'Kampf';
  if (UEBERLEBEN.has(item)) return 'Überleben';
  const place = ITEMS[item]?.placeResult;
  if (place) return LOGISTIK_KINDS.has(entityDef(place).kind) ? 'Logistik' : 'Produktion';
  if (item === 'locomotive' || item === 'cargo-wagon' || item.endsWith('-robot')) return 'Logistik';
  return 'Zwischenprodukte';
}

export class Hud {
  private readonly layer: HTMLDivElement;
  private readonly info: HTMLDivElement;
  private readonly debugBox: HTMLDivElement;
  private readonly quickbar: HTMLDivElement;
  private readonly cursorEl: HTMLDivElement;
  private readonly hoverEl: HTMLDivElement;
  private readonly msgEl: HTMLDivElement;
  private readonly help: HTMLDivElement;
  private readonly invWin: HTMLDivElement;
  private readonly entWin: HTMLDivElement;
  private readonly menu: HTMLDivElement;
  private readonly techWin: HTMLDivElement;
  private readonly statsWin: HTMLDivElement;
  private readonly bookWin: HTMLDivElement;
  private readonly powerWin: HTMLDivElement;
  private readonly powerBadge: HTMLDivElement;
  private readonly gridView: StatsView;
  /** gewähltes Netz in der Stromübersicht (Schlüssel), null = größtes. */
  private powerNetKey: number | null = null;
  private readonly bpWin: HTMLDivElement;
  private readonly trainWin: HTMLDivElement;
  private openTrainId: { train: number; vehicle: number } | null = null;
  private readonly prodView: StatsView;
  private readonly powerView: StatsView;
  readonly tip: Tooltip;
  readonly minimap: Minimap;
  readonly mapView: MapView;
  private readonly researchEl: HTMLDivElement;
  private readonly craftQueueEl: HTMLDivElement;
  private openEntityId: number | null = null;
  private showDebug = false;
  private frame = 0;
  typing = false;
  private title = '';

  constructor(root: HTMLElement, private readonly game: Game, private readonly sprites: SpriteLib) {
    this.layer = el('div', 'hud', root);
    this.info = el('div', 'hud-info', this.layer);
    this.survEl = el('div', 'hud-survival', this.layer);
    this.sleepEl = el('div', 'sleep-veil hidden', this.layer);
    this.endWin = el('div', 'window endscreen hidden', this.layer);
    this.debugBox = el('div', 'hud-debug', this.layer);
    this.quickbar = el('div', 'quickbar', this.layer);
    this.craftQueueEl = el('div', 'craft-queue', this.layer);
    this.cursorEl = el('div', 'cursor-item', this.layer);
    this.hoverEl = el('div', 'hover-info', this.layer);
    this.msgEl = el('div', 'messages', this.layer);
    this.help = el('div', 'window help hidden', this.layer);
    const row = el('div', 'window-row', this.layer);
    this.invWin = el('div', 'window inventory hidden', row);
    this.entWin = el('div', 'window entity hidden', row);
    this.menu = el('div', 'window menu hidden', this.layer);
    this.techWin = el('div', 'window tech hidden', this.layer);
    this.statsWin = el('div', 'window stats hidden', this.layer);
    this.bookWin = el('div', 'window handbook hidden', this.layer);
    this.powerWin = el('div', 'window stats power-win hidden', this.layer);
    this.powerBadge = el('div', 'hud-power hidden', this.layer);
    this.powerBadge.title = 'Strom-Übersicht (O)';
    this.powerBadge.onclick = () => this.togglePower();
    this.bpWin = el('div', 'window blueprints hidden', this.layer);
    this.trainWin = el('div', 'window train hidden', this.layer);
    const statIcon = (id: string) => (this.sprites.has(`item.${id}`) ? this.icon(`item.${id}`, 'icon small') : null);
    this.prodView = new StatsView(statIcon, 'items');
    this.powerView = new StatsView(statIcon, 'power');
    this.gridView = new StatsView(statIcon, 'power');
    this.researchEl = el('div', 'research-bar', this.layer);
    this.minimap = new Minimap(this.layer, () => game.renderer.biomeField(game.world));
    this.mapView = new MapView(this.layer, this.minimap);
    this.mapView.onPick = (x, y) => {
      if (!game.world.player) {
        game.renderer.camera.x = x;
        game.renderer.camera.y = y;
      }
    };
    this.minimap.onPick = (x, y) => {
      if (game.world.player) return; // im freien Spiel folgt die Kamera dem Spieler
      game.renderer.camera.x = x;
      game.renderer.camera.y = y;
    };
    this.tip = new Tooltip(this.layer, (n) => this.sprites.iconUrl(n));
    this.cursorEl.style.transform = 'translate(-100px, -100px)';
    this.buildHelp();
    this.showDebug = game.debug;
    window.addEventListener('pointermove', (e) => {
      this.cursorEl.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 14}px)`;
    });
    this.refreshAll();
  }

  private craftTab: CraftGroup = 'Überleben';
  private survEl!: HTMLElement;
  private sleepEl!: HTMLElement;
  private endWin!: HTMLElement;
  private survKey = '';
  private endKey = '';

  setTitle(t: string): void {
    this.title = t;
    this.rocketsSeen = -1; // neue Welt: Starts nicht erneut melden
  }

  icon(name: string, cls = 'icon'): HTMLImageElement {
    const img = el('img', cls);
    img.src = this.sprites.iconUrl(name);
    img.draggable = false;
    return img;
  }

  refreshAll(): void {
    this.buildQuickbar();
    if (!this.invWin.classList.contains('hidden')) this.buildInventory();
    if (this.openEntityId !== null) this.buildEntity();
  }

  update(fps: number): void {
    this.frame++;
    const g = this.game;
    const w = g.world;
    {
      const c = g.renderer.camera;
      const pl = w.player;
      const r = g.renderer.screenToWorld(0, 0);
      const r2 = g.renderer.screenToWorld(g.renderer.app.screen.width, g.renderer.app.screen.height);
      this.minimap.update(w, pl ? pl.px / 256 : c.x, pl ? pl.py / 256 : c.y, { x0: r.x, y0: r.y, x1: r2.x, y1: r2.y });
      this.mapView.update(w, { x0: r.x, y0: r.y, x1: r2.x, y1: r2.y });
    }
    this.info.textContent = `Letzte Schicht – ${this.title} · H: Hilfe`;
    if (this.frame % 6 === 0) {
      this.updateSurvival();
      this.updateEndScreen();
    }
    if (this.showDebug) {
      const st = g.renderer.stats;
      this.debugBox.style.display = 'block';
      this.debugBox.textContent =
        `FPS ${fps.toFixed(0)} | Tick ${w.tick} | Bänder ${w.belts.count} | Items ${w.belts.itemCount} | ` +
        `Gezeichnet: Boden ${st.ground}, Deko ${st.decor}, Band ${st.belts}, Items ${st.items}, Gebäude ${st.entities}` +
        (g.paused ? ' | PAUSE' : '');
    } else this.debugBox.style.display = 'none';
    // Cursor-Item
    const ci = g.cursorItem;
    if (ci) {
      const count = g.creative ? '∞' : String(w.player?.inventory.count(ci) ?? 0);
      const key = `${ci}|${count}`;
      if (this.cursorEl.dataset.key !== key) {
        this.cursorEl.dataset.key = key;
        this.cursorEl.replaceChildren(this.icon(`item.${ci}`), Object.assign(el('span'), { textContent: count }));
      }
      this.cursorEl.style.display = 'block';
    } else this.cursorEl.style.display = 'none';
    // Hover
    if (this.frame % 6 === 0) {
      this.hoverEl.textContent = g.hoverInfo();
      this.hoverEl.style.display = this.hoverEl.textContent ? 'block' : 'none';
      this.updateQuickbarCounts();
      this.updateCraftQueue();
      const p = w.player;
      this.updateResearch();
      if (p && p.messages.length) {
        this.msgEl.textContent = p.messages.join(' · ');
        this.msgEl.dataset.t = String(this.frame);
        p.messages.length = 0;
      } else if (Number(this.msgEl.dataset.t ?? 0) + 180 < this.frame) this.msgEl.textContent = '';
    }
    if (this.frame % 60 === 0 && !this.statsWin.classList.contains('hidden')) this.buildStats();
    if (this.frame % 30 === 0) this.updatePowerBadge();
    if (this.frame % 60 === 0 && !this.powerWin.classList.contains('hidden')) this.buildPower();
    if (this.frame % 15 === 0 && this.openTrainId) this.buildTrain();
    if (this.frame % 10 === 0) {
      if (!this.invWin.classList.contains('hidden')) this.updateInventory();
      if (this.openEntityId !== null) {
        this.buildEntity();
        this.updateCircuitLive();
      }
    }
  }

  // ---------------------------------------------------------- Überleben

  /** Uhrzeit aus der Tageszeit (0 = Mittag). */
  private clock(): string {
    const w = this.game.world;
    const h = (12 + w.daytime * 24) % 24;
    return `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 6) * 10).padStart(2, '0')}`;
  }

  /** Anzeige links unten: Tag/Uhrzeit, Gesundheit, Hunger, Durst, Müdigkeit, Zustände, Waffe, Lärm, nächste Horde. */
  private updateSurvival(): void {
    const w = this.game.world;
    const p = w.player;
    if (!p) {
      this.survEl.style.display = 'none';
      return;
    }
    this.survEl.style.display = 'flex';
    const needs = !!w.settings.needs && !p.god;
    const day = dayNumber(w.tick);
    const night = w.darkness > 0.6 ? 'Nacht' : w.darkness > 0.05 ? 'Dämmerung' : 'Tag';
    const tags: string[] = [];
    if (p.wounds.length) tags.push(`Blutung${p.wounds.length > 1 ? ` ×${p.wounds.length}` : ''}`);
    if (p.infection !== null) tags.push(p.infection >= SURVIVAL.feverFrom ? 'Fieber' : 'Gebissen');
    if (needs && p.fatigue >= SURVIVAL.tiredFrom) tags.push('Erschöpft');
    if (p.sleeping) tags.push('Schläft');
    const gun = p.weapon;
    const weapon = p.useGun && gun && p.hasAmmo
      ? `${ITEMS[gun].name} (${p.rounds + [...p.inventory.contents()].filter((c) => c.item.endsWith('magazine')).reduce((a, c) => a + c.count * 10, 0)} Schuss)`
      : p.meleeWeapon ? `${ITEMS[p.meleeWeapon].name} (${Math.max(0, Math.round(100 * (1 - (p.meleeWear[p.meleeWeapon] ?? 0) / MELEE[p.meleeWeapon].durability)))} %)` : 'Fäuste';
    const noise = w.noise.baseLevel;
    const noiseTxt = noise <= 0 ? 'still' : noise < 12 ? 'leise' : noise < 24 ? 'hörbar' : noise < 40 ? 'laut' : 'sehr laut';
    const near = w.enemies.near(p.x, p.y, 30, w.tick).length;
    // nächste Horde: Größe heute Abend bzw. wann die erste kommt
    const today = w.enemies.hordeSize(w, day);
    const untilDusk = ((DAY.dusk * DAY.ticks - (w.tick % DAY.ticks)) + DAY.ticks) % DAY.ticks;
    const horde = w.settings.enemies === 'aus' ? '' : w.daytime < DAY.dusk && today > 0
      ? `Horde heute Abend: ~${today} (in ${Math.ceil(untilDusk / 3600)} min)`
      : w.enemies.lastHorde && w.tick - w.enemies.lastHorde.tick < DAY.ticks * 0.45 ? `Horde aus ${compassName(w.enemies.lastHorde.angle)}: ${w.enemies.lastHorde.size}` : '';
    const key = [Math.round(p.x / 8), Math.round(p.y / 8), day, this.clock(), night, Math.round(p.hp), Math.round(p.hunger), Math.round(p.thirst), Math.round(p.fatigue), tags.join(), weapon, noiseTxt, near, horde, needs].join('|');
    if (key === this.survKey) return;
    this.survKey = key;
    this.survEl.replaceChildren();
    const head = el('div', 'surv-head', this.survEl);
    const town = w.settings.plan ? WORLD.towns.find((t) => Math.hypot(t.x - p.x, t.y - p.y) < 30 + t.size * 22) : undefined;
    head.textContent = `Tag ${day} · ${this.clock()} · ${night}${town ? ` · ${town.name}` : ''}`;
    const bar = (label: string, frac: number, cls: string, title: string) => {
      const r = el('div', `surv-row ${cls}${frac < 0.25 ? ' low' : ''}`, this.survEl);
      r.title = title;
      el('span', 'label', r).textContent = label;
      const b = el('div', 'progress', r);
      el('div', 'fill', b).style.width = `${(Math.max(0, Math.min(1, frac)) * 100).toFixed(0)}%`;
    };
    bar('Gesundheit', p.hp / PLAYER_COMBAT.health, 'hp', 'Heilt langsam, wenn du satt bist, nicht durstig und nicht blutest');
    if (needs) {
      bar('Hunger', p.hunger / 100, 'hunger', 'Essen: Konserven, Gemüse, Eintopf (Rechtsklick im Inventar)');
      bar('Durst', p.thirst / 100, 'thirst', 'Trinken: Wasserflasche; leere Flaschen am See oder in der Regentonne füllen');
      bar('Ausdauer', 1 - p.fatigue / 100, 'rest', 'Schlafen: Taste N (im Feldbett erholsamer). Schlaf nur ohne Zombies in der Nähe');
    }
    if (tags.length) el('div', 'surv-tags', this.survEl).textContent = tags.join(' · ');
    el('div', 'surv-line', this.survEl).textContent = `Waffe: ${weapon} · X wechselt`;
    el('div', `surv-line${noise >= 24 ? ' warn' : ''}`, this.survEl).textContent = `Lärm im Lager: ${noiseTxt} · Zombies in der Nähe: ${near}`;
    if (horde) el('div', 'surv-line warn', this.survEl).textContent = horde;
    this.sleepEl.classList.toggle('hidden', !p.sleeping);
    if (p.sleeping) this.sleepEl.textContent = 'Du schläfst … (WASD oder N: aufstehen)';
  }

  /** Abschluss: Tod (endgültig) oder Rettung durch den Funkturm. */
  private updateEndScreen(): void {
    const w = this.game.world;
    const p = w.player;
    const dead = !!p?.dead;
    const rescued = w.rescuedAt !== null;
    const key = dead ? `dead${p!.deathTick}` : rescued ? `rescued${w.rescuedAt}` : '';
    if (key === this.endKey) return;
    this.endKey = key;
    if (!key || (rescued && !dead && this.rescueSeen === w.rescuedAt)) {
      this.endWin.classList.add('hidden');
      return;
    }
    this.endWin.classList.remove('hidden');
    this.endWin.replaceChildren();
    const tick = dead ? p!.deathTick : w.rescuedAt!;
    const head = el('div', 'win-head', this.endWin);
    head.textContent = dead ? 'Du bist tot' : 'Gerettet!';
    const body = el('div', 'win-body end-body', this.endWin);
    el('p', 'end-lead', body).textContent = dead
      ? `Du wurdest ${p!.deathCause}.`
      : 'Dein Funkspruch wurde gehört. Am Horizont tauchen die Scheinwerfer der Rettung auf – du hast durchgehalten.';
    const days = (tick / DAY.ticks).toFixed(1).replace('.', ',');
    const kills = (Object.keys(UNITS) as (keyof typeof UNITS)[]).map((k) => `${w.stats.totalMade.get(`kill.${k}`) ?? 0}× ${UNITS[k].name}`).join(', ');
    el('p', '', body).textContent = `Überlebt: ${days} Tage (bis Tag ${dayNumber(tick)})`;
    el('p', '', body).textContent = `Erlegte Zombies: ${w.enemies.kills} (${kills})`;
    el('p', '', body).textContent = `Gebäude: ${[...w.entities.values()].filter((e) => e.kind !== 'loot').length} · Forschungen: ${w.research.done.size}`;
    const btn = (label: string, fn: () => void, primary = false) => {
      const b = el('button', `menu-btn${primary ? ' primary' : ''}`, body);
      b.textContent = label;
      b.onclick = fn;
    };
    if (dead) {
      btn(`Neue Figur in dieser Welt (Tag ${dayNumber(w.tick)})`, () => {
        // die Welt bleibt: Lager, geplünderte Häuser, die Leiche mit dem Inventar – und die alte Figur als Zombie
        if (!w.newCharacter()) return;
        this.game.cursorItem = null;
        this.endWin.classList.add('hidden');
        this.refreshAll();
        void this.saveGame('autosave', true);
      }, true);
      btn('Neue Welt (alles zurücksetzen) …', () => { this.endWin.classList.add('hidden'); this.newGameDialog(); });
      btn('Menü (Spielstände)', () => { this.endWin.classList.add('hidden'); this.toggleMenu(); });
    } else {
      btn('Weiterspielen', () => {
        this.rescueSeen = w.rescuedAt;
        this.endWin.classList.add('hidden');
      }, true);
      btn('Neue Runde …', () => { this.endWin.classList.add('hidden'); this.newGameDialog(); });
    }
  }
  private rescueSeen: number | null = null;

  // ---------------------------------------------------------- Schnellleiste

  private buildQuickbar(): void {
    this.tip.hide();
    this.quickbar.replaceChildren();
    const qb = this.game.quickbar();
    qb.forEach((item, i) => {
      const slot = el('div', 'slot', this.quickbar);
      slot.dataset.slot = String(i);
      const key = el('span', 'key', slot);
      key.textContent = i === 9 ? '0' : String(i + 1);
      if (item) slot.appendChild(this.icon(`item.${item}`));
      el('span', 'count', slot);
      const p = this.game.world.player;
      slot.addEventListener('click', () => {
        // wie im Original: leerer Platz + Gegenstand in der Hand = Platz belegen; sonst Gegenstand in die Hand nehmen
        if (p && !item && this.game.cursorItem) {
          p.quickbar[i] = this.game.cursorItem;
          this.buildQuickbar();
          return;
        }
        this.game.selectQuickbar(i);
      });
      if (item) this.tip.attach(slot, () => this.tip.item(item));
      else slot.title = 'Leer – Gegenstand in die Hand nehmen (im Inventar anklicken oder mit Q aufnehmen), dann hier klicken';
      slot.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        // Rechtsklick: mit dem Gegenstand in der Hand belegen bzw. (ohne) leeren
        if (p) {
          p.quickbar[i] = this.game.cursorItem;
          this.buildQuickbar();
        }
      });
    });
  }

  private updateQuickbarCounts(): void {
    const qb = this.game.quickbar();
    const p = this.game.world.player;
    this.quickbar.querySelectorAll<HTMLDivElement>('.slot').forEach((slot, i) => {
      const item = qb[i];
      const c = slot.querySelector('.count')!;
      c.textContent = item && p && !this.game.creative ? String(p.inventory.count(item)) : '';
      slot.classList.toggle('active', !!item && item === this.game.cursorItem);
      slot.classList.toggle('empty', !!item && !!p && !this.game.creative && p.inventory.count(item) === 0);
    });
  }

  private updateCraftQueue(): void {
    const p = this.game.world.player;
    const q = p?.craftQueue ?? [];
    const key = q.map((j) => `${j.recipe}:${j.toInventory}`).join(',') + (q[0] ? `|${Math.ceil(q[0].ticks / 6)}` : '');
    if (this.craftQueueEl.dataset.key === key) return;
    this.craftQueueEl.dataset.key = key;
    this.craftQueueEl.replaceChildren();
    q.slice(0, 12).forEach((j, i) => {
      const s = el('div', 'slot small', this.craftQueueEl);
      s.appendChild(this.icon(`item.${j.recipe}`));
      if (i === 0) {
        const bar = el('div', 'bar', s);
        const total = Math.round(RECIPE_LIST.find((r) => r.id === j.recipe)!.time * 60);
        bar.style.width = `${100 * (1 - j.ticks / total)}%`;
      }
    });
  }

  // ---------------------------------------------------------- Inventar & Handwerk

  toggleInventory(): void {
    if (!this.game.world.player) return;
    const hidden = this.invWin.classList.toggle('hidden');
    if (!hidden) this.buildInventory();
    else this.closeEntity();
  }

  private invSlots: HTMLDivElement[] = [];
  private recipeEls = new Map<string, HTMLDivElement>();

  private buildInventory(): void {
    const p = this.game.world.player;
    if (!p) return;
    this.tip.hide();
    this.invWin.replaceChildren();
    const head = el('div', 'win-head', this.invWin);
    head.textContent = 'Inventar & Handwerk';
    const close = el('button', 'close', head);
    close.textContent = '×';
    close.onclick = () => this.toggleInventory();
    const body = el('div', 'win-body two', this.invWin);
    const left = el('div', 'col', body);
    const sortBtn = el('button', 'small-btn', left);
    sortBtn.textContent = 'Sortieren';
    sortBtn.onclick = () => { p.inventory.sort(); this.updateInventory(true); };
    const grid = el('div', 'grid inv', left);
    this.invSlots = p.inventory.slots.map((_, i) => {
      const s = el('div', 'slot', grid);
      s.addEventListener('click', (e) => this.onInvSlot(i, e.ctrlKey || e.metaKey ? 'all' : e.shiftKey ? 'stack' : null));
      s.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.onInvSlot(i, 'half');
      });
      this.tip.attach(s, () => (s.dataset.item ? this.tip.item(s.dataset.item, Number(s.dataset.count)) : null));
      return s;
    });
    this.armorEl = el('div', 'armor-panel', left);
    this.armorKey = '';
    this.updateArmor();
    const right = el('div', 'col craft-col', body);
    el('div', 'sub-head', right).textContent = 'Handwerk (Klick: 1, Umschalt: 5, Strg: alle)';
    // Reiter wie im Original: Logistik, Produktion, Zwischenprodukte, Kampf
    const tabs = el('div', 'craft-tabs', right);
    const rgrid = el('div', 'grid recipes', right);
    this.recipeEls.clear();
    const research = this.game.world.research;
    const group = recipeGroup;
    const all = RECIPE_LIST.filter((r) => r.category === 'crafting');
    for (const gname of CRAFT_GROUPS) {
      const b = el('button', `craft-tab${gname === this.craftTab ? ' on' : ''}`, tabs);
      const first = all.find((r) => group(r.results[0].item) === gname);
      if (first) b.appendChild(this.icon(`item.${first.results[0].item}`));
      b.title = gname;
      b.onclick = () => { this.craftTab = gname; this.buildInventory(); };
    }
    // Gesperrte Rezepte ausgegraut hinten anhängen (mit Hinweis auf die nötige Forschung)
    const unlockedFirst = all.filter((r) => group(r.results[0].item) === this.craftTab).sort((a, b) => Number(!research.recipeUnlocked(a.id)) - Number(!research.recipeUnlocked(b.id)));
    for (const r of unlockedFirst) {
      if (!research.recipeUnlocked(r.id)) {
        const tech = TECHS.find((t) => t.unlocks.includes(r.id));
        const s = el('div', 'slot recipe locked', rgrid);
        s.appendChild(this.icon(`item.${r.results[0].item}`));
        el('span', 'lock', s).textContent = '🔒';
        s.dataset.recipe = r.id;
        this.tip.attach(s, () => {
          const box = this.tip.recipe(r, 1, 0, (it) => p.inventory.count(it));
          const hint = el('div', 'tt-locked', box);
          hint.textContent = `Gesperrt – Forschung: ${tech?.name ?? '?'} (T)`;
          return box;
        });
        continue;
      }
      const s = el('div', 'slot recipe', rgrid);
      s.appendChild(this.icon(`item.${r.results[0].item}`));
      el('span', 'count', s);
      s.dataset.recipe = r.id;
      this.tip.attach(s, () => this.tip.recipe(r, 1, p.craftableCount(r.id), (it) => p.inventory.count(it)));
      s.addEventListener('click', (e) => {
        const n = e.ctrlKey || e.metaKey ? 1000 : e.shiftKey ? 5 : 1;
        p.craft(r.id, n);
        this.updateInventory(true);
      });
      this.recipeEls.set(r.id, s);
    }
    const cancel = el('button', 'small-btn', right);
    cancel.textContent = 'Warteschlange abbrechen';
    cancel.onclick = () => { p.cancelCrafting(); this.updateInventory(true); };
    this.updateInventory(true);
  }

  private invKey = '';
  private updateInventory(force = false): void {
    const p = this.game.world.player;
    if (!p) return;
    if (this.invSlots.length !== p.inventory.size) {
      // Inventargröße hat sich geändert (Rüstung, Werkzeuggürtel)
      this.buildInventory();
      return;
    }
    this.updateArmor();
    const key = JSON.stringify(p.inventory.slots) + this.game.cursorItem;
    if (!force && key === this.invKey) return;
    this.invKey = key;
    p.inventory.slots.forEach((st, i) => {
      const s = this.invSlots[i];
      if (!s) return;
      s.replaceChildren();
      if (st) {
        s.appendChild(this.icon(`item.${st.item}`));
        el('span', 'count', s).textContent = String(st.count);
        s.dataset.item = st.item;
        s.dataset.count = String(st.count);
      } else {
        delete s.dataset.item;
      }
      s.classList.toggle('active', !!st && st.item === this.game.cursorItem);
    });
    for (const [id, s] of this.recipeEls) {
      const n = p.craftableCount(id);
      s.classList.toggle('disabled', n === 0);
      s.querySelector('.count')!.textContent = n > 0 ? String(n) : '';
    }
  }

  private armorEl: HTMLDivElement | null = null;
  private armorKey = '';

  /** Rüstung, Ausrüstungsraster und persönliche Roboter (Inventarfenster). */
  private updateArmor(): void {
    const g = this.game;
    const p = g.world.player;
    const box = this.armorEl;
    if (!p || !box) return;
    const grid = p.grid;
    const out = p.personalRobotsOut(g.world);
    const armors = Object.keys(ARMORS).filter((a) => p.inventory.count(a) > 0);
    const equips = Object.keys(EQUIPMENT).filter((a) => p.inventory.count(a) > 0);
    const key = JSON.stringify([p.armor, grid?.items, Math.round((grid?.energy ?? 0) / 1e5), out, armors, equips, p.personalRobots, p.inventory.count('construction-robot'), p.inventory.count('repair-pack')]);
    if (key === this.armorKey) return;
    this.armorKey = key;
    box.replaceChildren();
    const msg = (m: string | null) => {
      if (m) this.flash(m);
      this.armorKey = '';
      this.updateInventory(true);
    };
    const head = el('div', 'sub-head', box);
    head.textContent = 'Rüstung';
    const row = el('div', 'armor-row', box);
    const slot = el('div', 'slot armor-slot', row);
    if (p.armor) {
      slot.appendChild(this.icon(`item.${p.armor}`));
      slot.title = `${ITEMS[p.armor].name} – Klick: ablegen`;
      slot.onclick = () => msg(p.unequipArmor(g.world));
    } else slot.title = 'Keine Rüstung angelegt';
    const info = el('div', 'dim armor-info', row);
    const a = p.armor ? ARMORS[p.armor] : null;
    info.textContent = a
      ? `${ITEMS[p.armor!].name}: Schaden −${a.flat} und −${Math.round(a.percent * 100)} %${a.inventoryBonus ? `, +${a.inventoryBonus} Inventarplätze` : ''}${a.gridW ? `, Raster ${a.gridW}×${a.gridH}` : ''}`
      : 'Rüstung herstellen und hier anlegen.';
    for (const it of armors) {
      const b = el('button', 'small-btn', box);
      b.textContent = `${ITEMS[it].name} anlegen`;
      b.onclick = () => msg(p.equipArmor(g.world, it));
    }
    if (!grid) return;
    // Raster links, Angaben rechts daneben
    const cols = el('div', 'armor-cols', box);
    const side = el('div', 'armor-side', cols);
    // Raster: Ausrüstung als Rechtecke; Klick nimmt sie heraus
    const CELL = 26;
    const gd = el('div', 'equip-grid', cols);
    cols.insertBefore(gd, side);
    gd.style.width = `${grid.w * CELL}px`;
    gd.style.height = `${grid.h * CELL}px`;
    for (const it of grid.items) {
      const d = EQUIPMENT[it.item];
      const c = el('div', `equip ${d.kind}`, gd);
      c.style.left = `${it.x * CELL}px`;
      c.style.top = `${it.y * CELL}px`;
      c.style.width = `${d.w * CELL - 2}px`;
      c.style.height = `${d.h * CELL - 2}px`;
      c.appendChild(this.icon(`item.${it.item}`));
      c.title = `${ITEMS[it.item].name} – Klick: herausnehmen`;
      c.onclick = () => msg(p.removeEquipment(g.world, it.x, it.y));
    }
    for (const it of equips) {
      const b = el('button', 'small-btn', side);
      b.textContent = `${ITEMS[it].name} einsetzen`;
      b.onclick = () => msg(p.insertEquipment(it));
    }
    if (grid.capacity > 0) {
      const r = el('div', 'progress-row stacked', side);
      el('span', 'label', r).textContent = `Energie ${(grid.energy / 1e6).toFixed(1)} / ${(grid.capacity / 1e6).toFixed(0)} MJ · Solar ${Math.round(grid.solarPerTick * 0.06)} kW (tagsüber)`;
      const bar = el('div', 'progress power', r);
      el('div', 'fill', bar).style.width = `${Math.round((grid.energy / grid.capacity) * 100)}%`;
    }
    if (grid.roboports > 0) {
      const area = Math.round(grid.constructionRadius * 2);
      const info2 = el('div', 'dim armor-info', side);
      info2.textContent = `Roboter: ${out}/${grid.robotLimit} unterwegs, ${p.inventory.count('construction-robot')} im Inventar · Baufläche ${area}×${area}`;
      info2.title = 'Persönliche Bauroboter bauen Geister mit Items aus dem Inventar, reißen Markiertes ab (Strg+X, auch Bäume; '
        + 'Umschalt+Strg+X hebt auf) und reparieren mit Reparatursets aus dem Inventar.';
      const t = el('button', p.personalRobots ? 'small-btn on' : 'small-btn', side);
      t.textContent = p.personalRobots ? 'Persönliche Roboter: an' : 'Persönliche Roboter: aus';
      t.onclick = () => {
        p.personalRobots = !p.personalRobots;
        msg(null);
      };
    }
  }

  /**
   * Inventarplatz angeklickt. Mit geöffnetem Gebäude (wie im Original): Umschalt = Stapel übertragen,
   * Strg = alle dieser Sorte, Rechtsklick = halben Stapel. Sonst: Item in die Hand (Cursor) nehmen.
   */
  private onInvSlot(i: number, mode: 'stack' | 'all' | 'half' | null): void {
    const g = this.game;
    const p = g.world.player;
    if (!p) return;
    const st = p.inventory.slots[i];
    if (!st) {
      g.cursorItem = null;
      return;
    }
    const target = this.openEntityId !== null ? g.world.entities.get(this.openEntityId) : undefined;
    if (mode && target) {
      const item = st.item;
      const amount = mode === 'all' ? p.inventory.count(item) : mode === 'half' ? Math.ceil(st.count / 2) : st.count;
      const n = insertInto(target, item, amount, 'player');
      if (n > 0) {
        if (mode === 'all') p.inventory.remove(item, n);
        else {
          st.count -= n;
          if (st.count === 0) p.inventory.slots[i] = null;
        }
      } else p.note('Passt nicht hinein');
      this.entWin.dataset.key = '';
      this.updateInventory(true);
      this.buildEntity();
      return;
    }
    if (mode === 'half') {
      // Rechtsklick ohne offenes Gebäude: essen, trinken, verbinden
      if (isConsumable(st.item)) {
        const err = p.use(g.world, st.item);
        if (err) p.note(err);
        this.updateInventory(true);
      }
      return;
    }
    g.cursorItem = g.cursorItem === st.item ? null : st.item;
    this.updateInventory(true);
  }

  // ---------------------------------------------------------- Gebäudefenster

  openEntity(id: number): void {
    const g = this.game;
    const e = g.world.entities.get(id);
    if (!e) return;
    const p = g.world.player;
    if (p && !g.creative) {
      if (e.kind === 'loot' ? p.distanceToRect(e.x, e.y, e.w, e.h) > PLAYER.searchDistance + 1 : !p.canReach(e.cx, e.cy)) {
        p.note(e.kind === 'loot' ? 'Zu weit weg' : 'Außer Reichweite');
        return;
      }
    }
    this.openEntityId = id;
    this.entWin.classList.remove('hidden');
    if (p && this.invWin.classList.contains('hidden')) {
      this.invWin.classList.remove('hidden');
      this.buildInventory();
    }
    this.buildEntity();
  }

  private closeEntity(): void {
    this.openEntityId = null;
    this.barMode = false;
    this.entWin.classList.add('hidden');
  }

  private buildEntity(): void {
    const g = this.game;
    const e = this.openEntityId !== null ? g.world.entities.get(this.openEntityId) : undefined;
    if (!e) {
      this.closeEntity();
      return;
    }
    const def = entityDef(e.name);
    const key = this.entityKey(e);
    if (this.entWin.dataset.key === key) return;
    this.entWin.dataset.key = key;
    if (this.entWin.matches(':hover')) this.tip.hide();
    this.entWin.replaceChildren();
    const head = el('div', 'win-head', this.entWin);
    head.textContent = def.name;
    const close = el('button', 'close', head);
    close.textContent = '×';
    close.onclick = () => this.closeEntity();
    const body = el('div', 'win-body', this.entWin);
    if (e.kind !== 'container' && e.kind !== 'tank' && e.kind !== 'pipe' && e.kind !== 'pipe-ground') el('div', `status s${e.status}`, body).textContent = statusText(e);
    const row = (label: string, inv: Inventory, ghosts?: { item: string; amount: number }[]) => {
      // große Inventare (Kisten, Wagen) als Raster mit 10 Spalten wie im Original, sonst eine Zeile
      const big = inv.size > 10;
      let r: HTMLElement;
      if (big) {
        const head = el('div', 'slot-head', body);
        el('span', 'label', head).textContent = label;
        if (e.kind === 'container') this.barControls(e, inv, head);
        r = el('div', 'grid inv chest-grid', body);
      } else {
        r = el('div', 'slot-row', body);
        el('span', 'label', r).textContent = label;
      }
      // Vorschau wie im Original: leere Plätze zeigen blass, was hinein gehört (Zutaten bzw. Ergebnis des Rezepts)
      const present = new Set(inv.slots.filter((st) => st).map((st) => st!.item));
      const open = (ghosts ?? []).filter((g) => !present.has(g.item));
      inv.slots.forEach((st, i) => {
        const s = el('div', `slot${i >= inv.bar ? ' locked' : ''}`, r);
        const need = ghosts?.find((g) => g.item === st?.item);
        if (st) {
          s.appendChild(this.icon(`item.${st.item}`));
          el('span', 'count', s).textContent = String(st.count);
          if (need) s.title = `${ITEMS[st.item]?.name ?? st.item}: ${need.amount} je Durchgang`;
        } else if (open.length) {
          const g = open.shift()!;
          s.classList.add('ghost-slot');
          s.appendChild(this.icon(`item.${g.item}`));
          el('span', 'count', s).textContent = `×${g.amount}`;
          s.title = `${ITEMS[g.item]?.name ?? g.item} – ${g.amount} je Durchgang (fehlt)`;
        }
        s.addEventListener('click', (ev) => {
          if (this.barMode && e.kind === 'container') {
            // Begrenzung setzen: dieser und alle folgenden Plätze gesperrt; Klick auf den ersten gesperrten hebt sie auf
            inv.bar = i === inv.bar ? inv.size : i;
            this.barMode = false;
            this.entWin.dataset.key = '';
            this.buildEntity();
            return;
          }
          this.onEntitySlot(e, inv, i, ev.ctrlKey || ev.metaKey ? 'all' : ev.shiftKey ? 'stack' : null);
        });
        s.addEventListener('contextmenu', (ev) => {
          ev.preventDefault();
          this.onEntitySlot(e, inv, i, 'half');
        });
      });
    };
    const bar = (label: string, frac: number, cls = '') => {
      // lange Beschriftungen über dem Balken statt daneben
      const r = el('div', `progress-row${label.length > 14 ? ' stacked' : ''}`, body);
      el('span', 'label', r).textContent = label;
      const b = el('div', `progress ${cls}`, r);
      el('div', 'fill', b).style.width = `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%`;
    };
    if (e.kind === 'assembler') this.recipePicker(e, body);
    if (e.kind === 'splitter') this.splitterControls(e, body);
    for (const gs of e.guiSlots()) {
      const rec = e.kind === 'assembler' ? e.recipe : null;
      // Sammelrezept Fass: die Fass-Sorte steht erst mit der Flüssigkeit fest → dort keinen Platzhalter zeigen
      const barrel = e.kind === 'assembler' ? e.barrel : null;
      const ghosts = !rec || e.kind !== 'assembler' ? undefined
        : gs.inv === e.input ? (barrel === 'empty' ? undefined : rec.ingredients.filter((x) => !isFluid(x.item)))
        : gs.inv === e.output ? (barrel === 'fill' ? undefined : rec.results.filter((x) => !isFluid(x.item))) : undefined;
      row(gs.label, gs.inv, ghosts);
    }
    if (e.kind === 'inserter' && e.def.filterSlots) this.inserterFilters(e, body);
    if (e.kind === 'assembler') bar('Fortschritt', e.recipe && e.crafting ? e.progress / e.recipeTicks(e.recipe) : 0);
    if (e.kind === 'lab') {
      const t = g.world.research.currentTech;
      bar(t ? t.name : 'Keine Forschung (T)', t ? g.world.research.fraction(t.id) : 0);
    }
    const en = (e as { energy?: { type?: string; buffer?: number; capacity?: number } }).energy;
    if (en?.type === 'electric') bar('Strom', (en.buffer ?? 0) / Math.max(1, en.capacity ?? 1), 'power');
    if (e.kind === 'pole') this.powerInfo(e.id, body);
    if (e.kind === 'train-stop') {
      const r = el('div', 'circ-row', body);
      el('span', 'dim', r).textContent = 'Name';
      const n = el('input', 'stop-name', r);
      n.value = e.stationName;
      n.onchange = () => (e.stationName = n.value.trim() || e.stationName);
    }
    if (e.kind === 'combinator' || e.kind === 'inserter' || e.kind === 'lamp' || e.kind === 'pump' || g.world.circuit.isWired(e.id)) this.circuitPanel(e, body);
    if (e.kind === 'rocket-silo') {
      bar(`Raketenteile ${e.parts} / ${e.def.partsPerRocket}`, e.parts / e.def.partsPerRocket);
      bar('Teil', e.crafting ? e.progress / e.recipeTicks : 0);
      el('div', 'dim', body).textContent = e.launchAt >= 0
        ? 'Rakete gestartet – Fracht unterwegs zum Landeplatz'
        : e.rocketReady ? (e.satellite.isEmpty() ? 'Rakete bereit – Satellit einlegen' : 'Startet, sobald ein Fracht-Landeplatz steht') : 'Rakete im Bau';
    }
    if (e.kind === 'container' && (e.logistic === 'requester' || e.logistic === 'buffer')) this.requestEditor(e, body);
    if (e.kind === 'generator') this.generatorInfo(e, body, bar);
    if (e.kind !== 'generator' && isFluidHolder(e)) this.fluidInfo(e, body);
    if (isHeatNode(e)) {
      const t = temperatureOf(e);
      bar(`Temperatur ${Math.round(t)} °C${e.kind === 'heat-exchanger' ? ' (nutzbar ab 500 °C)' : ''}`, (t - 15) / (e.maxTemperature - 15), 'energy');
    }
    if (e.kind === 'radar') {
      bar(`Fernerkundung ${Math.floor((e.scan / CHART.scanEnergy) * 100)} %`, e.scan / CHART.scanEnergy, 'power');
      el('div', 'dim', body).textContent = `Deckt ${CHART.radarNearRadius * 2 + 1}×${CHART.radarNearRadius * 2 + 1} Abschnitte (je 32×32 Felder) ständig auf `
        + `und erkundet bis ${CHART.radarFarRadius} Abschnitte weit – einen alle ${Math.round(CHART.scanEnergy / e.def.energyUsage)} s bei vollem Strom. `
        + `Aufgedeckt: ${g.world.chart.count} Abschnitte. Mit Draht verbunden: überträgt Signale an alle anderen Radare.`;
    }
    if (e.kind === 'solar') bar(`Leistung ${Math.round(e.potential() * 0.06)} kW`, e.potential() / 1000, 'power');
    if (e.kind === 'accumulator') bar(`Ladung ${(e.stored / 1e6).toFixed(2)} MJ`, e.fraction, 'power');
    if (e.kind === 'drill') bar('Fortschritt', e.progress / Math.max(1, e.ticksPerItem(1)));
    if (e.kind === 'furnace') bar('Fortschritt', e.recipe ? e.progress / e.recipeTicks(e.recipe) : 0);
    const burner = e.burner;
    if (burner) bar('Energie', burner.energy / 4e6, 'energy');
    if (e.guiSlots().length) el('div', 'hint', body).textContent = 'Gebäude: Klick Stapel nehmen · Rechtsklick Hälfte · Strg alle dieser Sorte. Inventar: Umschalt+Klick Stapel hinein · Rechtsklick halber Stapel hinein · Strg+Klick alle dieser Sorte' + (e.kind === 'container' ? ' · ✕: Plätze sperren' : '');
  }

  /** Filter eines schnellen Greifarms/Massengreifarms: Item in der Hand auf einen Platz = Filter setzen, Klick ohne Item = löschen. */
  private inserterFilters(e: Extract<Entity, { kind: 'inserter' }>, body: HTMLElement): void {
    const n = e.def.filterSlots ?? 0;
    const head = el('div', 'slot-head', body);
    el('span', 'label', head).textContent = 'Filter';
    const mode = el('button', 'small-btn', head);
    mode.textContent = e.filterBlacklist ? 'Negativliste' : 'Positivliste';
    mode.title = 'Positivliste: nur diese Items · Negativliste: alles außer diesen';
    mode.onclick = () => {
      e.filterBlacklist = !e.filterBlacklist;
      this.entWin.dataset.key = '';
      this.buildEntity();
    };
    const r = el('div', 'slot-row', body);
    for (let i = 0; i < n; i++) {
      const s = el('div', 'slot filter-slot', r);
      const f = e.filters[i];
      if (f) s.appendChild(this.icon(`item.${f}`));
      s.title = f ? `${ITEMS[f]?.name ?? f} – Klick ohne Item entfernt` : 'Item in der Hand: als Filter setzen';
      s.onclick = () => {
        const ci = this.game.cursorItem;
        while (e.filters.length < n) e.filters.push(null);
        e.filters[i] = ci ?? null;
        this.entWin.dataset.key = '';
        this.buildEntity();
      };
    }
    el('div', 'dim', body).textContent = e.filters.some((x) => x) ? '' : 'Kein Filter: der Greifarm nimmt alles.';
  }

  /** Begrenzungsmodus der Kiste: nächster Klick auf einen Platz setzt die Grenze. */
  private barMode = false;

  private barControls(e: Entity, inv: Inventory, parent: HTMLElement): void {
    const b = el('button', `bar-btn${this.barMode ? ' on' : ''}`, parent);
    b.textContent = '✕';
    b.title = 'Plätze sperren (wie das rote X im Original): danach auf den ersten Platz klicken, der gesperrt sein soll. Greifarme und Roboter füllen nur die freien Plätze.';
    b.onclick = () => {
      this.barMode = !this.barMode;
      this.entWin.dataset.key = '';
      this.buildEntity();
    };
    const info = el('span', 'dim', parent);
    info.textContent = this.barMode ? 'Platz anklicken …' : inv.bar < inv.size ? `${inv.bar} von ${inv.size} Plätzen frei` : '';
    if (inv.bar < inv.size && !this.barMode) {
      const x = el('button', 'small-btn', parent);
      x.textContent = 'Aufheben';
      x.onclick = () => {
        inv.bar = inv.size;
        this.entWin.dataset.key = '';
        this.buildEntity();
      };
    }
    void e;
  }

  /** Dampfmaschine/Turbine: Leistung, Dampfvorrat, Stromnetz. */
  private generatorInfo(e: Extract<Entity, { kind: 'generator' }>, body: HTMLElement, bar: (label: string, frac: number, cls?: string) => void): void {
    const max = e.maxPerTick;
    bar(`Leistung ${fmtPower(e.shownOutput)} von ${fmtPower(max)}`, e.shownOutput / max, 'power');
    const net = e.box.net;
    const fluid = FLUIDS[e.def.fluid]?.name ?? e.def.fluid;
    if (net) bar(`${fluid} in der Leitung ${Math.floor(net.amount / FLUID_UNIT)} / ${Math.floor(net.capacity / FLUID_UNIT)}`, net.amount / Math.max(1, net.capacity));
    else el('div', 'dim', body).textContent = `Kein ${fluid} – Rohr vom Kessel an ein Ende anschließen`;
    const pn = this.game.world.power.netOf.get(e.id);
    const info = el('div', 'dim', body);
    if (!pn) info.textContent = 'Nicht im Stromnetz – Strommast in die Nähe setzen';
    else {
      const use = pn.potential > 0 ? pn.supplied / pn.potential : 0;
      info.textContent = `Stromnetz: Verbrauch ${fmtPower(pn.supplied)} · möglich ${fmtPower(pn.potential)} (${Math.round(use * 100)} % ausgelastet)`;
      if (pn.demand === 0) info.textContent += ' – keine Verbraucher angeschlossen';
    }
  }

  /** Füllstände der Flüssigkeitsanschlüsse (je Leitung einmal). */
  private fluidInfo(e: Entity & FluidHolder, body: HTMLElement): void {
    // je Behälter: eigener Füllstand (Balken in der Farbe der Flüssigkeit), darunter das ganze Rohrnetz
    const boxes = e.fluidBoxes();
    const multi = boxes.length > 1;
    // Maschinen mit Rezept: Anschlüsse nach Lage benennen (Raffinerie wie im Original), unbenutzte ausblenden
    const defs = e.kind === 'assembler' ? e.def.fluidBoxes ?? [] : [];
    const side = (i: number): string => {
      const d = defs[i];
      if (!d) return `Anschluss ${i + 1}`;
      const same = defs.filter((x) => x.type === d.type);
      const k = same.indexOf(d);
      const pos = same.length === 1 ? '' : same.length === 2 ? [' links', ' rechts'][k] : [' links', ' Mitte', ' rechts'][k] ?? ` ${k + 1}`;
      return `${d.type === 'input' ? 'Eingang' : 'Ausgang'}${pos}`;
    };
    if (defs.length && boxes.some((b) => b.filter !== UNUSED)) {
      el('div', 'dim', body).textContent = 'Ausgänge vorn (Pfeilrichtung), Eingänge hinten; links/rechts in Pfeilrichtung gesehen. Unbenutzte Anschlüsse sind nicht verbunden.';
    }
    boxes.forEach((b, i) => {
      if (b.filter === UNUSED) return;
      const s = fluidSummary(b, FLUID_UNIT);
      const name = s.fluid ? FLUIDS[s.fluid]?.name ?? s.fluid : 'leer';
      const r = el('div', 'progress-row stacked fluid-row', body);
      const lab = el('span', 'label', r);
      const what = e.kind === 'pipe' || e.kind === 'pipe-ground' ? 'im Rohr' : e.kind === 'tank' ? 'im Tank' : defs.length ? `– ${side(i)}` : multi ? `Anschluss ${i + 1}` : 'im Gebäude';
      lab.textContent = `${name} ${what}: ${fmtFluid(s.own)} / ${fmtFluid(s.ownCap)}`;
      const pb = el('div', 'progress', r);
      const fill = el('div', 'fill', pb);
      fill.style.width = `${Math.round((s.own / Math.max(1e-9, s.ownCap)) * 100)}%`;
      if (s.fluid && FLUIDS[s.fluid]) fill.style.background = `#${visibleFluidColor(FLUIDS[s.fluid].color).toString(16).padStart(6, '0')}`;
      if (b.net && s.netCap > s.ownCap + 0.5) {
        el('div', 'dim fluid-net', body).textContent = `Rohrnetz gesamt: ${fmtFluid(s.net)} / ${fmtFluid(s.netCap)} (${Math.round((s.net / Math.max(1e-9, s.netCap)) * 100)} %)`;
      }
    });
  }

  private entityKey(e: Entity): string {
    const slots = e.guiSlots().map((g) => JSON.stringify(g.inv.slots) + g.inv.bar).join('|') + (e.kind === 'inserter' ? JSON.stringify(e.filters) + e.filterBlacklist : '');
    const prog = e.kind === 'drill' || e.kind === 'furnace' || e.kind === 'assembler' ? e.progress >> 3 : 0;
    const circ = JSON.stringify([this.game.world.circuit.settings.get(e.id), this.game.world.circuit.conditions.get(e.id), this.game.world.circuit.isWired(e.id)]);
    const extra = circ + (e.kind === 'rocket-silo' ? `${e.parts}${e.rocketReady}${e.launchAt}${Math.floor(e.progress / 20)}` : e.kind === 'container' ? e.requests.map((r) => `${r.item}${r.count}`).join() : e.kind === 'pole' ? `${Math.floor(this.game.world.tick / 60)}` : e.kind === 'accumulator' ? `${e.stored >> 14}` : e.kind === 'solar' ? `${e.potential() >> 4}` : e.kind === 'splitter' ? `${e.state.inputPriority}${e.state.outputPriority}${e.state.filter}` : e.kind === 'assembler' ? e.recipe?.id ?? '-' : e.kind === 'lab' ? `${this.game.world.research.current}${this.game.world.research.fraction(this.game.world.research.current ?? '') * 100 | 0}` : '');
    const en = (e as { energy?: { type?: string; buffer?: number } }).energy;
    let power = en?.type === 'electric' ? (en.buffer ?? 0) >> 6 : 0;
    if (e.kind === 'radar') power = Math.floor(e.scan / 100_000) * 7 + this.game.world.chart.count * 1009;
    if (e.kind === 'generator') power = (e.shownOutput >> 6) * 7919 + (this.game.world.power.netOf.get(e.id)?.supplied ?? 0);
    if (isFluidHolder(e)) for (const b of e.fluidBoxes()) power += ((b.net?.amount ?? b.amount) >> 10) * 31;
    if (isHeatNode(e)) power += Math.round(temperatureOf(e));
    return `${e.kind}${e.status}|${slots}|${prog}|${(e.burner?.energy ?? 0) >> 16}|${extra}|${power}`;
  }

  /**
   * Gebäudeplatz angeklickt. Mit Item in der Hand: einlegen (Rechtsklick: halben Stapel, Strg: alle).
   * Ohne: Klick/Umschalt = Stapel nehmen, Rechtsklick = Hälfte, Strg = alle dieser Sorte aus dem Gebäude.
   */
  private onEntitySlot(e: Entity, inv: Inventory, i: number, mode: 'stack' | 'all' | 'half' | null): void {
    const g = this.game;
    const p = g.world.player;
    const st = inv.slots[i];
    const ci = g.cursorItem;
    if (ci && p && acceptAmount(e, ci, 'player') > 0 && (!st || st.item === ci)) {
      const have = p.inventory.count(ci);
      const stack = Math.min(have, ITEMS[ci]?.stackSize ?? 1);
      const amount = mode === 'all' ? have : mode === 'half' ? Math.ceil(stack / 2) : stack;
      const n = insertInto(e, ci, amount, 'player');
      p.inventory.remove(ci, n);
    } else if (st && p) {
      if (mode === 'all') {
        for (let k = 0; k < inv.slots.length; k++) {
          const o = inv.slots[k];
          if (!o || o.item !== st.item) continue;
          const n = p.inventory.add(o.item, o.count);
          o.count -= n;
          if (o.count === 0) inv.slots[k] = null;
        }
      } else {
        const want = mode === 'half' ? Math.ceil(st.count / 2) : st.count;
        const n = p.inventory.add(st.item, want);
        st.count -= n;
        if (st.count === 0) inv.slots[i] = null;
        if (n < want) p.note('Inventar voll');
      }
    }
    this.entWin.dataset.key = '';
    this.buildEntity();
    this.updateInventory(true);
  }

  // ---------------------------------------------------------- Menü, Hilfe

  closeWindows(): boolean {
    let any = false;
    if (this.mapView.open) {
      this.mapView.toggle(0, 0);
      any = true;
    }
    for (const w of [this.help, this.invWin, this.entWin, this.menu, this.techWin, this.statsWin, this.bookWin, this.powerWin, this.bpWin, this.trainWin]) {
      if (!w.classList.contains('hidden')) {
        w.classList.add('hidden');
        any = true;
      }
    }
    this.openEntityId = null;
    return any;
  }

  // ---------------------------------------------------------- Montage, Forschung

  private recipePicker(e: Extract<Entity, { kind: 'assembler' }>, body: HTMLElement): void {
    const g = this.game;
    el('div', 'sub-head', body).textContent = e.recipe ? 'Rezept (Klick zum Wechseln)' : 'Rezept wählen';
    if (e.recipe) {
      const out = e.barrel ? 'empty-barrel' : e.recipe.results[0].item;
      const hb = el('button', 'small-btn', body);
      hb.textContent = 'Verhältnis im Handbuch (J)';
      hb.title = 'Wie viele Maschinen je Zutat? Öffnet den Rechner für dieses Produkt';
      hb.onclick = () => this.toggleHandbook(out);
    }
    const grid = el('div', 'grid recipes', body);
    // Fässer: statt eines Rezepts je Flüssigkeit nur „Fass befüllen“ und „Fass entleeren“ (Flüssigkeit erkennt die Maschine)
    const barrels = g.world.research.recipeUnlocked('fill-water-barrel') && e.canCraft(RECIPES['fill-water-barrel'])
      ? [{ id: FILL_ANY_BARREL, name: 'Fass befüllen', text: 'Leeres Fass + 50 Einheiten der Flüssigkeit im Rohr → gefülltes Fass (0,2 s). Welche Flüssigkeit, erkennt die Maschine selbst.' },
        { id: EMPTY_ANY_BARREL, name: 'Fass entleeren', text: 'Gefülltes Fass → leeres Fass + 50 Einheiten ins Rohr (0,2 s). Nimmt jedes gefüllte Fass.' }]
      : [];
    const choices: { id: string; icon: string; badge?: string; tip: () => HTMLElement }[] = [];
    for (const r of RECIPE_LIST) {
      if (!e.canCraft(r) || !g.world.research.recipeUnlocked(r.id) || isFluidBarrelRecipe(r.id)) continue;
      choices.push({ id: r.id, icon: `item.${r.results[0].item}`, tip: () => this.tip.recipe(r, e.def.craftingSpeed) });
      if (r.id === 'empty-barrel') {
        for (const b of barrels) {
          choices.push({
            id: b.id, icon: 'item.empty-barrel', badge: b.id === FILL_ANY_BARREL ? '+' : '−',
            tip: () => {
              const box = el('div', 'tt-recipe');
              el('div', 'tt-head', box).textContent = b.name;
              el('div', 'tt-sub', box).textContent = b.text;
              return box;
            },
          });
        }
      }
    }
    for (const c of choices) {
      const s = el('div', `slot recipe${e.recipeKey === c.id ? ' active' : ''}`, grid);
      s.appendChild(this.icon(c.icon));
      if (c.badge) el('span', 'recipe-badge', s).textContent = c.badge;
      this.tip.attach(s, c.tip);
      s.addEventListener('click', () => {
        const back = e.setRecipe(e.recipeKey === c.id ? null : c.id);
        const p = g.world.player;
        for (const st of back) {
          const n = p ? p.inventory.add(st.item, st.count) : 0;
          for (let k = n; k < st.count; k++) g.world.dropGround(e.cx, e.cy, st.item);
        }
        this.entWin.dataset.key = '';
        this.buildEntity();
        this.updateInventory(true);
      });
    }
  }

  private splitterControls(e: Extract<Entity, { kind: 'splitter' }>, body: HTMLElement): void {
    const st = e.state;
    const choice = (label: string, value: number, set: (v: number) => void) => {
      const r = el('div', 'slot-row', body);
      el('span', 'label', r).textContent = label;
      for (const [v, name] of [[0, 'Links'], [-1, 'Keiner'], [1, 'Rechts']] as const) {
        const b = el('button', `small-btn${value === v ? ' active' : ''}`, r);
        b.textContent = name;
        b.onclick = () => {
          set(v);
          this.entWin.dataset.key = '';
          this.buildEntity();
        };
      }
    };
    choice('Eingang', st.inputPriority, (v) => (st.inputPriority = v));
    choice(st.filter >= 0 ? 'Filter-Seite' : 'Ausgang', st.outputPriority, (v) => (st.outputPriority = v));
    const r = el('div', 'slot-row', body);
    el('span', 'label', r).textContent = 'Filter';
    const slot = el('div', 'slot', r);
    if (st.filter >= 0) slot.appendChild(this.icon(`item.${itemId(st.filter)}`));
    slot.title = 'Mit Item im Cursor klicken: Filter setzen · ohne: Filter löschen';
    slot.addEventListener('click', () => {
      const ci = this.game.cursorItem;
      st.filter = ci ? itemIndex(ci) : -1;
      if (st.filter >= 0 && st.outputPriority < 0) st.outputPriority = 0;
      this.entWin.dataset.key = '';
      this.buildEntity();
    });
  }

  // ---------------------------------------------------------- Blaupausen

  rememberClipboard(bp: Blueprint): void {
    this.flash(`Blaupause kopiert (${bp.entities.length} Gebäude) · Klick: Geister ablegen · R drehen · B: Bibliothek`);
    if (!this.bpWin.classList.contains('hidden')) this.buildBlueprints();
  }

  toggleBlueprints(): void {
    const hidden = this.bpWin.classList.toggle('hidden');
    if (!hidden) this.buildBlueprints();
  }

  /** Gespeicherte Blaupausen dieses Browsers (wie die Bibliothek im Original spielstandübergreifend). */
  private loadLibrary(): { name: string; text: string }[] {
    try {
      const raw = localStorage.getItem('letzteschicht.blueprints');
      const list = raw ? (JSON.parse(raw) as { name: string; text: string }[]) : [];
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }
  private saveLibrary(list: { name: string; text: string }[]): void {
    try {
      localStorage.setItem('letzteschicht.blueprints', JSON.stringify(list));
    } catch {
      this.flash('Speichern im Browser nicht möglich');
    }
  }

  private buildBlueprints(): void {
    const g = this.game;
    this.bpWin.replaceChildren();
    const head = el('div', 'win-head', this.bpWin);
    head.textContent = 'Blaupausen';
    const close = el('button', 'close', head);
    close.textContent = '×';
    close.onclick = () => this.toggleBlueprints();
    const body = el('div', 'win-body bp-body', this.bpWin);
    el('div', 'hint', body).textContent = 'Strg+C: Bereich kopieren · Strg+V: einfügen · Klick: Geister ablegen · R drehen · Klick auf Geist: von Hand bauen · Rechtsklick: Geist entfernen';
    const lib = this.loadLibrary();
    const clip = g.clipboard;
    const row = el('div', 'bp-row', body);
    const name = el('input', 'bp-name', row);
    name.placeholder = 'Name';
    const save = el('button', '', row);
    save.textContent = 'Zwischenablage speichern';
    save.disabled = !clip;
    save.onclick = () => {
      if (!clip) return;
      lib.push({ name: name.value.trim() || `Blaupause ${lib.length + 1}`, text: bpEncode(clip) });
      this.saveLibrary(lib);
      this.buildBlueprints();
    };
    el('div', 'bp-sub', body).textContent = 'Vorlagen';
    const pre = el('div', 'bp-list', body);
    for (const p of PRESETS) {
      const it = el('div', 'bp-item', pre);
      it.title = p.hint;
      const icons = el('span', 'bp-icons', it);
      for (const n of [...new Set(p.bp.entities.map((e) => e.name))].slice(0, 4)) icons.appendChild(this.icon(`item.${entityDef(n).item}`, 'icon small'));
      el('span', '', it).textContent = p.name;
      const use = el('button', '', it);
      use.textContent = 'Nehmen';
      use.onclick = () => {
        g.clipboard = p.bp;
        g.setBlueprint(p.bp);
        this.toggleBlueprints();
        this.flash(p.hint);
      };
      const exp = el('button', '', it);
      exp.textContent = 'Text';
      exp.onclick = () => {
        area.value = bpEncode(p.bp);
        area.select();
        void navigator.clipboard?.writeText(area.value).then(() => this.flash('Text in die Zwischenablage kopiert'), () => {});
      };
    }
    el('div', 'bp-sub', body).textContent = 'Eigene';
    const list = el('div', 'bp-list', body);
    if (!lib.length) el('div', 'dim', list).textContent = 'Noch keine gespeicherten Blaupausen.';
    lib.forEach((b, i) => {
      const it = el('div', 'bp-item', list);
      const bp = bpDecode(b.text);
      const icons = el('span', 'bp-icons', it);
      if (bp) {
        const counts = new Map<string, number>();
        for (const e of bp.entities) counts.set(e.name, (counts.get(e.name) ?? 0) + 1);
        for (const [n] of [...counts].sort((a, c) => c[1] - a[1]).slice(0, 4)) icons.appendChild(this.icon(`item.${entityDef(n).item}`, 'icon small'));
      }
      el('span', '', it).textContent = `${b.name}${bp ? ` (${bp.entities.length})` : ' – ungültig'}`;
      const use = el('button', '', it);
      use.textContent = 'Nehmen';
      use.disabled = !bp;
      use.onclick = () => {
        if (!bp) return;
        g.setBlueprint(bp);
        this.toggleBlueprints();
      };
      const exp = el('button', '', it);
      exp.textContent = 'Text';
      exp.onclick = () => {
        area.value = b.text;
        area.select();
        void navigator.clipboard?.writeText(b.text).then(() => this.flash('Text in die Zwischenablage kopiert'), () => {});
      };
      const del = el('button', 'bad', it);
      del.textContent = '×';
      del.onclick = () => {
        lib.splice(i, 1);
        this.saveLibrary(lib);
        this.buildBlueprints();
      };
    });
    const area = el('textarea', 'bp-text', body);
    area.placeholder = 'Blaupausen-Text hier einfügen … (eigene Texte „EW1…“ oder Community-Blaupausen im Original-Format „0eN…“, auch Bücher)';
    const imp = el('button', '', body);
    imp.textContent = 'Text übernehmen';
    imp.onclick = () => {
      if (isForeignText(area.value) || area.value.trim().startsWith('{')) {
        // Community-Blaupause im Original-Format: umrechnen; Bücher landen in der Bibliothek
        const r = importForeign(area.value);
        if (!r || !r.blueprints.length) {
          this.flash(r ? `Keine bekannten Gebäude – ${reportText(r.report, 0)}` : 'Kein gültiger Blaupausen-Text');
          return;
        }
        if (r.blueprints.length === 1) {
          g.clipboard = r.blueprints[0].bp;
          g.setBlueprint(r.blueprints[0].bp);
          this.toggleBlueprints();
        } else {
          for (const b of r.blueprints) lib.push({ name: b.label, text: bpEncode(b.bp) });
          this.saveLibrary(lib);
          this.buildBlueprints();
        }
        this.flash(reportText(r.report, r.blueprints.length));
        return;
      }
      const bp = bpDecode(area.value);
      if (!bp) {
        this.flash('Kein gültiger Blaupausen-Text');
        return;
      }
      g.clipboard = bp;
      g.setBlueprint(bp);
      this.toggleBlueprints();
    };
  }

  // ---------------------------------------------------------- Züge

  openTrain(train: number, vehicle: number): void {
    this.openTrainId = { train, vehicle };
    this.trainWin.classList.remove('hidden');
    this.trainWin.dataset.key = '';
    this.buildTrain();
  }

  private buildTrain(): void {
    const g = this.game;
    const ts = g.world.trains;
    const id = this.openTrainId;
    const t = id ? ts.trains.find((x) => x.id === id.train) : undefined;
    const v = t?.vehicles.find((x) => x.id === id!.vehicle);
    if (!t || !v || this.trainWin.classList.contains('hidden')) {
      this.trainWin.classList.add('hidden');
      this.openTrainId = null;
      return;
    }
    const key = JSON.stringify([t.schedule, t.state, t.current, v.inv.slots, t.vehicles.length, Math.round(t.speed * 100)]);
    if (this.trainWin.dataset.key === key) return;
    if (this.trainWin.contains(document.activeElement) && document.activeElement !== document.body) return; // nicht beim Tippen
    this.trainWin.dataset.key = key;
    this.trainWin.replaceChildren();
    const head = el('div', 'win-head', this.trainWin);
    head.textContent = v.kind === 'locomotive' ? 'Lokomotive' : 'Güterwagen';
    const close = el('button', 'close', head);
    close.textContent = '×';
    close.onclick = () => {
      this.trainWin.classList.add('hidden');
      this.openTrainId = null;
    };
    const body = el('div', 'win-body', this.trainWin);
    const stateText = { moving: 'fährt', waiting: 'wartet am Bahnhof', 'no-path': 'kein Weg zum Ziel', manual: 'angehalten (Handbetrieb)' }[t.state];
    el('div', 'dim', body).textContent = `Zug aus ${t.vehicles.length} Fahrzeug(en) · ${stateText} · ${(t.speed * 216).toFixed(0)} km/h`;
    // Inhalt des Fahrzeugs
    const r = el('div', 'slot-row', body);
    el('span', 'label', r).textContent = v.kind === 'locomotive' ? 'Brennstoff' : 'Ladung';
    v.inv.slots.forEach((st, i) => {
      const sl = el('div', 'slot small', r);
      if (st) {
        sl.appendChild(this.icon(`item.${st.item}`));
        el('span', 'count', sl).textContent = String(st.count);
      }
      sl.onclick = () => {
        const p = g.world.player;
        const ci = g.cursorItem;
        if (ci && (p || g.creative)) {
          const have = g.creative ? 1e9 : p!.inventory.count(ci);
          const n = v.inv.add(ci, Math.min(have, ITEMS[ci]?.stackSize ?? 1));
          if (!g.creative) p!.inventory.remove(ci, n);
        } else if (st) {
          const n = p ? p.inventory.add(st.item, st.count) : st.count;
          v.inv.remove(st.item, n);
          void i;
        }
        this.trainWin.dataset.key = '';
        this.buildTrain();
      };
    });
    // Fahrplan
    el('div', 'stats-title', body).textContent = 'Fahrplan';
    const stations = [...new Set([...g.world.entities.values()].filter((e) => e.kind === 'train-stop').map((e) => (e as { stationName: string }).stationName))].sort();
    t.schedule.forEach((s, i) => {
      const row = el('div', `circ-row${i === t.current ? ' current' : ''}`, body);
      el('span', 'dim', row).textContent = i === t.current ? '▶' : `${i + 1}.`;
      const sel = el('select', '', row);
      for (const n of new Set([...stations, s.station])) Object.assign(el('option', '', sel), { value: n, textContent: n });
      sel.value = s.station;
      sel.onchange = () => (s.station = sel.value);
      const wait = el('select', '', row);
      for (const [k, txt] of [['time', 'Zeit (s)'], ['full', 'Wagen voll'], ['empty', 'Wagen leer'], ['inactivity', 'Inaktivität (s)']] as const) {
        Object.assign(el('option', '', wait), { value: k, textContent: txt });
      }
      wait.value = s.wait;
      wait.onchange = () => {
        s.wait = wait.value as typeof s.wait;
        this.trainWin.dataset.key = '';
        this.buildTrain();
      };
      if (s.wait === 'time' || s.wait === 'inactivity') {
        const n = el('input', 'num', row);
        n.type = 'number';
        n.min = '0';
        n.value = String(s.seconds);
        n.onchange = () => (s.seconds = Math.max(0, Number(n.value) || 0));
      }
      const x = el('button', 'bad', row);
      x.textContent = '×';
      x.onclick = () => {
        t.schedule.splice(i, 1);
        t.current = 0;
        t.path = null;
        this.trainWin.dataset.key = '';
        this.buildTrain();
      };
    });
    const ctl = el('div', 'circ-row', body);
    const add = el('button', '', ctl);
    add.textContent = '+ Bahnhof';
    add.disabled = !stations.length;
    add.onclick = () => {
      t.schedule.push({ station: stations[0], wait: 'time', seconds: 5 });
      this.trainWin.dataset.key = '';
      this.buildTrain();
    };
    const auto = el('button', '', ctl);
    auto.textContent = t.state === 'manual' ? 'Automatik starten' : 'Anhalten';
    auto.onclick = () => {
      t.state = t.state === 'manual' ? 'moving' : 'manual';
      t.path = null;
      this.trainWin.dataset.key = '';
      this.buildTrain();
    };
    if (!stations.length) el('div', 'dim', body).textContent = 'Noch keine Bahnhöfe – Bahnhof rechts neben das Gleis setzen (in Fahrtrichtung).';
  }

  // ---------------------------------------------------------- Strom

  togglePower(): void {
    const hidden = this.powerWin.classList.toggle('hidden');
    if (!hidden) this.buildPower();
  }

  /** Kleine Anzeige oben links: Erzeugung / Nennleistung, rot bei Unterversorgung. */
  private updatePowerBadge(): void {
    const w = this.game.world;
    const rep = powerReport(w);
    if (!rep.nets.length && !rep.engines) {
      this.powerBadge.classList.add('hidden');
      return;
    }
    let demand = 0;
    let supplied = 0;
    let installed = 0;
    for (const n of rep.nets) {
      demand += n.demand;
      supplied += n.supplied;
      installed += n.installed;
    }
    const sat = demand > 0 ? supplied / demand : 1;
    const load = installed > 0 ? supplied / installed : 0;
    const warn = rep.boilersNoFuel + rep.boilersNoWater + rep.unconnected + rep.generatorsAlone > 0;
    this.powerBadge.classList.remove('hidden');
    this.powerBadge.classList.toggle('bad', sat < 0.98);
    this.powerBadge.classList.toggle('high', sat >= 0.98 && load > 0.9);
    this.powerBadge.replaceChildren();
    el('span', 'bolt', this.powerBadge).textContent = '⚡';
    el('span', '', this.powerBadge).textContent = `${fmtPower(supplied)} / ${fmtPower(installed)}`;
    const bar = el('div', 'progress power', this.powerBadge);
    el('div', 'fill', bar).style.width = `${Math.round(Math.min(1, load) * 100)}%`;
    el('span', 'dim', this.powerBadge).textContent = sat < 0.98 ? `nur ${Math.round(sat * 100)} % gedeckt` : demand > 0 ? 'gedeckt' : 'kein Bedarf';
    if (warn) el('span', 'warn', this.powerBadge).textContent = '!';
  }

  /** Strom-Übersicht (O): je Netz Bedarf, Erzeugung, Nennleistung, Erzeuger/Verbraucher, Hinweise, Verlauf. */
  private buildPower(): void {
    const w = this.game.world;
    const rep = powerReport(w);
    const scroll = this.powerWin.querySelector<HTMLElement>('.win-body')?.scrollTop ?? 0;
    this.powerWin.replaceChildren();
    const head = el('div', 'win-head', this.powerWin);
    head.textContent = 'Strom';
    const close = el('button', 'close', head);
    close.textContent = '×';
    close.onclick = () => this.togglePower();
    const body = el('div', 'win-body', this.powerWin);
    if (!rep.nets.length) {
      el('div', 'dim', body).textContent = 'Noch kein Stromnetz. Dampfmaschine bauen und einen Strommast so setzen, dass sein blauer Bereich sie berührt (Vorlage: B → Vorlagen → Dampfkraft).';
    }
    let net = rep.nets.find((n) => n.key === this.powerNetKey) ?? rep.nets[0];
    if (rep.nets.length > 1) {
      const row = el('div', 'choice-row', body);
      rep.nets.forEach((n, i) => {
        const b = el('button', `choice${n === net ? ' on' : ''}`, row);
        b.textContent = `Netz ${i + 1}`;
        b.title = `${n.poles} Masten · ${fmtPower(n.supplied)} von ${fmtPower(n.installed)}`;
        b.onclick = () => { this.powerNetKey = n.key; this.buildPower(); };
      });
    }
    // Hinweise (gelten für alle Netze)
    const hints: string[] = [];
    if (net) {
      if (net.demand > 0 && net.supplied < net.demand * 0.98) hints.push(`Zu wenig Strom: Bedarf ${fmtPower(net.demand)}, verfügbar ${fmtPower(net.supplied)}. Mehr Erzeuger bauen (1 Kessel versorgt 2 Dampfmaschinen) oder Kessel prüfen.`);
      if (net.noSteam) hints.push(`${net.noSteam} Dampfmaschine${net.noSteam > 1 ? 'n' : ''} ohne Dampf – Kessel braucht Brennstoff und Wasser.`);
    }
    if (rep.boilersNoFuel) hints.push(`${rep.boilersNoFuel} Kessel ohne Brennstoff (Kohle oder Holz einlegen, am besten per Greifarm vom Band).`);
    if (rep.boilersNoWater) hints.push(`${rep.boilersNoWater} Kessel ohne Wasser (Uferpumpe und Rohr an die Schmalseite).`);
    if (rep.engines > rep.boilers * 2) hints.push(`${rep.engines} Dampfmaschinen, aber nur ${rep.boilers} Kessel – ein Kessel reicht für 2 Dampfmaschinen.`);
    if (rep.generatorsAlone) hints.push(`${rep.generatorsAlone} Erzeuger ohne Strommast in Reichweite.`);
    if (rep.unconnected) hints.push(`${rep.unconnected} Maschine${rep.unconnected > 1 ? 'n' : ''} außerhalb jedes Versorgungsbereichs (kein Strom).`);
    if (hints.length) {
      const box = el('div', 'power-hints', body);
      for (const h of hints) el('div', '', box).textContent = h;
    }
    if (!net) return;
    const sec = el('div', 'power-info', body);
    const line = (label: string, frac: number, text: string, cls = 'power') => {
      const r = el('div', 'progress-row', sec);
      el('span', 'label', r).textContent = label;
      const b = el('div', `progress ${cls}`, r);
      el('div', 'fill', b).style.width = `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%`;
      el('span', 'dim', r).textContent = text;
    };
    const sat = net.demand > 0 ? net.supplied / net.demand : 1;
    line('Bedarf gedeckt', sat, `${Math.round(sat * 100)} %`);
    line('Auslastung', net.installed > 0 ? net.supplied / net.installed : 0, `${fmtPower(net.supplied)} von ${fmtPower(net.installed)}`);
    const nums = el('div', 'power-nums', body);
    const num = (label: string, v: string) => {
      const d = el('div', '', nums);
      el('div', 'dim', d).textContent = label;
      el('b', '', d).textContent = v;
    };
    num('Erzeugung jetzt', fmtPower(net.supplied));
    num('Bedarf jetzt', fmtPower(net.demand));
    num('Nennleistung', fmtPower(net.installed));
    num('Reserve', fmtPower(Math.max(0, net.installed - net.supplied)));
    const lists = el('div', 'power-lists', body);
    const list = (title: string, rows: { name: string; text: string }[]) => {
      const col = el('div', '', lists);
      el('div', 'sub-head', col).textContent = title;
      if (!rows.length) el('div', 'dim', col).textContent = '–';
      for (const r of rows) {
        const it = el('div', 'power-row', col);
        it.appendChild(this.icon(`item.${entityDef(r.name).item}`, 'icon small'));
        el('span', '', it).textContent = r.text;
      }
    };
    list('Erzeuger', net.generators.map((g) => ({ name: g.name, text: `${g.count}× ${entityDef(g.name).name} · max ${fmtPower(g.installed)}` })));
    list('Verbraucher', net.consumers.map((c) => ({ name: c.name, text: `${c.count}× ${entityDef(c.name).name}` })));
    el('div', 'sub-head', body).textContent = 'Verlauf';
    const st = el('div', 'power-stats', body);
    const stats = w.power.nets.find((n) => n.key === net.key)?.stats;
    if (stats) this.gridView.render(st, stats);
    body.scrollTop = scroll;
  }

  private book: HandbookView | null = null;

  /** Handbuch (J): Rezepte, Verwendung, Verhältnis-Rechner, Faustregeln. Mit `item` direkt auf dieser Seite. */
  toggleHandbook(item?: string): void {
    const show = item !== undefined || this.bookWin.classList.contains('hidden');
    this.bookWin.classList.toggle('hidden', !show);
    if (!show) return;
    if (!this.book) {
      const head = el('div', 'win-head', this.bookWin);
      head.textContent = 'Handbuch';
      const close = el('button', 'close', head);
      close.textContent = '×';
      close.onclick = () => this.toggleHandbook();
      this.book = new HandbookView({ research: () => this.game.world.research, icon: (n, cls) => this.icon(n, cls) });
      this.bookWin.appendChild(this.book.root);
    }
    if (item) this.book.open(item);
    else this.book.refresh();
  }

  toggleStats(): void {
    const hidden = this.statsWin.classList.toggle('hidden');
    if (!hidden) this.buildStats();
  }

  /** Produktionsstatistik (P), Werte je Sekunde aus der Simulation. */
  private buildStats(): void {
    const old = this.statsWin.querySelector<HTMLElement>('.win-body');
    if (old) {
      this.prodView.render(old, this.game.world.stats);
      return;
    }
    this.statsWin.replaceChildren();
    const head = el('div', 'win-head', this.statsWin);
    head.textContent = 'Produktion';
    const close = el('button', 'close', head);
    close.textContent = '×';
    close.onclick = () => this.toggleStats();
    const body = el('div', 'win-body', this.statsWin);
    this.prodView.render(body, this.game.world.stats);
  }

  /** Auswahlfeld für ein Signal (virtuell, Items, Flüssigkeiten). */
  private signalSelect(parent: HTMLElement, value: string | null, onChange: (v: string | null) => void, allowNone = true): HTMLSelectElement {
    const sel = el('select', 'sig-select', parent);
    if (allowNone) Object.assign(el('option', '', sel), { value: '', textContent: '–' });
    const grp = (label: string, list: [string, string][]) => {
      const og = el('optgroup', '', sel);
      og.label = label;
      for (const [v, t] of list) Object.assign(el('option', '', og), { value: v, textContent: t });
    };
    grp('Signale', VIRTUAL_SIGNALS.map((v) => [v, `Signal ${signalLabel(v)}`]));
    grp('Items', Object.values(ITEMS).sort((a, b) => a.order - b.order).map((i) => [i.id, i.name]));
    grp('Flüssigkeiten', Object.values(FLUIDS).map((f) => [f.id, f.name]));
    sel.value = value ?? '';
    sel.onchange = () => onChange(sel.value || null);
    return sel;
  }

  /** Schaltungsnetz im Gebäudefenster: Kombinator-Einstellungen, Schaltbedingung, aktuelle Signale. */
  private circuitPanel(e: Entity, body: HTMLElement): void {
    const c = this.game.world.circuit;
    const box = el('div', 'circuit', body);
    el('div', 'stats-title', box).textContent = 'Schaltungsnetz';
    const rebuild = () => {
      this.entWin.dataset.key = '';
      this.buildEntity();
    };
    const opSelect = (parent: HTMLElement, ops: readonly string[], value: string, onChange: (v: string) => void) => {
      const sel = el('select', 'op-select', parent);
      for (const o of ops) Object.assign(el('option', '', sel), { value: o, textContent: o });
      sel.value = value;
      sel.onchange = () => onChange(sel.value);
    };
    const num = (parent: HTMLElement, value: number, onChange: (v: number) => void) => {
      const n = el('input', 'num', parent);
      n.type = 'number';
      n.value = String(value);
      n.onchange = () => onChange(Math.trunc(Number(n.value) || 0));
    };
    /** Zweiter Operand: Signal oder Zahl. */
    const operand = (parent: HTMLElement, second: string | null, constant: number, set: (s: string | null, k: number) => void) => {
      this.signalSelect(parent, second, (v) => {
        set(v, constant);
        rebuild();
      });
      if (!second) num(parent, constant, (v) => set(null, v));
    };
    if (e.kind === 'combinator') {
      const st = c.settings.get(e.id) ?? {};
      c.settings.set(e.id, st);
      if (e.def.mode === 'constant') {
        const list = (st.signals ??= []);
        list.forEach((x, i) => {
          const r = el('div', 'circ-row', box);
          this.signalSelect(r, x.signal, (v) => {
            if (v) x.signal = v;
            else list.splice(i, 1);
            rebuild();
          });
          num(r, x.count, (v) => (x.count = v));
        });
        const add = el('button', '', box);
        add.textContent = '+ Signal';
        add.onclick = () => {
          list.push({ signal: 'signal-A', count: 1 });
          rebuild();
        };
      } else if (e.def.mode === 'arithmetic') {
        const a = (st.arith ??= { first: null, op: '*', constant: 1, second: null, output: null });
        const r = el('div', 'circ-row', box);
        this.signalSelect(r, a.first, (v) => (a.first = v));
        opSelect(r, ARITHMETIC_OPS, a.op, (v) => (a.op = v as typeof a.op));
        operand(r, a.second, a.constant, (s2, k) => {
          a.second = s2;
          a.constant = k;
        });
        const o = el('div', 'circ-row', box);
        el('span', 'dim', o).textContent = 'Ausgabe';
        this.signalSelect(o, a.output, (v) => (a.output = v));
      } else {
        const d = (st.decide ??= { first: null, op: '>', constant: 0, second: null, output: null, copyCount: false });
        const r = el('div', 'circ-row', box);
        this.signalSelect(r, d.first, (v) => (d.first = v));
        opSelect(r, COMPARATORS, d.op, (v) => (d.op = v as typeof d.op));
        operand(r, d.second, d.constant, (s2, k) => {
          d.second = s2;
          d.constant = k;
        });
        const o = el('div', 'circ-row', box);
        el('span', 'dim', o).textContent = 'Ausgabe';
        this.signalSelect(o, d.output, (v) => (d.output = v));
        const lab = el('label', 'dim', o);
        const cb = el('input', '', lab);
        cb.type = 'checkbox';
        cb.checked = d.copyCount;
        cb.onchange = () => (d.copyCount = cb.checked);
        lab.append(' Eingangswert statt 1');
      }
    } else if (e.kind === 'inserter' || e.kind === 'lamp' || e.kind === 'pump' || e.kind === 'belt') {
      const cur: Condition | undefined = c.conditions.get(e.id);
      const r = el('div', 'circ-row', box);
      el('span', 'dim', r).textContent = 'Ein, wenn';
      const cond = cur ?? { first: null, op: '>', constant: 0, second: null };
      this.signalSelect(r, cond.first, (v) => {
        cond.first = v;
        if (v) c.conditions.set(e.id, cond);
        else c.conditions.delete(e.id);
      });
      opSelect(r, COMPARATORS, cond.op, (v) => (cond.op = v as Condition['op']));
      operand(r, cond.second, cond.constant, (s2, k) => {
        cond.second = s2;
        cond.constant = k;
      });
      if (!c.isWired(e.id)) el('div', 'dim', box).textContent = 'Nicht verdrahtet (G: Drahtwerkzeug) – die Bedingung wirkt erst mit Draht.';
    }
    el('div', 'circuit-live', box);
    this.updateCircuitLive();
  }

  /** Aktuelle Signale am geöffneten Gebäude (ohne das Fenster neu aufzubauen). */
  private updateCircuitLive(): void {
    const live = this.entWin.querySelector<HTMLElement>('.circuit-live');
    if (!live || this.openEntityId === null) return;
    const c = this.game.world.circuit;
    const id = this.openEntityId;
    const parts: string[] = [];
    for (const side of [0, 1] as const) {
      for (const color of ['red', 'green'] as const) {
        const net = c.network(id, side, color);
        if (!net) continue;
        const sig = [...net].map(([k, v]) => `${ITEMS[k]?.name ?? FLUIDS[k]?.name ?? signalLabel(k)} ${v}`).join(', ') || 'keine Signale';
        parts.push(`${color === 'red' ? 'Rot' : 'Grün'}${side ? ' (Ausgang)' : ''}: ${sig}`);
      }
    }
    live.textContent = parts.join(' · ');
  }

  /** Anforderungen einer Anforderungs-/Pufferkiste: Item und Sollmenge (Logistikroboter liefern). */
  private requestEditor(e: Extract<Entity, { kind: 'container' }>, body: HTMLElement): void {
    const box = el('div', 'requests', body);
    el('div', 'stats-title', box).textContent = 'Anforderungen';
    e.requests.forEach((r, i) => {
      const row = el('div', 'req-row', box);
      row.appendChild(this.icon(`item.${r.item}`, 'icon small'));
      el('span', '', row).textContent = ITEMS[r.item]?.name ?? r.item;
      const n = el('input', 'req-count', row);
      n.type = 'number';
      n.min = '0';
      n.value = String(r.count);
      n.onchange = () => {
        r.count = Math.max(0, Math.floor(Number(n.value) || 0));
      };
      const x = el('button', 'bad', row);
      x.textContent = '×';
      x.onclick = () => {
        e.requests.splice(i, 1);
        this.entWin.dataset.key = '';
        this.buildEntity();
      };
    });
    if (e.requests.length < 10) {
      const add = el('div', 'req-row', box);
      const sel = el('select', 'req-item', add);
      for (const it of Object.values(ITEMS).sort((a, b) => a.order - b.order)) {
        const o = el('option', '', sel);
        o.value = it.id;
        o.textContent = it.name;
      }
      if (this.game.cursorItem) sel.value = this.game.cursorItem;
      const n = el('input', 'req-count', add);
      n.type = 'number';
      n.min = '1';
      n.value = String(ITEMS[sel.value]?.stackSize ?? 50);
      sel.onchange = () => (n.value = String(ITEMS[sel.value]?.stackSize ?? 50));
      const b = el('button', '', add);
      b.textContent = 'Anfordern';
      b.onclick = () => {
        const count = Math.max(1, Math.floor(Number(n.value) || 1));
        const ex = e.requests.find((r) => r.item === sel.value);
        if (ex) ex.count = count;
        else e.requests.push({ item: sel.value, count });
        this.entWin.dataset.key = '';
        this.buildEntity();
      };
    }
  }

  /** Stromnetz eines Masts: Zufriedenheit, Erzeugung/Verbrauch je Gebäudeart, Akkuladung, Verlauf. */
  private powerInfo(poleId: number, body: HTMLElement): void {
    const w = this.game.world;
    const net = w.power.netOf.get(poleId);
    if (!net) return;
    const sec = el('div', 'power-info', body);
    const sat = net.demand > 0 ? net.supplied / net.demand : 1;
    const line = (label: string, frac: number, text: string, cls = 'power') => {
      const r = el('div', 'progress-row', sec);
      el('span', 'label', r).textContent = label;
      const b = el('div', `progress ${cls}`, r);
      el('div', 'fill', b).style.width = `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%`;
      el('span', 'dim', r).textContent = text;
    };
    line('Versorgung', sat, `${Math.round(sat * 100)} %`);
    line('Leistung', net.potential > 0 ? net.supplied / net.potential : 0, `${fmtPower(net.supplied)} / ${fmtPower(net.potential)}`);
    if (net.storages.length) {
      let stored = 0;
      let cap = 0;
      for (const id of w.entities.keys()) {
        const e = w.entities.get(id)!;
        if (e.kind === 'accumulator' && w.power.netOf.get(id) === net) {
          stored += e.stored;
          cap += e.def.buffer;
        }
      }
      line('Akkumulatoren', cap ? stored / cap : 0, `${(stored / 1e6).toFixed(1)} / ${(cap / 1e6).toFixed(0)} MJ`, 'energy');
    }
    const st = el('div', 'power-stats', body);
    this.powerView.render(st, net.stats);
  }

  /** Symbol einer Technologie: erstes freigeschaltetes Item bzw. Auslöser-Item. */
  private techIcon(id: string): HTMLImageElement {
    const t = TECH_BY_ID[id];
    const item = t.unlocks.find((u) => this.sprites.has(`item.${u}`) || this.sprites.has(`item.${RECIPE_LIST.find((x) => x.id === u)?.results[0].item}`));
    const rec = item ? RECIPE_LIST.find((x) => x.id === item) : undefined;
    const ic = this.icon(`item.${rec ? rec.results[0].item : item ?? t.packs[0] ?? 'iron-plate'}`);
    ic.title = t.name;
    return ic;
  }

  toggleResearch(): void {
    const hidden = this.techWin.classList.toggle('hidden');
    if (!hidden) this.buildResearch();
  }

  private researchKey = '';
  private rocketsSeen = -1;
  private updateResearch(): void {
    const r = this.game.world.research;
    if (r.finished.length) {
      for (const id of r.finished) this.game.world.player?.note(`Forschung abgeschlossen: ${TECH_BY_ID[id]?.name ?? id}`);
      this.game.sound.play('research', 0.8);
      r.finished.length = 0;
      this.refreshAll();
    }
    if (this.rocketsSeen < 0) this.rocketsSeen = this.game.world.rocketsLaunched;
    if (this.game.world.rocketsLaunched > this.rocketsSeen) {
      if (this.rocketsSeen === 0 && this.game.world.rocketsLaunched === 1) {
        this.flash('Rakete gestartet! Sieg – die Fabrik darf weiterwachsen.');
      } else this.flash(`Rakete ${this.game.world.rocketsLaunched} gestartet`);
      this.rocketsSeen = this.game.world.rocketsLaunched;
    }
    const t = r.currentTech;
    const key = (t ? `${t.id}${Math.floor(r.fraction(t.id) * 200)}` : '-') + r.queue.join(',');
    if (key === this.researchKey) return;
    this.researchKey = key;
    this.researchEl.replaceChildren();
    this.researchEl.style.display = t ? 'flex' : 'none';
    if (!t) return;
    el('span', '', this.researchEl).textContent = t.name;
    const b = el('div', 'progress', this.researchEl);
    el('div', 'fill', b).style.width = `${(r.fraction(t.id) * 100).toFixed(1)}%`;
    if (r.queue.length) {
      const q = el('div', 'queued', this.researchEl);
      for (const id of r.queue) q.appendChild(this.techIcon(id));
    }
    if (!this.techWin.classList.contains('hidden')) this.buildResearch();
  }

  private techTree: TechTreeView | null = null;
  private techQueue: HTMLDivElement | null = null;

  private buildResearch(): void {
    const r = this.game.world.research;
    if (!this.techTree || this.techTree.root.parentElement !== this.techWin) {
      this.techWin.replaceChildren();
      const head = el('div', 'win-head', this.techWin);
      head.textContent = 'Forschung';
      const close = el('button', 'close', head);
      close.textContent = '×';
      close.onclick = () => this.toggleResearch();
      this.techQueue = el('div', 'tech-queue', this.techWin);
      this.techTree = new TechTreeView({
        research: () => this.game.world.research,
        icon: (n, cls) => this.icon(n, cls),
        techIcon: (id) => this.techIcon(id),
        recipeTip: (target, id) => {
          const rec = RECIPE_LIST.find((x) => x.id === id);
          if (rec) this.tip.attach(target, () => this.tip.recipe(rec));
        },
        effectText,
        flash: (m) => this.flash(m),
        changed: () => {
          this.researchKey = '';
        },
      });
      this.techWin.appendChild(this.techTree.root);
      el('div', 'hint tt-hint', this.techWin).textContent =
        'Klick: auswählen (Grundlagen blau, darauf aufbauend orange) · Doppelklick oder Umschalt+Klick: in die Warteschlange (mit Voraussetzungen) · '
        + 'Ziehen oder Mausrad: Baum verschieben (Umschalt: senkrecht, Strg: zoomen) · Farben: grün erforscht, gelb erforschbar, orange über die Warteschlange erreichbar, rot gesperrt';
      requestAnimationFrame(() => this.techTree?.focusDefault());
    } else this.techTree.refresh();
    // Warteschlange
    const qe = this.techQueue!;
    qe.replaceChildren();
    el('span', 'dim', qe).textContent = r.current || r.queue.length ? 'Warteschlange:' : 'Keine Forschung läuft – Forschung auswählen und starten.';
    for (const id of [...(r.current ? [r.current] : []), ...r.queue]) {
      const q = el('div', `q${id === r.current ? ' cur' : ''}`, qe);
      q.appendChild(this.techIcon(id));
      el('span', '', q).textContent = r.nameOf(id);
      if (id === r.current) {
        const b = el('div', 'progress', q);
        el('div', 'fill', b).style.width = `${(r.fraction(id) * 100).toFixed(1)}%`;
      }
      q.onclick = (ev) => {
        if ((ev.target as HTMLElement).tagName === 'BUTTON') return;
        const k = TECH_BY_ID[id];
        if (k) this.techTree?.select(k.level !== undefined ? k.id.replace(/-\d+$/, '') : k.id, true);
      };
      const x = el('button', '', q);
      x.textContent = '×';
      x.title = 'Aus der Warteschlange nehmen';
      x.onclick = () => {
        r.dequeue(id);
        this.researchKey = '';
        this.buildResearch();
      };
    }
  }

  toggleHelp(): void {
    this.help.classList.toggle('hidden');
  }

  toggleDebug(): void {
    this.showDebug = !this.showDebug;
  }

  private buildHelp(): void {
    this.help.innerHTML = `
      <div class="win-head">Letzte Schicht – Steuerung<button class="close">×</button></div>
      <div class="win-body help-body">
        <p><b>Ziel:</b> überleben. Plündere die Reste der alten Welt, baue ein befestigtes Lager mit einer kleinen Produktion (Munition, Mauern, Türme) und rufe am Ende mit dem <b>Funkturm</b> die Rettung.</p>
        <p><b>WASD</b> laufen · <b>Mausrad</b> zoomen · <b>Leertaste</b> halten: angreifen (Nahkampf leise, Schusswaffe laut) · <b>X</b> Waffe wechseln · <b>N</b> schlafen/aufstehen</p>
        <p><b>Lärm</b> lockt Zombies an: Schüsse, Bohrer, Dampfmaschinen, Montagemaschinen. Solarstrom ist leise. Jede Nacht ab Tag 2 zieht eine <b>Horde</b> zum Lager – jede 7. Nacht eine große.</p>
        <p><b>Fundorte</b> (Häuser, Wracks, Kisten): <b>Linksklick</b> durchsuchen und Beute nehmen · <b>Rechtsklick halten</b> ausschlachten (Schrott, Holz, Ziegel)</p>
        <p><b>Essen, Trinken, Verbinden:</b> Rechtsklick im Inventar – oder Gegenstand in die Hand nehmen (Schnellleiste) und ins Freie klicken. Leere Flaschen am Wasser füllen (Flasche in die Hand, aufs Wasser klicken) oder in die Regentonne legen.</p>
        <p><b>Bisse</b> können infizieren – nur Antibiotika heilen. <b>Blutungen</b> stoppt ein Verband.</p>
        <p><b>Linksklick</b> bauen (Bänder durch Ziehen) · <b>R</b> drehen · <b>Q</b> Gebäude/Item aufnehmen bzw. Hand leeren · <b>Rechtsklick halten</b> abbauen, Bäume fällen, Gebäude aufnehmen</p>
        <p><b>E</b> Inventar & Handwerk · <b>T</b> Forschung · <b>M</b> Karte · <b>P</b> Produktion · <b>J</b> Handbuch · <b>O</b> Strom-Übersicht · <b>Alt</b> Detailansicht</p>
        <p><b>1–0</b> Schnellleiste – belegen: Gegenstand in die Hand nehmen und auf einen leeren Platz klicken (Rechtsklick: neu belegen bzw. leeren)</p>
        <p><b>Z</b> Item aus der Hand ablegen · <b>F</b> halten: Items vom Boden und von Bändern aufheben · <b>Granate/Lockvogel</b> in der Hand: Klick wirft · <b>Reparaturset</b> in der Hand: Linksklick halten repariert</p>
        <p>Inventar bei offenem Gebäude: <b>Umschalt+Klick</b> Stapel hinein · <b>Rechtsklick</b> halben Stapel hinein · <b>Strg+Klick</b> alle dieser Sorte</p>
        <p><b>Strg+S</b> speichern · <b>Strg+L</b> laden · <b>Esc</b> Menü · <b>F3</b> Debug · <b>H</b> diese Hilfe</p>
      </div>`;
    this.help.querySelector('.close')!.addEventListener('click', () => this.toggleHelp());
  }

  toggleMenu(): void {
    const hidden = this.menu.classList.toggle('hidden');
    if (!hidden) void this.buildMenu();
  }

  private async buildMenu(): Promise<void> {
    this.menu.replaceChildren();
    const head = el('div', 'win-head', this.menu);
    head.textContent = 'Menü';
    const body = el('div', 'win-body menu-body', this.menu);
    const btn = (label: string, fn: () => void) => {
      const b = el('button', 'menu-btn', body);
      b.textContent = label;
      b.onclick = fn;
    };
    btn('Weiterspielen', () => this.toggleMenu());
    btn('Speichern', () => void this.saveGame());
    btn('Speichern unter …', () => {
      const name = prompt('Name des Spielstands', `Spiel ${new Date().toLocaleDateString('de-DE')}`)?.trim();
      if (name) void this.saveGame(name).then(() => this.buildMenu());
    });
    btn('Laden (Schnellspeicher)', () => void this.loadGame());
    btn('Laden (Autosave)', () => void this.loadGame('autosave'));
    btn('Spielstand exportieren (Datei)', () => this.exportGame());
    btn('Spielstand importieren (Datei)', () => this.importGame());
    btn('Handbuch & Verhältnisse (J)', () => { this.toggleMenu(); this.toggleHandbook(); });
    btn('Hilfe', () => { this.toggleMenu(); this.toggleHelp(); });
    {
      const vol = Math.round(this.game.sound.volume * 100);
      btn(`Ton: ${vol === 0 ? 'aus' : `${vol} %`} (Klick: lauter/leiser)`, () => {
        const steps = [0, 0.25, 0.5, 0.75, 1];
        const i = steps.findIndex((v) => Math.abs(v - this.game.sound.volume) < 0.01);
        this.game.sound.setVolume(steps[(i + 1) % steps.length]);
        this.game.sound.play('click', 1, 0, 0);
        void this.buildMenu();
      });
    }
    const hd = graphicsQuality() === 'hd';
    btn(hd ? 'Grafik: Hoch (HD) → Standard' : 'Grafik: Standard → Hoch (HD, braucht viel Grafikspeicher)', () => {
      // vorher sichern, nach dem Neuladen geht es mit „Weiterspielen“ weiter
      void this.saveGame('autosave').finally(() => {
        setGraphicsQuality(hd ? 'sd' : 'hd');
        location.reload();
      });
    });
    const bl = bloomEnabled();
    btn(`Leuchteffekte: ${bl ? 'an' : 'aus'} (Klick zum Umschalten, lädt neu)`, () => {
      void this.saveGame('autosave').finally(() => {
        setBloomEnabled(!bl);
        location.reload();
      });
    });
    {
      // Gegner im laufenden Spiel umstellen (wie die Karteneinstellung beim Start)
      const w = this.game.world;
      el('div', 'sub-head', body).textContent = 'Zombies in diesem Spiel';
      const row = el('div', 'choice-row', body);
      for (const k of Object.keys(ENEMY_SETTINGS) as EnemySetting[]) {
        const b = el('button', `choice${w.settings.enemies === k ? ' on' : ''}`, row);
        b.textContent = ENEMY_SETTINGS[k].label;
        b.title = ENEMY_SETTINGS[k].hint;
        b.onclick = () => {
          if (k === w.settings.enemies) return;
          if (k === 'aus' && w.enemies.units.size && !confirm('Alle Zombies werden entfernt. Fortfahren?')) return;
          w.enemies.applySetting(w, k);
          this.flash(`Zombies: ${ENEMY_SETTINGS[k].label} – ${ENEMY_SETTINGS[k].hint}`);
          void this.buildMenu();
        };
      }
      el('div', 'dim', body).textContent = ENEMY_SETTINGS[w.settings.enemies].hint;
    }
    btn('Neue Welt (alles zurücksetzen) …', () => this.newGameDialog());
    el('div', 'hint', body).textContent = `Karte ${this.game.world.seed} · Autosave alle 5 Minuten und beim Schließen des Tabs`;
    const saves = await listSaves().catch(() => []);
    if (saves.length) {
      el('div', 'sub-head', body).textContent = 'Spielstände';
      for (const s of saves) {
        const r = el('div', 'save-row', body);
        el('span', '', r).textContent = `${s.name} – ${new Date(s.time).toLocaleString('de-DE')}`;
        const l = el('button', 'small-btn', r);
        l.textContent = 'Laden';
        l.onclick = () => void this.loadGame(s.name);
        const d = el('button', 'small-btn', r);
        d.textContent = 'Löschen';
        d.onclick = async () => { await deleteSave(s.name); void this.buildMenu(); };
      }
    }
  }

  /** Neue Runde: Karteneinstellungen wählen (Rohstoffe, Gegner) und mit neuer Karte starten. */
  newGameDialog(): void {
    const cur = this.game.world.settings;
    let res: ResourceSetting = (localStorage.getItem('letzteschicht.res') as ResourceSetting | null) ?? cur.resources;
    let enemies: EnemySetting = (localStorage.getItem('letzteschicht.enemies') as EnemySetting | null) ?? DEFAULT_MAP_SETTINGS.enemies;
    if (!(res in RESOURCE_SETTINGS)) res = DEFAULT_MAP_SETTINGS.resources;
    if (!(enemies in ENEMY_SETTINGS)) enemies = DEFAULT_MAP_SETTINGS.enemies;
    let death: DeathSetting = (localStorage.getItem('letzteschicht.death') as DeathSetting | null) ?? DEFAULT_MAP_SETTINGS.death ?? 'endgueltig';
    if (!(death in DEATH_SETTINGS)) death = 'endgueltig';
    let cliffs: CliffSetting = (localStorage.getItem('letzteschicht.cliffs') as CliffSetting | null) ?? DEFAULT_MAP_SETTINGS.cliffs ?? 'normal';
    if (!(cliffs in CLIFF_SETTINGS)) cliffs = 'normal';
    let freq: FrequencySetting = (localStorage.getItem('letzteschicht.freq') as FrequencySetting | null) ?? DEFAULT_MAP_SETTINGS.frequency ?? 'viel';
    if (!(freq in FREQUENCY_SETTINGS)) freq = 'viel';
    this.menu.replaceChildren();
    const head = el('div', 'win-head', this.menu);
    head.textContent = `Neue Welt: ${WORLD.name}`;
    const body = el('div', 'win-body menu-body', this.menu);
    const group = <K extends string>(title: string, opts: Record<K, { label: string; hint: string }>, get: () => K, set: (k: K) => void) => {
      el('div', 'sub-head', body).textContent = title;
      const row = el('div', 'choice-row', body);
      const btns: HTMLButtonElement[] = [];
      for (const k of Object.keys(opts) as K[]) {
        const b = el('button', 'choice', row);
        b.textContent = opts[k].label;
        b.title = opts[k].hint;
        b.dataset.key = k;
        b.onclick = () => { set(k); for (const x of btns) x.classList.toggle('on', x.dataset.key === get()); hint.textContent = opts[get()].hint; };
        btns.push(b);
      }
      const hint = el('div', 'dim', body);
      hint.textContent = opts[get()].hint;
      for (const x of btns) x.classList.toggle('on', x.dataset.key === get());
    };
    group('Rohstoffe: Häufigkeit', FREQUENCY_SETTINGS, () => freq, (k) => (freq = k));
    group('Rohstoffe: Menge je Feld', RESOURCE_SETTINGS, () => res, (k) => (res = k));
    group('Zombies', ENEMY_SETTINGS, () => enemies, (k) => (enemies = k));
    group('Tod', DEATH_SETTINGS, () => death, (k) => (death = k));
    group('Klippen', CLIFF_SETTINGS, () => cliffs, (k) => (cliffs = k));
    el('div', 'hint', body).textContent = `${WORLD.name} ist immer dieselbe Welt: ${WORLD.towns.map((t) => t.name).join(', ')}. Wer stirbt, kommt mit einer neuen Figur zurück – Lager und geplünderte Häuser bleiben. „Neu beginnen“ setzt alles zurück.`;
    const go = el('button', 'menu-btn primary', body);
    go.textContent = 'Welt neu beginnen';
    go.onclick = () => {
      try {
        localStorage.setItem('letzteschicht.res', res);
        localStorage.setItem('letzteschicht.enemies', enemies);
        localStorage.setItem('letzteschicht.cliffs', cliffs);
        localStorage.setItem('letzteschicht.death', death);
        localStorage.setItem('letzteschicht.freq', freq);
      } catch { /* privat */ }
      location.search = `?new&res=${res}&freq=${freq}&enemies=${enemies}&death=${death}&cliffs=${cliffs}${this.game.world.player?.god ? '&god' : ''}`;
    };
    const back = el('button', 'menu-btn', body);
    back.textContent = 'Zurück';
    back.onclick = () => this.menu.classList.add('hidden');
    this.menu.classList.remove('hidden');
  }

  /** Startdialog: neuesten Spielstand fortsetzen oder neu beginnen. */
  async offerContinue(): Promise<void> {
    const saves = await listSaves().catch(() => []);
    if (!saves.length) return;
    const latest = saves[0];
    this.menu.replaceChildren();
    const head = el('div', 'win-head', this.menu);
    head.textContent = 'Willkommen zurück';
    const body = el('div', 'win-body menu-body', this.menu);
    const b1 = el('button', 'menu-btn primary', body);
    b1.textContent = `Weiterspielen – ${latest.name} (${new Date(latest.time).toLocaleString('de-DE')})`;
    b1.onclick = () => { this.menu.classList.add('hidden'); void this.loadGame(latest.name); };
    const b2 = el('button', 'menu-btn', body);
    b2.textContent = 'Neues Spiel …';
    b2.onclick = () => this.newGameDialog();
    if (saves.length > 1) {
      el('div', 'sub-head', body).textContent = 'Weitere Spielstände';
      for (const s of saves.slice(1)) {
        const r = el('div', 'save-row', body);
        el('span', '', r).textContent = `${s.name} – ${new Date(s.time).toLocaleString('de-DE')}`;
        const l = el('button', 'small-btn', r);
        l.textContent = 'Laden';
        l.onclick = () => { this.menu.classList.add('hidden'); void this.loadGame(s.name); };
      }
    }
    this.menu.classList.remove('hidden');
  }

  async saveGame(name = 'schnellspeicher', quiet = false): Promise<void> {
    try {
      await saveWorld(name, this.game.world, this.game.creative);
      if (!quiet) this.flash('Gespeichert');
    } catch (err) {
      this.flash(`Speichern fehlgeschlagen: ${String(err)}`);
    }
  }

  async loadGame(name = 'schnellspeicher'): Promise<void> {
    try {
      const r = await loadWorld(name);
      if (!r) {
        this.flash('Kein Spielstand vorhanden');
        return;
      }
      this.closeWindows();
      this.game.setWorld(r.world, r.creative);
      this.flash('Geladen');
    } catch (err) {
      this.flash(`Laden fehlgeschlagen: ${String(err)}`);
    }
  }

  /** Spielstand als komprimierte Datei (.letzteschicht, gzip-JSON) herunterladen. */
  exportGame(): void {
    const bytes = pack({ format: 'letzteschicht', creative: this.game.creative, data: serializeWorld(this.game.world) });
    const blob = new Blob([bytes as BlobPart], { type: 'application/gzip' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `letzteschicht-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.letzteschicht`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    this.flash('Exportiert');
  }

  /** Spielstand aus einer Datei laden (.letzteschicht komprimiert oder ältere .json). */
  importGame(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.letzteschicht,application/gzip,application/json,.json';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      try {
        const bytes = new Uint8Array(await f.arrayBuffer());
        const j = isGzip(bytes) ? unpack<{ format: string; creative: boolean; data: SaveData }>(bytes) : JSON.parse(new TextDecoder().decode(bytes));
        if (j.format !== 'letzteschicht') throw new Error('keine Letzte-Schicht-Datei');
        this.closeWindows();
        this.game.setWorld(deserializeWorld(j.data), !!j.creative);
        this.flash('Importiert');
      } catch (err) {
        this.flash(`Import fehlgeschlagen: ${String(err)}`);
      }
    };
    input.click();
  }

  private flash(msg: string): void {
    this.msgEl.textContent = msg;
    this.msgEl.dataset.t = String(this.frame);
  }
}
