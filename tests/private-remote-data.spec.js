const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

const envelopePath = path.resolve(__dirname, '..', 'private', 'Bodensteiner.enc.json');
const passphrasePath = path.resolve(__dirname, '..', '.private', 'stammbaum-private.passphrase.txt');

test('veröffentlichter Privatbestand enthält ausschließlich ein gehärtetes Verschlüsselungsformat', () => {
  const raw = fs.readFileSync(envelopePath, 'utf8');
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
