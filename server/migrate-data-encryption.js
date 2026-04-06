import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const USERS_PATH = process.env.DATA_USERS_PATH || join(__dirname, 'data', 'users.json');
const MARKET_STATE_PATH = process.env.DATA_MARKET_STATE_PATH || join(__dirname, 'data', 'marketStates.json');
const DATA_ENCRYPTION_KEY_RAW = process.env.DATA_ENCRYPTION_KEY || '';
const DATA_ENCRYPTION_PREVIOUS_KEY_RAW = process.env.DATA_ENCRYPTION_PREVIOUS_KEY || '';

function resolveHexKey(rawValue, envName, required = false) {
  if (!rawValue) {
    if (required) {
      throw new Error(`${envName} is required for migration.`);
    }
    return null;
  }
  if (!/^[0-9a-fA-F]{64}$/.test(rawValue)) {
    throw new Error(`${envName} must be 64 hex characters (32 bytes).`);
  }
  return Buffer.from(rawValue, 'hex');
}

const DATA_ENCRYPTION_KEY = resolveHexKey(DATA_ENCRYPTION_KEY_RAW, 'DATA_ENCRYPTION_KEY', true);
const DATA_ENCRYPTION_PREVIOUS_KEY = resolveHexKey(
  DATA_ENCRYPTION_PREVIOUS_KEY_RAW,
  'DATA_ENCRYPTION_PREVIOUS_KEY'
);

function decryptJsonValue(rawText) {
  const parsed = JSON.parse(rawText);
  if (!parsed?.__encrypted) {
    return parsed;
  }

  if (parsed.version !== 1 || parsed.alg !== 'aes-256-gcm') {
    throw new Error('Unsupported encrypted data file format.');
  }

  const candidateKeys = [DATA_ENCRYPTION_KEY, DATA_ENCRYPTION_PREVIOUS_KEY].filter(Boolean);
  for (const key of candidateKeys) {
    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        key,
        Buffer.from(parsed.iv, 'base64')
      );
      decipher.setAuthTag(Buffer.from(parsed.tag, 'base64'));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(parsed.data, 'base64')),
        decipher.final(),
      ]).toString('utf8');

      return JSON.parse(plaintext);
    } catch {
      // Try the next configured key.
    }
  }

  throw new Error('Encrypted data file could not be decrypted with the configured key set.');
}

function encryptJsonValue(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', DATA_ENCRYPTION_KEY, iv);
  const plaintext = JSON.stringify(value);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return JSON.stringify({
    __encrypted: true,
    version: 1,
    alg: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: ciphertext.toString('base64'),
  }, null, 2);
}

function ensureFile(path) {
  if (!existsSync(path)) {
    writeFileSync(path, '{}', 'utf8');
  }
}

function rewriteEncrypted(path) {
  ensureFile(path);
  const current = decryptJsonValue(readFileSync(path, 'utf8'));
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, encryptJsonValue(current), 'utf8');
  renameSync(tmp, path);
}

function main() {
  rewriteEncrypted(USERS_PATH);
  rewriteEncrypted(MARKET_STATE_PATH);
  console.log(`Encrypted ${USERS_PATH}`);
  console.log(`Encrypted ${MARKET_STATE_PATH}`);
}

main();