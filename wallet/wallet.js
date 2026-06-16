(function (global) {
  'use strict';

  const WALLET_COLLECTION = 'wallets';
  const WALLET_SETTINGS_COLLECTION = 'wallet_settings';
  const WALLET_RECHARGES_COLLECTION = 'wallet_recharges';
  const WALLET_COMMISSIONS_COLLECTION = 'wallet_commissions';
  const MOVEMENTS_COLLECTION = 'movements';
  const SETTINGS_DOC_ID = 'config';
  const DEFAULT_MINIMUM_WALLET_RECHARGE = 500;
  const CURRENCY = 'MXN';
  const PLATFORM_LEGEND = 'Las comisiones por uso de la plataforma y servicios serán descontadas automáticamente de tu saldo disponible.';
  const INSUFFICIENT_MESSAGE = 'Tu saldo es insuficiente para continuar utilizando la plataforma. Realiza una nueva recarga para seguir publicando y vendiendo.';

  const clean = (value) => String(value ?? '').trim();
  const lower = (value) => clean(value).toLowerCase();
  const roundMoney = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
  const parseAmount = (value) => roundMoney(String(value ?? '').replace(/,/g, '.'));
  const safeDocId = (value = '') => clean(value).replace(/[^a-zA-Z0-9_-]/g, '_');
  const now = () => Date.now();

  function formatMoney(value) {
    return `$${roundMoney(value).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${CURRENCY}`;
  }

  function getMinimumWalletRecharge(settings = {}) {
    const raw = settings.minimumWalletRecharge ?? settings.minimumRechargeAmount ?? settings.minimumFirstRecharge ?? DEFAULT_MINIMUM_WALLET_RECHARGE;
    const amount = parseAmount(raw);
    if (!Number.isFinite(amount) || amount < 0) return DEFAULT_MINIMUM_WALLET_RECHARGE;
    return amount;
  }

  function getPlatformLegend(settings = {}) {
    const minimum = getMinimumWalletRecharge(settings);
    const suffix = minimum > 0 ? ` Recarga mínima de cartera: ${formatMoney(minimum)}.` : '';
    return `${PLATFORM_LEGEND}${suffix}`;
  }

  function normalizePercent(value) {
    const percent = Number(value || 0);
    if (!Number.isFinite(percent)) return 0;
    return Math.max(0, Math.min(100, roundMoney(percent)));
  }

  function calculateCommission(amount, percent) {
    return roundMoney((Number(amount || 0) * normalizePercent(percent)) / 100);
  }

  function getUserWalletId(userOrId = {}) {
    if (typeof userOrId === 'string') return safeDocId(userOrId);
    return safeDocId(userOrId.uid || userOrId.id || userOrId.userId || '');
  }

  function getUserEmail(user = {}) {
    return clean(user.email || user.userEmail || user.ownerEmail || user.sellerEmail).toLowerCase();
  }

  function getUserName(user = {}) {
    return clean(user.name || user.userName || user.ownerName || user.sellerName || user.email || user.userEmail || 'Usuario');
  }

  function getUserPhone(user = {}) {
    return clean(user.phone || user.userPhone || user.ownerPhone || user.sellerPhone || '');
  }

  function getWalletStatus(wallet = {}) {
    if (!isWalletActivated(wallet)) return 'Pendiente de activación';
    return Number(wallet.balance || 0) > 0 ? 'Activa' : 'Sin saldo';
  }

  function normalizeWallet(wallet = null, user = {}) {
    const walletId = getUserWalletId(wallet || {}) || getUserWalletId(user || {});
    const rechargeCount = Number(wallet?.rechargeCount || 0);
    const totalRecharged = roundMoney(wallet?.totalRecharged || 0);
    const activated = Boolean(wallet?.activated === true || wallet?.firstRechargeCompleted === true || rechargeCount > 0 || totalRecharged > 0);
    const normalized = {
      id: wallet?.id || walletId,
      uid: wallet?.uid || wallet?.userId || getUserWalletId(user || {}) || walletId,
      userId: wallet?.userId || wallet?.uid || getUserWalletId(user || {}) || walletId,
      userName: wallet?.userName || getUserName(user || {}),
      userEmail: wallet?.userEmail || getUserEmail(user || {}),
      userPhone: wallet?.userPhone || getUserPhone(user || {}),
      currency: wallet?.currency || CURRENCY,
      balance: roundMoney(wallet?.balance || 0),
      activated,
      firstRechargeCompleted: Boolean(wallet?.firstRechargeCompleted === true || activated),
      firstRechargeAt: wallet?.firstRechargeAt || null,
      rechargeCount,
      totalRecharged,
      totalCommissions: roundMoney(wallet?.totalCommissions || 0),
      lastRechargeAt: wallet?.lastRechargeAt || null,
      lastCommissionAt: wallet?.lastCommissionAt || null,
      createdAt: wallet?.createdAt || now(),
      updatedAt: wallet?.updatedAt || now(),
      status: wallet?.status || ''
    };
    normalized.status = wallet?.status || getWalletStatus(normalized);
    return normalized;
  }

  function defaultSettings() {
    return {
      globalCommissionPercent: 0,
      minimumWalletRecharge: DEFAULT_MINIMUM_WALLET_RECHARGE,
      minimumFirstRecharge: DEFAULT_MINIMUM_WALLET_RECHARGE,
      currency: CURRENCY,
      updatedAt: null,
      updatedBy: ''
    };
  }

  function normalizeSettings(settings = {}) {
    const minimumWalletRecharge = getMinimumWalletRecharge(settings);
    return {
      ...defaultSettings(),
      ...settings,
      globalCommissionPercent: normalizePercent(settings.globalCommissionPercent ?? settings.commissionPercent ?? 0),
      minimumWalletRecharge,
      minimumFirstRecharge: minimumWalletRecharge,
      currency: settings.currency || CURRENCY
    };
  }

  function collectionRef(fbase, appId, collectionName) {
    const db = fbase.getFirestore();
    return fbase.collection(db, 'artifacts', appId, 'public', 'data', collectionName);
  }

  function docRef(fbase, appId, collectionName, docId) {
    const db = fbase.getFirestore();
    return fbase.doc(db, 'artifacts', appId, 'public', 'data', collectionName, docId);
  }

  function movementCollectionRef(fbase, appId, walletId) {
    const db = fbase.getFirestore();
    return fbase.collection(db, 'artifacts', appId, 'public', 'data', WALLET_COLLECTION, walletId, MOVEMENTS_COLLECTION);
  }

  function movementDocRef(fbase, appId, walletId, movementId) {
    const db = fbase.getFirestore();
    return fbase.doc(db, 'artifacts', appId, 'public', 'data', WALLET_COLLECTION, walletId, MOVEMENTS_COLLECTION, movementId);
  }

  function walletDocRef(fbase, appId, walletId) {
    return docRef(fbase, appId, WALLET_COLLECTION, walletId);
  }

  function settingsDocRef(fbase, appId) {
    return docRef(fbase, appId, WALLET_SETTINGS_COLLECTION, SETTINGS_DOC_ID);
  }

  function getWalletById(wallets = [], userId = '') {
    const walletId = getUserWalletId(userId);
    if (!walletId) return null;
    return (Array.isArray(wallets) ? wallets : []).find((wallet) => {
      const candidateIds = [wallet.id, wallet.uid, wallet.userId].map(getUserWalletId).filter(Boolean);
      return candidateIds.includes(walletId);
    }) || null;
  }

  function findWalletForUser(wallets = [], user = {}) {
    const found = getWalletById(wallets, getUserWalletId(user));
    return found ? normalizeWallet(found, user) : normalizeWallet(null, user);
  }

  function isWalletActivated(wallet = {}) {
    return Boolean(wallet?.activated === true || wallet?.firstRechargeCompleted === true || Number(wallet?.rechargeCount || 0) > 0 || Number(wallet?.totalRecharged || 0) > 0);
  }

  function getProductSellerId(product = {}) {
    return clean(product.ownerId || product.sellerId || product.userId || product.createdByUid || '');
  }

  function isUserProduct(product = {}) {
    const sellerId = getProductSellerId(product);
    const type = lower(product.publicationType || product.productOrigin || product.sourcePanel || product.createdFromPanel || '');
    return Boolean(sellerId || type === 'usuario' || type === 'user' || type === 'panel_usuario' || type === 'panel-usuario');
  }

  function validateRechargeAmount(wallet = {}, amountValue = 0, settings = {}) {
    const amount = parseAmount(amountValue);
    const minimum = getMinimumWalletRecharge(settings);
    if (!Number.isFinite(amount) || amount <= 0) {
      return { ok: false, amount, minimum, message: 'Ingresa un monto válido para recargar.' };
    }
    if (minimum > 0 && amount < minimum) {
      return { ok: false, amount, minimum, message: `La recarga mínima de cartera es de ${formatMoney(minimum)}.` };
    }
    return { ok: true, amount, minimum, message: '' };
  }

  function validatePublication({ wallet, productPrice = 0, commissionPercent = 0, willBeActive = true } = {}) {
    if (!willBeActive) return { ok: true, commission: 0, message: '' };
    const normalizedWallet = normalizeWallet(wallet || {});
    const commission = calculateCommission(productPrice, commissionPercent);
    if (!isWalletActivated(normalizedWallet)) {
      return { ok: false, commission, message: INSUFFICIENT_MESSAGE };
    }
    if (commission > 0 && roundMoney(normalizedWallet.balance) < commission) {
      return { ok: false, commission, message: INSUFFICIENT_MESSAGE };
    }
    return { ok: true, commission, message: '' };
  }

  function validateProductsForSale({ products = [], wallets = [], commissionPercent = 0 } = {}) {
    const groupedBySeller = new Map();
    const productList = Array.isArray(products) ? products.filter(Boolean) : [];

    productList.forEach((product) => {
      if (!isUserProduct(product)) return;
      const sellerId = getProductSellerId(product);
      if (!sellerId) return;
      const walletId = getUserWalletId(sellerId);
      if (!walletId) return;
      const previous = groupedBySeller.get(walletId) || { sellerId, walletId, total: 0, products: [] };
      previous.total = roundMoney(previous.total + Number(product.price || product.productCost || 0));
      previous.products.push(product);
      groupedBySeller.set(walletId, previous);
    });

    const blockers = [];
    groupedBySeller.forEach((group) => {
      const wallet = normalizeWallet(getWalletById(wallets, group.walletId) || { id: group.walletId, uid: group.walletId, userId: group.walletId });
      const commission = calculateCommission(group.total, commissionPercent);
      if (!isWalletActivated(wallet)) {
        blockers.push({ ...group, wallet, commission, reason: 'inactive' });
        return;
      }
      if (commission > 0 && roundMoney(wallet.balance) < commission) {
        blockers.push({ ...group, wallet, commission, reason: 'insufficient' });
      }
    });

    return {
      ok: blockers.length === 0,
      blockers,
      message: blockers.length ? INSUFFICIENT_MESSAGE : ''
    };
  }

  async function ensureWalletDocument({ fbase, appId, user = {}, createdBy = '' } = {}) {
    const walletId = getUserWalletId(user);
    if (!walletId) throw new Error('No se pudo identificar al usuario de la cartera.');
    const ref = walletDocRef(fbase, appId, walletId);
    const snap = await fbase.getDoc(ref);
    if (snap.exists()) {
      const current = normalizeWallet({ id: snap.id, ...snap.data() }, user);
      const next = {
        ...current,
        userName: getUserName(user) || current.userName,
        userEmail: getUserEmail(user) || current.userEmail,
        userPhone: getUserPhone(user) || current.userPhone,
        updatedAt: now()
      };
      await fbase.setDoc(ref, next, { merge: true });
      return next;
    }
    const wallet = normalizeWallet({ id: walletId, uid: walletId, userId: walletId, activated: false, firstRechargeCompleted: false, createdAt: now(), updatedAt: now(), createdBy }, user);
    wallet.balance = 0;
    wallet.totalRecharged = 0;
    wallet.rechargeCount = 0;
    wallet.activated = false;
    wallet.firstRechargeCompleted = false;
    wallet.status = 'Pendiente de activación';
    await fbase.setDoc(ref, wallet);
    return wallet;
  }

  async function fetchWallet({ fbase, appId, user = {}, wallet = null } = {}) {
    const walletId = getUserWalletId(user) || getUserWalletId(wallet || {});
    if (!walletId) throw new Error('No se pudo identificar la cartera del usuario.');
    const snap = await fbase.getDoc(walletDocRef(fbase, appId, walletId));
    if (snap.exists()) return normalizeWallet({ id: snap.id, ...snap.data() }, user);
    return await ensureWalletDocument({ fbase, appId, user: { ...user, uid: walletId, id: walletId }, createdBy: 'sistema' });
  }

  async function recordRecharge({ fbase, appId, user = {}, wallet = null, amount: rawAmount = 0, paypalOrderId = '', paypalCaptureId = '', actor = '', settings = {} } = {}) {
    const current = await fetchWallet({ fbase, appId, user, wallet });
    const validation = validateRechargeAmount(current, rawAmount, settings);
    if (!validation.ok) throw new Error(validation.message);

    const amount = validation.amount;
    const walletId = getUserWalletId(current);
    const createdAt = now();
    const balanceBefore = roundMoney(current.balance || 0);
    const balanceAfter = roundMoney(balanceBefore + amount);
    const movementId = safeDocId(`mov_recharge_${paypalOrderId || paypalCaptureId || createdAt}`);
    const rechargeId = safeDocId(`recharge_${walletId}_${paypalOrderId || paypalCaptureId || createdAt}`);
    const nextWallet = {
      ...current,
      userName: getUserName(user) || current.userName,
      userEmail: getUserEmail(user) || current.userEmail,
      userPhone: getUserPhone(user) || current.userPhone,
      balance: balanceAfter,
      activated: true,
      firstRechargeCompleted: true,
      firstRechargeAt: current.firstRechargeAt || createdAt,
      rechargeCount: Number(current.rechargeCount || 0) + 1,
      totalRecharged: roundMoney(Number(current.totalRecharged || 0) + amount),
      lastRechargeAt: createdAt,
      updatedAt: createdAt,
      updatedBy: actor || getUserEmail(user),
      status: balanceAfter > 0 ? 'Activa' : 'Sin saldo'
    };
    const movement = {
      id: movementId,
      movementId,
      walletId,
      userId: walletId,
      userName: nextWallet.userName,
      userEmail: nextWallet.userEmail,
      type: 'recharge',
      direction: 'credit',
      concept: 'Recarga de saldo PayPal',
      amount,
      balanceBefore,
      balanceAfter,
      currency: CURRENCY,
      minimumWalletRecharge: validation.minimum,
      paypalOrderId: clean(paypalOrderId),
      paypalCaptureId: clean(paypalCaptureId),
      createdAt,
      createdBy: actor || getUserEmail(user)
    };
    const recharge = {
      ...movement,
      id: rechargeId,
      rechargeId,
      status: 'Completada'
    };

    await fbase.setDoc(walletDocRef(fbase, appId, walletId), nextWallet, { merge: true });
    await fbase.setDoc(movementDocRef(fbase, appId, walletId, movementId), movement);
    await fbase.setDoc(docRef(fbase, appId, WALLET_RECHARGES_COLLECTION, rechargeId), recharge);
    return { wallet: nextWallet, movement, recharge };
  }

  async function debitCommissionForSale({ fbase, appId, seller = {}, wallet = null, sale = {}, commissionPercent = 0, actor = '' } = {}) {
    const sellerId = getUserWalletId(seller) || getUserWalletId(sale.sellerId || sale.ownerId || sale.userId || '');
    if (!sellerId) {
      return { applies: false, commissionAmount: 0, balanceBefore: null, balanceAfter: null, percent: normalizePercent(commissionPercent) };
    }

    const current = await fetchWallet({ fbase, appId, user: { ...seller, uid: sellerId, id: sellerId }, wallet });
    const percent = normalizePercent(commissionPercent);
    const saleAmount = Number(sale.productCost || sale.productPrice || sale.price || 0);
    const commissionAmount = calculateCommission(saleAmount, percent);

    if (!isWalletActivated(current)) {
      const error = new Error(INSUFFICIENT_MESSAGE);
      error.code = 'WALLET_NOT_ACTIVE';
      throw error;
    }

    if (commissionAmount <= 0) {
      return { applies: true, commissionAmount: 0, balanceBefore: roundMoney(current.balance), balanceAfter: roundMoney(current.balance), percent };
    }

    const balanceBefore = roundMoney(current.balance || 0);
    if (balanceBefore < commissionAmount) {
      const error = new Error(INSUFFICIENT_MESSAGE);
      error.code = 'WALLET_INSUFFICIENT_FUNDS';
      throw error;
    }

    const createdAt = now();
    const balanceAfter = roundMoney(balanceBefore - commissionAmount);
    const walletId = getUserWalletId(current);
    const saleId = clean(sale.saleId || sale.id || `sale_${createdAt}`);
    const movementId = safeDocId(`mov_commission_${saleId}_${createdAt}`);
    const commissionId = safeDocId(`commission_${walletId}_${saleId}_${createdAt}`);
    const productName = clean(sale.productName || sale.name || 'producto vendido');
    const nextWallet = {
      ...current,
      balance: balanceAfter,
      totalCommissions: roundMoney(Number(current.totalCommissions || 0) + commissionAmount),
      lastCommissionAt: createdAt,
      updatedAt: createdAt,
      updatedBy: actor || 'sistema',
      status: balanceAfter > 0 ? 'Activa' : 'Sin saldo'
    };
    const movement = {
      id: movementId,
      movementId,
      walletId,
      userId: walletId,
      userName: current.userName || seller.name || sale.sellerName || '',
      userEmail: current.userEmail || seller.email || sale.sellerEmail || '',
      type: 'commission',
      direction: 'debit',
      concept: `Comisión por venta: ${productName}`,
      amount: -commissionAmount,
      absoluteAmount: commissionAmount,
      balanceBefore,
      balanceAfter,
      currency: CURRENCY,
      commissionPercent: percent,
      saleId,
      productId: clean(sale.productId || ''),
      productName,
      createdAt,
      createdBy: actor || 'sistema'
    };
    const commission = {
      ...movement,
      id: commissionId,
      commissionId,
      status: 'Descontada'
    };

    await fbase.setDoc(walletDocRef(fbase, appId, walletId), nextWallet, { merge: true });
    await fbase.setDoc(movementDocRef(fbase, appId, walletId, movementId), movement);
    await fbase.setDoc(docRef(fbase, appId, WALLET_COMMISSIONS_COLLECTION, commissionId), commission);

    return { applies: true, commissionAmount, balanceBefore, balanceAfter, percent, movement, wallet: nextWallet };
  }

  function subscribeWallets({ fbase, appId, onChange } = {}) {
    return fbase.onSnapshot(collectionRef(fbase, appId, WALLET_COLLECTION), (snapshot) => {
      const list = [];
      snapshot.forEach((docSnap) => list.push(normalizeWallet({ id: docSnap.id, ...docSnap.data() })));
      list.sort((a, b) => lower(a.userName || a.userEmail).localeCompare(lower(b.userName || b.userEmail)));
      onChange(list);
    }, (error) => {
      console.error('Firestore carteras:', error);
      onChange([]);
    });
  }

  function subscribeMovements({ fbase, appId, userId, onChange } = {}) {
    const walletId = getUserWalletId(userId);
    if (!walletId) {
      onChange([]);
      return () => {};
    }
    return fbase.onSnapshot(movementCollectionRef(fbase, appId, walletId), (snapshot) => {
      const list = [];
      snapshot.forEach((docSnap) => list.push({ id: docSnap.id, ...docSnap.data() }));
      list.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
      onChange(list);
    }, (error) => {
      console.error('Firestore movimientos de cartera:', error);
      onChange([]);
    });
  }

  function subscribeRecharges({ fbase, appId, onChange } = {}) {
    return fbase.onSnapshot(collectionRef(fbase, appId, WALLET_RECHARGES_COLLECTION), (snapshot) => {
      const list = [];
      snapshot.forEach((docSnap) => list.push({ id: docSnap.id, ...docSnap.data() }));
      list.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
      onChange(list);
    }, (error) => {
      console.error('Firestore recargas de cartera:', error);
      onChange([]);
    });
  }

  function subscribeSettings({ fbase, appId, onChange } = {}) {
    return fbase.onSnapshot(settingsDocRef(fbase, appId), (snapshot) => {
      onChange(snapshot.exists() ? normalizeSettings(snapshot.data()) : defaultSettings());
    }, (error) => {
      console.error('Firestore configuración global de cartera:', error);
      onChange(defaultSettings());
    });
  }

  async function saveSettings({ fbase, appId, settings = {}, actor = '' } = {}) {
    const next = normalizeSettings(settings);
    next.updatedAt = now();
    next.updatedBy = actor;
    await fbase.setDoc(settingsDocRef(fbase, appId), next, { merge: true });
    return next;
  }

  function loadPayPalSdk({ clientId, currency = CURRENCY, locale = 'es_MX' } = {}) {
    const cleanClientId = clean(clientId);
    if (!cleanClientId) return Promise.reject(new Error('Falta configurar PayPal Client ID.'));
    const src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(cleanClientId)}&currency=${encodeURIComponent(currency)}&intent=capture&commit=true&locale=${encodeURIComponent(locale)}`;

    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-drive-mx-paypal="true"]');
      if (existing && existing.src !== src) {
        existing.remove();
        global.paypal = undefined;
      }
      const active = document.querySelector('script[data-drive-mx-paypal="true"]');
      if (active && global.paypal) {
        resolve(global.paypal);
        return;
      }
      if (active) {
        active.addEventListener('load', () => resolve(global.paypal), { once: true });
        active.addEventListener('error', () => reject(new Error('No se pudo cargar PayPal. Revisa el Client ID configurado.')), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.dataset.driveMxPaypal = 'true';
      script.onload = () => resolve(global.paypal);
      script.onerror = () => reject(new Error('No se pudo cargar PayPal. Revisa el Client ID configurado.'));
      document.body.appendChild(script);
    });
  }

  async function renderPayPalRechargeButtons({ clientId, containerId, amount, description = 'Recarga de saldo Drive MX', onApprove, onStart, onCancel, onError } = {}) {
    const container = document.getElementById(containerId);
    if (!container) return null;
    container.innerHTML = '';
    const rechargeAmount = parseAmount(amount);
    if (!Number.isFinite(rechargeAmount) || rechargeAmount <= 0) return null;

    try {
      const paypal = await loadPayPalSdk({ clientId });
      if (!paypal || !document.getElementById(containerId)) return null;
      const buttons = paypal.Buttons({
        style: { layout: 'vertical', shape: 'rect', label: 'paypal' },
        createOrder: (data, actions) => actions.order.create({
          purchase_units: [{
            description,
            amount: { currency_code: CURRENCY, value: rechargeAmount.toFixed(2) }
          }]
        }),
        onApprove: async (data, actions) => {
          if (typeof onStart === 'function') onStart();
          const capture = await actions.order.capture();
          if (typeof onApprove === 'function') await onApprove({ data, capture, amount: rechargeAmount });
        },
        onCancel: () => {
          if (typeof onCancel === 'function') onCancel();
        },
        onError: (error) => {
          if (typeof onError === 'function') onError(error);
        }
      });
      await buttons.render(`#${containerId}`);
      return buttons;
    } catch (error) {
      if (typeof onError === 'function') onError(error);
      return null;
    }
  }

  function clearPayPalContainer(containerId) {
    const container = document.getElementById(containerId);
    if (container) container.innerHTML = '';
  }

  const Wallet = {
    WALLET_COLLECTION,
    WALLET_SETTINGS_COLLECTION,
    WALLET_RECHARGES_COLLECTION,
    WALLET_COMMISSIONS_COLLECTION,
    MOVEMENTS_COLLECTION,
    SETTINGS_DOC_ID,
    DEFAULT_MINIMUM_WALLET_RECHARGE,
    CURRENCY,
    PLATFORM_LEGEND,
    INSUFFICIENT_MESSAGE,
    clean,
    lower,
    roundMoney,
    parseAmount,
    safeDocId,
    formatMoney,
    getMinimumWalletRecharge,
    getPlatformLegend,
    normalizePercent,
    calculateCommission,
    getUserWalletId,
    normalizeWallet,
    defaultSettings,
    normalizeSettings,
    getWalletById,
    findWalletForUser,
    isWalletActivated,
    getProductSellerId,
    isUserProduct,
    validateRechargeAmount,
    validatePublication,
    validateProductsForSale,
    ensureWalletDocument,
    recordRecharge,
    debitCommissionForSale,
    subscribeWallets,
    subscribeMovements,
    subscribeRecharges,
    subscribeSettings,
    saveSettings,
    loadPayPalSdk,
    renderPayPalRechargeButtons,
    clearPayPalContainer
  };

  function createWalletUI(React) {
    if (!React) return {};
    const h = React.createElement;

    const SmallLabel = ({ children }) => h('p', { className: 'text-[8px] font-black uppercase tracking-widest text-slate-300 mb-1' }, children);

    function UserWalletCard(props = {}) {
      const settings = normalizeSettings(props.settings || {});
      const wallet = normalizeWallet(props.wallet || {}, props.user || {});
      const activated = isWalletActivated(wallet);
      const minimumWalletRecharge = getMinimumWalletRecharge(settings);
      const rechargeValidation = validateRechargeAmount(wallet, props.rechargeAmount || 0, settings);
      const paymentConfigured = Boolean(props.paymentConfigured);
      const canRenderPaypal = paymentConfigured && rechargeValidation.ok && !props.rechargeProcessing;

      return h('div', { id: 'user-wallet-section', className: 'card-glass overflow-hidden' },
        h('div', { className: 'bg-gradient-to-br from-red-500 to-red-600 px-6 py-6 text-white' },
          h('div', { className: 'flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4' },
            h('div', null,
              h('p', { className: 'text-[10px] font-black uppercase tracking-widest text-red-100 mb-1' }, 'Cartera del usuario'),
              h('h2', { className: 'text-3xl font-black tracking-tight' }, formatMoney(wallet.balance)),
              h('p', { className: 'text-[9px] font-bold uppercase text-red-100 mt-2' }, activated ? 'Saldo disponible' : 'Pendiente de recarga')
            ),
            h('button', {
              type: 'button',
              onClick: props.onToggleRecharge,
              className: 'h-12 px-5 rounded-xl bg-white text-red-600 text-[10px] font-black uppercase tracking-widest hover:bg-red-50 transition-all shadow-sm'
            }, props.showRecharge ? 'Cerrar recarga' : 'Recargar Saldo')
          )
        ),
        h('div', { className: 'p-6 space-y-4' },
          h('div', { className: 'grid sm:grid-cols-3 gap-3' },
            h('div', { className: 'rounded-2xl bg-slate-50 p-4' },
              h(SmallLabel, null, 'Estado'),
              h('p', { className: `text-[11px] font-black uppercase ${activated ? 'text-green-600' : 'text-yellow-700'}` }, getWalletStatus(wallet))
            ),
            h('div', { className: 'rounded-2xl bg-slate-50 p-4' },
              h(SmallLabel, null, 'Total recargado'),
              h('p', { className: 'text-[11px] font-black text-slate-800' }, formatMoney(wallet.totalRecharged || 0))
            ),
            h('div', { className: 'rounded-2xl bg-slate-50 p-4' },
              h(SmallLabel, null, 'Comisiones descontadas'),
              h('p', { className: 'text-[11px] font-black text-slate-800' }, formatMoney(wallet.totalCommissions || 0))
            )
          ),
          h('p', { className: 'rounded-2xl bg-red-50 text-red-600 p-4 text-[10px] font-black uppercase leading-relaxed tracking-wide' }, getPlatformLegend(settings)),
          props.blockedMessage ? h('p', { className: 'rounded-2xl bg-yellow-50 text-yellow-700 p-4 text-[10px] font-black uppercase leading-relaxed tracking-wide' }, props.blockedMessage) : null,
          props.showRecharge ? h('div', { className: 'rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-4 animate-slide' },
            h('div', { className: 'grid sm:grid-cols-[1fr_auto] gap-3 items-end' },
              h('div', null,
                h('label', { className: 'block text-[9px] font-black uppercase text-slate-400 mb-2' }, 'Monto de recarga'),
                h('input', {
                  type: 'number',
                  min: minimumWalletRecharge > 0 ? String(minimumWalletRecharge) : '0.01',
                  step: '0.01',
                  className: 'input-field',
                  placeholder: minimumWalletRecharge > 0 ? `Mínimo ${formatMoney(minimumWalletRecharge)}` : 'Ej. 100',
                  value: props.rechargeAmount || '',
                  onChange: (event) => props.onRechargeAmountChange && props.onRechargeAmountChange(event.target.value)
                })
              ),
              h('button', {
                type: 'button',
                onClick: props.onCloseRecharge,
                className: 'h-12 px-4 rounded-xl bg-white border border-slate-100 text-[9px] font-black uppercase text-slate-400 hover:text-red-500'
              }, 'Cancelar')
            ),
            !paymentConfigured ? h('p', { className: 'text-[10px] font-black text-red-500 uppercase' }, 'Falta configurar PayPal en el Panel de Control.') : null,
            props.rechargeAmount && !rechargeValidation.ok ? h('p', { className: 'text-[10px] font-black text-red-500 uppercase' }, rechargeValidation.message) : null,
            props.rechargeProcessing ? h('p', { className: 'text-[10px] font-black text-slate-400 uppercase' }, 'Procesando recarga PayPal...') : null,
            h('div', { id: props.paypalContainerId || 'wallet-paypal-recharge-buttons', className: canRenderPaypal ? '' : 'pointer-events-none opacity-40' }),
            canRenderPaypal ? null : h('p', { className: 'text-[9px] font-bold text-slate-400 uppercase leading-relaxed' }, minimumWalletRecharge > 0 ? `Ingresa un monto válido para mostrar el botón de PayPal. Recarga mínima de cartera: ${formatMoney(minimumWalletRecharge)}.` : 'Ingresa un monto válido para mostrar el botón de PayPal.')
          ) : null
        )
      );
    }

    function WalletMovementsPanel({ movements = [] } = {}) {
      const list = Array.isArray(movements) ? movements : [];
      return h('div', { id: 'wallet-movements-section', className: 'card-glass overflow-hidden' },
        h('div', { className: 'bg-slate-50 border-b border-slate-100 px-6 py-4' },
          h('h2', { className: 'text-[10px] font-black uppercase tracking-widest text-slate-400' }, 'Movimientos'),
          h('p', { className: 'text-[9px] font-bold text-slate-300 uppercase mt-1' }, 'Historial de cartera: fecha, concepto, monto y saldo')
        ),
        h('div', { className: 'overflow-x-auto' },
          h('table', { className: 'w-full text-left' },
            h('thead', { className: 'bg-white border-b border-slate-50' },
              h('tr', { className: 'text-[8px] font-black uppercase text-slate-400' },
                h('th', { className: 'px-6 py-3' }, 'Fecha'),
                h('th', { className: 'px-6 py-3' }, 'Concepto'),
                h('th', { className: 'px-6 py-3' }, 'Monto'),
                h('th', { className: 'px-6 py-3' }, 'Saldo')
              )
            ),
            h('tbody', { className: 'divide-y divide-slate-50' },
              list.map((movement) => {
                const amount = Number(movement.amount || 0);
                const positive = amount >= 0;
                return h('tr', { key: movement.id || movement.movementId, className: 'text-[10px] font-bold text-slate-600' },
                  h('td', { className: 'px-6 py-4' }, movement.createdAt ? new Date(movement.createdAt).toLocaleString('es-MX') : '-'),
                  h('td', { className: 'px-6 py-4 font-black text-slate-800' }, movement.concept || '-'),
                  h('td', { className: `px-6 py-4 font-black ${positive ? 'text-green-600' : 'text-red-600'}` }, `${positive ? '+' : '-'}${formatMoney(Math.abs(amount))}`),
                  h('td', { className: 'px-6 py-4 font-black text-slate-800' }, formatMoney(movement.balanceAfter || 0))
                );
              }),
              list.length === 0 ? h('tr', null, h('td', { colSpan: 4, className: 'px-6 py-8 text-center text-[10px] font-bold text-slate-300 uppercase' }, 'Aún no hay movimientos de cartera')) : null
            )
          )
        )
      );
    }

    function AdminCommissionSettings(props = {}) {
      const settings = normalizeSettings(props.settings || {});
      return h('div', { className: 'card-glass overflow-hidden' },
        h('div', { className: 'bg-slate-50 border-b border-slate-100 px-6 py-4' },
          h('h2', { className: 'text-[10px] font-black uppercase tracking-widest text-slate-400' }, 'Configuración global de cartera'),
          h('p', { className: 'text-[9px] font-bold text-slate-300 uppercase mt-1' }, 'Comisión global y recarga mínima de cartera aplicadas automáticamente a toda la plataforma')
        ),
        h('form', { onSubmit: props.onSubmit, className: 'p-6 grid md:grid-cols-2 gap-3 items-end' },
          h('div', null,
            h('label', { className: 'block text-[9px] font-black uppercase text-slate-400 mb-2' }, 'Porcentaje de comisión global'),
            h('input', {
              required: true,
              type: 'number',
              min: '0',
              max: '100',
              step: '0.01',
              className: 'input-field',
              placeholder: 'Ej. 10',
              value: props.value ?? settings.globalCommissionPercent,
              onChange: (event) => props.onChange && props.onChange(event.target.value)
            })
          ),
          h('div', null,
            h('label', { className: 'block text-[9px] font-black uppercase text-slate-400 mb-2' }, 'Recarga mínima de cartera'),
            h('input', {
              required: true,
              type: 'number',
              min: '0',
              step: '0.01',
              className: 'input-field',
              placeholder: 'Ej. 500',
              value: props.minimumRechargeValue ?? settings.minimumWalletRecharge,
              onChange: (event) => props.onMinimumRechargeChange && props.onMinimumRechargeChange(event.target.value)
            })
          ),
          h('button', { disabled: props.saving, type: 'submit', className: 'md:col-span-2 btn-primary h-12 disabled:opacity-50 disabled:cursor-not-allowed' }, props.saving ? 'Guardando...' : 'Guardar configuración global')
        )
      );
    }

    function AdminWalletsPanel({ users = [], wallets = [], recharges = [] } = {}) {
      const registeredUsers = (Array.isArray(users) ? users : []).filter((user) => user.role !== 'admin');
      const rechargeList = (Array.isArray(recharges) ? recharges : []).slice(0, 50);
      return h('div', { className: 'card-glass overflow-hidden' },
        h('div', { className: 'bg-slate-50 border-b border-slate-100 px-6 py-4' },
          h('h2', { className: 'text-[10px] font-black uppercase tracking-widest text-slate-400' }, 'Carteras de Usuarios'),
          h('p', { className: 'text-[9px] font-bold text-slate-300 uppercase mt-1' }, 'Consulta saldos y recargas registradas por usuario y monto')
        ),
        h('div', { className: 'p-6 space-y-6' },
          h('div', { className: 'grid sm:grid-cols-2 xl:grid-cols-3 gap-3' },
            registeredUsers.map((user) => {
              const wallet = findWalletForUser(wallets, user);
              return h('article', { key: user.id || user.uid || user.email, className: 'rounded-2xl border border-slate-100 bg-white p-4 shadow-sm' },
                h('p', { className: 'text-[8px] font-black uppercase tracking-widest text-slate-300 mb-1' }, 'Usuario'),
                h('h3', { className: 'text-[11px] font-black text-slate-800 break-anywhere' }, user.name || user.email || '-'),
                h('p', { className: 'text-[9px] font-mono font-bold text-slate-400 break-anywhere mt-1' }, user.email || '-'),
                h('div', { className: 'mt-4 grid grid-cols-2 gap-2' },
                  h('div', { className: 'rounded-xl bg-slate-50 p-3' },
                    h('p', { className: 'text-[8px] font-black uppercase text-slate-300' }, 'Saldo'),
                    h('p', { className: 'text-sm font-black text-red-600' }, formatMoney(wallet.balance || 0))
                  ),
                  h('div', { className: 'rounded-xl bg-slate-50 p-3' },
                    h('p', { className: 'text-[8px] font-black uppercase text-slate-300' }, 'Estado'),
                    h('p', { className: `text-[9px] font-black uppercase ${isWalletActivated(wallet) ? 'text-green-600' : 'text-yellow-700'}` }, getWalletStatus(wallet))
                  )
                )
              );
            }),
            registeredUsers.length === 0 ? h('div', { className: 'rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center sm:col-span-2 xl:col-span-3' },
              h('p', { className: 'text-[10px] font-black text-slate-300 uppercase tracking-widest' }, 'Aún no hay usuarios registrados')
            ) : null
          ),
          h('div', { className: 'overflow-x-auto border border-slate-100 rounded-2xl' },
            h('table', { className: 'w-full text-left' },
              h('thead', { className: 'bg-slate-50 border-b border-slate-100' },
                h('tr', { className: 'text-[8px] font-black uppercase text-slate-400' },
                  h('th', { className: 'px-6 py-3' }, 'Usuario'),
                  h('th', { className: 'px-6 py-3' }, 'Monto')
                )
              ),
              h('tbody', { className: 'divide-y divide-slate-50' },
                rechargeList.map((item) => h('tr', { key: item.id || item.rechargeId, className: 'text-[10px] font-bold text-slate-600' },
                  h('td', { className: 'px-6 py-4' },
                    h('p', { className: 'font-black text-slate-800' }, item.userName || item.userEmail || item.userId || '-'),
                    h('p', { className: 'font-mono text-[8px] text-slate-400 break-anywhere' }, item.userEmail || item.userId || '')
                  ),
                  h('td', { className: 'px-6 py-4 text-green-600 font-black' }, `+${formatMoney(item.amount || 0)}`)
                )),
                rechargeList.length === 0 ? h('tr', null, h('td', { colSpan: 2, className: 'px-6 py-8 text-center text-[10px] font-bold text-slate-300 uppercase' }, 'Aún no hay recargas registradas')) : null
              )
            )
          )
        )
      );
    }

    return { UserWalletCard, WalletMovementsPanel, AdminCommissionSettings, AdminWalletsPanel };
  }

  global.DriveMxWallet = Wallet;
  global.DriveMxWalletUI = createWalletUI(global.React);
})(window);


