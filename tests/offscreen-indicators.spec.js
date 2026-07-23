const { test, expect } = require('@playwright/test');

const storeKey = 'mobile-family-tree-v5-clean';

function directionalTree() {
  return {
    rootIds: ['center'],
    people: [
      { id: 'center', name: 'Zentrum', firstName: 'Zentrum', lastName: '', x: 2000, y: 1500, parents: ['parent-top', 'parent-left'], partners: [] },
      { id: 'parent-top', name: 'Eltern oben', firstName: 'Eltern', lastName: 'oben', x: 2000, y: 180, parents: [], partners: [] },
      { id: 'parent-left', name: 'Eltern links', firstName: 'Eltern', lastName: 'links', x: 180, y: 1500, parents: [], partners: [] },
      { id: 'child-right', name: 'Kind rechts', firstName: 'Kind', lastName: 'rechts', x: 3700, y: 1500, parents: ['center'], partners: [] },
      { id: 'child-bottom', name: 'Kind unten', firstName: 'Kind', lastName: 'unten', x: 2000, y: 2850, parents: ['center'], partners: [] }
    ]
  };
}

async function openTree(page) {
  await page.addInitScript(({ key, tree }) => {
    localStorage.setItem(key, JSON.stringify(tree));
  }, { key: storeKey, tree: directionalTree() });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?ux-debug=1');
  if (await page.getByTestId('welcome-continue').isVisible().catch(() => false)) {
    await page.getByTestId('welcome-continue').click();
  }
}

async function selectCenter(page) {
  await page.getByTestId('person-search-open').click();
  await page.getByTestId('person-search').fill('Zentrum');
  await page.getByTestId('person-search-result-center').click();
  await page.getByTestId('person-dialog-close').click();
  await page.getByTestId('person-search-close').click();
  await page.getByTestId('fit-readable').click();
}

test('ohne Auswahl werden keine Randindikatoren gezeigt', async ({ page }) => {
  await openTree(page);
  await expect(page.locator('.offscreenIndicator')).toHaveCount(0);
});

test('direkte Beziehungen erscheinen an vier Rändern und aktualisieren sich bei Zoom und Sprung', async ({ page }) => {
  await openTree(page);
  await selectCenter(page);

  const indicators = page.locator('.offscreenIndicator');
  await expect(indicators).toHaveCount(4);
  await expect(page.getByTestId('offscreen-top')).toContainText('Eltern oben');
  await expect(page.getByTestId('offscreen-left')).toContainText('Eltern links');
  await expect(page.getByTestId('offscreen-right')).toContainText('Kinder rechts');
  await expect(page.getByTestId('offscreen-bottom')).toContainText('Kinder unten');

  await page.locator('#zin').click();
  await expect(indicators).toHaveCount(4);

  const controls = await page.evaluate(() => {
    const rect = element => {
      const value = element.getBoundingClientRect();
      return { left: value.left, right: value.right, top: value.top, bottom: value.bottom };
    };
    return {
      indicators: [...document.querySelectorAll('.offscreenIndicator')].map(rect),
      toolbar: rect(document.querySelector('.toolbar')),
      zoom: rect(document.querySelector('.zoom'))
    };
  });
  const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  for (const indicator of controls.indicators) {
    expect(overlaps(indicator, controls.toolbar)).toBe(false);
    expect(overlaps(indicator, controls.zoom)).toBe(false);
  }

  const before = await page.evaluate(() => window.__uxDebug.getView());
  await page.getByTestId('offscreen-right').click();
  const after = await page.evaluate(() => ({
    view: window.__uxDebug.getView(),
    selected: window.__uxDebug.getSelectedPersonId()
  }));
  expect(after.selected).toBe('child-right');
  expect(after.view.x).toBeLessThan(before.x);
  await expect(page.getByTestId('person-card-child-right')).toBeVisible();
});
