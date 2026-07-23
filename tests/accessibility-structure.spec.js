const { test, expect } = require('@playwright/test');

const storeKey = 'mobile-family-tree-v5-clean';
const helpSeenKey = `${storeKey}-help-seen-v1`;
const tree = {
  rootIds: ['root'],
  people: [
    {
      id: 'root',
      name: 'Semantik Person',
      firstName: 'Semantik',
      lastName: 'Person',
      born: '1950',
      x: 600,
      y: 500,
      parents: [],
      partners: []
    }
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

test('Landmarks bilden eine verständliche Anwendungsstruktur', async ({ page }) => {
  await openTree(page);
  await expect(page.locator('header')).toHaveAttribute('aria-label', 'Anwendungsleiste');
  await expect(page.getByTestId('app-main')).toHaveAttribute('aria-label', 'Stammbaum-Arbeitsbereich');
  await expect(page.getByRole('navigation', { name: 'Hauptnavigation' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Interaktiver Stammbaum' })).toBeVisible();
  await expect(page.locator('#nodes')).toHaveAttribute('aria-label', 'Sichtbare Personen im Stammbaum');

  const landmarks = await page.evaluate(() => [...document.querySelectorAll(
    'header, nav, main, aside, section[aria-labelledby]'
  )].map(element => ({
    tag: element.tagName,
    label: element.getAttribute('aria-label')
      || document.getElementById(element.getAttribute('aria-labelledby') || '')?.textContent?.trim()
      || ''
  })));
  expect(landmarks.filter(item => ['HEADER', 'NAV', 'MAIN'].includes(item.tag))
    .every(item => item.label.length > 0)).toBe(true);
});

test('Dialoge und dynamische Ergebnisbereiche besitzen belastbare Namen', async ({ page }) => {
  await openTree(page);
  const dialogLabels = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"]')]
    .map(dialog => {
      const labelId = dialog.getAttribute('aria-labelledby');
      return {
        id: dialog.id,
        labelId,
        targetExists: !!labelId && !!document.getElementById(labelId)
      };
    }));
  expect(dialogLabels.length).toBeGreaterThanOrEqual(8);
  expect(dialogLabels.every(dialog => dialog.labelId && dialog.targetExists)).toBe(true);

  const namedRegions = [
    '#relationshipResults',
    '#familyRows',
    '#searchRows',
    '#rootSelectionRows',
    '#checkRows',
    '#birthdayRows',
    '#scrollRows',
    '#personDetails',
    '#listRows'
  ];
  for (const selector of namedRegions) {
    await expect(page.locator(selector)).toHaveAttribute('role', 'region');
    await expect(page.locator(selector)).toHaveAttribute('aria-label', /.+/);
  }

  await page.getByTestId('main-nav-more').click();
  await page.locator('#resetBtn').click();
  await expect(page.getByTestId('decision-dialog')).toHaveAccessibleName(
    'Beispieldaten zurücksetzen?'
  );
  await page.keyboard.press('Escape');
});

test('Überschriften springen innerhalb einer Oberfläche keine Ebene', async ({ page }) => {
  await openTree(page);
  const violations = await page.evaluate(() => {
    const surfaces = [
      document.querySelector('.stage'),
      document.querySelector('#settingsMenu'),
      ...document.querySelectorAll('[role="dialog"], aside[aria-labelledby]')
    ].filter(Boolean);
    return surfaces.flatMap(surface => {
      const levels = [...surface.querySelectorAll('h1,h2,h3,h4,h5,h6')]
        .map(heading => Number(heading.tagName.slice(1)));
      return levels
        .map((level, index) => ({ id: surface.id || surface.className, previous: levels[index - 1], level }))
        .filter((entry, index) => index > 0 && entry.level > entry.previous + 1);
    });
  });
  expect(violations).toEqual([]);
});
