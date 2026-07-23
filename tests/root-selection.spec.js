const { test, expect } = require('@playwright/test');

const storeKey = 'mobile-family-tree-v5-clean';

function treeWithRoots(rootIds = []) {
  return {
    rootIds,
    people: [
      {
        id: 'root-a',
        name: 'Anna Anfang',
        firstName: 'Anna',
        lastName: 'Anfang',
        born: '1940',
        died: '',
        x: 420,
        y: 180,
        parents: [],
        partner: '',
        partners: []
      },
      {
        id: 'root-b',
        name: 'Berta Baum',
        firstName: 'Berta',
        lastName: 'Baum',
        born: '1965',
        died: '',
        x: 420,
        y: 440,
        parents: ['root-a'],
        partner: '',
        partners: []
      },
      {
        id: 'root-c',
        name: 'Clara Zweig',
        firstName: 'Clara',
        lastName: 'Zweig',
        born: '1990',
        died: '',
        x: 680,
        y: 440,
        parents: ['root-a'],
        partner: '',
        partners: []
      }
    ]
  };
}

async function openSeededTree(page, tree) {
  await page.addInitScript(({ key, value }) => {
    localStorage.setItem(key, JSON.stringify(value));
  }, { key: storeKey, value: tree });
  await page.goto('/');
  await expect(page.getByTestId('welcome-surface')).toBeVisible();
  await page.getByTestId('welcome-continue').click();
}

async function storedTree(page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)), storeKey);
}

async function openManualRootSelection(page) {
  await page.getByTestId('main-nav-more').click();
  await page.getByTestId('root-selection-open').click();
  await expect(page.getByTestId('root-selection-dialog')).toHaveAttribute('aria-hidden', 'false');
}

test('Datensatz ohne Root kann später fortfahren und den temporären Start rückgängig festlegen', async ({ page }) => {
  const original = treeWithRoots([]);
  await openSeededTree(page, original);

  const dialog = page.getByTestId('root-selection-dialog');
  await expect(dialog).toHaveAttribute('aria-hidden', 'false');
  await expect(dialog).toContainText('Beziehungen und Personendaten bleiben unverändert');

  await page.getByTestId('root-selection-later').click();
  await expect(dialog).toHaveAttribute('aria-hidden', 'true');
  await expect(page.getByTestId('person-card-root-a')).toContainText('Temporärer Start');

  const deferred = await storedTree(page);
  expect(deferred.rootIds).toEqual([]);
  expect(deferred.people.map(person => person.parents)).toEqual(original.people.map(person => person.parents));

  await openManualRootSelection(page);
  await page.getByTestId('root-selection-search').fill('Berta');
  await page.getByTestId('root-selection-result-root-b').click();
  await expect(dialog).toHaveAttribute('aria-hidden', 'true');
  await expect(page.getByTestId('person-card-root-a')).not.toContainText('Temporärer Start');
  expect((await storedTree(page)).rootIds).toEqual(['root-b']);

  await openManualRootSelection(page);
  await page.getByTestId('root-selection-search').fill('Clara');
  await page.getByTestId('root-selection-result-root-c').click();
  expect((await storedTree(page)).rootIds).toEqual(['root-c', 'root-b']);

  await openManualRootSelection(page);
  await page.getByTestId('root-selection-search').fill('Anna');
  await page.getByTestId('root-selection-result-root-a').click();
  const changedAgain = await storedTree(page);
  expect(changedAgain.rootIds).toEqual(['root-a', 'root-c']);
  expect(changedAgain.rootIds).toHaveLength(2);
  expect(changedAgain.people.map(person => person.parents)).toEqual(original.people.map(person => person.parents));
});

test('Datensatz mit einem Root öffnet keine automatische Auswahl', async ({ page }) => {
  await openSeededTree(page, treeWithRoots(['root-a']));

  const dialog = page.getByTestId('root-selection-dialog');
  await expect(dialog).toHaveAttribute('aria-hidden', 'true');
  await openManualRootSelection(page);
  await expect(page.getByTestId('root-selection-search')).toBeFocused();
  await page.getByTestId('root-selection-search').press('Escape');
  await expect(dialog).toHaveAttribute('aria-hidden', 'true');
  await expect(page.getByTestId('main-nav-more')).toBeFocused();
  expect((await storedTree(page)).rootIds).toEqual(['root-a']);
});

test('Datensatz mit zwei Roots behält beide und überschreitet das Limit nicht', async ({ page }) => {
  await openSeededTree(page, treeWithRoots(['root-a', 'root-b']));

  await expect(page.getByTestId('root-selection-dialog')).toHaveAttribute('aria-hidden', 'true');
  await openManualRootSelection(page);
  await page.getByTestId('root-selection-search').fill('Clara');
  await page.getByTestId('root-selection-result-root-c').click();

  const changed = await storedTree(page);
  expect(changed.rootIds).toEqual(['root-c', 'root-a']);
  expect(changed.rootIds).toHaveLength(2);
});

test('leerer Datensatz öffnet keine automatische Auswahl', async ({ page }) => {
  await openSeededTree(page, { rootIds: [], people: [] });

  const dialog = page.getByTestId('root-selection-dialog');
  await expect(dialog).toHaveAttribute('aria-hidden', 'true');

  await openManualRootSelection(page);
  await expect(dialog).toContainText('noch keine Person');
  await expect(page.getByTestId('root-selection-search')).toBeDisabled();
  await page.getByTestId('root-selection-later').click();
  await expect(dialog).toHaveAttribute('aria-hidden', 'true');
  expect((await storedTree(page)).rootIds).toEqual([]);
});
