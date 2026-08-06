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
  NOT_AUTHORIZED: 'DRIVE_MX_ASSIGNMENTS_NOT_AUTHORIZED'
};

function createServiceError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function getUserId(user = {}) {
  return String(user?.uid || user?.id || '').trim();
}

function cleanText(value = '', maxLength = 500) {
  return String(value || '').trim().slice(0, maxLength);
}

function getOperatorRef({ fbase, db, appId, userId }) {
  return fbase.doc(db, 'artifacts', appId, 'public', 'data', 'operators', userId);
}

export async function claimGuideForAuthenticatedUser({
  fbase,
  appId,
  guideCode,
  currentUser = {}
} = {}) {
  if (!fbase || !appId) throw new Error('Firebase no está disponible para asignar la guía.');

  const code = normalizeGuideCode(guideCode);
  if (!isValidGuideCode(code)) {
    throw createServiceError(ERROR_CODES.INVALID_GUIDE, 'Ingresa un número de guía válido.');
  }

  const userId = getUserId(currentUser);
  if (!userId) throw new Error('No se pudo identificar al usuario autenticado.');

  const db = fbase.getFirestore();
  const packageRef = getAdminShipmentRef({ fbase, db, appId, guideCode: code });
  const trackingRef = getTrackingGuideRef({ fbase, db, appId, guideCode: code });
  const operatorRef = getOperatorRef({ fbase, db, appId, userId });
  let claimedShipment = null;

  await fbase.runTransaction(db, async (transaction) => {
    const [trackingSnapshot, packageSnapshot, operatorSnapshot] = await Promise.all([
      transaction.get(trackingRef),
      transaction.get(packageRef),
      transaction.get(operatorRef)
    ]);

    if (packageSnapshot.exists()) {
      const assignedPackage = packageSnapshot.data() || {};
      const message = assignedPackage.op === userId
        ? `La guía ${code} ya se encuentra en tu Ruta Activa.`
        : `La guía ${code} ya fue asignada a otro usuario.`;
      throw createServiceError(ERROR_CODES.ALREADY_ASSIGNED, message);
    }

    if (!trackingSnapshot.exists()) {
      throw createServiceError(ERROR_CODES.NOT_FOUND, `No se encontró la guía ${code} en Asignación de Guías.`);
    }

    if (!operatorSnapshot.exists() || operatorSnapshot.data()?.assignmentsAuthorized !== true) {
      throw createServiceError(ERROR_CODES.NOT_AUTHORIZED, 'Valida la contraseña maestra antes de ingresar una guía.');
    }

    const trackingData = trackingSnapshot.data() || {};
    const sourceUserId = cleanText(trackingData.sourceUserId || trackingData.ownerId, 180);
    if (!sourceUserId) {
      throw createServiceError(ERROR_CODES.NOT_FOUND, `La guía ${code} no está disponible en Asignación de Guías.`);
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

    const sourceShipment = { id: sourceSnapshot.id, ...sourceSnapshot.data() };
    const operator = operatorSnapshot.data() || {};
    const now = Date.now();
    const assignedUserName = String(operator.name || '').slice(0, 160);
    const assignedUserEmail = String(operator.email || '').slice(0, 254);
    const originalOwnerId = cleanText(sourceShipment.ownerId || sourceUserId, 180);

    if (!assignedUserName.trim() || !assignedUserEmail.trim()) {
      throw createServiceError(ERROR_CODES.NOT_AUTHORIZED, 'El perfil del usuario no contiene nombre y correo válidos.');
    }

    claimedShipment = {
      ...sourceShipment,
      id: code,
      trackingNumber: code,
      ownerId: originalOwnerId,
      originalOwnerId,
      sourceUserId,
      op: userId,
      assignedUserId: userId,
      assignedUserName,
      assignedUserEmail,
      sourcePanel: 'panel_control',
      shipmentScope: 'admin',
      assignmentMethod: 'guide_number',
      assignedAt: now,
      assignedByUid: userId,
      assignedByEmail: assignedUserEmail,
      updatedAt: now,
      updatedByUid: userId,
      updatedByEmail: assignedUserEmail
    };

    const trackingRecord = {
      ...buildTrackingGuideRecord(claimedShipment, { sourceUserId }),
      sourcePanel: 'panel_control',
      shipmentScope: 'admin',
      sourceUserId,
      op: userId,
      assignedUserId: userId,
      createdAt: claimedShipment.createdAt || now,
      updatedAt: now
    };

    transaction.set(packageRef, claimedShipment);
    transaction.set(trackingRef, trackingRecord);
    transaction.delete(sourceRef);
  });

  return claimedShipment;
}

export { ERROR_CODES };
