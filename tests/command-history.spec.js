const { test, expect } = require('@playwright/test');
const smokeTree = require('./fixtures/smoke-tree.cjs');

const storeKey = 'mobile-family-tree-v5-clean';
const helpSeenKey = `${storeKey}-help-seen-v1`;

async function openTree(page) {
  await page.addInitScript(({ key, tree, seenKey }) => {
    localStorage.setItem(key, JSON.stringify(tree));
    localStorage.setItem(seenKey, JSON.stringify(['pan-zoom', 'search', 'edit']));
  }, { key: storeKey, tree: smokeTree, seenKey: helpSeenKey });
  await page.goto('/?ux-debug=1');
  await expect.poll(() => page.evaluate(() => !!window.__uxDebug)).toBe(true);
}

test('Speichern im Personenformular erzeugt einen rückgängig machbaren Command', async ({ page }) => {
  await openTree(page);
  await page.getByTestId('welcome-continue').click();
  await page.getByTestId('person-search-open').click();
  await page.getByTestId('person-search').fill('Smoke Root');
  await page.getByTestId('person-search-result-smoke-root').click();
  await page.getByTestId('app-mode-toggle').click();
  await page.getByTestId('form-section-additional').click();
  await page.getByLabel('Notiz').fill('Command gespeichert');
  await page.getByTestId('person-save').click();

  const afterSave = await page.evaluate(() => ({
    history: window.__uxDebug.getCommandHistoryState(),
    person: window.__uxDebug.getPerson('smoke-root')
  }));
  expect(afterSave.history.undoLabel).toBe('Person speichern');
  expect(afterSave.history.canUndo).toBe(true);

  await page.evaluate(() => window.__uxDebug.undoCommand());
  const restored = await page.evaluate(() =>
    window.__uxDebug.getDataSnapshot().people.find(person => person.id === 'smoke-root')
  );
  expect(restored.note).toBe('Isolated smoke-test person');

  await page.evaluate(() => window.__uxDebug.redoCommand());
  const repeated = await page.evaluate(() =>
    window.__uxDebug.getDataSnapshot().people.find(person => person.id === 'smoke-root')
  );
  expect(repeated.note).toBe('Command gespeichert');
});

test('zehn gemischte Commands lassen sich exakt zurück und wieder vorwärts ausführen', async ({ page }) => {
  await openTree(page);
  const sequence = await page.evaluate(() => {
    const debug = window.__uxDebug;
    const initial = debug.getDataSnapshot();
    debug.updatePersonForTest('smoke-root', { note: 'Schritt 1' }, 'Notiz ändern');
    debug.updatePersonForTest('smoke-root', { x: 640, y: 360 }, 'Person verschieben');

    const beforeChild = new Set(debug.getDataSnapshot().people.map(person => person.id));
    debug.addChildForTest('smoke-root');
    const childId = debug.getDataSnapshot().people.find(person => !beforeChild.has(person.id)).id;

    const beforePartner = new Set(debug.getDataSnapshot().people.map(person => person.id));
    debug.addPartnerForTest('smoke-root');
    const partnerId = debug.getDataSnapshot().people.find(person => !beforePartner.has(person.id)).id;

    debug.addParentsForTest('smoke-root');
    debug.setPoolForTest(childId, true);
    debug.setPoolForTest(childId, false);
    debug.setLayoutModeForTest('tree');
    debug.updatePersonForTest(childId, { note: 'Kind ergänzt' }, 'Kind ergänzen');
    debug.deletePersonForTest(partnerId);

    const final = debug.getDataSnapshot();
    const historyAfterCommands = debug.getCommandHistoryState();
    const undoLabels = [];
    while (debug.getCommandHistoryState().canUndo) undoLabels.push(debug.undoCommand());
    const undone = debug.getDataSnapshot();
    const redoLabels = [];
    while (debug.getCommandHistoryState().canRedo) redoLabels.push(debug.redoCommand());
    return {
      initial,
      final,
      undone,
      redone: debug.getDataSnapshot(),
      historyAfterCommands,
      undoLabels,
      redoLabels,
      historyAfterRedo: debug.getCommandHistoryState()
    };
  });

  expect(sequence.historyAfterCommands.length).toBe(10);
  expect(sequence.historyAfterCommands.index).toBe(10);
  expect(sequence.undoLabels).toHaveLength(10);
  expect(sequence.redoLabels).toHaveLength(10);
  expect(sequence.undone).toEqual(sequence.initial);
  expect(sequence.redone).toEqual(sequence.final);
  expect(sequence.historyAfterRedo.canRedo).toBe(false);
  expect(sequence.historyAfterRedo.canUndo).toBe(true);
});

test('neuer Command nach Undo verwirft Redo und die Historie bleibt auf 50 begrenzt', async ({ page }) => {
  await openTree(page);
  const result = await page.evaluate(() => {
    const debug = window.__uxDebug;
    for (let index = 1; index <= 12; index += 1) {
      debug.updatePersonForTest('smoke-root', { note: `Version ${index}` }, `Änderung ${index}`);
    }
    debug.undoCommand();
    debug.undoCommand();
    const beforeBranch = debug.getCommandHistoryState();
    debug.updatePersonForTest('smoke-root', { location: 'Neuer Zweig' }, 'Ort ändern');
    const afterBranch = debug.getCommandHistoryState();
    for (let index = 13; index <= 70; index += 1) {
      debug.updatePersonForTest('smoke-root', { note: `Version ${index}` }, `Änderung ${index}`);
    }
    return {
      beforeBranch,
      afterBranch,
      limited: debug.getCommandHistoryState()
    };
  });

  expect(result.beforeBranch.canRedo).toBe(true);
  expect(result.afterBranch.canRedo).toBe(false);
  expect(result.afterBranch.length).toBe(11);
  expect(result.afterBranch.index).toBe(11);
  expect(result.limited.length).toBe(50);
  expect(result.limited.index).toBe(50);
});

test('Import und Reset beginnen jeweils eine neue Historie', async ({ page }) => {
  await page.route('**/Bodensteiner.json', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(smokeTree)
  }));
  await openTree(page);
  await page.evaluate(() => {
    window.__uxDebug.updatePersonForTest('smoke-root', { note: 'Vor Import' }, 'Vor Import');
  });
  await expect.poll(() => page.evaluate(() => window.__uxDebug.getCommandHistoryState().length)).toBe(1);

  const importedTree = {
    rootIds: ['imported'],
    people: [{
      id: 'imported',
      name: 'Import Person',
      firstName: 'Import',
      lastName: 'Person',
      x: 500,
      y: 300,
      parents: [],
      partners: []
    }]
  };
  await page.locator('#fileInput').setInputFiles({
    name: 'import.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(importedTree))
  });
  await expect.poll(() => page.evaluate(() => window.__uxDebug.getCommandHistoryState().length)).toBe(0);
  await expect(page.getByTestId('person-card-imported')).toBeVisible();

  await page.evaluate(() => {
    window.__uxDebug.updatePersonForTest('imported', { note: 'Vor Reset' }, 'Vor Reset');
  });
  await page.locator('#settingsBtn').click();
  await page.locator('#resetBtn').click();
  await page.locator('#decisionConfirm').click();

  await expect.poll(() => page.evaluate(() => window.__uxDebug.getCommandHistoryState().length)).toBe(0);
  await expect(page.getByTestId('person-card-smoke-root')).toBeVisible();
});
