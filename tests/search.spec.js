const { test, expect } = require('@playwright/test');

const storeKey = 'mobile-family-tree-v5-clean';

const searchTree = {
  rootIds: ['dup-berlin'],
  people: [
    {
      id: 'dup-berlin',
      name: 'Anna Schmidt',
      firstName: 'Anna',
      lastName: 'Schmidt',
      born: '1970',
      died: '',
      location: 'Berlin',
      partner: '',
      partners: [],
      parents: [],
      x: 220,
      y: 180
    },
    {
      id: 'dup-hamburg',
      name: 'Anna Schmidt',
      firstName: 'Anna',
      lastName: 'Schmidt',
      born: '1985',
      died: '',
      location: 'Hamburg',
      partner: '',
      partners: [],
      parents: ['dup-berlin'],
      x: 420,
      y: 210
    },
    {
      id: 'year-person',
      name: 'Karl Beispiel',
      firstName: 'Karl',
      lastName: 'Beispiel',
      born: '1960',
      died: '',
      location: 'Lüneburg',
      partner: '',
      partners: [],
      parents: ['dup-berlin'],
      x: 520,
      y: 260
    },
    {
      id: 'loc-person',
      name: 'Lea Beispiel',
      firstName: 'Lea',
      lastName: 'Ortmann',
      born: '1992',
      died: '',
      location: 'Berlin',
      partner: '',
      partners: [],
      parents: ['dup-hamburg'],
      x: 700,
      y: 260
    }
  ]
};

async function clearBrowserStorage(page) {
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
}

function buildManyPersonsTree(total = 72, pageValue = 200) {
  return {
    rootIds: ['person-0'],
    people: Array.from({ length: total }, (_, i) => ({
      id: `person-${i}`,
      name: 'Anna Suchergebnis',
      firstName: 'Anna',
      lastName: 'Suchergebnis',
      born: String(1950 + (i % 50)),
      died: '',
      location: `Ort ${i % 12}`,
      partner: '',
      partners: [],
      parents: [],
      x: pageValue + (i % 12) * 170,
      y: 180 + Math.floor(i / 12) * 130
    }))
  };
}

async function openTree(page, tree) {
  await page.addInitScript(({ key, value }) => {
    localStorage.setItem(key, JSON.stringify(value));
  }, { key: storeKey, value: tree });
  await page.goto('/');
  if (await page.getByTestId('welcome-continue').isVisible()) {
    await page.getByTestId('welcome-continue').click();
  } else {
    await page.getByTestId('welcome-demo').click();
  }
}

test.afterEach(async ({ page }) => {
  await clearBrowserStorage(page);
});

test('Suche liefert Treffer mit Trefferzahl, öffnet Ergebnis und markiert Treffer', async ({ page }) => {
  await openTree(page, searchTree);
  await page.getByTestId('person-search-open').click();

  await page.getByTestId('person-search').fill('Anna');
  await expect(page.getByTestId('person-search-summary')).toContainText('4 Treffer für „Anna“');
  await expect(page.getByTestId('person-search-result-dup-berlin')).toBeVisible();
  await expect(page.getByTestId('person-search-result-dup-hamburg')).toBeVisible();

  const rowHtml = await page.getByTestId('person-search-result-dup-berlin').locator('strong').innerHTML();
  expect(rowHtml).toContain('<mark');
  await page.getByTestId('person-search-result-dup-hamburg').click();
  await expect(page.getByTestId('person-card-dup-hamburg')).toBeVisible();
});

test('Doppelnamen sind durch Zusatzangaben unterscheidbar', async ({ page }) => {
  await openTree(page, searchTree);
  await page.getByTestId('person-search-open').click();
  await page.getByTestId('person-search').fill('Schmidt');

  const first = page.getByTestId('person-search-results');
  await expect(first).toContainText('Berlin');
  await expect(first).toContainText('Hamburg');
});

test('Jahres- und Ortsuche funktionieren', async ({ page }) => {
  await openTree(page, searchTree);
  await page.getByTestId('person-search-open').click();

  await page.getByTestId('person-search').fill('1960');
  await expect(page.getByTestId('person-search-summary')).toContainText('1 Treffer für „1960“');
  await expect(page.getByTestId('person-search-result-year-person')).toBeVisible();

  await page.getByTestId('person-search').fill('Berlin');
  await expect(page.getByTestId('person-search-summary')).toContainText('2 Treffer für „Berlin“');
  await expect(page.getByTestId('person-search-result-dup-berlin')).toBeVisible();
  await expect(page.getByTestId('person-search-result-loc-person')).toBeVisible();
});

test('Kein Treffer zeigt klare Empty-State inkl. Personenliste-Öffnung', async ({ page }) => {
  await openTree(page, searchTree);
  await page.getByTestId('person-search-open').click();
  await page.getByTestId('person-search').fill('Nicht vorhanden');

  await expect(page.getByTestId('person-search-summary')).toContainText('Keine Treffer für „Nicht vorhanden“');
  await expect(page.getByTestId('person-search-empty')).toBeVisible();
  await page.getByTestId('search-open-list').click();
  await expect(page.getByTestId('person-search-sheet')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('.listRows')).toBeVisible();
});

test('Suchbegriff bleibt beim Wiederöffnen der Suche erhalten', async ({ page }) => {
  await openTree(page, searchTree);
  await page.getByTestId('person-search-open').click();
  await page.getByTestId('person-search').fill('Lea');
  await expect(page.getByTestId('person-search-summary')).toContainText('1 Treffer für „Lea“');

  await page.getByTestId('person-search-close').click();
  await expect(page.getByTestId('person-search-sheet')).toHaveAttribute('aria-hidden', 'true');

  await page.getByTestId('person-search-open').click();
  await expect(page.getByTestId('person-search')).toHaveValue('Lea');
  await expect(page.getByTestId('person-search-summary')).toContainText('1 Treffer für „Lea“');
});

test('Suchen-Sprung öffnet Detail und kehrt zur Suche mit Query+Scroll zurück', async ({ page }) => {
  await openTree(page, buildManyPersonsTree(72));
  await page.getByTestId('person-search-open').click();
  await page.getByTestId('person-search').fill('Anna');

  const results = page.getByTestId('person-search-results');
  await expect(page.getByTestId('person-search-summary')).toContainText('72 Treffer für „Anna“');
  await results.evaluate(node => { node.scrollTop = 180; });

  await results.locator('[data-testid^="person-search-result-"]').nth(25).click();
  await expect(page.getByTestId('person-dialog')).toBeVisible();
  await page.getByTestId('person-dialog-close').click();

  await expect(page.getByTestId('person-search-sheet')).toHaveAttribute('aria-hidden', 'false');
  await expect(page.getByTestId('person-search')).toHaveValue('Anna');
  await expect(page.getByTestId('person-search-summary')).toContainText('72 Treffer für „Anna“');
  const restoredScroll = await results.evaluate(node => node.scrollTop);
  expect(restoredScroll).toBeGreaterThan(120);
});
