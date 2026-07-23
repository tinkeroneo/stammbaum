const { test, expect } = require('@playwright/test');
const smokeTree = require('./fixtures/smoke-tree.cjs');

const storeKey = 'mobile-family-tree-v5-clean';
const helpSeenKey = `${storeKey}-help-seen-v1`;

async function openPersistedTree(page) {
  await page.addInitScript(({ key, tree, seenKey }) => {
    localStorage.setItem(key, JSON.stringify(tree));
    localStorage.setItem(seenKey, JSON.stringify(['pan-zoom', 'search', 'edit']));
  }, { key: storeKey, tree: smokeTree, seenKey: helpSeenKey });
  await page.goto('/?ux-debug=1');
  await expect.poll(() => page.evaluate(() => !!window.__uxDebug)).toBe(true);
}

async function waitForPersistence(page) {
  return page.evaluate(() => window.__uxDebug.waitForPersistence());
}

test('LocalStorage-Fehler fällt nach erfolgreichem IndexedDB-Schreiben ehrlich zurück', async ({ page }) => {
  await openPersistedTree(page);
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Storage full', 'QuotaExceededError');
    };
    window.__uxDebug.savePersonNoteForTest('smoke-root', 'Nur in IndexedDB');
  });

  const result = await waitForPersistence(page);
  const state = await page.evaluate(() => window.__uxDebug.getPersistenceState());

  expect(result.state).toBe('degraded-indexeddb');
  expect(state.persistenceState).toBe('degraded-indexeddb');
  expect(state.persistenceMode).toBe('indexeddb');
  expect(state.statusLabel).toBe('Im Ersatzspeicher gesichert');
  await expect(page.locator('#app-storage-status')).toHaveText('Im Ersatzspeicher gesichert');
});

test('ohne LocalStorage und IndexedDB bleibt der Status memory-only', async ({ page }) => {
  await openPersistedTree(page);
  page.on('dialog', dialog => dialog.dismiss().catch(() => {}));
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Storage full', 'QuotaExceededError');
    };
    Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true });
    window.__uxDebug.savePersonNoteForTest('smoke-root', 'Nur im Speicher');
  });

  const result = await waitForPersistence(page);
  const state = await page.evaluate(() => window.__uxDebug.getPersistenceState());

  expect(result.state).toBe('memory-only');
  expect(state.persistenceState).toBe('memory-only');
  expect(state.persistenceMode).toBe('memory');
  expect(state.hasPersistedTreeData).toBe(false);
  expect(state.statusLabel).toBe('Nur im Arbeitsspeicher');
  await expect(page.locator('#app-storage-status')).toHaveText('Nur im Arbeitsspeicher');
});

test('fehlgeschlagenes Dateischreiben meldet error trotz Browser-Backup', async ({ page }) => {
  await openPersistedTree(page);
  page.on('dialog', dialog => dialog.dismiss().catch(() => {}));
  await page.evaluate(() => {
    window.__uxDebug.setWorkingFileHandleForTest({
      name: 'nicht-schreibbar.json',
      async createWritable() {
        throw new Error('Dateizugriff verweigert');
      }
    });
    window.__uxDebug.savePersonNoteForTest('smoke-root', 'Dateischreibfehler');
  });

  const result = await waitForPersistence(page);
  const state = await page.evaluate(() => window.__uxDebug.getPersistenceState());
  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), storeKey);

  expect(result.state).toBe('error');
  expect(result.localOk).toBe(true);
  expect(result.fileOk).toBe(false);
  expect(state.persistenceState).toBe('error');
  expect(state.persistenceLastError).toContain('Dateizugriff verweigert');
  expect(state.workingFile).toBe('');
  expect(stored.people[0].note).toBe('Dateischreibfehler');
  await expect(page.locator('#app-storage-status')).toHaveText('Speicherfehler');
});

test('erfolgreiches Dateischreiben erreicht saved-file erst nach close', async ({ page }) => {
  await openPersistedTree(page);
  await page.evaluate(() => {
    window.__fileWriteSteps = [];
    window.__uxDebug.setWorkingFileHandleForTest({
      name: 'arbeitsdatei.json',
      async createWritable() {
        window.__fileWriteSteps.push('create');
        return {
          async write() {
            window.__fileWriteSteps.push('write');
          },
          async close() {
            window.__fileWriteSteps.push('close');
          }
        };
      }
    });
    window.__uxDebug.savePersonNoteForTest('smoke-root', 'In Datei gespeichert');
  });

  const result = await waitForPersistence(page);
  const snapshot = await page.evaluate(() => ({
    state: window.__uxDebug.getPersistenceState(),
    steps: window.__fileWriteSteps
  }));

  expect(result.state).toBe('saved-file');
  expect(snapshot.steps).toEqual(['create', 'write', 'close']);
  expect(snapshot.state.persistenceState).toBe('saved-file');
  expect(snapshot.state.workingFile).toBe('arbeitsdatei.json');
  await expect(page.locator('#app-storage-status')).toHaveText('In Arbeitsdatei gespeichert');
});

test('schnelle Änderungen werden serialisiert und enden mit der neuesten Revision', async ({ page }) => {
  await openPersistedTree(page);
  const queued = await page.evaluate(() => {
    const revisions = [
      window.__uxDebug.savePersonNoteForTest('smoke-root', 'Version 1'),
      window.__uxDebug.savePersonNoteForTest('smoke-root', 'Version 2'),
      window.__uxDebug.savePersonNoteForTest('smoke-root', 'Version 3')
    ];
    return {
      revisions,
      immediate: window.__uxDebug.getPersistenceState()
    };
  });

  expect(queued.revisions[1]).toBe(queued.revisions[0] + 1);
  expect(queued.revisions[2]).toBe(queued.revisions[1] + 1);
  expect(['dirty', 'saving']).toContain(queued.immediate.persistenceState);

  const result = await waitForPersistence(page);
  const state = await page.evaluate(() => window.__uxDebug.getPersistenceState());
  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), storeKey);

  expect(result.revision).toBe(queued.revisions[2]);
  expect(result.state).toBe('saved-local');
  expect(state.persistenceState).toBe('saved-local');
  expect(state.persistenceRevision).toBe(queued.revisions[2]);
  expect(state.persistenceCompletedRevision).toBe(queued.revisions[2]);
  expect(stored.people[0].note).toBe('Version 3');
  await expect(page.locator('#app-storage-status')).toHaveText('Lokal gespeichert');
});
