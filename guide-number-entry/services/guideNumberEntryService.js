import {
  isValidGuideCode,
  normalizeGuideCode
} from '../../new-shipment/services/newShipmentService.js';

const ERROR_CODES = {
  INVALID_GUIDE: 'DRIVE_MX_INVALID_GUIDE',
  NOT_FOUND: 'DRIVE_MX_GUIDE_NOT_FOUND',
  ALREADY_ASSIGNED: 'DRIVE_MX_GUIDE_ALREADY_ASSIGNED',
  NOT_AUTHORIZED: 'DRIVE_MX_ASSIGNMENTS_NOT_AUTHORIZED',
  SESSION_REQUIRED: 'DRIVE_MX_SESSION_REQUIRED',
  SERVER_ERROR: 'DRIVE_MX_ASSIGNMENT_SERVER_ERROR'
};

function createServiceError(code, message, status = 0) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function getAuthenticatedFirebaseUser(fbase) {
  try {
    return fbase?.getAuth?.()?.currentUser || null;
  } catch (error) {
    return null;
  }
}

async function getFreshIdToken(fbase) {
  const authUser = getAuthenticatedFirebaseUser(fbase);
  if (!authUser || typeof authUser.getIdToken !== 'function') {
    throw createServiceError(
      ERROR_CODES.SESSION_REQUIRED,
      'Tu sesión expiró. Inicia sesión nuevamente para asignar la guía.',
      401
    );
  }
  return authUser.getIdToken(true);
}

async function readApiResponse(response) {
  const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase();
  if (contentType.includes('application/json')) {
    return response.json().catch(() => ({}));
  }
  const text = await response.text().catch(() => '');
  return text ? { error: text } : {};
}

export async function claimGuideForAuthenticatedUser({
  fbase,
  appId,
  guideCode
} = {}) {
  if (!fbase || !appId) {
    throw createServiceError(ERROR_CODES.SERVER_ERROR, 'Firebase no está disponible para asignar la guía.');
  }

  const code = normalizeGuideCode(guideCode);
  if (!isValidGuideCode(code)) {
    throw createServiceError(ERROR_CODES.INVALID_GUIDE, 'Ingresa un número de guía válido.', 400);
  }

  const idToken = await getFreshIdToken(fbase);
  let response;

  try {
    response = await fetch('/api/claim-guide', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`
      },
      body: JSON.stringify({
        guideCode: code,
        appId
      })
    });
  } catch (error) {
    throw createServiceError(
      ERROR_CODES.SERVER_ERROR,
      'No se pudo conectar con el servicio de asignación. Intenta nuevamente.'
    );
  }

  const payload = await readApiResponse(response);
  if (!response.ok || payload?.success !== true) {
    const codeFromServer = String(payload?.code || ERROR_CODES.SERVER_ERROR);
    const message = String(payload?.error || payload?.message || 'No se pudo asignar la guía.');
    throw createServiceError(codeFromServer, message, response.status);
  }

  return payload.shipment || {
    id: code,
    trackingNumber: code
  };
}

export { ERROR_CODES };

