(function attachDriveMxSupermarketAccess(global) {
  'use strict';

  const React = global.React;
  if (!React) throw new Error('DriveMxSupermarketAccess: React no está disponible.');

  const { useState, useEffect, useRef, useCallback } = React;
  const STORAGE_PREFIX = 'driveMxSupermarketProductsAuthorized';
  const PROFILE_FIELD = 'supermarketProductsAuthorized';
  const PROFILE_DATE_FIELD = 'supermarketProductsAuthorizedAt';

  const clean = (value) => String(value ?? '').trim();
  const safeId = (value) => clean(value).replace(/[^a-zA-Z0-9_-]/g, '_');
  const getUserId = (user = {}) => clean(user.uid || user.id || user.userId || '');

  function fold(value) {
    return clean(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[\s_-]+/g, ' ')
      .trim();
  }

  function isSupermarketCategory(category) {
    const Supermercado = global.DriveMxSupermercado || global.DriveMxSupermercadoCore || {};
    if (typeof Supermercado.isSupermarketCategory === 'function') {
      return Supermercado.isSupermarketCategory(category);
    }
    return fold(category) === 'supermercado';
  }

  function localKey(user = {}) {
    const userId = safeId(getUserId(user));
    return userId ? `${STORAGE_PREFIX}_${userId}` : '';
  }

  function readLocalAuthorization(user = {}) {
    const key = localKey(user);
    if (!key) return false;
    try {
      const value = global.localStorage.getItem(key);
      if (!value) return false;
      if (value === 'true') return true;
      const parsed = JSON.parse(value);
      return parsed?.authorized === true;
    } catch (error) {
      return false;
    }
  }

  function writeLocalAuthorization(user = {}, authorized = true) {
    const key = localKey(user);
    if (!key) return;
    try {
      if (!authorized) {
        global.localStorage.removeItem(key);
        return;
      }
      global.localStorage.setItem(key, JSON.stringify({ authorized: true, authorizedAt: Date.now() }));
    } catch (error) {}
  }

  function isProfileAuthorized(user = {}) {
    return user?.role === 'admin'
      || user?.[PROFILE_FIELD] === true
      || user?.supermarketAccessAuthorized === true
      || user?.supermarketAuthorized === true;
  }

  function isAuthorized(user = {}) {
    return isProfileAuthorized(user) || readLocalAuthorization(user);
  }

  async function persistAuthorization({ fbase, appId, user = {}, onSessionUserChange = () => {} } = {}) {
    const userId = getUserId(user);
    if (!userId) throw new Error('No se pudo identificar al usuario.');
    const authorizedAt = Date.now();
    const patch = {
      [PROFILE_FIELD]: true,
      [PROFILE_DATE_FIELD]: authorizedAt,
      updatedAt: authorizedAt,
      updatedBy: clean(user.email || user.userEmail || '')
    };

    writeLocalAuthorization(user, true);

    try {
      const db = fbase.getFirestore();
      const profileRef = fbase.doc(db, 'artifacts', appId, 'public', 'data', 'operators', safeId(userId));
      await fbase.setDoc(profileRef, patch, { merge: true });
    } catch (error) {
      // La autorización local evita volver a solicitarla en este dispositivo.
      // Se conserva el acceso después de validar correctamente la contraseña,
      // aun cuando Firestore esté temporalmente sin conexión.
      console.error('Guardar autorización de Supermercado:', error);
    }

    onSessionUserChange({ ...user, ...patch });
    return patch;
  }

  function useSupermarketAccess({
    fbase,
    appId,
    sessionUser,
    verifyAdminPassword,
    onSessionUserChange = () => {}
  } = {}) {
    const [authorized, setAuthorized] = useState(() => isAuthorized(sessionUser || {}));
    const [promptVisible, setPromptVisible] = useState(false);
    const [password, setPassword] = useState('');
    const [processing, setProcessing] = useState(false);
    const [invalidAttempt, setInvalidAttempt] = useState(false);
    const pendingRef = useRef(null);

    useEffect(() => {
      setAuthorized(isAuthorized(sessionUser || {}));
      setPromptVisible(false);
      setPassword('');
      setProcessing(false);
      setInvalidAttempt(false);
      pendingRef.current = null;
    }, [sessionUser?.uid, sessionUser?.id, sessionUser?.role, sessionUser?.[PROFILE_FIELD], sessionUser?.supermarketAccessAuthorized, sessionUser?.supermarketAuthorized]);

    const cancelPrompt = useCallback(() => {
      pendingRef.current = null;
      setPromptVisible(false);
      setPassword('');
      setProcessing(false);
      setInvalidAttempt(false);
    }, []);

    const requestCategory = useCallback((category, applyCategory) => {
      if (typeof applyCategory !== 'function') return false;
      if (!isSupermarketCategory(category) || authorized || sessionUser?.role === 'admin') {
        cancelPrompt();
        applyCategory(category);
        return true;
      }

      pendingRef.current = { category, applyCategory };
      setPassword('');
      setInvalidAttempt(false);
      setPromptVisible(true);
      return false;
    }, [authorized, sessionUser?.role, cancelPrompt]);

    const submitPassword = useCallback(async (event) => {
      event?.preventDefault?.();
      if (processing || !promptVisible) return;
      const value = String(password || '');
      if (!value) {
        setInvalidAttempt(true);
        return;
      }
      if (typeof verifyAdminPassword !== 'function') {
        setInvalidAttempt(true);
        return;
      }

      setProcessing(true);
      setInvalidAttempt(false);
      try {
        await verifyAdminPassword(value);
        await persistAuthorization({ fbase, appId, user: sessionUser || {}, onSessionUserChange });
        setAuthorized(true);
        const pending = pendingRef.current;
        pendingRef.current = null;
        setPromptVisible(false);
        setPassword('');
        pending?.applyCategory?.(pending.category);
      } catch (error) {
        console.warn('Contraseña maestra de Supermercado no válida.');
        setPassword('');
        setInvalidAttempt(true);
      } finally {
        setProcessing(false);
      }
    }, [processing, promptVisible, password, verifyAdminPassword, fbase, appId, sessionUser, onSessionUserChange]);

    return {
      authorized,
      promptVisible,
      password,
      setPassword,
      processing,
      invalidAttempt,
      requestCategory,
      submitPassword,
      cancelPrompt
    };
  }

  function SupermarketPasswordPrompt({ manager } = {}) {
    if (!manager?.promptVisible) return null;
    return React.createElement('form', {
      onSubmit: manager.submitPassword,
      className: `drive-mx-supermarket-access ${manager.invalidAttempt ? 'drive-mx-supermarket-access--invalid' : ''}`,
      autoComplete: 'off'
    },
      React.createElement('input', {
        type: 'password',
        value: manager.password || '',
        onChange: (event) => manager.setPassword?.(event.target.value),
        onKeyDown: (event) => {
          if (event.key === 'Escape') manager.cancelPrompt?.();
        },
        placeholder: 'Introduce contraseña',
        'aria-label': 'Introduce contraseña',
        autoComplete: 'new-password',
        autoFocus: true,
        disabled: Boolean(manager.processing),
        className: 'drive-mx-supermarket-access__input'
      }),
      React.createElement('button', {
        type: 'submit',
        tabIndex: -1,
        'aria-hidden': 'true',
        className: 'drive-mx-supermarket-access__hidden-submit'
      }, 'Continuar')
    );
  }

  global.DriveMxSupermarketAccess = {
    STORAGE_PREFIX,
    PROFILE_FIELD,
    PROFILE_DATE_FIELD,
    isSupermarketCategory,
    isAuthorized,
    readLocalAuthorization,
    writeLocalAuthorization,
    persistAuthorization,
    useSupermarketAccess,
    SupermarketPasswordPrompt
  };
})(window);
