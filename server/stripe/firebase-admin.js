'use strict';

const admin = require('firebase-admin');

const APP_ID = String(process.env.DRIVE_MX_APP_ID || process.env.FIREBASE_PROJECT_ID || 'saxrecords-appcreat').trim();
const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || 'admin@drivemx.com').trim().toLowerCase();

function clean(value) {
  return String(value ?? '').trim();
}

function lower(value) {
  return clean(value).replace(/\s+/g, '').toLowerCase();
}

function publicError(message, statusCode = 500, code = 'server-error', details = {}) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  error.details = details;
  return error;
}

function normalizePrivateKey(value = '') {
  return clean(value).replace(/\\n/g, '\n');
}

function parseJsonOrBase64(rawValue) {
  const raw = clean(rawValue);
  if (!raw) return null;

  const candidates = [raw];
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    candidates.push(raw.slice(1, -1));
  }

  for (const candidate of candidates) {
    try {
      let parsed = JSON.parse(candidate);
      if (typeof parsed === 'string') parsed = JSON.parse(parsed);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch (error) {}
  }

  const compact = raw.replace(/\s+/g, '');
  for (let candidate of [compact, compact.replace(/-/g, '+').replace(/_/g, '/')]) {
    try {
      while (candidate.length % 4) candidate += '=';
      let parsed = JSON.parse(Buffer.from(candidate, 'base64').toString('utf8'));
      if (typeof parsed === 'string') parsed = JSON.parse(parsed);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch (error) {}
  }

  return null;
}

function normalizeServiceAccount(value) {
  if (!value || typeof value !== 'object') return null;
  const projectId = clean(value.project_id || value.projectId || process.env.FIREBASE_PROJECT_ID || APP_ID);
  const clientEmail = clean(value.client_email || value.clientEmail);
  const privateKey = normalizePrivateKey(value.private_key || value.privateKey);
  if (!projectId || !clientEmail || !privateKey) return null;
  return {
    ...value,
    project_id: projectId,
    client_email: clientEmail,
    private_key: privateKey
  };
}

function parseServiceAccountFromEnv() {
  const jsonVariables = [
    'FIREBASE_SERVICE_ACCOUNT_KEY',
    'FIREBASE_SERVICE_ACCOUNT_JSON',
    'FIREBASE_SERVICE_ACCOUNT',
    'FIREBASE_ADMIN_CREDENTIALS',
    'FIREBASE_ADMIN_SERVICE_ACCOUNT',
    'FIREBASE_CREDENTIALS',
    'FIREBASE_ADMIN_SDK_CONFIG',
    'GOOGLE_SERVICE_ACCOUNT_JSON',
    'GOOGLE_APPLICATION_CREDENTIALS_JSON',
    'GOOGLE_CREDENTIALS'
  ];

  for (const variableName of jsonVariables) {
    const parsed = parseJsonOrBase64(process.env[variableName]);
    const normalized = normalizeServiceAccount(parsed);
    if (normalized) return normalized;
  }

  return normalizeServiceAccount({
    project_id: process.env.FIREBASE_PROJECT_ID || process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.GCLOUD_PROJECT || APP_ID,
    client_email: process.env.FIREBASE_CLIENT_EMAIL || process.env.FIREBASE_ADMIN_CLIENT_EMAIL || process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.FIREBASE_PRIVATE_KEY || process.env.FIREBASE_ADMIN_PRIVATE_KEY || process.env.GOOGLE_PRIVATE_KEY
  });
}

function getAdminApp() {
  if (admin.apps.length) return admin.app();

  const serviceAccount = parseServiceAccountFromEnv();
  if (serviceAccount) {
    return admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id
    });
  }

  return admin.initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID || APP_ID
  });
}

function getDb() {
  return admin.firestore(getAdminApp());
}

function dataRoot(db = getDb()) {
  return db.collection('artifacts').doc(APP_ID).collection('public').doc('data');
}

function privateRoot(db = getDb()) {
  return db.collection('artifacts').doc(APP_ID).collection('private_config');
}

function getBearerToken(req) {
  const header = clean(req?.headers?.authorization || req?.headers?.Authorization || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) {
    throw publicError('Inicia sesión nuevamente para continuar.', 401, 'missing-auth-token');
  }
  return match[1].trim();
}

async function verifyFirebaseUser(req, { requireAdmin = false } = {}) {
  let decoded;
  try {
    decoded = await admin.auth(getAdminApp()).verifyIdToken(getBearerToken(req), true);
  } catch (error) {
    console.error('[Stripe][Auth] Token no válido:', error);
    throw publicError('La sesión ya no es válida. Inicia sesión nuevamente.', 401, 'invalid-auth-token');
  }

  if (!decoded?.uid) {
    throw publicError('No se pudo identificar al usuario autenticado.', 401, 'invalid-auth-user');
  }

  if (!requireAdmin) return decoded;
  if (lower(decoded.email) === ADMIN_EMAIL) return decoded;

  const snapshot = await dataRoot(getDb()).collection('operators').doc(decoded.uid).get();
  const profile = snapshot.exists ? (snapshot.data() || {}) : {};
  const isAdmin = profile.role === 'admin'
    || lower(profile.email) === ADMIN_EMAIL
    || lower(profile.emailNormalized) === ADMIN_EMAIL;

  if (!isAdmin) {
    throw publicError('Solo el administrador puede configurar Stripe.', 403, 'admin-required');
  }

  return decoded;
}

function parseBody(req) {
  if (!req || req.body == null || req.body === '') return {};
  if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  try {
    return JSON.parse(Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body));
  } catch (error) {
    throw publicError('La información enviada no es válida.', 400, 'invalid-json');
  }
}

function setCommonHeaders(res, methods = 'POST, OPTIONS') {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
}

function sendError(res, error) {
  const statusCode = Number(error?.statusCode || 500);
  const safeStatus = Number.isInteger(statusCode) && statusCode >= 400 && statusCode <= 599 ? statusCode : 500;
  if (safeStatus >= 500) console.error('[Stripe][API]', error);
  return res.status(safeStatus).json({
    success: false,
    code: clean(error?.code || 'server-error'),
    error: clean(error?.message || 'No se pudo completar la operación.'),
    ...(error?.details && typeof error.details === 'object' ? { details: error.details } : {})
  });
}

module.exports = {
  admin,
  APP_ID,
  ADMIN_EMAIL,
  clean,
  lower,
  publicError,
  getAdminApp,
  getDb,
  dataRoot,
  privateRoot,
  verifyFirebaseUser,
  parseBody,
  setCommonHeaders,
  sendError
};

