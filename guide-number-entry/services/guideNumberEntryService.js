import {
  buildTrackingGuideRecord,
  getAdminShipmentRef,
  getTrackingGuideRef,
  getUserShipmentRef,
  isValidGuideCode,
  normalizeGuideCode
} from '../../new-shipment/services/newShipmentService.js';

const ERROR_CODES = {
  INVALID_GUIDE: 'DRIVE_MX_INVALID_GUIDE',
  NOT_FOUND: 'DRIVE_MX_GUIDE_NOT_FOUND',
  ALREADY_ASSIGNED: 'DRIVE_MX_GUIDE_ALREADY_ASSIGNED',
  NOT_AUTHORIZED: 'DRIVE_MX_ASSIGNMENTS_NOT_AUTHORIZED',
  SESSION_REQUIRED: 'DRIVE_MX_SESSION_REQUIRED',
  FIRESTORE_RULES: 'DRIVE_MX_FIRESTORE_RULES_REQUIRED',
  SERVER_ERROR: 'DRIVE_MX_ASSIGNMENT_ERROR'
};

const VALID_STATUSES = new Set(['Recolectado', 'Procesando', 'En Camino', 'Entregado']);

function createServiceError(code, message, originalError = null) {
  const error = new Error(message);
  error.code = code;
  if (originalError) error.cause = originalError;
  return error;
}

function cleanText(value = '', maxLength = 500) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function getUserId(user = {}) {
  return cleanText(user?.uid || user?.id, 180);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function firstText(values = [], maxLength = 500) {
  for (const value of values) {
    const normalized = cleanText(value, maxLength);
    if (normalized) return normalized;
  }
  return '';
}

function normalizeStep(value, fallback = 0) {
  const numeric = Number(value);
  if (Number.isInteger(numeric) && numeric >= 0 && numeric <= 3) return numeric;
  const fallbackNumeric = Number(fallback);
  return Number.isInteger(fallbackNumeric) && fallbackNumeric >= 0 && fallbackNumeric <= 3
    ? fallbackNumeric
    : 0;
}

function normalizeStatus(value, fallback = 'Recolectado') {
  if (VALID_STATUSES.has(value)) return value;
  return VALID_STATUSES.has(fallback) ? fallback : 'Recolectado';
}


function isValidTimeValue(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0;
  return Boolean(value && typeof value === 'object' && typeof value.toMillis === 'function');
}

function getOperatorRef({ fbase, db, appId, userId }) {
  return fbase.doc(db, 'artifacts', appId, 'public', 'data', 'operators', userId);
}

function assertFirebaseSession(fbase, expectedUserId) {
  let authUser = null;
  try {
    authUser = fbase?.getAuth?.()?.currentUser || null;
  } catch (error) {
    authUser = null;
  }

  if (!authUser || authUser.isAnonymous === true || cleanText(authUser.uid, 180) !== expectedUserId) {
    throw createServiceError(
      ERROR_CODES.SESSION_REQUIRED,
      'La sesión del Panel de Usuario no coincide con el usuario autenticado. Cierra sesión e ingresa nuevamente.'
    );
  }
}

function resolveSourceUserId(trackingData = {}) {
  return firstText([
    trackingData.sourceUserId,
    trackingData.ownerId,
    trackingData.createdByUid,
    trackingData.op,
    trackingData.assignedUserId
  ], 180);
}

function buildClaimedShipment({
  code,
  sourceShipment,
  trackingData,
  sourceUserId,
  operator,
  userId,
  now
}) {
  const sourceCustomer = isObject(sourceShipment.customer) ? sourceShipment.customer : {};
  const trackingCustomer = isObject(trackingData.customer) ? trackingData.customer : {};

  // Cuando el dato ya existe en el documento de origen se conserva exactamente.
  // Los respaldos de tracking solo completan registros antiguos que no tenían el campo.
  const fullName = typeof sourceShipment.fullName === 'string'
    ? sourceShipment.fullName
    : firstText([sourceCustomer.fullName, trackingData.fullName, trackingCustomer.fullName], 160);
  const phone = typeof sourceShipment.phone === 'string'
    ? sourceShipment.phone
    : firstText([sourceCustomer.phone, trackingData.phone, trackingCustomer.phone], 60);
  const origin = typeof sourceShipment.o === 'string'
    ? sourceShipment.o
    : firstText([trackingData.o], 240);
  const destination = typeof sourceShipment.d === 'string'
    ? sourceShipment.d
    : firstText([trackingData.d], 500);
  const postalCode = typeof sourceShipment.postalCode === 'string'
    ? sourceShipment.postalCode
    : firstText([
      sourceShipment.zip,
      sourceShipment.delivery?.zip,
      sourceShipment.delivery?.postalCode
    ], 25);
  const addressReferences = typeof sourceShipment.addressReferences === 'string'
    ? sourceShipment.addressReferences
    : firstText([
      sourceShipment.references,
      sourceShipment.delivery?.references,
      sourceShipment.delivery?.addressReferences
    ], 1200);

  const assignedUserName = typeof operator.name === 'string' ? operator.name.slice(0, 160) : '';
  const assignedUserEmail = typeof operator.email === 'string' ? operator.email.slice(0, 254) : '';
  if (!assignedUserName.trim() || !assignedUserEmail.trim()) {
    throw createServiceError(
      ERROR_CODES.NOT_AUTHORIZED,
      'El perfil del usuario no contiene nombre y correo válidos.'
    );
  }

  const createdAt = isValidTimeValue(sourceShipment.createdAt)
    ? sourceShipment.createdAt
    : (isValidTimeValue(trackingData.createdAt) ? trackingData.createdAt : now);
  const status = normalizeStatus(sourceShipment.status, trackingData.status);
  const currentStep = normalizeStep(sourceShipment.currentStep, trackingData.currentStep);

  return {
    ...sourceShipment,
    id: code,
    trackingNumber: code,
    fullName,
    phone,
    customer: isObject(sourceShipment.customer)
      ? sourceShipment.customer
      : {
        ...trackingCustomer,
        fullName,
        phone
      },
    o: origin,
    d: destination,
    postalCode,
    addressReferences,
    ownerId: sourceUserId,
    originalOwnerId: sourceUserId,
    sourceUserId,
    op: userId,
    assignedUserId: userId,
    assignedUserName,
    assignedUserEmail,
    sourcePanel: 'panel_control',
    shipmentScope: 'admin',
    assignmentMethod: 'guide_number',
    status,
    currentStep,
    createdAt,
    createdByUid: Object.prototype.hasOwnProperty.call(sourceShipment, 'createdByUid')
      ? sourceShipment.createdByUid
      : sourceUserId,
    createdByEmail: Object.prototype.hasOwnProperty.call(sourceShipment, 'createdByEmail')
      ? sourceShipment.createdByEmail
      : '',
    assignedAt: now,
    assignedByUid: userId,
    assignedByEmail: assignedUserEmail,
    updatedAt: now,
    updatedByUid: userId,
    updatedByEmail: assignedUserEmail
  };
}

function buildPublicTrackingRecord({ claimedShipment, trackingData, sourceUserId, now }) {
  const generatedRecord = buildTrackingGuideRecord(claimedShipment, { sourceUserId });
  const publicFullName = cleanText(generatedRecord.fullName, 160);
  const publicPhone = cleanText(generatedRecord.phone, 60);
  const publicRecord = {
    ...trackingData,
    ...generatedRecord,
    id: claimedShipment.id,
    trackingNumber: claimedShipment.id,
    fullName: publicFullName,
    phone: publicPhone,
    customer: { fullName: publicFullName, phone: publicPhone },
    o: cleanText(generatedRecord.o, 240),
    d: cleanText(generatedRecord.d, 500),
    ownerId: cleanText(generatedRecord.ownerId, 180),
    sourcePanel: 'panel_control',
    shipmentScope: 'admin',
    sourceUserId: cleanText(sourceUserId, 180),
    op: cleanText(claimedShipment.assignedUserId, 180),
    assignedUserId: cleanText(claimedShipment.assignedUserId, 180),
    productId: cleanText(generatedRecord.productId, 500),
    orderId: cleanText(generatedRecord.orderId, 220),
    transferId: cleanText(generatedRecord.transferId, 220),
    status: claimedShipment.status,
    currentStep: claimedShipment.currentStep,
    createdAt: isValidTimeValue(trackingData.createdAt)
      ? trackingData.createdAt
      : (isValidTimeValue(claimedShipment.createdAt) ? claimedShipment.createdAt : now),
    updatedAt: now
  };

  // Estos datos son privados y únicamente deben permanecer en Ruta Activa.
  delete publicRecord.postalCode;
  delete publicRecord.addressReferences;
  delete publicRecord.zip;
  delete publicRecord.references;
  if (isObject(publicRecord.delivery)) {
    const safeDelivery = { ...publicRecord.delivery };
    delete safeDelivery.zip;
    delete safeDelivery.postalCode;
    delete safeDelivery.references;
    delete safeDelivery.addressReferences;
    if (Object.keys(safeDelivery).length) publicRecord.delivery = safeDelivery;
    else delete publicRecord.delivery;
  }

  return publicRecord;
}

function mapFirestoreError(error) {
  if (error?.code === 'permission-denied' || error?.code === 'firestore/permission-denied') {
    return createServiceError(
      ERROR_CODES.FIRESTORE_RULES,
      'Las reglas nuevas de Firestore todavía no están publicadas. Publica el archivo firestore.rules y vuelve a intentarlo.',
      error
    );
  }
  if (error?.code === 'unavailable' || error?.code === 'firestore/unavailable') {
    return createServiceError(
      ERROR_CODES.SERVER_ERROR,
      'No fue posible conectar con Firestore. Revisa tu conexión e intenta nuevamente.',
      error
    );
  }
  if (error?.code === 'aborted' || error?.code === 'firestore/aborted') {
    return createServiceError(
      ERROR_CODES.SERVER_ERROR,
      'La guía cambió mientras se intentaba asignar. Intenta nuevamente.',
      error
    );
  }
  return error instanceof Error
    ? error
    : createServiceError(ERROR_CODES.SERVER_ERROR, 'No se pudo asignar la guía.');
}

export async function claimGuideForAuthenticatedUser({
  fbase,
  appId,
  guideCode,
  currentUser = {}
} = {}) {
  if (!fbase || !appId) {
    throw createServiceError(ERROR_CODES.SERVER_ERROR, 'Firebase no está disponible para asignar la guía.');
  }

  const code = normalizeGuideCode(guideCode);
  if (!isValidGuideCode(code)) {
    throw createServiceError(ERROR_CODES.INVALID_GUIDE, 'Ingresa un número de guía válido.');
  }

  const userId = getUserId(currentUser);
  if (!userId) {
    throw createServiceError(ERROR_CODES.SESSION_REQUIRED, 'No se pudo identificar al usuario autenticado.');
  }
  assertFirebaseSession(fbase, userId);

  const db = fbase.getFirestore();
  const packageRef = getAdminShipmentRef({ fbase, db, appId, guideCode: code });
  const trackingRef = getTrackingGuideRef({ fbase, db, appId, guideCode: code });
  const operatorRef = getOperatorRef({ fbase, db, appId, userId });
  let claimedShipment = null;

  try {
    await fbase.runTransaction(db, async (transaction) => {
      // Se mantienen todas las lecturas antes de cualquier escritura.
      const packageSnapshot = await transaction.get(packageRef);
      if (packageSnapshot.exists()) {
        const assignedPackage = packageSnapshot.data() || {};
        const message = cleanText(assignedPackage.op, 180) === userId
          ? `La guía ${code} ya se encuentra en tu Ruta Activa.`
          : `La guía ${code} ya fue asignada a otro usuario.`;
        throw createServiceError(ERROR_CODES.ALREADY_ASSIGNED, message);
      }

      const trackingSnapshot = await transaction.get(trackingRef);
      if (!trackingSnapshot.exists()) {
        throw createServiceError(ERROR_CODES.NOT_FOUND, `No se encontró la guía ${code} en Asignación de Guías.`);
      }

      const operatorSnapshot = await transaction.get(operatorRef);
      if (!operatorSnapshot.exists()) {
        throw createServiceError(ERROR_CODES.NOT_AUTHORIZED, 'No se encontró el perfil del usuario autenticado.');
      }

      const operator = operatorSnapshot.data() || {};
      if (operator.assignmentsAuthorized !== true) {
        throw createServiceError(ERROR_CODES.NOT_AUTHORIZED, 'Valida la contraseña maestra antes de ingresar una guía.');
      }

      const trackingData = trackingSnapshot.data() || {};
      if (trackingData.sourcePanel === 'panel_control') {
        throw createServiceError(ERROR_CODES.ALREADY_ASSIGNED, `La guía ${code} ya fue asignada.`);
      }

      const sourceUserId = resolveSourceUserId(trackingData);
      if (!sourceUserId) {
        throw createServiceError(ERROR_CODES.NOT_FOUND, `La guía ${code} no contiene el usuario de origen.`);
      }

      const sourceRef = getUserShipmentRef({
        fbase,
        db,
        appId,
        userId: sourceUserId,
        guideCode: code
      });
      const sourceSnapshot = await transaction.get(sourceRef);
      if (!sourceSnapshot.exists()) {
        throw createServiceError(ERROR_CODES.NOT_FOUND, `La guía ${code} ya no está disponible en Asignación de Guías.`);
      }

      const now = Date.now();
      const sourceShipment = sourceSnapshot.data() || {};
      claimedShipment = buildClaimedShipment({
        code,
        sourceShipment,
        trackingData,
        sourceUserId,
        operator,
        userId,
        now
      });
      const trackingRecord = buildPublicTrackingRecord({
        claimedShipment,
        trackingData,
        sourceUserId,
        now
      });

      transaction.set(packageRef, claimedShipment);
      transaction.set(trackingRef, trackingRecord);
      transaction.delete(sourceRef);
    });
  } catch (error) {
    throw mapFirestoreError(error);
  }

  return claimedShipment;
}

export { ERROR_CODES };
