const { test, expect } = require('@playwright/test');

const storeKey = 'mobile-family-tree-v5-clean';

function buildGridTree(total, spacing = 700) {
  const rootIds = ['person-0'];
  const cols = Math.max(1, Math.ceil(Math.sqrt(total)));

  const people = Array.from({ length: total }, (_, index) => ({
    id: `person-${index}`,
    name: `Person ${index}`,
    firstName: `Person`,
    lastName: String(index),
    born: `${1900 + (index % 80)}`,
    died: '',
    location: 'Berlin',
    partner: '',
    partners: [],
    parents: [],
    x: 300 + (index % cols) * spacing,
    y: 300 + Math.floor(index / cols) * spacing,
    pool: false
  }));

  return { rootIds, people };
}

async function openTree(page, total, viewport) {
  const tree = buildGridTree(total);

  await page.addInitScript(({ key, value }) => {
    localStorage.setItem(key, JSON.stringify(value));
  }, { key: storeKey, value: tree });

  await page.setViewportSize(viewport);
  await page.goto('/?ux-debug=1');

  if (await page.getByTestId('welcome-continue').isVisible().catch(() => false)) {
    await page.getByTestId('welcome-continue').click();
  } else if (await page.getByTestId('welcome-demo').isVisible().catch(() => false)) {
    await page.getByTestId('welcome-demo').click();
  }
}

async function getViewState(page) {
  return page.evaluate(() => {
    return {
      view: window.__uxDebug?.getView?.() || null,
      selectedId: window.__uxDebug?.getSelectedPersonId?.() || null,
      selectedPerson: window.__uxDebug?.getPerson?.(window.__uxDebug?.getSelectedPersonId?.() || 'person-0')
    };
  });
}

const scenarios = [
  { name: 'mobile', viewport: { width: 390, height: 844 } },
  { name: 'desktop', viewport: { width: 1280, height: 800 } }
];

for (const scenario of scenarios) {
  test.describe(`S2-05 Zwei Fit-Befehle - ${scenario.name}`, () => {
    for (const total of [5, 50, 385, 1200]) {
      test(`Liest Lesbar (personenzentriert) und Gesamtansicht bei ${total} Personen`, async ({ page }) => {
        await openTree(page, total, scenario.viewport);

        await page.getByTestId('main-nav-more').click();
        await expect(page.getByTestId('fit-all')).toBeVisible();
        await expect(page.getByTestId('fit-readable')).toBeVisible();

        await page.getByTestId('fit-all').click();
        const all = await getViewState(page);
        expect(all.view?.s).toBeGreaterThan(0);

        await page.getByTestId('fit-readable').click();
        const readable = await getViewState(page);

        expect(readable.view?.s).toBeGreaterThanOrEqual(0.72);
        expect(readable.view?.s).toBeGreaterThan(all.view?.s);

        const fallbackId = readable.selectedId || 'person-0';
        const selected = readable.selectedPerson || readable.view && { id: fallbackId, x: 300, y: 300 };
        expect(selected).toBeTruthy();
        expect(Math.abs(readable.view.x + selected.x * readable.view.s)).toBeLessThan(2);
        expect(Math.abs(readable.view.y + selected.y * readable.view.s)).toBeLessThan(2);
      });
    }
  });
}
