import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { Parser } from 'expr-eval';
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const USERS_PATH = process.env.DATA_USERS_PATH || join(__dirname, 'data', 'users.json');
const MARKET_STATE_PATH = process.env.DATA_MARKET_STATE_PATH || join(__dirname, 'data', 'marketStates.json');
const MARKETS_PATH = process.env.DATA_MARKETS_PATH || join(__dirname, 'data', 'markets.json');
const GENERAL_MARKETS_PATH = process.env.DATA_GENERAL_MARKETS_PATH || join(__dirname, 'data', 'generalMarkets.json');

const PORT = Number(process.env.PORT || 4000);
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const ACCESS_COOKIE = 'gibbs_access';
const REFRESH_COOKIE = 'gibbs_refresh';
const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60;
const EMAIL_VERIFY_TTL_SECONDS = 24 * 60 * 60;
const PASSWORD_RESET_TTL_SECONDS = 60 * 60;
const LOGIN_MAX_ATTEMPTS = Number(process.env.LOGIN_MAX_ATTEMPTS || 5);
const LOGIN_LOCKOUT_SECONDS = Number(process.env.LOGIN_LOCKOUT_SECONDS || 15 * 60);
const INITIAL_BALANCE = Number(process.env.INITIAL_BALANCE || 1000);
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:5173';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:5173';
const CSRF_ALLOW_MISSING_ORIGIN = String(process.env.CSRF_ALLOW_MISSING_ORIGIN || 'false') === 'true';
const DATA_ENCRYPTION_KEY_RAW = process.env.DATA_ENCRYPTION_KEY || '';
const DATA_ENCRYPTION_PREVIOUS_KEY_RAW = process.env.DATA_ENCRYPTION_PREVIOUS_KEY || '';
const SMTP_PROVIDER = String(process.env.SMTP_PROVIDER || 'custom').toLowerCase();
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = String(process.env.SMTP_SECURE || 'false') === 'true';
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const EMAIL_FROM = process.env.EMAIL_FROM || '';
const REQUIRE_SMTP = String(process.env.REQUIRE_SMTP || 'false') === 'true';

const SMTP_PROVIDER_PRESETS = {
  resend: { host: 'smtp.resend.com', port: 465, secure: true },
  sendgrid: { host: 'smtp.sendgrid.net', port: 587, secure: false },
  postmark: { host: 'smtp.postmarkapp.com', port: 587, secure: false },
  mailgun: { host: 'smtp.mailgun.org', port: 587, secure: false },
};

function resolveOptionalHexKey(rawValue, envName) {
  if (!rawValue) {
    return { key: null, error: null };
  }
  if (!/^[0-9a-fA-F]{64}$/.test(rawValue)) {
    return {
      key: null,
      error: `${envName} must be 64 hex characters (32 bytes).`,
    };
  }
  return {
    key: Buffer.from(rawValue, 'hex'),
    error: null,
  };
}

function resolveSmtpSettings() {
  const preset = SMTP_PROVIDER_PRESETS[SMTP_PROVIDER] || null;

  return {
    provider: SMTP_PROVIDER,
    host: SMTP_HOST || preset?.host || '',
    port: SMTP_PORT || preset?.port || 587,
    secure: String(process.env.SMTP_SECURE || '')
      ? SMTP_SECURE
      : (preset?.secure || false),
    user: SMTP_USER,
    pass: SMTP_PASS,
    from: EMAIL_FROM,
  };
}

const SMTP_SETTINGS = resolveSmtpSettings();
const DATA_ENCRYPTION = resolveOptionalHexKey(DATA_ENCRYPTION_KEY_RAW, 'DATA_ENCRYPTION_KEY');
const DATA_ENCRYPTION_PREVIOUS = resolveOptionalHexKey(
  DATA_ENCRYPTION_PREVIOUS_KEY_RAW,
  'DATA_ENCRYPTION_PREVIOUS_KEY'
);
const dataEncryptionHealth = {
  enabled: Boolean(DATA_ENCRYPTION.key),
  previousKeyConfigured: Boolean(DATA_ENCRYPTION_PREVIOUS.key),
  usersEncrypted: false,
  marketStateEncrypted: false,
  migrationPending: false,
  checkedAt: null,
  error: null,
};

function encryptJsonValue(value) {
  if (!DATA_ENCRYPTION.key) {
    return JSON.stringify(value, null, 2);
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', DATA_ENCRYPTION.key, iv);
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

function decryptJsonValue(rawText) {
  const parsed = JSON.parse(rawText);
  if (!parsed?.__encrypted) {
    return parsed;
  }

  const candidateKeys = [DATA_ENCRYPTION.key, DATA_ENCRYPTION_PREVIOUS.key].filter(Boolean);
  if (candidateKeys.length === 0) {
    throw new Error('DATA_ENCRYPTION_KEY is required to read encrypted data files.');
  }

  if (parsed.version !== 1 || parsed.alg !== 'aes-256-gcm') {
    throw new Error('Unsupported encrypted data file format.');
  }

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

function ensureJsonFile(path) {
  if (!existsSync(path)) {
    writeFileSync(path, encryptJsonValue({}), 'utf8');
  }
}

function readJson(path) {
  ensureJsonFile(path);
  try {
    return decryptJsonValue(readFileSync(path, 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) {
      return {};
    }
    throw error;
  }
}

function canDecryptJson(path) {
  ensureJsonFile(path);
  readJson(path);
  return true;
}

function getJsonFileEncryptionState(path) {
  ensureJsonFile(path);
  const rawText = readFileSync(path, 'utf8');
  const parsed = JSON.parse(rawText);
  return Boolean(parsed?.__encrypted);
}

function refreshDataEncryptionHealth() {
  dataEncryptionHealth.checkedAt = new Date().toISOString();

  try {
    dataEncryptionHealth.usersEncrypted = getJsonFileEncryptionState(USERS_PATH);
    dataEncryptionHealth.marketStateEncrypted = getJsonFileEncryptionState(MARKET_STATE_PATH);
    dataEncryptionHealth.migrationPending = dataEncryptionHealth.enabled
      && (!dataEncryptionHealth.usersEncrypted || !dataEncryptionHealth.marketStateEncrypted);
    dataEncryptionHealth.error = null;
  } catch (error) {
    dataEncryptionHealth.error = error instanceof Error ? error.message : 'Unknown data encryption error.';
  }

  return dataEncryptionHealth;
}

function writeJson(path, value) {
  // Write to a sibling tmp file then atomically rename — readers never see a partial file.
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, encryptJsonValue(value), 'utf8');
  renameSync(tmp, path);
}

// Per-path async mutex. Serialises all read-modify-write operations on the same
// file so concurrent requests cannot produce conflicting writes.
const _fileLocks = new Map();

function withFileLock(path, fn) {
  const prior = _fileLocks.get(path) ?? Promise.resolve();
  const next = prior.then(fn);
  // Store a silently-resolved chain so a failed operation does not block later callers.
  _fileLocks.set(path, next.then(() => {}, () => {}));
  return next;
}

function hashOneTimeToken(token) {
  return createHash('sha256').update(`${token}:${JWT_SECRET}`).digest('hex');
}

function generateOneTimeToken() {
  const token = randomBytes(32).toString('hex');
  return {
    token,
    tokenHash: hashOneTimeToken(token),
  };
}

function isEmailConfigured() {
  return Boolean(
    SMTP_SETTINGS.host
    && SMTP_SETTINGS.port
    && SMTP_SETTINGS.user
    && SMTP_SETTINGS.pass
    && SMTP_SETTINGS.from
  );
}

function makeTransport() {
  if (!isEmailConfigured()) return null;

  return nodemailer.createTransport({
    host: SMTP_SETTINGS.host,
    port: SMTP_SETTINGS.port,
    secure: SMTP_SETTINGS.secure,
    auth: {
      user: SMTP_SETTINGS.user,
      pass: SMTP_SETTINGS.pass,
    },
  });
}

const mailTransport = makeTransport();
const emailHealth = {
  configured: isEmailConfigured(),
  provider: SMTP_SETTINGS.provider,
  checkedAt: null,
  ok: false,
  error: null,
};

async function runEmailSelfTest() {
  emailHealth.checkedAt = new Date().toISOString();

  if (!mailTransport) {
    emailHealth.ok = false;
    emailHealth.error = 'SMTP is not fully configured.';
    return;
  }

  try {
    await mailTransport.verify();
    emailHealth.ok = true;
    emailHealth.error = null;
  } catch (error) {
    emailHealth.ok = false;
    emailHealth.error = error instanceof Error ? error.message : 'Unknown SMTP error.';
  }
}

async function sendEmail({ to, subject, text, html }) {
  if (!mailTransport) {
    return false;
  }

  await mailTransport.sendMail({
    from: SMTP_SETTINGS.from,
    to,
    subject,
    text,
    html,
  });
  return true;
}

function buildVerifyEmailContent(email, token) {
  const verifyUrl = `${APP_BASE_URL}/login?mode=verify&email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;
  return {
    subject: 'Verify your Gibbs Prediction Market account',
    text: `Verify your account with this token: ${token}\n\nOr open: ${verifyUrl}`,
    html: `<p>Verify your account with this token:</p><p><strong>${token}</strong></p><p>Or open this link: <a href="${verifyUrl}">${verifyUrl}</a></p>`,
  };
}

function buildResetEmailContent(email, token) {
  const resetUrl = `${APP_BASE_URL}/login?mode=reset&email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;
  return {
    subject: 'Reset your Gibbs Prediction Market password',
    text: `Use this reset token: ${token}\n\nOr open: ${resetUrl}`,
    html: `<p>Use this reset token:</p><p><strong>${token}</strong></p><p>Or open this link: <a href="${resetUrl}">${resetUrl}</a></p>`,
  };
}

// --- Market math (server-side, mirrors src/math/marketMath.js) ---
function _logSumExpWeighted(qs, priors, beta) {
  const xs = qs.map((q, i) => Math.log(priors[i]) + q / beta);
  const maxX = Math.max(...xs);
  const sumExp = xs.reduce((acc, x) => acc + Math.exp(x - maxX), 0);
  return maxX + Math.log(sumExp);
}
function _computeCost(qs, priors, beta) {
  return beta * _logSumExpWeighted(qs, priors, beta);
}
function _computePrices(qs, priors, beta) {
  const logZ = _logSumExpWeighted(qs, priors, beta);
  return qs.map((q, i) => Math.exp(Math.log(priors[i]) + q / beta - logZ));
}
function _computeTradeCost(qs, deltaQs, priors, beta) {
  const newQs = qs.map((q, i) => q + (deltaQs[i] || 0));
  return _computeCost(newQs, priors, beta) - _computeCost(qs, priors, beta);
}

function _normalizePositiveWeights(weights, label) {
  if (!Array.isArray(weights) || weights.length < 2 || weights.length > 512) {
    throw new Error(`${label} must be an array with length 2..512.`);
  }
  if (!weights.every(w => typeof w === 'number' && Number.isFinite(w) && w > 0)) {
    throw new Error(`${label} must contain positive finite numbers.`);
  }
  const total = weights.reduce((a, b) => a + b, 0);
  return weights.map(w => w / total);
}

function _logSumExpGeneral(qValues, baseWeights, beta) {
  const xs = qValues.map((q, i) => Math.log(baseWeights[i]) + q / beta);
  const maxX = Math.max(...xs);
  const sumExp = xs.reduce((acc, x) => acc + Math.exp(x - maxX), 0);
  return maxX + Math.log(sumExp);
}

function _computeGeneralCost(qValues, baseWeights, beta) {
  return beta * _logSumExpGeneral(qValues, baseWeights, beta);
}

function _computeGeneralTradeCost(cumulativeQ, tradeQ, baseWeights, beta) {
  const nextQ = cumulativeQ.map((q, i) => q + tradeQ[i]);
  return _computeGeneralCost(nextQ, baseWeights, beta) - _computeGeneralCost(cumulativeQ, baseWeights, beta);
}

function _computeGeneralImpliedMeasure(qValues, baseWeights, beta) {
  const logZ = _logSumExpGeneral(qValues, baseWeights, beta);
  return qValues.map((q, i) => Math.exp(Math.log(baseWeights[i]) + q / beta - logZ));
}

function _dotProduct(xs, ys) {
  return xs.reduce((acc, x, i) => acc + x * ys[i], 0);
}

function _evaluateTradeFunction(expression, sampleSpace) {
  if (typeof expression !== 'string' || !expression.trim()) {
    throw new Error('qExpr must be a non-empty expression string.');
  }

  const parser = new Parser({
    operators: {
      logical: false,
      comparison: false,
      in: false,
      assignment: false,
    },
  });
  let compiled;
  try {
    compiled = parser.parse(expression);
  } catch {
    throw new Error('qExpr could not be parsed.');
  }

  return sampleSpace.map((omega, idx) => {
    const scope = { omega };
    if (typeof omega === 'number' && Number.isFinite(omega)) {
      scope.x = omega;
    }
    if (omega && typeof omega === 'object' && !Array.isArray(omega)) {
      for (const [key, value] of Object.entries(omega)) {
        if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)
          && typeof value === 'number'
          && Number.isFinite(value)
        ) {
          scope[key] = value;
        }
      }
    }

    let value;
    try {
      value = compiled.evaluate(scope);
    } catch {
      throw new Error(`qExpr evaluation failed at sample index ${idx}.`);
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`qExpr produced a non-finite value at sample index ${idx}.`);
    }
    return value;
  });
}

function sanitizeUser(userRecord) {
  return {
    id: userRecord.id,
    name: userRecord.name,
    email: userRecord.email,
    balance: userRecord.balance ?? INITIAL_BALANCE,
    createdAt: userRecord.createdAt,
  };
}

function sanitizeMarket(m) {
  // Strip emails from position entries before sending to client
  const positions = Object.fromEntries(
    Object.entries(m.positions || {}).map(([uid, pos]) => [uid, { qs: pos.qs }])
  );
  return {
    id: m.id,
    creatorId: m.creatorId,
    creatorName: m.creatorName,
    question: m.question,
    outcomes: m.outcomes,
    priors: m.priors,
    beta: m.beta,
    qs: m.qs,
    subsidyPaid: m.subsidyPaid,
    status: m.status,
    resolvedOutcomeIdx: m.resolvedOutcomeIdx,
    createdAt: m.createdAt,
    resolvedAt: m.resolvedAt,
    traderCount: Object.keys(m.positions || {}).length,
    positions,
  };
}

function sanitizeGeneralMarket(m) {
  const positions = Object.fromEntries(
    Object.entries(m.positions || {}).map(([uid, pos]) => [uid, { qValues: pos.qValues }])
  );
  return {
    id: m.id,
    creatorId: m.creatorId,
    creatorName: m.creatorName,
    question: m.question,
    beta: m.beta,
    sampleSpace: m.sampleSpace,
    baseMeasureWeights: m.baseMeasureWeights,
    cumulativeQ: m.cumulativeQ,
    currentCost: m.currentCost,
    subsidyPaid: m.subsidyPaid,
    status: m.status,
    resolutionWeights: m.resolutionWeights,
    createdAt: m.createdAt,
    resolvedAt: m.resolvedAt,
    traderCount: Object.keys(m.positions || {}).length,
    positions,
  };
}

function setAccessCookie(res, token) {
  res.cookie(ACCESS_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: ACCESS_TTL_SECONDS * 1000,
  });
}

function setRefreshCookie(res, token) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: REFRESH_TTL_SECONDS * 1000,
  });
}

function clearSessionCookies(res) {
  const baseOptions = {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  };
  res.clearCookie(ACCESS_COOKIE, baseOptions);
  res.clearCookie(REFRESH_COOKIE, baseOptions);
}

async function createSession(res, user, pendingFields = {}) {
  // Precompute tokens and hash outside the file lock (slow async work).
  const accessToken = jwt.sign(
    { userId: user.id, email: user.email },
    JWT_SECRET,
    { expiresIn: ACCESS_TTL_SECONDS }
  );

  const tokenId = randomUUID();
  const refreshToken = jwt.sign(
    { userId: user.id, email: user.email, tokenId, type: 'refresh' },
    JWT_SECRET,
    { expiresIn: REFRESH_TTL_SECONDS }
  );

  const refreshTokenHash = await bcrypt.hash(refreshToken, 10);

  // Atomically read-modify-write under the file lock.
  await withFileLock(USERS_PATH, () => {
    const users = readJson(USERS_PATH);
    const target = users[user.email];
    if (!target) return;
    Object.assign(target, pendingFields, {
      refreshTokenHash,
      refreshTokenId: tokenId,
      refreshTokenIssuedAt: new Date().toISOString(),
    });
    users[user.email] = target;
    writeJson(USERS_PATH, users);
  });

  setAccessCookie(res, accessToken);
  setRefreshCookie(res, refreshToken);
}

function authMiddleware(req, res, next) {
  const token = req.cookies?.[ACCESS_COOKIE];
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.auth = { userId: decoded.userId, email: decoded.email };
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}

async function revokeRefreshFromCookie(req) {
  const refreshToken = req.cookies?.[REFRESH_COOKIE];
  if (!refreshToken) return;

  let decoded;
  try {
    decoded = jwt.verify(refreshToken, JWT_SECRET);
  } catch {
    return; // Invalid cookie; nothing to revoke.
  }

  if (decoded?.type !== 'refresh') return;

  await withFileLock(USERS_PATH, () => {
    const users = readJson(USERS_PATH);
    const user = users[decoded.email];
    if (!user || user.id !== decoded.userId) return;
    user.refreshTokenHash = null;
    user.refreshTokenId = null;
    users[user.email] = user;
    writeJson(USERS_PATH, users);
  });
}

async function rotateRefreshSession(req, res) {
  const refreshToken = req.cookies?.[REFRESH_COOKIE];
  if (!refreshToken) {
    return { ok: false, status: 401, error: 'No refresh session.' };
  }

  let decoded;
  try {
    decoded = jwt.verify(refreshToken, JWT_SECRET);
  } catch {
    return { ok: false, status: 401, error: 'Invalid or expired refresh token.' };
  }

  if (decoded?.type !== 'refresh') {
    return { ok: false, status: 401, error: 'Invalid refresh token type.' };
  }

  // Optimistic read and bcrypt compare outside the lock (expensive async operation).
  const usersForCheck = readJson(USERS_PATH);
  const userForCheck = usersForCheck[decoded.email];
  if (!userForCheck || userForCheck.id !== decoded.userId) {
    return { ok: false, status: 401, error: 'User not found for refresh token.' };
  }

  if (!userForCheck.refreshTokenHash || !userForCheck.refreshTokenId || userForCheck.refreshTokenId !== decoded.tokenId) {
    return { ok: false, status: 401, error: 'Refresh token has been revoked.' };
  }

  const isMatch = await bcrypt.compare(refreshToken, userForCheck.refreshTokenHash);
  if (!isMatch) {
    return { ok: false, status: 401, error: 'Refresh token mismatch.' };
  }

  // Precompute new session tokens outside the lock.
  const newAccessToken = jwt.sign(
    { userId: decoded.userId, email: decoded.email },
    JWT_SECRET,
    { expiresIn: ACCESS_TTL_SECONDS }
  );
  const newTokenId = randomUUID();
  const newRefreshToken = jwt.sign(
    { userId: decoded.userId, email: decoded.email, tokenId: newTokenId, type: 'refresh' },
    JWT_SECRET,
    { expiresIn: REFRESH_TTL_SECONDS }
  );
  const newRefreshTokenHash = await bcrypt.hash(newRefreshToken, 10);

  // Under lock: re-verify tokenId still matches (TOCTOU guard), then atomically write.
  let sessionUser = null;
  const writeOk = await withFileLock(USERS_PATH, () => {
    const users = readJson(USERS_PATH);
    const user = users[decoded.email];
    if (!user || !user.refreshTokenId || user.refreshTokenId !== decoded.tokenId) {
      return false;
    }
    user.refreshTokenHash = newRefreshTokenHash;
    user.refreshTokenId = newTokenId;
    user.refreshTokenIssuedAt = new Date().toISOString();
    users[user.email] = user;
    writeJson(USERS_PATH, users);
    sessionUser = user;
    return true;
  });

  if (!writeOk) {
    return { ok: false, status: 401, error: 'Refresh token has been revoked.' };
  }

  setAccessCookie(res, newAccessToken);
  setRefreshCookie(res, newRefreshToken);
  return { ok: true, user: sanitizeUser(sessionUser) };
}

function isValidArray(value, minLength = 0) {
  return Array.isArray(value) && value.length >= minLength;
}

function getClientIp(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function logAuditEvent(event, context = {}) {
  const entry = { ts: new Date().toISOString(), event, ...context };
  process.stdout.write(JSON.stringify(entry) + '\n');
}

// RFC 5321: local-part up to 64 chars, domain up to 255 chars, total up to 320.
const EMAIL_REGEX = /^[^\s@]{1,64}@[^\s@]{1,255}$/;
const PASSWORD_MIN = 8;
// bcrypt truncates at 72 bytes; cap at 128 to also prevent DoS via CPU-bound hashing.
const PASSWORD_MAX = 128;
const NAME_MAX = 100;

function validateEmail(email) {
  if (!email) return 'Email is required.';
  if (email.length > 320) return 'Email address is too long.';
  if (!EMAIL_REGEX.test(email)) return 'Email address is not valid.';
  return null;
}

function validatePassword(password, fieldLabel = 'Password') {
  if (!password) return `${fieldLabel} is required.`;
  if (password.length < PASSWORD_MIN) return `${fieldLabel} must be at least ${PASSWORD_MIN} characters.`;
  if (password.length > PASSWORD_MAX) return `${fieldLabel} must be at most ${PASSWORD_MAX} characters.`;
  return null;
}

function validateName(name) {
  if (!name) return 'Name is required.';
  if (name.length > NAME_MAX) return `Name must be at most ${NAME_MAX} characters.`;
  return null;
}

function getRequestOrigin(req) {
  const originHeader = req.get('origin');
  if (originHeader) return originHeader;

  const refererHeader = req.get('referer');
  if (!refererHeader) return null;

  try {
    return new URL(refererHeader).origin;
  } catch {
    return 'invalid';
  }
}

function requireTrustedOrigin(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return next();
  }

  const requestOrigin = getRequestOrigin(req);
  if (requestOrigin === ALLOWED_ORIGIN) {
    return next();
  }

  if (requestOrigin === null && CSRF_ALLOW_MISSING_ORIGIN) {
    return next();
  }

  logAuditEvent('security.csrf.blocked', {
    ip: getClientIp(req),
    method: req.method,
    path: req.path,
    requestOrigin,
    allowedOrigin: ALLOWED_ORIGIN,
  });
  return res.status(403).json({ error: 'Cross-site request blocked.' });
}

function isMarketStateValid(state) {
  if (!state || typeof state !== 'object') return false;
  if (typeof state.beta !== 'number' || !Number.isFinite(state.beta)) return false;
  if (!isValidArray(state.outcomes, 2)) return false;
  if (!isValidArray(state.priors, state.outcomes.length)) return false;
  if (!isValidArray(state.qs, state.outcomes.length)) return false;
  if (!isValidArray(state.deltaQs, state.outcomes.length)) return false;
  return true;
}

if (JWT_SECRET === 'change-me-in-production') {
  console.warn('WARNING: using default JWT_SECRET. Set JWT_SECRET in environment before production deployment.');
}
if (!isEmailConfigured()) {
  console.warn('WARNING: SMTP is not configured. Verification/reset emails will not be sent.');
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Please try again later.' },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many registration attempts. Please try again later.' },
});

const recoveryLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

const tokenVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many verification attempts. Please try again later.' },
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many session refresh requests. Please try again later.' },
});

const app = express();

// Trust the first hop from a reverse proxy so req.ip reflects the real client IP.
const TRUST_PROXY = process.env.TRUST_PROXY ?? '1';
if (TRUST_PROXY !== '0') app.set('trust proxy', TRUST_PROXY);

app.use(helmet({
  // CSP is intentionally relaxed for the dev proxy; tighten for production.
  contentSecurityPolicy: process.env.NODE_ENV === 'production',
}));
app.use(cors({
  origin: ALLOWED_ORIGIN,
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use('/api', requireTrustedOrigin);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/health/data', (_req, res) => {
  const health = refreshDataEncryptionHealth();

  res.json({
    ok: !health.error,
    enabled: health.enabled,
    previousKeyConfigured: health.previousKeyConfigured,
    usersEncrypted: health.usersEncrypted,
    marketStateEncrypted: health.marketStateEncrypted,
    migrationPending: health.migrationPending,
    checkedAt: health.checkedAt,
    error: health.error,
  });
});

app.get('/api/health/email', async (_req, res) => {
  await runEmailSelfTest();

  res.json({
    ok: emailHealth.ok,
    configured: emailHealth.configured,
    required: REQUIRE_SMTP,
    provider: emailHealth.provider,
    checkedAt: emailHealth.checkedAt,
    error: emailHealth.error,
    host: SMTP_SETTINGS.host || null,
    port: SMTP_SETTINGS.port || null,
    secure: SMTP_SETTINGS.secure,
  });
});

app.post('/api/auth/register', registerLimiter, async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  const nameErr = validateName(name);
  if (nameErr) return res.status(400).json({ error: nameErr });
  const emailErr = validateEmail(email);
  if (emailErr) return res.status(400).json({ error: emailErr });
  const passErr = validatePassword(password);
  if (passErr) return res.status(400).json({ error: passErr });

  // Precompute expensive async values before taking the file lock.
  const passwordHash = await bcrypt.hash(password, 12);
  const verifyToken = generateOneTimeToken();
  const userId = `u_${Date.now()}`;
  const createdAt = new Date().toISOString();

  // Atomically check-and-insert under the file lock.
  let duplicate = false;
  await withFileLock(USERS_PATH, () => {
    const users = readJson(USERS_PATH);
    if (users[email]) {
      duplicate = true;
      return;
    }
    const smtpReady = isEmailConfigured();
    users[email] = {
      id: userId,
      name,
      email,
      passwordHash,
      emailVerified: !smtpReady,
      emailVerificationTokenHash: smtpReady ? verifyToken.tokenHash : null,
      emailVerificationExpiresAt: smtpReady ? new Date(Date.now() + EMAIL_VERIFY_TTL_SECONDS * 1000).toISOString() : null,
      balance: INITIAL_BALANCE,
      passwordResetTokenHash: null,
      passwordResetExpiresAt: null,
      refreshTokenHash: null,
      refreshTokenId: null,
      loginFailedAttempts: 0,
      loginLockoutUntil: null,
      createdAt,
    };
    writeJson(USERS_PATH, users);
  });

  if (duplicate) {
    logAuditEvent('auth.register.duplicate', { ip: getClientIp(req), email });
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }

  if (isEmailConfigured()) {
    const verifyEmail = buildVerifyEmailContent(email, verifyToken.token);
    await sendEmail({
      to: email,
      subject: verifyEmail.subject,
      text: verifyEmail.text,
      html: verifyEmail.html,
    });
  }

  logAuditEvent('auth.register.success', { ip: getClientIp(req), userId, email });
  if (!isEmailConfigured()) {
    return res.status(201).json({
      ok: true,
      requiresEmailVerification: false,
      message: 'Account created. You can sign in now.',
    });
  }
  return res.status(201).json({
    ok: true,
    requiresEmailVerification: true,
    message: 'If this account can receive email, a verification message was sent.',
  });
});

app.post('/api/auth/login', loginLimiter, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  // Reject oversized passwords before doing any bcrypt work (DoS guard).
  if (password.length > PASSWORD_MAX) {
    return res.status(400).json({ error: `Password must be at most ${PASSWORD_MAX} characters.` });
  }

  const users = readJson(USERS_PATH);
  const user = users[email];
  if (!user) {
    // Constant-time-ish delay to prevent user enumeration via timing.
    await bcrypt.compare(password, '$2a$12$notarealuserhashfortimingprotect');
    logAuditEvent('auth.login.fail.not_found', { ip: getClientIp(req), email });
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  // Check account lockout before doing anything else.
  if (user.loginLockoutUntil && Date.now() < new Date(user.loginLockoutUntil).getTime()) {
    const retryAfterSec = Math.ceil(
      (new Date(user.loginLockoutUntil).getTime() - Date.now()) / 1000
    );
    logAuditEvent('auth.login.locked', { ip: getClientIp(req), userId: user.id, email, retryAfterSec });
    res.set('Retry-After', String(retryAfterSec));
    return res.status(429).json({
      error: `Account temporarily locked due to too many failed attempts. Try again in ${retryAfterSec} seconds.`,
      retryAfter: retryAfterSec,
    });
  }

  if (!user.emailVerified) {
    logAuditEvent('auth.login.fail.not_verified', { ip: getClientIp(req), userId: user.id, email });
    return res.status(403).json({ error: 'Please verify your email before signing in.' });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    // Atomically increment failure counter (and maybe set lockout) under the file lock.
    const failInfo = await withFileLock(USERS_PATH, () => {
      const freshUsers = readJson(USERS_PATH);
      const freshUser = freshUsers[email];
      if (!freshUser) return null;
      freshUser.loginFailedAttempts = (freshUser.loginFailedAttempts || 0) + 1;
      const willLock = freshUser.loginFailedAttempts >= LOGIN_MAX_ATTEMPTS;
      if (willLock) {
        freshUser.loginLockoutUntil = new Date(Date.now() + LOGIN_LOCKOUT_SECONDS * 1000).toISOString();
        freshUser.loginFailedAttempts = 0;
      }
      freshUsers[email] = freshUser;
      writeJson(USERS_PATH, freshUsers);
      return { willLock, lockoutUntil: freshUser.loginLockoutUntil, failedAttempts: freshUser.loginFailedAttempts };
    });
    if (failInfo?.willLock) {
      logAuditEvent('auth.lockout.triggered', { ip: getClientIp(req), userId: user.id, email, lockoutUntil: failInfo.lockoutUntil });
    } else {
      logAuditEvent('auth.login.fail.bad_password', { ip: getClientIp(req), userId: user.id, email, failedAttempts: failInfo?.failedAttempts });
    }
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  // Successful login: createSession atomically clears lockout state and writes the session.
  logAuditEvent('auth.login.success', { ip: getClientIp(req), userId: user.id, email });
  await createSession(res, user, { loginFailedAttempts: 0, loginLockoutUntil: null });
  return res.json({ user: sanitizeUser(user) });
});

app.post('/api/auth/request-verification', recoveryLimiter, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const emailErr = validateEmail(email);
  if (emailErr) return res.status(400).json({ error: emailErr });

  // Optimistic existence check outside lock.
  const snapshot = readJson(USERS_PATH);
  if (!snapshot[email]) {
    return res.json({ ok: true, message: 'If this account exists, a verification message was sent.' });
  }

  const verifyToken = generateOneTimeToken();
  await withFileLock(USERS_PATH, () => {
    const users = readJson(USERS_PATH);
    const user = users[email];
    if (!user) return;
    user.emailVerificationTokenHash = verifyToken.tokenHash;
    user.emailVerificationExpiresAt = new Date(Date.now() + EMAIL_VERIFY_TTL_SECONDS * 1000).toISOString();
    users[email] = user;
    writeJson(USERS_PATH, users);
  });

  const verifyEmail = buildVerifyEmailContent(email, verifyToken.token);
  await sendEmail({
    to: email,
    subject: verifyEmail.subject,
    text: verifyEmail.text,
    html: verifyEmail.html,
  });

  return res.json({
    ok: true,
    message: 'If this account exists, a verification message was sent.',
  });
});

app.post('/api/auth/verify-email', tokenVerifyLimiter, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const token = String(req.body?.token || '').trim();

  if (!email || !token) {
    return res.status(400).json({ error: 'Email and token are required.' });
  }

  // Precompute hash outside lock; run validation+write atomically to prevent token reuse.
  const attemptedHash = hashOneTimeToken(token);
  let result = null;
  await withFileLock(USERS_PATH, () => {
    const users = readJson(USERS_PATH);
    const user = users[email];
    if (!user) { result = { status: 400, error: 'Invalid verification request.' }; return; }
    if (!user.emailVerificationTokenHash || !user.emailVerificationExpiresAt) {
      result = { status: 400, error: 'No active verification token found.' }; return;
    }
    if (Date.now() > new Date(user.emailVerificationExpiresAt).getTime()) {
      result = { status: 400, error: 'Verification token has expired.', audit: 'auth.verify_email.fail.expired', userId: user.id }; return;
    }
    if (attemptedHash !== user.emailVerificationTokenHash) {
      result = { status: 400, error: 'Invalid verification token.', audit: 'auth.verify_email.fail.bad_token', userId: user.id }; return;
    }
    user.emailVerified = true;
    user.emailVerificationTokenHash = null;
    user.emailVerificationExpiresAt = null;
    users[email] = user;
    writeJson(USERS_PATH, users);
    result = { ok: true, userId: user.id };
  });

  if (result.audit) logAuditEvent(result.audit, { ip: getClientIp(req), userId: result.userId, email });
  if (result.error) return res.status(result.status).json({ error: result.error });
  logAuditEvent('auth.verify_email.success', { ip: getClientIp(req), userId: result.userId, email });
  return res.json({ ok: true, message: 'Email verified successfully.' });
});

app.post('/api/auth/request-password-reset', recoveryLimiter, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const emailErr = validateEmail(email);
  if (emailErr) return res.status(400).json({ error: emailErr });

  // Optimistic existence check outside lock.
  const snapshot = readJson(USERS_PATH);
  if (!snapshot[email]) {
    return res.json({ ok: true, message: 'If this account exists, a reset message was sent.' });
  }

  const resetToken = generateOneTimeToken();
  let userId = null;
  await withFileLock(USERS_PATH, () => {
    const users = readJson(USERS_PATH);
    const user = users[email];
    if (!user) return;
    user.passwordResetTokenHash = resetToken.tokenHash;
    user.passwordResetExpiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_SECONDS * 1000).toISOString();
    users[email] = user;
    writeJson(USERS_PATH, users);
    userId = user.id;
  });

  if (userId) logAuditEvent('auth.password_reset.requested', { ip: getClientIp(req), userId, email });

  const resetEmail = buildResetEmailContent(email, resetToken.token);
  await sendEmail({
    to: email,
    subject: resetEmail.subject,
    text: resetEmail.text,
    html: resetEmail.html,
  });

  return res.json({
    ok: true,
    message: 'If this account exists, a reset message was sent.',
  });
});

app.post('/api/auth/reset-password', tokenVerifyLimiter, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const token = String(req.body?.token || '').trim();
  const newPassword = String(req.body?.newPassword || '');

  if (!email || !token || !newPassword) {
    return res.status(400).json({ error: 'Email, token, and new password are required.' });
  }
  const passErr = validatePassword(newPassword, 'New password');
  if (passErr) return res.status(400).json({ error: passErr });

  // Precompute outside lock: bcrypt.hash is async and CPU-intensive.
  const attemptedHash = hashOneTimeToken(token);
  const newPasswordHash = await bcrypt.hash(newPassword, 12);

  // Full validation and write run atomically under the file lock.
  let result = null;
  await withFileLock(USERS_PATH, () => {
    const users = readJson(USERS_PATH);
    const user = users[email];
    if (!user) { result = { status: 400, error: 'Invalid reset request.' }; return; }
    if (!user.passwordResetTokenHash || !user.passwordResetExpiresAt) {
      result = { status: 400, error: 'No active reset token found.' }; return;
    }
    if (Date.now() > new Date(user.passwordResetExpiresAt).getTime()) {
      result = { status: 400, error: 'Reset token has expired.', audit: 'auth.password_reset.fail.expired', userId: user.id }; return;
    }
    if (attemptedHash !== user.passwordResetTokenHash) {
      result = { status: 400, error: 'Invalid reset token.', audit: 'auth.password_reset.fail.bad_token', userId: user.id }; return;
    }
    user.passwordHash = newPasswordHash;
    user.passwordResetTokenHash = null;
    user.passwordResetExpiresAt = null;
    user.refreshTokenHash = null;
    user.refreshTokenId = null;
    user.loginFailedAttempts = 0;
    user.loginLockoutUntil = null;
    users[email] = user;
    writeJson(USERS_PATH, users);
    result = { ok: true, userId: user.id };
  });

  if (result.audit) logAuditEvent(result.audit, { ip: getClientIp(req), userId: result.userId, email });
  if (result.error) return res.status(result.status).json({ error: result.error });

  logAuditEvent('auth.password_reset.success', { ip: getClientIp(req), userId: result.userId, email });
  clearSessionCookies(res);
  return res.json({ ok: true, message: 'Password has been reset.' });
});

app.post('/api/auth/refresh', refreshLimiter, async (req, res) => {
  const result = await rotateRefreshSession(req, res);
  if (!result.ok) {
    logAuditEvent('auth.refresh.fail', { ip: getClientIp(req), reason: result.error });
    clearSessionCookies(res);
    return res.status(result.status).json({ error: result.error });
  }

  logAuditEvent('auth.refresh.success', { ip: getClientIp(req), userId: result.user.id, email: result.user.email });
  return res.json({ user: result.user });
});

app.post('/api/auth/logout', async (req, res) => {
  await revokeRefreshFromCookie(req);
  logAuditEvent('auth.logout', { ip: getClientIp(req) });
  clearSessionCookies(res);
  return res.json({ ok: true });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const users = readJson(USERS_PATH);
  const user = users[req.auth.email];

  if (!user) {
    clearSessionCookies(res);
    return res.status(401).json({ error: 'Session user no longer exists.' });
  }

  return res.json({ user: sanitizeUser(user) });
});

app.get('/api/market-state', authMiddleware, (req, res) => {
  const states = readJson(MARKET_STATE_PATH);
  return res.json({ state: states[req.auth.userId] || null });
});

app.put('/api/market-state', authMiddleware, async (req, res) => {
  const state = req.body?.state;
  if (!isMarketStateValid(state)) {
    return res.status(400).json({ error: 'Invalid market state payload.' });
  }

  await withFileLock(MARKET_STATE_PATH, () => {
    const states = readJson(MARKET_STATE_PATH);
    states[req.auth.userId] = {
      ...state,
      updatedAt: new Date().toISOString(),
    };
    writeJson(MARKET_STATE_PATH, states);
  });

  return res.json({ ok: true });
});

app.post('/api/trade', authMiddleware, async (req, res) => {
  const deltaQs = req.body?.deltaQs;
  const priors = req.body?.priors;
  const beta = req.body?.beta;

  if (!Array.isArray(deltaQs) || deltaQs.length < 2 || deltaQs.length > 20) {
    return res.status(400).json({ error: 'Invalid deltaQs.' });
  }
  if (!Array.isArray(priors) || priors.length !== deltaQs.length) {
    return res.status(400).json({ error: 'Priors length must match deltaQs.' });
  }
  if (typeof beta !== 'number' || !Number.isFinite(beta) || beta <= 0) {
    return res.status(400).json({ error: 'Invalid beta.' });
  }
  if (!deltaQs.every(d => typeof d === 'number' && Number.isFinite(d))) {
    return res.status(400).json({ error: 'deltaQs must be finite numbers.' });
  }
  if (!priors.every(p => typeof p === 'number' && Number.isFinite(p) && p > 0)) {
    return res.status(400).json({ error: 'Priors must be positive finite numbers.' });
  }

  const priorsSum = priors.reduce((a, b) => a + b, 0);
  const normPriors = priors.map(p => p / priorsSum);
  const { userId, email } = req.auth;

  // Read current market state for authoritative qs
  const currentStates = readJson(MARKET_STATE_PATH);
  const currentState = currentStates[userId] || {};
  const currentQs =
    Array.isArray(currentState.qs) && currentState.qs.length === deltaQs.length
      ? currentState.qs.map(Number)
      : deltaQs.map(() => 0);

  const tradeCost = _computeTradeCost(currentQs, deltaQs, normPriors, beta);
  const newQs = currentQs.map((q, i) => q + deltaQs[i]);
  const newPrices = _computePrices(newQs, normPriors, beta);
  const newCost = _computeCost(newQs, normPriors, beta);

  // Deduct balance atomically
  let newBalance;
  let balanceError = null;
  await withFileLock(USERS_PATH, () => {
    const users = readJson(USERS_PATH);
    const user = users[email];
    if (!user) { balanceError = 'User not found.'; return; }
    const balance = user.balance ?? INITIAL_BALANCE;
    const proposed = balance - tradeCost;
    if (proposed < -0.005) { balanceError = 'Insufficient balance.'; return; }
    user.balance = Math.max(0, proposed);
    newBalance = user.balance;
    users[email] = user;
    writeJson(USERS_PATH, users);
  });

  if (balanceError) {
    return res.status(400).json({ error: balanceError });
  }

  // Save updated market state (new qs)
  await withFileLock(MARKET_STATE_PATH, () => {
    const states = readJson(MARKET_STATE_PATH);
    states[userId] = {
      ...(states[userId] || {}),
      qs: newQs,
      priors: normPriors,
      beta,
      updatedAt: new Date().toISOString(),
    };
    writeJson(MARKET_STATE_PATH, states);
  });

  logAuditEvent('trade.execute', { ip: getClientIp(req), userId, tradeCost });
  return res.json({ ok: true, balance: newBalance, tradeCost, newQs, newPrices, newCost });
});

// --- Public Markets ---

app.post('/api/markets', authMiddleware, async (req, res) => {
  const question = String(req.body?.question || '').trim();
  const outcomes = req.body?.outcomes;
  const priors = req.body?.priors;
  const beta = req.body?.beta;

  if (!question || question.length > 200) {
    return res.status(400).json({ error: 'Question must be 1–200 characters.' });
  }
  if (!Array.isArray(outcomes) || outcomes.length < 2 || outcomes.length > 10) {
    return res.status(400).json({ error: 'Provide between 2 and 10 outcomes.' });
  }
  if (!outcomes.every(o => typeof o === 'string' && o.trim().length > 0)) {
    return res.status(400).json({ error: 'All outcomes must be non-empty strings.' });
  }
  if (!Array.isArray(priors) || priors.length !== outcomes.length) {
    return res.status(400).json({ error: 'Priors length must match outcomes count.' });
  }
  if (!priors.every(p => typeof p === 'number' && Number.isFinite(p) && p > 0)) {
    return res.status(400).json({ error: 'All priors must be positive finite numbers.' });
  }
  if (typeof beta !== 'number' || !Number.isFinite(beta) || beta <= 0 || beta > 100) {
    return res.status(400).json({ error: 'Beta must be a positive number (max 100).' });
  }

  const priorsSum = priors.reduce((a, b) => a + b, 0);
  const normPriors = priors.map(p => p / priorsSum);
  // Worst-case market maker loss is bounded by beta * ln(n)
  const subsidy = beta * Math.log(outcomes.length);
  const { userId, email } = req.auth;
  const marketId = `mkt_${Date.now()}_${randomBytes(4).toString('hex')}`;
  const createdAt = new Date().toISOString();

  let newBalance;
  let createError = null;
  let creatorName = '';
  await withFileLock(USERS_PATH, () => {
    const users = readJson(USERS_PATH);
    const user = users[email];
    if (!user) { createError = 'User not found.'; return; }
    const balance = user.balance ?? INITIAL_BALANCE;
    if (balance - subsidy < -0.005) { createError = 'Insufficient balance to fund market liquidity.'; return; }
    user.balance = Math.max(0, balance - subsidy);
    newBalance = user.balance;
    creatorName = user.name;
    users[email] = user;
    writeJson(USERS_PATH, users);
  });

  if (createError) return res.status(400).json({ error: createError });

  const market = {
    id: marketId,
    creatorId: userId,
    creatorName,
    question,
    outcomes: outcomes.map(o => o.trim()),
    priors: normPriors,
    beta,
    qs: outcomes.map(() => 0),
    subsidyPaid: subsidy,
    status: 'open',
    resolvedOutcomeIdx: null,
    createdAt,
    resolvedAt: null,
    positions: {},
  };

  await withFileLock(MARKETS_PATH, () => {
    const markets = readJson(MARKETS_PATH);
    markets[marketId] = market;
    writeJson(MARKETS_PATH, markets);
  });

  logAuditEvent('market.create', { ip: getClientIp(req), userId, marketId, question });
  return res.status(201).json({ ok: true, market: sanitizeMarket(market), balance: newBalance });
});

app.get('/api/markets', authMiddleware, (req, res) => {
  const markets = readJson(MARKETS_PATH);
  const list = Object.values(markets)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(sanitizeMarket);
  return res.json({ markets: list });
});

app.post('/api/markets/:id/trade', authMiddleware, async (req, res) => {
  const { id: marketId } = req.params;
  const { deltaQs } = req.body || {};
  const { userId, email } = req.auth;

  if (!Array.isArray(deltaQs)) return res.status(400).json({ error: 'deltaQs must be an array.' });
  if (!deltaQs.every(d => typeof d === 'number' && Number.isFinite(d))) {
    return res.status(400).json({ error: 'deltaQs must be finite numbers.' });
  }

  const marketsSnap = readJson(MARKETS_PATH);
  const market = marketsSnap[marketId];
  if (!market) return res.status(404).json({ error: 'Market not found.' });
  if (market.status !== 'open') return res.status(400).json({ error: 'Market is not open.' });
  if (deltaQs.length !== market.outcomes.length) {
    return res.status(400).json({ error: `Expected ${market.outcomes.length} deltaQs.` });
  }

  const tradeCost = _computeTradeCost(market.qs, deltaQs, market.priors, market.beta);
  const newQs = market.qs.map((q, i) => q + deltaQs[i]);
  const newPrices = _computePrices(newQs, market.priors, market.beta);
  const newCost = _computeCost(newQs, market.priors, market.beta);

  let newBalance;
  let tradeError = null;
  await withFileLock(USERS_PATH, () => {
    const users = readJson(USERS_PATH);
    const user = users[email];
    if (!user) { tradeError = 'User not found.'; return; }
    const balance = user.balance ?? INITIAL_BALANCE;
    if (balance - tradeCost < -0.005) { tradeError = 'Insufficient balance.'; return; }
    user.balance = Math.max(0, balance - tradeCost);
    newBalance = user.balance;
    users[email] = user;
    writeJson(USERS_PATH, users);
  });
  if (tradeError) return res.status(400).json({ error: tradeError });

  let updatedMarket;
  await withFileLock(MARKETS_PATH, () => {
    const markets = readJson(MARKETS_PATH);
    const m = markets[marketId];
    if (!m || m.status !== 'open') return;
    m.qs = newQs;
    const prev = m.positions[userId];
    m.positions[userId] = {
      email,
      qs: prev ? prev.qs.map((q, i) => q + deltaQs[i]) : [...deltaQs],
    };
    markets[marketId] = m;
    writeJson(MARKETS_PATH, markets);
    updatedMarket = m;
  });
  if (!updatedMarket) return res.status(409).json({ error: 'Market state changed. Please retry.' });

  logAuditEvent('market.trade', { ip: getClientIp(req), userId, marketId, tradeCost });
  return res.json({ ok: true, balance: newBalance, tradeCost, newQs, newPrices, newCost, market: sanitizeMarket(updatedMarket) });
});

app.post('/api/markets/:id/resolve', authMiddleware, async (req, res) => {
  const { id: marketId } = req.params;
  const outcomeIdx = req.body?.outcomeIdx;
  const { userId, email } = req.auth;

  if (typeof outcomeIdx !== 'number' || !Number.isInteger(outcomeIdx) || outcomeIdx < 0) {
    return res.status(400).json({ error: 'outcomeIdx must be a non-negative integer.' });
  }

  const marketsSnap = readJson(MARKETS_PATH);
  const market = marketsSnap[marketId];
  if (!market) return res.status(404).json({ error: 'Market not found.' });
  if (market.creatorId !== userId) return res.status(403).json({ error: 'Only the creator can resolve this market.' });
  if (market.status !== 'open') return res.status(400).json({ error: 'Market is already resolved.' });
  if (outcomeIdx >= market.outcomes.length) return res.status(400).json({ error: 'Outcome index out of range.' });

  // Credit each user whose position in the winning outcome is positive
  await withFileLock(USERS_PATH, () => {
    const users = readJson(USERS_PATH);
    for (const pos of Object.values(market.positions)) {
      const amount = pos.qs?.[outcomeIdx] ?? 0;
      if (amount > 0.001 && users[pos.email]) {
        users[pos.email].balance = (users[pos.email].balance ?? INITIAL_BALANCE) + amount;
      }
    }
    writeJson(USERS_PATH, users);
  });

  let resolvedMarket;
  await withFileLock(MARKETS_PATH, () => {
    const markets = readJson(MARKETS_PATH);
    markets[marketId].status = 'resolved';
    markets[marketId].resolvedOutcomeIdx = outcomeIdx;
    markets[marketId].resolvedAt = new Date().toISOString();
    resolvedMarket = markets[marketId];
    writeJson(MARKETS_PATH, markets);
  });

  const users = readJson(USERS_PATH);
  const newBalance = users[email]?.balance ?? INITIAL_BALANCE;
  logAuditEvent('market.resolve', { ip: getClientIp(req), userId, marketId, outcomeIdx });
  return res.json({ ok: true, market: sanitizeMarket(resolvedMarket), balance: newBalance });
});

// --- General Measure-Theoretic Markets ---

app.post('/api/general-markets', authMiddleware, async (req, res) => {
  const question = String(req.body?.question || '').trim();
  const sampleSpace = req.body?.sampleSpace;
  const baseMeasureWeightsRaw = req.body?.baseMeasureWeights;
  const beta = req.body?.beta;

  if (!question || question.length > 200) {
    return res.status(400).json({ error: 'Question must be 1-200 characters.' });
  }
  if (!Array.isArray(sampleSpace) || sampleSpace.length < 2 || sampleSpace.length > 512) {
    return res.status(400).json({ error: 'sampleSpace must be an array with length 2..512.' });
  }
  if (typeof beta !== 'number' || !Number.isFinite(beta) || beta <= 0 || beta > 100) {
    return res.status(400).json({ error: 'beta must be a positive finite number <= 100.' });
  }

  let baseMeasureWeights;
  try {
    baseMeasureWeights = _normalizePositiveWeights(baseMeasureWeightsRaw, 'baseMeasureWeights');
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid baseMeasureWeights.' });
  }
  if (baseMeasureWeights.length !== sampleSpace.length) {
    return res.status(400).json({ error: 'baseMeasureWeights length must match sampleSpace.' });
  }

  const minWeight = Math.min(...baseMeasureWeights);
  const subsidy = beta * Math.log(1 / minWeight);
  const { userId, email } = req.auth;
  const marketId = `gmkt_${Date.now()}_${randomBytes(4).toString('hex')}`;
  const createdAt = new Date().toISOString();

  let newBalance;
  let createError = null;
  let creatorName = '';
  await withFileLock(USERS_PATH, () => {
    const users = readJson(USERS_PATH);
    const user = users[email];
    if (!user) { createError = 'User not found.'; return; }
    const balance = user.balance ?? INITIAL_BALANCE;
    if (balance - subsidy < -0.005) { createError = 'Insufficient balance to fund market liquidity.'; return; }
    user.balance = Math.max(0, balance - subsidy);
    newBalance = user.balance;
    creatorName = user.name;
    users[email] = user;
    writeJson(USERS_PATH, users);
  });
  if (createError) return res.status(400).json({ error: createError });

  const cumulativeQ = sampleSpace.map(() => 0);
  const market = {
    id: marketId,
    creatorId: userId,
    creatorName,
    question,
    beta,
    sampleSpace,
    baseMeasureWeights,
    cumulativeQ,
    currentCost: _computeGeneralCost(cumulativeQ, baseMeasureWeights, beta),
    subsidyPaid: subsidy,
    status: 'open',
    resolutionWeights: null,
    createdAt,
    resolvedAt: null,
    positions: {},
  };

  await withFileLock(GENERAL_MARKETS_PATH, () => {
    const markets = readJson(GENERAL_MARKETS_PATH);
    markets[marketId] = market;
    writeJson(GENERAL_MARKETS_PATH, markets);
  });

  logAuditEvent('generalMarket.create', { ip: getClientIp(req), userId, marketId, question });
  return res.status(201).json({ ok: true, market: sanitizeGeneralMarket(market), balance: newBalance });
});

app.get('/api/general-markets', authMiddleware, (req, res) => {
  const markets = readJson(GENERAL_MARKETS_PATH);
  const list = Object.values(markets)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(sanitizeGeneralMarket);
  return res.json({ markets: list });
});

app.post('/api/general-markets/:id/trade', authMiddleware, async (req, res) => {
  const { id: marketId } = req.params;
  const { qExpr, qValues } = req.body || {};
  const { userId, email } = req.auth;

  const marketsSnap = readJson(GENERAL_MARKETS_PATH);
  const market = marketsSnap[marketId];
  if (!market) return res.status(404).json({ error: 'General market not found.' });
  if (market.status !== 'open') return res.status(400).json({ error: 'General market is not open.' });

  let tradeQ;
  if (Array.isArray(qValues)) {
    if (qValues.length !== market.sampleSpace.length) {
      return res.status(400).json({ error: `qValues length must match sampleSpace length (${market.sampleSpace.length}).` });
    }
    if (!qValues.every(v => typeof v === 'number' && Number.isFinite(v))) {
      return res.status(400).json({ error: 'qValues must contain finite numbers.' });
    }
    tradeQ = qValues;
  } else {
    try {
      tradeQ = _evaluateTradeFunction(qExpr, market.sampleSpace);
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid qExpr.' });
    }
  }

  const tradeCost = _computeGeneralTradeCost(
    market.cumulativeQ,
    tradeQ,
    market.baseMeasureWeights,
    market.beta
  );
  const nextQ = market.cumulativeQ.map((q, i) => q + tradeQ[i]);
  const impliedMeasure = _computeGeneralImpliedMeasure(nextQ, market.baseMeasureWeights, market.beta);

  let newBalance;
  let tradeError = null;
  await withFileLock(USERS_PATH, () => {
    const users = readJson(USERS_PATH);
    const user = users[email];
    if (!user) { tradeError = 'User not found.'; return; }
    const balance = user.balance ?? INITIAL_BALANCE;
    if (balance - tradeCost < -0.005) { tradeError = 'Insufficient balance.'; return; }
    user.balance = Math.max(0, balance - tradeCost);
    newBalance = user.balance;
    users[email] = user;
    writeJson(USERS_PATH, users);
  });
  if (tradeError) return res.status(400).json({ error: tradeError });

  let updatedMarket;
  await withFileLock(GENERAL_MARKETS_PATH, () => {
    const markets = readJson(GENERAL_MARKETS_PATH);
    const m = markets[marketId];
    if (!m || m.status !== 'open') return;
    m.cumulativeQ = nextQ;
    m.currentCost = _computeGeneralCost(nextQ, m.baseMeasureWeights, m.beta);
    const prev = m.positions[userId];
    m.positions[userId] = {
      email,
      qValues: prev ? prev.qValues.map((q, i) => q + tradeQ[i]) : [...tradeQ],
    };
    markets[marketId] = m;
    writeJson(GENERAL_MARKETS_PATH, markets);
    updatedMarket = m;
  });
  if (!updatedMarket) return res.status(409).json({ error: 'General market changed concurrently. Please retry.' });

  logAuditEvent('generalMarket.trade', { ip: getClientIp(req), userId, marketId, tradeCost });
  return res.json({
    ok: true,
    balance: newBalance,
    tradeCost,
    impliedMeasure,
    market: sanitizeGeneralMarket(updatedMarket),
  });
});

app.post('/api/general-markets/:id/resolve', authMiddleware, async (req, res) => {
  const { id: marketId } = req.params;
  const resolutionWeightsRaw = req.body?.resolutionWeights;
  const { userId, email } = req.auth;

  const marketsSnap = readJson(GENERAL_MARKETS_PATH);
  const market = marketsSnap[marketId];
  if (!market) return res.status(404).json({ error: 'General market not found.' });
  if (market.creatorId !== userId) {
    return res.status(403).json({ error: 'Only the creator can resolve this general market.' });
  }
  if (market.status !== 'open') {
    return res.status(400).json({ error: 'General market is already resolved.' });
  }

  let resolutionWeights;
  try {
    resolutionWeights = _normalizePositiveWeights(resolutionWeightsRaw, 'resolutionWeights');
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid resolutionWeights.' });
  }
  if (resolutionWeights.length !== market.sampleSpace.length) {
    return res.status(400).json({ error: 'resolutionWeights length must match sampleSpace.' });
  }

  await withFileLock(USERS_PATH, () => {
    const users = readJson(USERS_PATH);
    for (const pos of Object.values(market.positions || {})) {
      const payout = _dotProduct(pos.qValues || [], resolutionWeights);
      if (users[pos.email]) {
        users[pos.email].balance = (users[pos.email].balance ?? INITIAL_BALANCE) + payout;
      }
    }
    writeJson(USERS_PATH, users);
  });

  let resolvedMarket;
  await withFileLock(GENERAL_MARKETS_PATH, () => {
    const markets = readJson(GENERAL_MARKETS_PATH);
    const m = markets[marketId];
    if (!m) return;
    m.status = 'resolved';
    m.resolutionWeights = resolutionWeights;
    m.resolvedAt = new Date().toISOString();
    markets[marketId] = m;
    writeJson(GENERAL_MARKETS_PATH, markets);
    resolvedMarket = m;
  });
  if (!resolvedMarket) return res.status(409).json({ error: 'General market changed concurrently. Please retry.' });

  const users = readJson(USERS_PATH);
  const newBalance = users[email]?.balance ?? INITIAL_BALANCE;
  logAuditEvent('generalMarket.resolve', { ip: getClientIp(req), userId, marketId });
  return res.json({ ok: true, market: sanitizeGeneralMarket(resolvedMarket), balance: newBalance });
});

async function startServer() {
  if (DATA_ENCRYPTION.error) {
    throw new Error(DATA_ENCRYPTION.error);
  }
  if (DATA_ENCRYPTION_PREVIOUS.error) {
    throw new Error(DATA_ENCRYPTION_PREVIOUS.error);
  }

  canDecryptJson(USERS_PATH);
  canDecryptJson(MARKET_STATE_PATH);
  canDecryptJson(MARKETS_PATH);
  canDecryptJson(GENERAL_MARKETS_PATH);
  const encryptionHealth = refreshDataEncryptionHealth();
  if (encryptionHealth.migrationPending) {
    console.warn('WARNING: DATA_ENCRYPTION_KEY is set but one or more data files are still plaintext. Run `npm run migrate:data-encryption`.');
  }

  if (REQUIRE_SMTP) {
    if (!isEmailConfigured()) {
      throw new Error('REQUIRE_SMTP=true but SMTP is not fully configured.');
    }

    await runEmailSelfTest();
    if (!emailHealth.ok) {
      throw new Error(`REQUIRE_SMTP=true and SMTP self-test failed: ${emailHealth.error || 'Unknown SMTP error.'}`);
    }
  } else {
    // Non-blocking self-test in permissive mode.
    runEmailSelfTest();
  }

  app.listen(PORT, () => {
    console.log(`API server running on http://localhost:${PORT}`);
  });
}

startServer().catch(error => {
  console.error(`Server startup failed: ${error instanceof Error ? error.message : 'Unknown error.'}`);
  process.exit(1);
});
