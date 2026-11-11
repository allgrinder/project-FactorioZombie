import { type Page, expect, test } from '@playwright/test';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

const g = (page: Page) => page.evaluate.bind(page);

async function find(page: Page, res: number): Promise<[number, number]> {
  return g(page)((res: number) => {
    const w = (window as Any).letzteschicht.world;
    let best: [number, number] = [0, 0];
    let bd = 1e9;
    for (let y = -30; y <= 30; y++)
      for (let x = -30; x <= 30; x++) {
        if (w.map.resourceAt(x, y).res !== res) continue;
        if (res === 1 && ![[1, 0], [0, 1], [1, 1]].every(([a, b]) => w.map.resourceAt(x + a, y + b).res === 1)) continue;
        const d = Math.hypot(x, y);
        if (d < bd) { bd = d; best = [x, y]; }
      }
    return best;
  }, res);
}

async function toScreen(page: Page, x: number, y: number): Promise<[number, number]> {
  return g(page)(([x, y]: number[]) => {
    const r = (window as Any).letzteschicht.renderer;
    const c = r.camera;
    return [(x - c.x) * 64 * c.zoom + r.app.screen.width / 2, (y - c.y) * 64 * c.zoom + r.app.screen.height / 2];
  }, [x, y]);
}

async function walk(page: Page, tx: number, ty: number) {
  for (let i = 0; i < 80; i++) {
    const [px, py] = await g(page)(() => [(window as Any).letzteschicht.world.player.x, (window as Any).letzteschicht.world.player.y]);
    const dx = tx + 0.5 - px;
    const dy = ty + 0.5 - py;
    if (Math.hypot(dx, dy) < 1.0) return;
    const keys: string[] = [];
    if (dx > 0.4) keys.push('d');
    if (dx < -0.4) keys.push('a');
    if (dy > 0.4) keys.push('s');
    if (dy < -0.4) keys.push('w');
    for (const k of keys) await page.keyboard.down(k);
    await page.waitForTimeout(100);
    for (const k of keys) await page.keyboard.up(k);
  }
}

test('Freies Spiel: abbauen, bauen, befüllen, herstellen, speichern und laden', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/');
  await page.waitForSelector('body[data-ready="1"]');

  // Kohle von Hand abbauen (rechte Maustaste halten)
  const coal = await find(page, 2);
  await walk(page, coal[0], coal[1] - 1);
  let [sx, sy] = await toScreen(page, coal[0] + 0.5, coal[1] + 0.5);
  await page.mouse.move(sx, sy);
  await page.mouse.down({ button: 'right' });
  await page.waitForFunction(() => (window as Any).letzteschicht.world.player.inventory.count('coal') >= 2, null, { timeout: 30_000 });
  await page.mouse.up({ button: 'right' });
  expect(await g(page)(() => (window as Any).letzteschicht.world.player.inventory.count('coal'))).toBeGreaterThanOrEqual(1);

  // Bohrer (Schnellleiste 3, zweimal drehen = Süden) und Ofen (4) bauen
  const iron = await find(page, 1);
  await walk(page, iron[0] + 3, iron[1] + 1);
  await page.keyboard.press('3');
  await page.keyboard.press('r');
  await page.keyboard.press('r');
  [sx, sy] = await toScreen(page, iron[0] + 1, iron[1] + 1);
  await page.mouse.move(sx, sy);
  await page.mouse.click(sx, sy);
  await page.keyboard.press('4');
  [sx, sy] = await toScreen(page, iron[0] + 1, iron[1] + 3);
  await page.mouse.move(sx, sy);
  await page.mouse.click(sx, sy);
  await page.keyboard.press('q');
  await page.waitForTimeout(200);
  const kinds = await g(page)(() => [...(window as Any).letzteschicht.world.entities.values()].map((e: Any) => e.kind).filter((k: string) => k !== 'loot').sort());
  expect(kinds).toEqual(['drill', 'furnace']);

  // Bohrer öffnen, Kohle per Strg+Klick übertragen
  [sx, sy] = await toScreen(page, iron[0] + 1, iron[1] + 1);
  await page.mouse.click(sx, sy);
  await expect(page.locator('.window.entity')).toBeVisible();
  const slots = page.locator('.inventory .grid.inv .slot[data-item="coal"]');
  await slots.first().click({ modifiers: ['Control'] });
  expect(await g(page)(() => (window as Any).letzteschicht.world.player.inventory.count('coal'))).toBe(0);

  // Zahnrad herstellen (wie im Original: Gebäudefenster schließen, dann ist das Handwerk wieder sichtbar)
  await page.locator('.window.entity .close').click();
  await page.locator('.inventory .craft-tab[title="Zwischenprodukte"]').click();
  await page.locator('.inventory .recipe[data-recipe="iron-gear-wheel"]').click();
  await page.waitForFunction(() => (window as Any).letzteschicht.world.player.inventory.count('iron-gear-wheel') >= 1, null, { timeout: 15_000 });
  expect(await g(page)(() => (window as Any).letzteschicht.world.player.inventory.count('iron-gear-wheel'))).toBe(1);
  await page.keyboard.press('Escape');

  // Speichern, weiterspielen, laden
  await page.keyboard.press('Control+s');
  await expect(page.locator('.messages')).toHaveText('Gespeichert');
  const saved = await g(page)(() => (window as Any).letzteschicht.world.tick);
  await page.waitForTimeout(1000);
  await page.keyboard.press('Control+l');
  await expect(page.locator('.messages')).toHaveText('Geladen');
  const after = await g(page)(() => ({ tick: (window as Any).letzteschicht.world.tick, n: [...(window as Any).letzteschicht.world.entities.values()].filter((e: Any) => e.kind !== 'loot').length }));
  expect(after.n).toBe(2);
  expect(after.tick).toBeLessThan(saved + 45);
  await page.keyboard.press('Alt');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/freeplay.png' });

  // Neu laden: Startdialog bietet den Spielstand an, Weiterspielen stellt Karte und Gebäude wieder her
  const seed = await g(page)(() => (window as Any).letzteschicht.world.seed);
  await page.keyboard.press('Control+s');
  await expect(page.locator('.messages')).toHaveText('Gespeichert');
  await page.reload();
  await page.waitForSelector('body[data-ready="1"]');
  const cont = page.locator('.menu-btn.primary');
  await expect(cont).toBeVisible();
  await cont.click();
  await expect(page.locator('.messages')).toHaveText('Geladen');
  const restored = await g(page)(() => ({ seed: (window as Any).letzteschicht.world.seed, n: [...(window as Any).letzteschicht.world.entities.values()].filter((e: Any) => e.kind !== 'loot').length }));
  expect(restored).toEqual({ seed, n: 2 });
  expect(errors).toEqual([]);
});
