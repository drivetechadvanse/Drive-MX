(function attachDriveMxWalletPayment(global) {
  'use strict';

  const React = global.React;
  if (!React) throw new Error('DriveMxWalletPayment: React no está disponible.');

  const { useState, useCallback, useRef } = React;
  const SECONDARY_APP_NAME = 'DriveMxWalletPaymentAuthApp';
  const PAYMENT_ENDPOINT = '/api/pay-with-wallet';
  const MAX_ATTEMPTS = 2;
  const BUILD = '2026-08-22-wallet-server-final-v2';
  const persistencePromises = new WeakMap();

  const clean = (value) => String(value ?? '').trim();
  const normalizeEmail = (value) => clean(value).replace(/\s+/g, '').toLowerCase();
  const safeId = (value) => clean(value).replace(/[^a-zA-Z0-9_-]/g, '_');
  const roundMoney = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

  function createPaymentId() {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const bytes = new Uint8Array(6);
    if (global.crypto?.getRandomValues) {
      global.crypto.getRandomValues(bytes);
    } else {
      for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
    }
    const suffix = Array.from(bytes, (value) => alphabet[value % alphabet.length]).join('');
    return `WP-${Date.now()}-${suffix}`;
  }

  function formatMoney(value) {
    return `$${roundMoney(value).toLocaleString('es-MX', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })} MXN`;
  }

  function publicError(message, code = 'wallet-payment-error') {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function normalizeAuthError(error = {}) {
    const code = clean(error.code).toLowerCase();
    if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found') || code.includes('invalid-login-credentials')) {
      return publicError('El usuario o la contraseña no son correctos.', 'wallet-invalid-credentials');
    }
    if (code.includes('too-many-requests')) {
      return publicError('Se realizaron demasiados intentos. Intenta nuevamente más tarde.', 'wallet-too-many-attempts');
    }
    if (code.includes('network-request-failed')) {
      return publicError('No se pudo validar la cartera por un problema de conexión.', 'wallet-network-error');
    }
    return publicError('No se pudo validar la cartera.', code || 'wallet-auth-error');
  }

  function getSecondaryAuth({ fbase, firebaseConfig } = {}) {
    if (!fbase?.initializeApp || !fbase?.getAuth || !firebaseConfig) {
      throw publicError('Firebase no está disponible para validar la cartera.', 'wallet-firebase-unavailable');
    }

    let app = global.driveMxWalletPaymentAuthApp;
    if (!app || app.name !== SECONDARY_APP_NAME) {
      try {
        app = fbase.getApp(SECONDARY_APP_NAME);
      } catch (error) {
        try {
          app = fbase.initializeApp(firebaseConfig, SECONDARY_APP_NAME);
        } catch (initializeError) {
          if (initializeError?.code === 'app/duplicate-app') {
            app = fbase.getApp(SECONDARY_APP_NAME);
          } else {
            throw initializeError;
          }
        }
      }
      global.driveMxWalletPaymentAuthApp = app;
      global.driveMxWalletPaymentAuth = null;
    }

    const auth = global.driveMxWalletPaymentAuth || fbase.getAuth(app);
    global.driveMxWalletPaymentAuth = auth;
    return auth;
  }

  async function prepareSecondaryAuth({ fbase, firebaseConfig } = {}) {
    const auth = getSecondaryAuth({ fbase, firebaseConfig });
    if (typeof fbase?.setPersistence === 'function' && fbase?.inMemoryPersistence) {
      let promise = persistencePromises.get(auth);
      if (!promise) {
        promise = fbase.setPersistence(auth, fbase.inMemoryPersistence).catch((error) => {
          persistencePromises.delete(auth);
          throw error;
        });
        persistencePromises.set(auth, promise);
      }
      await promise;
    }
    return auth;
  }

  function profileIsBlocked(profile = {}) {
    return profile.active === false
      || profile.blocked === true
      || ['bloqueado', 'inactivo'].includes(clean(profile.accountStatus).toLowerCase());
  }

  async function readWalletIdentity({ fbase, appId, credentialUser, firebaseApp, Wallet } = {}) {
    const uid = clean(credentialUser?.uid);
    if (!uid) throw publicError('No se pudo identificar la cartera.', 'wallet-user-missing');

    const db = fbase.getFirestore(firebaseApp || credentialUser?.auth?.app);
    const profileRef = fbase.doc(db, 'artifacts', appId, 'public', 'data', 'operators', safeId(uid));
    const walletRef = fbase.doc(db, 'artifacts', appId, 'public', 'data', 'wallets', safeId(uid));
    const [profileSnapshot, walletSnapshot] = await Promise.all([
      fbase.getDoc(profileRef),
      fbase.getDoc(walletRef)
    ]);

    if (!profileSnapshot.exists()) {
      throw publicError('El usuario no tiene una cuenta activa en Drive MX.', 'wallet-profile-not-found');
    }

    const profile = { id: profileSnapshot.id, ...profileSnapshot.data() };
    if (profile.role === 'admin' || profileIsBlocked(profile)) {
      throw publicError('La cuenta no está disponible para pagar con cartera.', 'wallet-account-not-available');
    }

    const walletData = walletSnapshot.exists() ? { id: walletSnapshot.id, ...walletSnapshot.data() } : null;
    const wallet = typeof Wallet?.normalizeWallet === 'function'
      ? Wallet.normalizeWallet(walletData, profile)
      : {
          ...(walletData || {}),
          id: uid,
          userId: uid,
          uid,
          balance: roundMoney(walletData?.balance || 0),
          activated: walletData?.activated === true
        };

    return {
      uid,
      email: normalizeEmail(credentialUser.email || profile.email || ''),
      name: clean(profile.name || wallet.userName || credentialUser.email || 'Usuario'),
      profile,
      wallet,
      walletExists: walletSnapshot.exists()
    };
  }

  function parseServerPayload(rawResponse = '') {
    const raw = clean(rawResponse);
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
      return { error: raw.slice(0, 500) };
    }
  }

  async function postWalletPayment({ token, paymentId, order } = {}) {
    let lastError = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const controller = new AbortController();
      const timeoutId = global.setTimeout(() => controller.abort(), 45000);
      try {
        const response = await global.fetch(PAYMENT_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ paymentId, order }),
          signal: controller.signal,
          cache: 'no-store'
        });

        const rawResponse = await response.text();
        const payload = parseServerPayload(rawResponse);
        if (!response.ok || payload.success !== true) {
          let fallbackMessage = `No se pudo procesar el pago (${response.status}).`;
          if (response.status === 404) fallbackMessage = 'La función de cobro con cartera no está publicada en el servidor.';
          if (response.status === 405) fallbackMessage = 'La función de cobro con cartera no acepta esta solicitud.';
          if (response.status === 413) fallbackMessage = 'El pedido supera el tamaño permitido por el servidor.';
          const error = publicError(payload.error || fallbackMessage, payload.code || `HTTP_${response.status}`);
          error.httpStatus = response.status;
          error.details = payload.details || null;
          error.stage = payload.stage || '';
          error.serverPayload = payload;
          throw error;
        }
        return payload;
      } catch (error) {
        const normalized = error?.name === 'AbortError'
          ? publicError('El cobro excedió el tiempo máximo de espera.', 'wallet-payment-timeout')
          : error;
        lastError = normalized;
        const status = Number(normalized.httpStatus || 0);
        const code = clean(normalized.code).toLowerCase();
        const permanentError = [
          'firebase-admin-not-configured',
          'firebase-admin-invalid-credentials',
          'firebase-admin-permission-denied',
          'wallet-firestore-invalid-data',
          'wallet-firestore-precondition',
          'wallet-auth-invalid',
          'wallet-profile-not-found',
          'wallet-profile-mismatch',
          'wallet-insufficient-funds',
          'seller-wallet',
          'product-',
          'order-total-changed'
        ].some((item) => code.includes(item));
        const retryable = !permanentError && (!status || status === 408 || status === 429 || status >= 500);
        if (attempt >= MAX_ATTEMPTS || !retryable) throw normalized;
        await new Promise((resolve) => global.setTimeout(resolve, 700 * attempt));
      } finally {
        global.clearTimeout(timeoutId);
      }
    }
    throw lastError || publicError('No se pudo procesar el pago.', 'wallet-payment-error');
  }

  function useWalletPayment({ fbase, firebaseConfig, appId, Wallet = global.DriveMxWallet } = {}) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [verified, setVerified] = useState(false);
    const [verifying, setVerifying] = useState(false);
    const [paying, setPaying] = useState(false);
    const [error, setError] = useState('');
    const [identity, setIdentity] = useState(null);
    const credentialRef = useRef(null);
    const paymentIdRef = useRef('');

    const getOrCreatePaymentId = useCallback(() => {
      if (!paymentIdRef.current) paymentIdRef.current = createPaymentId();
      return paymentIdRef.current;
    }, []);

    const clearState = useCallback(() => {
      setUsername('');
      setPassword('');
      setVerified(false);
      setVerifying(false);
      setPaying(false);
      setError('');
      setIdentity(null);
      credentialRef.current = null;
      paymentIdRef.current = '';
    }, []);

    const reset = useCallback(async () => {
      const auth = (() => {
        try { return getSecondaryAuth({ fbase, firebaseConfig }); } catch (error) { return null; }
      })();
      clearState();
      if (auth) {
        try { await fbase.signOut(auth); } catch (error) {}
      }
    }, [fbase, firebaseConfig, clearState]);

    const verifyCredentials = useCallback(async (event) => {
      event?.preventDefault?.();
      if (verifying || paying) return;
      const email = normalizeEmail(username);
      if (!email || !password) {
        setError('Ingresa usuario y contraseña.');
        return;
      }

      setVerifying(true);
      setError('');
      try {
        const auth = await prepareSecondaryAuth({ fbase, firebaseConfig });
        try { await fbase.signOut(auth); } catch (signOutError) {}
        const credential = await fbase.signInWithEmailAndPassword(auth, email, password);
        const nextIdentity = await readWalletIdentity({
          fbase,
          appId,
          credentialUser: credential.user,
          firebaseApp: auth.app,
          Wallet
        });
        credentialRef.current = credential;
        setIdentity(nextIdentity);
        setUsername(nextIdentity.email || email);
        setPassword('');
        setVerified(true);
      } catch (authError) {
        const normalized = authError?.code?.startsWith?.('wallet-') ? authError : normalizeAuthError(authError);
        setVerified(false);
        setIdentity(null);
        credentialRef.current = null;
        setPassword('');
        setError(normalized.message);
      } finally {
        setVerifying(false);
      }
    }, [verifying, paying, username, password, fbase, firebaseConfig, appId, Wallet]);

    const pay = useCallback(async ({ paymentId, order } = {}) => {
      if (!verified || !credentialRef.current?.user) {
        throw publicError('Valida el usuario y la contraseña de la cartera.', 'wallet-not-verified');
      }
      const stablePaymentId = clean(paymentId) || getOrCreatePaymentId();
      setPaying(true);
      setError('');
      try {
        const token = await credentialRef.current.user.getIdToken(true);
        const result = await postWalletPayment({ token, paymentId: stablePaymentId, order });
        if (result.wallet) {
          setIdentity((previous) => previous ? ({ ...previous, wallet: { ...(previous.wallet || {}), ...result.wallet } }) : previous);
        }
        return result;
      } catch (paymentError) {
        setError(paymentError.message || 'No se pudo procesar el pago con cartera.');
        throw paymentError;
      } finally {
        setPaying(false);
      }
    }, [verified, getOrCreatePaymentId]);

    const availableBalance = roundMoney(identity?.wallet?.balance || 0);
    const canPay = useCallback((total) => verified
      && identity?.walletExists === true
      && availableBalance >= roundMoney(total)
      && !verifying
      && !paying, [verified, identity?.walletExists, availableBalance, verifying, paying]);

    return {
      username,
      setUsername,
      password,
      setPassword,
      verified,
      verifying,
      paying,
      error,
      identity,
      availableBalance,
      verifyCredentials,
      pay,
      canPay,
      getOrCreatePaymentId,
      reset
    };
  }

  function WalletCredentialsCard({ manager, total = 0 } = {}) {
    if (!manager) return null;
    if (manager.verified) {
      const sufficient = manager.availableBalance >= roundMoney(total);
      return React.createElement('div', { className: 'drive-mx-wallet-payment drive-mx-wallet-payment--verified' },
        React.createElement('div', { className: 'drive-mx-wallet-payment__verified-icon', 'aria-hidden': 'true' }, '✓'),
        React.createElement('div', { className: 'drive-mx-wallet-payment__verified-copy' },
          React.createElement('p', { className: 'drive-mx-wallet-payment__eyebrow' }, 'Cartera verificada'),
          React.createElement('p', { className: 'drive-mx-wallet-payment__user' }, manager.identity?.name || manager.identity?.email || 'Usuario'),
          React.createElement('p', { className: `drive-mx-wallet-payment__availability ${sufficient ? '' : 'drive-mx-wallet-payment__availability--insufficient'}` },
            sufficient ? 'Saldo disponible para completar la compra' : 'Saldo insuficiente para completar la compra'
          )
        ),
        React.createElement('button', {
          type: 'button',
          onClick: manager.reset,
          className: 'drive-mx-wallet-payment__change'
        }, 'Cambiar usuario')
      );
    }

    return React.createElement('form', {
      onSubmit: manager.verifyCredentials,
      className: 'drive-mx-wallet-payment',
      autoComplete: 'on'
    },
      React.createElement('div', { className: 'drive-mx-wallet-payment__heading' },
        React.createElement('p', { className: 'drive-mx-wallet-payment__eyebrow' }, 'Pago con cartera'),
        React.createElement('p', { className: 'drive-mx-wallet-payment__description' }, 'Valida momentáneamente tu usuario y contraseña para consultar el saldo disponible.')
      ),
      React.createElement('div', { className: 'drive-mx-wallet-payment__fields' },
        React.createElement('input', {
          type: 'email',
          value: manager.username || '',
          onChange: (event) => manager.setUsername?.(event.target.value),
          placeholder: 'USUARIO (CORREO)',
          autoComplete: 'username',
          required: true,
          disabled: Boolean(manager.verifying || manager.paying),
          className: 'drive-mx-wallet-payment__input'
        }),
        React.createElement('input', {
          type: 'password',
          value: manager.password || '',
          onChange: (event) => manager.setPassword?.(event.target.value),
          placeholder: 'CONTRASEÑA',
          autoComplete: 'current-password',
          required: true,
          disabled: Boolean(manager.verifying || manager.paying),
          className: 'drive-mx-wallet-payment__input'
        }),
        React.createElement('button', {
          type: 'submit',
          disabled: Boolean(manager.verifying || manager.paying),
          className: 'drive-mx-wallet-payment__verify'
        }, manager.verifying ? 'Validando...' : 'Consultar saldo')
      ),
      manager.error ? React.createElement('p', { className: 'drive-mx-wallet-payment__error', role: 'alert' }, manager.error) : null
    );
  }

  function WalletBalanceBadge({ manager, total = 0 } = {}) {
    if (!manager?.verified) return null;
    const sufficient = manager.availableBalance >= roundMoney(total);
    return React.createElement('div', { className: `drive-mx-wallet-balance ${sufficient ? '' : 'drive-mx-wallet-balance--insufficient'}` },
      React.createElement('span', { className: 'drive-mx-wallet-balance__label' }, 'Saldo disponible'),
      React.createElement('strong', { className: 'drive-mx-wallet-balance__amount' }, formatMoney(manager.availableBalance))
    );
  }

  global.DriveMxWalletPayment = {
    BUILD,
    SECONDARY_APP_NAME,
    PAYMENT_ENDPOINT,
    clean,
    normalizeEmail,
    roundMoney,
    createPaymentId,
    formatMoney,
    getSecondaryAuth,
    prepareSecondaryAuth,
    parseServerPayload,
    postWalletPayment,
    useWalletPayment,
    WalletCredentialsCard,
    WalletBalanceBadge
  };
})(window);


