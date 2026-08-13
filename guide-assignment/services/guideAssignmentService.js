import {
  buildShipmentRecord,
  buildTrackingGuideRecord,
  createUniqueShipment,
  getTrackingGuideRef,
  getUserShipmentRef,
  normalizeGuideCode,
  normalizeShipmentForm,
  USER_SHIPMENTS_COLLECTION
} from '../../new-shipment/services/newShipmentService.js';

function baseDataPath(appId = '') {
  return ['artifacts', appId, 'public', 'data'];
}

export function getSessionUserId(user = {}) {
  return String(user?.uid || user?.id || '').trim();
}

export function subscribeUserShipments({ fbase, appId, user, onChange, onError } = {}) {
  const userId = getSessionUserId(user);
  if (!fbase || !appId || !userId) {
    onChange?.([]);
    return () => {};
  }

  const db = fbase.getFirestore();
  const collectionRef = fbase.collection(db, ...baseDataPath(appId), USER_SHIPMENTS_COLLECTION, userId, 'items');
  return fbase.onSnapshot(collectionRef, (snapshot) => {
    const shipments = [];
    snapshot.forEach((documentSnapshot) => shipments.push({ id: documentSnapshot.id, ...documentSnapshot.data() }));
    shipments.sort((a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0));
    onChange?.(shipments);
  }, (error) => {
    console.error('Firestore asignación de guías:', error);
    onError?.(error);
  });
}

export async function createUserShipment({ fbase, appId, form, user } = {}) {
  return createUniqueShipment({
    fbase,
    appId,
    form,
    mode: 'user',
    currentUser: user
  });
}

export async function updateUserShipment({ fbase, appId, user, shipment, patch = {} } = {}) {
  const userId = getSessionUserId(user);
  const guideCode = normalizeGuideCode(shipment?.id || shipment?.trackingNumber);
  if (!userId || !guideCode) throw new Error('No se pudo identificar la guía.');

  const db = fbase.getFirestore();
  const sourceRef = getUserShipmentRef({ fbase, db, appId, userId, guideCode });
  const trackingRef = getTrackingGuideRef({ fbase, db, appId, guideCode });

  const normalizedPatch = {};
  if ('fullName' in patch || 'phone' in patch || 'o' in patch || 'd' in patch || 'zip' in patch || 'references' in patch) {
    const normalized = normalizeShipmentForm({ ...shipment, ...patch });
    normalizedPatch.fullName = normalized.fullName;
    normalizedPatch.phone = normalized.phone;
    normalizedPatch.o = normalized.o;
    normalizedPatch.d = normalized.d;
    normalizedPatch.zip = normalized.zip;
    normalizedPatch.references = normalized.references;
    normalizedPatch.customer = {
      ...(shipment.customer || {}),
      fullName: normalized.fullName,
      phone: normalized.phone
    };
  }
  const nextShipment = buildShipmentRecord({
    form: { ...shipment, ...normalizedPatch },
    guideCode,
    mode: 'user',
    currentUser: user,
    existing: shipment
  });
  Object.assign(nextShipment, normalizedPatch, {
    id: guideCode,
    trackingNumber: guideCode,
    ownerId: userId,
    op: userId,
    assignedUserId: userId,
    sourcePanel: 'panel_usuario',
    shipmentScope: 'user',
    updatedAt: Date.now()
  });

  const trackingRecord = buildTrackingGuideRecord(nextShipment, {
    sourcePanel: 'panel_usuario',
    shipmentScope: 'user',
    sourceUserId: userId
  });

  await fbase.runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(sourceRef);
    if (!snapshot.exists()) throw new Error('La guía ya no existe.');
    transaction.set(sourceRef, nextShipment);
    transaction.set(trackingRef, trackingRecord, { merge: true });
  });

  return nextShipment;
}

export async function deleteUserShipment({ fbase, appId, user, guideCode } = {}) {
  const userId = getSessionUserId(user);
  const code = normalizeGuideCode(guideCode);
  if (!userId || !code) return;

  const db = fbase.getFirestore();
  const sourceRef = getUserShipmentRef({ fbase, db, appId, userId, guideCode: code });
  const trackingRef = getTrackingGuideRef({ fbase, db, appId, guideCode: code });

  await fbase.runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(sourceRef);
    if (!snapshot.exists()) return;
    transaction.delete(sourceRef);
    transaction.delete(trackingRef);
  });
}

