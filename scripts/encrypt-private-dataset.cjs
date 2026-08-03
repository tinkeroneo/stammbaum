const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const aad = Buffer.from('stammbaum-private-v1', 'utf8');
const iterations = 600_000;

function option(name, fallback = '') {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? String(process.argv[index + 1] || '') : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function readInput(inputPath) {
  if (inputPath === '-') return fs.readFileSync(0, 'utf8');
  if (!inputPath) throw new Error('Eingabe fehlt: --input <datei.json> oder --input -');
  return fs.readFileSync(path.resolve(inputPath), 'utf8');
}

function writePrivateFile(filePath, value) {
  const absolute = path.resolve(filePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, value, { encoding: 'utf8', mode: 0o600 });
  return absolute;
}

function main() {
  const inputPath = option('input');
  const outputPath = option('output', 'private/Bodensteiner.enc.json');
  const passphraseFile = option('passphrase-file');
  const reusePassphrase = hasFlag('reuse-passphrase');
  if (!passphraseFile) throw new Error('Passwortdatei fehlt: --passphrase-file <lokaler-pfad>');

  const plaintext = readInput(inputPath);
  const parsed = JSON.parse(plaintext);
  if (!parsed || !Array.isArray(parsed.people)) throw new Error('Eingabe ist kein Stammbaum-JSON.');

  const absolutePassphraseFile = path.resolve(passphraseFile);
  const passphrase = reusePassphrase
    ? fs.readFileSync(absolutePassphraseFile, 'utf8').trim()
    : crypto.randomBytes(32).toString('base64url');
  if (!passphrase) throw new Error('Passwortdatei ist leer.');
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(passphrase, salt, iterations, 32, 'sha256');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(plaintext, 'utf8')),
    cipher.final(),
    cipher.getAuthTag()
  ]);

  const envelope = {
    version: 1,
    algorithm: 'AES-256-GCM',
    kdf: 'PBKDF2-SHA-256',
    iterations,
    aad: aad.toString('utf8'),
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    ciphertext: ciphertext.toString('base64')
  };
  const output = writePrivateFile(outputPath, `${JSON.stringify(envelope)}\n`);
  const password = reusePassphrase
    ? absolutePassphraseFile
    : writePrivateFile(passphraseFile, `${passphrase}\n`);
  process.stdout.write(JSON.stringify({
    output,
    passphraseFile: password,
    people: parsed.people.length,
    encryptedBytes: ciphertext.length,
    iterations,
    reusedPassphrase: reusePassphrase
  }, null, 2));
}

main();
