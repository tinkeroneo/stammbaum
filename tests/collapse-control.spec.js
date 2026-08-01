const { test, expect } = require('@playwright/test');

const storeKey = 'mobile-family-tree-v5-clean';
const helpSeenKey = `${storeKey}-help-seen-v1`;
const tree = {
  rootIds: ['root'],
  people: [
    { id: 'root', name: 'Rosa Wurzel', firstName: 'Rosa', lastName: 'Wurzel', x: 500, y: 350, parents: [], partners: ['partner'] },
    { id: 'partner', name: 'Paul Partner', firstName: 'Paul', lastName: 'Partner', x: 800, y: 350, parents: [], partners: ['root'] },
    { id: 'child-a', name: 'Kind Alpha', firstName: 'Kind', lastName: 'Alpha', x: 420, y: 740, parents: ['root', 'partner'], partners: [] },
    { id: 'child-b', name: 'Kind Beta', firstName: 'Kind', lastName: 'Beta', x: 720, y: 740, parents: ['root', 'partner'], partners: [] }
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

async function openRootViaSearch(page) {
  await page.getByTestId('person-search-open').click();
  await page.getByTestId('person-search').fill('Rosa Wurzel');
  await page.getByTestId('person-search-result-root').click();
}

function overlapArea(a, b) {
  const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return width * height;
}

test('lesbarer Zoom dockt die 44-px-Aktion außerhalb der Karte an', async ({ page }) => {
  await openTree(page);
  await page.evaluate(() => window.__uxDebug.setViewForTest({ s: 0.72 }));
  const root = page.getByTestId('person-card-root');
  const card = page.locator('.couplePerson').filter({ has: root });
  const button = page.getByTestId('branch-toggle-root');

  await expect(button).toBeVisible();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  await expect(button).toHaveAttribute('aria-label', 'Ast von Rosa Wurzel einklappen, 2 direkte Kinder');
  const cardBox = await card.boundingBox();
  const buttonBox = await button.boundingBox();
  const rootBox = await root.boundingBox();
  const partnerBox = await page.getByTestId('person-card-partner').boundingBox();
  expect(buttonBox.width).toBeGreaterThanOrEqual(43.5);
  expect(buttonBox.height).toBeGreaterThanOrEqual(43.5);
  expect(buttonBox.x).toBeGreaterThanOrEqual(cardBox.x + cardBox.width);
  expect(overlapArea(buttonBox, rootBox)).toBe(0);
  expect(overlapArea(buttonBox, partnerBox)).toBe(0);

  const before = await page.evaluate(() => window.__uxDebug.getView());
  await button.click();
  await expect(page.getByTestId('person-card-child-a')).toHaveCount(0);
  await expect(page.getByTestId('branch-toggle-root')).toHaveAttribute('aria-expanded', 'false');
  await expect(root).toBeFocused();
  expect(await page.evaluate(() => window.__uxDebug.getView())).toEqual(before);
});

test('kleiner Zoom blendet die Canvas-Aktion aus und hält sie im Personendetail erreichbar', async ({ page }) => {
  await openTree(page);
  await page.evaluate(() => window.__uxDebug.setViewForTest({ s: 0.54 }));
  await expect(page.getByTestId('branch-toggle-root')).toBeHidden();

  await openRootViaSearch(page);
  const detailButton = page.getByTestId('person-branch-toggle');
  await expect(detailButton).toBeVisible();
  await expect(detailButton).toBeInViewport();
  await expect(detailButton).toHaveText('Ast einklappen');
  await expect(detailButton).toHaveAttribute('aria-expanded', 'true');
  await expect(detailButton).toHaveAttribute('aria-label', 'Ast von Rosa Wurzel einklappen, 2 direkte Kinder');
  const detailBox = await detailButton.boundingBox();
  expect(detailBox.width).toBeGreaterThanOrEqual(44);
  expect(detailBox.height).toBeGreaterThanOrEqual(44);

  const before = await page.evaluate(() => window.__uxDebug.getView());
  await detailButton.click();
  await expect(page.getByTestId('person-card-child-a')).toHaveCount(0);
  await expect(detailButton).toHaveText('Ast ausklappen');
  await expect(detailButton).toHaveAttribute('aria-expanded', 'false');
  await expect(detailButton).toBeFocused();
  expect(await page.evaluate(() => window.__uxDebug.getView())).toEqual(before);

  const stateIndicator = await page.locator('.person.collapsed').evaluate(element => {
    const style = getComputedStyle(element, '::after');
    return { borderStyle: style.borderStyle, pointerEvents: style.pointerEvents };
  });
  expect(stateIndicator).toEqual({ borderStyle: 'dashed', pointerEvents: 'none' });
});

test('Zoomschwelle verhindert riesige Canvas-Aktionen ohne harte Funktionslücke', async ({ page }) => {
  await openTree(page);
  const button = page.getByTestId('branch-toggle-root');

  await page.evaluate(() => window.__uxDebug.setViewForTest({ s: 0.55 }));
  await expect(button).toBeVisible();
  const readableBox = await button.boundingBox();
  expect(readableBox.width).toBeGreaterThanOrEqual(43.5);

  await page.evaluate(() => window.__uxDebug.setViewForTest({ s: 0.549 }));
  await expect(button).toBeHidden();
  await page.evaluate(() => window.__uxDebug.setViewForTest({ s: 0.13 }));
  await expect(button).toBeHidden();
  await page.evaluate(() => window.__uxDebug.setViewForTest({ s: 0.119 }));
  await expect(button).toBeHidden();

  await openRootViaSearch(page);
  await expect(page.getByTestId('person-branch-toggle')).toBeVisible();
  await expect(page.getByTestId('person-branch-toggle')).toBeInViewport();
  const childRelation = page.locator('[data-person-id="child-a"]');
  await expect(childRelation).toHaveCount(1);
  await childRelation.click();
  await expect(page.getByTestId('person-branch-toggle')).toBeHidden();
});
