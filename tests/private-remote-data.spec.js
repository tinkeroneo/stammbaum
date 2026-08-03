const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

const envelopePath = path.resolve(__dirname, '..', 'private', 'Bodensteiner.enc.json');
const v5EnvelopePath = path.resolve(__dirname, '..', 'private', 'Bodensteiner-v5.enc.json');
const passphrasePath = path.resolve(__dirname, '..', '.private', 'stammbaum-private.passphrase.txt');
const selectionScreenshotPath = path.resolve(__dirname, '..', 'docs', 'private-data-v5-selection.png');
const selectionMobileScreenshotPath = path.resolve(__dirname, '..', 'docs', 'private-data-v5-selection-mobile.png');
const captureSelectionScreenshot = process.env.UPDATE_PRIVATE_DATA_SCREENSHOT === '1';

test('veröffentlichter Privatbestand enthält ausschließlich ein gehärtetes Verschlüsselungsformat', () => {
  for (const file of [envelopePath, v5EnvelopePath]) {
    const raw = fs.readFileSync(file, 'utf8');
    const envelope = JSON.parse(raw);
    expect(envelope).toMatchObject({
      version: 1,
      algorithm: 'AES-256-GCM',
      kdf: 'PBKDF2-SHA-256',
      iterations: 600_000,
      aad: 'stammbaum-private-v1'
    });
    expect(envelope.salt).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(envelope.iv).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(envelope.ciphertext.length).toBeGreaterThan(500_000);
    expect(raw).not.toContain('"people"');
    expect(raw).not.toContain('"born"');
  }
});
test('verborgener Dialog entschlüsselt den realen Privatbestand nur mit lokalem Passwort', async ({ page }) => {
  test.skip(!fs.existsSync(passphrasePath), 'Lokale, bewusst nicht eingecheckte Passwortdatei fehlt.');
  const passphrase = fs.readFileSync(passphrasePath, 'utf8').trim();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto('/?ux-debug=1');
  await page.keyboard.press('Control+Alt+P');
  await expect(page.getByTestId('private-data-dialog')).toBeVisible();
  await page.getByTestId('private-data-passphrase').fill(passphrase);
  await page.getByTestId('private-data-submit').click();

  await expect(page.getByTestId('private-data-dialog')).toBeHidden();
  await expect(page.getByTestId('import-dialog')).toBeVisible();
  await expect(page.locator('#importSummary')).toContainText('385 Personen');
  await page.getByTestId('import-confirm').click();
  await expect.poll(() => page.evaluate(() => window.__uxDebug.getDataSnapshot().people.length)).toBe(385);
  expect(errors).toEqual([]);
});

test('sieben Titel-Taps bieten den bereinigten V5-Familienbuchbestand an', async ({ page }) => {
  test.skip(!fs.existsSync(passphrasePath), 'Lokale, bewusst nicht eingecheckte Passwortdatei fehlt.');
  const passphrase = fs.readFileSync(passphrasePath, 'utf8').trim();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto('/?ux-debug=1');
  await page.evaluate(() => {
    const title = document.getElementById('welcomeTitle');
    for (let tap = 0; tap < 7; tap += 1) title.click();
  });
  await expect(page.getByTestId('private-data-dialog')).toBeVisible();
  await page.getByTestId('private-data-source-v5').check();
  if (captureSelectionScreenshot) {
    await page.screenshot({ path: selectionScreenshotPath });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: selectionMobileScreenshotPath });
  }
  await page.getByTestId('private-data-passphrase').fill(passphrase);
  await page.getByTestId('private-data-submit').click();

  await expect(page.getByTestId('private-data-dialog')).toBeHidden();
  await expect(page.getByTestId('import-dialog')).toBeVisible();
  await expect(page.locator('#importSummary')).toContainText('4.297 Personen');
  await page.getByTestId('import-confirm').click();
  await expect.poll(() => page.evaluate(() => {
    const people = window.__uxDebug.getDataSnapshot().people;
    return {
      people: people.length,
      active: people.filter(person => !person.pool).length,
      pool: people.filter(person => person.pool).length
    };
  }), { timeout: 90_000 }).toEqual({ people: 4297, active: 3257, pool: 1040 });
  expect(errors).toEqual([]);
});
