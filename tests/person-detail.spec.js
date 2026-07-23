const { test, expect } = require('@playwright/test');

const storeKey = 'mobile-family-tree-v5-clean';

const detailTree = {
  rootIds: ['parent-1'],
  people: [
    {
      id: 'parent-1',
      name: 'Erika Beispiel',
      firstName: 'Erika',
      lastName: 'Beispiel',
      born: '1935',
      died: '2018',
      x: 360,
      y: 120,
      parents: [],
      partner: 'parent-2',
      partners: ['parent-2']
    },
    {
      id: 'parent-2',
      name: 'Emil Beispiel',
      firstName: 'Emil',
      lastName: 'Beispiel',
      born: '1932',
      died: '2010',
      x: 590,
      y: 120,
      parents: [],
      partner: 'parent-1',
      partners: ['parent-1']
    },
    {
      id: 'full',
      name: 'Franz Vollständig',
      firstName: 'Franz',
      lastName: 'Vollständig',
      born: '12.03.1960',
      died: '04.05.2020',
      occupation: 'Lehrer',
      location: 'München',
      note: 'Pflegte das Familienarchiv.',
      mentions: [{ title: 'Familienbuch', date: '1998', link: '' }],
      x: 470,
      y: 390,
      parents: ['parent-1', 'parent-2'],
      partner: 'partner',
      partners: ['partner'],
      partnerDetails: { partner: { married: '1985' } }
    },
    {
      id: 'partner',
      name: 'Paula Partner',
      firstName: 'Paula',
      lastName: 'Partner',
      born: '1962',
      x: 700,
      y: 390,
      parents: [],
      partner: 'full',
      partners: ['full'],
      partnerDetails: { full: { married: '1985' } }
    },
    {
      id: 'child',
      name: 'Christa Kind',
      firstName: 'Christa',
      lastName: 'Kind',
      born: '1990',
      x: 580,
      y: 650,
      parents: ['full', 'partner'],
      partner: '',
      partners: []
    },
    {
      id: 'incomplete',
      name: 'Ina Unvollständig',
      firstName: 'Ina',
      lastName: 'Unvollständig',
      location: 'Augsburg',
      x: 880,
      y: 390,
      parents: ['parent-1'],
      partner: '',
      partners: []
    },
    {
      id: 'empty',
      name: 'Nora Ohneangaben',
      firstName: 'Nora',
      lastName: 'Ohneangaben',
      x: 920,
      y: 650,
      parents: [],
      partner: '',
      partners: []
    }
  ]
};

async function openDetailTree(page) {
  await page.addInitScript(({ key, value }) => {
    localStorage.setItem(key, JSON.stringify(value));
  }, { key: storeKey, value: detailTree });
  await page.goto('/');
  await page.getByTestId('welcome-continue').click();
}

async function openPerson(page, id) {
  await page.getByTestId(`person-card-${id}`).click();
  await expect(page.getByTestId('person-dialog')).toHaveAttribute('aria-hidden', 'false');
  await expect(page.getByTestId('person-detail-view')).toBeVisible();
}

test('vollständige Person zeigt reine Details und navigierbare Beziehungen', async ({ page }) => {
  await openDetailTree(page);
  await openPerson(page, 'full');

  const details = page.getByTestId('person-details');
  await expect(details).toContainText('Franz Vollständig');
  await expect(details).toContainText('12.03.1960');
  await expect(details).toContainText('04.05.2020');
  await expect(details).toContainText('Erika Beispiel');
  await expect(details).toContainText('Paula Partner');
  await expect(details).toContainText('Christa Kind');
  await expect(details).toContainText('Familienbuch');
  await expect(details).toContainText('Pflegte das Familienarchiv.');
  await expect(page.getByTestId('person-edit-form')).toBeHidden();
  await expect(page.getByLabel('Vorname')).toBeHidden();

  await page.getByTestId('person-relation-parent-parent-1').click();
  await expect(details).toContainText('Erika Beispiel');
  await expect(details.locator('.detailName')).toHaveText('Erika Beispiel');
  await expect(page.locator('#sheetTitle')).toBeFocused();

  await page.getByTestId('person-dialog-close').click();
  await expect(page.getByTestId('person-dialog')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.getByTestId('person-card-parent-1')).toBeFocused();
  expect(await page.getByTestId('person-card-parent-1').evaluate(element => element.closest('.person')?.classList.contains('selected'))).toBe(true);
});

test('Bearbeiten und Zurück behalten dieselbe Person und einen logischen Fokus', async ({ page }) => {
  await openDetailTree(page);
  await openPerson(page, 'full');

  await page.getByTestId('person-edit-open').click();
  await expect(page.getByTestId('person-detail-view')).toBeHidden();
  await expect(page.getByTestId('person-edit-form')).toBeVisible();
  await expect(page.getByLabel('Vorname')).toHaveValue('Franz');
  await expect(page.getByLabel('Vorname')).toBeFocused();

  await page.getByTestId('person-edit-back').click();
  await expect(page.getByTestId('person-detail-view')).toBeVisible();
  await expect(page.getByTestId('person-edit-form')).toBeHidden();
  await expect(page.getByTestId('person-details')).toContainText('Franz Vollständig');
  await expect(page.getByTestId('person-edit-open')).toBeFocused();
});

test('unvollständige Person rendert nur vorhandene Bereiche', async ({ page }) => {
  await openDetailTree(page);
  await openPerson(page, 'incomplete');

  const details = page.getByTestId('person-details');
  await expect(details).toContainText('Ina Unvollständig');
  await expect(details).toContainText('Lebensdaten nicht eingetragen');
  await expect(details).toContainText('Augsburg');
  await expect(details).toContainText('Eltern');
  await expect(details).not.toContainText('Partner/in');
  await expect(details).not.toContainText('Kinder');
  await expect(details).not.toContainText('Quellen');
  await expect(details).not.toContainText('Notiz');
});

test('Person ohne Zusatzdaten zeigt keine leeren Beziehungs- oder Inhaltsboxen', async ({ page }) => {
  await openDetailTree(page);
  await openPerson(page, 'empty');

  const details = page.getByTestId('person-details');
  await expect(details).toContainText('Nora Ohneangaben');
  await expect(details).toContainText('Lebensdaten nicht eingetragen');
  await expect(details).not.toContainText('Eltern');
  await expect(details).not.toContainText('Partner/in');
  await expect(details).not.toContainText('Kinder');
  await expect(details).not.toContainText('Quellen');
  await expect(details).not.toContainText('Notiz');
});

test('Detail-Layout bleibt bei 200 % Textzoom ohne Abschneiden', async ({ page }) => {
  await openDetailTree(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });

  for (const personId of ['full', 'incomplete', 'empty']) {
    await openPerson(page, personId);

    await expect(page.locator('.detailHero')).toBeVisible();
    const clipped = await page.getByTestId('person-details').evaluate((node) => {
      const candidates = node.querySelectorAll('.detailName, .detailLabel, .detailMeta, .detailValue, .detailLink');
      return Array.from(candidates).some(el => el.scrollWidth > el.clientWidth + 1);
    });
    expect(clipped).toBe(false);

    await page.getByTestId('person-dialog-close').click();
  }
});
