const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

const publicDemoPath = path.resolve(__dirname, '..', 'Bodensteiner.json');
const publicDemo = JSON.parse(fs.readFileSync(publicDemoPath, 'utf8'));

test('veröffentlichter Standarddatensatz ist ausdrücklich synthetisch und enthält keine vermutlich Lebenden', () => {
  expect(publicDemo.meta).toMatchObject({ datasetType: 'synthetic-demo' });
  expect(publicDemo.people.length).toBeGreaterThan(5);
  for (const person of publicDemo.people) {
    expect(person.id).toMatch(/^demo-/);
    expect(person.note).toContain('Fiktive Demoperson');
    expect(String(person.died || '').trim(), `${person.id} benötigt für die öffentliche Demo ein Sterbedatum`).not.toBe('');
    expect(person.image || '').toBe('');
    expect(person.link || '').toBe('');
    expect(person.mentions || []).toEqual([]);
  }
});

test('App erklärt lokale Verarbeitung und aktiviert den Datenschutzexport standardmäßig', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('welcome-surface')).toBeVisible();
  await expect(page.locator('#welcomePrivacy')).toContainText('nicht an einen Server übertragen');
  await expect(page.locator('#welcomePrivacy')).toContainText('ausschließlich fiktive Personen');

  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("connect-src 'self'");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);

  await page.getByTestId('welcome-demo').click();
  await page.getByTestId('app-file-menu-toggle').click();
  await page.getByTestId('json-export').click();
  await expect(page.getByTestId('export-privacy-enabled')).toBeChecked();
  await expect(page.locator('#exportPrivacyOptions')).toBeEnabled();
});

test('Crawler-Hinweis sperrt die vorläufig private Domain vollständig', async ({ request }) => {
  const response = await request.get('/robots.txt');
  expect(response.ok()).toBe(true);
  expect(await response.text()).toContain('Disallow: /');
});

test('technische Datenschutzseite ist aus der App erreichbar', async ({ page }) => {
  await page.goto('/datenschutz.html');
  await expect(page.getByRole('heading', { name: 'Technische Datenschutzinformationen' })).toBeVisible();
  await expect(page.locator('main')).toContainText('keine Analyse-, Werbe- oder Telemetriedienste');
  await expect(page.locator('main')).toContainText('keine rechtlich vollständige Datenschutzerklärung');
});
