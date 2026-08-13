import {
  getAdminShipmentRef,
  getTrackingGuideRef,
  getUserShipmentRef,
  isValidGuideCode,
  normalizeGuideCode
} from '../../new-shipment/services/newShipmentService.js';

function getSessionUserId(user = {}) {
  return String(user?.uid || user?.id || '').trim();
}

function getProfileName(profile = {}, fallback = {}) {
  return String(
    profile?.name
    || fallback?.name
    || profile?.displayName
    || fallback?.displayName
    || profile?.email
    || fallback?.email
    || ''
  ).trim();
}

function createClaimError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function normalizeCurrentStep(value) {
  const step = Number(value);
  if (!Number.isFinite(step)) return 0;
  return Math.max(0, Math.min(3, step));
}

export async function claimUserShipmentGuide({
  fbase,
  appId,
  guideCode,
  currentUser = {}
} = {}) {
  const code = normalizeGuideCode(guideCode);
  const driverId = getSessionUserId(currentUser);

  if (!fbase || !appId) {
    throw createClaimError('DRIVE_MX_FIREBASE_UNAVAILABLE', 'Firebase no está disponible para ingresar la guía.');
  }
  if (!driverId) {
    throw createClaimError('DRIVE_MX_DRIVER_NOT_FOUND', 'No se pudo identificar al conductor.');
  }
  if (!isValidGuideCode(code)) {
    throw createClaimError('DRIVE_MX_INVALID_GUIDE', 'Ingresa un número de guía válido.');
  }

  const db = fbase.getFirestore();
  const trackingRef = getTrackingGuideRef({ fbase, db, appId, guideCode: code });
  const packageRef = getAdminShipmentRef({ fbase, db, appId, guideCode: code });
  const driverProfileRef = fbase.doc(db, 'artifacts', appId, 'public', 'data', 'operators', driverId);
  let claimedShipment = null;

  await fbase.runTransaction(db, async (transaction) => {
    const [trackingSnapshot, packageSnapshot, driverProfileSnapshot] = await Promise.all([
      transaction.get(trackingRef),
      transaction.get(packageRef),
      transaction.get(driverProfileRef)
    ]);

    if (!trackingSnapshot.exists()) {
      throw createClaimError('DRIVE_MX_GUIDE_NOT_FOUND', 'No se encontró la guía en Asignación de Guías.');
    }

    if (packageSnapshot.exists()) {
      const activePackage = packageSnapshot.data() || {};
      const assignedUserId = String(activePackage.assignedUserId || activePackage.op || '').trim();
      if (assignedUserId === driverId) {
        throw createClaimError('DRIVE_MX_ALREADY_ASSIGNED_TO_DRIVER', 'La guía ya se encuentra en tu Ruta Activa.');
      }
      throw createClaimError('DRIVE_MX_GUIDE_ALREADY_ASSIGNED', 'La guía ya fue ingresada por otro conductor.');
    }

    const trackingData = trackingSnapshot.data() || {};
    const sourceUserId = String(trackingData.sourceUserId || trackingData.ownerId || '').trim();
    const isUserAssignment = trackingData.sourcePanel === 'panel_usuario'
      && trackingData.shipmentScope === 'user'
      && Boolean(sourceUserId);

    if (!isUserAssignment) {
      throw createClaimError('DRIVE_MX_GUIDE_NOT_USER_ASSIGNMENT', 'La guía no pertenece a Asignación de Guías.');
    }

    const driverProfile = driverProfileSnapshot.exists() ? (driverProfileSnapshot.data() || {}) : {};
    const assignedUserName = getProfileName(driverProfile, currentUser);
    if (!assignedUserName) {
      throw createClaimError('DRIVE_MX_DRIVER_NAME_NOT_FOUND', 'No se encontró el nombre completo del conductor.');
    }

    const now = Date.now();
    const status = String(trackingData.status || 'Recolectado');
    const currentStep = normalizeCurrentStep(trackingData.currentStep);
    const sourceRef = getUserShipmentRef({
      fbase,
      db,
      appId,
      userId: sourceUserId,
      guideCode: code
    });

    claimedShipment = {
      ...trackingData,
      id: code,
      trackingNumber: code,
      op: driverId,
      assignedUserId: driverId,
      assignedUserName,
      assignedByUid: driverId,
      assignedAt: now,
      claimedAt: now,
      claimedFromUserShipment: true,
      assignmentType: 'conductor',
      ownerId: sourceUserId,
      sourceUserId,
      sourcePanel: 'panel_usuario',
      shipmentScope: 'user',
      status,
      currentStep,
      createdAt: trackingData.createdAt || now,
      updatedAt: now,
      updatedByUid: driverId
    };

    transaction.set(packageRef, claimedShipment);
    transaction.delete(sourceRef);
  });

  return claimedShipment;
}
