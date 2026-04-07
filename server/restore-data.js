import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const USERS_PATH = resolve(process.env.DATA_USERS_PATH || join(__dirname, 'data', 'users.json'));
const MARKET_STATE_PATH = resolve(process.env.DATA_MARKET_STATE_PATH || join(__dirname, 'data', 'marketStates.json'));
const GENERAL_MARKETS_PATH = resolve(process.env.DATA_GENERAL_MARKETS_PATH || join(__dirname, 'data', 'generalMarkets.json'));
const BACKUP_PATH = process.env.DATA_BACKUP_PATH ? resolve(process.env.DATA_BACKUP_PATH) : '';

function sha256Buffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function loadManifest() {
  if (!BACKUP_PATH) {
    throw new Error('DATA_BACKUP_PATH is required for restore.');
  }

  const manifestPath = join(BACKUP_PATH, 'manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`Backup manifest not found: ${manifestPath}`);
  }

  return JSON.parse(readFileSync(manifestPath, 'utf8'));
}

function restoreEntry(entry, targetPath) {
  const sourcePath = join(BACKUP_PATH, entry.fileName);
  if (!existsSync(sourcePath)) {
    throw new Error(`Backup file not found: ${sourcePath}`);
  }

  const contents = readFileSync(sourcePath);
  const actualSha = sha256Buffer(contents);
  if (actualSha !== entry.sha256) {
    throw new Error(`Checksum mismatch for ${sourcePath}`);
  }

  mkdirSync(dirname(targetPath), { recursive: true });
  const tmp = `${targetPath}.${process.pid}.restore.tmp`;
  writeFileSync(tmp, contents);
  renameSync(tmp, targetPath);

  return {
    targetPath,
    sizeBytes: statSync(targetPath).size,
  };
}

function main() {
  const manifest = loadManifest();
  const restoredUsers = restoreEntry(manifest.files.users, USERS_PATH);
  const restoredMarketStates = restoreEntry(manifest.files.marketStates, MARKET_STATE_PATH);
  const restoredGeneralMarkets = restoreEntry(manifest.files.generalMarkets, GENERAL_MARKETS_PATH);

  console.log(`Restored ${restoredUsers.targetPath}`);
  console.log(`Restored ${restoredMarketStates.targetPath}`);
  console.log(`Restored ${restoredGeneralMarkets.targetPath}`);
}

main();
