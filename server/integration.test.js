import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = join(__dirname, '..');
const SERVER_ENTRY = join(__dirname, 'index.js');
const BACKUP_ENTRY = join(__dirname, 'backup-data.js');
const RESTORE_ENTRY = join(__dirname, 'restore-data.js');
const ALLOWED_ORIGIN = 'http://localhost:5173';
const VALID_DATA_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

let nextPort = 4600;

async function makeTempJsonFile(dir, name, value = {}) {
  const path = join(dir, name);
  await writeFile(path, JSON.stringify(value, null, 2), 'utf8');
  return path;
}

function hashFileContents(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

async function loadJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function waitForServer(baseUrl, child, logs) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited early with code ${child.exitCode}\n${logs.stdout}\n${logs.stderr}`);
    }

    try {
      const response = await globalThis.fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // Keep polling until the server is ready.
    }

    await delay(100);
  }

  throw new Error(`Server did not become ready in time\n${logs.stdout}\n${logs.stderr}`);
}

async function startServer(extraEnv = {}, initialUsers = {}, initialMarketStates = {}) {
  const tempDir = await mkdtemp(join(tmpdir(), 'gibbs-server-test-'));
  const usersPath = await makeTempJsonFile(tempDir, 'users.json', initialUsers);
  const marketStatesPath = await makeTempJsonFile(tempDir, 'marketStates.json', initialMarketStates);
  const port = nextPort;
  nextPort += 1;
  const logs = { stdout: '', stderr: '' };

  const child = spawn('node', [SERVER_ENTRY], {
    cwd: WORKSPACE_ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      JWT_SECRET: 'test-jwt-secret',
      REFRESH_TOKEN_SECRET: 'test-refresh-secret',
      ALLOWED_ORIGIN,
      TRUST_PROXY: '0',
      DATA_USERS_PATH: usersPath,
      DATA_MARKET_STATE_PATH: marketStatesPath,
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', chunk => {
    logs.stdout += chunk.toString();
  });
  child.stderr.on('data', chunk => {
    logs.stderr += chunk.toString();
  });

  const baseUrl = `http://localhost:${port}`;
  await waitForServer(baseUrl, child, logs);

  return {
    baseUrl,
    usersPath,
    marketStatesPath,
    logs,
    async stop() {
      if (child.exitCode === null) {
        child.kill('SIGTERM');
        await delay(50);
        if (child.exitCode === null) {
          child.kill('SIGKILL');
        }
      }
      await rm(tempDir, { recursive: true, force: true });
    },
  };
}

async function requestJson(baseUrl, path, { method = 'GET', body, origin, cookie } = {}) {
  const headers = new globalThis.Headers();
  if (body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  if (origin) {
    headers.set('Origin', origin);
  }
  if (cookie) {
    headers.set('Cookie', cookie);
  }

  const response = await globalThis.fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let json = null;
  const text = await response.text();
  if (text) {
    json = JSON.parse(text);
  }

  return { response, json, text };
}

function extractCookieHeader(response) {
  return response.headers.getSetCookie().map(cookie => cookie.split(';', 1)[0]).join('; ');
}

async function runNodeScript(entryPath, env = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('node', [entryPath], {
      cwd: WORKSPACE_ROOT,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', code => {
      resolvePromise({ code, stdout, stderr });
    });
  });
}

test('server integration coverage', async t => {
  await t.test('register, verify fixture, login, and persist market state', async () => {
    const ctx = await startServer();

    try {
      const email = 'alice@example.com';
      const password = 'password123';
      const registerResult = await requestJson(ctx.baseUrl, '/api/auth/register', {
        method: 'POST',
        origin: ALLOWED_ORIGIN,
        body: { name: 'Alice', email, password },
      });

      assert.equal(registerResult.response.status, 201);
      assert.equal(registerResult.json.requiresEmailVerification, true);

      const users = await loadJson(ctx.usersPath);
      users[email].emailVerified = true;
      users[email].emailVerificationTokenHash = null;
      users[email].emailVerificationExpiresAt = null;
      await writeFile(ctx.usersPath, JSON.stringify(users, null, 2), 'utf8');

      const loginResult = await requestJson(ctx.baseUrl, '/api/auth/login', {
        method: 'POST',
        origin: ALLOWED_ORIGIN,
        body: { email, password },
      });

      assert.equal(loginResult.response.status, 200);
      const cookie = extractCookieHeader(loginResult.response);
      assert.match(cookie, /gibbs_access=/);

      const meResult = await requestJson(ctx.baseUrl, '/api/auth/me', { cookie });
      assert.equal(meResult.response.status, 200);
      assert.equal(meResult.json.user.email, email);

      const statePayload = {
        beta: 0.5,
        outcomes: ['YES', 'NO'],
        priors: [0.5, 0.5],
        qs: [1, 1],
        deltaQs: [0, 0],
      };
      const putState = await requestJson(ctx.baseUrl, '/api/market-state', {
        method: 'PUT',
        origin: ALLOWED_ORIGIN,
        cookie,
        body: { state: statePayload },
      });

      assert.equal(putState.response.status, 200);
      const getState = await requestJson(ctx.baseUrl, '/api/market-state', { cookie });
      assert.equal(getState.response.status, 200);
      assert.equal(getState.json.state.beta, statePayload.beta);
      assert.deepEqual(getState.json.state.outcomes, statePayload.outcomes);
    } finally {
      await ctx.stop();
    }
  });

  await t.test('csrf blocks untrusted origins on unsafe methods', async () => {
    const ctx = await startServer();

    try {
      const result = await requestJson(ctx.baseUrl, '/api/auth/login', {
        method: 'POST',
        origin: 'https://evil.example',
        body: { email: 'a@example.com', password: 'password123' },
      });

      assert.equal(result.response.status, 403);
      assert.equal(result.json.error, 'Cross-site request blocked.');
    } finally {
      await ctx.stop();
    }
  });

  await t.test('per-account lockout triggers after repeated bad passwords', async () => {
    const email = 'locked@example.com';
    const passwordHash = await bcrypt.hash('correct-password', 6);
    const ctx = await startServer(
      { LOGIN_MAX_ATTEMPTS: '2', LOGIN_LOCKOUT_SECONDS: '60' },
      {
        [email]: {
          id: 'u_lock',
          name: 'Locked User',
          email,
          passwordHash,
          emailVerified: true,
          emailVerificationTokenHash: null,
          emailVerificationExpiresAt: null,
          passwordResetTokenHash: null,
          passwordResetExpiresAt: null,
          refreshTokenHash: null,
          refreshTokenId: null,
          loginFailedAttempts: 0,
          loginLockoutUntil: null,
          createdAt: new Date().toISOString(),
        },
      }
    );

    try {
      const first = await requestJson(ctx.baseUrl, '/api/auth/login', {
        method: 'POST',
        origin: ALLOWED_ORIGIN,
        body: { email, password: 'wrong-password' },
      });
      const second = await requestJson(ctx.baseUrl, '/api/auth/login', {
        method: 'POST',
        origin: ALLOWED_ORIGIN,
        body: { email, password: 'wrong-password' },
      });
      const third = await requestJson(ctx.baseUrl, '/api/auth/login', {
        method: 'POST',
        origin: ALLOWED_ORIGIN,
        body: { email, password: 'wrong-password' },
      });

      assert.equal(first.response.status, 401);
      assert.equal(second.response.status, 401);
      assert.equal(third.response.status, 429);
      assert.ok(Number(third.response.headers.get('retry-after')) > 0);
    } finally {
      await ctx.stop();
    }
  });

  await t.test('data health reports migration pending when encryption key is set on plaintext files', async () => {
    const ctx = await startServer({ DATA_ENCRYPTION_KEY: VALID_DATA_KEY });

    try {
      const result = await requestJson(ctx.baseUrl, '/api/health/data');
      assert.equal(result.response.status, 200);
      assert.equal(result.json.enabled, true);
      assert.equal(result.json.usersEncrypted, false);
      assert.equal(result.json.marketStateEncrypted, false);
      assert.equal(result.json.migrationPending, true);
      assert.match(`${ctx.logs.stdout}${ctx.logs.stderr}`, /data files are still plaintext/);
    } finally {
      await ctx.stop();
    }
  });

  await t.test('backup and restore scripts preserve file integrity', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'gibbs-data-ops-test-'));
    const backupRoot = await mkdtemp(join(tmpdir(), 'gibbs-data-backup-'));

    try {
      const usersPath = await makeTempJsonFile(tempDir, 'users.json', {
        alice: { id: 'u1', balance: 10 },
      });
      const marketStatesPath = await makeTempJsonFile(tempDir, 'marketStates.json', {
        u1: { beta: 0.5 },
      });

      const backupResult = await runNodeScript(BACKUP_ENTRY, {
        DATA_USERS_PATH: usersPath,
        DATA_MARKET_STATE_PATH: marketStatesPath,
        DATA_BACKUP_ROOT: backupRoot,
        DATA_BACKUP_NAME: 'test-backup',
      });
      assert.equal(backupResult.code, 0, backupResult.stderr);

      const backupDir = join(backupRoot, 'test-backup');
      assert.equal(existsSync(join(backupDir, 'manifest.json')), true);

      await writeFile(usersPath, '{"broken":true}\n', 'utf8');
      await writeFile(marketStatesPath, '{"broken":true}\n', 'utf8');

      const restoreResult = await runNodeScript(RESTORE_ENTRY, {
        DATA_USERS_PATH: usersPath,
        DATA_MARKET_STATE_PATH: marketStatesPath,
        DATA_BACKUP_PATH: backupDir,
      });
      assert.equal(restoreResult.code, 0, restoreResult.stderr);

      const usersRestored = await readFile(usersPath);
      const usersBackup = await readFile(join(backupDir, 'users.json'));
      const marketRestored = await readFile(marketStatesPath);
      const marketBackup = await readFile(join(backupDir, 'marketStates.json'));

      assert.equal(hashFileContents(usersRestored), hashFileContents(usersBackup));
      assert.equal(hashFileContents(marketRestored), hashFileContents(marketBackup));
    } finally {
      await rm(tempDir, { recursive: true, force: true });
      await rm(backupRoot, { recursive: true, force: true });
    }
  });
});
