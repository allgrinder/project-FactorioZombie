import { type Page, expect, test } from '@playwright/test';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

const g = (page: Page) => page.evaluate.bind(page);

/** Meldungen mitschreiben (eine spätere Meldung, z. B. „Ziel erreicht“, kann „Geladen“ sofort überdecken). */
async function watchMessages(page: Page) {
  await g(page)(() => {
    const w = window as Any;
    w.__msgs = [];
    const el = document.querySelector('.messages');
    if (!el) return;
    new MutationObserver(() => w.__msgs.push(el.textContent)).observe(el, { childList: true, characterData: true, subtree: true });
  });
}

async function sawMessage(page: Page, text: string) {
  await page.waitForFunction((t: string) => ((window as Any).__msgs ?? []).some((m: string) => m?.includes(t)) || document.querySelector('.messages')?.textContent?.includes(t), text, { timeout: 8000 });
}

/** Nächster Schrotthaufen einer Art: linke obere Ecke und Größe. */
async function findPile(page: Page, name: string): Promise<[number, number, number, number]> {
  return g(page)((name: string) => {
    const w = (window as Any).letzteschicht.world;
    let best: [number, number, number, number] = [0, 0, 0, 0];
    let bd = 1e9;
    for (const e of w.entities.values()) {
      if (e.kind !== 'pile' || e.name !== name) continue;
      const d = Math.hypot(e.cx, e.cy);
      if (d < bd) { bd = d; best = [e.x, e.y, e.w, e.h]; }
    }
    return best;
  }, name);
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

  // Kohle aus dem Kohlenhaufen am Startfundort (rechte Maustaste halten)
  await page.waitForFunction(() => [...(window as Any).letzteschicht.world.entities.values()].some((e: Any) => e.kind === 'pile'), null, { timeout: 15_000 });
  const coal = await findPile(page, 'coal-pile');
  // zum Haufen (Figur direkt daneben setzen: der Weg dorthin ist nicht Gegenstand des Tests)
  await g(page)(([x, y]: number[]) => {
    const p = (window as Any).letzteschicht.world.player;
    p.px = p.prevPx = Math.round(x * 256);
    p.py = p.prevPy = Math.round(y * 256);
  }, [coal[0] + coal[2] + 0.7, coal[1] + 0.5]);
  // erst messen, wenn die Kamera der Figur gefolgt ist (der erste Bildaufbau kann im Software-Rendering dauern)
  await page.waitForFunction(() => {
    const ls = (window as Any).letzteschicht;
    return Math.hypot(ls.renderer.camera.x - ls.world.player.x, ls.renderer.camera.y - ls.world.player.y) < 0.5;
  }, null, { timeout: 15_000 });
  await page.waitForTimeout(300);
  let [sx, sy] = await toScreen(page, coal[0] + 1, coal[1] + 1);
  await page.mouse.move(sx, sy);
  await page.mouse.down({ button: 'right' });
  await page.waitForFunction(() => (window as Any).letzteschicht.world.player.inventory.count('coal') >= 3, null, { timeout: 30_000 });
  await page.mouse.up({ button: 'right' });
  expect(await g(page)(() => (window as Any).letzteschicht.world.player.inventory.count('coal'))).toBeGreaterThanOrEqual(1);

  // Lagerfeuer (Schnellleiste 3) und Ofen (4) auf freiem Boden südlich der Figur
  const spot = await g(page)(() => {
    const w = (window as Any).letzteschicht.world;
    const p = w.player;
    for (let r = 3; r < 20; r++) for (let dx = -r; dx <= r; dx++) {
      const x = Math.floor(p.x) + dx;
      const y = Math.floor(p.y) + r;
      let ok = true;
      for (let j = 0; j < 2 && ok; j++) for (let i = 0; i < 5 && ok; i++) if (!w.canPlace('stone-furnace', x + i, y + j, 0).ok) ok = false;
      if (ok) return [x, y];
    }
    return [0, 0];
  });
  await walk(page, spot[0] + 2, spot[1] - 2);
  // Kamera folgt der Figur erst im nächsten Bild: kurz warten, bevor Bildschirmkoordinaten gerechnet werden
  await page.waitForTimeout(400);
  await page.keyboard.press('3');
  [sx, sy] = await toScreen(page, spot[0] + 1, spot[1] + 1);
  await page.mouse.move(sx, sy);
  await page.mouse.click(sx, sy);
  await page.keyboard.press('4');
  // bis zu drei Versuche: die Kamera kann zwischen Rechnen und Klicken noch nachziehen
  for (let t = 0; t < 3; t++) {
    await page.waitForTimeout(200);
    [sx, sy] = await toScreen(page, spot[0] + 4, spot[1] + 1);
    await page.mouse.move(sx, sy);
    await page.mouse.click(sx, sy);
    if (await g(page)(() => [...(window as Any).letzteschicht.world.entities.values()].some((e: Any) => e.kind === 'furnace'))) break;
  }
  await page.keyboard.press('q');
  await page.waitForTimeout(200);
  const kinds = await g(page)(() => [...(window as Any).letzteschicht.world.entities.values()].filter((e: Any) => !['loot', 'pile', 'prop', 'bed', 'wire', 'producer'].includes(e.kind) && !e.def.house).map((e: Any) => e.kind).sort());
  expect(kinds).toEqual(['fire', 'furnace']);
  expect(await g(page)(() => !!(window as Any).letzteschicht.world.base)).toBe(true);

  // Ofen öffnen, Kohle per Strg+Klick übertragen
  [sx, sy] = await toScreen(page, spot[0] + 4, spot[1] + 1);
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
  await watchMessages(page);
  await page.keyboard.press('Control+s');
  await sawMessage(page, 'Gespeichert');
  const saved = await g(page)(() => (window as Any).letzteschicht.world.tick);
  await page.waitForTimeout(1000);
  await page.keyboard.press('Control+l');
  await sawMessage(page, 'Geladen');
  const after = await g(page)(() => ({ tick: (window as Any).letzteschicht.world.tick, n: [...(window as Any).letzteschicht.world.entities.values()].filter((e: Any) => !['loot', 'pile', 'prop', 'bed', 'wire', 'producer'].includes(e.kind) && !e.def.house).length }));
  expect(after.n).toBe(2);
  expect(after.tick).toBeLessThan(saved + 45);
  await page.keyboard.press('Alt');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/freeplay.png' });

  // Neu laden: Startdialog bietet den Spielstand an, Weiterspielen stellt Karte und Gebäude wieder her
  const seed = await g(page)(() => (window as Any).letzteschicht.world.seed);
  await page.keyboard.press('Control+s');
  await sawMessage(page, 'Gespeichert');
  await page.reload();
  await page.waitForSelector('body[data-ready="1"]');
  const cont = page.locator('.menu-btn.primary');
  await expect(cont).toBeVisible();
  await watchMessages(page);
  await cont.click();
  await sawMessage(page, 'Geladen');
  const restored = await g(page)(() => ({ seed: (window as Any).letzteschicht.world.seed, n: [...(window as Any).letzteschicht.world.entities.values()].filter((e: Any) => !['loot', 'pile', 'prop', 'bed', 'wire', 'producer'].includes(e.kind) && !e.def.house).length }));
  expect(restored).toEqual({ seed, n: 2 });
  expect(errors).toEqual([]);
});
