const { test, expect } = require('@playwright/test');

const storeKey = 'mobile-family-tree-v5-clean';
const helpSeenKey = `${storeKey}-help-seen-v1`;

const tree = {
  rootIds: ['current'],
  people: [
    { id: 'current', name: 'Aktuelle Person', firstName: 'Aktuelle', lastName: 'Person', born: '1950', x: 900, y: 700, parents: [], partners: [] },
    { id: 'parent-a', name: 'Person A', firstName: 'Person', lastName: 'A', born: '1920', x: 650, y: 430, parents: [], partners: [] },
    { id: 'parent-b', name: 'Person B', firstName: 'Person', lastName: 'B', born: '1922', x: 1050, y: 430, parents: [], partners: [] },
    { id: 'child', name: 'Nachkomme Kind', firstName: 'Nachkomme', lastName: 'Kind', born: '1980', x: 900, y: 980, parents: ['current'], partners: [] }
  ]
};

async function openEditForm(page) {
  await page.addInitScript(({ key, value, seenKey }) => {
    localStorage.setItem(key, JSON.stringify(value));
    localStorage.setItem(seenKey, JSON.stringify(['pan-zoom', 'search', 'edit']));
  }, { key: storeKey, value: tree, seenKey: helpSeenKey });
  await page.goto('/?ux-debug=1');
  await page.getByTestId('welcome-continue').click();
  await page.getByTestId('person-search-open').click();
  await page.getByTestId('person-search').fill('Aktuelle Person');
  await page.getByTestId('person-search-result-current').click();
  await page.getByTestId('app-mode-toggle').click();
}

function failOnDialogs(page, dialogs) {
  page.on('dialog', async dialog => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });
}

test('Datumsfehler erscheinen feldnah und der Fokus folgt dem ersten Problem', async ({ page }) => {
  const dialogs = [];
  failOnDialogs(page, dialogs);
  await openEditForm(page);

  const born = page.getByLabel('Geboren');
  const died = page.getByLabel('Gestorben');
  await born.fill('kein Datum');
  await died.fill('auch falsch');
  await page.getByTestId('person-save').click();

  await expect(page.getByTestId('form-error-summary')).toBeVisible();
  await expect(page.getByTestId('form-error-summary')).toContainText('Geburtsdatum bitte');
  await expect(born).toHaveAttribute('aria-invalid', 'true');
  await expect(born).toBeFocused();
  const describedBy = await born.getAttribute('aria-describedby');
  await expect(page.locator(`#${describedBy.split(/\s+/)[0]}`)).toContainText('Geburtsdatum bitte');

  await born.fill('1950');
  await page.getByTestId('person-save').click();
  await expect(born).not.toHaveAttribute('aria-invalid', 'true');
  await expect(died).toHaveAttribute('aria-invalid', 'true');
  await expect(died).toBeFocused();
  expect(dialogs).toEqual([]);
});

test('identische Eltern, Selbstbezug und ungültige Partnerschaft öffnen Beziehungen', async ({ page }) => {
  const dialogs = [];
  failOnDialogs(page, dialogs);
  await openEditForm(page);

  const relations = page.getByTestId('form-section-relations');
  await relations.click();
  const parent1 = page.getByLabel('Elternteil 1');
  const parent2 = page.getByLabel('Elternteil 2');
  const partner = page.getByLabel('Weitere / frühere Partnerperson ergänzen');

  await parent1.selectOption('parent-a');
  await parent2.selectOption('parent-a');
  await page.getByTestId('person-save').click();
  await expect(page.getByText('Bitte zwei unterschiedliche Elternteile auswählen.', { exact: true }).first()).toBeVisible();
  await expect(parent1).toBeFocused();

  await page.evaluate(() => {
    const select = document.querySelector('#parent1');
    select.append(new Option('Aktuelle Person', 'current'));
    select.value = 'current';
  });
  await parent2.selectOption('');
  await page.getByTestId('person-save').click();
  await expect(page.getByText('Eine Person kann nicht ihr eigener Elternteil sein.', { exact: true }).first()).toBeVisible();

  await parent1.selectOption('parent-a');
  await partner.selectOption('parent-a');
  await page.getByTestId('person-save').click();
  await expect(page.getByText('Partner/in und Elternteil dürfen nicht dieselbe Person sein.', { exact: true }).first()).toBeVisible();
  await expect(partner).toHaveAttribute('aria-invalid', 'true');
  expect(dialogs).toEqual([]);
});

test('widersprüchliche Verwaltungsangaben werden ohne Alert erklärt', async ({ page }) => {
  const dialogs = [];
  failOnDialogs(page, dialogs);
  await openEditForm(page);

  const admin = page.getByTestId('form-section-admin');
  await admin.click();
  const pool = page.getByLabel(/Vorrat behalten/);
  const root = page.getByLabel(/Hauptwurzel festlegen/);
  await pool.check();
  await root.check();
  await page.getByTestId('person-save').click();

  await expect(page.getByText('Die Hauptwurzel kann nicht gleichzeitig im Vorrat liegen.', { exact: true }).first()).toBeVisible();
  await expect(pool).toHaveAttribute('aria-invalid', 'true');
  await expect(root).toHaveAttribute('aria-invalid', 'true');
  await expect(pool).toBeFocused();
  expect(dialogs).toEqual([]);
});
