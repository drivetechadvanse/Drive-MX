(function (global) {
  'use strict';

  const React = global.React;
  if (!React) throw new Error('DriveMxSupermarketAccess: React no está disponible.');

  const { useState, useEffect, useRef, useCallback } = React;
  const SUPPORT_PHONE = '5633535701';

  function getSupermarketModule() {
    return global.DriveMxSupermercado || global.DriveMxSupermercadoCore || {};
  }

  function isSupermarketCategory(value = '') {
    const Supermercado = getSupermarketModule();
    if (typeof Supermercado.isSupermarketCategory === 'function') {
      return Supermercado.isSupermarketCategory(value);
    }
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase() === 'supermercado';
  }

  function getProfileId(profile = {}) {
    return String(profile.uid || profile.id || '').trim();
  }

  function isAuthorizedProfile(profile = {}) {
    return profile?.role === 'admin' || profile?.supermarketProductsAuthorized === true;
  }

  function useSupermarketAccess({
    fbase,
    appId,
    sessionUser,
    verifyAdminPassword = async () => false,
    onSessionUserChange = () => {}
  } = {}) {
    const [isOpen, setIsOpen] = useState(false);
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [verifying, setVerifying] = useState(false);
    const [authorized, setAuthorized] = useState(() => isAuthorizedProfile(sessionUser || {}));
    const pendingActionRef = useRef(null);
    const profileId = getProfileId(sessionUser || {});

    const close = useCallback(() => {
      if (verifying) return;
      pendingActionRef.current = null;
      setIsOpen(false);
      setPassword('');
      setError('');
    }, [verifying]);

    useEffect(() => {
      setAuthorized(isAuthorizedProfile(sessionUser || {}));
      pendingActionRef.current = null;
      setIsOpen(false);
      setPassword('');
      setError('');
      setVerifying(false);
    }, [profileId, sessionUser?.supermarketProductsAuthorized, sessionUser?.role]);

    const requestAccess = useCallback((onAuthorized) => {
      if (authorized || isAuthorizedProfile(sessionUser || {})) {
        if (typeof onAuthorized === 'function') onAuthorized();
        return true;
      }
      pendingActionRef.current = typeof onAuthorized === 'function' ? onAuthorized : null;
      setPassword('');
      setError('');
      setIsOpen(true);
      return false;
    }, [authorized, sessionUser]);

    const requestCategoryChange = useCallback((category, applyCategory) => {
      if (!isSupermarketCategory(category)) {
        if (typeof applyCategory === 'function') applyCategory(category);
        return true;
      }
      return requestAccess(() => {
        if (typeof applyCategory === 'function') applyCategory(category);
      });
    }, [requestAccess]);

    const confirm = useCallback(async (event) => {
      event?.preventDefault?.();
      if (verifying) return;
      const enteredPassword = String(password || '');
      if (!enteredPassword) {
        setError('Ingresa la contraseña.');
        return;
      }
      if (!profileId || !fbase || !appId) {
        setError('No se pudo identificar al usuario.');
        return;
      }

      setVerifying(true);
      setError('');
      try {
        const verified = await verifyAdminPassword(enteredPassword);
        if (verified !== true) throw new Error('Contraseña incorrecta.');

        const authorizedAt = Date.now();
        const authorizationPatch = {
          supermarketProductsAuthorized: true,
          supermarketProductsAuthorizedAt: authorizedAt,
          updatedAt: authorizedAt,
          updatedBy: sessionUser?.email || ''
        };
        const operatorRef = fbase.doc(
          fbase.getFirestore(),
          'artifacts',
          appId,
          'public',
          'data',
          'operators',
          profileId
        );
        await fbase.setDoc(operatorRef, authorizationPatch, { merge: true });

        const nextProfile = { ...(sessionUser || {}), ...authorizationPatch };
        setAuthorized(true);
        onSessionUserChange(nextProfile);

        const pendingAction = pendingActionRef.current;
        pendingActionRef.current = null;
        setIsOpen(false);
        setPassword('');
        setError('');
        if (typeof pendingAction === 'function') pendingAction();
      } catch (validationError) {
        console.error('Validar contraseña maestra para Supermercado:', validationError);
        const code = String(validationError?.code || '');
        setError(code.startsWith('auth/') ? 'Contraseña incorrecta.' : (validationError?.message || 'No se pudo validar la contraseña.'));
      } finally {
        setVerifying(false);
      }
    }, [verifying, password, profileId, fbase, appId, verifyAdminPassword, sessionUser, onSessionUserChange]);

    return {
      authorized,
      isOpen,
      password,
      setPassword,
      error,
      verifying,
      requestAccess,
      requestCategoryChange,
      confirm,
      close
    };
  }

  function SupermarketPasswordModal({ manager } = {}) {
    if (!manager?.isOpen) return null;

    return React.createElement('div', {
      className: 'drive-mx-supermarket-access-overlay',
      role: 'presentation',
      onMouseDown: (event) => {
        if (event.target === event.currentTarget) manager.close?.();
      }
    },
      React.createElement('div', {
        className: 'drive-mx-supermarket-access-card',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': 'drive-mx-supermarket-access-title'
      },
        React.createElement('form', { onSubmit: manager.confirm },
          React.createElement('h2', {
            id: 'drive-mx-supermarket-access-title',
            className: 'drive-mx-supermarket-access-title'
          }, 'Ingresa contraseña'),
          React.createElement('input', {
            required: true,
            autoFocus: true,
            type: 'password',
            autoComplete: 'current-password',
            className: 'drive-mx-supermarket-access-input',
            placeholder: 'INGRESA CONTRASEÑA',
            value: manager.password || '',
            disabled: Boolean(manager.verifying),
            onChange: (event) => manager.setPassword?.(event.target.value)
          }),
          React.createElement('p', {
            className: 'drive-mx-supermarket-access-support'
          }, `comunicate con soporte al ${SUPPORT_PHONE}`),
          manager.error ? React.createElement('p', {
            className: 'drive-mx-supermarket-access-error',
            role: 'alert'
          }, manager.error) : null,
          React.createElement('div', { className: 'drive-mx-supermarket-access-actions' },
            React.createElement('button', {
              type: 'button',
              className: 'drive-mx-supermarket-access-cancel',
              disabled: Boolean(manager.verifying),
              onClick: manager.close
            }, 'Cancelar'),
            React.createElement('button', {
              type: 'submit',
              className: 'drive-mx-supermarket-access-submit',
              disabled: Boolean(manager.verifying)
            }, manager.verifying ? 'Validando...' : 'Continuar')
          )
        )
      )
    );
  }

  global.DriveMxSupermarketAccess = {
    SUPPORT_PHONE,
    isSupermarketCategory,
    isAuthorizedProfile,
    useSupermarketAccess,
    SupermarketPasswordModal
  };
})(window);
