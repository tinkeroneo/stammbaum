const { test, expect } = require('@playwright/test');

const storeKey = 'mobile-family-tree-v5-clean';

function directoryTree() {
  const people = [
    { id: 'tree-zeta', name: 'Zeta Jung', firstName: 'Zeta', lastName: 'Jung', born: '2000', pool: false },
    { id: 'tree-alpha', name: 'Alpha Früh', firstName: 'Alpha', lastName: 'Früh', born: '1900', pool: false },
    { id: 'tree-oldest', name: 'Beta Älteste', firstName: 'Beta', lastName: 'Älteste', born: '1800', pool: false }
  ];
  for (let index = 3; index < 367; index += 1) {
    people.push({
      id: `tree-${index}`,
      name: `Person ${String(index).padStart(3, '0')}`,
      firstName: 'Person',
      lastName: String(index).padStart(3, '0'),
      born: String(1950 + (index % 70)),
      pool: false
    });
  }
  for (let index = 0; index < 18; index += 1) {
    people.push({
      id: `pool-${index}`,
      name: `Vorrat ${String(index).padStart(2, '0')}`,
      firstName: 'Vorrat',
      lastName: String(index).padStart(2, '0'),
      born: String(1930 + index),
      pool: true
    });
  }
  return {
    rootIds: ['tree-zeta'],
    people: people.map((person, index) => ({
      ...person,
      x: 200 + (index % 20) * 190,
      y: 180 + Math.floor(index / 20) * 220,
      parents: [],
      partners: []
    }))
  };
}

async function openDirectory(page, viewport = { width: 1280, height: 800 }) {
  await page.addInitScript(({ key, tree }) => {
    localStorage.setItem(key, JSON.stringify(tree));
  }, { key: storeKey, tree: directoryTree() });
  await page.setViewportSize(viewport);
  await page.goto('/?ux-debug=1');
  if (await page.getByTestId('welcome-continue').isVisible().catch(() => false)) {
    await page.getByTestId('welcome-continue').click();
  }
  await page.getByTestId('main-nav-people').click();
}

test('Personenverzeichnis filtert Stammbaum und Vorrat, zählt und sortiert semantisch', async ({ page }) => {
  await openDirectory(page);
  const directory = page.getByTestId('people-directory');

  await expect(directory).toBeVisible();
  await expect(page.getByTestId('directory-summary')).toHaveText('367 Personen · 385 gesamt');
  await expect(page.getByTestId('directory-tree-tab')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('directory-pool-tab')).toContainText('Vorrat (18)');

  const nameSort = directory.getByRole('button', { name: 'Name', exact: true });
  await nameSort.click();
  await expect(nameSort).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.listRow .listName').first()).toContainText('Alpha Früh');

  const birthSort = directory.getByRole('button', { name: 'Geburt', exact: true });
  await birthSort.click();
  await expect(birthSort).toHaveAttribute('aria-pressed', 'true');
  await expect(nameSort).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.listRow .listName').first()).toContainText('Beta Älteste');

  await page.getByTestId('directory-tree-tab').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('directory-pool-tab')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('directory-summary')).toHaveText('18 Personen · 385 gesamt');
  await expect(page.locator('.listPoolBadge').first()).toHaveText('Vorrat');

  await page.getByTestId('directory-search').fill('Vorrat 07');
  await expect(page.getByTestId('directory-summary')).toHaveText('1 Treffer von 18 · 385 gesamt');
  await expect(page.getByTestId('directory-rows').locator('.listRow')).toHaveCount(1);
});

test('Zeilen bieten Öffnen primär und Zusatzaktionen per Tastaturmenü', async ({ page }) => {
  await openDirectory(page, { width: 320, height: 844 });
  await page.getByTestId('directory-pool-tab').click();

  const row = page.getByTestId('directory-row-pool-0');
  await expect(row.locator('.listActions > button')).toHaveCount(1);
  await expect(row.locator('.listActions > button')).toHaveText('Öffnen');

  const summary = row.locator('summary');
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(row.locator('details')).toHaveAttribute('open', '');
  await expect(row.getByRole('button', { name: 'In den Stammbaum eingliedern' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(row.locator('details')).not.toHaveAttribute('open', '');
  await expect(summary).toBeFocused();

  await page.getByTestId('directory-open-pool-0').click();
  await expect(page.getByTestId('person-dialog')).toBeVisible();
  await expect(page.getByTestId('person-details')).toContainText('Vorrat 00');
});

test('Verzeichnis bleibt bei 320 px und 200 Prozent Textzoom ohne horizontales Abschneiden', async ({ page }) => {
  await openDirectory(page, { width: 320, height: 844 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });

  const overflow = await page.getByTestId('people-directory').evaluate(sheet => {
    const rows = [...sheet.querySelectorAll('.listRow')].slice(0, 12);
    return {
      sheet: sheet.scrollWidth > sheet.clientWidth + 1,
      rows: rows.some(row => row.scrollWidth > row.clientWidth + 1),
      names: rows.some(row => {
        const name = row.querySelector('.listName');
        return name && name.scrollWidth > name.clientWidth + 1;
      })
    };
  });
  expect(overflow).toEqual({ sheet: false, rows: false, names: false });
});
