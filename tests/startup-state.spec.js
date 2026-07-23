const { test, expect } = require('@playwright/test');
const smokeTree = require('./fixtures/smoke-tree.cjs');

async function clearBrowserStorage(page) {
  try {
    await page.evaluate(async () => {
      localStorage.clear();
      sessionStorage.clear();
      if (!indexedDB?.databases) return;
      const databases = await indexedDB.databases();
      await Promise.all(databases.filter(database => database.name).map(database => new Promise(resolve => {
        const request = indexedDB.deleteDatabase(database.name);
        request.onsuccess = request.onerror = request.onblocked = () => resolve();
      })));
    });
  } catch (error) {
    if (String(error).includes('Access is denied for this document')) return;
    throw error;
  }
}

test.beforeEach(async ({ page }) => {
  await clearBrowserStorage(page);
});

test('startup state is first-visit when no snapshots are available', async ({ page }) => {
  await page.route('**/Bodensteiner.json', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(smokeTree)
  }));

  await page.goto('/?ux-debug=1');
  await page.reload();

  await expect
    .poll(async () => page.evaluate(() => window.__uxStartupDebug?.getStartupState()))
    .toBe('first-visit');
});

test('startup state is returning-local when a valid local snapshot exists', async ({ page }) => {
  await page.route('**/Bodensteiner.json', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(smokeTree)
  }));

  await page.goto('/?ux-debug=1');
  await page.evaluate((payload) => {
    localStorage.setItem('mobile-family-tree-v5-clean', JSON.stringify(payload));
  }, smokeTree);

  await page.reload();

  await expect
    .poll(async () => page.evaluate(() => window.__uxStartupDebug?.getStartupState()))
    .toBe('returning-local');
});

test('startup state remains first-visit when persistence is blocked at startup', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true });
    Storage.prototype.setItem = () => {
      throw new DOMException('Storage full', 'QuotaExceededError');
    };
  });

  page.on('dialog', dialog => dialog.dismiss().catch(() => {}));

  await page.route('**/Bodensteiner.json', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(smokeTree)
  }));

  await page.goto('/?ux-debug=1');
  await page.reload();

  await expect
    .poll(async () => page.evaluate(() => window.__uxStartupDebug?.getStartupState()))
    .toBe('first-visit');

  await clearBrowserStorage(page);
  await context.close();
});

const decisionCases = [
  { state: 'first-visit', signals: {} },
  { state: 'returning-local', signals: { hasLocalSnapshot: true } },
  { state: 'returning-local', signals: { hasIndexedDbSnapshot: true } },
  { state: 'memory-only', signals: { hasStorageFailure: true } },
  { state: 'demo', signals: { hasDemoData: true } },
  { state: 'working-file', signals: { hasWorkingFile: true } },
  { state: 'working-file', signals: {
    hasWorkingFile: true,
    hasStorageFailure: true,
    hasDemoData: true,
    hasLocalSnapshot: true
  } },
  { state: 'returning-local', signals: {
    hasIndexedDbSnapshot: true,
    hasDemoData: true
  } },
  { state: 'returning-local', signals: {
    hasLocalSnapshot: true,
    hasStorageFailure: true
  } }
];

for (const { state, signals } of decisionCases) {
  const signalKeys = Object.keys(signals).join('+') || 'none';
  test(`startup state decision: ${state} (${signalKeys || 'none'})`, async ({ page }) => {
    await page.goto('/?ux-debug=1');
    await expect(
      page.evaluate((inputs) => window.__uxStartupDebug?.computeStartupStateFromSignals(inputs), signals)
    ).resolves.toBe(state);
  });
}
