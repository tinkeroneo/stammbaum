const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

test('ES-Modulgraph lädt ohne Browserfehler und startet die App', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/?ux-debug=1');
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
  await expect(page.getByTestId('welcome-surface')).toHaveAttribute('aria-hidden', 'false');
  await expect.poll(() => page.evaluate(() => typeof window.__uxDebug)).toBe('object');
});

test('öffentliche Leaf-Module sind unabhängig importierbar', async ({ page }) => {
  await page.goto('/');
  const exportsByModule = await page.evaluate(async () => {
    const names = ['data-model', 'selectors', 'commands', 'persistence', 'viewport', 'layout', 'galaxy-layout', 'render', 'dialogs', 'app-shell'];
    return Object.fromEntries(await Promise.all(names.map(async name => [
      name,
      Object.keys(await import(`/modules/${name}.js`)).sort()
    ])));
  });
  expect(exportsByModule).toEqual({
    'app-shell': ['startApp'],
    commands: ['cloneCommandValue'],
    'data-model': [
      'classifyPresumedLiving', 'createPrivacyExport', 'normalizeImportedPositions',
      'normalizeTreeData', 'presumedLivingAgeLimit', 'uniqueIds'
    ],
    dialogs: ['dialogFocusableElements', 'dialogFocusableSelector'],
    'galaxy-layout': ['buildGalaxyClusterDetail', 'buildGalaxyConstellation', 'buildGalaxyLayout'],
    layout: ['groupRowsByTolerance'],
    persistence: ['readJsonStorage', 'serializeTree'],
    render: ['escapeHtml', 'reconcileKeyedChildren'],
    selectors: ['buildSearchIndex', 'parseBirthValue'],
    viewport: ['clampViewport']
  });
});

test('Modulgraph ist azyklisch und app.js bleibt reiner Bootstrap', () => {
  const root = path.resolve(__dirname, '..');
  const files = ['app.js', ...fs.readdirSync(path.join(root, 'modules'))
    .filter(name => name.endsWith('.js'))
    .map(name => `modules/${name}`)];
  const graph = new Map(files.map(file => [file, []]));
  const importPattern = /(?:import|export)\s+(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/g;
  files.forEach(file => {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    for (const match of source.matchAll(importPattern)) {
      if (!match[1].startsWith('.')) continue;
      const target = path.relative(root, path.resolve(root, path.dirname(file), match[1])).replaceAll('\\', '/');
      graph.get(file).push(target);
    }
  });
  const cycles = [];
  const visiting = new Set();
  const visited = new Set();
  const visit = (file, trail = []) => {
    if (visiting.has(file)) {
      cycles.push([...trail, file]);
      return;
    }
    if (visited.has(file)) return;
    visiting.add(file);
    (graph.get(file) || []).forEach(target => visit(target, [...trail, file]));
    visiting.delete(file);
    visited.add(file);
  };
  files.forEach(file => visit(file));

  expect(cycles).toEqual([]);
  expect(fs.readFileSync(path.join(root, 'app.js'), 'utf8').split(/\r?\n/).filter(Boolean).length).toBeLessThanOrEqual(4);
  expect(fs.readFileSync(path.join(root, 'index.html'), 'utf8')).toContain('<script type="module" src="app.js"></script>');
});

test('extrahierte Daten-, Selektor- und Viewport-APIs bleiben kompatibel', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const dataModel = await import('/modules/data-model.js');
    const selectors = await import('/modules/selectors.js');
    const commands = await import('/modules/commands.js');
    const persistence = await import('/modules/persistence.js');
    const viewport = await import('/modules/viewport.js');
    const normalized = dataModel.normalizeTreeData({
      rootId: 1,
      people: [{ id: 1, vorname: 'Ada', nachname: 'Lovelace', parents: [], partner: '' }]
    });
    const clone = commands.cloneCommandValue(normalized);
    clone.people[0].firstName = 'Geändert';
    return {
      normalized,
      originalFirstName: normalized.people[0].firstName,
      birth: selectors.parseBirthValue('10.12.1815'),
      serialized: persistence.serializeTree(normalized),
      clamped: viewport.clampViewport(
        { x: 99999, y: -99999, s: 1 },
        { minX: 0, maxX: 1000, minY: 0, maxY: 1000 },
        800,
        600
      )
    };
  });
  expect(result.normalized.rootIds).toEqual(['1']);
  expect(result.normalized.people[0]).toMatchObject({ id: '1', firstName: 'Ada', lastName: 'Lovelace' });
  expect(result.originalFirstName).toBe('Ada');
  expect(result.birth).toMatchObject({ year: 1815, month: 12, day: 10, precision: 'day' });
  expect(JSON.parse(result.serialized)).toEqual(result.normalized);
  expect(Math.abs(result.clamped.x)).toBeLessThan(10000);
  expect(Math.abs(result.clamped.y)).toBeLessThan(10000);
});
