import { type Page, expect, test } from '@playwright/test';

async function openScene(page: Page, query: string) {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`/${query}`);
  await page.waitForSelector('body[data-ready="1"]', { timeout: 30_000 });
  await page.waitForTimeout(1500);
  return errors;
}

type W = { letzteschicht: { world: { tick: number; entities: Map<number, { kind: string; result?: { count(i: string): number } }> } } };

test('Startszene lädt ohne Konsolenfehler', async ({ page }) => {
  const errors = await openScene(page, '');
  await page.screenshot({ path: 'test-results/start.png' });
  const tick = await page.evaluate(() => (window as unknown as W).letzteschicht.world.tick);
  expect(tick).toBeGreaterThan(10);
  expect(errors).toEqual([]);
});

test('Demo-Szene zeigt die laufende Produktionskette', async ({ page }) => {
  const errors = await openScene(page, '?scene=demo&warp=2400');
  await page.mouse.move(640, 760);
  await page.keyboard.press('Alt');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/demo.png' });
  const plates = await page.evaluate(() => {
    let n = 0;
    for (const e of (window as unknown as W).letzteschicht.world.entities.values()) if (e.kind === 'furnace') n += e.result!.count('iron-plate');
    return n;
  });
  expect(errors).toEqual([]);
  // Nach 40 s: Platten in den Öfen oder bereits auf dem Ausgabeband
  const belt = await page.evaluate(() => (window as unknown as { letzteschicht: { world: { belts: { itemCount: number } } } }).letzteschicht.world.belts.itemCount);
  expect(plates + belt).toBeGreaterThan(5);
});

test('Demo: Stromteil, Forschungsfenster und Übersichtskarte', async ({ page }) => {
  const errors = await openScene(page, '?scene=demo&warp=1800');
  type R = { letzteschicht: { world: { research: { fraction(id: string): number }; renderer?: unknown } } };
  const frac = await page.evaluate(() => (window as unknown as R).letzteschicht.world.research.fraction('automation'));
  expect(frac).toBeGreaterThan(0.2);
  await page.keyboard.press('t');
  await expect(page.locator('.window.tech')).toBeVisible();
  expect(await page.locator('.tt-card').count()).toBeGreaterThan(10);
  await expect(page.locator('canvas.minimap')).toBeVisible();
  await page.screenshot({ path: 'test-results/research.png' });
  expect(errors).toEqual([]);
});

test('Gottmodus-Link: neue Runde mit Gottmodus, ohne Weiterspielen-Dialog', async ({ page }) => {
  const errors = await openScene(page, '?god');
  await expect(page.locator('.hud-info')).toContainText('GOTTMODUS');
  const god = await page.evaluate(() => (window as unknown as { letzteschicht: { world: { player: { god: boolean } } } }).letzteschicht.world.player.god);
  expect(god).toBe(true);
  expect(errors).toEqual([]);
});
