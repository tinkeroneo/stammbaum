const { test, expect } = require('@playwright/test');

const storeKey = 'mobile-family-tree-v5-clean';

function overviewTree() {
  return {
    rootIds: ['overview-top-left'],
    people: [
      { id: 'overview-top-left', name: 'Oben links', x: 300, y: 300, parents: [], partners: [] },
      { id: 'overview-top-right', name: 'Oben rechts', x: 3300, y: 300, parents: [], partners: [] },
      { id: 'overview-bottom-left', name: 'Unten links', x: 300, y: 2500, parents: [], partners: [] },
      { id: 'overview-bottom-right', name: 'Unten rechts', x: 3300, y: 2500, parents: [], partners: [] }
    ]
  };
}

async function openTree(page, viewport) {
  await page.addInitScript(({ key, tree }) => {
    localStorage.setItem(key, JSON.stringify(tree));
  }, { key: storeKey, tree: overviewTree() });
  await page.setViewportSize(viewport);
  await page.goto('/?ux-debug=1');
  if (await page.getByTestId('welcome-continue').isVisible().catch(() => false)) {
    await page.getByTestId('welcome-continue').click();
  }
}

async function viewState(page) {
  return page.evaluate(() => window.__uxDebug?.getView?.());
}

for (const scenario of [
  { name: 'Hochformat', viewport: { width: 390, height: 844 } },
  { name: 'Querformat', viewport: { width: 844, height: 390 } }
]) {
  test(`mobile Überblicksfläche navigiert per Tipp und gibt Fokus zurück – ${scenario.name}`, async ({ page }) => {
    await openTree(page, scenario.viewport);

    await expect(page.locator('#minimap')).toBeHidden();
    const openButton = page.getByTestId('overview-open');
    await expect(openButton).toBeVisible();
    const targetSize = await openButton.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    expect(targetSize.width).toBeGreaterThanOrEqual(44);
    expect(targetSize.height).toBeGreaterThanOrEqual(44);

    await openButton.click();
    await expect(page.getByTestId('overview-sheet')).toHaveAttribute('aria-hidden', 'false');
    await expect(page.getByTestId('overview-map')).toBeVisible();
    await expect(page.locator('#overviewViewport')).toBeVisible();

    const map = page.getByTestId('overview-map');
    const box = await map.boundingBox();
    expect(box).toBeTruthy();
    const edge = 18;

    await map.click({ position: { x: edge, y: edge } });
    const topLeft = await viewState(page);
    await map.click({ position: { x: box.width - edge, y: edge } });
    const topRight = await viewState(page);
    await map.click({ position: { x: edge, y: box.height - edge } });
    const bottomLeft = await viewState(page);
    await map.click({ position: { x: box.width - edge, y: box.height - edge } });
    const bottomRight = await viewState(page);

    expect(topRight.x).toBeLessThan(topLeft.x);
    expect(bottomLeft.y).toBeLessThan(topLeft.y);
    expect(bottomRight.x).toBeLessThan(bottomLeft.x);
    expect(bottomRight.y).toBeLessThan(topRight.y);

    await page.getByTestId('overview-close').click();
    await expect(page.getByTestId('overview-sheet')).toHaveAttribute('aria-hidden', 'true');
    await expect(openButton).toBeFocused();
  });
}
