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

function decodeServiceAccountValue(rawValue, variableName) {
  const raw = clean(rawValue);
  if (!raw) return null;

  const jsonCandidates = [raw];
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    jsonCandidates.push(raw.slice(1, -1));
  }

  for (const candidate of jsonCandidates) {
    try {
      let parsed = JSON.parse(candidate);
      if (typeof parsed === 'string') parsed = JSON.parse(parsed);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch (error) {}
  }

  const compact = raw.replace(/\s+/g, '');
  const base64Candidates = [compact, compact.replace(/-/g, '+').replace(/_/g, '/')];
  for (let candidate of base64Candidates) {
    try {
      while (candidate.length % 4) candidate += '=';
      let parsed = JSON.parse(Buffer.from(candidate, 'base64').toString('utf8'));
      if (typeof parsed === 'string') parsed = JSON.parse(parsed);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch (error) {}
  }

  throw publicError(
    `La variable ${variableName} no contiene credenciales válidas de Firebase Admin.`,
    503,
    'firebase-admin-invalid-credentials',
    { variableName }
  );
}

function normalizeServiceAccount(serviceAccount, variableName = 'FIREBASE_SERVICE_ACCOUNT_KEY') {
  if (!serviceAccount || typeof serviceAccount !== 'object') return null;
  const normalized = {
    ...serviceAccount,
    project_id: clean(serviceAccount.project_id || serviceAccount.projectId || process.env.FIREBASE_PROJECT_ID || APP_ID),
    client_email: clean(serviceAccount.client_email || serviceAccount.clientEmail),
    private_key: normalizePrivateKey(serviceAccount.private_key || serviceAccount.privateKey)
  };

  if (!normalized.project_id || !normalized.client_email || !normalized.private_key) {
    throw publicError(
      `La variable ${variableName} está incompleta: debe incluir project_id, client_email y private_key.`,
      503,
      'firebase-admin-invalid-credentials',
      { variableName }
    );
  }
  return normalized;
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
    if (!clean(process.env[variableName])) continue;
    return normalizeServiceAccount(
      decodeServiceAccountValue(process.env[variableName], variableName),
      variableName
    );
  }

  const projectId = clean(
    process.env.FIREBASE_PROJECT_ID ||
    process.env.FIREBASE_ADMIN_PROJECT_ID ||
    process.env.GCLOUD_PROJECT ||
    APP_ID
  );
  const clientEmail = clean(
    process.env.FIREBASE_CLIENT_EMAIL ||
    process.env.FIREBASE_ADMIN_CLIENT_EMAIL ||
    process.env.GOOGLE_CLIENT_EMAIL
  );
  const privateKey = normalizePrivateKey(
    process.env.FIREBASE_PRIVATE_KEY ||
    process.env.FIREBASE_ADMIN_PRIVATE_KEY ||
    process.env.GOOGLE_PRIVATE_KEY
  );

  if (projectId && clientEmail && privateKey) {
    return normalizeServiceAccount({
      project_id: projectId,
      client_email: clientEmail,
      private_key: privateKey
    }, 'FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY');
  }

  const googleApplicationCredentials = clean(process.env.GOOGLE_APPLICATION_CREDENTIALS);
  if (googleApplicationCredentials && (googleApplicationCredentials.startsWith('{') || googleApplicationCredentials.startsWith('eyJ'))) {
    return normalizeServiceAccount(
      decodeServiceAccountValue(googleApplicationCredentials, 'GOOGLE_APPLICATION_CREDENTIALS'),
      'GOOGLE_APPLICATION_CREDENTIALS'
    );
  }

  return null;
}

function canUseApplicationDefaultCredentials() {
  return Boolean(
    clean(process.env.GOOGLE_APPLICATION_CREDENTIALS) ||
    clean(process.env.K_SERVICE) ||
    clean(process.env.FUNCTION_TARGET) ||
    clean(process.env.GAE_ENV)
  );
}

function getAdminApp() {
  if (admin.apps.length) return admin.app();

  const serviceAccount = parseServiceAccountFromEnv();
  if (serviceAccount) {
    return admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id || process.env.FIREBASE_PROJECT_ID || APP_ID
    });
  }

  if (canUseApplicationDefaultCredentials()) {
    return admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: process.env.FIREBASE_PROJECT_ID || APP_ID
    });
  }

  throw publicError(
    'Falta configurar Firebase Admin en Vercel para procesar las recargas con Stripe.',
    503,
    'firebase-admin-not-configured',
    { requiredEnvironmentVariable: 'FIREBASE_SERVICE_ACCOUNT_KEY' }
  );
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
  const authHeader = clean(req?.headers?.authorization || req?.headers?.Authorization || '');
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) {
    throw publicError('Inicia sesión nuevamente para continuar.', 401, 'missing-auth-token');
  }
  return match[1].trim();
}

async function verifyFirebaseUser(req, { requireAdmin = false } = {}) {
  const app = getAdminApp();
  let decoded;
  try {
    decoded = await admin.auth(app).verifyIdToken(getBearerToken(req), true);
  } catch (error) {
    console.error('[Stripe][Auth] No se pudo validar el token de Firebase.', error);
    throw publicError('La sesión ya no es válida. Inicia sesión nuevamente.', 401, 'invalid-auth-token');
  }

  if (!decoded?.uid) {
    throw publicError('No se pudo identificar al usuario autenticado.', 401, 'invalid-auth-user');
  }

  if (requireAdmin) {
    const email = lower(decoded.email);
    if (email === ADMIN_EMAIL) return decoded;

    const profileSnapshot = await dataRoot(getDb()).collection('operators').doc(decoded.uid).get();
    const profile = profileSnapshot.exists ? (profileSnapshot.data() || {}) : {};
    if (lower(profile.email) !== ADMIN_EMAIL && lower(profile.emailNormalized) !== ADMIN_EMAIL && profile.role !== 'admin') {
      throw publicError('Solo el administrador puede configurar Stripe.', 403, 'admin-required');
    }
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

function getBaseUrl(req) {
  const forwardedProto = clean(req?.headers?.['x-forwarded-proto']).split(',')[0] || 'https';
  const forwardedHost = clean(req?.headers?.['x-forwarded-host']).split(',')[0];
  const host = forwardedHost || clean(req?.headers?.host).split(',')[0];
  const protocol = forwardedProto === 'http' ? 'http' : 'https';

  if (!host || !/^[a-z0-9.-]+(?::\d+)?$/i.test(host)) {
    const fallbackHost = clean(process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL);
    if (!fallbackHost || !/^[a-z0-9.-]+$/i.test(fallbackHost)) {
      throw publicError('No se pudo determinar la dirección pública de la aplicación.', 500, 'application-url-unavailable');
    }
    return `https://${fallbackHost}`;
  }

  return `${protocol}://${host}`;
}

function setCommonHeaders(res, methods = 'GET, POST, OPTIONS') {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Stripe-Signature');
  res.setHeader('Cache-Control', 'no-store');
}

function sendError(res, error, fallbackMessage = 'No se pudo completar la operación.') {
  const statusCode = Number(error?.statusCode || error?.status || 500);
  const safeStatus = statusCode >= 400 && statusCode <= 599 ? statusCode : 500;
  if (safeStatus >= 500) console.error('[Stripe][Servidor]', error);
  return res.status(safeStatus).json({
    success: false,
    error: error?.message || fallbackMessage,
    code: error?.code || 'server-error',
    details: error?.details || {}
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
  getBearerToken,
  verifyFirebaseUser,
  parseBody,
  getBaseUrl,
  setCommonHeaders,
  sendError
};
