const admin = require('firebase-admin');

const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || 'admin@drivemx.com').trim().toLowerCase();
const DEFAULT_APP_ID = String(
  process.env.DRIVE_MX_APP_ID ||
  process.env.FIREBASE_PROJECT_ID ||
  process.env.GCLOUD_PROJECT ||
  'drivemx-paqueteria'
).trim();

const GUIDE_PATTERN = /^\d{6}-[A-Z]$/;
const ERROR_CODES = {
  INVALID_GUIDE: 'DRIVE_MX_INVALID_GUIDE',
  NOT_FOUND: 'DRIVE_MX_GUIDE_NOT_FOUND',
  ALREADY_ASSIGNED: 'DRIVE_MX_GUIDE_ALREADY_ASSIGNED',
  NOT_AUTHORIZED: 'DRIVE_MX_ASSIGNMENTS_NOT_AUTHORIZED',
  SESSION_REQUIRED: 'DRIVE_MX_SESSION_REQUIRED',
  SERVER_ERROR: 'DRIVE_MX_ASSIGNMENT_SERVER_ERROR'
};

function clean(value, maxLength = 500) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function normalizeGuideCode(value) {
  return clean(value, 40).toUpperCase();
}

function readRequestBody(req) {
  const body = req?.body;
  if (!body) return {};
  if (typeof body === 'object' && !Buffer.isBuffer(body)) return body;
  try {
    const text = Buffer.isBuffer(body) ? body.toString('utf8') : String(body);
    return JSON.parse(text);
  } catch (error) {
    return {};
  }
}

function httpError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicCode = code;
  return error;
}

function parseServiceAccountFromEnv() {
  const rawJson =
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY ||
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;

  if (rawJson) {
    let parsed;
    try {
      parsed = JSON.parse(rawJson);
    } catch (jsonError) {
      try {
        parsed = JSON.parse(Buffer.from(rawJson, 'base64').toString('utf8'));
      } catch (base64Error) {
        throw new Error('La configuración del servicio de Firebase no contiene JSON válido.');
      }
    }
    if (parsed.private_key) parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
    return parsed;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (projectId && clientEmail && privateKey) {
    return {
      project_id: projectId,
      client_email: clientEmail,
      private_key: privateKey.replace(/\\n/g, '\n')
    };
  }

  return null;
}

function getAdminApp() {
  if (admin.apps.length) return admin.app();

  const serviceAccount = parseServiceAccountFromEnv();
  if (serviceAccount) {
    return admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id || DEFAULT_APP_ID
    });
  }

  return admin.initializeApp({ projectId: DEFAULT_APP_ID });
}

function getDataRoot(db, appId) {
  return db.collection('artifacts').doc(appId).collection('public').doc('data');
}

function isActiveOperator(profile = {}) {
  const accountStatus = clean(profile.accountStatus, 80).toLowerCase();
  return profile.role !== 'admin'
    && profile.active !== false
    && profile.blocked !== true
    && !accountStatus.includes('bloqueado')
    && !accountStatus.includes('inactivo');
}

function publicTrackingRecord(shipment = {}, sourceUserId = '') {
  const customer = shipment.customer && typeof shipment.customer === 'object'
    ? shipment.customer
    : {};
  const code = normalizeGuideCode(shipment.id || shipment.trackingNumber);
  const now = Date.now();
  const fullName = clean(shipment.fullName || customer.fullName, 160);
  const phone = clean(shipment.phone || customer.phone, 60);

  return {
    id: code,
    trackingNumber: code,
    fullName,
    phone,
    customer: { fullName, phone },
    o: clean(shipment.o, 240),
    d: clean(shipment.d, 500),
    status: clean(shipment.status || 'Recolectado', 40),
    currentStep: Number.isFinite(Number(shipment.currentStep)) ? Number(shipment.currentStep) : 0,
    op: clean(shipment.op || shipment.assignedUserId, 180),
    assignedUserId: clean(shipment.assignedUserId || shipment.op, 180),
    ownerId: clean(shipment.ownerId, 180),
    sourcePanel: 'panel_control',
    shipmentScope: 'admin',
    sourceUserId: clean(sourceUserId || shipment.sourceUserId || shipment.ownerId, 180),
    productId: clean(shipment.productId, 500),
    orderId: clean(shipment.orderId, 220),
    transferId: clean(shipment.transferId, 220),
    createdAt: shipment.createdAt || now,
    updatedAt: shipment.updatedAt || now
  };
}

async function requireAuthenticatedUser(req, app) {
  const authorization = clean(req.headers.authorization || req.headers.Authorization, 10000);
  const token = authorization.toLowerCase().startsWith('bearer ')
    ? authorization.slice(7).trim()
    : '';

  if (!token) {
    throw httpError(401, ERROR_CODES.SESSION_REQUIRED, 'Tu sesión expiró. Inicia sesión nuevamente.');
  }

  try {
    return await admin.auth(app).verifyIdToken(token, true);
  } catch (error) {
    throw httpError(401, ERROR_CODES.SESSION_REQUIRED, 'Tu sesión expiró. Inicia sesión nuevamente.');
  }
}

async function claimGuide({ db, appId, decodedUser, guideCode }) {
  const root = getDataRoot(db, appId);
  const packageRef = root.collection('packages').doc(guideCode);
  const trackingRef = root.collection('tracking_guides').doc(guideCode);
  const operatorRef = root.collection('operators').doc(decodedUser.uid);

  let responseShipment = null;

  await db.runTransaction(async (transaction) => {
    const [packageSnapshot, trackingSnapshot, operatorSnapshot] = await Promise.all([
      transaction.get(packageRef),
      transaction.get(trackingRef),
      transaction.get(operatorRef)
    ]);

    if (packageSnapshot.exists) {
      const currentPackage = packageSnapshot.data() || {};
      const message = clean(currentPackage.op, 180) === decodedUser.uid
        ? `La guía ${guideCode} ya se encuentra en tu Ruta Activa.`
        : `La guía ${guideCode} ya fue asignada a otro usuario.`;
      throw httpError(409, ERROR_CODES.ALREADY_ASSIGNED, message);
    }

    if (!trackingSnapshot.exists) {
      throw httpError(404, ERROR_CODES.NOT_FOUND, `No se encontró la guía ${guideCode} en Asignación de Guías.`);
    }

    if (!operatorSnapshot.exists) {
      throw httpError(403, ERROR_CODES.NOT_AUTHORIZED, 'No se encontró el perfil del usuario autenticado.');
    }

    const operator = operatorSnapshot.data() || {};
    if (!isActiveOperator(operator)) {
      throw httpError(403, ERROR_CODES.NOT_AUTHORIZED, 'La cuenta no tiene permiso para recibir asignaciones.');
    }
    if (operator.assignmentsAuthorized !== true) {
      throw httpError(403, ERROR_CODES.NOT_AUTHORIZED, 'Valida la contraseña maestra antes de ingresar una guía.');
    }

    const trackingData = trackingSnapshot.data() || {};
    const sourceUserId = clean(trackingData.sourceUserId || trackingData.ownerId, 180);
    if (!sourceUserId || trackingData.sourcePanel === 'panel_control') {
      throw httpError(404, ERROR_CODES.NOT_FOUND, `La guía ${guideCode} no está disponible en Asignación de Guías.`);
    }

    const sourceRef = root.collection('user_shipments').doc(sourceUserId).collection('items').doc(guideCode);
    const sourceSnapshot = await transaction.get(sourceRef);
    if (!sourceSnapshot.exists) {
      throw httpError(404, ERROR_CODES.NOT_FOUND, `La guía ${guideCode} ya no está disponible en Asignación de Guías.`);
    }

    const sourceShipment = sourceSnapshot.data() || {};
    if (normalizeGuideCode(sourceShipment.id || sourceShipment.trackingNumber || guideCode) !== guideCode) {
      throw httpError(409, ERROR_CODES.NOT_FOUND, 'Los datos de la guía no coinciden con el registro disponible.');
    }

    const assignedUserName = clean(operator.name || decodedUser.name || decodedUser.email?.split('@')[0], 160);
    const assignedUserEmail = clean(operator.email || decodedUser.email, 254).toLowerCase();
    if (!assignedUserName || !assignedUserEmail) {
      throw httpError(403, ERROR_CODES.NOT_AUTHORIZED, 'El perfil del usuario no contiene nombre y correo válidos.');
    }

    const now = Date.now();
    const originalOwnerId = clean(sourceShipment.ownerId || sourceUserId, 180);
    const claimedShipment = {
      ...sourceShipment,
      id: guideCode,
      trackingNumber: guideCode,
      ownerId: originalOwnerId,
      originalOwnerId,
      sourceUserId,
      op: decodedUser.uid,
      assignedUserId: decodedUser.uid,
      assignedUserName,
      assignedUserEmail,
      sourcePanel: 'panel_control',
      shipmentScope: 'admin',
      assignmentMethod: 'guide_number',
      assignedAt: now,
      assignedByUid: decodedUser.uid,
      assignedByEmail: assignedUserEmail,
      updatedAt: now,
      updatedByUid: decodedUser.uid,
      updatedByEmail: assignedUserEmail
    };

    const trackingRecord = publicTrackingRecord(claimedShipment, sourceUserId);

    transaction.create(packageRef, claimedShipment);
    transaction.set(trackingRef, trackingRecord);
    transaction.delete(sourceRef);

    responseShipment = {
      id: guideCode,
      trackingNumber: guideCode,
      status: trackingRecord.status,
      currentStep: trackingRecord.currentStep,
      op: decodedUser.uid,
      assignedUserId: decodedUser.uid
    };
  });

  return responseShipment;
}

module.exports = async function claimGuideHandler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      code: ERROR_CODES.SERVER_ERROR,
      error: 'Método no permitido.'
    });
  }

  try {
    const body = readRequestBody(req);
    const requestedAppId = clean(body.appId, 180);
    const appId = requestedAppId || DEFAULT_APP_ID;
    if (appId !== DEFAULT_APP_ID) {
      throw httpError(400, ERROR_CODES.NOT_AUTHORIZED, 'El proyecto solicitado no es válido.');
    }

    const guideCode = normalizeGuideCode(body.guideCode);
    if (!GUIDE_PATTERN.test(guideCode)) {
      throw httpError(400, ERROR_CODES.INVALID_GUIDE, 'Ingresa un número de guía válido.');
    }

    const app = getAdminApp();
    const decodedUser = await requireAuthenticatedUser(req, app);
    const db = admin.firestore(app);
    const shipment = await claimGuide({ db, appId, decodedUser, guideCode });

    return res.status(200).json({ success: true, shipment });
  } catch (error) {
    const statusCode = Number(error.statusCode) || 500;
    const publicCode = error.publicCode || ERROR_CODES.SERVER_ERROR;
    const publicMessage = statusCode >= 500
      ? 'No se pudo completar la asignación de la guía.'
      : error.message;

    console.error('Ingresar número de guía:', {
      code: publicCode,
      statusCode,
      message: error.message
    });

    return res.status(statusCode).json({
      success: false,
      code: publicCode,
      error: publicMessage
    });
  }
};
