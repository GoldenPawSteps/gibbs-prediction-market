import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const USERS_PATH = resolve(process.env.DATA_USERS_PATH || join(__dirname, 'data', 'users.json'));
const MARKET_STATE_PATH = resolve(process.env.DATA_MARKET_STATE_PATH || join(__dirname, 'data', 'marketStates.json'));
const BACKUP_ROOT = resolve(process.env.DATA_BACKUP_ROOT || join(__dirname, 'backups'));
const BACKUP_NAME = process.env.DATA_BACKUP_NAME
  || `backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const BACKUP_DIR = resolve(join(BACKUP_ROOT, BACKUP_NAME));

function ensureSourceExists(path) {
  if (!existsSync(path)) {
    throw new Error(`Data file does not exist: ${path}`);
  }
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function copyWithManifest(sourcePath, targetName) {
  ensureSourceExists(sourcePath);
  const backupPath = join(BACKUP_DIR, targetName);
  copyFileSync(sourcePath, backupPath);

  return {
    fileName: targetName,
    sourcePath,
    backupPath,
    sha256: sha256File(backupPath),
    sizeBytes: statSync(backupPath).size,
  };
}

function main() {
  mkdirSync(BACKUP_DIR, { recursive: true });

  const users = copyWithManifest(USERS_PATH, 'users.json');
  const marketStates = copyWithManifest(MARKET_STATE_PATH, 'marketStates.json');
  const manifest = {
    createdAt: new Date().toISOString(),
    backupDir: BACKUP_DIR,
    files: {
      users,
      marketStates,
    },
  };

  writeFileSync(join(BACKUP_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  console.log(`Backed up data files to ${BACKUP_DIR}`);
  console.log(`Manifest written to ${join(BACKUP_DIR, 'manifest.json')}`);
}

main();
