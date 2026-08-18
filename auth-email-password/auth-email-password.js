(function (global) {
  'use strict';

  const React = global.React;
  if (!React) throw new Error('DriveMxEmailPasswordAuth: React no está disponible.');

  const { useState, useEffect, useRef, useCallback } = React;
  const DEFAULT_ADMIN_EMAIL = 'admin@drivemx.com';
  const DEFAULT_USERS_COLLECTION = 'operators';
  const BLOCKED_ACCOUNT_MESSAGE = 'La cuenta ha sido bloqueada por el administrador.';
  const DELETED_ACCOUNT_MESSAGE = 'La cuenta ha sido eliminada por el administrador.';

  const normalizeEmail = (value = '') => String(value || '').replace(/\s+/g, '').toLowerCase();
  const getUserId = (user = {}) => String(user.uid || user.id || '').trim();
  const getUserEmail = (user = {}) => normalizeEmail(user.email || '');

  const isUserBlocked = (user = {}) => {
    const status = String(user.accountStatus || '').toLowerCase();
    return Boolean(
      user.blocked === true
      || user.isBlocked === true
      || user.active === false
      || status.includes('bloqueado')
      || status.includes('inactivo')
    );
  };

  const findRegisteredUserProfile = (users = [], target = {}) => {
    const targetId = getUserId(target);
    const targetEmail = getUserEmail(target);
    return (Array.isArray(users) ? users : []).find((user) => {
      const userId = getUserId(user);
      const userEmail = getUserEmail(user);
      return Boolean(
        (targetId && userId && userId === targetId)
        || (targetEmail && userEmail && userEmail === targetEmail)
      );
    }) || null;
  };

  const SECONDARY_AUTH_APP_NAME = 'DriveMxSecondaryAuthApp';

  const requireFirebaseAuthSdk = (fbase, firebaseConfig) => {
    if (!fbase || typeof fbase.initializeApp !== 'function' || typeof fbase.getAuth !== 'function') {
      const error = new Error('Firebase Authentication no está disponible.');
      error.code = 'auth/firebase-sdk-unavailable';
      throw error;
    }
    if (!firebaseConfig || typeof firebaseConfig !== 'object') {
      const error = new Error('La configuración de Firebase no está disponible.');
      error.code = 'auth/firebase-config-unavailable';
      throw error;
    }
  };

  const findExistingFirebaseApp = (fbase, name) => {
    if (!fbase || typeof fbase.getApp !== 'function') return null;
    try {
      return name ? fbase.getApp(name) : fbase.getApp();
    } catch (error) {
      return null;
    }
  };

  const ensureDefaultFirebaseApp = (fbase, firebaseConfig) => {
    requireFirebaseAuthSdk(fbase, firebaseConfig);

    const cachedApp = global.driveMxFirebaseApp;
    if (cachedApp && (!cachedApp.name || cachedApp.name === '[DEFAULT]')) return cachedApp;

    const existingApp = findExistingFirebaseApp(fbase);
    if (existingApp) {
      global.driveMxFirebaseApp = existingApp;
      return existingApp;
    }

    try {
      global.driveMxFirebaseApp = fbase.initializeApp(firebaseConfig);
    } catch (error) {
      if (error?.code === 'app/duplicate-app') {
        const recoveredApp = findExistingFirebaseApp(fbase);
        if (recoveredApp) global.driveMxFirebaseApp = recoveredApp;
        else throw error;
      } else {
        throw error;
      }
    }
    return global.driveMxFirebaseApp;
  };

  const getPrimaryAuth = ({ fbase, firebaseConfig } = {}) => {
    const app = ensureDefaultFirebaseApp(fbase, firebaseConfig);
    return fbase.getAuth(app);
  };

  const getSecondaryAuth = ({ fbase, firebaseConfig } = {}) => {
    requireFirebaseAuthSdk(fbase, firebaseConfig);

    let secondaryApp = global.driveMxSecondaryAuthApp;
    if (!secondaryApp || secondaryApp.name !== SECONDARY_AUTH_APP_NAME) {
      secondaryApp = findExistingFirebaseApp(fbase, SECONDARY_AUTH_APP_NAME);
      if (!secondaryApp) {
        try {
          secondaryApp = fbase.initializeApp(firebaseConfig, SECONDARY_AUTH_APP_NAME);
        } catch (error) {
          if (error?.code === 'app/duplicate-app') {
            secondaryApp = findExistingFirebaseApp(fbase, SECONDARY_AUTH_APP_NAME);
          }
          if (!secondaryApp) throw error;
        }
      }
      global.driveMxSecondaryAuthApp = secondaryApp;
      global.driveMxSecondaryAuth = null;
    }

    const secondaryAuth = global.driveMxSecondaryAuth || fbase.getAuth(secondaryApp);
    const primaryAuth = getPrimaryAuth({ fbase, firebaseConfig });
    if (!secondaryAuth || secondaryAuth === primaryAuth || secondaryAuth?.app?.name !== SECONDARY_AUTH_APP_NAME) {
      const error = new Error('No se pudo aislar la sesión usada para crear el usuario.');
      error.code = 'auth/secondary-session-not-isolated';
      throw error;
    }

    global.driveMxSecondaryAuth = secondaryAuth;
    return secondaryAuth;
  };

  function useEmailPasswordAuth({
    fbase,
    appId,
    firebaseConfig = global.firebaseConfig,
    adminEmail = DEFAULT_ADMIN_EMAIL,
    usersCollection = DEFAULT_USERS_COLLECTION,
    users = [],
    staffUsersLoaded = false,
    onLogin = () => {},
    onLogoutStart = () => {},
    onLogoutComplete = () => {},
    onSessionProfileChange = () => {}
  } = {}) {
    const [fbUser, setFbUser] = useState(null);
    const [sessionUser, setSessionUserState] = useState(null);
    const [loginForm, setLoginForm] = useState({ email: '', p: '' });
    const [loginProcessing, setLoginProcessing] = useState(false);
    const sessionUserRef = useRef(null);
    const blockedAccountHandledRef = useRef(false);

    const setSessionUser = useCallback((nextValue) => {
      setSessionUserState((previous) => {
        const resolved = typeof nextValue === 'function' ? nextValue(previous) : nextValue;
        sessionUserRef.current = resolved || null;
        return resolved || null;
      });
    }, []);

    useEffect(() => {
      if (!fbase || !firebaseConfig) {
        setFbUser({ uid: 'local' });
        return undefined;
      }

      let unsubscribe = () => {};
      try {
        const app = ensureDefaultFirebaseApp(fbase, firebaseConfig);
        const auth = fbase.getAuth(app);
        unsubscribe = fbase.onAuthStateChanged(auth, (user) => setFbUser(user || { uid: 'local' }));
        if (!auth.currentUser) {
          fbase.signInAnonymously(auth).catch((error) => {
            console.error('Firebase Auth anónimo:', error);
            setFbUser({ uid: 'local' });
          });
        }
      } catch (error) {
        console.error('Inicializar Firebase Auth:', error);
        setFbUser({ uid: 'local' });
      }
      return () => unsubscribe?.();
    }, [fbase, firebaseConfig]);

    const getStaffProfile = useCallback(async (firebaseUser) => {
      if (!firebaseUser?.uid) return null;

      const app = ensureDefaultFirebaseApp(fbase, firebaseConfig);
      const db = fbase.getFirestore(app);
      const normalizedEmail = getUserEmail(firebaseUser);
      const centralAdmin = normalizedEmail === normalizeEmail(adminEmail);
      const profileRef = fbase.doc(db, 'artifacts', appId, 'public', 'data', usersCollection, firebaseUser.uid);

      let profileSnapshot = null;
      try {
        profileSnapshot = await fbase.getDoc(profileRef);
      } catch (error) {
        if (!centralAdmin) throw error;
        console.error('Leer perfil del administrador:', error);
      }

      if (centralAdmin) {
        const storedProfile = profileSnapshot?.exists?.() ? (profileSnapshot.data() || {}) : {};
        const now = Date.now();
        const adminProfile = {
          ...storedProfile,
          uid: firebaseUser.uid,
          email: firebaseUser.email || adminEmail,
          emailNormalized: normalizedEmail,
          name: storedProfile.name || 'Admin Central',
          role: 'admin',
          active: true,
          blocked: false,
          accountStatus: 'Activo',
          createdAt: storedProfile.createdAt || now,
          updatedAt: now
        };

        try {
          await fbase.setDoc(profileRef, adminProfile, { merge: true });
        } catch (error) {
          // La autenticación del administrador ya fue validada por Firebase Auth.
          // No se bloquea su entrada al panel por un fallo temporal al leer/escribir su perfil.
          console.error('Restaurar perfil del administrador:', error);
        }
        return { id: firebaseUser.uid, ...adminProfile };
      }

      if (profileSnapshot?.exists?.()) {
        const storedProfile = profileSnapshot.data() || {};
        return {
          ...storedProfile,
          id: firebaseUser.uid,
          uid: firebaseUser.uid,
          email: firebaseUser.email || storedProfile.email || ''
        };
      }

      const localProfile = findRegisteredUserProfile(users, firebaseUser);
      if (localProfile) {
        return {
          ...localProfile,
          id: localProfile.id || localProfile.uid || firebaseUser.uid,
          uid: firebaseUser.uid,
          email: firebaseUser.email || localProfile.email || ''
        };
      }

      const usersRef = fbase.collection(db, 'artifacts', appId, 'public', 'data', usersCollection);
      const queryCandidates = [
        fbase.query(usersRef, fbase.where('emailNormalized', '==', normalizedEmail)),
        fbase.query(usersRef, fbase.where('email', '==', normalizedEmail))
      ];

      for (const profileQuery of queryCandidates) {
        try {
          const snapshot = await fbase.getDocs(profileQuery);
          if (!snapshot.empty) {
            const documentSnapshot = snapshot.docs[0];
            return {
              id: documentSnapshot.id,
              ...documentSnapshot.data(),
              uid: firebaseUser.uid,
              email: firebaseUser.email || documentSnapshot.data()?.email || ''
            };
          }
        } catch (error) {
          console.error('Buscar perfil de acceso por correo:', error);
        }
      }
      return null;
    }, [fbase, firebaseConfig, appId, usersCollection, users, adminEmail]);

    const restoreAnonymousSession = useCallback(async (auth) => {
      try { await fbase.signOut(auth); } catch (error) {}
      try { await fbase.signInAnonymously(auth); } catch (error) {
        console.error('Restaurar sesión anónima:', error);
      }
    }, [fbase]);

    const handleLogin = useCallback(async (event) => {
      event?.preventDefault?.();
      if (loginProcessing) return;
      const email = normalizeEmail(loginForm.email);
      const password = String(loginForm.p || '');
      if (!email || !password) {
        alert('Ingresa el correo electrónico y la contraseña.');
        return;
      }

      setLoginProcessing(true);
      try {
        const app = ensureDefaultFirebaseApp(fbase, firebaseConfig);
        const auth = fbase.getAuth(app);
        const credential = await fbase.signInWithEmailAndPassword(auth, email, password);
        const profile = await getStaffProfile(credential.user);

        if (!profile) {
          await restoreAnonymousSession(auth);
          setLoginForm({ email: '', p: '' });
          alert('Tu cuenta no tiene acceso activo al panel.');
          return;
        }
        if (profile.role !== 'admin' && isUserBlocked(profile)) {
          await restoreAnonymousSession(auth);
          setLoginForm({ email: '', p: '' });
          alert(BLOCKED_ACCOUNT_MESSAGE);
          return;
        }

        blockedAccountHandledRef.current = false;
        setSessionUser(profile);
        setLoginForm({ email: '', p: '' });
        onLogin(profile);
      } catch (error) {
        console.error('Inicio de sesión con correo y contraseña:', error);
        setLoginForm((previous) => ({ ...previous, p: '' }));
        alert('Correo o contraseña incorrectos.');
      } finally {
        setLoginProcessing(false);
      }
    }, [loginProcessing, loginForm, fbase, firebaseConfig, getStaffProfile, restoreAnonymousSession, setSessionUser, onLogin]);

    const handleLogout = useCallback(async () => {
      if (!fbase) return;
      const app = ensureDefaultFirebaseApp(fbase, firebaseConfig);
      const auth = fbase.getAuth(app);
      blockedAccountHandledRef.current = false;
      onLogoutStart();
      setSessionUser(null);
      setLoginForm({ email: '', p: '' });
      setLoginProcessing(false);
      await restoreAnonymousSession(auth);
      onLogoutComplete();
    }, [fbase, firebaseConfig, onLogoutStart, onLogoutComplete, restoreAnonymousSession, setSessionUser]);

    useEffect(() => {
      if (!sessionUser || sessionUser.role === 'admin') return;
      const profile = findRegisteredUserProfile(users, sessionUser);
      if (!profile) {
        if (staffUsersLoaded) {
          if (!blockedAccountHandledRef.current) {
            blockedAccountHandledRef.current = true;
            alert(DELETED_ACCOUNT_MESSAGE);
          }
          handleLogout();
        }
        return;
      }

      if (isUserBlocked(profile)) {
        if (!blockedAccountHandledRef.current) {
          blockedAccountHandledRef.current = true;
          alert(BLOCKED_ACCOUNT_MESSAGE);
        }
        handleLogout();
        return;
      }

      blockedAccountHandledRef.current = false;
      const mergedProfile = {
        ...(sessionUser || {}),
        ...profile,
        id: profile.id || profile.uid || sessionUser.id,
        uid: profile.uid || profile.id || sessionUser.uid
      };
      const previousKey = JSON.stringify({
        name: sessionUser.name || '',
        phone: sessionUser.phone || '',
        saleNotificationEmail: sessionUser.saleNotificationEmail || '',
        assignmentsAuthorized: sessionUser.assignmentsAuthorized === true,
        accountStatus: sessionUser.accountStatus || '',
        active: sessionUser.active !== false,
        blocked: sessionUser.blocked === true
      });
      const nextKey = JSON.stringify({
        name: mergedProfile.name || '',
        phone: mergedProfile.phone || '',
        saleNotificationEmail: mergedProfile.saleNotificationEmail || '',
        assignmentsAuthorized: mergedProfile.assignmentsAuthorized === true,
        accountStatus: mergedProfile.accountStatus || '',
        active: mergedProfile.active !== false,
        blocked: mergedProfile.blocked === true
      });
      if (previousKey !== nextKey) {
        setSessionUser(mergedProfile);
        onSessionProfileChange(mergedProfile);
      }
    }, [users, staffUsersLoaded, sessionUser, handleLogout, setSessionUser, onSessionProfileChange]);

    const verifyAdminPassword = useCallback(async (password = '') => {
      const value = String(password || '');
      if (!value) throw new Error('Ingresa la contraseña maestra.');
      const secondaryAuth = getSecondaryAuth({ fbase, firebaseConfig });
      try {
        await fbase.signInWithEmailAndPassword(secondaryAuth, adminEmail, value);
        return true;
      } finally {
        try { await fbase.signOut(secondaryAuth); } catch (error) {}
      }
    }, [fbase, firebaseConfig, adminEmail]);

    const mergeSessionUser = useCallback((patch = {}) => {
      setSessionUser((previous) => previous ? ({ ...previous, ...patch }) : previous);
    }, [setSessionUser]);

    const getCurrentSession = useCallback(() => sessionUserRef.current, []);

    return {
      fbUser,
      sessionUser,
      loginForm,
      setLoginForm,
      loginProcessing,
      handleLogin,
      handleLogout,
      verifyAdminPassword,
      setSessionUser,
      mergeSessionUser,
      getCurrentSession,
      getStaffProfile,
      isUserBlocked,
      findRegisteredUserProfile: (target = sessionUser) => findRegisteredUserProfile(users, target)
    };
  }

  function EmailPasswordLogin({ manager, onRegister } = {}) {
    if (!manager) return null;
    return (
      <div className="w-full max-w-sm py-20 animate-slide">
        <div className="card-glass p-10 space-y-8">
          <h2 className="text-center text-xl font-black uppercase tracking-widest">Panel Staff</h2>
          <form onSubmit={manager.handleLogin} className="space-y-4">
            <input
              required
              className="input-field"
              placeholder="CORREO ELECTRÓNICO"
              type="email"
              autoComplete="email"
              value={manager.loginForm.email}
              onChange={(event) => manager.setLoginForm((previous) => ({ ...previous, email: event.target.value }))}
            />
            <input
              required
              type="password"
              className="input-field"
              placeholder="CONTRASEÑA"
              autoComplete="current-password"
              value={manager.loginForm.p}
              onChange={(event) => manager.setLoginForm((previous) => ({ ...previous, p: event.target.value }))}
            />
            <button disabled={manager.loginProcessing} type="submit" className="w-full btn-primary h-12 disabled:opacity-50 disabled:cursor-not-allowed">
              {manager.loginProcessing ? 'Entrando...' : 'Entrar'}
            </button>
            <button disabled={manager.loginProcessing} type="button" onClick={onRegister} className="w-full btn-primary h-12 disabled:opacity-50">
              Registrar Usuario
            </button>
          </form>
        </div>
      </div>
    );
  }

  global.DriveMxEmailPasswordAuth = {
    useEmailPasswordAuth,
    EmailPasswordLogin,
    services: {
      normalizeEmail,
      getUserId,
      getUserEmail,
      isUserBlocked,
      findRegisteredUserProfile,
      ensureDefaultFirebaseApp,
      getPrimaryAuth,
      getSecondaryAuth
    }
  };
})(window);


