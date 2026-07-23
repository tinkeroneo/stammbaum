const { test, expect } = require('@playwright/test');

const storeKey = 'mobile-family-tree-v5-clean';
const helpSeenKey = `${storeKey}-help-seen-v1`;

const tree = {
  rootIds: ['root'],
  people: [
    { id: 'root', name: 'Wurzel Person', firstName: 'Wurzel', lastName: 'Person', x: 500, y: 350, parents: [], partners: ['partner'] },
    { id: 'partner', name: 'Partner Person', firstName: 'Partner', lastName: 'Person', x: 800, y: 350, parents: [], partners: ['root'] },
    { id: 'child', name: 'Kind Mitte', firstName: 'Kind', lastName: 'Mitte', x: 500, y: 750, parents: ['root', 'partner'], partners: [] },
    { id: 'right-child', name: 'Kind Rechts', firstName: 'Kind', lastName: 'Rechts', x: 1000, y: 750, parents: ['root', 'partner'], partners: [] },
    { id: 'grandchild', name: 'Enkel Person', firstName: 'Enkel', lastName: 'Person', x: 500, y: 1100, parents: ['child'], partners: [] }
  ]
};

async function openTree(page, value = tree) {
  await page.addInitScript(({ key, data, seenKey }) => {
    localStorage.setItem(key, JSON.stringify(data));
    localStorage.setItem(seenKey, JSON.stringify(['pan-zoom', 'search', 'edit']));
  }, { key: storeKey, data: value, seenKey: helpSeenKey });
  await page.goto('/?ux-debug=1');
  await page.getByTestId('welcome-continue').click();
}

test('roving Tabindex und Pfeile navigieren räumlich, Enter öffnet und Escape kehrt zurück', async ({ page }) => {
  await openTree(page);
  const root = page.getByTestId('person-card-root');
  const partner = page.getByTestId('person-card-partner');
  const child = page.getByTestId('person-card-child');

  await expect(root).toHaveAttribute('role', 'button');
  await expect(root).toHaveAttribute('tabindex', '0');
  await expect(page.locator('#nodes [data-member-id][tabindex="0"]')).toHaveCount(1);

  await root.focus();
  await page.keyboard.press('ArrowRight');
  await expect(partner).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(root).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(child).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(page.getByTestId('person-dialog')).toHaveAttribute('aria-hidden', 'false');
  await expect(page.getByTestId('person-details')).toContainText('Kind Mitte');
  await page.keyboard.press('Escape');
  await expect(child).toBeFocused();
  await expect(page.locator('#nodes [data-member-id][tabindex="0"]')).toHaveCount(1);
});

test('Fokus bleibt beim Einklappen und im Nahbereich auf einer sichtbaren Karte', async ({ page }) => {
  await openTree(page);
  const root = page.getByTestId('person-card-root');
  const rootContainer = page.locator('.person').filter({ has: root });
  const collapse = rootContainer.locator('.collapseBtn');

  await root.focus();
  await collapse.click();
  await expect(page.getByTestId('person-card-child')).toHaveCount(0);
  await expect(root).toBeFocused();
  await expect(root).toHaveAttribute('tabindex', '0');

  await collapse.click();
  await expect(page.getByTestId('person-card-child')).toBeVisible();
  await expect(root).toBeFocused();
  await page.keyboard.press('Enter');
  await page.getByTestId('person-focus-toggle').click();
  await page.getByTestId('person-dialog-close').click();
  await expect(root).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => page.evaluate(() => document.activeElement?.dataset?.memberId || ''))
    .not.toBe('root');
  await expect(page.locator('#nodes [data-member-id][tabindex="0"]')).toHaveCount(1);
});

test('Virtualisierung behält die fokussierte Karte und Pan-Pfeile gelten nur der Canvasfläche', async ({ page }) => {
  const total = 1200;
  const cols = 40;
  const largeTree = {
    rootIds: ['person-0'],
    people: Array.from({ length: total }, (_, index) => ({
      id: `person-${index}`,
      name: `Person ${index}`,
      firstName: 'Person',
      lastName: String(index),
      x: 300 + (index % cols) * 520,
      y: 300 + Math.floor(index / cols) * 420,
      parents: [],
      partners: []
    }))
  };
  await openTree(page, largeTree);
  const root = page.getByTestId('person-card-person-0');
  await root.focus();
  const beforeCardArrow = await page.evaluate(() => window.__uxDebug.getView());
  await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(() => window.__uxDebug.getView())).toEqual(beforeCardArrow);

  await root.focus();
  await page.evaluate(() => window.__uxDebug.setViewForTest({ x: -16000, y: -9000, s: 0.7 }));
  await expect.poll(() => page.evaluate(() => window.__uxDebug.getCanvasKeyboardState().virtualizationActive))
    .toBe(true);
  await expect(root).toBeFocused();
  await expect.poll(() => page.evaluate(() =>
    window.__uxDebug.getCanvasKeyboardState().renderedIds.includes('person-0')
  )).toBe(true);

  const canvas = page.getByTestId('tree-canvas');
  await canvas.focus();
  const beforePan = await page.evaluate(() => window.__uxDebug.getView());
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => page.evaluate(() => window.__uxDebug.getView().x)).not.toBe(beforePan.x);

  await page.getByTestId('app-mode-toggle').focus();
  const beforeButtonArrow = await page.evaluate(() => window.__uxDebug.getView());
  await page.keyboard.press('ArrowLeft');
  expect(await page.evaluate(() => window.__uxDebug.getView())).toEqual(beforeButtonArrow);
});
