const { test, expect } = require('@playwright/test');
const smokeTree = require('./fixtures/smoke-tree.cjs');

const storeKey = 'mobile-family-tree-v5-clean';
const helpSeenKey = `${storeKey}-help-seen-v1`;

async function openTree(page, viewport = { width: 1280, height: 800 }) {
  await page.addInitScript(({ key, tree, seenKey }) => {
    localStorage.setItem(key, JSON.stringify(tree));
    localStorage.setItem(seenKey, JSON.stringify(['pan-zoom', 'search', 'edit']));
  }, { key: storeKey, tree: smokeTree, seenKey: helpSeenKey });
  await page.setViewportSize(viewport);
  await page.goto('/?ux-debug=1');
  await page.getByTestId('welcome-continue').click();
  await page.getByTestId('app-mode-toggle').click();
}

test('Desktop-Buttons zeigen den letzten Vorgang und bestätigen Undo/Redo', async ({ page }) => {
  await openTree(page);
  const undo = page.getByTestId('undo');
  const redo = page.getByTestId('redo');
  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();

  await page.evaluate(() => {
    window.__uxDebug.updatePersonForTest(
      'smoke-root',
      { note: 'Desktop Änderung' },
      'Notiz ändern'
    );
  });
  await expect(undo).toBeEnabled();
  await expect(undo).toHaveAttribute('title', 'Notiz ändern rückgängig machen');

  await undo.click();
  await expect(page.locator('#commandAnnouncement')).toHaveText('Rückgängig: Notiz ändern');
  await expect(undo).toBeDisabled();
  await expect(redo).toBeEnabled();
  await expect(redo).toHaveAttribute('title', 'Notiz ändern wiederholen');

  await redo.click();
  await expect(page.locator('#commandAnnouncement')).toHaveText('Wiederholt: Notiz ändern');
  const person = await page.evaluate(() =>
    window.__uxDebug.getDataSnapshot().people.find(entry => entry.id === 'smoke-root')
  );
  expect(person.note).toBe('Desktop Änderung');
});

test('Mobile zeigt beschriftete Undo/Redo-Aktionen im Bearbeitungsformular', async ({ page }) => {
  await openTree(page, { width: 390, height: 844 });
  await page.evaluate(() => {
    window.__uxDebug.updatePersonForTest(
      'smoke-root',
      { location: 'Mobile Ort' },
      'Ort ändern'
    );
  });
  await page.getByTestId('person-search-open').click();
  await page.getByTestId('person-search').fill('Smoke Root');
  await page.getByTestId('person-search-result-smoke-root').click();
  await page.getByTestId('person-edit-open').click();

  const undo = page.getByTestId('undo-mobile');
  const redo = page.getByTestId('redo-mobile');
  await expect(undo).toBeVisible();
  await expect(undo).toHaveText('Rückgängig: Ort ändern');
  await expect(redo).toBeDisabled();

  const size = await undo.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  expect(size.width).toBeGreaterThanOrEqual(44);
  expect(size.height).toBeGreaterThanOrEqual(40);

  await undo.click();
  await expect(redo).toBeEnabled();
  await expect(redo).toHaveText('Wiederholen: Ort ändern');
});

test('Shortcuts funktionieren außerhalb von Feldern und respektieren Formular-Undo', async ({ page }) => {
  await openTree(page);
  await page.evaluate(() => {
    window.__uxDebug.updatePersonForTest(
      'smoke-root',
      { note: 'Shortcut Änderung' },
      'Notiz ändern'
    );
  });

  await page.getByTestId('app-mode-toggle').focus();
  await page.keyboard.press('Control+z');
  await expect.poll(() => page.evaluate(() => window.__uxDebug.getCommandHistoryState().index)).toBe(0);

  await page.keyboard.press('Control+Shift+z');
  await expect.poll(() => page.evaluate(() => window.__uxDebug.getCommandHistoryState().index)).toBe(1);

  await page.getByTestId('person-search-open').click();
  await page.getByTestId('person-search').fill('Smoke Root');
  await page.getByTestId('person-search-result-smoke-root').click();
  await page.getByTestId('person-edit-open').click();
  const firstName = page.getByLabel('Vorname');
  await firstName.focus();
  const indexBeforeFieldUndo = await page.evaluate(() => window.__uxDebug.getCommandHistoryState().index);
  await page.keyboard.press('Control+z');
  expect(await page.evaluate(() => window.__uxDebug.getCommandHistoryState().index)).toBe(indexBeforeFieldUndo);
});
