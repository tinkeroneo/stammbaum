const { test, expect } = require('@playwright/test');

const storeKey = 'mobile-family-tree-v5-clean';
const helpSeenKey = `${storeKey}-help-seen-v1`;

const tree = {
  rootIds: ['form-person'],
  people: [
    {
      id: 'form-person',
      name: 'Formular Person',
      firstName: 'Formular',
      lastName: 'Person',
      born: '1950',
      died: '2020',
      x: 900,
      y: 700,
      parents: [],
      partners: []
    }
  ]
};

async function openTree(page, viewport = { width: 390, height: 844 }) {
  await page.addInitScript(({ key, value, seenKey }) => {
    localStorage.setItem(key, JSON.stringify(value));
    localStorage.setItem(seenKey, JSON.stringify(['pan-zoom', 'search', 'edit']));
  }, { key: storeKey, value: tree, seenKey: helpSeenKey });
  await page.setViewportSize(viewport);
  await page.goto('/?ux-debug=1');
  await page.getByTestId('welcome-continue').click();
}

async function openEditForm(page) {
  await page.getByTestId('person-search-open').click();
  await page.getByTestId('person-search').fill('Formular Person');
  await page.getByTestId('person-search-result-form-person').click();
  await page.getByTestId('app-mode-toggle').click();
}

test('Basis- und Lebensdaten sind offen, seltene Bereiche per Tastatur einklappbar', async ({ page }) => {
  await openTree(page);
  await openEditForm(page);

  await expect(page.getByTestId('form-section-basis')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('form-section-life')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByLabel('Vorname')).toBeVisible();
  await expect(page.getByLabel('Geboren')).toBeVisible();
  await expect(page.getByLabel('Gestorben')).toBeVisible();
  await expect(page.getByTestId('person-save')).toBeVisible();

  const relations = page.getByTestId('form-section-relations');
  await expect(relations).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByLabel('Elternteil 1')).toBeHidden();
  await relations.focus();
  await page.keyboard.press('Enter');
  await expect(relations).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByLabel('Elternteil 1')).toBeVisible();

  const admin = page.getByTestId('form-section-admin');
  await admin.click();
  await expect(admin).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByLabel(/Vorrat behalten/)).toBeVisible();
  await expect(page.getByLabel(/Hauptwurzel festlegen/)).toBeVisible();
});

test('neue Person startet mit derselben kompakten Abschnittsstruktur', async ({ page }) => {
  await openTree(page);
  await page.getByTestId('app-mode-toggle').click();
  await page.locator('#addBtn').click();

  await expect(page.locator('#sheetTitle')).toHaveText('Neue Person');
  await expect(page.getByTestId('form-section-basis')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('form-section-life')).toHaveAttribute('aria-expanded', 'true');
  for (const section of ['relations', 'additional', 'sources', 'admin']) {
    await expect(page.getByTestId(`form-section-${section}`)).toHaveAttribute('aria-expanded', 'false');
  }
  await expect(page.getByLabel('Vorname')).toBeFocused();
  await expect(page.getByTestId('person-save')).toBeVisible();
});

test('Formular bleibt bei 390 px und 200 Prozent Textzoom ohne horizontales Abschneiden', async ({ page }) => {
  await openTree(page);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await openEditForm(page);

  const overflow = await page.getByTestId('person-edit-form').evaluate(form => ({
    form: form.scrollWidth > form.clientWidth + 1,
    sections: [...form.querySelectorAll('.formSection')].some(section => section.scrollWidth > section.clientWidth + 1),
    toggles: [...form.querySelectorAll('.formSectionToggle')].some(toggle => toggle.scrollWidth > toggle.clientWidth + 1)
  }));
  expect(overflow).toEqual({ form: false, sections: false, toggles: false });
});
