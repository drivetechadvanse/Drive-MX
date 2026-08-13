export const GUIDE_CODE_PATTERN = /^\d{6}-[A-Z]$/;
export const ADMIN_SHIPMENTS_COLLECTION = 'packages';
export const USER_SHIPMENTS_COLLECTION = 'user_shipments';
export const TRACKING_GUIDES_COLLECTION = 'tracking_guides';

const DUPLICATE_GUIDE_ERROR = 'DRIVE_MX_DUPLICATE_GUIDE';

export function normalizeGuideCode(value = '') {
  return String(value || '').toUpperCase().trim();
}

export function isValidGuideCode(value = '') {
  return GUIDE_CODE_PATTERN.test(normalizeGuideCode(value));
}

export function generateGuideCode(random = Math.random) {
  const numericPart = Math.floor(random() * 1000000).toString().padStart(6, '0');
  const letterPart = String.fromCharCode(65 + Math.floor(random() * 26));
  return `${numericPart}-${letterPart}`;
}

export function createEmptyShipmentForm(overrides = {}) {
  return {
    fullName: '',
    phone: '',
    o: '',
    d: '',
    zip: '',
    references: '',
    op: '',
    productId: '',
    ...overrides
  };
}

export function normalizeShipmentForm(form = {}) {
  return {
    fullName: String(form.fullName || '').trim(),
    phone: String(form.phone || '').trim(),
    o: String(form.o || '').trim(),
    d: String(form.d || '').trim(),
    zip: String(form.zip || '').trim(),
    references: String(form.references || '').trim(),
    op: String(form.op || '').trim(),
    productId: String(form.productId || '').trim()
  };
}

export function validateShipmentForm(form = {}, options = {}) {
  const normalized = normalizeShipmentForm(form);
  const requireOperator = options.requireOperator === true;

  if (normalized.fullName.length < 2) return { valid: false, message: 'Ingresa el nombre completo.', data: normalized };
  if (normalized.fullName.length > 160) return { valid: false, message: 'El nombre completo es demasiado largo.', data: normalized };
  if (normalized.phone.replace(/\D/g, '').length < 7) return { valid: false, message: 'Ingresa un número de teléfono válido.', data: normalized };
  if (normalized.phone.length > 60) return { valid: false, message: 'El número de teléfono es demasiado largo.', data: normalized };
  if (!normalized.o) return { valid: false, message: 'Ingresa el origen.', data: normalized };
  if (!normalized.d) return { valid: false, message: 'Ingresa el destino.', data: normalized };
  if (normalized.o.length > 240 || normalized.d.length > 500) return { valid: false, message: 'El origen o destino es demasiado largo.', data: normalized };
  if (!normalized.zip) return { valid: false, message: 'Ingresa el código postal.', data: normalized };
  if (normalized.zip.length > 20) return { valid: false, message: 'El código postal es demasiado largo.', data: normalized };
  if (!normalized.references) return { valid: false, message: 'Ingresa las referencias del domicilio.', data: normalized };
  if (normalized.references.length > 100) return { valid: false, message: 'Las referencias del domicilio solo permiten 100 caracteres.', data: normalized };
  if (requireOperator && !normalized.op) return { valid: false, message: 'Selecciona el usuario asignado.', data: normalized };

  return { valid: true, message: '', data: normalized };
}

function getUserId(user = {}) {
  return String(user?.uid || user?.id || '').trim();
}

function getUserEmail(user = {}) {
  return String(user?.email || '').trim().toLowerCase();
}

function getBaseDataPath(appId = '') {
  return ['artifacts', appId, 'public', 'data'];
}

export function getAdminShipmentRef({ fbase, db, appId, guideCode }) {
  return fbase.doc(db, ...getBaseDataPath(appId), ADMIN_SHIPMENTS_COLLECTION, normalizeGuideCode(guideCode));
}

export function getTrackingGuideRef({ fbase, db, appId, guideCode }) {
  return fbase.doc(db, ...getBaseDataPath(appId), TRACKING_GUIDES_COLLECTION, normalizeGuideCode(guideCode));
}

export function getUserShipmentRef({ fbase, db, appId, userId, guideCode }) {
  return fbase.doc(db, ...getBaseDataPath(appId), USER_SHIPMENTS_COLLECTION, String(userId || '').trim(), 'items', normalizeGuideCode(guideCode));
}

export function buildShipmentRecord({ form = {}, guideCode = '', mode = 'admin', currentUser = {}, existing = null } = {}) {
  const normalized = normalizeShipmentForm(form);
  const code = normalizeGuideCode(guideCode);
  const now = Date.now();
  const userId = getUserId(currentUser);
  const userEmail = getUserEmail(currentUser);
  const isUserShipment = mode === 'user';
  const assignedUserId = isUserShipment ? userId : normalized.op;

  return {
    ...(existing || {}),
    id: code,
    trackingNumber: code,
    fullName: normalized.fullName,
    phone: normalized.phone,
    customer: {
      ...((existing && existing.customer) || {}),
      fullName: normalized.fullName,
      phone: normalized.phone
    },
    o: normalized.o,
    d: normalized.d,
    zip: normalized.zip,
    references: normalized.references,
    op: assignedUserId,
    assignedUserId,
    productId: normalized.productId || existing?.productId || '',
    ownerId: isUserShipment ? userId : (existing?.ownerId || ''),
    sourcePanel: isUserShipment ? 'panel_usuario' : 'panel_control',
    shipmentScope: isUserShipment ? 'user' : 'admin',
    status: existing?.status || 'Recolectado',
    currentStep: Number.isFinite(Number(existing?.currentStep)) ? Number(existing.currentStep) : 0,
    createdAt: existing?.createdAt || now,
    createdByUid: existing?.createdByUid || userId,
    createdByEmail: existing?.createdByEmail || userEmail,
    updatedAt: now,
    updatedByUid: userId,
    updatedByEmail: userEmail
  };
}

export function buildTrackingGuideRecord(shipment = {}, options = {}) {
  const code = normalizeGuideCode(shipment.id || shipment.trackingNumber);
  const customer = shipment.customer || {};
  const now = Date.now();

  return {
    id: code,
    trackingNumber: code,
    fullName: String(shipment.fullName || customer.fullName || '').trim(),
    phone: String(shipment.phone || customer.phone || '').trim(),
    customer: {
      fullName: String(shipment.fullName || customer.fullName || '').trim(),
      phone: String(shipment.phone || customer.phone || '').trim()
    },
    o: shipment.o || '',
    d: shipment.d || '',
    zip: shipment.zip || '',
    references: shipment.references || '',
    status: shipment.status || 'Recolectado',
    currentStep: Number.isFinite(Number(shipment.currentStep)) ? Number(shipment.currentStep) : 0,
    op: shipment.op || shipment.assignedUserId || '',
    assignedUserId: shipment.assignedUserId || shipment.op || '',
    ownerId: shipment.ownerId || '',
    sourcePanel: shipment.sourcePanel || options.sourcePanel || 'panel_control',
    shipmentScope: shipment.shipmentScope || options.shipmentScope || 'admin',
    sourceUserId: options.sourceUserId || shipment.ownerId || '',
    productId: shipment.productId || '',
    orderId: shipment.orderId || '',
    transferId: shipment.transferId || '',
    createdAt: shipment.createdAt || now,
    updatedAt: shipment.updatedAt || now
  };
}

function duplicateGuideError(code) {
  const error = new Error(`La guía ${code} ya existe.`);
  error.code = DUPLICATE_GUIDE_ERROR;
  return error;
}

export async function createUniqueShipment({
  fbase,
  appId,
  form,
  mode = 'admin',
  currentUser = {},
  maxAttempts = 80
} = {}) {
  if (!fbase || !appId) throw new Error('Firebase no está disponible para crear la guía.');

  const isUserShipment = mode === 'user';
  const validation = validateShipmentForm(form, { requireOperator: !isUserShipment });
  if (!validation.valid) throw new Error(validation.message);

  const userId = getUserId(currentUser);
  if (isUserShipment && !userId) throw new Error('No se pudo identificar al usuario que crea la guía.');

  const db = fbase.getFirestore();

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const guideCode = generateGuideCode();
    const trackingRef = getTrackingGuideRef({ fbase, db, appId, guideCode });
    const adminRef = getAdminShipmentRef({ fbase, db, appId, guideCode });
    const sourceRef = isUserShipment
      ? getUserShipmentRef({ fbase, db, appId, userId, guideCode })
      : adminRef;

    try {
      let createdShipment = null;
      await fbase.runTransaction(db, async (transaction) => {
        const refsToCheck = sourceRef.path === adminRef.path
          ? [trackingRef, adminRef]
          : [trackingRef, adminRef, sourceRef];
        const snapshots = await Promise.all(refsToCheck.map((reference) => transaction.get(reference)));
        if (snapshots.some((snapshot) => snapshot.exists())) throw duplicateGuideError(guideCode);

        createdShipment = buildShipmentRecord({
          form: validation.data,
          guideCode,
          mode,
          currentUser
        });
        const trackingRecord = buildTrackingGuideRecord(createdShipment, {
          sourcePanel: isUserShipment ? 'panel_usuario' : 'panel_control',
          shipmentScope: isUserShipment ? 'user' : 'admin',
          sourceUserId: isUserShipment ? userId : ''
        });

        transaction.set(sourceRef, createdShipment);
        transaction.set(trackingRef, trackingRecord);
      });

      return createdShipment;
    } catch (error) {
      if (error?.code === DUPLICATE_GUIDE_ERROR) continue;
      throw error;
    }
  }

  throw new Error('No fue posible generar una guía única. Intenta nuevamente.');
}

export async function findGuideByCode({ fbase, appId, guideCode } = {}) {
  const code = normalizeGuideCode(guideCode);
  if (!code || !fbase || !appId) return null;

  const db = fbase.getFirestore();
  const trackingRef = getTrackingGuideRef({ fbase, db, appId, guideCode: code });
  const trackingSnapshot = await fbase.getDoc(trackingRef);
  if (trackingSnapshot.exists()) return { id: trackingSnapshot.id, ...trackingSnapshot.data() };

  // Compatibilidad con guías creadas antes de instalar el índice público.
  const legacyRef = getAdminShipmentRef({ fbase, db, appId, guideCode: code });
  const legacySnapshot = await fbase.getDoc(legacyRef);
  if (legacySnapshot.exists()) return { id: legacySnapshot.id, ...legacySnapshot.data() };

  return null;
}

export async function upsertTrackingGuide({ fbase, appId, shipment, sourceUserId = '' } = {}) {
  const code = normalizeGuideCode(shipment?.id || shipment?.trackingNumber);
  if (!code || !fbase || !appId) return null;

  const db = fbase.getFirestore();
  const trackingRef = getTrackingGuideRef({ fbase, db, appId, guideCode: code });
  const record = buildTrackingGuideRecord(shipment, { sourceUserId });
  await fbase.setDoc(trackingRef, record, { merge: true });
  return record;
}

export async function updateAdminShipmentWithTracking({ fbase, appId, shipment, patch = {} } = {}) {
  const code = normalizeGuideCode(shipment?.id || shipment?.trackingNumber);
  if (!code || !fbase || !appId) throw new Error('No se encontró el número de guía.');

  const db = fbase.getFirestore();
  const shipmentRef = getAdminShipmentRef({ fbase, db, appId, guideCode: code });
  const trackingRef = getTrackingGuideRef({ fbase, db, appId, guideCode: code });
  const updatedAt = Date.now();
  const shipmentPatch = { ...patch, updatedAt };
  const nextShipment = { ...(shipment || {}), ...shipmentPatch, id: code };
  const trackingPatch = { updatedAt };

  if ('status' in patch) trackingPatch.status = patch.status;
  if ('currentStep' in patch) trackingPatch.currentStep = Number(patch.currentStep);

  await fbase.runTransaction(db, async (transaction) => {
    // Las guías antiguas pueden no tener todavía el espejo de tracking_guides.
    // En ese caso se actualiza packages y el rastreador público usa su fallback legado.
    const trackingSnapshot = await transaction.get(trackingRef);
    transaction.set(shipmentRef, shipmentPatch, { merge: true });
    if (trackingSnapshot.exists()) transaction.set(trackingRef, trackingPatch, { merge: true });
  });

  return nextShipment;
}

export async function deleteAdminShipmentWithTracking({ fbase, appId, guideCode } = {}) {
  const code = normalizeGuideCode(guideCode);
  if (!code || !fbase || !appId) return;

  const db = fbase.getFirestore();
  const shipmentRef = getAdminShipmentRef({ fbase, db, appId, guideCode: code });
  const trackingRef = getTrackingGuideRef({ fbase, db, appId, guideCode: code });

  await fbase.runTransaction(db, async (transaction) => {
    transaction.delete(shipmentRef);
    transaction.delete(trackingRef);
  });
}
