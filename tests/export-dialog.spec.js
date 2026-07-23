const fs = require('node:fs');
const { test, expect } = require('@playwright/test');

const storeKey = 'mobile-family-tree-v5-clean';
const helpSeenKey = `${storeKey}-help-seen-v1`;
const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

const tree = {
  rootIds: ['export-a'],
  people: [
    {
      id: 'export-a',
      name: 'Export Person',
      firstName: 'Export',
      lastName: 'Person',
      born: '1950',
      note: 'Eine Notiz',
      image: tinyPng,
      mentions: [{ title: 'Kirchenbuch', date: '1950', link: '' }],
      x: 600,
      y: 500,
      parents: [],
      partners: []
    },
    {
      id: 'export-b',
      name: 'Export Kind',
      firstName: 'Export',
      lastName: 'Kind',
      born: '1980',
      x: 900,
      y: 850,
      parents: ['export-a'],
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
  await page.evaluate(() => {
    window.showSaveFilePicker = undefined;
  });
}

async function openExport(page) {
  await page.getByTestId('app-file-menu-toggle').click();
  await page.getByTestId('json-export').click();
  await expect(page.getByTestId('export-dialog')).toBeVisible();
}

test('JSON-Dialog zeigt Zusammenfassung und exportiert wahlweise mit oder ohne Bilder', async ({ page }) => {
  await openTree(page);
  await openExport(page);

  const summary = page.getByTestId('export-summary');
  await expect(summary).toContainText('Personen');
  await expect(summary).toContainText('2');
  await expect(summary).toContainText('1 enthalten');
  await expect(summary).toContainText('1 / 1');
  await expect(page.getByTestId('export-filename')).toHaveValue('stammbaum.json');

  await page.locator('#exportIncludeImages').uncheck();
  await page.getByTestId('export-filename').fill('familie-ohne-bilder');
  const withoutDownload = page.waitForEvent('download');
  await page.getByTestId('export-submit').click();
  const without = await withoutDownload;
  expect(without.suggestedFilename()).toBe('familie-ohne-bilder.json');
  const withoutJson = JSON.parse(fs.readFileSync(await without.path(), 'utf8'));
  expect(withoutJson.people.find(person => person.id === 'export-a').image).toBe('');

  await openExport(page);
  await page.locator('#exportIncludeImages').check();
  const withDownload = page.waitForEvent('download');
  await page.getByTestId('export-submit').click();
  const withImages = await withDownload;
  const withJson = JSON.parse(fs.readFileSync(await withImages.path(), 'utf8'));
  expect(withJson.people.find(person => person.id === 'export-a').image).toBe(tinyPng);

  await openExport(page);
  let downloads = 0;
  page.on('download', () => { downloads += 1; });
  await page.getByTestId('export-cancel').click();
  await page.waitForTimeout(150);
  expect(downloads).toBe(0);
  await expect(page.getByTestId('export-dialog')).toBeHidden();
});

test('Bildexport unterstützt SVG sowie PNG in 2x, 3x und 4x ohne Prompts', async ({ page }) => {
  await openTree(page);

  await openExport(page);
  await page.getByLabel('Bildansicht').check();
  await page.getByLabel('Bildformat').selectOption('svg');
  await expect(page.locator('#exportScaleField')).toBeHidden();
  await expect(page.getByTestId('export-filename')).toHaveValue('stammbaum-ansicht.svg');
  const svgDownload = page.waitForEvent('download');
  await page.getByTestId('export-submit').click();
  const svg = await svgDownload;
  expect(svg.suggestedFilename()).toBe('stammbaum-ansicht.svg');
  expect(fs.readFileSync(await svg.path(), 'utf8')).toContain('<svg');

  for (const scale of ['2', '3', '4']) {
    await openExport(page);
    await page.getByLabel('Bildansicht').check();
    await page.getByLabel('Bildformat').selectOption('png');
    await page.getByLabel('PNG-Qualität').selectOption(scale);
    await expect(page.getByLabel('PNG-Qualität')).toHaveValue(scale);
    const pngDownload = page.waitForEvent('download');
    await page.getByTestId('export-submit').click();
    const png = await pngDownload;
    expect(png.suggestedFilename()).toBe('stammbaum-ansicht.png');
    expect(fs.statSync(await png.path()).size).toBeGreaterThan(0);
  }
});

test('Dateiauswahl-Abbruch erzeugt nichts, Fehler fällt kontrolliert auf Download zurück', async ({ page }) => {
  await openTree(page);
  await openExport(page);
  await page.evaluate(() => {
    window.showSaveFilePicker = async () => {
      throw new DOMException('abgebrochen', 'AbortError');
    };
  });
  let downloads = 0;
  page.on('download', () => { downloads += 1; });
  await page.getByTestId('export-submit').click();
  await page.waitForTimeout(150);
  expect(downloads).toBe(0);
  await expect(page.getByTestId('export-dialog')).toBeVisible();

  await page.evaluate(() => {
    window.showSaveFilePicker = async () => {
      throw new Error('Dateizugriff fehlgeschlagen');
    };
  });
  let fallbackMessage = '';
  page.once('dialog', async dialog => {
    fallbackMessage = dialog.message();
    await dialog.accept();
  });
  const fallbackDownload = page.waitForEvent('download');
  await page.getByTestId('export-submit').click();
  const fallback = await fallbackDownload;
  expect(fallback.suggestedFilename()).toBe('stammbaum.json');
  expect(fallbackMessage).toContain('Download gestartet');
});
