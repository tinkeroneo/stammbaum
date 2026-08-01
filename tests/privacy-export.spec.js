const fs = require('node:fs');
const { test, expect } = require('@playwright/test');

const storeKey = 'mobile-family-tree-v5-clean';
const tinyImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const people = [
  {
    id: 'living', name: 'Lebende Person', born: '10.12.1980', died: '', note: 'privat', link: 'https://example.test/living',
    image: tinyImage, mentions: [{ title: 'private Quelle', date: '2020', link: '' }], x: 300, y: 300, parents: [], partners: []
  },
  {
    id: 'unknown', name: 'Unbekannte Person', born: '', died: '', note: 'vertraulich', image: tinyImage,
    mentions: [], x: 600, y: 300, parents: [], partners: []
  },
  {
    id: 'old', name: 'Alte Person', born: '1900', died: '', note: 'historisch', image: tinyImage,
    mentions: [{ title: 'Archiv', date: '1900', link: '' }], x: 300, y: 650, parents: [], partners: []
  },
  {
    id: 'dead', name: 'Verstorbene Person', born: '01.01.1980', died: '2020', note: 'Nachruf', image: tinyImage,
    mentions: [{ title: 'Sterberegister', date: '2020', link: '' }], x: 600, y: 650, parents: [], partners: []
  }
];

test('Lebend-Klassifikation ist vorsichtig, transparent und deterministisch', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async sourcePeople => {
    const { classifyPresumedLiving, createPrivacyExport } = await import('/modules/data-model.js');
    const source = { rootIds: ['living'], people: sourcePeople };
    const before = JSON.stringify(source);
    const options = {
      includeImages: true,
      privacyEnabled: true,
      shortenLifeDates: true,
      removeNotesAndSources: true,
      removeImagesForLiving: true,
      asOfYear: 2026
    };
    const first = createPrivacyExport(source, options);
    const second = createPrivacyExport(source, options);
    const withoutAnyImages = createPrivacyExport(source, {
      includeImages: false,
      privacyEnabled: false,
      asOfYear: 2026
    });
    return {
      classifications: Object.fromEntries(sourcePeople.map(person => [
        person.id,
        classifyPresumedLiving(person, { asOfYear: 2026 })
      ])),
      first,
      withoutAnyImages,
      deterministic: JSON.stringify(first) === JSON.stringify(second),
      unchanged: before === JSON.stringify(source)
    };
  }, people);

  expect(result.classifications.living).toMatchObject({ presumedLiving: true, reason: 'younger-than-110-no-death' });
  expect(result.classifications.unknown).toMatchObject({ presumedLiving: true, reason: 'birth-unknown-no-death' });
  expect(result.classifications.old).toMatchObject({ presumedLiving: false, reason: 'age-at-least-110' });
  expect(result.classifications.dead).toMatchObject({ presumedLiving: false, reason: 'death-recorded' });
  expect(result.deterministic).toBe(true);
  expect(result.unchanged).toBe(true);
  expect(result.first.preview).toMatchObject({ presumedLiving: 2, affectedPeople: 2 });
  expect(result.withoutAnyImages.data.people.every(person => person.image === '')).toBe(true);

  const exported = Object.fromEntries(result.first.data.people.map(person => [person.id, person]));
  expect(exported.living).toMatchObject({ born: '1980', note: '', link: '', image: '', mentions: [] });
  expect(exported.unknown).toMatchObject({ born: '', note: '', image: '', mentions: [] });
  expect(exported.old).toMatchObject({ born: '1900', note: 'historisch', image: tinyImage });
  expect(exported.dead).toMatchObject({ born: '01.01.1980', died: '2020', note: 'Nachruf', image: tinyImage });
});

test('Dialog zeigt Regel und Betroffenenzahl vor dem bestätigten Datenschutzexport', async ({ page }) => {
  await page.addInitScript(({ key, value }) => {
    localStorage.setItem(key, JSON.stringify({ rootIds: ['living'], people: value }));
    localStorage.setItem(`${key}-help-seen-v1`, JSON.stringify(['pan-zoom', 'search', 'edit']));
  }, { key: storeKey, value: people });
  await page.goto('/?ux-debug=1');
  await page.getByTestId('welcome-continue').click();
  await page.evaluate(() => { window.showSaveFilePicker = undefined; });
  await page.getByTestId('app-file-menu-toggle').click();
  await page.getByTestId('json-export').click();

  await expect(page.getByTestId('export-living-count')).toHaveText('2 von 4');
  await expect(page.locator('#exportPrivacyRule')).toContainText('Geburtsjahr fehlt');
  await expect(page.locator('#exportPrivacyOptions')).toHaveAttribute('disabled', '');
  await page.getByTestId('export-privacy-enabled').check();
  await expect(page.locator('#exportPrivacyOptions')).not.toHaveAttribute('disabled', '');
  await expect(page.getByTestId('export-privacy-count')).toHaveText('2 Person(en)');

  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-submit').click();
  const download = await downloadPromise;
  const exported = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
  const byId = Object.fromEntries(exported.people.map(person => [person.id, person]));
  expect(byId.living).toMatchObject({ born: '1980', note: '', link: '', image: '', mentions: [] });
  expect(byId.unknown).toMatchObject({ note: '', image: '' });
  expect(byId.old.note).toBe('historisch');
  expect(byId.dead.note).toBe('Nachruf');
});
