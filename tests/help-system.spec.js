const { test, expect } = require('@playwright/test');

const storeKey = 'mobile-family-tree-v5-clean';
const helpSeenKey = `${storeKey}-help-seen-v1`;

const tree = {
  rootIds: ['help-person'],
  people: [
    {
      id: 'help-person',
      name: 'Hilfe Person',
      firstName: 'Hilfe',
      lastName: 'Person',
      x: 900,
      y: 700,
      parents: [],
      partners: []
    }
  ]
};

async function openTree(page, viewport = { width: 1280, height: 800 }) {
  await page.addInitScript(({ key, value }) => {
    localStorage.setItem(key, JSON.stringify(value));
  }, { key: storeKey, value: tree });
  await page.setViewportSize(viewport);
  await page.goto('/?ux-debug=1');
  if (await page.getByTestId('welcome-continue').isVisible().catch(() => false)) {
    await page.getByTestId('welcome-continue').click();
  }
}

test('drei Hinweise verschwinden nur bewusst und bleiben pro Version gespeichert', async ({ page }) => {
  await openTree(page);
  const hint = page.getByTestId('app-inline-hint');
  const dismiss = page.getByTestId('help-hint-dismiss');

  await expect(hint).toBeVisible();
  await expect(hint).toHaveAttribute('data-help-tip', 'pan-zoom');
  await expect(hint).toContainText('Baum bewegen und zoomen');

  await page.waitForTimeout(8500);
  await expect(hint).toBeVisible();

  await dismiss.click();
  await expect(hint).toHaveAttribute('data-help-tip', 'search');
  await expect(hint).toContainText('Person schnell finden');
  await dismiss.click();
  await expect(hint).toHaveAttribute('data-help-tip', 'edit');
  await expect(hint).toContainText('Ansehen und Bearbeiten');
  await dismiss.click();
  await expect(hint).toBeHidden();

  const seen = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), helpSeenKey);
  expect(seen).toEqual(['pan-zoom', 'search', 'edit']);

  await page.reload();
  await page.getByTestId('welcome-continue').click();
  await page.waitForTimeout(300);
  await expect(hint).toBeHidden();
});

test('Mehr öffnet alle Bedienhinweise erneut und gibt den Fokus zurück', async ({ page }) => {
  await page.addInitScript(({ key, value, seenKey }) => {
    localStorage.setItem(key, JSON.stringify(value));
    localStorage.setItem(seenKey, JSON.stringify(['pan-zoom', 'search', 'edit']));
  }, { key: storeKey, value: tree, seenKey: helpSeenKey });
  await page.goto('/?ux-debug=1');
  await page.getByTestId('welcome-continue').click();

  const more = page.getByTestId('main-nav-more');
  await more.click();
  await page.getByTestId('help-open').click();

  const hint = page.getByTestId('app-inline-hint');
  const dismiss = page.getByTestId('help-hint-dismiss');
  await expect(hint).toHaveAttribute('data-help-tip', 'pan-zoom');
  await expect(dismiss).toBeFocused();
  await expect(dismiss).toHaveAttribute('aria-label', /Hinweis .* schließen/);

  await dismiss.click();
  await dismiss.click();
  await dismiss.click();
  await expect(hint).toBeHidden();
  await expect(more).toBeFocused();
});

test('Hinweis und Schließen-Ziel bleiben bei 320 px oberhalb der Hauptnavigation', async ({ page }) => {
  await openTree(page, { width: 320, height: 844 });
  const hint = page.getByTestId('app-inline-hint');
  await expect(hint).toBeVisible();

  const geometry = await page.evaluate(() => {
    const hintRect = document.querySelector('#helpHint').getBoundingClientRect();
    const navRect = document.querySelector('.toolbar').getBoundingClientRect();
    const closeRect = document.querySelector('#helpHintClose').getBoundingClientRect();
    return {
      noNavigationOverlap: hintRect.bottom <= navRect.top,
      insideViewport: hintRect.left >= 0 && hintRect.right <= window.innerWidth,
      closeWidth: closeRect.width,
      closeHeight: closeRect.height
    };
  });
  expect(geometry.noNavigationOverlap).toBe(true);
  expect(geometry.insideViewport).toBe(true);
  expect(geometry.closeWidth).toBeGreaterThanOrEqual(44);
  expect(geometry.closeHeight).toBeGreaterThanOrEqual(44);
});
