const { test, expect } = require('@playwright/test');

test.use({
  hasTouch: true,
  viewport: { width: 390, height: 844 }
});

const storeKey = 'mobile-family-tree-v5-clean';
const helpSeenKey = `${storeKey}-help-seen-v1`;
const tree = {
  rootIds: ['root'],
  people: [
    { id: 'root', name: 'Touch Root', firstName: 'Touch', lastName: 'Root', x: 500, y: 350, parents: [], partners: ['partner'] },
    { id: 'partner', name: 'Touch Partner', firstName: 'Touch', lastName: 'Partner', x: 800, y: 350, parents: [], partners: ['root'] },
    { id: 'child', name: 'Touch Kind', firstName: 'Touch', lastName: 'Kind', x: 500, y: 750, parents: ['root', 'partner'], partners: [] }
  ]
};

async function openTree(page) {
  await page.addInitScript(({ key, value, seenKey }) => {
    localStorage.setItem(key, JSON.stringify(value));
    localStorage.setItem(seenKey, JSON.stringify(['pan-zoom', 'search', 'edit']));
  }, { key: storeKey, value: tree, seenKey: helpSeenKey });
  await page.goto('/?ux-debug=1');
  await page.getByTestId('welcome-continue').click();
}

test('globale Aktionen und Einklappen bieten mindestens 44 mal 44 CSS-Pixel', async ({ page }) => {
  await openTree(page);
  const failures = await page.evaluate(() => {
    const selectors = [
      'header button:not(.hidden)',
      '[data-testid="app-main-nav"] button',
      '.zoom button',
      '.collapseBtn'
    ];
    return [...document.querySelectorAll(selectors.join(','))]
      .filter(element => {
        const style = getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden';
      })
      .map(element => {
        const rect = element.getBoundingClientRect();
        return {
          label: element.getAttribute('aria-label') || element.textContent.trim() || element.id,
          width: Math.round(rect.width * 10) / 10,
          height: Math.round(rect.height * 10) / 10
        };
      })
      .filter(target => target.width > 0 && target.height > 0)
      .filter(target => target.width < 44 || target.height < 44);
  });
  expect(failures).toEqual([]);
});

test('ein Touch-Tap öffnet genau einmal und Einklappen schaltet nur einmal', async ({ page }) => {
  await openTree(page);
  const root = page.getByTestId('person-card-root');
  await page.evaluate(() => {
    window.__sheetOpenMutations = 0;
    const sheet = document.getElementById('sheet');
    new MutationObserver(records => {
      window.__sheetOpenMutations += records.filter(record =>
        record.attributeName === 'aria-hidden' && sheet.getAttribute('aria-hidden') === 'false'
      ).length;
    }).observe(sheet, { attributes: true, attributeFilter: ['aria-hidden'] });
  });
  const rootBox = await root.boundingBox();
  await page.touchscreen.tap(rootBox.x + rootBox.width / 2, rootBox.y + rootBox.height / 2);
  await expect(page.getByTestId('person-dialog')).toHaveAttribute('aria-hidden', 'false');
  expect(await page.evaluate(() => window.__sheetOpenMutations)).toBeLessThanOrEqual(2);
  await page.getByTestId('person-dialog-close').click();

  const rootContainer = page.locator('.person').filter({ has: page.getByTestId('person-card-root') });
  const collapse = rootContainer.locator('.collapseBtn');
  const collapseBox = await collapse.boundingBox();
  await page.touchscreen.tap(
    collapseBox.x + collapseBox.width / 2,
    collapseBox.y + collapseBox.height / 2
  );
  await expect(page.getByTestId('person-card-child')).toHaveCount(0);
});

test('leichte Bewegung bleibt Tap, klare Bewegung wird Drag und Sheets erlauben Scrollen', async ({ page }) => {
  await openTree(page);
  await page.getByTestId('app-mode-toggle').click();
  const card = page.getByTestId('person-card-child');
  const container = page.locator('.person').filter({ has: card });
  const before = await page.evaluate(() => window.__uxDebug.getPerson('child'));
  const box = await container.boundingBox();
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

  await container.dispatchEvent('pointerdown', { pointerType: 'touch', clientX: start.x, clientY: start.y, pointerId: 11 });
  await container.dispatchEvent('pointermove', { pointerType: 'touch', clientX: start.x + 4, clientY: start.y + 3, pointerId: 11 });
  await container.dispatchEvent('pointerup', { pointerType: 'touch', clientX: start.x + 4, clientY: start.y + 3, pointerId: 11 });
  await container.dispatchEvent('click');
  await expect(page.getByTestId('person-dialog')).toHaveAttribute('aria-hidden', 'false');
  expect(await page.evaluate(() => window.__uxDebug.getPerson('child'))).toMatchObject({ x: before.x, y: before.y });
  await page.getByTestId('person-dialog-close').click();

  const movedContainer = page.locator('.person').filter({ has: page.getByTestId('person-card-child') });
  const movedBox = await movedContainer.boundingBox();
  const movedStart = { x: movedBox.x + movedBox.width / 2, y: movedBox.y + movedBox.height / 2 };
  await movedContainer.dispatchEvent('pointerdown', { pointerType: 'touch', clientX: movedStart.x, clientY: movedStart.y, pointerId: 12 });
  await movedContainer.dispatchEvent('pointermove', { pointerType: 'touch', clientX: movedStart.x + 12, clientY: movedStart.y, pointerId: 12 });
  await movedContainer.dispatchEvent('pointerup', { pointerType: 'touch', clientX: movedStart.x + 12, clientY: movedStart.y, pointerId: 12 });
  await page.locator('.person').filter({ has: page.getByTestId('person-card-child') }).dispatchEvent('click');
  await expect(page.getByTestId('person-dialog')).toHaveAttribute('aria-hidden', 'true');
  const afterDrag = await page.evaluate(() => window.__uxDebug.getPerson('child'));
  expect(afterDrag.x).toBeGreaterThan(before.x);

  await page.getByTestId('person-card-child').click();
  await expect(page.getByTestId('person-dialog')).toHaveCSS('touch-action', 'pan-y');
  const beforeSheetGesture = await page.evaluate(() => window.__uxDebug.getPerson('child'));
  await page.getByTestId('person-dialog').dispatchEvent('pointerdown', {
    pointerType: 'touch', clientX: 200, clientY: 500, pointerId: 13
  });
  await page.getByTestId('person-dialog').dispatchEvent('pointermove', {
    pointerType: 'touch', clientX: 200, clientY: 430, pointerId: 13
  });
  await page.getByTestId('person-dialog').dispatchEvent('pointerup', {
    pointerType: 'touch', clientX: 200, clientY: 430, pointerId: 13
  });
  expect(await page.evaluate(() => window.__uxDebug.getPerson('child'))).toMatchObject({
    x: beforeSheetGesture.x,
    y: beforeSheetGesture.y
  });
});
