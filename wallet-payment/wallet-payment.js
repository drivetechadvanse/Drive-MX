(function attachDriveMxWalletPayment(global) {
  'use strict';

  const React = global.React;
  if (!React) throw new Error('DriveMxWalletPayment: React no está disponible.');

  const { useState, useCallback, useRef } = React;
  const SECONDARY_APP_NAME = 'DriveMxWalletPaymentAuthApp';
  const persistencePromises = new WeakMap();

  const clean = (value) => String(value ?? '').trim();
  const normalizeEmail = (value) => clean(value).replace(/\s+/g, '').toLowerCase();
  const safeId = (value) => clean(value).replace(/[^a-zA-Z0-9_-]/g, '_');
  const roundMoney = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

  function normalizeWalletMillis(value, fallback = null) {
    if (value == null || value === '') return fallback;
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
    if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
      const numeric = Number(value.trim());
      return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
    }
    if (value && typeof value.toMillis === 'function') return value;
    if (value && typeof value.seconds === 'number') return value;
    return fallback;
  }

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

  const CLIENT_MAX_PRODUCTS = 40;
  const GENERAL_SHIPPING_FEE = 150;
  const DEFAULT_CASHBACK_AMOUNT = 10;
  const ADMIN_EMAIL = 'admin@drivemx.com';

  function fold(value) {
    return clean(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[\s_-]+/g, ' ')
      .trim();
  }

  function hasOwn(source, field) {
    return Boolean(source && typeof source === 'object' && Object.prototype.hasOwnProperty.call(source, field));
  }

  function createOrderSignature(source = '') {
    const value = String(source || '');
    let first = 2166136261;
    let second = 2246822519;
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      first ^= code;
      first = Math.imul(first, 16777619);
      second ^= code + index;
      second = Math.imul(second, 3266489917);
    }
    return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
  }

  function clientPaymentError(message, code = 'wallet-payment-error', details = null) {
    const error = publicError(message, code);
    error.details = details;
    return error;
  }

  function normalizeFirestorePaymentError(error = {}) {
    if (clean(error.code).startsWith('wallet-') || clean(error.code).startsWith('product-') || clean(error.code).startsWith('order-') || clean(error.code).startsWith('supermarket-') || clean(error.code).startsWith('drive-mx-') || clean(error.code).startsWith('payment-')) {
      return error;
    }
    const rawCode = clean(error.code).toLowerCase().replace(/^firestore\//, '');
    if (rawCode.includes('permission-denied')) {
      return clientPaymentError('No se pudo autorizar el cobro con cartera en Firestore.', 'wallet-payment-permission-denied');
    }
    if (rawCode.includes('unavailable') || rawCode.includes('network')) {
      return clientPaymentError('No se pudo conectar con la cartera. Revisa la conexión e intenta nuevamente.', 'wallet-payment-network');
    }
    if (rawCode.includes('aborted')) {
      return clientPaymentError('La cartera cambió durante el cobro. Presiona nuevamente “Pagar con cartera”.', 'wallet-payment-aborted');
    }
    if (rawCode.includes('failed-precondition')) {
      return clientPaymentError('No se pudo completar la transacción de la cartera.', 'wallet-payment-failed-precondition');
    }
    const normalized = clientPaymentError(error.message || 'No se pudo procesar el pago con cartera.', rawCode || 'wallet-payment-error');
    normalized.originalError = error;
    return normalized;
  }

  function isSupermarketProduct(product = {}) {
    return fold(product.category ?? product.categoria ?? product.productCategory ?? product.product_category) === 'supermercado';
  }

  function isUserPublication(product = {}) {
    const ownerId = clean(product.ownerId || product.sellerId || product.userId || product.createdByUid);
    const type = fold(product.publicationType || product.productOrigin || product.sourcePanel || product.createdFromPanel);
    return Boolean(ownerId) || ['usuario', 'user', 'panel usuario', 'panel de usuario'].includes(type);
  }

  function getProductStock(product = {}) {
    const stock = Math.floor(Number(product.stock ?? product.availableStock ?? 0));
    return Number.isFinite(stock) && stock > 0 ? stock : 0;
  }

  function getProductPrice(product = {}) {
    const price = Number(product.price ?? product.unitPrice ?? 0);
    if (!Number.isFinite(price) || price < 0 || price > 10000000) {
      throw clientPaymentError(`El precio de ${clean(product.name) || 'un producto'} no es válido.`, 'product-price-invalid', { productId: clean(product.id) });
    }
    return roundMoney(price);
  }

  function normalizeShippingFee(value, fallback = GENERAL_SHIPPING_FEE) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0 || number > 1000000) return roundMoney(fallback);
    return roundMoney(number);
  }

  function getProductShippingConfiguration(product = {}, fallback = GENERAL_SHIPPING_FEE) {
    const hasConfiguration = hasOwn(product, 'supermarketShippingMode')
      || hasOwn(product, 'supermarketShippingCost')
      || hasOwn(product, 'supermarketShippingType')
      || hasOwn(product, 'supermarketShippingFee');
    if (!hasConfiguration) return null;
    const mode = fold(product.supermarketShippingMode ?? product.supermarketShippingType);
    if (['free', 'gratis', 'sin costo', 'sin costo de envio', 'sin envio', '0'].includes(mode)) {
      return { mode: 'free', cost: 0 };
    }
    const cost = Number(product.supermarketShippingCost ?? product.supermarketShippingFee);
    return {
      mode: 'manual',
      cost: Number.isFinite(cost) && cost > 0 && cost <= 1000000
        ? roundMoney(cost)
        : normalizeShippingFee(fallback, GENERAL_SHIPPING_FEE)
    };
  }

  function calculateShippingFee(items = [], supermarketFallback = GENERAL_SHIPPING_FEE) {
    let manualProductFees = 0;
    let containsGeneralProduct = false;
    let containsUnconfiguredSupermarketProduct = false;
    items.forEach((item) => {
      if (!isSupermarketProduct(item.product)) {
        containsGeneralProduct = true;
        return;
      }
      const configuration = getProductShippingConfiguration(item.product, supermarketFallback);
      if (!configuration) {
        containsUnconfiguredSupermarketProduct = true;
        return;
      }
      if (configuration.mode === 'manual') manualProductFees += configuration.cost;
    });
    const existingFlowFee = Math.max(
      containsGeneralProduct ? GENERAL_SHIPPING_FEE : 0,
      containsUnconfiguredSupermarketProduct ? normalizeShippingFee(supermarketFallback, GENERAL_SHIPPING_FEE) : 0
    );
    return roundMoney(existingFlowFee + manualProductFees);
  }

  function normalizeWalletOrder(order = {}) {
    const sourceProducts = Array.isArray(order.products) ? order.products : [];
    if (sourceProducts.length < 1 || sourceProducts.length > CLIENT_MAX_PRODUCTS) {
      throw clientPaymentError(`La compra debe contener entre 1 y ${CLIENT_MAX_PRODUCTS} productos distintos.`, 'invalid-products-count');
    }
    const seenIds = new Set();
    const products = sourceProducts.map((product, index) => {
      const id = clean(product?.id);
      const quantity = Math.floor(Number(product?.quantity ?? product?.productQuantity ?? 0));
      if (!id || id.includes('/')) throw clientPaymentError(`El producto ${index + 1} no es válido.`, 'invalid-product-id');
      if (seenIds.has(id)) throw clientPaymentError('No se permiten productos duplicados en el pedido.', 'duplicate-product-id', { productId: id });
      if (!Number.isFinite(quantity) || quantity < 1 || quantity > 1000000) {
        throw clientPaymentError(`La cantidad del producto ${index + 1} no es válida.`, 'invalid-product-quantity', { productId: id });
      }
      seenIds.add(id);
      return {
        id,
        quantity,
        sizes: Array.isArray(product.sizes) ? product.sizes.map(clean).filter(Boolean).slice(0, 50) : [],
        colors: Array.isArray(product.colors) ? product.colors.map(clean).filter(Boolean).slice(0, 50) : []
      };
    });
    const delivery = {
      street: clean(order.delivery?.street),
      state: clean(order.delivery?.state),
      municipality: clean(order.delivery?.municipality),
      neighborhood: clean(order.delivery?.neighborhood),
      zip: clean(order.delivery?.zip),
      fullName: clean(order.delivery?.fullName),
      phone: clean(order.delivery?.phone),
      email: normalizeEmail(order.delivery?.email),
      references: clean(order.delivery?.references)
    };
    const missingDelivery = Object.entries(delivery).find(([, value]) => !value);
    if (missingDelivery) throw clientPaymentError('Completa todos los datos de entrega antes de pagar.', 'missing-delivery-field', { field: missingDelivery[0] });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(delivery.email)) {
      throw clientPaymentError('El correo electrónico no es válido.', 'invalid-email');
    }
    const clientTotal = roundMoney(order.cart?.total);
    if (!Number.isFinite(clientTotal) || clientTotal <= 0) {
      throw clientPaymentError('El total de la compra no es válido.', 'wallet-total-zero');
    }
    const orderSignatureSource = JSON.stringify({ products: [...products].sort((a, b) => a.id.localeCompare(b.id)), delivery, total: clientTotal });
    const orderSignature = createOrderSignature(orderSignatureSource);
    return { products, delivery, clientTotal, orderSignature };
  }

  function dataDoc(fbase, db, appId, ...segments) {
    return fbase.doc(db, 'artifacts', appId, 'public', 'data', ...segments);
  }

  async function getTransactionSnapshots(transaction, refs = []) {
    const result = new Map();
    for (const ref of refs) {
      if (!ref?.path || result.has(ref.path)) continue;
      const snapshot = await transaction.get(ref);
      result.set(ref.path, snapshot);
    }
    return result;
  }

  function createWalletMovement({ id, walletId, wallet, type, direction, concept, amount, balanceBefore, balanceAfter, createdAt, buyerEmail, paymentId } = {}) {
    return {
      id,
      movementId: id,
      walletId,
      userId: walletId,
      userName: clean(wallet.userName || 'Usuario'),
      userEmail: normalizeEmail(wallet.userEmail || buyerEmail),
      type,
      direction,
      concept,
      amount: roundMoney(amount),
      absoluteAmount: roundMoney(Math.abs(amount)),
      balanceBefore: roundMoney(balanceBefore),
      balanceAfter: roundMoney(balanceAfter),
      currency: 'MXN',
      paymentId,
      orderId: paymentId,
      createdAt,
      createdBy: normalizeEmail(buyerEmail) || 'wallet-payment'
    };
  }

  async function processWalletPaymentInFirestore({ fbase, appId, credentialUser, firebaseApp, paymentId, order, Wallet } = {}) {
    if (!fbase?.runTransaction || !fbase?.getFirestore || !fbase?.doc) {
      throw clientPaymentError('Firebase no está disponible para realizar el cobro.', 'wallet-firebase-unavailable');
    }
    paymentId = clean(paymentId);
    if (!/^WP-\d{10,}-[A-Z0-9]{6}$/.test(paymentId)) {
      throw clientPaymentError('El identificador del pago no es válido.', 'invalid-payment-id');
    }
    const buyerId = safeId(credentialUser?.uid);
    const buyerEmail = normalizeEmail(credentialUser?.email);
    if (!buyerId || !buyerEmail) throw clientPaymentError('No se pudo identificar al usuario de la cartera.', 'wallet-user-invalid');
    const normalizedOrder = normalizeWalletOrder(order);
    const db = fbase.getFirestore(firebaseApp || credentialUser?.auth?.app);
    const paymentRef = dataDoc(fbase, db, appId, 'wallet_payments', paymentId);
    const buyerProfileRef = dataDoc(fbase, db, appId, 'operators', buyerId);
    const buyerWalletRef = dataDoc(fbase, db, appId, 'wallets', buyerId);
    const walletSettingsRef = dataDoc(fbase, db, appId, 'wallet_settings', 'config');
    const supermarketSettingsRef = dataDoc(fbase, db, appId, 'supermarket_settings', 'config');

    try {
      return await fbase.runTransaction(db, async (transaction) => {
        // No se lee wallet_payments antes de crearlo: Firestore niega la lectura
        // de un documento inexistente cuando el permiso depende de resource.data.
        // La propia regla de create impide sobrescribir un pago ya completado.
        const baseSnapshots = await getTransactionSnapshots(transaction, [buyerProfileRef, buyerWalletRef, walletSettingsRef, supermarketSettingsRef]);
        const buyerProfileSnapshot = baseSnapshots.get(buyerProfileRef.path);
        const buyerWalletSnapshot = baseSnapshots.get(buyerWalletRef.path);
        const walletSettingsSnapshot = baseSnapshots.get(walletSettingsRef.path);
        const supermarketSettingsSnapshot = baseSnapshots.get(supermarketSettingsRef.path);
        if (!buyerProfileSnapshot?.exists()) throw clientPaymentError('La cuenta de la cartera no existe.', 'wallet-profile-not-found');
        const buyerProfile = { id: buyerProfileSnapshot.id, ...buyerProfileSnapshot.data() };
        if (buyerProfile.role === 'admin' || profileIsBlocked(buyerProfile)) throw clientPaymentError('La cuenta no está disponible para pagar con cartera.', 'wallet-account-not-available');
        if (normalizeEmail(buyerProfile.email) && normalizeEmail(buyerProfile.email) !== buyerEmail) {
          throw clientPaymentError('La cuenta de la cartera no coincide con el usuario validado.', 'wallet-profile-mismatch');
        }
        if (!buyerWalletSnapshot?.exists()) throw clientPaymentError('La cartera todavía no tiene saldo disponible.', 'wallet-not-found');

        const productRefs = normalizedOrder.products.map((item) => dataDoc(fbase, db, appId, 'products', item.id));
        const productSnapshots = await getTransactionSnapshots(transaction, productRefs);
        const liveItems = normalizedOrder.products.map((requested) => {
          const productRef = dataDoc(fbase, db, appId, 'products', requested.id);
          const snapshot = productSnapshots.get(productRef.path);
          if (!snapshot?.exists()) throw clientPaymentError('Uno de los productos ya no está disponible.', 'product-not-found', { productId: requested.id });
          // El ID real del documento es la identidad del producto. Un campo
          // id antiguo o incorrecto dentro del documento no debe sobrescribirlo.
          const product = { ...(snapshot.data() || {}), id: snapshot.id };
          if (product.active === false) throw clientPaymentError(`${clean(product.name) || 'Un producto'} ya no está activo.`, 'product-not-active', { productId: requested.id });
          const stock = getProductStock(product);
          if (stock < requested.quantity) {
            throw clientPaymentError(`Inventario insuficiente para ${clean(product.name) || requested.id}.`, 'product-stock-insufficient', { productId: requested.id, availableStock: stock, requestedQuantity: requested.quantity });
          }
          const unitPrice = getProductPrice(product);
          return {
            requested,
            product,
            productRef,
            stock,
            unitPrice,
            lineTotal: roundMoney(unitPrice * requested.quantity),
            ownerId: clean(product.ownerId || product.sellerId || product.userId || product.createdByUid),
            userPublication: isUserPublication(product)
          };
        });

        const supermarketCount = liveItems.filter((item) => isSupermarketProduct(item.product)).length;
        const driveMxCount = liveItems.length - supermarketCount;
        if (driveMxCount > 2) throw clientPaymentError('Productos Drive MX permiten máximo 2 productos distintos por compra.', 'drive-mx-product-limit');
        if (supermarketCount > 0 && supermarketCount < 5) throw clientPaymentError('La compra de Supermercado requiere mínimo 5 productos distintos.', 'supermarket-minimum-products');

        const walletSettingsRaw = walletSettingsSnapshot?.exists() ? (walletSettingsSnapshot.data() || {}) : {};
        const walletSettings = typeof Wallet?.normalizeSettings === 'function'
          ? Wallet.normalizeSettings(walletSettingsRaw)
          : {
              globalCommissionPercent: Number(walletSettingsRaw.globalCommissionPercent || 0),
              globalCashbackAmount: Number(walletSettingsRaw.globalCashbackAmount ?? DEFAULT_CASHBACK_AMOUNT)
            };
        const supermarketSettings = supermarketSettingsSnapshot?.exists() ? (supermarketSettingsSnapshot.data() || {}) : {};
        const commissionPercent = roundMoney(Math.max(0, Math.min(100, Number(walletSettings.globalCommissionPercent || 0))));
        // Replica exactamente la prioridad y validación de firestore.rules:
        // globalCashbackAmount, después cashbackAmount heredado y al final $10.
        const configuredCashbackValue = hasOwn(walletSettingsRaw, 'globalCashbackAmount')
          ? walletSettingsRaw.globalCashbackAmount
          : (hasOwn(walletSettingsRaw, 'cashbackAmount') ? walletSettingsRaw.cashbackAmount : DEFAULT_CASHBACK_AMOUNT);
        const configuredCashback = roundMoney(
          typeof configuredCashbackValue === 'number'
          && Number.isFinite(configuredCashbackValue)
          && configuredCashbackValue >= 0
          && configuredCashbackValue <= 1000000
            ? configuredCashbackValue
            : DEFAULT_CASHBACK_AMOUNT
        );
        const supermarketFallback = normalizeShippingFee(supermarketSettings.shippingFee, GENERAL_SHIPPING_FEE);
        const subtotal = roundMoney(liveItems.reduce((sum, item) => sum + item.lineTotal, 0));
        const shippingFee = calculateShippingFee(liveItems, supermarketFallback);
        const total = roundMoney(subtotal + shippingFee);
        // Nunca se acredita más Cash Back que el importe efectivamente cobrado.
        const cashbackAmount = roundMoney(Math.min(configuredCashback, total));
        const totalQuantity = liveItems.reduce((sum, item) => sum + item.requested.quantity, 0);
        if (total <= 0) throw clientPaymentError('El total de la compra debe ser mayor a $0.00.', 'wallet-total-zero');
        if (Math.abs(total - normalizedOrder.clientTotal) > 0.01) {
          throw clientPaymentError('El total de la compra cambió. Regresa al carrito y revisa los importes.', 'order-total-changed', { clientTotal: normalizedOrder.clientTotal, currentTotal: total });
        }

        const ownerIds = Array.from(new Set(liveItems
          .filter((item) => item.userPublication && item.ownerId)
          .map((item) => safeId(item.ownerId))
          .filter(Boolean)));
        const ownerProfileRefs = ownerIds.map((ownerId) => dataDoc(fbase, db, appId, 'operators', ownerId));
        const ownerWalletRefs = ownerIds.map((ownerId) => dataDoc(fbase, db, appId, 'wallets', ownerId));
        // El comprador no necesita leer los espejos privados de publicaciones.
        // La transacción usa products como fuente principal de inventario.
        const relatedSnapshots = await getTransactionSnapshots(transaction, [...ownerProfileRefs, ...ownerWalletRefs]);

        const buyerWalletRaw = buyerWalletSnapshot.data() || {};
        const buyerWalletSource = { ...buyerWalletRaw, id: buyerId, uid: buyerId, userId: buyerId };
        const buyerWallet = typeof Wallet?.normalizeWallet === 'function'
          ? Wallet.normalizeWallet(buyerWalletSource, buyerProfile)
          : { ...buyerWalletSource, balance: roundMoney(buyerWalletRaw.balance || 0), activated: buyerWalletRaw.activated === true, firstRechargeCompleted: buyerWalletRaw.firstRechargeCompleted === true };
        if (!(buyerWallet.activated === true && buyerWallet.firstRechargeCompleted === true)) throw clientPaymentError('La cartera no está activa.', 'wallet-not-active');
        if (roundMoney(buyerWallet.balance) < total) {
          throw clientPaymentError('Saldo insuficiente en la cartera.', 'wallet-insufficient-funds', { availableBalance: roundMoney(buyerWallet.balance), requiredAmount: total });
        }

        const walletStates = new Map();
        walletStates.set(buyerId, {
          ref: buyerWalletRef,
          raw: buyerWalletRaw,
          wallet: buyerWallet,
          currentBalance: roundMoney(buyerWallet.balance),
          commissionTotal: 0,
          changed: true,
          isBuyer: true
        });
        ownerIds.forEach((ownerId) => {
          if (walletStates.has(ownerId)) return;
          const walletRef = dataDoc(fbase, db, appId, 'wallets', ownerId);
          const walletSnapshot = relatedSnapshots.get(walletRef.path);
          const profileRef = dataDoc(fbase, db, appId, 'operators', ownerId);
          const profileSnapshot = relatedSnapshots.get(profileRef.path);
          const profile = profileSnapshot?.exists() ? { ...(profileSnapshot.data() || {}), id: profileSnapshot.id } : {};
          if (!walletSnapshot?.exists()) throw clientPaymentError('No se encontró la cartera de uno de los vendedores.', 'seller-wallet-not-found', { sellerId: ownerId });
          const raw = walletSnapshot.data() || {};
          const walletSource = { ...raw, id: ownerId, uid: ownerId, userId: ownerId };
          const wallet = typeof Wallet?.normalizeWallet === 'function'
            ? Wallet.normalizeWallet(walletSource, profile)
            : { ...walletSource, balance: roundMoney(raw.balance || 0), activated: raw.activated === true, firstRechargeCompleted: raw.firstRechargeCompleted === true };
          if (!(wallet.activated === true && wallet.firstRechargeCompleted === true)) throw clientPaymentError('La cartera de uno de los vendedores no está activa.', 'seller-wallet-not-active', { sellerId: ownerId });
          walletStates.set(ownerId, { ref: walletRef, raw, wallet, profile, currentBalance: roundMoney(wallet.balance), commissionTotal: 0, changed: false, isBuyer: false });
        });

        const now = Date.now();
        const buyerState = walletStates.get(buyerId);
        const buyerBalanceBefore = roundMoney(buyerState.currentBalance);
        const buyerBalanceAfterCharge = roundMoney(buyerBalanceBefore - total);
        buyerState.currentBalance = buyerBalanceAfterCharge;
        const purchaseMovementId = safeId(`mov_purchase_${paymentId}`);
        const purchaseMovement = createWalletMovement({
          id: purchaseMovementId,
          walletId: buyerId,
          wallet: buyerState.wallet,
          type: 'purchase',
          direction: 'debit',
          concept: 'Compra pagada con cartera',
          amount: -total,
          balanceBefore: buyerBalanceBefore,
          balanceAfter: buyerBalanceAfterCharge,
          createdAt: now,
          buyerEmail,
          paymentId
        });
        let cashbackMovement = null;
        if (cashbackAmount > 0) {
          const cashbackBefore = buyerState.currentBalance;
          const cashbackAfter = roundMoney(cashbackBefore + cashbackAmount);
          buyerState.currentBalance = cashbackAfter;
          const cashbackMovementId = safeId(`mov_cashback_${paymentId}`);
          cashbackMovement = createWalletMovement({
            id: cashbackMovementId,
            walletId: buyerId,
            wallet: buyerState.wallet,
            type: 'cashback',
            direction: 'credit',
            concept: 'Cash Back por compra con cartera',
            amount: cashbackAmount,
            balanceBefore: cashbackBefore,
            balanceAfter: cashbackAfter,
            createdAt: now,
            buyerEmail,
            paymentId
          });
          cashbackMovement.cashbackAmount = cashbackAmount;
        }

        const commissionResults = new Map();
        liveItems.forEach((item, index) => {
          const saleId = safeId(`wallet_${paymentId}_${index + 1}`);
          if (!item.userPublication || !item.ownerId) {
            commissionResults.set(saleId, { applies: false, amount: 0, balanceBefore: null, balanceAfter: null, percent: commissionPercent });
            return;
          }
          const ownerWalletId = safeId(item.ownerId);
          const state = walletStates.get(ownerWalletId);
          const commissionAmount = roundMoney((item.lineTotal * commissionPercent) / 100);
          const balanceBefore = roundMoney(state.currentBalance);
          if (commissionAmount > 0 && balanceBefore < commissionAmount) {
            throw clientPaymentError('La cartera de uno de los vendedores no tiene saldo suficiente para descontar la comisión.', 'seller-wallet-insufficient-funds', { sellerId: ownerWalletId, availableBalance: balanceBefore, commissionAmount });
          }
          const balanceAfter = roundMoney(balanceBefore - commissionAmount);
          state.currentBalance = balanceAfter;
          state.commissionTotal = roundMoney(state.commissionTotal + commissionAmount);
          if (commissionAmount > 0) state.changed = true;
          commissionResults.set(saleId, { applies: true, amount: commissionAmount, balanceBefore, balanceAfter, percent: commissionPercent, ownerWalletId });
        });

        const sales = [];
        const inventoryUpdates = [];
        const commissionWrites = [];
        liveItems.forEach((item, index) => {
          const saleId = safeId(`wallet_${paymentId}_${index + 1}`);
          const commission = commissionResults.get(saleId);
          const remainingStock = Math.max(0, item.stock - item.requested.quantity);
          const inventoryPatch = {
            id: item.product.id,
            stock: remainingStock,
            availableStock: remainingStock,
            updatedAt: now,
            inventoryUpdatedAt: now,
            lastSaleId: saleId,
            lastSoldQuantity: item.requested.quantity,
            lastWalletPaymentId: paymentId,
            lastWalletPaymentBuyerId: buyerId,
            lastWalletPaymentItemIndex: index,
            lastWalletPaymentUnitPrice: item.unitPrice,
            lastWalletPaymentLineTotal: item.lineTotal,
            lastWalletPaymentOrderTotal: total
          };
          const ownerDocId = item.userPublication && item.ownerId ? safeId(item.ownerId) : '';
          const ownerProfileRef = ownerDocId ? dataDoc(fbase, db, appId, 'operators', ownerDocId) : null;
          const ownerProfileSnapshot = ownerProfileRef ? relatedSnapshots.get(ownerProfileRef.path) : null;
          const ownerProfile = ownerProfileSnapshot?.exists() ? { id: ownerProfileSnapshot.id, ...ownerProfileSnapshot.data() } : {};
          const sellerName = clean(ownerProfile.name || item.product.ownerName || (ownerDocId ? 'Usuario' : 'Admin Central'));
          const sellerEmail = normalizeEmail(ownerProfile.email || item.product.ownerEmail || (ownerDocId ? '' : ADMIN_EMAIL));
          const sellerPhone = clean(ownerProfile.phone || item.product.ownerPhone || '-');
          const sellerNotificationEmail = normalizeEmail(ownerProfile.saleNotificationEmail || item.product.saleNotificationEmail || item.product.sellerNotificationEmail || sellerEmail);
          const sale = {
            saleId,
            orderSaleId: safeId(`wallet_${paymentId}`),
            cartItemCount: liveItems.length,
            orderQuantityTotal: totalQuantity,
            orderTotal: total,
            orderSubtotal: subtotal,
            shippingFee,
            paymentMethod: 'Cartera',
            paymentStatus: 'Pagado',
            walletPaymentId: paymentId,
            transferId: paymentId,
            productId: item.product.id,
            productName: clean(item.product.name || item.product.id).slice(0, 180),
            productCost: item.lineTotal,
            productUnitPrice: item.unitPrice,
            unitPrice: item.unitPrice,
            productQuantity: item.requested.quantity,
            quantity: item.requested.quantity,
            productTotal: item.lineTotal,
            productSizes: item.requested.sizes,
            productColors: item.requested.colors,
            productCategory: clean(item.product.category || item.product.productCategory || item.product.categoria || ''),
            sellerId: ownerDocId,
            sellerName,
            sellerEmail,
            sellerPhone,
            sellerNotificationEmail,
            buyerId,
            buyerName: normalizedOrder.delivery.fullName,
            buyerEmail: normalizedOrder.delivery.email,
            buyerPhone: normalizedOrder.delivery.phone,
            delivery: normalizedOrder.delivery,
            cashbackAmount,
            cashbackStatus: cashbackAmount > 0 ? 'Abonado' : 'Sin Cash Back',
            inventoryDeducted: true,
            inventoryDeductedQuantity: item.requested.quantity,
            productStockBefore: item.stock,
            productStockAfter: remainingStock,
            inventoryUpdatedAt: now,
            walletCommissionPercent: commission.percent,
            walletCommissionAmount: commission.amount,
            walletCommissionStatus: commission.applies ? (commission.amount > 0 ? 'Descontada' : 'Sin comisión') : 'No aplica',
            walletBalanceBeforeCommission: commission.balanceBefore,
            walletBalanceAfterCommission: commission.balanceAfter,
            soldAt: now,
            createdAt: now,
            updatedAt: now
          };
          sales.push({ id: saleId, ...sale });
          inventoryUpdates.push({ productId: item.product.id, ownerId: ownerDocId, patch: inventoryPatch });

          // El documento público products es la fuente principal de inventario.
          // No se escriben aquí los espejos admin_products/user_products: si uno
          // no existe, una escritura merge sería un CREATE y podría cancelar todo
          // el cobro aun cuando la cartera y el producto fueran válidos.
          transaction.set(item.productRef, inventoryPatch, { merge: true });
          transaction.set(dataDoc(fbase, db, appId, 'completed_sales', saleId), sale);
          if (ownerDocId) transaction.set(dataDoc(fbase, db, appId, 'user_sales', ownerDocId, 'items', saleId), { id: saleId, ...sale, visibleToUserId: ownerDocId });

          if (commission.applies && commission.amount > 0) {
            const state = walletStates.get(commission.ownerWalletId);
            const movementId = safeId(`mov_commission_${commission.ownerWalletId}_${saleId}`);
            const commissionId = safeId(`commission_${commission.ownerWalletId}_${saleId}`);
            const movement = {
              ...createWalletMovement({
                id: movementId,
                walletId: commission.ownerWalletId,
                wallet: state.wallet,
                type: 'commission',
                direction: 'debit',
                concept: `Comisión por venta: ${sale.productName}`,
                amount: -commission.amount,
                balanceBefore: commission.balanceBefore,
                balanceAfter: commission.balanceAfter,
                createdAt: now,
                buyerEmail,
                paymentId
              }),
              commissionPercent,
              saleId,
              productId: item.product.id,
              productName: sale.productName
            };
            const record = { ...movement, id: commissionId, commissionId, movementId, status: 'Descontada' };
            commissionWrites.push({
              movementRef: dataDoc(fbase, db, appId, 'wallets', commission.ownerWalletId, 'movements', movementId),
              movement,
              commissionRef: dataDoc(fbase, db, appId, 'wallet_commissions', commissionId),
              record
            });
          }
        });

        transaction.set(dataDoc(fbase, db, appId, 'wallets', buyerId, 'movements', purchaseMovementId), purchaseMovement);
        if (cashbackMovement) transaction.set(dataDoc(fbase, db, appId, 'wallets', buyerId, 'movements', cashbackMovement.id), cashbackMovement);
        commissionWrites.forEach((write) => {
          transaction.set(write.movementRef, write.movement);
          transaction.set(write.commissionRef, write.record);
        });

        walletStates.forEach((state) => {
          if (!state.changed && !state.isBuyer) return;
          const current = state.wallet;
          const raw = state.raw || {};
          const isBuyer = state.isBuyer;
          const walletPatch = {
            balance: roundMoney(state.currentBalance),
            activated: true,
            firstRechargeCompleted: true,
            totalCommissions: roundMoney(Number(current.totalCommissions || 0) + state.commissionTotal),
            updatedAt: now,
            updatedBy: buyerEmail,
            status: state.currentBalance > 0 ? 'Activa' : 'Sin saldo'
          };
          // Las carteras antiguas de vendedores pueden no contener todavía todos
          // los campos del esquema actual o conservarlos como texto. El ID del
          // documento es autoritativo y los valores financieros se normalizan
          // dentro de la misma transacción, sin alterar el importe del cobro.
          if (!isBuyer) {
            const profile = state.profile || {};
            const rawEmail = normalizeEmail(current.userEmail || profile.email || '');
            const safeEmail = rawEmail.length >= 5 && rawEmail.length <= 254
              ? rawEmail
              : normalizeEmail(profile.email || '');
            const createdAtValue = normalizeWalletMillis(current.createdAt ?? raw.createdAt, now);
            walletPatch.id = state.ref.id;
            walletPatch.uid = state.ref.id;
            walletPatch.userId = state.ref.id;
            walletPatch.userName = clean(current.userName || profile.name || 'Usuario').slice(0, 180);
            walletPatch.userEmail = safeEmail;
            walletPatch.userPhone = clean(current.userPhone || profile.phone || '').slice(0, 80);
            walletPatch.currency = 'MXN';
            walletPatch.rechargeCount = Math.max(0, Math.floor(Number(current.rechargeCount || 0)));
            walletPatch.totalRecharged = roundMoney(current.totalRecharged || 0);
            walletPatch.createdAt = createdAtValue;
            walletPatch.firstRechargeAt = normalizeWalletMillis(current.firstRechargeAt ?? raw.firstRechargeAt, null);
            walletPatch.lastRechargeAt = normalizeWalletMillis(current.lastRechargeAt ?? raw.lastRechargeAt, null);
          }
          if (!isBuyer && state.commissionTotal > 0) walletPatch.lastWalletPaymentId = paymentId;
          if (isBuyer) {
            // normalizeWallet no conserva estos acumulados en todas las versiones.
            // Se toman del documento original para no reiniciarlos y evitar que las
            // reglas rechacen la segunda compra pagada con la misma cartera.
            walletPatch.totalPurchases = roundMoney(Number(raw.totalPurchases ?? current.totalPurchases ?? 0) + total);
            walletPatch.totalCashback = roundMoney(Number(raw.totalCashback ?? current.totalCashback ?? 0) + cashbackAmount);
            walletPatch.lastPurchaseAt = now;
            if (cashbackAmount > 0) walletPatch.lastCashbackAt = now;
            else if (Object.prototype.hasOwnProperty.call(raw, 'lastCashbackAt')) walletPatch.lastCashbackAt = raw.lastCashbackAt;
            walletPatch.lastWalletPaymentId = paymentId;
          }
          if (state.commissionTotal > 0) walletPatch.lastCommissionAt = now;
          transaction.set(state.ref, walletPatch, { merge: true });
          state.nextWallet = { ...raw, ...walletPatch };
        });

        const buyerBalanceAfter = roundMoney(buyerState.currentBalance);
        const buyerCommissionAmount = roundMoney(buyerState.commissionTotal || 0);
        const clientResult = {
          paymentId,
          paidAt: now,
          chargedAmount: total,
          subtotal,
          shippingFee,
          total,
          cashbackAmount,
          buyerCommissionAmount,
          balanceBefore: buyerBalanceBefore,
          balanceAfter: buyerBalanceAfter,
          wallet: {
            id: buyerId,
            uid: buyerId,
            userId: buyerId,
            userName: buyerState.wallet.userName,
            userEmail: buyerState.wallet.userEmail,
            balance: buyerBalanceAfter,
            currency: 'MXN',
            activated: true,
            firstRechargeCompleted: true,
            status: buyerBalanceAfter > 0 ? 'Activa' : 'Sin saldo',
            updatedAt: now
          },
          sales,
          saleIds: sales.map((sale) => sale.id),
          inventoryUpdates,
          idempotent: false
        };
        const paymentRecord = {
          id: paymentId,
          paymentId,
          type: 'wallet_purchase',
          paymentMethod: 'Cartera',
          status: 'Pagado',
          buyerId,
          buyerName: clean(buyerProfile.name || normalizedOrder.delivery.fullName),
          buyerEmail,
          walletId: buyerId,
          subtotal,
          shippingFee,
          total,
          cashbackAmount,
          buyerCommissionAmount,
          balanceBefore: buyerBalanceBefore,
          balanceAfter: buyerBalanceAfter,
          products: liveItems.map((item, index) => ({
            index,
            id: item.product.id,
            name: clean(item.product.name || item.product.id).slice(0, 180),
            category: clean(item.product.category || item.product.productCategory || item.product.categoria || ''),
            quantity: item.requested.quantity,
            unitPrice: item.unitPrice,
            lineTotal: item.lineTotal,
            stockBefore: item.stock,
            stockAfter: Math.max(0, item.stock - item.requested.quantity),
            ownerId: item.ownerId ? safeId(item.ownerId) : '',
            saleId: safeId(`wallet_${paymentId}_${index + 1}`)
          })),
          delivery: normalizedOrder.delivery,
          saleIds: clientResult.saleIds,
          emailStatus: 'Pendiente',
          clientResult,
          createdAt: now,
          updatedAt: now,
          paidAt: now,
          createdBy: buyerEmail,
          orderSignature: normalizedOrder.orderSignature
        };
        transaction.set(paymentRef, paymentRecord);
        return clientResult;
      });
    } catch (error) {
      // Si la transacción sí se confirmó pero la respuesta se perdió, el segundo
      // intento conserva el mismo paymentId. La escritura existente será rechazada
      // como update; en ese caso se recupera el resultado ya pagado sin volver a cobrar.
      const rawCode = clean(error?.code).toLowerCase();
      const paymentMayAlreadyExist = [
        'permission-denied',
        'unavailable',
        'aborted',
        'deadline-exceeded',
        'unknown'
      ].some((code) => rawCode.includes(code));
      if (paymentMayAlreadyExist && typeof fbase?.getDoc === 'function') {
        try {
          const existingPaymentSnapshot = await fbase.getDoc(paymentRef);
          if (existingPaymentSnapshot.exists()) {
            const existing = existingPaymentSnapshot.data() || {};
            if (clean(existing.buyerId) !== buyerId) {
              throw clientPaymentError('El identificador del pago ya fue utilizado.', 'payment-id-already-used');
            }
            if (clean(existing.orderSignature) && clean(existing.orderSignature) !== normalizedOrder.orderSignature) {
              throw clientPaymentError('El identificador pertenece a otra compra.', 'payment-id-order-mismatch');
            }
            if (fold(existing.status) === 'pagado' && existing.clientResult) {
              return { ...(existing.clientResult || {}), idempotent: true };
            }
          }
        } catch (recoveryError) {
          if (clean(recoveryError?.code).startsWith('payment-')) throw recoveryError;
        }
      }
      throw normalizeFirestorePaymentError(error);
    }
  }

  async function processWalletPayment({ fbase, appId, credentialUser, firebaseApp, paymentId, order, Wallet } = {}) {
    // El cobro se ejecuta directamente con el usuario de cartera que acaba de
    // autenticarse. No depende de /api/pay-with-wallet, Firebase Admin ni de
    // variables privadas de Vercel.
    try {
      const result = await processWalletPaymentInFirestore({
        fbase,
        appId,
        credentialUser,
        firebaseApp,
        paymentId,
        order,
        Wallet
      });
      return { ...result, paymentTransport: 'firestore-transaction' };
    } catch (directError) {
      const normalized = normalizeFirestorePaymentError(directError);
      if (clean(normalized.code).toLowerCase().includes('permission-denied')) {
        normalized.message = 'Firestore rechazó la transacción del cobro. Publica el archivo firestore.rules V7 incluido en este paquete y vuelve a validar la cartera.';
      }
      throw normalized;
    }
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
        credentialRef.current = { user: credential.user, firebaseApp: auth.app };
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
        const credentialUser = credentialRef.current.user;
        const result = await processWalletPayment({
          fbase,
          appId,
          credentialUser,
          firebaseApp: credentialRef.current.firebaseApp || credentialUser?.auth?.app,
          paymentId: stablePaymentId,
          order,
          Wallet
        });
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
    }, [verified, getOrCreatePaymentId, fbase, appId, Wallet]);

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
    BUILD: '2026-08-23-wallet-rules-safe-v7',
    SECONDARY_APP_NAME,
    clean,
    normalizeEmail,
    roundMoney,
    createPaymentId,
    formatMoney,
    getSecondaryAuth,
    prepareSecondaryAuth,
    processWalletPaymentInFirestore,
    processWalletPayment,
    useWalletPayment,
    WalletCredentialsCard,
    WalletBalanceBadge
  };
})(window);


   




