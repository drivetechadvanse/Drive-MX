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

function getUserId(user = {}) {
  return String(user?.uid || user?.id || '').trim();
}

function getDefaultAuth(fbase) {
  try {
    return fbase?.getAuth?.() || null;
  } catch (error) {
    return null;
  }
}

function matchesExpectedUser(authUser, expectedUserId = '') {
  if (!authUser || authUser.isAnonymous === true) return false;
  if (!expectedUserId) return true;
  return String(authUser.uid || '').trim() === expectedUserId;
}

async function waitForAuthenticatedUser(fbase, currentUser = {}) {
  const auth = getDefaultAuth(fbase);
  const expectedUserId = getUserId(currentUser);

  if (!auth) {
    throw createServiceError(
      ERROR_CODES.SESSION_REQUIRED,
      'No se pudo validar la sesión actual del usuario.',
      401
    );
  }

  if (typeof auth.authStateReady === 'function') {
    try {
      await auth.authStateReady();
    } catch (error) {
      // El listener de abajo todavía puede recuperar la sesión activa.
    }
  }

  if (matchesExpectedUser(auth.currentUser, expectedUserId)) {
    return auth.currentUser;
  }

  if (typeof fbase?.onAuthStateChanged === 'function') {
    const resolvedUser = await new Promise((resolve) => {
      let finished = false;
      let timer = null;
      let unsubscribe = () => {};
      const finish = (user = null) => {
        if (finished) return;
        finished = true;
        if (timer) clearTimeout(timer);
        try { unsubscribe(); } catch (error) {}
        resolve(user);
      };
      timer = setTimeout(() => finish(null), 2500);
      unsubscribe = fbase.onAuthStateChanged(
        auth,
        (user) => {
          if (matchesExpectedUser(user, expectedUserId)) finish(user);
        },
        () => finish(null)
      );
    });

    if (resolvedUser) return resolvedUser;
  }

  throw createServiceError(
    ERROR_CODES.SESSION_REQUIRED,
    'No se pudo validar la sesión actual del usuario.',
    401
  );
}

async function getIdToken(authUser, forceRefresh = false) {
  if (!authUser || typeof authUser.getIdToken !== 'function') {
    throw createServiceError(
      ERROR_CODES.SESSION_REQUIRED,
      'No se pudo validar la sesión actual del usuario.',
      401
    );
  }

  try {
    return await authUser.getIdToken(forceRefresh);
  } catch (error) {
    throw createServiceError(
      ERROR_CODES.SESSION_REQUIRED,
      'No se pudo validar la sesión actual del usuario.',
      401
    );
  }
}

async function readApiResponse(response) {
  const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase();
  if (contentType.includes('application/json')) {
    return response.json().catch(() => ({}));
  }
  const text = await response.text().catch(() => '');
  return text ? { error: text } : {};
}

async function sendClaimRequest({ idToken, appId, guideCode }) {
  let response;
  try {
    response = await fetch('/api/claim-guide', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`
      },
      body: JSON.stringify({
        guideCode,
        appId
      })
    });
  } catch (error) {
    throw createServiceError(
      ERROR_CODES.SERVER_ERROR,
      'No se pudo conectar con el servicio de asignación. Intenta nuevamente.'
    );
  }

  return {
    response,
    payload: await readApiResponse(response)
  };
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
    throw createServiceError(ERROR_CODES.INVALID_GUIDE, 'Ingresa un número de guía válido.', 400);
  }

  const authUser = await waitForAuthenticatedUser(fbase, currentUser);
  let idToken = await getIdToken(authUser, false);
  let result = await sendClaimRequest({ idToken, appId, guideCode: code });

  // Solo se renueva una vez cuando el servidor confirma que el token recibido
  // no es válido. No se fuerza la renovación antes de cada asignación.
  if (result.response.status === 401) {
    idToken = await getIdToken(authUser, true);
    result = await sendClaimRequest({ idToken, appId, guideCode: code });
  }

  const { response, payload } = result;
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


