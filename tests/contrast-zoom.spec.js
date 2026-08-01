const { test, expect } = require('@playwright/test');

const storeKey = 'mobile-family-tree-v5-clean';
const helpSeenKey = `${storeKey}-help-seen-v1`;
const tree = {
  rootIds: ['contrast-root'],
  people: [
    {
      id: 'contrast-root',
      name: 'Kontrast Person',
      firstName: 'Kontrast',
      lastName: 'Person',
      born: '1950',
      x: 600,
      y: 500,
      parents: [],
      partners: []
    }
  ]
};

function luminance(hex) {
  const channels = hex.match(/[a-f\d]{2}/gi)
    .map(value => Number.parseInt(value, 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(first, second) {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

async function openTree(page, viewport = { width: 1280, height: 800 }) {
  await page.addInitScript(({ key, value, seenKey }) => {
    localStorage.setItem(key, JSON.stringify(value));
    localStorage.setItem(seenKey, JSON.stringify(['pan-zoom', 'search', 'edit']));
  }, { key: storeKey, value: tree, seenKey: helpSeenKey });
  await page.setViewportSize(viewport);
  await page.goto('/?ux-debug=1');
  await page.getByTestId('welcome-continue').click();
}

test('Text-, Fokus- und Familienfarben erfüllen die dokumentierten AA-Grenzen', async ({ page }) => {
  await openTree(page);
  const tokens = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return {
      surface: style.getPropertyValue('--surface-1').trim(),
      text: style.getPropertyValue('--text').trim(),
      muted: style.getPropertyValue('--text-muted').trim(),
      primary: style.getPropertyValue('--primary').trim(),
      accent: style.getPropertyValue('--accent').trim(),
      danger: style.getPropertyValue('--danger').trim(),
      focus: style.getPropertyValue('--focus').trim(),
      edit: style.getPropertyValue('--accent2').trim()
    };
  });
  expect(contrast(tokens.text, tokens.surface)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(tokens.muted, tokens.surface)).toBeGreaterThanOrEqual(4.5);
  for (const background of [tokens.primary, tokens.accent, tokens.danger, tokens.edit]) {
    expect(contrast('#FFFFFF', background)).toBeGreaterThanOrEqual(4.5);
  }
  expect(contrast(tokens.focus, tokens.surface)).toBeGreaterThanOrEqual(3);

  const familyPalette = [
    '#3f6f4c', '#925438', '#526f9e', '#944c5a', '#705b9a',
    '#397575', '#7b681d', '#586b35', '#8a4b76', '#6a5745'
  ];
  familyPalette.forEach(color => {
    expect(contrast('#FFFFFF', color)).toBeGreaterThanOrEqual(4.5);
  });

  await page.getByTestId('app-mode-toggle').click();
  await expect(page.getByTestId('app-mode-toggle')).toHaveCSS('background-color', 'rgb(138, 79, 50)');
});

test('Kernnavigation und Personenformular bleiben bei 200 Prozent Textzoom erreichbar', async ({ page }) => {
  await openTree(page, { width: 390, height: 844 });
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await expect(page.getByTestId('app-main-nav')).toBeVisible();
  await expect(page.getByTestId('app-main-nav').locator('button')).toHaveCount(4);

  await page.getByTestId('person-search-open').click();
  await page.getByTestId('person-search').fill('Kontrast Person');
  await page.getByTestId('person-search-result-contrast-root').click();
  await page.getByTestId('app-mode-toggle').click();
  await expect(page.getByTestId('person-save')).toBeVisible();
  await expect(page.getByTestId('person-dialog-close')).toBeVisible();
  const overflow = await page.getByTestId('person-dialog').evaluate(element =>
    element.scrollWidth > element.clientWidth + 1
  );
  expect(overflow).toBe(false);
});

test('Suche und Personenansicht bleiben bei 400 Prozent Textzoom bedienbar', async ({ page }) => {
  await openTree(page, { width: 1440, height: 900 });
  await page.evaluate(() => { document.documentElement.style.fontSize = '400%'; });

  await page.getByTestId('person-search-open').click();
  await expect(page.getByTestId('person-search-close')).toBeVisible();
  await page.getByTestId('person-search').fill('Kontrast');
  const result = page.getByTestId('person-search-result-contrast-root');
  await expect(result).toBeVisible();
  await result.click();
  await expect(page.getByTestId('person-dialog-close')).toBeVisible();
  await expect(page.getByTestId('person-edit-open')).toBeVisible();

  const dialog = page.getByTestId('person-dialog');
  await expect.poll(() => dialog.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return rect.left >= 0 && rect.right <= window.innerWidth + 1;
  })).toBe(true);

  const horizontalOverflow = await dialog.evaluate(
    element => element.scrollWidth > element.clientWidth + 1
  );
  expect(horizontalOverflow).toBe(false);
});
