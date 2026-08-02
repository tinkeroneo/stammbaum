const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

const storeKey = 'mobile-family-tree-v5-clean';
const helpSeenKey = `${storeKey}-help-seen-v1`;
const screenshotDir = path.resolve(__dirname, '..', 'docs', 'regression-screenshots');
const tree = {
  rootIds: ['father'],
  people: [
    { id: 'father', name: 'Wendelin Mihm', firstName: 'Wendelin', lastName: 'Mihm', x: 380, y: 250, parents: [], partners: [] },
    { id: 'mother', name: 'Bibiana Zentgraf', firstName: 'Bibiana', lastName: 'Zentgraf', x: 720, y: 250, parents: [], partners: [] },
    { id: 'son', name: 'George J. Mihm', firstName: 'George J.', lastName: 'Mihm', x: 470, y: 580, parents: ['father', 'mother'], partners: ['wife'] },
    { id: 'wife', name: 'Margaretha Bodensteiner', firstName: 'Margaretha', lastName: 'Bodensteiner', x: 650, y: 580, parents: [], partners: ['son'] },
    { id: 'child', name: 'John Carl Mihm', firstName: 'John Carl', lastName: 'Mihm', x: 560, y: 900, parents: ['son', 'wife'], partners: [] }
  ]
};

async function openTree(page) {
  await page.addInitScript(({ key, value, seenKey }) => {
    localStorage.setItem(key, JSON.stringify(value));
    localStorage.setItem(seenKey, JSON.stringify(['pan-zoom', 'search', 'edit']));
  }, { key: storeKey, value: tree, seenKey: helpSeenKey });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?ux-debug=1');
  await page.getByTestId('welcome-continue').click();
  await page.evaluate(() => window.__uxDebug.setViewForTest({ x: -550, y: -560, s: 1 }));
}

test('Familienlinien verbinden beide Eltern eindeutig und normale Namenslinien bleiben durchgezogen', async ({ page }) => {
  await openTree(page);

  await expect(page.locator('.familyHub')).toHaveCount(2);
  await expect(page.locator('.familyStem')).toHaveCount(4);
  await expect(page.locator('.stemBridge')).toHaveCount(0);
  const branchPaths = await page.locator('.familyStem, .childLine').evaluateAll(elements =>
    elements.map(element => element.getAttribute('d'))
  );
  expect(branchPaths.every(value => value.includes(' V ') && value.includes(' H '))).toBe(true);

  await expect(page.getByTestId('branch-toggle-father')).toBeVisible();
  await expect(page.getByTestId('branch-toggle-mother')).toHaveCount(0);
  await expect(page.getByTestId('branch-toggle-son')).toBeVisible();
  await expect(page.getByTestId('branch-toggle-wife')).toHaveCount(0);

  fs.mkdirSync(screenshotDir, { recursive: true });
  await page.screenshot({ path: path.join(screenshotDir, 'familienzweige-1440x900.png') });
});
