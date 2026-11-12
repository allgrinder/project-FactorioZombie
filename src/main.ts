import { CLIFF_SETTINGS, type CliffSetting, DEATH_SETTINGS, type DeathSetting, DEFAULT_MAP_SETTINGS, ENEMY_SETTINGS, FREQUENCY_SETTINGS, type FrequencySetting, type EnemySetting, type MapSettings, RESOURCE_SETTINGS, type ResourceSetting } from './data/mapgen';
import { WORLD } from './data/world';
import { Game } from './game/game';
import { type SceneName, createScene } from './game/scenes';
import { loadSprites } from './render/assets';
import { GameRenderer } from './render/renderer';

async function main(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const sceneName = (params.get('scene') ?? 'freeplay') as SceneName;
  // Freies Spiel: die feste Welt (src/data/world.ts); ?seed=… erzeugt anderes Gelände (Testhilfe). Szenen behalten 12345
  const seed = params.has('seed') ? Number(params.get('seed')) | 0 : sceneName === 'freeplay' ? WORLD.seed : 12345;
  const debug = params.has('debug');
  const root = document.getElementById('app')!;
  const loading = document.getElementById('loading');
  const sprites = await loadSprites('./assets/', (done, total) => {
    if (loading) loading.textContent = `Letzte Schicht wird geladen … Grafik ${done}/${total}`;
  });
  const renderer = await GameRenderer.create(root, sprites);
  const res = params.get('res');
  const en = params.get('enemies');
  const cl = params.get('cliffs');
  const fq = params.get('freq');
  const de = params.get('death');
  const settings: MapSettings = {
    ...DEFAULT_MAP_SETTINGS,
    ...(res && res in RESOURCE_SETTINGS ? { resources: res as ResourceSetting } : {}),
    ...(en && en in ENEMY_SETTINGS ? { enemies: en as EnemySetting } : {}),
    ...(cl && cl in CLIFF_SETTINGS ? { cliffs: cl as CliffSetting } : {}),
    ...(fq && fq in FREQUENCY_SETTINGS ? { frequency: fq as FrequencySetting } : {}),
    ...(de && de in DEATH_SETTINGS ? { death: de as DeathSetting } : {}),
  };
  const scene = createScene(sceneName, seed, settings);
  // Gottmodus (?god): neue Runde mit schnellem Abbau/Handwerk zum Testen
  const god = params.has('god');
  if (god && scene.world.player) scene.world.player.god = true;
  const warp = Number(params.get('warp') ?? 0);
  if (warp > 0) scene.world.run(Math.min(warp, 60 * 60 * 30));
  const game = new Game(root, renderer, sprites, scene, debug);
  document.getElementById('loading')?.remove();
  game.start();
  // Für Playwright und Debugging
  (window as unknown as { letzteschicht: Game }).letzteschicht = game;
  document.body.dataset.ready = '1';
  // Weiterspielen anbieten, wenn es Spielstände gibt (nur beim normalen Start des freien Spiels)
  if (sceneName === 'freeplay' && !params.has('seed') && !params.has('new') && !god) void game.hud.offerContinue();
}

main().catch((err) => {
  console.error(err);
  const el = document.getElementById('loading');
  if (el) el.textContent = `Fehler beim Start: ${String(err)}`;
});
